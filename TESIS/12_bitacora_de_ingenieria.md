# 12. Bitácora de ingeniería

Este capítulo cuenta **cómo se llegó aquí**: la línea de tiempo, los modelos que se probaron, los problemas reales y cómo se resolvieron.
Se reconstruyó con el historial de git (74 commits al 7/10/2026; etiquetas `pre-cloud-api` y `demo-cimat`) y los documentos de `docs/`.
Las fechas son las de los commits.

## 12.1 Línea de tiempo

| Fecha | Hito | Evidencia |
|---|---|---|
| **12/08/2026** | Primer commit: prototipo funcional con lector offline y persistencia | `ce374ac` |
| 17/08 | Se integra un endpoint de Gemini mediante `fetch` y un analizador JSON robusto | `ec27d43`, `6586979` |
| 08/09 | README con instrucciones de ejecución; `.env` ignorado | `228e926` |
| **17/09** | **Primer backend FastAPI con Ollama local** y mejoras de navegación por voz | `8b74909` |
| 19–20/09 | URL del API dinámica para el despliegue; timeout de Ollama a 300 s para evitar 504; se simplifica el prompt para frenar alucinaciones | `1d3756e`, `c39c967`, `80c23a6` |
| 21/09 | CORS estricto y autenticación por clave; resolución del PDF a 3.0×; temperatura 0.0 para OCR estricto | `2d004c9`, `6084159`, `98c9bf6` |
| **23/09** | **Prueba de modelos de visión** (ver 12.2) y retirada de asteriscos del texto | `6282351` … `608cac8` |
| **26/09** | Estabilización del frontend y backend; **proxy de Vercel**; **pipeline v4** y corpus G01–G15; **primera medición** (línea base 58.3 %) | `f273652`, `158961c`, `ab40fc9` |
| 27/09 | Correcciones del pipeline v4 (bucle F09, clasificador de tablas F06); fin del choque de voces con lectores de pantalla; bienvenida hablada; tutorial por teclado; arreglo de la tecla H | `a3efd08`, `5041d71`, `393232a`, `7800753`, `99f74a3` |
| 28/09 | Bloques largos por oración; **pantalla de logs en vivo** (`debug.html`); **historial de logs persistente** | `79ad39b`, `bf43834`, `3c3703b` |
| 29/09 | Corpus real (documentos públicos) y primera prueba contra v4 | `ecbebc4` |
| **02/10** | **Día de mayor cambio:** backend modular con modo `hybrid` y límite por IP; velocidad de voz con + y −; panel de análisis; proveedores Gemini/OpenAI/Claude; tope diario de la nube; precalentamiento del modelo; resultados `hybrid` 26/27; voz en inglés del servidor (Piper); listas por líneas e idioma por línea | `7ad1fb3`, `4d515a3`, `e7dc412`, `0d88d70`, `6725d57`, `62bacff` |
| 03/10 | Preparación de la demo: restauración con un comando, reinicio automático, prueba de punta a punta y guion | `9ddc001` |
| 04/10 | Pod nuevo restaurado con el *script* (`LISTO`, 75 s); prueba de punta a punta 10/10 | Ver capítulos 8 y 11 |
| 07/10 | Este documento (carpeta `TESIS/`) y el apartado «Acerca del proyecto» del README | — |

## 12.2 Modelos de visión probados en local (23/09/2026)

Según los mensajes de commit, en un solo día se probaron varios modelos en Ollama antes de quedarse con `qwen2.5vl`:

| Orden aprox. | Modelo | Qué se anotó en el commit |
|---|---|---|
| 1 | `minicpm-v` | Se fijó a mano en el código (21/09) |
| 2 | `llama3.2-vision` | Se cambió a él y se añadieron protecciones contra bucles; se «hardcodeó» ignorando el `.env` |
| 3 | `llava` | «Por incompatibilidad de *mllama*»; luego «se niega a procesar» |
| 4 | `minicpm-v` | Se revirtió porque `llava` se negaba a procesar |
| 5 | `qwen2-vl` | «Para precisión absoluta en OCR matemático local» |
| 6 | **`qwen2.5vl`** | Se corrigió el nombre de la etiqueta (`qwen2.5-vl` → `qwen2.5vl`) y quedó como modelo local definitivo |

**Lección:** elegir el modelo por intuición costó un día de pruebas y de *commits* de «hardcodeo». Desde entonces el modelo es una variable (`OLLAMA_MODEL`) y la comparación se hace con el mismo *runner* y corpus.
Pendiente: verificar en `ollama.com/library` qué otros modelos de visión caben en 24 GB y repetir la comparación.

## 12.3 Problemas reales y soluciones

| Problema | Causa | Solución | Estado |
|---|---|---|---|
| **Clave de API en el código público** (Gemini y luego `API_KEY` en el bundle) | Llamadas directas desde el navegador y clave compartida en el frontend | Proxy privado en Vercel; clave solo en variables del servidor | Resuelto; **rotación pendiente** |
| **Salida sin formato** (el modelo no usaba los prefijos `[TEXTO]`…) | Texto libre con prefijos opcionales; el frontend convertía en silencio las líneas sin prefijo | Salida JSON forzada por esquema y normalización en el backend | Resuelto |
| **Tablas, gráficas, diagramas e imágenes fallaban** (línea base) | Un prompt de 15 reglas confunde al modelo | v4: clasificar y aplicar solo las reglas necesarias; esquema con encabezados, filas, datos y conexiones | Resuelto en la lectura preliminar; medición limpia pendiente |
| **Prompt recortado en silencio** | `num_ctx` sin fijar en Ollama | `OLLAMA_NUM_CTX=16384` | Resuelto |
| **Bucle de repetición** (F09) | Temperatura 0 con penalización baja: el modelo repetía el mismo párrafo | Subir la penalización en todo el sistema corrompió palabras y perdió la 2.ª columna (se revirtió). Se creó un detector de bucles **a nivel de palabras** (por línea fallaba porque el modelo no corta la línea en el mismo sitio) | Resuelto (3/3); el modelo igual genera el bucle y se recorta después |
| **Tabla densa leída como «matemáticas»** (F06) | El clasificador se confunde con tablas de solo cifras sin cuadrícula | Prompt de clasificación explícito, doble pasada con OR, reintento forzado si dice «N filas» sin filas, penalización mayor solo en tablas | **Abierto** en local; resuelto con `hybrid` |
| **Regla de «tablas sin cuadrícula» en la nube** | Se supuso que ayudaría con listas con encabezados | Se probó (commit `2680d23`) y **se revirtió** (`7923aa9`: «no tuvo efecto medible») | Resultado negativo registrado |
| **Primera página en pod frío ≈ 87 s** | Carga del modelo en la GPU | Precalentar al arrancar con el mismo `num_ctx` (`AURA_WARMUP`) | Resuelto |
| **Páginas pesadas vs. límite de Cloudflare** (R03: 68.7 s en el backend, 504 a los 79.8 s) | Corte cercano a 100 s | Presupuesto de 80 s y respaldo solo si la nube falla antes del 30 % del presupuesto; en `hybrid` R03 pág. 2 responde en segundos | Mitigado; trabajo asíncrono pendiente |
| **Dos voces a la vez** con lectores de pantalla | `aria-live` + voz propia sobre el mismo texto | `aria-hidden` y diseño autocontenido | Resuelto |
| **Bienvenida sin voz** | `StrictMode` cancelaba el `speak()` y el navegador falla la primera síntesis en frío | Quitar la guarda y reintentar hasta 2 veces | Resuelto |
| **La tecla H abría y cerraba el tutorial** | El oyente recién montado del tutorial también escuchaba H | H solo abre; Escape cierra. Se diagnosticó registrando cada render y el estado de React | Resuelto |
| **Estado «Analizando…» tras el éxito** | `aria-live` no se actualizaba al terminar | Estados accesibles de éxito y error diferenciados | Resuelto |
| **Gráfica sin valores escritos presentada como exacta** (G04) | La instrucción «escribe aprox.» fue ignorada dos veces | Campo obligatorio `valor_impreso`; si es `false`, el código antepone «aprox.» | Resuelto |
| **Semáforo sin decir qué luz está encendida** (G13) | El modelo describía colores, no estados | Regla genérica de estado de partes y hora de relojes | Resuelto |
| **Inglés leído con voz en español** | El navegador no tenía voz en inglés | Voz estadounidense del servidor con Piper y elección de fuente | Resuelto |
| **Voz del servidor más lenta que el tiempo real** | ONNX abría 256 hilos con ~7 CPU de cuota | `AURA_TTS_THREADS=4` | Resuelto |
| **Examen de inglés con instrucciones en español** leído todo con una voz | La etiqueta de idioma era del bloque entero | Idioma por unidad de texto | Resuelto |
| **Listas como un solo bloque** («Arroz 1/3 taza»…) | El modelo las devolvía con saltos de línea | Partir por líneas y por longitud sin separar cantidad de unidad | Resuelto |
| **La nube esperaba 5 s al detector local** | El detector tarda 5–8 s; la nube ≈ 2.5 s | `AURA_DETECT_GRACE_S=1.5`: la mediana bajó de ≈ 7 s a 3.6 s | Resuelto |
| **Pruebas escribían en el historial de producción** | El historial se abría al importar el módulo | Abrirlo en `lifespan` | Resuelto |
| **Producción en 502 tras reiniciar el backend por SSH** (2/10/2026) | La conexión se cortó entre detener el backend y levantarlo | Reiniciar en **un solo comando** (`kill-session` + `new-session`) y confirmar `/api/ready` en la misma llamada; `correr_backend.sh` lo reinicia solo si cae | Resuelto (lección operativa) |

## 12.4 Decisiones que se tomaron y por qué

1. **Pasar de una API comercial en el navegador a una arquitectura propia** (septiembre): seguridad de las claves, control del prompt y del modelo, y costo predecible.
2. **Medir antes de optimizar** (26/09): el *runner* y la línea base de 58.3 % orientaron todo el trabajo posterior.
3. **Separar el backend en módulos** (02/10): `main.py` solo arma la aplicación; pipeline, prompts, esquemas, proveedores, caché, límites y logs viven aparte. Eso permitió agregar proveedores y probarlos sin red.
4. **Mantener el prompt de Ollama intacto al incorporar la nube** (02/10): para que el respaldo se comporte como cuando se midió y la comparación siga siendo válida.
5. **No ajustar el prompt a F11** (borroso): hacerlo habría dado la respuesta del examen y falseado la medición.
6. **Declarar los límites** (capítulos 7 y 9) en vez de ocultarlos: la credibilidad de un número depende de que se sepa cómo se obtuvo.

## 12.5 Dos resultados negativos que vale la pena conservar

- **Subir la penalización de repetición en todo el sistema** para frenar el bucle de F09 corrompió palabras comunes y perdió la segunda columna. Se aprendió a aplicarla **solo cuando hay tabla**.
- **La regla de «tablas sin cuadrícula»** para la nube no mejoró nada medible y se revirtió. Un cambio que no mejora la medición no se conserva por intuición.
