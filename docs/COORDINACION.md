# Coordinación entre agentes (Claude Code · Antigravity)

Reglas: sin `force push`; sincronizar con `main` antes de publicar; resolver conflictos conservando ambos trabajos;
publicar solo lo verificado; actualizar `CHANGELOG.md`.

## Responsabilidades
| Área | Responsable |
|---|---|
| Interfaz, navegación, Supabase (esquema, semilla, conexión), panel, pruebas, publicación | Claude Code |
| Listones conmemorativos (diseño B aprobado), logotipo oficial del Departamento, SQL de seguridad/claves publishable | Antigravity |

## Puntos de contacto (no renombrar sin avisar)
- **Acceso «Especialistas 2026»**: botón `#btn-integrante` (dentro de `.accesos`, atributo `data-acceso="especialistas"`),
  paso `#paso-graduando`, lista `#lista-graduandos`. Visible solo si `datos/evento.json → modulos.listones` es `true`.
- Datos de listones: `graduandos_lista`, `padrinos[].denominacion`, `padrinos[].nombre_liston`, bloque `liston`.
- Archivos de listones: `assets/listones/<id>.png|pdf` (hoy en `.gitignore`; quitar esa línea al publicar el módulo).
- Pestañas de «Mi pase» y panel de listón: `#pestanas-pase`, `#panel-liston` (`js/inicio.js → pintarListon`).
- Nombre corregido: **Dra. Omaira Berrios** (id `berrio-omaira`). Los listones deben usar «Berrios».

## Cambios de Claude Code en SQL (para integrar con los de Antigravity)
`supabase/esquema.sql`: categorías `docente` y `egresado`; tabla `habilitaciones`; `_habilitadas` e `invitacion_config`
leen la matriz; `guardar_confirmacion` y `admin_crear_invitado` aceptan las nuevas categorías; se elimina
`categorias.recepcion_habilitada`. Al fusionar, conservar las mejoras de seguridad de Antigravity y estas modificaciones.
