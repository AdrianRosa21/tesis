"""Pipelines de lectura de una pagina.

- v3: un solo prompt con todas las reglas (Ollama). Se conserva para comparar.
- v4: clasificar la pagina, extraer con reglas por tipo y completar lo visual (Ollama).
- hybrid: un modelo en la nube (Gemini u OpenAI) lee la pagina; Ollama solo detecta
  que hay en ella (en paralelo, para mostrarlo y completar lo visual) y es el respaldo
  si la nube falla.
"""
import asyncio
import contextlib
import time
from dataclasses import dataclass, field
from typing import Any

import httpx

from fastapi_backend.budget import CloudBudget
from fastapi_backend.config import Settings
from fastapi_backend.logbus import logger
from fastapi_backend.normalize import (
    blocks_to_elements,
    elements_to_description,
    looks_like_missed_table,
    merge_followup,
    missing_visuals,
    normalize_model_output,
    parse_json_lenient,
    strip_markdown,
)
from fastapi_backend.prompts import (
    CLASSIFY_PROMPT,
    CLASSIFY_SCHEMA,
    EXTRACT_SCHEMA,
    FOLLOWUP_PROMPTS,
    build_extraction_prompt,
    build_vision_prompt,
)
from fastapi_backend.providers import ModelResult, ProviderError, VisionProvider
from fastapi_backend.schemas import EXTRACT_SCHEMA_CLOUD

PAGE_FLAGS = ("tabla", "grafica", "diagrama", "imagen", "matematicas")
BLOCK_KIND_TO_FLAG = {"tabla": "tabla", "grafica": "grafica", "diagrama": "diagrama", "imagen": "imagen"}

# Si la nube falla despues de este tiempo, ya no alcanza el presupuesto (Cloudflare corta cerca
# de los 100 s) para repetir toda la pagina con el modelo local.
FALLBACK_MAX_ELAPSED_FRACTION = 0.3


@dataclass
class PipelineResult:
    description: str
    elements: list[dict[str, str]]
    page: dict[str, Any] | None
    provider: str
    model: str
    detector: str | None = None
    steps: list[dict[str, Any]] = field(default_factory=list)
    fallback_reason: str | None = None


def _step(name: str, engine: str, started: float, detail: str | None = None) -> dict[str, Any]:
    step: dict[str, Any] = {"name": name, "engine": engine, "seconds": round(time.monotonic() - started, 2)}
    if detail:
        step["detail"] = detail
    return step


def normalize_page(data: dict[str, Any]) -> dict[str, Any]:
    """Deja la clasificacion del modelo en un formato fijo (booleanos y numero de columnas)."""
    page: dict[str, Any] = {flag: bool(data.get(flag)) for flag in PAGE_FLAGS}
    try:
        page["columnas"] = max(1, int(data.get("columnas") or 1))
    except (TypeError, ValueError):
        page["columnas"] = 1
    return page


def merge_pages(first: dict[str, Any], second: dict[str, Any]) -> dict[str, Any]:
    """Combina dos clasificaciones con OR (si una pasada ve algo, cuenta como visto)."""
    merged = {flag: bool(first.get(flag)) or bool(second.get(flag)) for flag in PAGE_FLAGS}
    merged["columnas"] = max(int(first.get("columnas") or 1), int(second.get("columnas") or 1))
    return merged


def flags_summary(page: dict[str, Any]) -> str:
    found = [flag for flag in PAGE_FLAGS if page.get(flag)]
    return ", ".join(found) if found else "solo texto"


def page_from_blocks(blocks: list[dict[str, Any]]) -> dict[str, Any]:
    """Que contiene la pagina segun lo que el modelo devolvio (si no hubo detector)."""
    page: dict[str, Any] = {flag: False for flag in PAGE_FLAGS}
    for block in blocks:
        flag = BLOCK_KIND_TO_FLAG.get(str(block.get("tipo", "")).lower())
        if flag:
            page[flag] = True
    return page


def _log_usage(provider: str, model: str, result: ModelResult) -> None:
    usage = result.usage
    if not usage:
        return
    extra = f", razonamiento={usage['thinking']}" if usage.get("thinking") else ""
    logger.info(
        f"Tokens {provider} ({model}): entrada={usage.get('input', 0)}, salida={usage.get('output', 0)}{extra}"
    )


# ---------------------------------------------------------------------------
# v3
# ---------------------------------------------------------------------------

async def run_v3(
    client: httpx.AsyncClient,
    image_b64: str,
    context: str | None,
    local: VisionProvider,
    lock: asyncio.Lock,
) -> PipelineResult:
    async with lock:
        started = time.monotonic()
        result = await local.generate(client, build_vision_prompt(context), image_b64, max_tokens=1600)
        if not result.text.strip():
            raise ProviderError(502, "Ollama devolvió una respuesta vacía.")
        description = strip_markdown(result.text)
        return PipelineResult(
            description=description,
            elements=normalize_model_output(description),
            page=None,
            provider=local.name,
            model=local.model,
            steps=[_step("extraccion", local.name, started)],
        )


# ---------------------------------------------------------------------------
# v4
# ---------------------------------------------------------------------------

async def run_v4(
    client: httpx.AsyncClient,
    image_b64: str,
    context: str | None,
    settings: Settings,
    local: VisionProvider,
    lock: asyncio.Lock,
) -> PipelineResult:
    async with lock:
        return await _run_v4_locked(client, image_b64, context, settings, local)


async def _run_v4_locked(
    client: httpx.AsyncClient,
    image_b64: str,
    context: str | None,
    settings: Settings,
    local: VisionProvider,
) -> PipelineResult:
    started = time.monotonic()
    steps: list[dict[str, Any]] = []

    # Paso 1: clasificar. Se hace dos veces (una determinista, otra con algo
    # de variacion) y se combinan con OR, porque en paginas limite (ej. una
    # tabla densa de solo numeros) una sola pasada con temperature=0 puede
    # quedar atascada en una lectura equivocada. Esto no afecta la fidelidad
    # del texto final: solo decide que reglas de extraccion se activan.
    page: dict[str, Any] = {}
    t0 = time.monotonic()
    try:
        first = await local.generate(
            client, CLASSIFY_PROMPT, image_b64, schema=CLASSIFY_SCHEMA, max_tokens=120, temperature=0.0
        )
        second = await local.generate(
            client, CLASSIFY_PROMPT, image_b64, schema=CLASSIFY_SCHEMA, max_tokens=120, temperature=0.6
        )
        page = merge_pages(
            normalize_page(parse_json_lenient(first.text) or {}),
            normalize_page(parse_json_lenient(second.text) or {}),
        )
    except httpx.HTTPError as exc:
        logger.info(f"Clasificacion fallida, se continua sin ella: {exc}")
    steps.append(_step("deteccion", local.name, t0, flags_summary(page) if page else "sin clasificacion"))
    logger.info(f"Clasificacion: {page}")

    # Paso 2: extraccion estructurada.
    # Las tablas densas necesitan mas "empuje" contra la repeticion: al
    # generar muchas filas con la misma plantilla ("Fila N: campo: valor..."),
    # un repeat_penalty bajo hace que el modelo se detenga temprano con un
    # resumen en vez de enumerar las filas. Para texto normal ese mismo valor
    # alto corrompe palabras comunes, asi que solo se sube cuando hay tabla.
    extraction_repeat_penalty = 1.2 if page.get("tabla") else 1.05
    t0 = time.monotonic()
    result = await local.generate(
        client,
        build_extraction_prompt(page, context),
        image_b64,
        schema=EXTRACT_SCHEMA,
        max_tokens=4096,
        repeat_penalty=extraction_repeat_penalty,
    )
    steps.append(_step("extraccion", local.name, t0))
    data = parse_json_lenient(result.text)
    if data is None:
        # Ultimo recurso: tratar la salida como texto libre.
        logger.info("La salida JSON no se pudo interpretar; se usa el texto libre.")
        description = strip_markdown(result.text)
        return PipelineResult(
            description=description,
            elements=normalize_model_output(description),
            page=page,
            provider=local.name,
            model=local.model,
            detector=local.name,
            steps=steps,
        )
    if result.finish_reason == "length" or data.get("_truncado"):
        logger.info("Aviso: la salida se corto por longitud; se rescataron los bloques completos.")

    blocks = [b for b in data.get("bloques", []) if isinstance(b, dict)]

    # Paso 2b: red de seguridad para tablas que el clasificador no detecto.
    # Si el resultado solo dice "informe de N filas" sin ninguna fila real,
    # se reintenta forzando las reglas de tabla, sin importar lo que dijo
    # el clasificador.
    if not page.get("tabla") and looks_like_missed_table(blocks):
        if time.monotonic() - started < settings.time_budget_s * 0.5:
            logger.info("Posible tabla no detectada por el clasificador; se reintenta forzando reglas de tabla.")
            t0 = time.monotonic()
            forced = await local.generate(
                client,
                build_extraction_prompt({**page, "tabla": True}, context),
                image_b64,
                schema=EXTRACT_SCHEMA,
                max_tokens=4096,
                repeat_penalty=1.2,
            )
            steps.append(_step("extraccion", local.name, t0, "reintento de tabla"))
            forced_data = parse_json_lenient(forced.text)
            if forced_data:
                forced_blocks = [b for b in forced_data.get("bloques", []) if isinstance(b, dict)]
                if any(str(b.get("tipo", "")).lower() == "tabla" for b in forced_blocks):
                    blocks = forced_blocks
                    page = {**page, "tabla": True}

    # Paso 3: completar elementos visuales que faltan (con presupuesto de tiempo).
    blocks = await _complete_visuals(
        client, image_b64, page, blocks, settings, local, started, steps, max_tokens=700
    )

    elements = blocks_to_elements(blocks)
    return PipelineResult(
        description=elements_to_description(elements),
        elements=elements,
        page=page,
        provider=local.name,
        model=local.model,
        detector=local.name,
        steps=steps,
    )


async def _complete_visuals(
    client: httpx.AsyncClient,
    image_b64: str,
    page: dict[str, Any],
    blocks: list[dict[str, Any]],
    settings: Settings,
    provider: VisionProvider,
    started: float,
    steps: list[dict[str, Any]],
    *,
    max_tokens: int,
) -> list[dict[str, Any]]:
    """Si el detector vio una imagen, grafica o diagrama y la extraccion no la describio,
    hace una llamada enfocada solo a eso."""
    followups = 0
    for kind in missing_visuals(page, blocks):
        if followups >= settings.max_followups:
            break
        if time.monotonic() - started > settings.time_budget_s * 0.6:
            logger.info("Sin tiempo para la llamada enfocada; se omite.")
            break
        followups += 1
        logger.info(f"Llamada enfocada para: {kind}")
        t0 = time.monotonic()
        try:
            result = await provider.generate(client, FOLLOWUP_PROMPTS[kind], image_b64, max_tokens=max_tokens)
        except (ProviderError, httpx.HTTPError) as exc:
            logger.info(f"La llamada enfocada fallo y se omite: {exc}")
            break
        steps.append(_step("llamada_enfocada", provider.name, t0, kind))
        blocks = merge_followup(blocks, kind, result.text)
    return blocks


# ---------------------------------------------------------------------------
# hybrid: nube + detector local
# ---------------------------------------------------------------------------

async def _detect(
    client: httpx.AsyncClient,
    image_b64: str,
    local: VisionProvider,
    lock: asyncio.Lock,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Ollama solo mira la pagina y dice que contiene. Nunca debe tumbar la peticion."""
    t0 = time.monotonic()
    page: dict[str, Any] = {}
    try:
        async with lock:
            result = await local.generate(
                client, CLASSIFY_PROMPT, image_b64, schema=CLASSIFY_SCHEMA, max_tokens=120, temperature=0.0
            )
        page = normalize_page(parse_json_lenient(result.text) or {})
    except (httpx.HTTPError, ProviderError) as exc:
        logger.info(f"Detector local no disponible, se continua sin el: {exc}")
    logger.info(f"Clasificacion: {page}")
    return page, _step("deteccion", local.name, t0, flags_summary(page) if page else "no disponible")


async def run_hybrid(
    client: httpx.AsyncClient,
    image_b64: str,
    context: str | None,
    settings: Settings,
    cloud: VisionProvider,
    local: VisionProvider,
    lock: asyncio.Lock,
    budget: CloudBudget | None = None,
) -> PipelineResult:
    started = time.monotonic()

    if budget is not None and not budget.try_acquire():
        # Tope diario alcanzado: no se llama a la nube; se lee la pagina con el respaldo local.
        limit_error = ProviderError(
            503,
            "Se alcanzó el límite diario de lecturas con IA en la nube.",
            log_detail=f"limite diario de la nube alcanzado ({budget.max_per_day} paginas)",
        )
        return await _fallback_or_raise(client, image_b64, context, settings, local, lock, started, cloud, limit_error)

    use_detector = settings.detector == "ollama"
    detect_task = asyncio.create_task(_detect(client, image_b64, local, lock)) if use_detector else None

    try:
        t0 = time.monotonic()
        result = await cloud.generate(
            client,
            build_extraction_prompt(None, context, cloud=True),
            image_b64,
            schema=EXTRACT_SCHEMA_CLOUD,
            max_tokens=8192,
            temperature=0.0,
        )
        extraction_step = _step("extraccion", cloud.name, t0)
        _log_usage(cloud.name, cloud.model, result)
    except (ProviderError, httpx.HTTPError) as exc:
        if detect_task:
            detect_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await detect_task
        return await _fallback_or_raise(client, image_b64, context, settings, local, lock, started, cloud, exc)

    page: dict[str, Any] = {}
    steps: list[dict[str, Any]] = []
    if detect_task:
        try:
            # Si Ollama esta ocupado con otra pagina, no se retrasa una respuesta que ya esta lista.
            page, detect_step = await asyncio.wait_for(detect_task, timeout=settings.detect_grace_s)
        except asyncio.TimeoutError:  # en Python < 3.11 no es el mismo que TimeoutError
            logger.info("El detector local tardo demasiado y se omite para esta pagina.")
            detect_step = {
                "name": "deteccion", "engine": local.name,
                "seconds": round(time.monotonic() - started, 2), "detail": "omitida por tiempo",
            }
        steps.append(detect_step)
    steps.append(extraction_step)

    data = parse_json_lenient(result.text)
    if data is None:
        logger.info("La salida JSON de la nube no se pudo interpretar; se usa el texto libre.")
        description = strip_markdown(result.text)
        elements = normalize_model_output(description)
        return PipelineResult(
            description=description,
            elements=elements,
            page=page or None,
            provider=cloud.name,
            model=cloud.model,
            detector=local.name if use_detector else None,
            steps=steps,
        )
    if result.finish_reason in ("length", "MAX_TOKENS") or data.get("_truncado"):
        logger.info("Aviso: la salida de la nube se corto por longitud; se rescataron los bloques completos.")
    elif result.finish_reason == "RECITATION":
        logger.info("Aviso: el proveedor marco la respuesta como recitacion; puede estar incompleta.")

    blocks = [b for b in data.get("bloques", []) if isinstance(b, dict)]
    blocks = await _complete_visuals(
        client, image_b64, page, blocks, settings, cloud, started, steps, max_tokens=1500
    )

    if not page:
        # Sin detector (o si fallo): el contenido de la pagina se deduce de lo que la nube devolvio.
        page = page_from_blocks(blocks)
        logger.info(f"Clasificacion (segun la lectura de la nube): {page}")

    elements = blocks_to_elements(blocks)
    return PipelineResult(
        description=elements_to_description(elements),
        elements=elements,
        page=page,
        provider=cloud.name,
        model=cloud.model,
        detector=local.name if use_detector else None,
        steps=steps,
    )


async def _fallback_or_raise(
    client: httpx.AsyncClient,
    image_b64: str,
    context: str | None,
    settings: Settings,
    local: VisionProvider,
    lock: asyncio.Lock,
    started: float,
    cloud: VisionProvider,
    error: ProviderError | httpx.HTTPError,
) -> PipelineResult:
    detail = error.log_detail if isinstance(error, ProviderError) and error.log_detail else str(error)
    logger.error(f"La nube ({cloud.name}) fallo: {detail}")

    elapsed = time.monotonic() - started
    can_fall_back = (
        settings.fallback == "ollama"
        and elapsed <= settings.time_budget_s * FALLBACK_MAX_ELAPSED_FRACTION
    )
    if not can_fall_back:
        if isinstance(error, ProviderError):
            raise error
        raise ProviderError(503, "No se pudo conectar con el servicio de IA.", log_detail=detail) from error

    logger.info("Se usa el respaldo local (Ollama, pipeline v4).")
    failed_step = {
        "name": "extraccion", "engine": cloud.name, "seconds": round(elapsed, 2), "detail": "fallo",
    }
    fallback = await run_v4(client, image_b64, context, settings, local, lock)
    fallback.steps = [failed_step, *fallback.steps]
    fallback.fallback_reason = detail[:200]
    return fallback


# ---------------------------------------------------------------------------
# Seleccion
# ---------------------------------------------------------------------------

async def run_pipeline(
    client: httpx.AsyncClient,
    image_b64: str,
    context: str | None,
    settings: Settings,
    cloud: VisionProvider | None,
    local: VisionProvider,
    lock: asyncio.Lock,
    budget: CloudBudget | None = None,
) -> PipelineResult:
    pipeline = settings.effective_pipeline
    if pipeline == "hybrid" and cloud is not None:
        return await run_hybrid(client, image_b64, context, settings, cloud, local, lock, budget)
    if pipeline == "v3":
        return await run_v3(client, image_b64, context, local, lock)
    return await run_v4(client, image_b64, context, settings, local, lock)
