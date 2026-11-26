/* Doble de prueba de la API de Supabase (solo para pruebas locales).
   Traduce las rutas que usan la app y el panel a SQL ejecutado con psql sobre un PostgreSQL local
   cargado con supabase/esquema.sql. Las reglas reales (RLS, roles anon/authenticated, funciones)
   se ejecutan en la base de datos; aquí solo se emula la capa HTTP (PostgREST + Auth).
   Uso: PGHOST=/tmp PGPORT=5499 node pruebas/servidor_prueba.js 8787 invitacion_prueba          */
const http = require("http");
const { execFileSync } = require("child_process");
const PUERTO = +process.argv[2] || 8787, DB = process.argv[3] || "invitacion_prueba";
const ADMIN = { email: "organizador@prueba.local", clave: "clave-de-prueba", uid: "11111111-1111-1111-1111-111111111111" };
const NOADMIN = { email: "otro@prueba.local", clave: "clave-de-prueba", uid: "22222222-2222-2222-2222-222222222222" };
const tokens = new Map();

function sql(rol, sub, consulta, vars = {}) {
  const args = ["-U", "postgres", "-d", DB, "-At", "-v", "ON_ERROR_STOP=1", "-q"];
  for (const [k, v] of Object.entries(vars)) args.push("-v", `${k}=${v}`);
  const pre = `begin; set local role ${rol}; select set_config('request.jwt.claim.sub', :'sub', true) \\g /dev/null\n`;
  const entrada = pre.replace(":'sub'", sub ? `'${sub}'` : "''") + consulta + "\ncommit;";
  try { return { ok: true, salida: execFileSync("psql", args, { input: entrada, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim() }; }
  catch (e) {
    const m = String(e.stderr || "").match(/ERROR:\s+(.*)/);
    const msg = m ? m[1].trim() : "error";
    return { ok: false, msg, permiso: /permission denied|row-level security|no_autorizado/.test(msg) };
  }
}
const json = (res, code, obj) => { res.writeHead(code, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }); res.end(obj === undefined ? "" : JSON.stringify(obj)); };

const FIRMAS = {
  invitacion_config: [], mi_invitacion: ["p_token"], es_admin: [],
  guardar_confirmacion: ["p_token", "p_categoria", "p_padrino_id", "p_nombre", "p_respuestas", "p_trampa", "p_nota"],
  acceso_validar: ["p_grupo", "p_codigo"], acceso_estado: ["p_sesion"], lista_nombres: ["p_sesion"], mi_invitacion_sesion: ["p_sesion", "p_token"],
  guardar_con_sesion: ["p_sesion", "p_token", "p_categoria", "p_padrino_id", "p_nombre", "p_respuestas", "p_trampa", "p_nota"],
  dedicatorias_config: [], dedicatorias_publicas: [], aportes_publicos: [],
  dedicatoria_enviar: ["p_destinatario", "p_mensaje", "p_autor", "p_telefono", "p_stickers", "p_trampa"], admin_dedicatoria_eliminar: ["p_id"],
  admin_estado_acceso: [], admin_definir_codigo: ["p_grupo", "p_codigo"], admin_revocar_sesiones: ["p_grupo"],
  admin_dedicatorias: [], admin_dedicatoria_estado: ["p_id", "p_estado"], admin_ajustes: [], admin_definir_aportes: ["p_valor"],
  admin_generar_enlaces: ["p_ids", "p_regenerar"], admin_enlaces: [], admin_revocar_enlaces: ["p_ids"], admin_marcar_enviado: ["p_ids", "p_enviado"], admin_autorizar: ["p_ids", "p_actividades", "p_modo"], admin_verificar_codigo: ["p_grupo", "p_codigo"], admin_bitacora: ["p_limite"],
  solicitar_invitacion: ["p_nombre", "p_invita_tipo", "p_invita_nombre", "p_telefono", "p_trampa"], admin_solicitudes: [], admin_solicitud_resolver: ["p_id", "p_aprobar"],
  admin_generar_enlace: ["p_invitado"], admin_crear_invitado: ["p_nombre", "p_categoria"], admin_sincronizar_padrinos: [], admin_eliminar_registros: ["p_confirmacion"],
};
const TIPOS = { p_respuestas: "jsonb", p_invitado: "uuid", p_valor: "jsonb", p_id: "uuid", p_stickers: "text[]", p_ids: "uuid[]", p_actividades: "text[]", p_regenerar: "boolean", p_enviado: "boolean", p_aprobar: "boolean", p_limite: "int" };

http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") { res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*" }); return res.end(); }
  let cuerpo = ""; for await (const c of req) cuerpo += c;
  const url = new URL(req.url, "http://x");
  const auth = (req.headers.authorization || "").replace("Bearer ", "");
  const usuario = tokens.get(auth) || null;
  const rol = usuario ? "authenticated" : "anon", sub = usuario ? usuario.uid : null;

  // ---- Auth ----
  if (url.pathname === "/auth/v1/token") {
    const b = JSON.parse(cuerpo || "{}");
    let u = null;
    if (url.searchParams.get("grant_type") === "password") u = [ADMIN, NOADMIN].find((x) => x.email === b.email && x.clave === b.password);
    if (url.searchParams.get("grant_type") === "refresh_token") u = tokens.get("r:" + b.refresh_token);
    if (!u) return json(res, 400, { error_description: "Credenciales inválidas" });
    const t = "t" + Math.random().toString(36).slice(2), r = "r" + Math.random().toString(36).slice(2);
    tokens.set(t, u); tokens.set("r:" + r, u);
    return json(res, 200, { access_token: t, refresh_token: r, expires_in: 3600, user: { email: u.email } });
  }
  // ---- RPC ----
  const mr = url.pathname.match(/^\/rest\/v1\/rpc\/(\w+)$/);
  if (mr && FIRMAS[mr[1]]) {
    const b = JSON.parse(cuerpo || "{}"), vars = {}, params = [];
    for (const p of FIRMAS[mr[1]]) if (p in b) {
      if (b[p] === null) { params.push(`${p} => null`); continue; }
      vars[p] = typeof b[p] === "string" ? b[p] : Array.isArray(b[p]) && /\[\]$/.test(TIPOS[p] || "") ? "{" + b[p].map((x) => '"' + String(x).replace(/["\\]/g, "") + '"').join(",") + "}" : JSON.stringify(b[p]);
      params.push(`${p} => :'${p}'::${TIPOS[p] || "text"}`);
    }
    const r = sql(rol, sub, `select to_jsonb(public.${mr[1]}(${params.join(", ")}))::text;`, vars);
    if (!r.ok) return json(res, r.permiso ? 403 : 400, { message: r.msg.replace(/^.*?:\s*/, "").trim() === "" ? r.msg : r.msg.split("\n")[0] });
    return json(res, 200, r.salida ? JSON.parse(r.salida) : null);
  }
  // ---- Tablas (subconjunto que usa el panel) ----
  const mt = url.pathname.match(/^\/rest\/v1\/(invitados|padrinos|categorias|habilitaciones|actividades|confirmaciones)$/);
  if (mt) {
    const t = mt[1];
    const filtro = [...url.searchParams].filter(([k, v]) => /^eq\./.test(v)).map(([k, v], i) => { return { k, v: v.slice(3), i }; });
    const vars = {}; filtro.forEach((f) => (vars["f" + f.i] = f.v));
    const where = filtro.length ? " where " + filtro.map((f) => `${f.k}::text = :'f${f.i}'`).join(" and ") : "";
    let q;
    if (req.method === "GET") {
      if (t === "invitados") q = `select coalesce(jsonb_agg(x order by x.creado), '[]')::text from (select i.id,i.categoria,i.padrino_id,i.nombre,i.origen,i.token_admin,i.verificado,i.recepcion_override,i.nota_omision,i.creado,i.actualizado,i.respondido, coalesce((select jsonb_agg(jsonb_build_object('actividad',c.actividad,'estado',c.estado,'actualizado',c.actualizado)) from public.confirmaciones c where c.invitado_id=i.id),'[]') confirmaciones, coalesce((select jsonb_agg(jsonb_build_object('actividad',a.actividad,'habilitada',a.habilitada)) from public.autorizaciones a where a.invitado_id=i.id),'[]') autorizaciones from public.invitados i) x;`;
      else q = `select coalesce(jsonb_agg(to_jsonb(x)), '[]')::text from public.${t} x${where};`;
    } else if (req.method === "PATCH") {
      vars.b = cuerpo; q = `update public.${t} x set ${Object.keys(JSON.parse(cuerpo)).map((k) => `${k} = (jsonb_populate_record(null::public.${t}, :'b'::jsonb)).${k}`).join(", ")}${where.replace(/ (\w+)::text/g, " x.$1::text")};`;
    } else if (req.method === "POST") {
      vars.b = cuerpo; const cols = Object.keys(JSON.parse(cuerpo));
      const conflicto = t === "confirmaciones" ? " on conflict (invitado_id, actividad) do update set estado = excluded.estado, actualizado = excluded.actualizado" : t === "habilitaciones" ? " on conflict (categoria, actividad) do update set habilitada = excluded.habilitada" : "";
      q = `insert into public.${t}(${cols.join(",")}) select ${cols.join(",")} from jsonb_populate_record(null::public.${t}, :'b'::jsonb)${conflicto};`;
    } else if (req.method === "DELETE") q = `delete from public.${t}${where};`;
    const r = sql(rol, sub, q, vars);
    if (!r.ok) return json(res, r.permiso ? 403 : 400, { message: r.msg });
    return req.method === "GET" ? json(res, 200, JSON.parse(r.salida)) : json(res, 204);
  }
  json(res, 404, { message: "no encontrado" });
}).listen(PUERTO, "127.0.0.1", () => console.log("API de prueba en http://127.0.0.1:" + PUERTO));
