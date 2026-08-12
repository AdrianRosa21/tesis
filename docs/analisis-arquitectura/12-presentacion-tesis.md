# Estructura para Presentación y Defensa de Tesis

Este documento es un guion estructurado que puede utilizarse como base para la creación de diapositivas en Microsoft PowerPoint o Google Slides para defender la arquitectura del proyecto frente a un jurado.

---

### Diapositiva 1: Título y Presentación
*   **Título Principal:** Análisis y Diseño Arquitectónico: Lector de PDF Accesible.
*   **Subtítulo:** Una solución basada en IA y OCR integrados en el navegador.
*   **Autor/Ponente:** [Nombre del estudiante]
*   **Nota del Ponente (Qué decir):** "Buenos días, en esta presentación detallaré el núcleo técnico de nuestra herramienta inclusiva. Más allá de su interfaz, analizaremos cómo se interconectan los sistemas que permiten transformar un PDF estático en información auditiva dinámica, impulsada por Inteligencia Artificial y Visión Computacional."

---

### Diapositiva 2: El Reto y la Solución
*   **Puntos:**
    *   **Problema:** Documentos digitales visuales y escaneados son inaccesibles para personas con ceguera.
    *   **Solución Propuesta:** Una SPA (Single Page Application) reactiva, 100% controlable por teclado.
    *   **Valor Técnico:** Ejecución directa en navegador (menor latencia) y orquestación inteligente (OCR + IA).
*   **Visual sugerida:** Muestra un documento PDF normal vs un icono de "ondas de audio", conectado por el logo de React y Gemini.

---

### Diapositiva 3: Arquitectura Actual y Tecnologías
*   **Puntos:**
    *   **Front-End:** React 19, TypeScript, Vite.
    *   **Extracción Estructural:** `pdfjs-dist` (Render y texto nativo).
    *   **Inteligencia Artificial:** SDK Web de Google Gemini (`gemini-flash-latest`) para descripción semántica.
    *   **Procesamiento Paralelo (Worker):** `tesseract.js` para Reconocimiento Óptico de Caracteres.
    *   **API Nativa:** Web Speech API para síntesis de voz.
*   **Nota del Ponente:** "El sistema fue construido basándose enteramente en tecnologías del lado del cliente. Esto significa que la mayor parte del trabajo pesado ocurre en la memoria y CPU del usuario (el navegador), garantizando independencia temporal del servidor estático".

---

### Diapositiva 4: Flujo de Ejecución (Demo Lógica)
*   **Visual sugerida:** Gráfico de bloques (diagrama de flujo simplificado).
    1.  Carga de PDF en Memoria.
    2.  Página es procesada y evaluada.
    3.  ¿Tiene Texto Nativo? (No) -> Lanza Worker Tesseract OCR.
    4.  Usuario presiona 'Describir' -> Lanza Petición a Gemini AI.
    5.  Todo converge en `SpeechSynthesisUtterance` para la retroalimentación final.

---

### Diapositiva 5: Logros y Fortalezas Técnicas
*   **Accesibilidad Profunda:** No depende del lector de pantalla nativo; integra su propio *listener* global para interpretar el foco (DOM).
*   **Patrones Reactivos:** Uso intensivo de *Custom Hooks* (`useSpeech`) para abstraer integraciones con el navegador.
*   **Paginación Diferida:** Promesas asíncronas optimizan la obtención de páginas de un PDF.

---

### Diapositiva 6: Desafíos y Hallazgos Críticos
*   **Puntos (Mostrar como deudas técnicas a resolver):**
    *   **Complejidad Ciclomática:** El componente `PdfReaderPage` asume múltiples roles simultáneamente (God Object).
    *   **Consumo de Memoria RAM:** Guardado persistente (en sesión) de imágenes Canvas en Base64.
    *   **Vulnerabilidad Estructural (Seguridad):** La API Key de Google está almacenada del lado del cliente, haciéndola pública al inspeccionar el código.
*   **Nota del Ponente:** "Como en todo prototipo iterativo, hemos descubierto retos de diseño clave. El más crítico es el almacenamiento de credenciales de API en código cliente estático, un riesgo asumible en etapa de desarrollo, pero inaceptable para salida a Producción".

---

### Diapositiva 7: La Evolución: Arquitectura Propuesta
*   **Visual sugerida:** Comparación de Arquitecturas ("Antes" vs "Después").
*   **Antes:** Navegador <-----> Google Gemini.
*   **Después:** Navegador <-----> [Nuevo BFF Backend (Node.js/AWS)] <-----> Google Gemini.
*   **Puntos:**
    *   Implementar patrón "Backend for Frontend" para securizar tokens y controlar tráfico.
    *   Aplicar el principio *Single Responsibility* separando la lectura de PDF y el OCR en múltiples hooks independientes.
    *   Estrategia de Evicción (Limpieza de memoria) para PDFs extensos.

---

### Diapositiva 8: Conclusiones
*   **Puntos:**
    *   La plataforma actual demuestra que es factible combinar OCR e IA en una SPA ágil.
    *   El modelo es altísimamente accesible, con una fricción casi nula para el usuario objetivo.
    *   La refactorización y adopción de capas intermedias preparará al sistema para convertirse en un software robusto y seguro de escala comercial.
*   **Cierre:** Agradecimientos e inicio de sesión de preguntas.
