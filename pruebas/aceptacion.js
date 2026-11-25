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
  await p.route("**/js/config.js", (r) => r.fulfill({ contentType: "application/javascript", body: `window.CONFIG={supabaseUrl:${JSON.stringify(API)},supabaseAnonKey:"clave-publica-de-prueba"};` }));
  p.on("pageerror", (e) => errores.push(e.message));
  p.on("console", (m) => { if (m.type() === "error") errores.push(m.text()); });
  p.on("request", (r) => { const u = r.url(); if (!u.startsWith(BASE) && !u.startsWith(API) && !/^(blob|data):/.test(u)) externos.push(u); });
  return p;
}
async function elegirPadrino(p, id) { await p.goto(BASE, { waitUntil: "networkidle" }); await p.click(`[data-padrino="${id}"]`); await p.waitForTimeout(2300); }
async function rutaB(p, cat, nombre) {
  await p.goto(BASE, { waitUntil: "networkidle" });
  await p.click("#btn-no-aparece"); await p.click(`[data-cat="${cat}"]`); await p.fill("#campo-nombre", nombre);
  await p.click("#form-nombre button[type=submit]"); await p.waitForTimeout(2300);
}
async function responder(p, resp) {
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
  ok("Ruta A: tarjeta de padrinos con programa de 3 actividades", (await p.getAttribute("#img-interior-izq", "src")) === "assets/img/A-interior-3-2000.jpg");
  const prog = await p.textContent("#programa");
  ok("Programa: 3 actividades", (await p.$$("#programa li")).length === 3);
  ok("Programa: clase 8:30 a. m. en Auditorio A, Facultad de Medicina", /8:30 a\. m\.\s*Clase magistral\s*Auditorio A, Facultad de Medicina, Universidad de Los Andes/.test(prog.replace(/\s+/g, " ")), prog.replace(/\s+/g, " ").slice(0, 120));
  ok("Programa: sin referencias a 9:00 a. m.", !/9:00 a\. m\./.test(prog));
  ok("Programa: recepción 9:00 p. m. destacada como celebración social", (await p.$$("#programa li.social")).length === 1 && /9:00 p\. m\./.test(prog));
  await p.screenshot({ path: `${OUT}/02-portada-variante-A.png` });

  // Animación
  ok("Portada visible", (await caraVisible(p))[0] === "tapa.frente");
  await p.click("#btn-principal"); await p.waitForTimeout(650);
  await p.screenshot({ path: `${OUT}/03-apertura-3d.png` });
  await esperarEstado(p, "abierta");
  let c = await caraVisible(p);
  ok("Apertura completa: interior visible en ambas caras", c[1] === "base.frente" && c[2] === "tapa.dorso", c.join(","));
  await p.screenshot({ path: `${OUT}/04-interior.png` });
  await p.click("#btn-ampliar"); await p.waitForTimeout(1500);
  ok("Ampliación del interior en alta resolución", (await p.evaluate(() => document.getElementById("visor-img").naturalWidth)) === 3600);
  await p.click("#zoom-mas"); await p.click("#zoom-mas"); await p.waitForTimeout(300);
  await p.screenshot({ path: `${OUT}/05-interior-ampliado.png` });
  await p.click("#dlg-visor [data-cerrar]");
  await p.click("#btn-contra"); await esperarEstado(p, "dorso", 12000);
  c = await caraVisible(p);
  ok("Cierre y giro: contraportada completa", c[0] === "base.dorso", c.join(","));
  await p.screenshot({ path: `${OUT}/06-contraportada.png` });
  for (let i = 0; i < 12; i++) { await p.click(i % 2 ? "#btn-principal" : "#btn-contra", { force: true }); await p.waitForTimeout(40); }
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
  await p.evaluate(() => document.getElementById("rsvp").scrollIntoView()); await p.screenshot({ path: `${OUT}/07-confirmacion.png` });
  // Persistencia: recargar y volver a elegir el nombre → respuestas recuperadas del servidor
  await elegirPadrino(p, "falcon-analy");
  const marcadas = await p.$$eval("#rsvp-actividades input:checked", (i) => i.map((x) => x.name + "=" + x.value).join(","));
  ok("RSVP: respuesta persistida y recuperada del servidor", marcadas === "r-clase=asistira,r-caravana=por_confirmar,r-recepcion=no_asistira", marcadas);
  const r2 = await responder(p, { caravana: "asistira" });
  ok("RSVP: modificación segura (mismo registro)", r2.clase.includes("exito"), r2.texto);

  // Pase padrino
  await p.click(".accion.principal");
  await p.waitForFunction(() => document.getElementById("pase-vista").naturalWidth > 0, null, { timeout: 15000 });
  await p.waitForTimeout(300); await p.screenshot({ path: `${OUT}/08-pase-web.png` });
  const dl = p.waitForEvent("download"); await p.click("#pase-png"); const d = await dl;
  const rutaPase = `${OUT}/09-pase-descargado-padrino.png`; await d.saveAs(rutaPase);
  ok("Pase PNG descargado", fs.statSync(rutaPase).size > 200000, (fs.statSync(rutaPase).size / 1024).toFixed(0) + " KB");
  const dlp = p.waitForEvent("download"); await p.click("#pase-pdf"); const dp = await dlp; const rp = `${OUT}/pase-padrino.pdf`; await dp.saveAs(rp);
  ok("Pase PDF válido", fs.readFileSync(rp).subarray(0, 8).toString().startsWith("%PDF-1.4"));
  await p.click("#dlg-pase [data-cerrar]");

  // Calendario y descargas según elegibilidad
  const ics = await p.$$eval("#cal-ics a", (a) => a.map((x) => x.getAttribute("href")));
  ok("Calendario padrino: 3 eventos + archivo conjunto", JSON.stringify(ics) === JSON.stringify(["assets/calendario/jornada-3-actividades.ics", "assets/calendario/clase.ics", "assets/calendario/caravana.ics", "assets/calendario/recepcion.ics"]), ics.join(","));
  const g1 = new URL(await p.getAttribute("#cal-google a", "href")).searchParams;
  ok("Google Calendar: 8:30 hora de Caracas, Auditorio A", g1.get("dates") === "20261128T083000/20261128T083000" && g1.get("ctz") === "America/Caracas" && g1.get("location").startsWith("Auditorio A, Facultad de Medicina"), g1.get("dates") + " · " + g1.get("location"));
  const mapas = await p.$$eval("#mapas a", (a) => a.map((x) => decodeURIComponent(new URL(x.href).searchParams.get("query"))));
  ok("Maps clase magistral → Facultad de Medicina (no el hospital)", /Facultad de Medicina, Universidad de Los Andes/.test(mapas[0]) && !/Hospital/.test(mapas[0]), mapas[0]);
  ok("Maps caravana → Hospital Universitario de Los Andes", /Hospital Universitario de Los Andes/.test(mapas[1]), mapas[1]);
  const portada = await p.evaluate(() => { const i = document.getElementById("img-portada"); const r = { nat: i.naturalWidth / i.naturalHeight, caja: i.offsetWidth / i.offsetHeight }; return { nat: r.nat.toFixed(3), caja: r.caja.toFixed(3) }; });
  ok("Portada vertical que llena la hoja (sin bandas ni recortes)", Math.abs(portada.nat - portada.caja) < 0.005 && portada.nat === (3125 / 4830).toFixed(3), JSON.stringify(portada));
  ok("Descarga de la variante correcta (A, 3 actividades)",(await p.getAttribute("#descarga-invitacion", "href")) === "assets/descargas/invitacion-A-3.pdf");

  // Ruta B: R1
  p = await nuevaPagina(ctx, errores, externos);
  await rutaB(p, "r1", "  José   Ñáñez D’Alessandro ");
  const idB = await p.evaluate(() => [window.__flujo.identidad, window.__flujo.actividades]);
  ok("Ruta B R1: variante B sin recepción (regla por defecto)", idB[0].variante === "B" && idB[1].join() === "clase,caravana", JSON.stringify(idB));
  ok("R1: nombre limpiado y con caracteres especiales", (await p.textContent("#saludo-nombre")) === "José Ñáñez D’Alessandro");
  ok("R1: RSVP solo de actividades habilitadas", (await p.$$("#rsvp-actividades fieldset")).length === 2);
  ok("R1: tarjeta de residentes", (await p.getAttribute("#img-portada", "src")) === "assets/img/B-portada-1400.jpg");
  const rb = await responder(p, { clase: "asistira", caravana: "asistira" });
  ok("R1: confirmación guardada", rb.clase.includes("exito"), rb.texto);
  await p.screenshot({ path: `${OUT}/10-residente-R1.png` });
  await p.click(".accion.principal"); await p.waitForFunction(() => document.getElementById("pase-vista").naturalWidth > 0, null, { timeout: 15000 });
  const dlb = p.waitForEvent("download"); await p.click("#pase-png"); const db = await dlb; await db.saveAs(`${OUT}/11-pase-descargado-R1.png`);
  await p.click("#dlg-pase [data-cerrar]");
  ok("R1: calendario sin recepción", (await p.$$eval("#cal-ics a", (a) => a.map((x) => x.getAttribute("href")).join(","))) === "assets/calendario/jornada-2-actividades.ics,assets/calendario/clase.ics,assets/calendario/caravana.ics");

  // Ruta B: otro invitado
  p = await nuevaPagina(ctx, errores, externos);
  await rutaB(p, "otro", "Carmen Rivas");
  ok("Otro invitado: variante C", (await p.evaluate(() => window.__flujo.identidad.variante)) === "C");
  ok("Otro invitado: tuteo en el cierre", (await p.textContent("#saludo-texto")).includes("tu presencia"));
  ok("Otro invitado: puede dejar nota de omisión", !(await p.isHidden("#rsvp-nota-caja")));
  await p.fill("#rsvp-nota", "Soy madrina y no aparezco en el listado.");
  const rc = await responder(p, { clase: "por_confirmar" });
  ok("Otro invitado: confirmación guardada", rc.clase.includes("exito"), rc.texto);
  await p.screenshot({ path: `${OUT}/12-otro-invitado.png` });
  // Spam: campo trampa (los errores 400/403 que siguen son provocados a propósito y se excluyen)
  const erroresAntes = errores.length;
  p = await nuevaPagina(ctx, errores, externos);
  await rutaB(p, "otro", "Robot Spam");
  await p.evaluate(() => { document.getElementById("rsvp-web").value = "http://spam"; });
  const rs = await responder(p, { clase: "asistira" });
  ok("Antispam: no se muestra éxito si el servidor rechaza", rs.clase.includes("error"), rs.texto);

  // Seguridad: lectura directa
  const directo = await p.evaluate(async (api) => (await fetch(api + "/rest/v1/invitados?select=*", { headers: { apikey: "x" } })).status, API);
  ok("Público no puede leer registros", directo === 403, directo);
  await p.close();
  const provocados = errores.splice(erroresAntes);
  ok("Solo los errores provocados (400 antispam, 403 lectura pública)", provocados.length === 2 && provocados.every((e) => /status of (400|403)/.test(e)), provocados.join(" | "));

  // Vista general sin personalizar
  p = await nuevaPagina(ctx, errores, externos);
  await p.goto(BASE, { waitUntil: "networkidle" }); await p.click("#btn-general"); await p.waitForTimeout(1500);
  ok("Invitación general sin personalizar disponible", (await p.isVisible("#rsvp-identificar")) && (await p.getAttribute("#img-portada", "src")) === "assets/img/C-portada-1400.jpg");
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
  ok("Panel: R1/R2/otros registrados", tiles["R1 registrados"] === 1 && tiles["R2 registrados"] === 0 && tiles["Otros invitados registrados"] === 1, JSON.stringify(tiles));
  ok("Panel: graduandos fuera de tasas", tiles["Graduandos (anfitriones)"] === 7);
  const acts = await a.$$eval(".adm-act", (x) => x.map((e) => [e.querySelector("h3").textContent, [...e.querySelectorAll("dd")].map((d) => +d.textContent)]));
  const clase = acts.find((x) => x[0] === "Clase magistral")[1];
  ok("Panel clase: confirmados 2 (padrino + R1), total previsto = 2 + 7", clase[1] === 2 && clase[5] === 9, JSON.stringify(clase));
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
  ok("Panel: nota de omisión visible", /no aparezco en el listado/.test(await a.textContent("#tabla")));
  const dcsv = a.waitForEvent("download"); await a.click("#exportar"); const csv = await dcsv; const rcsv = `${OUT}/confirmaciones.csv`; await csv.saveAs(rcsv);
  const txt = fs.readFileSync(rcsv, "utf8");
  ok("CSV compatible con Excel (BOM UTF-8, «;»)", txt.charCodeAt(0) === 0xfeff && txt.split("\r\n")[0].includes(";") && txt.includes("Dra. Analy Falcón"), txt.split("\r\n")[0]);

  // Elegibilidad de recepción por categoría
  await a.click("details:has(#reglas) summary");
  await a.check('#reglas input[data-cat="r1"]'); await a.waitForTimeout(1500);
  const pr = await nuevaPagina(ctx, errores, externos);
  await rutaB(pr, "r1", "Nuevo Residente");
  ok("Regla por categoría aplicada en la app (R1 con recepción)", (await pr.evaluate(() => window.__flujo.actividades.join())) === "clase,caravana,recepcion");
  await pr.close();
  await a.uncheck('#reglas input[data-cat="r1"]'); await a.waitForTimeout(1200);

  // Enlace individual para un padrino → verificado
  const fila = a.locator("#tabla tbody tr", { hasText: "Dra. Jenny Sosa" });
  await fila.locator("[data-enlace]").click();
  await a.waitForSelector("#dlg-enlace[open]");
  const enlace = await a.inputValue("#enlace-url");
  ok("Enlace individual generado (token en el fragmento)", /#t=[A-Za-z0-9_-]{40,}$/.test(enlace), enlace.replace(/#t=.*/, "#t=…"));
  await a.click("#dlg-enlace [data-cerrar]");
  const pi = await nuevaPagina(ctx, errores, externos);
  await pi.goto(BASE + "#t=" + enlace.split("#t=")[1], { waitUntil: "networkidle" }); await pi.waitForTimeout(800);
  ok("Enlace individual: reconoce a la persona", (await pi.textContent("#token-saludo")) === "Hola, Dra. Jenny Sosa.");
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
