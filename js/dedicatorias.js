/* Desde la distancia (dedicatorias + detalle voluntario) y Solicitud de invitación. Públicos.
   Protección solo en el servidor: validación, frecuencia, duplicados, saneamiento y moderación obligatoria (sin CAPTCHA externo). */
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------- Seis stickers (ilustraciones de línea con acento rojo; sin emojis ni imágenes externas) ---------- */
  const T = 'fill="none" stroke="#231B15" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"';
  const R = 'fill="#B91C1C" stroke="#231B15" stroke-width="1.5" stroke-linejoin="round"';
  const STICKERS = {
    corazon: ["Corazón · cariño y afecto", `<svg viewBox="0 0 48 48" ${T}><path d="M24 40C10 30 6 22 8.5 15.5 11 9.5 19 8.5 24 15c5-6.5 13-5.500 15.500.5C42 22 38 30 24 40z" fill="#B91C1C"/><path d="M15 17c1.500-2.500 4-3 6-2" stroke="#F4E6D1"/><path d="M33 9l2-3M38 13l3-1.500M10 8L8 5" /></svg>`],
    birrete: ["Birrete · reconocimiento académico", `<svg viewBox="0 0 48 48" ${T}><path d="M24 9L5 18l19 9 19-9-19-9z" fill="#231B15"/><path d="M13 23v8c0 3 5.500 6 11 6s11-3 11-6v-8"/><path d="M41 19.500V32" /><circle cx="41" cy="35" r="2.200" fill="#B91C1C"/><path d="M39.500 37l-1.500 5M42.500 37l1.500 5"/></svg>`],
    aplausos: ["Aplausos · admiración", `<svg viewBox="0 0 48 48" ${T}><path d="M18 40c-5-1-9-6-9-12 0-3 1-5 3-7l5-6c1.500-1.800 4-.5 3.500 1.700l-1 4.800 3-3.500c1.500-1.700 4-.2 3.300 2" fill="#F4E6D1"/><path d="M30 40c5-1 9-6 9-12 0-3-1-5-3-7l-5-6c-1.500-1.800-4-.5-3.500 1.700l1 4.800" fill="#F4E6D1"/><path d="M24 6v5M14 9l2.500 3.500M34 9l-2.500 3.500" stroke="#B91C1C" stroke-width="2.200"/></svg>`],
    confeti: ["Confeti · alegría y celebración", `<svg viewBox="0 0 48 48" ${T}><path d="M6 42l8-22 14 14-22 8z" fill="#B91C1C"/><path d="M11 33l6 6M9 38l3 3"/><circle cx="31" cy="12" r="2.500"/><rect x="35" y="22" width="5" height="3.500" rx=".6" transform="rotate(25 37 24)" fill="#231B15"/><path d="M22 8c3 2-3 4 0 6s-3 4 0 6" stroke="#B91C1C" stroke-width="2"/><path d="M41 8l2.500 3.500-4 .5z" fill="#231B15"/></svg>`],
    estrellas: ["Estrellas · éxito y buenos deseos", `<svg viewBox="0 0 48 48" ${T}><path d="M22 6l4.800 10.500L38 18l-8.500 7.500L32 37l-10-6-10 6 2.500-11.500L6 18l11.200-1.500z" fill="#B91C1C"/><path d="M39 5v8M35 9h8"/><path d="M40 28v5M37.500 30.500h5"/><path d="M8 5v5M5.500 7.500h5"/></svg>`],
    brindis: ["Brindis · celebración del logro", `<svg viewBox="0 0 48 48" ${T}><path d="M9 8l7 .5 4 15c.8 3-1 5.500-4 6l-3 .5-4-21.500z" transform="rotate(-8 14 18)" fill="#F4E6D1"/><path d="M39 8l-7 .5-4 15c-.8 3 1 5.500 4 6l3 .5 4-21.500z" transform="rotate(8 34 18)" fill="#F4E6D1"/><path d="M14 30l-1 10M34 30l1 10M9 41h10M29 41h10"/><path d="M24 5v6M19 7l2 4M29 7l-2 4" stroke="#B91C1C" stroke-width="2.200"/></svg>`],
  };
  const ORDEN = ["corazon", "birrete", "aplausos", "confeti", "estrellas", "brindis"];
  const sticker = (c, px = 40) => `<span class="sticker-img" role="img" aria-label="${esc(STICKERS[c][0])}" style="width:${px}px;height:${px}px">${STICKERS[c][1]}</span>`;

  /* ---------- Estado ---------- */
  let cfg = null, cargando = false, elegidos = [];
  const MSG = {
    cupo_lleno: "En este momento no podemos recibir más mensajes. Inténtalo más tarde.",
    telefono_invalido: "Revisa el teléfono: incluye el prefijo internacional (por ejemplo, +58 412 1234567).",
    mensaje_invalido: "Escribe tu mensaje (entre 5 y 500 caracteres).",
    autor_invalido: "Escribe tu nombre y apellido.",
    duplicado: "Ya recibimos esta misma dedicatoria. ¡Gracias!",
    demasiadas_solicitudes: "Se recibieron demasiados envíos desde esta conexión. Inténtalo más tarde.",
    sin_conexion: "No pudimos conectar con el servidor. Tu dedicatoria no se ha enviado; inténtalo de nuevo.",
    sin_backend: "El envío de dedicatorias todavía no está disponible.",
  };

  function pintarStickers() {
    $("#dd-stickers").innerHTML = ORDEN.map((c) => `<button type="button" class="sticker" data-sticker="${c}" aria-pressed="${elegidos.includes(c)}" aria-label="${esc(STICKERS[c][0])}" title="${esc(STICKERS[c][0])}">${sticker(c, 44)}</button>`).join("");
  }
  $("#dd-stickers").addEventListener("click", (e) => {
    const b = e.target.closest("[data-sticker]"); if (!b) return;
    const c = b.dataset.sticker;
    if (elegidos.includes(c)) elegidos = elegidos.filter((x) => x !== c);
    else if (elegidos.length < 2) elegidos.push(c);
    else { estado("Puedes elegir hasta dos detalles.", "error"); return; }
    estado(""); pintarStickers(); previa();
  });

  const destino = () => { const r = document.querySelector('input[name="dd-dest"]:checked').value; return r === "promocion" ? { id: "promocion", texto: "Toda la XXIV Promoción" } : { id: $("#dd-esp").value, texto: $("#dd-esp").selectedOptions[0] ? $("#dd-esp").selectedOptions[0].textContent : "" }; };
  function previa() {
    const m = $("#dd-msg").value.trim(), a = $("#dd-autor").value.trim(), d = destino();
    $("#dd-cont").textContent = `${$("#dd-msg").value.length} / 500`;
    $("#dd-vista").innerHTML = `<p class="np-para">Para: <b>${esc(d.texto)}</b></p>
      <p class="np-msg">${m ? esc(m) : '<span class="np-vacio">Tu mensaje aparecerá aquí, escrito a mano…</span>'}</p>
      ${elegidos.length ? `<p class="np-stickers">${elegidos.map((c) => sticker(c, 40)).join("")}</p>` : ""}
      <p class="np-firma">— ${a ? esc(a) : "tu nombre"}</p>`;
  }
  document.querySelectorAll('input[name="dd-dest"]').forEach((r) => r.addEventListener("change", () => { $("#dd-esp").hidden = document.querySelector('input[name="dd-dest"]:checked').value !== "esp"; previa(); }));
  for (const id of ["#dd-msg", "#dd-autor", "#dd-esp"]) $(id).addEventListener("input", previa);

  const estado = (t, cls = "") => { const e = $("#dd-estado"); e.textContent = t; e.className = "rsvp-estado" + (cls ? " " + cls : ""); };
  const bloquear = (si, aviso) => { for (const el of $("#form-dedic").elements) el.disabled = si; if (si && aviso) estado(aviso); };

  async function iniciarForm() {
    if (!window.API.configurado) { bloquear(true, MSG.sin_backend); return; }
    try { cfg = await window.API.dedicConfig(); } catch (e) { bloquear(true, MSG.sin_conexion); return; }
    $("#dd-esp").innerHTML = (cfg.especialistas || []).map((x) => `<option value="${esc(x.id)}">${esc(x.nombre)}</option>`).join("");
    bloquear(false);
  }

  $("#form-dedic").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (cargando || !cfg) return;
    const d = destino();
    if (!$("#dd-msg").value.trim()) { estado("Escribe tu mensaje.", "error"); $("#dd-msg").focus(); return; }
    if (!$("#dd-autor").value.trim()) { estado("Escribe tu nombre y apellido.", "error"); $("#dd-autor").focus(); return; }
    if (!/^\+?[\d\s\-().]{8,24}$/.test($("#dd-tel").value.trim()) || !/^(\+|00)/.test($("#dd-tel").value.trim())) { estado(MSG.telefono_invalido, "error"); $("#dd-tel").focus(); return; }
    cargando = true; $("#dd-enviar").disabled = true; estado("Enviando…");
    try {
      await window.API.dedicEnviar({ destinatario: d.id, mensaje: $("#dd-msg").value, autor: $("#dd-autor").value, telefono: $("#dd-tel").value, stickers: elegidos, trampa: $("#dd-web").value });
      estado("");
      $("#form-dedic").hidden = true; document.querySelector(".dd-previa").hidden = true; $("#dd-gracias").hidden = false; $("#dd-gracias").focus();
    } catch (err) {
      estado(MSG[err.codigo] || "No se pudo enviar tu dedicatoria. Inténtalo de nuevo en unos minutos.", "error");
    } finally {
      cargando = false; $("#dd-enviar").disabled = false;
    }
  });
  $("#dd-otra").addEventListener("click", () => {
    $("#form-dedic").reset(); elegidos = []; pintarStickers(); $("#dd-esp").hidden = true; previa();
    $("#dd-gracias").hidden = true; $("#form-dedic").hidden = false; document.querySelector(".dd-previa").hidden = false; $("#dd-msg").focus();
  });

  async function cargarLibro() {
    const ul = $("#libro-dedic");
    if (!window.API.configurado) { ul.innerHTML = '<li class="libro-vacio">El libro estará disponible en breve.</li>'; return; }
    try {
      const l = await window.API.dedicPublicas();
      ul.innerHTML = l.length ? l.map((x) => `<li class="nota-papel libro-item"><p class="np-para">Para: <b>${esc(x.para)}</b></p><p class="np-msg">${esc(x.mensaje)}</p>${x.stickers && x.stickers.length ? `<p class="np-stickers">${x.stickers.filter((c) => STICKERS[c]).map((c) => sticker(c, 36)).join("")}</p>` : ""}<p class="np-firma">— ${esc(x.autor)}</p><p class="np-fecha">${x.fecha ? esc(new Date(x.fecha).toLocaleDateString("es-VE", { day: "numeric", month: "long", year: "numeric" })) : ""}</p></li>`).join("")
        : '<li class="libro-vacio">Aún no hay dedicatorias publicadas. Sé la primera persona en dejar la suya.</li>';
    } catch (e) { ul.innerHTML = '<li class="libro-vacio">No pudimos cargar el libro en este momento.</li>'; }
  }

  /* ---------- Detalle voluntario (Pago Móvil): solo se muestra si la persona despliega la opción ---------- */
  const CAMPOS = [["banco", "Banco"], ["codigo", "Código bancario"], ["titular", "Titular"], ["cedula", "Cédula de identidad"], ["telefono", "Teléfono"]];
  let datosPM = null, tCopia = null;
  function copiado(t) { const e = $("#pm-copiado"); e.textContent = t; clearTimeout(tCopia); tCopia = setTimeout(() => { e.textContent = ""; }, 2200); }
  async function copiar(texto, msg) {
    try { await navigator.clipboard.writeText(texto); }
    catch (e) { const ta = document.createElement("textarea"); ta.value = texto; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (e2) {} ta.remove(); }
    copiado(msg);
  }
  async function comprobarAportes() {
    const det = $("#pm-detalle"); det.open = false; $("#pm-datos").innerHTML = ""; datosPM = null;
    let a = null;
    if (window.API.configurado) { try { a = await window.API.aportesPublicos(); } catch (e) {} }
    const ok = !!(a && a.activo && CAMPOS.some(([k]) => a[k]));
    det.hidden = !ok;                     // la opción solo existe si la organización la activó
    if (ok) datosPM = a;                  // se guarda en memoria; no se pinta hasta que la persona lo elija
  }
  function pintarPM() {
    if (!datosPM) return;
    if (datosPM.gracias) $("#pm-gracias").textContent = datosPM.gracias;
    $("#pm-datos").innerHTML = CAMPOS.filter(([k]) => datosPM[k]).map(([k, t]) => `<div class="pm-fila"><dt>${t}</dt><dd>${esc(datosPM[k])}</dd><button class="btn pm-copiar" type="button" data-copiar="${k}" aria-label="Copiar ${t.toLowerCase()}">Copiar</button></div>`).join("");
  }
  $("#pm-detalle").addEventListener("toggle", () => { if ($("#pm-detalle").open) pintarPM(); else { $("#pm-datos").innerHTML = ""; $("#pm-copiado").textContent = ""; } });
  $("#pm-datos").addEventListener("click", (e) => { const b = e.target.closest("[data-copiar]"); if (b && datosPM) copiar(String(datosPM[b.dataset.copiar]), "Copiado: " + CAMPOS.find(([k]) => k === b.dataset.copiar)[1]); });
  $("#pm-copiar-todo").addEventListener("click", () => {
    if (!datosPM) return;
    copiar("Pago Móvil\n" + CAMPOS.filter(([k]) => datosPM[k]).map(([k, t]) => `${t}: ${datosPM[k]}`).join("\n"), "Datos de Pago Móvil copiados");
  });

  /* ---------- Solicitar invitación (Otros invitados) ---------- */
  let EVs = null, cargandoSol = false;
  const MSG_SOL = Object.assign({}, MSG, { invita_invalido: "Indica el nombre de quien te invita.", nombre_invalido: "Escribe tu nombre y apellido." });
  const estadoSol = (t, cls = "") => { const e = $("#sol-estado"); e.textContent = t; e.className = "rsvp-estado" + (cls ? " " + cls : ""); };
  function sugerencias() {
    const t = $("#sol-tipo").value, ev = EVs || { padrinos: [], graduandos_lista: [] };
    const l = t === "padrino" ? ev.padrinos : t === "especialista" ? ev.graduandos_lista : [];
    $("#sol-sugerencias").innerHTML = l.map((x) => `<option value="${esc(x.nombre)}"></option>`).join("");
  }
  $("#sol-tipo").addEventListener("change", sugerencias);
  async function iniciarSolicitud() {
    if (!window.API.configurado) { for (const el of $("#form-solic").elements) el.disabled = true; estadoSol(MSG.sin_backend); return; }
    try { EVs = EVs || await window.API.evento(); } catch (e) {}
    sugerencias();
    for (const el of $("#form-solic").elements) el.disabled = false;
  }
  $("#form-solic").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (cargandoSol) return;
    if (!$("#sol-nombre").value.trim()) { estadoSol("Escribe tu nombre y apellido.", "error"); $("#sol-nombre").focus(); return; }
    if (!$("#sol-quien").value.trim()) { estadoSol("Indica el nombre de quien te invita.", "error"); $("#sol-quien").focus(); return; }
    if (!/^(\+|00)[\d\s\-().]{8,24}$/.test($("#sol-tel").value.trim())) { estadoSol(MSG.telefono_invalido, "error"); $("#sol-tel").focus(); return; }
    cargandoSol = true; $("#sol-enviar").disabled = true; estadoSol("Enviando…");
    try {
      await window.API.solicitarInvitacion({ nombre: $("#sol-nombre").value, tipo: $("#sol-tipo").value, invita: $("#sol-quien").value, telefono: $("#sol-tel").value, trampa: $("#sol-web").value });
      estadoSol(""); $("#form-solic").hidden = true; $("#sol-gracias").hidden = false; $("#sol-gracias").focus();
    } catch (err) { estadoSol(MSG_SOL[err.codigo] || "No se pudo enviar tu solicitud. Inténtalo de nuevo en unos minutos.", "error"); }
    finally { cargandoSol = false; $("#sol-enviar").disabled = false; }
  });

  // El botón principal despliega el formulario (el libro de dedicatorias ya es visible debajo)
  $("#dd-abrir").addEventListener("click", () => {
    const bloque = $("#dd-bloque"), abrir = bloque.hidden;
    bloque.hidden = !abrir; $("#dd-abrir").setAttribute("aria-expanded", String(abrir));
    if (abrir) { iniciarForm(); setTimeout(() => { const m = $("#dd-msg"); if (m && !m.disabled) m.focus({ preventScroll: false }); }, 350); }
  });

  window.Dedicatorias = {
    abrir() { pintarStickers(); previa(); cargarLibro(); },
    abrirDistancia() { comprobarAportes(); },
    abrirSolicitud() { iniciarSolicitud(); },
  };
})();
