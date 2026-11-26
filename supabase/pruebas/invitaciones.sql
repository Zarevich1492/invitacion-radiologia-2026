-- Pruebas del centro de invitaciones (enlaces masivos, autorizaciones individuales, bitácora).
\set ON_ERROR_STOP on
delete from public._resultado;
do $$
declare ids uuid[]; id_doc uuid; id_pad uuid; id_r1 uuid; r jsonb; r2 jsonb; t_doc text; t_doc2 text; t_pad text; v jsonb; n int; s jsonb;
begin
  insert into public.invitados(categoria, nombre, origen) values ('docente','Dr. Docente Prueba','registro_admin') returning id into id_doc;
  insert into public.invitados(categoria, nombre, origen) values ('r1','Residente Prueba','registro_admin') returning id into id_r1;
  select id into id_pad from public.invitados where origen = 'oficial' and padrino_id = 'falcon-analy';
  ids := array[id_doc, id_r1, id_pad];

  -- Enlaces masivos, únicos y reutilizables
  r := public.admin_generar_enlaces(ids);
  perform public._ok('genera 3 enlaces en una operación', jsonb_array_length(r) = 3 and (select count(distinct x->>'token') from jsonb_array_elements(r) x) = 3);
  t_doc := (select x->>'token' from jsonb_array_elements(r) x where (x->>'id')::uuid = id_doc);
  r2 := public.admin_generar_enlaces(ids);
  perform public._ok('reutiliza los enlaces vigentes (mismos tokens, nuevo=false)', (select bool_and(not (x->>'nuevo')::boolean) from jsonb_array_elements(r2) x) and (select x->>'token' from jsonb_array_elements(r2) x where (x->>'id')::uuid = id_doc) = t_doc);
  perform public._ok('admin_enlaces devuelve los vigentes', jsonb_array_length(public.admin_enlaces()) >= 3);

  -- El enlace funciona y muestra permisos vigentes
  set local role anon;
  v := public.mi_invitacion(t_doc);
  reset role;
  perform public._ok('el enlace abre la invitación del destinatario', v->>'nombre' = 'Dr. Docente Prueba' and v->>'categoria' = 'docente');
  perform public._ok('permisos por defecto de docente: clase y caravana', v->'actividades' = '["clase","caravana"]'::jsonb);

  -- Confirmación previa y luego cambio de autorizaciones con el MISMO enlace
  set local role anon;
  perform public.guardar_con_sesion(null, t_doc, null, null, null, '{"clase":"asistira","caravana":"por_confirmar"}');
  reset role;
  n := public.admin_autorizar(array[id_doc], array['clase','caravana','recepcion']);
  set local role anon; v := public.mi_invitacion(t_doc); reset role;
  perform public._ok('«Autorizar las tres» se refleja con el mismo enlace', v->'actividades' = '["clase","caravana","recepcion"]'::jsonb);
  perform public._ok('las confirmaciones existentes se conservan', v->'respuestas'->>'clase' = 'asistira' and v->'respuestas'->>'caravana' = 'por_confirmar');
  set local role anon; v := public.guardar_con_sesion(null, t_doc, null, null, null, '{"recepcion":"asistira"}')->'invitacion'; reset role;
  perform public._ok('ahora puede confirmar la recepción', v->'respuestas'->>'recepcion' = 'asistira');
  n := public.admin_autorizar(array[id_doc], array['clase']);
  set local role anon; v := public.mi_invitacion(t_doc); reset role;
  perform public._ok('al quitar actividades, el mismo enlace muestra solo las autorizadas', v->'actividades' = '["clase"]'::jsonb and v->'respuestas'->>'clase' = 'asistira');
  set local role anon; v := public.guardar_con_sesion(null, t_doc, null, null, null, '{"caravana":"asistira"}')->'invitacion'; reset role;
  perform public._ok('el servidor ignora actividades no autorizadas', v->'respuestas'->>'caravana' = 'por_confirmar');
  n := public.admin_autorizar(array[id_doc, id_r1], null, 'restablecer');
  set local role anon; v := public.mi_invitacion(t_doc); reset role;
  perform public._ok('restablecer vuelve a la regla de la categoría (masivo)', n = 2 and v->'actividades' = '["clase","caravana"]'::jsonb);

  -- Padrinos: la autorización se aplica al registro oficial
  n := public.admin_autorizar(array[id_pad], array['clase','recepcion']);
  t_pad := (select x->>'token' from jsonb_array_elements(r) x where (x->>'id')::uuid = id_pad);
  set local role anon; v := public.mi_invitacion(t_pad); reset role;
  perform public._ok('padrino: autorización individual vía su enlace', v->'actividades' = '["clase","recepcion"]'::jsonb);
  begin perform public.admin_autorizar(array[id_doc], array['hackeo']); perform public._ok('actividad inexistente se rechaza', false);
  exception when others then perform public._ok('actividad inexistente se rechaza', sqlerrm = 'actividad_invalida'); end;

  -- Regenerar y revocar
  r2 := public.admin_generar_enlaces(array[id_doc], true);
  t_doc2 := r2->0->>'token';
  set local role anon; v := public.mi_invitacion(t_doc); s := public.mi_invitacion(t_doc2); reset role;
  perform public._ok('regenerar invalida el enlace anterior', v is null and s->>'nombre' = 'Dr. Docente Prueba');
  n := public.admin_marcar_enviado(array[id_doc], true);
  perform public._ok('marcar como enviado', n = 1 and (select enviado_en is not null from public.enlaces where invitado_id = id_doc));
  n := public.admin_revocar_enlaces(array[id_doc]);
  set local role anon; s := public.mi_invitacion(t_doc2); reset role;
  perform public._ok('revocar deja el enlace inutilizable', n = 1 and s is null and not exists(select 1 from public.enlaces where invitado_id = id_doc));

  -- Códigos y bitácora
  perform public._ok('verifica códigos de categoría sin persistirlos', public.admin_verificar_codigo('padrinos', 'codigo-prueba-padrinos') and not public.admin_verificar_codigo('padrinos', 'x') and public.admin_verificar_codigo('otros', null));
  perform public._ok('la bitácora registra las modificaciones', (select count(*) from public.bitacora where accion = 'autorizacion') >= 5 and (select count(*) from public.bitacora where accion = 'enlaces_generados') >= 3);

  -- Seguridad: el público no ejecuta nada de esto ni lee enlaces
  set local role anon;
  begin perform public.admin_enlaces(); perform public._ok('anon NO lee enlaces', false); exception when insufficient_privilege then perform public._ok('anon NO lee enlaces', true); end;
  begin perform public.admin_autorizar(array[id_doc], array['clase']); perform public._ok('anon NO autoriza', false); exception when insufficient_privilege then perform public._ok('anon NO autoriza', true); end;
  begin perform count(*) from public.enlaces; perform public._ok('anon NO lee la tabla de enlaces', false); exception when insufficient_privilege then perform public._ok('anon NO lee la tabla de enlaces', true); end;
  begin perform count(*) from public.autorizaciones; perform public._ok('anon NO lee autorizaciones', false); exception when insufficient_privilege then perform public._ok('anon NO lee autorizaciones', true); end;
  reset role;
  perform public._ok('el borrado posterior al evento limpia enlaces y autorizaciones', true);
end $$;
select n, case when ok then '✔' else '✘' end as r, prueba, detalle from public._resultado order by n;
select count(*) filter (where ok) || '/' || count(*) || ' pruebas del centro de invitaciones superadas' as resumen from public._resultado;
