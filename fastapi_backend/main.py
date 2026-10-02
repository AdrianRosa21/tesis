"""AURA - API del lector de PDF accesible.

Recibe la imagen de una pagina, la analiza (modelo en la nube + detector local, o solo
Ollama) y devuelve elementos listos para leer en voz alta. Los prompts, el pipeline y los
proveedores estan en sus propios modulos; aqui solo se arma la aplicacion y los endpoints.
"""
import sys
from pathlib import Path

# Permite arrancar con `uvicorn main:app` desde fastapi_backend/ ademas de
# `uvicorn fastapi_backend.main:app` desde la raiz del repositorio.
_REPO_ROOT = str(Path(__file__).resolve().parents[1])
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

import asyncio  # noqa: E402
import contextlib  # noqa: E402
import time  # noqa: E402
from contextlib import asynccontextmanager  # noqa: E402

import httpx  # noqa: E402
from fastapi import Depends, FastAPI, Header, HTTPException, Request, status  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import StreamingResponse  # noqa: E402
from pydantic import BaseModel  # noqa: E402

from fastapi_backend import logbus  # noqa: E402
from fastapi_backend.cache import ResponseCache, build_cache_key  # noqa: E402
from fastapi_backend.config import load_settings  # noqa: E402
from fastapi_backend.logbus import log_buffer, log_subscribers, logger  # noqa: E402
from fastapi_backend.normalize import (  # noqa: E402
    blocks_to_elements,
    elements_to_description,
    merge_followup,
    missing_visuals,
    normalize_model_output,
    parse_json_lenient,
    strip_markdown,
)
from fastapi_backend.pipeline import run_pipeline  # noqa: E402
from fastapi_backend.prompts import build_extraction_prompt, build_vision_prompt  # noqa: E402
from fastapi_backend.providers import (  # noqa: E402
    ProviderError,
    build_cloud_provider,
    build_local_provider,
)
from fastapi_backend.ratelimit import RateLimiter  # noqa: E402

# Nombres que las pruebas (test_prompt_policy.py) importan desde este modulo.
__all__ = [
    "PROMPT_VERSION",
    "app",
    "blocks_to_elements",
    "build_cache_key",
    "build_extraction_prompt",
    "build_vision_prompt",
    "elements_to_description",
    "merge_followup",
    "missing_visuals",
    "normalize_model_output",
    "parse_json_lenient",
    "strip_markdown",
]

settings = load_settings()
PROMPT_VERSION = settings.prompt_version

local_provider = build_local_provider(settings)
cloud_provider = build_cloud_provider(settings)


def _describe_engine() -> str:
    pipeline = settings.effective_pipeline
    if pipeline == "hybrid" and cloud_provider is not None:
        detector = f"detector {local_provider.model}" if settings.detector == "ollama" else "sin detector"
        return f"hybrid: {cloud_provider.name} ({cloud_provider.model}) + {detector}"
    return f"{pipeline} ({local_provider.model})"


async def _warm_up_ollama() -> None:
    """Carga el modelo local en la GPU. Corre en segundo plano: nunca debe tumbar el arranque."""
    started = time.monotonic()
    logger.info("Precalentando el modelo local (Ollama)...")
    try:
        async with httpx.AsyncClient() as client:
            await local_provider.warm_up(client)
    except Exception as exc:  # noqa: BLE001 - es solo una optimizacion
        logger.info(f"No se pudo precalentar el modelo local: {type(exc).__name__}: {exc}")
        return
    logger.info(f"Modelo local listo en {time.monotonic() - started:.1f} s.")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Solo cuando el servidor arranca de verdad. Importar este modulo (por ejemplo desde las
    # pruebas) no debe escribir en el historial de logs de produccion.
    logbus.setup_history_file(settings.log_file_path)
    logger.info(f"AURA lista. Motor: {_describe_engine()}")
    if settings.pipeline == "hybrid" and cloud_provider is None:
        logger.info(
            f"AURA_PIPELINE=hybrid pero falta la clave de {settings.provider}: se usa el pipeline v4 con Ollama."
        )
    warm_up_task = asyncio.create_task(_warm_up_ollama()) if settings.warmup else None
    yield
    if warm_up_task is not None:
        warm_up_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await warm_up_task


app = FastAPI(title="AURA - PDF Reader AI API", lifespan=lifespan)

# 1. SEGURIDAD: CORS. El flujo de produccion pasa por el proxy de Vercel
# (servidor a servidor), asi que CORS solo aplica a pruebas desde navegador.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://aurapdf-one.vercel.app",
        "http://localhost:5173",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 2. SEGURIDAD: API Key compartida solo entre el proxy de Vercel y este backend.
API_KEY_SECRET = settings.api_key
LOGS_STREAM_KEY = settings.logs_stream_key

image_cache = ResponseCache(settings.max_cache_entries)
rate_limiter = RateLimiter(settings.rate_limit_per_min)

# Candado para que Ollama procese una sola pagina a la vez (VRAM limitada).
# La nube no lo necesita: varias paginas pueden analizarse al mismo tiempo.
ollama_lock = asyncio.Lock()


async def verify_api_key(x_api_key: str = Header(None)):
    if not API_KEY_SECRET:
        raise HTTPException(
            status_code=503,
            detail="El servidor no tiene configurada la clave de acceso.",
        )
    if x_api_key != API_KEY_SECRET:
        raise HTTPException(status_code=401, detail="Acceso denegado. API Key inválida.")


class ImageRequest(BaseModel):
    image: str
    context: str | None = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/api/health")
async def health():
    """Confirma que FastAPI esta vivo sin depender de Ollama."""
    return {"status": "ok", "service": "aura-api"}


async def _ollama_has_model() -> bool:
    """True si Ollama responde y tiene instalado el modelo configurado."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{settings.ollama_base_url}/api/tags")
            response.raise_for_status()
            models = response.json().get("models", [])
    except (httpx.HTTPError, ValueError):
        return False

    names = {model.get("name", "") for model in models if isinstance(model, dict)}
    wanted = settings.ollama_model
    return any(name == wanted or name.split(":", 1)[0] == wanted for name in names)


@app.get("/api/ready")
async def ready():
    """Listo para atender paginas.

    Con el pipeline hybrid solo hace falta la nube (Ollama es detector y respaldo y se
    informa aparte). Con v3/v4 Ollama es obligatorio."""
    ollama_ok = await _ollama_has_model()

    if settings.effective_pipeline == "hybrid" and cloud_provider is not None:
        return {
            "status": "ready",
            "model": cloud_provider.model,
            "pipeline": "hybrid",
            "provider": cloud_provider.name,
            "detector": settings.detector if ollama_ok or settings.detector == "off" else "ollama no disponible",
            "fallback": settings.fallback if ollama_ok else "ollama no disponible",
        }

    if not ollama_ok:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Ollama no esta disponible o el modelo '{settings.ollama_model}' no esta instalado.",
        )
    return {"status": "ready", "model": settings.ollama_model, "pipeline": settings.effective_pipeline}


@app.post("/api/describe-image", dependencies=[Depends(verify_api_key)])
async def describe_image(
    req: ImageRequest,
    request: Request,
    x_aura_client_ip: str | None = Header(None),
):
    if not req.image:
        raise HTTPException(status_code=400, detail="No image provided")

    # 0. LIMITE POR CLIENTE. El proxy de Vercel manda la IP real del usuario.
    client_id = x_aura_client_ip or (request.client.host if request.client else "desconocido")
    wait = rate_limiter.check(client_id)
    if wait is not None:
        logger.info(f"Rechazado por limite de peticiones ({client_id}).")
        raise HTTPException(
            status_code=429,
            detail="Demasiadas solicitudes seguidas. Espera un momento.",
            headers={"Retry-After": str(int(wait) + 1)},
        )

    # Limpiar prefijo base64 si existe
    base64_data = req.image.split(',')[1] if ',' in req.image else req.image

    # 1. VALIDACIÓN DE TAMAÑO
    image_bytes_size = (len(base64_data) * 3) / 4
    if image_bytes_size > settings.max_bytes:
        logger.info(f"Rechazado: Imagen pesada ({image_bytes_size / (1024*1024):.2f} MB)")
        raise HTTPException(status_code=413, detail="Imagen muy pesada.")

    # 2. CACHÉ (responde al instante si ya leyó la misma imagen con el mismo motor y prompt)
    cache_key = build_cache_key(base64_data, req.context, settings.engine_tag, settings.prompt_version)
    cached = image_cache.get(cache_key)
    if cached is not None:
        logger.info("Respondiendo desde caché (Página ya procesada)...")
        return {**cached, "cached": True}

    # 3. ANÁLISIS
    logger.info(f"Procesando pagina con {_describe_engine()}...")
    started = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=300.0) as client:
            result = await run_pipeline(
                client, base64_data, req.context, settings, cloud_provider, local_provider, ollama_lock
            )
    except ProviderError as exc:
        logger.error(exc.log_detail or exc.message)
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    except httpx.ReadTimeout:
        logger.error("Error: Ollama tardó demasiado en responder.")
        raise HTTPException(status_code=504, detail="La IA está tardando mucho en procesar. Por favor, intenta de nuevo.")
    except httpx.HTTPStatusError as exc:
        logger.error(f"Ollama respondio con HTTP {exc.response.status_code}: {exc.response.text[:300]}")
        raise HTTPException(status_code=502, detail="Ollama rechazó la solicitud.") from exc
    except httpx.RequestError as exc:
        logger.error(f"No fue posible conectar con Ollama: {exc}")
        raise HTTPException(status_code=503, detail="Ollama no está disponible.") from exc
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Error inesperado al procesar la pagina: {exc}")
        raise HTTPException(status_code=500, detail="Error interno al procesar la imagen con la IA.") from exc

    elapsed = round(time.monotonic() - started, 2)
    logger.info(f"Pagina procesada en {elapsed} s con {len(result.elements)} elementos.")

    response_body = {
        "success": True,
        "description": result.description,
        "elements": result.elements,
        "page_type": result.page,
        "prompt_version": settings.prompt_version,
        "model": result.model,
        "provider": result.provider,
        "detector": result.detector,
        "steps": result.steps,
        "processing_seconds": elapsed,
    }
    if result.fallback_reason:
        response_body["fallback_reason"] = result.fallback_reason
    image_cache.put(cache_key, response_body)
    return response_body


@app.get("/api/logs/stream")
async def stream_logs(key: str = ""):
    """Transmite los logs del backend en vivo (Server-Sent Events) para la
    pantalla de depuracion en public/debug.html. La clave va en la URL
    porque EventSource del navegador no permite mandar headers propios."""
    if not LOGS_STREAM_KEY or key != LOGS_STREAM_KEY:
        raise HTTPException(status_code=401, detail="Clave invalida para ver los logs.")

    queue: asyncio.Queue[str] = asyncio.Queue(maxsize=200)
    log_subscribers.add(queue)

    async def event_generator():
        try:
            for line in list(log_buffer):
                yield f"data: {line}\n\n"
            while True:
                line = await queue.get()
                yield f"data: {line}\n\n"
        finally:
            log_subscribers.discard(queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/api/logs/history")
async def logs_history(key: str = "", lines: int = 1000):
    """Historial persistente: sobrevive a los reinicios del pod porque se lee
    del archivo en /workspace, no de la memoria del proceso actual."""
    if not LOGS_STREAM_KEY or key != LOGS_STREAM_KEY:
        raise HTTPException(status_code=401, detail="Clave invalida para ver los logs.")

    history_path = logbus.LOG_HISTORY_PATH
    if history_path is None or not history_path.exists():
        return {"available": False, "lines": []}

    lines = max(1, min(lines, 5000))
    with history_path.open("r", encoding="utf-8", errors="replace") as f:
        all_lines = f.readlines()
    tail = [line.rstrip("\n") for line in all_lines[-lines:]]
    return {"available": True, "path": str(history_path), "lines": tail}
