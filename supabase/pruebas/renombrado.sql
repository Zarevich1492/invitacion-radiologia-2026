-- Renombrado seguro de un padrino (Berrio → Berrios): mismo id, respuestas conservadas, sin duplicados.
\set ON_ERROR_STOP on
create temp table _r(prueba text, ok boolean, detalle text);
-- 1) Estado «anterior»: nombre antiguo y una respuesta registrada
update public.padrinos set nombre = 'Dra. Omaira Berrio', apellido = 'Berrio' where id = 'berrio-omaira';
update public.invitados set nombre = 'Dra. Omaira Berrio' where padrino_id = 'berrio-omaira';
insert into public.confirmaciones(invitado_id, actividad, estado) select id, 'clase', 'asistira' from public.invitados where padrino_id = 'berrio-omaira' and origen = 'oficial';
create temp table _antes as select id, (select count(*) from public.invitados where padrino_id = 'berrio-omaira') n, (select count(*) from public.padrinos) np from public.invitados where padrino_id = 'berrio-omaira' and origen = 'oficial';
-- 2) Se vuelve a ejecutar la semilla con el nombre correcto
\i supabase/semilla.sql
insert into _r select 'mismo identificador de registro', (select id from _antes) = (select id from public.invitados where padrino_id = 'berrio-omaira' and origen = 'oficial'), '';
insert into _r select 'sin duplicados (padrinos e invitados)', (select np from _antes) = (select count(*) from public.padrinos) and (select n from _antes) = (select count(*) from public.invitados where padrino_id = 'berrio-omaira'), '';
insert into _r select 'nombre actualizado en padrinos e invitados', (select nombre from public.padrinos where id = 'berrio-omaira') = 'Dra. Omaira Berrios' and not exists (select 1 from public.invitados where padrino_id = 'berrio-omaira' and nombre <> 'Dra. Omaira Berrios'), '';
insert into _r select 'respuesta conservada', exists (select 1 from public.confirmaciones c join public.invitados i on i.id = c.invitado_id where i.padrino_id = 'berrio-omaira' and c.actividad = 'clase' and c.estado = 'asistira'), '';
delete from public.confirmaciones where invitado_id = (select id from _antes);
select case when ok then '✔' else '✘' end r, prueba from _r;
select count(*) filter (where ok) || '/' || count(*) || ' pruebas de renombrado superadas' resumen from _r;
