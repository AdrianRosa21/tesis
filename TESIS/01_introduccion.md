# 1. Introducción

## 1.1 Contexto

Una gran parte del material educativo, administrativo y laboral circula en PDF. Para una persona ciega o con baja visión severa, ese
formato se consume con un **lector de pantalla** (software que convierte texto en voz). El lector de pantalla no «ve» la página: lee
la **capa de texto** que el PDF lleva por dentro, en el orden en que el archivo la guardó.

Datos de contexto (tomados de `docs/ficha-evaluacion-cimat.md`, que cita sus fuentes):
- La Organización Mundial de la Salud estima que al menos **2 200 millones de personas** tienen alguna deficiencia visual, de cerca o de
  lejos. [VERIFICAR la cifra exacta en la ficha técnica vigente de la OMS antes de citarla como definitiva.]
- En México, el Censo 2020 del INEGI contó **6 179 890 personas con discapacidad (4.9 %)**, y cerca del **44 %** de ellas tiene
  dificultad para ver aunque use lentes. [VERIFICAR en el comunicado del INEGI; la ficha lo toma de una fuente secundaria.]

## 1.2 Planteamiento del problema

El lector de pantalla falla, o guarda silencio, en estos casos:

| Tipo de documento | Qué pasa con un lector de pantalla |
|---|---|
| **Escaneo** (la página es una foto) | No hay capa de texto: no hay nada que leer |
| **Varias columnas** | Lee mezclando líneas de columnas distintas |
| **Tablas** | Lee las celdas sueltas; se pierde la relación fila–columna |
| **Gráficas** | No hay texto: los valores solo existen como dibujo |
| **Diagramas** (flechas, cajas) | Lee etiquetas sueltas; se pierde quién apunta a quién |
| **Fórmulas** | Símbolos sin estructura o texto roto |
| **Imágenes y fotografías** | Sin texto alternativo, no se sabe que existen |

Los PDF «accesibles» (con etiquetas de estructura y texto alternativo) existen, pero casi nadie los prepara. La consecuencia es que
una persona con discapacidad visual severa no puede estudiar ni trabajar de forma autónoma con una parte importante del material que
para el resto es normal.

Frase de síntesis: *«Un lector de pantalla lee texto; AURA entiende la página.»*

## 1.3 Pregunta de investigación e hipótesis

**Pregunta principal.** ¿Puede un modelo de visión y lenguaje, guiado por un *pipeline* de prompts especializados por tipo de
contenido y por salida estructurada, describir páginas de PDF con la fidelidad suficiente (al menos 85 % de un corpus de 27 casos) para
leerlas en voz alta, en un tiempo razonable por página (menos de ~90 s)?

**Preguntas secundarias.**
1. ¿Cuánto mejora un *pipeline* que primero clasifica la página y fuerza una estructura de salida (v4) frente a un prompt único (v3)?
2. ¿Qué cambia en calidad, velocidad y privacidad cuando un modelo en la nube lee la página y el modelo local solo detecta y respalda (`hybrid`)?
3. ¿Cómo se puede impedir en el código (no solo en el prompt) que el sistema resuelva ejercicios, invente contenido u obedezca instrucciones escondidas en el documento?
4. ¿Qué decisiones de interfaz permiten que una persona use el sistema sin ver la pantalla y sin que choque con su lector de pantalla?

**Hipótesis de trabajo.** Un *pipeline* que clasifica la página y fuerza la salida con un esquema JSON supera claramente al prompt
único, sobre todo en tablas, gráficas, diagramas e imágenes, que fueron los fallos de la línea base (F05, F07, F08, F10).
*Estado:* la línea base v3 se midió (58.3 %); el modo `hybrid` se midió completo (96.3 %); v4 se midió de forma parcial. La
comparación limpia de los tres modos con el mismo corpus es **[PENDIENTE]** (capítulos 08 y 09).

## 1.4 Objetivos

**Objetivo general.** Permitir que una persona con discapacidad visual severa entienda las páginas de un PDF, incluso con
elementos visuales, usando IA multimodal y control solo por teclado.

**Objetivos específicos**
1. Describir cada página con un modelo multimodal. La línea principal de diseño es **infraestructura propia** (Ollama + `qwen2.5vl`);
   como mejora opcional se incorporó un modo con proveedor en la nube para comparar calidad, con su implicación de privacidad declarada.
2. Leer el resultado en voz alta con la síntesis de voz del navegador, con el orden de lectura y el idioma correctos.
3. Garantizar **fidelidad**: no resolver ejercicios, no elegir opciones, no inventar, marcar lo dudoso y no obedecer instrucciones del documento.
4. Alcanzar al menos **85 % (23 de 27 casos)** del corpus de fidelidad en 2 ejecuciones.
5. Mantener cada página por debajo de ~90 s (el túnel de Cloudflare corta cerca de los 100 s).
6. Proteger las claves y la privacidad: ninguna clave en el navegador, límites por cliente y declaración clara de a dónde viaja cada página.
7. Dejar el sistema **reproducible**: restaurar el servidor con un comando y repetir las pruebas con un *runner* automático.

## 1.5 Justificación

- **Social:** acceso autónomo a libros, guías, exámenes y artículos sin depender de otra persona que lea en voz alta.
- **Educativa:** estudiantes con discapacidad visual pueden usar el mismo material que sus compañeros, incluidas tablas y gráficas.
- **Técnica:** el trabajo deja evidencia comparativa de estrategias de *prompting* y de fidelidad en modelos de visión que caben en una GPU de 24 GB.
- **Económica:** el costo es predecible. Una GPU en la nube cuesta US$0.49 por hora encendida (`docs/ficha-evaluacion-cimat.md`, sección 7)
  y, en el modo `hybrid`, la lectura en la nube cuesta ≈ US$0.003 por página (capítulo 08).

### Objetivos de Desarrollo Sostenible (Agenda 2030)

| ODS | Meta | Cómo contribuye AURA |
|---|---|---|
| **4. Educación de calidad** (principal) | 4.5 y 4.a | Hace legible el material educativo en PDF, incluidas tablas, gráficas y fórmulas |
| **10. Reducción de las desigualdades** (principal) | 10.2 | Reduce la brecha de acceso a la información escrita |
| 9. Industria, innovación e infraestructura (secundario) | 9.c | Usa IA abierta y costo fijo, replicable con poca infraestructura |
| 8. Trabajo decente (secundario, opcional) | 8.5 | Facilita leer documentos laborales y de capacitación |

[VERIFICAR] el texto oficial de cada meta en <https://sdgs.un.org/es/goals> antes de citarlas literalmente.

## 1.6 Alcance y delimitación

**Dentro del alcance**
- Documentos PDF leídos página por página desde un navegador moderno de escritorio.
- Español e inglés como idiomas de lectura.
- Control por teclado y voz del navegador (con una voz en inglés del servidor como respaldo).
- Evaluación de fidelidad con un corpus de 27 documentos de prueba y páginas reales públicas.

**Fuera del alcance**
- Pruebas con personas con discapacidad visual **[PENDIENTE]**.
- Procesar varias páginas en paralelo para muchos usuarios simultáneos (el diseño atiende una página a la vez en la GPU local).
- Ajuste fino (*fine-tuning*) del modelo: el modelo se usa tal cual; lo que se mejora es el *prompt*, el esquema y el código que lo rodea.
- Aplicación móvil, lector de pantalla propio o lectura de formatos distintos del PDF.

## 1.7 Metodología resumida

1. **Análisis y diseño.** Se partió de un prototipo que llamaba a Gemini desde el navegador con Tesseract para OCR. Se detectó el riesgo de la clave expuesta y la dependencia de un tercero (`docs/analisis-arquitectura/`).
2. **Arquitectura propia en tres capas:** frontend (React 19 + Vite + TypeScript), proxy en una función de Vercel y backend FastAPI + Ollama en un pod con GPU.
3. **Ingeniería de *prompts* por versiones** (v3 → v4 → hybrid), cada una con pruebas automáticas.
4. **Validación experimental** con un corpus, un *runner* automático, una rúbrica y revisión manual (capítulo 07).
5. **Registro honesto** de problemas, decisiones y límites (capítulos 09 y 12).

## 1.8 Estructura del documento

El capítulo 2 presenta el marco teórico; el 3, la arquitectura; el 4, el *pipeline* de IA; el 5, la interfaz accesible; el 6, el
backend, la seguridad y la privacidad; el 7, la metodología de evaluación; el 8, los resultados; el 9, la discusión, las limitaciones
y la ética; el 10, las conclusiones; el 11, cómo reproducir todo; el 12, la bitácora de ingeniería; el 13, la matriz de evidencia y el
14, el glosario y las referencias.
