/* Recorrido REAL por los perfiles contra el Supabase de producción (js/config.js real). No escribe datos:
   entra, comprueba que se pida la contraseña, la navegación y la visibilidad de Dedicatorias y Aportes.
   Uso: CODIGOS='{"padrinos":"…",…}' NODE_USE_ENV_PROXY=1 node pruebas/real_perfiles.js [URL_BASE] */
const { chromium } = require("playwright");
const BASE = process.argv[2] || "http://127.0.0.1:8765/";
const CODIGOS = JSON.parse(process.env.CODIGOS || "{}");
let n = 0, fallos = 0;
const ok = (t, c, d = "") => { n++; if (!c) fallos++; console.log((c ? "✔" : "✘") + " " + t + (d ? " — " + d : "")); };

async function entrar(ctx, perfil) {
  const p = await ctx.newPage(); const errores = [];
  p.on("pageerror", (e) => errores.push(e.message));
  await p.goto(BASE, { waitUntil: "networkidle" });
  const g = perfil.grupo;
  await p.click(`[data-acceso="${g}"]`);
  if (g !== "otros") {
    await p.waitForSelector("#paso-codigo:not([hidden])", { timeout: 8000 });
    ok(`${perfil.nombre}: se solicita la contraseña`, (await p.getAttribute("#campo-codigo", "type")) === "password");
    await p.fill("#campo-codigo", "contraseña-equivocada"); await p.click("#btn-ingresar"); await p.waitForTimeout(1500);
    ok(`${perfil.nombre}: contraseña incorrecta no avanza`, (await p.textContent("#codigo-estado")).includes("no es correcto") && await p.isVisible("#paso-codigo"));
    await p.fill("#campo-codigo", CODIGOS[g]); await p.click("#btn-ingresar");
  }
  await perfil.identificar(p);
  await p.waitForFunction(() => document.body.classList.contains("identificado"), null, { timeout: 15000 });
  await p.waitForTimeout(2500);
  const nav = await p.$$eval(".nav-inferior a, .nav-superior a", (a) => a.filter((x) => !x.hidden && x.getBoundingClientRect().width > 0).map((x) => x.textContent.trim()));
  ok(`${perfil.nombre}: «Palabras» y «Desde la distancia» en el menú`, nav.some((x) => /Palabras/.test(x)) && nav.some((x) => /Distancia|Desde la distancia/.test(x)), nav.join("|"));
  await p.evaluate(() => { location.hash = "invitacion"; }); await p.waitForFunction(() => document.body.dataset.vistaActiva === "invitacion"); await p.waitForTimeout(600);
  await p.waitForSelector("#detalle-promo:not([hidden])", { timeout: 8000 }).catch(() => {});
  ok(`${perfil.nombre}: bajo la tarjeta, «Palabras que nos acompañan» y luego «Un detalle para nuestra promoción» (secundario, sin montos)`, (await p.isVisible('#otros-tarjetas [data-ir="dedicatorias"]')) && (await p.isVisible("#detalle-promo")) && (await p.$$("#detalle-promo .btn-primario")).length === 0 && !/\d|usd|meta/i.test((await p.textContent("#detalle-promo")).replace("Un detalle para nuestra promoción", "")));
  await p.evaluate(() => { location.hash = "dedicatorias"; }); await p.waitForFunction(() => document.body.dataset.vistaActiva === "dedicatorias");
  await p.click("#dd-abrir"); await p.waitForTimeout(1200);
  ok(`${perfil.nombre}: «Dejar unas palabras» abre el formulario (sin CAPTCHA externo)`, !(await p.$eval("#dd-enviar", (b) => b.disabled)) && (await p.$$("#dd-stickers .sticker")).length === 6);
  await p.evaluate(() => { location.hash = "distancia"; }); await p.waitForFunction(() => document.body.dataset.vistaActiva === "distancia");
  await p.waitForSelector("#pm-detalle:not([hidden])", { timeout: 8000 }).catch(() => {});
  ok(`${perfil.nombre}: datos de Pago Móvil ocultos hasta elegir la opción`, (await p.$$("#pm-datos .pm-fila")).length === 0);
  await p.click("#pm-detalle summary"); await p.waitForSelector("#pm-datos .pm-fila", { timeout: 5000 });
  ok(`${perfil.nombre}: al elegirla, cinco datos con botones de copiar`, (await p.$$("#pm-datos .pm-copiar")).length === 5);
  const sw = await p.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  ok(`${perfil.nombre}: sin desplazamiento horizontal`, sw[0] <= sw[1], sw.join(" ≤ "));
  ok(`${perfil.nombre}: sin errores de JavaScript`, errores.length === 0, errores.join(" | "));
  await p.close();
}

(async () => {
  const b = await chromium.launch();
  const perfiles = [
    { nombre: "Padrinos", grupo: "padrinos", identificar: async (p) => { await p.waitForSelector("#lista-nombres [data-padrino]"); await p.click('[data-padrino="falcon-analy"]'); } },
    { nombre: "Especialistas", grupo: "especialistas", identificar: async (p) => { await p.waitForSelector("#lista-graduandos [data-graduando]"); await p.click('[data-graduando="arrieta-jorge"]'); } },
    { nombre: "Familia radiológica", grupo: "docentes", identificar: async (p) => { await p.waitForSelector("#form-nombre:not([hidden])"); await p.fill("#campo-nombre", "Prueba Visual"); await p.click("#form-nombre button[type=submit]"); } },
    { nombre: "Residentes", grupo: "residentes", identificar: async (p) => { await p.waitForSelector("#opciones-cat .opcion-cat"); await p.click('[data-cat="r1"]'); await p.fill("#campo-nombre", "Prueba Visual"); await p.click("#form-nombre button[type=submit]"); } },
    { nombre: "Invitados especiales", grupo: "otros", identificar: async (p) => { await p.waitForSelector("#form-nombre:not([hidden])"); await p.fill("#campo-nombre", "Prueba Visual"); await p.click("#form-nombre button[type=submit]"); } },
  ];
  for (const [et, vp, mov] of [["móvil", { width: 390, height: 844 }, true], ["escritorio", { width: 1366, height: 768 }, false]]) {
    const ctx = await b.newContext({ viewport: vp, isMobile: mov, hasTouch: mov });
    for (const pf of perfiles.filter((x) => !process.env.PERFIL || x.grupo === process.env.PERFIL)) await entrar(ctx, { ...pf, nombre: `${pf.nombre} · ${et}` });
    await ctx.close();
  }
  // Otros: cinco tarjetas y solicitud con las seis opciones; visitante público sin contraseña
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage(); await p.goto(BASE, { waitUntil: "networkidle" });
  await p.click('[data-visitante="dedicatorias"]'); await p.waitForFunction(() => document.body.dataset.vistaActiva === "dedicatorias");
  await p.click("#dd-abrir");
  ok("Visitante público: «Palabras que nos acompañan» sin contraseña ni confirmación", await p.isVisible("#form-dedic"));
  await p.evaluate(() => { location.hash = "invitacion"; }); await p.waitForTimeout(800);
  const ops = await p.$$eval("#otros-tarjetas .op b", (x) => x.filter((e) => e.offsetParent).map((e) => e.textContent));
  ok("Otros: cinco tarjetas en Inicio", ops.join("|") === "Ver invitación|Programa|Palabras que nos acompañan|Solicitar invitación", ops.join("|"));
  await p.evaluate(() => { location.hash = "solicitar"; }); await p.waitForFunction(() => document.body.dataset.vistaActiva === "solicitar");
  ok("Solicitud: seis opciones de quién invita", (await p.$$eval("#sol-tipo option", (o) => o.map((x) => x.textContent).join("|"))) === "Padrino o madrina|Radiólogo 2026|Residente R1|Residente R2|Familia radiológica|Otro");
  await p.screenshot({ path: process.env.CAPTURAS ? process.env.CAPTURAS + "/real-otros.png" : "/tmp/real-otros.png", fullPage: true });
  await b.close();
  console.log(`\n${n - fallos}/${n} comprobaciones reales de perfiles superadas`);
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error("Error:", e.message); process.exit(2); });
