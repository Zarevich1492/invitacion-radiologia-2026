-- Pruebas de seguridad y lógica del esquema (PostgreSQL local que emula Supabase).
-- Uso: herramientas/probar_sql.sh
\set ON_ERROR_STOP on
set client_min_messages = notice;

create table if not exists public._resultado(n serial, prueba text, ok boolean, detalle text);
grant insert, select on public._resultado to anon, authenticated;
grant usage on sequence public._resultado_n_seq to anon, authenticated;

create or replace function public._ok(p text, c boolean, d text default '') returns void language sql as $$
  insert into public._resultado(prueba, ok, detalle) values (p, coalesce(c,false), d);
$$;
grant execute on function public._ok(text,boolean,text) to anon, authenticated;

do $$
declare r jsonb; r2 jsonb; tok text; tok_p text; tok_admin text; n int; v_err text; cfg jsonb; v_id uuid; v_oficial uuid;
begin
  -- ===== Datos iniciales =====
  perform public._ok('10 padrinos sembrados', (select count(*) from public.padrinos) = 10);
  perform public._ok('Dra. Analy Falcón incluida', exists(select 1 from public.padrinos where nombre = 'Dra. Analy Falcón'));
  perform public._ok('10 registros oficiales «sin responder»', (select count(*) from public.invitados where origen='oficial' and respondido is null) = 10);
  perform public._ok('sin categoría R3', not exists(select 1 from public.categorias where codigo ilike '%r3%'));
  perform public._ok('clase magistral 8:30 en Auditorio A', exists(select 1 from public.actividades where codigo='clase' and inicio = '2026-11-28 08:30-04' and lugar like 'Auditorio A, Facultad de Medicina%'));

  -- ===== Rol público (anon) =====
  execute 'set local role anon';
  cfg := public.invitacion_config();
  perform public._ok('anon: config con 10 padrinos ordenados', jsonb_array_length(cfg->'padrinos') = 10 and cfg->'padrinos'->0->>'nombre' = 'Dra. Omaira Berrios' and cfg->'padrinos'->9->>'nombre' = 'Dr. Daniel Viña');
  perform public._ok('anon: 3 actividades', jsonb_array_length(cfg->'actividades') = 3);

  begin perform count(*) from public.invitados; perform public._ok('anon NO lee invitados', false, 'leyó');
  exception when insufficient_privilege then perform public._ok('anon NO lee invitados', true); end;
  begin perform count(*) from public.confirmaciones; perform public._ok('anon NO lee confirmaciones', false);
  exception when insufficient_privilege then perform public._ok('anon NO lee confirmaciones', true); end;
  begin insert into public.padrinos(id,nombre,apellido) values ('x','Dr. Falso','Falso'); perform public._ok('anon NO añade padrinos', false);
  exception when insufficient_privilege then perform public._ok('anon NO añade padrinos', true); end;
  begin perform public.admin_generar_enlace(gen_random_uuid()); perform public._ok('anon NO genera enlaces', false);
  exception when insufficient_privilege then perform public._ok('anon NO genera enlaces', true); end;

  -- Residente R1: respuestas independientes; recepción no habilitada por defecto → se ignora
  r := public.guardar_confirmacion(null, 'r1', null, '  María   José  Peñaloza ', '{"clase":"asistira","caravana":"por_confirmar","recepcion":"asistira"}');
  tok := r->>'token';
  perform public._ok('R1 registrado con token', tok is not null and char_length(tok) >= 40);
  perform public._ok('R1 nombre normalizado', r->'invitacion'->>'nombre' = 'María José Peñaloza', r->'invitacion'->>'nombre');
  perform public._ok('R1 respuestas independientes', r->'invitacion'->'respuestas' = '{"clase":"asistira","caravana":"por_confirmar"}'::jsonb, (r->'invitacion'->'respuestas')::text);
  perform public._ok('R1 recepción no habilitada (no aplica)', not (r->'invitacion'->'actividades') ? 'recepcion');

  -- Modificación con token
  r2 := public.guardar_confirmacion(tok, null, null, 'María José Peñaloza Rivas', '{"caravana":"no_asistira"}');
  perform public._ok('modificar con token conserva registro', r2->>'token' is null and r2->'invitacion'->'respuestas' = '{"clase":"asistira","caravana":"no_asistira"}'::jsonb, (r2->'invitacion'->'respuestas')::text);
  perform public._ok('corrección de nombre', r2->'invitacion'->>'nombre' = 'María José Peñaloza Rivas');
  perform public._ok('mi_invitacion con token', public.mi_invitacion(tok)->>'nombre' = 'María José Peñaloza Rivas');
  perform public._ok('mi_invitacion con token falso = null', public.mi_invitacion('token-falso-token-falso-token-falso-123') is null);
  begin perform public.guardar_confirmacion('token-falso-token-falso-token-falso-123', 'r1', null, 'X Y', '{"clase":"asistira"}');
    perform public._ok('token falso no modifica', false);
  exception when others then perform public._ok('token falso no modifica', sqlerrm = 'token_invalido', sqlerrm); end;

  -- Padrino desde el enlace general: no toca el registro oficial
  r := public.guardar_confirmacion(null, 'padrino', 'falcon-analy', 'Nombre Inventado', '{"clase":"asistira","recepcion":"asistira"}');
  tok_p := r->>'token';
  perform public._ok('padrino: nombre oficial forzado', r->'invitacion'->>'nombre' = 'Dra. Analy Falcón');
  perform public._ok('padrino: no verificado', (r->'invitacion'->>'verificado')::boolean = false);
  perform public._ok('padrino: recepción habilitada por defecto', r->'invitacion'->'respuestas'->>'recepcion' = 'asistira');
  r2 := public.guardar_confirmacion(tok_p, null, null, 'Otro Nombre', '{}');
  perform public._ok('padrino: nombre no editable', r2->'invitacion'->>'nombre' = 'Dra. Analy Falcón');

  -- Validaciones y antispam
  begin perform public.guardar_confirmacion(null, 'r3', null, 'Residente Tres', '{}'); perform public._ok('rechaza categoría R3', false);
  exception when others then perform public._ok('rechaza categoría R3', sqlerrm = 'categoria_invalida', sqlerrm); end;
  begin perform public.guardar_confirmacion(null, 'otro', null, ' ', '{}'); perform public._ok('rechaza nombre vacío', false);
  exception when others then perform public._ok('rechaza nombre vacío', sqlerrm = 'nombre_invalido', sqlerrm); end;
  begin perform public.guardar_confirmacion(null, 'otro', null, 'Bot Spam', '{}', 'http://spam'); perform public._ok('trampa antispam', false);
  exception when others then perform public._ok('trampa antispam', sqlerrm = 'solicitud_rechazada', sqlerrm); end;
  begin perform public.guardar_confirmacion(null, 'otro', null, 'Ana Pérez', '{"clase":"quizas"}'); perform public._ok('rechaza estado inválido', false);
  exception when others then perform public._ok('rechaza estado inválido', sqlerrm = 'estado_invalido', sqlerrm); end;
  begin perform public.guardar_confirmacion(null, 'padrino', 'no-existe', 'X', '{}'); perform public._ok('rechaza padrino inexistente', false);
  exception when others then perform public._ok('rechaza padrino inexistente', sqlerrm = 'padrino_invalido', sqlerrm); end;
  -- Límite de registros por IP (15 por 10 minutos)
  n := 0;
  begin
    for i in 1..20 loop perform public.guardar_confirmacion(null, 'otro', null, 'Invitado ' || i, '{"clase":"asistira"}'); n := n + 1; end loop;
    perform public._ok('límite de solicitudes por IP', false, n::text);
  exception when others then perform public._ok('límite de solicitudes por IP', sqlerrm = 'demasiadas_solicitudes', n || ' aceptadas antes del límite'); end;
  execute 'reset role';
  -- Las inserciones dentro del bloque fallido se revirtieron; se mantiene lo anterior.

  -- ===== Docentes y egresados =====
  execute 'set local role anon';
  r := public.guardar_confirmacion(null, 'docente', null, 'Dr. Luis Ángel Núñez', '{"clase":"asistira","caravana":"por_confirmar","recepcion":"asistira"}');
  perform public._ok('docente: registrado con clase y caravana', r->'invitacion'->>'categoria' = 'docente' and r->'invitacion'->'respuestas' = '{"clase":"asistira","caravana":"por_confirmar"}'::jsonb, (r->'invitacion'->'respuestas')::text);
  perform public._ok('docente: recepción NO habilitada por defecto (no se asume)', not (r->'invitacion'->'actividades') ? 'recepcion');
  r2 := public.guardar_confirmacion(null, 'egresado', null, 'Dra. Marta Rivas', '{"clase":"no_asistira"}');
  perform public._ok('egresado: registrado', r2->'invitacion'->>'categoria' = 'egresado' and r2->'invitacion'->'respuestas'->>'clase' = 'no_asistira');
  cfg := public.invitacion_config();
  perform public._ok('config: matriz de habilitación con docente y egresado', cfg->'habilitaciones'->'docente'->>'recepcion' = 'false' and cfg->'habilitaciones'->'egresado'->>'clase' = 'true' and cfg->'habilitaciones'->'padrino'->>'recepcion' = 'true');
  execute 'reset role';
  -- Un organizador habilita la recepción para egresados y luego la retira
  insert into public.administradores(user_id, email) values ('33333333-3333-3333-3333-333333333333', 'matriz@ejemplo.org');
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
  update public.habilitaciones set habilitada = true where categoria = 'egresado' and actividad = 'recepcion';
  update public.habilitaciones set habilitada = false where categoria = 'docente' and actividad = 'caravana';
  execute 'reset role';
  execute 'set local role anon';
  r2 := public.guardar_confirmacion(null, 'egresado', null, 'Dr. Pablo Mora', '{"recepcion":"asistira"}');
  perform public._ok('egresado con recepción habilitada por el organizador', r2->'invitacion'->'respuestas'->>'recepcion' = 'asistira');
  r2 := public.guardar_confirmacion(null, 'docente', null, 'Dra. Ana Soto', '{"caravana":"asistira","clase":"asistira"}');
  perform public._ok('actividad deshabilitada por categoría: se ignora', not (r2->'invitacion'->'respuestas') ? 'caravana' and r2->'invitacion'->'respuestas'->>'clase' = 'asistira');
  begin perform public.guardar_confirmacion(null, 'docente', null, 'Persona Rara', '{"clase":"quizas"}'); perform public._ok('docente: estado inválido rechazado', false);
  exception when others then perform public._ok('docente: estado inválido rechazado', sqlerrm = 'estado_invalido'); end;
  execute 'reset role';
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
  v_id := public.admin_crear_invitado('Dra. Rosa Lugo', 'docente');
  perform public._ok('admin crea invitados docente/egresado', exists(select 1 from public.invitados where id = v_id and categoria = 'docente'));
  execute 'reset role';
  -- Restablecer las reglas para no alterar las pruebas siguientes
  update public.habilitaciones set habilitada = false where categoria = 'egresado' and actividad = 'recepcion';
  update public.habilitaciones set habilitada = true where categoria = 'docente' and actividad = 'caravana';
  delete from public.invitados where categoria in ('docente','egresado');
  delete from public.administradores where user_id = '33333333-3333-3333-3333-333333333333';
  delete from public.intentos;

  -- ===== Administrador =====
  insert into public.administradores(user_id, email) values ('11111111-1111-1111-1111-111111111111', 'admin@ejemplo.org');
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  perform public._ok('usuario autenticado NO admin no ve invitados', (select count(*) from public.invitados) = 0);
  begin perform public.admin_generar_enlace(gen_random_uuid()); perform public._ok('no-admin no genera enlaces', false);
  exception when others then perform public._ok('no-admin no genera enlaces', sqlerrm = 'no_autorizado', sqlerrm); end;

  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  perform public._ok('admin ve todos los invitados', (select count(*) from public.invitados) = 12, (select count(*) from public.invitados)::text);
  -- Enlace individual para un padrino oficial → respuestas verificadas
  select id into v_oficial from public.invitados where padrino_id = 'vina-daniel' and origen = 'oficial';
  tok_admin := public.admin_generar_enlace(v_oficial);
  -- Excepción individual: el Dr. Viña sin recepción
  update public.invitados set recepcion_override = false where id = v_oficial;
  -- Regla por categoría: habilitar recepción a R2
  update public.habilitaciones set habilitada = true where categoria = 'r2' and actividad = 'recepcion';
  execute 'reset role';

  execute 'set local role anon';
  r := public.guardar_confirmacion(tok_admin, null, null, null, '{"clase":"asistira","recepcion":"asistira"}');
  perform public._ok('enlace individual → verificado', (r->'invitacion'->>'verificado')::boolean);
  perform public._ok('excepción individual sin recepción', not (r->'invitacion'->'actividades') ? 'recepcion' and not (r->'invitacion'->'respuestas') ? 'recepcion');
  r := public.guardar_confirmacion(null, 'r2', null, 'Luis Ángel Núñez', '{"recepcion":"por_confirmar"}');
  perform public._ok('regla por categoría: R2 con recepción', r->'invitacion'->'respuestas'->>'recepcion' = 'por_confirmar');
  r2 := public.invitacion_config();
  perform public._ok('config pública refleja excepción de padrino', (r2->'recepcion_padrinos'->>'vina-daniel')::boolean = false and (r2->'recepcion'->>'r2')::boolean);
  execute 'reset role';

  -- Eliminación post-evento
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  begin perform public.admin_eliminar_registros('si'); perform public._ok('borrado exige confirmación', false);
  exception when others then perform public._ok('borrado exige confirmación', sqlerrm = 'confirmacion_requerida'); end;
  execute 'reset role';
end $$;

select n, case when ok then '✔' else '✘' end as r, prueba, detalle from public._resultado order by n;
select count(*) filter (where ok) || '/' || count(*) || ' pruebas SQL superadas' as resumen from public._resultado;
