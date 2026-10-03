"""Prueba rapida de punta a punta de AURA por la URL publica (como lo haria un usuario). Corre antes de la demo.

    pip install pymupdf        (una sola vez)
    python scripts/smoke_demo.py

Revisa: la pagina web esta actualizada, la voz del servidor responde, y que paginas de cada tipo (tabla, diagrama,
grafica, imagenes, escaneado, examen de ingles con instrucciones en espanol) se analizan bien y rapido.
No necesita claves. Gasta unos 2 centavos de dolar. Sale con codigo 0 si todo lo critico esta bien.
"""
import argparse
import base64
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

try:
    import fitz  # PyMuPDF
except ImportError:
    sys.exit("Falta PyMuPDF. Instalalo con:  pip install pymupdf")

CORPUS = Path(__file__).resolve().parent.parent / "corpus_extra"
SLOW_SECONDS = 15.0

# (nombre, pdf, expresiones que deben aparecer en lo que AURA va a leer)
CASES = [
    ("Tabla de horario", "G06_tabla_horario.pdf", [r"RECREO", r"Programaci[oó]n", r"Educaci[oó]n f[ií]sica"]),
    ("Diagrama de flujo", "G05_diagrama_flujo.pdf", [r"Puede votar", r"No puede votar"]),
    ("Grafica sin valores (debe decir aprox.)", "G04_barras_sin_valores.pdf", [r"aprox"]),
    ("Dos figuras (semaforo y reloj)", "G13_dos_figuras.pdf", [r"sem[aá]foro", r"reloj"]),
    ("Documento escaneado (sin texto)", "G10_escaneado_sin_texto.pdf", [r"Mar[ií]a Fernanda", r"Filtro de agua solar"]),
]

results: list[tuple[str, bool, str, bool]] = []  # (nombre, ok, detalle, critico)


def report(name: str, ok: bool, detail: str = "", critical: bool = True) -> None:
    results.append((name, ok, detail, critical))
    mark = "OK    " if ok else ("FALLA " if critical else "AVISO ")
    print(f"  [{mark}] {name}" + (f"  -  {detail}" if detail else ""))


def http(url: str, body: dict | None = None, timeout: int = 90):
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json"} if body is not None else {}
    request = urllib.request.Request(url, data=data, headers=headers)
    started = time.time()
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, response.headers.get("content-type", ""), response.read(), time.time() - started
    except urllib.error.HTTPError as error:
        return error.code, error.headers.get("content-type", ""), error.read(), time.time() - started
    except Exception as error:  # noqa: BLE001 - red caida, DNS, tiempo agotado...
        return 0, "", str(error).encode(), time.time() - started


def render(pdf: Path | None = None, page: "fitz.Page | None" = None) -> tuple[str, str | None]:
    document = fitz.open(pdf) if pdf else None
    target = page if page is not None else document[0]
    image = base64.b64encode(target.get_pixmap(dpi=216).tobytes("jpeg")).decode()  # ~escala 3.0 de la app
    text = target.get_text().strip()
    return image, text or None


def analyze(base: str, image: str, context: str | None, fresh: bool):
    if context is not None and fresh:
        context = f"{context}\n{time.time()}"  # evita que la cache responda por nosotros
    elif context is None and fresh:
        context = None
    body = {"image": "data:image/jpeg;base64," + image, "context": context}
    status, ctype, raw, seconds = http(f"{base}/api/describe-image", body)
    try:
        return status, json.loads(raw or b"{}"), seconds
    except ValueError:
        return status, {"detail": raw[:200].decode("utf-8", "replace")}, seconds


def spoken_text(data: dict) -> str:
    return "\n".join(element.get("content", "") for element in data.get("elements", []))


def english_exam_page() -> "fitz.Page":
    lines = [
        ("hebo", 15, "Examen de inglés - Unidad 3"),
        ("helv", 11, "Instrucciones: elige la opción correcta para completar cada oración."),
        ("hebo", 11, "1.  The kid was .................. fast that no one saw him."),
        ("helv", 11, "a) so          b) too          c) such"),
        ("hebo", 11, "2.  .............. adults know how to use the Internet."),
        ("helv", 11, "a) Little          b) Few          c) Much"),
    ]
    page = fitz.open().new_page(width=612, height=792)
    y = 70
    for font, size, text in lines:
        page.insert_text((60, y), text, fontsize=size, fontname=font)
        y += 34
    return page


def main() -> int:
    parser = argparse.ArgumentParser(description="Prueba rapida de AURA por la URL publica")
    parser.add_argument("--url", default="https://aurapdf-one.vercel.app", help="direccion de la app")
    parser.add_argument("--con-cache", action="store_true", help="permite que la cache del servidor responda")
    args = parser.parse_args()
    base = args.url.rstrip("/")
    fresh = not args.con_cache
    started = time.time()

    print(f"\nAURA - prueba rapida de punta a punta\n  app: {base}\n")

    print("1) La pagina web")
    status, _, raw, seconds = http(base + "/", timeout=30)
    if status != 200:
        report("La pagina carga", False, f"HTTP {status} - {raw[:80].decode('utf-8', 'replace')}")
    else:
        report("La pagina carga", True, f"{seconds:.1f} s")
        bundle = re.search(r'assets/index-[A-Za-z0-9_-]+\.js', raw.decode("utf-8", "replace"))
        if bundle:
            _, _, js, _ = http(f"{base}/{bundle.group(0)}", timeout=60)
            current = b"\xc3\x9altima lectura" in js and b"teclas + y -" in js
            report("Es la version actual (teclas + y -, ultima lectura)", current,
                   "" if current else "version vieja: espera el despliegue de Vercel o recarga con Ctrl+Shift+R", critical=False)

    print("\n2) Servidor y voz en ingles")
    status, _, raw, seconds = http(base + "/api/tts", timeout=30)
    try:
        tts = json.loads(raw)
    except ValueError:
        tts = {}
    if status == 200 and tts.get("available"):
        report("Voz estadounidense del servidor disponible", True, f"{tts.get('voice')}")
        status, ctype, audio, seconds = http(base + "/api/tts", {"text": "Could you please turn up the volume?", "lang": "en"}, timeout=30)
        report("Genera audio en ingles", status == 200 and audio[:4] == b"RIFF", f"{len(audio) // 1024} KB en {seconds:.1f} s")
    else:
        report("Voz del servidor", False, f"HTTP {status}: el servidor no responde (pod apagado o tunel caido)", critical=False)

    print("\n3) Analisis de paginas (lo que hace la tecla F)")
    for name, pdf_name, anchors in CASES:
        pdf = CORPUS / pdf_name
        if not pdf.exists():
            report(name, False, f"no encuentro {pdf}", critical=False)
            continue
        image, text = render(pdf)
        status, data, seconds = analyze(base, image, text, fresh)
        if status != 200:
            report(name, False, f"HTTP {status}: {data.get('detail', '')}")
            continue
        content = spoken_text(data)
        missing = [a for a in anchors if not re.search(a, content, re.I)]
        notes = [f"{seconds:.1f} s", data.get("provider", "?")]
        if data.get("fallback_reason"):
            notes.append("USO EL RESPALDO LOCAL (la nube fallo)")
        if seconds > SLOW_SECONDS:
            notes.append("LENTO")
        report(name, not missing and seconds <= 60, ", ".join(notes) + (f" | faltan: {missing}" if missing else ""))

    image, text = render(page=english_exam_page())
    status, data, seconds = analyze(base, image, text, fresh)
    if status != 200:
        report("Examen de ingles con instrucciones en espanol", False, f"HTTP {status}: {data.get('detail', '')}")
    else:
        langs = {element.get("lang") for element in data.get("elements", [])}
        ok = "en" in langs and bool(re.search(r"Little", spoken_text(data)))
        report("Examen de ingles con instrucciones en espanol", ok, f"{seconds:.1f} s, idiomas asignados: {sorted(l for l in langs if l)}")

    print("\nResumen")
    failed = [name for name, ok, _, critical in results if not ok and critical]
    warned = [name for name, ok, _, critical in results if not ok and not critical]
    total = len(results)
    print(f"  {total - len(failed) - len(warned)}/{total} bien, {len(warned)} avisos, {len(failed)} fallas  ({time.time() - started:.0f} s)")
    if failed:
        print("\n  NO LISTO PARA LA DEMO. Fallan:", "; ".join(failed))
        print("  Si todo falla: el pod esta apagado o el tunel caido -> ejecuta scripts/restaurar_pod.sh en el pod.")
        return 1
    print("\n  LISTO PARA LA DEMO" + (" (revisa los avisos)" if warned else "") + ".")
    return 0


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except AttributeError:
        pass
    sys.exit(main())
