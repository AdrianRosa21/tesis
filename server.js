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
    const prompt = `Eres el módulo de accesibilidad de un lector de documentos PDF para personas ciegas o con baja visión.
Tu tarea es proporcionar la lectura final y correcta de la página basándote en la imagen proporcionada.

IMPORTANTE SOBRE LAS MATEMÁTICAS:
El texto extraído proporcionado en el "Contexto" fue generado por un sistema básico (OCR/pdfjs) que ROMPE las fracciones, exponentes y ecuaciones (ej. lee el numerador y denominador por separado perdiendo la raya de fracción). 
Debes corregir TODO el texto matemático leyendo la imagen para que tenga sentido al escucharlo (ej. escribe "ax sobre 4", "11 doceavos", "x al cuadrado").

REGLAS:
1. Si hay matemáticas, lee la imagen y escribe las ecuaciones de forma natural para ser escuchadas.
2. Si hay diagramas, gráficas o imágenes, descríbelos detalladamente.
3. Si el texto del contexto está bien, puedes basarte en él, pero asegúrate de que el resultado final sea fluido y correcto.
4. Devuelve ÚNICAMENTE el texto final que el usuario escuchará. Responde en español y de manera concisa.
${context ? `\nContexto (Texto con posibles errores matemáticos):\n"${context}"` : ''}`;

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
    const prompt = `Eres el módulo de descripción visual de un lector de documentos PDF diseñado para personas ciegas o con baja visión. Describe la imagen de forma clara, objetiva y útil para alguien que no puede verla. Prioriza contenido principal, objetos importantes, texto. Responde en español y de manera concisa. Contexto cercano: ${context || ''}`;
    
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
