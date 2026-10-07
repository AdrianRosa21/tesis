# 5. Frontend y accesibilidad

La interfaz está pensada para alguien que **no mira la pantalla**. Todo lo importante se hace con el teclado y se confirma con voz.
Tecnologías: React 19, Vite, TypeScript y `pdfjs-dist` (versiones en `package.json`).

## 5.1 Estructura del código

| Pieza | Archivo | Responsabilidad |
|---|---|---|
| Pantallas | `src/pages/HomePage.tsx`, `PdfReaderPage.tsx`, `TutorialPage.tsx` | Bienvenida, lector y tutorial |
| Documento PDF | `src/hooks/usePdfDocument.ts` | Abrir el archivo, renderizar la página (escala 3.0, JPEG 0.95), texto nativo, restaurar la sesión |
| Análisis | `src/hooks/usePageAnalysis.ts`, `src/utils/ai.ts` | Reducir la imagen a ≤ 1600 px, llamar a `/api/describe-image`, interpretar la respuesta, partir bloques largos |
| Navegación | `src/hooks/useReadingNavigation.ts` | Recorrer elementos (índice −1 = «Inicio de la página», `length` = «Fin de la página») |
| Voz | `src/hooks/useSpeech.ts`, `src/utils/language.ts`, `elementSpeech.ts`, `voiceSource.ts`, `serverVoice.ts` | Hablar, elegir voz e idioma, voz del servidor |
| Teclas | `useWindowKeydown.ts`, `usePauseKey.ts`, `useRateKeys.ts` | Atajos globales, pausa inmediata, velocidad |
| Panel | `AnalysisDetail.tsx`, `analysisSummary.ts`, `ReaderStatusBox.tsx` | Mostrar qué detectó el análisis, con qué motor y cuánto tardó |
| Persistencia | `src/utils/db.ts` (IndexedDB), `localStorage` | Recordar el PDF abierto, la velocidad y la preferencia de voz |

## 5.2 Mapa de teclas

| Tecla | Acción |
|---|---|
| **R** | Abrir el selector de archivos (la ventana es del sistema operativo: JavaScript no la controla) |
| **F** | Analizar la página actual y empezar a leerla (si ya está analizada, solo la lee) |
| **↓ / ↑** | Siguiente / anterior elemento de la página |
| **V** | Repetir el elemento actual |
| **Espacio** | Pausar o continuar, **al presionar** (no al soltar); mantenerla no repite la acción |
| **+ / −** (también `=`, `_` y el teclado numérico) | Velocidad de la voz (de 0.50 a 2.50, pasos de 0.05; se recuerda entre sesiones). Con Ctrl, Alt o Cmd no cuentan: son atajos de zoom |
| **G** | Detener la voz |
| **→ / ←** | Página siguiente / anterior |
| **Inicio / Fin** | Primera / última página |
| **J** | Cerrar el documento y volver al inicio (borra el PDF guardado en el navegador) |
| **H** | Abrir el tutorial (**Escape** lo cierra) |

Los atajos se ignoran cuando el foco está en un campo de texto (`isTypingTarget`), para no interferir al escribir un número de página.

## 5.3 Decisiones de accesibilidad

1. **Diseño autocontenido y sin doble voz.** Una página web no puede saber si hay un lector de pantalla activo. En lugar de intentar detectarlo, AURA habla con su propia voz y oculta su región de estado del lector nativo con `aria-hidden="true"` (`PdfReaderPage.tsx`). Así no hablan dos voces sobre el mismo estado. La limitación (la ventana de selección de archivo) se explica en el tutorial.
2. **Estados siempre hablados.** Cada cambio (página N de M, «Analizando…», «Análisis completado. Se encontraron N elementos…») se muestra y se dice. Los errores están diferenciados por código (401, 413, 429, 502, 503, 504) con mensajes claros, no un genérico «revisa tu clave».
3. **Controles realmente deshabilitados** mientras se analiza, para que una pulsación repetida no lance dos análisis.
4. **El último bloque leído persiste** en pantalla después de terminar la voz (`ReadingBox`) para quien tenga baja visión.
5. **Lectura por unidades manejables.** Los bloques de texto largos (más de 150 caracteres) se parten por líneas y oraciones; si una oración sigue siendo enorme se parte por longitud (máx. 220 caracteres) sin separar una cantidad de su unidad («3/4 | taza»). Así ↓, ↑ y **V** avanzan, retroceden y repiten frases cortas, no la página entera (`splitLongTextElements`).
6. **Tutorial por teclado de 12 pasos**, al ritmo del usuario: → o ↓ avanzan, ← o ↑ retroceden, **V** repite el paso, Espacio pausa, + y − cambian la velocidad, **Escape** sale.
7. **Bienvenida hablada fiable.** El navegador puede cancelar o fallar la primera síntesis en frío; la interfaz reintenta hasta 2 veces (bug resuelto, ver capítulo 12).
8. **La tecla H solo abre el tutorial; Escape lo cierra.** Antes el oyente recién montado del tutorial también escuchaba H y lo cerraba en el mismo toque.
9. **Sesión recuperable.** El PDF abierto se guarda en IndexedDB (`AccessiblePdfReaderDB`) para que, al recargar, se restaure sin volver a elegir el archivo. **J** lo borra deliberadamente.

## 5.4 Voz e idioma

AURA lee con la **Web Speech API** del navegador y decide la voz **por unidad de texto**, no por página:

1. **Idioma de cada unidad** (`resolveElementLang`): manda el **texto**, no la etiqueta del modelo. `detectLanguage` (`language.ts`) cuenta palabras funcionales frecuentes del español y del inglés (con peso adicional para `ñ ¿ ¡ á é í ó ú`); si la diferencia es menor al 25 %, no decide y se usa la etiqueta del modelo o el idioma predominante de la página.
2. **Bloques partidos** (`languagesForUnits`): un examen de inglés con instrucciones en español llega como un solo bloque; al partirlo, cada oración se evalúa por separado. Las que no tienen pistas («a) so b) too», «1.») heredan el idioma de la unidad clara anterior.
3. **Las descripciones visuales** (imágenes, gráficas, tablas) siempre se leen en español, aunque el documento esté en inglés (así las escribe el modelo).
4. **Elección de la voz en inglés** (`chooseEnglishSource`): primero la voz del navegador, preferentemente `en-US`; si el navegador no tiene ninguna, la **voz estadounidense del servidor** (Piper, `en_US-lessac-medium`) vía `/api/tts`; si tampoco, se avisa. La pantalla muestra cuál voz se usó en la última lectura (`lastVoice`).
5. **Respaldo.** Si el servidor de voz no responde (timeout de 5 s para consultar, 15 s para el audio), AURA vuelve sola a la voz del navegador y reintenta tras un minuto. El audio de hasta 40 frases se conserva listo para reproducir.
6. **Texto de relleno de exámenes.** Los puntos o guiones bajos repetidos («…………») se leen como «blank» en la voz del servidor, en lugar de silencio o «punto punto».
7. **Etiquetas de tipo.** Los elementos no se leen con «Texto:» pero sí con su tipo cuando es otro (`Tabla:`, `Descripción Visual:`, `Contenido dudoso:`), traducidas al inglés cuando el elemento está en inglés.

## 5.5 Panel «Detalle del análisis»

Después de analizar una página, la pantalla muestra (`AnalysisDetail.tsx`, `analysisSummary.ts`): qué detectó (tabla, gráfica, diagrama, imagen,
matemáticas, columnas), **qué motor la leyó** (`provider`, `model`, `detector`), los pasos con su duración, el tiempo del servidor y el tiempo
medido en el navegador (red, proxy y cola incluidos), si respondió la caché y, si hubo respaldo, el motivo. Esa información es para quien ve
la pantalla (por ejemplo un acompañante o un evaluador); **no** se lee en voz alta.

## 5.6 Pruebas del frontend

`npm test` (Vitest + Testing Library + jsdom) ejecuta **139 pruebas en 13 archivos**; todas pasan (verificado el 7 de octubre de 2026).

| Archivo | Pruebas | Qué cubre |
|---|---|---|
| `ai.test.ts` | 28 | Interpretación de la respuesta, tablas, partición por oraciones y longitud, idioma por unidad |
| `useSpeech.serverVoice.test.tsx` | 16 | Voz del servidor y respaldo |
| `elementSpeech.test.ts` | 16 | Idioma y etiquetas de lectura |
| `serverVoice.test.ts` | 14 | Cliente de la voz del servidor |
| `language.test.ts` | 12 | Detección de idioma |
| `useSpeech.test.tsx` | 10 | Hook de voz |
| `voiceSource.test.ts` | 10 | Elección de la fuente de voz |
| `useRateKeys.test.tsx` | 9 | Velocidad con teclas |
| `speechRate.test.ts` | 6 | Límites y formato de velocidad |
| `usePauseKey.test.tsx`, `useReadingNavigation.test.tsx`, `analysisSummary.test.ts` | 5 + 5 + 5 | Pausa inmediata, navegación, resumen del panel |
| `AnalysisDetail.test.tsx` | 3 | Panel de detalle |

## 5.7 Límites conocidos de la interfaz

- La ventana «seleccionar archivo» es del sistema operativo; con un lector de pantalla desactivado hay que activarlo solo para ese paso.
- Depende de las voces del navegador y del equipo. El inglés tiene respaldo en el servidor; otros idiomas no.
- **No se ha probado con personas ciegas ni de baja visión** [PENDIENTE]. Las decisiones de este capítulo se basan en buenas prácticas y en pruebas automáticas, no en observación de usuarios.
