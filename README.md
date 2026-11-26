# Invitación virtual · XXIV Promoción de Radiólogos · ULA 2026

Invitación interactiva para padrinos y madrinas, residentes R1/R2 y otros invitados. Incluye:

- una tarjeta 3D con tres variantes;
- confirmación de asistencia por actividad;
- un pase digital;
- recordatorios de calendario;
- un panel privado para los organizadores.

**Tres momentos. Una misma celebración.** Sábado 28 de noviembre de 2026 · Mérida, Venezuela (America/Caracas, UTC−4).

| Hora | Actividad | Lugar |
|---|---|---|
| 8:30 a. m. | Clase magistral | Auditorio A, Facultad de Medicina, Universidad de Los Andes |
| 2:00 p. m. | Caravana de graduandos | Concentración en el estacionamiento del Hospital Universitario de Los Andes y recorrido por Mérida |
| 9:00 p. m. | Recepción de los nuevos especialistas | Centro de Convenciones Mucumbarila |

## Arquitectura

| Pieza | Servicio | Detalle |
|---|---|---|
| Sitio público y panel | GitHub Pages (gratuito) | HTML, CSS y JS estáticos, sin bibliotecas ni CDN externos. Tipografías alojadas en el propio sitio |
| Datos de confirmación | Supabase (plan gratuito) | PostgreSQL con RLS y funciones RPC. Autenticación de organizadores |
| Fuente única del evento | `datos/evento.json` | Horarios, lugares, textos, categorías y lista de padrinos |

### Fuente única de datos
Para cambiar un horario, un lugar o un texto:

1. Edite `datos/evento.json`.
2. Ejecute el script de construcción:

```bash
bash herramientas/construir.sh
```

El script regenera:

- las caras de las tarjetas con su programa;
- los PDF de cada variante;
- los archivos ICS;
- la semilla SQL.

La web, el pase y el enlace de Google Calendar leen el JSON directamente. Si cambió la semilla, vuelva a ejecutar `supabase/semilla.sql` en Supabase.

### Variantes
| Categoría | Variante | Tarjeta |
|---|---|---|
| Padrino o madrina (10 en el listado) | A | Portada y contraportada originales. El interior original lleva la columna de programa recompuesta con las tres actividades |
| Residente R1 / R2 | B | «Una vocación que nos une» / «Distintas etapas. Una misma vocación.» |
| Otro invitado | C | «Un momento para compartir» / «Cada etapa que termina abre un nuevo camino.» |

Cómo se compusieron las variantes:

- Se partió de los PNG originales. Solo se sustituyeron bloques de texto, situados sobre el fondo crema uniforme.
- Las ilustraciones y los logotipos son **idénticos píxel a píxel** a los originales; está verificado.
- Los originales intactos están en `originales/`.
- Cada variante existe en versión con recepción y sin recepción, según la elegibilidad de cada persona.

### Navegación
Tras identificarse, la invitación se organiza en cuatro apartados dentro de la misma página: **Invitación**, **Programa**, **Confirmar** y **Mi pase**.

- En computadoras (≥ 900 px) se navega con la barra superior; en teléfonos, con la barra inferior, que lleva icono y texto.
- Cada apartado tiene su dirección (`#invitacion`, `#programa`, `#confirmar`, `#pase`). Así, el botón Atrás funciona y se puede entrar directamente a cualquiera.
- Los enlaces individuales `#t=…` se procesan antes y no interfieren con la navegación.

## Puesta en marcha de Supabase
1. Cree un proyecto gratuito en <https://supabase.com> (ya existe: `cutihnjpffjlfkqngdry`).
2. En *SQL Editor → New query*, pegue **todo** `supabase/instalar.sql` (esquema + semilla, un solo archivo) y pulse **Run**. Es idempotente: se puede repetir.
3. Desactive el registro público: *Authentication → Sign In / Providers → Email* (o *Settings*) → **Allow new users to sign up: Off**. Sin esto, cualquiera puede crear una cuenta; no accede a datos (el acceso exige figurar en `administradores`), pero conviene cerrarlo.
4. Cree a los organizadores en *Authentication → Users → Add user* (correo y contraseña).
5. Autorícelos ejecutando en el SQL Editor:
   ```sql
   insert into public.administradores(user_id, email)
   select id, email from auth.users where email in ('organizador1@correo.com', 'organizador2@correo.com');
   ```
6. En *Project Settings → API Keys* copie la **Publishable key** (`sb_publishable_…`) y la *Project URL* en `js/config.js`. **Nunca** use la clave *secret* ni la `service_role`.
7. Verifique: `NODE_USE_ENV_PROXY=1 node herramientas/verificar_supabase.js` (solo lectura) y, si lo desea, con `--escribir` (crea 2 registros «PRUEBA AUTOMÁTICA» que se eliminan desde el panel).

## Instrucciones para los organizadores (panel)
Dirección: `https://zarevich1492.github.io/invitacion-radiologia-2026/admin/`. Se entra con correo y contraseña.

- **Indicadores:**
  - Padrinos que respondieron y pendientes.
  - R1, R2 y otros registrados.
  - Personas que asistirán a 3, 2 o 1 actividades.
  - Por actividad: habilitados, confirmados, no asistirán, por confirmar y sin responder.
  - **Total previsto = confirmados + 7 graduandos.** Es una previsión, no un registro de presencia.
- **Tabla:** búsqueda sin tildes; filtros por categoría, actividad y estado; corrección de estados, nombres y categorías.
- **Recepción:** se define por categoría en *Recepción: elegibilidad*. Las excepciones por persona se ajustan en la columna «Recepción».
  - Valores iniciales: **padrinos sí; R1, R2 y otros no**. Confírmelos antes de publicar.
  - Si la recepción no está habilitada para alguien, no se le pide confirmarla y no aparece en su pase ni en su calendario.
- **Enlaces individuales:** el botón «Enlace» de cada fila genera un enlace personal. Las respuestas que llegan por ese enlace quedan marcadas como **Verificado**. El enlace se muestra una sola vez.
- **Padrinos:** se pueden añadir o retirar del selector sin tocar el código.
- **Respuestas desde el enlace general:** se marcan como «Enlace general», no verificadas. Si un padrino recibe varias, aparece la marca «N envíos».
- **CSV:** compatible con Excel en español (separador `;`, UTF-8).
- **Después del evento:** exporte el CSV y luego use «Eliminar registros» (escriba `ELIMINAR TODO`).

## Seguridad y privacidad
- El público **no puede leer ni modificar** las tablas. Solo usa funciones RPC validadas.
  - Nombres de 2 a 80 caracteres.
  - Estados permitidos.
  - Campo trampa contra spam.
  - Límite de 15 registros nuevos cada 10 minutos por IP.
- Cada respuesta recibe un **token aleatorio de 256 bits**; en la base solo se guarda su hash SHA-256.
  - Con ese token, el mismo dispositivo o el enlace individual pueden modificar la respuesta sin duplicarla.
  - Elegir el nombre de un padrino **no** permite ver ni sobrescribir su registro oficial: crea una respuesta no verificada vinculada a él.
- Padrinos, familia radiológica, residentes y especialistas ingresan con una contraseña de su categoría (validada en el servidor; solo se guarda su hash). «Otros invitados», las dedicatorias y los aportes son de acceso libre. A los invitados se les pide nombre y, en dedicatorias y solicitudes, un teléfono privado; no hay publicidad ni seguimiento.
- Los nombres personalizados no aparecen en la URL ni en los metadatos de WhatsApp. El token de los enlaces individuales va en el fragmento `#t=`, que el navegador no envía al servidor, y se retira de la barra de direcciones al abrir.
- `noindex` evita la indexación, pero no es un control de acceso.
- **El listado de los 10 padrinos es público**, porque cualquiera que abra el selector lo ve.

## Publicación y reversión
- **Publicación:** GitHub Pages, desde la rama `main`, carpeta raíz. Dirección: `https://zarevich1492.github.io/invitacion-radiologia-2026/`.
- **Reversión:**
  - Volver a la versión anterior: `git revert <commit>` y `git push`.
  - Retirar la página: *Settings → Pages → Unpublish*, o archivar el repositorio.
  - La base de Supabase se puede pausar o eliminar desde su panel.
  - Este repositorio es independiente: no afecta a `tesis_nodulos_web` ni a `defensa-tesis-radiologia`.

## Pruebas
```bash
PGHOST=/tmp PGPORT=5499 bash herramientas/probar_todo.sh
```

El script ejecuta tres suites:

1. Pruebas SQL de seguridad y lógica sobre PostgreSQL local.
2. Pruebas unitarias de los indicadores.
3. Pruebas de aceptación end-to-end con Playwright y Chromium: móvil simulado (iPhone 13) y escritorio.
4. Pruebas responsive en 13 tamaños, de 320 × 568 a 1920 × 1080, con tableta y horizontal. Comprueban desbordes, tarjeta completa (cerrada, abierta y durante el giro), acción principal en la primera pantalla, objetivos táctiles de al menos 44 px y que la barra inferior no tape contenido.

En las pruebas end-to-end, la capa HTTP de Supabase se emula con `pruebas/servidor_prueba.js`; las reglas reales (RLS, funciones) se ejecutan en PostgreSQL. **Son simulaciones, no pruebas en dispositivos físicos.**

## Estructura
```
index.html            Invitación pública
admin/                Panel de organizadores
datos/evento.json     FUENTE ÚNICA del evento
js/                   app.js (tarjeta 3D y máquina de estados) · inicio.js (flujo) · api.js · pase.js · metricas.js · admin.js · config.js
css/                  estilos.css · admin.css
assets/               imágenes web por variante, logotipos extraídos, tipografías, PDF, ICS, vista previa
originales/           composiciones originales intactas y logotipos recortados sin modificar
supabase/             esquema.sql · semilla.sql (generada) · pruebas/
herramientas/         construir.sh y generadores · probar_*.sh
pruebas/              aceptacion.js · metricas.test.js · servidor_prueba.js
```
