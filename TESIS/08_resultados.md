# 8. Resultados

Todas las cifras de este capítulo salen de archivos del repositorio y llevan su fuente. Lo que no está medido aparece como **[PENDIENTE]**.
Antes de comparar cifras, recuerda que **cada medición se hizo con un motor distinto** (columna «Motor»).

## 8.1 Resumen de resultados

| Medición | Motor | Corpus | Resultado | Fuente |
|---|---|---|---|---|
| **Línea base** (26/09/2026) | Ollama `qwen2.5vl`, prompt v2/v3 | F01–F12 | **7 de 12 = 58.3 %** (meta inicial 75 %) | `docs/resultados-pruebas-fidelidad-2026-09-26.md` |
| v4, ejecución automática (27/09) | Ollama v4 | F01–F12 × 2 | `candidate_pass` 4/24; 1 error transitorio (504 en F01); de 19 marcadas `review`, 17 sin anclas faltantes. Fallos reales: F06 y F09 | `test-results/fidelity-20260927T062318Z.json` |
| v4, ejecución automática (27/09) | Ollama v4 | G01–G15 × 2 | `candidate_pass` 8/30, sin errores; de 22 `review`, solo G15 con anclas faltantes | `test-results/fidelity-20260927T063205Z.json` |
| Lectura manual preliminar de v4 | Ollama v4 | F + G | Contenido completo y fiel en **24–25 de 27** (hecha por la IA asistente durante el desarrollo; **no** es la calificación formal) | `docs/presentacion-tecnica-aura.md` (diap. 11) |
| **`hybrid`** (02–03/10/2026) | `gpt-4.1-mini` + Ollama detector/respaldo | F01–F12 × 2 | Anclas 22/24; revisión manual **11/12** (falla F11, menor) | `docs/resultados-hybrid-openai.md` |
| **`hybrid`** | igual | G01–G15, corrida final | Anclas 15/15; revisión manual **15/15** | igual |
| **`hybrid` total F + G** | igual | 27 casos | **26/27 = 96.3 %** (meta 85 % = 23/27) | igual |
| `hybrid` en páginas reales (pág. 1) | igual | R01–R13 | Anclas 11/11 (sin revisión manual) | `test-results/openai-paginas-reales.json` |
| Comparación limpia v3 / v4 / hybrid | — | F + G | **[PENDIENTE]** | — |

## 8.2 Línea base v3 (Ollama): qué falló

Resultado por caso (`docs/resultados-pruebas-fidelidad-2026-09-26.md`):

| Caso | Resultado | Motivo |
|---|---|---|
| F01 texto digital | Aprobado | Conservó fechas, horarios, cantidades y acentos |
| F02 escaneado | Aprobado | Leyó el escaneo sin inventar palabras |
| F03 opción múltiple | Aprobado | Leyó preguntas y opciones; **no eligió respuestas** |
| F04 matemáticas | Aprobado | Conservó signos y exponentes; **no calculó** |
| **F05 tabla** | **Fallo grave** | Emitió cada celda como texto aislado; se perdió la relación producto–unidad–precio–existencia |
| F06 tabla extensa | Aprobado | 24 filas con encabezados |
| **F07 gráfica** | **Fallo grave** | Listó valores y trimestres por separado, sin vincular T1–T4 con 120, 155, 140 y 190 |
| **F08 diagrama** | **Fallo grave** | Leyó etiquetas sueltas; omitió posiciones, flechas y relaciones |
| F09 columnas | Aprobado | Leyó la columna izquierda y luego la derecha |
| **F10 imagen** | **Fallo grave** | Transcribió el texto de la instrucción, pero no describió montañas, sol, casa ni composición |
| F11 borroso | Fallo menor | Expresó la duda (`18? o 13?`) pero no usó `[DUDOSO]` |
| F12 instrucción maliciosa | Aprobado | La transcribió y **no la obedeció** |

**Lectura:** los tres casos de «no resolver / no obedecer» (F03, F04, F12) aprobaron ya con el prompt único. Los fallos se concentraron en **estructura visual**: tablas, gráficas, diagramas e imágenes. Eso motivó v4 y el esquema JSON.

Anomalías adicionales de esa corrida: el modelo incumplía con frecuencia el contrato de prefijos (F01, F02, F03, F06, F08, F09 y F10) y el frontend lo ocultaba al convertir cada línea sin prefijo en texto; el estado visible podía quedar en «Analizando…» tras el éxito; y la clave de API estaba en el bundle público. Todo se corrigió después (capítulo 12).

## 8.3 v4 sobre Ollama: avances y fallos abiertos

(`docs/presentacion-tecnica-aura.md`, diapositivas 9 y 11, y los JSON de `test-results/`)

- **Tiempo por página (27/09):** F, promedio 14.6 s y máximo 38.2 s; G, promedio 14.3 s y máximo 20.5 s.
- **F09 (bucle de repetición):** resuelto con un detector de bucles a nivel de palabras; pasó 3 de 3 corridas (`…T070609Z.json`). Costo: el modelo igual genera el bucle (≈ 28 s en vez de ≈ 12 s) y solo se recorta después.
- **F06 (tabla densa leída como «matemáticas»):** **abierto**. La clasificación ya acierta, pero la extracción a veces devuelve solo el resumen. Una corrida transcribió las 24 filas y no se pudo reproducir (`…T065414Z.json`).
- **Páginas reales (29/09, v4):** 7 páginas, 2 correctas, 3 parciales y 2 fallidas (R03, tabla de 33 filas: 68.7 s en el backend y 504 a los 79.8 s en el cliente; R07, gráfica de barras con 10 datos: solo dio 2, mal asignados, y agregó una gráfica inexistente). Punto débil: **gráficas con varias series**; el modelo completa lo que no alcanza a leer sin marcar `[DUDOSO]`.

## 8.4 `hybrid` (nube + detector local)

**Configuración** (`docs/resultados-hybrid-openai.md`): `AURA_PIPELINE=hybrid`; modelo en la nube **OpenAI `gpt-4.1-mini`** (Chat Completions, salida JSON estricta, imagen `detail=high`); detector y respaldo Ollama `qwen2.5vl`; GPU del pod NVIDIA RTX PRO 6000 (MIG 24 GB); imagen de 1600 px de ancho; código en el commit `86fdf0a`.

| Corpus | Anclas automáticas | Revisión manual con la rúbrica | Tiempo promedio por página |
|---|---|---|---|
| F01–F12 × 2 corridas | 22 / 24 | **11 / 12** (falla F11) | 7.1 s |
| G01–G15, corrida final | 15 / 15 | **15 / 15** | 7.1 s |
| **Total F + G** | | **26 / 27 = 96.3 %** | |
| R01–R13 (pág. 1) | 11 / 11 | no revisado a mano | 7.2 s |

Con `hybrid` salen correctos los casos que fallaban en la línea base (F05 tabla, F07 gráfica, F08 diagrama, F10 imagen) y también la tabla extensa F06; **sigue fallando F11**.

### Páginas reales con gráficas (no se usaron para ajustar el prompt)

Verificadas contra cifras que el propio documento cita en su texto o contra su capa de texto:

| Página | Qué contiene | Verificación |
|---|---|---|
| R08 pág. 2 | Líneas: 3 series × 5 años (15 valores) | 2020 y 2024 de mujeres y hombres (22.5, 19.3, 22.2, 19.6) coinciden con el texto de la pág. 1 |
| R08 pág. 3 | Barras: 13 situaciones × 2 sexos (26 valores) | 29.0 / 13.9 y 27.5 / 15.8 coinciden con el texto de la pág. 1 |
| R07 pág. 2 | Barras: 5 grupos de edad × 2 sexos (10 valores) | 26, 46, 24, 35, 40 y 26 (= 40 − 14) coinciden con el texto de la página |
| R07 pág. 3 | Nota técnica (texto) | 2 772 caracteres devueltos vs. 2 785 en la capa de texto del PDF |
| R03 pág. 2 | Tabla de tarifas | 33 filas de precios = 33 líneas con precio en el PDF |

Las 9 páginas respondieron con la nube, sin usar el respaldo local, entre 4.0 s y 10.3 s. **Lectura:** las páginas que en v4 fallaron (R03, R07, R08) salen verificables con `hybrid`.

### Ajustes que salieron de las pruebas (solo en el prompt y esquema de la nube)

1. **G13** describía los colores de un semáforo sin decir cuál luz estaba encendida → regla genérica de estado y hora de relojes.
2. **G04** (barras sin valores escritos) daba estimaciones como exactas. Una instrucción de texto («escribe aprox.») fue ignorada dos veces; se reemplazó por un campo obligatorio `valor_impreso` por dato, y si es `false` se lee «aprox. N». Verificado: G04 → «aprox. 40, 25, 60, 15»; G02, G03 y G15 (con números impresos) no llevan «aprox.».

**Lección metodológica:** una restricción **en el esquema** (campo obligatorio) se respeta mucho más que una **instrucción en lenguaje natural**.

## 8.5 Velocidad

| Medición | Resultado | Fuente |
|---|---|---|
| `hybrid` en las corridas de F y G (espera de 5 s al detector) | ≈ 7.1 s por página | `resultados-hybrid-openai.md` |
| `hybrid` tras reducir la espera al detector a 1.5 s, por la URL pública (Vercel → Cloudflare → backend → nube), 6 páginas | **mediana 3.6 s, máximo 5.3 s** | igual (commit `949ccc8`) |
| Prueba de punta a punta del 4/10/2026 (`smoke_demo.py`, 6 tipos de página, por la URL pública) | 4.2 a 7.3 s por página; 10/10 comprobaciones bien, 0 avisos, 0 fallas, 40 s en total | ejecución del 4 de octubre de 2026 |
| Ollama (v4) | 10 a 20 s por página en el mismo pod | `resultados-hybrid-openai.md` |
| Primera página en un pod frío (sin precalentar) | ≈ 87 s | igual; mitigado con `AURA_WARMUP` |

La calidad **no se volvió a medir** tras reducir la espera del detector (de 5 s a 1.5 s), porque ese cambio no toca lo que lee la nube, solo cuánto se espera a la clasificación de Ollama.

## 8.6 Costo

- **Nube:** con 108 llamadas medidas por el backend (entrada 6 458 tokens en promedio, máx. 7 301; salida 307, máx. 1 282) y los precios publicados de `gpt-4.1-mini` (US$0.40 y US$1.60 por millón de tokens) resulta **≈ US$0.0031 por página** (US$0.33 las 108 llamadas). Es una estimación con precios publicados; la cifra definitiva está en el panel de facturación del proveedor. [VERIFICAR precios vigentes]
- **GPU:** US$0.49 por hora de pod encendido (`docs/ficha-evaluacion-cimat.md`). Costo con la GPU ocupada en v4: ≈ 20 s × US$0.49/h ≈ US$0.003 por página; el gasto real está en tener la GPU encendida, no en cuántas páginas se leen.
- **Escenarios mensuales (solo pod + disco, ficha §7):** demo de ~10 h ≈ US$8; piloto de 8 h × 22 días ≈ US$89; 24/7 ≈ US$356.

## 8.7 Pruebas automáticas

| Suite | Pruebas | Resultado (7/10/2026) |
|---|---|---|
| Backend (`python -m unittest fastapi_backend.test_prompt_policy fastapi_backend.test_cloud_pipeline fastapi_backend.test_api fastapi_backend.test_tts`) | 145 | OK, 2 omitidas (Piper real) |
| Frontend (`npm test`) | 139 en 13 archivos | OK |

En el pod, la restauración del 4/10/2026 también ejecutó las 145 del backend (`Ran 145 tests … OK`) antes de levantar el servicio.

## 8.8 Restauración del servidor

El 4 de octubre de 2026 se restauró un pod nuevo (contenedor limpio) con `scripts/restaurar_pod.sh`: ≈ 75 s en total (13:48:52 → 13:50:07 hora del pod), 9 pasos, pruebas del backend en verde,
`GET /api/ready` local y público respondiendo `hybrid`, y la prueba de punta a punta en verde. La documentación previa estimaba 10–15 minutos de restauración manual y ≈ 3 minutos con el *script*.

## 8.9 Lo que NO se midió

- Comparación limpia v3 / v4 / hybrid con el mismo corpus, dos evaluadores y las mismas condiciones **[PENDIENTE]**.
- Pruebas con personas con discapacidad visual **[PENDIENTE]**.
- Documentos completos (el *runner* evalúa la primera página de cada PDF).
- Concurrencia: varios usuarios a la vez (hay una sola GPU y una página a la vez en Ollama).
- Calidad de `hybrid` tras reducir la espera al detector (cambio sin efecto esperado sobre la lectura de la nube).
