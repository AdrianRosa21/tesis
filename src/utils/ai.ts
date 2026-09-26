export type ElementType = string;

export interface PageElement {
  type: ElementType;
  content: string;
}

interface ApiErrorPayload {
  detail?: string;
  error?: string;
}

export async function analyzePageStructure(canvasDataUrl: string): Promise<PageElement[]> {
  const elements: PageElement[] = [];

  const optimizedDataUrl = await optimizeImage(canvasDataUrl);

  try {
    const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
    const API_KEY = import.meta.env.VITE_API_KEY || "aura-tesis-secreto-2026";
    const response = await fetch(`${API_URL}/api/describe-image`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "x-api-key": API_KEY
      },
      body: JSON.stringify({ image: optimizedDataUrl })
    });

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({})) as ApiErrorPayload;
      const message = errorPayload.detail || errorPayload.error || `La API respondió con HTTP ${response.status}.`;
      throw new Error(message);
    }

    const data = await response.json();
    if (data.success && data.description) {
        // Eliminar tags <think>...</think> generados por modelos de razonamiento
        const cleanDescription = data.description.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
        
        // Parsear los bloques [TEXTO] e [IMAGEN]
        const lines = cleanDescription.split('\n');
        for (let line of lines) {
          line = line.trim();
          if (!line) continue;
          
          if (line.startsWith('[IMAGEN]')) {
            elements.push({ type: "Descripción Visual", content: line.replace('[IMAGEN]', '').trim() });
          } else if (line.startsWith('[TEXTO]')) {
            elements.push({ type: "Texto", content: line.replace('[TEXTO]', '').trim() });
          } else {
            // Si el modelo olvidó el prefijo, asumimos que es texto
            elements.push({ type: "Texto", content: line });
          }
        }
    }
  } catch (e) {
    console.error("Error contactando al backend de IA:", e);
    throw new Error("No fue posible analizar la página con AURA.", { cause: e });
  }

  if (elements.length === 0) {
     elements.push({ type: "Texto", content: "Página en blanco o sin contenido reconocible." });
  }

  return elements;
}

function optimizeImage(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      // 800 px vuelve ilegible el texto pequeno. 1600 px conserva detalle sin
      // acercarse normalmente al limite de 5 MB del backend.
      const MAX_WIDTH = 1600;
      let width = img.width;
      let height = img.height;

      if (width > MAX_WIDTH) {
        height = Math.round((height * MAX_WIDTH) / width);
        width = MAX_WIDTH;
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.9));
      } else {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}
