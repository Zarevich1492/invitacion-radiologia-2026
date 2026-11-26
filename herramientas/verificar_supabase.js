/* Verificación REAL de Supabase con la clave pública (publishable). No usa claves secretas.
   Uso: NODE_USE_ENV_PROXY=1 node herramientas/verificar_supabase.js [--escribir]
   Sin --escribir solo hace lecturas y comprobaciones de seguridad (no crea datos).
   Con --escribir crea 2 registros de prueba marcados «PRUEBA AUTOMÁTICA» (el organizador los elimina desde el panel). */
const fs = require("fs");
const path = require("path");
const cfg = fs.readFileSync(path.join(__dirname, "..", "js", "config.js"), "utf8");
const URL_ = (cfg.match(/supabaseUrl:\s*"([^"]+)"/) || [])[1], KEY = (cfg.match(/supabaseAnonKey:\s*"([^"]+)"/) || [])[1];
const ESCRIBIR = process.argv.includes("--escribir");
if (!URL_ || !KEY) { console.error("js/config.js no tiene URL y clave."); process.exit(2); }
const EV = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "datos", "evento.json"), "utf8"));
const H = { apikey: KEY, "Content-Type": "application/json", Origin: "https://zarevich1492.github.io" };
let n = 0, fallos = 0;
const ok = (t, c, d = "") => { n++; if (!c) fallos++; console.log((c ? "✔" : "✘") + " " + t + (d ? " — " + d : "")); };
async function http(m, ruta, cuerpo, h = H) { const r = await fetch(URL_ + ruta, { method: m, headers: h, body: cuerpo ? JSON.stringify(cuerpo) : undefined }); const t = await r.text(); let j = null; try { j = t ? JSON.parse(t) : null; } catch (e) { j = t; } return { s: r.status, j }; }
const rpc = (f, a) => http("POST", `/rest/v1/rpc/${f}`, a || {});

(async () => {
  // 1) Servicios
  const auth = await http("GET", "/auth/v1/settings");
  ok("Autenticación responde con la clave publishable", auth.s === 200);
  ok("Registro público de usuarios desactivado", auth.j && auth.j.disable_signup === true, auth.j && auth.j.disable_signup === false ? "ACTIVO: cualquiera podría crear una cuenta (no accede a datos, pero conviene desactivarlo)" : "");
  const cfgR = await rpc("invitacion_config");
  if (cfgR.s !== 200) { ok("API de datos disponible y esquema instalado", false, `HTTP ${cfgR.s} ${JSON.stringify(cfgR.j).slice(0, 140)}`); console.log(`\n${n - fallos}/${n} comprobaciones superadas`); process.exit(1); }
  const c = cfgR.j;
  // 2) Contenido instalado
  ok("10 padrinos y madrinas, incluida la Dra. Analy Falcón", c.padrinos.length === 10 && c.padrinos.some((p) => p.nombre === "Dra. Analy Falcón"), c.padrinos.map((p) => p.nombre).join(" | "));
  ok("Dra. Omaira Berrios (apellido corregido)", c.padrinos.some((p) => p.nombre === "Dra. Omaira Berrios") && !c.padrinos.some((p) => p.nombre === "Dra. Omaira Berrio"));
  ok("Actividades: clase 8:30 (Auditorio A), caravana y recepción", c.actividades.length === 3 && c.actividades[0].hora_texto === "8:30 a. m." && /Auditorio A/.test(c.actividades[0].lugar) && c.actividades[2].codigo === "recepcion");
  const m = c.habilitaciones || {};
  ok("Matriz de habilitación con docente y egresado (recepción no habilitada)", m.docente && m.egresado && m.docente.recepcion === false && m.egresado.recepcion === false && m.padrino.recepcion === true, JSON.stringify(m.docente));
  // 3) Seguridad (RLS y permisos): el público no puede leer ni escribir tablas privadas
  for (const t of ["invitados", "confirmaciones", "administradores", "intentos", "habilitaciones"]) {
    const r = await http("GET", `/rest/v1/${t}?select=*&limit=1`);
    ok(`El público NO lee «${t}»`, r.s === 401 || r.s === 403 || (r.s === 200 && Array.isArray(r.j) && r.j.length === 0), `HTTP ${r.s}`);
  }
  const lecturaPublica = await http("GET", "/rest/v1/padrinos?select=nombre&limit=1");
  ok("Lectura pública solo de catálogos (padrinos)", lecturaPublica.s === 200);
  const ins = await http("POST", "/rest/v1/padrinos", { id: "x-intruso", nombre: "Dr. Intruso", apellido: "Intruso" });
  ok("El público NO puede añadir padrinos", ins.s === 401 || ins.s === 403, `HTTP ${ins.s}`);
  const upd = await http("PATCH", "/rest/v1/padrinos?id=eq.falcon-analy", { nombre: "Dra. Alterada" });
  const aun = await rpc("invitacion_config");
  ok("El público NO puede modificar padrinos", aun.j.padrinos.some((p) => p.nombre === "Dra. Analy Falcón"), `HTTP ${upd.s}`);
  for (const f of ["admin_generar_enlace", "admin_crear_invitado", "admin_sincronizar_padrinos", "admin_eliminar_registros"]) {
    const r = await rpc(f, { p_invitado: "00000000-0000-0000-0000-000000000000", p_nombre: "X", p_categoria: "otro", p_confirmacion: "no" });
    ok(`El público NO ejecuta ${f}`, r.s === 401 || r.s === 403 || r.s === 404, `HTTP ${r.s}`);
  }
  const falso = await rpc("mi_invitacion", { p_token: "token-falso-token-falso-token-falso-1234" });
  ok("Un token falso no devuelve nada", falso.s === 200 && falso.j === null);
  const trampa = await rpc("guardar_confirmacion", { p_token: null, p_categoria: "otro", p_padrino_id: null, p_nombre: "Bot Spam", p_respuestas: { clase: "asistira" }, p_trampa: "http://spam", p_nota: null });
  ok("El campo trampa antispam rechaza el envío", trampa.s >= 400 && /solicitud_rechazada/.test(JSON.stringify(trampa.j)));
  const r3 = await rpc("guardar_confirmacion", { p_token: null, p_categoria: "r3", p_padrino_id: null, p_nombre: "Residente Tres", p_respuestas: {}, p_trampa: null, p_nota: null });
  ok("La categoría R3 es rechazada", r3.s >= 400 && /categoria_invalida/.test(JSON.stringify(r3.j)));

  if (!ESCRIBIR) { console.log(`\n${n - fallos}/${n} comprobaciones superadas (solo lectura)`); process.exit(fallos ? 1 : 0); }
  // 4) Persistencia real: registro, lectura con token, modificación y reglas de habilitación
  const g = (cat, nombre, resp) => rpc("guardar_confirmacion", { p_token: null, p_categoria: cat, p_padrino_id: null, p_nombre: nombre, p_respuestas: resp, p_trampa: null, p_nota: null });
  const a = await g("docente", "PRUEBA AUTOMÁTICA Docente (borrar)", { clase: "asistira", caravana: "por_confirmar", recepcion: "asistira" });
  ok("Docente: respuesta guardada y token entregado", a.s === 200 && a.j.token && a.j.token.length >= 40, `HTTP ${a.s} ${a.s !== 200 ? JSON.stringify(a.j).slice(0, 120) : ""}`);
  ok("Docente: recepción no habilitada (ignorada, sin asumir acceso)", a.j && !("recepcion" in a.j.invitacion.respuestas) && !a.j.invitacion.actividades.includes("recepcion"), a.j && JSON.stringify(a.j.invitacion.respuestas));
  const lee = await rpc("mi_invitacion", { p_token: a.j.token });
  ok("Persistencia: la respuesta se recupera desde el servidor con su token", lee.j && lee.j.respuestas.clase === "asistira" && lee.j.respuestas.caravana === "por_confirmar" && lee.j.categoria === "docente");
  const mod = await rpc("guardar_confirmacion", { p_token: a.j.token, p_categoria: null, p_padrino_id: null, p_nombre: null, p_respuestas: { caravana: "asistira" }, p_trampa: null, p_nota: null });
  ok("Modificación segura con el token (mismo registro, sin duplicar)", mod.s === 200 && mod.j.token === null && mod.j.invitacion.respuestas.caravana === "asistira" && mod.j.invitacion.respuestas.clase === "asistira");
  const eg = await g("egresado", "PRUEBA AUTOMÁTICA Egresado (borrar)", { clase: "no_asistira" });
  ok("Egresado: respuesta guardada", eg.s === 200 && eg.j.invitacion.respuestas.clase === "no_asistira");
  console.log(`\n${n - fallos}/${n} comprobaciones superadas (con persistencia real)`);
  console.log("Registros de prueba creados: 2 («PRUEBA AUTOMÁTICA» Docente y Egresado). Elimínelos desde el panel (botón «Eliminar» de su fila) antes de distribuir la invitación. No se crean respuestas a nombre de ningún padrino real.");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error("Error:", e.cause ? e.cause.code || e.cause.message : e.message); process.exit(2); });
