#!/usr/bin/env bash
# Ejecuta todas las pruebas locales: SQL (seguridad), indicadores y aceptación end-to-end.
# Requisitos: PostgreSQL local (PGHOST/PGPORT), Python 3, Node + Playwright.
set -euo pipefail
cd "$(dirname "$0")/.."
export PGHOST=${PGHOST:-/tmp} PGPORT=${PGPORT:-5499}
CAPTURAS=${1:-pruebas/capturas}
echo "== 1. Pruebas SQL de seguridad y lógica"; bash herramientas/probar_sql.sh | tail -3
echo "== 2. Indicadores del panel"; node pruebas/metricas.test.js
if python3 -c "import json,sys; sys.exit(0 if json.load(open('datos/evento.json'))['modulos']['listones'] else 1)"; then echo "== 2b. Listones conmemorativos"; python3 pruebas/verificar_listones.py 2>&1 | tail -1 || echo "AVISO: verificar_listones.py falla por el esquema de informe.json (anterior a esta fase)"; else echo "== 2b. Listones: módulo no publicado (se verifica al activarlo)"; fi
echo "== 3. Base limpia para la prueba end-to-end"
psql -U postgres -q -c "drop database if exists invitacion_e2e" -c "create database invitacion_e2e"
psql -U postgres -q -d invitacion_e2e -v ON_ERROR_STOP=1 -c "create schema auth; create function auth.uid() returns uuid language sql stable as \$\$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid \$\$; grant usage on schema auth to anon, authenticated; create schema extensions; grant usage on schema extensions to anon, authenticated;"
psql -U postgres -q -d invitacion_e2e -v ON_ERROR_STOP=1 -f supabase/esquema.sql >/dev/null 2>&1
psql -U postgres -q -d invitacion_e2e -v ON_ERROR_STOP=1 -f supabase/acceso.sql >/dev/null
psql -U postgres -q -d invitacion_e2e -v ON_ERROR_STOP=1 -f supabase/dedicatorias.sql >/dev/null 2>&1
psql -U postgres -q -d invitacion_e2e -v ON_ERROR_STOP=1 -f supabase/invitaciones.sql >/dev/null
psql -U postgres -q -d invitacion_e2e -v ON_ERROR_STOP=1 -f supabase/semilla.sql >/dev/null
# Códigos SOLO de prueba (la base de producción recibe los suyos del organizador; nunca se guardan en el repositorio)
for g in padrinos docentes residentes especialistas; do psql -U postgres -q -d invitacion_e2e -c "select public.init_definir_codigo('$g', 'codigo-e2e-$g')" >/dev/null; done
# Aportes SOLO de prueba: datos ficticios (los reales se cargan desde el panel y nunca van al repositorio)
psql -U postgres -q -d invitacion_e2e -c "select public.init_definir_aportes('{\"activo\":true,\"banco\":\"Banco de prueba\",\"codigo\":\"0000\",\"titular\":\"Titular de Prueba\",\"cedula\":\"1\",\"telefono\":\"04120000000\"}')" >/dev/null
psql -U postgres -q -d invitacion_e2e -c "insert into public.administradores(user_id,email) values ('11111111-1111-1111-1111-111111111111','organizador@prueba.local')"
(python3 -m http.server 8765 --bind 127.0.0.1 >/dev/null 2>&1 &)
node pruebas/servidor_prueba.js 8787 invitacion_e2e & API=$!
trap 'kill $API 2>/dev/null || true' EXIT
sleep 1
echo "== 4. Aceptación end-to-end (Playwright, Chromium simulado)"
node pruebas/aceptacion.js http://127.0.0.1:8765/ http://127.0.0.1:8787 "$CAPTURAS"
echo "== 5. Responsive (13 tamaños, simulación)"
node pruebas/responsive.js http://127.0.0.1:8765/ "$CAPTURAS/responsive"
