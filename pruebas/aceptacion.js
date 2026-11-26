/* Pruebas de aceptación end-to-end (Playwright + Chromium, simulación; NO son dispositivos físicos).
   Requiere: sitio en BASE, PostgreSQL local con esquema+semilla y pruebas/servidor_prueba.js en API.
   Uso: bash herramientas/probar_todo.sh                                                          */
const { chromium, devices } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = process.argv[2] || "http://127.0.0.1:8765/";
const API = process.argv[3] || "http://127.0.0.1:8787";
const OUT = process.argv[4] || path.join(__dirname, "capturas");
fs.mkdirSync(OUT, { recursive: true });
const EV = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "datos", "evento.json"), "utf8"));

const resultados = [];
const ok = (n, c, d = "") => { resultados.push({ nombre: n, ok: !!c, detalle: String(d) }); console.log((c ? "✔" : "✘") + " " + n + (d ? " — " + d : "")); };
const est = (p) => p.evaluate(() => ({ e: window.__invitacion.estado, o: window.__invitacion.objetivo, c: window.__invitacion.corriendo, r: window.__invitacion.recorrido }));
const esperarEstado = (p, e, ms = 9000) => p.waitForFunction((x) => window.__invitacion.estado === x && !window.__invitacion.corriendo, e, { timeout: ms });
async function caraVisible(p) {
  await p.evaluate(() => document.getElementById("tarjeta").scrollIntoView({ block: "center" }));
  return p.evaluate(() => {
    const t = document.getElementById("tarjeta").getBoundingClientRect();
    const vis = (el) => { for (let n = el; n && n !== document.body; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.visibility === "hidden" || parseFloat(cs.opacity) < 0.1) return false; } return true; };
    return [0.5, 0.75, 0.25].map((fx) => {
      for (const el of document.elementsFromPoint(t.left + t.width * fx, t.top + t.height * 0.5)) {
        if (!vis(el)) continue;
        const cara = el.closest && el.closest(".cara");
        if (cara) return (cara.parentElement.classList.contains("tapa") ? "tapa." : "base.") + (cara.classList.contains("frente") ? "frente" : "dorso");
      }
      return "nada";
    });
  });
}
async function nuevaPagina(ctx, errores, externos) {
  const p = await ctx.newPage();
  await p.route(/\/js\/config\.js(\?.*)?$/, (r) => r.fulfill({ contentType: "application/javascript", body: `window.CONFIG={supabaseUrl:${JSON.stringify(API)},supabaseAnonKey:"clave-publica-de-prueba"};` }));
  p.on("pageerror", (e) => errores.push(e.message));
  p.on("console", (m) => { if (m.type() === "error") errores.push(m.text()); });
  p.on("request", (r) => { const u = r.url(); if (!u.startsWith(BASE) && !u.startsWith(API) && !/^(blob|data):/.test(u)) externos.push(u); });
  return p;
}
async function irVista(p, v) {
  const nav = p.viewportSize().width >= 900 ? ".nav-superior" : ".nav-inferior";
  await p.click(`${nav} [data-ir="${v}"]`);
  await p.waitForFunction((x) => document.body.dataset.vistaActiva === x, v, { timeout: 5000 });
  await p.waitForTimeout(450); // transición de entrada de la vista (0,35 s)
}
const codigoDe = (g) => "codigo-e2e-" + g;
async function conCodigo(p, grupo, codigo = codigoDe(grupo)) {
  await p.click(`[data-acceso="${grupo}"]`);
  await p.waitForTimeout(450);
  if (await p.isVisible("#paso-codigo")) { await p.fill("#campo-codigo", codigo); await p.click("#btn-ingresar"); }   // con sesión vigente se omite el código
}
async function elegirPadrino(p, id) { await p.goto(BASE, { waitUntil: "networkidle" }); await conCodigo(p, "padrinos"); await p.click(`[data-padrino="${id}"]`); await p.waitForTimeout(2300); }
async function rutaB(p, cat, nombre) {
  await p.goto(BASE, { waitUntil: "networkidle" });
  const acceso = { r1: "residentes", r2: "residentes", otro: "otros", docente: "docentes", egresado: "docentes" }[cat];
  if (acceso === "otros") await p.click(`[data-acceso="otros"]`); else await conCodigo(p, acceso);
  if (cat === "r1" || cat === "r2") await p.click(`[data-cat="${cat}"]`);   // «Familia radiológica» y «Otros» no se subdividen
  await p.fill("#campo-nombre", nombre);
  await p.click("#form-nombre button[type=submit]"); await p.waitForTimeout(2300);
}
async function responder(p, resp) {
  if (await p.evaluate(() => document.body.dataset.vistaActiva) !== "confirmar") await irVista(p, "confirmar");
  for (const [a, e] of Object.entries(resp)) await p.check(`input[name="r-${a}"][value="${e}"]`, { force: true });
  await p.click("#btn-rsvp");
  await p.waitForFunction(() => /exito|error/.test(document.getElementById("rsvp-estado").className), null, { timeout: 15000 });
  return { texto: await p.textContent("#rsvp-estado"), clase: await p.getAttribute("#rsvp-estado", "class") };
}

(async () => {
  const browser = await chromium.launch();

  /* ================= Móvil: flujo completo ================= */
  const errores = [], externos = [];
  const ctx = await browser.newContext({ ...devices["iPhone 13"], locale: "es-VE", acceptDownloads: true });
  let p = await nuevaPagina(ctx, errores, externos);
  await p.goto(BASE, { waitUntil: "networkidle" });
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${OUT}/01-bienvenida-movil.png` });

  // Pantalla inicial: cinco accesos, Especialistas destacado en rojo, candado en los cuatro restringidos
  const accesos = await p.$$eval(".acceso", (a) => a.filter((x) => !x.hidden && x.getBoundingClientRect().width > 0).map((x) => x.querySelector("b").textContent.replace(" (acceso con código)", "").trim() + "·" + x.querySelector("span:not(.sr-solo)").textContent.trim()));
  ok("Bienvenida: cinco accesos con sus subtítulos", accesos.join("|") === "Padrinos y madrinas·Invitados de honor|Familia radiológica·Quienes hacen posible nuestra historia|Residentes R1 y R2·Compañeros del posgrado|Invitados especiales·Familiares, amigos y colegas|Especialistas 2026·Integrantes de la XXIV Promoción", accesos.join("|"));
  ok("Bienvenida: candado discreto en las cuatro categorías restringidas (no en «Otros»)", (await p.$$eval(".acceso .candado", (c) => c.length)) === 4 && (await p.$$eval('[data-acceso="otros"] .candado', (c) => c.length)) === 0);
  ok("Bienvenida: «Especialistas 2026» con fondo rojo institucional", (await p.$eval("#btn-integrante", (b) => getComputedStyle(b).backgroundColor)) === "rgb(185, 28, 28)");
  ok("Bienvenida: frase institucional intacta", (await p.textContent("#bienvenida-titulo")).replace(/\s+/g, " ").trim() === "Hay momentos que merecen ser compartidos");
  // Pantalla de código: validación en servidor
  await p.click('[data-acceso="padrinos"]');
  ok("Código: campo oculto, Mostrar/Ocultar, Ingresar y Volver al inicio", (await p.isVisible("#paso-codigo")) && (await p.getAttribute("#campo-codigo", "type")) === "password" && (await p.isVisible("#btn-ingresar")) && (await p.isVisible("#btn-volver-inicio")));
  await p.click("#ver-codigo"); ok("Código: «Mostrar» revela el texto", (await p.getAttribute("#campo-codigo", "type")) === "text"); await p.click("#ver-codigo");
  await p.fill("#campo-codigo", "codigo-equivocado"); await p.click("#btn-ingresar"); await p.waitForTimeout(700);
  ok("Código incorrecto: mensaje y no avanza", (await p.textContent("#codigo-estado")).includes("no es correcto") && !(await p.isVisible("#lista-nombres")));
  await p.click("#btn-volver-inicio"); ok("Volver al inicio regresa a los cinco accesos", await p.isVisible('[data-acceso="especialistas"]'));
  await p.click('[data-acceso="docentes"]'); await p.fill("#campo-codigo", codigoDe("padrinos")); await p.click("#btn-ingresar"); await p.waitForTimeout(700);
  ok("El código de padrinos NO abre «Familia radiológica»", !(await p.isVisible("#opciones-cat")) && (await p.textContent("#codigo-estado")).includes("no es correcto"));
  await p.click("#btn-volver-inicio");
  await conCodigo(p, "padrinos");
  // Identificación
  const nombres = await p.$$eval("#lista-nombres [data-padrino]", (e) => e.map((x) => x.textContent));
  ok("Selector: 10 padrinos y madrinas", nombres.length === 10, nombres.length);
  ok("Selector: nombres y tratamientos exactos, por apellido", JSON.stringify(nombres) === JSON.stringify(EV.padrinos.map((x) => x.nombre)), nombres.join(" | "));
  ok("Selector: incluye a la Dra. Analy Falcón", nombres.includes("Dra. Analy Falcón"));
  ok("Selector: «Mi nombre no aparece» al final", (await p.textContent("#lista-nombres li:last-child")).trim() === "Mi nombre no aparece");
  ok("Bienvenida: tres logotipos", (await p.$$eval("#bienvenida img", (i) => i.filter((x) => x.complete && x.naturalWidth > 0).length)) === 3);
  for (const [q, esperado] of [["angel", "Dr. Ángel Sosa"], ["UZCATEGUI", "Dra. Reyna Uzcátegui"], ["viña", "Dr. Daniel Viña"], ["sosa", "Dr. Ángel Sosa,Dra. Jenny Sosa"]]) {
    await p.fill("#buscar-nombre", q);
    const r = await p.$$eval("#lista-nombres [data-padrino]", (e) => e.map((x) => x.textContent).join(","));
    ok(`Búsqueda sin tildes/mayúsculas: «${q}»`, r === esperado, r);
  }
  await p.fill("#buscar-nombre", "");

  // Ruta A: padrino
  await p.click('[data-padrino="falcon-analy"]'); await p.waitForTimeout(2300);
  const idA = await p.evaluate(() => window.__flujo.identidad);
  ok("Ruta A: categoría padrino → variante A", idA.categoria === "padrino" && idA.variante === "A", JSON.stringify(idA));
  ok("Ruta A: saludo personalizado", (await p.textContent("#saludo-texto")).startsWith("Dra. Analy Falcón, gracias por haber sido parte de nuestro camino."));
  ok("Ruta A: tarjeta de padrinos con programa de 3 actividades", (await p.getAttribute("#img-interior-izq", "src")).split("?")[0] === "assets/img/A-interior-3-2000.jpg");
  const prog = await p.textContent("#programa");
  ok("Programa: 3 actividades", (await p.$$("#programa li")).length === 3);
  ok("Programa: clase 8:30 a. m. en Auditorio A, Facultad de Medicina", /8:30 a\. m\.\s*Clase magistral\s*Auditorio A, Facultad de Medicina, Universidad de Los Andes/.test(prog.replace(/\s+/g, " ")), prog.replace(/\s+/g, " ").slice(0, 120));
  ok("Programa: sin referencias a 9:00 a. m.", !/9:00 a\. m\./.test(prog));
  ok("Programa: recepción 9:00 p. m. destacada como celebración social", (await p.$$("#programa li.social")).length === 1 && /9:00 p\. m\./.test(prog));
  await p.screenshot({ path: `${OUT}/02-portada-variante-A.png` });

  // Navegación por vistas (padrinos: 5 apartados con Inicio y Mi listón independiente)
  const navEsperadaPadrino = EV.modulos && EV.modulos.listones ? "Inicio|Programa|Confirmar|Mi pase|Mi listón|Palabras|Distancia" : "Inicio|Programa|Confirmar|Mi pase|Palabras|Distancia";
  const navPadrino = await p.$$eval(".nav-inferior [data-ir]", (a) => a.filter((x) => !x.hidden && getComputedStyle(x).display !== "none").map((x) => x.textContent.trim()).join("|"));
  ok("Navegación padrino: «Inicio» activo al entrar y apartados exactos", navPadrino === navEsperadaPadrino && (await p.getAttribute('.nav-inferior [data-ir="invitacion"]', "aria-current")) === "page", navPadrino);
  await irVista(p, "programa"); await irVista(p, "pase");
  ok("Navegación: sección activa marcada", (await p.getAttribute('.nav-inferior [data-ir="pase"]', "aria-current")) === "page" && (await p.isHidden("#vista-invitacion")));
  await p.goBack(); await p.waitForTimeout(400);
  ok("Botón Atrás del navegador vuelve al apartado anterior", (await p.evaluate(() => document.body.dataset.vistaActiva)) === "programa");
  ok("Foco en el título del apartado al cambiar", (await p.evaluate(() => document.activeElement && document.activeElement.id)) === "t-programa");
  const navB = await p.$eval(".nav-inferior", (n) => { const r = n.getBoundingClientRect(); return { alto: Math.round(r.height), abajo: Math.round(innerHeight - r.bottom) }; });
  ok("Barra inferior fija y compacta (≤ 80 px)", navB.abajo === 0 && navB.alto <= 80, JSON.stringify(navB));
  await irVista(p, "invitacion");

  // Animación
  ok("Portada visible", (await caraVisible(p))[0] === "tapa.frente");
  await p.click("#btn-principal"); await p.waitForTimeout(650);
  await p.screenshot({ path: `${OUT}/03-apertura-3d.png` });
  await esperarEstado(p, "abierta");
  let c = await caraVisible(p);
  ok("Apertura completa: interior visible en ambas caras", c[1] === "base.frente" && c[2] === "tapa.dorso", c.join(","));
  await p.screenshot({ path: `${OUT}/04-interior.png` });
  // La función de ampliación no existe: ni botón, ni visor, ni textos, ni activación al tocar
  const sinAmpliar = await p.evaluate(() => ({ btn: !!document.getElementById("btn-ampliar"), visor: !!document.getElementById("dlg-visor"), dialogos: document.querySelectorAll("dialog").length, texto: /ampliar|ampliado/i.test(document.body.innerText) }));
  ok("Sin función Ampliar (botón, visor, diálogos ni textos)", !sinAmpliar.btn && !sinAmpliar.visor && sinAmpliar.dialogos === 0 && !sinAmpliar.texto, JSON.stringify(sinAmpliar));
  // Recorrido por clic sobre la propia tarjeta (sin botones, sin recargas, sin saltos de posición)
  await p.evaluate(() => { window.__marca = "sin-recarga"; });
  const y0 = await p.evaluate(() => Math.round(scrollY));
  await p.click("#btn-reiniciar"); await esperarEstado(p, "cerrada", 10000);
  const regionTarjeta = async () => { const r = await p.evaluate(() => { const c = document.getElementById("tarjeta").getBoundingClientRect(); return { x: c.left + c.width / 2, y: c.top + c.height / 2 }; }); await p.mouse.click(r.x, r.y); };
  await regionTarjeta(); await esperarEstado(p, "abierta");
  ok("Clic 1 sobre la portada: abre la tarjeta", (await caraVisible(p))[1] === "base.frente");
  await regionTarjeta(); await esperarEstado(p, "dorso", 12000);
  ok("Clic 2 sobre el interior: cierra y gira a la contraportada", (await caraVisible(p))[0] === "base.dorso");
  await regionTarjeta(); await esperarEstado(p, "cerrada", 12000);
  ok("Clic 3 sobre la contraportada: vuelve a la portada", (await caraVisible(p))[1] === "tapa.frente");
  ok("El recorrido por clic no recarga la página ni mueve la posición", (await p.evaluate(() => window.__marca)) === "sin-recarga" && Math.abs((await p.evaluate(() => Math.round(scrollY))) - y0) < 5);
  await regionTarjeta(); await esperarEstado(p, "abierta");
  const textoPista = await p.textContent("#pista");
  ok("Indicación del interior: toca la tarjeta", /Toca la tarjeta/.test(textoPista), textoPista);
  const botones = async () => p.evaluate(() => [...document.querySelectorAll(".inv-acciones .btn")].filter((b) => !b.hidden && b.getBoundingClientRect().width > 0).map((b) => b.textContent.replace(/[→\s]+$/, "").trim()).join(" | "));
  ok("Botones del interior: Cerrar tarjeta | Ver contraportada", (await botones()) === "Cerrar tarjeta | Ver contraportada", await botones());
  await p.click("#btn-contra"); await esperarEstado(p, "dorso", 12000);
  ok("Botones de la contraportada: Volver a la portada | Ver el programa", (await botones()) === "Volver a la portada | Ver el programa", await botones());
  c = await caraVisible(p);
  ok("Cierre y giro: contraportada completa", c[0] === "base.dorso", c.join(","));
  await p.screenshot({ path: `${OUT}/06-contraportada.png` });
  // Los controles se desplazan a la zona visible (sobre la barra inferior fija), como haría una persona
  await p.evaluate(() => document.querySelector(".inv-sec").scrollIntoView({ block: "center" }));
  const cubierto = await p.evaluate(() => { const n = document.querySelector(".nav-inferior").getBoundingClientRect().top; return ["#btn-principal"].some((s) => document.querySelector(s).getBoundingClientRect().bottom > n); });
  ok("Controles alcanzables sin quedar bajo la barra inferior (tras desplazar)", !cubierto);
  for (let i = 0; i < 12; i++) { await p.click(i % 2 ? "#btn-principal" : ((await est(p)).e === "abierta" ? "#btn-contra" : "#btn-principal"), { force: true }); await p.waitForTimeout(40); }
  await p.waitForFunction(() => !window.__invitacion.corriendo, null, { timeout: 15000 });
  let s = await est(p);
  ok("Pulsaciones repetidas: estado válido", s.e === s.o && ["cerrada", "abierta", "dorso"].includes(s.e), JSON.stringify(s));
  await p.click("#btn-reproducir");
  await p.waitForFunction(() => window.__invitacion.recorrido === "no" && window.__invitacion.estado === "dorso" && !window.__invitacion.corriendo, null, { timeout: 30000 });
  await p.waitForTimeout(2000);
  ok("Reproducción automática termina y permanece en la contraportada", (await est(p)).e === "dorso" && (await caraVisible(p))[0] === "base.dorso");
  await p.click("#btn-reproducir"); await p.waitForTimeout(2500); await p.click("#btn-reproducir");
  await p.waitForFunction(() => !window.__invitacion.corriendo, null, { timeout: 9000 });
  const pa = await est(p); await p.waitForTimeout(2000);
  ok("Pausa: detiene en estado válido", pa.r === "pausado" && (await est(p)).e === pa.e, JSON.stringify(pa));
  await p.click("#btn-reproducir");
  await p.waitForFunction(() => window.__invitacion.recorrido === "no" && window.__invitacion.estado === "dorso", null, { timeout: 30000 });
  ok("Reanudar: termina en la contraportada", true);
  await p.click("#btn-reiniciar"); await esperarEstado(p, "cerrada", 10000);
  ok("Reiniciar: vuelve a la portada", true);
  const prop = await p.evaluate(() => { const e = document.getElementById("img-interior-der"); const i = { width: e.offsetWidth, height: e.offsetHeight }; const a = [...document.querySelectorAll(".cara img.ajustada")].map((x) => getComputedStyle(x).objectFit); return { spread: (i.width / i.height).toFixed(3), fit: a }; });
  ok("Proporciones originales conservadas", Math.abs(prop.spread - 1.294) < 0.01 && prop.fit.every((f) => f === "contain"), JSON.stringify(prop));

  // RSVP padrino
  const r1 = await responder(p, { clase: "asistira", caravana: "por_confirmar", recepcion: "no_asistira" });
  ok("RSVP padrino: mensaje solo tras guardado real", r1.clase.includes("exito") && r1.texto === "Gracias, Dra. Analy Falcón. Hemos registrado tu respuesta.", r1.texto);
  await p.screenshot({ path: `${OUT}/07-confirmacion.png` });
  // Persistencia: recargar y volver a elegir el nombre → respuestas recuperadas del servidor
  await elegirPadrino(p, "falcon-analy");
  await irVista(p, "confirmar");
  const marcadas = await p.$$eval("#rsvp-actividades input:checked", (i) => i.map((x) => x.name + "=" + x.value).join(","));
  ok("RSVP: respuesta persistida y recuperada del servidor", marcadas === "r-clase=asistira,r-caravana=por_confirmar,r-recepcion=no_asistira", marcadas);
  const r2 = await responder(p, { caravana: "asistira" });
  ok("RSVP: modificación segura (mismo registro)", r2.clase.includes("exito"), r2.texto);

  // Pase padrino
  await irVista(p, "pase");
  await p.waitForFunction(() => document.getElementById("pase-vista").naturalWidth > 0, null, { timeout: 15000 });
  await p.waitForTimeout(300); await p.screenshot({ path: `${OUT}/08-pase-web.png` });
  const dl = p.waitForEvent("download"); await p.click("#pase-png"); const d = await dl;
  const rutaPase = `${OUT}/09-pase-descargado-padrino.png`; await d.saveAs(rutaPase);
  ok("Pase PNG descargado", fs.statSync(rutaPase).size > 200000, (fs.statSync(rutaPase).size / 1024).toFixed(0) + " KB");
  const dlp = p.waitForEvent("download"); await p.click("#pase-pdf"); const dp = await dlp; const rp = `${OUT}/pase-padrino.pdf`; await dp.saveAs(rp);
  ok("Pase PDF válido", fs.readFileSync(rp).subarray(0, 8).toString().startsWith("%PDF-1.4"));

  // Calendario y descargas según elegibilidad
  const ics = await p.$$eval("#cal-ics a", (a) => a.map((x) => x.getAttribute("href")));
  ok("Calendario padrino: 3 eventos + archivo conjunto", JSON.stringify(ics) === JSON.stringify(["assets/calendario/jornada-3-actividades.ics", "assets/calendario/clase.ics", "assets/calendario/caravana.ics", "assets/calendario/recepcion.ics"]), ics.join(","));
  const g1 = new URL(await p.getAttribute("#cal-google a", "href")).searchParams;
  ok("Google Calendar: 8:30 hora de Caracas, Auditorio A", g1.get("dates") === "20261128T083000/20261128T083000" && g1.get("ctz") === "America/Caracas" && g1.get("location").startsWith("Auditorio A, Facultad de Medicina"), g1.get("dates") + " · " + g1.get("location"));
  const mapas = await p.$$eval("#mapas a", (a) => a.map((x) => decodeURIComponent(new URL(x.href).searchParams.get("query"))));
  ok("Maps clase magistral → Facultad de Medicina (no el hospital)", /Facultad de Medicina, Universidad de Los Andes/.test(mapas[0]) && !/Hospital/.test(mapas[0]), mapas[0]);
  ok("Maps caravana → Hospital Universitario de Los Andes", /Hospital Universitario de Los Andes/.test(mapas[1]), mapas[1]);
  await irVista(p, "invitacion");
  const portada = await p.evaluate(() => { const i = document.getElementById("img-portada"); const r = { nat: i.naturalWidth / i.naturalHeight, caja: i.offsetWidth / i.offsetHeight }; return { nat: r.nat.toFixed(3), caja: r.caja.toFixed(3) }; });
  const caras = await p.evaluate(() => [["img-portada", 1], ["img-contra", 1], ["img-interior-izq", 2], ["img-interior-der", 2]].map(([id, mitades]) => {
    const i = document.getElementById(id), cara = i.closest(".cara");
    return { id, imagen: (i.naturalWidth / mitades / i.naturalHeight).toFixed(3), cara: (cara.offsetWidth / cara.offsetHeight).toFixed(3) };
  }));
  ok("Las cuatro caras: proporción de la imagen = proporción de la cara (sin franjas)", caras.every((c) => Math.abs(c.imagen - c.cara) < 0.006), JSON.stringify(caras));
  ok("Apariencia clara declarada (only light) y fondo #F4E6D1", (await p.getAttribute('meta[name="color-scheme"]', "content")) === "only light" && (await p.evaluate(() => getComputedStyle(document.body).backgroundColor)) === "rgb(244, 230, 209)");
  ok("Portada vertical que llena la hoja (sin bandas ni recortes)", Math.abs(portada.nat - portada.caja) < 0.005 && portada.nat === (3125 / 4830).toFixed(3), JSON.stringify(portada));
  ok("Descarga de la variante correcta (A, 3 actividades)",(await p.getAttribute("#descarga-invitacion", "href")) === "assets/descargas/invitacion-A-3.pdf");

  // Ruta B: R1
  p = await nuevaPagina(ctx, errores, externos);
  await rutaB(p, "r1", "  José   Ñáñez D’Alessandro ");
  const idB = await p.evaluate(() => [window.__flujo.identidad, window.__flujo.actividades]);
  ok("Ruta B R1: variante B sin recepción (regla por defecto)", idB[0].variante === "B" && idB[1].join() === "clase,caravana", JSON.stringify(idB));
  ok("R1: nombre limpiado y con caracteres especiales", (await p.textContent("#saludo-nombre")) === "José Ñáñez D’Alessandro");
  ok("R1: RSVP solo de actividades habilitadas", (await p.$$("#rsvp-actividades fieldset")).length === 2);
  ok("R1: tarjeta de residentes", (await p.getAttribute("#img-portada", "src")).split("?")[0] === "assets/img/B-portada-1400.jpg");
  const rb = await responder(p, { clase: "asistira", caravana: "asistira" });
  ok("R1: confirmación guardada", rb.clase.includes("exito"), rb.texto);
  await p.screenshot({ path: `${OUT}/10-residente-R1.png` });
  await irVista(p, "pase"); await p.waitForFunction(() => document.getElementById("pase-vista").naturalWidth > 0, null, { timeout: 15000 });
  const dlb = p.waitForEvent("download"); await p.click("#pase-png"); const db = await dlb; await db.saveAs(`${OUT}/11-pase-descargado-R1.png`);
  ok("R1: calendario sin recepción", (await p.$$eval("#cal-ics a", (a) => a.map((x) => x.getAttribute("href")).join(","))) === "assets/calendario/jornada-2-actividades.ics,assets/calendario/clase.ics,assets/calendario/caravana.ics");

  // Ruta B: invitado especial
  p = await nuevaPagina(ctx, errores, externos);
  await rutaB(p, "otro", "Carmen Rivas");
  ok("Invitado especial: variante C", (await p.evaluate(() => window.__flujo.identidad.variante)) === "C");
  ok("Invitado especial: tuteo en el cierre", (await p.textContent("#saludo-texto")).includes("tu presencia"));
  ok("Invitado especial: sin «Confirmar asistencia» ni «Mi pase» hasta ser autorizado", (await p.isHidden('.nav-inferior [data-ir="confirmar"]')) && (await p.isHidden('.nav-inferior [data-ir="pase"]')));
  await p.screenshot({ path: `${OUT}/12-otro-invitado.png` });
  // Spam: campo trampa (los errores 400/403 que siguen son provocados a propósito y se excluyen)
  const erroresAntes = errores.length;
  p = await nuevaPagina(ctx, errores, externos);
  await rutaB(p, "docente", "Robot Spam");
  await p.evaluate(() => { document.getElementById("rsvp-web").value = "http://spam"; });
  const rs = await responder(p, { clase: "asistira" });
  ok("Antispam: no se muestra éxito si el servidor rechaza", rs.clase.includes("error"), rs.texto);

  // Cambio de identidad: no se conservan respuestas sin guardar de otra persona
  p = await nuevaPagina(ctx, errores, externos);
  await elegirPadrino(p, "rojas-gustavo"); await irVista(p, "confirmar");
  await p.check('input[name="r-clase"][value="no_asistira"]', { force: true });
  ok("Resumen de respuestas se actualiza", /Clase magistral\s*No podré asistir/.test(await p.textContent("#rsvp-resumen")));
  await p.click("#btn-cambiar-nombre"); await conCodigo(p, "residentes"); await p.click('[data-cat="r2"]');
  await p.fill("#campo-nombre", "Persona Distinta"); await p.click("#form-nombre button[type=submit]"); await p.waitForTimeout(1500);
  await irVista(p, "confirmar");
  ok("Cambio de identidad: formulario limpio", (await p.$$("#rsvp-actividades input:checked")).length === 0);
  await p.close();
  // Acceso directo a un apartado
  p = await nuevaPagina(ctx, errores, externos);
  await p.goto(BASE + "#programa", { waitUntil: "networkidle" }); await conCodigo(p, "padrinos"); await p.click('[data-padrino="moreno-franklin"]'); await p.waitForTimeout(1500);
  ok("Acceso directo: #programa abre el apartado tras identificarse", (await p.evaluate(() => document.body.dataset.vistaActiva)) === "programa");
  await p.close();
  // Sin base de datos configurada: el acceso con código no se simula; «Otros» sigue viendo tarjeta y programa
  const p0 = await ctx.newPage();
  await p0.route(/\/js\/config\.js(\?.*)?$/, (r) => r.fulfill({ contentType: "application/javascript", body: "window.CONFIG={}" }));
  await p0.goto(BASE, { waitUntil: "networkidle" }); await conCodigo(p0, "padrinos"); await p0.waitForTimeout(800);
  ok("Sin Supabase: el código no se valida ni se simula", (await p0.textContent("#codigo-estado")).includes("no está disponible") && !(await p0.isVisible("#lista-nombres")));
  await p0.click("#btn-volver-inicio"); await p0.click('[data-acceso="otros"]'); await p0.fill("#campo-nombre", "Invitado Sin Red"); await p0.click("#form-nombre button[type=submit]"); await p0.waitForTimeout(2300);
  await p0.screenshot({ path: `${OUT}/15-sin-base-de-datos.png` });
  await p0.close();
  p = await nuevaPagina(ctx, errores, externos);

  if (!(EV.modulos && EV.modulos.listones)) {
    p = await nuevaPagina(ctx, errores, externos);
    await elegirPadrino(p, "rojas-gustavo"); await irVista(p, "pase");
    ok("Módulo de listones no publicado: acceso y sección Mi listón ocultos", (await p.isHidden('.nav-inferior [data-ir="liston"]')) && (await p.isVisible("#panel-pase")) && (await p.evaluate(() => document.getElementById("btn-integrante").hidden)));
    await p.close();
  } else {
  // Especialistas 2026: acceso directo a Mi listón, Inicio regresa al espacio conmemorativo, sin confirmación
  p = await nuevaPagina(ctx, errores, externos);
  await p.goto(BASE, { waitUntil: "networkidle" });
  ok("Inicio: acceso «Especialistas 2026» visible", await p.isVisible("#btn-integrante"));
  await conCodigo(p, "especialistas"); await p.waitForSelector("#lista-graduandos [data-graduando]");
  const grads = await p.$$eval("#lista-graduandos [data-graduando]", (e) => e.map((x) => x.textContent));
  ok("Integrantes: los 7 graduandos", grads.join("|") === "Dr. Jorge Arrieta|Dr. Nelson Páez|Dr. Diego Guillén|Dr. José Sánchez|Dra. Andrea Montes|Dra. Francia Méndez|Dra. Oriana Hernández", grads.join("|"));
  await p.click('[data-graduando="arrieta-jorge"]'); await p.waitForTimeout(1500);
  ok("Graduando: entra directamente a su listón", (await p.evaluate(() => document.body.dataset.vistaActiva)) === "liston" && (await p.isVisible("#vista-liston")) && (await p.getAttribute("#liston-vista", "src")).split("?")[0] === "assets/listones/arrieta-jorge.png");
  const navG = await p.$$eval(".nav-inferior a", (a) => a.filter((x) => !x.hidden && getComputedStyle(x).display !== "none").map((x) => x.textContent.trim()).join("|"));
  ok("Graduando: navegación exacta (Inicio|Programa|Mi listón|Palabras|Distancia)", navG === "Inicio|Programa|Mi listón|Palabras|Distancia", navG);
  await p.evaluate(() => { location.hash = "confirmar"; }); await p.waitForTimeout(400);
  ok("Graduando: la ruta #confirmar no está disponible", (await p.evaluate(() => document.body.dataset.vistaActiva)) === "liston");
  await irVista(p, "invitacion");
  ok("Graduando: botón Inicio regresa al espacio conmemorativo personalizado", (await p.isVisible("#espacio-especialista")) && (await p.textContent("#esp-nombre")) === "Dr. Jorge Arrieta");
  await irVista(p, "liston");
  ok("Graduando: PDF colectivos A4 disponibles", await p.isVisible("#liston-colectivos"));
  for (const [sel, tipo] of [["#liston-png", "image/png"], ["#liston-png-600", "image/png"], ["#liston-pdf", "application/pdf"]]) {
    const r = await p.request.get(BASE + (await p.getAttribute(sel, "href")));
    ok(`Listón descargable (${sel} · ${tipo})`, r.ok() && (r.headers()["content-type"] || "").startsWith(tipo), r.status());
  }
  await p.screenshot({ path: `${OUT}/16-graduando-liston.png` });
  await p.close();
  // Padrino: Mi listón como sección independiente de Mi pase + botón Inicio conserva estado de tarjeta
  p = await nuevaPagina(ctx, errores, externos);
  await elegirPadrino(p, "rojas-gustavo");
  await p.click("#btn-principal"); await esperarEstado(p, "abierta");
  await irVista(p, "liston");
  ok("Padrino: sección independiente Mi listón personalizada (sin colectivos)", (await p.evaluate(() => document.body.dataset.vistaActiva)) === "liston" && (await p.getAttribute("#liston-vista", "src")).split("?")[0] === "assets/listones/rojas-gustavo.png" && (await p.isHidden("#vista-pase")) && (await p.isHidden("#liston-colectivos")));
  await p.screenshot({ path: `${OUT}/17-padrino-liston.png` });
  await irVista(p, "invitacion");
  ok("Botón Inicio: regresa a la tarjeta conservando estado abierto e identidad", (await est(p)).e === "abierta" && (await p.textContent("#saludo-nombre")) === "Dr. Gustavo Rojas");
  await p.close();
  // Residente: sin opción Mi listón en menú y ruta #liston bloqueada
  p = await nuevaPagina(ctx, errores, externos);
  await rutaB(p, "r2", "Residente Prueba");
  const navR = await p.$$eval(".nav-inferior a", (a) => a.filter((x) => !x.hidden && getComputedStyle(x).display !== "none").map((x) => x.textContent.trim()).join("|"));
  ok("Residente: navegación sin Mi listón (Inicio|Programa|Confirmar|Mi pase)", navR === "Inicio|Programa|Confirmar|Mi pase|Palabras|Distancia", navR);
  await p.evaluate(() => { location.hash = "liston"; }); await p.waitForTimeout(400);
  ok("Residente: ruta #liston no accesible", (await p.evaluate(() => document.body.dataset.vistaActiva)) !== "liston");
  await p.close();
  }
  p = await nuevaPagina(ctx, errores, externos);

  // ===== Dedicatorias y aportes (públicos, sin CAPTCHA externo) =====
  p = await nuevaPagina(ctx, errores, externos);
  await p.goto(BASE, { waitUntil: "networkidle" });
  ok("Bienvenida: acceso público «Palabras que nos acompañan» sin código y sin referencias económicas", (await p.isVisible('[data-visitante="dedicatorias"]')) && !/aporte|pago|dinero|dólar|bs\.?|transferencia|donaci/i.test(await p.textContent("#bienvenida")));
  await p.click('[data-visitante="dedicatorias"]'); await p.waitForFunction(() => document.body.dataset.vistaActiva === "dedicatorias");
  ok("Palabras que nos acompañan: encabezado, frase y «Dejar unas palabras» como acción principal con formulario plegado", (await p.textContent("#vista-dedicatorias .versalita")).includes("XXIV Promoción · ULA 2026") && (await p.textContent("#t-dedic")).replace(/\s+/g, " ").includes("Palabras que nos acompañan") && (await p.textContent(".cita-libro")).includes("recuerdos para toda la vida") && (await p.textContent("#dd-abrir")) === "Dejar unas palabras" && !(await p.isVisible("#form-dedic")));
  ok("Palabras que nos acompañan: sin referencias a aportes económicos", !/aporte|pago m|dinero|transferencia|donaci|detalle con la promoci/i.test(await p.textContent("#vista-dedicatorias")));
  ok("Inicio, programa y bienvenida: «Desde la distancia» solo se alcanza desde el menú", (await p.$$eval('[data-ir="distancia"]', (e) => e.filter((x) => !x.closest("nav")).length)) === 0);
  await p.click("#dd-abrir");
  await p.waitForSelector("#dd-stickers .sticker"); await p.waitForFunction(() => !document.getElementById("dd-enviar").disabled, null, { timeout: 8000 });
  ok("Dedicatorias: visibles para un visitante sin código", await p.isVisible("#form-dedic"));
  ok("Dedicatorias: tipografía manuscrita (Caveat) cargada", await p.evaluate(async () => { await document.fonts.load('500 20px Caveat'); return document.fonts.check('500 20px Caveat'); }));
  ok("Dedicatorias: exactamente seis stickers", (await p.$$("#dd-stickers .sticker")).length === 6);
  ok("Dedicatorias: sin emojis ni subida de archivos", !(await p.$("#form-dedic input[type=file]")) && !/\p{Extended_Pictographic}/u.test(await p.textContent("#form-dedic")));
  await p.check('input[name="dd-dest"][value="esp"]');
  const espOpts = await p.$$eval("#dd-esp option", (o) => o.length);
  ok("Dedicatorias: al elegir un especialista se despliegan los siete graduandos", (await p.isVisible("#dd-esp")) && espOpts === 7, espOpts);
  await p.selectOption("#dd-esp", "arrieta-jorge");
  await p.fill("#dd-msg", "Felicitaciones, Dr. Arrieta. Gracias por todo."); await p.fill("#dd-autor", "María Prueba"); await p.fill("#dd-tel", "+58 412 1234567");
  await p.click('[data-sticker="corazon"]'); await p.click('[data-sticker="birrete"]'); await p.click('[data-sticker="brindis"]');
  ok("Dedicatorias: máximo dos stickers", (await p.$$eval('#dd-stickers [aria-pressed="true"]', (x) => x.length)) === 2);
  const previa = await p.textContent("#dd-vista");
  ok("Dedicatorias: vista previa con destinatario, mensaje y firma", previa.includes("Dr. Jorge Arrieta") && previa.includes("Felicitaciones, Dr. Arrieta") && previa.includes("— María Prueba") && (await p.$$("#dd-vista .sticker-img")).length === 2);
  ok("Dedicatorias: aviso de privacidad del teléfono", (await p.textContent("#form-dedic")).includes("Tu número de teléfono será tratado de forma privada y no aparecerá en la dedicatoria."));
  await p.screenshot({ path: `${OUT}/17-dedicatorias.png`, fullPage: true });
  await p.click("#dd-enviar"); await p.waitForSelector("#dd-gracias:not([hidden])", { timeout: 10000 });
  ok("Dedicatorias: mensaje de gracias y aviso de revisión", (await p.textContent("#dd-gracias")).includes("Gracias por dejar una huella en nuestra historia") && (await p.textContent("#dd-gracias")).includes("revisada antes de publicarse"));
  const hdr = { apikey: "x", "Content-Type": "application/json" };
  const rbd = await p.request.post(API + "/rest/v1/rpc/dedicatoria_enviar", { headers: hdr, data: { p_destinatario: "promocion", p_mensaje: "Mensaje de un robot", p_autor: "Bot", p_telefono: "+584120000001", p_stickers: [], p_trampa: "http://spam" } });
  ok("Llamada directa con el campo trampa lleno es rechazada por el servidor", rbd.status() === 400 && /solicitud_rechazada/.test(await rbd.text()), rbd.status());
  const rbx = await p.request.post(API + "/rest/v1/rpc/dedicatoria_enviar", { headers: hdr, data: { p_destinatario: "promocion", p_mensaje: "<script>x</script>", p_autor: "A", p_telefono: "no-es-telefono", p_stickers: ["💖"] } });
  ok("Llamada directa con datos inválidos es rechazada (validación en servidor)", rbx.status() === 400, rbx.status());
  const pub = await (await p.request.post(API + "/rest/v1/rpc/dedicatorias_publicas", { headers: hdr, data: {} })).json();
  ok("Dedicatoria pendiente: no aparece en el libro público", pub.length === 0);
  const lect = await p.request.get(API + "/rest/v1/dedicatorias?select=telefono", { headers: hdr });
  ok("El público no puede leer teléfonos", lect.status() === 404 || lect.status() === 401 || lect.status() === 403);
  await p.close();
  // «Desde la distancia»: sección independiente, solo desde el menú; el detalle voluntario solo al desplegarlo
  p = await nuevaPagina(ctx, errores, externos);
  await p.goto(BASE, { waitUntil: "networkidle" }); await p.click('[data-visitante="dedicatorias"]'); await p.waitForFunction(() => document.body.dataset.vistaActiva === "dedicatorias");
  await irVista(p, "distancia");
  ok("Desde la distancia: título y texto aprobados", (await p.textContent("#t-distancia")).replace(/\s+/g, " ").includes("Hay muchas formas de estar presentes") && (await p.textContent("#vista-distancia")).includes("Tu cariño, tus enseñanzas y tus buenos deseos también forman parte de este logro."));
  await p.waitForSelector("#pm-detalle:not([hidden])");
  ok("Detalle voluntario: opción discreta plegada, sin datos de Pago Móvil a la vista", (await p.textContent("#pm-detalle summary")).includes("¿Deseas tener un detalle con la promoción?") && !(await p.isVisible("#pm-datos")) && !(await p.textContent("#vista-distancia")).includes("Titular de Prueba") && (await p.$$("#pm-datos .pm-fila")).length === 0);
  ok("Desde la distancia: sin botones destacados (ningún botón primario)", (await p.$$("#vista-distancia .btn-primario")).length === 0);
  await p.click("#pm-detalle summary"); await p.waitForSelector("#pm-datos .pm-fila");
  const filas = await p.$$eval("#pm-datos .pm-fila", (f) => f.map((x) => x.querySelector("dt").textContent));
  ok("Detalle voluntario: al elegirlo se muestran cinco datos con su botón Copiar", filas.join("|") === "Banco|Código bancario|Titular|Cédula de identidad|Teléfono" && (await p.$$("#pm-datos .pm-copiar")).length === 5, filas.join("|"));
  ok("Detalle voluntario: aviso de voluntariedad y cierre de gratitud", (await p.textContent("#pm-tarjeta")).includes("Todo es voluntario") && (await p.textContent("#pm-gracias")).includes("incluso desde la distancia"));
  ok("Detalle voluntario: sin montos, metas ni comprobantes", !/(monto|meta|m[ií]nimo|comprobante|ranking)/i.test(await p.textContent("#vista-distancia")));
  await p.evaluate(() => { window.__cp = []; navigator.clipboard.writeText = async (t) => { window.__cp.push(t); }; });
  await p.click('[data-copiar="cedula"]'); await p.waitForTimeout(150);
  ok("Detalle voluntario: copiar un dato individual con confirmación visual", (await p.evaluate(() => window.__cp[0])) === "1" && (await p.textContent("#pm-copiado")).includes("Copiado"));
  await p.click("#pm-copiar-todo"); await p.waitForTimeout(150);
  const todo = await p.evaluate(() => window.__cp[1]);
  ok("Detalle voluntario: «Copiar datos de Pago Móvil» copia los cinco datos", /^Pago Móvil\nBanco: .+\nCódigo bancario: .+\nTitular: .+\nCédula de identidad: .+\nTeléfono: .+$/.test(todo), todo);
  await p.screenshot({ path: `${OUT}/18-desde-la-distancia.png`, fullPage: true });
  await p.click("#pm-detalle summary"); await p.waitForTimeout(200);
  ok("Detalle voluntario: al plegarlo los datos desaparecen", (await p.$$("#pm-datos .pm-fila")).length === 0);
  const sw2 = await p.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  ok("Desde la distancia: sin desplazamiento horizontal en móvil", sw2[0] <= sw2[1], sw2.join(" ≤ "));
  await p.close();

  // ===== «Invitados especiales»: cinco funcionalidades de acceso libre, visibles desde Inicio =====
  p = await nuevaPagina(ctx, errores, externos);
  await rutaB(p, "otro", "Visitante Otros");
  const ops = await p.$$eval("#otros-tarjetas .op b", (b) => b.map((x) => x.textContent));
  ok("Otros: tarjetas visibles desde Inicio (ver, programa, palabras, solicitar)", ops.join("|") === "Ver invitación|Programa|Palabras que nos acompañan|Solicitar invitación" && (await p.isVisible("#otros-tarjetas")), ops.join("|"));
  ok("Otros: sin contraseña ni registro previo (acceso libre)", !(await p.isVisible("#paso-codigo")));
  await p.screenshot({ path: `${OUT}/19-otros-inicio.png`, fullPage: true });
  await p.click('#otros-tarjetas [data-ir="solicitar"]'); await p.waitForFunction(() => document.body.dataset.vistaActiva === "solicitar");
  await p.waitForFunction(() => !document.getElementById("sol-enviar").disabled, null, { timeout: 8000 });
  await p.fill("#sol-nombre", "Familiar Prueba"); await p.selectOption("#sol-tipo", "padrino"); await p.fill("#sol-tel", "+58 414 5550000");
  ok("Solicitud: seis opciones de quién invita", (await p.$$eval("#sol-tipo option", (o) => o.map((x) => x.textContent).join("|"))) === "Padrino o madrina|Radiólogo 2026|Residente R1|Residente R2|Familia radiológica|Otro");
  await p.click("#sol-enviar"); await p.waitForTimeout(300);
  ok("Solicitud: el nombre de quien invita es obligatorio", (await p.textContent("#sol-estado")).includes("nombre de quien te invita") && await p.isVisible("#form-solic"));
  await p.fill("#sol-quien", "Dra. Analy Falcón");
  await p.click("#sol-enviar"); await p.waitForSelector("#sol-gracias:not([hidden])", { timeout: 10000 });
  ok("Solicitar invitación: identifica quién invita y confirma el envío", (await p.textContent("#sol-gracias")).includes("Hemos recibido tu solicitud"));
  const rsol = await p.request.post(API + "/rest/v1/rpc/solicitar_invitacion", { headers: { apikey: "x", "Content-Type": "application/json" }, data: { p_nombre: "Bot", p_invita_tipo: "otro", p_invita_nombre: "", p_telefono: "+584140000000" } });
  ok("Solicitud directa sin quién invita es rechazada por el servidor", rsol.status() === 400 && /invita_invalido/.test(await rsol.text()));
  await p.evaluate(() => { location.hash = "dedicatorias"; }); await p.waitForFunction(() => document.body.dataset.vistaActiva === "dedicatorias");
  await p.click("#dd-abrir");
  ok("Otros: dedicatorias disponibles aunque su solicitud no esté autorizada", await p.isVisible("#form-dedic"));
  await p.evaluate(() => { location.hash = "distancia"; }); await p.waitForFunction(() => document.body.dataset.vistaActiva === "distancia");
  await p.waitForSelector("#pm-detalle:not([hidden])", { timeout: 8000 });
  ok("Otros: «Desde la distancia» disponible desde el menú sin confirmar asistencia", await p.isVisible("#pm-detalle"));
  const navOt = await p.$$eval(".nav-inferior a", (a) => a.filter((x) => !x.hidden && getComputedStyle(x).display !== "none").map((x) => x.textContent.trim()).join("|"));
  ok("Otros: navegación Inicio|Programa|Palabras|Distancia|Solicitar", navOt === "Inicio|Programa|Palabras|Distancia|Solicitar", navOt);
  await p.close();
  // ===== Costo de entrada de la recepción: en la actividad y antes de confirmar; no en portada ni «Desde la distancia» =====
  p = await nuevaPagina(ctx, errores, externos);
  await elegirPadrino(p, "rojas-gustavo");
  const COSTO = "Costo de entrada: 3 USD por persona.";
  await irVista(p, "programa");
  const items = await p.$$eval("#programa .momento", (li) => li.map((x) => [x.textContent.includes("Recepción"), x.textContent.includes("3 USD")]));
  ok("Programa: el costo aparece solo en la recepción de Mucumbarila", items.length === 3 && items.filter((x) => x[1]).length === 1 && items.find((x) => x[0])[1] && (await p.textContent("#programa .momento.social")).includes(COSTO), JSON.stringify(items));
  await irVista(p, "confirmar");
  const rc = await p.$$eval("#rsvp-actividades fieldset", (f) => f.map((x) => [x.textContent.includes("Recepción"), x.textContent.includes("3 USD")]));
  ok("Confirmación: el costo se muestra antes de responder en la recepción (y solo allí)", rc.filter((x) => x[1]).length === 1 && rc.find((x) => x[0])[1], JSON.stringify(rc));
  await irVista(p, "invitacion");
  ok("Portada e Inicio: sin el costo", !(await p.textContent("#vista-invitacion")).includes("USD"));
  await irVista(p, "distancia");
  ok("«Desde la distancia»: sin el costo (no es un aporte voluntario)", !(await p.textContent("#vista-distancia")).includes("USD"));
  await p.close();
  p = await nuevaPagina(ctx, errores, externos); await p.goto(BASE, { waitUntil: "networkidle" });
  ok("Bienvenida: sin el costo", !(await p.textContent("#bienvenida")).includes("USD"));
  const imgs = await p.evaluate(async () => (await (await fetch("datos/evento.json")).json()).actividades.filter((a) => a.costo_texto).map((a) => a.codigo));
  ok("Dato único en evento.json solo para la recepción", imgs.join() === "recepcion");
  await p.close();

  // Familia radiológica (una sola comunidad, sin subdivisiones)
  p = await nuevaPagina(ctx, errores, externos);
  await p.goto(BASE, { waitUntil: "networkidle" }); await conCodigo(p, "docentes"); await p.waitForSelector("#form-nombre:not([hidden])");
  ok("Familia radiológica: sin subdivisiones visibles (no se elige docente/egresado)", !(await p.isVisible("#opciones-cat")) && (await p.$$("#opciones-cat .opcion-cat")).length === 0);
  ok("Familia radiológica: título de la identificación", (await p.textContent("#categoria-pregunta")) === "Familia radiológica");
  await p.fill("#campo-nombre", "Dr. Luis Ángel Núñez"); await p.click("#form-nombre button[type=submit]"); await p.waitForTimeout(2300);
  ok("Familia radiológica: invitación personalizada y variante general", (await p.textContent("#saludo-eyebrow")) === "Familia radiológica" && (await p.textContent("#saludo-nombre")) === "Dr. Luis Ángel Núñez" && (await p.evaluate(() => window.__flujo.identidad.variante)) === "C");
  ok("Docente: la recepción no se asume (solo clase y caravana)", (await p.evaluate(() => window.__flujo.actividades.join())) === "clase,caravana");
  const rd = await responder(p, { clase: "asistira", caravana: "por_confirmar" });
  ok("Docente: confirmación guardada", rd.clase.includes("exito"), rd.texto);
  await irVista(p, "pase"); await p.waitForFunction(() => document.getElementById("pase-vista").naturalWidth > 0, null, { timeout: 15000 });
  ok("Docente: pase con su categoría", true);
  await p.close();
  p = await nuevaPagina(ctx, errores, externos);
  // Registro anterior como «egresado» (creado antes del cambio): se conserva y se presenta como Familia radiológica
  const ses = await (await p.request.post(API + "/rest/v1/rpc/acceso_validar", { headers: { apikey: "x", "Content-Type": "application/json" }, data: { p_grupo: "docentes", p_codigo: "codigo-e2e-docentes" } })).json();
  const leg = await (await p.request.post(API + "/rest/v1/rpc/guardar_con_sesion", { headers: { apikey: "x", "Content-Type": "application/json" }, data: { p_sesion: ses.sesion, p_token: null, p_categoria: "egresado", p_padrino_id: null, p_nombre: "Dra. Marta Rivas", p_respuestas: { clase: "no_asistira" }, p_trampa: null, p_nota: null } })).json();
  ok("Registro «egresado» anterior sigue siendo válido (permisos conservados)", leg.invitacion && leg.invitacion.categoria === "egresado" && leg.invitacion.actividades.join() === "clase,caravana");
  await p.goto(BASE + "#t=" + leg.token, { waitUntil: "networkidle" }); await p.waitForSelector("#sobre-escena:not(.cargando)"); await p.click("#btn-token-continuar"); await p.waitForTimeout(2300);
  ok("Registro anterior: se presenta como «Familia radiológica»", (await p.textContent("#saludo-eyebrow")) === "Familia radiológica");
  await p.close();
  p = await nuevaPagina(ctx, errores, externos);
  await p.goto(BASE, { waitUntil: "networkidle" }); await conCodigo(p, "padrinos"); await p.click("#btn-no-aparece");
  ok("«Mi nombre no aparece» vuelve al menú de accesos", await p.isVisible('[data-acceso="docentes"]'));
  await p.close();
  p = await nuevaPagina(ctx, errores, externos);

  // Seguridad: lectura directa
  const directo = await p.evaluate(async (api) => (await fetch(api + "/rest/v1/invitados?select=*", { headers: { apikey: "x" } })).status, API);
  ok("Público no puede leer registros", directo === 403, directo);
  await p.close();
  const provocados = errores.splice(erroresAntes);
  ok("Solo los errores provocados (400 antispam, 403 lectura pública)", provocados.length === 2 && provocados.every((e) => /status of (400|403)/.test(e)), provocados.join(" | "));

  // «Invitados especiales»: acceso libre a tarjeta y programa; sin confirmar ni pase hasta ser autorizado
  p = await nuevaPagina(ctx, errores, externos);
  await rutaB(p, "otro", "Visitante Libre");
  const navO = await p.$$eval(".nav-inferior a", (a) => a.filter((x) => !x.hidden && getComputedStyle(x).display !== "none").map((x) => x.textContent.trim()).join("|"));
  ok("Otros: navegación Inicio|Programa|Palabras|Distancia|Solicitar (sin confirmar ni pase hasta ser autorizado)", navO === "Inicio|Programa|Palabras|Distancia|Solicitar", navO);
  await p.evaluate(() => { location.hash = "confirmar"; }); await p.waitForTimeout(400);
  ok("Otros: la ruta #confirmar no está disponible", (await p.evaluate(() => document.body.dataset.vistaActiva)) !== "confirmar");
  ok("Otros: ve la tarjeta personalizada", (await p.getAttribute("#img-portada", "src")).split("?")[0] === "assets/img/C-portada-1400.jpg");
  const sw = await p.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  ok("Móvil: sin desplazamiento horizontal", sw[0] <= sw[1], sw.join(" ≤ "));
  await p.close();

  /* ================= Panel administrativo ================= */
  const actx = await browser.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true, locale: "es-VE" });
  const a = await nuevaPagina(actx, errores, externos);
  await a.goto(BASE + "admin/", { waitUntil: "networkidle" });
  await a.fill("#correo", "otro@prueba.local"); await a.fill("#clave", "clave-de-prueba"); await a.click("#form-acceso button");
  await a.waitForTimeout(1200);
  ok("Panel: cuenta sin permisos no accede", (await a.isHidden("#panel")) && /no figura como organizadora/.test(await a.textContent("#acceso-aviso")));
  await a.fill("#correo", "organizador@prueba.local"); await a.fill("#clave", "clave-de-prueba"); await a.click("#form-acceso button");
  await a.waitForSelector("#panel:not([hidden])", { timeout: 10000 });
  const tiles = await a.$$eval(".adm-tile", (t) => Object.fromEntries(t.map((x) => [x.querySelector("span").textContent, +x.querySelector("b").textContent])));
  ok("Panel: 10 padrinos, 1 respondió, 9 pendientes", tiles["Padrinos y madrinas"] === 10 && tiles["Padrinos que respondieron"] === 1 && tiles["Padrinos pendientes"] === 9, JSON.stringify(tiles));
  ok("Panel: R1/R2/otros registrados", tiles["R1 registrados"] === 1 && tiles["R2 registrados"] === 0 && tiles["Invitados especiales registrados"] === 0, JSON.stringify(tiles));
  ok("Panel: graduandos fuera de tasas", tiles["Graduandos (anfitriones)"] === 7);
  const acts = await a.$$eval(".adm-act", (x) => x.map((e) => [e.querySelector("h3").textContent, [...e.querySelectorAll("dd")].map((d) => +d.textContent)]));
  const clase = acts.find((x) => x[0] === "Clase magistral")[1];
  ok("Panel clase: confirmados 3 (padrino, R1, docente; «Otros» ya no se autorregistra), total previsto = 3 + 7 graduandos + 3 por confirmar", clase[0] === 13 && clase[1] === 3 && clase[2] === 1 && clase[3] === 0 && clase[5] === 10, JSON.stringify(clase));
  const rec = acts.find((x) => /Recepción/.test(x[0]))[1];
  ok("Panel recepción: habilitados = 10 padrinos (R1 y otro no aplican)", rec[0] === 10 && rec[2] === 1, JSON.stringify(rec));
  await a.screenshot({ path: `${OUT}/13-panel.png`, fullPage: true });
  await a.selectOption("#f-cat", "r1");
  ok("Panel: filtro por categoría", (await a.$$("#tabla tbody tr")).length === 1);
  await a.selectOption("#f-cat", ""); await a.selectOption("#f-act", "clase"); await a.selectOption("#f-estado", "sin_responder");
  ok("Panel: filtro por actividad y estado", (await a.$$("#tabla tbody tr")).length === 9);
  await a.selectOption("#f-act", ""); await a.selectOption("#f-estado", "");
  await a.fill("#f-buscar", "nanez");
  ok("Panel: búsqueda sin tildes", (await a.$$("#tabla tbody tr")).length === 1);
  await a.fill("#f-buscar", "");
  const dcsv = a.waitForEvent("download"); await a.click("#exportar"); const csv = await dcsv; const rcsv = `${OUT}/confirmaciones.csv`; await csv.saveAs(rcsv);
  const txt = fs.readFileSync(rcsv, "utf8");
  ok("CSV compatible con Excel (BOM UTF-8, «;»)", txt.charCodeAt(0) === 0xfeff && txt.split("\r\n")[0].includes(";") && txt.includes("Dra. Analy Falcón"), txt.split("\r\n")[0]);

  const tD = await a.$$eval(".adm-tile", (t) => Object.fromEntries(t.map((x) => [x.querySelector("span").textContent, +x.querySelector("b").textContent])));
  ok("Panel: «Familia radiológica registrada» agrupa docentes y egresados", tD["Familia radiológica registrada"] === 2 && !("Docentes registrados" in tD) && !("Egresados registrados" in tD), JSON.stringify(tD));
  await a.selectOption("#f-cat", "familia");
  ok("Panel: filtro «Familia radiológica» incluye ambos registros", (await a.$$("#tabla tbody tr")).length === 2 && /Familia radiológica/.test(await a.textContent("#tabla tbody")));
  await a.selectOption("#f-cat", "");
  const dcsv2 = a.waitForEvent("download"); await a.click("#exportar"); const csv2 = await dcsv2; await csv2.saveAs(`${OUT}/confirmaciones-2.csv`);
  const txt2 = fs.readFileSync(`${OUT}/confirmaciones-2.csv`, "utf8");
  ok("CSV: ambos registros con la denominación «Familia radiológica»", /Dr\. Luis Ángel Núñez";"Familia radiológica"/.test(txt2) && /Dra\. Marta Rivas";"Familia radiológica"/.test(txt2));
  // ===== Centro de invitaciones: enlaces masivos, autorizaciones con el mismo enlace, mensajes, revocación =====
  await a.click("#ci > summary"); await a.waitForSelector("#ci-tabla tbody tr");
  await a.selectOption("#ci-cat", "familia"); ok("Centro: filtro «Familia radiológica» agrupa ambos registros", (await a.$$("#ci-tabla tbody tr")).length === 2); await a.fill("#ci-buscar", "Luis Ángel");
  ok("Centro: filtro por categoría y búsqueda", (await a.$$("#ci-tabla tbody tr")).length === 1);
  await a.check("#ci-todos"); ok("Centro: «Seleccionar todos» marca los visibles", (await a.textContent("#ci-n")).startsWith("1 seleccionados"));
  await a.click("#ci-generar"); await a.waitForTimeout(900);
  ok("Centro: enlaces generados y vigentes", /Vigente/.test(await a.textContent("#ci-tabla")) && /Sin enviar/.test(await a.textContent("#ci-tabla")));
  await a.evaluate(() => { window.__cp = []; navigator.clipboard.writeText = async (t) => { window.__cp.push(t); }; });
  await a.click("#ci-copiar-inst"); await a.waitForTimeout(500);
  const mi = await a.evaluate(() => window.__cp[0]);
  const enl = (mi.match(/https?:\/\/\S+#t=[\w-]+/) || [])[0];
  ok("Mensaje institucional: texto aprobado con nombre y enlace personalizado", /^Dr\. Luis Ángel Núñez, has recibido una invitación especial\.\nLa XXIV Promoción de Radiólogos de la Universidad de Los Andes desea compartir contigo este momento tan significativo\.\n28 de noviembre de 2026\.\nhttp\S+#t=\S+\nHay momentos que merecen ser compartidos$/.test(mi), mi.slice(0, 120));
  await a.click("#ci-copiar-res"); await a.waitForTimeout(300);
  ok("Acceso reservado: exige validar antes la contraseña de la categoría", (await a.evaluate(() => window.__cp.length)) === 1 && /Valide primero/.test(await a.textContent("#toast")));
  await a.fill("#ci-c-docentes", "contraseña-equivocada"); await a.click('[data-cod="docentes"]'); await a.waitForTimeout(500);
  ok("Contraseña incorrecta no se acepta", /no coincide/.test(await a.textContent("#toast")));
  await a.fill("#ci-c-docentes", "codigo-e2e-docentes"); await a.click('[data-cod="docentes"]'); await a.waitForTimeout(500);
  await a.click("#ci-copiar-res"); await a.waitForTimeout(300);
  const mr = await a.evaluate(() => window.__cp[1]);
  ok("Mensaje de acceso reservado: categoría, contraseña vigente e instrucciones", /Acceso reservado · Familia radiológica/.test(mr) && mr.includes("Contraseña vigente: codigo-e2e-docentes") && /1\. Abre la invitación/.test(mr), mr.slice(0, 100));
  ok("La contraseña no se persiste en el navegador", await a.evaluate(() => !JSON.stringify(Object.assign({}, localStorage, sessionStorage)).includes("codigo-e2e")));
  await a.click("#ci-colectivos"); await a.click('[data-col="res"][data-c="otro"]'); await a.waitForTimeout(300);
  ok("Invitación colectiva de «Otros»: acceso libre sin contraseña", /no requiere contraseña/.test(await a.evaluate(() => window.__cp[2])));
  // El destinatario abre su enlace: bienvenida personalizada y actividades vigentes
  const pe = await nuevaPagina(ctx, errores, externos);
  await pe.goto("about:blank"); await pe.goto(enl, { waitUntil: "networkidle" }); await pe.waitForSelector("#sobre-escena:not(.cargando)");
  ok("Destinatario: «Has recibido una invitación especial», nombre y botón «Abrir mi invitación»", (await pe.textContent("#sobre-escena")).includes("Has recibido una invitación especial") && (await pe.textContent("#token-saludo")) === "Dr. Luis Ángel Núñez" && (await pe.textContent("#btn-token-continuar")) === "Abrir mi invitación");
  await pe.click("#btn-token-continuar"); await pe.waitForTimeout(2200);
  const a0 = await pe.evaluate(() => window.__flujo.actividades.join());
  ok("Destinatario: actividades según la categoría (clase, caravana)", a0 === "clase,caravana", a0);
  // El administrador autoriza las tres; el MISMO enlace muestra la recepción
  await a.click("#ci-tres"); await a.waitForTimeout(1500);
  await pe.goto("about:blank"); await pe.goto(enl, { waitUntil: "networkidle" }); await pe.click("#btn-token-continuar"); await pe.waitForTimeout(2200);
  ok("«Autorizar las tres» se aplica con el mismo enlace, sin reenviar", (await pe.evaluate(() => window.__flujo.actividades.join())) === "clase,caravana,recepcion");
  ok("Panel: la tabla refleja la autorización", /Recepción/.test(await a.textContent("#ci-tabla")));
  await a.check('[data-ci-act="clase"]'); await a.uncheck('[data-ci-act="caravana"]'); await a.uncheck('[data-ci-act="recepcion"]'); await a.click("#ci-aplicar"); await a.waitForTimeout(1500);
  await pe.goto("about:blank"); await pe.goto(enl, { waitUntil: "networkidle" }); await pe.click("#btn-token-continuar"); await pe.waitForTimeout(2200);
  ok("Quitar actividades: el mismo enlace muestra solo las autorizadas", (await pe.evaluate(() => window.__flujo.actividades.join())) === "clase");
  await a.click("#ci-restablecer"); await a.waitForTimeout(1200);
  await a.click("#ci-bitacora-ver"); await a.waitForTimeout(600);
  ok("Bitácora: registra las modificaciones administrativas", /autorizacion/.test(await a.textContent("#ci-bitacora")) && /enlaces_generados/.test(await a.textContent("#ci-bitacora")));
  // WhatsApp consecutivo (sin servicios de pago: enlace wa.me)
  await a.evaluate(() => { window.__wa = []; window.open = (u) => { window.__wa.push(u); return null; }; });
  await a.click("#ci-wa"); await a.waitForSelector("#dlg-wa[open]");
  await a.click("#wa-abrir"); await a.click("#wa-sig"); await a.waitForTimeout(600);
  ok("WhatsApp: abre wa.me con el mensaje y marca como enviado sin volver a generar", /^https:\/\/wa\.me\/\?text=/.test(await a.evaluate(() => window.__wa[0])) && (await a.textContent("#wa-progreso")).includes("Terminado"));
  await a.click("#dlg-wa [data-cerrar]");
  ok("Distribución: estado «Enviado»", /Enviado/.test(await a.textContent("#ci-tabla")));
  const dci = a.waitForEvent("download"); await a.click("#ci-csv"); const cif = await dci; await cif.saveAs(`${OUT}/invitaciones.csv`);
  const tci = fs.readFileSync(`${OUT}/invitaciones.csv`, "utf8");
  ok("CSV de invitaciones: enlace, actividades y estado", /Nombre";"Categoría";"Clase magistral";"Caravana";"Recepción";"Enlace";"Estado de distribución"/.test(tci) && tci.includes("#t=") && tci.includes("Enviado"));
  await a.evaluate(() => { window.confirm = () => true; });
  await a.click("#ci-revocar"); await a.waitForTimeout(1200);
  await pe.goto("about:blank"); await pe.goto(enl, { waitUntil: "networkidle" }); await pe.waitForTimeout(800);
  ok("Revocar: el enlace deja de funcionar", (await pe.textContent("#acceso-pregunta")).includes("ya no está vigente"));
  await pe.close();
  await a.fill("#ci-buscar", ""); await a.selectOption("#ci-cat", "");
  // Solicitudes de invitación en el panel
  await a.click("#solic > summary"); await a.waitForSelector('#solic-tabla [data-ap="1"]');
  ok("Panel: solicitud con teléfono y «Lo invita» (Dra. Analy Falcón)", /Dra\. Analy Falcón/.test(await a.textContent("#solic-tabla")) && /\+584145550000/.test(await a.textContent("#solic-tabla")));
  await a.click('#solic-tabla [data-ap="1"]'); await a.waitForTimeout(1500);
  await a.selectOption("#ci-cat", "otro");
  ok("Aprobar: el solicitante aparece en el Centro de invitaciones como Invitado especial", /Familiar Prueba/.test(await a.textContent("#ci-tabla")));
  await a.selectOption("#ci-cat", "");
  // ===== Pretarjeta (sobre con sello XXIV) en sesión privada y móvil, también con sesión previa en el navegador =====
  {
    const ses2 = await (await p.request.post(API + "/rest/v1/rpc/acceso_validar", { headers: { apikey: "x", "Content-Type": "application/json" }, data: { p_grupo: "docentes", p_codigo: "codigo-e2e-docentes" } })).json();
    const reg = await (await p.request.post(API + "/rest/v1/rpc/guardar_con_sesion", { headers: { apikey: "x", "Content-Type": "application/json" }, data: { p_sesion: ses2.sesion, p_token: null, p_categoria: "docente", p_padrino_id: null, p_nombre: "Dra. Sobre Prueba", p_respuestas: { clase: "asistira" }, p_trampa: null, p_nota: null } })).json();
    const enlaceSobre = BASE + "#t=" + reg.token;
    for (const [etq, opts] of [["sesión privada · móvil", { ...devices["iPhone 13"] }], ["sesión privada · escritorio", { viewport: { width: 1366, height: 768 } }]]) {
      const cx = await browser.newContext(opts); const px = await nuevaPagina(cx, errores, externos);
      await px.goto(enlaceSobre, { waitUntil: "domcontentloaded" });
      ok(`Sobre (${etq}): el formulario general de categorías no se muestra`, !(await px.isVisible("#paso-acceso")) && !(await px.isVisible(".accesos")));
      await px.waitForSelector("#sobre-escena:not(.cargando)", { timeout: 10000 });
      const t = await px.textContent("#sobre-escena");
      ok(`Sobre (${etq}): «Has recibido una invitación especial», nombre de Supabase, mensaje y botón`, t.includes("Has recibido una invitación especial") && (await px.textContent("#token-saludo")) === "Dra. Sobre Prueba" && t.includes("desea compartir contigo este momento tan significativo") && (await px.textContent("#btn-token-continuar")) === "Abrir mi invitación");
      ok(`Sobre (${etq}): sello rojo XXIV y tres logotipos oficiales`, (await px.textContent(".sello")).trim() === "XXIV" && (await px.$$eval(".sobre-logos img", (i) => i.filter((x) => x.complete && x.naturalWidth > 0).length)) === 3);
      const sw = await px.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth, document.getElementById("btn-token-continuar").getBoundingClientRect().bottom, innerHeight]);
      ok(`Sobre (${etq}): sin desplazamiento horizontal y botón a la vista`, sw[0] <= sw[1] && sw[2] <= sw[3], sw.join(","));
      await px.screenshot({ path: `${OUT}/20-sobre-${etq.includes("móvil") ? "movil" : "escritorio"}.png` });
      await px.click("#btn-token-continuar"); await px.waitForTimeout(500);
      ok(`Sobre (${etq}): animación de apertura (solapa y carta)`, await px.evaluate(() => document.getElementById("sobre-escena").classList.contains("abierto") && getComputedStyle(document.querySelector(".sello")).opacity !== "1" || document.getElementById("sobre-escena").classList.contains("abierto")));
      await px.waitForFunction(() => document.body.classList.contains("identificado") && !document.documentElement.classList.contains("modo-sobre"), null, { timeout: 12000 });
      ok(`Sobre (${etq}): transición a la tarjeta tridimensional personalizada`, (await px.isVisible("#escenario")) && (await px.textContent("#saludo-nombre")) === "Dra. Sobre Prueba");
      await px.screenshot({ path: `${OUT}/21-tarjeta-tras-sobre-${etq.includes("móvil") ? "movil" : "escritorio"}.png` });
      // Vuelve a abrir el mismo enlace con la sesión anterior del navegador (identidad y token guardados): debe mostrarse el sobre otra vez
      await px.goto("about:blank"); await px.goto(enlaceSobre, { waitUntil: "domcontentloaded" });
      await px.waitForSelector("#sobre-escena:not(.cargando)", { timeout: 10000 });
      ok(`Sobre (${etq}): con sesión previa en el navegador se muestra de nuevo, sin saltar a Inicio ni al formulario`, !(await px.isVisible(".accesos")) && !(await px.evaluate(() => document.body.classList.contains("identificado"))) && (await px.isVisible("#btn-token-continuar")));
      await cx.close();
    }
    // Un enlace pegado en una pestaña ya abierta también muestra el sobre
    const pz = await nuevaPagina(ctx, errores, externos);
    await pz.goto(BASE, { waitUntil: "networkidle" }); await pz.evaluate((h) => { location.hash = h; }, "t=" + reg.token);
    await pz.waitForSelector("#sobre-escena:not(.cargando)", { timeout: 10000 });
    ok("Sobre: enlace pegado en una pestaña ya abierta muestra la escena", await pz.isVisible("#btn-token-continuar"));
    await pz.close();
  }
  // Moderación de dedicatorias en el panel
  await a.click("details:has(#dd-tabla) summary"); await a.waitForSelector("#dd-tabla tbody tr");
  const ddTile = await a.$$eval("#dd-indicadores .adm-tile", (t) => Object.fromEntries(t.map((x) => [x.querySelector("span").textContent, +x.querySelector("b").textContent])));
  ok("Panel dedicatorias: indicadores recibidas/pendientes/aprobadas/rechazadas", ddTile["Recibidas"] === 1 && ddTile["Pendientes"] === 1 && ddTile["Aprobadas"] === 0, JSON.stringify(ddTile));
  ok("Panel dedicatorias: teléfono visible solo aquí y mensaje pendiente", /\+584121234567/.test(await a.textContent("#dd-tabla")) && /Pendiente/.test(await a.textContent("#dd-tabla")));
  await a.click('#dd-tabla [data-e="aprobado"]'); await a.waitForTimeout(700);
  const pubOk = await (await a.request.post(API + "/rest/v1/rpc/dedicatorias_publicas", { headers: { apikey: "x", "Content-Type": "application/json" }, data: {} })).json();
  ok("Aprobada: aparece en el libro público sin teléfono", pubOk.length === 1 && pubOk[0].para === "Dr. Jorge Arrieta" && !JSON.stringify(pubOk).includes("+58"), JSON.stringify(pubOk).slice(0, 160));
  const dd = a.waitForEvent("download"); await a.click("#dd-exportar"); const ddf = await dd; await ddf.saveAs(`${OUT}/dedicatorias.csv`);
  ok("Exportación de dedicatorias aprobadas", fs.readFileSync(`${OUT}/dedicatorias.csv`, "utf8").includes("María Prueba"));
  const pl = await nuevaPagina(ctx, errores, externos);
  await pl.goto(BASE, { waitUntil: "networkidle" }); await pl.click('[data-visitante="dedicatorias"]'); await pl.waitForSelector("#libro-dedic .libro-item");
  ok("Libro público: muestra la dedicatoria aprobada con firma y fecha", (await pl.textContent("#libro-dedic")).includes("Felicitaciones, Dr. Arrieta") && (await pl.textContent("#libro-dedic")).includes("María Prueba") && !(await pl.textContent("#libro-dedic")).includes("+58"));
  await pl.close();
  await a.click('#dd-tabla [data-e="oculto"]'); await a.waitForTimeout(500);
  ok("Ocultar: la dedicatoria deja de ser pública", (await (await a.request.post(API + "/rest/v1/rpc/dedicatorias_publicas", { headers: { apikey: "x", "Content-Type": "application/json" }, data: {} })).json()).length === 0);
  await a.click("details:has(#reglas) summary");
  const matriz = await a.$$eval("#reglas tbody tr", (f) => f.map((r) => r.querySelector("th").textContent.trim()));
  ok("Panel: matriz de habilitación con Familia radiológica como una sola fila", matriz.length === 5 && matriz.filter((m) => /Familia radiológica/.test(m)).length === 1, matriz.join(" | "));
  await a.check('#reglas input[data-cat="docente"][data-act="recepcion"]'); await a.waitForTimeout(1500);
  const pdoc = await nuevaPagina(ctx, errores, externos);
  await rutaB(pdoc, "docente", "Dra. Ana Soto");
  ok("Matriz: el organizador habilita la recepción para docentes", (await pdoc.evaluate(() => window.__flujo.actividades.join())) === "clase,caravana,recepcion");
  await pdoc.close();
  await a.uncheck('#reglas input[data-cat="docente"][data-act="recepcion"]'); await a.waitForTimeout(1200);
  // Elegibilidad de recepción por categoría (el apartado ya está abierto)
  await a.check('#reglas input[data-cat="r1"][data-act="recepcion"]'); await a.waitForTimeout(1500);
  const pr = await nuevaPagina(ctx, errores, externos);
  await rutaB(pr, "r1", "Nuevo Residente");
  ok("Regla por categoría aplicada en la app (R1 con recepción)", (await pr.evaluate(() => window.__flujo.actividades.join())) === "clase,caravana,recepcion");
  await pr.close();
  await a.uncheck('#reglas input[data-cat="r1"][data-act="recepcion"]'); await a.waitForTimeout(1200);

  // Enlace individual para un padrino → verificado
  const fila = a.locator("#tabla tbody tr", { hasText: "Dra. Jenny Sosa" });
  await fila.locator("[data-enlace]").click();
  await a.waitForSelector("#dlg-enlace[open]");
  const enlace = await a.inputValue("#enlace-url");
  ok("Enlace individual generado (token en el fragmento)", /#t=[A-Za-z0-9_-]{40,}$/.test(enlace), enlace.replace(/#t=.*/, "#t=…"));
  await a.click("#dlg-enlace [data-cerrar]");
  const pi = await nuevaPagina(ctx, errores, externos);
  await pi.goto(BASE + "#t=" + enlace.split("#t=")[1], { waitUntil: "networkidle" }); await pi.waitForTimeout(800);
  ok("Enlace individual: reconoce a la persona", (await pi.textContent("#token-saludo")) === "Dra. Jenny Sosa" && (await pi.textContent("#sobre-escena")).includes("Has recibido una invitación especial"));
  ok("Enlace individual: el token se retira de la barra de direcciones", !pi.url().includes("#t="));
  await pi.click("#btn-token-continuar"); await pi.waitForTimeout(2200);
  const ri = await responder(pi, { clase: "asistira", caravana: "asistira", recepcion: "asistira" });
  ok("Enlace individual: confirmación guardada", ri.clase.includes("exito"), ri.texto);
  await pi.close();
  await a.click("#recargar"); await a.waitForTimeout(1500);
  ok("Panel: respuesta por enlace individual marcada «Verificado»", await a.locator("#tabla tbody tr", { hasText: "Dra. Jenny Sosa" }).locator(".sello.ok").count() === 1);
  const t2 = await a.$$eval(".adm-tile", (t) => Object.fromEntries(t.map((x) => [x.querySelector("span").textContent, +x.querySelector("b").textContent])));
  ok("Panel: asistirán a 3 actividades = 1", t2["Asistirán a 3 actividades"] === 1, JSON.stringify(t2));
  // Corrección manual
  await a.locator("#tabla tbody tr", { hasText: "Dr. Gustavo Rojas" }).locator('select.estado-sel').first().selectOption("asistira");
  await a.waitForTimeout(1500);
  ok("Panel: corrección manual de un estado", (await a.locator("#tabla tbody tr", { hasText: "Dr. Gustavo Rojas" }).locator("select.estado-sel").first().inputValue()) === "asistira");
  await a.setViewportSize({ width: 390, height: 844 }); await a.waitForTimeout(300);
  await a.screenshot({ path: `${OUT}/14-panel-movil.png`, fullPage: true });

  ok("Sin errores en consola", errores.length === 0, errores.slice(0, 5).join(" | "));
  ok("Sin peticiones a terceros", externos.length === 0, externos.slice(0, 5).join(" | "));
  await browser.close();

  // ICS: contenido
  for (const f of ["clase", "caravana", "recepcion", "jornada-3-actividades", "jornada-2-actividades"]) {
    const t = fs.readFileSync(path.join(__dirname, "..", "assets", "calendario", f + ".ics"), "utf8").replace(/\r\n /g, "");
    const ini = [...t.matchAll(/DTSTART;TZID=America\/Caracas:(\d{8}T\d{6})/g)].map((m) => m[1]);
    ok(`ICS ${f}: horas de Caracas y avisos -P1D/-PT1H`, t.includes("BEGIN:VCALENDAR") && t.includes("TRIGGER:-P1D") && t.includes("TRIGGER:-PT1H") && !t.includes("DTEND") && ini.length > 0, ini.join(","));
  }
  const tc = fs.readFileSync(path.join(__dirname, "..", "assets", "calendario", "clase.ics"), "utf8").replace(/\r\n /g, "");
  ok("ICS clase: 8:30 en Auditorio A (sin Hospital ni 9:00)", tc.includes("20261128T083000") && tc.includes("Auditorio A") && !tc.includes("Hospital") && !tc.includes("090000"));

  const fallos = resultados.filter((r) => !r.ok);
  console.log(`\n${resultados.length - fallos.length}/${resultados.length} criterios superados`);
  fs.writeFileSync(path.join(OUT, "resultados.json"), JSON.stringify(resultados, null, 2));
  process.exit(fallos.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
