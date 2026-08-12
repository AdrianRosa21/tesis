# Información Preparada para Diagramas Arquitectónicos

Este documento contiene la información estructurada que debe ser utilizada en una etapa posterior para el modelado visual en herramientas como Draw.io, Lucidchart, o PlantUML.

## A. Diagrama de Contexto (C4 Model - Nivel 1)
*   **Sistema Central:** Lector de PDF Accesible (Web SPA).
*   **Actores:**
    *   Usuario (Invidente / Discapacidad Visual).
*   **Sistemas Externos:**
    *   **Google Gemini API:** Proporciona descripciones semánticas de imágenes. Comunicación saliente (HTTPS / REST).
    *   **Sistema Operativo Local / Navegador:** Provee el sistema de archivos local (carga de PDF) y el motor de Síntesis de Voz (Web Speech API).

## B. Diagrama de Contenedores (C4 Model - Nivel 2)
*   **Contenedor Principal:** Aplicación Web (React SPA) corriendo en el Navegador del Cliente.
    *   Responsabilidad: Orquestar toda la lógica.
    *   Tecnología: TypeScript, React, Vite.
*   **Contenedores Externos:**
    *   **Google Cloud Vertex AI / Gemini Server:** Recibe prompts e imágenes Base64, devuelve texto. (HTTPS).
    *   **Archivos Locales (OS):** Proveen el documento PDF. (File API).
*   *Nota: No hay contenedor de base de datos ni contenedor de backend propio.*

## C. Diagrama de Componentes (C4 Model - Nivel 3)
Enfocado en el Contenedor "Aplicación Web":
*   **Componente 1: Enrutador Global (`App`)**
    *   *Responsabilidad:* Gestión de estado de página (`home` / `reader`) y manejo global de interceptores de teclado para `SpeechSynthesis`.
*   **Componente 2: Procesador de PDF (`PdfReaderPage`)**
    *   *Depende de:* `pdfjs-dist` (para render y texto nativo).
    *   *Depende de:* `tesseract.js` (para reconocimiento óptico de caracteres).
    *   *Depende de:* `@google/generative-ai` (para pedir descripción visual).
*   **Componente 3: Servicio de Voz (`useSpeech`)**
    *   *Responsabilidad:* Exponer interfaz de `speak`, `pause`, `stop` para ser usada por otros componentes, ocultando detalles de fragmentación de chunks del `SpeechSynthesisUtterance`.
*   **Dirección de comunicación:**
    *   `App` -> `useSpeech`
    *   `PdfReaderPage` -> `useSpeech`
    *   `PdfReaderPage` -> APIs Externas (Gemini)

## D. Diagrama de Clases / Diagrama Lógico de Estado
*   **Clase principal de Estado: `PageData` (Interfaz)**
    *   Atributos:
        *   `pageNum: number`
        *   `extractedText: string`
        *   `ocrText: string`
        *   `imageDescriptions: string`
        *   `isProcessingOCR: boolean`
        *   `isProcessingDescription: boolean`
        *   `canvasDataUrl: string | null`
*   **Clase: `UseSpeechResult` (Interfaz)**
    *   Atributos:
        *   `isSpeaking: boolean`
        *   `isPaused: boolean`
        *   `highlight: HighlightState | null`
    *   Métodos:
        *   `speak(text: string): void`
        *   `pause(): void`
        *   `resume(): void`
        *   `stop(): void`
*   **Asociaciones:** El componente React almacena internamente instancias de `PageData` en memoria y consume instancias de `UseSpeechResult`.

## E. Diagrama de Despliegue
*   **Nodo Físico 1: Servidor de Hosting Estático (Ej. Vercel, Nginx)**
    *   Artefacto Desplegado: `dist/` (Archivos HTML, CSS, JS precompilados por Vite).
*   **Nodo Físico 2: Dispositivo del Cliente (PC/Móvil)**
    *   Entorno de Ejecución: Navegador Web (Chrome, Edge, Firefox).
    *   Artefacto: Aplicación React (JS ejecutándose en memoria).
    *   Puertos: 443 (HTTPS) para recuperar el código estático.
*   **Nodo Físico 3: Servidor de Google (Gemini)**
    *   Entorno de Ejecución: API REST.
    *   Comunicación: HTTPS (puerto 443) desde el Navegador del Cliente directamente a Google.

## F. Diagrama de Casos de Uso
*   **Actor Principal:** Usuario.
*   **Caso de Uso 1:** Iniciar Aplicación. (Precondición: Cargar URL).
*   **Caso de Uso 2:** Cargar Documento PDF. (Include: Seleccionar Archivo Local).
*   **Caso de Uso 3:** Navegar por páginas (Avanzar/Retroceder/Saltar).
*   **Caso de Uso 4:** Escuchar Página Actual.
    *   (Extend): Extraer texto de imagen (OCR).
*   **Caso de Uso 5:** Obtener Descripción de Imágenes.
    *   (Include): Procesar imagen con IA Externa.
*   **Caso de Uso 6:** Pausar / Reanudar Lectura.

## G. Diagramas de Secuencia sugeridos
Se recomienda generar tres diagramas de secuencia (la base de datos se encuentra en `04-flujos-del-sistema.md`):
1.  **Secuencia de Navegación Inicial:** Demuestra cómo la aplicación detecta el evento de `keydown`, evalúa la etiqueta HTML que tiene el foco, constuye un texto dinámico y llama al motor de voz.
2.  **Secuencia de Carga y Procesamiento de PDF:** Muestra el flujo entre `PdfReaderPage`, `pdfjs-dist` obteniendo promesas, renderizando el canvas y evaluando heurísticamente si invoca a `tesseract.js`.
3.  **Secuencia de Invocación a Gemini:** Describe el envío del blob (Base64) desde el cliente hacia la API de Google AI, la espera de la promesa y la emisión auditiva del resultado.
