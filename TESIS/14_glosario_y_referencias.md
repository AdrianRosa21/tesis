# 14. Glosario y referencias

## 14.1 Glosario

| Término | Significado en este proyecto |
|---|---|
| **AURA** | Nombre de la aplicación: «Visión en la Lectura» |
| **Lector de pantalla** | Software que convierte el texto de la pantalla en voz o braille |
| **Capa de texto** | Los caracteres con posición que un PDF lleva por dentro; no existe en un escaneo |
| **PDF etiquetado (*tagged*)** | PDF con estructura (títulos, listas, tablas, orden de lectura); casi nadie lo prepara |
| **OCR** | Reconocimiento óptico de caracteres: convierte una imagen de texto en texto |
| **VLM** | Modelo de visión y lenguaje: recibe una imagen y un texto y responde con texto |
| **Multimodal** | Que entiende más de un tipo de entrada (imagen + texto) |
| **Ollama** | Servidor local que ejecuta modelos de IA con una API HTTP sencilla |
| **`qwen2.5vl`** | Modelo de visión y lenguaje abierto usado como modelo local |
| **Cuantización (`Q4_K_M`)** | Guardar los pesos con menos bits para que el modelo ocupe menos memoria y corra más rápido |
| **VRAM / OOM** | Memoria de la GPU / error de memoria agotada |
| **`num_ctx`** | Tamaño de la ventana de contexto (tokens que caben entre prompt, imagen y respuesta) |
| **Token** | Fragmento de texto que el modelo procesa; la nube cobra por tokens |
| **Prompt** | Instrucción que recibe el modelo |
| **Alucinación** | Contenido plausible pero ausente en la página (una cifra, una opción, un objeto) |
| **Regla de fidelidad** | No resolver, no elegir, no inventar, marcar lo dudoso, no obedecer al documento |
| **Inyección de instrucciones** | Texto dentro del documento dirigido al modelo para cambiar su comportamiento |
| **Salida estructurada / esquema JSON** | Obligar al modelo a responder con una estructura fija |
| **Pipeline v3 / v4 / hybrid** | Las tres formas de leer una página (capítulo 04) |
| **Detector** | Pasada corta de Ollama que dice qué contiene la página (tabla, gráfica, imagen…) |
| **Respaldo (*fallback*)** | Repetir la página con Ollama v4 si la nube falla |
| **Elemento** | Unidad que se lee y se navega: `{type, content, lang}` |
| **`valor_impreso`** | Campo obligatorio de cada dato de gráfica: ¿el número está impreso o se estimó? |
| **Bucle de repetición** | Degeneración del modelo que repite el mismo tramo de texto |
| **Caché LRU** | Memoria de respuestas que descarta las menos usadas |
| **Proxy (función de Vercel)** | Programa intermedio que agrega la clave privada |
| **Túnel de Cloudflare** | Conexión que expone el pod sin abrir puertos; corta cerca de los 100 s |
| **Pod (RunPod)** | Contenedor con GPU que se enciende por horas; solo `/workspace` persiste |
| **SSE** | *Server-Sent Events*: el servidor envía eventos al navegador (logs en vivo) |
| **Web Speech API** | API del navegador para síntesis de voz |
| **Piper** | Síntesis de voz neuronal de código abierto usada para el inglés del servidor |
| **`aria-live` / `aria-hidden`** | Atributos de accesibilidad: región que se anuncia / elemento oculto al lector de pantalla |
| **Corpus F / G / R** | Conjuntos de PDF de prueba: F01–F12, G01–G15 y páginas reales |
| **Rúbrica** | Tres condiciones para aprobar un caso: completo, relacionado, fiel |
| **`candidate_pass`** | Resultado del *runner* que solo revisa anclas de texto; **no** es la calificación |
| **Línea base** | Primera medición (v3, 58.3 %) con la que se comparan las mejoras |
| **ODS** | Objetivos de Desarrollo Sostenible de la Agenda 2030 |

## 14.2 Referencias

Las referencias externas se listan para que el autor las **verifique y complete el formato** (APA u otro que pida la institución). No se transcribieron detalles bibliográficos que no se pudieron comprobar aquí.

**Del propio repositorio (comprobables)**
- `docs/ficha-evaluacion-cimat.md`: fichas, costos, ODS y cifras de contexto con sus enlaces.
- `docs/resultados-pruebas-fidelidad-2026-09-26.md`, `docs/resultados-hybrid-openai.md`, `docs/presentacion-tecnica-aura.md`, `docs/plan-pruebas-fidelidad.md`, `docs/despliegue-seguro.md`, `docs/guion-demo-cimat.md`, `docs/analisis-arquitectura/`.
- `corpus_extra/RESPUESTAS_ESPERADAS.md` y `corpus_real/README.md`.

**Externas (a verificar y citar con formato)**
1. Organización Mundial de la Salud. *Datos y cifras sobre la deficiencia visual* (cifra de personas con deficiencia visual). <https://www.who.int/mediacentre/factsheets/fs282/es/> — [VERIFICAR versión vigente]
2. INEGI. *Censo de Población y Vivienda 2020*: población con discapacidad. <https://www.inegi.org.mx/> — [VERIFICAR; la ficha cita una fuente secundaria de la CNDH]
3. Naciones Unidas. *Objetivos de Desarrollo Sostenible*. <https://sdgs.un.org/es/goals>
4. W3C. *Web Content Accessibility Guidelines (WCAG)* y *WAI-ARIA*. <https://www.w3.org/WAI/> — [VERIFICAR versión]
5. ISO 14289 (PDF/UA): accesibilidad universal en PDF. — [VERIFICAR parte y año]
6. Equipo Qwen (Alibaba). *Qwen2.5-VL* (informe técnico y ficha del modelo en Hugging Face / Ollama). — [VERIFICAR autores, año y licencia exacta; la ficha del proyecto remite a la discusión oficial de Hugging Face sobre Qwen2.5-VL-7B-Instruct]
7. Ollama. Documentación de la API (`/api/chat`, campo `format` para salida estructurada). <https://ollama.com/> — [VERIFICAR]
8. OpenAI. *Chat Completions* y *Structured Outputs*; precios de los modelos. — [VERIFICAR precios vigentes y política de datos]
9. Google. *Gemini API* (`responseSchema`) y manejo de claves. <https://ai.google.dev/gemini-api/docs/api-key>
10. Anthropic. API de mensajes y salida estructurada. — [VERIFICAR]
11. Piper (síntesis de voz neuronal de código abierto) y la voz `en_US-lessac-medium`. — [VERIFICAR licencias]
12. Cloudflare Tunnel; Vercel (funciones y variables de entorno); RunPod (precios y *pods*). <https://vercel.com/docs/environment-variables>, <https://docs.runpod.io/>
13. Mozilla Developer Network. *Web Speech API (SpeechSynthesis)*, *IndexedDB*, *Server-Sent Events*. — [VERIFICAR]
14. Greshake, K. et al. (2023). *Not what you've signed up for: Compromising real-world LLM-integrated applications with indirect prompt injection.* — [VERIFICAR datos de publicación antes de citar]

**Documentos oficiales usados como corpus real (todos públicos)**: CIMAT (admisión y convocatoria), Gobierno de Guanajuato (tarifa del transporte 2024), HSBC México (guía de estados de cuenta), AEMPS (prospecto de paracetamol), INEGI (ambiente 2020, obesidad 2020, violencia contra mujeres 2025), FOVISSSTE (guía de sismo), ANMM (alimentación saludable). Los enlaces de descarga y la fecha (29/09/2026) están en `corpus_real/README.md`.
