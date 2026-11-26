#!/usr/bin/env python3
"""Verifica los 17 listones conmemorativos (Dirección B — Protocolar):
medidas, PNG 300 ppp y 600 ppp, transparencia en la V, PDF vectorial 60 × 120 mm,
PDF colectivos A4 vectoriales, logotipo oficial del Departamento, nombres aprobados
y ausencia de información logística."""
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
    im3 = Image.open(D / f"{x['id']}.png")
    dpi3 = im3.info.get("dpi", (0, 0))
    ok(f"{x['nombre']}: PNG 300 ppp (709×1417)", im3.size == (709, 1417) and round(dpi3[0]) == 300, f"{im3.size} {dpi3}")
    a3 = im3.convert("RGBA")
    ok(f"{x['nombre']}: terminación en V transparente (300 ppp)", a3.getpixel((354, 1410))[3] == 0 and a3.getpixel((10, 1400))[3] == 255 and a3.getpixel((354, 1100))[3] == 255)

    im6 = Image.open(D / f"{x['id']}-600ppp.png")
    dpi6 = im6.info.get("dpi", (0, 0))
    ok(f"{x['nombre']}: PNG 600 ppp (1417×2835)", im6.size == (1417, 2835) and round(dpi6[0]) == 600, f"{im6.size} {dpi6}")
    a6 = im6.convert("RGBA")
    ok(f"{x['nombre']}: terminación en V transparente (600 ppp)", a6.getpixel((708, 2820))[3] == 0 and a6.getpixel((20, 2800))[3] == 255 and a6.getpixel((708, 2200))[3] == 255)

    pdf_bytes = (D / f"{x['id']}.pdf").read_bytes()
    dims = mm(D / f"{x['id']}.pdf")
    es_vectorial = b"/Font" in pdf_bytes and b"/Image" in pdf_bytes
    tam_ok = len(dims) == 1 and abs(dims[0][0] - 60.0) <= 0.2 and abs(dims[0][1] - 120.0) <= 0.2
    ok(f"{x['nombre']}: PDF vectorial 60 × 120 mm", tam_ok and es_vectorial, f"{dims} vectorial={es_vectorial}")

informe = json.loads((R / "variantes/listones/informe.json").read_text(encoding="utf-8"))
ok("Dirección B (Protocolar) aplicada", informe.get("direccion") == "B-Protocolar", informe.get("direccion"))
ok("Logotipo oficial del Departamento integrado", "logo_departamento_radiologia_original" in informe.get("logo_departamento", ""), informe.get("logo_departamento"))

inf = {i["id"]: i for i in informe["listones"]}
esperado = {
    "arrieta-jorge": "ESPECIALISTA 2026",
    "rojas-gustavo": "PADRINO DE PROMOCIÓN",
    "falcon-analy": "MADRINA DE PROMOCIÓN",
    "gutierrez-maria-del-carmen": "MADRINA DE PROMOCIÓN",
    "berrio-omaira": "MADRINA DE PROMOCIÓN",
}
for pid, d in esperado.items():
    ok(f"Modelo {inf[pid]['nombre_liston']} → {d}", inf[pid]["denominacion"] == d)

ok("Nombre abreviado aprobado para Dra. Ma. del Carmen Gutiérrez", inf["gutierrez-maria-del-carmen"]["nombre_liston"] == "Dra. Ma. del Carmen Gutiérrez", inf["gutierrez-maria-del-carmen"]["nombre_liston"])
ok("Corrección nominal obligatoria para Dra. Omaira Berrios", inf["berrio-omaira"]["nombre_liston"] == "Dra. Omaira Berrios", inf["berrio-omaira"]["nombre_liston"])
ok("Ningún nombre desborda ni invade la V", all(not i["desborda"] and i["holgura"] >= 0 for i in inf.values()))
ok("Graduandos: denominación ESPECIALISTA 2026", all(inf[g["id"]]["denominacion"] == "ESPECIALISTA 2026" for g in E["graduandos_lista"]))
ok("Padrinos/madrinas según tratamiento", all(inf[p["id"]]["denominacion"] == ("MADRINA DE PROMOCIÓN" if p["nombre"].startswith("Dra.") else "PADRINO DE PROMOCIÓN") for p in E["padrinos"]))

plantilla = (R / "herramientas/componer_listones.js").read_text(encoding="utf-8")
prohibido = [a["hora_texto"] for a in E["actividades"]] + ["Auditorio", "Mucumbarila", "estacionamiento", "hora_texto", "lugar", "actividades"]
cuerpo = plantilla[plantilla.index("function cuerpoB"):plantilla.index("async function resolverListon")]
ok("Plantilla del listón sin actividades, horarios ni direcciones", not any(p in cuerpo for p in prohibido), [p for p in prohibido if p in cuerpo])

for f, n in (("listones-especialistas-2026-A4.pdf", 2), ("listones-padrinos-madrinas-A4.pdf", 2)):
    pb = (D / f).read_bytes()
    dims = mm(D / f)
    a4_ok = len(dims) == n and all(abs(w - 210.0) <= 0.2 and abs(h - 297.0) <= 0.2 for w, h in dims)
    ok(f"{f}: {n} hojas A4 vectoriales", a4_ok and b"/Font" in pb, dims)

print(f"{sum(res)}/{len(res)} comprobaciones de listones superadas")
sys.exit(0 if all(res) else 1)
