#!/usr/bin/env python3
"""Genera supabase/semilla.sql desde la fuente única datos/evento.json.
Ejecutar después de esquema.sql (Supabase → SQL Editor). Es idempotente: puede repetirse."""
import json
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
E = json.loads((RAIZ / "datos" / "evento.json").read_text(encoding="utf-8"))
q = lambda s: "'" + str(s).replace("'", "''") + "'"

L = ["-- GENERADO desde datos/evento.json por herramientas/generar_semilla_sql.py. No editar a mano.", "begin;"]
for a in E["actividades"]:
    L.append(f"insert into public.actividades(codigo, orden, titulo, hora_texto, inicio, lugar) values ({q(a['codigo'])}, {a['orden']}, {q(a['titulo'])}, {q(a['hora_texto'])}, {q(a['inicio'])}, {q(a['lugar'])})\n  on conflict (codigo) do update set orden = excluded.orden, titulo = excluded.titulo, hora_texto = excluded.hora_texto, inicio = excluded.inicio, lugar = excluded.lugar;")
codigos = ", ".join(q(a["codigo"]) for a in E["actividades"])
L.append(f"delete from public.actividades where codigo not in ({codigos});")
CATS = ("padrino", "docente", "egresado", "r1", "r2", "otro")   # los graduandos no son invitados (no se registran)
for c in CATS:
    d = E["categorias"][c]
    L.append(f"insert into public.categorias(codigo, etiqueta) values ({q(c)}, {q(d['etiqueta'])})\n  on conflict (codigo) do update set etiqueta = excluded.etiqueta;")
# Valores iniciales de habilitación: solo se crean si no existen (los cambios de los organizadores se conservan)
for c in CATS:
    for a in E["actividades"]:
        v = str(E["habilitacion_por_defecto"][c][a["codigo"]]).lower()
        L.append(f"insert into public.habilitaciones(categoria, actividad, habilitada) values ({q(c)}, {q(a['codigo'])}, {v}) on conflict (categoria, actividad) do nothing;")
for p in E["padrinos"]:
    L.append(f"insert into public.padrinos(id, nombre, apellido) values ({q(p['id'])}, {q(p['nombre'])}, {q(p['apellido'])})\n  on conflict (id) do update set nombre = excluded.nombre, apellido = excluded.apellido;")
L.append("select public.admin_sincronizar_padrinos();")
L.append("-- Renombrado seguro: el nombre oficial se propaga a todos los registros vinculados (mismo id, mismas respuestas, sin duplicados).\nupdate public.invitados i set nombre = p.nombre from public.padrinos p where i.padrino_id = p.id and i.nombre <> p.nombre;")
L.append("commit;")
(RAIZ / "supabase" / "semilla.sql").write_text("\n".join(L) + "\n", encoding="utf-8")
print("supabase/semilla.sql generado:", len(E["actividades"]), "actividades,", len(E["padrinos"]), "padrinos")
