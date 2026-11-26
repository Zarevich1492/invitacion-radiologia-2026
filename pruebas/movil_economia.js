/* Verifica en 360, 390 y 430 px de ancho: «Celebra este logro con nosotros» (visibilidad sin menú), entrada de 3 USD y ausencia de desbordes.
   Uso: node pruebas/movil_economia.js [BASE] [API]  (requiere el entorno de pruebas locales) */
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const BASE = process.argv[2] || "http://127.0.0.1:8765/", API = process.argv[3] || "http://127.0.0.1:8787";
const OUT = path.join(__dirname, "capturas"); fs.mkdirSync(OUT, { recursive: true });
let n = 0, fallos = 0; const ok = (t, c, d = "") => { n++; if (!c) fallos++; console.log((c ? "✔" : "✘") + " " + t + (d ? " — " + d : "")); };
(async () => {
  const b = await chromium.launch();
  for (const [w, h] of [[360, 780], [390, 844], [430, 932]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await ctx.route(/\/js\/config\.js(\?.*)?$/, (r) => r.fulfill({ contentType: "application/javascript", body: `window.CONFIG={supabaseUrl:${JSON.stringify(API)},supabaseAnonKey:"sb_publishable_prueba_local"}` }));
    const p = await ctx.newPage(); const et = `${w}px`;
    await p.goto(BASE, { waitUntil: "networkidle" }); await p.click('[data-acceso="padrinos"]'); await p.fill("#campo-codigo", "codigo-e2e-padrinos"); await p.click("#btn-ingresar");
    await p.waitForSelector("#lista-nombres [data-padrino]"); await p.click('[data-padrino="rojas-gustavo"]'); await p.waitForFunction(() => document.body.classList.contains("identificado")); await p.waitForTimeout(2400);
    await p.waitForSelector("#celebra-aportes:not([hidden])", { timeout: 8000 });
    const g = await p.evaluate(() => { const r = (id) => document.getElementById(id).getBoundingClientRect(); const a = document.querySelector("#celebra-aportes a").getBoundingClientRect(), d = document.querySelector("#celebra-dedic a").getBoundingClientRect(), t = document.getElementById("escenario").getBoundingClientRect(); const nav = document.getElementById("nav-inferior").getBoundingClientRect();
      return { vh: innerHeight, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, aTop: a.top + scrollY, aW: a.width, aH: a.height, dW: d.width, dH: d.height, cardBottom: t.bottom + scrollY, navTop: nav.top }; });
    ok(`${et}: sin desplazamiento horizontal en Inicio`, g.sw <= g.cw, `${g.sw} ≤ ${g.cw}`);
    ok(`${et}: «Realizar un aporte» a ≤ 1,6 pantallas de la parte superior (no queda al final de una página extensa)`, g.aTop <= g.vh * 1.6, `top=${Math.round(g.aTop)} px · pantalla=${g.vh}`);
    ok(`${et}: botones de ancho completo y táctiles (≥ 44 px)`, g.aW >= w - 80 && g.dW >= w - 80 && g.aH >= 44 && g.dH >= 44, `aporte ${Math.round(g.aW)}×${Math.round(g.aH)} · dedicatoria ${Math.round(g.dW)}×${Math.round(g.dH)}`);
    await p.evaluate(() => document.getElementById("celebra").scrollIntoView({ block: "center" })); await p.waitForTimeout(300);
    ok(`${et}: ambos botones visibles a la vez al desplazarse hasta la sección`, await p.evaluate(() => { const v = (s) => { const r = document.querySelector(s).getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }; return v("#celebra-aportes a") && v("#celebra-dedic a"); }));
    await p.screenshot({ path: `${OUT}/m${w}-celebra.png` });
    ok(`${et}: el menú inferior ofrece «Aportes y dedicatorias» (no solo un menú desplegable)`, await p.evaluate(() => { const a = document.querySelector('#nav-inferior [data-ir="distancia"]'); const r = a.getBoundingClientRect(); return r.width > 30 && r.bottom <= innerHeight + 1 && /Aportes y dedicatorias/.test(a.textContent); }));
    const nv = await p.evaluate(() => [...document.querySelectorAll("#nav-inferior a")].filter((a) => !a.hidden && a.getBoundingClientRect().width > 0).map((a) => { const s = a.querySelector("span"); return a.scrollWidth <= a.clientWidth + 1 && s.scrollWidth <= a.clientWidth + 1; }));
    ok(`${et}: las etiquetas del menú inferior no se desbordan`, nv.every(Boolean), nv.join());
    // Programa: entrada
    await p.click('#nav-inferior [data-ir="programa"]'); await p.waitForFunction(() => document.body.dataset.vistaActiva === "programa"); await p.waitForTimeout(500);
    const e = await p.evaluate(() => { const c = document.querySelector("#programa .momento.social .costo"); const v = c.querySelector(".costo-valor"); const r = c.getBoundingClientRect(); return { t: c.textContent.replace(/\s+/g, " ").trim(), fs: parseFloat(getComputedStyle(v).fontSize), ancho: r.width, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }; });
    ok(`${et}: Programa muestra «Entrada: 3 USD por persona. La invitación no incluye el costo de entrada.»`, e.t === "Entrada: 3 USD por persona. La invitación no incluye el costo de entrada.", e.t);
    ok(`${et}: «3 USD» destacado (≥ 28 px) y sin desbordes`, e.fs >= 28 && e.sw <= e.cw, `${e.fs}px`);
    await p.evaluate(() => document.querySelector("#programa .momento.social").scrollIntoView({ block: "center" })); await p.screenshot({ path: `${OUT}/m${w}-entrada-programa.png` });
    await p.click('#nav-inferior [data-ir="confirmar"]'); await p.waitForFunction(() => document.body.dataset.vistaActiva === "confirmar"); await p.waitForTimeout(500);
    const rc = await p.evaluate(() => ({ t: [...document.querySelectorAll("#rsvp-actividades fieldset")].find((f) => f.textContent.includes("Recepción")).textContent.replace(/\s+/g, " "), sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    ok(`${et}: Confirmar muestra la entrada y que confirmar no equivale a pagar`, rc.t.includes("3 USD") && rc.t.includes("no incluye el costo de entrada") && rc.t.includes("no equivale al pago de la entrada") && rc.sw <= rc.cw);
    await p.evaluate(() => [...document.querySelectorAll("#rsvp-actividades fieldset")].find((f) => f.textContent.includes("Recepción")).scrollIntoView({ block: "center" })); await p.screenshot({ path: `${OUT}/m${w}-entrada-confirmar.png` });
    await p.click('#nav-inferior [data-ir="distancia"]'); await p.waitForFunction(() => document.body.dataset.vistaActiva === "distancia"); await p.waitForSelector("#pm-datos .pm-fila", { timeout: 8000 });
    const hub = await p.evaluate(() => ({ t: document.getElementById("vista-distancia").textContent, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    ok(`${et}: «Aportes y dedicatorias» sin «3 USD» (conceptos separados) y sin desbordes`, !hub.t.includes("USD") && hub.sw <= hub.cw);
    await p.screenshot({ path: `${OUT}/m${w}-aportes.png`, fullPage: true });
    await ctx.close();
  }
  await b.close(); console.log(`\n${n - fallos}/${n} comprobaciones móviles superadas`); process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
