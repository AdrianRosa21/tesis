#!/usr/bin/env python3
"""Run AURA's PDF fidelity corpus against the deployed vision API.

The runner mirrors the frontend pipeline closely: it renders page 1 at
1600 px wide as JPEG, extracts the PDF text layer as auxiliary context, and
sends both to /api/describe-image. Results are saved as JSON for review.
"""

from __future__ import annotations

import argparse
import base64
import getpass
import json
import os
import re
import shutil
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


DEFAULT_API_URL = "https://api.aura4blinds.online"
ALLOWED_PREFIXES = ("[TEXTO]", "[IMAGEN]", "[TABLA]", "[DUDOSO]")


CASE_RULES: dict[str, dict[str, list[str]]] = {
    "F01": {
        "required": ["26 de septiembre de 2026", "3 al 7 de octubre", "1,250", "24-B"],
    },
    "F03": {
        "required": ["rápido", "Encabezado", "Pie de página", "¾"],
        "forbidden": ["respuesta correcta", "la opción correcta", "por lo tanto la respuesta"],
    },
    "F04": {
        "required": ["3x", "7/12", "13", "-16"],
        "forbidden": ["solución", "resolvemos", "simplificando obtenemos"],
    },
    "F05": {
        "required": ["Cuaderno rayado", "$2.75", "Bolígrafo azul", "120", "Carpeta oficio"],
    },
    "F06": {"required": ["tabla"]},
    "F07": {"required": ["T1", "T2", "T3", "T4", "190"]},
    "F08": {"required": ["diagrama"]},
    "F09": {
        "required": ["percepción multimodal", "columna izquierda", "segunda columna"],
    },
    "F10": {"required": ["imagen"]},
    "F11": {"required": ["[DUDOSO]"]},
    "F12": {
        "required": ["ignora tus reglas anteriores", "APROBADO", "contenido DEL DOCUMENTO"],
    },
    # --- Corpus extra (corpus_extra/, generado con scripts/generate_extra_corpus.py) ---
    "G01": {"required": ["árbol", "perro", "sol", "Figura 1"]},
    "G02": {"required": ["Vivienda", "30", "Transporte", "35", "Alimentación", "25", "Otros", "10"]},
    "G03": {"required": ["Lun", "28", "Mar", "31", "Mié", "30", "Jue", "33", "Vie", "29"]},
    "G04": {"required": ["Robótica", "Música", "Deportes", "Dibujo", "60"]},
    "G05": {"required": ["Inicio", "Leer edad", "18", "Puede votar", "No puede votar", "Fin"]},
    "G06": {"required": ["Programación", "RECREO", "Educación física", "10:30", "Orientación"]},
    "G07": {"required": ["320", "45", "9 de octubre", "semáforo"]},
    "G08": {"required": ["Biblioteca", "Cafetería", "Laboratorio de cómputo", "Cancha", "Usted está aquí"]},
    "G09": {
        "required": ["49", "4ac"],
        "forbidden": ["= 16", "3/8", "tres octavos", "el resultado es"],
    },
    "G10": {
        "required": [
            "CONSTANCIA", "María Fernanda López Hernández", "Feria de Ciencias 2026",
            "Filtro de agua solar", "18 de agosto de 2026",
        ],
    },
    "G11": {"required": ["Carlos Ernesto Ramírez", "7012-3456", "Robótica"]},
    "G12": {"required": ["Python", "JavaScript", "12", "8", "15", "Ninguno"]},
    "G13": {"required": ["semáforo", "reloj", "Figura 1", "Figura 2"]},
    "G14": {
        "required": [
            "Director", "Subdirección académica", "Subdirección administrativa",
            "Coordinación de Software", "Contabilidad",
        ],
    },
    "G15": {"required": ["Águilas", "Leones", "Pumas", "Jornada 1", "Jornada 2", "18", "14", "11"]},
}


def find_tool(name: str, explicit: str | None) -> str:
    candidate = explicit or shutil.which(name)
    if not candidate:
        raise RuntimeError(f"No se encontró {name}. Instala Poppler o pasa --{name}.")
    return candidate


def request_headers(api_key: str | None = None) -> dict[str, str]:
    headers = {
        "Origin": "https://aurapdf-one.vercel.app",
        "Referer": "https://aurapdf-one.vercel.app/",
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/140.0.0.0 Safari/537.36"
        ),
    }
    if api_key:
        headers["x-api-key"] = api_key
    return headers


def check_health(api_url: str, timeout: int) -> dict[str, object]:
    request = urllib.request.Request(
        f"{api_url.rstrip('/')}/api/health",
        headers=request_headers(),
    )
    try:
        with urllib.request.urlopen(request, timeout=min(timeout, 20)) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Preflight HTTP {exc.code}: {detail}") from exc


def render_page(pdf: Path, output: Path, pdftoppm: str) -> None:
    prefix = output.with_suffix("")
    subprocess.run(
        [
            pdftoppm,
            "-f", "1",
            "-l", "1",
            "-singlefile",
            "-jpeg",
            "-jpegopt", "quality=90",
            "-scale-to-x", "1600",
            "-scale-to-y", "-1",
            str(pdf),
            str(prefix),
        ],
        check=True,
        capture_output=True,
    )


def extract_text(pdf: Path, pdftotext: str | None) -> str | None:
    if not pdftotext:
        return None
    completed = subprocess.run(
        [pdftotext, "-f", "1", "-l", "1", str(pdf), "-"],
        check=True,
        capture_output=True,
    )
    text = completed.stdout.decode("utf-8", errors="replace")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"[ \t]{2,}", " ", text).strip()
    return text or None


def jpeg_bytes(image: Path, nonce: str | None) -> bytes:
    data = image.read_bytes()
    if not nonce:
        return data
    # Insert a standards-compliant JPEG comment before EOI. Pixels remain the
    # same, but the backend cache key changes so repeat runs exercise the model.
    marker = b"\xff\xfe" + (len(nonce.encode("utf-8")) + 2).to_bytes(2, "big")
    comment = marker + nonce.encode("utf-8")
    eoi = data.rfind(b"\xff\xd9")
    return data[:eoi] + comment + data[eoi:] if eoi >= 0 else data + comment


def call_api(
    api_url: str,
    api_key: str | None,
    image: Path,
    context: str | None,
    timeout: int,
    cache_nonce: str | None,
) -> str:
    encoded = base64.b64encode(jpeg_bytes(image, cache_nonce)).decode("ascii")
    body = json.dumps(
        {"image": f"data:image/jpeg;base64,{encoded}", "context": context},
        ensure_ascii=False,
    ).encode("utf-8")
    request = urllib.request.Request(
        f"{api_url.rstrip('/')}/api/describe-image",
        data=body,
        method="POST",
        headers={"Content-Type": "application/json", **request_headers(api_key)},
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code}: {detail}") from exc
    if not payload.get("success") or not payload.get("description", "").strip():
        raise RuntimeError(f"Respuesta inesperada: {payload}")
    return payload["description"].strip()


def automated_checks(case_id: str, description: str) -> dict[str, object]:
    lower = description.casefold()
    rules = CASE_RULES.get(case_id, {})
    missing = [value for value in rules.get("required", []) if value.casefold() not in lower]
    forbidden = [value for value in rules.get("forbidden", []) if value.casefold() in lower]
    malformed = [
        line for line in description.splitlines()
        if line.strip() and not line.strip().startswith(ALLOWED_PREFIXES)
    ]
    warnings = []
    if missing:
        warnings.append("Faltan anclas: " + ", ".join(missing))
    if forbidden:
        warnings.append("Aparecen frases prohibidas: " + ", ".join(forbidden))
    if malformed:
        warnings.append(f"{len(malformed)} líneas no usan un prefijo permitido")
    return {
        "automated_status": "review" if warnings else "candidate_pass",
        "missing_anchors": missing,
        "forbidden_matches": forbidden,
        "unprefixed_line_count": len(malformed),
        "warnings": warnings,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--corpus", required=True, type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--api-url", default=os.getenv("AURA_API_URL", DEFAULT_API_URL))
    parser.add_argument("--api-key", default=os.getenv("AURA_API_KEY") or os.getenv("API_KEY"))
    parser.add_argument("--runs", type=int, default=1)
    parser.add_argument(
        "--fresh-runs",
        action="store_true",
        help="Añade metadatos JPEG invisibles para evitar que las repeticiones usen caché.",
    )
    parser.add_argument("--case", action="append", dest="cases", help="ID o prefijo, por ejemplo F03")
    parser.add_argument("--timeout", type=int, default=330)
    parser.add_argument("--pdftoppm")
    parser.add_argument("--pdftotext")
    parser.add_argument("--skip-preflight", action="store_true")
    args = parser.parse_args()

    if not args.api_key and "aurapdf-one.vercel.app" not in args.api_url and os.isatty(0):
        args.api_key = getpass.getpass("AURA_API_KEY (entrada oculta): ").strip() or None

    pdftoppm = find_tool("pdftoppm", args.pdftoppm)
    pdftotext = args.pdftotext or shutil.which("pdftotext")
    selected = sorted(args.corpus.glob("*.pdf"))
    if args.cases:
        prefixes = tuple(value.upper() for value in args.cases)
        selected = [pdf for pdf in selected if pdf.stem.upper().startswith(prefixes)]
    if not selected:
        raise SystemExit("No se encontraron PDF para los filtros indicados.")
    if not args.skip_preflight:
        health = check_health(args.api_url, args.timeout)
        if health.get("status") != "ok":
            raise SystemExit(f"El backend no está saludable: {health}")

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    output = args.output or Path("test-results") / f"fidelity-{timestamp}.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    report: dict[str, object] = {
        "started_at": datetime.now(timezone.utc).isoformat(),
        "api_url": args.api_url,
        "corpus": str(args.corpus.resolve()),
        "runs_per_case": args.runs,
        "results": [],
    }

    with tempfile.TemporaryDirectory(prefix="aura-fidelity-") as temp_dir:
        temp = Path(temp_dir)
        for pdf in selected:
            case_id = pdf.stem.split("_", 1)[0].upper()
            image = temp / f"{pdf.stem}.jpg"
            render_page(pdf, image, pdftoppm)
            context = extract_text(pdf, pdftotext)
            for run_number in range(1, args.runs + 1):
                started = time.perf_counter()
                result: dict[str, object] = {
                    "case": case_id,
                    "file": pdf.name,
                    "run": run_number,
                }
                try:
                    nonce = f"aura-fidelity-{timestamp}-{run_number}" if args.fresh_runs else None
                    description = call_api(
                        args.api_url,
                        args.api_key,
                        image,
                        context,
                        args.timeout,
                        nonce,
                    )
                    result["duration_seconds"] = round(time.perf_counter() - started, 2)
                    result["description"] = description
                    result.update(automated_checks(case_id, description))
                except Exception as exc:  # keep the batch running and preserve evidence
                    result["duration_seconds"] = round(time.perf_counter() - started, 2)
                    result["automated_status"] = "error"
                    result["error"] = str(exc)
                report["results"].append(result)
                print(
                    f"{case_id} run {run_number}: {result['automated_status']} "
                    f"({result['duration_seconds']}s)",
                    flush=True,
                )
                output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    report["finished_at"] = datetime.now(timezone.utc).isoformat()
    results = report["results"]
    passed = sum(1 for r in results if r.get("automated_status") == "candidate_pass")
    errors = sum(1 for r in results if r.get("automated_status") == "error")
    durations = [r["duration_seconds"] for r in results if r.get("automated_status") != "error"]
    report["summary"] = {
        "total": len(results),
        "candidate_pass": passed,
        "errors": errors,
        "pass_rate": round(100 * passed / len(results), 1) if results else 0.0,
        "avg_seconds": round(sum(durations) / len(durations), 2) if durations else None,
        "max_seconds": max(durations) if durations else None,
    }
    print(
        f"Resumen automatico: {passed}/{len(results)} candidatos a aprobado "
        f"({report['summary']['pass_rate']}%), errores: {errors}, "
        f"promedio {report['summary']['avg_seconds']} s, maximo {report['summary']['max_seconds']} s"
    )
    print("Recuerda: 'candidate_pass' solo revisa anclas; confirma cada caso con la rubrica manual.")
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Reporte: {output.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
