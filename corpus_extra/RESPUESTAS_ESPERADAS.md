# Corpus extra de AURA (G01–G15): respuestas esperadas

Estos PDF se generan con `python scripts/generate_extra_corpus.py --out corpus_extra`.
Cada uno tiene una sola página. Se suman a los casos F01–F12 para medir la meta del **85 %**.

**Cómo se califica un caso.** Un caso se **aprueba** solo si cumple las tres condiciones:

1. **Completo:** aparecen todos los datos de la columna "Debe decir".
2. **Relacionado:** cada etiqueta va unida a su valor, y en los diagramas se respeta la dirección de las flechas.
3. **Fiel:** no inventa elementos, no resuelve ejercicios y no aparece nada de la columna "No debe decir".

El runner revisa automáticamente la condición 1 con anclas de texto (`candidate_pass`). Las condiciones 2 y 3 se confirman a mano leyendo la salida.

| Caso | Tipo de contenido | Debe decir | No debe decir / criterio manual |
|---|---|---|---|
| G01 | Ilustración (parque) | Árbol a la izquierda, banca en el centro, perro café a la derecha, sol amarillo arriba a la derecha, pasto verde, cielo celeste. Pie "Figura 1. Ilustración del parque municipal." | No debe inventar personas ni otros objetos. Falla si solo lee el pie de imagen. |
| G02 | Gráfica de pastel | Vivienda 30 %, Transporte 35 %, Alimentación 25 %, Otros 10 %. Título "Gasto mensual por categoría". Fuente. | Cada porcentaje debe ir junto a su categoría. |
| G03 | Gráfica de líneas | Lun 28 °C, Mar 31 °C, Mié 30 °C, Jue 33 °C, Vie 29 °C. Eje Y: Temperatura (°C). Título "San Salvador, semana 39". | Cada día debe ir unido a su valor. |
| G04 | Barras sin valores escritos | Robótica ≈ 40, Música ≈ 25, Deportes ≈ 60, Dibujo ≈ 15 (se acepta ±5). | Debe indicar que son valores aproximados. |
| G05 | Diagrama de flujo | Inicio → Leer edad → ¿Edad ≥ 18? → **Sí** → Puede votar → Fin; **No** → No puede votar → Fin. | Si invierte Sí/No o la dirección de alguna flecha, el caso falla. |
| G06 | Tabla (horario 6×6) | Las 5 horas × 5 días. Ejemplos: 7:00 Viernes = Programación; 9:00 = RECREO todos los días; 10:30 Miércoles = Educación física. | No debe leer las celdas sueltas sin su hora ni su día. |
| G07 | Dos columnas + ícono | Primero la columna izquierda completa (320 kg de plástico, segundo año en primer lugar) y después la derecha (45 árboles, viernes 9 de octubre). Ícono de semáforo en rojo. | No debe mezclar líneas de las dos columnas. |
| G08 | Mapa | Biblioteca arriba a la izquierda, Cafetería arriba a la derecha, Laboratorio de cómputo abajo a la izquierda, Cancha abajo a la derecha, punto rojo "Usted está aquí" en el centro, flecha del norte arriba a la derecha. | Debe dar la posición de cada zona. |
| G09 | Fórmulas | 1) fórmula general: x = (−b ± raíz de b² − 4ac) / 2a; 2) raíz de 49 + 3² = ?; 3) 5/8 − 1/4 = ?; 4) 2x³ − 7x + 4 = 0. | **No debe resolver:** no puede aparecer 16, 3/8 ni ningún resultado. |
| G10 | Escaneado sin capa de texto | CONSTANCIA DE PARTICIPACIÓN; María Fernanda López Hernández; Feria de Ciencias 2026; proyecto "Filtro de agua solar"; Santa Tecla, 18 de agosto de 2026. | Sin texto auxiliar: prueba el OCR puro del modelo. No debe cambiar nombres. |
| G11 | Formulario con casillas | Nombre Carlos Ernesto Ramírez; Grado 2.º año B; Teléfono 7012-3456; casilla **marcada: Robótica** (Música y Dibujo vacías); transporte: **No** seleccionado. | Falla si no distingue qué casilla u opción está marcada. |
| G12 | Diagrama de Venn | Círculo Python, círculo JavaScript; solo Python 12, ambos 8, solo JavaScript 15; Ninguno: 5. | Debe decir que el 8 está en la intersección. |
| G13 | Dos figuras sin pie descriptivo | Figura 1: semáforo con la luz roja encendida. Figura 2: reloj analógico que marca las 3:00. | Falla si no describe ambas figuras. |
| G14 | Organigrama | Director → Subdirección académica y Subdirección administrativa; Subdirección académica → Coordinación de Software y Coordinación de Ciencias; Subdirección administrativa → Contabilidad. | La jerarquía (quién depende de quién) debe ser correcta. |
| G15 | Barras agrupadas | Águilas: J1 12, J2 18; Leones: J1 9, J2 14; Pumas: J1 15, J2 11. Leyenda: Jornada 1 azul, Jornada 2 naranja. | Cada valor debe ir unido a su equipo **y** a su jornada. |

## Meta

Entre F01–F12 y G01–G15 hay **27 casos**. El 85 % equivale a **23 casos aprobados** como mínimo.
Se recomienda ejecutar cada caso **2 veces** (`--runs 2 --fresh-runs`) y aprobarlo solo si pasa en ambas ejecuciones.
