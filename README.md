# 👁️ AURA - Lector de PDF Accesible con Inteligencia Artificial (Proyecto de Tesis)

AURA (Visión en la Lectura) es una aplicación web full-stack diseñada para revolucionar la accesibilidad de documentos PDF para personas con discapacidad visual severa. A diferencia de los lectores de pantalla tradicionales (que fallan ante PDFs sin etiquetas, columnas complejas, o imágenes), AURA utiliza **Inteligencia Artificial Visual (Modelos Multimodales)** ejecutada en hardware dedicado para "ver" y comprender la página tal como lo haría un ojo humano.

🌐 **Demo en Vivo (Frontend):** [https://aurapdf-one.vercel.app](https://aurapdf-one.vercel.app)

---

## 🎯 El Problema que Resuelve

Los lectores de pantalla convencionales extraen el texto subyacente de un PDF. Si el PDF es un escaneo (imagen), contiene fórmulas matemáticas complejas, gráficas, o un diseño en múltiples columnas, el lector de pantalla produce un audio desordenado, incomprensible o simplemente guarda silencio. AURA resuelve esto mediante un enfoque de **Visión Computacional y Lenguaje**: convierte cada página en una imagen y deja que un modelo de IA local transcriba y describa lógicamente el contenido.

---

## 🏗️ Arquitectura del Sistema (Frontend + POD Backend)

El proyecto está dividido en dos partes principales para asegurar eficiencia y accesibilidad universal:

1.  **Frontend Ligero (Cliente / Vercel):** Una interfaz web minimalista en React, accesible completamente por teclado. Su trabajo es cargar el PDF, convertir la página actual en una imagen Base64 y enviarla al servidor.
2.  **Backend Pesado (Servidor API / POD GPU):** Un servidor desarrollado en Python con FastAPI. Recibe la imagen, gestiona la cola de peticiones y se comunica con un motor de IA local (Ollama) para realizar la inferencia multimodal.

### Diagrama de Flujo

```text
[Usuario Ciego/Baja Visión]
   |
   | (Interactúa vía Teclado, ej. Tecla 'F')
   v
[Frontend: React + Vite + TypeScript] -> (Carga PDF, convierte Página a Imagen Base64)
   |
   | (Petición POST Segura a la API con Headers y Payload Base64)
   v
[Backend: FastAPI (Python) en POD]
   |
   |-> [1. Validación] -> (CORS estricto, API_KEY, Límite de 5MB)
   |-> [2. Caché en Memoria] -> (Verifica Hash SHA-256 de la imagen. Si existe, no reprocesa)
   |-> [3. Bloqueo Asíncrono] -> (asyncio.Lock() para encolar peticiones y no saturar la GPU)
   |
   | (Envío de Imagen + Prompt de Accesibilidad)
   v
[Motor IA: Ollama (Local/POD)] -> [Modelo Multimodal: Qwen2.5-VL / Gemma3]
   |
   | (Analiza píxeles, entiende layout, describe imágenes y matemáticas)
   v
[Backend FastAPI] -> (Recibe texto, limpia Markdown, guarda en Caché, responde HTTP 200)
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
*   **Motor de IA:** Ollama (ejecución local sin depender de APIs de terceros como OpenAI, garantizando privacidad y control de costos fijos en el POD).

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

---

## 🚧 Próximas Mejoras (Roadmap de la Tesis)
*   **Guía Interactiva con Audio Pregrabado:** Implementación de un tutorial auditivo (onboarding) al entrar a la aplicación, que guíe al usuario ciego sobre qué teclas presionar, usando un archivo de audio real en lugar del TTS del sistema.
*   **Afinamiento del Prompt Multimodal:** Mitigación de alucinaciones en modelos de lenguaje pequeños (SLMs) mediante técnicas de Few-Shot prompting.
