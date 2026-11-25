/* Simulación ilustrativa (no fotográfica) de un listón sobre una bata médica blanca, A ESCALA:
   escena de 400 × 500 mm a 2,5 px/mm; el listón conserva sus 60 × 120 mm (150 × 300 px).
   Uso: node herramientas/simular_bata.js [URL_BASE]  → variantes/exploracion/bata-*.png */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const BASE = process.argv[2] || "http://127.0.0.1:8765/";
const OUT = path.join(__dirname, "..", "variantes", "exploracion");
const PXMM = 2.5, SW = 400 * PXMM, SH = 500 * PXMM, LW = 60 * PXMM, LH = 120 * PXMM;

const escena = (img) => `<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0}html,body{width:${SW}px;height:${SH}px;overflow:hidden}
.liston{position:absolute;left:${SW * 0.66 - LW / 2}px;top:${SH * 0.25}px;width:${LW}px;height:${LH}px;transform:rotate(-2.2deg);transform-origin:50% 2%;
  filter:drop-shadow(2px 6px 5px rgba(0,0,0,.28)) drop-shadow(0 1px 1px rgba(0,0,0,.25))}
.liston img{width:100%;height:100%;display:block}
.alfiler{position:absolute;left:${SW * 0.66 - 22}px;top:${SH * 0.25 - 6}px;width:44px;height:16px;transform:rotate(-2.2deg)}
</style></head><body>
<svg width="${SW}" height="${SH}" viewBox="0 0 ${SW} ${SH}" style="position:absolute;inset:0">
  <defs>
    <linearGradient id="pared" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#dde3e7"/><stop offset="1" stop-color="#c9d1d6"/></linearGradient>
    <linearGradient id="tela" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#e9ebec"/><stop offset=".18" stop-color="#fbfbfa"/><stop offset=".5" stop-color="#f4f4f2"/><stop offset=".82" stop-color="#fbfbfa"/><stop offset="1" stop-color="#e6e8e9"/></linearGradient>
    <linearGradient id="solapa" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e7e8e8"/></linearGradient>
  </defs>
  <rect width="${SW}" height="${SH}" fill="url(#pared)"/>
  <path d="M0 ${SH} L0 300 Q40 150 300 95 L410 60 L590 60 L700 95 Q960 150 ${SW} 300 L${SW} ${SH} Z" fill="url(#tela)"/>
  <path d="M410 60 L590 60 L500 470 Z" fill="#9fb9d1"/>
  <path d="M482 70 L518 70 L530 110 L512 470 L500 490 L488 470 L470 110 Z" fill="#26324a"/>
  <path d="M410 60 L500 470 L455 560 L330 210 L360 95 Z" fill="url(#solapa)" stroke="#d6d8d8" stroke-width="3"/>
  <path d="M590 60 L500 470 L545 560 L670 210 L640 95 Z" fill="url(#solapa)" stroke="#d6d8d8" stroke-width="3"/>
  <path d="M455 560 L500 470 L545 560 L520 ${SH} L480 ${SH} Z" fill="#f2f2f0"/>
  <line x1="500" y1="520" x2="500" y2="${SH}" stroke="#d9dbdb" stroke-width="3"/>
  ${[680, 900, 1120].map((y) => `<circle cx="512" cy="${y}" r="11" fill="#f7f7f5" stroke="#c9cbcb" stroke-width="2"/><circle cx="512" cy="${y}" r="2.5" fill="#b9bbbb"/>`).join("")}
  <rect x="${SW * 0.66 - 95}" y="${SH * 0.25 + LH + 60}" width="190" height="190" rx="4" fill="#f9f9f8" stroke="#d3d5d5" stroke-width="3"/>
  <line x1="${SW * 0.66 - 95}" y1="${SH * 0.25 + LH + 82}" x2="${SW * 0.66 + 95}" y2="${SH * 0.25 + LH + 82}" stroke="#dcdede" stroke-width="2" stroke-dasharray="6 5"/>
  <rect x="${SW * 0.66 + 40}" y="${SH * 0.25 + LH + 30}" width="12" height="90" rx="5" fill="#2b2f36"/>
  <path d="M120 ${SH} Q170 800 150 520" stroke="#e3e5e5" stroke-width="10" fill="none" opacity=".7"/>
  <path d="M880 ${SH} Q830 800 850 520" stroke="#e3e5e5" stroke-width="10" fill="none" opacity=".7"/>
</svg>
<div class="liston"><img src="${img}"></div>
<svg class="alfiler" viewBox="0 0 44 16"><rect x="2" y="5" width="40" height="6" rx="3" fill="#c9a861" stroke="#8a6f3a" stroke-width="1"/><circle cx="40" cy="8" r="5" fill="#d8bb78" stroke="#8a6f3a"/></svg>
</body></html>`;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: SW, height: SH } });
  await p.goto(BASE + "index.html");
  for (const d of ["A", "B", "C"]) for (const [fam, id] of [["especialista", "arrieta-jorge"], ["padrino", "falcon-analy"]]) {
    await p.setContent(escena(`${BASE}variantes/exploracion/${d}-${fam}-${id}.png`), { waitUntil: "networkidle" });
    await p.screenshot({ path: path.join(OUT, `bata-${d}-${fam}.png`) });
  }
  await b.close();
  console.log("Simulaciones generadas");
})().catch((e) => { console.error(e); process.exit(1); });
