/* Pase de invitado especial: se dibuja en el navegador (el nombre no sale del dispositivo).
   Expone window.Pase = { dibujar, aBlob, pdfDesdeCanvas, guardar }. */
(function () {
  "use strict";
  const W = 1440, H = 2560;
  const C = { fondo: "#e9dac2", crema: "#f5e7d3", tinta: "#231b18", suave: "#6a584b", rojo: "#b8231f", linea: "rgba(35,27,24,.22)" };
  const DISPLAY = '"Bodoni Moda", "Bodoni 72", Didot, Georgia, serif';
  const TEXTO = '"EB Garamond", Garamond, Georgia, serif';
  const RECURSOS = {
    promo: "assets/logos/promocion-xxiv.jpg",
    ula: "assets/logos/ula.jpg",
    depto: "assets/logos/departamento-radiologia.jpg",
    banda: "assets/img/banda-merida-1440.jpg",
  };
  let cache = null;

  function cargarImagen(src) {
    return new Promise((ok, mal) => {
      const i = new Image();
      i.decoding = "async";
      i.onload = () => ok(i);
      i.onerror = () => mal(new Error("No se pudo cargar " + src));
      i.src = src;
    });
  }

  async function recursos() {
    if (cache) return cache;
    const fuentes = [
      `700 100px "Bodoni Moda"`, `500 100px "Bodoni Moda"`, `italic 500 100px "Bodoni Moda"`,
      `400 40px "EB Garamond"`, `600 40px "EB Garamond"`,
    ];
    await Promise.all(fuentes.map((f) => (document.fonts ? document.fonts.load(f, "Áñ") : null)).filter(Boolean)).catch(() => {});
    const entradas = await Promise.all(Object.entries(RECURSOS).map(async ([k, v]) => [k, await cargarImagen(v)]));
    cache = Object.fromEntries(entradas);
    return cache;
  }

  function rrect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }

  function texto(g, t, x, y, fuente, color, alinear = "center", espaciado = 0) {
    g.font = fuente; g.fillStyle = color; g.textAlign = alinear; g.textBaseline = "alphabetic";
    if ("letterSpacing" in g) { g.letterSpacing = espaciado + "px"; g.fillText(t, x, y); g.letterSpacing = "0px"; return; }
    if (!espaciado) { g.fillText(t, x, y); return; }
    // Respaldo para navegadores sin letterSpacing en canvas
    const ancho = [...t].reduce((a, ch) => a + g.measureText(ch).width + espaciado, -espaciado);
    let cx = alinear === "center" ? x - ancho / 2 : alinear === "right" ? x - ancho : x;
    g.textAlign = "left";
    for (const ch of t) { g.fillText(ch, cx, y); cx += g.measureText(ch).width + espaciado; }
  }

  // Bodoni Moda ajusta sus trazos finos al tamaño (eje opsz). Para que coincida con las tarjetas
  // (opsz 11, trazos firmes) se dibuja a 11 px y se escala, en lugar de dibujar a tamaño grande.
  function display(g, t, x, y, peso, tam, color, alinear = "center", espaciado = 0, italica = false) {
    const k = tam / 11;
    g.save(); g.translate(x, y); g.scale(k, k);
    texto(g, t, 0, 0, `${italica ? "italic " : ""}${peso} 11px ${DISPLAY}`, color, alinear, espaciado / k);
    g.restore();
  }
  function anchoDisplay(g, t, peso, tam) { g.font = `${peso} 11px ${DISPLAY}`; return g.measureText(t).width * tam / 11; }

  // Ajusta el nombre a un máximo de 2 líneas reduciendo el tamaño si hace falta.
  function partirNombre(g, nombre, anchoMax) {
    for (let tam = 104; tam >= 52; tam -= 4) {
      if (anchoDisplay(g, nombre, 700, tam) <= anchoMax) return { tam, lineas: [nombre] };
      const palabras = nombre.split(" ");
      if (palabras.length > 1) {
        let mejor = null;
        for (let i = 1; i < palabras.length; i++) {
          const a = palabras.slice(0, i).join(" "), b = palabras.slice(i).join(" ");
          const m = Math.max(anchoDisplay(g, a, 700, tam), anchoDisplay(g, b, 700, tam));
          if (m <= anchoMax && (!mejor || m < mejor.m)) mejor = { m, lineas: [a, b] };
        }
        if (mejor && tam <= 88) return { tam, lineas: mejor.lineas };
      }
    }
    // Último recurso: cortar por caracteres
    g.font = `700 56px ${DISPLAY}`;
    const lineas = []; let actual = "";
    for (const ch of nombre) {
      if (g.measureText(actual + ch).width > anchoMax && actual) { lineas.push(actual); actual = ch; } else actual += ch;
    }
    if (actual) lineas.push(actual);
    return { tam: 56, lineas: lineas.slice(0, 2) };
  }

  /* datos = { nombre, categoria: "PADRINO O MADRINA DE PROMOCIÓN", actividades: [ {hora_texto, titulo, lineas_pase[], social} ], fecha_corta, ciudad } */
  async function dibujar(datos) {
    const r = await recursos();
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const g = c.getContext("2d");
    const X0 = 60, Y0 = 60, TW = W - 120, TH = H - 120, CX = W / 2;

    g.fillStyle = C.fondo; g.fillRect(0, 0, W, H);
    g.save();
    g.shadowColor = "rgba(60,35,20,.28)"; g.shadowBlur = 40; g.shadowOffsetY = 14;
    rrect(g, X0, Y0, TW, TH, 44); g.fillStyle = C.crema; g.fill();
    g.restore();
    g.save(); rrect(g, X0, Y0, TW, TH, 44); g.clip();

    // Encabezado
    g.fillStyle = C.rojo; g.fillRect(X0, Y0, TW, 14);
    texto(g, "PASE DE INVITADO ESPECIAL", CX, 168, `600 40px ${TEXTO}`, C.rojo, "center", 10);
    g.strokeStyle = C.rojo; g.lineWidth = 2;
    g.beginPath(); g.moveTo(CX - 520, 154); g.lineTo(CX - 470, 154); g.moveTo(CX + 470, 154); g.lineTo(CX + 520, 154); g.stroke();

    // Maquetación dinámica: el espacio del logotipo se ajusta para que nada invada la ilustración inferior.
    const bh = Math.round(TW * r.banda.naturalHeight / r.banda.naturalWidth);
    const by = Y0 + TH - bh, limite = by + Math.round(bh * 0.33);
    const altoPrograma = datos.actividades.reduce((t, a) => t + 70 + a.lineas_pase.length * 44 + 46, 0);
    const n0 = (datos.nombre || "").trim() || "Nuestros invitados";
    const p = partirNombre(g, n0, TW - 160);
    const paso = Math.round(p.tam * 1.08), extraNombre = (p.lineas.length - 1) * paso;
    const fijo = 62 + 120 + extraNombre + 140 + 160 + 62 + 62 + 100 + altoPrograma + 24 + 52 + 36 + 96;
    const lh = Math.max(380, Math.min(620, limite - 200 - fijo));

    // Logotipo de la promoción (protagonista)
    const lw = Math.round(lh * r.promo.naturalWidth / r.promo.naturalHeight);
    g.drawImage(r.promo, CX - lw / 2, 200, lw, lh);

    // Nombre y categoría
    let y = 200 + lh + 62;
    display(g, "Invitación para", CX, y, 500, 44, C.suave, "center", 0, true);
    y += 120;
    p.lineas.forEach((l, i) => display(g, l, CX, y + i * paso, 700, p.tam, C.tinta));
    y += extraNombre + 140;
    texto(g, datos.categoria || "INVITADO ESPECIAL", CX, y - 58, `600 36px ${TEXTO}`, C.rojo, "center", 7);

    // Fecha destacada
    y += 160 - 60;
    display(g, datos.fecha_corta || "28 NOV 2026", CX, y, 700, 128, C.tinta, "center", 2);
    y += 62;
    texto(g, "SÁBADO · " + (datos.ciudad || "MÉRIDA, VENEZUELA").toUpperCase(), CX, y, `600 32px ${TEXTO}`, C.suave, "center", 8);

    // Perforación tipo ticket
    const yP = y + 62;
    g.setLineDash([18, 14]); g.strokeStyle = C.linea; g.lineWidth = 3;
    g.beginPath(); g.moveTo(X0 + 60, yP); g.lineTo(X0 + TW - 60, yP); g.stroke(); g.setLineDash([]);
    g.restore();
    g.fillStyle = C.fondo;
    g.beginPath(); g.arc(X0, yP, 34, 0, Math.PI * 2); g.arc(X0 + TW, yP, 34, 0, Math.PI * 2); g.fill();
    g.save(); rrect(g, X0, Y0, TW, TH, 44); g.clip();

    // Programa (solo actividades habilitadas para esta persona)
    const colH = X0 + 100, colT = X0 + 450;
    y = yP + 100;
    for (const a of datos.actividades) {
      display(g, a.hora_texto, colH, y, 700, 60, C.rojo, "left");
      texto(g, a.titulo, colT, y - 6, `600 ${a.titulo.length > 28 ? 44 : 50}px ${TEXTO}`, C.tinta, "left");
      a.lineas_pase.forEach((d, i) => texto(g, d, colT, y + 48 + i * 44, `400 37px ${TEXTO}`, C.suave, "left"));
      if (a.social) { g.fillStyle = C.rojo; g.fillRect(colH, y + 26, 60, 4); }
      y += 70 + a.lineas_pase.length * 44 + 46;
    }

    // Identificación
    const yId = y + 24;
    display(g, "XXIV Promoción de Radiólogos", CX, yId, 700, 48, C.tinta);
    texto(g, "Universidad de Los Andes · Mérida, Venezuela", CX, yId + 52, `400 38px ${TEXTO}`, C.suave);

    // Banda de Mérida (ilustración original) con fundido
    g.drawImage(r.banda, X0, by, TW, bh);
    const fade = g.createLinearGradient(0, by, 0, by + bh * 0.6);
    fade.addColorStop(0, C.crema); fade.addColorStop(1, "rgba(245,231,211,0)");
    g.fillStyle = fade; g.fillRect(X0, by - 2, TW, bh * 0.6 + 2);

    // Logotipos institucionales (ULA + logotipo oficial vertical del Departamento)
    const uh = 90, dh = 128;
    const uw = Math.round(uh * r.ula.naturalWidth / r.ula.naturalHeight);
    const dw = Math.round(dh * r.depto.naturalWidth / r.depto.naturalHeight);
    const gap = 48, total = uw + gap * 2 + dw, lx = CX - total / 2, lyMid = yId + 84 + dh / 2;
    g.drawImage(r.ula, lx, Math.round(lyMid - uh / 2), uw, uh);
    g.fillStyle = C.tinta; g.fillRect(lx + uw + gap - 1, Math.round(lyMid - 48), 2, 96);
    g.drawImage(r.depto, lx + uw + gap * 2, Math.round(lyMid - dh / 2), dw, dh);
    g.restore();
    return c;
  }

  function aBlob(canvas, tipo = "image/png", calidad) {
    return new Promise((ok, mal) => canvas.toBlob((b) => (b ? ok(b) : mal(new Error("No se pudo generar la imagen"))), tipo, calidad));
  }

  function escalar(canvas, ancho) {
    const c = document.createElement("canvas");
    c.width = ancho; c.height = Math.round(canvas.height * ancho / canvas.width);
    const g = c.getContext("2d"); g.imageSmoothingQuality = "high";
    g.drawImage(canvas, 0, 0, c.width, c.height);
    return c;
  }

  // PDF mínimo de una página con la imagen JPEG del pase (sin bibliotecas externas).
  async function pdfDesdeCanvas(canvas) {
    const jpg = new Uint8Array(await (await aBlob(canvas, "image/jpeg", 0.93)).arrayBuffer());
    const wPt = 360, hPt = Math.round(360 * canvas.height / canvas.width);
    const enc = new TextEncoder();
    const partes = [], offsets = [];
    let largo = 0;
    const push = (x) => { const b = typeof x === "string" ? enc.encode(x) : x; partes.push(b); largo += b.length; };
    const obj = (n, cuerpo) => { offsets[n] = largo; push(`${n} 0 obj\n`); cuerpo(); push("\nendobj\n"); };
    push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
    const contenido = `q ${wPt} 0 0 ${hPt} 0 0 cm /Im0 Do Q`;
    obj(1, () => push("<< /Type /Catalog /Pages 2 0 R >>"));
    obj(2, () => push("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"));
    obj(3, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${wPt} ${hPt}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>`));
    obj(4, () => push(`<< /Length ${contenido.length} >>\nstream\n${contenido}\nendstream`));
    obj(5, () => { push(`<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`); push(jpg); push("\nendstream"); });
    obj(6, () => push("<< /Title (Pase de invitado especial - XXIV Promocion de Radiologos ULA) /Producer (Invitacion ULA 2026) >>"));
    const xref = largo;
    let tabla = "xref\n0 7\n0000000000 65535 f \n";
    for (let i = 1; i <= 6; i++) tabla += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
    push(tabla + `trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return new Blob(partes, { type: "application/pdf" });
  }

  // Guarda un archivo: hoja de compartir en móviles (permite «Guardar imagen»), si no, descarga.
  async function guardar(blob, nombreArchivo) {
    const tactil = matchMedia("(pointer: coarse)").matches;
    if (tactil && navigator.canShare && typeof File === "function") {
      try {
        const f = new File([blob], nombreArchivo, { type: blob.type });
        if (navigator.canShare({ files: [f] })) {
          await navigator.share({ files: [f], title: "Pase de invitado especial" });
          return "compartido";
        }
      } catch (e) {
        if (e && e.name === "AbortError") return "cancelado";
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = nombreArchivo; a.rel = "noopener";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return "descargado";
  }

  window.Pase = { dibujar, aBlob, escalar, pdfDesdeCanvas, guardar, W, H };
})();
