/* Compone las caras de las tres variantes a resolución original (6250 × 4830 px).
   - Las ilustraciones, logotipos y el fondo crema se toman SIN modificar de /originales.
   - Solo se sustituyen bloques de texto, que están sobre fondo crema uniforme (desv. estándar 0).
   - Tipografías: EB Garamond (equivalente medido al cuerpo de texto original, error < 5 %) y Bodoni Moda.
   Uso: python3 -m http.server 8765 (en la raíz)  →  node herramientas/componer_variantes.js
   Salida: /variantes/_capas (texto transparente + operaciones) → componer con herramientas/componer_variantes.py                                                                  */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = process.argv[2] || "http://127.0.0.1:8765/";
const OUT = path.join(__dirname, "..", "variantes");
const CAPAS = path.join(OUT, "_capas");
fs.mkdirSync(CAPAS, { recursive: true });

const W = 6250, H = 4830, CREMA = "#f5e7d3", NEGRO = "#141110", ROJO = "#b8211d";
const CSS = `
@font-face{font-family:"Bodoni Moda";font-weight:400 900;src:url("${BASE}assets/fonts/BodoniModa-normal.woff2") format("woff2")}
@font-face{font-family:"EB Garamond";font-weight:400 600;src:url("${BASE}assets/fonts/EBGaramond-normal.woff2") format("woff2")}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:transparent}
.lienzo{position:relative;width:${W}px;height:${H}px;overflow:hidden}
.base{display:none}
.tapar{display:none}
.mover{display:none}
.mover img{position:absolute;width:${W}px;height:${H}px}
.t{position:absolute;white-space:nowrap;color:${NEGRO}}
.bod{font-family:"Bodoni Moda",serif;font-weight:700;font-variation-settings:"opsz" 11}
.gar{font-family:"EB Garamond",serif;font-weight:400}
.c{left:0;width:${W}px;text-align:center}
.rojo{color:${ROJO}}
.col{position:absolute;font-family:"EB Garamond",serif;font-size:140px;line-height:165px;color:${NEGRO};white-space:normal}
.col b{font-weight:600}
.col p{margin:0}
.col .esp{height:96px}
.col .regla{width:330px;height:7px;background:${ROJO};margin:0 0 40px 0}
.parrafos{position:absolute;font-family:"EB Garamond",serif;font-size:144px;line-height:177px;color:${NEGRO};width:2450px;white-space:normal}
.parrafos p+p{margin-top:177px}
.firma{position:absolute;font-family:"EB Garamond",serif;font-weight:600;font-size:116px;line-height:142px;color:${NEGRO}}
`;

// Programa de la columna derecha, generado desde la fuente única datos/evento.json
const EVENTO = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "datos", "evento.json"), "utf8"));
function programa(conRecepcion) {
  const acts = EVENTO.actividades.filter((a) => conRecepcion || a.codigo !== "recepcion");
  return `<p><b>${EVENTO.fecha_tarjeta}</b></p>` + acts.map((a) => `<div class="esp"></div>${a.social ? '<div class="regla"></div>' : ""}
  <p><b${a.social ? ' class="rojo"' : ""}>${a.hora_texto}</b></p>${a.lineas_tarjeta.map((l) => `<p>${l}</p>`).join("")}`).join("");
}

const firmaTexto = (primera) => `<div class="firma" style="left:296px;top:2385px">${primera ? `<div>${primera}</div>` : ""}<div class="rojo">Promoción XXIV</div><div>Postgrado de Radiología</div><div>Universidad de Los Andes</div></div>`;

const TEXTOS = {
  B: {
    portada: ["UNA VOCACIÓN", "QUE NOS UNE", "XXIV Promoción de Radiólogos · Invitación especial"],
    titulo: null, // conserva «Doctores y Doctoras» original (los residentes son médicos)
    parrafos: ["Compartimos guardias, aprendizajes, desafíos y la experiencia de formarnos en un mismo lugar.",
      "Hoy culminamos una etapa que ustedes también están recorriendo. Queremos compartir con nuestros compañeros este momento tan significativo."],
    cierre: "Nos alegrará contar con su presencia.",
    contra: ["Distintas etapas.", "Una misma vocación.", "Celebremos juntos el camino recorrido."],
  },
  C: {
    portada: ["UN MOMENTO", "PARA COMPARTIR", "XXIV Promoción de Radiólogos · Invitación especial"],
    titulo: "Un momento para compartir",
    parrafos: ["Hay momentos que adquieren un significado especial cuando los compartimos con quienes nos acompañan.",
      "La XXIV Promoción de Radiólogos tiene el placer de invitarte a celebrar la culminación de nuestra etapa de formación profesional."],
    cierre: "Nos alegrará contar con tu presencia.",
    contra: ["Cada etapa que termina", "abre un nuevo camino.", "Gracias por acompañarnos."],
  },
};

const img = (f) => `<img class="base" src="${BASE}originales/${f}">`;

function portada(v) {
  const t = TEXTOS[v].portada;
  const [l1, l2] = t[2].split(" · ");   // la línea roja se compone en dos líneas para ganar tamaño en la portada vertical
  return `${img("3-portada.png")}
  <div class="tapar" style="left:0;top:3250px;width:${W}px;height:1110px"></div>
  <div class="t bod c" style="top:3290px;font-size:214px;line-height:260px;letter-spacing:-7px">${t[0]}</div>
  <div class="t bod c" style="top:3590px;font-size:214px;line-height:260px;letter-spacing:-7px">${t[1]}</div>
  <div class="t bod c rojo" style="top:3893px;font-size:170px;line-height:200px;letter-spacing:-4px">${l1}</div>
  <div class="t bod c rojo" style="top:4093px;font-size:170px;line-height:200px;letter-spacing:-4px">${l2}</div>
  <div class="mover" style="left:2150px;top:4380px;width:2300px;height:200px"><img src="${BASE}originales/3-portada.png" style="left:-2150px;top:-4150px"></div>`;
  // La fecha «28 de noviembre de 2026» (píxeles originales, y 4161–4338) se traslada debajo, sin modificarla.
}

function interior(v, conRecepcion) {
  const firmaOriginal = `<div class="mover" style="left:292px;top:2380px;width:1450px;height:520px"><img src="${BASE}originales/4-interior.png" style="left:-3298px;top:-2325px"></div>`;
  if (v === "A") {
    return `${img("4-interior.png")}
    <div class="tapar" style="left:3150px;top:560px;width:3100px;height:2400px"></div>
    ${firmaOriginal}
    <div class="col" style="left:3298px;top:578px;width:2900px">${programa(conRecepcion)}</div>`;
  }
  const t = TEXTOS[v];
  return `${img("4-interior.png")}
  <div class="tapar" style="left:0;top:560px;width:${W}px;height:2400px"></div>
  <div class="tapar" style="left:1300px;top:3020px;width:3650px;height:245px"></div>
  ${t.titulo ? `<div class="tapar" style="left:1900px;top:200px;width:2500px;height:300px"></div>
  <div class="t bod c rojo" style="top:190px;font-size:228px;line-height:300px;letter-spacing:-7px">${t.titulo}</div>` : ""}
  <div class="parrafos" style="left:293px;top:620px">${t.parrafos.map((p) => `<p>${p}</p>`).join("")}</div>
  ${firmaTexto("Con afecto,")}
  <div class="col" style="left:3298px;top:578px;width:2900px">${programa(conRecepcion)}</div>
  <div class="t bod c rojo" style="top:3036px;font-size:162px;line-height:230px;letter-spacing:-4px">${t.cierre}</div>`;
}

function contraportada(v) {
  const t = TEXTOS[v].contra;
  return `${img("5-contraportada.png")}
  <div class="tapar" style="left:0;top:2925px;width:${W}px;height:1060px"></div>
  <div class="t bod c" style="top:2905px;font-size:212px;line-height:280px;letter-spacing:-6px">${t[0]}</div>
  <div class="t bod c" style="top:3170px;font-size:212px;line-height:280px;letter-spacing:-6px">${t[1]}</div>
  <div class="t bod c rojo" style="top:3600px;font-size:118px;line-height:180px;letter-spacing:-2px">${t[2]}</div>
  <div class="t gar c" style="top:3760px;font-size:89px;line-height:110px;font-weight:600">XXIV Promoción de Radiólogos</div>
  <div class="t gar c" style="top:3866px;font-size:89px;line-height:110px;font-weight:600">Universidad de Los Andes · 2026</div>`;
}

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await p.goto(BASE + "index.html"); // mismo origen: las fuentes cargan sin restricciones CORS
  const operaciones = {};
  const caras = [
    ["A-interior-3", interior("A", true)], ["A-interior-2", interior("A", false)],
    ["B-portada", portada("B")], ["B-interior-3", interior("B", true)], ["B-interior-2", interior("B", false)], ["B-contraportada", contraportada("B")],
    ["C-portada", portada("C")], ["C-interior-3", interior("C", true)], ["C-interior-2", interior("C", false)], ["C-contraportada", contraportada("C")],
  ];
  for (const [nombre, html] of caras) {
    await p.setContent(`<!doctype html><html lang="es"><head><meta charset="utf-8"><style>${CSS}</style></head><body><div class="lienzo">${html}</div></body></html>`, { waitUntil: "networkidle" });
    await p.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map((i) => i.decode().catch(() => {}))); });
    // Verificación: ningún texto debe desbordar el lienzo
    const desborde = await p.evaluate(() => [...document.querySelectorAll(".t,.col,.parrafos,.firma")].some((e) => { const r = e.getBoundingClientRect(); return r.right > 6250 || r.left < 0; }));
    // Operaciones para Python: fondo original, rectángulos a cubrir con crema exacto y bloques a trasladar
    operaciones[nombre] = await p.evaluate(() => ({
      base: document.querySelector(".base").getAttribute("src").split("/").pop(),
      tapar: [...document.querySelectorAll(".tapar")].map((e) => [e.style.left, e.style.top, e.style.width, e.style.height].map((v) => (v === "0px" || v === "0" ? 0 : parseInt(v)))),
      mover: [...document.querySelectorAll(".mover")].map((e) => ({ destino: [parseInt(e.style.left), parseInt(e.style.top), parseInt(e.style.width), parseInt(e.style.height)], origen: [-parseInt(e.firstElementChild.style.left), -parseInt(e.firstElementChild.style.top)] })),
    }));
    const fuentesOk = await p.evaluate(async () => { await document.fonts.load('700 100px "Bodoni Moda"', "Á"); await document.fonts.load('400 100px "EB Garamond"', "Á"); await document.fonts.load('600 100px "EB Garamond"', "Á"); return document.fonts.check('700 100px "Bodoni Moda"') && document.fonts.check('400 100px "EB Garamond"'); });
    if (!fuentesOk) throw new Error("Las tipografías no cargaron: " + nombre);
    await p.screenshot({ path: path.join(CAPAS, nombre + ".png"), clip: { x: 0, y: 0, width: W, height: H }, omitBackground: true });
    console.log(nombre, desborde ? "⚠ desborde" : "ok");
  }
  fs.writeFileSync(path.join(CAPAS, "operaciones.json"), JSON.stringify(operaciones, null, 1));
  await b.close();
})();
