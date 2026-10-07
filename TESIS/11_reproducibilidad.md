# 11. Reproducibilidad

Este capítulo permite repetir lo que la tesis afirma. Todos los comandos se probaron con el código de la rama `main` (commit `9ddc001`, etiqueta `demo-cimat`).

## 11.1 Requisitos

| Para | Necesitas |
|---|---|
| Frontend | Node.js 18+ y npm |
| Backend | Python 3.10+ (`pip install -r fastapi_backend/requirements.txt`) |
| Modo local (v4/v3) o detector/respaldo | Ollama con `qwen2.5vl` y una GPU (≥ 24 GB de VRAM recomendados) |
| Modo `hybrid` | Una clave del proveedor en la nube (`GEMINI_API_KEY`, `OPENAI_API_KEY` o `ANTHROPIC_API_KEY`) en el `.env` del servidor (**nunca en git**) |
| *Runner* de fidelidad | *poppler* (`pdftoppm` y `pdftotext`) |
| Prueba de punta a punta | `pip install pymupdf` |

## 11.2 Ejecutar las pruebas automáticas (sin red ni claves)

Desde la raíz del repositorio:

```bash
python -m unittest fastapi_backend.test_prompt_policy fastapi_backend.test_cloud_pipeline fastapi_backend.test_api fastapi_backend.test_tts
npm install
npm test
```

Resultado esperado (verificado el 7/10/2026): backend `Ran 145 tests … OK (skipped=2)`; frontend `13 passed`, `139 passed`.

## 11.3 Ejecutar en una computadora local

```bash
git clone https://github.com/AdrianRosa21/tesis.git && cd tesis
cp .env.example .env          # edita API_KEY y, si usas hybrid, la clave del proveedor
ollama run qwen2.5vl:latest   # descarga el modelo; sal con /bye

# Backend
cd fastapi_backend && python -m venv venv && source venv/bin/activate    # en Windows: .\venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --port 3001 --reload

# Frontend (otra terminal, desde la raíz)
npm install && npm run dev      # http://localhost:5173
```

Para usar **solo Ollama** (sin enviar páginas a terceros): `AURA_PIPELINE=v4` en el `.env`, o simplemente no configurar ninguna clave de la nube (el backend cae a v4).
Verifica el modo con `curl http://localhost:3001/api/ready`.

## 11.4 Restaurar el servidor en un pod nuevo (RunPod)

Un pod nuevo es un contenedor limpio: solo persiste `/workspace`. Debe existir:

```
/workspace/aura/tesis.tar.gz          copia del proyecto (luego se actualiza con git pull)
/workspace/aura/ollama-models.tar     modelos de Ollama (≈ 5.6 GB)
/workspace/aura/secrets/cloudflare-token
/workspace/aura/tts/                  voz en inglés (se descarga sola si falta)
/workspace/tesis/.env                 claves (API_KEY, y la del proveedor si se usa hybrid)
```

Desde la terminal del pod:

```bash
curl -fsSL https://raw.githubusercontent.com/AdrianRosa21/tesis/main/scripts/restaurar_pod.sh -o /tmp/restaurar_pod.sh && bash /tmp/restaurar_pod.sh
```

El *script* (idempotente) ejecuta 9 pasos: paquetes, código, claves, Ollama y modelo, dependencias, **pruebas automáticas**, backend (con reinicio automático), túnel de
Cloudflare y resumen. Termina con `LISTO` o con la lista de problemas. En la restauración del 4/10/2026 tardó ≈ 75 s.

Comprobar:

```bash
curl -s http://127.0.0.1:3000/api/ready
curl -s https://api.aura4blinds.online/api/ready
```

Sin clave de la nube responde `{"status":"ready","model":"qwen2.5vl","pipeline":"v4"}`; con clave, `"pipeline":"hybrid"`, el `provider` y el `model` de la nube.

Acceso por SSH (solo quien opera el pod): la IP y el puerto cambian en cada encendido. Si el pod rechaza la llave, se agrega la llave pública a
`~/.ssh/authorized_keys` desde la terminal web del pod.

## 11.5 Prueba de punta a punta por la URL pública

```bash
pip install pymupdf
python scripts/smoke_demo.py
```

Comprueba: la página carga y es la versión actual; la voz estadounidense del servidor existe y genera audio; y 6 tipos de página (tabla, diagrama, gráfica sin valores, dos figuras,
escaneado y un examen de inglés con instrucciones en español). Termina con `LISTO PARA LA DEMO` o con lo que falla. Resultado del 4/10/2026: **10/10 bien, 0 avisos, 0 fallas, 40 s**.

## 11.6 Repetir la medición de fidelidad

```bash
# Corpus G (en el repositorio)
python scripts/run_fidelity_corpus.py --corpus corpus_extra --runs 2 --fresh-runs

# Corpus F (fuera del repositorio; colócalo en una carpeta y apúntala)
python scripts/run_fidelity_corpus.py --corpus /ruta/a/AURA_corpus_pruebas_PDF --runs 2 --fresh-runs
```

Opciones útiles: `--api-url` (por defecto `https://api.aura4blinds.online`), `--api-key` (o variable `AURA_API_KEY`/`API_KEY`; si falta, se pide con entrada oculta),
`--case F03` (un caso o prefijo) y `--skip-preflight`. El resultado se guarda en `test-results/fidelity-<fecha>.json` y el resumen se imprime en pantalla.

**Para la tabla A/B pendiente**, repetir con el mismo corpus cambiando solo `AURA_PIPELINE` en el `.env` del servidor y reiniciando el backend:

```bash
# En el pod: reiniciar el backend en UN solo comando y confirmar que responde
tmux kill-session -t backend; tmux new-session -d -s backend "bash /tesis/scripts/correr_backend.sh"; sleep 8; curl -s http://127.0.0.1:3000/api/ready
```

Luego calificar cada salida **a mano con la rúbrica** (capítulo 07); `candidate_pass` solo revisa anclas.

## 11.7 Ver los logs

| Dónde | Cómo |
|---|---|
| Visor web | `https://aurapdf-one.vercel.app/debug.html` → API `https://api.aura4blinds.online` y la clave de logs |
| Backend crudo en el pod | `tmux capture-pane -t backend -p -S -80` (en vivo: `tmux attach -t backend`; salir con `Ctrl+B` y luego `D`; **no** `Ctrl+C`) |
| Historial | `tail -f /workspace/aura/logs/backend.log` |
| ¿Ollama recorta el prompt? | `tmux capture-pane -t ollama -p \| grep -i truncat` |

## 11.8 Volver a una versión conocida

```bash
cd /tesis && git fetch --tags && git checkout demo-cimat    # versión probada para la demostración
git checkout pre-cloud-api                                  # antes del modo hybrid (solo Ollama)
```

## 11.9 Estructura del repositorio

```
src/                  frontend (React + TypeScript) y sus pruebas (*.test.ts[x])
api/                  funciones proxy de Vercel (describe-image.js, tts.js)
fastapi_backend/      backend: main, pipeline, prompts, schemas, normalize, providers/, config, cache, ratelimit, budget, logbus, tts, pruebas
scripts/              run_fidelity_corpus.py, smoke_demo.py, restaurar_pod.sh, correr_backend.sh, generate_extra_corpus.py, generate_api_key.py
corpus_extra/         G01–G15 y RESPUESTAS_ESPERADAS.md
corpus_real/          PDF públicos (R01…R13) y resultados/
test-results/         JSON de cada medición (evidencia cruda)
docs/                 fichas, resultados, guion de demo, despliegue seguro, análisis de arquitectura, PDF de demo
public/debug.html     visor de logs en vivo
TESIS/                esta tesis
CLAUDE.md             notas operativas del proyecto
```
