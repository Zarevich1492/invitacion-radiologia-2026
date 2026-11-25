#!/usr/bin/env python3
"""Portadas verticales a la medida de la hoja de la tarjeta (3125 × 4830 px = media cara del pliego).

Antes: la portada horizontal (6250 × 4830) se mostraba completa dentro de la hoja vertical, reducida
al 50 % y con bandas vacías arriba y abajo.
Ahora: los MISMOS elementos originales (fila de logotipos institucionales, logotipo de la promoción y
bloque de texto) se reacomodan en vertical. Solo hay escalado proporcional (siempre REDUCCIÓN desde
los píxeles originales, nunca ampliación) y cambio de posición: no se redibuja, recolorea ni deforma nada.

Escala única ESCALA = 0.75 de los píxeles originales → en pantalla cada elemento se ve 1,5 veces
(+50 %) más grande que en la composición horizontal reducida al 50 %.
Márgenes de seguridad: ≥ 9 % del ancho a cada lado; la composición se centra ópticamente
(ligeramente por encima del centro geométrico)."""
from pathlib import Path
import json
from PIL import Image
import numpy as np

RAIZ = Path(__file__).resolve().parent.parent
W, H = 3125, 4830
ESCALA = 0.75
MARGEN_X = round(W * 0.09)          # 281 px
ANCHO_UTIL = W - 2 * MARGEN_X       # 2563 px

# Regiones medidas en la portada original 3-portada.png (idénticas en las variantes B y C)
REG_LOGOS = (1700, 100, 4500, 560)    # fila ULA | Departamento
REG_PROMO = (2000, 560, 4200, 3228)   # logotipo de la XXIV Promoción
REG_TEXTO = (0, 3228, 6250, 4420)     # bloque de textos de portada


def recorte_ajustado(img, reg, pad=24):
    """Recorta la región al contenido real (diferente del crema de fondo) con un margen."""
    x0, y0, x1, y1 = reg
    a = np.asarray(img.crop(reg).convert("RGB")).astype(int)
    fondo = np.array(img.getpixel((20, 20))[:3])
    m = np.abs(a - fondo).sum(2) > 24
    ys, xs = np.where(m.any(1))[0], np.where(m.any(0))[0]
    return img.crop((x0 + xs[0] - pad, y0 + ys[0] - pad, x0 + xs[-1] + 1 + pad, y0 + ys[-1] + 1 + pad))


def escalar(img, k):
    return img.resize((round(img.width * k), round(img.height * k)), Image.LANCZOS)


def componer(origen: Path, destino: Path):
    src = Image.open(origen).convert("RGB")
    # Logotipos SIEMPRE desde la portada original (píxeles oficiales, idénticos en las tres variantes)
    orig = Image.open(RAIZ / "originales" / "3-portada.png").convert("RGB")
    crema = orig.getpixel((20, 20))
    logos = escalar(recorte_ajustado(orig, REG_LOGOS), ESCALA)
    promo = escalar(recorte_ajustado(orig, REG_PROMO), ESCALA)
    texto = recorte_ajustado(src, REG_TEXTO)
    kt = min(ESCALA, ANCHO_UTIL / texto.width)      # el texto nunca rebasa los márgenes
    texto = escalar(texto, kt)

    gap1, gap2 = 300, 250
    total = logos.height + gap1 + promo.height + gap2 + texto.height
    libre = H - total
    y = round(libre * 0.46)                           # centrado óptico
    lienzo = Image.new("RGB", (W, H), crema)
    cajas = []
    for el, g in ((logos, gap1), (promo, gap2), (texto, 0)):
        x = (W - el.width) // 2
        lienzo.paste(el, (x, y)); cajas.append((x, y, x + el.width, y + el.height))
        y += el.height + g
    lienzo.save(destino, optimize=True)

    # Verificaciones: dentro de márgenes, sin recortes
    for (x0, y0, x1, y1) in cajas:
        assert x0 >= MARGEN_X - 30 and x1 <= W - MARGEN_X + 30, f"rebasa margen lateral: {(x0, x1)}"
        assert y0 >= 0.08 * H and y1 <= 0.92 * H, f"rebasa margen vertical: {(y0, y1)}"
    return {"archivo": destino.name, "escala_logos_promo": ESCALA, "escala_texto": round(kt, 3), "cajas": cajas,
            "margen_sup_%": round(100 * cajas[0][1] / H, 1), "margen_inf_%": round(100 * (H - cajas[-1][3]) / H, 1),
            "margen_lat_min_%": round(100 * min(min(c[0], W - c[2]) for c in cajas) / W, 1)}


# ---------- Contraportadas verticales (mismo criterio: solo escala y posición) ----------
REG_ARTE = (0, 400, 6250, 2928)      # ilustración (montañas y sol)
REG_TEXTO_C = (0, 2928, 6250, 4100)  # textos de contraportada
REG_LOGOS_C = (0, 4150, 6250, 4650)  # logotipos institucionales


def componer_contra(origen: Path, destino: Path):
    src = Image.open(origen).convert("RGB")
    orig = Image.open(RAIZ / "originales" / "5-contraportada.png").convert("RGB")
    crema = orig.getpixel((20, 20))
    arte = escalar(recorte_ajustado(orig, REG_ARTE), ESCALA)
    texto = recorte_ajustado(src, REG_TEXTO_C)
    texto = escalar(texto, min(ESCALA, ANCHO_UTIL / texto.width))
    logos = escalar(recorte_ajustado(orig, REG_LOGOS_C), ESCALA)
    gaps = (230, 300)
    total = arte.height + gaps[0] + texto.height + gaps[1] + logos.height
    y = round((H - total) * 0.46)
    lienzo = Image.new("RGB", (W, H), crema); cajas = []
    for el, g in ((arte, gaps[0]), (texto, gaps[1]), (logos, 0)):
        x = (W - el.width) // 2; lienzo.paste(el, (x, y)); cajas.append((x, y, x + el.width, y + el.height)); y += el.height + g
    lienzo.save(destino, optimize=True)
    for (x0, y0, x1, y1) in cajas:
        assert x0 >= MARGEN_X - 30 and x1 <= W - MARGEN_X + 30 and y0 >= 0.08 * H and y1 <= 0.92 * H, (destino.name, (x0, y0, x1, y1))
    return {"archivo": destino.name, "margen_sup_%": round(100 * cajas[0][1] / H, 1), "margen_inf_%": round(100 * (H - cajas[-1][3]) / H, 1)}


if __name__ == "__main__":
    VAR = RAIZ / "variantes"; VAR.mkdir(exist_ok=True)
    fuentes = {"A": RAIZ / "originales" / "3-portada.png", "B": VAR / "B-portada.png", "C": VAR / "C-portada.png"}
    informe = {v: componer(f, VAR / f"{v}-portada-vertical.png") for v, f in fuentes.items()}
    contras = {"A": RAIZ / "originales" / "5-contraportada.png", "B": VAR / "B-contraportada.png", "C": VAR / "C-contraportada.png"}
    informe.update({v + "-contra": componer_contra(f, VAR / f"{v}-contraportada-vertical.png") for v, f in contras.items()})
    print(json.dumps(informe, indent=1, ensure_ascii=False))
