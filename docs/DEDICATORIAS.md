# Dedicatorias y aportes voluntarios (v2.10)

Ambas secciones son públicas (sin código). Las dedicatorias exigen verificación **Cloudflare Turnstile** (gratuita, modo Managed); sin ella el formulario permanece cerrado y el servidor rechaza cualquier envío.

## Configuración manual indispensable (una sola vez)
1. **Supabase → Database → Extensions:** activar **`http`** (la base consulta a Cloudflare con ella). Sin esa extensión el servidor rechaza todos los envíos (nunca los acepta sin validar).
2. **Supabase → SQL Editor:** ejecutar `supabase/dedicatorias.sql` (idempotente; depende de `acceso.sql`).
3. **Cloudflare → Turnstile → Add widget** (plan gratuito): dominio `zarevich1492.github.io`, modo **Managed**. Copiar la *Site key* y la *Secret key*.
4. **Panel de organizadores → «Aportes voluntarios y verificación antispam»:** pegar ambas claves y pulsar *Guardar Turnstile*. La clave secreta queda solo en el servidor (tabla sin acceso público) y nunca vuelve al navegador.
5. En el mismo apartado, cargar los datos de Pago Móvil **con autorización de la titular** y marcar «Mostrar la sección». Esos datos no están en el repositorio ni en GitHub.

## Moderación
Panel → «Dedicatorias»: aprobar, rechazar u ocultar; filtrar por estado, destinatario y fecha; ver teléfono (solo allí); detectar posibles duplicados; exportar las aprobadas (CSV protegido contra inyección de fórmulas).

## Qué no se afirma
El teléfono y la identidad del autor **no se verifican**; Turnstile solo distingue personas de automatizaciones. Los números son privados pero se guardan en la base de datos (Supabase).
