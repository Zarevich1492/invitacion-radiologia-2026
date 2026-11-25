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
for c, d in E["categorias"].items():
    # La regla de recepción solo se fija al crear la categoría; después se administra desde el panel.
    L.append(f"insert into public.categorias(codigo, etiqueta, recepcion_habilitada) values ({q(c)}, {q(d['etiqueta'])}, {str(E['recepcion_por_defecto'][c]).lower()})\n  on conflict (codigo) do update set etiqueta = excluded.etiqueta;")
for p in E["padrinos"]:
    L.append(f"insert into public.padrinos(id, nombre, apellido) values ({q(p['id'])}, {q(p['nombre'])}, {q(p['apellido'])})\n  on conflict (id) do update set nombre = excluded.nombre, apellido = excluded.apellido;")
L.append("select public.admin_sincronizar_padrinos();")
L.append("commit;")
(RAIZ / "supabase" / "semilla.sql").write_text("\n".join(L) + "\n", encoding="utf-8")
print("supabase/semilla.sql generado:", len(E["actividades"]), "actividades,", len(E["padrinos"]), "padrinos")
