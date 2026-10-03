# Resultados del modo hybrid (OpenAI + detector Ollama)

Fecha de las pruebas: 2 y 3 de octubre de 2026 (hora UTC del pod). Código evaluado: commit `86fdf0a`
(rama `main`). Todas las salidas están en `test-results/` (`fidelity-openai-*.json`, `openai-paginas-reales.json`).

## Configuración

| Elemento | Valor |
|---|---|
| Modo | `AURA_PIPELINE=hybrid` |
| Modelo en la nube | OpenAI `gpt-4.1-mini` (Chat Completions, salida JSON estricta, imagen `detail=high`) |
| Detector y respaldo | Ollama `qwen2.5vl` (en el pod); el detector corre en paralelo con tiempo máximo de 5 s |
| GPU del pod | NVIDIA RTX PRO 6000 (MIG 24 GB) |
| Imagen enviada | página renderizada a 1600 px de ancho (el runner); la app real envía ~1836 px (escala 3.0) |
| Corpus | F01–F12 (2 corridas), G01–G15 (4 corridas), `corpus_real` R01–R13 (1 corrida, solo pág. 1) y 9 páginas visuales reales elegidas a mano |

## Resultados

| Corpus | Anclas automáticas (`candidate_pass`) | Revisión manual con la rúbrica | Tiempo promedio por página |
|---|---|---|---|
| F01–F12 × 2 corridas | 22 / 24 | **11 / 12** (falla F11, fallo menor) | 7.1 s |
| G01–G15, corrida final | 15 / 15 | **15 / 15** | 7.1 s |
| **Total F + G** | | **26 / 27 = 96.3 %** (meta: 23 / 27 = 85 %) | |
| `corpus_real` R01–R13 (pág. 1) | 11 / 11 | no revisado a mano (solo ancla) | 7.2 s |

Comparación con la línea base v3 (Ollama, 26/09/2026): 7/12 = 58.3 % en F01–F12. Con hybrid, los casos que
fallaban (F05 tabla, F07 gráfica, F08 diagrama, F10 imagen) y la tabla extensa F06 salen correctos; sigue fallando
F11. **No se corrió v4 completo (F + G) en esta sesión**, así que la comparación v3 / v4 / hybrid limpia sigue pendiente.

### Páginas reales con gráficas (no se usaron para ajustar el prompt)

Verificadas contra cifras que el propio documento cita en su texto o contra su capa de texto:

| Página | Qué contiene | Verificación |
|---|---|---|
| R08 pág. 2 | Líneas, 3 series × 5 años (15 valores) | Los valores 2020 y 2024 de mujeres y hombres (22.5, 19.3, 22.2, 19.6) coinciden con el texto de la pág. 1 |
| R08 pág. 3 | Barras, 13 situaciones × 2 sexos (26 valores) | 29.0 / 13.9 y 27.5 / 15.8 coinciden con el texto de la pág. 1 |
| R07 pág. 2 | Barras, 5 grupos de edad × 2 sexos (10 valores) | 26, 46, 24, 35, 40 y 26 (=40−14) coinciden con el texto de la página |
| R07 pág. 3 | Nota técnica (texto) | 2 772 caracteres devueltos vs 2 785 en la capa de texto del PDF |
| R03 pág. 2 | Tabla de tarifas | 33 filas de precios = 33 líneas con precio en el PDF |

Las 9 páginas respondieron con OpenAI, sin usar el respaldo local, entre 4.0 s y 10.3 s.

## Costo y velocidad

Medido con los tokens registrados por el backend (108 llamadas): entrada 6 458 tokens en promedio (máx. 7 301),
salida 307 (máx. 1 282). Con los precios publicados de `gpt-4.1-mini` ($0.40 y $1.60 por millón de tokens),
**≈ $0.0031 por página** ($0.33 las 108 llamadas). Es una estimación hecha con precios publicados; la cifra
definitiva está en el panel de facturación de OpenAI.

Tiempo: ≈ 7 s por página con OpenAI, contra 10 a 20 s con Ollama (v4) en el mismo pod y 87 s en la primera página
de un pod frío (ya mitigado con el precalentamiento `AURA_WARMUP`).

## Cambios hechos a partir de las pruebas

Dos fallos de la primera corrida llevaron a cambios, **solo en el prompt y el esquema de la nube** (el prompt de
Ollama no cambió, para poder comparar):

1. **G13** describía los colores de un semáforo sin decir cuál luz estaba encendida. Se agregó una regla genérica
   de estado y hora de relojes (`RULE_IMAGE_CLOUD`).
2. **G04** daba valores estimados como exactos. Una instrucción de texto ("escribe aprox.") fue ignorada dos veces;
   se reemplazó por un campo obligatorio `valor_impreso` por cada dato de gráfica, y si es `false` se lee
   "aprox. N". Verificado: G04 → "aprox. 40, 25, 60, 15"; G02, G03 y G15 (números impresos) no llevan "aprox.".

Una prueba automática (`test_cloud_rules_do_not_leak_benchmark_answers`) impide que los ejemplos del prompt coincidan
con respuestas del corpus.

## Limitaciones (declararlas en la tesis)

1. **La revisión manual la hizo la IA asistente, no una persona ciega ni un segundo evaluador.** Debe repetirla
   Rodrigo con la rúbrica de `corpus_extra/RESPUESTAS_ESPERADAS.md`, y no hay pruebas con usuarios.
2. **G se usó en parte como conjunto de desarrollo:** las reglas de estado/hora y de `valor_impreso` se escribieron
   después de ver los fallos de G13 y G04. El 96.3 % por eso sobrestima la generalización; las páginas reales (R07,
   R08, R03) no se usaron para ajustar y son la mejor evidencia de que el resultado se sostiene.
3. **F11 sigue fallando (menor):** transcribe la duda impresa en la página ("18? o 13?") pero no la marca como
   `[DUDOSO]`. No se ajustó el prompt a ese patrón para no dar la respuesta del examen.
4. Una sola corrida de `corpus_real` y de las páginas visuales; un solo modelo (`gpt-4.1-mini`) y un solo pod.
5. En G13 y otros, el resultado depende de un modelo no determinista: dos corridas pueden diferir en redacción.
6. **Privacidad:** en este modo cada página se envía a OpenAI. Solo v4 / v3 la mantienen en el servidor propio.
7. Dependencia de un servicio de pago: sin saldo o sin red, AURA sigue con el respaldo local (Ollama), más lento
   y con la fidelidad medida en la línea base.

## Cómo reproducirlo

```bash
cd /tesis && source fastapi_backend/venv/bin/activate
export API_KEY=$(grep -E "^API_KEY=" /tesis/.env | cut -d= -f2-)
python scripts/run_fidelity_corpus.py --corpus corpus_extra --runs 1 --fresh-runs --api-url http://127.0.0.1:3000
python scripts/run_fidelity_corpus.py --corpus /ruta/a/corpus_F --runs 2 --fresh-runs --api-url http://127.0.0.1:3000
```

Para la comparación pendiente, repetir con `AURA_PIPELINE=v4` y con `AURA_PIPELINE=v3` en el `.env` y los mismos corpus.
