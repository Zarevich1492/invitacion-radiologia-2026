-- ACCESO POR CÓDIGO DE CATEGORÍA (idempotente). Se ejecuta DESPUÉS de esquema.sql.
-- · Los códigos se guardan solo como hash bcrypt (nunca en texto plano ni en el repositorio).
-- · Un código colectivo NO verifica identidad individual: solo separa permisos por categoría.
-- · Sesiones temporales (12 h), limitación de intentos por IP y revocación por categoría.
-- Grupos de acceso: padrinos | docentes (docentes y egresados) | residentes (R1 y R2) | otros | especialistas

create table if not exists public.graduandos (
  id text primary key, nombre text not null, apellido text not null, activo boolean not null default true
);
create table if not exists public.codigos_acceso (
  grupo text primary key check (grupo in ('padrinos','docentes','residentes','especialistas')),
  hash text not null, actualizado timestamptz not null default now()
);
create table if not exists public.sesiones_acceso (
  token_hash bytea primary key, grupo text not null check (grupo in ('padrinos','docentes','residentes','otros','especialistas')),
  creada timestamptz not null default now(), expira timestamptz not null, revocada boolean not null default false
);
create table if not exists public.intentos_acceso (
  id bigserial primary key, ip text not null, grupo text not null, creado timestamptz not null default now()
);
create index if not exists intentos_acceso_idx on public.intentos_acceso (ip, creado);

alter table public.graduandos enable row level security;
alter table public.codigos_acceso enable row level security;
alter table public.sesiones_acceso enable row level security;
alter table public.intentos_acceso enable row level security;
revoke all on public.graduandos, public.codigos_acceso, public.sesiones_acceso, public.intentos_acceso from anon, authenticated;

-- Sesión válida → grupo (o null)
create or replace function public._grupo_de(p_sesion text) returns text
language sql stable security definer set search_path = public, extensions as $$
  select grupo from public.sesiones_acceso
   where p_sesion is not null and char_length(p_sesion) between 20 and 100
     and token_hash = public._hash(p_sesion) and not revocada and expira > now();
$$;

-- Categorías de invitado que cada grupo puede registrar
create or replace function public._categorias_de(p_grupo text) returns text[]
language sql immutable as $$
  select case p_grupo when 'padrinos' then array['padrino'] when 'docentes' then array['docente','egresado']
    when 'residentes' then array['r1','r2'] when 'otros' then array['otro'] else array[]::text[] end;
$$;

-- Valida el código de un grupo y abre una sesión. Devuelve siempre jsonb (nunca lanza error)
-- para que los intentos fallidos queden registrados y puedan limitarse.
create or replace function public.acceso_validar(p_grupo text, p_codigo text) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_ip text; v_hash text; v_tok text; v_exp timestamptz := now() + interval '12 hours';
begin
  if p_grupo not in ('padrinos','docentes','residentes','otros','especialistas') then return jsonb_build_object('ok', false, 'motivo', 'grupo_invalido'); end if;
  v_ip := coalesce(split_part(current_setting('request.headers', true)::json->>'x-forwarded-for', ',', 1), 'desconocida');
  delete from public.intentos_acceso where creado < now() - interval '1 day';
  delete from public.sesiones_acceso where expira < now() - interval '2 days';
  if (select count(*) from public.intentos_acceso where ip = v_ip and creado > now() - interval '10 minutes') >= 8 then
    return jsonb_build_object('ok', false, 'motivo', 'bloqueado');
  end if;
  if p_grupo <> 'otros' then
    select hash into v_hash from public.codigos_acceso where grupo = p_grupo;
    if v_hash is null or p_codigo is null or char_length(p_codigo) > 100 or extensions.crypt(p_codigo, v_hash) <> v_hash then
      insert into public.intentos_acceso(ip, grupo) values (v_ip, p_grupo);
      return jsonb_build_object('ok', false, 'motivo', 'codigo_incorrecto');
    end if;
  end if;
  v_tok := public._nuevo_token();
  insert into public.sesiones_acceso(token_hash, grupo, expira) values (public._hash(v_tok), p_grupo, v_exp);
  return jsonb_build_object('ok', true, 'sesion', v_tok, 'grupo', p_grupo, 'expira', v_exp);
end $$;

-- ¿Sigue vigente la sesión? (la app la consulta al volver a abrir)
create or replace function public.acceso_estado(p_sesion text) returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select case when public._grupo_de(p_sesion) is null then jsonb_build_object('ok', false)
    else jsonb_build_object('ok', true, 'grupo', public._grupo_de(p_sesion)) end;
$$;

-- Nombres que se eligen tras el código: padrinos (10) o graduandos (7). Exige sesión del grupo correspondiente.
create or replace function public.lista_nombres(p_sesion text) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare g text := public._grupo_de(p_sesion);
begin
  if g = 'padrinos' then
    return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nombre', nombre) order by apellido, nombre) from public.padrinos where activo), '[]');
  elsif g = 'especialistas' then
    return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nombre', nombre) order by apellido, nombre) from public.graduandos where activo), '[]');
  end if;
  return '[]'::jsonb;
end $$;

-- Confirmación con sesión: solo categorías permitidas al grupo; con token, solo el propio registro del grupo.
create or replace function public.guardar_con_sesion(
  p_sesion text, p_token text, p_categoria text, p_padrino_id text, p_nombre text,
  p_respuestas jsonb, p_trampa text default null, p_nota text default null
) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare g text := public._grupo_de(p_sesion); v public.invitados;
begin
  if p_token is not null and p_token <> '' then
    select * into v from public.invitados where token_hash = public._hash(p_token);
    if not found then raise exception 'token_invalido' using errcode = 'P0001'; end if;
    -- Enlace individual emitido por la organización: no necesita código de grupo. Los demás tokens exigen sesión de su grupo.
    if not v.token_admin and (g is null or not (v.categoria = any(public._categorias_de(g)))) then raise exception 'token_invalido' using errcode = 'P0001'; end if;
  else
    if g is null then raise exception 'sesion_invalida' using errcode = 'P0001'; end if;
    if g = 'especialistas' then raise exception 'no_confirma' using errcode = 'P0001'; end if;
    if g = 'otros' then raise exception 'requiere_autorizacion' using errcode = 'P0001'; end if;   -- «Otros» solo con invitación autorizada
    if not (coalesce(p_categoria, '') = any(public._categorias_de(g))) then raise exception 'categoria_no_permitida' using errcode = 'P0001'; end if;
  end if;
  return public.guardar_confirmacion(p_token, p_categoria, p_padrino_id, p_nombre, p_respuestas, p_trampa, p_nota);
end $$;

-- Recupera la invitación por token solo si pertenece al grupo de la sesión
create or replace function public.mi_invitacion_sesion(p_sesion text, p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare g text := public._grupo_de(p_sesion); v public.invitados;
begin
  if g is null or p_token is null or char_length(p_token) < 20 then return null; end if;
  select * into v from public.invitados where token_hash = public._hash(p_token);
  if not found or not (v.categoria = any(public._categorias_de(g))) then return null; end if;
  return public._vista(v);
end $$;

-- ---------- Administración ----------
-- AUTORIZACIÓN: solo cuentas de la tabla «administradores» (JWT de Supabase Auth → auth.uid()).
-- Nunca se usa current_user: dentro de una función SECURITY DEFINER vale siempre el propietario (postgres) y permitiría a cualquiera pasar.
create or replace function public._es_gestor() returns boolean
language sql stable as $$ select public.es_admin(); $$;

-- INICIALIZACIÓN (SQL Editor): funciones internas sin comprobación, SIN permisos para anon ni authenticated (no son invocables por API).
create or replace function public._definir_codigo(p_grupo text, p_codigo text) returns boolean
language plpgsql volatile security definer set search_path = public, extensions as $$
begin
  if p_grupo not in ('padrinos','docentes','residentes','especialistas') then raise exception 'grupo_invalido' using errcode = 'P0001'; end if;
  if p_codigo is null or char_length(p_codigo) < 8 then raise exception 'codigo_demasiado_corto' using errcode = 'P0001'; end if;
  insert into public.codigos_acceso(grupo, hash) values (p_grupo, extensions.crypt(p_codigo, extensions.gen_salt('bf', 10)))
    on conflict (grupo) do update set hash = excluded.hash, actualizado = now();
  update public.sesiones_acceso set revocada = true where grupo = p_grupo and not revocada;   -- cambiar el código cierra las sesiones previas
  return true;
end $$;

create or replace function public.init_definir_codigo(p_grupo text, p_codigo text) returns boolean
language plpgsql volatile security definer set search_path = public, extensions as $$
begin
  if session_user not in ('postgres', 'supabase_admin') then raise exception 'solo_inicializacion' using errcode = '42501'; end if;   -- defensa adicional: conexión directa del propietario
  return public._definir_codigo(p_grupo, p_codigo);
end $$;

-- Vía RPC (panel): exige administrador
create or replace function public.admin_definir_codigo(p_grupo text, p_codigo text) returns boolean
language plpgsql volatile security definer set search_path = public, extensions as $$
begin
  if not public._es_gestor() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  return public._definir_codigo(p_grupo, p_codigo);
end $$;

create or replace function public.admin_revocar_sesiones(p_grupo text default null) returns int
language plpgsql volatile security definer set search_path = public, extensions as $$
declare n int;
begin
  if not public._es_gestor() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  update public.sesiones_acceso set revocada = true where not revocada and (p_grupo is null or grupo = p_grupo);
  get diagnostics n = row_count; return n;
end $$;

create or replace function public.admin_estado_acceso() returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not public._es_gestor() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  return jsonb_build_object(
    'codigos', coalesce((select jsonb_object_agg(grupo, actualizado) from public.codigos_acceso), '{}'),
    'sesiones_activas', coalesce((select jsonb_object_agg(grupo, n) from (select grupo, count(*) n from public.sesiones_acceso where not revocada and expira > now() group by grupo) s), '{}'),
    'intentos_fallidos_hora', (select count(*) from public.intentos_acceso where creado > now() - interval '1 hour'));
end $$;

revoke all on function public._grupo_de(text), public._categorias_de(text), public._es_gestor() from public, anon, authenticated;
revoke all on function public.acceso_validar(text,text), public.acceso_estado(text), public.lista_nombres(text),
  public.guardar_con_sesion(text,text,text,text,text,jsonb,text,text), public.mi_invitacion_sesion(text,text) from public;
grant execute on function public.acceso_validar(text,text), public.acceso_estado(text), public.lista_nombres(text),
  public.guardar_con_sesion(text,text,text,text,text,jsonb,text,text), public.mi_invitacion_sesion(text,text) to anon, authenticated;
revoke all on function public._definir_codigo(text,text), public.init_definir_codigo(text,text) from public, anon, authenticated;
revoke all on function public.admin_definir_codigo(text,text), public.admin_revocar_sesiones(text), public.admin_estado_acceso() from public, anon;
grant execute on function public.admin_definir_codigo(text,text), public.admin_revocar_sesiones(text), public.admin_estado_acceso() to authenticated;

notify pgrst, 'reload schema';
