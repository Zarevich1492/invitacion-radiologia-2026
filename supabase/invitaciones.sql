-- CENTRO DE INVITACIONES: enlaces masivos reutilizables/revocables, autorizaciones individuales y bitácora (idempotente).
-- Se ejecuta DESPUÉS de esquema.sql y acceso.sql. Todo se valida en el servidor; solo la organización puede ejecutarlo.
-- Los enlaces individuales son secretos al portador: se guardan en public.enlaces (sin acceso público) para poder reutilizarlos;
-- revocar un enlace lo elimina y deja de funcionar de inmediato.

create or replace function public._admin_id() returns text
language sql stable as $$ select coalesce((select email from public.administradores where user_id = auth.uid()), current_user); $$;

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
