-- Pruebas del acceso por código (se ejecutan tras pruebas.sql; reutiliza public._ok/_resultado).
\set ON_ERROR_STOP on
delete from public._resultado;
do $$
declare r jsonb; s_p text; s_o text; s_e text; s_d text; tok text; n int; h text; v_err text; t jsonb; lista jsonb; ped uuid;
begin
  -- Definir códigos (como postgres/gestor): solo se almacena el hash bcrypt
  perform public.admin_definir_codigo('padrinos', 'codigo-prueba-padrinos');
  perform public.admin_definir_codigo('docentes', 'codigo-prueba-docentes');
  perform public.admin_definir_codigo('residentes', 'codigo-prueba-residentes');
  perform public.admin_definir_codigo('especialistas', 'codigo-prueba-especial');
  select hash into h from public.codigos_acceso where grupo = 'padrinos';
  perform public._ok('el código se guarda como hash bcrypt, no en texto plano', h like '$2%' and h not like '%codigo-prueba%');
  begin perform public.admin_definir_codigo('padrinos', 'corto'); perform public._ok('rechaza códigos cortos', false);
  exception when others then perform public._ok('rechaza códigos cortos', sqlerrm = 'codigo_demasiado_corto'); end;

  execute 'set local role anon';
  begin perform public.admin_definir_codigo('padrinos', 'intruso-intruso'); perform public._ok('anon NO define códigos', false);
  exception when insufficient_privilege then perform public._ok('anon NO define códigos', true); end;
  begin perform count(*) from public.codigos_acceso; perform public._ok('anon NO lee códigos', false);
  exception when insufficient_privilege then perform public._ok('anon NO lee códigos', true); end;
  begin perform count(*) from public.sesiones_acceso; perform public._ok('anon NO lee sesiones', false);
  exception when insufficient_privilege then perform public._ok('anon NO lee sesiones', true); end;

  -- Código correcto / incorrecto
  perform set_config('request.headers', '{"x-forwarded-for":"1.1.1.1"}', true);
  r := public.acceso_validar('padrinos', 'codigo-prueba-padrinos');
  perform public._ok('código correcto abre sesión', (r->>'ok')::boolean and length(r->>'sesion') >= 40);
  s_p := r->>'sesion';
  r := public.acceso_validar('padrinos', 'otro-codigo');
  perform public._ok('código incorrecto se rechaza sin error', not (r->>'ok')::boolean and r->>'motivo' = 'codigo_incorrecto');
  r := public.acceso_validar('especialistas', 'codigo-prueba-padrinos');
  perform public._ok('el código de un grupo no abre otro', not (r->>'ok')::boolean);
  r := public.acceso_validar('otros', null);
  perform public._ok('«Otros» entra sin código', (r->>'ok')::boolean); s_o := r->>'sesion';
  s_e := public.acceso_validar('especialistas', 'codigo-prueba-especial')->>'sesion';
  s_d := public.acceso_validar('docentes', 'codigo-prueba-docentes')->>'sesion';

  -- Limitación de intentos (por IP)
  perform set_config('request.headers', '{"x-forwarded-for":"2.2.2.2"}', true);
  for i in 1..8 loop perform public.acceso_validar('docentes', 'mal-' || i); end loop;
  r := public.acceso_validar('docentes', 'codigo-prueba-docentes');
  perform public._ok('tras 8 fallos la IP queda bloqueada (aun con el código correcto)', r->>'motivo' = 'bloqueado');
  perform set_config('request.headers', '{"x-forwarded-for":"1.1.1.1"}', true);

  -- Listas de nombres según sesión
  lista := public.lista_nombres(s_p);
  perform public._ok('padrinos reciben los 10 nombres', jsonb_array_length(lista) = 10);
  lista := public.lista_nombres(s_e);
  perform public._ok('especialistas reciben los 7 graduandos', jsonb_array_length(lista) = 7);
  perform public._ok('sin sesión válida no hay nombres', public.lista_nombres('x') = '[]'::jsonb and public.lista_nombres(s_o) = '[]'::jsonb and public.lista_nombres(s_d) = '[]'::jsonb);

  -- Permisos por categoría
  r := public.guardar_con_sesion(s_d, null, 'docente', null, 'Docente de Prueba', '{"clase":"asistira"}');
  perform public._ok('docentes registran docentes', r->'invitacion'->>'categoria' = 'docente'); tok := r->>'token';
  begin perform public.guardar_con_sesion(s_d, null, 'padrino', 'falcon-analy', null, '{"clase":"asistira"}'); perform public._ok('docentes NO actúan como padrinos', false);
  exception when others then perform public._ok('docentes NO actúan como padrinos', sqlerrm = 'categoria_no_permitida'); end;
  begin perform public.guardar_con_sesion(s_o, null, 'otro', null, 'Alguien', '{"clase":"asistira"}'); perform public._ok('«Otros» no confirma sin autorización', false);
  exception when others then perform public._ok('«Otros» no confirma sin autorización', sqlerrm = 'requiere_autorizacion'); end;
  begin perform public.guardar_con_sesion(s_e, null, 'docente', null, 'Graduando', '{}'); perform public._ok('especialistas no confirman asistencia', false);
  exception when others then perform public._ok('especialistas no confirman asistencia', sqlerrm = 'no_confirma'); end;
  begin perform public.guardar_con_sesion(null, null, 'docente', null, 'Sin sesión', '{}'); perform public._ok('sin sesión no se registra', false);
  exception when others then perform public._ok('sin sesión no se registra', sqlerrm = 'sesion_invalida'); end;
  begin perform public.guardar_con_sesion(s_p, tok, null, null, null, '{"clase":"no_asistira"}'); perform public._ok('padrinos no modifican registros de otro grupo', false);
  exception when others then perform public._ok('padrinos no modifican registros de otro grupo', sqlerrm = 'token_invalido'); end;
  r := public.guardar_con_sesion(s_d, tok, null, null, null, '{"clase":"no_asistira"}');
  perform public._ok('el mismo grupo sí modifica su registro', r->'invitacion'->'respuestas'->>'clase' = 'no_asistira');
  perform public._ok('mi_invitacion_sesion respeta el grupo', public.mi_invitacion_sesion(s_d, tok) is not null and public.mi_invitacion_sesion(s_p, tok) is null);
  r := public.guardar_con_sesion(s_p, null, 'padrino', 'falcon-analy', null, '{"clase":"asistira"}');
  perform public._ok('padrinos registran a un padrino del listado', r->'invitacion'->>'categoria' = 'padrino');

  -- Cierre de las rutas antiguas (cierre_acceso.sql)
  execute 'reset role';
  -- Revocación y cambio de código
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  perform public._ok('admin ve el estado de acceso', (public.admin_estado_acceso()->'sesiones_activas') is not null);
  perform public.admin_revocar_sesiones('padrinos');
  execute 'reset role';
  execute 'set local role anon';
  perform public._ok('sesión revocada deja de valer', public.acceso_estado(s_p) = '{"ok": false}'::jsonb and public.acceso_estado(s_d)->>'ok' = 'true');
  execute 'reset role';
  perform public.admin_definir_codigo('docentes', 'nuevo-codigo-docentes');
  execute 'set local role anon';
  perform public._ok('cambiar el código cierra sesiones previas', public.acceso_estado(s_d) = '{"ok": false}'::jsonb);
  perform public._ok('el código anterior ya no sirve', not (public.acceso_validar('docentes', 'codigo-prueba-docentes')->>'ok')::boolean);
  execute 'reset role';
  -- Sesión caducada
  update public.sesiones_acceso set expira = now() - interval '1 minute' where token_hash = public._hash(s_e);
  perform public._ok('sesión caducada deja de valer', public._grupo_de(s_e) is null);
end $$;

-- Cierre: tras ejecutar cierre_acceso.sql el registro directo y el listado público desaparecen
\i supabase/cierre_acceso.sql
do $$
declare cfg jsonb; ok1 boolean := false; ok2 boolean := false;
begin
  execute 'set local role anon';
  begin perform public.guardar_confirmacion(null, 'otro', null, 'Bot', '{}', null, null);
  exception when insufficient_privilege then ok1 := true; end;
  begin perform count(*) from public.padrinos;
  exception when insufficient_privilege then ok2 := true; end;
  cfg := public.invitacion_config();
  execute 'reset role';
  perform public._ok('tras el cierre anon NO usa guardar_confirmacion directo', ok1);
  perform public._ok('tras el cierre anon NO lee la tabla padrinos', ok2);
  perform public._ok('tras el cierre la configuración pública no incluye nombres de padrinos', not (cfg ? 'padrinos') and jsonb_array_length(cfg->'actividades') = 3);
end $$;

select n, case when ok then '✔' else '✘' end as r, prueba, detalle from public._resultado order by n;
select count(*) filter (where ok) || '/' || count(*) || ' pruebas de acceso superadas' as resumen from public._resultado;
