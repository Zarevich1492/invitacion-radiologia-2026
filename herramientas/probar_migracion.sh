#!/usr/bin/env bash
# Prueba que supabase/instalar.sql se aplica SOBRE una base ya instalada con la versión publicada (main), sin errores y sin perder datos.
# Uso: PGHOST=/tmp PGPORT=5499 bash herramientas/probar_migracion.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB=invitacion_migracion
psql -U postgres -q -c "drop database if exists $DB" -c "create database $DB"
for r in anon authenticated; do psql -U postgres -q -c "do \$\$begin if not exists(select 1 from pg_roles where rolname='$r') then create role $r nologin; end if; end\$\$"; done
psql -U postgres -q -d $DB -v ON_ERROR_STOP=1 -c "create schema auth; create function auth.uid() returns uuid language sql stable as \$\$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid \$\$; grant usage on schema auth to anon, authenticated; create schema extensions; grant usage on schema extensions to anon, authenticated;"
git show origin/main:supabase/instalar.sql > /tmp/instalar_main.sql
psql -U postgres -q -d $DB -v ON_ERROR_STOP=1 -f /tmp/instalar_main.sql >/dev/null 2>&1
# Datos reales simulados en la versión publicada
psql -U postgres -q -d $DB -c "select public.guardar_confirmacion(null,'docente',null,'Docente Existente','{\"clase\":\"asistira\"}'::jsonb,null,null)" >/dev/null
ANTES=$(psql -U postgres -At -d $DB -c "select (select count(*) from invitados)||'/'||(select count(*) from confirmaciones)")
psql -U postgres -q -d $DB -v ON_ERROR_STOP=1 -f supabase/instalar.sql >/dev/null 2>/tmp/migracion.err
psql -U postgres -q -d $DB -v ON_ERROR_STOP=1 -f supabase/instalar.sql >/dev/null 2>>/tmp/migracion.err   # idempotente
DESPUES=$(psql -U postgres -At -d $DB -c "select (select count(*) from invitados)||'/'||(select count(*) from confirmaciones)")
echo "Registros antes/después (invitados/confirmaciones): $ANTES → $DESPUES"
grep -i "error" /tmp/migracion.err && { echo "✘ la migración produjo errores"; exit 1; } || echo "✔ migración sin errores (dos ejecuciones)"
[ "$ANTES" = "$DESPUES" ] && echo "✔ no se perdió ningún registro" || { echo "✘ cambió el número de registros"; exit 1; }
psql -U postgres -At -d $DB -c "select 'graduandos: '||count(*) from graduandos"
