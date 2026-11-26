-- GENERADO desde datos/evento.json por herramientas/generar_semilla_sql.py. No editar a mano.
begin;
insert into public.actividades(codigo, orden, titulo, hora_texto, inicio, lugar) values ('clase', 1, 'Clase magistral', '8:30 a. m.', '2026-11-28T08:30:00-04:00', 'Auditorio A, Facultad de Medicina, Universidad de Los Andes')
  on conflict (codigo) do update set orden = excluded.orden, titulo = excluded.titulo, hora_texto = excluded.hora_texto, inicio = excluded.inicio, lugar = excluded.lugar;
insert into public.actividades(codigo, orden, titulo, hora_texto, inicio, lugar) values ('caravana', 2, 'Caravana de graduandos', '2:00 p. m.', '2026-11-28T14:00:00-04:00', 'Estacionamiento del Hospital Universitario de Los Andes')
  on conflict (codigo) do update set orden = excluded.orden, titulo = excluded.titulo, hora_texto = excluded.hora_texto, inicio = excluded.inicio, lugar = excluded.lugar;
insert into public.actividades(codigo, orden, titulo, hora_texto, inicio, lugar) values ('recepcion', 3, 'Recepción de los nuevos especialistas', '9:00 p. m.', '2026-11-28T21:00:00-04:00', 'Centro de Convenciones Mucumbarila')
  on conflict (codigo) do update set orden = excluded.orden, titulo = excluded.titulo, hora_texto = excluded.hora_texto, inicio = excluded.inicio, lugar = excluded.lugar;
delete from public.actividades where codigo not in ('clase', 'caravana', 'recepcion');
insert into public.categorias(codigo, etiqueta) values ('padrino', 'Padrino o madrina de promoción')
  on conflict (codigo) do update set etiqueta = excluded.etiqueta;
insert into public.categorias(codigo, etiqueta) values ('docente', 'Familia radiológica')
  on conflict (codigo) do update set etiqueta = excluded.etiqueta;
insert into public.categorias(codigo, etiqueta) values ('egresado', 'Familia radiológica')
  on conflict (codigo) do update set etiqueta = excluded.etiqueta;
insert into public.categorias(codigo, etiqueta) values ('r1', 'Residente de primer año (R1)')
  on conflict (codigo) do update set etiqueta = excluded.etiqueta;
insert into public.categorias(codigo, etiqueta) values ('r2', 'Residente de segundo año (R2)')
  on conflict (codigo) do update set etiqueta = excluded.etiqueta;
insert into public.categorias(codigo, etiqueta) values ('otro', 'Invitado especial')
  on conflict (codigo) do update set etiqueta = excluded.etiqueta;
insert into public.habilitaciones(categoria, actividad, habilitada) values ('padrino', 'clase', true) on conflict (categoria, actividad) do nothing;
insert into public.habilitaciones(categoria, actividad, habilitada) values ('padrino', 'caravana', true) on conflict (categoria, actividad) do nothing;
insert into public.habilitaciones(categoria, actividad, habilitada) values ('padrino', 'recepcion', true) on conflict (categoria, actividad) do nothing;
insert into public.habilitaciones(categoria, actividad, habilitada) values ('docente', 'clase', true) on conflict (categoria, actividad) do nothing;
insert into public.habilitaciones(categoria, actividad, habilitada) values ('docente', 'caravana', true) on conflict (categoria, actividad) do nothing;
insert into public.habilitaciones(categoria, actividad, habilitada) values ('docente', 'recepcion', false) on conflict (categoria, actividad) do nothing;
insert into public.habilitaciones(categoria, actividad, habilitada) values ('egresado', 'clase', true) on conflict (categoria, actividad) do nothing;
insert into public.habilitaciones(categoria, actividad, habilitada) values ('egresado', 'caravana', true) on conflict (categoria, actividad) do nothing;
insert into public.habilitaciones(categoria, actividad, habilitada) values ('egresado', 'recepcion', false) on conflict (categoria, actividad) do nothing;
insert into public.habilitaciones(categoria, actividad, habilitada) values ('r1', 'clase', true) on conflict (categoria, actividad) do nothing;
insert into public.habilitaciones(categoria, actividad, habilitada) values ('r1', 'caravana', true) on conflict (categoria, actividad) do nothing;
insert into public.habilitaciones(categoria, actividad, habilitada) values ('r1', 'recepcion', false) on conflict (categoria, actividad) do nothing;
insert into public.habilitaciones(categoria, actividad, habilitada) values ('r2', 'clase', true) on conflict (categoria, actividad) do nothing;
insert into public.habilitaciones(categoria, actividad, habilitada) values ('r2', 'caravana', true) on conflict (categoria, actividad) do nothing;
insert into public.habilitaciones(categoria, actividad, habilitada) values ('r2', 'recepcion', false) on conflict (categoria, actividad) do nothing;
insert into public.habilitaciones(categoria, actividad, habilitada) values ('otro', 'clase', true) on conflict (categoria, actividad) do nothing;
insert into public.habilitaciones(categoria, actividad, habilitada) values ('otro', 'caravana', true) on conflict (categoria, actividad) do nothing;
insert into public.habilitaciones(categoria, actividad, habilitada) values ('otro', 'recepcion', false) on conflict (categoria, actividad) do nothing;
insert into public.padrinos(id, nombre, apellido) values ('berrio-omaira', 'Dra. Omaira Berrios', 'Berrios')
  on conflict (id) do update set nombre = excluded.nombre, apellido = excluded.apellido;
insert into public.padrinos(id, nombre, apellido) values ('falcon-analy', 'Dra. Analy Falcón', 'Falcón')
  on conflict (id) do update set nombre = excluded.nombre, apellido = excluded.apellido;
insert into public.padrinos(id, nombre, apellido) values ('gutierrez-maria-del-carmen', 'Dra. María del Carmen Gutiérrez', 'Gutiérrez')
  on conflict (id) do update set nombre = excluded.nombre, apellido = excluded.apellido;
insert into public.padrinos(id, nombre, apellido) values ('moreno-franklin', 'Dr. Franklin Moreno', 'Moreno')
  on conflict (id) do update set nombre = excluded.nombre, apellido = excluded.apellido;
insert into public.padrinos(id, nombre, apellido) values ('rojas-gustavo', 'Dr. Gustavo Rojas', 'Rojas')
  on conflict (id) do update set nombre = excluded.nombre, apellido = excluded.apellido;
insert into public.padrinos(id, nombre, apellido) values ('sosa-angel', 'Dr. Ángel Sosa', 'Sosa')
  on conflict (id) do update set nombre = excluded.nombre, apellido = excluded.apellido;
insert into public.padrinos(id, nombre, apellido) values ('sosa-jenny', 'Dra. Jenny Sosa', 'Sosa')
  on conflict (id) do update set nombre = excluded.nombre, apellido = excluded.apellido;
insert into public.padrinos(id, nombre, apellido) values ('torres-jose-daniel', 'Dr. José Daniel Torres', 'Torres')
  on conflict (id) do update set nombre = excluded.nombre, apellido = excluded.apellido;
insert into public.padrinos(id, nombre, apellido) values ('uzcategui-reyna', 'Dra. Reyna Uzcátegui', 'Uzcátegui')
  on conflict (id) do update set nombre = excluded.nombre, apellido = excluded.apellido;
insert into public.padrinos(id, nombre, apellido) values ('vina-daniel', 'Dr. Daniel Viña', 'Viña')
  on conflict (id) do update set nombre = excluded.nombre, apellido = excluded.apellido;
insert into public.graduandos(id, nombre, apellido) values ('arrieta-jorge', 'Dr. Jorge Arrieta', 'Arrieta')
  on conflict (id) do update set nombre = excluded.nombre, apellido = excluded.apellido;
insert into public.graduandos(id, nombre, apellido) values ('paez-nelson', 'Dr. Nelson Páez', 'Páez')
  on conflict (id) do update set nombre = excluded.nombre, apellido = excluded.apellido;
insert into public.graduandos(id, nombre, apellido) values ('guillen-diego', 'Dr. Diego Guillén', 'Guillén')
  on conflict (id) do update set nombre = excluded.nombre, apellido = excluded.apellido;
insert into public.graduandos(id, nombre, apellido) values ('sanchez-jose', 'Dr. José Sánchez', 'Sánchez')
  on conflict (id) do update set nombre = excluded.nombre, apellido = excluded.apellido;
insert into public.graduandos(id, nombre, apellido) values ('montes-andrea', 'Dra. Andrea Montes', 'Montes')
  on conflict (id) do update set nombre = excluded.nombre, apellido = excluded.apellido;
insert into public.graduandos(id, nombre, apellido) values ('mendez-francia', 'Dra. Francia Méndez', 'Méndez')
  on conflict (id) do update set nombre = excluded.nombre, apellido = excluded.apellido;
insert into public.graduandos(id, nombre, apellido) values ('hernandez-oriana', 'Dra. Oriana Hernández', 'Hernández')
  on conflict (id) do update set nombre = excluded.nombre, apellido = excluded.apellido;
select public._sincronizar_padrinos();
-- Renombrado seguro: el nombre oficial se propaga a todos los registros vinculados (mismo id, mismas respuestas, sin duplicados).
update public.invitados i set nombre = p.nombre from public.padrinos p where i.padrino_id = p.id and i.nombre <> p.nombre;
commit;
