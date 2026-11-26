-- SEGURIDAD DE AUTORIZACIÓN ADMINISTRATIVA: un usuario autenticado SIN permisos de administrador (o con JWT sin sub, o anon)
-- no puede ejecutar ninguna función administrativa ni las de inicialización. Se prueba a nivel de función y de efecto.
\set ON_ERROR_STOP on
delete from public._resultado;
insert into public.administradores(user_id, email) values ('11111111-1111-1111-1111-111111111111','admin@prueba.local') on conflict do nothing;
do $$
declare
  fns text[][] := array[
    ['admin_definir_codigo', $q$'padrinos','hackeado-123'$q$],
    ['admin_revocar_sesiones', $q$'padrinos'$q$],
    ['admin_estado_acceso', ''],
    ['admin_definir_aportes', $q$'{"activo":true,"banco":"X"}'::jsonb$q$],
    ['admin_ajustes', ''],
    ['admin_dedicatorias', ''],
    ['admin_dedicatoria_estado', $q$gen_random_uuid(),'aprobado'$q$],
    ['admin_dedicatoria_eliminar', $q$gen_random_uuid()$q$],
    ['admin_generar_enlaces', $q$array[gen_random_uuid()]$q$],
    ['admin_enlaces', ''],
    ['admin_revocar_enlaces', $q$array[gen_random_uuid()]$q$],
    ['admin_marcar_enviado', $q$array[gen_random_uuid()],true$q$],
    ['admin_autorizar', $q$array[gen_random_uuid()],array['clase'],'fijar'$q$],
    ['admin_verificar_codigo', $q$'padrinos','padrinos2026'$q$],
    ['admin_bitacora', ''],
    ['admin_solicitudes', ''],
    ['admin_solicitud_resolver', $q$gen_random_uuid(),true$q$],
    ['admin_sincronizar_padrinos', ''],
    ['admin_crear_invitado', $q$'Intruso','otro'$q$],
    ['admin_generar_enlace', $q$gen_random_uuid()$q$],
    ['admin_eliminar_registros', $q$'ELIMINAR TODO'$q$],
    ['init_definir_codigo', $q$'padrinos','hackeado-123'$q$],
    ['init_definir_aportes', $q$'{"activo":true}'::jsonb$q$],
    ['_sincronizar_padrinos', ''],
    ['_definir_codigo', $q$'padrinos','hackeado-123'$q$],
    ['_es_gestor', '']
  ];
  perfiles text[][] := array[['authenticated','22222222-2222-2222-2222-222222222222','autenticado SIN permisos'], ['authenticated','','autenticado sin sub'], ['anon','','anónimo']];
  i int; j int; denegado boolean; hash0 text; n_ses0 int; ap0 jsonb; n_ded0 int; n_inv0 int; n_enl0 int;
begin
  select hash into hash0 from public.codigos_acceso where grupo = 'padrinos';
  select count(*) into n_ses0 from public.sesiones_acceso where not revocada;
  ap0 := coalesce((select valor from public.ajustes where clave = 'aportes'), '{}');
  select count(*) into n_ded0 from public.dedicatorias; select count(*) into n_inv0 from public.invitados; select count(*) into n_enl0 from public.enlaces;
  for j in 1..array_length(perfiles, 1) loop
    for i in 1..array_length(fns, 1) loop
      denegado := false;
      begin
        perform set_config('role', perfiles[j][1], true);
        perform set_config('request.jwt.claim.sub', perfiles[j][2], true);
        execute format('select public.%I(%s)', fns[i][1], fns[i][2]);
      exception when insufficient_privilege then denegado := true;
                when others then denegado := (sqlerrm in ('no_autorizado','solo_inicializacion'));
      end;
      perform set_config('role', 'postgres', true);
      perform public._ok(perfiles[j][3] || ': NO ejecuta ' || fns[i][1], denegado);
    end loop;
  end loop;
  -- Efecto: nada cambió
  perform public._ok('el código de padrinos no cambió', (select hash from public.codigos_acceso where grupo = 'padrinos') = hash0);
  perform public._ok('no se revocaron sesiones', (select count(*) from public.sesiones_acceso where not revocada) = n_ses0);
  perform public._ok('los aportes no cambiaron', coalesce((select valor from public.ajustes where clave = 'aportes'), '{}') = ap0);
  perform public._ok('no se crearon invitados, dedicatorias ni enlaces', (select count(*) from public.invitados) = n_inv0 and (select count(*) from public.dedicatorias) = n_ded0 and (select count(*) from public.enlaces) = n_enl0);
  -- Inicialización desde SQL Editor (propietario / conexión directa): sí funciona
  perform public._ok('el propietario inicializa un código vía init_definir_codigo', public.init_definir_codigo('padrinos', 'codigo-prueba-padrinos'));
  perform public._ok('el propietario sincroniza padrinos vía _sincronizar_padrinos', public._sincronizar_padrinos() >= 0);
  -- Un administrador real sí puede usar el RPC
  perform set_config('role', 'authenticated', true); perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  perform public._ok('el administrador SÍ ejecuta admin_definir_codigo por RPC', public.admin_definir_codigo('padrinos', 'codigo-prueba-padrinos'));
  perform public._ok('el administrador SÍ ve el estado de acceso', public.admin_estado_acceso() is not null);
  perform set_config('role', 'postgres', true);
end $$;
select n, case when ok then '✔' else '✘' end as r, prueba, detalle from public._resultado where not ok order by n;
select count(*) filter (where ok) || '/' || count(*) || ' comprobaciones de seguridad administrativa superadas' as resumen from public._resultado;
