# 👁️ AURA - Lector de PDF Accesible con Inteligencia Artificial (Proyecto de Tesis)

AURA es una aplicación web full-stack diseñada de principio a fin para asistir a usuarios con discapacidad visual o problemas de lectura severos. A diferencia de los lectores de pantalla tradicionales que se confunden con el diseño visual de un PDF, AURA utiliza **Inteligencia Artificial Visual (Multimodal)** ejecutada localmente para "ver" la página, comprender su estructura lógica, transcribir el texto de forma coherente y describir elementos no textuales (imágenes, logotipos, tablas o fórmulas matemáticas). Todo esto mientras mantiene la privacidad del usuario procesando la información sin depender exclusivamente de nubes de terceros pagas.

---

## 🌟 Características Principales

*   **Análisis Multimodal:** No extrae simplemente texto subyacente; convierte la página entera a una imagen y deja que la IA vea el documento tal como lo haría un ojo humano.
*   **Descripciones Contextuales:** Detecta imágenes y genera una descripción detallada en texto plano para que el sintetizador de voz se la lea al usuario.
*   **Accesibilidad Total:** Interfaz diseñada para ser navegable íntegramente mediante atajos de teclado (ej. tecla `F` para leer).
*   **Optimización de Recursos (Backend):** Implementa un sistema de bloqueo asíncrono (Lock) y caché en memoria para no saturar la máquina local si el usuario presiona el botón varias veces.
*   **Seguridad:** API Key y políticas CORS restrictivas para evitar accesos no autorizados al backend.

---

## 🏗️ Arquitectura del Sistema

*Nota para generación de diagramas: El siguiente texto está estructurado para que una IA genere el diagrama.*

### Estructura Textual para Generar Diagrama de Arquitectura
```text
(Genera un diagrama de flujo arquitectónico vertical u horizontal con los siguientes componentes y pasos)

[Usuario Ciego/Baja Visión]
   |
   | (Interactúa vía Teclado/Voz)
   v
[Frontend: React + Vite + TypeScript] -> (Carga PDF y convierte Página a Imagen Base64)
   |
   | (Petición POST Segura con Headers: API_KEY y Payload: Imagen Base64)
   v
[Backend: FastAPI (Python)]
   |
   |-> [Paso 1: Validación] -> (Chequeo de CORS, API_KEY y Tamaño de Imagen < 5MB)
   |-> [Paso 2: Caché] -> (Calcula Hash SHA-256. Si existe, responde rápido; si no, avanza)
   |-> [Paso 3: Cola de Peticiones] -> (Candado Asíncrono 'asyncio.Lock()' para evitar saturación de GPU)
   |
   | (Envía Imagen Base64 + Prompt Estricto)
   v
[Motor IA: Ollama (Local)] -> [Modelo: gemma3:4b (Vision Language Model)]
   |
   | (Analiza píxeles, extrae texto, describe imágenes)
   | (Devuelve JSON con descripción)
   v
[Backend: FastAPI (Python)] -> (Guarda en Caché y envía respuesta HTTP 200)
   |
   | (Respuesta de Texto Estructurado)
   v
[Frontend: React]
   |
   | (Inicia motor Text-To-Speech)
   v
[Usuario Ciego/Baja Visión] -> (Escucha el contenido lógico del documento)
```

---

## 🛠️ Tecnologías Utilizadas

### 1. Capa de Presentación (Frontend)
*   **React 19 & Vite:** Proporcionan un entorno de desarrollo ultrarrápido y una interfaz reactiva.
*   **TypeScript:** Garantiza tipado estático, reduciendo errores durante el desarrollo.
*   **pdfjs-dist:** Herramienta clave de Mozilla para renderizar y transformar páginas de documentos PDF directamente en el navegador del cliente.

### 2. Capa de Negocio (Backend)
*   **Python 3.10+ & FastAPI:** Framework moderno y de altísimo rendimiento para APIs en Python. Elegido por su soporte nativo asíncrono (`async`/`await`), crucial para gestionar los largos tiempos de espera de la IA sin bloquear el servidor.
*   **Uvicorn:** Servidor ASGI para poner en marcha FastAPI.
*   **Manejo de Estados Internos:** Uso de diccionarios en memoria para el *Caché* (evita que la IA procese la misma página dos veces) y `asyncio.Lock()` para crear un *embudo seguro* (gestiona el encolamiento de inferencias en la GPU).

### 3. Capa de Inteligencia Artificial (Motor)
*   **Ollama:** Orquestador de Modelos de Lenguaje Locales. Permite ejecutar modelos pesados en hardware doméstico o servidores dedicados.
*   **Gemma 3 (gemma3:4b) / Qwen:** Modelos multimodales de tipo VLM (Vision Language Model) encargados de "ver" y transcribir el documento.

---

## 🗂️ Estructura del Proyecto

```text
/tesis
 ├── /fastapi_backend          # [NUEVO] Backend de Producción en Python
 │    ├── main.py              # Lógica principal, rutas, caché, bloqueos asíncronos
 │    ├── requirements.txt     # Dependencias de Python
 │    └── /venv                # Entorno virtual de Python (ignorado en git)
 ├── /src                      # Código fuente del Frontend (React)
 ├── /public                   # Archivos estáticos
 ├── server.js                 # [LEGACY] Backend antiguo en Express/Node
 ├── package.json              # Dependencias del Frontend
 ├── vite.config.ts            # Configuración de compilación Vite
 └── README.md                 # Documentación del proyecto
```

---

## 🚀 Guía de Instalación y Despliegue Local

### Requisitos Previos
*   **Node.js** (v18+)
*   **Python** (v3.10+ recomendado 3.12)
*   **Ollama** instalado en tu sistema.
*   **Git**

### PASO 1: Descargar el modelo de IA (Ollama)
Abre una terminal y descarga el modelo visual:
```bash
ollama run gemma3:4b
```
*Tip: Una vez descargado, puedes escribir `/bye` para salir. El modelo se queda guardado y listo.*

### PASO 2: Configuración del Repositorio
Clona el repositorio:
```bash
git clone https://github.com/AdrianRosa21/tesis.git
cd tesis
```
Crea un archivo llamado `.env` en la raíz (junto a `package.json`) para variables de entorno (Opcional si usas los defaults del backend):
```env
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=gemma3:4b
```

### PASO 3: Levantar el Frontend (React)
En la carpeta raíz del proyecto, ejecuta:
```bash
npm install
npm run dev
```
👉 El Frontend correrá en `http://localhost:5173`.

### PASO 4: Levantar el Backend (FastAPI)
Abre una **NUEVA terminal** y navega a la carpeta del backend de Python:
```bash
cd fastapi_backend
```

Crea y activa un entorno virtual:
```bash
# En Windows:
py -m venv venv
.\venv\Scripts\activate

# En Mac/Linux:
python3 -m venv venv
source venv/bin/activate
```

Instala las dependencias y corre el servidor:
```bash
pip install -r requirements.txt
uvicorn main:app --port 3001 --reload
```
👉 El Backend correrá en `http://localhost:3001`.

---

## 🎮 Cómo Usar la Plataforma

Con **Ollama**, **Frontend** y **Backend** encendidos:
1. Abre tu navegador en `http://localhost:5173`.
2. Sube cualquier archivo PDF.
3. Presiona la **Tecla F**.
4. El sistema tomará una 'foto' de la página, la enviará al backend, se encolará si hay mucho tráfico, será procesada por el modelo `gemma3:4b`, y en unos segundos escucharás la transcripción completa e inteligente de la página.

---
*AURA: Dando voz a las palabras y visión a quienes no pueden verlas.*
