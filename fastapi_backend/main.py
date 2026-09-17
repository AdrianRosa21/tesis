import os
import hashlib
import asyncio
import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

# Cargar variables de entorno
load_dotenv(dotenv_path="../.env")

app = FastAPI(title="AURA - PDF Reader AI API")

# Configuración CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ImageRequest(BaseModel):
    image: str
    context: str | None = None

# Caché en memoria
image_cache = {}

# Candado (Lock) para procesar peticiones de una en una
ollama_lock = asyncio.Lock()

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "gemma3:4b")

# Límite de tamaño: 5 Megabytes (ajustable)
MAX_IMAGE_SIZE_MB = 5
MAX_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024

PROMPT = """Eres el motor de IA de un lector de PDF accesible (AURA). Tu tarea es analizar la imagen de la página y extraer TODO su contenido en orden de lectura lógico, separando el texto y las descripciones de imágenes en bloques.

REGLAS ESTRICTAS:
1. Extrae todo el texto visible palabra por palabra y ponle el prefijo [TEXTO]. Cada párrafo o línea importante debe ser un bloque separado.
2. Cuando encuentres una imagen, gráfico o tabla, descríbela detalladamente para un usuario ciego y ponle el prefijo [IMAGEN].
3. Si hay matemáticas, escríbelas con palabras en español (ej. "uno más uno"), nunca uses LaTeX ni símbolos raros.
4. NUNCA des saludos, ni pensamientos, ni explicaciones extra. SOLO devuelve los bloques.

Ejemplo de formato esperado:
[TEXTO] Nombre del proyecto: AURA
[TEXTO] Área: Tecnología
[IMAGEN] Fotografía de un joven trabajando en una laptop...
[TEXTO] Siguiente párrafo del documento..."""

@app.post("/api/describe-image")
async def describe_image(req: ImageRequest):
    if not req.image:
        raise HTTPException(status_code=400, detail="No image provided")
        
    # Limpiar prefijo base64 si existe
    base64_data = req.image.split(',')[1] if ',' in req.image else req.image
    
    # 1. VALIDACIÓN DE TAMAÑO
    # Calcular tamaño real aproximado en bytes a partir del base64 (3/4 de la longitud)
    image_bytes_size = (len(base64_data) * 3) / 4
    if image_bytes_size > MAX_BYTES:
        print(f"Rechazado: Imagen demasiado pesada ({image_bytes_size / (1024*1024):.2f} MB)")
        raise HTTPException(
            status_code=413, 
            detail=f"La imagen es muy pesada. Límite: {MAX_IMAGE_SIZE_MB}MB."
        )
    
    # 2. CACHÉ (Respuesta instantánea si ya procesamos esta imagen antes)
    img_hash = hashlib.sha256(base64_data.encode('utf-8')).hexdigest()
    if img_hash in image_cache:
        return {"success": True, "description": image_cache[img_hash]}
        
    payload = {
        "model": OLLAMA_MODEL,
        "messages": [
            {
                "role": "user",
                "content": PROMPT,
                "images": [base64_data]
            }
        ],
        "stream": False
    }
    
    # 3. COLA DE PETICIONES (Evitar que Ollama colapse con múltiples usuarios)
    # Solo una petición puede entrar a este bloque a la vez. Las demás hacen "fila" automáticamente.
    async with ollama_lock:
        print("Enviando imagen a Ollama... (Las demás peticiones están en espera)")
        try:
            # 4. TIMEOUT Y PETICIÓN ASÍNCRONA
            # Le damos a Ollama máximo 60 segundos para responder, sino soltamos la petición
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(f"{OLLAMA_BASE_URL}/api/chat", json=payload)
                response.raise_for_status()
                data = response.json()
                
                description = data.get("message", {}).get("content", "")
                
                # Guardar en caché el resultado exitoso
                image_cache[img_hash] = description
                return {"success": True, "description": description}
                
        except httpx.ReadTimeout:
            print("Error: Ollama tardó demasiado en responder.")
            raise HTTPException(status_code=504, detail="La IA está tardando mucho en procesar. Por favor, intenta de nuevo.")
        except Exception as e:
            print(f"Ollama API error: {e}")
            raise HTTPException(status_code=500, detail="Error interno al procesar la imagen con la IA.")
