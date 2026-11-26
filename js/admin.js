/* Panel administrativo: Supabase Auth (correo + contraseña) y PostgREST con el token del organizador.
   Toda la protección real está en la base de datos (RLS + tabla administradores). */
(function () {
  "use strict";
  const C = window.CONFIG || {};
  const $ = (s) => document.querySelector(s);
  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const normal = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  // Evita inyección de fórmulas al abrir el CSV en Excel/Sheets: se antepone «'» a celdas que empiezan con = + - @ o control
  const csvSeguro = (v) => { const t = String(v ?? ""); return /^[=+\-@\t\r]/.test(t) ? "'" + t : t; };
  const fecha = (v) => (v ? new Date(v).toLocaleString("es-VE", { dateStyle: "short", timeStyle: "short" }) : "—");
  const ETQ = { asistira: "Asistirá", no_asistira: "No asistirá", por_confirmar: "Por confirmar", sin_responder: "Sin responder", no_aplica: "No aplica" };
  const CAT = { padrino: "Padrino/Madrina", docente: "Docente", egresado: "Egresado", r1: "R1", r2: "R2", otro: "Otro invitado" };
  const ORDEN_CAT = ["padrino", "docente", "egresado", "r1", "r2", "otro"];
  const CLAVE_SESION = "invitacion-ula-2026:admin";
  let sesion = null, EV = null, D = null, R = null;

  function toast(t) { const el = $("#toast"); el.textContent = t; el.classList.add("visible"); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove("visible"), 3500); }

  /* ---------- Autenticación ---------- */
  async function auth(grant, body) {
    const r = await fetch(`${C.supabaseUrl}/auth/v1/token?grant_type=${grant}`, { method: "POST", headers: { apikey: C.supabaseAnonKey, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error_description || j.msg || "No se pudo iniciar sesión");
    return { access: j.access_token, refresh: j.refresh_token, expira: Date.now() + (j.expires_in - 60) * 1000, email: j.user && j.user.email };
  }
  async function token() {
    if (sesion && Date.now() > sesion.expira) {
      try { sesion = await auth("refresh_token", { refresh_token: sesion.refresh }); guardarSesion(); }
      catch (e) { salir(); throw new Error("La sesión expiró. Vuelva a entrar."); }
    }
    return sesion.access;
  }
  const guardarSesion = () => { try { sessionStorage.setItem(CLAVE_SESION, JSON.stringify(sesion)); } catch (e) {} };
  async function api(ruta, opciones = {}) {
    const r = await fetch(`${C.supabaseUrl}/rest/v1/${ruta}`, {
      ...opciones,
      headers: { apikey: C.supabaseAnonKey, Authorization: `Bearer ${await token()}`, "Content-Type": "application/json", ...(opciones.headers || {}) },
    });
    const t = await r.text(); const j = t ? JSON.parse(t) : null;
    if (!r.ok) throw new Error((j && (j.message || j.hint)) || `Error ${r.status}`);
    return j;
  }
  const rpc = (f, args) => api(`rpc/${f}`, { method: "POST", body: JSON.stringify(args || {}) });

  $("#form-acceso").addEventListener("submit", async (e) => {
    e.preventDefault();
    const est = $("#acceso-estado"); est.textContent = "Verificando…"; est.className = "rsvp-estado";
    try {
      sesion = await auth("password", { email: $("#correo").value.trim(), password: $("#clave").value });
      guardarSesion(); $("#clave").value = "";
      await cargar();
    } catch (err) { est.textContent = err.message; est.className = "rsvp-estado error"; }
  });
  function salir() { limpiarCodigos(); sesion = null; try { sessionStorage.removeItem(CLAVE_SESION); } catch (e) {} $("#panel").hidden = true; $("#acceso").hidden = false; $("#salir").hidden = true; }
  $("#salir").addEventListener("click", salir);

  /* ---------- Carga ---------- */
  async function cargar() {
    const [invitados, padrinos, categorias, habilitaciones, actividades, soyAdmin] = await Promise.all([
      api("invitados?select=id,categoria,padrino_id,nombre,origen,token_admin,verificado,recepcion_override,nota_omision,creado,actualizado,respondido,confirmaciones(actividad,estado,actualizado),autorizaciones(actividad,habilitada)&order=creado.asc"),
      api("padrinos?select=*&order=apellido.asc,nombre.asc"),
      api("categorias?select=*"),
      api("habilitaciones?select=*"),
      api("actividades?select=*&order=orden.asc"),
      rpc("es_admin"),
    ]);
    if (!soyAdmin) { salir(); $("#acceso-aviso").textContent = "Esta cuenta no figura como organizadora. Pida que la añadan a la tabla «administradores»."; return; }
    D = { invitados, padrinos, categorias, habilitaciones, actividades };
    R = window.Metricas.calcular(D, EV.graduandos);
    $("#acceso").hidden = true; $("#panel").hidden = false; $("#salir").hidden = false;
    $("#actualizado").textContent = `Datos al ${fecha(new Date())} · sesión: ${sesion.email || ""}`;
    pintar();
    cargarCI().catch((e) => toast("Centro de invitaciones: ejecute supabase/invitaciones.sql (" + e.message + ")"));
    cargarModulos().catch((e) => { $("#mod-aviso").textContent = "Módulos de dedicatorias y aportes no disponibles: ejecute supabase/dedicatorias.sql (" + e.message + ")"; });
  }
  $("#recargar").addEventListener("click", () => cargar().then(() => toast("Datos actualizados")).catch((e) => toast(e.message)));

  /* ---------- Indicadores ---------- */
  function pintar() {
    const g = R.general;
    const tile = (n, t, s) => `<div class="adm-tile"><b>${n}</b><span>${t}</span>${s ? `<small>${s}</small>` : ""}</div>`;
    $("#indicadores").innerHTML =
      tile(g.padrinos, "Padrinos y madrinas") + tile(g.padrinosRespondieron, "Padrinos que respondieron") + tile(g.padrinosPendientes, "Padrinos pendientes") +
      tile(g.docentes, "Docentes registrados") + tile(g.egresados, "Egresados registrados") + tile(g.r1, "R1 registrados") + tile(g.r2, "R2 registrados") + tile(g.otros, "Otros invitados registrados") +
      tile(g.invitadosUnicos, "Invitados únicos", "10 padrinos + registrados") + tile(g.respuestas, "Respuestas registradas", "personas con al menos una respuesta") +
      tile(g.asistiranTres, "Asistirán a 3 actividades") + tile(g.asistiranDos, "Asistirán a 2") + tile(g.asistiranUna, "Asistirán a 1") +
      tile(g.graduandos, "Graduandos (anfitriones)", "fuera de las tasas de respuesta");
    $("#n-grad").textContent = g.graduandos;
    const ev = Object.fromEntries(EV.actividades.map((a) => [a.codigo, a]));
    $("#actividades").innerHTML = R.porActividad.map((a) => `
      <article class="adm-act${ev[a.codigo] && ev[a.codigo].social ? " social" : ""}">
        <h3>${esc(a.titulo)}</h3><p class="nota">${esc(ev[a.codigo] ? ev[a.codigo].hora_texto + " · " + ev[a.codigo].lugar : "")}</p>
        <dl>
          <dt>Habilitados</dt><dd>${a.habilitados}</dd><dt>Confirmados</dt><dd>${a.confirmados}</dd>
          <dt>No asistirán</dt><dd>${a.noAsistiran}</dd><dt>Por confirmar</dt><dd>${a.porConfirmar}</dd>
          <dt>Sin responder</dt><dd>${a.sinResponder}</dd><dt class="total">Total previsto</dt><dd class="total">${a.totalPrevisto}</dd>
        </dl>
      </article>`).join("");
    $("#f-act").innerHTML = `<option value="">Cualquier actividad</option>` + D.actividades.map((a) => `<option value="${a.codigo}">${esc(a.titulo)}</option>`).join("");
    pintarTabla(); pintarReglas(); pintarPadrinos();
  }

  /* ---------- Tabla ---------- */
  function filtradas() {
    const q = normal($("#f-buscar").value), cat = $("#f-cat").value, act = $("#f-act").value, est = $("#f-estado").value;
    return R.personas.filter((p) => (!q || normal(p.nombre).includes(q)) && (!cat || p.categoria === cat) &&
      (!est || (act ? p.estados[act] === est : Object.values(p.estados).includes(est))));
  }
  function pintarTabla() {
    const acts = D.actividades;
    const filas = filtradas().map((p) => {
      const reg = p.registro || {};
      const editable = !!p.registro;
      const celdas = acts.map((a) => {
        const e = p.estados[a.codigo];
        if (e === "no_aplica" || !editable) return `<td><span class="estado ${e}">${ETQ[e]}</span></td>`;
        return `<td><select class="estado-sel ${e}" data-reg="${reg.id}" data-act="${a.codigo}" aria-label="${esc(a.titulo)} de ${esc(p.nombre)}">${["sin_responder", "asistira", "no_asistira", "por_confirmar"].map((k) => `<option value="${k}"${k === e ? " selected" : ""}>${ETQ[k]}</option>`).join("")}</select></td>`;
      }).join("");
      const ovReg = p.oficial || p.registro;
      const ov = p.override === true ? "si" : p.override === false ? "no" : "";
      const verif = p.verificado ? '<span class="sello ok">Verificado</span>' : p.respondio ? '<span class="sello">Enlace general</span>' : "—";
      const extras = (p.envios > 1 ? `<span class="sello aviso" title="Varias respuestas recibidas para esta persona">${p.envios} envíos</span>` : "") + (p.duplicado ? `<span class="sello aviso" title="Hay otro registro con el mismo nombre y categoría: revise y elimine el duplicado">Posible duplicado</span>` : "") + (p.nota ? `<span class="sello aviso" title="${esc(p.nota)}">Nota</span>` : "");
      return `<tr>
        <th scope="row"><span class="nom">${esc(p.nombre)}</span> ${extras}${p.nota ? `<small class="nota-reg">${esc(p.nota)}</small>` : ""}</th>
        <td>${CAT[p.categoria] || p.categoria}</td>${celdas}
        <td><select class="ov-sel" data-reg="${ovReg ? ovReg.id : ""}" aria-label="Recepción para ${esc(p.nombre)}"><option value=""${ov === "" ? " selected" : ""}>Según categoría</option><option value="si"${ov === "si" ? " selected" : ""}>Habilitada</option><option value="no"${ov === "no" ? " selected" : ""}>No habilitada</option></select></td>
        <td>${fecha(reg.respondido || (reg.origen !== "oficial" ? reg.creado : null))}</td><td>${fecha(p.respondio ? reg.actualizado : null)}</td><td>${verif}</td>
        <td class="acc">${ovReg ? `<button class="btn mini" data-enlace="${ovReg.id}" data-nombre="${esc(p.nombre)}">Enlace</button>` : ""}${p.tipo === "invitado" ? `<button class="btn mini" data-editar="${reg.id}">Editar</button><button class="btn mini" data-borrar="${reg.id}">Eliminar</button>` : ""}</td>
      </tr>`;
    }).join("");
    $("#tabla").innerHTML = `<thead><tr><th>Nombre</th><th>Categoría</th>${acts.map((a) => `<th>${esc(a.titulo)}</th>`).join("")}<th>Recepción</th><th>Registro</th><th>Última actualización</th><th>Verificación</th><th></th></tr></thead><tbody>${filas || `<tr><td colspan="${acts.length + 7}">Sin resultados</td></tr>`}</tbody>`;
  }
  ["#f-buscar", "#f-cat", "#f-act", "#f-estado"].forEach((s) => $(s).addEventListener("input", pintarTabla));

  $("#tabla").addEventListener("change", async (e) => {
    const s = e.target;
    try {
      if (s.classList.contains("estado-sel")) {
        if (s.value === "sin_responder") await api(`confirmaciones?invitado_id=eq.${s.dataset.reg}&actividad=eq.${s.dataset.act}`, { method: "DELETE" });
        else await api("confirmaciones", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ invitado_id: s.dataset.reg, actividad: s.dataset.act, estado: s.value, actualizado: new Date().toISOString() }) });
        await api(`invitados?id=eq.${s.dataset.reg}`, { method: "PATCH", body: JSON.stringify({ actualizado: new Date().toISOString(), respondido: new Date().toISOString() }) });
      } else if (s.classList.contains("ov-sel") && s.dataset.reg) {
        await api(`invitados?id=eq.${s.dataset.reg}`, { method: "PATCH", body: JSON.stringify({ recepcion_override: s.value === "" ? null : s.value === "si" }) });
      } else return;
      await cargar(); toast("Cambio guardado");
    } catch (err) { toast("No se guardó: " + err.message); }
  });
  $("#tabla").addEventListener("click", async (e) => {
    const b = e.target.closest("button"); if (!b) return;
    try {
      if (b.dataset.enlace) {
        const t = await rpc("admin_generar_enlace", { p_invitado: b.dataset.enlace });
        mostrarEnlace(b.dataset.nombre, t); await cargar();
      } else if (b.dataset.borrar) {
        if (b.dataset.confirmar !== "1") { b.dataset.confirmar = "1"; b.textContent = "¿Confirmar?"; setTimeout(() => { b.dataset.confirmar = ""; b.textContent = "Eliminar"; }, 4000); return; }
        await api(`invitados?id=eq.${b.dataset.borrar}`, { method: "DELETE" }); await cargar(); toast("Registro eliminado");
      } else if (b.dataset.editar) {
        const p = R.personas.find((x) => x.registro && x.registro.id === b.dataset.editar);
        const fila = b.closest("tr");
        fila.querySelector("th").innerHTML = `<form class="adm-edit"><input class="campo" value="${esc(p.nombre)}" maxlength="80" required><select class="campo">${["docente", "egresado", "r1", "r2", "otro"].map((c) => `<option value="${c}"${c === p.categoria ? " selected" : ""}>${CAT[c]}</option>`).join("")}</select><button class="btn mini">Guardar</button></form>`;
        fila.querySelector("form").addEventListener("submit", async (ev) => {
          ev.preventDefault();
          const [n, c] = ev.target.querySelectorAll("input,select");
          try { await api(`invitados?id=eq.${p.registro.id}`, { method: "PATCH", body: JSON.stringify({ nombre: n.value.trim().replace(/\s+/g, " "), categoria: c.value, actualizado: new Date().toISOString() }) }); await cargar(); toast("Registro corregido"); }
          catch (err) { toast("No se guardó: " + err.message); }
        });
      }
    } catch (err) { toast(err.message); }
  });

  /* ---------- Enlaces individuales ---------- */
  function mostrarEnlace(nombre, tok) {
    $("#enlace-para").textContent = "Para: " + nombre;
    $("#enlace-url").value = `${EV.url_publica}#t=${tok}`;
    $("#dlg-enlace").showModal();
  }
  $("#copiar-enlace").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("#enlace-url").value); toast("Enlace copiado"); }
    catch (e) { $("#enlace-url").select(); toast("Seleccionado: copie con Ctrl+C / Copiar"); }
  });
  document.addEventListener("click", (e) => { const c = e.target.closest("[data-cerrar]"); if (c) c.closest("dialog").close(); });
  $("#form-invitado").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const id = await rpc("admin_crear_invitado", { p_nombre: $("#ni-nombre").value, p_categoria: $("#ni-cat").value });
      const t = await rpc("admin_generar_enlace", { p_invitado: id });
      mostrarEnlace($("#ni-nombre").value, t); $("#ni-nombre").value = ""; await cargar();
    } catch (err) { toast(err.message); }
  });

  /* ---------- Habilitación de actividades por categoría ---------- */
  const reglaDe = (cat, act) => { const r = D.habilitaciones.find((h) => h.categoria === cat && h.actividad === act); return r ? !!r.habilitada : act !== "recepcion"; };
  function pintarReglas() {
    const cats = D.categorias.slice().sort((a, b) => ORDEN_CAT.indexOf(a.codigo) - ORDEN_CAT.indexOf(b.codigo));
    $("#reglas").innerHTML = `<div class="adm-tabla-caja"><table class="adm-tabla adm-matriz"><thead><tr><th>Categoría</th>${D.actividades.map((a) => `<th>${esc(a.titulo)}<br><small>${esc(a.hora_texto)}</small></th>`).join("")}</tr></thead><tbody>`
      + cats.map((c) => `<tr><th scope="row">${esc(c.etiqueta)}</th>${D.actividades.map((a) => `<td><label class="adm-regla"><input type="checkbox" data-cat="${c.codigo}" data-act="${a.codigo}"${reglaDe(c.codigo, a.codigo) ? " checked" : ""} aria-label="${esc(c.etiqueta)}: ${esc(a.titulo)}"> <span>${reglaDe(c.codigo, a.codigo) ? "Habilitada" : "No"}</span></label></td>`).join("")}</tr>`).join("")
      + `</tbody></table></div>`;
  }
  $("#reglas").addEventListener("change", async (e) => {
    const c = e.target.dataset.cat, a = e.target.dataset.act; if (!c || !a) return;
    try { await api("habilitaciones", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ categoria: c, actividad: a, habilitada: e.target.checked }) }); await cargar(); toast("Habilitación actualizada"); }
    catch (err) { toast("No se guardó: " + err.message); }
  });

  /* ---------- Padrinos ---------- */
  function pintarPadrinos() {
    $("#padrinos").innerHTML = `<ul class="adm-padrinos">` + D.padrinos.map((p) => `<li><span${p.activo ? "" : ' class="inactivo"'}>${esc(p.nombre)}</span><button class="btn mini" data-activo="${esc(p.id)}" data-valor="${!p.activo}">${p.activo ? "Retirar del selector" : "Volver a mostrar"}</button></li>`).join("") + `</ul>`;
  }
  $("#padrinos").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-activo]"); if (!b) return;
    try { await api(`padrinos?id=eq.${encodeURIComponent(b.dataset.activo)}`, { method: "PATCH", body: JSON.stringify({ activo: b.dataset.valor === "true" }) }); await rpc("admin_sincronizar_padrinos"); await cargar(); toast("Listado actualizado"); }
    catch (err) { toast(err.message); }
  });
  $("#form-padrino").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nombre = $("#np-nombre").value.trim().replace(/\s+/g, " "), apellido = $("#np-apellido").value.trim();
    const id = normal(apellido + "-" + nombre.replace(/^(dra?\.?\s+)/i, "")).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    try { await api("padrinos", { method: "POST", body: JSON.stringify({ id, nombre, apellido }) }); await rpc("admin_sincronizar_padrinos"); $("#np-nombre").value = $("#np-apellido").value = ""; await cargar(); toast("Padrino añadido"); }
    catch (err) { toast(err.message); }
  });

  /* ---------- Exportación CSV (Excel en español: separador «;» y BOM UTF-8) ---------- */
  $("#exportar").addEventListener("click", () => {
    const acts = D.actividades;
    const cab = ["Nombre", "Categoría", ...acts.map((a) => a.titulo), "Recepción (regla)", "Registro", "Última actualización", "Verificación", "Envíos", "Nota"];
    const filas = filtradas().map((p) => [p.nombre, CAT[p.categoria], ...acts.map((a) => ETQ[p.estados[a.codigo]]),
      p.override === null || p.override === undefined ? "Según categoría" : p.override ? "Habilitada" : "No habilitada",
      fecha(p.registro && p.registro.respondido), fecha(p.respondio && p.registro ? p.registro.actualizado : null),
      p.verificado ? "Verificado" : p.respondio ? "Enlace general" : "", p.envios, p.nota]);
    filas.push([], ["Graduandos (anfitriones)", EV.graduandos]);
    R.porActividad.forEach((a) => filas.push([`Total previsto · ${a.titulo}`, a.totalPrevisto]));
    const csv = "﻿" + [cab, ...filas].map((f) => f.map((v) => `"${csvSeguro(v).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `confirmaciones-xxiv-promocion-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  });

  $("#form-borrar").addEventListener("submit", async (e) => {
    e.preventDefault();
    try { const n = await rpc("admin_eliminar_registros", { p_confirmacion: $("#borrar-confirmacion").value }); $("#borrar-confirmacion").value = ""; await cargar(); toast(`${n} registros eliminados`); }
    catch (err) { toast(err.message === "confirmacion_requerida" ? "Escriba ELIMINAR TODO para confirmar" : err.message); }
  });



  /* ---------- Centro de invitaciones ---------- */
  const GRUPO_DE = { padrino: ["padrinos", "Padrinos y madrinas"], docente: ["docentes", "Docentes y egresados"], egresado: ["docentes", "Docentes y egresados"], r1: ["residentes", "Residentes R1 y R2"], r2: ["residentes", "Residentes R1 y R2"], otro: ["otros", "Otros invitados"], graduando: ["especialistas", "Especialistas 2026"] };
  const GRUPOS_COD = [["padrinos", "Padrinos y madrinas"], ["docentes", "Docentes y egresados"], ["residentes", "Residentes R1 y R2"], ["especialistas", "Especialistas 2026"]];
  const ACT_NOM = { clase: "Clase magistral", caravana: "Caravana", recepcion: "Recepción" };
  let CODIGOS = {};           // solo en memoria durante la sesión del panel (nunca en almacenamiento)
  let ENL = new Map();        // id → { token, enviado_en }
  const SEL = new Set();
  const SITIO = () => location.origin + location.pathname.replace(/admin\/?(index\.html)?$/, "");
  const enlaceDe = (id) => { const e = ENL.get(id); return e ? `${SITIO()}#t=${e.token}` : ""; };
  function limpiarCodigos() { CODIGOS = {}; SEL.clear(); ENL = new Map(); }
  const msgInst = (nombre, url) => `${nombre}, has recibido una invitación especial.\nLa XXIV Promoción de Radiólogos de la Universidad de Los Andes desea compartir contigo este momento tan significativo.\n28 de noviembre de 2026.\n${url}\nHay momentos que merecen ser compartidos`;
  function msgRes(cat) {
    const [g, tarjeta] = GRUPO_DE[cat];
    if (g === "otros") return `Acceso · ${tarjeta}\nEste acceso es libre: no requiere contraseña.\n1. Abre la invitación: ${SITIO()}\n2. Elige «${tarjeta}» y disfruta la invitación.`;
    return `Acceso reservado · ${tarjeta}\nContraseña vigente: ${CODIGOS[g]}\n1. Abre la invitación: ${SITIO()}\n2. Elige «${tarjeta}» y escribe la contraseña.\n3. Selecciona tu nombre y disfruta tu invitación.`;
  }
  function personasCI() {
    return (R ? R.personas : []).map((p) => { const reg = p.tipo === "padrino" ? p.oficial : p.registro; return reg ? { id: reg.id, nombre: p.nombre, categoria: p.categoria, acts: p.habilitadas } : null; }).filter(Boolean);
  }
  function visiblesCI() {
    const q = ($("#ci-buscar").value || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(), c = $("#ci-cat").value, e = $("#ci-estado").value;
    return personasCI().filter((p) => (!c || p.categoria === c) && (!q || p.nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().includes(q)) &&
      (!e || (e === "sin" ? !ENL.has(p.id) : e === "vigente" ? ENL.has(p.id) && !ENL.get(p.id).enviado_en : ENL.has(p.id) && !!ENL.get(p.id).enviado_en)));
  }
  const seleccion = () => personasCI().filter((p) => SEL.has(p.id));
  function pintarCI() {
    if (!$("#ci-tabla")) return;
    $("#ci-codigos").innerHTML = GRUPOS_COD.map(([g, t]) => `<div class="ci-cod"><label for="ci-c-${g}">${t}</label><input class="campo" id="ci-c-${g}" type="password" autocomplete="off" ${CODIGOS[g] ? "disabled placeholder=\"validada ✔\"" : ""}><button class="btn" type="button" data-cod="${g}" ${CODIGOS[g] ? "disabled" : ""}>${CODIGOS[g] ? "Validada" : "Validar"}</button></div>`).join("");
    const v = visiblesCI();
    $("#ci-tabla").innerHTML = `<thead><tr><th></th><th>Destinatario</th><th>Categoría</th><th>Actividades autorizadas</th><th>Enlace</th><th>Distribución</th></tr></thead><tbody>` +
      v.map((p) => { const e = ENL.get(p.id); return `<tr><td><input type="checkbox" data-sel="${esc(p.id)}" aria-label="Seleccionar ${esc(p.nombre)}" ${SEL.has(p.id) ? "checked" : ""}></td><td>${esc(p.nombre)}</td><td>${esc(CAT[p.categoria])}</td><td>${p.acts.length ? p.acts.map((a) => esc(ACT_NOM[a] || a)).join(" · ") : "Ninguna"}</td><td>${e ? "Vigente" : "Sin enlace"}</td><td>${e ? (e.enviado_en ? "Enviado " + esc(fecha(e.enviado_en)) : "Sin enviar") : "—"}</td></tr>`; }).join("") + `</tbody>`;
    $("#ci-n").textContent = `${SEL.size} seleccionados de ${personasCI().length}`;
    $("#ci-todos").checked = v.length > 0 && v.every((p) => SEL.has(p.id));
  }
  async function cargarCI() {
    ENL = new Map((await rpc("admin_enlaces")).map((e) => [e.id, e]));
    pintarCI();
  }
  for (const id of ["#ci-buscar", "#ci-cat", "#ci-estado"]) $(id).addEventListener("input", pintarCI);
  $("#ci-todos").addEventListener("change", (e) => { for (const p of visiblesCI()) e.target.checked ? SEL.add(p.id) : SEL.delete(p.id); pintarCI(); });
  $("#ci-tabla").addEventListener("change", (e) => { const c = e.target.closest("[data-sel]"); if (!c) return; c.checked ? SEL.add(c.dataset.sel) : SEL.delete(c.dataset.sel); pintarCI(); });
  $("#ci-codigos").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-cod]"); if (!b) return;
    const g = b.dataset.cod, inp = $("#ci-c-" + g);
    try {
      if (!(await rpc("admin_verificar_codigo", { p_grupo: g, p_codigo: inp.value }))) { toast("La contraseña no coincide con la vigente."); return; }
      CODIGOS[g] = inp.value; inp.value = ""; pintarCI(); toast("Contraseña validada para esta sesión");
    } catch (err) { toast(err.message); }
  });
  const exigirSel = () => { const s = seleccion(); if (!s.length) { toast("Seleccione al menos un destinatario."); return null; } return s; };
  async function asegurarEnlaces(items, regenerar = false) {
    const falt = items.filter((p) => regenerar || !ENL.has(p.id));
    if (!falt.length) return;
    const r = await rpc("admin_generar_enlaces", { p_ids: falt.map((p) => p.id), p_regenerar: regenerar });
    for (const x of r) ENL.set(x.id, { token: x.token, enviado_en: x.nuevo ? null : (ENL.get(x.id) || {}).enviado_en || null });
    await cargarCI();
  }
  $("#ci-generar").addEventListener("click", async () => { const s = exigirSel(); if (!s) return; try { const nuevos = s.filter((p) => !ENL.has(p.id)).length; await asegurarEnlaces(s); toast(`${s.length} enlaces listos (${nuevos} nuevos, ${s.length - nuevos} reutilizados)`); } catch (err) { toast(err.message); } });
  $("#ci-regenerar").addEventListener("click", async () => { const s = exigirSel(); if (!s) return; if (!confirm(`Regenerar ${s.length} enlace(s) invalida los anteriores. ¿Continuar?`)) return; try { await asegurarEnlaces(s, true); toast("Enlaces regenerados"); } catch (err) { toast(err.message); } });
  $("#ci-revocar").addEventListener("click", async () => { const s = exigirSel(); if (!s) return; if (!confirm(`Revocar el enlace de ${s.length} persona(s)? Dejarán de funcionar de inmediato.`)) return; try { const n = await rpc("admin_revocar_enlaces", { p_ids: s.map((p) => p.id) }); await cargarCI(); toast(`${n} enlaces revocados`); } catch (err) { toast(err.message); } });
  function faltanCodigos(items) { return [...new Set(items.map((p) => GRUPO_DE[p.categoria][0]).filter((g) => g !== "otros" && !CODIGOS[g]))]; }
  async function copiarTexto(t, ok) { try { await navigator.clipboard.writeText(t); } catch (e) { const ta = document.createElement("textarea"); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (e2) {} ta.remove(); } toast(ok); }
  $("#ci-copiar-inst").addEventListener("click", async () => { const s = exigirSel(); if (!s) return; try { await asegurarEnlaces(s); await copiarTexto(s.map((p) => msgInst(p.nombre, enlaceDe(p.id))).join("\n\n———\n\n"), `${s.length} mensajes institucionales copiados`); } catch (err) { toast(err.message); } });
  $("#ci-copiar-res").addEventListener("click", async () => { const s = exigirSel(); if (!s) return; const f = faltanCodigos(s); if (f.length) { toast("Valide primero la contraseña de: " + f.join(", ")); return; } await copiarTexto(s.map((p) => `${p.nombre}\n${msgRes(p.categoria)}`).join("\n\n———\n\n"), `${s.length} mensajes de acceso reservado copiados`); });
  $("#ci-colectivos").addEventListener("click", () => {
    const caja = $("#ci-colect-caja"); caja.hidden = !caja.hidden; if (caja.hidden) return;
    caja.innerHTML = `<p class="nota">Mensajes sin nombre ni enlace individual, para grupos o difusión por categoría.</p>` + Object.values(Object.fromEntries(Object.entries(GRUPO_DE).map(([c, [g, t]]) => [g, [c, g, t]]))).map(([c, g, t]) => `<div class="ci-col"><b>${esc(t)}</b><button class="btn" type="button" data-col="inst" data-c="${c}">Copiar institucional</button><button class="btn" type="button" data-col="res" data-c="${c}">Copiar acceso reservado</button></div>`).join("");
  });
  $("#ci-colect-caja").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-col]"); if (!b) return; const c = b.dataset.c, g = GRUPO_DE[c][0];
    if (b.dataset.col === "inst") return copiarTexto(`Has recibido una invitación especial.\nLa XXIV Promoción de Radiólogos de la Universidad de Los Andes desea compartir contigo este momento tan significativo.\n28 de noviembre de 2026.\n${SITIO()}\nHay momentos que merecen ser compartidos`, "Mensaje institucional colectivo copiado");
    if (g !== "otros" && !CODIGOS[g]) return toast("Valide primero la contraseña de " + GRUPO_DE[c][1]);
    copiarTexto(msgRes(c), "Mensaje de acceso reservado copiado");
  });
  // Autorizaciones individuales o masivas (el enlace y las confirmaciones no cambian)
  async function autorizar(acts, modo) {
    const s = exigirSel(); if (!s) return;
    try { const n = await rpc("admin_autorizar", { p_ids: s.map((p) => p.id), p_actividades: acts, p_modo: modo }); await cargar(); toast(`Autorizaciones actualizadas (${n}). Los enlaces siguen vigentes.`); } catch (err) { toast(err.message); }
  }
  $("#ci-aplicar").addEventListener("click", () => autorizar([...document.querySelectorAll("[data-ci-act]:checked")].map((c) => c.dataset.ciAct), "fijar"));
  $("#ci-tres").addEventListener("click", () => { document.querySelectorAll("[data-ci-act]").forEach((c) => { c.checked = true; }); autorizar(["clase", "caravana", "recepcion"], "fijar"); });
  $("#ci-restablecer").addEventListener("click", () => autorizar(null, "restablecer"));
  // CSV (enlaces secretos: manejar con cuidado)
  $("#ci-csv").addEventListener("click", async () => {
    const s = seleccion().length ? seleccion() : visiblesCI(); if (!s.length) return toast("No hay destinatarios.");
    try { await asegurarEnlaces(s); } catch (err) { return toast(err.message); }
    const cab = ["Nombre", "Categoría", "Clase magistral", "Caravana", "Recepción", "Enlace", "Estado de distribución", "Mensaje institucional"];
    const filas = s.map((p) => [p.nombre, CAT[p.categoria], ...["clase", "caravana", "recepcion"].map((a) => (p.acts.includes(a) ? "Autorizada" : "No autorizada")), enlaceDe(p.id), ENL.get(p.id) && ENL.get(p.id).enviado_en ? "Enviado" : "Sin enviar", msgInst(p.nombre, enlaceDe(p.id))]);
    const csv = "﻿" + [cab, ...filas].map((f) => f.map((v) => `"${csvSeguro(v).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `invitaciones-xxiv-promocion-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
    toast("CSV exportado. Contiene enlaces privados: no lo comparta.");
  });
  // WhatsApp consecutivo: los enlaces se generan antes; no hay que volver al panel entre mensajes (sin servicios de pago)
  let COLA = [], IDX = 0;
  const textoWA = (p) => ($("input[name=wa-tipo]:checked").value === "inst" ? msgInst(p.nombre, enlaceDe(p.id)) : msgRes(p.categoria));
  function pintarWA() {
    const dlg = $("#dlg-wa");
    if (IDX >= COLA.length) { $("#wa-progreso").textContent = `Terminado: ${COLA.length} mensajes.`; $("#wa-nombre").textContent = ""; $("#wa-texto").textContent = ""; $("#wa-abrir").disabled = $("#wa-sig").disabled = $("#wa-omitir").disabled = true; return; }
    const p = COLA[IDX];
    $("#wa-progreso").textContent = `Mensaje ${IDX + 1} de ${COLA.length}`; $("#wa-nombre").textContent = `${p.nombre} · ${CAT[p.categoria]}`; $("#wa-texto").textContent = textoWA(p);
    $("#wa-abrir").disabled = $("#wa-sig").disabled = $("#wa-omitir").disabled = false;
  }
  $("#ci-wa").addEventListener("click", async () => {
    const s = exigirSel(); if (!s) return;
    try { await asegurarEnlaces(s); } catch (err) { return toast(err.message); }
    COLA = s; IDX = 0; pintarWA(); $("#dlg-wa").showModal();
  });
  document.querySelectorAll("input[name=wa-tipo]").forEach((r) => r.addEventListener("change", () => { if ($("input[name=wa-tipo]:checked").value === "res") { const f = faltanCodigos(COLA); if (f.length) { toast("Valide primero la contraseña de: " + f.join(", ")); document.querySelector("input[name=wa-tipo][value=inst]").checked = true; } } pintarWA(); }));
  $("#wa-abrir").addEventListener("click", () => { window.open("https://wa.me/?text=" + encodeURIComponent(textoWA(COLA[IDX])), "_blank", "noopener"); });
  $("#wa-sig").addEventListener("click", async () => { try { await rpc("admin_marcar_enviado", { p_ids: [COLA[IDX].id], p_enviado: true }); const e = ENL.get(COLA[IDX].id); if (e) e.enviado_en = new Date().toISOString(); } catch (err) { toast(err.message); } IDX++; pintarWA(); pintarCI(); });
  $("#wa-omitir").addEventListener("click", () => { IDX++; pintarWA(); });
  $("#ci-bitacora-ver").addEventListener("click", async () => {
    const ul = $("#ci-bitacora"); ul.hidden = !ul.hidden; if (ul.hidden) return;
    try { const b = await rpc("admin_bitacora", { p_limite: 50 }); ul.innerHTML = b.map((x) => `<li><b>${esc(fecha(x.cuando))}</b> · ${esc(x.admin || "")} · ${esc(x.accion)} <small>${esc(JSON.stringify(x.detalle))}</small></li>`).join("") || "<li>Sin registros.</li>"; } catch (err) { toast(err.message); }
  });

  /* ---------- Dedicatorias y aportes voluntarios ---------- */
  let DD = [];
  const ESTADO = { pendiente: "Pendiente", aprobado: "Aprobado", rechazado: "Rechazado", oculto: "Oculto" };
  async function cargarModulos() {
    $("#mod-aviso").textContent = "";
    DD = await rpc("admin_dedicatorias");
    const a = await rpc("admin_ajustes");
    pintarDedic();
    const ap = a.aportes || {};
    $("#ap-activo").checked = !!ap.activo;
    for (const k of ["intro", "gracias", "banco", "codigo", "titular", "cedula", "telefono"]) $("#ap-" + k).value = ap[k] || "";
    $("#ts-sitio").value = a.turnstile_sitio || "";
    $("#ts-estado").textContent = a.turnstile_sitio && a.turnstile_secreto_definido ? "Turnstile configurado: el envío de dedicatorias está activo." : "Turnstile incompleto: faltan " + [!a.turnstile_sitio && "la clave de sitio", !a.turnstile_secreto_definido && "la clave secreta"].filter(Boolean).join(" y ") + ". Hasta entonces el formulario permanece cerrado.";
  }
  function pintarDedic() {
    const n = (e) => DD.filter((d) => d.estado === e).length;
    $("#dd-indicadores").innerHTML = [["Recibidas", DD.length], ["Pendientes", n("pendiente")], ["Aprobadas", n("aprobado")], ["Rechazadas", n("rechazado") + n("oculto")]].map(([t, v]) => `<div class="adm-tile"><b>${v}</b><span>${t}</span></div>`).join("");
    const fe = $("#dd-f-estado").value, fd = $("#dd-f-dest").value, fb = $("#dd-f-fecha").value;
    const l = DD.filter((d) => (!fe || d.estado === fe) && (!fd || d.destinatario === fd) && (!fb || (d.creado || "").slice(0, 10) === fb));
    $("#dd-tabla").innerHTML = `<thead><tr><th>Fecha</th><th>Para</th><th>Autor y teléfono</th><th>Mensaje</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>` +
      l.map((d) => `<tr><td>${esc(fecha(d.creado))}</td><td>${esc(d.para)}</td><td>${esc(d.autor)}<br><small>${esc(d.telefono)}</small>${d.duplicados > 0 ? `<br><small class="adm-dup">Posible duplicado (${d.duplicados})</small>` : ""}</td><td>${esc(d.mensaje)}${d.stickers && d.stickers.length ? `<br><small>Stickers: ${esc(d.stickers.join(", "))}</small>` : ""}</td><td>${ESTADO[d.estado]}</td><td class="adm-acc">${["aprobado", "rechazado", "oculto"].filter((e) => e !== d.estado).map((e) => `<button class="btn" type="button" data-dd="${esc(d.id)}" data-e="${e}">${{ aprobado: "Aprobar", rechazado: "Rechazar", oculto: "Ocultar" }[e]}</button>`).join(" ")}</td></tr>`).join("") + `</tbody>`;
    const dests = [...new Map(DD.map((d) => [d.destinatario, d.para])).entries()];
    const cur = $("#dd-f-dest").value;
    $("#dd-f-dest").innerHTML = `<option value="">Todos los destinatarios</option>` + dests.map(([id, t]) => `<option value="${esc(id)}">${esc(t)}</option>`).join("");
    $("#dd-f-dest").value = cur;
  }
  for (const id of ["#dd-f-estado", "#dd-f-dest", "#dd-f-fecha"]) $(id).addEventListener("change", pintarDedic);
  $("#dd-tabla").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-dd]"); if (!b) return;
    try { await rpc("admin_dedicatoria_estado", { p_id: b.dataset.dd, p_estado: b.dataset.e }); const d = DD.find((x) => x.id === b.dataset.dd); if (d) { d.estado = b.dataset.e; if (b.dataset.e === "aprobado" && !d.publicada) d.publicada = new Date().toISOString(); } pintarDedic(); toast("Estado actualizado"); }
    catch (err) { toast(err.message); }
  });
  $("#dd-exportar").addEventListener("click", () => {
    const filas = DD.filter((d) => d.estado === "aprobado").map((d) => [fecha(d.publicada), d.para, d.autor, d.mensaje, (d.stickers || []).join(" ")]);
    const csv = "﻿" + [["Fecha de publicación", "Para", "Autor", "Mensaje", "Stickers"], ...filas].map((f) => f.map((v) => `"${csvSeguro(v).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `dedicatorias-aprobadas-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  });
  $("#form-aportes").addEventListener("submit", async (e) => {
    e.preventDefault();
    const v = { activo: $("#ap-activo").checked };
    for (const k of ["intro", "gracias", "banco", "codigo", "titular", "cedula", "telefono"]) { const t = $("#ap-" + k).value.trim(); if (t) v[k] = t; }
    try { await rpc("admin_definir_aportes", { p_valor: v }); toast("Aportes guardados"); } catch (err) { toast(err.message); }
  });
  $("#form-turnstile").addEventListener("submit", async (e) => {
    e.preventDefault();
    try { await rpc("admin_definir_turnstile", { p_sitio: $("#ts-sitio").value.trim(), p_secreto: $("#ts-secreto").value.trim() }); $("#ts-secreto").value = ""; await cargarModulos(); toast("Turnstile guardado"); } catch (err) { toast(err.message); }
  });

  /* ---------- Inicio ---------- */
  (async () => {
    EV = await (await fetch("../datos/evento.json", { cache: "no-cache" })).json();
    if (!C.supabaseUrl || !C.supabaseAnonKey) {
      $("#acceso-aviso").textContent = "El panel aún no está conectado a la base de datos (falta configurar js/config.js).";
      $("#form-acceso").querySelectorAll("input,button").forEach((x) => (x.disabled = true));
      return;
    }
    try { sesion = JSON.parse(sessionStorage.getItem(CLAVE_SESION) || "null"); } catch (e) {}
    if (sesion) cargar().catch(() => salir());
  })();
})();
