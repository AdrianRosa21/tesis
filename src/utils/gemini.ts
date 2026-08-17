export type ElementType = 'heading' | 'paragraph' | 'image' | 'table';

export interface PageElement {
  type: ElementType;
  content: string;
}

export async function analyzePageStructure(canvasDataUrl: string): Promise<PageElement[]> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('La clave API de Gemini no está configurada.');
  }

  const prompt = `Eres un asistente de accesibilidad avanzado. Analiza la imagen de esta página de documento. Extrae TODO el contenido en el orden lógico de lectura, de arriba a abajo.
Devuelve tu respuesta estrictamente como un arreglo JSON de objetos. No incluyas markdown \`\`\`json ni texto adicional, solo el arreglo puro.
Cada objeto debe tener la estructura: { "type": "heading" | "paragraph" | "image" | "table", "content": "string" }
Reglas:
- 'heading': Para títulos o subtítulos. En 'content' pon el texto del título.
- 'paragraph': Para párrafos normales de texto. En 'content' pon el texto completo sin saltos de línea innecesarios. Agrupa oraciones del mismo párrafo.
- 'image': Para fotografías, gráficos, ilustraciones o diagramas. En 'content' escribe una descripción clara y detallada útil para una persona ciega.
- 'table': Para datos tabulares. En 'content' escribe una representación textual de la tabla fila por fila.`;

  const response = await fetch("https://apihub.agnes-ai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "agnes-2.0-flash",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: prompt
            },
            {
              type: "image_url",
              image_url: {
                url: canvasDataUrl
              }
            }
          ]
        }
      ],
      response_format: { type: "json_object" }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Error en la API de Agnes: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const textResponse = data.choices[0].message.content;

  try {
    const elements: PageElement[] = JSON.parse(textResponse);
    return elements;
  } catch (error) {
    console.error("Error parsing Agnes JSON response:", textResponse);
    throw new Error("La IA devolvió un formato inválido.", { cause: error });
  }
}

