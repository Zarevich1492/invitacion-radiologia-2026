/* Listones conmemorativos · 60 × 120 mm con terminación inferior en V (300 ppp → 709 × 1417 px).
   Contenido: tres logotipos originales, denominación, nombre e identificación de la promoción.
   SIN actividades, horarios, direcciones ni información logística.
   Uso: (servidor en la raíz) node herramientas/componer_listones.js [URL_BASE] [solo_ids_separados_por_coma]
   Salida: variantes/listones/<id>.png (RGBA, fondo transparente fuera de la forma) */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = process.argv[2] || "http://127.0.0.1:8765/";
const SOLO = (process.argv[3] || "").split(",").filter(Boolean);
const RAIZ = path.join(__dirname, "..");
const EV = JSON.parse(fs.readFileSync(path.join(RAIZ, "datos", "evento.json"), "utf8"));
const OUT = path.join(RAIZ, "variantes", "listones");
fs.mkdirSync(OUT, { recursive: true });

const W = 709, H = 1417;                                   // 60 × 120 mm a 300 ppp
const V = Math.round(EV.liston.profundidad_v_mm / 25.4 * 300); // profundidad de la V (15 mm ≈ 177 px)
const B = 22;                                               // filete interior
// Logotipo del Departamento: si existe el archivo oficial entregado, se usa tal cual.
const oficial = ["png", "jpg", "jpeg"].map((e) => `originales/logos/departamento-oficial.${e}`).find((f) => fs.existsSync(path.join(RAIZ, f)));
const LOGO_DEPTO = oficial || "originales/logos-extraidos/departamento-radiologia.png";
// Si el logotipo oficial es vertical (símbolo sobre el texto), la fila necesita más altura para que el texto sea legible.
const ALTO_INST = oficial ? 120 : 70;

// Filete paralelo al borde (incluida la V), a B px hacia dentro
const pend = V / (W / 2), dy = B * Math.sqrt(1 + pend * pend);
const yLado = H - B * pend - dy, yVertice = H - V - dy;
const FILETE = `${B},${B} ${W - B},${B} ${W - B},${yLado.toFixed(1)} ${W / 2},${yVertice.toFixed(1)} ${B},${yLado.toFixed(1)}`;

const personas = [
  ...EV.graduandos_lista.map((g) => ({ ...g, grupo: "graduando" })),
  ...EV.padrinos.map((p) => ({ ...p, grupo: "padrino" })),
].filter((x) => !SOLO.length || SOLO.includes(x.id));

const html = (x) => `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>
@font-face{font-family:"Bodoni Moda";font-weight:400 900;src:url("${BASE}assets/fonts/BodoniModa-normal.woff2") format("woff2")}
@font-face{font-family:"Bodoni Moda";font-style:italic;font-weight:400 900;src:url("${BASE}assets/fonts/BodoniModa-italic.woff2") format("woff2")}
@font-face{font-family:"EB Garamond";font-weight:400 600;src:url("${BASE}assets/fonts/EBGaramond-normal.woff2") format("woff2")}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;background:transparent;overflow:hidden}
.liston{position:relative;width:${W}px;height:${H}px;background:#f5e7d3;
  clip-path:polygon(0 0,100% 0,100% 100%,50% calc(100% - ${V}px),0 100%);
  display:flex;flex-direction:column;align-items:center;color:#141110;font-family:"EB Garamond",serif}
.filete{position:absolute;inset:0;width:${W}px;height:${H}px}
.franja{position:absolute;left:0;right:0;top:0;height:12px;background:#b8231f}
.inst{display:flex;align-items:center;gap:22px;margin-top:62px}
.inst img{height:var(--alto-inst,70px);width:auto;display:block}
.inst i{width:2px;height:48px;background:#141110}
.promo{height:440px;width:auto;margin-top:40px;display:block}
.denom{margin-top:auto;font-weight:600;font-size:25px;letter-spacing:5px;color:#b8231f;text-align:center;white-space:nowrap}
.regla{width:70px;height:3px;background:#b8231f;margin-top:20px}
.nombre{margin-top:20px;margin-bottom:6px;text-align:center;font-family:"Bodoni Moda",serif;font-weight:700;font-variation-settings:"opsz" 11;line-height:1.06;letter-spacing:-0.5px;width:${W - 2 * B - 56}px}
.nombre span{display:block;white-space:nowrap}
.ident{margin-top:auto;margin-bottom:14px;text-align:center}
.ident b{display:block;font-family:"Bodoni Moda",serif;font-weight:700;font-variation-settings:"opsz" 11;font-size:29px}
.ident small{display:block;margin-top:4px;font-size:22px;color:#6a584b;letter-spacing:.5px}
.banda{position:relative;width:${W}px;height:${Math.round(W * 352 / 1440)}px;margin-bottom:${V + 6}px;
  background:url("${BASE}assets/img/banda-merida-1440.jpg") center bottom/100% auto no-repeat}
.banda::before{content:"";position:absolute;inset:0 0 45% 0;background:linear-gradient(#f5e7d3,rgba(245,231,211,0))}
</style></head><body><div class="liston" style="--alto-inst:${ALTO_INST}px">
  <div class="franja"></div>
  <div class="inst"><img src="${BASE}originales/logos-extraidos/ula.png" alt=""><i></i><img src="${BASE}${LOGO_DEPTO}" alt=""></div>
  <img class="promo" src="${BASE}originales/logos-extraidos/promocion-xxiv.png" alt="">
  <div class="denom">${x.denominacion}</div>
  <div class="regla"></div>
  <div class="nombre" id="nombre"></div>
  <div class="ident"><b>XXIV Promoción de Radiólogos</b><small>Universidad de Los Andes · Mérida · 2026</small></div>
  <div class="banda"></div>
  <svg class="filete" viewBox="0 0 ${W} ${H}"><polygon points="${FILETE}" fill="none" stroke="#b8231f" stroke-width="3"/></svg>
</div></body></html>`;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await p.goto(BASE + "index.html");
  const informe = [];
  for (const x of personas) {
    await p.setContent(html(x), { waitUntil: "networkidle" });
    // Composición del nombre: una línea si cabe (≥ 50 px); si no, dos líneas cortando antes del apellido.
    const r = await p.evaluate(async ({ nombre, apellido }) => {
      await document.fonts.load('700 60px "Bodoni Moda"', "Áñ"); await document.fonts.ready;
      await Promise.all([...document.images].map((i) => i.decode().catch(() => {})));
      const caja = document.getElementById("nombre"), max = caja.clientWidth;
      const mide = (t, s) => { const sp = document.createElement("span"); sp.style.fontSize = s + "px"; sp.textContent = t; sp.style.display = "inline-block"; caja.appendChild(sp); const w = sp.getBoundingClientRect().width; sp.remove(); return w; };
      let lineas, tam;
      for (tam = 70; tam >= 52; tam -= 2) if (mide(nombre, tam) <= max) { lineas = [nombre]; break; }
      if (!lineas) {
        const i = nombre.lastIndexOf(" " + apellido);
        const partes = i > 0 ? [nombre.slice(0, i), nombre.slice(i + 1)] : [nombre.slice(0, nombre.lastIndexOf(" ")), nombre.slice(nombre.lastIndexOf(" ") + 1)];
        for (tam = 64; tam >= 40; tam -= 2) if (partes.every((t) => mide(t, tam) <= max)) break;
        lineas = partes;
      }
      caja.style.fontSize = tam + "px";
      caja.innerHTML = lineas.map((l) => `<span>${l}</span>`).join("");
      const desborda = [...document.querySelectorAll(".liston > *:not(.filete)")].some((e) => { const q = e.getBoundingClientRect(); return q.left < 0 || q.right > innerWidth + 0.5; });
      const ident = document.querySelector(".ident").getBoundingClientRect(), nom = caja.getBoundingClientRect(), den = document.querySelector(".denom").getBoundingClientRect(), pro = document.querySelector(".promo").getBoundingClientRect();
      return { lineas, tam, desborda, holgura: Math.round(ident.top - nom.bottom), sobre: Math.round(den.top - pro.bottom) };
    }, x);
    if (r.desborda || r.holgura < 40 || r.sobre < 40) throw new Error(`Composición inválida para ${x.nombre}: ${JSON.stringify(r)}`);
    await p.screenshot({ path: path.join(OUT, x.id + ".png"), omitBackground: true, clip: { x: 0, y: 0, width: W, height: H } });
    informe.push({ id: x.id, nombre: x.nombre, denominacion: x.denominacion, ...r });
  }
  fs.writeFileSync(path.join(OUT, "informe.json"), JSON.stringify({ logo_departamento: LOGO_DEPTO, listones: informe }, null, 1));
  console.log(informe.map((i) => `${i.nombre} · ${i.denominacion} · ${i.lineas.length} línea(s) a ${i.tam}px · holgura ${i.holgura}px`).join("\n"));
  console.log("Logo del Departamento usado:", LOGO_DEPTO);
  await b.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
