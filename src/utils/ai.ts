import type { PDFDocumentProxy } from 'pdfjs-dist';
import Tesseract from 'tesseract.js';

export type ElementType = string;

export interface PageElement {
  type: ElementType;
  content: string;
}

export async function analyzePageStructure(canvasDataUrl: string, pdfDoc?: PDFDocumentProxy, pageNum?: number): Promise<PageElement[]> {
  const elements: PageElement[] = [];
  let pageText = "";

  // 1. Extraer texto usando pdfjs si tenemos el documento
  if (pdfDoc && pageNum) {
    try {
      const page = await pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent();
      
      // Agrupar por líneas basándonos en la coordenada Y (transform[5])
      const linesMap = new Map<number, string[]>();
      for (const item of textContent.items as any[]) {
        if (!item.str.trim()) continue;
        const y = Math.round(item.transform[5]);
        if (!linesMap.has(y)) linesMap.set(y, []);
        linesMap.get(y)!.push(item.str);
      }
      
      const sortedY = Array.from(linesMap.keys()).sort((a, b) => b - a); // De arriba hacia abajo
      for (const y of sortedY) {
        const lineText = linesMap.get(y)!.join(" ").replace(/\s+/g, ' ').trim();
        if (lineText) {
          pageText += lineText + "\n";
        }
      }
    } catch (e) {
      console.error("Error extrayendo texto con pdfjs:", e);
    }
  }

  // 2. Si no hay texto (es un PDF escaneado), usamos OCR con Tesseract.js
  if (pageText.length < 20) {
    try {
      console.log("Poco texto detectado, iniciando OCR con Tesseract.js...");
      const { data: { text } } = await Tesseract.recognize(canvasDataUrl, 'spa', {
        logger: m => console.log(m)
      });
      pageText = text.replace(/\n\s*\n/g, '\n').trim();
    } catch (e) {
      console.error("Error en OCR:", e);
    }
  }

  // Heurística para detectar matemáticas o formato roto
  const mathSymbols = ['=', '+', '-', '÷', '×', '%', '√'];
  const hasMath = mathSymbols.some(sym => pageText.includes(sym)) || (pageText.match(/\d/g)?.length || 0) > (pageText.length * 0.05);

  let contextForAI = "";
  
  if (hasMath) {
    console.log("Detectadas matemáticas. Usando IA para leer la página corregida...");
    contextForAI = pageText.substring(0, 1500);
  } else {
    // Es texto normal. Lo agregamos línea por línea para permitir navegación con flechas
    const lines = pageText.split('\n').filter(l => l.trim().length > 0);
    for (const line of lines) {
      elements.push({ type: "Texto", content: line });
    }
    contextForAI = "El texto de esta página ya fue leído correctamente. IGNORA EL TEXTO. Concéntrate EXCLUSIVAMENTE en describir diagramas, fotografías, tablas o gráficas si las hay. Si no hay imágenes visuales, responde exactamente: 'No hay imágenes'.";
  }

  const optimizedDataUrl = await optimizeImage(canvasDataUrl);

  try {
    const response = await fetch("http://localhost:3001/api/describe-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: optimizedDataUrl, context: contextForAI })
    });

    if (response.ok) {
      const data = await response.json();
      if (data.success && data.description) {
        // Eliminar tags <think>...</think> generados por modelos de razonamiento
        let cleanDescription = data.description.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
        
        if (cleanDescription.length > 0) {
          const descLower = cleanDescription.toLowerCase();
          
          if (!hasMath && (descLower.includes("no hay imágenes") || descLower.includes("no hay imagenes") || descLower.includes("decorativa"))) {
            // Ignorar
          } else if (hasMath) {
            // Dividir la corrección matemática línea por línea para navegación
            const mathLines = cleanDescription.split('\n').filter((l: string) => l.trim().length > 0);
            for (const mLine of mathLines) {
              elements.push({ type: "Matemática", content: mLine });
            }
          } else {
            elements.push({ type: "Descripción Visual", content: cleanDescription });
          }
        }
      }
    }
  } catch (e) {
    console.error("Error contactando al backend de IA:", e);
    // Fallo silencioso de la IA para no romper el flujo principal si el texto ya se extrajo
    if (elements.length === 0) {
      throw new Error("No fue posible extraer texto ni generar descripción visual de la página.");
    }
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
