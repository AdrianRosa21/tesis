# Análisis de arquitectura del sistema

## 1. Resumen ejecutivo
El sistema analizado es un "Lector de PDF Accesible", una aplicación web frontend orientada a usuarios con discapacidades visuales. Su objetivo principal es permitir la carga de un archivo PDF y leer su contenido en voz alta. Además, utiliza tecnologías como OCR para leer documentos escaneados y modelos de IA generativa (Gemini) para describir imágenes.
Está construido como una Single Page Application (SPA) utilizando React 19, TypeScript y Vite. La arquitectura predominante es la Basada en Componentes (Component-Based Architecture) ejecutada enteramente en el lado del cliente (Navegador).
Sus principales fortalezas radican en la integración proactiva de accesibilidad (atajos de teclado globales, lectura por síntesis de voz, alto contraste). Sin embargo, carece de un backend, lo que genera riesgos de seguridad severos (como la exposición de la API Key de Gemini en el frontend) y depende en gran medida de las capacidades del dispositivo cliente para el procesamiento pesado de OCR y renderizado de PDF.

## 2. Alcance y metodología
**Archivos revisados:** Código fuente en `src/` (incluyendo `App.tsx`, `main.tsx`, componentes en `src/pages/`, hooks en `src/hooks/`), estilos (`styles.css`), configuración de construcción (`vite.config.ts`, `tsconfig.json`) y dependencias (`package.json`).
**Metodología:** Análisis estático de código fuente, inspección de archivos de configuración y evaluación del flujo de datos en los componentes de React.
**Limitaciones:** Al ser un análisis estático de código, no se realizaron pruebas dinámicas de carga o medición de rendimiento en dispositivos específicos. No se analizó backend ni base de datos, ya que no existen en el código proporcionado.

## 3. Descripción general del sistema
*   **Nombre del sistema:** Lector de PDF Accesible.
*   **Propósito:** Proporcionar una herramienta accesible para que usuarios invidentes o con visión reducida puedan "escuchar" el contenido de archivos PDF y obtener descripciones de sus imágenes.
*   **Tipo de sistema:** Aplicación web (Frontend / SPA).
*   **Usuarios principales:** Personas con discapacidades visuales.
*   **Estado:** Prototipo / Producto Mínimo Viable (MVP).
*   **Punto de entrada:** `index.html` -> `src/main.tsx` -> `src/App.tsx`.

## 4. Inventario tecnológico
*   **Lenguaje:** TypeScript (TSX).
*   **Framework:** React 19.
*   **Herramienta de construcción:** Vite.
*   **Librería PDF:** pdfjs-dist (para análisis y renderizado de PDFs).
*   **Librería OCR:** tesseract.js (para reconocimiento óptico de caracteres).
*   **Librería IA:** @google/generative-ai (para integrar Gemini Flash para descripción de imágenes).
*   **Gestor de dependencias:** npm (evidenciado por `package-lock.json`).

## 5. Estructura del proyecto
*   `/src`: Código fuente principal.
    *   `/src/main.tsx`: Punto de arranque de React.
    *   `/src/App.tsx`: Enrutador y manejador global de atajos de teclado y eventos de foco.
    *   `/src/pages/`: Vistas de la aplicación.
        *   `HomePage.tsx`: Pantalla de bienvenida.
        *   `PdfReaderPage.tsx`: Lógica principal del lector (PDF, OCR, IA).
    *   `/src/hooks/`: Lógica reutilizable.
        *   `useSpeech.ts`: Hook para interactuar con la Web Speech API (SpeechSynthesis).
    *   `/src/styles.css`: Estilos globales y reglas de alto contraste y accesibilidad.
*   `/.env`: Archivo de variables de entorno (almacena la API key).

## 6. Arquitectura actual
El sistema emplea un **estilo arquitectónico monolítico de frontend basado en componentes**. No posee arquitectura cliente-servidor (el servidor sólo despacha archivos estáticos).
La lógica se organiza en:
1.  **Capa de Presentación y Estado (Vistas/Páginas):** Componentes React (`HomePage`, `PdfReaderPage`) que manejan el DOM, eventos de usuario y estado local.
2.  **Capa de Servicios/Integración (Hooks):** Abstracciones sobre APIs del navegador (`useSpeech.ts` encapsula `window.speechSynthesis`).
3.  **Integraciones Externas:** `pdfjs-dist` procesa el PDF mediante web workers, `tesseract.js` ejecuta OCR, y el SDK de Google realiza peticiones HTTP directas a la API de Gemini desde el navegador.

Se observa una baja separación de responsabilidades en `PdfReaderPage.tsx`, el cual actúa como un "God Component", gestionando el estado del PDF, lógica de OCR, peticiones a la IA, reproducción de voz y renderizado visual simultáneamente.

## 7. Capas, módulos y componentes
Consultar el documento `03-inventario-componentes.md` para más detalle.

## 8. Flujos principales del sistema
Consultar el documento `04-flujos-del-sistema.md`.

## 9. Modelo de datos
El sistema carece de base de datos o almacenamiento persistente. Todo el estado es efímero y reside en la memoria de los componentes React.
Consultar `05-modelo-datos.md`.

## 10. Interfaces de usuario
*   **HomePage (`/` por defecto):** Vista introductoria con un único botón de "Comenzar".
*   **PdfReaderPage (`/reader`):** Interfaz para cargar archivos y controles de lectura. Controles diseñados para ser activados por teclado (letras F, G, H, J, Espacio, Flechas). El canvas donde se dibuja el PDF está oculto para lectores de pantalla mediante `aria-hidden="true"`, permitiendo que el foco quede en los botones.

## 11. APIs e integraciones
*   **API Web Speech:** Usada nativamente a través de `useSpeech.ts`.
*   **API Google Gemini:** Invocada mediante el SDK web usando el modelo `gemini-flash-latest`. Peticiones originadas en el cliente (`PdfReaderPage.tsx:161`).

## 12. Seguridad
Existen vulnerabilidades críticas inherentes a la decisión arquitectónica. Al no tener backend, los secretos (API Keys) deben inyectarse en la aplicación cliente.
Consultar el documento `06-seguridad-riesgos.md`.

## 13. Calidad del software
*   **Accesibilidad:** Muy Alta. Es el enfoque central (navegación por teclado estricta, alto contraste nativo, retroalimentación auditiva constante).
*   **Mantenibilidad:** Media. `useSpeech` está bien desacoplado, pero `PdfReaderPage` concentra demasiadas responsabilidades (482 líneas).
*   **Escalabilidad:** Baja. Añadir nuevas funcionalidades al PDF colapsará `PdfReaderPage`. Las limitaciones de RAM del navegador afectarán el procesamiento de PDFs largos.
*   **Seguridad:** Crítica (Muy Baja). Expone secretos de API en el cliente.

## 14. Patrones y principios de diseño
*   **Custom Hooks (React):** `useSpeech` implementa una variante de Adapter/Facade para la API de SpeechSynthesis.
*   **Anti-patrón God Object:** `PdfReaderPage` viola el Principio de Responsabilidad Única (SRP) y maneja renderizado, lógica de OCR, lógica de IA, manejo de teclado y estado del lector.

## 15. Configuración y despliegue
*   **Construcción:** Gestionada por Vite y TypeScript (`npm run build` compila TS a JS y empaqueta el frontend).
*   **Despliegue:** Sistema completamente estático, puede desplegarse en cualquier CDN o servidor web estático (GitHub Pages, Vercel, Netlify, Nginx, Apache).
*   **Variables de entorno:** Depende de `VITE_GEMINI_API_KEY` en tiempo de compilación.

## 16. Pruebas
No se encontró evidencia de pruebas automatizadas (Unitarias, Integración, o E2E) en el repositorio (`test-gemini.mjs` y `test-models.mjs` parecen ser scripts de desarrollo descartables o pruebas manuales de concepto). Las dependencias en `package.json` no incluyen Jest, Vitest, Cypress o Playwright.

## 17. Deuda técnica y riesgos
Consultar `07-deuda-tecnica.md`.

## 18. Matriz de trazabilidad
Consultar `09-matriz-trazabilidad.md`.

## 19. Información preparada para diagramas
Consultar `08-datos-para-diagramas.md`.

## 20. Arquitectura propuesta
Consultar `11-arquitectura-propuesta.md`.

## 21. Recomendaciones priorizadas
1.  **Prioridad Crítica:** Mover la integración con Google Gemini a un backend intermedio (BFF - Backend For Frontend) o función serverless para proteger la API Key.
2.  **Prioridad Alta:** Refactorizar `PdfReaderPage.tsx` dividiendo sus responsabilidades en hooks adicionales (e.g., `usePdfProcessor`, `useOCR`) y subcomponentes.
3.  **Prioridad Media:** Implementar un conjunto de pruebas automatizadas con Vitest (unitarias) y Playwright (E2E enfocado en teclado y a11y).
4.  **Prioridad Media:** Manejar eficientemente la memoria (paginación diferida, liberar URLs de Canvas `toDataURL` y trabajadores de Tesseract).

## 22. Conclusiones
El proyecto logra un objetivo noble y presenta soluciones creativas para la accesibilidad, combinando de manera interesante la Web Speech API, OCR en el navegador y descripciones de imágenes mediante LLMs. Sin embargo, su madurez arquitectónica es de prototipo: la aglomeración de lógica en componentes monolíticos y la ausencia de un entorno seguro para manejar la comunicación con APIs externas lo hacen inviable para un pase a producción seguro y mantenible a largo plazo.

## 23. Evidencias y archivos consultados
*   `src/App.tsx`
*   `src/pages/HomePage.tsx`
*   `src/pages/PdfReaderPage.tsx`
*   `src/hooks/useSpeech.ts`
*   `package.json`
*   `.env`

## 24. Preguntas pendientes
Consultar `10-preguntas-pendientes.md`.
