#!/usr/bin/env python3
"""Descargas de los listones conmemorativos a partir de variantes/listones/<id>.png (709 × 1417, RGBA).

- PNG individual a 300 ppp (60 × 120 mm), fondo transparente fuera de la forma en V.
- PDF individual a tamaño real (página de 60 × 120 mm).
- PDF colectivos A4 (210 × 297 mm), 6 listones por hoja (3 × 2), con marcas de corte.
"""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

RAIZ = Path(__file__).resolve().parent.parent
E = json.loads((RAIZ / "datos" / "evento.json").read_text(encoding="utf-8"))
SRC = RAIZ / "variantes" / "listones"
OUT = RAIZ / "assets" / "listones"
OUT.mkdir(parents=True, exist_ok=True)
PPP = 300
MM = PPP / 25.4
W, H = round(60 * MM), round(120 * MM)                      # 709 × 1417
A4 = (round(210 * MM), round(297 * MM))                      # 2480 × 3508


def sobre_blanco(im):
    fondo = Image.new("RGB", im.size, "white")
    fondo.paste(im, (0, 0), im)
    return fondo


def individuales(personas):
    for x in personas:
        im = Image.open(SRC / f"{x['id']}.png").convert("RGBA")
        assert im.size == (W, H), (x["id"], im.size)
        im.save(OUT / f"{x['id']}.png", dpi=(PPP, PPP), optimize=True)
        sobre_blanco(im).save(OUT / f"{x['id']}.pdf", resolution=PPP, title=f"Listón · {x['nombre']}")


def colectivo(personas, archivo, titulo):
    gx, gy = round(8 * MM), round(10 * MM)
    ox = (A4[0] - (3 * W + 2 * gx)) // 2
    oy = (A4[1] - (2 * H + gy)) // 2
    try:
        fuente = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 30)
    except OSError:
        fuente = ImageFont.load_default()
    hojas = []
    for i in range(0, len(personas), 6):
        hoja = Image.new("RGB", A4, "white"); d = ImageDraw.Draw(hoja)
        for k, x in enumerate(personas[i:i + 6]):
            cx, cy = ox + (k % 3) * (W + gx), oy + (k // 3) * (H + gy)
            im = Image.open(SRC / f"{x['id']}.png").convert("RGBA")
            hoja.paste(im, (cx, cy), im)
            # Marcas de corte (4 mm, fuera del listón, gris 0,2 mm)
            L, sep, g = round(4 * MM), round(1.5 * MM), (120, 120, 120)
            for (px, py) in ((cx, cy), (cx + W, cy), (cx, cy + H), (cx + W, cy + H)):
                sx = -1 if px == cx else 1; sy = -1 if py == cy else 1
                d.line([(px + sx * sep, py), (px + sx * (sep + L), py)], fill=g, width=2)
                d.line([(px, py + sy * sep), (px, py + sy * (sep + L))], fill=g, width=2)
        n = i // 6 + 1; total = (len(personas) + 5) // 6
        d.text((ox, A4[1] - round(12 * MM)), f"{titulo} · hoja {n} de {total} · listones de 60 × 120 mm · imprimir al 100 % (sin ajustar a la página)", fill=(110, 110, 110), font=fuente)
        hojas.append(hoja)
    hojas[0].save(OUT / archivo, save_all=True, append_images=hojas[1:], resolution=PPP, title=titulo)


if __name__ == "__main__":
    grad, pad = E["graduandos_lista"], E["padrinos"]
    individuales(grad + pad)
    colectivo(grad, "listones-especialistas-2026-A4.pdf", "XXIV Promoción de Radiólogos · Especialistas 2026")
    colectivo(pad, "listones-padrinos-madrinas-A4.pdf", "XXIV Promoción de Radiólogos · Padrinos y madrinas de promoción")
    print("Listones generados:", len(grad) + len(pad), "individuales + 2 colectivos A4 en", OUT)
