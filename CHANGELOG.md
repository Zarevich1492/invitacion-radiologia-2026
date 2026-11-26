# Historial de publicaciones

Cada publicación en `main` se despliega automáticamente en
https://zarevich1492.github.io/invitacion-radiologia-2026/ (misma dirección siempre).
Reversión: `git revert <commit>` o volver a una etiqueta: `git checkout -B main <etiqueta> && git push -f origin main`
(solo con autorización expresa).

## v2.10 · Dedicatorias («Palabras que nos acompañan») y Aportes voluntarios (rama `acceso-por-codigo`; pendiente de publicar)
- Secciones públicas para todos los visitantes (también desde la bienvenida, sin código): libro de dedicatorias con estética de papel y tipografía manuscrita (Caveat, autoalojada, licencia OFL), destinatario (promoción o uno de los 7 especialistas), 500 caracteres, nombre, teléfono internacional privado, hasta 2 de 6 stickers de línea propios, vista previa en vivo y aviso de revisión.
- Antispam gratuito: Cloudflare Turnstile validado en el servidor (clave secreta solo en la base), campo trampa, límites por IP (5/h) y por teléfono (3/día), duplicados, saneamiento de texto y teléfonos normalizados. Sin Turnstile configurado el formulario no se habilita.
- Moderación: pendiente → aprobado/rechazado/oculto; el libro público solo expone autor, destinatario, mensaje, stickers y fecha.
- Aportes voluntarios: tarjeta de Pago Móvil con botones de copiado individual y global; datos y textos configurables desde el panel (no están en el código ni en GitHub); sin montos, metas ni comprobantes.
- Panel: módulo de dedicatorias (indicadores, filtros, acciones, exportación) y de aportes/Turnstile. CSV de confirmaciones y dedicatorias protegidos contra inyección de fórmulas.
- Pruebas: SQL 46 + 30 + 30, aceptación 159, responsive 244, contraste 553, apariencia 6. El widget de Cloudflare y la extensión `http` se sustituyen por dobles de prueba en local; la validación real requiere las claves de Turnstile.

## v2.9 · Acceso por código de categoría (rama `acceso-por-codigo`; pendiente de publicar tras la migración SQL)
- Pantalla inicial: cinco accesos (Padrinos y madrinas · Docentes y egresados · Residentes R1 y R2 · Otros invitados · Especialistas 2026), subtítulos nuevos, candado discreto en los cuatro restringidos y «Especialistas 2026» con fondo rojo institucional. Frase, logotipos, fuentes y tarjeta 3D intactos.
- Código de acceso validado en el servidor (hash bcrypt, sesión de 12 h, 8 intentos/10 min por IP, revocación). Campo con Mostrar/Ocultar, «Ingresar» y «Volver al inicio».
- Identificación tras el código: 10 padrinos, 7 especialistas, subcategoría y nombre para docentes/egresados y residentes; «Otros» entra libremente.
- Navegación por categoría: Padrinos (Inicio|Programa|Confirmar|Mi pase|Mi listón), Especialistas (Inicio|Programa|Mi listón), Docentes/egresados y residentes (Inicio|Programa|Confirmar|Mi pase), Otros (Inicio|Programa).
- Servidor: `acceso_validar`, `lista_nombres`, `guardar_con_sesion`, `mi_invitacion_sesion`, administración de códigos y `cierre_acceso.sql`. Se retira «Ver la invitación sin personalizar».
- Pruebas: SQL 46 + 30 de acceso, aceptación 134, responsive 244, contraste 385, apariencia 6.
- Pendiente: «Solicitar invitación» de Otros (especificación recibida incompleta) y listones en almacenamiento privado con enlaces temporales.

## v2.7 · Botón Inicio, sección independiente Mi listón, espacio Especialistas 2026, logotipo oficial y 17 listones (Dirección B)
- Botón «Inicio» con icono de casa en barra superior y barra inferior: regresa a la tarjeta conservando su último estado e identidad (y al espacio conmemorativo personalizado para Especialistas 2026).
- Sección independiente «Mi listón» (`#liston`) separada de «Mi pase», visible exclusivamente para los 7 graduandos y 10 padrinos/madrinas oficiales; oculta para docentes, egresados, residentes y otros invitados.
- Navegación por categoría: Padrinos (`Inicio | Programa | Confirmar asistencia | Mi pase | Mi listón`), Especialistas 2026 (`Inicio | Programa | Mi listón`) y Docentes/Egresados/R1/R2/Otros (`Inicio | Programa | Confirmar asistencia | Mi pase`).
- Logotipo oficial del Departamento de Radiología (`originales/logos/logo_departamento_radiologia_original (1).png`, sin modificar el original) integrado en bienvenida, pie de página, pase digital y los 17 listones.
- 17 listones conmemorativos (Dirección B — Protocolar, 60 × 120 mm, terminación en V, nombres aprobados `Dra. Omaira Berrios` y `Dra. Ma. del Carmen Gutiérrez`): 17 PNG 300 ppp, 17 PNG 600 ppp, 17 PDF vectoriales individuales y 2 PDF colectivos A4 vectoriales. `modulos.listones: true`.
- Conservadas íntegramente todas las correcciones de `v2.3`–`v2.6` (incluyendo Supabase).

## v2.8 · Supabase conectado y verificado
- `js/config.js` con la Project URL y la clave publishable (pública por diseño; la seguridad la imponen RLS y las funciones).
- Verificación real: 26/26 (permisos, antispam, categorías, persistencia, modificación con token sin duplicar, reglas de habilitación).
- Interfaz verificada contra el servidor real: guardado, recuperación y modificación de una confirmación.
- `supabase/endurecer.sql`: segunda barrera de permisos para el rol público.

## v2.6 · Preparación de Supabase (clave publishable)
- `api.js` compatible con la clave `sb_publishable_…` (no es un JWT: solo se envía en `apikey`).
- `supabase/instalar.sql`: esquema + semilla en un solo archivo, probado en una base vacía.
- `habilitaciones` también se retira del acceso público; `herramientas/verificar_supabase.js` (pruebas reales de RLS y persistencia).
- La conexión (`js/config.js`) se publicará cuando la base de datos responda y supere la verificación.

## v2.5 · Docentes y egresados, cinco accesos y habilitación por actividad
- Bienvenida con cinco accesos: Padrinos y madrinas · Docentes y egresados · Residentes R1 y R2 · Otros invitados ·
  Especialistas 2026 (este último solo cuando el módulo de listones esté publicado; usa `#btn-integrante`).
- Docentes y egresados: elección de subcategoría, nombre completo, invitación y confirmación. Tarjeta general (variante C).
- Habilitación de actividades por categoría configurable en el panel (matriz categoría × actividad, tabla
  `habilitaciones`); sin regla, la recepción NO se asume. Se conserva la excepción individual de la recepción.
- Panel: indicadores, filtros, tabla y CSV con Docente y Egresado; aviso de posibles duplicados (mismo nombre y categoría).
- Supabase: categorías `docente` y `egresado`, tabla `habilitaciones`, funciones actualizadas; la semilla es idempotente
  y conserva los cambios de los organizadores.
- Pruebas: 46 SQL (+4 de renombrado), 21 indicadores, 113 aceptación, 244 responsive, 315 contraste, 6 apariencia.

## v2.4 · Recorrido por clic y apellido corregido
- Clic sobre la tarjeta: portada → abre; interior → cierra y gira a la contraportada; contraportada → vuelve
  a la portada. Los botones son alternativos. El visor de ampliación no se reincorpora.
- «Dra. Omaira Berrios» (antes «Berrio») en la fuente única, selector, semilla SQL y pruebas; el identificador
  `berrio-omaira` se conserva. La semilla propaga el nombre a los registros vinculados sin duplicar ni perder respuestas.

## v2.3 · Sin función Ampliar, controles por estado y apariencia clara explícita
- Eliminada por completo la función «Ampliar» (botón, visor, diálogos, eventos y textos); el zoom nativo se conserva.
- Controles por estado: portada «Abrir tarjeta | Ver el programa»; interior «Cerrar tarjeta | Ver contraportada»;
  contraportada «Volver a la portada | Ver el programa». Reproducir y Reiniciar como acciones secundarias.
- `color-scheme: only light` (meta y CSS), paleta en variables (#F4E6D1 fondo, #231B15, #594638, #B91C1C).
- Pruebas: 95 aceptación, 244 responsive, 297 contraste, 6 de apariencia (claro/oscuro/oscurecimiento forzado).

## v2.2 · Portada y contraportada ampliadas
- Recomposición vertical desde los originales: ocupación del 85 % del alto, márgenes del 7,5–8 %.
- Portada A: logotipo de la promoción +27 %, logotipos institucionales +20 %, texto al ancho máximo.
- Portadas B y C: la línea roja (texto compuesto, no original) pasa a dos líneas; texto +50 %;
  la fecha original se traslada como bloque, sin modificarla.
- Contraportadas: ilustración +26 %, mensajes +27 %, logotipos +20 %. Escala máxima ×1,0 (sin ampliar
  por encima de la resolución original); sin deformaciones ni recortes.

## v2.1 · Contraste, modo claro y caras continuas
- Encabezado: nombre #231B15, mensaje #594638, categoría #B91C1C sobre crema #F4E6D1; 303/303 textos WCAG AA.
- Categoría personalizada: «Madrina de promoción» o «Padrino de promoción».
- Página declarada «solo modo claro»: los teléfonos y WhatsApp con modo oscuro automático ya no
  oscurecen el fondo CSS de las caras (causa de las franjas marrones alrededor de las imágenes).
- Contraportadas verticales a la medida de la cara (como las portadas); sin reflejos ni sombreados
  sobre las caras: la sombra queda alrededor de la tarjeta.
- Control de caché (?v=) para que se carguen los recursos nuevos.
- Logotipo oficial del Departamento recibido (originales/logos/); su integración se publicará aparte.

## v2 · Navegación por vistas, responsive y portadas nítidas
- Cuatro apartados: Invitación, Programa, Confirmar y Mi pase (barra superior en computadoras,
  barra inferior con icono y texto en móviles; botón Atrás coherente; acceso directo por dirección).
- Portadas verticales a la medida de la tarjeta (+50 % en pantalla) y portada nítida en móviles.
- Programa con «Cómo llegar» por actividad; clase magistral 8:30 a. m. en el Auditorio A,
  Facultad de Medicina (ULA); el enlace lleva a la Facultad (dirección verificada, sin coordenadas inventadas).
- Confirmación compacta con resumen; si la base de datos no está conectada se avisa antes del formulario.
- Mi pase: vista previa y descarga principal; calendario, invitación completa y mapas agrupados.
- No publicado aún (interruptor `modulos.listones` en `datos/evento.json`): listones conmemorativos
  y acceso «Soy integrante de la XXIV Promoción».
- Pruebas: 38 SQL, 17 indicadores, 90 de aceptación, 244 responsive (simulación en Chromium).

## v1-publicada · Primera publicación
- Invitación con tres variantes, tarjeta 3D, pase digital, calendario y panel administrativo (sin Supabase).
