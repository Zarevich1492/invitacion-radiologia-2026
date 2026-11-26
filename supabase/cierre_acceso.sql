-- CIERRE (ejecutar DESPUÉS de publicar el nuevo front-end con código de acceso). Idempotente.
-- Cierra las rutas antiguas sin código: el registro anónimo directo y la lectura pública del listado de padrinos.
revoke execute on function public.guardar_confirmacion(text,text,text,text,jsonb,text,text) from anon, authenticated;
revoke select on public.padrinos from anon;
create or replace function public.invitacion_config() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'actividades', coalesce((select jsonb_agg(jsonb_build_object('codigo', codigo, 'titulo', titulo, 'hora_texto', hora_texto, 'inicio', inicio, 'lugar', lugar) order by orden) from public.actividades), '[]'),
    'habilitaciones', coalesce((select jsonb_object_agg(categoria, reglas) from (select categoria, jsonb_object_agg(actividad, habilitada) reglas from public.habilitaciones group by categoria) x), '{}'),
    'recepcion', coalesce((select jsonb_object_agg(categoria, habilitada) from public.habilitaciones where actividad = 'recepcion'), '{}'),
    'recepcion_padrinos', coalesce((select jsonb_object_agg(padrino_id, recepcion_override) from public.invitados where origen = 'oficial' and recepcion_override is not null), '{}')
  );
$$;
notify pgrst, 'reload schema';
