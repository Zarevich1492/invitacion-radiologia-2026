#!/usr/bin/env python3
"""Segunda etapa de composición de variantes (sin alterar ilustraciones).
Parte del PNG ORIGINAL, cubre los bloques de texto con el crema exacto de cada original,
traslada bloques originales cuando corresponde y superpone la capa de texto transparente
renderizada por componer_variantes.js. Los píxeles de las ilustraciones quedan idénticos."""
import json
from pathlib import Path
from PIL import Image

RAIZ = Path(__file__).resolve().parent.parent
CAPAS = RAIZ / "variantes" / "_capas"

ops = json.loads((CAPAS / "operaciones.json").read_text())
for nombre, op in ops.items():
    original = Image.open(RAIZ / "originales" / op["base"]).convert("RGB")
    lienzo = original.copy()
    CREMA = original.getpixel((20, 20))  # crema exacto de ESTA composición (3/5: 245,231,211 · 4: 245,229,208)
    for x, y, w, h in op["tapar"]:
        lienzo.paste(CREMA, (x, y, x + w, y + h))
    for m in op["mover"]:
        dx, dy, w, h = m["destino"]; ox, oy = m["origen"]
        lienzo.paste(original.crop((ox, oy, ox + w, oy + h)), (dx, dy))
    texto = Image.open(CAPAS / f"{nombre}.png").convert("RGBA")
    lienzo = Image.alpha_composite(lienzo.convert("RGBA"), texto).convert("RGB")
    lienzo.save(RAIZ / "variantes" / f"{nombre}.png", optimize=True)
    print(nombre, "ok")
