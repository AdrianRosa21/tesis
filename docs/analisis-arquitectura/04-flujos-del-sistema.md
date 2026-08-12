# Flujos Completos de Ejecución

## Proceso: Arranque del sistema y navegación global por teclado

*   **Actor:** Usuario (habitualmente invidente o con baja visión).
*   **Objetivo:** Iniciar la aplicación y comenzar a recibir retroalimentación auditiva del entorno.
*   **Precondiciones:** Sistema cargado en el navegador, permisos de sonido y teclado concedidos.
*   **Punto de entrada:** Interfaz principal (`index.html` -> `App.tsx`).
*   **Flujo principal:**
    1.  El usuario ingresa a la aplicación.
    2.  El componente `HomePage` se monta y utiliza `useSpeech` para enunciar el mensaje de bienvenida y las instrucciones.
    3.  El usuario navega usando la tecla `Tab`.
    4.  El oyente global en `App.tsx` (`handleFocus`) detecta el cambio de foco.
    5.  Si el foco cae sobre un botón, lee el texto del botón y añade instrucciones contextuales personalizadas (ej. "Presiona la tecla F").
*   **Flujo alternativo:** El usuario hace clic con el ratón (`mousedown`), lo que deshabilita temporalmente el *feedback* verbal de foco para no sobrecargar si no está usando navegación por teclado.
*   **Manejo de errores:** Si la Web Speech API no está disponible o falla, la aplicación continuará funcionando pero en silencio (falla no bloqueante, pero crítica para el objetivo del sistema).
*   **Componentes involucrados:** `App.tsx` (listener global), `HomePage.tsx`, `useSpeech.ts`.
*   **Evidencia encontrada:** `App.tsx` línea 12 (`useEffect` con oyentes `keydown`, `mousedown`, `focusin`); línea 66 (`speech.speak(text)`).
*   **Resultado final:** El usuario comprende el entorno y sabe qué acción realizar a continuación.

## Proceso: Carga y renderizado inicial de un archivo PDF

*   **Actor:** Usuario.
*   **Objetivo:** Seleccionar un documento PDF local para su lectura.
*   **Precondiciones:** Estar en `PdfReaderPage`.
*   **Punto de entrada:** Botón "Seleccionar PDF" (o tecla `F`).
*   **Flujo principal:**
    1.  El usuario presiona `F`.
    2.  `PdfReaderPage` simula un clic en el input de tipo archivo oculto.
    3.  El explorador de archivos del SO se abre, el usuario selecciona el archivo.
    4.  El manejador `handleFileChange` valida que sea un PDF (`application/pdf`).
    5.  Se notifica auditivamente "Archivo seleccionado: [nombre]...".
    6.  El archivo se procesa como `ArrayBuffer` y se entrega a `pdfjsLib.getDocument()`.
    7.  Al resolver la promesa, se obtienen los metadatos (ej. total de páginas).
    8.  El sistema llama automáticamente a `goToPage(doc, 1)` para procesar la primera página.
*   **Manejo de errores:** Si el archivo no es PDF, o si el PDF está protegido por contraseña, se alerta por voz y el flujo se detiene (líneas 233 y 257 de `PdfReaderPage.tsx`).
*   **Datos modificados:** Estado interno (Documento cargado, nombre de archivo, reset de caché de páginas).
*   **Componentes involucrados:** `PdfReaderPage.tsx`, librería `pdfjs-dist`.
*   **Evidencia encontrada:** Método `handleFileChange` en `PdfReaderPage.tsx` (L228).
*   **Resultado final:** El documento está en memoria, la página 1 está renderizada y lista para interactuar.

## Proceso: Procesamiento inteligente de página (Texto, OCR y Caché)

*   **Actor:** Sistema (Automático al cambiar de página).
*   **Objetivo:** Extraer texto de la página o lanzar OCR si se detecta un documento escaneado.
*   **Precondiciones:** Documento PDF cargado en memoria.
*   **Punto de entrada:** Cambio de página (`goToPage`).
*   **Flujo principal:**
    1.  Se actualiza el estado (foco en el header invisible) y se enuncia "Página X de Y".
    2.  El PDF es renderizado en un lienzo de canvas HTML oculto, del cual se extrae una imagen Base64 (DataURL).
    3.  El sistema intenta extraer texto nativo usando `page.getTextContent()` de `pdfjs`.
    4.  La información extraída, junto con la imagen Base64, se guardan en el estado `pageCache`.
    5.  El sistema valida la cantidad de texto: si hay menos de 50 caracteres (condición arbitraria para detectar PDFs basados en imágenes).
    6.  Si se cumple, se dispara automáticamente la función `runOCR()`.
    7.  Se enuncia que la página parece escaneada.
    8.  `tesseract.js` procesa la imagen en un Worker en el navegador.
    9.  El resultado del OCR se añade al caché de la página y se notifica al usuario.
*   **Datos modificados:** Estado `pageCache` (agrega texto nativo, texto OCR e imagen).
*   **Componentes involucrados:** `PdfReaderPage.tsx` (`goToPage`, `loadPageData`, `runOCR`), `tesseract.js`.
*   **Evidencia encontrada:** `loadPageData` (L70) y condición de longitud de texto (L99) en `PdfReaderPage.tsx`.
*   **Resultado final:** La página actual contiene datos estructurados listos para ser leídos o descritos por IA.

## Proceso: Solicitud de Descripción Visual (IA Gemini)

*   **Actor:** Usuario.
*   **Objetivo:** Obtener una descripción de imágenes y contexto visual de la página actual.
*   **Precondiciones:** Página procesada (existe DataURL en el caché). API Key configurada.
*   **Punto de entrada:** Botón "Describir imágenes..." (o tecla `H`).
*   **Flujo principal:**
    1.  El usuario presiona `H`.
    2.  La función `describeImages` se ejecuta.
    3.  Se verifica si ya existe una descripción en caché para esa página; si es así, se reproduce directamente y termina el flujo.
    4.  Si no existe, se extrae la API Key de las variables de entorno.
    5.  Se advierte por voz "Solicitando descripción visual, por favor espera".
    6.  Se extrae la cadena Base64 de la imagen del PDF almacenada en caché.
    7.  Se inicializa el SDK de `GoogleGenerativeAI` con el modelo `gemini-flash-latest`.
    8.  Se envía un prompt indicando que describa para una persona ciega, adjuntando la imagen en base64.
    9.  Al recibir la respuesta, se guarda en el caché (`imageDescriptions`).
    10. La descripción se enuncia mediante `useSpeech` y se muestra visualmente en pantalla en un `region` con `aria-label`.
*   **Flujo alternativo:** Si la API Key no existe (ej. no se configuró `.env`), se notifica al usuario del error (L149).
*   **Manejo de errores:** Fallos de red o errores de la API de Google actualizan el caché con el error y lo leen en voz alta.
*   **Componentes involucrados:** `PdfReaderPage.tsx`, `@google/generative-ai`.
*   **Evidencia encontrada:** Función `describeImages` (L138 en `PdfReaderPage.tsx`).
*   **Resultado final:** El usuario escucha la interpretación gráfica de la página producida por el modelo de IA.
