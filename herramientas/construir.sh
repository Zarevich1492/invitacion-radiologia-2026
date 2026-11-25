#!/usr/bin/env bash
# Regenera TODO lo que depende de datos/evento.json (fuente única) y de /originales:
#   1. Caras de las tarjetas B, C y el interior recompuesto de A (composición sin alterar ilustraciones)
#   2. Imágenes web, PDF de cada variante, ICS, vista previa para WhatsApp
#   3. Semilla SQL para Supabase (actividades, categorías, padrinos)
# Requisitos: Python 3 + Pillow, Node + Playwright (Chromium).
set -euo pipefail
cd "$(dirname "$0")/.."
python3 -m http.server 8765 --bind 127.0.0.1 >/dev/null 2>&1 & SRV=$!
trap 'kill $SRV 2>/dev/null || true' EXIT
sleep 1
node herramientas/componer_variantes.js http://127.0.0.1:8765/
python3 herramientas/componer_variantes.py
python3 herramientas/generar_recursos.py
python3 herramientas/generar_semilla_sql.py
echo "Listo. Si cambió la semilla, vuelva a ejecutar supabase/semilla.sql en Supabase (SQL Editor)."
