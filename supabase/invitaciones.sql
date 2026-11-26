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
