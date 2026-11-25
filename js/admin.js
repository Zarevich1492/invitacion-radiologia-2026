/* Panel administrativo: Supabase Auth (correo + contraseña) y PostgREST con el token del organizador.
   Toda la protección real está en la base de datos (RLS + tabla administradores). */
(function () {
  "use strict";
  const C = window.CONFIG || {};
  const $ = (s) => document.querySelector(s);
  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const normal = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const fecha = (v) => (v ? new Date(v).toLocaleString("es-VE", { dateStyle: "short", timeStyle: "short" }) : "—");
  const ETQ = { asistira: "Asistirá", no_asistira: "No asistirá", por_confirmar: "Por confirmar", sin_responder: "Sin responder", no_aplica: "No aplica" };
  const CAT = { padrino: "Padrino/Madrina", r1: "R1", r2: "R2", otro: "Otro invitado" };
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
  function salir() { sesion = null; try { sessionStorage.removeItem(CLAVE_SESION); } catch (e) {} $("#panel").hidden = true; $("#acceso").hidden = false; $("#salir").hidden = true; }
  $("#salir").addEventListener("click", salir);

  /* ---------- Carga ---------- */
  async function cargar() {
    const [invitados, padrinos, categorias, actividades, soyAdmin] = await Promise.all([
      api("invitados?select=id,categoria,padrino_id,nombre,origen,token_admin,verificado,recepcion_override,nota_omision,creado,actualizado,respondido,confirmaciones(actividad,estado,actualizado)&order=creado.asc"),
      api("padrinos?select=*&order=apellido.asc,nombre.asc"),
      api("categorias?select=*"),
      api("actividades?select=*&order=orden.asc"),
      rpc("es_admin"),
    ]);
    if (!soyAdmin) { salir(); $("#acceso-aviso").textContent = "Esta cuenta no figura como organizadora. Pida que la añadan a la tabla «administradores»."; return; }
    D = { invitados, padrinos, categorias, actividades };
    R = window.Metricas.calcular(D, EV.graduandos);
    $("#acceso").hidden = true; $("#panel").hidden = false; $("#salir").hidden = false;
    $("#actualizado").textContent = `Datos al ${fecha(new Date())} · sesión: ${sesion.email || ""}`;
    pintar();
  }
  $("#recargar").addEventListener("click", () => cargar().then(() => toast("Datos actualizados")).catch((e) => toast(e.message)));

  /* ---------- Indicadores ---------- */
  function pintar() {
    const g = R.general;
    const tile = (n, t, s) => `<div class="adm-tile"><b>${n}</b><span>${t}</span>${s ? `<small>${s}</small>` : ""}</div>`;
    $("#indicadores").innerHTML =
      tile(g.padrinos, "Padrinos y madrinas") + tile(g.padrinosRespondieron, "Padrinos que respondieron") + tile(g.padrinosPendientes, "Padrinos pendientes") +
      tile(g.r1, "R1 registrados") + tile(g.r2, "R2 registrados") + tile(g.otros, "Otros invitados registrados") +
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
      const extras = (p.envios > 1 ? `<span class="sello aviso" title="Varias respuestas recibidas para esta persona">${p.envios} envíos</span>` : "") + (p.nota ? `<span class="sello aviso" title="${esc(p.nota)}">Nota</span>` : "");
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
        fila.querySelector("th").innerHTML = `<form class="adm-edit"><input class="campo" value="${esc(p.nombre)}" maxlength="80" required><select class="campo">${["r1", "r2", "otro"].map((c) => `<option value="${c}"${c === p.categoria ? " selected" : ""}>${CAT[c]}</option>`).join("")}</select><button class="btn mini">Guardar</button></form>`;
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

  /* ---------- Reglas de recepción ---------- */
  function pintarReglas() {
    $("#reglas").innerHTML = D.categorias.sort((a, b) => ["padrino", "r1", "r2", "otro"].indexOf(a.codigo) - ["padrino", "r1", "r2", "otro"].indexOf(b.codigo)).map((c) =>
      `<label class="adm-regla"><input type="checkbox" data-cat="${c.codigo}"${c.recepcion_habilitada ? " checked" : ""}> ${esc(c.etiqueta)}</label>`).join("");
  }
  $("#reglas").addEventListener("change", async (e) => {
    const c = e.target.dataset.cat; if (!c) return;
    try { await api(`categorias?codigo=eq.${c}`, { method: "PATCH", body: JSON.stringify({ recepcion_habilitada: e.target.checked }) }); await cargar(); toast("Regla de recepción actualizada"); }
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
    const csv = "﻿" + [cab, ...filas].map((f) => f.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `confirmaciones-xxiv-promocion-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  });

  $("#form-borrar").addEventListener("submit", async (e) => {
    e.preventDefault();
    try { const n = await rpc("admin_eliminar_registros", { p_confirmacion: $("#borrar-confirmacion").value }); $("#borrar-confirmacion").value = ""; await cargar(); toast(`${n} registros eliminados`); }
    catch (err) { toast(err.message === "confirmacion_requerida" ? "Escriba ELIMINAR TODO para confirmar" : err.message); }
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
