#!/usr/bin/env python3
"""Empaqueta los PNG de los listones conmemorativos (300 ppp y 600 ppp) con metadatos DPI exactos
desde variantes/listones/ hacia assets/listones/.
Los PDF vectoriales (60 × 120 mm individuales y colectivos A4) los genera directamente
herramientas/componer_listones.js con tipografía y trazos vectoriales y logotipos originales incrustados."""
import json
from pathlib import Path
from PIL import Image

RAIZ = Path(__file__).resolve().parent.parent
E = json.loads((RAIZ / "datos" / "evento.json").read_text(encoding="utf-8"))
SRC = RAIZ / "variantes" / "listones"
OUT = RAIZ / "assets" / "listones"
OUT.mkdir(parents=True, exist_ok=True)

W300, H300 = round(60 / 25.4 * 300), round(120 / 25.4 * 300)    # 709 × 1417
W600, H600 = round(60 / 25.4 * 600), round(120 / 25.4 * 600)    # 1417 × 2835


def empaquetar(personas):
    for x in personas:
        im300 = Image.open(SRC / f"{x['id']}.png").convert("RGBA")
        assert im300.size == (W300, H300), (x["id"], "300ppp", im300.size)
        im300.save(OUT / f"{x['id']}.png", dpi=(300, 300), optimize=True)

        im600 = Image.open(SRC / f"{x['id']}-600ppp.png").convert("RGBA")
        assert im600.size == (W600, H600), (x["id"], "600ppp", im600.size)
        im600.save(OUT / f"{x['id']}-600ppp.png", dpi=(600, 600), optimize=True)

        assert (OUT / f"{x['id']}.pdf").exists(), f"Falta PDF vectorial {x['id']}.pdf"


if __name__ == "__main__":
    grad, pad = E["graduandos_lista"], E["padrinos"]
    empaquetar(grad + pad)
    for col in ("listones-especialistas-2026-A4.pdf", "listones-padrinos-madrinas-A4.pdf"):
        assert (OUT / col).exists(), f"Falta colectivo {col}"
    print("Listones empaquetados:", len(grad) + len(pad), "PNG 300 ppp + PNG 600 ppp + PDF vectoriales + 2 A4 en", OUT)
