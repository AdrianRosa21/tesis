# Análisis de Base de Datos y Modelo de Datos

## Motor Utilizado
**No aplica.** El sistema evaluado no emplea ningún motor de base de datos relacional (SQL) ni no-relacional (NoSQL), y tampoco hace uso de almacenamiento persistente local profundo en el navegador (como IndexedDB o LocalStorage), más allá del caché en memoria (RAM) efímero asociado al ciclo de vida del componente de React.

## Entidades de Estado (Modelo Lógico en Memoria)

Aunque no existen tablas en bases de datos, el sistema depende de estructuras de datos críticas gestionadas en el estado de React.

### Entidad: `PageData` (Caché de Página)
Almacena de forma temporal los resultados pesados procesados por la aplicación, evitando re-ejecutar renderizado de Canvas, OCR y consultas de IA si el usuario retrocede a una página ya visitada.

| Campo | Tipo de dato (TypeScript) | Propósito |
| :--- | :--- | :--- |
| `pageNum` | `number` | Clave lógica de la página del PDF actual. |
| `extractedText` | `string` | Texto extraído nativamente por `pdfjs-dist`. |
| `ocrText` | `string` | Texto inferido por visión computacional mediante `tesseract.js`. |
| `imageDescriptions` | `string` | Respuesta devuelta por la IA (Gemini) describiendo el Canvas visual. |
| `isProcessingOCR` | `boolean` | Bandera de estado UI (cargando Tesseract). |
| `isProcessingDescription` | `boolean` | Bandera de estado UI (esperando a Gemini). |
| `canvasDataUrl` | `string \| null` | Representación de la imagen Base64 generada por Canvas (usada para OCR y enviada a la IA). |

* **Colección asociada:** Se almacena como un Diccionario (Map) en la variable de estado `pageCache: Record<number, PageData>`.
* **Riesgos de este modelo:**
  1. Al guardar representaciones `canvasDataUrl` (Base64), PDFs muy extensos (ej. 100+ páginas) llenarán la memoria RAM del navegador rápidamente si el usuario navega a través de todas ellas sin que el sistema limpie el caché antiguo.

### Entidad: `HighlightState` (Estado de Subrayado Lector)
Define la palabra exacta que el sintetizador de voz está pronunciando.

| Campo | Tipo de dato | Propósito |
| :--- | :--- | :--- |
| `start` | `number` | Índice de carácter global donde inicia la palabra pronunciada. |
| `length` | `number` | Longitud en caracteres de la palabra pronunciada. |

## Información preparada para diagrama entidad-relación

*Nota para el maquetado del diagrama: Al carecer de bases de datos relacionales, el diagrama debe plantearse como un Diagrama de Clases / Diagrama de Estado (UML) mostrando las interfaces de TypeScript como las principales entidades.*

**Diagrama sugerido (Componentes de Estado):**
*   **PdfReaderState** (Contiene las propiedades globales de la vista)
    *   fileName (string)
    *   currentPage (number)
    *   totalPages (number)
*   **PdfReaderState** "tiene muchos (diccionario)" -> **PageData**
*   **SpeechState** (Manejado por el Hook)
    *   isSpeaking (boolean)
    *   isPaused (boolean)
*   **SpeechState** "tiene 0 o 1" -> **HighlightState**
