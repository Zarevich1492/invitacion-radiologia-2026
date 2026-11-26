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
REG_TEXTO = (0, 3228, 6250, 4680)     # bloque de textos de portada


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


MARGEN_V = round(H * 0.075)            # 362 px arriba y abajo
MARGEN_L = round(W * 0.075)            # 234 px a cada lado
ANCHO_MAX = W - 2 * MARGEN_L           # 2657 px (85 % del ancho)
ALTO_UTIL = H - 2 * MARGEN_V           # 4106 px (85 % del alto)
SEP = 170                              # separación entre bloques


def apilar(bloques, destino, crema):
    """Apila los bloques centrados; el espacio sobrante (si lo hay) se reparte en las separaciones."""
    total = sum(b.height for b in bloques)
    sep = max(SEP, (ALTO_UTIL - total) // (len(bloques) - 1)) if len(bloques) > 1 else 0
    sep = min(sep, 320)
    alto = total + sep * (len(bloques) - 1)
    y = MARGEN_V + max(0, round((ALTO_UTIL - alto) * 0.46))
    lienzo = Image.new("RGB", (W, H), crema); cajas = []
    for b in bloques:
        x = (W - b.width) // 2; lienzo.paste(b, (x, y)); cajas.append((x, y, x + b.width, y + b.height)); y += b.height + sep
    lienzo.save(destino, optimize=True)
    for (x0, y0, x1, y1) in cajas:
        assert x0 >= MARGEN_L - 2 and x1 <= W - MARGEN_L + 2 and y0 >= MARGEN_V - 2 and y1 <= H - MARGEN_V + 2, (destino.name, (x0, y0, x1, y1))
    ocup_v = (cajas[-1][3] - cajas[0][1]) / H
    ocup_h = max(c[2] - c[0] for c in cajas) / W
    return cajas, round(100 * ocup_v, 1), round(100 * ocup_h, 1)


def componer(origen: Path, destino: Path):
    src = Image.open(origen).convert("RGB")
    orig = Image.open(RAIZ / "originales" / "3-portada.png").convert("RGB")   # logotipos SIEMPRE del original
    crema = orig.getpixel((20, 20))
    logos_o = recorte_ajustado(orig, REG_LOGOS); promo_o = recorte_ajustado(orig, REG_PROMO); texto_o = recorte_ajustado(src, REG_TEXTO)
    k_logos = min(0.90, ANCHO_MAX / logos_o.width)
    k_texto = min(1.0, ANCHO_MAX / texto_o.width)
    resto = ALTO_UTIL - logos_o.height * k_logos - texto_o.height * k_texto - 2 * SEP
    k_promo = min(1.0, resto / promo_o.height, ANCHO_MAX / promo_o.width)
    bloques = [escalar(logos_o, k_logos), escalar(promo_o, k_promo), escalar(texto_o, k_texto)]
    cajas, ov, oh = apilar(bloques, destino, crema)
    return {"archivo": destino.name, "escalas": {"logos": round(k_logos, 3), "promo": round(k_promo, 3), "texto": round(k_texto, 3)},
            "ocupacion_vertical_%": ov, "ancho_max_%": oh, "margen_sup_%": round(100 * cajas[0][1] / H, 1), "margen_inf_%": round(100 * (H - cajas[-1][3]) / H, 1)}


# ---------- Contraportadas verticales (mismo criterio: solo escala y posición) ----------
REG_ARTE = (0, 400, 6250, 2928)      # ilustración (montañas y sol)
REG_TEXTO_C = (0, 2928, 6250, 4100)  # textos de contraportada
REG_LOGOS_C = (0, 4150, 6250, 4650)  # logotipos institucionales


def componer_contra(origen: Path, destino: Path):
    src = Image.open(origen).convert("RGB")
    orig = Image.open(RAIZ / "originales" / "5-contraportada.png").convert("RGB")   # ilustración y logotipos del original
    crema = orig.getpixel((20, 20))
    arte_o = recorte_ajustado(orig, REG_ARTE); texto_o = recorte_ajustado(src, REG_TEXTO_C); logos_o = recorte_ajustado(orig, REG_LOGOS_C)
    k_logos = min(0.90, ANCHO_MAX / logos_o.width)
    k_texto = min(0.95, ANCHO_MAX / texto_o.width)
    resto = ALTO_UTIL - logos_o.height * k_logos - texto_o.height * k_texto - 2 * SEP
    k_arte = min(1.0, resto / arte_o.height, ANCHO_MAX / arte_o.width)
    bloques = [escalar(arte_o, k_arte), escalar(texto_o, k_texto), escalar(logos_o, k_logos)]
    cajas, ov, oh = apilar(bloques, destino, crema)
    return {"archivo": destino.name, "escalas": {"ilustracion": round(k_arte, 3), "texto": round(k_texto, 3), "logos": round(k_logos, 3)},
            "ocupacion_vertical_%": ov, "ancho_max_%": oh, "margen_sup_%": round(100 * cajas[0][1] / H, 1), "margen_inf_%": round(100 * (H - cajas[-1][3]) / H, 1)}


if __name__ == "__main__":
    VAR = RAIZ / "variantes"; VAR.mkdir(exist_ok=True)
    fuentes = {"A": RAIZ / "originales" / "3-portada.png", "B": VAR / "B-portada.png", "C": VAR / "C-portada.png"}
    informe = {v: componer(f, VAR / f"{v}-portada-vertical.png") for v, f in fuentes.items()}
    contras = {"A": RAIZ / "originales" / "5-contraportada.png", "B": VAR / "B-contraportada.png", "C": VAR / "C-contraportada.png"}
    informe.update({v + "-contra": componer_contra(f, VAR / f"{v}-contraportada-vertical.png") for v, f in contras.items()})
    print(json.dumps(informe, indent=1, ensure_ascii=False))
