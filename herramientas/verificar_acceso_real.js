/* Verificación REAL (Supabase en producción) del acceso por contraseña y de la autorización administrativa, con la clave publishable.
   No crea registros de invitados, dedicatorias ni solicitudes (solo sesiones temporales de 12 h y algún intento fallido registrado).
   Uso: CODIGOS='{"padrinos":"…","docentes":"…","residentes":"…","especialistas":"…"}' NODE_USE_ENV_PROXY=1 node herramientas/verificar_acceso_real.js
   Los códigos se reciben por variable de entorno: no se guardan ni se imprimen. */
const fs = require("fs"), path = require("path");
const cfg = fs.readFileSync(path.join(__dirname, "..", "js", "config.js"), "utf8");
const URL_ = (cfg.match(/supabaseUrl:\s*"([^"]+)"/) || [])[1], KEY = (cfg.match(/supabaseAnonKey:\s*"([^"]+)"/) || [])[1];
const CODIGOS = JSON.parse(process.env.CODIGOS || "{}");
const H = { apikey: KEY, "Content-Type": "application/json", Origin: "https://zarevich1492.github.io" };
let n = 0, fallos = 0;
const ok = (t, c, d = "") => { n++; if (!c) fallos++; console.log((c ? "✔" : "✘") + " " + t + (d ? " — " + d : "")); };
async function rpc(f, a) { const r = await fetch(`${URL_}/rest/v1/rpc/${f}`, { method: "POST", headers: H, body: JSON.stringify(a || {}) }); const t = await r.text(); let j = null; try { j = t ? JSON.parse(t) : null; } catch (e) { j = t; } return { s: r.status, j }; }
const denegado = (r) => r.s === 401 || r.s === 403 || r.s === 404 || (r.s >= 400 && /no_autorizado|permission denied|solo_inicializacion|not found|Could not find/i.test(JSON.stringify(r.j)));

(async () => {
  // 1) Instalación v2.12.x presente
  const c = await rpc("dedicatorias_config");
  ok("Módulos instalados (dedicatorias_config responde)", c.s === 200 && c.j && Array.isArray(c.j.especialistas), `HTTP ${c.s}`);
  ok("Siete especialistas disponibles para dedicar", c.j && c.j.especialistas && c.j.especialistas.length === 7);
  const ap = await rpc("aportes_publicos");
  ok("Aportes: configurados en Supabase", ap.s === 200 && ap.j && typeof ap.j.activo === "boolean", ap.j && ap.j.activo ? "activo (publicado)" : "inactivo (oculto hasta autorizar)");
  if (ap.j && ap.j.activo) ok("Aportes activos: cinco datos de Pago Móvil", ["banco", "codigo", "titular", "cedula", "telefono"].every((k) => ap.j[k]));
  const dp = await rpc("dedicatorias_publicas");
  ok("Libro público accesible (solo aprobadas, sin teléfono)", dp.s === 200 && Array.isArray(dp.j) && !JSON.stringify(dp.j).includes("telefono"), `${(dp.j || []).length} publicadas`);

  // 2) Contraseñas: incorrecta, cruzadas y correctas
  const mal = await rpc("acceso_validar", { p_grupo: "padrinos", p_codigo: "codigo-incorrecto-123" });
  ok("Contraseña incorrecta rechazada", mal.s === 200 && mal.j && mal.j.ok === false && mal.j.motivo === "codigo_incorrecto");
  const sesiones = {};
  for (const g of ["padrinos", "docentes", "residentes", "especialistas"]) {
    if (!CODIGOS[g]) { ok(`Contraseña de «${g}»`, false, "no proporcionada"); continue; }
    const r = await rpc("acceso_validar", { p_grupo: g, p_codigo: CODIGOS[g] });
    ok(`Contraseña de «${g}» correcta abre sesión`, r.s === 200 && r.j && r.j.ok === true && (r.j.sesion || "").length >= 40);
    if (r.j && r.j.ok) sesiones[g] = r.j.sesion;
  }
  const cruz = CODIGOS.docentes ? await rpc("acceso_validar", { p_grupo: "padrinos", p_codigo: CODIGOS.docentes }) : null;
  if (cruz) ok("El código de docentes NO abre padrinos", cruz.j && cruz.j.ok === false);
  const otros = await rpc("acceso_validar", { p_grupo: "otros", p_codigo: null });
  ok("«Invitados especiales»: acceso libre sin contraseña", otros.j && otros.j.ok === true);
  sesiones.otros = otros.j && otros.j.sesion;

  // 3) Permisos por categoría (se prueban rechazos: no se escribe nada)
  const nombres = async (g) => (await rpc("lista_nombres", { p_sesion: sesiones[g] })).j;
  if (sesiones.padrinos) ok("Sesión de padrinos: lista de 10 padrinos", (await nombres("padrinos")).length === 10);
  if (sesiones.especialistas) ok("Sesión de especialistas: lista de 7 graduandos", (await nombres("especialistas")).length === 7);
  if (sesiones.docentes) ok("Sesión de docentes: sin lista de padrinos", (await nombres("docentes")).length === 0);
  ok("Sin sesión: lista de nombres vacía", (await rpc("lista_nombres", { p_sesion: "x".repeat(40) })).j.length === 0);
  const g = (sesion, cat) => rpc("guardar_con_sesion", { p_sesion: sesion, p_token: null, p_categoria: cat, p_padrino_id: null, p_nombre: "Prueba Real", p_respuestas: { clase: "asistira" }, p_trampa: null, p_nota: null });
  const msg = (r) => JSON.stringify(r.j);
  if (sesiones.docentes) ok("Docentes NO pueden registrar como padrino", /categoria_no_permitida/.test(msg(await g(sesiones.docentes, "padrino"))));
  if (sesiones.padrinos) ok("Padrinos NO pueden registrar como docente", /categoria_no_permitida/.test(msg(await g(sesiones.padrinos, "docente"))));
  if (sesiones.especialistas) ok("Especialistas NO confirman asistencia", /no_confirma/.test(msg(await g(sesiones.especialistas, "docente"))));
  ok("«Otros» NO confirma sin autorización", /requiere_autorizacion/.test(msg(await g(sesiones.otros, "otro"))));
  ok("Sin sesión no se registra", /sesion_invalida/.test(msg(await g(null, "docente"))));
  const viejo = await rpc("guardar_confirmacion", { p_token: null, p_categoria: "otro", p_padrino_id: null, p_nombre: "Prueba Real", p_respuestas: {}, p_trampa: "x", p_nota: null });
  ok("Ruta antigua guardar_confirmacion", true, viejo.s === 200 || (viejo.s >= 400 && /solicitud_rechazada/.test(msg(viejo))) ? "aún abierta (cerrar con cierre_acceso.sql)" : "ya cerrada");

  // 4) Rechazos de dedicatorias y solicitudes (sin crear datos)
  const d1 = await rpc("dedicatoria_enviar", { p_destinatario: "promocion", p_mensaje: "Mensaje de prueba", p_autor: "Prueba", p_telefono: "+584120000000", p_stickers: [], p_trampa: "http://spam" });
  ok("Dedicatoria: campo trampa rechaza", d1.s >= 400 && /solicitud_rechazada/.test(msg(d1)));
  const d2 = await rpc("dedicatoria_enviar", { p_destinatario: "promocion", p_mensaje: "Mensaje de prueba", p_autor: "Prueba", p_telefono: "123", p_stickers: [] });
  ok("Dedicatoria: teléfono sin prefijo internacional rechazado", d2.s >= 400 && /telefono_invalido/.test(msg(d2)));
  const d3 = await rpc("dedicatoria_enviar", { p_destinatario: "promocion", p_mensaje: "Mensaje de prueba", p_autor: "Prueba", p_telefono: "+584120000000", p_stickers: ["corazon", "birrete", "confeti"] });
  ok("Dedicatoria: más de dos stickers rechazado", d3.s >= 400 && /stickers_invalidos/.test(msg(d3)));
  const s1 = await rpc("solicitar_invitacion", { p_nombre: "Prueba", p_invita_tipo: "padrino", p_invita_nombre: "", p_telefono: "+584120000000" });
  ok("Solicitud: «quién invita» obligatorio", s1.s >= 400 && /invita_invalido/.test(msg(s1)));

  // 5) Autorización administrativa: nada de lo administrativo es ejecutable con la clave pública
  const adm = [["admin_definir_codigo", { p_grupo: "padrinos", p_codigo: "intruso-12345" }], ["admin_revocar_sesiones", {}], ["admin_estado_acceso", {}], ["admin_definir_aportes", { p_valor: { activo: true } }],
    ["admin_dedicatorias", {}], ["admin_dedicatoria_estado", { p_id: "00000000-0000-0000-0000-000000000000", p_estado: "aprobado" }], ["admin_enlaces", {}], ["admin_generar_enlaces", { p_ids: ["00000000-0000-0000-0000-000000000000"] }],
    ["admin_autorizar", { p_ids: ["00000000-0000-0000-0000-000000000000"], p_actividades: ["clase"], p_modo: "fijar" }], ["admin_solicitudes", {}], ["admin_bitacora", {}], ["admin_verificar_codigo", { p_grupo: "padrinos", p_codigo: "x" }],
    ["admin_sincronizar_padrinos", {}], ["init_definir_codigo", { p_grupo: "padrinos", p_codigo: "intruso-12345" }], ["init_definir_aportes", { p_valor: { activo: true } }], ["_sincronizar_padrinos", {}], ["_es_gestor", {}]];
  for (const [f, a] of adm) { const r = await rpc(f, a); ok(`Clave pública NO ejecuta ${f}`, denegado(r), `HTTP ${r.s}`); }
  for (const t of ["codigos_acceso", "sesiones_acceso", "dedicatorias", "solicitudes", "enlaces", "bitacora", "autorizaciones", "ajustes", "graduandos"]) {
    const r = await fetch(`${URL_}/rest/v1/${t}?select=*&limit=1`, { headers: H }); const j = await r.json().catch(() => null);
    ok(`El público NO lee la tabla «${t}»`, r.status >= 400 || (Array.isArray(j) && j.length === 0), `HTTP ${r.status}`);
  }
  // Los códigos no cambiaron por los intentos anteriores
  if (CODIGOS.padrinos) ok("La contraseña de padrinos sigue vigente tras los intentos de alteración", (await rpc("acceso_validar", { p_grupo: "padrinos", p_codigo: CODIGOS.padrinos })).j.ok === true);
  console.log(`\n${n - fallos}/${n} comprobaciones reales superadas`);
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error("Error:", e.cause ? e.cause.code || e.cause.message : e.message); process.exit(2); });
