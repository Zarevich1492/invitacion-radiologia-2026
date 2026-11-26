# Acceso por código de categoría (v2.9)

## Qué protege y qué no
- Los códigos se guardan **solo como hash bcrypt** en Supabase (tabla `codigos_acceso`, sin lectura pública). Nunca están en el repositorio.
- El servidor valida el código, abre una **sesión de 12 h**, limita a **8 intentos fallidos por 10 min por IP** y permite **revocar** sesiones.
- Los permisos se separan por categoría en el servidor (`guardar_con_sesion`): un código de docentes no permite registrar padrinos; «Especialistas» no confirma asistencia; «Otros» no confirma sin autorización.
- Un código colectivo **no verifica la identidad individual**: cualquiera que lo conozca puede elegir un nombre del listado.
- **Limitación conocida:** el repositorio es público, de modo que los nombres de `datos/evento.json` y los archivos de `assets/listones/` siguen siendo públicos hasta migrarlos a almacenamiento privado (fase pendiente, ver CHANGELOG).

## Pasos de migración (una sola vez, en este orden)
1. Supabase → SQL Editor → pegar y ejecutar **`supabase/acceso.sql`** (idempotente).
2. Ejecutar **`supabase/semilla.sql`** (carga los 7 graduandos; idempotente).
3. Definir los códigos (cámbielos por los suyos; mínimo 8 caracteres):
   ```sql
   select public.admin_definir_codigo('padrinos',      'SU_CODIGO_PADRINOS');
   select public.admin_definir_codigo('docentes',      'SU_CODIGO_DOCENTES');
   select public.admin_definir_codigo('residentes',    'SU_CODIGO_RESIDENTES');
   select public.admin_definir_codigo('especialistas', 'SU_CODIGO_ESPECIALISTAS');
   ```
   Cambiar un código cierra las sesiones abiertas de ese grupo.
4. Publicar el nuevo front-end (rama `acceso-por-codigo` → `main`).
5. **Después** de publicar y comprobar el acceso: ejecutar **`supabase/cierre_acceso.sql`** (cierra el registro anónimo directo y la lectura pública del listado de padrinos).

## Operación
- Estado: `select public.admin_estado_acceso();`
- Revocar sesiones de un grupo o todas: `select public.admin_revocar_sesiones('padrinos');` / `select public.admin_revocar_sesiones();`
