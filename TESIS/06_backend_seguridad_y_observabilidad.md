# 6. Backend, seguridad, privacidad y observabilidad

Código: `fastapi_backend/main.py` (aplicación y endpoints), `config.py`, `cache.py`, `ratelimit.py`, `budget.py`, `logbus.py`, `tts.py`, `providers/`
y `api/*.js` (proxy). Arranque: `uvicorn fastapi_backend.main:app` desde la raíz del repositorio (o `uvicorn main:app` dentro de `fastapi_backend/`).

## 6.1 Endpoints

| Método y ruta | Autenticación | Para qué sirve |
|---|---|---|
| `GET /api/health` | ninguna | Confirma que FastAPI está vivo (no depende de Ollama) |
| `GET /api/ready` | ninguna | Indica si está listo y **con qué motor**: en `hybrid` devuelve `model`, `pipeline`, `provider`, `detector`, `fallback`, `cloud_pages_today` y `cloud_daily_limit`; en `v4/v3` exige que Ollama tenga el modelo (503 si no) |
| `POST /api/describe-image` | cabecera `x-api-key` | Analiza una página: `{image, context?}` → elementos (capítulo 04) |
| `GET /api/tts/status` | `x-api-key` | ¿Hay voz estadounidense del servidor? |
| `POST /api/tts` | `x-api-key` | Audio WAV de una frase en inglés (máx. 600 caracteres) |
| `GET /api/logs/stream?key=…` | `LOGS_STREAM_KEY` en la URL | Logs en vivo (Server-Sent Events) |
| `GET /api/logs/history?key=…&lines=N` | `LOGS_STREAM_KEY` en la URL | Historial persistente (hasta 5000 líneas) |

## 6.2 Controles de seguridad

| Control | Cómo funciona | Dónde |
|---|---|---|
| **Clave fuera del navegador** | El navegador llama a su mismo origen; la función de Vercel añade `x-api-key` desde `AURA_API_KEY` (variable privada). `VITE_API_KEY` solo se lee en desarrollo local (`import.meta.env.DEV`) | `api/describe-image.js`, `src/utils/ai.ts` |
| **Validación de la clave** | 401 si falta o es incorrecta; 503 si el servidor no tiene clave configurada (nunca queda abierto por omisión) | `main.py › verify_api_key` |
| **CORS restringido** | Solo `https://aurapdf-one.vercel.app` y `localhost` (5173, 3000); el flujo de producción es servidor a servidor, así que CORS solo afecta pruebas desde navegador | `main.py` |
| **Límite de tamaño** | 5 MB de imagen en el backend (413) y 8 MB de cuerpo en el proxy | `main.py`, `api/describe-image.js` |
| **Límite por persona** | Ventana deslizante de 60 s por IP (`AURA_RATE_LIMIT_PER_MIN`, 30 por defecto); la IP real llega en `x-aura-client-ip` porque Vercel sobrescribe `x-forwarded-for` y el visitante no puede falsificarla. Devuelve 429 con `Retry-After` | `ratelimit.py` |
| **Límite de la voz** | 300 frases por minuto por IP | `main.py` |
| **Una página a la vez en Ollama** | `asyncio.Lock`: evita agotar la VRAM | `main.py › ollama_lock` |
| **Tope diario de la nube** | `AURA_CLOUD_MAX_PAGES_PER_DAY`; al alcanzarlo se usa el respaldo local | `budget.py` |
| **Respuestas de error sin detalles internos** | Los fallos del proveedor se traducen a un mensaje claro; el detalle técnico va solo al log | `providers/base.py` |
| **Documento como dato no confiable** | El contenido y el texto auxiliar nunca se obedecen | `prompts.py`, capítulo 04 |
| **Secretos fuera de git** | `.env` está en `.gitignore`; el token de Cloudflare y las claves viven en `/workspace` del pod | `.gitignore`, `restaurar_pod.sh` |
| **Sin almacenamiento de documentos** | Solo una caché de respuestas en memoria (128 entradas) | `cache.py` |

## 6.3 Incidentes y deuda de seguridad (honestidad ante el evaluador)

1. **Clave de Gemini en código público.** Los primeros scripts contenían una clave de Google en texto plano. Se eliminaron los archivos y la clave debe considerarse comprometida; `docs/despliegue-seguro.md` indica cómo revocarla. **[VERIFICAR] que la revocación se haya hecho**: el repositorio solo registra la instrucción, no la confirmación.
2. **`API_KEY` expuesta en el bundle del navegador (prototipo intermedio).** Una clave compartida dentro del frontend no protege nada: el *runner* de pruebas reprodujo una petición válida con ella. Se corrigió con el proxy de Vercel. **[PENDIENTE] rotar `API_KEY`**, porque la antigua estuvo en el bundle público y `LOGS_STREAM_KEY` por defecto es la misma.
3. **Los logs reciben la clave por la URL** (limitación de `EventSource`, que no permite cabeceras). Queda registrada como riesgo; recomendación: usar una `LOGS_STREAM_KEY` distinta de `API_KEY`.
4. **Límite global ausente.** Hay límite por IP y tope diario de la nube, pero no un límite global de peticiones si el sitio se abre al público **[PENDIENTE]**. `docs/despliegue-seguro.md` recomienda además reglas de firewall en Vercel; CORS y `Origin` no deben tratarse como autenticación.
5. **Regla de Cloudflare no es una defensa suficiente:** bloqueó un cliente Python con HTTP 403/1010 pero aceptó la misma llamada con cabeceras normales de navegador.
6. **Clave del proveedor en la nube escrita en una conversación durante el desarrollo.** La guía de la demo (`docs/guion-demo-cimat.md`, «Después de la demo») pide revocarla y crear otra. **[PENDIENTE]** hasta que se confirme. Las claves reales solo deben vivir en `/tesis/.env` del pod (nunca en git ni en el chat).

## 6.4 Privacidad: a dónde viaja cada página según el modo

Esta tabla es la declaración de privacidad del sistema. **Debe acompañar a cualquier presentación o ficha del proyecto.**

| Modo | Imagen de la página | Texto nativo del PDF | Voz en inglés |
|---|---|---|---|
| `v4` / `v3` (solo Ollama) | Se procesa en el pod propio; **no sale** a terceros | Igual | Voz del navegador (el texto no sale) o Piper en el pod propio |
| `hybrid` | **Se envía al proveedor en la nube configurado** (Gemini, OpenAI o Claude) para leerla; Ollama en el pod solo detecta y respalda | **Se envía al proveedor** junto con la imagen, como contexto | Igual que arriba |
| `hybrid` con la nube caída o sin saldo | Se lee en el pod propio (respaldo) | No sale | Igual |

Notas:
- Lo que hace el proveedor con los datos depende de su política y de las condiciones de su API: **[VERIFICAR]** antes de afirmar cualquier cosa sobre retención o entrenamiento.
- AURA no guarda PDF ni imágenes; la caché conserva respuestas en memoria hasta reiniciar el backend. Los logs contienen tiempos, motor, clasificación, conteo de tokens y mensajes de error; **no** registran la imagen ni el texto de las páginas (solo, ante un error, los primeros 300 caracteres del mensaje que devuelve el proveedor).
- El PDF abierto se guarda **solo en el navegador del usuario** (IndexedDB) y se borra con **J**.
- El motor que atendió cada página es visible siempre: `GET /api/ready`, el panel «Detalle del análisis» y las líneas del log.

## 6.5 Observabilidad

`logbus.py` es el logger central (`aura`):
- **Terminal:** lo que ve quien opera el pod.
- **Memoria:** últimas 500 líneas.
- **En vivo:** `/api/logs/stream` (Server-Sent Events) para `public/debug.html` (`https://aurapdf-one.vercel.app/debug.html`: primer campo la URL del API, segundo la clave de logs).
- **Historial persistente:** archivo rotativo de 5 MB × 3 en `/workspace/aura/logs/backend.log` (sobrevive a reinicios del pod); `/api/logs/history` lo lee. Se activa solo cuando el servidor arranca de verdad (`lifespan`), para que importar el módulo desde las pruebas **nunca escriba en el historial de producción**.

Líneas típicas de una página en modo `hybrid` (formato real del código):

```
AURA lista. Motor: hybrid: openai (gpt-4.1-mini) + detector qwen2.5vl
Procesando pagina con hybrid: openai (gpt-4.1-mini) + detector qwen2.5vl...
Clasificacion: {'tabla': True, 'grafica': False, ... , 'columnas': 1}
Tokens openai (gpt-4.1-mini): entrada=6458, salida=307
Pagina procesada en 3.6 s con 12 elementos.
```

(Los números del ejemplo son ilustrativos del formato; las cifras medidas están en el capítulo 08.) Con v4, el log muestra en cambio `Clasificacion` y las llamadas
a Ollama; si la nube falla, aparece `La nube (openai) fallo: …` y `Se usa el respaldo local (Ollama, pipeline v4).`

## 6.6 Arranque, calentamiento y operación

- `lifespan` abre el historial, registra el motor y lanza **en segundo plano** el precalentamiento del modelo local (`AURA_WARMUP`) y la carga de la voz; ninguno puede tumbar el arranque.
- `scripts/correr_backend.sh` ejecuta `uvicorn` en un bucle: si el backend se detiene por un fallo, se reinicia en 2 s. Se detiene con `tmux kill-session -t backend`.
- `scripts/restaurar_pod.sh` restaura el servidor completo en un pod nuevo (capítulo 11). Termina con `LISTO` o con la lista de problemas.
- `scripts/smoke_demo.py` verifica de punta a punta por la URL pública (página actualizada, voz del servidor y 6 tipos de página).
- Sin clave de la nube, `GET /api/ready` informa `pipeline: v4`; con clave, `pipeline: hybrid` y `provider`.

## 6.7 Sin Ollama

`AURA_DETECTOR=off` y `AURA_FALLBACK=off` permiten operar el modo `hybrid` **sin GPU ni Ollama**. A cambio, si la nube falla o se queda sin cuota,
el usuario recibe un error en lugar de una lectura local. Es una opción de despliegue, no la configuración del proyecto.
