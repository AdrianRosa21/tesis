# 4. El pipeline de IA: de una imagen a elementos legibles

Este es el núcleo técnico. Recibe la imagen de una página (y, opcionalmente, su texto nativo) y devuelve una lista de **elementos**
`{type, content, lang}` que el navegador lee uno por uno. Hay tres variantes, seleccionables con `AURA_PIPELINE`, y todas comparten las
mismas reglas de fidelidad y la misma normalización final.

Código: `fastapi_backend/pipeline.py` (flujo), `prompts.py` (instrucciones y esquemas), `schemas.py` (adaptación por proveedor),
`normalize.py` (limpieza y conversión) y `providers/` (modelos).

## 4.1 Reglas de fidelidad (no negociables)

| Regla | Dónde se impone |
|---|---|
| **No resolver ejercicios ni elegir opciones** | Regla 3 del prompt; casos F03, F04, G09 del corpus; pruebas de política |
| **No inventar**: copiar cifras, nombres, signos y unidades sin corregir | Regla 2 y 4; el campo `valor_impreso` obliga a distinguir un número impreso de uno estimado |
| **Marcar lo dudoso** con `[DUDOSO]` o un bloque `dudoso` | Regla 4; tipo de bloque `dudoso` en el esquema |
| **No obedecer instrucciones del documento** (el contenido es dato no confiable) | Regla 5; el texto auxiliar va entre marcas `INICIO/FIN TEXTO AUXILIAR` y se declara no confiable; caso F12 |
| **Sin Markdown ni LaTeX** (para que la voz no lea asteriscos) | Regla 6 y `strip_markdown` en código |
| **La imagen manda, el texto nativo solo ayuda** | Se dice explícitamente en el prompt; el texto auxiliar se recorta a 12 000 caracteres |

Una prueba automática (`test_cloud_rules_do_not_leak_benchmark_answers`) impide que los ejemplos del prompt de la nube coincidan con respuestas del corpus.

## 4.2 v3: un solo prompt (línea base)

Un prompt único con 15 reglas pide una salida de texto con prefijos obligatorios `[TEXTO]`, `[IMAGEN]`, `[TABLA]` y `[DUDOSO]`, una línea por bloque.
Se llama a Ollama una vez (`max_tokens=1600`). Se conserva para comparación A/B (`AURA_PIPELINE=v3`).

**Problema medido** (capítulo 08): con 15 reglas a la vez, el modelo falló justo en **tablas, gráficas, diagramas e imágenes**, y además incumplía el formato con frecuencia.

## 4.3 v4: clasificar, extraer con reglas por tipo, completar

```
imagen + texto nativo
  │
  1) CLASIFICAR   dos pasadas (temperature 0.0 y 0.6) combinadas con OR
  │               → {tabla, grafica, diagrama, imagen, matematicas, columnas}   (esquema CLASSIFY_SCHEMA, max 120 tokens)
  │
  2) EXTRAER      BASE_RULES + solo las reglas que aplican (tabla/gráfica/diagrama/imagen/matemáticas/columnas)
  │               salida forzada con EXTRACT_SCHEMA → {"bloques":[…]}
  │               repeat_penalty 1.2 si hay tabla, 1.05 en el resto; max 4096 tokens
  │   2b) si no se detectó tabla pero el resultado dice «N filas» sin filas → reintento forzando reglas de tabla
  │
  3) COMPLETAR    si el detector vio imagen/gráfica/diagrama y no se describió → 1 llamada enfocada (máx. AURA_MAX_FOLLOWUPS=1)
  │               solo si lleva menos del 60 % del presupuesto de 80 s
  ▼
  4) LIMPIAR      strip_markdown · collapse_repeated_lines · tablas «Fila N. Encabezado: valor» → elements
```

**Por qué dos pasadas de clasificación.** En páginas límite (por ejemplo una tabla densa de solo números) una sola pasada con temperatura 0
puede quedar atascada en una lectura equivocada (clasificarla como «matemáticas»). Combinar con OR solo decide **qué reglas se activan**;
no cambia el texto final.

**Por qué `repeat_penalty` distinto.** Con tablas, una penalización baja hace que el modelo se detenga temprano con un resumen en vez de enumerar
las filas. Con texto normal, la misma penalización alta corrompe palabras comunes. Se sube **solo cuando hay tabla** (decisión basada en el fallo F06; ver capítulo 12).

**Parámetros de Ollama** (`providers/ollama.py`): `temperature` 0 (0.6 en la segunda clasificación), `top_p` 0.1, `num_ctx` 16 384, `num_predict` según el paso, `keep_alive` 30 min.

## 4.4 El esquema de salida (contrato)

```json
{ "bloques": [
  { "tipo": "texto | tabla | grafica | diagrama | imagen | dudoso",
    "contenido": "texto, título o descripción",
    "encabezados": ["…"], "filas": [["…"]],
    "datos": [{"etiqueta": "…", "valor": "…", "valor_impreso": true}],
    "conexiones": [{"origen": "…", "destino": "…", "etiqueta": "…"}],
    "idioma": "es" } ] }
```

- `encabezados` + `filas`: una lista por fila con los valores **en el mismo orden** que los encabezados.
- `datos`: un par etiqueta/valor por barra, punto o sector. En la nube cada dato lleva `valor_impreso` (obligatorio): `true` si el número aparece impreso en la página y `false` si se estimó contra la escala.
- `conexiones`: una por cada flecha, **respetando su dirección**.
- `idioma` (solo en la nube): código de dos letras del idioma del texto del bloque; las descripciones visuales siempre se escriben en español.

`schemas.py` adapta este esquema a cada proveedor: Ollama (`format`), OpenAI (modo estricto, todo obligatorio y opcionales como `null`), Gemini
(tipos en mayúscula, subconjunto de palabras clave) y Claude (sin límites numéricos, `additionalProperties: false`).

## 4.5 hybrid: nube + detector local + respaldo

```
imagen ──┬──► [Nube: Gemini | OpenAI | Claude]  lectura completa con EXTRACT_SCHEMA_CLOUD  ─────────┐
         │                                                                                          ├──► bloques ──► elements
         └──► [Ollama: detector]  CLASSIFY_PROMPT (temperature 0, max 120 tokens)  ──► page_type ───┘
                                      (en paralelo; si la nube ya respondió, se espera como máximo AURA_DETECT_GRACE_S = 1.5 s)

Si la nube falla (red, saldo, rechazo)  y llevamos menos del 30 % del presupuesto de 80 s  ──► se repite la página con Ollama v4
Si se alcanzó el tope diario de páginas en la nube (AURA_CLOUD_MAX_PAGES_PER_DAY)           ──► igual: respaldo local
```

Puntos de diseño:
- **Qué hace cada modelo.** La nube **lee**. Ollama solo **detecta** qué contiene la página (tabla, gráfica, imagen…) para mostrarlo en el panel y, si la nube omitió describir una imagen, gráfica o diagrama detectado, hacer una llamada enfocada. Si no hubo detector, el tipo de página se deduce de los bloques devueltos (`page_from_blocks`).
- **Prompt de la nube.** Recibe todas las reglas, cada una condicionada («SI LA PÁGINA TIENE TABLAS, …») porque no espera al detector. Incluye reglas más finas para gráficas con varias series (etiqueta «serie, categoría», todos los puntos de cada serie, `valor_impreso`) y para imágenes con partes encendidas/apagadas y relojes. El prompt de Ollama **no cambió**, para que el respaldo se comporte igual que cuando se midió.
- **Velocidad.** El detector local tarda 5–8 s y la nube ≈ 2.5 s; antes de reducir la espera (5 s → 1.5 s) cada página tardaba ≈ 7 s por esperar al detector; después, la mediana por la URL pública fue 3.6 s (capítulo 08).
- **Costo bajo control.** `CloudBudget` cuenta las páginas enviadas a la nube cada día (UTC); al llegar al tope, AURA sigue con el respaldo local en lugar de gastar más.
- **Errores traducidos.** `providers/base.py` convierte los errores del proveedor (credenciales, saldo, límite, modelo inexistente, solicitud rechazada) en mensajes claros para el usuario y un detalle para el log; el saldo agotado se trata como 503, no como un 429 que se arregla esperando.

## 4.6 Normalización: del JSON a lo que se lee

`normalize.py` es una barrera de calidad común a todos los modos:

| Función | Qué garantiza |
|---|---|
| `parse_json_lenient` | Acepta JSON con cercas de código; si el modelo se cortó por longitud, **rescata los bloques completos** y marca `_truncado` |
| `strip_markdown` | Quita asteriscos y marcas sin borrar símbolos útiles (`3*x`, `N.º #3`) |
| `collapse_repeated_lines` | Corta **bucles de repetición** a nivel de palabras: si un tramo (≥ 4 palabras) se repite tal cual, conserva la primera repetición |
| `blocks_to_elements` | Convierte cada bloque en elementos legibles: tabla → «Título. N filas. Columnas: …» + «Fila i. Encabezado: valor; …»; gráfica → «… Datos: etiqueta: valor; …»; diagrama → «… Flechas: A hacia B (etiqueta); …»; las etiquetas de andamiaje salen en el idioma del bloque |
| `_chart_value` | Si `valor_impreso` es `false`, antepone **«aprox.»** para que una estimación no suene como dato exacto |
| `looks_like_missed_table` | Detecta una tabla resumida como «informe de N filas» sin filas reales (activa el reintento 2b) |
| `missing_visuals` / `merge_followup` | Decide si falta describir una imagen/gráfica/diagrama y fusiona la descripción obtenida |
| `elements_to_description` | Texto plano con prefijos `[TEXTO]/[IMAGEN]/[TABLA]/[DUDOSO]`, compatible con el *runner* de pruebas |

Si la página no produce nada legible, se devuelve un elemento «Página en blanco o sin contenido reconocible.».

## 4.7 Contrato de la respuesta

`POST /api/describe-image` responde:

| Campo | Contenido |
|---|---|
| `success`, `description`, `elements` | Resultado principal (`elements`: `[{type, content, lang?}]`) |
| `page_type` | Qué contiene la página (tabla, gráfica, diagrama, imagen, matemáticas, columnas) |
| `prompt_version` | `faithful-reader-v3`, `-v4` o `-cloud-v1` |
| `provider`, `model`, `detector` | **Quién leyó realmente la página** y quién la detectó |
| `steps` | Pasos con motor y segundos (detección, extracción, llamada enfocada) |
| `processing_seconds` | Tiempo en el servidor |
| `fallback_reason` | Si hubo respaldo local, el motivo (se muestra, no se lee en voz alta) |
| `cached` | `true` si vino de la caché |

El frontend muestra `provider`, `model`, `detector`, `steps` y tiempos en el panel «Detalle del análisis» (`AnalysisDetail.tsx`), y el backend
registra el motor en los logs (`Procesando pagina con hybrid: <proveedor> (<modelo>) + detector <modelo local>…`). **El sistema informa siempre qué motor atendió cada página.**

## 4.8 Caché

`cache.py` guarda hasta 128 respuestas (LRU). La clave es el SHA-256 de `versión de prompt + motor/modelo + texto auxiliar + imagen`, de modo que cambiar el prompt, el modelo o el modo siempre fuerza un análisis nuevo.
No se almacenan PDF ni imágenes: solo respuestas, en memoria, que se pierden al reiniciar el backend.

## 4.9 Pruebas del pipeline

| Archivo | Pruebas | Qué cubre |
|---|---|---|
| `test_prompt_policy.py` | 19 | Política del prompt: no resolver, no obedecer, formato, normalización y bucles |
| `test_cloud_pipeline.py` | 87 | Configuración, esquemas por proveedor, *pipeline* `hybrid`, respaldo, tope diario, errores de proveedor, que las reglas no filtren respuestas del corpus |
| `test_api.py` | 21 | Endpoints, claves, límites, caché, logs |
| `test_tts.py` | 18 | Voz del servidor (2 de Piper real se omiten donde no está instalado) |
| **Total backend** | **145** | Sin red ni claves; verificado el 7 de octubre de 2026 |
