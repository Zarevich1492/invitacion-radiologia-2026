/* Apariencia consistente (cream) bajo preferencia clara/oscura del sistema y oscurecimiento automático simulado.
   Simulación con Chromium (base de Chrome, Opera y Edge); Safari y Firefox NO están disponibles aquí. Uso: node pruebas/apariencia.js URL */
const { chromium } = require("playwright");
const { usarApiLocal, entrarGrupo } = require("./ayuda");
const BASE = process.argv[2] || "http://127.0.0.1:8765/";
const esperado = { fondo: "245,231,211", cara: "245,231,211" };
(async () => {
  let fallos = 0, n = 0;
  const combos = [["sistema claro", [], "light"], ["sistema oscuro", [], "dark"], ["sistema oscuro + oscurecimiento automático", ["--blink-settings=forceDarkModeEnabled=true"], "dark"]];
  for (const [et, args, cs] of combos) for (const [dis, vp] of [["móvil", { width: 390, height: 844 }], ["escritorio", { width: 1366, height: 768 }]]) {
    const b = await chromium.launch({ args }); const cx = await b.newContext({ viewport: vp, colorScheme: cs }); await usarApiLocal(cx); const p = await cx.newPage();
    await p.goto(BASE, { waitUntil: "networkidle" }); await entrarGrupo(p, "padrinos"); await p.click('[data-padrino="falcon-analy"]'); await p.waitForTimeout(6500);
    const px = async (x, y) => { const buf = await p.screenshot({ clip: { x, y, width: 1, height: 1 } }); return p.evaluate(async (s) => { const i = new Image(); i.src = "data:image/png;base64," + s; await i.decode(); const c = document.createElement("canvas"); c.width = c.height = 1; const g = c.getContext("2d"); g.drawImage(i, 0, 0); return [...g.getImageData(0, 0, 1, 1).data].slice(0, 3).join(","); }, buf.toString("base64")); };
    const r = await p.evaluate(() => { const c = document.getElementById("tarjeta").getBoundingClientRect(); return { x: Math.round(c.left + c.width * 0.5), y: Math.round(c.top + 8) }; });
    const fondo = await px(4, 300), cara = await px(r.x, r.y);
    const cerca = (a, b) => a.split(",").every((v, i) => Math.abs(v - b.split(",")[i]) <= 3);   // tolerancia de ±3 por gestión de color del navegador
    const ok = cerca(fondo, esperado.fondo) && cerca(cara, esperado.cara); n++; if (!ok) fallos++;
    console.log((ok ? "✔" : "✘") + ` ${et} · ${dis}: fondo ${fondo}, cara ${cara}`);
    await b.close();
  }
  console.log(`${n - fallos}/${n} combinaciones con la identidad crema`);
  process.exit(fallos ? 1 : 0);
})();
