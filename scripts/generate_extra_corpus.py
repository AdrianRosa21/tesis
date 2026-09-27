#!/usr/bin/env python3
"""Genera el corpus extra de AURA (casos G01-G15).

Cada PDF tiene UNA pagina con un tipo de contenido visual dificil para un
lector de pantalla tradicional: fotografias/ilustraciones, graficas, diagramas,
tablas, formularios, mapas y paginas escaneadas sin capa de texto.

Uso:
    pip install reportlab matplotlib pillow numpy
    python scripts/generate_extra_corpus.py --out corpus_extra

Los datos esperados de cada caso estan en corpus_extra/RESPUESTAS_ESPERADAS.md
y las anclas automaticas en scripts/run_fidelity_corpus.py (CASE_RULES).
"""

from __future__ import annotations

import argparse
import io
import random
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
from matplotlib import patches  # noqa: E402
from PIL import Image, ImageFilter, ImageDraw, ImageFont  # noqa: E402
from reportlab.lib.pagesizes import letter  # noqa: E402
from reportlab.lib.utils import ImageReader  # noqa: E402
from reportlab.pdfbase import pdfmetrics  # noqa: E402
from reportlab.pdfbase.ttfonts import TTFont  # noqa: E402
from reportlab.pdfgen import canvas  # noqa: E402

W, H = letter
MARGIN = 60

FONT = "Helvetica"
FONT_BOLD = "Helvetica-Bold"


def register_fonts() -> None:
    """Usa DejaVu si existe (soporta ≥, ≤, √); si no, Helvetica."""
    global FONT, FONT_BOLD
    candidates = [
        Path(matplotlib.get_data_path()) / "fonts" / "ttf",
        Path("/usr/share/fonts/truetype/dejavu"),
        Path("C:/Windows/Fonts"),
    ]
    for base in candidates:
        regular, bold = base / "DejaVuSans.ttf", base / "DejaVuSans-Bold.ttf"
        if regular.exists() and bold.exists():
            pdfmetrics.registerFont(TTFont("DejaVu", str(regular)))
            pdfmetrics.registerFont(TTFont("DejaVu-Bold", str(bold)))
            FONT, FONT_BOLD = "DejaVu", "DejaVu-Bold"
            return


# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------

def fig_to_reader(fig) -> ImageReader:
    buffer = io.BytesIO()
    fig.savefig(buffer, format="png", dpi=160, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    buffer.seek(0)
    return ImageReader(buffer)


def new_page(path: Path, title: str) -> tuple[canvas.Canvas, float]:
    c = canvas.Canvas(str(path), pagesize=letter)
    c.setTitle(title)
    c.setFont(FONT_BOLD, 18)
    c.drawString(MARGIN, H - MARGIN, title)
    return c, H - MARGIN - 30


def paragraph(c: canvas.Canvas, text: str, y: float, size: int = 11,
              x: float = MARGIN, width: float = W - 2 * MARGIN, leading: float = 15) -> float:
    c.setFont(FONT, size)
    words, line = text.split(), ""
    for word in words:
        trial = f"{line} {word}".strip()
        if pdfmetrics.stringWidth(trial, FONT, size) > width:
            c.drawString(x, y, line)
            y -= leading
            line = word
        else:
            line = trial
    if line:
        c.drawString(x, y, line)
        y -= leading
    return y - 6


def image(c: canvas.Canvas, reader: ImageReader, x: float, y_top: float, width: float) -> float:
    iw, ih = reader.getSize()
    height = width * ih / iw
    c.drawImage(reader, x, y_top - height, width, height)
    return y_top - height - 12


# ---------------------------------------------------------------------------
# Ilustraciones (dibujadas con figuras simples)
# ---------------------------------------------------------------------------

def park_scene() -> ImageReader:
    fig, ax = plt.subplots(figsize=(6, 3.6))
    ax.set_xlim(0, 10); ax.set_ylim(0, 6); ax.axis("off")
    ax.add_patch(patches.Rectangle((0, 0), 10, 6, color="#bfe3ff"))
    ax.add_patch(patches.Rectangle((0, 0), 10, 2, color="#6cc04a"))
    ax.add_patch(patches.Circle((8.6, 5.0), 0.6, color="#ffd21f"))
    # arbol a la izquierda
    ax.add_patch(patches.Rectangle((1.3, 1.5), 0.4, 1.8, color="#7a4a1e"))
    ax.add_patch(patches.Circle((1.5, 3.8), 1.0, color="#1f7a2e"))
    # banca en el centro
    ax.add_patch(patches.Rectangle((4.0, 1.9), 2.2, 0.2, color="#8b5a2b"))
    ax.add_patch(patches.Rectangle((4.0, 2.3), 2.2, 0.15, color="#8b5a2b"))
    ax.add_patch(patches.Rectangle((4.1, 1.4), 0.15, 0.5, color="#555"))
    ax.add_patch(patches.Rectangle((5.95, 1.4), 0.15, 0.5, color="#555"))
    # perro cafe a la derecha
    ax.add_patch(patches.Ellipse((7.6, 1.6), 1.2, 0.55, color="#9c6b3c"))
    ax.add_patch(patches.Circle((8.3, 1.95), 0.3, color="#9c6b3c"))
    for dx in (7.2, 7.4, 7.8, 8.0):
        ax.add_patch(patches.Rectangle((dx, 1.0), 0.1, 0.4, color="#9c6b3c"))
    ax.plot([7.0, 6.7], [1.7, 2.1], color="#9c6b3c", lw=4)
    return fig_to_reader(fig)


def traffic_light() -> ImageReader:
    fig, ax = plt.subplots(figsize=(2.2, 4))
    ax.set_xlim(0, 2); ax.set_ylim(0, 5); ax.axis("off")
    ax.add_patch(patches.FancyBboxPatch((0.4, 1.2), 1.2, 3.4, boxstyle="round,pad=0.05", color="#222"))
    ax.add_patch(patches.Rectangle((0.9, 0), 0.2, 1.2, color="#444"))
    ax.add_patch(patches.Circle((1, 4.0), 0.4, color="#ff2020"))
    ax.add_patch(patches.Circle((1, 2.9), 0.4, color="#5a4a00"))
    ax.add_patch(patches.Circle((1, 1.8), 0.4, color="#0b3d0b"))
    return fig_to_reader(fig)


def clock_three() -> ImageReader:
    fig, ax = plt.subplots(figsize=(3.4, 3.4))
    ax.set_xlim(-1.2, 1.2); ax.set_ylim(-1.2, 1.2); ax.axis("off"); ax.set_aspect("equal")
    ax.add_patch(patches.Circle((0, 0), 1, fill=False, lw=4))
    for n in range(1, 13):
        ang = np.pi / 2 - n * np.pi / 6
        ax.text(0.8 * np.cos(ang), 0.8 * np.sin(ang), str(n), ha="center", va="center", fontsize=14)
    ax.plot([0, 0], [0, 0.7], lw=3, color="black")      # minutero en 12
    ax.plot([0, 0.5], [0, 0], lw=6, color="black")      # horario en 3
    return fig_to_reader(fig)


# ---------------------------------------------------------------------------
# Casos
# ---------------------------------------------------------------------------

def g01(path: Path) -> None:
    c, y = new_page(path, "Actividad: Un día en el parque")
    y = paragraph(c, "Observa la ilustración y responde en tu cuaderno qué elementos aparecen en ella.", y)
    y = image(c, park_scene(), MARGIN, y, 420)
    paragraph(c, "Figura 1. Ilustración del parque municipal.", y, size=10)
    c.save()


def g02(path: Path) -> None:
    c, y = new_page(path, "Distribución del gasto familiar mensual")
    labels = ["Vivienda", "Transporte", "Alimentación", "Otros"]
    values = [30, 35, 25, 10]
    fig, ax = plt.subplots(figsize=(5, 4))
    ax.pie(values, labels=[f"{l} {v}%" for l, v in zip(labels, values)],
           colors=["#4c72b0", "#dd8452", "#55a868", "#c44e52"], startangle=90)
    ax.set_title("Gasto mensual por categoría")
    y = image(c, fig_to_reader(fig), MARGIN + 40, y, 380)
    paragraph(c, "Fuente: encuesta escolar 2026.", y, size=10)
    c.save()


def g03(path: Path) -> None:
    c, y = new_page(path, "Temperatura máxima de la semana")
    days = ["Lun", "Mar", "Mié", "Jue", "Vie"]
    temps = [28, 31, 30, 33, 29]
    fig, ax = plt.subplots(figsize=(6, 3.5))
    ax.plot(days, temps, marker="o", color="#c44e52", lw=2)
    for d, t in zip(days, temps):
        ax.annotate(f"{t} °C", (d, t), textcoords="offset points", xytext=(0, 8), ha="center")
    ax.set_ylabel("Temperatura (°C)"); ax.set_xlabel("Día"); ax.set_ylim(25, 35)
    ax.set_title("San Salvador, semana 39")
    ax.grid(alpha=0.3)
    image(c, fig_to_reader(fig), MARGIN, y, 470)
    c.save()


def g04(path: Path) -> None:
    c, y = new_page(path, "Estudiantes inscritos por taller")
    talleres = ["Robótica", "Música", "Deportes", "Dibujo"]
    valores = [40, 25, 60, 15]  # sin etiquetas: el modelo debe estimar
    fig, ax = plt.subplots(figsize=(6, 3.8))
    ax.bar(talleres, valores, color="#4c72b0")
    ax.set_ylabel("Número de estudiantes"); ax.set_ylim(0, 70)
    ax.set_yticks(range(0, 71, 10)); ax.grid(axis="y", alpha=0.4)
    y = image(c, fig_to_reader(fig), MARGIN, y, 470)
    paragraph(c, "Nota: las barras no tienen el valor escrito; se lee con la escala del eje vertical.", y, size=10)
    c.save()


def g05(path: Path) -> None:
    c, y = new_page(path, "Diagrama de flujo: ¿Puede votar?")
    fig, ax = plt.subplots(figsize=(6, 6.5))
    ax.set_xlim(0, 10); ax.set_ylim(0, 11); ax.axis("off")

    def box(x, yy, text, shape="rect", color="#dbe9f6"):
        if shape == "oval":
            ax.add_patch(patches.Ellipse((x, yy), 3, 1, color=color, ec="black"))
        elif shape == "diamond":
            ax.add_patch(patches.Polygon([(x, yy + 1), (x + 2, yy), (x, yy - 1), (x - 2, yy)],
                                         color="#fff2cc", ec="black"))
        else:
            ax.add_patch(patches.Rectangle((x - 1.6, yy - 0.5), 3.2, 1, color=color, ec="black"))
        ax.text(x, yy, text, ha="center", va="center", fontsize=11)

    def arrow(x1, y1, x2, y2, label=""):
        ax.annotate("", xy=(x2, y2), xytext=(x1, y1), arrowprops=dict(arrowstyle="->", lw=1.8))
        if label:
            ax.text((x1 + x2) / 2 + 0.2, (y1 + y2) / 2 + 0.2, label, fontsize=11, color="#b00000")

    box(5, 10, "Inicio", "oval")
    box(5, 8.2, "Leer edad")
    box(5, 6, "¿Edad ≥ 18?", "diamond")
    box(2, 3.5, "Puede votar", color="#d9ead3")
    box(8, 3.5, "No puede votar", color="#f4cccc")
    box(5, 1, "Fin", "oval")
    arrow(5, 9.5, 5, 8.7)
    arrow(5, 7.7, 5, 7.0)
    arrow(3, 6, 2, 4.0, "Sí")
    arrow(7, 6, 8, 4.0, "No")
    arrow(2, 3.0, 4.2, 1.3)
    arrow(8, 3.0, 5.8, 1.3)
    image(c, fig_to_reader(fig), MARGIN + 30, y, 420)
    c.save()


def g06(path: Path) -> None:
    c, y = new_page(path, "Horario de clases - 2.º año de bachillerato")
    headers = ["Hora", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes"]
    rows = [
        ["7:00", "Matemática", "Inglés", "Matemática", "Física", "Programación"],
        ["8:00", "Lenguaje", "Programación", "Ciencias", "Matemática", "Inglés"],
        ["9:00", "RECREO", "RECREO", "RECREO", "RECREO", "RECREO"],
        ["9:30", "Física", "Base de datos", "Inglés", "Programación", "Lenguaje"],
        ["10:30", "Base de datos", "Ciencias", "Educación física", "Lenguaje", "Orientación"],
    ]
    col_w = (W - 2 * MARGIN) / len(headers)
    row_h = 26
    y -= 10
    for r_index, row in enumerate([headers] + rows):
        for col, value in enumerate(row):
            x = MARGIN + col * col_w
            if r_index == 0:
                c.setFillColorRGB(0.85, 0.9, 0.97)
                c.rect(x, y - row_h, col_w, row_h, fill=1, stroke=1)
            else:
                c.rect(x, y - row_h, col_w, row_h, fill=0, stroke=1)
            c.setFillColorRGB(0, 0, 0)
            c.setFont(FONT_BOLD if r_index == 0 else FONT, 9)
            c.drawCentredString(x + col_w / 2, y - row_h + 9, value)
        y -= row_h
    paragraph(c, "El recreo dura 30 minutos.", y - 20, size=10)
    c.save()


def g07(path: Path) -> None:
    c, y = new_page(path, "Boletín ambiental del instituto")
    col_w = (W - 2 * MARGIN - 20) / 2
    left = ("Columna izquierda. Durante septiembre recolectamos 320 kilogramos de plástico "
            "gracias a la campaña de reciclaje. Cada sección participó con sus propias bolsas "
            "y el segundo año obtuvo el primer lugar.")
    right = ("Columna derecha. El próximo mes plantaremos 45 árboles en la zona norte del "
             "campus. Los voluntarios deben inscribirse con su orientador antes del viernes 9 de octubre.")
    yl = paragraph(c, left, y, x=MARGIN, width=col_w)
    paragraph(c, right, y, x=MARGIN + col_w + 20, width=col_w)
    image(c, traffic_light(), MARGIN + 10, yl - 10, 70)
    c.setFont(FONT, 9)
    c.drawString(MARGIN + 100, yl - 60, "Ícono: semáforo en rojo = alto al desperdicio.")
    c.save()


def g08(path: Path) -> None:
    c, y = new_page(path, "Mapa del campus")
    fig, ax = plt.subplots(figsize=(6, 5))
    ax.set_xlim(0, 10); ax.set_ylim(0, 8); ax.axis("off")
    zones = [
        ((0.5, 4.5), 4, 3, "Biblioteca", "#cfe2f3"),
        ((5.5, 4.5), 4, 3, "Cafetería", "#fce5cd"),
        ((0.5, 0.5), 4, 3, "Laboratorio de cómputo", "#d9ead3"),
        ((5.5, 0.5), 4, 3, "Cancha", "#ead1dc"),
    ]
    for (x, yy), w, h, name, color in zones:
        ax.add_patch(patches.Rectangle((x, yy), w, h, color=color, ec="black"))
        ax.text(x + w / 2, yy + h / 2, name, ha="center", va="center", fontsize=11)
    ax.add_patch(patches.Circle((5, 4), 0.35, color="#cc0000"))
    ax.text(5, 3.4, "Usted está aquí", ha="center", fontsize=9, color="#cc0000")
    ax.annotate("N", xy=(9.6, 7.9), xytext=(9.6, 7.0), ha="center",
                arrowprops=dict(arrowstyle="->", lw=2), fontsize=12)
    image(c, fig_to_reader(fig), MARGIN + 20, y, 440)
    c.save()


def g09(path: Path) -> None:
    c, y = new_page(path, "Guía de ejercicios - Álgebra")
    y = paragraph(c, "Lee cada expresión. No es necesario resolverlas en esta hoja.", y)
    exprs = [
        r"1)  $x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}$",
        r"2)  $\sqrt{49} + 3^2 = ?$",
        r"3)  $\frac{5}{8} - \frac{1}{4} = ?$",
        r"4)  $2x^3 - 7x + 4 = 0$",
    ]
    for e in exprs:
        fig = plt.figure(figsize=(5, 0.7))
        fig.text(0.01, 0.3, e, fontsize=18)
        y = image(c, fig_to_reader(fig), MARGIN, y, 330)
    c.save()


def g10(path: Path) -> None:
    """Pagina escaneada: solo imagen, sin capa de texto, ligeramente girada."""
    img = Image.new("L", (1275, 1650), 255)
    draw = ImageDraw.Draw(img)
    font_path = Path(matplotlib.get_data_path()) / "fonts" / "ttf" / "DejaVuSerif.ttf"
    font = ImageFont.truetype(str(font_path), 30)
    big = ImageFont.truetype(str(font_path), 44)
    lines = [
        ("CONSTANCIA DE PARTICIPACIÓN", big),
        ("", font),
        ("Se hace constar que la estudiante", font),
        ("María Fernanda López Hernández", font),
        ("participó en la Feria de Ciencias 2026", font),
        ("con el proyecto \"Filtro de agua solar\".", font),
        ("", font),
        ("Santa Tecla, 18 de agosto de 2026.", font),
    ]
    yy = 180
    for text, f in lines:
        draw.text((120, yy), text, fill=0, font=f)
        yy += 70
    rng = random.Random(7)
    for _ in range(2500):  # ruido de escaner
        draw.point((rng.randrange(1275), rng.randrange(1650)), fill=rng.randrange(80, 200))
    img = img.rotate(1.2, fillcolor=255, resample=Image.BICUBIC).filter(ImageFilter.GaussianBlur(0.7))
    buffer = io.BytesIO(); img.save(buffer, format="PNG"); buffer.seek(0)
    c = canvas.Canvas(str(path), pagesize=letter)
    c.setTitle("Constancia escaneada")
    c.drawImage(ImageReader(buffer), 0, 0, W, H)
    c.save()


def g11(path: Path) -> None:
    c, y = new_page(path, "Formulario de inscripción al taller")
    fields = [("Nombre completo:", "Carlos Ernesto Ramírez"), ("Grado:", "2.º año B"),
              ("Teléfono:", "7012-3456")]
    for label, value in fields:
        c.setFont(FONT_BOLD, 11); c.drawString(MARGIN, y, label)
        c.setFont(FONT, 11); c.drawString(MARGIN + 130, y, value)
        c.line(MARGIN + 125, y - 3, W - MARGIN, y - 3)
        y -= 30
    c.setFont(FONT_BOLD, 11); c.drawString(MARGIN, y, "Taller elegido (marque uno):"); y -= 26
    options = [("Robótica", True), ("Música", False), ("Dibujo", False)]
    for name, checked in options:
        c.rect(MARGIN + 10, y - 2, 12, 12)
        if checked:
            c.setLineWidth(2)
            c.line(MARGIN + 11, y + 4, MARGIN + 15, y - 1); c.line(MARGIN + 15, y - 1, MARGIN + 22, y + 10)
            c.setLineWidth(1)
        c.setFont(FONT, 11); c.drawString(MARGIN + 30, y, name)
        y -= 24
    y -= 10
    c.setFont(FONT_BOLD, 11); c.drawString(MARGIN, y, "¿Necesita transporte?")
    c.circle(MARGIN + 180, y + 4, 6); c.setFont(FONT, 11); c.drawString(MARGIN + 192, y, "Sí")
    c.circle(MARGIN + 240, y + 4, 6); c.circle(MARGIN + 240, y + 4, 3, fill=1)
    c.drawString(MARGIN + 252, y, "No")
    c.save()


def g12(path: Path) -> None:
    c, y = new_page(path, "Diagrama de Venn: lenguajes conocidos")
    fig, ax = plt.subplots(figsize=(6, 4))
    ax.set_xlim(0, 10); ax.set_ylim(0, 6.5); ax.axis("off"); ax.set_aspect("equal")
    ax.add_patch(patches.Circle((3.8, 3), 2.4, alpha=0.4, color="#4c72b0"))
    ax.add_patch(patches.Circle((6.2, 3), 2.4, alpha=0.4, color="#dd8452"))
    ax.text(3.8, 5.8, "Python", ha="center", fontsize=13, weight="bold")
    ax.text(6.2, 5.8, "JavaScript", ha="center", fontsize=13, weight="bold")
    ax.text(2.8, 3, "12", fontsize=16, ha="center")
    ax.text(5.0, 3, "8", fontsize=16, ha="center")
    ax.text(7.2, 3, "15", fontsize=16, ha="center")
    ax.text(9.3, 0.4, "Ninguno: 5", fontsize=11, ha="right")
    image(c, fig_to_reader(fig), MARGIN + 20, y, 440)
    c.save()


def g13(path: Path) -> None:
    c, y = new_page(path, "Actividad de observación")
    c.setFont(FONT, 11)
    c.drawString(MARGIN, y, "Observa las dos figuras y describe lo que representa cada una."); y -= 20
    y_top = y
    image(c, traffic_light(), MARGIN + 40, y_top, 110)
    image(c, clock_three(), MARGIN + 260, y_top, 190)
    c.setFont(FONT, 10)
    c.drawString(MARGIN + 40, y_top - 215, "Figura 1")
    c.drawString(MARGIN + 320, y_top - 215, "Figura 2")
    c.save()


def g14(path: Path) -> None:
    c, y = new_page(path, "Organigrama del instituto")
    fig, ax = plt.subplots(figsize=(8, 4.4))
    ax.set_xlim(-0.5, 12.5); ax.set_ylim(0, 7); ax.axis("off")

    def node(x, yy, text):
        ax.add_patch(patches.FancyBboxPatch((x - 1.6, yy - 0.45), 3.2, 0.9,
                                            boxstyle="round,pad=0.05", color="#dbe9f6", ec="black"))
        ax.text(x, yy, text, ha="center", va="center", fontsize=8)

    def link(x1, y1, x2, y2):
        ax.annotate("", xy=(x2, y2 + 0.5), xytext=(x1, y1 - 0.5), arrowprops=dict(arrowstyle="->"))

    node(6, 6, "Director")
    node(3, 3.8, "Subdirección académica")
    node(9, 3.8, "Subdirección administrativa")
    node(1.4, 1.2, "Coordinación de Software")
    node(5.0, 1.2, "Coordinación de Ciencias")
    node(9, 1.2, "Contabilidad")
    link(6, 6, 3, 3.8); link(6, 6, 9, 3.8)
    link(3, 3.8, 1.4, 1.2); link(3, 3.8, 5.0, 1.2); link(9, 3.8, 9, 1.2)
    image(c, fig_to_reader(fig), MARGIN, y, 490)
    c.save()


def g15(path: Path) -> None:
    c, y = new_page(path, "Resultados del torneo interescolar")
    y = paragraph(c, "La siguiente gráfica compara los puntos de cada equipo en dos jornadas.", y)
    equipos = ["Águilas", "Leones", "Pumas"]
    j1, j2 = [12, 9, 15], [18, 14, 11]
    x = np.arange(len(equipos))
    fig, ax = plt.subplots(figsize=(6, 3.8))
    b1 = ax.bar(x - 0.2, j1, 0.4, label="Jornada 1", color="#4c72b0")
    b2 = ax.bar(x + 0.2, j2, 0.4, label="Jornada 2", color="#dd8452")
    ax.bar_label(b1); ax.bar_label(b2)
    ax.set_xticks(x, equipos); ax.set_ylabel("Puntos"); ax.legend(); ax.set_ylim(0, 22)
    image(c, fig_to_reader(fig), MARGIN, y, 470)
    c.save()


CASES = {
    "G01_ilustracion_parque": g01,
    "G02_grafica_pastel": g02,
    "G03_grafica_lineas": g03,
    "G04_barras_sin_valores": g04,
    "G05_diagrama_flujo": g05,
    "G06_tabla_horario": g06,
    "G07_boletin_dos_columnas_icono": g07,
    "G08_mapa_campus": g08,
    "G09_formulas_matematicas": g09,
    "G10_escaneado_sin_texto": g10,
    "G11_formulario_casillas": g11,
    "G12_diagrama_venn": g12,
    "G13_dos_figuras": g13,
    "G14_organigrama": g14,
    "G15_barras_agrupadas": g15,
}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, default=Path("corpus_extra"))
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    register_fonts()
    for name, build in CASES.items():
        build(args.out / f"{name}.pdf")
        print("Generado", name)


if __name__ == "__main__":
    main()
