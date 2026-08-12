# Preguntas Pendientes para Completar Documentación

Durante el análisis estático exhaustivo, se determinaron los aspectos técnicos del sistema; sin embargo, existen piezas de información estratégica, de infraestructura o de requerimientos de negocio que no pueden extraerse exclusivamente examinando el código fuente actual.

Para que el informe arquitectónico alcance su máxima precisión (ideal para anexar o sustentar en una defensa de tesis), es necesario clarificar lo siguiente con los desarrolladores, tutores o stakeholders:

## Relacionado con los Requisitos Funcionales
1.  **Sincronización Visual:** El hook `useSpeech.ts` calcula meticulosamente los índices de caracteres (`start`, `length`) para saber qué palabra exacta se pronuncia, devolviendo la propiedad `highlight`. Sin embargo, `PdfReaderPage` renderiza la página entera dentro de un `<canvas>`, por lo que nunca usa el estado `highlight` para dibujar un resaltador visual de texto sobre las palabras en la pantalla. ¿Estaba planeado implementar una capa superpuesta de texto interactiva sobre el canvas, o fue una característica descartada?
No la eh implementado, Sí la quiero implementar, el resaltador visual. No me dio tiempo de hacerlo.
2.  **Caché y Persistencia:** Actualmente se pierde el progreso si el navegador se cierra accidentalmente, forzando a cargar de nuevo el archivo. ¿Existe algún requerimiento no funcional para guardar el último estado de lectura (página, documento cifrado) en el LocalStorage?
Sí, sí existe un requerimiento no funcional para guardar el último estado de lectura (página, documento cifrado) en el LocalStorage. Pero no me dio tiempo de hacerlo.
3.  **Casos de Borde OCR:** ¿Es intencional que el OCR (Tesseract) sólo se ejecute automáticamente si se detectan menos de 50 caracteres nativos? Esta heurística falla en PDFs híbridos (que tienen grandes tablas o gráficas pero más de 50 caracteres de texto en los subtítulos).

## Relacionado con el Entorno, Despliegue e Infraestructura
4.  **Backend / API Key:** La exposición de la llave `VITE_GEMINI_API_KEY` en el entorno de desarrollo es manejable. ¿Cuál es la estrategia planificada para Producción? ¿Se ha contemplado desarrollar una pequeña API puente en Node.js, Vercel Edge o Python, o se aceptará deliberadamente el riesgo técnico por tratarse de un entorno académico controlado?
Pensaremos, en aplicarlo ya hacia un entorno de producción no hay estrategia, pensabamos crear una API, nosotros, y también LA IA, que escanea las imagenes hacerla nosotros, aunque costaría es un requerimiento que tenemos.
5.  **Costos y Escalabilidad:** El modelo `gemini-flash-latest` tiene costos asociados tras agotar la capa gratuita. ¿Qué sucedería en el flujo si la cuenta vinculada alcanza el límite de solicitudes impuestas por Google o agota sus cuotas económicas? Actualmente el código captura el error genéricamente en un `catch`, pero podría causar un bucle si la IA se queda atascada.
como ahorita solo es simulación(en realidad se hará con una IA real no contemplamos eso)

## Relacionado con Pruebas y Validación
6.  **Validación Empírica:** Dado que el producto se denomina "Lector Accesible", ¿se han ejecutado pruebas de usabilidad con personas reales de la comunidad objetivo utilizando lectores de pantalla nativos (JAWS, NVDA, VoiceOver)? Las alertas generadas por React a veces compiten (hablan al mismo tiempo) con el lector de pantalla propio del sistema operativo si no se desactiva. ¿Cuál es el protocolo de testeo?
Ps nose eso lo vemos dps