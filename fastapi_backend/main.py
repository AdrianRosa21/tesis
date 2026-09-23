import os
import hashlib
import asyncio
import httpx
from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

# Cargar variables de entorno
load_dotenv(dotenv_path="../.env")

app = FastAPI(title="AURA - PDF Reader AI API")

# 1. SEGURIDAD: Configuración CORS Estricta (Solo permite peticiones desde tu Vercel y localhost)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://aurapdf-one.vercel.app",
        "http://localhost:5173",
        "http://localhost:3000"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 2. SEGURIDAD: API Key para evitar que usen tu backend desde Postman o scripts
API_KEY_SECRET = os.getenv("API_KEY", "aura-tesis-secreto-2026")

async def verify_api_key(x_api_key: str = Header(None)):
    if x_api_key != API_KEY_SECRET:
        raise HTTPException(status_code=401, detail="Acceso denegado. API Key inválida.")

class ImageRequest(BaseModel):
    image: str
    context: str | None = None

# Caché en memoria
image_cache = {}

# Candado (Lock) para procesar peticiones de una en una
ollama_lock = asyncio.Lock()

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = "qwen2.5vl"  # Tag oficial en Ollama

# Límite de tamaño: 5 Megabytes (ajustable)
MAX_IMAGE_SIZE_MB = 5
MAX_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024

PROMPT = """Actúa como un lector de pantalla de accesibilidad para personas con discapacidad visual.

REGLAS ESTRICTAS PARA MATEMÁTICAS Y GRÁFICAS:
1. NUNCA USES LATEX ni símbolos raros. Si ves fracciones, escríbelas con palabras.
   - Ejemplo MAL: x = \frac{1}{2}
   - Ejemplo BIEN: x es igual a un medio.
   - Ejemplo MAL: (x+4)^2 + (y-3)^2 = 4
   - Ejemplo BIEN: paréntesis x más 4 cierra paréntesis al cuadrado, más paréntesis y menos 3 cierra paréntesis al cuadrado, es igual a 4.
2. SI HAY GRÁFICAS O FIGURAS GEOMÉTRICAS, debes describirlas detalladamente para que el ciego se la imagine.
   - Ejemplo: "La imagen muestra un plano cartesiano. Hay una circunferencia con centro en x=4, y=3..."
3. Transcribe las preguntas y opciones de forma clara.
4. NO uses asteriscos ni formato markdown."""

@app.post("/api/describe-image", dependencies=[Depends(verify_api_key)])
async def describe_image(req: ImageRequest):
    if not req.image:
        raise HTTPException(status_code=400, detail="No image provided")
        
    # Limpiar prefijo base64 si existe
    base64_data = req.image.split(',')[1] if ',' in req.image else req.image
    
    # 1. VALIDACIÓN DE TAMAÑO
    image_bytes_size = (len(base64_data) * 3) / 4
    if image_bytes_size > MAX_BYTES:
        print(f"Rechazado: Imagen pesada ({image_bytes_size / (1024*1024):.2f} MB)")
        raise HTTPException(status_code=413, detail="Imagen muy pesada.")
    
    # 2. CACHÉ (Activado: responde al instante si ya leyó la imagen)
    img_hash = hashlib.sha256(base64_data.encode('utf-8')).hexdigest()
    if img_hash in image_cache:
        print("Respondiendo desde caché (Página ya procesada)...")
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
        "stream": False,
        "options": {
            "temperature": 0.2,
            "top_p": 0.5,
            "repeat_penalty": 1.2,
            "repeat_last_n": 256,
            "num_predict": 500
        }
    }
    
    # 3. COLA DE PETICIONES (Evitar que Ollama colapse con múltiples usuarios)
    # Solo una petición puede entrar a este bloque a la vez. Las demás hacen "fila" automáticamente.
    async with ollama_lock:
        print("Enviando imagen a Ollama... (Las demás peticiones están en espera)")
        try:
            # 4. TIMEOUT Y PETICIÓN ASÍNCRONA
            # Le damos a Ollama máximo 300 segundos para responder, por si la compu procesa lento
            async with httpx.AsyncClient(timeout=300.0) as client:
                response = await client.post(f"{OLLAMA_BASE_URL}/api/chat", json=payload)
                response.raise_for_status()
                data = response.json()
                
                description = data.get("message", {}).get("content", "")
                
                # 5. FORZAR LIMPIEZA DE MARKDOWN (Asteriscos, negritas, etc)
                description = description.replace("*", "").replace("#", "")
                
                print(f"\n🤖 OLLAMA RESPONDIÓ ESTO:\n{description}\n")
                
                # Guardar en caché el resultado exitoso
                image_cache[img_hash] = description
                return {"success": True, "description": description}
                
        except httpx.ReadTimeout:
            print("Error: Ollama tardó demasiado en responder.")
            raise HTTPException(status_code=504, detail="La IA está tardando mucho en procesar. Por favor, intenta de nuevo.")
        except Exception as e:
            print(f"Ollama API error: {e}")
            raise HTTPException(status_code=500, detail="Error interno al procesar la imagen con la IA.")
