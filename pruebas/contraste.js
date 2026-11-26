/* Contraste WCAG 2.1 AA de los textos visibles en las cuatro vistas (móvil y escritorio).
   Normal ≥ 4,5:1 · grande (≥ 24 px, o ≥ 18,66 px en negrita) ≥ 3:1. Uso: node pruebas/contraste.js URL */
const { chromium } = require("playwright");
const { usarApiLocal, entrarGrupo } = require("./ayuda");
const BASE = process.argv[2] || "http://127.0.0.1:8765/";
(async () => {
  const b = await chromium.launch();
  const fallos = [], todos = [];
  for (const [et, vp] of [["móvil", { width: 390, height: 844, isMobile: true }], ["escritorio", { width: 1366, height: 768 }]]) {
    const ctx = await b.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.isMobile, hasTouch: !!vp.isMobile });
    await usarApiLocal(ctx);
    const p = await ctx.newPage();
    await p.goto(BASE, { waitUntil: "networkidle" });
    await p.waitForTimeout(1600);   // fin de la animación de entrada (se mide el estado estable)
    const bienvenida = await medir(p, "#bienvenida");
    bienvenida.forEach((r) => registrar(et, "bienvenida", r));
    await p.click('[data-acceso="docentes"]'); await p.waitForSelector("#campo-codigo", { state: "visible" }); await p.waitForTimeout(1200);
    (await medir(p, "#bienvenida")).forEach((r) => registrar(et, "bienvenida-codigo", r));
    await p.click("#btn-volver-inicio"); await p.waitForTimeout(300);
    await entrarGrupo(p, "docentes"); await p.click('[data-cat="docente"]'); await p.waitForTimeout(1100);
    (await medir(p, "#bienvenida")).forEach((r) => registrar(et, "bienvenida-docentes", r));
    await p.click("#btn-volver-lista"); await p.waitForTimeout(300);
    await entrarGrupo(p, "padrinos"); await p.click('[data-padrino="falcon-analy"]'); await p.waitForTimeout(1500);
    for (const v of ["invitacion", "programa", "confirmar", "pase", "liston", "dedicatorias", "aportes"]) {
      await p.evaluate((x) => { location.hash = x; }, v); await p.waitForTimeout(600);
      (await medir(p, `section[data-vista="${v}"], .barra, .nav-inferior`)).forEach((r) => registrar(et, v, r));
    }
    const cat = await p.textContent("#saludo-eyebrow");
    todos.push({ ok: cat === "Madrina de promoción", n: `${et}: categoría personalizada «${cat}»` });
    if (cat !== "Madrina de promoción") fallos.push(`${et}: categoría «${cat}»`);
    await ctx.close();
  }
  function registrar(et, v, r) { const lim = r.grande ? 3 : 4.5; const ok = r.ratio >= lim; todos.push({ ok }); if (!ok) fallos.push(`${et}/${v}: «${r.texto}» ${r.ratio.toFixed(2)}:1 (mín. ${lim}) ${r.fg} sobre ${r.bg}`); }
  async function medir(p, sel) {
    return p.evaluate((sel) => {
      const rgb = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const v = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r: v[0], g: v[1], b: v[2], a: v.length > 3 ? v[3] : 1 }; };
      const lum = ({ r, g, b }) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const fondoDe = (el) => {
        for (let n = el; n; n = n.parentElement) {
          const cs = getComputedStyle(n), c = rgb(cs.backgroundColor);
          if (c && c.a > 0.5) return c;
          if (cs.backgroundImage && cs.backgroundImage.includes("gradient") && n !== document.body && n !== document.documentElement) { const m = cs.backgroundImage.match(/rgba?\([^)]+\)/); if (m) return rgb(m[0]); }
        }
        return { r: 0xef, g: 0xdf, b: 0xc6, a: 1 };   // tono más oscuro del fondo de la página (peor caso)
      };
      const res = [];
      for (const raiz of document.querySelectorAll(sel)) {
        const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
        while (w.nextNode()) {
          const t = w.currentNode, el = t.parentElement; if (!t.textContent.trim() || !el) continue;
          if (el.closest("[hidden], .sr-only, .trampa, svg, script, style")) continue;
          const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
          const cs = getComputedStyle(el); if (cs.visibility === "hidden" || parseFloat(cs.opacity) === 0) continue;
          let alfa = 1; for (let n = el; n; n = n.parentElement) alfa *= parseFloat(getComputedStyle(n).opacity);
          const bg = fondoDe(el), f0 = rgb(cs.color), fa = alfa * (f0.a ?? 1);
          const fg = { r: f0.r * fa + bg.r * (1 - fa), g: f0.g * fa + bg.g * (1 - fa), b: f0.b * fa + bg.b * (1 - fa) };   // opacidad heredada incluida
          const L1 = lum(fg), L2 = lum(bg);
          const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
          const tam = parseFloat(cs.fontSize), peso = parseInt(cs.fontWeight, 10);
          res.push({ texto: t.textContent.trim().slice(0, 40), ratio, grande: tam >= 24 || (tam >= 18.66 && peso >= 700), fg: `${cs.color} α${alfa.toFixed(2)}`, bg: `rgb(${bg.r}, ${bg.g}, ${bg.b})` });
        }
      }
      return res;
    }, sel);
  }
  await b.close();
  console.log(fallos.length ? fallos.map((f) => "✘ " + f).join("\n") : "");
  console.log(`${todos.filter((x) => x.ok).length}/${todos.length} textos cumplen WCAG AA`);
  process.exit(fallos.length ? 1 : 0);
})();
