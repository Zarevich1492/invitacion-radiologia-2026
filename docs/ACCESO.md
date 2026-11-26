# Acceso por contraseña de categoría y migración (v2.12)

## Qué protege y qué no
- Los códigos se guardan **solo como hash bcrypt** en Supabase; nunca están en el repositorio. Sesiones de 12 h, 8 intentos fallidos por IP cada 10 min, revocación por categoría.
- El servidor separa permisos por categoría (`guardar_con_sesion`): padrinos, docentes y egresados, residentes y especialistas (estos últimos no confirman asistencia). «Otros invitados», Dedicatorias y Aportes son de acceso libre. «Otros» no confirma sin autorización.
- Un código colectivo **no verifica identidad individual**.
- **Pendiente (bloqueo externo):** los archivos de `assets/listones/` y los nombres de `datos/evento.json` siguen siendo públicos en el repositorio hasta migrarlos a almacenamiento privado (requiere desplegar una función en Supabase). Ver CHANGELOG.

## Migración (una sola vez; no borra datos; idempotente)
1. Supabase → **SQL Editor** → pegar y ejecutar **`supabase/instalar.sql`** completo. (Probado sobre la versión publicada: 0 errores, 0 registros perdidos, dos ejecuciones.)
2. Definir las cuatro contraseñas desde el SQL Editor (o luego desde el panel → «Seguridad y accesos»), sustituyendo por las vigentes:
   ```sql
   select public.admin_definir_codigo('padrinos',      '…');
   select public.admin_definir_codigo('docentes',      '…');
   select public.admin_definir_codigo('residentes',    '…');
   select public.admin_definir_codigo('especialistas', '…');
   ```
3. Publicar el front-end (merge a `main`) y comprobar el ingreso por cada categoría.
4. **Después** de publicar, ejecutar **`supabase/cierre_acceso.sql`** (cierra el registro anónimo directo y la lectura pública del listado de padrinos).

## Operación
Panel → «Seguridad y accesos»: cambiar contraseñas y revocar sesiones. Panel → «Aportes voluntarios»: cargar los datos de Pago Móvil y activar la sección.
