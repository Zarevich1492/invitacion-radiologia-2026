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
   select public.init_definir_codigo('padrinos',      '…');
   select public.init_definir_codigo('docentes',      '…');
   select public.init_definir_codigo('residentes',    '…');
   select public.init_definir_codigo('especialistas', '…');
   ```
3. Publicar el front-end (merge a `main`) y comprobar el ingreso por cada categoría.
4. **Después** de publicar, ejecutar **`supabase/cierre_acceso.sql`** (cierra el registro anónimo directo y la lectura pública del listado de padrinos).

## Autorización (corregida en v2.12.1)
- Las funciones `admin_*` (RPC del panel) exigen una cuenta de la tabla `administradores` (`auth.uid()`); ya no se usa `current_user`, que dentro de funciones SECURITY DEFINER equivale siempre al propietario y habría permitido el paso a cualquier usuario autenticado.
- La inicialización desde el SQL Editor usa funciones aparte (`init_definir_codigo`, `init_definir_aportes`, `_sincronizar_padrinos`) sin permisos para `anon` ni `authenticated`, con comprobación adicional de `session_user`.
- Verificado: 26 funciones × 3 perfiles (autenticado sin permisos, JWT sin `sub`, anónimo) sin efecto alguno; control negativo con la versión anterior falla 36 de 86 (`supabase/pruebas/seguridad_admin.sql`).

## Operación
Panel → «Seguridad y accesos»: cambiar contraseñas y revocar sesiones. Panel → «Aportes voluntarios»: cargar los datos de Pago Móvil y activar la sección.
