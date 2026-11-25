/* Flujo de la invitación: identificación → variante → tarjeta → programa → confirmación → pase/calendario.
   Todos los datos del evento provienen de datos/evento.json (fuente única).
   La lista de padrinos y la elegibilidad de la recepción se leen de Supabase cuando está configurado
   (administrables desde el panel); si no, se usan los valores de datos/evento.json.             */
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const CLAVE_ID = "invitacion-ula-2026:identidad";
  const ESTADOS = [["asistira", "Asistiré"], ["no_asistira", "No podré asistir"], ["por_confirmar", "Por confirmar"]];
  const normal = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  const limpiar = (v) => String(v || "").replace(/[\u0000-\u001f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 80);
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  let EV = null;           // evento.json
  let CFG = null;          // { padrinos, recepcion, recepcion_padrinos, remoto }
  let ID = null;           // identidad actual
  let servidor = null;     // vista devuelta por el servidor para esta identidad (actividades/respuestas)

  const leerID = () => { try { return JSON.parse(localStorage.getItem(CLAVE_ID) || "null"); } catch (e) { return null; } };
  const guardarID = (v) => { try { localStorage.setItem(CLAVE_ID, JSON.stringify(v)); } catch (e) {} };
  const claveIdentidad = (id) => (id.categoria === "padrino" ? "padrino:" + id.padrinoId : id.categoria + ":" + normal(id.nombre));

  /* ---------- Arranque ---------- */
  async function iniciar() {
    EV = await window.API.evento();
    CFG = { padrinos: EV.padrinos, recepcion: EV.recepcion_por_defecto, recepcion_padrinos: {}, remoto: false };
    pintarLista("");
    if (window.API.configurado) {
      try {
        const c = await window.API.config();
        if (c && Array.isArray(c.padrinos) && c.padrinos.length) {
          CFG = { padrinos: c.padrinos, recepcion: c.recepcion || CFG.recepcion, recepcion_padrinos: c.recepcion_padrinos || {}, remoto: true };
          pintarLista($("#buscar-nombre").value);
        }
      } catch (e) { /* sin conexión: se usa la lista local; la invitación sigue disponible */ }
    }
    // Enlace individual: #t=TOKEN (el fragmento no se envía a servidores ni queda en sus registros)
    const m = location.hash.match(/^#t=([A-Za-z0-9_-]{20,100})$/);
    if (m) {
      history.replaceState(null, "", location.pathname + location.search);
      await usarToken(m[1]);
      return;
    }
    const previo = leerID();
    if (previo && previo.categoria) marcarPrevio(previo);
  }

  /* ---------- Escena 1 · Selector ---------- */
  const lista = $("#lista-nombres"), buscar = $("#buscar-nombre");
  function pintarLista(q) {
    const nq = normal(q);
    const items = CFG.padrinos.filter((p) => !nq || normal(p.nombre).includes(nq));
    lista.innerHTML = items.map((p) => `<li><button type="button" role="option" class="nombre-opcion" data-padrino="${esc(p.id)}">${esc(p.nombre)}</button></li>`).join("")
      + (items.length ? "" : `<li class="sin-resultados">No encontramos «${esc(q)}» en el listado de padrinos y madrinas.</li>`)
      + `<li><button type="button" class="nombre-opcion no-aparece" id="btn-no-aparece">Mi nombre no aparece</button></li>`;
  }
  buscar.addEventListener("input", () => pintarLista(buscar.value));
  lista.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.id === "btn-no-aparece") { mostrarPaso("categoria"); return; }
    const p = CFG.padrinos.find((x) => x.id === b.dataset.padrino);
    if (p) entrar({ categoria: "padrino", padrinoId: p.id, nombre: p.nombre });
  });
  function marcarPrevio(prev) {
    if (prev.categoria === "padrino") { const b = lista.querySelector(`[data-padrino="${CSS.escape(prev.padrinoId)}"]`); if (b) b.classList.add("previo"); }
    else if (prev.categoria !== "general") { $("#campo-nombre").value = prev.nombre || ""; }
  }

  let categoriaElegida = null;
  function mostrarPaso(p) {
    $("#paso-lista").hidden = p !== "lista"; $("#paso-categoria").hidden = p !== "categoria"; $("#paso-token").hidden = p !== "token";
    if (p === "categoria") { const prev = leerID(); if (prev && ["r1", "r2", "otro"].includes(prev.categoria)) elegirCategoria(prev.categoria); }
  }
  function elegirCategoria(c) {
    categoriaElegida = c;
    document.querySelectorAll(".opcion-cat").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.cat === c)));
    $("#form-nombre").hidden = false;
    setTimeout(() => $("#campo-nombre").focus(), 30);
  }
  document.querySelectorAll(".opcion-cat").forEach((b) => b.addEventListener("click", () => elegirCategoria(b.dataset.cat)));
  $("#btn-volver-lista").addEventListener("click", () => mostrarPaso("lista"));
  $("#form-nombre").addEventListener("submit", (e) => {
    e.preventDefault();
    const n = limpiar($("#campo-nombre").value);
    if (n.length < 2 || !categoriaElegida) { $("#campo-nombre").setCustomValidity("Escribe tu nombre y apellido."); $("#campo-nombre").reportValidity(); return; }
    $("#campo-nombre").setCustomValidity("");
    entrar({ categoria: categoriaElegida, nombre: n });
  });
  $("#campo-nombre").addEventListener("input", () => $("#campo-nombre").setCustomValidity(""));
  $("#btn-general").addEventListener("click", () => entrar({ categoria: "general", nombre: "" }));

  async function usarToken(token) {
    try {
      const v = await window.API.miInvitacion(token);
      if (!v) { mostrarPaso("lista"); return; }
      const id = { categoria: v.categoria, padrinoId: v.padrino_id, nombre: v.nombre };
      window.API.recordarToken(claveIdentidad(id), token);
      servidor = v;
      $("#token-saludo").textContent = `Hola, ${v.nombre}.`;
      mostrarPaso("token");
      $("#btn-token-continuar").onclick = () => entrar(id, v);
      $("#btn-token-otro").onclick = () => { servidor = null; mostrarPaso("lista"); };
    } catch (e) { mostrarPaso("lista"); }
  }

  /* ---------- Elegibilidad y variante ---------- */
  function actividadesDe(id) {
    if (servidor && servidor.actividades && id.categoria !== "general") return EV.actividades.filter((a) => servidor.actividades.includes(a.codigo));
    let rec;
    if (id.categoria === "padrino") rec = id.padrinoId in CFG.recepcion_padrinos ? CFG.recepcion_padrinos[id.padrinoId] : CFG.recepcion.padrino;
    else if (id.categoria === "general") rec = false;   // vista sin personalizar: la recepción depende de cada invitación
    else rec = !!CFG.recepcion[id.categoria];
    return EV.actividades.filter((a) => a.codigo !== "recepcion" || rec);
  }
  const varianteDe = (id) => (id.categoria === "general" ? "C" : EV.categorias[id.categoria].variante);

  /* ---------- Escena 2 en adelante ---------- */
  async function entrar(id, vistaServidor) {
    ID = id; guardarID(id);
    if (vistaServidor) servidor = vistaServidor;
    else {
      servidor = null;
      const tok = id.categoria !== "general" && window.API.tokenDe(claveIdentidad(id));
      if (tok) { try { servidor = await window.API.miInvitacion(tok); } catch (e) {} }
    }
    const acts = actividadesDe(id);
    const v = varianteDe(id), n = acts.some((a) => a.codigo === "recepcion") ? 3 : 2;

    // Textos alternativos accesibles de la tarjeta, desde la fuente única
    window.__ALT = {
      portada: "Portada de la invitación de la XXIV Promoción de Radiólogos, " + EV.fecha_texto + ".",
      interior: "Interior de la invitación. " + EV.fecha_tarjeta + ". " + acts.map((a) => `${a.hora_texto}, ${a.titulo}, ${a.lugar}`).join(". ") + ".",
      contra: "Contraportada de la invitación. XXIV Promoción de Radiólogos, Universidad de Los Andes, 2026.",
    };
    window.Tarjeta.configurar(v, n);

    // Saludo
    const corto = id.nombre ? id.nombre.split(" ").slice(0, id.categoria === "padrino" ? 3 : 2).join(" ") : "";
    $("#saludo-eyebrow").textContent = id.categoria === "general" ? "Invitación especial" : EV.categorias[id.categoria].etiqueta;
    $("#saludo-nombre").textContent = id.nombre || EV.promocion;
    const plantilla = EV.variantes[v];
    $("#saludo-texto").textContent = id.nombre ? plantilla.saludo.replace("{nombre}", id.nombre) : plantilla.saludo_general;
    window.Tarjeta.fijarNombre(corto);

    pintarPrograma(acts);
    pintarRSVP(acts);
    pintarConservar(v, n, acts);
    paseCache = null;

    const bv = $("#bienvenida");
    bv.classList.add("saliendo"); bv.setAttribute("aria-hidden", "true");
    $("#experiencia").removeAttribute("aria-hidden");
    setTimeout(() => { bv.hidden = true; }, 650);
    window.scrollTo(0, 0);
    window.Tarjeta.mostrar();
  }
  $("#btn-cambiar-nombre").addEventListener("click", () => {
    window.Tarjeta.detener();
    const bv = $("#bienvenida"); bv.hidden = false; bv.removeAttribute("aria-hidden");
    requestAnimationFrame(() => bv.classList.remove("saliendo"));
    $("#experiencia").setAttribute("aria-hidden", "true");
    mostrarPaso("lista"); buscar.value = ""; pintarLista(""); if (ID) marcarPrevio(ID);
  });

  /* ---------- Programa ---------- */
  function pintarPrograma(acts) {
    $("#programa-fecha").textContent = EV.fecha_texto + " · " + EV.ciudad;
    $("#programa").innerHTML = acts.map((a) => `
      <li class="momento${a.social ? " social" : ""}">
        <time datetime="${a.inicio}">${esc(a.hora_texto)}</time>
        <div><strong>${esc(a.titulo)}</strong><span>${esc(a.detalle)}</span>${a.social ? '<em class="etiqueta-social">Celebración social</em>' : ""}</div>
      </li>`).join("");
  }

  /* ---------- Confirmación (RSVP) ---------- */
  const form = $("#form-rsvp"), estado = $("#rsvp-estado"), btn = $("#btn-rsvp");
  function pintarRSVP(acts) {
    const caja = $("#rsvp-actividades"), seccion = $("#rsvp");
    estado.textContent = ""; estado.className = "rsvp-estado";
    if (ID.categoria === "general") {
      caja.innerHTML = `<p class="nota">Para confirmar tu asistencia, identifícate con tu nombre.</p><button class="btn" type="button" id="rsvp-identificar">Identificarme</button>`;
      $("#rsvp-identificar").onclick = () => $("#btn-cambiar-nombre").click();
      btn.hidden = true; $("#rsvp-nota-caja").hidden = true; return;
    }
    btn.hidden = false;
    const resp = (servidor && servidor.respuestas) || {};
    caja.innerHTML = acts.map((a) => `
      <fieldset class="rsvp-act${a.social ? " social" : ""}">
        <legend><b>${esc(a.titulo)}</b><span>${esc(EV.fecha_tarjeta)} · ${esc(a.hora_texto)} · ${esc(a.lugar)}</span></legend>
        <div class="opciones-rsvp">${ESTADOS.map(([k, t]) => `<label><input type="radio" name="r-${a.codigo}" value="${k}"${resp[a.codigo] === k ? " checked" : ""}><span>${t}</span></label>`).join("")}</div>
      </fieldset>`).join("");
    $("#rsvp-nota-caja").hidden = ID.categoria !== "otro";
    btn.textContent = servidor && Object.keys(resp).length ? "Actualizar mi confirmación" : "Guardar mi confirmación";
    if (servidor && Object.keys(resp).length) { estado.textContent = `Tu respuesta está registrada (última actualización: ${new Date(servidor.actualizado).toLocaleString("es-VE", { dateStyle: "medium", timeStyle: "short" })}). Puedes modificarla.`; }
    if (!window.API.configurado) {
      estado.textContent = "La confirmación en línea todavía no está habilitada. Puedes ver tu invitación, descargar tu pase y guardar las fechas.";
      estado.className = "rsvp-estado aviso"; btn.disabled = true;
    }
    seccion.hidden = false;
  }
  const MENSAJES = {
    sin_backend: "La confirmación en línea todavía no está habilitada.",
    sin_conexion: "No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo; tu respuesta no se ha guardado.",
    demasiadas_solicitudes: "Se recibieron demasiadas solicitudes desde esta conexión. Inténtalo en unos minutos.",
    token_invalido: "No pudimos verificar tu registro anterior. Vuelve a guardar para crear uno nuevo.",
    nombre_invalido: "Revisa tu nombre y apellido.",
  };
  let enviando = false;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (enviando || !ID || ID.categoria === "general") return;
    const respuestas = {};
    form.querySelectorAll("fieldset.rsvp-act").forEach((f) => { const r = f.querySelector("input:checked"); if (r) respuestas[r.name.slice(2)] = r.value; });
    if (!Object.keys(respuestas).length) { estado.textContent = "Elige una opción en al menos una actividad."; estado.className = "rsvp-estado error"; return; }
    enviando = true; btn.disabled = true; estado.className = "rsvp-estado"; estado.textContent = "Guardando…";
    const clave = claveIdentidad(ID);
    let token = window.API.tokenDe(clave);
    try {
      let r;
      try {
        r = await window.API.guardar({ token, categoria: ID.categoria, padrinoId: ID.padrinoId, nombre: ID.nombre, respuestas, trampa: $("#rsvp-web").value, nota: $("#rsvp-nota").value });
      } catch (err) {
        if (err.codigo === "token_invalido") { token = null; r = await window.API.guardar({ categoria: ID.categoria, padrinoId: ID.padrinoId, nombre: ID.nombre, respuestas, trampa: $("#rsvp-web").value, nota: $("#rsvp-nota").value }); }
        else throw err;
      }
      if (r && r.token) window.API.recordarToken(clave, r.token);
      if (!r || !r.invitacion) throw Object.assign(new Error("error_servidor"), { codigo: "error_servidor" });
      servidor = r.invitacion;
      const nombre = servidor.nombre.split(" ").slice(0, 3).join(" ");
      estado.textContent = `Gracias, ${nombre}. Hemos registrado tu respuesta.`;
      estado.className = "rsvp-estado exito";
      btn.textContent = "Actualizar mi confirmación";
    } catch (err) {
      estado.textContent = MENSAJES[err.codigo] || "No se pudo guardar tu respuesta. Inténtalo de nuevo en unos minutos.";
      estado.className = "rsvp-estado error";
    } finally { enviando = false; btn.disabled = !window.API.configurado; }
  });

  /* ---------- Conservar: calendario, mapas, descarga ---------- */
  const local = (iso) => iso.slice(0, 19).replace(/[-:]/g, "");
  function pintarConservar(v, n, acts) {
    const d = $("#descarga-invitacion");
    d.href = `assets/descargas/invitacion-${v}-${n}.pdf`;
    d.setAttribute("download", `invitacion-xxiv-promocion-radiologos-${v.toLowerCase()}.pdf`);
    $("#cal-ics").innerHTML = `<a class="btn btn-primario" href="assets/calendario/jornada-${n}-actividades.ics" download>Todas mis actividades <small style="color:inherit">${acts.length} eventos</small></a>`
      + acts.map((a) => `<a class="btn" href="assets/calendario/${a.codigo}.ics" download>${esc(a.titulo)} <small>${esc(a.hora_texto)}</small></a>`).join("");
    $("#cal-google").innerHTML = acts.map((a) => {
      const q = new URLSearchParams({ action: "TEMPLATE", text: `${a.titulo} · ${EV.promocion} ULA`, dates: local(a.inicio) + "/" + local(a.inicio), ctz: EV.zona_horaria, location: a.lugar + ", " + EV.ciudad, details: `${a.detalle}\n${EV.lema}` });
      return `<a class="btn" target="_blank" rel="noopener noreferrer" href="https://calendar.google.com/calendar/render?${q}">${esc(a.titulo)} <small>abre Google</small></a>`;
    }).join("");
    $("#mapas").innerHTML = acts.map((a) => `<a class="btn" target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps/search/?api=1&amp;query=${encodeURIComponent(a.mapa)}">${esc(a.titulo)} <small>${esc(a.lugar)}</small></a>`).join("");
  }

  /* ---------- Pase digital ---------- */
  let paseCache = null, paseURL = null;
  const paseEstado = $("#pase-estado");
  function datosPase() {
    const acts = actividadesDe(ID);
    return {
      nombre: ID.categoria === "general" ? "" : (servidor && servidor.nombre) || ID.nombre,
      categoria: ID.categoria === "general" ? "INVITADO ESPECIAL" : EV.categorias[ID.categoria].pase,
      actividades: acts, fecha_corta: EV.fecha_corta, ciudad: EV.ciudad,
    };
  }
  async function prepararPase() {
    if (paseCache) return paseCache;
    paseEstado.textContent = "Preparando tu pase…";
    try {
      paseCache = await window.Pase.dibujar(datosPase());
      const b = await window.Pase.aBlob(window.Pase.escalar(paseCache, 720), "image/jpeg", 0.9);
      if (paseURL) URL.revokeObjectURL(paseURL);
      paseURL = URL.createObjectURL(b); $("#pase-vista").src = paseURL;
      paseEstado.textContent = "";
    } catch (e) { paseEstado.textContent = "No se pudo preparar el pase. Recarga la página e inténtalo de nuevo."; }
    return paseCache;
  }
  document.addEventListener("dialogo-abierto", (e) => { if (e.detail === "dlg-pase") prepararPase(); });
  async function descargarPase(tipo) {
    const c = await prepararPase(); if (!c) return;
    paseEstado.textContent = "Generando archivo…";
    try {
      let blob, archivo;
      if (tipo === "png") { blob = await window.Pase.aBlob(c, "image/png"); archivo = "pase-xxiv-promocion-radiologos.png"; }
      else if (tipo === "movil") { blob = await window.Pase.aBlob(window.Pase.escalar(c, 1080), "image/jpeg", 0.9); archivo = "pase-xxiv-promocion-radiologos-movil.jpg"; }
      else { blob = await window.Pase.pdfDesdeCanvas(c); archivo = "pase-xxiv-promocion-radiologos.pdf"; }
      const r = await window.Pase.guardar(blob, archivo);
      paseEstado.textContent = r === "cancelado" ? "" : r === "compartido" ? "Listo. Elige «Guardar imagen» o la aplicación de destino." : "Archivo generado. Si no aparece, mantén presionada la imagen y elige «Guardar imagen».";
    } catch (e) { paseEstado.textContent = "No se pudo generar el archivo. Mantén presionada la imagen para guardarla."; }
  }
  $("#pase-png").addEventListener("click", () => descargarPase("png"));
  $("#pase-movil").addEventListener("click", () => descargarPase("movil"));
  $("#pase-pdf").addEventListener("click", () => descargarPase("pdf"));

  window.__flujo = { get identidad() { return ID && { categoria: ID.categoria, variante: ID && varianteDe(ID) }; }, get actividades() { return ID ? actividadesDe(ID).map((a) => a.codigo) : []; } };
  iniciar();
})();
