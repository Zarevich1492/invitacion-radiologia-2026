-- DEDICATORIAS Y APORTES VOLUNTARIOS (idempotente). Se ejecuta DESPUÉS de esquema.sql y acceso.sql.
-- · Teléfonos y datos de Pago Móvil NO están en el repositorio: se cargan desde el panel (o SQL Editor).
-- · La verificación Cloudflare Turnstile se hace en el servidor; la clave secreta vive solo en public.ajustes_privados (sin acceso público).
-- · Las dedicatorias entran «pendiente» y solo las «aprobado» se publican.

do $$ begin
  create extension if not exists http with schema extensions;   -- necesaria para consultar Turnstile desde la base
exception when others then raise notice 'Active la extensión «http» (Database → Extensions) para validar Turnstile: %', sqlerrm; end $$;

create table if not exists public.ajustes (clave text primary key, valor jsonb not null, actualizado timestamptz not null default now());
create table if not exists public.ajustes_privados (clave text primary key, valor text not null, actualizado timestamptz not null default now());
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
alter table public.ajustes_privados enable row level security;
alter table public.dedicatorias enable row level security;
revoke all on public.ajustes, public.ajustes_privados, public.dedicatorias from anon, authenticated;

-- Verificación real con Cloudflare (siteverify). Sin clave secreta o ante cualquier fallo: falso (nunca se omite).
create or replace function public._turnstile_verificar(p_token text, p_ip text) returns boolean
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_sec text; v_resp jsonb;
begin
  select valor into v_sec from public.ajustes_privados where clave = 'turnstile_secreto';
  if v_sec is null or p_token is null or char_length(p_token) < 10 or char_length(p_token) > 2048 then return false; end if;
  select content::jsonb into v_resp from extensions.http((
    'POST', 'https://challenges.cloudflare.com/turnstile/v0/siteverify', array[]::extensions.http_header[],
    'application/x-www-form-urlencoded',
    'secret=' || extensions.urlencode(v_sec) || '&response=' || extensions.urlencode(p_token) ||
      case when p_ip is not null and p_ip <> 'desconocida' then '&remoteip=' || extensions.urlencode(p_ip) else '' end
  )::extensions.http_request);
  return coalesce((v_resp->>'success')::boolean, false);
exception when others then return false;
end $$;

-- Estado público del módulo: clave de sitio (pública) y si el servidor puede validar
create or replace function public.dedicatorias_config() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'sitio', (select valor #>> '{}' from public.ajustes where clave = 'turnstile_sitio'),
    'activo', exists(select 1 from public.ajustes where clave = 'turnstile_sitio') and exists(select 1 from public.ajustes_privados where clave = 'turnstile_secreto'),
    'especialistas', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nombre', nombre) order by apellido, nombre) from public.graduandos where activo), '[]'));
$$;

create or replace function public.dedicatoria_enviar(
  p_destinatario text, p_mensaje text, p_autor text, p_telefono text, p_stickers text[], p_turnstile text, p_trampa text default null
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
  -- Control de frecuencia y duplicados (antes de consultar a Cloudflare)
  if (select count(*) from public.dedicatorias where ip = v_ip and creado > now() - interval '1 hour') >= 5
     or (select count(*) from public.dedicatorias where telefono = v_tel and creado > now() - interval '1 day') >= 3 then
    raise exception 'demasiadas_solicitudes' using errcode = 'P0001';
  end if;
  if exists(select 1 from public.dedicatorias where huella = v_h and telefono = v_tel) then raise exception 'duplicado' using errcode = 'P0001'; end if;
  if not public._turnstile_verificar(p_turnstile, v_ip) then raise exception 'verificacion_fallida' using errcode = 'P0001'; end if;
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

create or replace function public.admin_ajustes() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public._es_gestor() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  return jsonb_build_object(
    'aportes', coalesce((select valor from public.ajustes where clave = 'aportes'), '{}'),
    'turnstile_sitio', (select valor #>> '{}' from public.ajustes where clave = 'turnstile_sitio'),
    'turnstile_secreto_definido', exists(select 1 from public.ajustes_privados where clave = 'turnstile_secreto'));
end $$;

create or replace function public.admin_definir_aportes(p_valor jsonb) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare k text;
begin
  if not public._es_gestor() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  if jsonb_typeof(p_valor) <> 'object' then raise exception 'valor_invalido' using errcode = 'P0001'; end if;
  for k in select jsonb_object_keys(p_valor) loop
    if k not in ('activo','intro','gracias','banco','codigo','titular','cedula','telefono') then raise exception 'campo_invalido' using errcode = 'P0001'; end if;
  end loop;
  insert into public.ajustes(clave, valor) values ('aportes', p_valor) on conflict (clave) do update set valor = excluded.valor, actualizado = now();
  return true;
end $$;

create or replace function public.admin_definir_turnstile(p_sitio text, p_secreto text) returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  if not public._es_gestor() then raise exception 'no_autorizado' using errcode = '42501'; end if;
  if coalesce(p_sitio, '') <> '' then
    insert into public.ajustes(clave, valor) values ('turnstile_sitio', to_jsonb(left(btrim(p_sitio), 100))) on conflict (clave) do update set valor = excluded.valor, actualizado = now();
  end if;
  if coalesce(p_secreto, '') <> '' then
    insert into public.ajustes_privados(clave, valor) values ('turnstile_secreto', btrim(p_secreto)) on conflict (clave) do update set valor = excluded.valor, actualizado = now();
  end if;
  return true;
end $$;

revoke all on function public._turnstile_verificar(text,text) from public, anon, authenticated;
revoke all on function public.dedicatorias_config(), public.dedicatoria_enviar(text,text,text,text,text[],text,text), public.dedicatorias_publicas(), public.aportes_publicos() from public;
grant execute on function public.dedicatorias_config(), public.dedicatoria_enviar(text,text,text,text,text[],text,text), public.dedicatorias_publicas(), public.aportes_publicos() to anon, authenticated;
revoke all on function public.admin_dedicatorias(), public.admin_dedicatoria_estado(uuid,text), public.admin_ajustes(), public.admin_definir_aportes(jsonb), public.admin_definir_turnstile(text,text) from public, anon;
grant execute on function public.admin_dedicatorias(), public.admin_dedicatoria_estado(uuid,text), public.admin_ajustes(), public.admin_definir_aportes(jsonb), public.admin_definir_turnstile(text,text) to authenticated;
notify pgrst, 'reload schema';
