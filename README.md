# Proyecto de Tesis

Este proyecto consiste en una aplicación web dividida en un **Frontend** (construido con React, TypeScript y Vite) y un **Backend** (desarrollado con Node.js y Express) que se integra con modelos de Inteligencia Artificial (como Groq, Ollama y Gemini) para el procesamiento de archivos PDF e imágenes.

## Requisitos Previos

Asegúrate de tener instalados los siguientes programas en tu entorno de desarrollo:

- [Node.js](https://nodejs.org/) (versión 18 o superior recomendada)
- [npm](https://www.npmjs.com/) (generalmente se instala junto a Node.js)
- [Git](https://git-scm.com/)

## Instalación

1. **Clonar el repositorio**
   ```bash
   git clone https://github.com/AdrianRosa21/tesis.git
   cd tesis
   ```

2. **Instalar dependencias**
   Dentro de la carpeta del proyecto, instala todas las dependencias necesarias de npm:
   ```bash
   npm install
   ```

## Configuración de Variables de Entorno

El proyecto requiere ciertas configuraciones externas, como claves de API o puertos, que deben declararse en un archivo `.env` en la raíz del proyecto.

1. En la raíz del repositorio, busca el archivo `.env.example`.
2. Duplica este archivo y nómbralo **`.env`** (o renómbralo si lo prefieres, pero asegúrate de mantener el `.env.example` en el control de versiones).
3. Configura los valores dentro del archivo `.env` de acuerdo a tus credenciales locales o de producción:

```env
# Ejemplo de configuración (.env)
AI_PROVIDER=groq
GROQ_API_KEY=tu_api_key_de_groq_aqui
GROQ_MODEL=qwen/qwen3.6-27b
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen3-vl:4b
PORT=3001
```

> **Nota:** El archivo `.env` está ignorado en git (`.gitignore`), por lo que no correrás el riesgo de subir tus credenciales públicas.

## Ejecución del Proyecto

El proyecto requiere que tanto el servidor backend como el servidor de desarrollo del frontend estén en ejecución. El archivo `package.json` ya tiene los comandos preconfigurados.

Abre **dos terminales** en la raíz del proyecto para ejecutar cada servicio simultáneamente:

### 1. Iniciar el Backend (Servidor Node.js)
En la primera terminal, ejecuta:
```bash
npm run server
```
Deberías ver un mensaje indicando que el servidor backend está corriendo en el puerto configurado (por ejemplo, `Backend server running on port 3001`).

### 2. Iniciar el Frontend (Vite)
En la segunda terminal, ejecuta:
```bash
npm run dev
```
Deberías ver un mensaje de Vite confirmando que la aplicación frontend está corriendo localmente, normalmente en `http://localhost:5173/`.

---

¡Y eso es todo! Accede a la URL local del frontend desde tu navegador para comenzar a utilizar la aplicación.
