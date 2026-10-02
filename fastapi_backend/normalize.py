"""Limpieza y conversion de la salida del modelo a elementos que el frontend lee uno por uno."""
import json
import re
from typing import Any

# ---------------------------------------------------------------------------
# Normalizacion de la salida (v3: texto con prefijos)
# ---------------------------------------------------------------------------

PREFIX_TO_TYPE = {
    "TEXTO": "Texto",
    "IMAGEN": "Descripción Visual",
    "TABLA": "Tabla",
    "DUDOSO": "Contenido dudoso",
}
TYPE_TO_PREFIX = {value: key for key, value in PREFIX_TO_TYPE.items()}
PREFIX_PATTERN = re.compile(r"^\[(TEXTO|IMAGEN|TABLA|DUDOSO)\]\s*(.*)$", re.IGNORECASE)
TABLE_SEPARATOR_PATTERN = re.compile(r"^\s*\|?\s*:?-{3,}")


def strip_markdown(text: str) -> str:
    """Quita marcas de Markdown sin borrar simbolos utiles (3*x, N.º #3)."""
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
    text = re.sub(r"__(.+?)__", r"\1", text)
    text = re.sub(r"(?m)^\s{0,3}#{1,6}\s+", "", text)
    text = re.sub(r"(?m)^\s*[\*\-]\s+(?=\S)", "", text)
    return text


def _table_cells(line: str) -> list[str]:
    return [cell.strip() for cell in line.strip().strip("|").split("|")]


def _table_elements(lines: list[str]) -> list[dict[str, str]]:
    content_lines = [line for line in lines if not TABLE_SEPARATOR_PATTERN.match(line)]
    if not content_lines:
        return []

    headers = _table_cells(content_lines[0])
    elements = [{"type": "Tabla", "content": "Encabezados: " + "; ".join(headers)}]
    for line in content_lines[1:]:
        cells = _table_cells(line)
        if len(cells) == len(headers):
            content = "; ".join(
                f"{header}: {value}" for header, value in zip(headers, cells)
            )
        else:
            content = "; ".join(cells)
        elements.append({"type": "Tabla", "content": content})
    return elements


def normalize_model_output(description: str) -> list[dict[str, str]]:
    """Turn imperfect model text into stable logical elements for the reader."""
    cleaned = re.sub(r"<think>[\s\S]*?</think>", "", description, flags=re.IGNORECASE)
    lines = cleaned.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    elements: list[dict[str, str]] = []
    paragraph: list[str] = []
    table: list[str] = []

    def flush_paragraph() -> None:
        if not paragraph:
            return
        content = " ".join(part.strip() for part in paragraph if part.strip()).strip()
        if content:
            elements.append({"type": "Texto", "content": content})
        paragraph.clear()

    def flush_table() -> None:
        if not table:
            return
        elements.extend(_table_elements(table))
        table.clear()

    for index, raw_line in enumerate(lines):
        line = raw_line.strip()
        if not line:
            flush_table()
            flush_paragraph()
            continue

        match = PREFIX_PATTERN.match(line)
        if match:
            flush_table()
            flush_paragraph()
            marker, content = match.groups()
            if content.strip():
                elements.append(
                    {"type": PREFIX_TO_TYPE[marker.upper()], "content": content.strip()}
                )
            continue

        next_line = lines[index + 1].strip() if index + 1 < len(lines) else ""
        is_table_line = "|" in line and (
            bool(table)
            or bool(TABLE_SEPARATOR_PATTERN.match(line))
            or bool(TABLE_SEPARATOR_PATTERN.match(next_line))
        )
        if is_table_line:
            flush_paragraph()
            table.append(line)
            continue

        flush_table()
        paragraph.append(line)

    flush_table()
    flush_paragraph()
    return elements or [{"type": "Texto", "content": "Página en blanco o sin contenido reconocible."}]


# ---------------------------------------------------------------------------
# Normalizacion de la salida (v4: JSON)
# ---------------------------------------------------------------------------

def parse_json_lenient(raw: str) -> dict[str, Any] | None:
    """Parsea JSON; si el modelo se corto por longitud, rescata los bloques completos."""
    raw = (raw or "").strip()
    raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw)
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else None
    except json.JSONDecodeError:
        pass

    # Rescate: cortar en el ultimo bloque cerrado y cerrar la lista.
    closing_positions = [i for i, ch in enumerate(raw) if ch == "}"][::-1][:300]
    for cut in closing_positions:
        candidate = raw[: cut + 1] + "]}"
        try:
            data = json.loads(candidate)
            if isinstance(data, dict):
                data["_truncado"] = True
                return data
        except json.JSONDecodeError:
            continue
    return None


def collapse_repeated_lines(text: str) -> str:
    """Corta bucles de repeticion: si un tramo de palabras se repite tal cual
    varias veces seguidas en cualquier parte del bloque (degeneracion conocida
    de modelos con temperature=0), se conserva solo la primera repeticion.
    Trabaja a nivel de palabras (no de lineas) porque el modelo no siempre
    corta la linea en el mismo punto en cada repeticion. Busca en cualquier
    posicion, no solo desde el inicio, porque el bucle suele empezar despues
    de un titulo u otro fragmento que no se repite."""
    words = text.split()
    n = len(words)
    if n < 12:
        return text

    best: tuple[int, int, int] | None = None  # (start, period, covered)
    max_period = n // 2
    for period in range(4, max_period + 1):
        min_repeats = 2
        start = 0
        while start + period * min_repeats <= n:
            window = words[start : start + period]
            repeats = 1
            pos = start + period
            while pos + period <= n and words[pos : pos + period] == window:
                repeats += 1
                pos += period
            if repeats >= min_repeats:
                covered = repeats * period
                if best is None or covered > best[2]:
                    best = (start, period, covered)
                start = pos
            else:
                start += 1

    if best is None:
        return text

    start, period, covered = best
    end = start + covered
    window = words[start : start + period]
    remainder = words[end:]
    # Un remanente que es solo el inicio de otra repeticion cortada se descarta.
    if remainder and window[: len(remainder)] == remainder:
        remainder = []
    return " ".join(words[: start + period] + remainder)


def _clean(value: Any) -> str:
    cleaned = strip_markdown(str(value or "")).strip()
    return collapse_repeated_lines(cleaned)


# Textos de andamiaje que AURA agrega al leer tablas, graficas y diagramas. Se
# escriben en el idioma del bloque para que la voz no mezcle idiomas.
LABELS: dict[str, dict[str, str]] = {
    "es": {
        "table": "Tabla", "rows": "filas", "columns": "Columnas", "row": "Fila",
        "chart": "Gráfica", "data": "Datos", "diagram": "Diagrama", "arrows": "Flechas", "to": "hacia",
    },
    "en": {
        "table": "Table", "rows": "rows", "columns": "Columns", "row": "Row",
        "chart": "Chart", "data": "Data", "diagram": "Diagram", "arrows": "Arrows", "to": "to",
    },
}


def normalize_lang_code(value: Any) -> str | None:
    """Codigo de idioma de dos letras en minuscula ("en-US" -> "en"), o None."""
    code = str(value or "").strip().lower().replace("_", "-").split("-")[0]
    return code if len(code) == 2 and code.isalpha() else None


def _element(kind: str, content: str, lang: str | None) -> dict[str, str]:
    element = {"type": kind, "content": content}
    if lang:
        element["lang"] = lang
    return element


def blocks_to_elements(blocks: list[dict[str, Any]]) -> list[dict[str, str]]:
    """Convierte bloques JSON en elementos que el frontend lee uno por uno.

    Si el bloque trae "idioma", cada elemento lleva "lang" y las etiquetas de
    tablas/graficas/diagramas salen en ese idioma (es o en; otro cae a es)."""
    elements: list[dict[str, str]] = []
    for block in blocks:
        if not isinstance(block, dict):
            continue
        kind = str(block.get("tipo", "texto")).lower()
        content = _clean(block.get("contenido"))
        lang = normalize_lang_code(block.get("idioma"))
        if lang and kind in ("grafica", "diagrama", "imagen", "dudoso"):
            # Las descripciones las escribe AURA en espanol, aunque el documento no lo este.
            lang = "es"
        labels = LABELS.get(lang or "es", LABELS["es"])

        if kind == "tabla":
            headers = [_clean(h) for h in block.get("encabezados") or []]
            rows = [r for r in block.get("filas") or [] if isinstance(r, list)]
            title = content or labels["table"]
            summary = f"{title}. {len(rows)} {labels['rows']}"
            if headers:
                summary += f". {labels['columns']}: " + "; ".join(headers)
            elements.append(_element("Tabla", summary, lang))
            for index, row in enumerate(rows, start=1):
                cells = [_clean(c) for c in row]
                if headers and len(cells) == len(headers):
                    text = "; ".join(f"{h}: {c}" for h, c in zip(headers, cells))
                else:
                    text = "; ".join(cells)
                if text:
                    elements.append(_element("Tabla", f"{labels['row']} {index}. {text}", lang))
            continue

        if kind == "grafica":
            pairs = [
                f"{_clean(d.get('etiqueta'))}: {_clean(d.get('valor'))}"
                for d in block.get("datos") or []
                if isinstance(d, dict) and _clean(d.get("etiqueta"))
            ]
            text = content or labels["chart"]
            if pairs:
                text += f". {labels['data']}: " + "; ".join(pairs)
            elements.append(_element("Descripción Visual", text, lang))
            continue

        if kind == "diagrama":
            links = []
            for c in block.get("conexiones") or []:
                if not isinstance(c, dict):
                    continue
                origin, target = _clean(c.get("origen")), _clean(c.get("destino"))
                if not origin or not target:
                    continue
                label = _clean(c.get("etiqueta"))
                links.append(f"{origin} {labels['to']} {target}" + (f" ({label})" if label else ""))
            text = content or labels["diagram"]
            if links:
                text += f". {labels['arrows']}: " + "; ".join(links)
            elements.append(_element("Descripción Visual", text, lang))
            continue

        if not content:
            continue
        if kind == "imagen":
            elements.append(_element("Descripción Visual", content, lang))
        elif kind == "dudoso":
            elements.append(_element("Contenido dudoso", content, lang))
        else:
            elements.append(_element("Texto", content, lang))

    return elements or [{"type": "Texto", "content": "Página en blanco o sin contenido reconocible."}]


def elements_to_description(elements: list[dict[str, str]]) -> str:
    """Texto plano con prefijos: compatible con el frontend y el runner de pruebas."""
    lines = []
    for element in elements:
        prefix = TYPE_TO_PREFIX.get(element["type"], "TEXTO")
        # Un bloque puede traer saltos de linea; cada linea lleva su prefijo para que
        # quien lea "description" (el runner de pruebas) no encuentre lineas sueltas.
        for line in str(element["content"]).splitlines() or [""]:
            if line.strip():
                lines.append(f"[{prefix}] {line.strip()}")
    return "\n".join(lines)


MENTIONS_ROWS_PATTERN = re.compile(r"\d+\s*filas?\b", re.IGNORECASE)


def looks_like_missed_table(blocks: list[dict[str, Any]]) -> bool:
    """Señal de que una tabla se resumio como texto en vez de transcribirse:
    el clasificador puede fallar en tablas densas sin lineas de cuadricula
    visibles, y el modelo entonces solo dice 'informe de N filas' sin
    generar ninguna fila real."""
    has_table_block = any(
        str(b.get("tipo", "")).lower() == "tabla" for b in blocks if isinstance(b, dict)
    )
    if has_table_block:
        return False
    combined = " ".join(str(b.get("contenido", "")) for b in blocks if isinstance(b, dict))
    return bool(MENTIONS_ROWS_PATTERN.search(combined))


def missing_visuals(page: dict[str, Any], blocks: list[dict[str, Any]]) -> list[str]:
    """Tipos visuales que el clasificador vio pero la extraccion no describio bien."""
    missing = []
    kinds = {str(b.get("tipo", "")).lower() for b in blocks if isinstance(b, dict)}
    if page.get("imagen") and "imagen" not in kinds:
        missing.append("imagen")
    if page.get("grafica"):
        charts = [b for b in blocks if str(b.get("tipo", "")).lower() == "grafica"]
        if not charts or not any(b.get("datos") for b in charts):
            missing.append("grafica")
    if page.get("diagrama"):
        diagrams = [b for b in blocks if str(b.get("tipo", "")).lower() == "diagrama"]
        if not diagrams or not any(b.get("conexiones") for b in diagrams):
            missing.append("diagrama")
    return missing


def merge_followup(blocks: list[dict[str, Any]], kind: str, text: str) -> list[dict[str, Any]]:
    """Inserta (o reemplaza) la descripcion visual obtenida en la llamada enfocada."""
    text = _clean(text)
    if not text:
        return blocks
    new_block = {"tipo": "imagen", "contenido": text}
    for index, block in enumerate(blocks):
        if str(block.get("tipo", "")).lower() == kind:
            merged = dict(block)
            merged["tipo"] = "imagen"
            merged["contenido"] = text
            return blocks[:index] + [merged] + blocks[index + 1:]
    return blocks + [new_block]
