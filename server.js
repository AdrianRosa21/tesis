import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Groq } from 'groq-sdk';
import crypto from 'crypto';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Cache (hash -> description)
const imageCache = new Map();

class GroqProvider {
  constructor() {
    this.groq = new Groq({
      apiKey: process.env.GROQ_API_KEY || 'dummy_key_to_prevent_crash_on_init',
    });
    this.model = process.env.GROQ_MODEL || 'qwen/qwen3.6-27b';
  }

  async describeImage(image, context) {
    const prompt = `Eres el motor de IA de un lector de PDF accesible (AURA). Tu tarea es analizar la imagen de la página y extraer TODO su contenido en orden de lectura lógico, separando el texto y las descripciones de imágenes en bloques.

REGLAS ESTRICTAS:
1. Extrae todo el texto visible palabra por palabra y ponle el prefijo [TEXTO]. Cada párrafo o línea importante debe ser un bloque separado.
2. Cuando encuentres una imagen, gráfico o tabla, descríbela detalladamente para un usuario ciego y ponle el prefijo [IMAGEN].
3. Si hay matemáticas, escríbelas con palabras en español (ej. "uno más uno"), nunca uses LaTeX ni símbolos raros.
4. NUNCA des saludos, ni pensamientos, ni explicaciones extra. SOLO devuelve los bloques.

Ejemplo de formato esperado:
[TEXTO] Nombre del proyecto: AURA
[TEXTO] Área: Tecnología
[IMAGEN] Fotografía de un joven trabajando en una laptop...
[TEXTO] Siguiente párrafo del documento...`;

    try {
      const response = await this.groq.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: image } }
            ]
          }
        ],
        temperature: 0.2,
        max_tokens: 2048,
      });

      return response.choices[0]?.message?.content || "No fue posible generar la descripción.";
    } catch (error) {
      console.error("Groq API error:", error);
      throw error;
    }
  }
}

class OllamaProvider {
  constructor() {
    this.baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    this.model = process.env.OLLAMA_MODEL || 'qwen3-vl:4b';
  }

  async describeImage(image, context) {
    const prompt = `Eres el motor de IA de un lector de PDF accesible (AURA). Tu tarea es analizar la imagen de la página y extraer TODO su contenido en orden de lectura lógico, separando el texto y las descripciones de imágenes en bloques.

REGLAS ESTRICTAS:
1. Extrae todo el texto visible palabra por palabra y ponle el prefijo [TEXTO]. Cada párrafo o línea importante debe ser un bloque separado.
2. Cuando encuentres una imagen, gráfico o tabla, descríbela detalladamente para un usuario ciego y ponle el prefijo [IMAGEN].
3. Si hay matemáticas, escríbelas con palabras en español (ej. "uno más uno"), nunca uses LaTeX ni símbolos raros.
4. NUNCA des saludos, ni pensamientos, ni explicaciones extra. SOLO devuelve los bloques.

Ejemplo de formato esperado:
[TEXTO] Nombre del proyecto: AURA
[TEXTO] Área: Tecnología
[IMAGEN] Fotografía de un joven trabajando en una laptop...
[TEXTO] Siguiente párrafo del documento...`;
    
    // Convert data:image/png;base64,... to raw base64 for Ollama
    const base64Data = image.includes(',') ? image.split(',')[1] : image;

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'user',
              content: prompt,
              images: [base64Data]
            }
          ],
          stream: false
        })
      });

      if (!response.ok) throw new Error(`Ollama error: ${response.status}`);
      const data = await response.json();
      return data.message?.content || "No fue posible generar la descripción.";
    } catch (error) {
      console.error("Ollama API error:", error);
      throw error;
    }
  }
}

function getProvider() {
  const providerType = process.env.AI_PROVIDER || 'groq';
  if (providerType === 'ollama') {
    return new OllamaProvider();
  }
  return new GroqProvider();
}

app.post('/api/describe-image', async (req, res) => {
  const { image, context } = req.body;
  if (!image) {
    return res.status(400).json({ success: false, error: "No image provided" });
  }

  try {
    // Generate hash for cache
    const hash = crypto.createHash('sha256').update(image).digest('hex');
    if (imageCache.has(hash)) {
      return res.json({ success: true, description: imageCache.get(hash) });
    }

    const provider = getProvider();
    const description = await provider.describeImage(image, context);
    
    imageCache.set(hash, description);
    res.json({ success: true, description });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: "No fue posible generar la descripción de la imagen." 
    });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});
