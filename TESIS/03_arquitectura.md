# 3. Arquitectura del sistema

## 3.1 Vista general

AURA se divide en **tres capas** para que cada una haga una sola cosa: el navegador (ver y escuchar), un proxy (guardar el secreto) y un
servidor con GPU (pensar).

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ NAVEGADOR DEL USUARIO  (React 19 + Vite + TypeScript + pdfjs-dist)           │
│  • Renderiza la página (escala 3.0) y la reduce a JPEG de máx. 1600 px       │
│  • Extrae el texto nativo del PDF (solo como ayuda)                          │
│  • Lee los elementos en voz alta (Web Speech API) y se controla por teclado  │
└───────────────┬──────────────────────────────────────────────────────────────┘
                │ POST /api/describe-image   (sin claves en el navegador)
                ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ PROXY — Vercel Function  api/describe-image.js                               │
│  • Añade x-api-key (AURA_API_KEY, variable privada) y la IP real del usuario │
│  • Rechaza cuerpos > 8 MB · timeout 295 s (maxDuration 300)                  │
└───────────────┬──────────────────────────────────────────────────────────────┘
                │ HTTPS, servidor a servidor
                ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ TÚNEL — Cloudflare (api.aura4blinds.online)   ← corta cerca de los 100 s     │
└───────────────┬──────────────────────────────────────────────────────────────┘
                ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ POD EN RUNPOD (GPU)                                                          │
│  FastAPI (uvicorn :3000)                                                     │
│   1. Valida la clave  2. Límite por IP  3. Tope de 5 MB  4. Caché SHA-256    │
│   5. Pipeline: v3 | v4 | hybrid   6. Normaliza → elements                    │
│        │                                                                     │
│        ├── Ollama (:11434) + qwen2.5vl en la GPU  (candado: una página a la vez)
│        └── [solo modo hybrid] proveedor en la nube: Gemini | OpenAI | Claude │
│  Logs: memoria + SSE en vivo + archivo rotativo en /workspace/aura/logs      │
└──────────────────────────────────────────────────────────────────────────────┘
```

## 3.2 Componentes

| Capa | Archivos principales | Responsabilidad |
|---|---|---|
| Frontend | `src/pages/PdfReaderPage.tsx`, `src/hooks/usePdfDocument.ts`, `usePageAnalysis.ts`, `useSpeech.ts`, `useReadingNavigation.ts`, `src/utils/ai.ts` | Cargar el PDF, renderizar la página, llamar al análisis, partir los bloques largos, hablar y navegar |
| Proxy de análisis | `api/describe-image.js` | Poner la clave privada, limitar el tamaño, reenviar la IP real, traducir fallos de red a mensajes claros |
| Proxy de voz | `api/tts.js` | Igual, para la voz en inglés del servidor (texto máx. 8 KB, timeout 25 s) |
| Backend | `fastapi_backend/main.py` | Armar la aplicación y los endpoints (`/api/health`, `/api/ready`, `POST /api/describe-image`, `/api/tts`, `/api/logs/*`) |
| Pipeline | `pipeline.py`, `prompts.py`, `schemas.py`, `normalize.py` | Leer la página (v3, v4, hybrid) y convertirla en elementos |
| Proveedores | `providers/ollama.py`, `openai_chat.py`, `gemini.py`, `claude.py`, `base.py`, `http.py` | Una interfaz común para cada modelo |
| Soporte | `config.py`, `cache.py`, `ratelimit.py`, `budget.py`, `logbus.py`, `tts.py` | Configuración, caché, límites, tope diario, logs y voz del servidor |
| Pruebas y operación | `scripts/run_fidelity_corpus.py`, `smoke_demo.py`, `restaurar_pod.sh`, `correr_backend.sh`, `generate_extra_corpus.py` | Medir, verificar el despliegue y restaurar el pod |

## 3.3 Ciclo de vida de una página (tecla **F**)

1. El usuario presiona **F**. Si la página ya se analizó, solo se vuelve a leer; si no, `PdfReaderPage.handleRead` pide el análisis.
2. `usePdfDocument` ya renderizó la página a escala 3.0 como JPEG (calidad 0.95). `ai.ts › optimizeImage` la reduce a un ancho máximo de **1600 px** (JPEG 0.9) sobre fondo blanco.
3. El navegador envía `{image, context}` a `/api/describe-image` del **mismo origen** (sin secretos).
4. La función de Vercel agrega `x-api-key` y `x-aura-client-ip` y reenvía al backend por el túnel.
5. FastAPI valida la clave (401 si falta o es incorrecta), aplica el límite por IP (429 con `Retry-After`) y el tope de 5 MB (413).
6. Busca en la **caché** (SHA-256 de versión de prompt + motor + texto auxiliar + imagen). Si existe, responde al instante con `cached: true`.
7. Si no, ejecuta el *pipeline* (capítulo 04) y devuelve `description`, `elements`, `page_type`, `provider`, `model`, `detector`, `steps` y `processing_seconds`.
8. El frontend parte los bloques largos por línea y oración, asigna el idioma de cada unidad y empieza a leer.

## 3.4 Restricciones que dieron forma al diseño

| Restricción | Efecto en el diseño |
|---|---|
| La GPU tiene VRAM limitada | Candado `asyncio.Lock`: Ollama procesa una página a la vez (la nube no necesita candado) |
| Cloudflare corta cerca de 100 s | Presupuesto de **80 s** por página (`AURA_TIME_BUDGET_S`); el respaldo local solo se intenta si la nube falló antes del 30 % del presupuesto |
| Carga del modelo en pod frío ≈ 85 s | Precalentamiento al arrancar con el mismo `num_ctx` que las peticiones reales |
| La clave no puede estar en el navegador | Proxy en Vercel; `VITE_API_KEY` solo existe en desarrollo local |
| El pod se enciende por horas y se pierde todo menos `/workspace` | `scripts/restaurar_pod.sh` (idempotente, ~3 minutos) |
| Un lector de pantalla puede estar activo | Diseño autocontenido y `aria-hidden` en la región viva propia |
| El proveedor en la nube puede fallar o quedarse sin saldo | Respaldo automático a Ollama (v4) y tope diario de páginas |

## 3.5 Decisiones de diseño y alternativas descartadas

| Decisión | Alternativa | Por qué se eligió esta |
|---|---|---|
| **FastAPI + Python** para el backend | Node/Express o Flask | Python es el estándar de IA; FastAPI es asíncrono nativo, importante porque cada inferencia tarda segundos y el servidor debe seguir atendiendo |
| **Ollama + `qwen2.5vl`** como núcleo | Una API comercial como única opción | Modelo abierto, en GPU propia, sin enviar documentos a terceros en el modo local, costo fijo por hora |
| **Proxy de Vercel** | Clave en `VITE_*` | Una clave en el bundle público la puede copiar cualquiera (se demostró con el *runner*; ver capítulo 12) |
| **Un esquema JSON** como contrato | Texto libre con prefijos `[TEXTO]`/`[TABLA]` | En la línea base el modelo incumplía el formato con frecuencia y el frontend ocultaba el incumplimiento |
| **Caché LRU en memoria** | Base de datos | No se guardan los PDF: solo respuestas, acotadas a 128 entradas; se pierde al reiniciar |
| **Web Speech API** | TTS propio para todo | Sin costo ni servidor; solo el inglés tiene respaldo en el servidor (Piper) |
| **Modo `hybrid` opcional** | Cambiar todo a la nube | Se conserva el camino local como base de comparación y de respaldo |

## 3.6 Modos de IA y qué cambia en la arquitectura

| Modo (`AURA_PIPELINE`) | Quién lee la página | ¿Sale la página del servidor propio? | Ollama |
|---|---|---|---|
| `hybrid` | Un proveedor en la nube (`gemini`, `openai` o `anthropic`) con salida JSON estricta | **Sí**, al proveedor | Detecta el contenido en paralelo y es el respaldo si la nube falla |
| `v4` | Ollama: clasifica, extrae con reglas por tipo y completa lo visual | No | Todo el trabajo |
| `v3` | Ollama con un solo prompt (para comparación A/B) | No | Todo el trabajo |

Si se elige `hybrid` pero **no hay clave** del proveedor, el backend usa `v4` automáticamente (`Settings.effective_pipeline`): desplegar no
cambia nada hasta configurar la clave. Volver atrás: `AURA_PIPELINE=v4` y reiniciar (o la etiqueta de git `pre-cloud-api`).

La caché incluye el motor y el modelo en su clave, así que cambiar de modo **nunca** devuelve una respuesta de otro motor.

## 3.7 Variables de entorno importantes

(Valores completos y comentarios en `.env.example`; los secretos nunca van a git.)

| Variable | Valor por defecto | Para qué sirve |
|---|---|---|
| `API_KEY` / `AURA_API_KEY` | (secreto) | La misma cadena en el backend y en Vercel |
| `AURA_PIPELINE` | `hybrid` | Modo de lectura (`hybrid`, `v4`, `v3`) |
| `AURA_PROVIDER` | `gemini` (o el que tenga clave) | Proveedor en la nube |
| `AURA_DETECTOR`, `AURA_FALLBACK` | `ollama`, `ollama` | Detector y respaldo locales (`off` para apagarlos) |
| `AURA_DETECT_GRACE_S` | `1.5` | Segundos que se espera al detector tras la respuesta de la nube |
| `AURA_TIME_BUDGET_S` | `80` | Presupuesto por página (Cloudflare corta cerca de 100 s) |
| `AURA_CLOUD_MAX_PAGES_PER_DAY` | `0` (sin tope) | Tope diario de páginas enviadas a la nube |
| `AURA_RATE_LIMIT_PER_MIN` | `30` | Peticiones por minuto por persona |
| `OLLAMA_MODEL`, `OLLAMA_NUM_CTX`, `OLLAMA_KEEP_ALIVE` | `qwen2.5vl`, `16384`, `30m` | Modelo local y su contexto |
| `AURA_WARMUP` | `on` | Cargar el modelo local al arrancar |
| `MAX_IMAGE_SIZE_MB`, `MAX_CACHE_ENTRIES` | `5`, `128` | Límites de tamaño y de caché |
| `AURA_TTS*` | `on`, voz `en_US-lessac-medium` | Voz en inglés del servidor |

## 3.8 Topología de despliegue actual

| Pieza | Dónde | Notas |
|---|---|---|
| Frontend y funciones proxy | Vercel (`https://aurapdf-one.vercel.app`) | Variables privadas `AURA_BACKEND_URL` y `AURA_API_KEY` |
| Backend + Ollama | Pod de RunPod (GPU PRO 6000 MIG 24 GB, 8 vCPU, 47 GB de RAM, 30 GB de disco) | Sesiones `tmux`: `ollama`, `backend`, `tunnel` |
| Túnel | Cloudflare → `https://api.aura4blinds.online` | `cloudflared` con el token en `/workspace/aura/secrets/` |
| Persistencia | `/workspace/aura/` | `tesis.tar.gz`, `ollama-models.tar`, `secrets/`, `tts/`, `logs/` y `/workspace/tesis/.env` |

Costo de referencia: US$0.49 por hora de GPU encendida (`docs/ficha-evaluacion-cimat.md`, sección 7). El dominio cuesta US$1.18 al año; Vercel
(plan gratuito) y Cloudflare Tunnel no cuestan [VERIFICAR vigencia de precios].
