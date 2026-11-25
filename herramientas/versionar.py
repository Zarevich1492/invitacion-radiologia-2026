#!/usr/bin/env python3
"""Control de caché: escribe una versión en index.html y admin/index.html (?v=…) para CSS, JS e imágenes
de la tarjeta, de modo que cada publicación obligue a los navegadores a descargar los recursos nuevos.
Uso: python3 herramientas/versionar.py  (la versión es la fecha y hora UTC de la publicación)."""
import re
from datetime import datetime, timezone
from pathlib import Path

R = Path(__file__).resolve().parent.parent
v = datetime.now(timezone.utc).strftime("%Y%m%d%H%M")
for html in (R / "index.html", R / "admin" / "index.html"):
    s = html.read_text(encoding="utf-8")
    s = re.sub(r'((?:href|src)="(?:\.\./)?(?:css|js)/[\w.-]+\.(?:css|js))(?:\?v=\d+)?"', rf'\1?v={v}"', s)
    s = re.sub(r'<meta name="version-recursos" content="\d*">', f'<meta name="version-recursos" content="{v}">', s)
    if 'name="version-recursos"' not in s:
        s = s.replace('<meta charset="utf-8">', f'<meta charset="utf-8">\n<meta name="version-recursos" content="{v}">', 1)
    html.write_text(s, encoding="utf-8")
print("Versión de recursos:", v)
