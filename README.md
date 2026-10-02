# 👁️ AURA - Lector de PDF Accesible con Inteligencia Artificial (Proyecto de Tesis)

AURA (Visión en la Lectura) es una aplicación web full-stack diseñada para revolucionar la accesibilidad de documentos PDF para personas con discapacidad visual severa. A diferencia de los lectores de pantalla tradicionales (que fallan ante PDFs sin etiquetas, columnas complejas, o imágenes), AURA utiliza **Inteligencia Artificial Visual (Modelos Multimodales)** ejecutada en hardware dedicado para "ver" y comprender la página tal como lo haría un ojo humano.

🌐 **Demo en Vivo (Frontend):** [https://aurapdf-one.vercel.app](https://aurapdf-one.vercel.app)

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
| `hybrid` | Gemini u OpenAI; Ollama solo detecta qué contiene (en paralelo) y es el respaldo si la nube falla | **Sí**, se envía al proveedor | Máxima calidad |
| `v4` | Ollama: clasifica, extrae con reglas por tipo y completa lo visual | No | Privacidad total |
| `v3` | Ollama con un solo prompt | No | Comparación A/B en la tesis |

Si eliges `hybrid` pero no configuras la clave (`GEMINI_API_KEY` u `OPENAI_API_KEY`), el backend usa `v4` automáticamente: desplegar no cambia nada hasta que pongas la clave. Para volver atrás basta con `AURA_PIPELINE=v4` y reiniciar el backend. Todas las variables están explicadas en `.env.example`.

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
