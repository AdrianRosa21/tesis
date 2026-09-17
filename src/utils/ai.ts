import type { PDFDocumentProxy } from 'pdfjs-dist';
import Tesseract from 'tesseract.js';

export type ElementType = string;

export interface PageElement {
  type: ElementType;
  content: string;
}

export async function analyzePageStructure(canvasDataUrl: string, pdfDoc?: PDFDocumentProxy, pageNum?: number): Promise<PageElement[]> {
  const elements: PageElement[] = [];

  const optimizedDataUrl = await optimizeImage(canvasDataUrl);

  try {
    const response = await fetch("http://localhost:3001/api/describe-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: optimizedDataUrl })
    });

    if (response.ok) {
      const data = await response.json();
      if (data.success && data.description) {
        // Eliminar tags <think>...</think> generados por modelos de razonamiento
        let cleanDescription = data.description.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
        
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
    }
  } catch (e) {
    console.error("Error contactando al backend de IA:", e);
    throw new Error("No fue posible analizar la página con AURA.");
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
      // Limitar resolución a 800px para ahorrar tokens manteniendo legibilidad
      const MAX_WIDTH = 800;
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
        // Compresión WebP o JPEG 0.7
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      } else {
        resolve(dataUrl);
      }
    };
    img.src = dataUrl;
  });
}
