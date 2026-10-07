# 👁️ AURA - Lector de PDF Accesible con Inteligencia Artificial (Proyecto de Tesis)

AURA (Visión en la Lectura) es una aplicación web full-stack diseñada para revolucionar la accesibilidad de documentos PDF para personas con discapacidad visual severa. A diferencia de los lectores de pantalla tradicionales (que fallan ante PDFs sin etiquetas, columnas complejas, o imágenes), AURA utiliza **Inteligencia Artificial Visual (Modelos Multimodales)** ejecutada en hardware dedicado para "ver" y comprender la página tal como lo haría un ojo humano.

🌐 **Demo en Vivo (Frontend):** [https://aurapdf-one.vercel.app](https://aurapdf-one.vercel.app)

---

## 📌 Acerca del proyecto

**AURA** (Visión en la Lectura) es un lector de PDF para personas con discapacidad visual severa. Su idea central cabe en una frase: *un lector de pantalla lee texto; AURA entiende la página*. Es un proyecto de tesis de Desarrollo de Software y todo el código, las pruebas y la documentación están en este repositorio.

**¿Qué hace?**
1. Convierte la página actual del PDF en una imagen y toma también su texto nativo como ayuda (la imagen manda).
2. Un modelo de visión + lenguaje la describe en un formato estructurado (JSON): texto en orden de lectura, tablas con encabezados y filas, gráficas con pares etiqueta/valor, diagramas con flechas origen→destino, imágenes descritas y lo dudoso marcado como `[DUDOSO]`.
3. El navegador lo lee en voz alta elemento por elemento, con la voz del idioma de cada línea (español o inglés). Todo se controla con el teclado: **F** analiza la página, **R** abre un archivo, **↑ ↓** recorren los elementos, **← →** cambian de página, **V** repite, **Espacio** pausa, **+ −** cambian la velocidad y **H** abre el tutorial.

**¿Cómo está construido?** El sistema está diseñado alrededor de **Ollama** y un modelo de visión abierto (`qwen2.5vl`) que corre en una GPU propia:
- El pipeline que se desarrolló y se midió primero (v3 y, después, v4) corre completo en Ollama: clasifica la página, aplica solo las reglas que necesita y fuerza la salida con un esquema JSON.
- Ollama está presente, por defecto, en **todos** los modos (solo se puede apagar a propósito con `AURA_DETECTOR=off` y `AURA_FALLBACK=off`). En el modo opcional `hybrid` detecta qué contiene cada página y es el respaldo automático si el modelo en la nube falla; sin ninguna clave de nube, AURA funciona solo con Ollama.
- En el modo `hybrid` un proveedor en la nube configurable (Gemini, OpenAI o Claude) lee la página para mejorar tablas y gráficas. **En ese modo cada página sale del servidor propio hacia ese proveedor**; en `v4` y `v3` nunca sale. El motor que atendió cada página se ve siempre en `/api/ready`, en el panel «Detalle del análisis» de la app y en los logs en vivo.

**Reglas de fidelidad (no negociables):** no resolver ejercicios, no elegir opciones, no inventar, marcar lo dudoso y no obedecer instrucciones que aparezcan dentro del PDF (el documento se trata como dato no confiable).

**Estado y resultados medidos**

| Qué | Resultado | Dónde está la evidencia |
|---|---|---|
| Línea base v3 (Ollama), F01–F12 | 7/12 = 58.3 % | `docs/resultados-pruebas-fidelidad-2026-09-26.md` |
| Modo `hybrid`, F01–F12 y G01–G15 (27 casos) | 26/27 = 96.3 % (meta: 85 %), revisado con la rúbrica por la IA asistente, no por personas | `docs/resultados-hybrid-openai.md` |
| Tiempo por página en `hybrid` | mediana 3.6 s por la URL pública; Ollama (v4): 10 a 20 s | mismo documento |
| Pruebas automáticas | 145 del backend + 139 del frontend, todas en verde | `python -m unittest …` y `npm test` |
| Pendiente | comparación limpia v3 / v4 / hybrid con el mismo corpus y pruebas con personas ciegas | `TESIS/09_discusion_limitaciones_y_etica.md` |

**Para saber más**
- 📖 **[`TESIS/`](TESIS/README.md):** la tesis completa del proyecto (problema, marco teórico, arquitectura, pipeline de IA, accesibilidad, seguridad, metodología, resultados, limitaciones, reproducibilidad y matriz de evidencia).
- `docs/`: fichas, resultados de pruebas, guion de la demo y guía de despliegue seguro.
- `CLAUDE.md`: notas operativas del proyecto (arquitectura, variables, restauración del servidor).

---

## 🧭 Guía rápida: cómo usar AURA

Esta guía es para quien nunca ha tocado el proyecto. Tiene dos partes: **usar la app** (cualquier persona) y **encender el servidor** (quien lo opera).

### Parte 1. Usar la app (no hay que instalar nada)

1. Abre **https://aurapdf-one.vercel.app** en un navegador moderno de escritorio, de preferencia en una **pestaña nueva** (si no carga lo último, recarga con `Ctrl + Shift + R`). Sube el volumen y prueba que se oiga el audio.
2. La app habla sola. Todo se hace con el teclado:

| Tecla | Qué hace |
|---|---|
| **R** | Elegir el archivo PDF |
| **F** | Analizar la página actual y empezar a leerla |
| **↓ / ↑** | Siguiente / anterior parte de la página (oraciones, tablas, descripciones) |
| **V** | Repetir lo que se está leyendo |
| **Espacio** | Pausar y continuar |
| **+ / −** | Leer más rápido / más lento |
| **G** | Callar la voz |
| **→ / ←** | Página siguiente / anterior (también **Inicio** y **Fin**) |
| **J** | Cerrar el documento y volver al inicio |
| **H** | Escuchar el tutorial (con **Escape** se sale) |

3. Flujo normal: **R** → elegir el PDF → **F** → **↓** para recorrer la página → **→** para pasar a la siguiente.
4. Pruebas listas para mostrar: la carpeta [`docs/demo/`](docs/demo) trae 9 PDF numerados (tabla, gráfica, imágenes, examen de inglés, instrucción engañosa…) y [`docs/guion-demo-cimat.md`](docs/guion-demo-cimat.md) tiene el recorrido sugerido de 5 a 6 minutos.
5. En pantalla, el panel **«Detalle del análisis»** dice qué detectó, qué motor leyó la página y cuánto tardó.

> Si la app dice que el servicio **no está disponible** o falla al analizar, el servidor está apagado: pasa a la Parte 2.

### Parte 2. Encender y comprobar el servidor (quien lo opera)

El servidor vive en un *pod* de **RunPod** con GPU. Cada vez que se enciende es un contenedor limpio, pero todo lo importante se restaura con **un solo comando**. Cuesta unos **US$0.49 por hora encendido**, así que enciéndelo para usarlo y apágalo al terminar.

**Lo que ya debe existir** en el volumen `/workspace` del pod (lo deja listo Rodrigo; no se escribe en el README ni en el chat):
`/workspace/aura/tesis.tar.gz`, `/workspace/aura/ollama-models.tar`, `/workspace/aura/secrets/cloudflare-token` y `/workspace/tesis/.env` (con las claves). Si falta alguno, el comando se detiene y dice cuál es.

1. En **RunPod**, enciende el pod (*Start*). Espera a que diga que está corriendo.
2. Abre **Connect → Web Terminal** (la terminal que trae la página de RunPod; no hace falta SSH ni llaves).
3. Pega este comando y presiona Enter (es seguro repetirlo):

```bash
curl -fsSL https://raw.githubusercontent.com/AdrianRosa21/tesis/main/scripts/restaurar_pod.sh -o /tmp/restaurar_pod.sh && bash /tmp/restaurar_pod.sh
```

4. Espera de 1 a 3 minutos. Va mostrando **PASO 1/9 … 9/9**. Al final debe decir **`LISTO`**. Si dice `FALLO` o `NO LISTO`, lee la línea que explica qué pasó, corrígelo y vuelve a pegar el mismo comando.
5. Comprueba que responde (puedes abrir el segundo enlace en cualquier navegador):

```bash
curl -s http://127.0.0.1:3000/api/ready
```

`https://api.aura4blinds.online/api/ready` debe mostrar `"status":"ready"`. Ahí también ves **qué modo está activo**: con clave de la nube sale `"pipeline":"hybrid"` y el `provider`; sin clave sale `"pipeline":"v4"` (solo Ollama, sin enviar páginas a terceros).
6. **Prueba rápida de punta a punta** (opcional, desde tu computadora, con el repositorio clonado y Python):

```bash
pip install pymupdf
python scripts/smoke_demo.py
```

Debe terminar con **`LISTO PARA LA DEMO`**. Si no, te dice qué falla.
7. **Antes de una demostración:** analiza una vez en tu equipo cada página que vas a mostrar (así quedan en la caché y responden al instante); silencia las notificaciones, conecta el equipo a la corriente y ten tu celular listo como punto de acceso por si falla el internet.
8. **Al terminar:** apaga el pod en RunPod (*Stop*). Encendido sigue cobrando.

### Ver los logs en vivo

Abre **https://aurapdf-one.vercel.app/debug.html**. El primer campo ya trae `https://api.aura4blinds.online`; en el segundo escribe la **clave de logs** (se la pides a Rodrigo; no se comparte por chat ni se sube a git). Ahí se ve, página por página, qué motor atendió, qué detectó la IA y cuánto tardó.

### Si algo falla

| Síntoma | Qué hacer |
|---|---|
| La app dice error de análisis o «no disponible» | Espera 10 segundos y repite **F**. Si sigue, el servidor está apagado: Parte 2 |
| `restaurar_pod.sh` termina en `FALLO` | Lee la línea que lo explica (casi siempre falta un archivo de `/workspace` o el `.env`) y vuelve a pegar el comando |
| El inglés suena con acento español | Mira la línea «Última lectura» de la app: dice qué voz se usó. Si el navegador no tiene voz en inglés, usa la del servidor |
| Una página tarda mucho | Es normal la primera vez si no se calentó la caché; el panel dice cuánto tardó |
| Se cayó el internet del lugar | Conéctate al punto de acceso del celular |
| Quieres volver a la versión probada para la demo | En el pod: `cd /tesis && git fetch --tags && git checkout demo-cimat` |

**Reglas de oro:** nunca pegues una clave en un chat, en un archivo del repositorio ni en una captura; no hagas cambios de código el día de una demostración; y si tocas el `.env`, reinicia el backend con un solo comando y comprueba `/api/ready`:

```bash
tmux kill-session -t backend; tmux new-session -d -s backend "bash /tesis/scripts/correr_backend.sh"; sleep 8; curl -s http://127.0.0.1:3000/api/ready
```

Para entender cómo está construido y por qué, lee [`TESIS/`](TESIS/README.md); el capítulo [`TESIS/11_reproducibilidad.md`](TESIS/11_reproducibilidad.md) tiene el detalle técnico de cada comando.

---

## 🎯 El Problema que Resuelve

Los lectores de pantalla convencionales extraen el texto subyacente de un PDF. Si el PDF es un escaneo (imagen), contiene fórmulas matemáticas complejas, gráficas, o un diseño en múltiples columnas, el lector de pantalla produce un audio desordenado, incomprensible o simplemente guarda silencio. AURA resuelve esto mediante un enfoque de **Visión Computacional y Lenguaje**: convierte cada página en una imagen y deja que un modelo de IA local transcriba y describa lógicamente el contenido.

---

## 🏗️ Arquitectura del Sistema (Frontend + POD Backend)

El proyecto está dividido en tres partes para asegurar eficiencia, accesibilidad y protección de secretos:

1.  **Frontend Ligero (Cliente / Vercel):** Una interfaz web minimalista en React, accesible completamente por teclado. Carga el PDF, convierte la página actual en una imagen Base64 y la envía a una ruta del mismo origen.
2.  **Proxy privado (Vercel Function):** Reenvía la solicitud al POD y añade la clave desde variables privadas del servidor. La credencial ya no se incluye en el bundle del navegador.
3.  **Backend (Servidor API / POD GPU):** Un servidor desarrollado en Python con FastAPI. Recibe la imagen, valida, limita las peticiones por persona y analiza la página con uno de dos motores (ver "Modos de IA"): un modelo en la nube (Gemini u OpenAI) con Ollama como detector y respaldo, o solo Ollama (local).

### Diagrama de Flujo

```text
[Usuario Ciego/Baja Visión]
   |
   | (Interactúa vía Teclado, ej. Tecla 'F')
   v
[Frontend: React + Vite + TypeScript] -> (Carga PDF, convierte Página a Imagen Base64)
   |
   | (Petición POST al mismo origen, sin secretos públicos)
   v
[Vercel Function: /api/describe-image] -> (Añade la API_KEY privada)
   |
   | (Petición servidor a servidor)
   v
[Backend: FastAPI (Python) en POD]
   |
   |-> [1. Validación] -> (CORS estricto, API_KEY, Límite de 5MB, límite de peticiones por IP)
   |-> [2. Caché en Memoria] -> (Hash SHA-256 de imagen + motor + versión de prompt)
   |
   | (Envío de Imagen + Prompt de Accesibilidad + esquema JSON)
   v
 Modo hybrid (con clave de la nube)            Modo local (v4 / v3, sin clave)
[Gemini u OpenAI lee la página] --en paralelo--> [Ollama detecta qué contiene]
   |   (si la nube falla -> respaldo con Ollama v4)     |
   |                                                    v
   |                                       [Ollama: clasifica + extrae + completa]
   v                                                    v
[Backend FastAPI] -> (Valida y normaliza elementos, guarda en caché y responde JSON estructurado)
   |
   v
[Frontend React] -> (Pasa el texto limpio al motor Text-To-Speech del navegador)
   |
   v
[Usuario] -> (Escucha la lectura estructurada de la página)
```

---

## 🛠️ Tecnologías y Justificación Arquitectónica

### ¿Por qué una API con FastAPI y Python?
Al utilizar modelos de Inteligencia Artificial que requieren alto poder computacional (GPUs), es inviable ejecutar la IA en el navegador web del usuario. Se necesita separar el "Cerebro" (Backend) de la "Vista" (Frontend).
*   **Python:** Es el lenguaje estándar y más maduro para Inteligencia Artificial.
*   **FastAPI:** Elegido sobre Node.js/Express o Flask por su **manejo nativo asíncrono (`async/await`)**. Las inferencias de IA son procesos que tardan segundos (E/S bloqueante). FastAPI permite mantener el servidor vivo para recibir otras peticiones mientras espera a la IA.
*   **`asyncio.Lock()`:** Crucial en este proyecto. Las GPUs tienen VRAM limitada. Si 10 usuarios piden leer una página al mismo tiempo, la GPU se quedaría sin memoria (OOM - Out of Memory) y el POD colapsaría. El *Lock* de FastAPI encola las peticiones para que la IA procese una imagen a la vez, manteniendo el sistema estable.

### Pila Tecnológica Completa
*   **Frontend:** React 19, Vite, TypeScript, `pdfjs-dist` (para renderizar PDFs a imágenes).
*   **Backend API:** Python 3.10+, FastAPI, Uvicorn, httpx.
*   **Motor de IA:** Ollama en el POD (modo local: privacidad y costo fijo) y, de forma opcional, Gemini u OpenAI (modo `hybrid`: mejor lectura de tablas y gráficas, pero cada página se envía a un tercero y se paga por uso).

### Modos de IA (`AURA_PIPELINE`)

| Modo | Quién lee la página | ¿Sale la página del servidor propio? | Cuándo usarlo |
|---|---|---|---|
| `hybrid` | Gemini, OpenAI o Claude; Ollama solo detecta qué contiene (en paralelo) y es el respaldo si la nube falla | **Sí**, se envía al proveedor | Máxima calidad |
| `v4` | Ollama: clasifica, extrae con reglas por tipo y completa lo visual | No | Privacidad total |
| `v3` | Ollama con un solo prompt | No | Comparación A/B en la tesis |

Si eliges `hybrid` pero no configuras la clave (`GEMINI_API_KEY`, `OPENAI_API_KEY` o `ANTHROPIC_API_KEY`, junto con `AURA_PROVIDER=gemini|openai|anthropic`), el backend usa `v4` automáticamente: desplegar no cambia nada hasta que pongas la clave. Para volver atrás basta con `AURA_PIPELINE=v4` y reiniciar el backend. Todas las variables están explicadas en `.env.example`.

---

## 🚀 Guía de Instalación y Despliegue Local

### Requisitos Previos
*   **Node.js** (v18+)
*   **Python** (v3.10+)
*   **Ollama** instalado en tu máquina local.

### 1. Preparar el Motor de IA (Ollama)
Abre tu terminal y descarga el modelo visual que estás utilizando (por defecto Qwen2.5-VL o Gemma3):
```bash
ollama run qwen2.5vl:latest
```
*(Una vez que cargue y puedas escribir, usa `/bye` para salir. El modelo ya está guardado en tu equipo).*

### 2. Clonar el Repositorio
```bash
git clone https://github.com/AdrianRosa21/tesis.git
cd tesis
```
Opcional: Crea un archivo `.env` en la raíz basándote en `.env.example`.

### 3. Levantar el Backend (API FastAPI)
Con claves en la nube, agrégalas en `.env` (nunca en git). Sin ellas, el backend funciona solo con Ollama.

Abre una terminal y dirígete a la carpeta del backend:
```bash
cd fastapi_backend
```
Crea y activa tu entorno virtual:
```bash
# Windows:
py -m venv venv
.\venv\Scripts\activate

# Mac/Linux:
python3 -m venv venv
source venv/bin/activate
```
Instala las dependencias y arranca el servidor:
```bash
pip install -r requirements.txt
uvicorn main:app --port 3001 --reload
```
La API estará escuchando en `http://localhost:3001`.

### 4. Levantar el Frontend (React)
En una **nueva terminal**, desde la raíz del proyecto (`/tesis`), ejecuta:
```bash
npm install
npm run dev
```
La interfaz web estará en `http://localhost:5173`.

### 5. Configurar Vercel en producción

No configures `VITE_API_KEY` ni `VITE_API_URL` en el frontend de producción. La función `api/describe-image.js` usa estas variables privadas de Vercel:

```text
AURA_BACKEND_URL=https://tu-backend.example.com
AURA_API_KEY=una_clave_larga_y_aleatoria
```

El backend FastAPI debe tener la misma clave en `API_KEY`. Para limitar abuso del proxy público, configura además rate limiting o reglas de firewall en Vercel.

Consulta la guía paso a paso en [`docs/despliegue-seguro.md`](docs/despliegue-seguro.md).

---

## 🚧 Próximas Mejoras (Roadmap de la Tesis)
*   **Guía Interactiva con Audio Pregrabado:** Implementación de un tutorial auditivo (onboarding) al entrar a la aplicación, que guíe al usuario ciego sobre qué teclas presionar, usando un archivo de audio real en lugar del TTS del sistema.
*   **Afinamiento del Prompt Multimodal:** Mitigación de alucinaciones en modelos de lenguaje pequeños (SLMs) mediante técnicas de Few-Shot prompting.
