/* Pruebas responsive (Playwright + Chromium; SIMULACIÓN de tamaños, no dispositivos físicos).
   Uso: node pruebas/responsive.js <URL_BASE> <carpeta_capturas> */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const BASE = process.argv[2] || "http://127.0.0.1:8765/";
const OUT = process.argv[3] || path.join(__dirname, "capturas", "responsive");
fs.mkdirSync(OUT, { recursive: true });

const TAMANOS = [
  ["movil", 320, 568], ["movil", 360, 800], ["movil", 375, 812], ["movil", 390, 844], ["movil", 412, 915],
  ["movil-horizontal", 844, 390],
  ["tableta", 768, 1024], ["tableta", 820, 1180], ["tableta-horizontal", 1180, 820],
  ["pc", 1280, 720], ["pc", 1366, 768], ["pc", 1440, 900], ["pc", 1920, 1080],
];
const res = [];
const ok = (n, c, d = "") => { res.push({ n, ok: !!c, d }); if (!c) console.log("✘ " + n + (d ? " — " + d : "")); };

(async () => {
  const b = await chromium.launch();
  for (const [tipo, w, h] of TAMANOS) {
    const movil = tipo.startsWith("movil");
    const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: movil, hasTouch: movil || tipo.startsWith("tableta"), deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    const err = []; p.on("pageerror", (e) => err.push(e.message));
    const et = `${w}×${h}`;
    await p.goto(BASE, { waitUntil: "networkidle" });
    // Bienvenida
    const bv = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, primerNombre: (() => { const r = document.querySelector("[data-padrino]").getBoundingClientRect(); return r.bottom <= innerHeight; })() }));
    ok(`${et} bienvenida sin desplazamiento horizontal`, bv.sw <= bv.cw, `${bv.sw}>${bv.cw}`);
    ok(`${et} bienvenida: el selector de nombres es visible sin desplazar`, bv.primerNombre || h < 600);
    await p.click('[data-padrino="falcon-analy"]'); await p.waitForTimeout(1900);

    const vistaInv = await p.evaluate(() => {
      const q = (s) => document.querySelector(s).getBoundingClientRect();
      const t = q("#tarjeta"), pr = q("#btn-principal"), nom = q("#saludo-nombre");
      const portada = document.querySelector(".hoja.tapa").getBoundingClientRect();
      const nav = document.querySelector(".nav-inferior"); const navTop = nav && getComputedStyle(nav).display !== "none" ? nav.getBoundingClientRect().top : innerHeight;
      return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, portada: [portada.left, portada.top, portada.right, portada.bottom].map(Math.round), btn: [pr.top, pr.bottom].map(Math.round), nom: Math.round(nom.top), navTop: Math.round(navTop), vw: innerWidth, vh: innerHeight };
    });
    ok(`${et} invitación sin desplazamiento horizontal`, vistaInv.sw <= vistaInv.cw, `${vistaInv.sw}>${vistaInv.cw}`);
    const [pl, pt, pr, pb] = vistaInv.portada;
    ok(`${et} tarjeta cerrada completa dentro de la pantalla (ancho)`, pl >= 0 && pr <= vistaInv.vw, JSON.stringify(vistaInv.portada));
    if (!tipo.includes("horizontal") && h >= 640) {
      ok(`${et} nombre, tarjeta y acción principal en la primera pantalla`, vistaInv.nom >= 0 && pb <= vistaInv.navTop && vistaInv.btn[1] <= vistaInv.navTop, JSON.stringify(vistaInv));
    }
    await p.screenshot({ path: `${OUT}/${String(w).padStart(4, "0")}x${h}-1-invitacion.png` });

    // Tarjeta abierta: el pliego completo cabe a lo ancho
    await p.click("#btn-principal");
    await p.waitForFunction(() => window.__invitacion.estado === "abierta" && !window.__invitacion.corriendo, null, { timeout: 9000 });
    const ab = await p.evaluate(() => { const a = document.querySelector(".hoja.base .frente").getBoundingClientRect(), c = document.querySelector(".hoja.tapa .dorso").getBoundingClientRect(); return { izq: Math.round(Math.min(a.left, c.left)), der: Math.round(Math.max(a.right, c.right)), vw: innerWidth, sw: document.documentElement.scrollWidth }; });
    ok(`${et} tarjeta abierta: caras internas sin recorte`, ab.izq >= 0 && ab.der <= ab.vw && ab.sw <= ab.vw, JSON.stringify(ab));
    await p.screenshot({ path: `${OUT}/${String(w).padStart(4, "0")}x${h}-2-abierta.png` });

    // Giro a la contraportada: durante y después del giro la página no debe ensancharse
    await p.click("#btn-contra");
    let maxSW = 0;
    for (let i = 0; i < 12; i++) { maxSW = Math.max(maxSW, await p.evaluate(() => document.documentElement.scrollWidth)); await p.waitForTimeout(180); }
    await p.waitForFunction(() => window.__invitacion.estado === "dorso" && !window.__invitacion.corriendo, null, { timeout: 12000 });
    const dorso = await p.evaluate(() => { const c = document.querySelector(".hoja.base .dorso").getBoundingClientRect(); return { izq: Math.round(c.left), der: Math.round(c.right), vw: innerWidth, sw: document.documentElement.scrollWidth, vv: Math.round(visualViewport.width) }; });
    ok(`${et} giro y contraportada sin ensanchar la página`, maxSW <= dorso.vw && dorso.sw <= dorso.vw && dorso.vv === w, JSON.stringify({ maxSW, ...dorso }));
    ok(`${et} contraportada completa dentro de la pantalla`, dorso.izq >= 0 && dorso.der <= dorso.vw, JSON.stringify(dorso));
    await p.click("#btn-contra");
    await p.waitForFunction(() => window.__invitacion.estado === "abierta" && !window.__invitacion.corriendo, null, { timeout: 12000 });

    // Objetivos táctiles ≥ 44 × 44 en controles visibles
    const pequenos = await p.evaluate(() => [...document.querySelectorAll(".nav-vistas a, .btn, .btn-sec, .como-llegar")]
      .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden"; })
      .map((e) => { const r = e.getBoundingClientRect(); return [e.id || e.textContent.trim().slice(0, 20), Math.round(r.width), Math.round(r.height)]; })
      .filter(([, ww, hh]) => ww < 44 || hh < 44));
    ok(`${et} objetivos táctiles ≥ 44 px (invitación)`, pequenos.length === 0, JSON.stringify(pequenos));

    // Cada vista: sin desbordes; la barra inferior no tapa el último contenido
    for (const v of ["programa", "confirmar", "pase"]) {
      await p.evaluate((x) => { location.hash = x; }, v);
      await p.waitForFunction((x) => document.body.dataset.vistaActiva === x, v);
      await p.waitForTimeout(250);
      const m = await p.evaluate((x) => {
        window.scrollTo(0, document.documentElement.scrollHeight);
        const sec = document.querySelector(`section[data-vista="${x}"]`);
        const hijos = [...sec.querySelectorAll("a,button,p,li,img,summary")].filter((e) => e.getBoundingClientRect().height > 0);
        const ultimo = hijos[hijos.length - 1].getBoundingClientRect();
        const nav = document.querySelector(".nav-inferior"); const navTop = getComputedStyle(nav).display !== "none" ? nav.getBoundingClientRect().top : innerHeight;
        const peq = [...sec.querySelectorAll("a,button,.opciones-rsvp label")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.height < 44 || r.width < 44) && !e.closest(".lista-enlaces") ; }).map((e) => (e.id || e.textContent.trim().slice(0, 18)) + ":" + Math.round(e.getBoundingClientRect().height));
        return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, ultimoAbajo: Math.round(ultimo.bottom), navTop: Math.round(navTop), peq };
      }, v);
      ok(`${et} ${v}: sin desplazamiento horizontal`, m.sw <= m.cw, `${m.sw}>${m.cw}`);
      ok(`${et} ${v}: la barra inferior no tapa el contenido`, m.ultimoAbajo <= m.navTop + 1, JSON.stringify(m));
      ok(`${et} ${v}: objetivos táctiles ≥ 44 px`, m.peq.length === 0, m.peq.join(", "));
      await p.evaluate(() => window.scrollTo(0, 0));
      if (v === "pase") await p.waitForFunction(() => document.getElementById("pase-vista").naturalWidth > 0, null, { timeout: 15000 });
      await p.screenshot({ path: `${OUT}/${String(w).padStart(4, "0")}x${h}-${v === "programa" ? 3 : v === "confirmar" ? 4 : 5}-${v}.png` });
    }
    ok(`${et} sin errores de consola`, err.length === 0, err.join(" | "));
    await ctx.close();
  }
  await b.close();
  const f = res.filter((r) => !r.ok);
  console.log(`${res.length - f.length}/${res.length} comprobaciones responsive superadas (${TAMANOS.length} tamaños)`);
  fs.writeFileSync(path.join(OUT, "resultados.json"), JSON.stringify(res, null, 2));
  process.exit(f.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
