-- Pruebas de dedicatorias y aportes (sin CAPTCHA: validación, frecuencia, duplicados, saneamiento y moderación en el servidor).
\set ON_ERROR_STOP on
delete from public._resultado;
do $$
declare r jsonb; v_err text; id1 uuid; n int; lista jsonb; ad jsonb; cfg jsonb;
begin
  execute 'set local role anon';
  perform set_config('request.headers', '{"x-forwarded-for":"9.9.9.9"}', true);
  cfg := public.dedicatorias_config();
  perform public._ok('lista de 7 especialistas para dedicar', jsonb_array_length(cfg->'especialistas') = 7);
  begin perform count(*) from public.dedicatorias; perform public._ok('anon NO lee dedicatorias', false);
  exception when insufficient_privilege then perform public._ok('anon NO lee dedicatorias', true); end;
  begin perform public.admin_dedicatorias(); perform public._ok('anon NO ve teléfonos (admin)', false);
  exception when insufficient_privilege then perform public._ok('anon NO ve teléfonos (admin)', true); end;
  begin perform public.admin_dedicatoria_eliminar(gen_random_uuid()); perform public._ok('anon NO elimina dedicatorias', false);
  exception when insufficient_privilege then perform public._ok('anon NO elimina dedicatorias', true); end;
  execute 'reset role';

  execute 'set local role anon';
  perform set_config('request.headers', '{"x-forwarded-for":"9.9.9.9"}', true);
  begin perform public.dedicatoria_enviar('promocion','Felicitaciones','Ana Pérez','+584121234567','{corazon}','http://spam'); perform public._ok('campo trampa rechaza', false);
  exception when others then perform public._ok('campo trampa rechaza', sqlerrm = 'solicitud_rechazada'); end;
  begin perform public.dedicatoria_enviar('promocion','Felicitaciones','Ana Pérez','12345','{corazon}'); perform public._ok('teléfono sin prefijo internacional se rechaza', false);
  exception when others then perform public._ok('teléfono sin prefijo internacional se rechaza', sqlerrm = 'telefono_invalido'); end;
  begin perform public.dedicatoria_enviar('promocion','Felicitaciones','Ana Pérez','+584121234567','{corazon,birrete,confeti}'); perform public._ok('más de dos stickers se rechaza', false);
  exception when others then perform public._ok('más de dos stickers se rechaza', sqlerrm = 'stickers_invalidos'); end;
  begin perform public.dedicatoria_enviar('promocion','Felicitaciones','Ana Pérez','+584121234567','{💖}'); perform public._ok('emoji/sticker fuera de los seis se rechaza', false);
  exception when others then perform public._ok('emoji/sticker fuera de los seis se rechaza', sqlerrm = 'stickers_invalidos'); end;
  begin perform public.dedicatoria_enviar('nadie','Felicitaciones','Ana Pérez','+584121234567','{}'); perform public._ok('destinatario inexistente se rechaza', false);
  exception when others then perform public._ok('destinatario inexistente se rechaza', sqlerrm = 'destinatario_invalido'); end;
  begin perform public.dedicatoria_enviar('promocion',repeat('a',501),'Ana Pérez','+584121234567','{}'); perform public._ok('mensaje recortado a 500 (no falla)', true);
  exception when others then perform public._ok('mensaje recortado a 500 (no falla)', false, sqlerrm); end;

  r := public.dedicatoria_enviar('promocion','<script>alert(1)</script> Felicitaciones, colegas','Ana <b>Pérez</b>','+58 (412) 123-4567','{corazon,birrete}');
  perform public._ok('envío válido', (r->>'ok')::boolean);
  r := public.dedicatoria_enviar('arrieta-jorge','Dr. Arrieta, gran logro','Luis Ruiz','00 34 612 345 678','{}');
  perform public._ok('envío a un especialista (prefijo 00 normalizado)', (r->>'ok')::boolean);
  begin perform public.dedicatoria_enviar('arrieta-jorge','Dr. Arrieta, gran logro','Luis Ruiz','+34612345678','{}'); perform public._ok('duplicado se rechaza', false);
  exception when others then perform public._ok('duplicado se rechaza', sqlerrm = 'duplicado'); end;
  lista := public.dedicatorias_publicas();
  perform public._ok('pendientes NO aparecen en el libro público', jsonb_array_length(lista) = 0);
  execute 'reset role';

  perform public._ok('el mensaje se sanea (sin < >)', not exists(select 1 from public.dedicatorias where mensaje ~ '[<>]' or autor ~ '[<>]'));
  perform public._ok('teléfono normalizado a +58412…', exists(select 1 from public.dedicatorias where telefono = '+584121234567'));

  -- Moderación (admin)
  insert into public.administradores(user_id, email) values ('11111111-1111-1111-1111-111111111111','a@b.c') on conflict do nothing;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  ad := public.admin_dedicatorias();
  perform public._ok('admin ve teléfonos y estado «pendiente»', jsonb_array_length(ad) >= 2 and ad->0->>'telefono' like '+%' and ad->0->>'estado' = 'pendiente');
  id1 := (select (x->>'id')::uuid from jsonb_array_elements(ad) x where x->>'autor' like 'Ana%' and x->>'mensaje' like '%Felicitaciones, colegas' limit 1);
  perform public.admin_dedicatoria_estado(id1, 'aprobado');
  execute 'reset role'; execute 'set local role anon';
  lista := public.dedicatorias_publicas();
  perform public._ok('aprobada aparece; sin teléfono, IP ni token', jsonb_array_length(lista) = 1 and not (lista->0 ? 'telefono') and not (lista->0 ? 'ip') and lista->0->>'para' = 'Toda la XXIV Promoción');
  perform public._ok('el libro público solo expone autor, para, mensaje, stickers y fecha', (select array_agg(k order by k) from jsonb_object_keys(lista->0) k) = array['autor','fecha','mensaje','para','stickers']);
  execute 'reset role'; execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  perform public.admin_dedicatoria_estado(id1, 'oculto');
  execute 'reset role'; execute 'set local role anon';
  perform public._ok('al ocultarla deja de ser pública', jsonb_array_length(public.dedicatorias_publicas()) = 0);
  execute 'reset role';

  -- Frecuencia: por IP (5/h)
  execute 'set local role anon';
  perform set_config('request.headers', '{"x-forwarded-for":"7.7.7.7"}', true);
  for i in 1..5 loop perform public.dedicatoria_enviar('promocion','Mensaje número ' || i,'Autor ' || i,'+5841200000' || lpad(i::text,2,'0'),'{}'); end loop;
  begin perform public.dedicatoria_enviar('promocion','Mensaje seis','Autor seis','+584129999999','{}'); perform public._ok('límite de 5 por hora y por IP', false);
  exception when others then perform public._ok('límite de 5 por hora y por IP', sqlerrm = 'demasiadas_solicitudes'); end;
  execute 'reset role';

  -- Aportes
  execute 'set local role anon';
  perform public._ok('aportes inactivos por defecto: sin datos', public.aportes_publicos() = '{"activo": false}'::jsonb);
  begin perform public.init_definir_aportes('{"activo":true}'); perform public._ok('anon NO configura aportes', false);
  exception when insufficient_privilege then perform public._ok('anon NO configura aportes', true); end;
  execute 'reset role';
  perform public.init_definir_aportes('{"activo":true,"banco":"Banco de prueba","codigo":"0000","titular":"Titular Prueba","cedula":"1","telefono":"04120000000","intro":"i","gracias":"g"}');
  execute 'set local role anon';
  perform public._ok('aportes activos exponen solo los datos configurados', public.aportes_publicos()->>'banco' = 'Banco de prueba' and (public.aportes_publicos()->>'activo')::boolean);
  execute 'reset role';
  begin perform public.init_definir_aportes('{"hack":1}'); perform public._ok('campos no previstos se rechazan', false);
  exception when others then perform public._ok('campos no previstos se rechazan', sqlerrm = 'campo_invalido'); end;
end $$;
select n, case when ok then '✔' else '✘' end as r, prueba, detalle from public._resultado order by n;
select count(*) filter (where ok) || '/' || count(*) || ' pruebas de dedicatorias y aportes superadas' as resumen from public._resultado;
