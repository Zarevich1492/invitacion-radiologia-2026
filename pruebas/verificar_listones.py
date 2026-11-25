#!/usr/bin/env python3
"""Verifica los archivos de listones: medidas, 300 ppp, PDF a tamaño real, A4, transparencia en la V,
denominaciones correctas y ausencia de información logística en la plantilla."""
import json, re, sys
from pathlib import Path
from PIL import Image

R = Path(__file__).resolve().parent.parent
E = json.loads((R / "datos/evento.json").read_text(encoding="utf-8"))
D = R / "assets/listones"
res = []
ok = lambda n, c, d="": (res.append(bool(c)), print(("✔ " if c else "✘ ") + n + (f" — {d}" if d else "")))

def mm(pdf):
    t = pdf.read_bytes()
    return [(round(float(a) / 72 * 25.4, 1), round(float(b) / 72 * 25.4, 1)) for a, b in re.findall(rb"/MediaBox \[ ?0 0 ([\d.]+) ([\d.]+) ?\]", t)]

personas = E["graduandos_lista"] + E["padrinos"]
ok("17 listones previstos (7 especialistas + 10 padrinos y madrinas)", len(E["graduandos_lista"]) == 7 and len(E["padrinos"]) == 10)
for x in personas:
    im = Image.open(D / f"{x['id']}.png")
    dpi = im.info.get("dpi", (0, 0))
    ok(f"{x['nombre']}: PNG 709×1417 a 300 ppp", im.size == (709, 1417) and round(dpi[0]) == 300, f"{im.size} {dpi}")
    a = im.convert("RGBA")
    ok(f"{x['nombre']}: terminación en V transparente", a.getpixel((354, 1410))[3] == 0 and a.getpixel((10, 1400))[3] == 255 and a.getpixel((354, 1100))[3] == 255)
    ok(f"{x['nombre']}: PDF a tamaño real 60 × 120 mm", mm(D / f"{x['id']}.pdf") == [(60.0, 120.0)], mm(D / f"{x['id']}.pdf"))

esperado = {"Dr. Jorge Arrieta": "ESPECIALISTA 2026", "Dr. Gustavo Rojas": "PADRINO DE PROMOCIÓN", "Dra. Analy Falcón": "MADRINA DE PROMOCIÓN", "Dra. María del Carmen Gutiérrez": "MADRINA DE PROMOCIÓN"}
inf = {i["nombre"]: i for i in json.loads((R / "variantes/listones/informe.json").read_text(encoding="utf-8"))["listones"]}
for n, d in esperado.items():
    ok(f"Modelo {n} → {d}", inf[n]["denominacion"] == d)
ok("Dra. María del Carmen Gutiérrez: dos líneas con el apellido completo en la segunda", inf["Dra. María del Carmen Gutiérrez"]["lineas"] == ["Dra. María del Carmen", "Gutiérrez"], inf["Dra. María del Carmen Gutiérrez"]["lineas"])
ok("Ningún nombre desborda ni invade la identificación", all(not i["desborda"] and i["holgura"] >= 40 for i in inf.values()))
ok("Graduandos: denominación ESPECIALISTA 2026", all(inf[g["nombre"]]["denominacion"] == "ESPECIALISTA 2026" for g in E["graduandos_lista"]))
ok("Padrinos/madrinas según tratamiento", all(inf[p["nombre"]]["denominacion"] == ("MADRINA DE PROMOCIÓN" if p["nombre"].startswith("Dra.") else "PADRINO DE PROMOCIÓN") for p in E["padrinos"]))

plantilla = (R / "herramientas/componer_listones.js").read_text(encoding="utf-8")
prohibido = [a["hora_texto"] for a in E["actividades"]] + ["Auditorio", "Mucumbarila", "estacionamiento", "hora_texto", "lugar", "actividades"]
cuerpo = plantilla[plantilla.index("const html"):plantilla.index("(async")]
ok("Plantilla del listón sin actividades, horarios ni direcciones", not any(p in cuerpo for p in prohibido), [p for p in prohibido if p in cuerpo])
ok("Logotipos originales en la plantilla (ULA, Departamento, Promoción)", all(s in plantilla for s in ["logos-extraidos/ula.png", "LOGO_DEPTO", "logos-extraidos/promocion-xxiv.png"]))

for f, n in (("listones-especialistas-2026-A4.pdf", 2), ("listones-padrinos-madrinas-A4.pdf", 2)):
    ok(f"{f}: {n} hojas A4", mm(D / f) == [(210.0, 297.0)] * n, mm(D / f))

print(f"{sum(res)}/{len(res)} comprobaciones de listones superadas")
sys.exit(0 if all(res) else 1)
