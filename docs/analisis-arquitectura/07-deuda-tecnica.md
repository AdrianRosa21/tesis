# Análisis de Deuda Técnica y Errores Encontrados

El código fuente muestra características propias de un desarrollo temprano o prototipo. Se han detectado varias inconsistencias que deben subsanarse para asegurar escalabilidad y mantenibilidad.

## Matriz de Deuda Técnica

| ID | Riesgo o deuda técnica | Evidencia | Impacto | Probabilidad | Prioridad | Recomendación |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| DT-01 | **God Object** / Alto acoplamiento en UI. | Componente `PdfReaderPage.tsx` de casi 500 líneas manejando Canvas, Promesas de PDF, instanciación de OCR (Tesseract), y peticiones HTTP al LLM, violando el Single Responsibility Principle. | Dificulta aplicar cambios, refactorizar o encontrar bugs. Si se cambia la API de IA, el componente visual se rompe. | Alta | **Alta** | Extraer lógica de negocio en custom hooks (ej: `useOCR.ts`, `usePdfParser.ts`, `useGeminiVisual.ts`). |
| DT-02 | Fugas de Memoria (Memory Leaks) en caché. | `pageCache` almacena cadenas enteras de Base64 (`canvasDataUrl`) para cada página en `PdfReaderPage.tsx`. No existe un mecanismo de expiración (Eviction) o recolección de basura local. | El navegador crasheará ("Out of Memory") si un usuario carga y navega por un PDF denso de cientos de páginas. | Alta | **Crítica** | Almacenar datos `canvasDataUrl` solo de la página activa, descartando imágenes de páginas antiguas (solo reteniendo el texto extraído). |
| DT-03 | Lógica frágil para disparar OCR automático. | `PdfReaderPage.tsx:99`. OCR se lanza si `extractedText.length < 50`. Este número mágico es estático. Si un PDF tiene 55 caracteres y el resto son diagramas de red sin texto nativo, no se lanzará el OCR. | Se pierde funcionalidad importante para usuarios con páginas que mezclan poco texto nativo con diagramas complejos. | Media | **Media** | Proveer heurísticas mejores (revisar si la página reporta contener imágenes en la metadata de `pdfjs`) o un botón explícito de "Forzar OCR en esta página". |
| DT-04 | Dependencia de red para Worker pesado. | `workerSrc = pdfjs-dist/build/pdf.worker.mjs?url` importa el worker, pero `tesseract.js` descargará por defecto los lenguajes de entrenamiento (ej: `spa+eng`) a través de la red en tiempo de ejecución. | El sistema fallará en entornos sin conexión a internet y consumirá gran ancho de banda en redes móviles (descarga de ~30MB). | Alta | **Media** | Hostear los archivos `.traineddata` (modelos de idioma de Tesseract) de forma local/estática para precargarlos, mejorando rendimiento y garantizando operación offline. |
| DT-05 | Uso de `any` en TypeScript. | `PdfReaderPage.tsx:79`: `textContent.items.map((item: any) => item.str)`. | El tipado fuerte se ignora, abriendo la puerta a errores de compilación ignorados (*Type Safety* rota). | Baja | **Baja** | Instalar o revisar las definiciones de tipos de `pdfjs-dist` y reemplazar `any` con `TextItem`. |
| DT-06 | Ausencia absoluta de automatización de pruebas (Testeo). | En `package.json` no existe configuración de Jest o Vitest. Archivos `test-*.mjs` en el root parecen scripts residuales. | Cada vez que se añade una función, existe un riesgo muy alto de romper otra de forma inadvertida (*Regression*). | Muy Alta | **Alta** | Implementar `Vitest` para el hook `useSpeech`, y `Testing Library` para asegurar que los atributos ARIA correctos se generen. |

## Observaciones Generales

El uso de eventos globales en `App.tsx` (`document.addEventListener`) para interceptar teclas requiere manejo cuidadoso. Aunque se efectúa la limpieza en el `return` del `useEffect` (L75), en sistemas React complejos este patrón puede causar efectos secundarios imprevisibles.
Se destaca positivamente la preocupación por la accesibilidad, integrando el soporte por teclado nativamente.
