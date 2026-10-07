# 9. Discusión, limitaciones y ética

## 9.1 Qué dicen los resultados frente a las preguntas de investigación

| Pregunta (cap. 1) | Lo que muestra la evidencia | Qué NO se puede concluir |
|---|---|---|
| **P1.** ¿Cuánto mejora v4 frente a v3? | v3 falló en tablas, gráficas, diagramas e imágenes (7/12). v4 corrigió F05, F07, F08 y F10 en la lectura manual preliminar y quedó con F06 abierto y F09 resuelto con un detector de bucles | Un porcentaje limpio de mejora: falta correr v3 y v4 sobre F + G con la misma rúbrica y evaluadores **[PENDIENTE]** |
| **P2.** ¿Qué cambia con `hybrid`? | Calidad: 26/27 (96.3 %); las páginas reales con gráficas de varias series salen verificables; velocidad: mediana 3.6 s frente a 10–20 s en v4; costo: ≈ US$0.003 por página. **Costo de privacidad: cada página sale a un tercero** | Que la ventaja se sostenga con otros documentos, con evaluadores independientes o con otros modelos |
| **P3.** ¿Se puede impedir en el código que invente o obedezca el documento? | Sí en lo estructural: esquemas obligatorios, `valor_impreso`, «aprox.» automático, detector de bucles, tratamiento del documento como dato no confiable. F03, F04 y F12 aprobaron en todas las versiones | Que el modelo **nunca** alucine: v4 inventó una gráfica en R07 y el mismo patrón puede aparecer en otros documentos |
| **P4.** ¿La interfaz sirve sin ver la pantalla? | Cumple prácticas conocidas de accesibilidad y tiene 139 pruebas automáticas | Que sea cómoda o suficiente para una persona ciega: **no se ha probado con usuarios** |

## 9.2 Interpretación

1. **El cuello de botella de la línea base era la estructura visual, no la transcripción.** Texto, matemáticas sin resolver e instrucciones maliciosas funcionaron desde v3. Las tablas, gráficas, diagramas e imágenes necesitaron reglas por tipo y un esquema que **obligue** a llenar encabezados, filas y pares etiqueta/valor.
2. **Una restricción en el esquema pesa más que una instrucción en el prompt.** «Escribe aprox.» se ignoró dos veces; un campo booleano obligatorio (`valor_impreso`) se respetó. Es el hallazgo de diseño más transferible del proyecto.
3. **Un modelo más grande resolvió casi todo lo que el modelo local no podía.** Los fallos de las gráficas con varias series (R07, R08) y de las tablas largas (R03) no aparecen en `hybrid`. Esto sugiere que el límite estaba en el modelo local de 24 GB y no en el diseño del *pipeline*; probar un modelo de visión local más grande con el mismo *runner* queda como trabajo futuro.
4. **El respaldo importa.** Si la nube falla o no hay saldo, el sistema sigue con Ollama (más lento y con la fidelidad de la línea base). No es una degradación silenciosa: el panel y el log indican el motor y el motivo del respaldo.

## 9.3 Limitaciones

### De la evaluación
1. **Evaluador no independiente.** La revisión manual de F + G la hizo la IA asistente con la rúbrica. Debe repetirla el autor, de preferencia con un segundo evaluador humano y sin conocer qué modo produjo cada salida.
2. **Conjunto de desarrollo contaminado (G).** Dos reglas de la nube se escribieron tras ver fallos de G13 y G04. El 96.3 % sobrestima la generalización; las páginas reales (R03, R07, R08) son la mejor evidencia.
3. **Corpus pequeño y de una sola página por PDF.** 27 casos y primeras páginas; no hay medición de documentos largos ni de variación de estilos tipográficos, idiomas distintos del español y el inglés, o PDF dañados.
4. **Una sola ejecución en los corpus reales** y pocas ejecuciones por caso: no se estimó la variabilidad del modelo.
5. **Comparación v3 / v4 / hybrid incompleta** (cap. 8).
6. **Sin usuarios con discapacidad visual:** no se midió comprensión, esfuerzo, errores ni satisfacción.

### Del sistema
1. **F11 sigue fallando (menor):** transcribe la duda impresa en la página («18? o 13?») pero no la marca como `[DUDOSO]`. No se ajustó el prompt a ese patrón para no dar la respuesta del examen.
2. **Tablas muy grandes o densas y gráficas con varias series en el modo local** (F06, R03, R07, R08).
3. **Capacidad:** una página a la vez en Ollama; varios usuarios hacen cola. El modo `hybrid` no tiene ese cuello de botella, pero depende del límite del proveedor.
4. **Dependencia externa en `hybrid`:** requiere saldo y red; el proveedor puede cambiar precios, modelos o políticas.
5. **Operación manual:** cada encendido del pod exige restaurar el servidor (≈ 3 minutos con el *script*). Una sola persona opera el sistema.
6. **Seguridad pendiente:** rotar `API_KEY`, un límite global si se abre al público y revocar claves que quedaron escritas en conversaciones (cap. 6).
7. **Idiomas:** solo español e inglés; la voz del servidor solo existe para inglés.
8. **Navegador:** la ventana de selección de archivo es del sistema operativo y depende de las voces del equipo.

## 9.4 Consideraciones éticas

1. **El riesgo de la alucinación recae en quien no puede verificar.** Un error de lectura en una cifra de una gráfica o en una dosis de un prospecto (R05) puede pasar inadvertido para una persona ciega. Por eso las reglas de fidelidad priorizan **declarar la duda** sobre aparentar seguridad, y el sistema marca como «aprox.» lo estimado. Aun así, AURA **no debe presentarse como infalible** ni usarse en decisiones críticas (médicas, legales, financieras) sin una verificación independiente.
2. **Privacidad.** En `hybrid` cada página se envía a un proveedor externo. Los documentos de una persona pueden contener datos sensibles. La tesis, la ficha y cualquier presentación deben decir **qué modo se usa y a dónde viaja la página** (tabla del cap. 6). El modo local (`v4`/`v3`) existe precisamente para quien no pueda aceptar ese envío.
3. **Transparencia sobre el motor.** El sistema informa siempre qué motor atendió cada página (`/api/ready`, panel de análisis y logs). Esta tesis atribuye cada resultado al motor que lo produjo y **no presenta como logros del modelo local los resultados que obtuvo el modelo en la nube**. Una afirmación de este tipo (por ejemplo «todo corre en nuestra GPU» durante una medición con `hybrid`) sería falsa y quitaría credibilidad al resto del trabajo.
4. **Uso de IA en el desarrollo y la evaluación.** Parte del código, de la documentación y de la revisión manual preliminar se hizo con una IA asistente. Debe declararse en la tesis (apartado de metodología) y la calificación formal debe repetirla una persona.
5. **Participación de personas con discapacidad.** El diseño de accesibilidad debe validarse **con** personas con discapacidad visual, no solo **para** ellas. Es el siguiente paso prioritario.
6. **Propiedad intelectual y licencias.** El corpus real usa documentos públicos de instituciones. El modelo local publica su licencia (Apache 2.0 para la variante usada, según la ficha) y los proveedores en la nube tienen condiciones propias. **[VERIFICAR]** licencias de modelos, de Piper y de su voz antes de la entrega.
7. **Impacto ambiental y de costos.** La inferencia consume energía y dinero (GPU por hora o pago por página). El proyecto no tiene financiamiento: lo cubre una persona con saldo prepago.

## 9.5 Cómo presentar el proyecto con honestidad (texto sugerido)

Para la ficha y la presentación, una redacción **veraz y favorable** es:

> «AURA está construida alrededor de un modelo de visión abierto que se ejecuta en una GPU propia con Ollama; ese es el modo local, en el que
> los documentos no salen del servidor. Como mejora opcional, AURA puede delegar la lectura a un modelo de visión en la nube; en ese modo, que fue el que
> se midió con 26 de 27 casos aprobados, cada página se envía al proveedor, y Ollama detecta el contenido y sirve de respaldo. El sistema
> informa en pantalla qué motor atendió cada página.»

Y, en la demostración, cuando se pregunte «¿a dónde van los documentos?», la respuesta correcta depende del modo configurado en ese momento; se puede comprobar en vivo con
`GET /api/ready` y en el panel de análisis.

## 9.6 Trabajo pendiente para sostener las conclusiones

1. Corrida completa F + G × 2 para `v3`, `v4` y `hybrid`, con dos evaluadores ciegos al modo.
2. Piloto con 2–3 personas con discapacidad visual (o con una asociación) y medición de tareas.
3. Evaluación con páginas reales adicionales **no** usadas para ajustar el prompt.
4. Probar un modelo de visión local más grande con el mismo *runner*.
5. Cerrar la deuda de seguridad (rotar claves, límite global).
6. Medir la lectura de documentos completos y de varios usuarios a la vez.
