-- Endurecimiento para una base YA instalada (idempotente). Pegar en Supabase → SQL Editor → Run.
-- Quita al rol público (anon) los permisos de escritura sobre los catálogos; RLS ya los bloquea, esto es una segunda barrera.
revoke insert, update, delete, truncate, references, trigger on public.actividades, public.padrinos, public.categorias from anon;
revoke all on public.invitados, public.confirmaciones, public.intentos, public.administradores, public.habilitaciones from anon;
notify pgrst, 'reload schema';
