# Propuesta de Arquitectura Mejorada

La arquitectura actual, caracterizada por ser una SPA monolítica pura, es apta para la validación técnica en un contexto de MVP, pero sus debilidades en seguridad (API key expuesta), consumo de memoria y acoplamiento bloquean una evolución sostenible.

A continuación, se propone una refactorización arquitectónica por etapas.

## Etapa 1: Re-estructuración Front-End (Responsabilidad Única y Memoria)
Sin salir del ámbito del navegador, se debe refactorizar el monolito de React.

*   **Problema actual:** `PdfReaderPage.tsx` es un *God Component* que gestiona demasiadas dependencias externas.
*   **Propuesta:** Extraer las funcionalidades pesadas en nuevos Custom Hooks.
    *   `usePdfProcessor.ts`: Maneja `pdfjs-dist`, carga de buffers y renderización de Canvas.
    *   `useOCR.ts`: Maneja `tesseract.js`, controlando los workers.
    *   `useGeminiVisual.ts`: Encapsula la lógica de red para llamadas a la IA.
*   **Mejora de Memoria:** Modificar el `pageCache` para eliminar el atributo `canvasDataUrl` de páginas anteriores a la actual. El string en Base64 de una página PDF de alta resolución puede pesar 3-5 MB; guardar 50 páginas colapsa la RAM móvil.
*   **Beneficio:** Código 100% testeable. Previene fallos del navegador por saturación de RAM. Reducción de líneas en componentes de la vista.

## Etapa 2: Implementación de Backend for Frontend (BFF) o Arquitectura Serverless
Migrar el modelo Client-Only a una arquitectura híbrida mínima para garantizar la seguridad de los secretos.

*   **Problema actual:** `VITE_GEMINI_API_KEY` viaja empaquetada en los archivos de distribución al navegador del cliente final, permitiendo robo y uso malicioso de recursos.
*   **Propuesta:** 
    1. Introducir una capa de Backend ligera (Ej. un proyecto de Express/Node.js, Vercel Serverless Functions, o AWS Lambda).
    2. El frontend enviará el archivo Base64 a esta nueva API mediante un endpoint `/api/describe-image`.
    3. El backend, que mantiene la API KEY escondida en sus variables de entorno, autentica la petición y contacta al servidor de Google Gemini.
    4. El backend recibe el texto y se lo devuelve al Frontend.
*   **Beneficio:** Remueve la vulnerabilidad de seguridad crítica (filtración de secretos). Permite agregar cuotas (*rate limiting*) por IP para evitar spam masivo de usuarios anónimos y controlar costos.

## Etapa 3: Integración Híbrida de OCR (Optimizando ancho de banda)
*   **Problema actual:** Tesseract descarga modelos (archivos de megabytes) en el cliente cuando inicia. Los dispositivos móviles tardan mucho procesando OCR complejo.
*   **Propuesta:** Mantener Tesseract para operaciones pequeñas o modo Offline, pero evaluar en el futuro mover el trabajo pesado de OCR a un servicio en la nube (ej. Google Cloud Vision) dentro del mismo backend sugerido en la Etapa 2. El Frontend decidirá qué vía tomar según las capacidades de red.
*   **Beneficio:** Ahorro sustancial de batería y ancho de banda en dispositivos limitados (tablets viejas).

## Resumen Comparativo de Transición

| Aspecto | Estado actual | Propuesta | Beneficio | Dificultad | Prioridad |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Seguridad de Tokens** | Expuestos en Frontend localmente (Públicos). | Protegidos en un servidor/función intermediaria privada. | Impide fraude y consumo no autorizado (Evita ruina financiera). | Media | **Crítica** |
| **Componentes React** | *God Component* en `PdfReaderPage.tsx`. | Separación limpia de la Lógica y Presentación mediante múltiples custom hooks. | Mejora de Mantenibilidad y legibilidad; fácil inducción de nuevos programadores. | Baja | Alta |
| **Uso de Memoria (RAM)** | Almacenamiento infinito de caché Base64. | Recolección de imágenes antiguas, manteniendo sólo metadatos y texto. | Previene colapso completo del navegador en documentos de >20 páginas. | Baja | Alta |
| **Modelos de IA** | Única petición estática a `gemini-flash-latest`. | Endpoint backend permite cambiar de proveedor LLM sin actualizar el Frontend (ej. cambiar a OpenAI en el futuro). | Desacoplamiento tecnológico; mayor escalabilidad comercial a largo plazo. | Alta | Media |

Esta arquitectura propuesta permite mantener la base sólida (accesibilidad y reactividad pura) mientras incorpora robustez de nivel empresarial que valida el proyecto no sólo como experimento, sino como un producto maduro desplegable en la vida real.
