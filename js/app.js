/* Invitación Padrinos · XXIV Promoción de Radiólogos ULA 2026
   Máquina de estados determinista para la tarjeta:
   estables:     cerrada · abierta · dorso
   transiciones: abriendo (cerrada→abierta) · cerrando (abierta→cerrada)
                 girando (cerrada→dorso)   · regresando (dorso→cerrada)
   Solo se ejecuta un paso a la vez; cada paso termina siempre en un estado estable.
   Las órdenes nuevas cambian el «objetivo» y se aplican al terminar el paso en curso. */
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const CLAVE_NOMBRE = "invitacion-ula-2026:nombre";
  const D_ABRIR = 1400, D_GIRO = 1200, D_PLANO = 380;

  const escenario = $("#escenario"), tarjeta = $("#tarjeta"), tapa = $("#tapa"), libro = $("#libro"), inclinacion = $("#inclinacion");
  const pista = $("#pista"), btnPrincipal = $("#btn-principal"), btnContra = $("#btn-contra"), btnReproducir = $("#btn-reproducir"),
        btnAmpliar = $("#btn-ampliar"), btnReiniciar = $("#btn-reiniciar");

  const reducido = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const soporta3D = window.CSS && CSS.supports && (CSS.supports("transform-style", "preserve-3d") || CSS.supports("-webkit-transform-style", "preserve-3d"));
  const plano = reducido || !soporta3D;
  if (plano) escenario.classList.add("plano");

  let nombreCorto = "";
  let tarjetaLista = false, pendienteEntrada = false;
  let variante = "A", conRecepcion = true;
  const img = (id) => document.getElementById(id);

  // Carga las caras de la variante (A padrinos · B residentes · C otros) y del programa (2 o 3 actividades).
  function configurar(v, n) {
    variante = v; conRecepcion = n === 3;
    const interior = `assets/img/${v}-interior-${n}-2000.jpg`;
    const ALT = window.__ALT || {};
    img("img-portada").src = `assets/img/${v}-portada-1400.jpg`;
    img("img-portada").alt = ALT.portada || "Portada de la invitación";
    img("img-contra").src = `assets/img/${v}-contraportada-1400.jpg`;
    img("img-contra").alt = ALT.contra || "Contraportada de la invitación";
    img("img-interior-izq").src = interior; img("img-interior-izq").alt = ALT.interior || "Interior de la invitación";
    img("img-interior-der").src = interior;
    escenario.classList.add("cargando"); tarjetaLista = false;
    const p = img("img-portada");
    const lista = () => { escenario.classList.remove("cargando"); tarjetaLista = true; if (pendienteEntrada) { pendienteEntrada = false; reproducirEntrada(); } };
    (p.decode ? p.decode() : Promise.resolve()).then(lista, lista);
    vImg.removeAttribute("src");
  }
  function mostrar() { medir(); if (tarjetaLista) reproducirEntrada(); else pendienteEntrada = true; setTimeout(() => tarjeta.focus({ preventScroll: true }), 700); }

  /* ---------------- Medidas responsive ---------------- */
  function medir() {
    const anchoDisp = escenario.clientWidth || document.documentElement.clientWidth - 32;
    const altoDisp = Math.max(320, window.innerHeight - (window.innerWidth < 640 ? 250 : 260));
    const S = Math.min(anchoDisp, 1000, altoDisp * 6250 / 4830);
    const hAbierta = S * 4830 / 6250;
    const k = Math.max(1, Math.min(1.9, altoDisp / hAbierta, (anchoDisp * 0.94) / (S / 2)));
    escenario.style.setProperty("--S", S.toFixed(1) + "px");
    escenario.style.setProperty("--k", k.toFixed(3));
    escenario.style.setProperty("--alto-escenario", Math.ceil(Math.max(hAbierta, hAbierta * k) + 16) + "px");
  }
  medir();
  let rz; addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(medir, 120); });

  /* ---------------- Máquina de estados ---------------- */
  const PASOS = {
    "cerrada>abierta": { nombre: "abriendo", el: tapa, dur: D_ABRIR },
    "abierta>cerrada": { nombre: "cerrando", el: tapa, dur: D_ABRIR },
    "cerrada>dorso": { nombre: "girando", el: libro, dur: D_GIRO },
    "dorso>cerrada": { nombre: "regresando", el: libro, dur: D_GIRO },
  };
  let estado = "cerrada", objetivo = "cerrada", corriendo = false, visitoDorso = false;
  const esperas = [];

  const siguiente = (desde, hasta) => (desde === hasta ? null : desde === "cerrada" ? hasta : "cerrada");

  function esperarTransicion(el, dur) {
    return new Promise((ok) => {
      let hecho = false;
      const fin = () => { if (hecho) return; hecho = true; el.removeEventListener("transitionend", h); clearTimeout(t); ok(); };
      const h = (e) => { if (e.target === el && e.propertyName === "transform") fin(); };
      el.addEventListener("transitionend", h);
      const t = setTimeout(fin, (plano ? D_PLANO : dur) + 320); // respaldo si el evento no llega
    });
  }

  function resolverEsperas() {
    for (let i = esperas.length - 1; i >= 0; i--) {
      const w = esperas[i];
      if (objetivo !== w.destino) { esperas.splice(i, 1); w.ok(false); }
      else if (!corriendo && estado === w.destino) { esperas.splice(i, 1); w.ok(true); }
    }
  }

  async function bucle() {
    if (corriendo) return;
    corriendo = true;
    try {
      while (estado !== objetivo) {
        const s = siguiente(estado, objetivo);
        const p = PASOS[estado + ">" + s];
        escenario.dataset.estado = p.nombre;
        escenario.dataset.pose = s;
        actualizarUI();
        await esperarTransicion(p.el, p.dur);
        estado = s;
        escenario.dataset.estado = s;
        if (s === "dorso") visitoDorso = true;
        actualizarUI();
        resolverEsperas();
      }
    } finally {
      corriendo = false;
      actualizarUI();
      resolverEsperas();
    }
  }

  function irA(destino) {
    objetivo = destino;
    resolverEsperas();
    const p = new Promise((ok) => esperas.push({ destino, ok }));
    bucle();
    resolverEsperas();
    return p;
  }

  // Orden manual: cancela la reproducción automática y conserva un estado válido.
  function manual(destino) { detenerRecorrido(); irA(destino); }

  /* ---------------- Recorrido automático ---------------- */
  let recorrido = null;
  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
  async function esperaPausable(r, ms) {
    let resto = plano ? Math.min(ms, 2500) : ms;
    while (resto > 0) { if (r.cancelado) return; await dormir(100); if (!r.pausado) resto -= 100; }
  }
  async function puerta(r) { while (r.pausado && !r.cancelado) await dormir(100); }

  async function iniciarRecorrido() {
    const r = { pausado: false, cancelado: false };
    recorrido = r; actualizarUI();
    const guion = [["ir", "cerrada"], ["pausa", 900], ["ir", "abierta"], ["pausa", 6500], ["ir", "dorso"]];
    for (const [tipo, v] of guion) {
      await puerta(r); if (r.cancelado) return;
      if (tipo === "ir") { await irA(v); } else { await esperaPausable(r, v); }
      if (r.cancelado) return;
    }
    if (recorrido === r) { recorrido = null; actualizarUI(); } // termina en la contraportada
  }
  function detenerRecorrido() { if (recorrido) { recorrido.cancelado = true; recorrido = null; actualizarUI(); } }
  btnReproducir.addEventListener("click", () => {
    if (!recorrido) { iniciarRecorrido(); return; }
    recorrido.pausado = !recorrido.pausado; actualizarUI();
  });

  /* ---------------- UI ---------------- */
  const ROTULO = { cerrada: "Portada", abierta: "Interior", dorso: "Contraportada" };
  function actualizarUI() {
    const o = objetivo;
    btnPrincipal.textContent = o === "cerrada" ? "Abrir tarjeta" : o === "abierta" ? "Cerrar tarjeta" : "Volver a la portada";
    btnContra.textContent = o === "dorso" ? "Abrir de nuevo" : "Ver contraportada";
    const ico = btnReproducir.querySelector(".ico"), txt = btnReproducir.querySelector("span:last-child");
    if (!recorrido) { ico.textContent = "▶"; txt.textContent = "Reproducir"; btnReproducir.setAttribute("aria-pressed", "false"); }
    else if (recorrido.pausado) { ico.textContent = "▶"; txt.textContent = "Continuar"; btnReproducir.setAttribute("aria-pressed", "true"); }
    else { ico.textContent = "❚❚"; txt.textContent = "Pausar"; btnReproducir.setAttribute("aria-pressed", "true"); }
    btnAmpliar.querySelector("span:last-child").textContent = o === "abierta" ? "Ampliar interior" : "Ampliar";

    let t = "";
    if (corriendo) t = "";
    else if (estado === "cerrada") t = "Toca para abrir tu invitación";
    else if (estado === "abierta") t = "Toca el interior para leerlo ampliado";
    else t = "Gracias por acompañarnos" + (nombreCorto ? ", " + nombreCorto : "");
    if (t) pista.textContent = t;
    pista.style.opacity = corriendo ? "0" : "1";
    pista.classList.toggle("destacada", !corriendo && estado === "cerrada");
    tarjeta.setAttribute("aria-label", `Invitación. ${ROTULO[estado]}. ` +
      (estado === "cerrada" ? "Pulse Intro para abrir." : estado === "abierta" ? "Pulse Intro para ampliar. Flechas para cambiar de cara." : "Flechas para cambiar de cara."));
  }

  btnPrincipal.addEventListener("click", () => manual(objetivo === "cerrada" ? "abierta" : "cerrada"));
  btnContra.addEventListener("click", () => manual(objetivo === "dorso" ? "abierta" : "dorso"));
  btnAmpliar.addEventListener("click", () => { detenerRecorrido(); abrirVisor(); });
  btnReiniciar.addEventListener("click", reiniciar);

  async function reiniciar() {
    detenerRecorrido();
    document.querySelectorAll("dialog[open]").forEach((d) => d.close());
    window.scrollTo({ top: 0, behavior: reducido ? "auto" : "smooth" });
    await irA("cerrada");
    reproducirEntrada();
  }

  /* ---------------- Interacción con la tarjeta ---------------- */
  let inicio = null, movido = false;
  tarjeta.addEventListener("pointerdown", (e) => { inicio = { x: e.clientX, y: e.clientY, t: Date.now() }; movido = false; });
  tarjeta.addEventListener("pointermove", (e) => {
    if (inicio && (Math.abs(e.clientX - inicio.x) > 10 || Math.abs(e.clientY - inicio.y) > 10)) movido = true;
    if (e.pointerType === "mouse" && !plano) inclinar(e);
  });
  tarjeta.addEventListener("pointerleave", () => { if (!plano) { inclinacion.style.setProperty("--rx", "0deg"); inclinacion.style.setProperty("--ry", "0deg"); } });
  tarjeta.addEventListener("pointerup", (e) => {
    if (!inicio) return;
    const dx = e.clientX - inicio.x, dy = e.clientY - inicio.y, rapido = Date.now() - inicio.t < 700;
    inicio = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4 && rapido) { deslizar(dx < 0 ? 1 : -1); return; }
    if (!movido) tocar();
  });
  tarjeta.addEventListener("pointercancel", () => { inicio = null; });

  function tocar() {
    if (corriendo && !recorrido) return; // ignora toques durante un movimiento manual (el objetivo ya está fijado)
    if (estado === "cerrada" || objetivo === "cerrada") manual("abierta");
    else if (estado === "abierta") { detenerRecorrido(); abrirVisor(); }
    // En la contraportada el toque no hace nada: la tarjeta permanece hasta que el usuario elija.
  }
  const ORDEN = ["cerrada", "abierta", "dorso"];
  function deslizar(dir) {
    const i = ORDEN.indexOf(objetivo), j = Math.max(0, Math.min(2, i + dir));
    if (j !== i) manual(ORDEN[j]);
  }
  tarjeta.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tocar(); }
    else if (e.key === "ArrowRight") { e.preventDefault(); deslizar(1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); deslizar(-1); }
  });

  function inclinar(e) {
    const r = tarjeta.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    inclinacion.style.setProperty("--rx", ((0.5 - py) * 6).toFixed(2) + "deg");
    inclinacion.style.setProperty("--ry", ((px - 0.5) * 8).toFixed(2) + "deg");
    tarjeta.style.setProperty("--lx", (px * 100).toFixed(0) + "%");
    tarjeta.style.setProperty("--ly", (py * 100).toFixed(0) + "%");
  }

  function reproducirEntrada() {
    if (plano) return;
    tarjeta.classList.remove("entrada"); void tarjeta.offsetWidth; tarjeta.classList.add("entrada");
  }

  /* ---------------- Hojas modales ---------------- */
  function abrirDialogo(id) {
    const d = document.getElementById(id);
    if (!d || d.open) return;
    detenerRecorrido();
    if (typeof d.showModal === "function") d.showModal(); else d.setAttribute("open", "");
    document.documentElement.style.overflow = "hidden";
    document.dispatchEvent(new CustomEvent("dialogo-abierto", { detail: id }));
  }
  document.querySelectorAll("dialog").forEach((d) => {
    d.addEventListener("close", () => { if (!document.querySelector("dialog[open]")) document.documentElement.style.overflow = ""; });
    d.addEventListener("click", (e) => { if (e.target === d && !d.classList.contains("visor")) d.close(); });
  });
  document.addEventListener("click", (e) => {
    const a = e.target.closest("[data-abrir]"); if (a) { abrirDialogo(a.dataset.abrir); return; }
    const c = e.target.closest("[data-cerrar]"); if (c) { const d = c.closest("dialog"); if (d) d.close(); }
  });

  /* ---------------- Visor ampliado (pellizco, doble toque, rueda) ---------------- */
  const dlgVisor = $("#dlg-visor"), lienzo = $("#lienzo"), vImg = $("#visor-img");
  const V = { s: 1, x: 0, y: 0, ajuste: 1 };
  const fuentes = () => ({
    abierta: [`assets/img/${variante}-interior-${conRecepcion ? 3 : 2}-3600.jpg`, "Interior"],
    cerrada: [`assets/img/${variante}-portada-1400.jpg`, "Portada"],
    dorso: [`assets/img/${variante}-contraportada-1400.jpg`, "Contraportada"],
  });
  function aplicar() { vImg.style.transform = `translate(${V.x}px,${V.y}px) scale(${V.s})`; }
  function limitar() {
    const cw = lienzo.clientWidth, ch = lienzo.clientHeight, w = vImg.naturalWidth * V.s, h = vImg.naturalHeight * V.s;
    V.x = w <= cw ? (cw - w) / 2 : Math.min(0, Math.max(cw - w, V.x));
    V.y = h <= ch ? (ch - h) / 2 : Math.min(0, Math.max(ch - h, V.y));
  }
  function ajustar() {
    if (!vImg.naturalWidth) return;
    V.ajuste = Math.min(lienzo.clientWidth / vImg.naturalWidth, lienzo.clientHeight / vImg.naturalHeight);
    V.s = V.ajuste; limitar(); aplicar();
  }
  function zoomEn(f, cx, cy) {
    const s2 = Math.max(V.ajuste, Math.min(V.ajuste * 6, V.s * f));
    const r = s2 / V.s; V.x = cx - (cx - V.x) * r; V.y = cy - (cy - V.y) * r; V.s = s2; limitar(); aplicar();
  }
  function abrirVisor() {
    const F = fuentes(); const [src, rot] = F[estado] || F.abierta;
    $("#visor-titulo").textContent = rot + " · Pellizque o toque dos veces para acercar";
    vImg.alt = (estado === "abierta" ? img("img-interior-izq") : estado === "dorso" ? img("img-contra") : img("img-portada")).alt;
    abrirDialogo("dlg-visor");
    if (vImg.getAttribute("src") !== src) { vImg.style.transform = "scale(0)"; vImg.onload = ajustar; vImg.src = src; }
    else requestAnimationFrame(ajustar);
  }
  addEventListener("resize", () => { if (dlgVisor.open) ajustar(); });
  $("#zoom-mas").addEventListener("click", () => zoomEn(1.5, lienzo.clientWidth / 2, lienzo.clientHeight / 2));
  $("#zoom-menos").addEventListener("click", () => zoomEn(1 / 1.5, lienzo.clientWidth / 2, lienzo.clientHeight / 2));
  $("#zoom-ajustar").addEventListener("click", ajustar);
  lienzo.addEventListener("wheel", (e) => { e.preventDefault(); const r = lienzo.getBoundingClientRect(); zoomEn(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  const punteros = new Map(); let pinch = null, ultimoToque = 0, ultimoPos = null;
  lienzo.addEventListener("pointerdown", (e) => {
    lienzo.setPointerCapture(e.pointerId); punteros.set(e.pointerId, { x: e.clientX, y: e.clientY }); lienzo.classList.add("arrastrando");
    if (punteros.size === 2) { const [a, b] = [...punteros.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: V.s }; }
  });
  lienzo.addEventListener("pointermove", (e) => {
    const prev = punteros.get(e.pointerId); if (!prev) return;
    const act = { x: e.clientX, y: e.clientY }; punteros.set(e.pointerId, act);
    const r = lienzo.getBoundingClientRect();
    if (punteros.size === 2 && pinch) {
      const [a, b] = [...punteros.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
      zoomEn((pinch.s * d / pinch.d) / V.s, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
    } else if (punteros.size === 1) { V.x += act.x - prev.x; V.y += act.y - prev.y; limitar(); aplicar(); }
  });
  const soltar = (e) => {
    const p = punteros.get(e.pointerId); punteros.delete(e.pointerId); if (punteros.size < 2) pinch = null;
    if (!punteros.size) lienzo.classList.remove("arrastrando");
    if (e.type === "pointerup" && p) {
      const ahora = Date.now();
      if (ahora - ultimoToque < 320 && ultimoPos && Math.hypot(p.x - ultimoPos.x, p.y - ultimoPos.y) < 30) {
        const r = lienzo.getBoundingClientRect();
        if (V.s > V.ajuste * 1.05) ajustar(); else zoomEn(2.6, p.x - r.left, p.y - r.top);
        ultimoToque = 0;
      } else { ultimoToque = ahora; ultimoPos = p; }
    }
  };
  lienzo.addEventListener("pointerup", soltar); lienzo.addEventListener("pointercancel", soltar);

  // Pruebas automatizadas: estado observable sin exponer datos personales.
  window.__invitacion = { get estado() { return estado; }, get objetivo() { return objetivo; }, get corriendo() { return corriendo; }, get recorrido() { return recorrido ? (recorrido.pausado ? "pausado" : "activo") : "no"; }, plano };

  window.Tarjeta = {
    configurar, mostrar, reiniciar, abrirDialogo,
    fijarNombre(n) { nombreCorto = n; actualizarUI(); },
    detener: detenerRecorrido,
  };
  actualizarUI();
})();
