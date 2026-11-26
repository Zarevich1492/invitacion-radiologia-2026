/* Cálculo de indicadores del panel (función pura, probada con Node en pruebas/metricas.test.js).
   Reglas:
   · Cada padrino activo cuenta como UNA persona. Su respuesta efectiva es la del registro oficial
     (enlace individual) si existe; si no, la más reciente enviada desde el enlace general.
   · Cada registro de R1, R2 u otro invitado es una persona.
   · Una actividad no habilitada para la persona es «no_aplica» (no cuenta como pendiente).
   · Los graduandos (7) no son invitados: solo se suman al «total previsto» de cada actividad.  */
(function (raiz) {
  "use strict";
  const respuestasDe = (reg) => Object.fromEntries((reg && reg.confirmaciones || []).map((c) => [c.actividad, c.estado]));
  const tieneRespuesta = (reg) => !!(reg && reg.confirmaciones && reg.confirmaciones.length);

  // Habilitación por categoría y actividad (tabla «habilitaciones»). Sin regla: clase y caravana sí; la recepción NO se asume.
  function reglaDe(hab, categoria, codigo) {
    const r = (hab || []).find((h) => h.categoria === categoria && h.actividad === codigo);
    return r ? !!r.habilitada : codigo !== "recepcion";
  }
  // Prioridad: autorización individual (centro de invitaciones) > excepción de recepción > regla de la categoría
  function habilitadas(actividades, hab, categoria, override, aut) {
    return actividades.filter((a) => {
      const x = (aut || []).find((y) => y.actividad === a.codigo);
      if (x) return !!x.habilitada;
      return (a.codigo === "recepcion" && override !== null && override !== undefined) ? !!override : reglaDe(hab, categoria, a.codigo);
    }).map((a) => a.codigo);
  }
  const normal = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[.,]/g, "").replace(/\s+/g, " ").trim();

  function personas(d) {
    const hab = d.habilitaciones || [];
    const out = [];
    for (const p of d.padrinos.filter((x) => x.activo !== false)) {
      const regs = d.invitados.filter((i) => i.padrino_id === p.id);
      const oficial = regs.find((i) => i.origen === "oficial") || null;
      const enviados = regs.filter((i) => i.origen !== "oficial" && tieneRespuesta(i)).sort((a, b) => String(b.actualizado).localeCompare(String(a.actualizado)));
      const efectivo = tieneRespuesta(oficial) ? oficial : enviados[0] || oficial;
      const override = oficial ? oficial.recepcion_override : null;
      out.push({
        clave: "padrino:" + p.id, tipo: "padrino", categoria: "padrino", nombre: p.nombre, registro: efectivo, oficial,
        habilitadas: habilitadas(d.actividades, hab, "padrino", override, oficial && oficial.autorizaciones), override,
        respuestas: respuestasDe(efectivo), verificado: !!(efectivo && efectivo.verificado),
        envios: regs.filter(tieneRespuesta).length, nota: regs.map((r) => r.nota_omision).filter(Boolean).join(" · "),
      });
    }
    for (const i of d.invitados.filter((x) => !x.padrino_id && x.categoria !== "padrino")) {
      out.push({
        clave: "inv:" + i.id, tipo: "invitado", categoria: i.categoria, nombre: i.nombre, registro: i, oficial: null,
        habilitadas: habilitadas(d.actividades, hab, i.categoria, i.recepcion_override, i.autorizaciones), override: i.recepcion_override,
        respuestas: respuestasDe(i), verificado: !!i.verificado, envios: tieneRespuesta(i) ? 1 : 0, nota: i.nota_omision || "",
      });
    }
    for (const x of out) {
      x.estados = Object.fromEntries(d.actividades.map((a) => [a.codigo, !x.habilitadas.includes(a.codigo) ? "no_aplica" : x.respuestas[a.codigo] || "sin_responder"]));
      x.respondio = Object.keys(x.respuestas).length > 0;
      x.asistira = Object.values(x.estados).filter((e) => e === "asistira").length;
    }
    const vistos = {};
    for (const x of out.filter((y) => y.tipo === "invitado")) (vistos[x.categoria + "|" + normal(x.nombre)] = vistos[x.categoria + "|" + normal(x.nombre)] || []).push(x);
    for (const grupo of Object.values(vistos)) if (grupo.length > 1) grupo.forEach((x) => { x.duplicado = true; });
    return out;
  }

  function calcular(d, graduandos) {
    const P = personas(d);
    const pad = P.filter((x) => x.tipo === "padrino");
    const general = {
      padrinos: pad.length,
      padrinosRespondieron: pad.filter((x) => x.respondio).length,
      padrinosPendientes: pad.filter((x) => !x.respondio).length,
      r1: P.filter((x) => x.categoria === "r1").length,
      r2: P.filter((x) => x.categoria === "r2").length,
      docentes: P.filter((x) => x.categoria === "docente").length,
      egresados: P.filter((x) => x.categoria === "egresado").length,
      posiblesDuplicados: P.filter((x) => x.duplicado).length,
      otros: P.filter((x) => x.categoria === "otro").length,
      invitadosUnicos: P.length,
      respuestas: P.filter((x) => x.respondio).length,
      graduandos,
      asistiranTres: P.filter((x) => x.asistira === 3).length,
      asistiranDos: P.filter((x) => x.asistira === 2).length,
      asistiranUna: P.filter((x) => x.asistira === 1).length,
    };
    const porActividad = d.actividades.map((a) => {
      const hab = P.filter((x) => x.estados[a.codigo] !== "no_aplica");
      const c = (e) => hab.filter((x) => x.estados[a.codigo] === e).length;
      const confirmados = c("asistira");
      return { codigo: a.codigo, titulo: a.titulo, habilitados: hab.length, confirmados, noAsistiran: c("no_asistira"), porConfirmar: c("por_confirmar"), sinResponder: c("sin_responder"), totalPrevisto: confirmados + graduandos };
    });
    return { personas: P, general, porActividad };
  }

  const api = { personas, calcular, habilitadas };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else raiz.Metricas = api;
})(typeof window !== "undefined" ? window : globalThis);
