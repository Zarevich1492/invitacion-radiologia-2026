#!/usr/bin/env python3
"""Genera todos los recursos estáticos de la invitación a partir de los originales.

Uso:  python3 herramientas/generar_recursos.py
Requiere: Pillow  (pip install pillow)

Los originales en /originales no se modifican: solo se leen.
"""
from pathlib import Path
import json
from datetime import datetime, timezone
from PIL import Image

RAIZ = Path(__file__).resolve().parent.parent
ORIG = RAIZ / "originales"
A = RAIZ / "assets"
CREMA = (245, 231, 211)  # color de fondo medido en las composiciones originales


# Recortes de logotipos medidos sobre 3-portada.png (6250 x 4830 px), con 24 px de margen.
LOGOS = {
    "promocion-xxiv": (2139, 614, 4001, 3240),
    "ula": (1846, 154, 3013, 498),
    "departamento-radiologia": (3250, 154, 4322, 498),
}


def guardar_jpg(img, ruta, q=84):
    ruta.parent.mkdir(parents=True, exist_ok=True)
    img.save(ruta, quality=q, optimize=True, progressive=True)


def ancho(img, w):
    return img.resize((w, round(w * img.height / img.width)), Image.LANCZOS)


def imagenes():
    portada = Image.open(ORIG / "3-portada.png").convert("RGB")
    interior = Image.open(ORIG / "4-interior.png").convert("RGB")
    contra = Image.open(ORIG / "5-contraportada.png").convert("RGB")
    VAR = RAIZ / "variantes"

    # Caras por variante. A usa portada y contraportada originales; su interior se recompone
    # (columna de programa actualizada desde datos/evento.json).
    # Portadas: composición vertical a la medida de la hoja (herramientas/componer_portadas.py)
    caras = {
        "A": {"portada": Image.open(VAR / "A-portada-vertical.png").convert("RGB"), "contraportada": Image.open(VAR / "A-contraportada-vertical.png").convert("RGB")},
        "B": {"portada": Image.open(VAR / "B-portada-vertical.png").convert("RGB"), "contraportada": Image.open(VAR / "B-contraportada-vertical.png").convert("RGB")},
        "C": {"portada": Image.open(VAR / "C-portada-vertical.png").convert("RGB"), "contraportada": Image.open(VAR / "C-contraportada-vertical.png").convert("RGB")},
    }
    (A / "descargas").mkdir(exist_ok=True)
    for v, c in caras.items():
        guardar_jpg(ancho(c["portada"], 1400), A / f"img/{v}-portada-1400.jpg")
        guardar_jpg(ancho(c["contraportada"], 1400), A / f"img/{v}-contraportada-1400.jpg")
        for n in (2, 3):
            inter = Image.open(VAR / f"{v}-interior-{n}.png").convert("RGB")
            guardar_jpg(ancho(inter, 2000), A / f"img/{v}-interior-{n}-2000.jpg")
            guardar_jpg(ancho(inter, 3600), A / f"img/{v}-interior-{n}-3600.jpg", 82)
            # Invitación completa descargable (3 páginas, 3125 px de ancho, calidad alta)
            paginas = [c["portada"], ancho(inter, 3125), c["contraportada"]]
            paginas[0].save(A / f"descargas/invitacion-{v}-{n}.pdf", save_all=True, append_images=paginas[1:], resolution=150, quality=90)

    # Banda de montañas y hospital (parte inferior del interior original) para el pase.
    guardar_jpg(ancho(interior.crop((0, 3300, 6250, 4830)), 1440), A / "img/banda-merida-1440.jpg", 86)

    # Logotipos: recorte directo, sin redibujar.
    pad = 24
    (ORIG / "logos-extraidos").mkdir(exist_ok=True)
    for nombre, (x0, y0, x1, y1) in LOGOS.items():
        rec = portada.crop((x0 - pad, y0 - pad, x1 + pad, y1 + pad))
        rec.save(ORIG / f"logos-extraidos/{nombre}.png", optimize=True)
        web = ancho(rec, 1000) if nombre == "promocion-xxiv" else rec
        guardar_jpg(web, A / f"logos/{nombre}.jpg", 88 if nombre == "promocion-xxiv" else 90)
    guardar_jpg(ancho(portada.crop((LOGOS["promocion-xxiv"][0] - pad, LOGOS["promocion-xxiv"][1] - pad, LOGOS["promocion-xxiv"][2] + pad, LOGOS["promocion-xxiv"][3] + pad)), 560), A / "logos/promocion-xxiv-560.jpg", 84)

    # Vista previa para WhatsApp / Open Graph: portada original completa, sin recorte, sobre crema.
    h = 630
    w = round(h * portada.width / portada.height)
    og = Image.new("RGB", (1200, 630), CREMA)
    og.paste(portada.resize((w, h), Image.LANCZOS), ((1200 - w) // 2, 0))
    guardar_jpg(og, A / "og-portada.jpg", 82)


# ---------- Calendario (RFC 5545) ----------
def esc(t):
    return t.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def plegar(linea):
    b = linea.encode("utf-8")
    if len(b) <= 75:
        return linea
    partes, actual = [], b""
    for ch in linea:
        cb = ch.encode("utf-8")
        if len(actual) + len(cb) > (75 if not partes else 74):
            partes.append(actual.decode("utf-8"))
            actual = b""
        actual += cb
    partes.append(actual.decode("utf-8"))
    return "\r\n ".join(partes)


VTZ = [
    "BEGIN:VTIMEZONE", "TZID:America/Caracas",
    "BEGIN:STANDARD", "DTSTART:19700101T000000", "TZOFFSETFROM:-0400", "TZOFFSETTO:-0400", "TZNAME:-04", "END:STANDARD",
    "END:VTIMEZONE",
]

EVENTO = json.loads((RAIZ / "datos" / "evento.json").read_text(encoding="utf-8"))


def local(iso):  # "2026-11-28T08:30:00-04:00" -> "20261128T083000" (hora local de Caracas)
    return iso[:19].replace("-", "").replace(":", "")


EVENTOS = [
    {
        "codigo": a["codigo"],
        "uid": f"{a['codigo']}-{EVENTO['fecha'].replace('-', '')}@invitacion-radiologia-2026",
        "inicio": local(a["inicio"]),
        "titulo": f"{a['titulo']} · {EVENTO['promocion']} ULA",
        "lugar": a["lugar"] + ", " + EVENTO["ciudad"],
        "desc": f"{a['detalle']}\nInicio: {a['hora_texto']} (hora de Venezuela).\n{EVENTO['lema']}\nSin hora oficial de finalización.",
        "archivo": f"{a['codigo']}.ics",
    }
    for a in EVENTO["actividades"]
]


def vevent(e, stamp):
    return [
        "BEGIN:VEVENT", f"UID:{e['uid']}", f"DTSTAMP:{stamp}",
        f"DTSTART;TZID=America/Caracas:{e['inicio']}",  # sin DTEND: no hay hora oficial de finalización (RFC 5545 §3.6.1)
        f"SUMMARY:{esc(e['titulo'])}", f"LOCATION:{esc(e['lugar'])}", f"DESCRIPTION:{esc(e['desc'])}",
        f"URL:{EVENTO['url_publica']}",
        "BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER:-P1D", f"DESCRIPTION:{esc('Mañana: ' + e['titulo'])}", "END:VALARM",
        "BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER:-PT1H", f"DESCRIPTION:{esc('En una hora: ' + e['titulo'])}", "END:VALARM",
        "END:VEVENT",
    ]


def calendario():
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    cab = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//XXIV Promocion Radiologia ULA//Invitacion//ES",
           "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-TIMEZONE:America/Caracas"]
    def escribir(nombre, eventos):
        lineas = cab + VTZ + sum((vevent(e, stamp) for e in eventos), []) + ["END:VCALENDAR"]
        (A / "calendario").mkdir(exist_ok=True)
        (A / "calendario" / nombre).write_bytes(("\r\n".join(plegar(l) for l in lineas) + "\r\n").encode("utf-8"))
    for e in EVENTOS:
        escribir(e["archivo"], [e])
    # Combinaciones según elegibilidad de la recepción
    escribir("jornada-3-actividades.ics", EVENTOS)
    escribir("jornada-2-actividades.ics", [e for e in EVENTOS if e["codigo"] != "recepcion"])


if __name__ == "__main__":
    imagenes()
    calendario()
    print("Recursos generados en", A)
