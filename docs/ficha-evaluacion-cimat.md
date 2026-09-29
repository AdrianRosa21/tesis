# AURA — Ficha para la evaluación (CIMAT)

Borrador preparado el 29/09/2026 a partir del repositorio (README, CLAUDE.md, `docs/`, `test-results/`) y de fuentes públicas.
Lo marcado como **[PENDIENTE]** son datos que solo Rodrigo/el equipo saben o que aún no se han medido. No se inventaron.

---

## 1. Problema que resuelve

Los lectores de pantalla leen la capa de texto de un PDF. Fallan (o guardan silencio, o leen desordenado) cuando el PDF es un **escaneo**, tiene **columnas**, **tablas**, **gráficas**, **diagramas**, **fórmulas** o **imágenes**. Una persona con discapacidad visual severa queda sin acceso a material educativo que para el resto es normal.

Contexto con cifras (verificadas en fuentes públicas):
- La OMS estima que al menos **2,200 millones de personas** tienen alguna deficiencia visual, cerca o lejos. ([OMS, datos y cifras](https://www.who.int/mediacentre/factsheets/fs282/es/))
- En México, el Censo 2020 (INEGI) contó **6,179,890 personas con discapacidad (4.9 %)**, y cerca del **44 %** de ellas tiene dificultad para ver aunque use lentes. ([INEGI vía CNDH](https://www.cndh.org.mx/sites/default/files/documentos/2022-02/Violencia_Personas_Discapacidad_1.pdf); confirmar la cifra exacta en el comunicado del INEGI antes de citarla como definitiva.)

> Frase corta para defender: *"Un lector de pantalla lee texto; AURA entiende la página."*

## 2. Objetivos

**General:** permitir que una persona con discapacidad visual severa entienda cualquier página de un PDF, incluso con elementos visuales, usando IA propia y control solo por teclado.

**Específicos**
1. Describir cada página con un modelo multimodal (visión + lenguaje) que corre en infraestructura propia (Ollama + `qwen2.5vl`), sin depender de APIs comerciales.
2. Leer el resultado en voz alta con el TTS del navegador, con orden de lectura correcto.
3. Garantizar **fidelidad**: no resolver ejercicios, no elegir opciones, no inventar, marcar lo dudoso y no obedecer instrucciones escritas dentro del PDF.
4. Lograr al menos **85 % (23 de 27 casos)** en el corpus de fidelidad en 2 ejecuciones.
5. Mantener cada página por debajo de ~90 s (límite del túnel de Cloudflare).
6. Proteger las claves y la privacidad de los documentos.

## 3. Metodología

1. **Análisis y diseño** (`docs/analisis-arquitectura/`): primer prototipo con Gemini y OCR en el navegador; se detectó el riesgo de la clave expuesta y la dependencia de un tercero.
2. **Arquitectura propia en 3 capas:** Frontend React 19 + Vite + TypeScript + pdfjs-dist → proxy en Vercel Function (guarda la clave privada) → backend FastAPI + Ollama en un pod GPU de RunPod, expuesto por túnel de Cloudflare. Controles: API key, límite de 5 MB, caché LRU por SHA-256, `asyncio.Lock` (una página a la vez en la GPU).
3. **Ingeniería de prompts por versiones:**
   - v2/v3: un prompt único con reglas de fidelidad.
   - **v4:** clasifica la página (tabla, gráfica, diagrama, imagen, matemáticas, columnas) → aplica un prompt corto especializado con salida forzada por **esquema JSON** → hace una llamada extra si falta describir una imagen/gráfica/diagrama. `AURA_PIPELINE=v3|v4` permite comparación A/B.
4. **Validación experimental:** corpus de 27 documentos (F01–F12 + G01–G15), runner automático (`scripts/run_fidelity_corpus.py`) con 2 ejecuciones sin caché, 19 pruebas unitarias del backend y **revisión manual con rúbrica** (el runner solo revisa anclas).
5. **Accesibilidad:** control por teclado (F = analizar, H = tutorial), estados anunciados con `aria-live`, evitar choque de voces con lectores nativos, división de textos largos por oración.
6. **Seguridad:** proxy que retira la clave del bundle público, revocación de la clave Gemini antigua (`docs/despliegue-seguro.md`).

## 4. Resultados obtenidos

**Confirmados (con evidencia en el repo)**
- Línea base v3 (26/09/2026): **7/12 = 58.3 %**. Fallos graves en tabla (F05), gráfica (F07), diagrama (F08) e imagen (F10); fallo menor en F11. Los casos de "no resolver ejercicios" (F03, F04) y de instrucción maliciosa (F12) **sí aprobaron**. (`docs/resultados-pruebas-fidelidad-2026-09-26.md`)
- Tiempo por página en las pruebas v4 de 27/09: promedio **≈ 10–20 s**, máximo **≈ 38 s** (`test-results/`), muy por debajo del límite de 90 s.
- Pipeline v4, corpus extra G01–G15, proxy seguro, tutorial por teclado (H), logs en vivo (`debug.html`) y textos largos por oración: implementados y fusionados en `main`.

**Aún no se puede afirmar (honestidad ante el jurado)**
- **No existe todavía una corrida completa de 27 casos × 2 ejecuciones con revisión manual para v4.** Los JSON de `test-results/` de v4 son parciales o de depuración (p. ej. F06/F09 sueltos; G completo con "candidate_pass" 8/30 = 26.7 %, pero ese indicador solo mira anclas automáticas y no es el resultado final). → **[PENDIENTE]** correr F+G completos, calificar con la rúbrica y comparar v3 vs v4.
- **[PENDIENTE]** Pruebas con usuarios reales con discapacidad visual (en el documento de preguntas pendientes quedó como "lo vemos después"). Es la debilidad más visible ante cualquier evaluador; aunque sea una prueba piloto con 2–3 personas o una asociación, conviene tenerla.

> Recomendación: presentar el 58.3 % como **línea base**, la mejora v4 como **hipótesis en validación**, y el resultado final solo cuando esté medido.

## 5. Impacto que puede generar

- **Social:** acceso autónomo a libros, guías, exámenes y artículos sin depender de un lector humano o de PDFs "accesibles" que casi nadie prepara.
- **Educativo:** estudiantes con discapacidad visual pueden usar el mismo material que sus compañeros (tablas, gráficas, diagramas).
- **Técnico/científico:** evidencia comparativa de prompts v3 vs v4 y de fidelidad en modelos de visión pequeños que corren en una GPU de 24 GB.
- **Privacidad y soberanía:** los documentos no se envían a terceros comerciales; el costo es fijo y controlable.
- **Escalable a:** escuelas, bibliotecas, universidades y asociaciones de personas ciegas. **[PENDIENTE]** definir el usuario/institución piloto concreto.

## 6. Viabilidad de implementación

| Aspecto | Evaluación | Por qué / cómo llegar a "Alta" |
|---|---|---|
| Técnica | **Alta** | Ya funciona en producción: frontend en Vercel, API en `api.aura4blinds.online`, IA propia con Ollama. |
| Rendimiento | **Bajo, con mejoras posibles** | Procesa una página a la vez en la GPU (≈ 3 páginas/min, ~20 s por página), así que varios usuarios a la vez hacen cola. *Cómo mejorarlo:* (1) una GPU más potente o un segundo pod que reparta la carga; (2) un modelo más pequeño o cuantizado para acelerar cada página; (3) procesar las páginas siguientes por adelantado mientras el usuario escucha la actual; (4) ampliar la caché para no repetir páginas ya analizadas. |
| Calidad | **Media-alta** | El pipeline v4 (clasifica la página y fuerza salida estructurada) busca corregir los puntos débiles de v3: tablas, gráficas, diagramas e imágenes. Los casos de "no resolver ejercicios" y de instrucciones maliciosas ya aprobaban desde la línea base. Falta la medición final de v4 para subirla a "Alta". |
| Operativa | **Media** | Se puede operar una vez y dejar el pod encendido, pero **no hay presupuesto para mantenerlo despierto por mucho tiempo**. *Cómo llegar a "Alta":* automatizar. Un script o plantilla de RunPod que restaure todo al encender (Ollama, modelo, backend y túnel), y un encendido/apagado automático por horario o bajo demanda, con monitoreo de `/api/health`. |
| Seguridad | **Alta** | Las API keys están ocultas: el navegador nunca las ve porque pasan por un proxy en Vercel. El backend valida la clave, limita el tamaño (5 MB), controla el acceso por origen (CORS) y maneja las peticiones con una cola, así que una sola página usa la GPU a la vez. Los PDFs no se guardan (solo una caché por hash). *Mejora recomendada:* limitar peticiones por IP (rate limiting) y rotar la clave periódicamente. |
| Legal/ético | **Alta** | Todo el software es de código abierto (React, FastAPI, Ollama) y el modelo Qwen2.5-VL también es abierto. Se declara abiertamente que se usa. Nota: la versión que descarga Ollama por defecto (`qwen2.5vl:latest`) es la de 7B, publicada con licencia Apache 2.0, que permite uso libre, incluso comercial. Aun así, si se cambia de modelo o de tamaño, hay que revisar la licencia en su ficha ([discusión oficial en Hugging Face](https://huggingface.co/Qwen/Qwen2.5-VL-7B-Instruct/discussions/31)). |

## 7. Costos aproximados

**Datos reales del proyecto**
- Pod de RunPod (GPU PRO 6000 MIG 24 GB): **US$0.49 por hora**, solo mientras está encendido.
- Disco de 30 GB del pod: unos US$3 al mes encendido (US$0.10/GB/mes, [precio público de RunPod](https://www.runpod.io/pricing-page)).
- Dominio `aura4blinds.online`: **US$1.18 al año** (≈ US$0.10 al mes).
- Vercel: plan gratuito (Hobby) por ahora; Cloudflare Tunnel: gratis. ([Vercel](https://vercel.com/docs/accounts/plans/pro), [Cloudflare](https://alternativeto.net/software/cloudflare-tunnel/about))
- Financiamiento: **no hay**. Lo paga Rodrigo con saldo prepago; hoy tiene cargados unos **US$15**.

**Cuánto dura el saldo actual:** US$15 ÷ US$0.49 ≈ **30 horas de pod encendido** (sin contar disco). Como una demostración de 2 horas cuesta ≈ US$1, alcanza para varias demos y pruebas.

**Escenarios de operación por mes (solo el pod más el disco)**

| Escenario | Horas/mes | GPU | Total aprox. |
|---|---|---|---|
| Demo o evaluación (unas 10 h) | 10 | ≈ US$4.90 | ≈ US$8 |
| Piloto en horario de uso (8 h × 22 días) | 176 | ≈ US$86 | ≈ US$89 |
| Servicio continuo 24/7 | 720 | ≈ US$353 | ≈ US$356 |

Costo por página con la GPU ocupada: ≈ 20 s × US$0.49/h ≈ **US$0.003 por página** (menos de un centavo). El gasto real está en tener la GPU encendida, no en cuántas páginas se leen.

**Costo de desarrollo:** software libre; el costo real es el tiempo del equipo. **[PENDIENTE]** horas dedicadas, si el jurado pide estimarlo.

## 8. Recursos necesarios para instalarlo y operarlo

- **Cómputo:** GPU con ≥ 24 GB de VRAM, 8 vCPU, ≥ 47 GB de RAM y 30 GB de disco (configuración actual). Alternativas: servidor propio de una institución o el modelo con menos VRAM.
- **Software:** Ubuntu, Ollama con `qwen2.5vl`, Python 3.10+ (FastAPI/uvicorn), Node 18+, `cloudflared`.
- **Servicios:** Vercel (frontend + proxy), Cloudflare (túnel y dominio), GitHub, RunPod.
- **Variables/secretos:** `API_KEY`, `AURA_API_KEY`, `AURA_BACKEND_URL`, token del túnel (no van a git).
- **Personas:** 1 responsable técnico que encienda/monitoree el pod (hoy manual); idealmente 1 persona de apoyo en accesibilidad para pruebas con usuarios.
- **Usuario final:** solo un navegador moderno con voz (TTS) y teclado; no instala nada.

## 9. Mantenimiento y costos asociados

| Tarea | Frecuencia | Costo/esfuerzo |
|---|---|---|
| Encender y restaurar el pod (script de restauración) | Cada encendido | ~10–15 min; **automatizable** con una imagen/plantilla propia |
| Actualizar Ollama, modelo, dependencias | Trimestral | Horas de un desarrollador |
| Rotar claves y revisar accesos | Semestral | Bajo |
| Monitoreo de `/api/health` y `/api/ready` | Continuo | Gratuito con un monitor simple |
| Re-ejecutar el corpus tras cada cambio de prompt/modelo | Cada versión | Costo de GPU de ~1 h |
| Rate limiting y cuotas | Una vez, luego revisión | Bajo |
| Correcciones de accesibilidad con usuarios | Continuo | Tiempo del equipo |

## 10. Sostenibilidad a mediano y largo plazo

- **Fortalezas:** software y modelo abiertos, sin costo por licencia; costo fijo y predecible; sin dependencia de un proveedor de IA.
- **Riesgos:** no hay financiamiento hoy: el costo lo cubre una persona con saldo prepago. Mantener el pod encendido todo el mes (≈ US$353) no es posible con ese presupuesto. Además, la operación depende de una sola persona y el modelo actual puede quedar obsoleto (se cambia de modelo y se mide con el mismo runner de pruebas).
- **Cómo se sostiene hoy:** el pod se enciende solo para demostraciones, pruebas y pilotos (≈ US$0.49/h). Con el saldo actual alcanzan unas 30 horas.
- **Rutas para sostenerlo (a decidir)**
  1. **Automatizar el encendido y la restauración** para gastar solo las horas realmente usadas.
  2. **Instituciones posiblemente interesadas** (sin compromiso todavía): escuelas y universidades con estudiantes con discapacidad visual, bibliotecas, asociaciones de personas ciegas y centros de accesibilidad. Podrían aportar cómputo, un servidor propio o pruebas con usuarios. Ejemplos encontrados en fuentes públicas (no hay contacto ni compromiso, hay que confirmar datos antes de mencionarlas como aliadas): Escuela Nacional para Ciegos, Instituto para Ciegos y Débiles Visuales, Instituto para Jóvenes con Discapacidad Visual, Conadis y la red de bibliotecas con servicios para personas con discapacidad visual (unas 22 en 11 entidades, según un estudio de la UNAM). **[PENDIENTE]** elegir cuáles se contactarán. ([CNDH](https://www.cndh.org.mx/sites/default/files/documentos/2024-09/FRN_SEP_20-1.pdf), [UNAM](https://publicaciones.iib.unam.mx/index.php/boletin/article/download/618/607/2430))
  3. **Servidor institucional** (por ejemplo, de una universidad) en lugar de nube por horas.
  4. **Convocatorias de accesibilidad o innovación social**, como opción futura.
  5. **Código abierto:** publicar el proyecto para que otros lo mejoren y lo repliquen.

## 11. Objetivos de Desarrollo Sostenible (Agenda 2030)

| ODS | Meta relacionada | Cómo contribuye AURA |
|---|---|---|
| **ODS 4 — Educación de calidad** (principal) | 4.5 (igualdad de acceso educativo, incluidas personas con discapacidad) y 4.a (entornos de aprendizaje inclusivos) | Hace legible el material educativo en PDF, incluidas tablas, gráficas y fórmulas. |
| **ODS 10 — Reducción de las desigualdades** (principal) | 10.2 (inclusión de todas las personas, sin importar su discapacidad) | Reduce la brecha de acceso a información escrita. |
| **ODS 9 — Industria, innovación e infraestructura** (secundario) | 9.c (acceso a las TIC) | Usa IA abierta y costo fijo, replicable con poca infraestructura. |
| **ODS 8 — Trabajo decente** (secundario, opcional) | 8.5 (empleo para personas con discapacidad) | Facilita leer documentos laborales y de capacitación. |

Conviene defender **4 y 10** como principales; los otros dos, como impactos indirectos. Verificar el texto oficial de cada meta en [la página de la ONU](https://sdgs.un.org/es/goals) antes de citarlas literalmente.

---

## Guion de 1 minuto

"Las personas ciegas no pueden leer muchos PDFs porque los lectores de pantalla solo leen texto: fallan con escaneos, tablas, gráficas y diagramas. AURA toma una captura de cada página, la describe con IA multimodal que corre en nuestra propia GPU y la lee en voz alta, todo por teclado. Medimos la fidelidad con un corpus de 27 documentos; la línea base fue 58 %, y con un pipeline v4 que clasifica la página y fuerza salida estructurada buscamos llegar al 85 %. Opera a US$0.49 por hora de GPU encendida, sin enviar documentos a terceros, y contribuye a los ODS 4 y 10."

## Preguntas que probablemente harán, y qué falta para responderlas

1. *¿Lo probaron con personas ciegas?* → **[PENDIENTE]**, hacer una prueba piloto.
2. *¿Cuánto cuesta al mes?* → el pod cuesta US$0.49/h: ≈ US$89 al mes en un piloto de 8 h × 22 días y ≈ US$356 si está 24/7. Hoy se paga con saldo prepago (sección 7).
3. *¿Qué pasa si usan muchos usuarios a la vez?* → cola de una página a la vez; escalar con más GPUs o más pods.
4. *¿Qué tan seguro es?* → seguridad alta: claves ocultas en un proxy, validación, límite de tamaño y cola de peticiones. Mejora recomendada: rate limiting y rotar la clave.
5. *¿La IA puede equivocarse?* → sí; por eso marca lo dudoso con `[DUDOSO]` y no resuelve ejercicios.
