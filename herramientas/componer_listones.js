/* Listones conmemorativos · Dirección B (Protocolar) aprobada · 60 × 120 mm con terminación en V.
   - 7 especialistas (fondo crema #f5e7d3, franja roja, filete doble rojo, ESPECIALISTA / 2026)
   - 10 padrinos y madrinas (fondo negro/carbón #1c1715, franja roja con oro, filete doble dorado, PADRINO|MADRINA / DE PROMOCIÓN)
   - Logotipos oficiales sin modificar: ULA, Departamento de Radiología (original), XXIV Promoción.
   - SIN actividades, horarios, direcciones ni información logística.
   Salidas:
     variantes/listones/<id>.png          (300 ppp, 709 × 1417 px, RGBA con V transparente)
     variantes/listones/<id>-600ppp.png   (600 ppp, 1417 × 2835 px, RGBA con V transparente)
     assets/listones/<id>.pdf             (PDF vectorial 60 × 120 mm con logotipos originales incrustados)
     assets/listones/listones-especialistas-2026-A4.pdf    (PDF vectorial A4, 2 hojas, marcas de corte)
     assets/listones/listones-padrinos-madrinas-A4.pdf     (PDF vectorial A4, 2 hojas, marcas de corte)
   Uso: node herramientas/componer_listones.js [URL_BASE] [solo_ids_separados_por_coma] */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = process.argv[2] || "http://127.0.0.1:8765/";
const SOLO = (process.argv[3] || "").split(",").filter(Boolean);
const RAIZ = path.join(__dirname, "..");
const EV = JSON.parse(fs.readFileSync(path.join(RAIZ, "datos", "evento.json"), "utf8"));
const OUT_VAR = path.join(RAIZ, "variantes", "listones");
const OUT_PUB = path.join(RAIZ, "assets", "listones");
fs.mkdirSync(OUT_VAR, { recursive: true });
fs.mkdirSync(OUT_PUB, { recursive: true });

const W = 709, H = 1417;                                         // 60 × 120 mm a 300 ppp
const W600 = Math.round(60 / 25.4 * 600);                        // 1417 px a 600 ppp
const H600 = Math.round(120 / 25.4 * 600);                       // 2835 px a 600 ppp
const MM = 300 / 25.4;
const M = Math.round(4 * MM);                                    // margen 4 mm (47 px)
const V = Math.round(EV.liston.profundidad_v_mm * MM);           // profundidad de la V (15 mm ≈ 177 px)
const CSS_60MM = 60 / 25.4 * 96;                                 // 226.7717 CSS px
const CSS_120MM = 120 / 25.4 * 96;                               // 453.5433 CSS px

// Logotipo oficial del Departamento (sin modificar el original)
const candidatosDepto = [
  "originales/logos/logo_departamento_radiologia_original (1).png",
  "originales/logos/departamento-oficial.png",
  "originales/logos/departamento-oficial.jpg",
  "originales/logos/departamento-oficial.jpeg",
];
const oficial = candidatosDepto.find((f) => fs.existsSync(path.join(RAIZ, f)));
const LOGO_DEPTO = oficial || "originales/logos-extraidos/departamento-radiologia.png";
const L = (f) => `${BASE}${encodeURI(f)}`;
const PROMO = L("originales/logos-extraidos/promocion-xxiv.png");
const ULA = L("originales/logos-extraidos/ula.png");
const DEPTO = L(LOGO_DEPTO);
const PROMO_AR = 1910 / 2674;

function contorno(d) {
  const pend = V / (W / 2), dy = d * Math.sqrt(1 + pend * pend);
  return `${d},${d} ${W - d},${d} ${W - d},${(H - d * pend - dy).toFixed(1)} ${W / 2},${(H - V - dy).toFixed(1)} ${d},${(H - d * pend - dy).toFixed(1)}`;
}
const silueta = `polygon(0 0,100% 0,100% 100%,50% calc(100% - ${V}px),0 100%)`;

const BASE_CSS = `
@font-face{font-family:"Bodoni Moda";font-weight:400 900;src:url("${BASE}assets/fonts/BodoniModa-normal.woff2") format("woff2")}
@font-face{font-family:"Bodoni Moda";font-style:italic;font-weight:400 900;src:url("${BASE}assets/fonts/BodoniModa-italic.woff2") format("woff2")}
@font-face{font-family:"EB Garamond";font-weight:400 600;src:url("${BASE}assets/fonts/EBGaramond-normal.woff2") format("woff2")}
*{margin:0;padding:0;box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
:root{--crema:#f5e7d3;--rojo:#b8231f;--negro:#141110;--carbon:#1c1715;--oro:#b5935c;--oro2:#d7bd8a}
.L{position:relative;width:${W}px;height:${H}px;clip-path:${silueta};overflow:hidden;font-family:"EB Garamond",serif}
.abs{position:absolute}
.bod{font-family:"Bodoni Moda",serif;font-variation-settings:"opsz" 11}
.inst{display:flex;align-items:center;justify-content:center;gap:22px}
.inst img.ula{height:64px;width:auto;display:block}
.inst img.depto{height:${oficial ? 104 : 64}px;width:auto;display:block}
.inst i{width:2px;height:${oficial ? 78 : 48}px;background:var(--negro)}
.nombre span{display:block;white-space:nowrap}
svg.ov{position:absolute;inset:0;width:${W}px;height:${H}px;pointer-events:none}
.pila{position:absolute;left:${M}px;right:${M}px;display:flex;flex-direction:column;align-items:flex-start}
`;

// Dirección B — Protocolar (aprobada y refinada)
function cuerpoB(x, fam) {
  const g = fam === "g";
  const fondo = g ? "var(--crema)" : "var(--carbon)";
  const tinta = g ? "var(--negro)" : "var(--crema)";
  const filete = g ? "#b8231f" : "#b5935c";
  const ph = 362, pw = Math.round(ph * PROMO_AR), px = (W - pw) / 2;
  const topInst = M + 16, altoInst = oficial ? 132 : 118, topPlaca = topInst + altoInst + 24;
  const palabra = g ? "ESPECIALISTA" : x.denominacion.split(" ")[0];
  const regla = (c) => `<i style="flex:1;height:2px;background:${c};min-width:28px"></i>`;
  const sub = g
    ? `<div class="bod" style="align-self:stretch;display:flex;align-items:center;gap:20px;color:var(--negro);font-weight:800;font-size:74px;line-height:1;margin-top:14px">${regla(filete)}2026${regla(filete)}</div>`
    : `<div style="align-self:stretch;display:flex;align-items:center;gap:18px;color:var(--oro2);font-weight:600;font-size:38px;letter-spacing:7px;line-height:1;margin-top:16px">${regla(filete)}<span style="margin-right:-7px">DE PROMOCIÓN</span>${regla(filete)}</div>`;
  return `<div class="L" style="background:${fondo};color:${tinta}">
    <div class="abs" style="left:${W / 2 - 72}px;width:144px;top:0;bottom:0;background:var(--rojo)"></div>
    ${g ? "" : `<div class="abs" style="left:${W / 2 - 72}px;width:6px;top:0;bottom:0;background:var(--oro)"></div><div class="abs" style="left:${W / 2 + 66}px;width:6px;top:0;bottom:0;background:var(--oro)"></div>`}
    <div class="abs" style="left:${M + 20}px;right:${M + 20}px;top:${topInst}px;height:${altoInst}px;background:var(--crema);border:2px solid ${filete};display:flex;align-items:center;justify-content:center">
      <div class="inst"><img class="ula" src="${ULA}" alt=""><i></i><img class="depto" src="${DEPTO}" alt=""></div>
    </div>
    <div class="abs" style="left:${px - 22}px;top:${topPlaca}px;width:${pw + 44}px;height:${ph + 44}px;background:var(--crema);border:3px solid ${filete};outline:2px solid ${filete};outline-offset:6px"></div>
    <img class="abs" src="${PROMO}" style="left:${px}px;top:${topPlaca + 22}px;height:${ph}px;width:${pw}px" alt="">
    <div class="pila" id="pila" data-limite="${H - V - 102}" style="top:${topPlaca + ph + 44 + 30}px;left:${M + 16}px;right:${M + 16}px;align-items:center;text-align:center;padding:24px 14px 28px;background:${fondo}">
      <div class="bod" data-fit="${W - 2 * M - 64}" style="color:${g ? "var(--rojo)" : "var(--crema)"};font-weight:900;line-height:.95;letter-spacing:3px">${palabra}</div>
      ${sub}
      <div class="nombre bod" id="nom" data-max="90" data-min="60" data-ancho="${W - 2 * M - 64}" style="margin-top:30px;font-style:italic;font-weight:600;line-height:1.1;color:${tinta}"></div>
    </div>
    <svg class="ov" viewBox="0 0 ${W} ${H}"><polygon points="${contorno(M)}" fill="none" stroke="${filete}" stroke-width="2.5"/><polygon points="${contorno(M + 12)}" fill="none" stroke="${filete}" stroke-width="1.2"/></svg>
  </div>`;
}

// Ajusta tipografía monumental y nombre equilibrado (1–3 líneas), devolviendo el HTML final resuelto
async function resolverListon(p, x, fam) {
  await p.setContent(`<!doctype html><html lang="es"><head><meta charset="utf-8"><style>${BASE_CSS}html,body{width:${W}px;height:${H}px;background:transparent;overflow:hidden}</style></head><body>${cuerpoB(x, fam)}</body></html>`, { waitUntil: "networkidle" });
  const r = await p.evaluate(async (nombre) => {
    await document.fonts.load('900 80px "Bodoni Moda"', "ÁÑ");
    await document.fonts.load('800 80px "Bodoni Moda"', "ÁÑ");
    await document.fonts.load('italic 600 80px "Bodoni Moda"', "ÁÑ");
    await document.fonts.load('600 40px "EB Garamond"', "ÁÑ");
    await document.fonts.ready;
    await Promise.all([...document.images].map((i) => i.decode().catch(() => {})));
    for (const el of document.querySelectorAll("[data-fit]")) {
      const max = +el.dataset.fit, sp = document.createElement("span");
      sp.textContent = el.textContent.trim(); sp.style.whiteSpace = "nowrap"; sp.style.display = "inline-block";
      el.textContent = ""; el.appendChild(sp);
      let t = 220; el.style.fontSize = t + "px";
      while (sp.getBoundingClientRect().width > max && t > 30) { t -= 1; el.style.fontSize = t + "px"; }
    }
    const caja = document.getElementById("nom"), ancho = +caja.dataset.ancho, maxT = +caja.dataset.max, minT = +caja.dataset.min;
    const pila = document.getElementById("pila"), limite = +pila.dataset.limite;
    const palabras = nombre.split(" ");
    const mide = (t, s) => { const sp = document.createElement("span"); sp.style.cssText = `font-size:${s}px;display:inline-block;white-space:nowrap`; sp.textContent = t; caja.appendChild(sp); const w = sp.getBoundingClientRect().width; sp.remove(); return w; };
    const particiones = [[palabras.join(" ")]];
    for (let i = 1; i < palabras.length; i++) {
      particiones.push([palabras.slice(0, i).join(" "), palabras.slice(i).join(" ")]);
      for (let j = i + 1; j < palabras.length; j++) particiones.push([palabras.slice(0, i).join(" "), palabras.slice(i, j).join(" "), palabras.slice(j).join(" ")]);
    }
    const validas = particiones.filter((part) => !(part.length > 1 && part.some((l) => /^(Dr\.|Dra\.|Ma\.|del)$/.test(l))));
    let mejor = null;
    for (let tam = maxT; tam >= minT && !mejor; tam -= 2) {
      const caben = validas.filter((part) => part.every((l) => mide(l, tam) <= ancho))
        .map((part) => { const a = part.map((l) => mide(l, tam)); return { part, tam, eq: Math.min(...a) / Math.max(...a) }; })
        .sort((a, b) => a.part.length - b.part.length || b.eq - a.eq);
      for (const c of caben) {
        caja.style.fontSize = c.tam + "px"; caja.innerHTML = c.part.map((l) => `<span>${l}</span>`).join("");
        if (pila.getBoundingClientRect().bottom <= limite) { mejor = c; break; }
      }
    }
    if (!mejor) return { error: "no cabe con el tamaño mínimo" };
    const desborda = [...document.querySelectorAll("#nom span, [data-fit] span")].some((e) => { const q = e.getBoundingClientRect(); return q.left < 46.5 || q.right > 709 - 46.5; });
    const abajo = Math.round(pila.getBoundingClientRect().bottom);
    return { lineas: mejor.part, tam: mejor.tam, abajo, limite, desborda, holgura: limite - abajo, htmlResuelto: document.body.innerHTML };
  }, x.nombre_liston || x.nombre);
  if (r.error || r.desborda) throw new Error(`Composición inválida para ${x.nombre}: ${JSON.stringify(r)}`);
  return r;
}

async function generarColectivoA4(browser, items, archivo, titulo) {
  const gx = 8, gy = 12, lw = 60, lh = 120;
  const ox = (210 - (3 * lw + 2 * gx)) / 2;   // 7 mm
  const oy = 16;                              // 16 mm arriba → 252 mm bloque → 29 mm pie
  const scaleX = CSS_60MM / W, scaleY = CSS_120MM / H;
  const hojas = [];
  for (let i = 0; i < items.length; i += 6) hojas.push(items.slice(i, i + 6));
  const marcasSVG = (x, y) => {
    const Lc = 4, sep = 1.5;
    const pts = [[x, y, -1, -1], [x + lw, y, 1, -1], [x, y + lh, -1, 1], [x + lw, y + lh, 1, 1]];
    return pts.map(([px, py, sx, sy]) =>
      `<line x1="${px + sx * sep}" y1="${py}" x2="${px + sx * (sep + Lc)}" y2="${py}" stroke="#787878" stroke-width="0.2"/>` +
      `<line x1="${px}" y1="${py + sy * sep}" x2="${px}" y2="${py + sy * (sep + Lc)}" stroke="#787878" stroke-width="0.2"/>`
    ).join("");
  };
  const paginasHtml = hojas.map((grupo, idx) => {
    let bloques = "", marcas = "";
    grupo.forEach((it, k) => {
      const cx = ox + (k % 3) * (lw + gx), cy = oy + Math.floor(k / 3) * (lh + gy);
      bloques += `<div style="position:absolute;left:${cx}mm;top:${cy}mm;width:${lw}mm;height:${lh}mm;overflow:hidden"><div style="width:${W}px;height:${H}px;transform:scale(${scaleX.toFixed(6)},${scaleY.toFixed(6)});transform-origin:0 0">${it.htmlResuelto}</div></div>`;
      marcas += marcasSVG(cx, cy);
    });
    return `<section class="hoja-a4">${bloques}<svg class="marcas" viewBox="0 0 210 297">${marcas}</svg><p class="pie-a4">${titulo} · hoja ${idx + 1} de ${hojas.length} · listones de 60 × 120 mm · imprimir al 100 % (sin ajustar a la página)</p></section>`;
  }).join("");

  const p = await browser.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 1 });
  await p.goto(BASE + "index.html");
  await p.setContent(`<!doctype html><html lang="es"><head><meta charset="utf-8"><style>
    @page{size:210mm 297mm;margin:0}
    ${BASE_CSS}
    html,body{margin:0;padding:0;background:#fff}
    .hoja-a4{position:relative;width:210mm;height:297mm;background:#fff;page-break-after:always;break-after:page;overflow:hidden}
    .hoja-a4:last-child{page-break-after:auto;break-after:auto}
    .marcas{position:absolute;inset:0;width:210mm;height:297mm;pointer-events:none}
    .pie-a4{position:absolute;left:${ox}mm;right:${ox}mm;bottom:9mm;font-family:"EB Garamond",serif;font-size:9.5pt;color:#555;letter-spacing:.2px}
  </style></head><body>${paginasHtml}</body></html>`, { waitUntil: "networkidle" });
  await p.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map((i) => i.decode().catch(() => {}))); });
  await p.pdf({ path: path.join(OUT_PUB, archivo), width: "210mm", height: "297mm", printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 }, preferCSSPageSize: true });
  await p.close();
}

const personas = [
  ...EV.graduandos_lista.map((g) => ({ ...g, grupo: "graduando", fam: "g" })),
  ...EV.padrinos.map((p) => ({ ...p, grupo: "padrino", fam: "p" })),
].filter((x) => !SOLO.length || SOLO.includes(x.id));

(async () => {
  const b = await chromium.launch();
  const p300 = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const p600 = await b.newPage({ viewport: { width: W600, height: H600 }, deviceScaleFactor: 1 });
  const pPdf = await b.newPage({ viewport: { width: Math.ceil(CSS_60MM), height: Math.ceil(CSS_120MM) }, deviceScaleFactor: 1 });
  await p300.goto(BASE + "index.html");
  await p600.goto(BASE + "index.html");
  await pPdf.goto(BASE + "index.html");

  const informe = [], resueltos = [];
  for (const x of personas) {
    const r = await resolverListon(p300, x, x.fam);
    // 1) PNG 300 ppp (709 × 1417 px)
    await p300.screenshot({ path: path.join(OUT_VAR, x.id + ".png"), omitBackground: true, clip: { x: 0, y: 0, width: W, height: H } });
    // 2) PNG 600 ppp (1417 × 2835 px) — renderizado nativo 2x sin remuestreo
    const sx600 = (W600 / W).toFixed(6), sy600 = (H600 / H).toFixed(6);
    await p600.setContent(`<!doctype html><html lang="es"><head><meta charset="utf-8"><style>${BASE_CSS}html,body{width:${W600}px;height:${H600}px;background:transparent;overflow:hidden}.wrap{width:${W}px;height:${H}px;transform:scale(${sx600},${sy600});transform-origin:0 0}</style></head><body><div class="wrap">${r.htmlResuelto}</div></body></html>`, { waitUntil: "networkidle" });
    await p600.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map((i) => i.decode().catch(() => {}))); });
    await p600.screenshot({ path: path.join(OUT_VAR, x.id + "-600ppp.png"), omitBackground: true, clip: { x: 0, y: 0, width: W600, height: H600 } });
    // 3) PDF vectorial individual (60 × 120 mm, logotipos originales incrustados)
    const sxPdf = (CSS_60MM / W).toFixed(6), syPdf = (CSS_120MM / H).toFixed(6);
    await pPdf.setContent(`<!doctype html><html lang="es"><head><meta charset="utf-8"><style>@page{size:60mm 120mm;margin:0}${BASE_CSS}html,body{width:60mm;height:120mm;margin:0;padding:0;background:#fff;overflow:hidden}.wrap{width:${W}px;height:${H}px;transform:scale(${sxPdf},${syPdf});transform-origin:0 0}</style></head><body><div class="wrap">${r.htmlResuelto}</div></body></html>`, { waitUntil: "networkidle" });
    await pPdf.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map((i) => i.decode().catch(() => {}))); });
    await pPdf.pdf({ path: path.join(OUT_PUB, x.id + ".pdf"), width: "60mm", height: "120mm", printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 }, preferCSSPageSize: true });

    const { htmlResuelto, ...datos } = r;
    informe.push({ id: x.id, grupo: x.grupo, nombre: x.nombre, nombre_liston: x.nombre_liston || x.nombre, denominacion: x.denominacion, ...datos });
    resueltos.push({ ...x, htmlResuelto });
  }

  // 4) PDF colectivos A4 vectoriales (cuando se generan todos)
  if (!SOLO.length) {
    await generarColectivoA4(b, resueltos.filter((x) => x.grupo === "graduando"), "listones-especialistas-2026-A4.pdf", "XXIV Promoción de Radiólogos · Especialistas 2026");
    await generarColectivoA4(b, resueltos.filter((x) => x.grupo === "padrino"), "listones-padrinos-madrinas-A4.pdf", "XXIV Promoción de Radiólogos · Padrinos y madrinas de promoción");
  }

  fs.writeFileSync(path.join(OUT_VAR, "informe.json"), JSON.stringify({ direccion: "B-Protocolar", logo_departamento: LOGO_DEPTO, listones: informe }, null, 1));
  console.log(informe.map((i) => `${i.nombre_liston} · ${i.denominacion} · ${i.lineas.join(" / ")} (${i.tam}px)`).join("\n"));
  console.log("Logo del Departamento usado:", LOGO_DEPTO);
  await b.close();
})().catch((e) => { console.error(e.message || e); process.exit(1); });
