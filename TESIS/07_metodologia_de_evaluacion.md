# 7. Metodología de evaluación

Pregunta que responde este capítulo: **¿cómo se mide si AURA lee fielmente una página?** El objetivo es que cualquier persona pueda repetir la
medición y juzgar si el número es confiable.

## 7.1 Qué se mide y por qué

La métrica es **fidelidad**, no «bonito sonar». Un caso del corpus **aprueba** solo si cumple, a la vez, tres condiciones (rúbrica de
`corpus_extra/RESPUESTAS_ESPERADAS.md` y `docs/plan-pruebas-fidelidad.md`):

1. **Completo:** aparecen todos los datos críticos visibles (cifras, signos, unidades, opciones, encabezados, etiquetas).
2. **Relacionado:** cada etiqueta va unida a su valor; en los diagramas se respeta la dirección de las flechas; en las tablas, cada celda con su fila y columna.
3. **Fiel:** no inventa elementos, no resuelve ejercicios, no elige opciones, declara la duda (`[DUDOSO]`) y mantiene un orden de lectura comprensible.

Clasificación de cada ejecución: `aprobado`, `fallo menor` o `fallo grave`. Un caso solo cuenta como aprobado si pasa **las dos ejecuciones**
(cuando se hicieron dos). Se registran por separado el navegador o *runner*, el modelo, la versión del prompt y la calidad visual del PDF.

**Meta:** al menos **85 % = 23 de 27 casos** (la meta inicial del plan era 75 %, que luego se elevó a 85 %).

## 7.2 El corpus

| Conjunto | Casos | Dónde está | Origen |
|---|---|---|---|
| **F01–F12** | 12 | Fuera del repositorio: `C:\Users\adria\Downloads\AURA_corpus_pruebas_PDF` | Corpus inicial de fidelidad |
| **G01–G15** | 15 | `corpus_extra/` (con `RESPUESTAS_ESPERADAS.md`) | Generado con `scripts/generate_extra_corpus.py` (determinista) |
| **R01–R08, R11–R13** (R09 y R10 no existen: las páginas de CDMX no respondieron y se sustituyeron por R12 y R13; el PDF de R11, de 66 páginas, está borrado en el árbol de trabajo sin confirmar al 7/10/2026) | páginas reales | `corpus_real/` (con `README.md`) | PDF públicos: CIMAT, Gobierno de Guanajuato, HSBC México, AEMPS, INEGI, FOVISSSTE, ANMM |
| Demo | 9 PDF | `docs/demo/` | Selección numerada para la presentación |

**Matriz de F01–F12** (`docs/plan-pruebas-fidelidad.md`): texto digital de una columna (F01), documento escaneado (F02), pregunta de opción
múltiple (F03), expresión matemática (F04), tabla simple (F05), tabla extensa (F06), gráfica cartesiana (F07), figura geométrica / diagrama (F08),
dos o tres columnas (F09), página mixta con imagen (F10), texto pequeño o borroso (F11) y documento con instrucciones para IA (F12).

**G01–G15:** ilustración, pastel, líneas, barras sin valores escritos, diagrama de flujo, tabla de horario, dos columnas con ícono, mapa, fórmulas
(sin resolverlas), escaneado sin capa de texto, formulario con casillas, diagrama de Venn, dos figuras sin pie, organigrama y barras agrupadas.
Cada uno tiene una respuesta esperada con «debe decir» y «no debe decir» (por ejemplo G09: no puede aparecer ningún resultado de las operaciones).

**Meta de tamaño:** F + G = **27 casos**; 85 % = 23.

**Páginas reales (`corpus_real`):** se eligieron las que tienen información que un lector solo de texto no puede dar: tablas de tarifas (R03), capturas
de pantalla paso a paso (R04), gráficas de barras y líneas con varias series (R07, R08), íconos de una guía de sismo (R12), infografía del Plato del Bien Comer (R13).

## 7.3 El *runner* automático

`scripts/run_fidelity_corpus.py` imita el flujo del navegador y guarda todo en un JSON dentro de `test-results/`:

1. Renderiza la **primera página** de cada PDF a JPEG de 1600 px de ancho (`pdftoppm`; requiere *poppler*) y extrae su capa de texto (`pdftotext`) como contexto.
2. Llama a `POST /api/describe-image` (por defecto `https://api.aura4blinds.online`, o `--api-url`).
3. Hace un **preflight** de salud para no producir lotes falsos si el backend está apagado.
4. Con `--runs N` repite cada caso N veces; con `--fresh-runs` añade metadatos JPEG invisibles para que **la caché no convierta una repetición en una lectura del resultado anterior**.
5. Ejecuta **comprobaciones automáticas** por caso (`CASE_RULES`): anclas de texto obligatorias (`required`) y frases prohibidas (`forbidden`). Resultado: `candidate_pass` o `review`, más `missing_anchors`, `forbidden_matches` y advertencias.
6. Escribe un resumen: total, `candidate_pass`, errores, porcentaje, tiempo promedio y máximo.

**`candidate_pass` NO es la calificación.** Solo comprueba anclas de texto, es decir, la condición 1 de forma parcial. Las condiciones 2 y 3 se confirman **a mano**
leyendo la salida de cada caso. El propio *runner* lo recuerda al terminar. Además, el comprobador espera un prefijo `[TEXTO]/[TABLA]…` por línea; el modo `v4` y `hybrid` devuelven bloques, por lo
que varias ejecuciones aparecen como `review` solo por formato (se corrigió generando `description` con prefijo en cada línea).

Ejemplo (desde la raíz, con *poppler* instalado):

```bash
python scripts/run_fidelity_corpus.py --corpus corpus_extra --runs 2 --fresh-runs
```

## 7.4 Protocolo de las mediciones registradas

| Medición | Fecha | Motor | Corpus | Ejecuciones | Archivo |
|---|---|---|---|---|---|
| Línea base v3 | 26/09/2026 | Ollama `qwen2.5vl`, prompt `faithful-reader-v2` | F01–F12 | 1 completa (la repetición no pudo hacerse: el túnel se apagó) | `test-results/fidelity-20260926T194238Z.json` |
| v4 parcial | 27/09/2026 | Ollama v4 | F01–F12 × 2 y G01–G15 × 2 | 2 | `fidelity-20260927T062318Z.json`, `…T063205Z.json` |
| Páginas reales con v4 | 29/09/2026 | Ollama v4 | 7 páginas reales | 1 | `corpus_real/resultados/prueba-2026-09-29.json` |
| `hybrid` (nube + detector) | 02–03/10/2026 | `gpt-4.1-mini` + Ollama (detector/respaldo), commit `86fdf0a` | F × 2, G × 4 corridas, R01–R13 pág. 1 × 1, 9 páginas visuales | varias | `fidelity-openai-*.json`, `openai-paginas-reales.json` |

## 7.5 Cómo se interpreta un resultado

1. Se mira `candidate_pass` solo como **filtro**: un `review` no significa fallo; un `candidate_pass` no significa aprobado.
2. Se lee `description` de cada caso y se aplica la rúbrica de tres condiciones.
3. Se contrastan las cifras de las gráficas con el texto del propio documento cuando existe (verificación cruzada de R07 y R08).
4. Se reportan **aprobados / total** y se conserva el JSON.

## 7.6 Amenazas a la validez (leer antes de citar un número)

| Amenaza | Detalle | Efecto |
|---|---|---|
| **Evaluador no independiente** | La revisión manual de F + G la hizo **la IA asistente** con la rúbrica, no una persona ciega ni un segundo evaluador humano. Debe repetirla el autor | Posible sesgo de aprobación; hay que repetirla |
| **Conjunto de desarrollo contaminado** | Dos reglas del prompt de la nube (estado de objetos y hora de relojes; `valor_impreso`) se escribieron tras ver los fallos de G13 y G04 | El 96.3 % **sobrestima** la generalización; las páginas reales no se usaron para ajustar |
| **Una sola corrida de los corpus reales** | R y las 9 páginas visuales tienen una ejecución | Poca evidencia de estabilidad |
| **Solo primera página** | El *runner* mide la página 1 de cada PDF | No evalúa documentos largos de punta a punta |
| **Comparación no limpia** | v3 (Ollama) en F; hybrid (nube) en F+G; v4 solo parcial | No se puede afirmar «hybrid es X puntos mejor que v4» [PENDIENTE] |
| **Modelo no determinista** | La nube puede redactar distinto en dos corridas | Variación entre ejecuciones |
| **Anclas escritas por el autor** | `CASE_RULES` y las respuestas esperadas las definió el propio equipo | Puede favorecer a la forma de salida esperada |
| **Sin usuarios** | Ninguna medición con personas con discapacidad visual | La utilidad real no está probada |
| **Un solo pod, un solo modelo local y uno en la nube** | Resultados de tiempo y costo ligados a ese entorno | No se pueden generalizar |

## 7.7 Pruebas automáticas (otra capa de verificación)

Además del corpus, el repositorio tiene **284 pruebas automáticas** que corren sin red ni claves:
145 del backend (`unittest`) y 139 del frontend (Vitest). Verifican la política del prompt, los esquemas por proveedor, el respaldo y los errores, la normalización, los límites, la caché,
la voz del servidor, la detección de idioma, la velocidad y la navegación por teclado (capítulos 04 y 05). **No miden la fidelidad del modelo**; protegen que el código que la sostiene no se rompa.

## 7.8 Cómo debe hacerse la medición final [PENDIENTE]

1. Fijar la versión de código (etiqueta de git) y registrar modelo, prompt y pod.
2. Correr F + G con `--runs 2 --fresh-runs` para **cada modo** (`v3`, `v4`, `hybrid`) con el mismo corpus y la misma GPU.
3. Calificar con la rúbrica **dos evaluadores** (idealmente una persona con experiencia en accesibilidad) sin saber qué modo produjo cada salida.
4. Reportar aprobados/27 por modo, tiempos y costo, y la tabla A/B.
5. Complementar con una prueba piloto con 2–3 personas con discapacidad visual.
