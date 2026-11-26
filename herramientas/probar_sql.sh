#!/usr/bin/env bash
# Prueba esquema.sql + semilla.sql en un PostgreSQL local que emula Supabase.
# Uso: PGHOST=/tmp PGPORT=5499 bash herramientas/probar_sql.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB=invitacion_prueba
psql -U postgres -q -c "drop database if exists $DB" -c "create database $DB"
for r in anon authenticated; do psql -U postgres -q -c "do \$\$begin if not exists(select 1 from pg_roles where rolname='$r') then create role $r nologin; end if; end\$\$"; done
psql -U postgres -q -d $DB -v ON_ERROR_STOP=1 -c "create schema auth; create function auth.uid() returns uuid language sql stable as \$\$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid \$\$; grant usage on schema auth to anon, authenticated; create schema extensions; grant usage on schema extensions to anon, authenticated;"
psql -U postgres -q -d $DB -v ON_ERROR_STOP=1 -f supabase/esquema.sql
psql -U postgres -q -d $DB -v ON_ERROR_STOP=1 -f supabase/acceso.sql
psql -U postgres -q -d $DB -v ON_ERROR_STOP=1 -f supabase/dedicatorias.sql
psql -U postgres -q -d $DB -v ON_ERROR_STOP=1 -f supabase/invitaciones.sql
psql -U postgres -q -d $DB -v ON_ERROR_STOP=1 -f supabase/semilla.sql
# Segunda ejecución: deben ser idempotentes
psql -U postgres -q -d $DB -v ON_ERROR_STOP=1 -f supabase/esquema.sql
psql -U postgres -q -d $DB -v ON_ERROR_STOP=1 -f supabase/acceso.sql
psql -U postgres -q -d $DB -v ON_ERROR_STOP=1 -f supabase/dedicatorias.sql
psql -U postgres -q -d $DB -v ON_ERROR_STOP=1 -f supabase/invitaciones.sql
psql -U postgres -q -d $DB -v ON_ERROR_STOP=1 -f supabase/semilla.sql
psql -U postgres -d $DB -v ON_ERROR_STOP=1 -f supabase/pruebas/renombrado.sql | tail -7
psql -U postgres -d $DB -v ON_ERROR_STOP=1 -f supabase/pruebas/pruebas.sql
psql -U postgres -d $DB -v ON_ERROR_STOP=1 -f supabase/pruebas/acceso.sql
psql -U postgres -d $DB -v ON_ERROR_STOP=1 -f supabase/pruebas/dedicatorias.sql
psql -U postgres -d $DB -v ON_ERROR_STOP=1 -f supabase/pruebas/invitaciones.sql
psql -U postgres -d $DB -v ON_ERROR_STOP=1 -f supabase/pruebas/seguridad_admin.sql
