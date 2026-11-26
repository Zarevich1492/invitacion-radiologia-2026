-- INSTALACIÓN COMPLETA (esquema + semilla). Generado: no editar. Pegar y ejecutar UNA vez en Supabase → SQL Editor.
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
grant select, insert, update, delete on public.actividades, public.padrinos, public.categorias, public.habilitaciones, public.invitados, public.confirmaciones to authenticated;
grant select on public.administradores to authenticated;

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

create or replace function public._vista(p_inv public.invitados) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'nombre', p_inv.nombre,
    'categoria', p_inv.categoria,
    'padrino_id', p_inv.padrino_id,
    'verificado', p_inv.verificado,
    'actividades', to_jsonb(public._habilitadas(p_inv.categoria, public._override_de(p_inv))),
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
  v_hab := public._habilitadas(v.categoria, public._override_de(v));

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

-- Sincroniza el registro oficial (uno por padrino activo). Se ejecuta al añadir padrinos.
create or replace function public.admin_sincronizar_padrinos() returns int
language plpgsql volatile security definer set search_path = public as $$
declare n int;
begin
  if not public.es_admin() and current_user not in ('postgres','supabase_admin') then raise exception 'no_autorizado' using errcode = '42501'; end if;
  insert into public.invitados(categoria, padrino_id, nombre, origen, verificado)
  select 'padrino', p.id, p.nombre, 'oficial', false from public.padrinos p
  where p.activo and not exists (select 1 from public.invitados i where i.padrino_id = p.id and i.origen = 'oficial');
  get diagnostics n = row_count;
  update public.invitados i set nombre = p.nombre from public.padrinos p where i.padrino_id = p.id and i.origen = 'oficial' and i.nombre <> p.nombre;
  return n;
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
  return n;
end $$;

-- Permisos de ejecución
revoke all on function public.invitacion_config(), public.mi_invitacion(text), public.guardar_confirmacion(text,text,text,text,jsonb,text,text), public.informar_omision(text,text) from public;
grant execute on function public.invitacion_config(), public.mi_invitacion(text), public.guardar_confirmacion(text,text,text,text,jsonb,text,text), public.informar_omision(text,text) to anon, authenticated;
revoke all on function public.admin_generar_enlace(uuid), public.admin_crear_invitado(text,text), public.admin_sincronizar_padrinos(), public.admin_eliminar_registros(text) from public, anon;
grant execute on function public.admin_generar_enlace(uuid), public.admin_crear_invitado(text,text), public.admin_sincronizar_padrinos(), public.admin_eliminar_registros(text) to authenticated;
revoke all on function public._hash(text), public._nuevo_token(), public._habilitadas(text,boolean), public._override_de(public.invitados), public._vista(public.invitados) from public, anon, authenticated;

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
select public.admin_sincronizar_padrinos();
-- Renombrado seguro: el nombre oficial se propaga a todos los registros vinculados (mismo id, mismas respuestas, sin duplicados).
update public.invitados i set nombre = p.nombre from public.padrinos p where i.padrino_id = p.id and i.nombre <> p.nombre;
commit;
