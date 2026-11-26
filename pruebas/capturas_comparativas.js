/* Capturas comparativas antes/después (Playwright, Chromium simulado).
   Uso: node pruebas/capturas_comparativas.js <antes|despues> <URL_BASE> <carpeta> */
const { chromium } = require("playwright");
const fs = require("fs");
const [modo, BASE, OUT] = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
const PC = { viewport: { width: 1366, height: 768 } };
const MOVIL = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };

async function entrar(p) { await p.goto(BASE, { waitUntil: "networkidle" }); await p.click('[data-acceso="padrinos"]'); await p.click('[data-padrino="falcon-analy"]'); await p.waitForTimeout(modo === "antes" ? 2400 : 7000); }
async function irA(p, vista, selAntes) {
  if (modo === "antes") { await p.evaluate((s) => document.querySelector(s).scrollIntoView({ block: "start" }), selAntes); await p.waitForTimeout(400); }
  else { const nav = p.viewportSize().width >= 900 ? ".nav-superior" : ".nav-inferior"; await p.click(`${nav} [data-ir="${vista}"]`); await p.waitForTimeout(700); }
}
(async () => {
  const b = await chromium.launch();
  let ctx = await b.newContext(PC), p = await ctx.newPage();
  await entrar(p);
  await p.screenshot({ path: `${OUT}/${modo}-1-pc-cerrada.png` });
  await p.click("#btn-principal");
  await p.waitForFunction(() => window.__invitacion.estado === "abierta" && !window.__invitacion.corriendo, null, { timeout: 9000 });
  await p.screenshot({ path: `${OUT}/${modo}-2-pc-abierta.png` });
  await irA(p, "programa", "#t-programa"); await p.screenshot({ path: `${OUT}/${modo}-3-pc-programa.png` });
  await irA(p, "confirmar", "#rsvp"); await p.screenshot({ path: `${OUT}/${modo}-4-pc-confirmacion.png` });
  await ctx.close();
  ctx = await b.newContext(MOVIL); p = await ctx.newPage();
  await p.goto(BASE, { waitUntil: "networkidle" }); await p.waitForTimeout(500);
  await p.screenshot({ path: `${OUT}/${modo}-5-movil-inicio.png` });
  await p.click('[data-acceso="padrinos"]'); await p.click('[data-padrino="falcon-analy"]'); await p.waitForTimeout(modo === "antes" ? 2400 : 7000);
  await p.screenshot({ path: `${OUT}/${modo}-6-movil-invitacion.png` });
  await irA(p, "programa", "#t-programa"); await p.screenshot({ path: `${OUT}/${modo}-7-movil-programa.png` });
  await irA(p, "confirmar", "#rsvp"); await p.screenshot({ path: `${OUT}/${modo}-8-movil-confirmacion.png` });
  if (modo === "antes") { await p.click(".accion.principal"); } else { await p.click('.nav-inferior [data-ir="pase"]'); }
  await p.waitForFunction(() => document.getElementById("pase-vista").naturalWidth > 0, null, { timeout: 15000 }); await p.waitForTimeout(400);
  await p.screenshot({ path: `${OUT}/${modo}-9-movil-pase.png` });
  await b.close();
})();
