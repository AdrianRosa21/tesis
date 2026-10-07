# TESIS — AURA: lector de PDF accesible con IA multimodal

> Esta carpeta es la tesis completa del proyecto AURA, escrita para que la lea una persona **o una IA que la vaya a analizar**.
> Todo lo que afirma sale del código y de los resultados de este repositorio. Lo que no está medido está marcado.
>
> Estado del documento: **7 de octubre de 2026**. Código de referencia: rama `main`, commit `9ddc001` (etiqueta `demo-cimat`).
> Repositorio: <https://github.com/AdrianRosa21/tesis> · Aplicación: <https://aurapdf-one.vercel.app>

## 1. Qué es AURA en un párrafo

AURA es una aplicación web para personas con discapacidad visual severa. Convierte cada página de un PDF en una imagen, un modelo
de visión + lenguaje la describe con una estructura fija (texto, tablas, gráficas, diagramas, imágenes, dudas) y el navegador la lee
en voz alta, elemento por elemento, con el idioma correcto de cada línea. Se controla solo con el teclado. El sistema está construido
alrededor de **Ollama** y un modelo abierto (`qwen2.5vl`) en una GPU propia; además existe un modo opcional (`hybrid`) donde un
modelo en la nube lee la página y Ollama detecta el contenido y sirve de respaldo.

## 2. Orden de lectura

| # | Archivo | Qué responde |
|---|---|---|
| 00 | [`00_portada_y_resumen.md`](00_portada_y_resumen.md) | Portada, resumen, abstract y palabras clave |
| 01 | [`01_introduccion.md`](01_introduccion.md) | ¿Qué problema se resuelve, para quién y con qué objetivos y preguntas? |
| 02 | [`02_marco_teorico.md`](02_marco_teorico.md) | ¿Qué conceptos hacen falta (PDF, OCR, VLM, salida estructurada, prompts, voz, accesibilidad)? |
| 03 | [`03_arquitectura.md`](03_arquitectura.md) | ¿Cómo está armado el sistema, dónde corre cada parte y por qué? |
| 04 | [`04_pipeline_de_ia.md`](04_pipeline_de_ia.md) | ¿Cómo se convierte una imagen de página en elementos legibles? (v3, v4, hybrid) |
| 05 | [`05_frontend_y_accesibilidad.md`](05_frontend_y_accesibilidad.md) | ¿Cómo se usa sin ver la pantalla? Teclado, voz, idioma, velocidad |
| 06 | [`06_backend_seguridad_y_observabilidad.md`](06_backend_seguridad_y_observabilidad.md) | Endpoints, claves, límites, caché, logs, privacidad por modo |
| 07 | [`07_metodologia_de_evaluacion.md`](07_metodologia_de_evaluacion.md) | Corpus, rúbrica, runner, criterio de aprobación y sus sesgos |
| 08 | [`08_resultados.md`](08_resultados.md) | Cifras medidas, con el archivo de donde sale cada una |
| 09 | [`09_discusion_limitaciones_y_etica.md`](09_discusion_limitaciones_y_etica.md) | Qué significan los resultados, qué no prueban y qué riesgos éticos hay |
| 10 | [`10_conclusiones_y_trabajo_futuro.md`](10_conclusiones_y_trabajo_futuro.md) | Conclusiones y siguientes pasos |
| 11 | [`11_reproducibilidad.md`](11_reproducibilidad.md) | Cómo correr todo y repetir las pruebas |
| 12 | [`12_bitacora_de_ingenieria.md`](12_bitacora_de_ingenieria.md) | Línea de tiempo, modelos probados, problemas reales y cómo se resolvieron |
| 13 | [`13_matriz_de_evidencia.md`](13_matriz_de_evidencia.md) | Cada afirmación importante → archivo que la respalda → cómo comprobarla |
| 14 | [`14_glosario_y_referencias.md`](14_glosario_y_referencias.md) | Términos y fuentes |

## 3. Convenciones de marcado

| Marca | Significa |
|---|---|
| **[MEDIDO]** | Cifra obtenida con una ejecución guardada en `test-results/` o con una prueba que se puede repetir. Siempre dice de dónde sale. |
| **[PENDIENTE]** | No se ha medido o no se ha hecho todavía. No debe tomarse como resultado. |
| **[VERIFICAR]** | Dato tomado de una fuente externa o de memoria que conviene confirmar antes de citarlo como definitivo. |
| **[COMPLETAR]** | Dato que solo el autor conoce (nombre, institución, asesor, fechas formales). |

## 4. Guía para quien analice esta tesis (persona o IA)

**Preguntas que este material permite contestar con evidencia**
- ¿La arquitectura protege las claves y limita el abuso? (capítulos 03 y 06, archivos `api/describe-image.js` y `fastapi_backend/`).
- ¿El pipeline impone reglas de fidelidad en el código y no solo en el prompt? (capítulo 04, `normalize.py`, `schemas.py`, pruebas).
- ¿Qué tan bien lee páginas con tablas, gráficas, diagramas e imágenes? (capítulo 08, con sus límites en el 09).
- ¿Se puede reproducir? (capítulo 11, scripts `restaurar_pod.sh`, `run_fidelity_corpus.py`, `smoke_demo.py`).

**Cómo comprobar sin confiar en el texto**
1. Pruebas automáticas (sin red ni claves): `python -m unittest fastapi_backend.test_prompt_policy fastapi_backend.test_cloud_pipeline fastapi_backend.test_api fastapi_backend.test_tts` → **145 pruebas, OK** (2 omitidas: las de Piper real) y `npm test` → **139 pruebas, OK**. Ambas se ejecutaron el 7 de octubre de 2026 al escribir este capítulo.
2. Los resultados crudos de cada medición están en `test-results/*.json` (campos `results[].description`, `automated_status`, `duration_seconds`, `summary`).
3. La matriz [`13_matriz_de_evidencia.md`](13_matriz_de_evidencia.md) enlaza cada afirmación con su archivo.

**Sesgos y límites que conviene revisar primero** (detalle en los capítulos 07 y 09)
1. **La revisión manual de los resultados la hizo una IA asistente con la rúbrica, no una persona ciega ni un segundo evaluador humano.** El número 26/27 (96.3 %) debe leerse con eso en mente.
2. **El corpus G se usó en parte como conjunto de desarrollo** (dos reglas del prompt en la nube se escribieron tras ver fallos de G13 y G04). Por eso 96.3 % sobrestima la generalización; las páginas reales del INEGI, CIMAT y otros no se usaron para ajustar el prompt y son mejor evidencia.
3. **No hay pruebas con usuarios con discapacidad visual.** Es la limitación más importante.
4. **La comparación limpia v3 / v4 / hybrid con el mismo corpus no está completa** [PENDIENTE]: v3 se midió en F01–F12; hybrid en F+G; v4 solo de forma parcial.
5. **Cada medición declara el motor que la produjo.** La línea base de 58.3 % es Ollama (v3); el 96.3 % es el modo `hybrid` con un modelo en la nube (`gpt-4.1-mini`) y Ollama como detector. No son comparables como si fueran el mismo sistema.
6. **Privacidad:** en el modo `hybrid` cada página se envía a un tercero. Solo `v4` y `v3` la mantienen en el servidor propio (capítulos 06 y 09).
7. Un solo modelo local, un solo modelo en la nube, un solo tipo de pod y una sola persona que opera el sistema.

**Afirmaciones que NO se deben inferir de esta tesis**
- Que AURA sea apta para uso con personas ciegas sin supervisión (no se ha probado con ellas).
- Que el modo local alcance la calidad del modo `hybrid` (no hay medición completa que lo muestre).
- Que los costos sean estables (los precios del proveedor y de la GPU cambian; ver capítulo 08).

## 5. Datos de autoría

- Autor: **[COMPLETAR nombre completo]**
- Institución / programa: **[COMPLETAR]** (bachillerato en Desarrollo de Software)
- Asesor(a): **[COMPLETAR]**
- Fecha de entrega: **[COMPLETAR]**
