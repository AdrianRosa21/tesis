# AURA - Lector de PDF Accesible con Inteligencia Artificial (Tesis)

AURA es una aplicación web full-stack diseñada para leer documentos PDF a usuarios con discapacidad visual o problemas de lectura. Utiliza **Inteligencia Artificial Visual** ejecutada localmente para analizar el diseño estructural de las páginas, transcribir el texto lógicamente y describir imágenes, tablas y matemáticas sin depender de lectores de pantalla tradicionales limitados.

## 🏗️ Arquitectura del Sistema

El proyecto consta de 3 capas principales:
1. **Frontend (React + TypeScript + Vite):** Interfaz de usuario accesible que renderiza el PDF y procesa el Texto-a-Voz (TTS). Corre en el puerto `5173`.
2. **Backend (Python + FastAPI):** Motor asíncrono que recibe las imágenes del PDF, gestiona colas de peticiones para no saturar el servidor, y se comunica con la IA. Corre en el puerto `3001`.
3. **Motor de IA (Ollama):** Ejecución local del modelo visual `gemma3:4b` mediante aceleración por GPU.

---

## ⚙️ Requisitos Previos

Asegúrate de tener instalados los siguientes programas en tu entorno de desarrollo:

- **[Node.js](https://nodejs.org/)** (v18 o superior)
- **[Python](https://www.python.org/)** (v3.12 recomendada)
- **[Ollama](https://ollama.com/)** (Para correr la IA localmente)
- **Git**

---

## 🚀 Instalación y Configuración (Paso a Paso)

### PASO 1: Descargar el modelo de IA (Ollama)
AURA utiliza el modelo visual de Google (Gemma 3). Primero, abre una terminal cualquiera y asegúrate de descargar el modelo en tu computadora:
```bash
ollama run gemma3:4b
```
*(Una vez que descargue y te permita chatear en la consola, puedes cerrarla escribiendo `/bye`. El modelo ya quedó guardado en tu disco duro).*

### PASO 2: Clonar el Repositorio
```bash
git clone https://github.com/AdrianRosa21/tesis.git
cd tesis
```

### PASO 3: Configurar Variables de Entorno
Crea un archivo llamado `.env` en la carpeta raíz del proyecto (junto a `package.json`) y copia esta configuración:
```env
# Configuración para usar Ollama localmente
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=gemma3:4b
```

### PASO 4: Levantar el Frontend (React)
Abre una terminal en la raíz del proyecto (`tesis/`) e instala las dependencias de Node:
```bash
npm install
```
Luego, arranca el servidor de desarrollo del Frontend:
```bash
npm run dev
```
👉 *El Frontend ahora está vivo en `http://localhost:5173`.*

### PASO 5: Levantar el Backend de Producción (FastAPI)
Abre una **segunda terminal** y navega a la nueva carpeta del backend en Python:
```bash
cd fastapi_backend
```

Crea un Entorno Virtual de Python (para aislar las dependencias y evitar errores del sistema):
```bash
# En Windows:
py -3.12 -m venv venv
# (Si usas Mac/Linux, usa: python3 -m venv venv)
```

Activa el entorno virtual:
```bash
# En Windows:
.\venv\Scripts\activate
# (Si usas Mac/Linux, usa: source venv/bin/activate)
```

Instala las librerías necesarias (FastAPI, Uvicorn, etc):
```bash
pip install -r requirements.txt
```

Arranca el servidor Backend:
```bash
uvicorn main:app --port 3001 --reload
```
👉 *El Backend ahora está vivo y escuchando en `http://localhost:3001`.*

---

## 🎮 Cómo usar AURA

Una vez que tengas **Ollama corriendo de fondo**, el **Frontend (5173)** y el **Backend (3001)** encendidos:

1. Entra a `http://localhost:5173` en tu navegador.
2. Sube un archivo PDF.
3. Utiliza los siguientes comandos de teclado (Accesibilidad total):
   - **Tecla F:** Analizar y leer la página actual. (Escucharás el mensaje *"Analizando la página con IA..."* mientras el Backend procesa la imagen).
   - **Flecha Derecha / Izquierda:** Cambiar de página del PDF.
   - **Flecha Abajo / Arriba:** Navegar entre los diferentes bloques de texto e imágenes (con feedback cuando llegas al "Fin de la página").
   - **Tecla Espacio:** Pausar o Continuar la lectura por voz.
   - **Tecla G:** Detener la lectura por completo.

## 🛠️ Notas de Producción
Este repositorio contiene lógica lista para escalar:
* **Cola de peticiones segura:** El backend en `main.py` contiene un `asyncio.Lock()` que asegura que si múltiples usuarios hacen solicitudes al mismo tiempo, la IA de Ollama (GPU) procesará las peticiones una por una sin crashear.
* **Validación de peso:** FastAPI rechaza cualquier imagen escaneada que supere los 5MB en base64 para evitar el desbordamiento de memoria RAM.
* **Timeouts controlados:** Si el modelo visual tarda más de 60 segundos, FastAPI cancela la conexión y devuelve un error limpio 504 al usuario.

## ?? Despliegue en Producci�n (API en PC con GPU y Frontend Web)

Si deseas hostear la API en una computadora con GPU (para procesar los PDFs r�pidamente) y el Frontend en un servicio web, sigue estos pasos:

### 1. Configurar la PC con GPU (Servidor Backend)
1. Clona este repositorio en esa computadora.
2. Instala Python, Node.js y Ollama.
3. Aseg�rate de tener el modelo descargado: ollama run gemma3:4b
4. Levanta el backend de FastAPI usando los pasos del **PASO 5**.
5. Exponer el puerto 3001 a Internet:
   - Puedes comprar un dominio y usar **Cloudflare Tunnels** o **Ngrok** para apuntar ese dominio (ej. pi.midominio.com) hacia el localhost:3001 de la computadora con GPU.
   - O bien, abre el puerto en tu m�dem y usa un DDNS (No-IP/DuckDNS).

### 2. Configurar el Frontend (Servidor Web)
El frontend de Vite ya est� configurado para leer la variable de entorno VITE_API_URL.
1. En tu servicio de hosting (Vercel, Netlify, Firebase Hosting, etc.), crea un nuevo proyecto apuntando a este repositorio de GitHub.
2. En las configuraciones del proyecto (Environment Variables), agrega lo siguiente:
   - Clave: VITE_API_URL
   - Valor: https://api.midominio.com (la URL p�blica que configuraste en el paso anterior).
3. Despliega el proyecto. El Frontend ahora se comunicar� con la PC que tiene la GPU para procesar los PDFs.

