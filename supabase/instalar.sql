-- INSTALACIÓN COMPLETA (esquema + acceso + dedicatorias + semilla). Generado: no editar. Pegar y ejecutar UNA vez en Supabase → SQL Editor.
-- =====================================================================
-- Invitación XXIV Promoción de Radiólogos ULA 2026 · Esquema Supabase
-- Ejecutar UNA vez en: Supabase → SQL Editor → New query → pegar → Run.
-- Después ejecutar supabase/semilla.sql (generado desde datos/evento.json).
--
-- Modelo de seguridad
--  · Las tablas tienen RLS activado. El público (rol anon) NO puede leer ni
--    escribir directamente invitados ni confirmaciones.
--  · El público solo usa funciones RPC (security definer) con validación.
--  · Cada respuesta recibe un token secreto aleatorio; en la base se guarda
--    únicamente su hash SHA-256. Sin token no se puede ver ni modificar nada.
--  · Elegir el nombre de un padrino NO da acceso a su registro oficial: crea
--    una respuesta "no verificada" vinculada a ese padrino.
--  · Los administradores (tabla administradores) leen y corrigen todo.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------- Catálogos ----------
create table if not exists public.actividades (
  codigo      text primary key,
  orden       int  not null,
  titulo      text not null,
  hora_texto  text not null,
  inicio      timestamptz not null,
  lugar       text not null
);

create table if not exists public.padrinos (
  id        text primary key,
  nombre    text not null,           -- con tratamiento: "Dra. Analy Falcón"
  apellido  text not null,           -- para ordenar
  activo    boolean not null default true,
  creado    timestamptz not null default now()
);

create table if not exists public.categorias (
  codigo   text primary key check (codigo in ('padrino','docente','egresado','r1','r2','otro')),
  etiqueta text not null
);

-- Habilitación de cada actividad por categoría (configurable desde el panel). Sin fila: clase y caravana
-- habilitadas, recepción NO habilitada (no se asume acceso a la recepción).
create table if not exists public.habilitaciones (
  categoria text not null references public.categorias(codigo) on delete cascade,
  actividad text not null references public.actividades(codigo) on delete cascade,
  habilitada boolean not null,
  primary key (categoria, actividad)
);

-- ---------- Personas y respuestas ----------
create table if not exists public.invitados (
  id                uuid primary key default gen_random_uuid(),
  categoria         text not null references public.categorias(codigo),
  padrino_id        text references public.padrinos(id) on delete set null,
  nombre            text not null check (char_length(nombre) between 2 and 80),
  origen            text not null check (origen in ('oficial','enlace_general','registro_admin')),
  token_hash        bytea unique,
  token_admin       boolean not null default false,   -- token emitido por un organizador (enlace individual)
  verificado        boolean not null default false,
  recepcion_override boolean,                          -- null = según categoría
  nota_omision      text check (char_length(nota_omision) <= 300),
  creado            timestamptz not null default now(),
  actualizado       timestamptz not null default now(),
  respondido        timestamptz,
  constraint padrino_coherente check ((categoria = 'padrino') = (padrino_id is not null) or origen = 'registro_admin')
);
create unique index if not exists un_oficial_por_padrino on public.invitados(padrino_id) where origen = 'oficial';
create index if not exists ix_invitados_padrino on public.invitados(padrino_id);

create table if not exists public.confirmaciones (
  invitado_id  uuid not null references public.invitados(id) on delete cascade,
  actividad    text not null references public.actividades(codigo) on delete cascade,
  estado       text not null check (estado in ('asistira','no_asistira','por_confirmar')),
  actualizado  timestamptz not null default now(),
  primary key (invitado_id, actividad)
);

create table if not exists public.administradores (
  user_id uuid primary key,
  email   text,
  creado  timestamptz not null default now()
);

create table if not exists public.intentos (
  id     bigserial primary key,
  ip     text not null,
  creado timestamptz not null default now()
);
create index if not exists ix_intentos on public.intentos(ip, creado);

-- ---------- RLS ----------
alter table public.actividades     enable row level security;
alter table public.padrinos        enable row level security;
alter table public.categorias      enable row level security;
alter table public.habilitaciones  enable row level security;
alter table public.invitados       enable row level security;
alter table public.confirmaciones  enable row level security;
alter table public.administradores enable row level security;
alter table public.intentos        enable row level security;

create or replace function public.es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.administradores where user_id = auth.uid());
$$;

-- Lectura pública mínima: catálogo de actividades, padrinos activos y reglas de categoría.
drop policy if exists lectura_publica on public.actividades;
create policy lectura_publica on public.actividades for select using (true);
drop policy if exists lectura_publica on public.padrinos;
create policy lectura_publica on public.padrinos for select using (activo or public.es_admin());
drop policy if exists lectura_publica on public.categorias;
create policy lectura_publica on public.categorias for select using (true);

-- Administración completa solo para administradores.
do $$ declare t text; begin
  foreach t in array array['actividades','padrinos','categorias','habilitaciones','invitados','confirmaciones'] loop
    execute format('drop policy if exists admin_todo on public.%I', t);
    execute format('create policy admin_todo on public.%I for all to authenticated using (public.es_admin()) with check (public.es_admin())', t);
  end loop;
end $$;
drop policy if exists admin_lectura on public.administradores;
create policy admin_lectura on public.administradores for select to authenticated using (public.es_admin());
-- intentos: sin políticas (solo accesible desde funciones security definer).

revoke all on public.invitados, public.confirmaciones, public.intentos, public.administradores, public.habilitaciones from anon;
grant select on public.actividades, public.padrinos, public.categorias to anon, authenticated;
-- Segunda barrera (además de RLS): el público no tiene permisos de escritura sobre los catálogos.
revoke insert, update, delete, truncate, references, trigger on public.actividades, public.padrinos, public.categorias from anon;
grant select, insert, update, delete on public.actividades, public.padrinos, public.categorias, public.habilitaciones, public.invitados, public.confirmaciones to authenticated;
grant select on public.administradores to authenticated;


-- Autorizaciones individuales (anulan la regla por categoría). Un enlace sigue vigente aunque cambien.
create table if not exists public.autorizaciones (
  invitado_id uuid not null references public.invitados(id) on delete cascade,
  actividad   text not null references public.actividades(codigo),
  habilitada  boolean not null,
  actualizado timestamptz not null default now(),
  primary key (invitado_id, actividad)
);
create table if not exists public.enlaces (        -- enlace individual vigente (reutilizable y revocable); solo lo lee la organización
  invitado_id uuid primary key references public.invitados(id) on delete cascade,
  token       text not null,
  creado      timestamptz not null default now(),
  enviado_en  timestamptz
);
create table if not exists public.bitacora (        -- registro de modificaciones administrativas
  id bigserial primary key, cuando timestamptz not null default now(), admin text, accion text not null, detalle jsonb not null default '{}'
);
alter table public.autorizaciones enable row level security;
alter table public.enlaces enable row level security;
alter table public.bitacora enable row level security;
revoke all on public.autorizaciones, public.enlaces, public.bitacora from anon;
revoke all on public.enlaces, public.bitacora from authenticated;
drop policy if exists admin_lectura on public.autorizaciones;
create policy admin_lectura on public.autorizaciones for select to authenticated using (public.es_admin());
grant select on public.autorizaciones to authenticated;

-- ---------- Utilidades ----------
create or replace function public._hash(p_token text) returns bytea
language sql immutable set search_path = public, extensions as $$
  select extensions.digest(convert_to(p_token, 'UTF8'), 'sha256');
$$;

create or replace function public._nuevo_token() returns text
language sql volatile set search_path = public, extensions as $$
  select translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');
$$;

create or replace function public._limpiar(p text) returns text
language sql immutable as $$
  select nullif(btrim(regexp_replace(regexp_replace(coalesce(p,''), '[[:cntrl:]<>]', '', 'g'), '\s+', ' ', 'g')), '');
$$;

-- Actividades habilitadas para una categoría (+ excepción individual de recepción)
create or replace function public._habilitadas(p_categoria text, p_override boolean) returns text[]
language sql stable security definer set search_path = public as $$
  select array_agg(a.codigo order by a.orden)
  from public.actividades a
  where coalesce(
          case when a.codigo = 'recepcion' then p_override end,                                           -- excepción individual (solo recepción)
          (select h.habilitada from public.habilitaciones h where h.categoria = p_categoria and h.actividad = a.codigo),
          a.codigo <> 'recepcion');                                                                          -- sin regla: la recepción no se asume
$$;

create or replace function public._override_de(p_inv public.invitados) returns boolean
language sql stable security definer set search_path = public as $$
  -- Las respuestas de padrinos desde el enlace general heredan la excepción del registro oficial.
  select coalesce(p_inv.recepcion_override,
                  (select o.recepcion_override from public.invitados o where o.padrino_id = p_inv.padrino_id and o.origen = 'oficial'));
$$;


-- Actividades autorizadas a un invitado: autorización individual > excepción de recepción > regla de categoría.
-- (Los registros de un padrino heredan las autorizaciones de su registro oficial.)
create or replace function public._actividades_de(p_inv public.invitados) returns text[]
language sql stable security definer set search_path = public as $$
  select array_agg(a.codigo order by a.orden) from public.actividades a
  where coalesce(
    (select x.habilitada from public.autorizaciones x
      where x.invitado_id = coalesce((select o.id from public.invitados o where o.padrino_id = p_inv.padrino_id and o.origen = 'oficial'), p_inv.id)
        and x.actividad = a.codigo),
    case when a.codigo = 'recepcion' then public._override_de(p_inv) end,
    (select h.habilitada from public.habilitaciones h where h.categoria = p_inv.categoria and h.actividad = a.codigo),
    a.codigo <> 'recepcion');
$$;

create or replace function public._vista(p_inv public.invitados) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'nombre', p_inv.nombre,
    'categoria', p_inv.categoria,
    'padrino_id', p_inv.padrino_id,
    'verificado', p_inv.verificado,
    'actividades', to_jsonb(public._actividades_de(p_inv)),
    'respuestas', coalesce((select jsonb_object_agg(c.actividad, c.estado) from public.confirmaciones c where c.invitado_id = p_inv.id), '{}'::jsonb),
    'actualizado', p_inv.actualizado
  );
$$;

-- ---------- API pública (rol anon) ----------

-- Configuración inicial: padrinos activos, actividades y reglas de recepción por categoría.
create or replace function public.invitacion_config() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'padrinos', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nombre', nombre, 'apellido', apellido) order by apellido, nombre) from public.padrinos where activo), '[]'),
    'actividades', coalesce((select jsonb_agg(jsonb_build_object('codigo', codigo, 'titulo', titulo, 'hora_texto', hora_texto, 'inicio', inicio, 'lugar', lugar) order by orden) from public.actividades), '[]'),
    'habilitaciones', coalesce((select jsonb_object_agg(categoria, reglas) from (select categoria, jsonb_object_agg(actividad, habilitada) reglas from public.habilitaciones group by categoria) x), '{}'),
    'recepcion', coalesce((select jsonb_object_agg(categoria, habilitada) from public.habilitaciones where actividad = 'recepcion'), '{}'),
    -- Excepciones individuales de padrinos (solo el booleano, sin datos personales adicionales)
    'recepcion_padrinos', coalesce((select jsonb_object_agg(padrino_id, recepcion_override) from public.invitados where origen = 'oficial' and recepcion_override is not null), '{}')
  );
$$;

-- Recupera la invitación asociada a un token (enlace individual o dispositivo que ya respondió).
create or replace function public.mi_invitacion(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v public.invitados;
begin
  if p_token is null or char_length(p_token) < 20 or char_length(p_token) > 100 then return null; end if;
  select * into v from public.invitados where token_hash = public._hash(p_token);
  if not found then return null; end if;
  return public._vista(v);
end $$;

-- Guarda o modifica una confirmación.
--  · Sin token: crea un registro nuevo y devuelve su token (la app lo guarda en el dispositivo).
--  · Con token: modifica únicamente el registro de ese token.
create or replace function public.guardar_confirmacion(
  p_token text, p_categoria text, p_padrino_id text, p_nombre text,
  p_respuestas jsonb, p_trampa text default null, p_nota text default null
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v public.invitados; v_token text; v_ip text; v_nombre text; v_hab text[]; k text; e text;
begin
  -- Antispam: campo trampa invisible y límite de registros nuevos por IP
  if coalesce(p_trampa, '') <> '' then raise exception 'solicitud_rechazada' using errcode = 'P0001'; end if;
  if p_respuestas is null or jsonb_typeof(p_respuestas) <> 'object' then raise exception 'respuestas_invalidas' using errcode = 'P0001'; end if;

  if p_token is not null and p_token <> '' then
    select * into v from public.invitados where token_hash = public._hash(p_token) for update;
    if not found then raise exception 'token_invalido' using errcode = 'P0001'; end if;
    -- El nombre puede corregirse, salvo en registros vinculados a un padrino del listado oficial.
    if v.padrino_id is null and public._limpiar(p_nombre) is not null then
      v_nombre := left(public._limpiar(p_nombre), 80);
      if char_length(v_nombre) < 2 then raise exception 'nombre_invalido' using errcode = 'P0001'; end if;
      update public.invitados set nombre = v_nombre where id = v.id;
    end if;
    if v.token_admin and not v.verificado then update public.invitados set verificado = true where id = v.id; end if;
  else
    v_ip := coalesce(split_part(current_setting('request.headers', true)::json->>'x-forwarded-for', ',', 1), 'desconocida');
    if (select count(*) from public.intentos where ip = v_ip and creado > now() - interval '10 minutes') >= 15 then
      raise exception 'demasiadas_solicitudes' using errcode = 'P0001';
    end if;
    insert into public.intentos(ip) values (v_ip);
    delete from public.intentos where creado < now() - interval '1 day';

    if p_categoria not in ('padrino','docente','egresado','r1','r2','otro') then raise exception 'categoria_invalida' using errcode = 'P0001'; end if;
    if p_categoria = 'padrino' then
      select nombre into v_nombre from public.padrinos where id = p_padrino_id and activo;
      if v_nombre is null then raise exception 'padrino_invalido' using errcode = 'P0001'; end if;
    else
      p_padrino_id := null;
      v_nombre := left(public._limpiar(p_nombre), 80);
      if v_nombre is null or char_length(v_nombre) < 2 then raise exception 'nombre_invalido' using errcode = 'P0001'; end if;
    end if;
    v_token := public._nuevo_token();
    insert into public.invitados(categoria, padrino_id, nombre, origen, token_hash, nota_omision)
      values (p_categoria, p_padrino_id, v_nombre, 'enlace_general', public._hash(v_token), left(public._limpiar(p_nota), 300))
      returning * into v;
  end if;

  select * into v from public.invitados where id = v.id;
  v_hab := public._actividades_de(v);

  for k, e in select key, value #>> '{}' from jsonb_each(p_respuestas) loop
    if not (k = any(v_hab)) then continue; end if;                    -- actividad no habilitada: se ignora
    if e is null or e = '' or e = 'sin_responder' then
      delete from public.confirmaciones where invitado_id = v.id and actividad = k;
    elsif e in ('asistira','no_asistira','por_confirmar') then
      insert into public.confirmaciones(invitado_id, actividad, estado) values (v.id, k, e)
      on conflict (invitado_id, actividad) do update set estado = excluded.estado, actualizado = now();
    else
      raise exception 'estado_invalido' using errcode = 'P0001';
    end if;
  end loop;

  update public.invitados set actualizado = now(), respondido = coalesce(respondido, now()) where id = v.id returning * into v;
  return jsonb_build_object('token', v_token, 'invitacion', public._vista(v));
end $$;

-- Aviso discreto de omisión en el listado (no crea registro de padrino).
create or replace function public.informar_omision(p_token text, p_nota text) returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  update public.invitados set nota_omision = left(public._limpiar(p_nota), 300), actualizado = now()
   where token_hash = public._hash(p_token);
  return found;
end $$;

-- ---------- API administrativa ----------
create or replace function public.admin_generar_enlace(p_invitado uuid) returns text
language plpgsql volatile security definer set search_path = public as $$
declare v_token text;
begin
  if not public.es_admin() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  v_token := public._nuevo_token();
  update public.invitados set token_hash = public._hash(v_token), token_admin = true, actualizado = now() where id = p_invitado;
  if not found then raise exception 'no_encontrado' using errcode = 'P0001'; end if;
  insert into public.enlaces(invitado_id, token) values (p_invitado, v_token) on conflict (invitado_id) do update set token = excluded.token, creado = now(), enviado_en = null;
  return v_token;   -- se muestra una sola vez; en la base solo queda el hash
end $$;

create or replace function public.admin_crear_invitado(p_nombre text, p_categoria text) returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.es_admin() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  if p_categoria not in ('docente','egresado','r1','r2','otro') then raise exception 'categoria_invalida' using errcode = 'P0001'; end if;
  insert into public.invitados(categoria, nombre, origen) values (p_categoria, left(public._limpiar(p_nombre), 80), 'registro_admin') returning id into v_id;
  return v_id;
end $$;

-- Sincroniza el registro oficial (uno por padrino activo).
-- · _sincronizar_padrinos(): lógica interna SIN comprobación; nadie del API puede ejecutarla (solo el propietario: SQL Editor/semilla).
-- · admin_sincronizar_padrinos(): vía RPC, exige una cuenta de la tabla «administradores».
create or replace function public._sincronizar_padrinos() returns int
language plpgsql volatile security definer set search_path = public as $$
declare n int;
begin
  insert into public.invitados(categoria, padrino_id, nombre, origen, verificado)
  select 'padrino', p.id, p.nombre, 'oficial', false from public.padrinos p
  where p.activo and not exists (select 1 from public.invitados i where i.padrino_id = p.id and i.origen = 'oficial');
  get diagnostics n = row_count;
  update public.invitados i set nombre = p.nombre from public.padrinos p where i.padrino_id = p.id and i.origen = 'oficial' and i.nombre <> p.nombre;
  return n;
end $$;

create or replace function public.admin_sincronizar_padrinos() returns int
language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.es_admin() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  return public._sincronizar_padrinos();
end $$;

-- Eliminación de registros personales tras el evento (conserva catálogos y padrinos oficiales sin respuestas).
create or replace function public.admin_eliminar_registros(p_confirmacion text) returns int
language plpgsql volatile security definer set search_path = public as $$
declare n int;
begin
  if not public.es_admin() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  if p_confirmacion <> 'ELIMINAR TODO' then raise exception 'confirmacion_requerida' using errcode = 'P0001'; end if;
  delete from public.confirmaciones;
  delete from public.invitados where origen <> 'oficial';
  get diagnostics n = row_count;
  update public.invitados set token_hash = null, token_admin = false, verificado = false, respondido = null, nota_omision = null;
  delete from public.intentos;
  delete from public.enlaces; delete from public.autorizaciones; delete from public.bitacora; delete from public.solicitudes;
  return n;
end $$;

-- Permisos de ejecución
revoke all on function public.invitacion_config(), public.mi_invitacion(text), public.guardar_confirmacion(text,text,text,text,jsonb,text,text), public.informar_omision(text,text) from public;
grant execute on function public.invitacion_config(), public.mi_invitacion(text), public.guardar_confirmacion(text,text,text,text,jsonb,text,text), public.informar_omision(text,text) to anon, authenticated;
revoke all on function public.admin_generar_enlace(uuid), public.admin_crear_invitado(text,text), public.admin_sincronizar_padrinos(), public.admin_eliminar_registros(text) from public, anon;
grant execute on function public.admin_generar_enlace(uuid), public.admin_crear_invitado(text,text), public.admin_sincronizar_padrinos(), public.admin_eliminar_registros(text) to authenticated;
revoke all on function public._sincronizar_padrinos(), public._hash(text), public._nuevo_token(), public._habilitadas(text,boolean), public._actividades_de(public.invitados), public._override_de(public.invitados), public._vista(public.invitados) from public, anon, authenticated;

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

-- DEDICATORIAS Y APORTES VOLUNTARIOS (idempotente). Se ejecuta DESPUÉS de esquema.sql y acceso.sql.
-- Sin CAPTCHA ni verificación telefónica: protección solo en el servidor (validación, frecuencia, duplicados, saneamiento,
-- límites de almacenamiento) y moderación obligatoria. El teléfono es privado y NO está verificado.
-- Los datos de Pago Móvil NO están en el repositorio: se cargan desde el panel o el SQL Editor.

-- Limpieza de versiones previas (nunca instaladas en producción): Turnstile fuera del proyecto
drop function if exists public.dedicatoria_enviar(text,text,text,text,text[],text,text);
drop function if exists public.admin_definir_turnstile(text,text);
drop function if exists public._turnstile_verificar(text,text);
drop table if exists public.ajustes_privados;

create table if not exists public.ajustes (clave text primary key, valor jsonb not null, actualizado timestamptz not null default now());
create table if not exists public.dedicatorias (
  id uuid primary key default gen_random_uuid(),
  destinatario text not null,                       -- 'promocion' o id de un graduando
  mensaje text not null check (char_length(mensaje) between 5 and 500),
  autor text not null check (char_length(autor) between 2 and 80),
  telefono text not null,                           -- privado: solo lo ve la organización
  stickers text[] not null default '{}' check (cardinality(stickers) <= 2),
  estado text not null default 'pendiente' check (estado in ('pendiente','aprobado','rechazado','oculto')),
  ip text, huella text not null,
  creado timestamptz not null default now(), publicada timestamptz
);
create index if not exists ix_dedic_estado on public.dedicatorias (estado, publicada desc);
create index if not exists ix_dedic_tel on public.dedicatorias (telefono, creado);
create index if not exists ix_dedic_ip on public.dedicatorias (ip, creado);
alter table public.ajustes enable row level security;
alter table public.dedicatorias enable row level security;
revoke all on public.ajustes, public.dedicatorias from anon, authenticated;

-- Lista de especialistas para el formulario (sin datos privados)
create or replace function public.dedicatorias_config() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('activo', true,
    'especialistas', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nombre', nombre) order by apellido, nombre) from public.graduandos where activo), '[]'));
$$;

create or replace function public.dedicatoria_enviar(
  p_destinatario text, p_mensaje text, p_autor text, p_telefono text, p_stickers text[], p_trampa text default null
) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_ip text; v_msg text; v_aut text; v_tel text; v_st text[]; v_h text; s text;
begin
  if coalesce(p_trampa, '') <> '' then raise exception 'solicitud_rechazada' using errcode = 'P0001'; end if;
  v_ip := coalesce(split_part(current_setting('request.headers', true)::json->>'x-forwarded-for', ',', 1), 'desconocida');
  if p_destinatario <> 'promocion' and not exists(select 1 from public.graduandos where id = p_destinatario and activo) then raise exception 'destinatario_invalido' using errcode = 'P0001'; end if;
  v_msg := left(public._limpiar(p_mensaje), 500);
  if v_msg is null or char_length(v_msg) < 5 then raise exception 'mensaje_invalido' using errcode = 'P0001'; end if;
  v_aut := left(public._limpiar(p_autor), 80);
  if v_aut is null or char_length(v_aut) < 2 then raise exception 'autor_invalido' using errcode = 'P0001'; end if;
  v_tel := regexp_replace(coalesce(p_telefono, ''), '[\s\-().]', '', 'g');
  if v_tel like '00%' then v_tel := '+' || substr(v_tel, 3); end if;
  if v_tel !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'telefono_invalido' using errcode = 'P0001'; end if;
  v_st := coalesce(p_stickers, '{}');
  if cardinality(v_st) > 2 then raise exception 'stickers_invalidos' using errcode = 'P0001'; end if;
  foreach s in array v_st loop
    if s not in ('corazon','birrete','aplausos','confeti','estrellas','brindis') then raise exception 'stickers_invalidos' using errcode = 'P0001'; end if;
  end loop;
  if (select count(distinct x) from unnest(v_st) x) <> cardinality(v_st) then raise exception 'stickers_invalidos' using errcode = 'P0001'; end if;
  v_h := md5(lower(v_msg) || '|' || p_destinatario);
  -- Control de frecuencia, duplicados y límites de almacenamiento
  if (select count(*) from public.dedicatorias where ip = v_ip and creado > now() - interval '1 hour') >= 5
     or (select count(*) from public.dedicatorias where telefono = v_tel and creado > now() - interval '1 day') >= 3
     or (select count(*) from public.dedicatorias where creado > now() - interval '1 hour') >= 120 then
    raise exception 'demasiadas_solicitudes' using errcode = 'P0001';
  end if;
  if (select count(*) from public.dedicatorias where estado = 'pendiente') >= 400 then raise exception 'cupo_lleno' using errcode = 'P0001'; end if;
  if exists(select 1 from public.dedicatorias where huella = v_h and telefono = v_tel) then raise exception 'duplicado' using errcode = 'P0001'; end if;
  insert into public.dedicatorias(destinatario, mensaje, autor, telefono, stickers, ip, huella) values (p_destinatario, v_msg, v_aut, v_tel, v_st, v_ip, v_h);
  return jsonb_build_object('ok', true);
end $$;

-- Libro público: solo aprobadas y sin datos privados
create or replace function public.dedicatorias_publicas() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'autor', d.autor, 'mensaje', d.mensaje, 'stickers', to_jsonb(d.stickers), 'fecha', d.publicada,
    'para', case when d.destinatario = 'promocion' then 'Toda la XXIV Promoción' else coalesce(g.nombre, 'Toda la XXIV Promoción') end
  ) order by d.publicada desc), '[]')
  from public.dedicatorias d left join public.graduandos g on g.id = d.destinatario where d.estado = 'aprobado';
$$;

-- Aportes voluntarios: solo si la organización los activó
create or replace function public.aportes_publicos() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when coalesce((select (valor->>'activo')::boolean from public.ajustes where clave = 'aportes'), false)
    then (select valor - 'activo' || jsonb_build_object('activo', true) from public.ajustes where clave = 'aportes')
    else jsonb_build_object('activo', false) end;
$$;

-- ---------- Administración ----------
create or replace function public.admin_dedicatorias() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public._es_gestor() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', d.id, 'destinatario', d.destinatario, 'para', case when d.destinatario = 'promocion' then 'Toda la XXIV Promoción' else coalesce(g.nombre, d.destinatario) end,
    'autor', d.autor, 'telefono', d.telefono, 'mensaje', d.mensaje, 'stickers', to_jsonb(d.stickers), 'estado', d.estado, 'creado', d.creado, 'publicada', d.publicada,
    'duplicados', (select count(*) from public.dedicatorias x where x.id <> d.id and (x.huella = d.huella or (x.telefono = d.telefono and x.autor = d.autor)))
  ) order by d.creado desc) from public.dedicatorias d left join public.graduandos g on g.id = d.destinatario), '[]');
end $$;

create or replace function public.admin_dedicatoria_estado(p_id uuid, p_estado text) returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  if not public._es_gestor() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  if p_estado not in ('pendiente','aprobado','rechazado','oculto') then raise exception 'estado_invalido' using errcode = 'P0001'; end if;
  update public.dedicatorias set estado = p_estado, publicada = case when p_estado = 'aprobado' then coalesce(publicada, now()) else publicada end where id = p_id;
  return found;
end $$;

create or replace function public.admin_dedicatoria_eliminar(p_id uuid) returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  if not public._es_gestor() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  delete from public.dedicatorias where id = p_id;
  return found;
end $$;

create or replace function public.admin_ajustes() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public._es_gestor() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  return jsonb_build_object('aportes', coalesce((select valor from public.ajustes where clave = 'aportes'), '{}'));
end $$;

create or replace function public._definir_aportes(p_valor jsonb) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare k text;
begin
  if jsonb_typeof(p_valor) <> 'object' then raise exception 'valor_invalido' using errcode = 'P0001'; end if;
  for k in select jsonb_object_keys(p_valor) loop
    if k not in ('activo','intro','gracias','banco','codigo','titular','cedula','telefono') then raise exception 'campo_invalido' using errcode = 'P0001'; end if;
  end loop;
  insert into public.ajustes(clave, valor) values ('aportes', p_valor) on conflict (clave) do update set valor = excluded.valor, actualizado = now();
  return true;
end $$;

create or replace function public.init_definir_aportes(p_valor jsonb) returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  if session_user not in ('postgres', 'supabase_admin') then raise exception 'solo_inicializacion' using errcode = '42501'; end if;
  return public._definir_aportes(p_valor);
end $$;

create or replace function public.admin_definir_aportes(p_valor jsonb) returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  if not public._es_gestor() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  return public._definir_aportes(p_valor);
end $$;

revoke all on function public._definir_aportes(jsonb), public.init_definir_aportes(jsonb) from public, anon, authenticated;
revoke all on function public.dedicatorias_config(), public.dedicatoria_enviar(text,text,text,text,text[],text), public.dedicatorias_publicas(), public.aportes_publicos() from public;
grant execute on function public.dedicatorias_config(), public.dedicatoria_enviar(text,text,text,text,text[],text), public.dedicatorias_publicas(), public.aportes_publicos() to anon, authenticated;
revoke all on function public.admin_dedicatorias(), public.admin_dedicatoria_estado(uuid,text), public.admin_dedicatoria_eliminar(uuid), public.admin_ajustes(), public.admin_definir_aportes(jsonb) from public, anon;
grant execute on function public.admin_dedicatorias(), public.admin_dedicatoria_estado(uuid,text), public.admin_dedicatoria_eliminar(uuid), public.admin_ajustes(), public.admin_definir_aportes(jsonb) to authenticated;
notify pgrst, 'reload schema';

-- CENTRO DE INVITACIONES: enlaces masivos reutilizables/revocables, autorizaciones individuales y bitácora (idempotente).
-- Se ejecuta DESPUÉS de esquema.sql y acceso.sql. Todo se valida en el servidor; solo la organización puede ejecutarlo.
-- Los enlaces individuales son secretos al portador: se guardan en public.enlaces (sin acceso público) para poder reutilizarlos;
-- revocar un enlace lo elimina y deja de funcionar de inmediato.

create or replace function public._admin_id() returns text
language sql stable as $$ select coalesce((select email from public.administradores where user_id = auth.uid()), 'desconocido'); $$;

create or replace function public._bitacora(p_accion text, p_detalle jsonb) returns void
language sql volatile security definer set search_path = public as $$
  insert into public.bitacora(admin, accion, detalle) values (public._admin_id(), p_accion, coalesce(p_detalle, '{}'));
$$;

-- Registro «responsable» de una persona: el oficial para padrinos; el propio para el resto
create or replace function public._destino(p_id uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce((select o.id from public.invitados o where o.padrino_id = i.padrino_id and o.origen = 'oficial'), i.id) from public.invitados i where i.id = p_id;
$$;

-- Genera (o reutiliza) enlaces individuales. p_regenerar = true invalida el anterior y crea uno nuevo.
create or replace function public.admin_generar_enlaces(p_ids uuid[], p_regenerar boolean default false) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_id uuid; v_dest uuid; v_tok text; v_ok boolean; r jsonb := '[]'; n_nuevos int := 0;
begin
  if not public._es_gestor() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  if p_ids is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 500 then raise exception 'seleccion_invalida' using errcode = 'P0001'; end if;
  foreach v_id in array p_ids loop
    v_dest := public._destino(v_id);
    if v_dest is null then continue; end if;
    select e.token into v_tok from public.enlaces e join public.invitados i on i.id = e.invitado_id
      where e.invitado_id = v_dest and i.token_hash = public._hash(e.token) and i.token_admin;
    v_ok := v_tok is not null and not coalesce(p_regenerar, false);
    if not v_ok then
      v_tok := public._nuevo_token();
      update public.invitados set token_hash = public._hash(v_tok), token_admin = true, actualizado = now() where id = v_dest;
      insert into public.enlaces(invitado_id, token) values (v_dest, v_tok)
        on conflict (invitado_id) do update set token = excluded.token, creado = now(), enviado_en = null;
      n_nuevos := n_nuevos + 1;
    end if;
    r := r || jsonb_build_object('id', v_id, 'token', v_tok, 'nuevo', not v_ok);
  end loop;
  perform public._bitacora('enlaces_generados', jsonb_build_object('personas', cardinality(p_ids), 'nuevos', n_nuevos, 'regenerados', coalesce(p_regenerar, false)));
  return r;
end $$;

-- Enlaces vigentes y estado de distribución (solo organización)
create or replace function public.admin_enlaces() returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not public._es_gestor() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', e.invitado_id, 'token', e.token, 'enviado_en', e.enviado_en))
    from public.enlaces e join public.invitados i on i.id = e.invitado_id where i.token_hash = public._hash(e.token) and i.token_admin), '[]');
end $$;

create or replace function public.admin_revocar_enlaces(p_ids uuid[]) returns int
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_id uuid; v_dest uuid; n int := 0;
begin
  if not public._es_gestor() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  if p_ids is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 500 then raise exception 'seleccion_invalida' using errcode = 'P0001'; end if;
  foreach v_id in array p_ids loop
    v_dest := public._destino(v_id);
    update public.invitados set token_hash = null, token_admin = false, actualizado = now() where id = v_dest and token_hash is not null;
    if found then n := n + 1; end if;
    delete from public.enlaces where invitado_id = v_dest;
  end loop;
  perform public._bitacora('enlaces_revocados', jsonb_build_object('personas', cardinality(p_ids), 'revocados', n));
  return n;
end $$;

create or replace function public.admin_marcar_enviado(p_ids uuid[], p_enviado boolean default true) returns int
language plpgsql volatile security definer set search_path = public as $$
declare n int;
begin
  if not public._es_gestor() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  update public.enlaces set enviado_en = case when p_enviado then now() else null end
   where invitado_id in (select public._destino(x) from unnest(p_ids) x);
  get diagnostics n = row_count; return n;
end $$;

-- Autorizaciones individuales o masivas. 'fijar': solo las actividades indicadas quedan autorizadas.
-- 'restablecer': vuelve a la regla de la categoría. El enlace, las confirmaciones y el registro no se tocan.
create or replace function public.admin_autorizar(p_ids uuid[], p_actividades text[], p_modo text default 'fijar') returns int
language plpgsql volatile security definer set search_path = public as $$
declare v_id uuid; v_dest uuid; a record; n int := 0; v_ant jsonb;
begin
  if not public._es_gestor() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  if p_ids is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 500 then raise exception 'seleccion_invalida' using errcode = 'P0001'; end if;
  if p_modo not in ('fijar','restablecer') then raise exception 'modo_invalido' using errcode = 'P0001'; end if;
  if p_modo = 'fijar' then
    if exists(select 1 from unnest(coalesce(p_actividades, '{}')) x where x not in (select codigo from public.actividades)) then raise exception 'actividad_invalida' using errcode = 'P0001'; end if;
  end if;
  foreach v_id in array p_ids loop
    v_dest := public._destino(v_id);
    if v_dest is null then continue; end if;
    v_ant := to_jsonb(public._actividades_de((select i from public.invitados i where i.id = v_dest)));
    if p_modo = 'restablecer' then
      delete from public.autorizaciones where invitado_id = v_dest;
    else
      for a in select codigo from public.actividades loop
        insert into public.autorizaciones(invitado_id, actividad, habilitada) values (v_dest, a.codigo, a.codigo = any(coalesce(p_actividades, '{}')))
          on conflict (invitado_id, actividad) do update set habilitada = excluded.habilitada, actualizado = now();
      end loop;
    end if;
    update public.invitados set actualizado = now() where id = v_dest;
    insert into public.bitacora(admin, accion, detalle) values (public._admin_id(), 'autorizacion',
      jsonb_build_object('invitado', v_dest, 'modo', p_modo, 'antes', v_ant, 'despues', to_jsonb(public._actividades_de((select i from public.invitados i where i.id = v_dest)))));
    n := n + 1;
  end loop;
  return n;
end $$;

-- Verifica un código de categoría sin abrir sesión (el panel lo pide una vez por sesión y no lo guarda).
create or replace function public.admin_verificar_codigo(p_grupo text, p_codigo text) returns boolean
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_hash text;
begin
  if not public._es_gestor() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  if p_grupo = 'otros' then return true; end if;
  select hash into v_hash from public.codigos_acceso where grupo = p_grupo;
  return v_hash is not null and p_codigo is not null and extensions.crypt(p_codigo, v_hash) = v_hash;
end $$;

create or replace function public.admin_bitacora(p_limite int default 100) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public._es_gestor() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(to_jsonb(b)) from (select * from public.bitacora order by id desc limit least(greatest(p_limite, 1), 500)) b), '[]');
end $$;

revoke all on function public._admin_id(), public._bitacora(text,jsonb), public._destino(uuid) from public, anon, authenticated;
revoke all on function public.admin_generar_enlaces(uuid[],boolean), public.admin_enlaces(), public.admin_revocar_enlaces(uuid[]), public.admin_marcar_enviado(uuid[],boolean),
  public.admin_autorizar(uuid[],text[],text), public.admin_verificar_codigo(text,text), public.admin_bitacora(int) from public, anon;
grant execute on function public.admin_generar_enlaces(uuid[],boolean), public.admin_enlaces(), public.admin_revocar_enlaces(uuid[]), public.admin_marcar_enviado(uuid[],boolean),
  public.admin_autorizar(uuid[],text[],text), public.admin_verificar_codigo(text,text), public.admin_bitacora(int) to authenticated;
notify pgrst, 'reload schema';

-- ---------- Solicitudes de invitación («Otros invitados») ----------
-- Una solicitud pendiente NO es una asistencia: solo al aprobarla se crea el registro «Otro invitado» (sin respuestas).
drop function if exists public.solicitar_invitacion(text,text,text,text,text,text,text);
create table if not exists public.solicitudes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (char_length(nombre) between 2 and 80),
  invita_tipo text not null check (invita_tipo in ('padrino','especialista','r1','r2','docente','otro')),
  invita_nombre text not null check (char_length(invita_nombre) between 2 and 80),
  telefono text not null,                          -- privado: solo la organización
  estado text not null default 'pendiente' check (estado in ('pendiente','aprobada','rechazada')),
  invitado_id uuid references public.invitados(id) on delete set null,
  ip text, creado timestamptz not null default now()
);
create index if not exists ix_solic_ip on public.solicitudes (ip, creado);
alter table public.solicitudes enable row level security;
revoke all on public.solicitudes from anon, authenticated;

create or replace function public.solicitar_invitacion(
  p_nombre text, p_invita_tipo text, p_invita_nombre text, p_telefono text, p_trampa text default null
) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_ip text; v_nom text; v_tel text; v_inv text;
begin
  if coalesce(p_trampa, '') <> '' then raise exception 'solicitud_rechazada' using errcode = 'P0001'; end if;
  v_ip := coalesce(split_part(current_setting('request.headers', true)::json->>'x-forwarded-for', ',', 1), 'desconocida');
  v_nom := left(public._limpiar(p_nombre), 80);
  if v_nom is null or char_length(v_nom) < 2 then raise exception 'nombre_invalido' using errcode = 'P0001'; end if;
  if p_invita_tipo not in ('padrino','especialista','r1','r2','docente','otro') then raise exception 'invita_invalido' using errcode = 'P0001'; end if;
  v_inv := left(public._limpiar(p_invita_nombre), 80);   -- obligatorio: nombre de quien invita
  if v_inv is null or char_length(v_inv) < 2 then raise exception 'invita_invalido' using errcode = 'P0001'; end if;
  v_tel := regexp_replace(coalesce(p_telefono, ''), '[\s\-().]', '', 'g');
  if v_tel like '00%' then v_tel := '+' || substr(v_tel, 3); end if;
  if v_tel !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'telefono_invalido' using errcode = 'P0001'; end if;
  if (select count(*) from public.solicitudes where ip = v_ip and creado > now() - interval '1 hour') >= 5
     or (select count(*) from public.solicitudes where telefono = v_tel and creado > now() - interval '1 day') >= 3
     or (select count(*) from public.solicitudes where creado > now() - interval '1 hour') >= 120 then raise exception 'demasiadas_solicitudes' using errcode = 'P0001'; end if;
  if (select count(*) from public.solicitudes where estado = 'pendiente') >= 400 then raise exception 'cupo_lleno' using errcode = 'P0001'; end if;
  if exists(select 1 from public.solicitudes where telefono = v_tel and lower(nombre) = lower(v_nom) and estado = 'pendiente') then raise exception 'duplicado' using errcode = 'P0001'; end if;
  insert into public.solicitudes(nombre, invita_tipo, invita_nombre, telefono, ip) values (v_nom, p_invita_tipo, v_inv, v_tel, v_ip);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_solicitudes() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public._es_gestor() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'nombre', s.nombre, 'telefono', s.telefono, 'estado', s.estado, 'creado', s.creado,
    'invitado_id', s.invitado_id, 'invita', s.invita_nombre, 'invita_tipo', s.invita_tipo) order by s.creado desc) from public.solicitudes s), '[]');
end $$;

-- Aprobar crea el registro «Otro invitado» (luego se le genera su enlace y se autorizan sus actividades en el centro); rechazar no crea nada.
create or replace function public.admin_solicitud_resolver(p_id uuid, p_aprobar boolean) returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare s public.solicitudes; v_inv uuid;
begin
  if not public._es_gestor() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  select * into s from public.solicitudes where id = p_id for update;
  if not found then raise exception 'no_encontrado' using errcode = 'P0001'; end if;
  if p_aprobar then
    v_inv := s.invitado_id;
    if v_inv is null then insert into public.invitados(categoria, nombre, origen) values ('otro', s.nombre, 'registro_admin') returning id into v_inv; end if;
    update public.solicitudes set estado = 'aprobada', invitado_id = v_inv where id = p_id;
  else
    update public.solicitudes set estado = 'rechazada' where id = p_id;
  end if;
  perform public._bitacora('solicitud_' || case when p_aprobar then 'aprobada' else 'rechazada' end, jsonb_build_object('solicitud', p_id));
  return v_inv;
end $$;

revoke all on function public.solicitar_invitacion(text,text,text,text,text) from public;
grant execute on function public.solicitar_invitacion(text,text,text,text,text) to anon, authenticated;
revoke all on function public.admin_solicitudes(), public.admin_solicitud_resolver(uuid,boolean) from public, anon;
grant execute on function public.admin_solicitudes(), public.admin_solicitud_resolver(uuid,boolean) to authenticated;
notify pgrst, 'reload schema';

-- GENERADO desde datos/evento.json por herramientas/generar_semilla_sql.py. No editar a mano.
begin;
insert into public.actividades(codigo, orden, titulo, hora_texto, inicio, lugar) values ('clase', 1, 'Clase magistral', '8:30 a. m.', '2026-11-28T08:30:00-04:00', 'Auditorio A, Facultad de Medicina, Universidad de Los Andes')
  on conflict (codigo) do update set orden = excluded.orden, titulo = excluded.titulo, hora_texto = excluded.hora_texto, inicio = excluded.inicio, lugar = excluded.lugar;
insert into public.actividades(codigo, orden, titulo, hora_texto, inicio, lugar) values ('caravana', 2, 'Caravana de graduandos', '2:00 p. m.', '2026-11-28T14:00:00-04:00', 'Estacionamiento del Hospital Universitario de Los Andes')
  on conflict (codigo) do update set orden = excluded.orden, titulo = excluded.titulo, hora_texto = excluded.hora_texto, inicio = excluded.inicio, lugar = excluded.lugar;
insert into public.actividades(codigo, orden, titulo, hora_texto, inicio, lugar) values ('recepcion', 3, 'Recepción de los nuevos especialistas', '9:00 p. m.', '2026-11-28T21:00:00-04:00', 'Centro de Convenciones Mucumbarila')
  on conflict (codigo) do update set orden = excluded.orden, titulo = excluded.titulo, hora_texto = excluded.hora_texto, inicio = excluded.inicio, lugar = excluded.lugar;
delete from public.actividades where codigo not in ('clase', 'caravana', 'recepcion');
insert into public.categorias(codigo, etiqueta) values ('padrino', 'Padrino o madrina de promoción')
  on conflict (codigo) do update set etiqueta = excluded.etiqueta;
insert into public.categorias(codigo, etiqueta) values ('docente', 'Docente')
  on conflict (codigo) do update set etiqueta = excluded.etiqueta;
insert into public.categorias(codigo, etiqueta) values ('egresado', 'Egresado')
  on conflict (codigo) do update set etiqueta = excluded.etiqueta;
insert into public.categorias(codigo, etiqueta) values ('r1', 'Residente de primer año (R1)')
  on conflict (codigo) do update set etiqueta = excluded.etiqueta;
insert into public.categorias(codigo, etiqueta) values ('r2', 'Residente de segundo año (R2)')
  on conflict (codigo) do update set etiqueta = excluded.etiqueta;
insert into public.categorias(codigo, etiqueta) values ('otro', 'Otro invitado')
  on conflict (codigo) do update set etiqueta = excluded.etiqueta;
insert into public.habilitaciones(categoria, actividad, habilitada) values ('padrino', 'clase', true) on conflict (categoria, actividad) do nothing;
insert into public.habilitaciones(categoria, actividad, habilitada) values ('padrino', 'caravana', true) on conflict (categoria, actividad) do nothing;
insert into public.habilitaciones(categoria, actividad, habilitada) values ('padrino', 'recepcion', true) on conflict (categoria, actividad) do nothing;
insert into public.habilitaciones(categoria, actividad, habilitada) values ('docente', 'clase', true) on conflict (categoria, actividad) do nothing;
insert into public.habilitaciones(categoria, actividad, habilitada) values ('docente', 'caravana', true) on conflict (categoria, actividad) do nothing;
insert into public.habilitaciones(categoria, actividad, habilitada) values ('docente', 'recepcion', false) on conflict (categoria, actividad) do nothing;
insert into public.habilitaciones(categoria, actividad, habilitada) values ('egresado', 'clase', true) on conflict (categoria, actividad) do nothing;
insert into public.habilitaciones(categoria, actividad, habilitada) values ('egresado', 'caravana', true) on conflict (categoria, actividad) do nothing;
insert into public.habilitaciones(categoria, actividad, habilitada) values ('egresado', 'recepcion', false) on conflict (categoria, actividad) do nothing;
insert into public.habilitaciones(categoria, actividad, habilitada) values ('r1', 'clase', true) on conflict (categoria, actividad) do nothing;
insert into public.habilitaciones(categoria, actividad, habilitada) values ('r1', 'caravana', true) on conflict (categoria, actividad) do nothing;
insert into public.habilitaciones(categoria, actividad, habilitada) values ('r1', 'recepcion', false) on conflict (categoria, actividad) do nothing;
insert into public.habilitaciones(categoria, actividad, habilitada) values ('r2', 'clase', true) on conflict (categoria, actividad) do nothing;
insert into public.habilitaciones(categoria, actividad, habilitada) values ('r2', 'caravana', true) on conflict (categoria, actividad) do nothing;
insert into public.habilitaciones(categoria, actividad, habilitada) values ('r2', 'recepcion', false) on conflict (categoria, actividad) do nothing;
insert into public.habilitaciones(categoria, actividad, habilitada) values ('otro', 'clase', true) on conflict (categoria, actividad) do nothing;
insert into public.habilitaciones(categoria, actividad, habilitada) values ('otro', 'caravana', true) on conflict (categoria, actividad) do nothing;
insert into public.habilitaciones(categoria, actividad, habilitada) values ('otro', 'recepcion', false) on conflict (categoria, actividad) do nothing;
insert into public.padrinos(id, nombre, apellido) values ('berrio-omaira', 'Dra. Omaira Berrios', 'Berrios')
  on conflict (id) do update set nombre = excluded.nombre, apellido = excluded.apellido;
insert into public.padrinos(id, nombre, apellido) values ('falcon-analy', 'Dra. Analy Falcón', 'Falcón')
  on conflict (id) do update set nombre = excluded.nombre, apellido = excluded.apellido;
insert into public.padrinos(id, nombre, apellido) values ('gutierrez-maria-del-carmen', 'Dra. María del Carmen Gutiérrez', 'Gutiérrez')
  on conflict (id) do update set nombre = excluded.nombre, apellido = excluded.apellido;
insert into public.padrinos(id, nombre, apellido) values ('moreno-franklin', 'Dr. Franklin Moreno', 'Moreno')
  on conflict (id) do update set nombre = excluded.nombre, apellido = excluded.apellido;
insert into public.padrinos(id, nombre, apellido) values ('rojas-gustavo', 'Dr. Gustavo Rojas', 'Rojas')
  on conflict (id) do update set nombre = excluded.nombre, apellido = excluded.apellido;
insert into public.padrinos(id, nombre, apellido) values ('sosa-angel', 'Dr. Ángel Sosa', 'Sosa')
  on conflict (id) do update set nombre = excluded.nombre, apellido = excluded.apellido;
insert into public.padrinos(id, nombre, apellido) values ('sosa-jenny', 'Dra. Jenny Sosa', 'Sosa')
  on conflict (id) do update set nombre = excluded.nombre, apellido = excluded.apellido;
insert into public.padrinos(id, nombre, apellido) values ('torres-jose-daniel', 'Dr. José Daniel Torres', 'Torres')
  on conflict (id) do update set nombre = excluded.nombre, apellido = excluded.apellido;
insert into public.padrinos(id, nombre, apellido) values ('uzcategui-reyna', 'Dra. Reyna Uzcátegui', 'Uzcátegui')
  on conflict (id) do update set nombre = excluded.nombre, apellido = excluded.apellido;
insert into public.padrinos(id, nombre, apellido) values ('vina-daniel', 'Dr. Daniel Viña', 'Viña')
  on conflict (id) do update set nombre = excluded.nombre, apellido = excluded.apellido;
insert into public.graduandos(id, nombre, apellido) values ('arrieta-jorge', 'Dr. Jorge Arrieta', 'Arrieta')
  on conflict (id) do update set nombre = excluded.nombre, apellido = excluded.apellido;
insert into public.graduandos(id, nombre, apellido) values ('paez-nelson', 'Dr. Nelson Páez', 'Páez')
  on conflict (id) do update set nombre = excluded.nombre, apellido = excluded.apellido;
insert into public.graduandos(id, nombre, apellido) values ('guillen-diego', 'Dr. Diego Guillén', 'Guillén')
  on conflict (id) do update set nombre = excluded.nombre, apellido = excluded.apellido;
insert into public.graduandos(id, nombre, apellido) values ('sanchez-jose', 'Dr. José Sánchez', 'Sánchez')
  on conflict (id) do update set nombre = excluded.nombre, apellido = excluded.apellido;
insert into public.graduandos(id, nombre, apellido) values ('montes-andrea', 'Dra. Andrea Montes', 'Montes')
  on conflict (id) do update set nombre = excluded.nombre, apellido = excluded.apellido;
insert into public.graduandos(id, nombre, apellido) values ('mendez-francia', 'Dra. Francia Méndez', 'Méndez')
  on conflict (id) do update set nombre = excluded.nombre, apellido = excluded.apellido;
insert into public.graduandos(id, nombre, apellido) values ('hernandez-oriana', 'Dra. Oriana Hernández', 'Hernández')
  on conflict (id) do update set nombre = excluded.nombre, apellido = excluded.apellido;
select public._sincronizar_padrinos();
-- Renombrado seguro: el nombre oficial se propaga a todos los registros vinculados (mismo id, mismas respuestas, sin duplicados).
update public.invitados i set nombre = p.nombre from public.padrinos p where i.padrino_id = p.id and i.nombre <> p.nombre;
commit;
