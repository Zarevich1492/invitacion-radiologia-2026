#!/usr/bin/env bash
# Genera supabase/instalar.sql = esquema + acceso + dedicatorias + semilla (un solo archivo para pegar en Supabase → SQL Editor). Idempotente.
set -euo pipefail
cd "$(dirname "$0")/.."
python3 herramientas/generar_semilla_sql.py >/dev/null
{ echo "-- INSTALACIÓN COMPLETA (esquema + acceso + dedicatorias + semilla). Generado: no editar. Pegar y ejecutar UNA vez en Supabase → SQL Editor."; cat supabase/esquema.sql; echo; cat supabase/acceso.sql; echo; cat supabase/dedicatorias.sql; echo; cat supabase/semilla.sql; } > supabase/instalar.sql
echo "supabase/instalar.sql: $(wc -l < supabase/instalar.sql) líneas"
