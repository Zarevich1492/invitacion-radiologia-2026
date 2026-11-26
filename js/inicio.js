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
  const claveIdentidad = (id) => (id.categoria === "padrino" ? "padrino:" + id.padrinoId : id.categoria === "graduando" ? "graduando:" + id.graduandoId : id.categoria + ":" + normal(id.nombre));

  /* ---------- Arranque ---------- */
  async function iniciar() {
    EV = await window.API.evento();
    CFG = { padrinos: EV.padrinos, habilitaciones: EV.habilitacion_por_defecto, recepcion_padrinos: {}, remoto: false };
    pintarLista("");
    if (window.API.configurado) {
      try {
        const c = await window.API.config();
        if (c && Array.isArray(c.actividades) && c.actividades.length) {
          CFG = { padrinos: EV.padrinos, habilitaciones: Object.assign({}, CFG.habilitaciones, c.habilitaciones || {}), recepcion_padrinos: c.recepcion_padrinos || {}, remoto: true };
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
    if (b.id === "btn-no-aparece") { mostrarPaso("acceso", true); return; }
    const p = CFG.padrinos.find((x) => x.id === b.dataset.padrino);
    if (p) entrar({ categoria: "padrino", padrinoId: p.id, nombre: p.nombre });
  });
  function marcarPrevio(prev) {
    if (prev.categoria === "padrino") { const b = lista.querySelector(`[data-padrino="${CSS.escape(prev.padrinoId)}"]`); if (b) b.classList.add("previo"); }
    else if (prev.categoria !== "general") { $("#campo-nombre").value = prev.nombre || ""; }
  }

  /* ---------- Acceso por código (el servidor valida el hash; la sesión es temporal) ---------- */
  const GRUPOS = {
    padrinos: { titulo: "Padrinos y madrinas", sub: "Invitados de honor" },
    docentes: { titulo: "Familia radiológica", sub: "Quienes hacen posible nuestra historia" },
    residentes: { titulo: "Residentes R1 y R2", sub: "Compañeros del posgrado" },
    especialistas: { titulo: "Especialistas 2026", sub: "Integrantes de la XXIV Promoción" },
  };
  let grupoActual = null;
  const MSG_CODIGO = {
    codigo_incorrecto: "El código no es correcto. Revísalo e inténtalo de nuevo.",
    bloqueado: "Demasiados intentos desde esta conexión. Espera unos minutos e inténtalo de nuevo.",
    sin_conexion: "No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.",
    sin_backend: "El acceso con código no está disponible por ahora.",
  };
  async function abrirGrupo(g) {
    grupoActual = g;
    if (g === "otros") {
      try { await window.API.acceso("otros", null); } catch (e) { /* «Otros» ve la tarjeta y el programa aunque no haya conexión */ }
      return mostrarAcceso("otros");
    }
    const prev = window.API.sesion();
    if (prev && prev.grupo === g) { try { const r = await window.API.estadoSesion(); if (r && r.ok && r.grupo === g) return seguirTrasCodigo(g); } catch (e) {} }
    $("#codigo-titulo").textContent = GRUPOS[g].titulo; $("#codigo-sub").textContent = "Escribe el código que recibiste con tu invitación.";
    $("#campo-codigo").value = ""; $("#codigo-estado").textContent = ""; $("#codigo-estado").className = "rsvp-estado";
    $("#campo-codigo").type = "password"; $("#ver-codigo").textContent = "Mostrar"; $("#ver-codigo").setAttribute("aria-pressed", "false");
    mostrarPaso("codigo"); setTimeout(() => $("#campo-codigo").focus(), 30);
  }
  $("#ver-codigo").addEventListener("click", () => {
    const c = $("#campo-codigo"), ver = c.type === "password";
    c.type = ver ? "text" : "password"; $("#ver-codigo").textContent = ver ? "Ocultar" : "Mostrar"; $("#ver-codigo").setAttribute("aria-pressed", String(ver));
  });
  $("#btn-volver-inicio").addEventListener("click", () => { window.API.cerrarSesion(); grupoActual = null; mostrarPaso("acceso"); });
  let validando = false;
  $("#form-codigo").addEventListener("submit", async (e) => {
    e.preventDefault();
    const est = $("#codigo-estado"), cod = $("#campo-codigo").value;
    if (validando) return;
    if (!cod.trim()) { est.textContent = "Escribe tu código de acceso."; est.className = "rsvp-estado error"; return; }
    validando = true; $("#btn-ingresar").disabled = true; est.className = "rsvp-estado"; est.textContent = "Verificando…";
    try {
      const r = await window.API.acceso(grupoActual, cod.trim());
      if (r && r.ok) { $("#campo-codigo").value = ""; est.textContent = ""; await seguirTrasCodigo(grupoActual); }
      else { est.textContent = MSG_CODIGO[r && r.motivo] || MSG_CODIGO.codigo_incorrecto; est.className = "rsvp-estado error"; $("#campo-codigo").select(); }
    } catch (err) { est.textContent = MSG_CODIGO[err.codigo] || MSG_CODIGO.sin_conexion; est.className = "rsvp-estado error"; }
    finally { validando = false; $("#btn-ingresar").disabled = false; }
  });
  // Tras el código: identificación según el grupo (nombres desde el servidor; respaldo local)
  // Respeta el orden oficial de evento.json; si el servidor devuelve la lista, solo se muestran sus nombres
  function ordenarComoEvento(servidorLista, local) {
    if (!Array.isArray(servidorLista) || !servidorLista.length) return local;
    const idx = (id) => { const i = local.findIndex((x) => x.id === id); return i < 0 ? 999 : i; };
    return servidorLista.slice().sort((a, b) => idx(a.id) - idx(b.id));
  }
  async function seguirTrasCodigo(g) {
    let nombres = null;
    if (g === "padrinos" || g === "especialistas") { try { nombres = await window.API.listaNombres(); } catch (e) {} }
    if (g === "padrinos") {
      CFG.padrinos = ordenarComoEvento(nombres, EV.padrinos).map((p) => ({ id: p.id, nombre: p.nombre })); buscar.value = ""; pintarLista(""); mostrarPaso("lista"); setTimeout(() => buscar.focus(), 30);
    } else if (g === "especialistas") {
      $("#lista-graduandos").innerHTML = ordenarComoEvento(nombres, EV.graduandos_lista).map((x) => `<li><button type="button" role="option" class="nombre-opcion" data-graduando="${esc(x.id)}">${esc(x.nombre)}</button></li>`).join("");
      mostrarPaso("graduando");
    } else mostrarAcceso(g);
  }
  // Dedicatorias y aportes: públicos, sin código. El visitante ve la tarjeta general y la sección elegida.
  document.querySelectorAll("[data-visitante]").forEach((b) => b.addEventListener("click", async () => {
    const v = b.dataset.visitante;
    location.hash = "dedicatorias";
    await entrar({ categoria: "otro", nombre: "", visitante: true });
  }));
  $("#lista-graduandos").addEventListener("click", (e) => {
    const b = e.target.closest("[data-graduando]"); if (!b) return;
    const g = EV.graduandos_lista.find((x) => x.id === b.dataset.graduando);
    if (g) entrar({ categoria: "graduando", graduandoId: g.id, nombre: g.nombre });
  });

  let categoriaElegida = null;
  function mostrarPaso(p, aviso) {
    for (const n of ["acceso", "codigo", "lista", "categoria", "graduando"]) $("#paso-" + n).hidden = p !== n;
    if (p === "acceso") $("#acceso-pregunta").textContent = aviso ? "Tu nombre no aparece en el listado de padrinos. Elige cómo nos acompañas:" : "¿Cómo nos acompañas en esta celebración?";
  }
  // Subcategorías por acceso (la categoría final se guarda como docente [= Familia radiológica], r1, r2 u otro; los registros «egresado» anteriores se conservan)
  const ACCESOS = {
    docentes: { pregunta: "Familia radiológica", opciones: null, categoria: "docente" },   // una sola comunidad: sin subdivisiones (código interno «docente»)
    residentes: { pregunta: "Residentes R1 y R2", opciones: [["r1", "Residente de primer año", "R1 · Postgrado de Radiología"], ["r2", "Residente de segundo año", "R2 · Postgrado de Radiología"]] },
    otros: { pregunta: "Invitados especiales", opciones: null, categoria: "otro" },
  };
  function mostrarAcceso(id) {
    const a = ACCESOS[id]; categoriaElegida = null;
    $("#categoria-pregunta").textContent = a.pregunta;
    $("#opciones-cat").hidden = !a.opciones;
    $("#opciones-cat").innerHTML = (a.opciones || []).map(([c, t, d]) => `<button class="opcion-cat" type="button" role="radio" aria-checked="false" data-cat="${c}"><b>${t}</b><span>${d}</span></button>`).join("");
    $("#form-nombre").hidden = true; $("#campo-nombre").value = "";
    mostrarPaso("categoria");
    const previo = leerID();
    if (!a.opciones) elegirCategoria(a.categoria);
    else if (previo && a.opciones.some((o) => o[0] === previo.categoria)) { elegirCategoria(previo.categoria); $("#campo-nombre").value = previo.nombre || ""; }
  }
  function elegirCategoria(c) {
    categoriaElegida = c;
    document.querySelectorAll(".opcion-cat").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.cat === c)));
    $("#form-nombre").hidden = false;
    setTimeout(() => $("#campo-nombre").focus(), 30);
  }
  $("#opciones-cat").addEventListener("click", (e) => { const b = e.target.closest(".opcion-cat"); if (b) elegirCategoria(b.dataset.cat); });
  document.querySelectorAll(".acceso").forEach((b) => b.addEventListener("click", () => abrirGrupo(b.dataset.acceso)));
  for (const id of ["btn-volver-acceso-1", "btn-volver-lista", "btn-volver-lista-2"]) $("#" + id).addEventListener("click", () => mostrarPaso("acceso"));
  $("#form-nombre").addEventListener("submit", (e) => {
    e.preventDefault();
    const n = limpiar($("#campo-nombre").value);
    if (n.length < 2 || !categoriaElegida) { $("#campo-nombre").setCustomValidity("Escribe tu nombre completo."); $("#campo-nombre").reportValidity(); return; }
    $("#campo-nombre").setCustomValidity("");
    entrar({ categoria: categoriaElegida, nombre: n });
  });
  $("#campo-nombre").addEventListener("input", () => $("#campo-nombre").setCustomValidity(""));

  // Pretarjeta: sobre crema con sello XXIV. Se muestra SIEMPRE al abrir un enlace individual válido (aunque haya sesión previa),
  // con el nombre recuperado de Supabase, y solo entonces se pasa a la tarjeta tridimensional.
  const sinMovimiento = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const espera = (ms) => new Promise((r) => setTimeout(r, sinMovimiento() ? 0 : ms));
  function salirDelSobre() { document.documentElement.classList.remove("modo-sobre"); }
  async function usarToken(token) {
    const esc = $("#sobre-escena");
    try {
      const v = await window.API.miInvitacion(token);
      if (!v) { salirDelSobre(); mostrarPaso("acceso"); $("#acceso-pregunta").textContent = "Este enlace de invitación ya no está vigente. Elige cómo nos acompañas:"; return; }
      const id = { categoria: v.categoria, padrinoId: v.padrino_id, nombre: v.nombre };
      window.API.recordarToken(claveIdentidad(id), token);
      servidor = v;
      document.documentElement.classList.add("modo-sobre");
      $("#token-saludo").textContent = v.nombre;
      esc.classList.remove("cargando");
      const btn = $("#btn-token-continuar"); btn.disabled = false; btn.focus({ preventScroll: true });
      btn.onclick = async () => {
        btn.disabled = true; esc.classList.add("abierto");           // el sobre se abre
        await espera(1250);
        await entrar(id, v);                                          // prepara la tarjeta 3D detrás del sobre
        esc.classList.add("saliendo");                                // transición suave hacia la tarjeta
        await espera(750);
        salirDelSobre(); esc.classList.remove("saliendo", "abierto"); esc.classList.add("cargando");
      };
      $("#btn-token-otro").onclick = () => { servidor = null; salirDelSobre(); mostrarPaso("acceso"); };
    } catch (e) { salirDelSobre(); mostrarPaso("acceso"); }
  }
  // Un enlace individual pegado en una pestaña ya abierta: se recarga para mostrar siempre el sobre
  addEventListener("hashchange", () => { if (/^#t=[A-Za-z0-9_-]{20,100}$/.test(location.hash)) location.reload(); });

  /* ---------- Elegibilidad y variante ---------- */
  function actividadesDe(id) {
    if (id.categoria === "graduando") return EV.actividades.slice();
    if (servidor && servidor.actividades && id.categoria !== "general") return EV.actividades.filter((a) => servidor.actividades.includes(a.codigo));
    const reglas = (CFG.habilitaciones && CFG.habilitaciones[id.categoria]) || {};
    return EV.actividades.filter((a) => {
      if (id.categoria === "general") return a.codigo !== "recepcion";   // vista sin personalizar: la recepción no se asume
      if (a.codigo === "recepcion" && id.categoria === "padrino" && id.padrinoId in CFG.recepcion_padrinos) return !!CFG.recepcion_padrinos[id.padrinoId];
      return reglas[a.codigo] === undefined ? a.codigo !== "recepcion" : !!reglas[a.codigo];   // sin regla: la recepción no se asume
    });
  }
  // Denominación personalizada: «Madrina de promoción» o «Padrino de promoción» (nunca ambas)
  function denominacionPadrino(id) { const p = EV.padrinos.find((x) => x.id === id.padrinoId); return p && p.denominacion ? p.denominacion : (/^Dra\./.test(id.nombre || "") ? "MADRINA DE PROMOCIÓN" : "PADRINO DE PROMOCIÓN"); }
  function etiquetaCategoria(id) {
    if (id.categoria === "general") return "Invitación especial";
    if (id.categoria === "padrino") { const d = denominacionPadrino(id).toLowerCase(); return d.charAt(0).toUpperCase() + d.slice(1); }
    return EV.categorias[id.categoria].etiqueta;
  }
  const varianteDe = (id) => (id.categoria === "general" ? "C" : EV.categorias[id.categoria].variante);

  /* ---------- Escena 2 en adelante ---------- */
  async function entrar(id, vistaServidor) {
    ID = id; if (!id.visitante) guardarID(id);
    if (vistaServidor) servidor = vistaServidor;
    else {
      servidor = null;
      const tok = id.categoria !== "general" && window.API.tokenDe(claveIdentidad(id));
      if (tok) { try { servidor = await window.API.miInvitacion(tok); } catch (e) {} }
    }
    const acts = actividadesDe(id);
    const v = varianteDe(id), n = acts.some((a) => a.codigo === "recepcion") ? 3 : 2;
    document.body.classList.toggle("rol-graduando", id.categoria === "graduando");

    // Textos alternativos accesibles de la tarjeta, desde la fuente única
    window.__ALT = {
      portada: "Portada de la invitación de la XXIV Promoción de Radiólogos, " + EV.fecha_texto + ".",
      interior: "Interior de la invitación. " + EV.fecha_tarjeta + ". " + acts.map((a) => `${a.hora_texto}, ${a.titulo}, ${a.lugar}`).join(". ") + ".",
      contra: "Contraportada de la invitación. XXIV Promoción de Radiólogos, Universidad de Los Andes, 2026.",
    };
    if (id.categoria !== "graduando") window.Tarjeta.configurar(v, n);   // los graduandos van directo a su listón

    // Saludo
    const corto = id.nombre ? id.nombre.split(" ").slice(0, id.categoria === "padrino" ? 3 : 2).join(" ") : "";
    $("#saludo-eyebrow").textContent = etiquetaCategoria(id);
    $("#saludo-nombre").textContent = id.nombre || EV.promocion;
    const plantilla = EV.variantes[v];
    $("#saludo-texto").textContent = id.nombre ? plantilla.saludo.replace("{nombre}", id.nombre) : plantilla.saludo_general;
    window.Tarjeta.fijarNombre(corto);

    pintarPrograma(acts);
    pintarRSVP(acts);
    pintarConservar(v, n, acts);
    pintarListon(id);
    pintarNav();
    paseCache = null; $("#pase-vista").removeAttribute("src");

    $("#inv-fecha").textContent = EV.fecha_texto + " · " + EV.ciudad;
    const bv = $("#bienvenida");
    bv.classList.add("saliendo"); bv.setAttribute("aria-hidden", "true");
    $("#experiencia").removeAttribute("aria-hidden");
    $("#barra").hidden = false; $("#nav-inferior").hidden = false; document.body.classList.add("identificado");
    setTimeout(() => { bv.hidden = true; }, 650);
    mostrarVista(vistaDeHash() || (id.categoria === "graduando" ? "liston" : "invitacion"), { foco: false });
    if (id.categoria !== "graduando") window.Tarjeta.mostrar();
  }
  $("#btn-cambiar-nombre").addEventListener("click", () => {
    window.Tarjeta.detener();
    $("#barra").hidden = true; $("#nav-inferior").hidden = true; document.body.classList.remove("identificado", "rol-graduando", "con-liston");
    const bv = $("#bienvenida"); bv.hidden = false; bv.removeAttribute("aria-hidden");
    requestAnimationFrame(() => bv.classList.remove("saliendo"));
    $("#experiencia").setAttribute("aria-hidden", "true");
    mostrarPaso("acceso"); buscar.value = ""; pintarLista(""); if (ID) marcarPrevio(ID);
  });

  /* ---------- Vistas: Inicio · Programa · Confirmar · Mi pase · Mi listón ----------
     Navegación con el fragmento (#programa, #liston, …): el botón Atrás funciona y se puede entrar
     directamente a un apartado. El fragmento #t=… (enlace individual) se trata aparte, al inicio. */
  const VISTAS = ["invitacion", "programa", "confirmar", "pase", "liston", "dedicatorias", "distancia", "solicitar"];
  let vistaActual = null;
  const vistaDeHash = () => { let h = location.hash.slice(1); if (h === "inicio") return "invitacion"; if (h === "aportes") h = "distancia"; /* enlace antiguo */ return VISTAS.includes(h) ? h : null; };
  const esGraduando = () => ID && ID.categoria === "graduando";
  const tieneListon = () => !!(ID && listonDe(ID));
  const esOtro = () => ID && ID.categoria === "otro";
  // Navegación por categoría. «Otros»: solo Inicio y Programa hasta que la invitación sea autorizada por la organización.
  const permitida = (v) => {
    if (esGraduando()) return v === "invitacion" || v === "programa" || v === "liston" || v === "dedicatorias" || v === "distancia";
    if (v === "invitacion" || v === "programa" || v === "dedicatorias" || v === "distancia") return true;   // públicas para todos
    if (v === "solicitar") return esOtro() && !servidor;   // «Otros» aún sin invitación autorizada
    if (v === "liston") return tieneListon();
    if (esOtro() && !servidor) return false;
    return v === "confirmar" || v === "pase";
  };
  function pintarNav() {
    document.querySelectorAll(".nav-vistas [data-ir]").forEach((a) => { a.hidden = !permitida(a.dataset.ir); });
    const n = document.querySelectorAll("#nav-inferior a:not([hidden])").length;
    $("#nav-inferior").style.gridTemplateColumns = `repeat(${n || 1},1fr)`;
    $("#btn-prog-confirmar").hidden = !permitida("confirmar");
    // Dedicatorias y aportes siempre visibles en Inicio (todos los perfiles); «Otros» ve además las cinco opciones
    $("#otros-tarjetas").hidden = false;
    document.querySelectorAll("#otros-tarjetas [data-solo-otros]").forEach((li) => { li.hidden = !esOtro(); });
    $("#op-solicitar").closest("li").hidden = !permitida("solicitar");
    $("#t-otros").textContent = esOtro() ? "Acompáñanos como tú prefieras" : "Palabras que nos acompañan";
    $("#nav-inferior").classList.toggle("nav-denso", n >= 6);
  }
  function mostrarVista(v, { foco = true } = {}) {
    if (!VISTAS.includes(v)) v = esGraduando() ? "liston" : "invitacion";
    if (!permitida(v)) v = esGraduando() ? "liston" : "invitacion";
    if (vistaActual === "invitacion" && v !== "invitacion") window.Tarjeta.detener();
    vistaActual = v;
    for (const n of VISTAS) document.querySelector(`section[data-vista="${n}"]`).hidden = n !== v;
    document.querySelectorAll(".nav-vistas [data-ir]").forEach((a) => { if (a.dataset.ir === v) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    document.body.dataset.vistaActiva = v;
    window.scrollTo(0, 0);
    if (v === "invitacion" && !esGraduando()) requestAnimationFrame(() => window.Tarjeta.medir());
    if (v === "pase" && !esGraduando()) prepararPase();
    if (v === "dedicatorias" && window.Dedicatorias) window.Dedicatorias.abrir();
    if (v === "distancia" && window.Dedicatorias) window.Dedicatorias.abrirDistancia();
    if (v === "solicitar" && window.Dedicatorias) window.Dedicatorias.abrirSolicitud();
    if (foco) {
      const sel = v === "invitacion" && esGraduando() ? "#esp-nombre" : `section[data-vista="${v}"] h1, section[data-vista="${v}"] h2`;
      const t = document.querySelector(sel);
      if (t) t.focus({ preventScroll: true });
    }
  }
  document.addEventListener("click", (e) => {
    const ver = e.target.closest("[data-accion=ver]");
    if (ver && ID) { e.preventDefault(); document.querySelector(".inv-tarjeta").scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    const a = e.target.closest("[data-ir]");
    if (!a || !ID) return;
    e.preventDefault();
    const v = a.dataset.ir;
    if (location.hash === "#" + v) mostrarVista(v); else location.hash = v;   // crea entrada en el historial
  });
  addEventListener("hashchange", () => { const v = vistaDeHash(); if (ID && v && v !== vistaActual) mostrarVista(v); });

  /* ---------- Programa ---------- */
  function pintarPrograma(acts) {
    $("#programa-fecha").textContent = EV.fecha_texto + " · " + EV.ciudad;
    $("#programa").innerHTML = acts.map((a) => `
      <li class="momento${a.social ? " social" : ""}">
        <time datetime="${a.inicio}">${esc(a.hora_texto)}</time>
        <div class="momento-txt">
          ${a.social ? '<em class="etiqueta-social">Celebración social</em>' : ""}
          <strong>${esc(a.titulo)}</strong>
          ${a.lineas_pase.map((l) => `<span>${esc(l)}</span>`).join(" ")}
          <a class="como-llegar" target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps/search/?api=1&amp;query=${encodeURIComponent(a.mapa)}">Cómo llegar <span aria-hidden="true">↗</span><span class="sr-only"> a ${esc(a.titulo)} (abre Google Maps)</span></a>
        </div>
      </li>`).join("");
  }

  /* ---------- Confirmación (RSVP) ---------- */
  const form = $("#form-rsvp"), estado = $("#rsvp-estado"), btn = $("#btn-rsvp");
  function pintarRSVP(acts) {
    const caja = $("#rsvp-actividades");
    estado.textContent = ""; estado.className = "rsvp-estado";
    if (ID.categoria === "graduando") { caja.innerHTML = ""; btn.hidden = true; $("#rsvp-resumen").innerHTML = ""; $("#rsvp-aviso").hidden = true; return; }
    if (ID.categoria === "general") {
      caja.innerHTML = `<p class="nota">Para confirmar tu asistencia, identifícate con tu nombre.</p><button class="btn" type="button" id="rsvp-identificar">Identificarme</button>`;
      $("#rsvp-identificar").onclick = () => $("#btn-cambiar-nombre").click();
      btn.hidden = true; $("#rsvp-nota-caja").hidden = true; $("#rsvp-resumen").innerHTML = ""; $("#rsvp-aviso").hidden = true; $("#rsvp-campos").disabled = false; return;
    }
    btn.hidden = false;
    const resp = (servidor && servidor.respuestas) || {};
    // Solo lo necesario para decidir: actividad y hora (los lugares están en «Programa»).
    caja.innerHTML = acts.map((a) => `
      <fieldset class="rsvp-act${a.social ? " social" : ""}">
        <legend><b>${esc(a.titulo)}</b><span>${esc(a.hora_texto)}</span></legend>
        <div class="opciones-rsvp">${ESTADOS.map(([k, t]) => `<label><input type="radio" name="r-${a.codigo}" value="${k}"${resp[a.codigo] === k ? " checked" : ""}><span>${t}</span></label>`).join("")}</div>
      </fieldset>`).join("");
    resumen();
    $("#rsvp-nota-caja").hidden = ID.categoria !== "otro";
    btn.textContent = servidor && Object.keys(resp).length ? "Actualizar mi confirmación" : "Guardar mi confirmación";
    if (servidor && Object.keys(resp).length) { estado.textContent = `Tu respuesta está registrada (última actualización: ${new Date(servidor.actualizado).toLocaleString("es-VE", { dateStyle: "medium", timeStyle: "short" })}). Puedes modificarla.`; }
    // Aviso temprano: si no hay base de datos, se advierte ANTES del formulario y no se permite rellenarlo.
    const aviso = $("#rsvp-aviso");
    if (!window.API.configurado) {
      aviso.textContent = "La confirmación en línea todavía no está disponible. Mientras tanto, puedes ver tu invitación, descargar tu pase y guardar las fechas en tu calendario.";
      aviso.hidden = false; $("#rsvp-campos").disabled = true; btn.disabled = true;
    } else { aviso.hidden = true; $("#rsvp-campos").disabled = false; }
  }
  const ROT = Object.fromEntries(ESTADOS);
  function resumen() {
    const filas = [...document.querySelectorAll("#rsvp-actividades fieldset.rsvp-act")].map((f) => {
      const r = f.querySelector("input:checked");
      return `<li><span>${esc(f.querySelector("legend b").textContent)}</span><b>${r ? ROT[r.value] : "Sin responder"}</b></li>`;
    });
    $("#rsvp-resumen").innerHTML = filas.length ? `<p class="etiqueta-mini">Resumen de tu respuesta</p><ul>${filas.join("")}</ul>` : "";
  }
  $("#rsvp-actividades").addEventListener("change", resumen);
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

  /* ---------- Listón conmemorativo (sección independiente: 7 graduandos y 10 padrinos oficiales) ---------- */
  const listonesActivos = () => !!(EV.modulos && EV.modulos.listones);   // interruptor de publicación (datos/evento.json)
  function listonDe(id) {
    if (!listonesActivos()) return null;
    if (id.categoria === "graduando") return id.graduandoId;
    if (id.categoria === "padrino" && EV.padrinos.some((p) => p.id === id.padrinoId)) return id.padrinoId;
    return null;   // docentes, egresados, R1, R2 y invitados especiales no tienen listón
  }
  function pintarListon(id) {
    const lid = listonDe(id), grad = id.categoria === "graduando";
    document.body.classList.toggle("con-liston", !!lid);
    document.querySelectorAll('.nav-vistas [data-ir="liston"]').forEach((el) => { el.hidden = !lid; });
    $("#espacio-especialista").hidden = !grad;
    $("#btn-prog-confirmar").hidden = grad;
    $("#btn-prog-liston").hidden = !grad;
    $("#liston-colectivos").hidden = !grad;
    if (grad) {
      $("#esp-nombre").textContent = id.nombre;
      $("#esp-fecha").textContent = EV.fecha_texto + " · " + EV.ciudad;
    }
    if (lid) {
      const img = $("#liston-vista"), x = [...EV.graduandos_lista, ...EV.padrinos].find((p) => p.id === lid);
      const nom = x.nombre_liston || x.nombre;
      $("#liston-eyebrow").textContent = x.denominacion;
      $("#liston-sub").textContent = `${nom} · XXIV Promoción de Radiólogos`;
      img.src = `assets/listones/${lid}.png`;
      img.alt = `Listón conmemorativo: ${x.denominacion}, ${nom}. XXIV Promoción de Radiólogos, Universidad de Los Andes, Mérida, 2026.`;
      $("#liston-png").href = `assets/listones/${lid}.png`; $("#liston-png").setAttribute("download", `liston-${lid}-300ppp.png`);
      $("#liston-png-600").href = `assets/listones/${lid}-600ppp.png`; $("#liston-png-600").setAttribute("download", `liston-${lid}-600ppp.png`);
      $("#liston-pdf").href = `assets/listones/${lid}.pdf`; $("#liston-pdf").setAttribute("download", `liston-${lid}.pdf`);
    }
  }

  /* ---------- Pase digital ---------- */
  let paseCache = null, paseURL = null;
  const paseEstado = $("#pase-estado");
  function datosPase() {
    const acts = actividadesDe(ID);
    return {
      nombre: ID.categoria === "general" ? "" : (servidor && servidor.nombre) || ID.nombre,
      categoria: ID.categoria === "general" ? "INVITADO ESPECIAL" : ID.categoria === "padrino" ? denominacionPadrino(ID) : EV.categorias[ID.categoria].pase,
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
