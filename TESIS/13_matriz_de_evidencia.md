# 13. Matriz de evidencia y discrepancias

Cada afirmación importante de la tesis, el archivo que la respalda y cómo comprobarla. Sirve para que una persona o una IA verifique sin confiar en el texto.
Estados: **Verificado** (se repitió el 4–7/10/2026), **Documentado** (la fuente es un archivo del repositorio, no se repitió hoy) y **Pendiente**.

## 13.1 Matriz

| ID | Afirmación | Evidencia | Cómo comprobarla | Estado |
|---|---|---|---|---|
| E01 | 145 pruebas del backend pasan (2 omitidas) | `fastapi_backend/test_*.py` | `python -m unittest fastapi_backend.test_prompt_policy fastapi_backend.test_cloud_pipeline fastapi_backend.test_api fastapi_backend.test_tts` | Verificado 7/10 (y en el pod el 4/10) |
| E02 | 139 pruebas del frontend pasan en 13 archivos | `src/**/*.test.ts[x]` | `npm test` | Verificado 7/10 |
| E03 | Línea base v3: 7/12 = 58.3 % (fallan F05, F07, F08, F10; F11 menor) | `docs/resultados-pruebas-fidelidad-2026-09-26.md`, `test-results/fidelity-20260926T194238Z.json` | Leer la matriz del documento y `results[]` del JSON | Documentado |
| E04 | `hybrid` aprueba 26/27 (96.3 %) con revisión manual de la IA asistente | `docs/resultados-hybrid-openai.md`, `test-results/fidelity-openai-F-2runs.json`, `fidelity-openai-G-run*.json` | Repetir `run_fidelity_corpus.py` y calificar con la rúbrica | Documentado |
| E05 | El modo `hybrid` envía cada página al proveedor en la nube | `fastapi_backend/pipeline.py › run_hybrid`, `providers/openai_chat.py` | Leer `run_hybrid` (la imagen va en la llamada a `cloud.generate`); `GET /api/ready` muestra `provider` | Verificado en código |
| E06 | Sin clave de la nube el backend usa v4 automáticamente | `config.py › Settings.effective_pipeline`, prueba `test_cloud_pipeline` | `curl /api/ready` sin clave → `pipeline: v4` | Verificado en código y pruebas |
| E07 | El motor real de cada página se informa en la respuesta, el panel y el log | `main.py` (`_describe_engine`, `response_body`), `src/components/AnalysisDetail.tsx`, `logbus.py` | `POST /api/describe-image` → campos `provider`, `model`, `detector`; `debug.html` | Verificado en código |
| E08 | La clave no está en el navegador en producción | `api/describe-image.js`, `src/utils/ai.ts` (`import.meta.env.DEV`) | Inspeccionar el *bundle* de producción en busca de `x-api-key` | Verificado en código |
| E09 | Límite por IP (30/min), 5 MB, caché SHA-256 (128), una página a la vez en Ollama | `ratelimit.py`, `main.py`, `cache.py` | Pruebas en `test_api.py` | Verificado en código y pruebas |
| E10 | Tope diario de páginas a la nube | `budget.py`, `pipeline.py` | `GET /api/ready` → `cloud_pages_today`, `cloud_daily_limit` (400 el 4/10) | Verificado el 4/10 |
| E11 | Respaldo a Ollama si la nube falla antes del 30 % del presupuesto | `pipeline.py › _fallback_or_raise` | Pruebas del respaldo en `test_cloud_pipeline.py` | Verificado en código y pruebas |
| E12 | El detector de bucles trabaja a nivel de palabras | `normalize.py › collapse_repeated_lines` | Pruebas en `test_prompt_policy.py` | Verificado en código y pruebas |
| E13 | Valores de gráficas estimados se leen «aprox.» | `schemas.py` (`valor_impreso`), `normalize.py › _chart_value` | Prueba del caso G04 / unitaria | Verificado en código; G04 documentado |
| E14 | Los ejemplos del prompt de la nube no filtran respuestas del corpus | `test_cloud_pipeline.py › test_cloud_rules_do_not_leak_benchmark_answers` | Ejecutar esa prueba | Verificado |
| E15 | Mediana de 3.6 s por página con `hybrid` por la URL pública (6 páginas) | `docs/resultados-hybrid-openai.md` (commit `949ccc8`) | Repetir con `smoke_demo.py` | Documentado; consistente con 4.2–7.3 s del 4/10 |
| E16 | Prueba de punta a punta: 10/10, 0 avisos, 0 fallas (40 s) | `scripts/smoke_demo.py` | `python scripts/smoke_demo.py` | Verificado 4/10 |
| E17 | Costo ≈ US$0.0031 por página (108 llamadas) | `docs/resultados-hybrid-openai.md` | Revisar el panel de facturación del proveedor | Documentado (estimación con precios publicados) |
| E18 | Restauración de un pod nuevo en ≈ 75 s con `restaurar_pod.sh` | `scripts/restaurar_pod.sh` | Ejecutarlo en un pod nuevo (log con 9 pasos y `LISTO`) | Verificado 4/10 |
| E19 | El tutorial tiene 12 pasos | `src/pages/TutorialPage.tsx › TUTORIAL_STEPS` | Contar el arreglo | Verificado en código |
| E20 | La imagen enviada se reduce a ≤ 1600 px de ancho (JPEG 0.9) | `src/utils/ai.ts › optimizeImage` | Leer la función | Verificado en código |
| E21 | Las gráficas reales R07/R08 con `hybrid` coinciden con cifras del propio texto | `docs/resultados-hybrid-openai.md`, `test-results/openai-paginas-reales.json`, `corpus_real/` | Comparar los valores devueltos con la pág. 1 del PDF | Documentado |
| E22 | F03, F04 y F12 (no resolver, no obedecer) aprueban en todas las versiones | `docs/resultados-pruebas-fidelidad-2026-09-26.md`, `docs/resultados-hybrid-openai.md` | Ver los casos en los JSON | Documentado |
| E23 | No hay pruebas con personas con discapacidad visual | Ausencia de evidencia | — | **Pendiente** |
| E24 | Comparación limpia v3 / v4 / hybrid con el mismo corpus | Ausencia de evidencia | — | **Pendiente** |
| E25 | Revisión manual formal con rúbrica por el autor / segundo evaluador | Ausencia de evidencia | — | **Pendiente** |
| E26 | Rotación de `API_KEY` y revocación de claves expuestas | Ausencia de evidencia | — | **Pendiente** |

## 13.2 Discrepancias detectadas en la documentación existente

Al escribir esta tesis se contrastó la documentación con el código. Estas diferencias deben corregirse en los documentos de origen antes de entregarlos:

| # | Documento | Dice | El código / la evidencia dice | Acción sugerida |
|---|---|---|---|---|
| D1 | `docs/presentacion-tecnica-aura.md` (diap. 5) | Tutorial de 10 pasos | 12 pasos (`TutorialPage.tsx`) | Actualizar a 12 |
| D2 | `docs/resultados-hybrid-openai.md` (tabla de configuración) | La app real envía ~1836 px (escala 3.0) | `optimizeImage` reduce a máx. 1600 px | Corregir la nota |
| D3 | `docs/presentacion-tecnica-aura.md` (diap. 13) y `docs/ficha-evaluacion-cimat.md` (§6) | Falta *rate limiting* | Ya existe (`ratelimit.py`, 30/min por IP) | Actualizar; sigue pendiente un límite global |
| D4 | `docs/ficha-evaluacion-cimat.md` (objetivo 1, §5, guion de 1 minuto) | IA propia, «sin depender de APIs comerciales», `hybrid` «sin medición», meta «buscamos llegar al 85 %» | Existe el modo `hybrid` medido (96.3 %) que envía páginas a un proveedor | Actualizar el texto con el modo usado y su implicación de privacidad |
| D5 | `README.md` (líneas 3 y 11) | «IA ejecutada en hardware dedicado» / «un modelo de IA local» | Cierto en v4/v3; en `hybrid` la lectura la hace un modelo en la nube (la tabla «Modos de IA» del mismo README lo aclara) | Matizar la redacción |
| D6 | `docs/presentacion-tecnica-aura.md` (diap. 3) | El modo `hybrid` es «novedad sin medir» | Medido el 2–3/10 | Actualizar |
| D7 | `docs/analisis-arquitectura/12-presentacion-tesis.md` | Describe el prototipo inicial (Gemini + Tesseract en el navegador) | Arquitectura actual distinta | Marcar como histórico |
| D8 | `docs/ficha-evaluacion-cimat.md` (§3 y §6) | «19 pruebas unitarias» | 145 en el backend + 139 en el frontend | Actualizar |

## 13.3 Cómo se escribió esta tesis (transparencia metodológica)

- Los capítulos técnicos se redactaron leyendo el código fuente (`fastapi_backend/`, `src/`, `api/`, `scripts/`) y los documentos de `docs/`; las cifras de resultados se copiaron de esos documentos y de los JSON de `test-results/`, sin recalcularlas salvo las pruebas automáticas, que se volvieron a ejecutar.
- La redacción y la revisión de coherencia las hizo una IA asistente (Claude) a petición del autor; **el autor debe revisarla, completar los datos marcados [COMPLETAR] y [VERIFICAR] y hacerse responsable de su contenido**.
- No se inventaron datos: lo que no estaba medido se marcó como **[PENDIENTE]**.
