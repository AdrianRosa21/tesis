# 10. Conclusiones y trabajo futuro

## 10.1 Conclusiones

1. **Se construyó un sistema funcional y desplegado** que lee páginas de PDF para personas con discapacidad visual: frontend accesible por teclado, proxy que
   protege las claves, backend con GPU y un *pipeline* de IA por versiones (v3, v4, hybrid). Está en producción en `https://aurapdf-one.vercel.app` y se restaura en un pod
   nuevo en ≈ 75 s con un comando.
2. **La línea base con un prompt único sobre un modelo abierto local fue de 58.3 % (7/12).** Los fallos se concentraron en la estructura visual (tablas, gráficas,
   diagramas e imágenes); el no resolver ejercicios y el no obedecer instrucciones del documento ya funcionaban.
3. **Forzar la estructura de la salida mejora la fidelidad más que pedirla en el prompt.** Un esquema JSON con campos obligatorios (encabezados y filas, pares etiqueta/valor,
   conexiones origen/destino, `valor_impreso`) obliga al modelo a llenar lo que antes omitía, y permite al código marcar «aprox.» sin depender de que el modelo obedezca.
4. **Con el modo `hybrid` (modelo en la nube para leer + Ollama para detectar y respaldar) se aprobaron 26 de 27 casos (96.3 %)**, por encima de la meta de 85 %, con una mediana
   de 3.6 s por página y ≈ US$0.003 por página. Estas cifras tienen límites declarados (evaluador no independiente, conjunto de desarrollo parcialmente contaminado y ausencia de usuarios).
5. **El costo de ese modo es la privacidad:** la página sale a un tercero. El diseño conserva el camino local (`v4`/`v3`) y un respaldo automático para que la lectura no dependa de un solo proveedor.
6. **La reproducibilidad es parte del resultado:** 284 pruebas automáticas (145 + 139), un *runner* de fidelidad, una prueba de punta a punta y un *script* de restauración permiten repetir lo que aquí se afirma.
7. **Lo que falta es lo más importante:** la comparación limpia v3/v4/hybrid con evaluadores independientes y, sobre todo, la validación con personas con discapacidad visual.

## 10.2 Aportaciones

- Una **arquitectura de tres capas** (navegador, proxy, GPU) con claves fuera del navegador, límites por persona, caché, tope diario de gasto y respaldo automático.
- Un **pipeline de lectura fiel**: clasificar → reglas por tipo → salida forzada por esquema → completar lo visual → normalizar, con un detector de bucles de repetición y un marcado automático de valores estimados.
- Un **corpus de pruebas** (F01–F12, G01–G15 con respuestas esperadas, páginas reales) y un ***runner*** con comprobaciones automáticas y rúbrica manual.
- Un **diseño de interfaz** autocontenido, con voz por idioma y por línea, velocidad ajustable, pausa inmediata y tutorial, más 139 pruebas.
- Un **registro honesto** de problemas, decisiones y límites (capítulos 9 y 12).

## 10.3 Trabajo futuro (por prioridad)

| # | Trabajo | Para qué |
|---|---|---|
| 1 | **Piloto con personas con discapacidad visual** (2–3 personas o una asociación) con tareas medidas | Validar utilidad, comodidad y errores reales; es la limitación más importante |
| 2 | **Medición final** F + G × 2 de `v3`, `v4` y `hybrid` con dos evaluadores ciegos al modo | Tabla A/B limpia para la tesis |
| 3 | **Rotar claves** (`API_KEY`, `LOGS_STREAM_KEY` y la del proveedor) y **límite global** de peticiones | Cerrar la deuda de seguridad antes de abrir al público |
| 4 | **Probar un modelo de visión local más grande** (que quepa en 24 GB) con el mismo *runner* | Ver si el modo local se acerca a `hybrid` sin enviar páginas a terceros. Verificar primero qué modelos están disponibles en `ollama.com/library` |
| 5 | **Trabajo asíncrono** (enviar la página y consultar el estado) | Evitar el corte de ~100 s de Cloudflare en páginas muy pesadas |
| 6 | **Adelantar la página siguiente** mientras se escucha la actual y **más de un pod** | Capacidad y menor espera |
| 7 | **Validación de datos de gráficas** (comparar el número de datos con las categorías visibles y marcar `[DUDOSO]` si no coinciden) | Reducir inventos en gráficas con varias series |
| 8 | **Medir documentos completos** y otros idiomas | Cobertura |
| 9 | **Automatizar el encendido** y el monitoreo de `/api/health` y `/api/ready` | Operación y costo |
| 10 | **Guía de onboarding con audio pregrabado** | Que la primera experiencia no dependa de la síntesis del sistema |

## 10.4 Palabras finales

AURA no pretende reemplazar a los PDF accesibles ni al criterio de una persona: pretende que **ninguna página sea un muro**. Su valor depende de que sea fiel,
de que diga cuando duda y de que diga con claridad cómo funciona y a dónde viaja cada página. Este documento intenta cumplir ese mismo criterio.
