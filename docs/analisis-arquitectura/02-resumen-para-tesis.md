# Resumen para Capítulo de Tesis: Análisis y Diseño Arquitectónico

## Introducción

El presente capítulo expone el análisis arquitectónico del sistema "Lector de PDF Accesible", una aplicación web concebida para brindar autonomía a usuarios con discapacidades visuales en la exploración de documentos digitales. Se detalla la estructura actual del sistema, las decisiones de diseño identificadas a través de la inspección del código fuente y los flujos de interacción principales, culminando con la evaluación de su arquitectura y las áreas de mejora detectadas.

## Estilo Arquitectónico y Tecnologías

El sistema se fundamenta en un estilo arquitectónico de **Aplicación de Página Única (SPA)** enfocada en una **Arquitectura Basada en Componentes**. La totalidad de la lógica de negocio y presentación se ejecuta del lado del cliente (navegador web), eliminando la dependencia de servidores de aplicaciones para su funcionamiento durante la ejecución, operando de manera estática.

El ecosistema tecnológico verificado en la construcción del sistema incluye:
*   **Framework Base:** React (versión 19).
*   **Lenguaje de Programación:** TypeScript.
*   **Empaquetador y Entorno de Desarrollo:** Vite.
*   **Librerías de Procesamiento Especializado:**
    *   `pdfjs-dist`: Utilizada para el análisis de la estructura del PDF, renderizado de páginas en memoria e identificación de texto.
    *   `tesseract.js`: Empleada para el Reconocimiento Óptico de Caracteres (OCR) cuando el texto nativo del documento no puede ser interpretado, ejecutando el modelo en el cliente.
    *   `@google/generative-ai`: Provee el acceso a modelos de lenguaje grandes (LLMs) multimodales para inferir descripciones semánticas a partir de las imágenes de las páginas del PDF.

## Análisis de Capas y Responsabilidades

Si bien el sistema es monolítico en su despliegue frontend, es posible discernir una separación incipiente de responsabilidades organizadas en:

1.  **Capa de Enrutamiento y Orquestación Global:** Gestionada por el componente raíz (`App.tsx`). Este elemento actúa como controlador principal para la navegación entre estados de la interfaz y como oyente global para interceptar eventos de teclado, asegurando que la retroalimentación auditiva esté sincronizada con la interacción del usuario sin depender exclusivamente del lector de pantalla del sistema operativo.
2.  **Capa de Vistas:** Constituida por los componentes de páginas (`HomePage.tsx` y `PdfReaderPage.tsx`). Éstas son responsables de estructurar la semántica de la interfaz y gestionar el estado local.
3.  **Capa de Servicios Locales:** Abstracciones encapsuladas en *hooks* de React (como `useSpeech.ts`), las cuales funcionan como adaptadores (patrón *Adapter*) sobre APIs nativas del navegador, aislando la complejidad técnica de la síntesis de voz de la lógica de la interfaz visual.

## Evaluación de Atributos de Calidad

A partir de la inspección estática del código, se infieren los siguientes niveles para atributos clave:

*   **Accesibilidad (Muy Alto):** El diseño incorpora soporte nativo para navegación por teclado, manipulación de foco y *feedback* auditivo orquestado, minimizando barreras de entrada.
*   **Mantenibilidad (Medio):** Aunque se reutilizan ciertos servicios (Web Speech), existe un alto acoplamiento en componentes principales (`PdfReaderPage.tsx`), donde cohabita lógica de renderizado, procesamiento de imágenes, OCR, peticiones a APIs externas y manejo de estado. Este acoplamiento (conocido como *God Object*) eleva la complejidad ciclomática y reduce la modularidad.
*   **Seguridad (Crítica):** Debido a que se trata de un cliente estático ("Client-side only") que invoca servicios externos con facturación y autenticación (Google Gemini), las credenciales (API Keys) residen y se exponen ineludiblemente en el código cliente. Esto representa un riesgo severo que compromete el despliegue público en entornos productivos.

## Conclusión del Análisis

La arquitectura implementada en el sistema satisface eficazmente los requisitos funcionales de la herramienta a un nivel de Producto Mínimo Viable (MVP). Utiliza recursos computacionales distribuidos en el cliente para tareas complejas como el OCR. No obstante, para alcanzar un nivel de madurez productiva, la arquitectura demanda una transición hacia un modelo cliente-servidor (o servidor *serverless* intermedio) para garantizar la seguridad de los secretos, y una refactorización estructural aplicando el principio de Responsabilidad Única para desacoplar el procesamiento asíncrono de documentos del ciclo de vida de los componentes visuales.
