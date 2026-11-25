# Historial de publicaciones

Cada publicación en `main` se despliega automáticamente en
https://zarevich1492.github.io/invitacion-radiologia-2026/ (misma dirección siempre).
Reversión: `git revert <commit>` o volver a una etiqueta: `git checkout -B main <etiqueta> && git push -f origin main`
(solo con autorización expresa).

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
