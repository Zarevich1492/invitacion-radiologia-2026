/* Exploración de direcciones artísticas para los listones (NO son los archivos definitivos).
   3 direcciones × 2 familias (especialistas / padrinos y madrinas), 60 × 120 mm a 300 ppp con V.
   Logotipos: archivos originales sin modificar (solo escala y posición).
   Uso: node herramientas/explorar_listones.js [URL_BASE]  → variantes/exploracion/*.png */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const BASE = process.argv[2] || "http://127.0.0.1:8765/";
const SOLO_DIR = process.argv[3] || "";
const RAIZ = path.join(__dirname, "..");
const EV = JSON.parse(fs.readFileSync(path.join(RAIZ, "datos", "evento.json"), "utf8"));
const OUT = path.join(RAIZ, "variantes", "exploracion");
fs.mkdirSync(OUT, { recursive: true });

const W = 709, H = 1417, MM = 300 / 25.4, M = Math.round(4 * MM), V = Math.round(15 * MM); // margen 4 mm (47 px), V 15 mm
const oficial = ["png", "jpg", "jpeg"].map((e) => `originales/logos/departamento-oficial.${e}`).find((f) => fs.existsSync(path.join(RAIZ, f)));
const DEPTO = oficial || "originales/logos-extraidos/departamento-radiologia.png";
const L = (f) => `${BASE}${f}`;

// Filete paralelo al contorno (incluida la V) a una distancia d hacia dentro
function contorno(d) {
  const pend = V / (W / 2), dy = d * Math.sqrt(1 + pend * pend);
  return `${d},${d} ${W - d},${d} ${W - d},${(H - d * pend - dy).toFixed(1)} ${W / 2},${(H - V - dy).toFixed(1)} ${d},${(H - d * pend - dy).toFixed(1)}`;
}
const silueta = `polygon(0 0,100% 0,100% 100%,50% calc(100% - ${V}px),0 100%)`;

const CSS = `
@font-face{font-family:"Bodoni Moda";font-weight:400 900;src:url("${BASE}assets/fonts/BodoniModa-normal.woff2") format("woff2")}
@font-face{font-family:"Bodoni Moda";font-style:italic;font-weight:400 900;src:url("${BASE}assets/fonts/BodoniModa-italic.woff2") format("woff2")}
@font-face{font-family:"EB Garamond";font-weight:400 600;src:url("${BASE}assets/fonts/EBGaramond-normal.woff2") format("woff2")}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;background:transparent;overflow:hidden}
:root{--crema:#f5e7d3;--rojo:#b8231f;--negro:#141110;--carbon:#1c1715;--oro:#b5935c;--oro2:#d7bd8a}
.L{position:relative;width:${W}px;height:${H}px;clip-path:${silueta};overflow:hidden;font-family:"EB Garamond",serif}
.abs{position:absolute}
.bod{font-family:"Bodoni Moda",serif;font-variation-settings:"opsz" 11}
.inst{display:flex;align-items:center;justify-content:center;gap:18px}
.inst img{height:58px;width:auto;display:block}
.inst i{width:2px;height:44px;background:var(--negro)}
.nombre span{display:block;white-space:nowrap}
svg.ov{position:absolute;inset:0;width:${W}px;height:${H}px;pointer-events:none}
.pila{position:absolute;left:${M}px;right:${M}px;display:flex;flex-direction:column;align-items:flex-start}
.tab{display:flex;align-items:center;justify-content:center;line-height:1}
`;
const inst = (alto = 58) => `<div class="inst"><img style="height:${alto}px" src="${L("originales/logos-extraidos/ula.png")}"><i style="height:${Math.round(alto * .76)}px"></i><img style="height:${alto}px" src="${L(DEPTO)}"></div>`;
const PROMO = L("originales/logos-extraidos/promocion-xxiv.png");
const PROMO_AR = 1910 / 2674;

/* ---------------- A · Editorial contemporánea ---------------- */
function A(x, fam) {
  const g = fam === "g", fondo = g ? "var(--crema)" : "var(--carbon)", tinta = g ? "var(--negro)" : "var(--crema)", linea = g ? "var(--negro)" : "var(--oro)";
  const ph = 470, pw = Math.round(ph * PROMO_AR);
  const palabra = g ? "ESPECIALISTA" : x.denominacion.split(" ")[0];
  const tab = g
    ? `<div class="tab bod" style="align-self:flex-end;margin-right:-${M}px;width:330px;height:118px;background:var(--negro);color:var(--crema);font-weight:800;font-size:98px">2026</div>`
    : `<div class="tab" style="align-self:flex-end;margin-right:-${M}px;width:360px;height:64px;background:var(--negro);color:var(--oro2);font-weight:600;font-size:31px;letter-spacing:3px;gap:12px"><i style="width:26px;height:2px;background:var(--oro)"></i>DE PROMOCIÓN</div>`;
  return `<div class="L" style="background:${fondo};color:${tinta}">
    <div class="abs" style="left:0;right:0;top:0;height:150px;background:var(--crema)"></div>
    <div class="abs" style="left:0;right:0;top:46px">${inst(58)}</div>
    <div class="abs" style="left:0;right:0;top:150px;height:3px;background:${linea}"></div>
    <div class="abs" style="left:${M}px;top:205px;width:300px;height:440px;background:var(--rojo)"></div>
    <div class="abs" style="left:${W - M - 70}px;top:150px;width:3px;height:520px;background:${linea}"></div>
    <div class="abs" style="left:0;top:612px;width:${W - M}px;height:3px;background:${linea}"></div>
    <img class="abs" src="${PROMO}" style="left:128px;top:178px;height:${ph}px;width:${pw}px">
    <div class="pila" id="pila" data-limite="${H - V - 74}" style="top:688px">
      <div style="margin:0 -${M}px;padding:12px ${M}px ${g ? 70 : 40}px;background:var(--rojo)"><div class="bod" data-fit="${W - 2 * M}" style="color:var(--crema);font-weight:800;line-height:1;letter-spacing:-1px">${palabra}</div></div>
      ${tab.replace('style="', `style="margin-top:-${g ? 52 : 30}px;`)}
      <div class="nombre bod" id="nom" data-max="104" data-min="66" data-ancho="${W - 2 * M}" style="margin-top:${g ? 26 : 24}px;font-weight:700;line-height:1.02;color:${tinta}"></div>
    </div>
    <svg class="ov" viewBox="0 0 ${W} ${H}"><polyline points="${contorno(M).split(" ").slice(2).join(" ")}" fill="none" stroke="${g ? "#b8231f" : "#b5935c"}" stroke-width="3"/>
      <rect x="${W / 2 - 9}" y="${H - V - 64}" width="18" height="18" fill="${g ? "#141110" : "#b8231f"}" transform="rotate(45 ${W / 2} ${H - V - 55})"/></svg>
  </div>`;
}

/* ---------------- B · Protocolar (DIRECCIÓN APROBADA, refinada) ----------------
   Estructura: placa de logotipos institucionales → placa del logotipo de la promoción → distinción
   (primer nivel, monumental) → «DE PROMOCIÓN» / «2026» entre filetes (segundo nivel) → nombre en cursiva. */
function B(x, fam) {
  const g = fam === "g", fondo = g ? "var(--crema)" : "var(--carbon)", tinta = g ? "var(--negro)" : "var(--crema)", filete = g ? "#b8231f" : "#b5935c";
  const ph = 372, pw = Math.round(ph * PROMO_AR), px = (W - pw) / 2;
  const topInst = M + 18, altoInst = 118, topPlaca = topInst + altoInst + 28;
  const palabra = g ? "ESPECIALISTA" : x.denominacion.split(" ")[0];
  const regla = (c) => `<i style="flex:1;height:2px;background:${c};min-width:28px"></i>`;
  const sub = g
    ? `<div class="bod" style="align-self:stretch;display:flex;align-items:center;gap:20px;color:var(--negro);font-weight:800;font-size:74px;line-height:1;margin-top:14px">${regla(filete)}2026${regla(filete)}</div>`
    : `<div style="align-self:stretch;display:flex;align-items:center;gap:18px;color:var(--oro2);font-weight:600;font-size:38px;letter-spacing:7px;line-height:1;margin-top:16px">${regla(filete)}<span style="margin-right:-7px">DE PROMOCIÓN</span>${regla(filete)}</div>`;
  return `<div class="L" style="background:${fondo};color:${tinta}">
    <div class="abs" style="left:${W / 2 - 72}px;width:144px;top:0;bottom:0;background:var(--rojo)"></div>
    ${g ? "" : `<div class="abs" style="left:${W / 2 - 72}px;width:6px;top:0;bottom:0;background:var(--oro)"></div><div class="abs" style="left:${W / 2 + 66}px;width:6px;top:0;bottom:0;background:var(--oro)"></div>`}
    <div class="abs" style="left:${M + 20}px;right:${M + 20}px;top:${topInst}px;height:${altoInst}px;background:var(--crema);border:2px solid ${filete};display:flex;align-items:center;justify-content:center">${inst(66)}</div>
    <div class="abs" style="left:${px - 22}px;top:${topPlaca}px;width:${pw + 44}px;height:${ph + 44}px;background:var(--crema);border:3px solid ${filete};outline:2px solid ${filete};outline-offset:6px"></div>
    <img class="abs" src="${PROMO}" style="left:${px}px;top:${topPlaca + 22}px;height:${ph}px;width:${pw}px">
    <div class="pila" id="pila" data-limite="${H - V - 105}" style="top:${topPlaca + ph + 44 + 34}px;left:${M + 16}px;right:${M + 16}px;align-items:center;text-align:center;padding:26px 14px 30px;background:${fondo}">
      <div class="bod" data-fit="${W - 2 * M - 64}" style="color:${g ? "var(--rojo)" : "var(--crema)"};font-weight:900;line-height:.95;letter-spacing:3px">${palabra}</div>
      ${sub}
      <div class="nombre bod" id="nom" data-max="90" data-min="64" data-ancho="${W - 2 * M - 64}" style="margin-top:32px;font-style:italic;font-weight:600;line-height:1.1;color:${tinta}"></div>
    </div>
    <svg class="ov" viewBox="0 0 ${W} ${H}"><polygon points="${contorno(M)}" fill="none" stroke="${filete}" stroke-width="2.5"/><polygon points="${contorno(M + 12)}" fill="none" stroke="${filete}" stroke-width="1.2"/></svg>
  </div>`;
}

/* ---------------- C · Minimalista de alto impacto ---------------- */
function C(x, fam) {
  const g = fam === "g", fondo = g ? "var(--crema)" : "var(--negro)", tinta = g ? "var(--negro)" : "var(--crema)";
  const ph = 500, pw = Math.round(ph * PROMO_AR);
  const palabra = g ? "ESPECIALISTA" : x.denominacion.split(" ")[0];
  const sub = g
    ? `<div class="bod" style="display:flex;align-items:center;gap:16px;color:var(--negro);font-weight:800;font-size:70px;line-height:1;margin-top:6px">2026<i style="flex:1;height:10px;background:var(--rojo)"></i></div>`
    : `<div style="display:flex;align-items:center;gap:14px;color:var(--rojo);font-weight:600;font-size:34px;letter-spacing:4px;line-height:1;margin-top:10px">DE PROMOCIÓN<i style="flex:1;height:5px;background:var(--rojo)"></i></div>`;
  return `<div class="L" style="background:${fondo};color:${tinta}">
    ${g ? "" : `<div class="abs" style="left:${(W - pw) / 2 - 26}px;top:${M + 6}px;width:${pw + 52}px;height:${ph + 52}px;background:var(--crema)"></div>`}
    <img class="abs" src="${PROMO}" style="left:${(W - pw) / 2}px;top:${M + 32}px;height:${ph}px;width:${pw}px">
    <div class="pila" id="pila" data-limite="${H - V - 172}" style="top:${M + ph + 84}px">
      <div class="bod" data-fit="${W - 2 * M}" style="color:${g ? "var(--rojo)" : "var(--crema)"};font-weight:900;line-height:.92;letter-spacing:-2px">${palabra}</div>
      ${sub}
      <div class="nombre bod" id="nom" data-max="92" data-min="62" data-ancho="${W - 2 * M}" style="margin-top:26px;font-weight:700;line-height:1.02;color:${tinta}"></div>
    </div>
    <div class="abs" style="left:0;right:0;bottom:0;height:${V + 150}px;background:var(--rojo)"></div>
    <div class="abs" style="left:${M}px;right:${M}px;bottom:${V + 26}px;height:96px;background:var(--crema);display:flex;align-items:center;justify-content:center">${inst(54)}</div>
  </div>`;
}

const DIRS = { A: { f: A, nombre: "Editorial contemporánea" }, B: { f: B, nombre: "Protocolar" }, C: { f: C, nombre: "Minimalista de alto impacto" } };
const MUESTRAS = [
  { ...EV.graduandos_lista.find((g) => g.id === "arrieta-jorge"), fam: "g" },
  ...["rojas-gustavo", "falcon-analy", "gutierrez-maria-del-carmen"].map((id) => ({ ...EV.padrinos.find((p) => p.id === id), fam: "p" })),
];

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await p.goto(BASE + "index.html");
  const informe = [];
  for (const [d, def] of Object.entries(DIRS).filter(([k]) => !SOLO_DIR || SOLO_DIR.includes(k))) {
    for (const x of MUESTRAS) {
      await p.setContent(`<!doctype html><html lang="es"><head><meta charset="utf-8"><style>${CSS}</style></head><body>${def.f(x, x.fam)}</body></html>`, { waitUntil: "networkidle" });
      const r = await p.evaluate(async (nombre) => {
        await document.fonts.load('800 80px "Bodoni Moda"', "Á"); await document.fonts.load('italic 600 80px "Bodoni Moda"', "Á"); await document.fonts.ready;
        await Promise.all([...document.images].map((i) => i.decode().catch(() => {})));
        // Distinción: ajustada al ancho disponible (tipografía monumental), medida sobre su propio texto
        for (const el of document.querySelectorAll("[data-fit]")) {
          const max = +el.dataset.fit, sp = document.createElement("span"); sp.textContent = el.textContent.trim(); sp.style.whiteSpace = "nowrap"; sp.style.display = "inline-block";
          el.textContent = ""; el.appendChild(sp); let t = 220; el.style.fontSize = t + "px";
          while (sp.getBoundingClientRect().width > max && t > 30) { t -= 1; el.style.fontSize = t + "px"; }
        }
        // Nombre: 1–3 líneas equilibradas. Se busca el MAYOR tamaño que cabe en ancho y en el presupuesto
        // vertical (la pila no puede superar el límite superior de la V).
        const caja = document.getElementById("nom"), ancho = +caja.dataset.ancho, maxT = +caja.dataset.max, minT = +caja.dataset.min;
        const pila = document.getElementById("pila"), limite = +pila.dataset.limite;
        const palabras = nombre.split(" ");
        const mide = (t, s) => { const sp = document.createElement("span"); sp.style.cssText = `font-size:${s}px;display:inline-block;white-space:nowrap`; sp.textContent = t; caja.appendChild(sp); const w = sp.getBoundingClientRect().width; sp.remove(); return w; };
        const particiones = [[palabras.join(" ")]];
        for (let i = 1; i < palabras.length; i++) {
          particiones.push([palabras.slice(0, i).join(" "), palabras.slice(i).join(" ")]);
          for (let j = i + 1; j < palabras.length; j++) particiones.push([palabras.slice(0, i).join(" "), palabras.slice(i, j).join(" "), palabras.slice(j).join(" ")]);
        }
        const validas = particiones.filter((part) => !(part.length > 1 && part.some((l) => /^(Dr\.|Dra\.)$/.test(l))));
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
        const r = caja.getBoundingClientRect();
        const fuera = [...document.querySelectorAll("#nom span, [data-fit] span")].some((e) => { const q = e.getBoundingClientRect(); return q.left < 46.5 || q.right > 709 - 46.5; });
        return { lineas: mejor.part, tam: mejor.tam, abajo: Math.round(pila.getBoundingClientRect().bottom), limite, fuera };
      }, x.nombre_liston || x.nombre);
      const archivo = `${d}-${x.fam === "g" ? "especialista" : "padrino"}-${x.id}.png`;
      await p.screenshot({ path: path.join(OUT, archivo), omitBackground: true, clip: { x: 0, y: 0, width: W, height: H } });
      informe.push({ direccion: d, nombre: x.nombre_liston || x.nombre, ...r, archivo });
      if (r.error) throw new Error(`${d} · ${x.nombre}: ${r.error}`);
      console.log(`${d} · ${x.nombre_liston || x.nombre}: ${r.lineas.join(" / ")} · ${r.tam}px (${(r.tam / MM).toFixed(1)} mm) · pila hasta ${r.abajo}/${r.limite}px${r.fuera ? " ⚠ fuera del margen de 4 mm" : ""}`);
    }
  }
  fs.writeFileSync(path.join(OUT, "informe.json"), JSON.stringify({ logo_departamento: DEPTO, informe }, null, 1));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
