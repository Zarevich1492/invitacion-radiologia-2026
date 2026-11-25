/* Pruebas unitarias de los indicadores del panel. Uso: node pruebas/metricas.test.js */
const assert = require("assert");
const M = require("../js/metricas.js");
const E = require("../datos/evento.json");

const actividades = E.actividades.map((a) => ({ codigo: a.codigo, titulo: a.titulo }));
const categorias = [
  { codigo: "padrino", recepcion_habilitada: true }, { codigo: "r1", recepcion_habilitada: false },
  { codigo: "r2", recepcion_habilitada: true }, { codigo: "otro", recepcion_habilitada: false },
];
const padrinos = E.padrinos.map((p) => ({ ...p, activo: true }));
const conf = (o) => Object.entries(o).map(([actividad, estado]) => ({ actividad, estado }));
const invitados = [
  ...padrinos.map((p) => ({ id: "of-" + p.id, padrino_id: p.id, categoria: "padrino", origen: "oficial", nombre: p.nombre, confirmaciones: [], recepcion_override: null, actualizado: "2026-11-20" })),
];
// Falcón responde por enlace individual (verificado) y además por enlace general (no debe duplicarse)
Object.assign(invitados.find((i) => i.padrino_id === "falcon-analy"), { verificado: true, confirmaciones: conf({ clase: "asistira", caravana: "asistira", recepcion: "asistira" }) });
invitados.push({ id: "g1", padrino_id: "falcon-analy", categoria: "padrino", origen: "enlace_general", nombre: "Dra. Analy Falcón", confirmaciones: conf({ clase: "no_asistira" }), actualizado: "2026-11-26" });
// Viña: sin recepción por excepción; responde por enlace general
Object.assign(invitados.find((i) => i.padrino_id === "vina-daniel"), { recepcion_override: false });
invitados.push({ id: "g2", padrino_id: "vina-daniel", categoria: "padrino", origen: "enlace_general", nombre: "Dr. Daniel Viña", confirmaciones: conf({ clase: "asistira", caravana: "por_confirmar" }), actualizado: "2026-11-26" });
// Residentes y otros
invitados.push({ id: "r1a", categoria: "r1", origen: "enlace_general", nombre: "Ana Pérez", confirmaciones: conf({ clase: "asistira", caravana: "asistira" }), recepcion_override: null });
invitados.push({ id: "r2a", categoria: "r2", origen: "enlace_general", nombre: "Luis Núñez", confirmaciones: conf({ clase: "asistira" }), recepcion_override: null });
invitados.push({ id: "o1", categoria: "otro", origen: "enlace_general", nombre: "Carmen Rivas", confirmaciones: conf({ caravana: "no_asistira" }), recepcion_override: true });

const r = M.calcular({ actividades, categorias, padrinos, invitados }, 7);
const g = r.general;
assert.strictEqual(g.padrinos, 10, "10 padrinos");
assert.strictEqual(g.padrinosRespondieron, 2, "2 padrinos respondieron (Falcón cuenta una sola vez)");
assert.strictEqual(g.padrinosPendientes, 8);
assert.deepStrictEqual([g.r1, g.r2, g.otros], [1, 1, 1]);
assert.strictEqual(g.invitadosUnicos, 13, "10 padrinos + 3 registros");
assert.strictEqual(g.respuestas, 5);
const falcon = r.personas.find((p) => p.clave === "padrino:falcon-analy");
assert.strictEqual(falcon.estados.clase, "asistira", "prevalece la respuesta verificada del enlace individual");
assert.strictEqual(falcon.envios, 2);
const vina = r.personas.find((p) => p.clave === "padrino:vina-daniel");
assert.strictEqual(vina.estados.recepcion, "no_aplica", "excepción individual");
const clase = r.porActividad.find((a) => a.codigo === "clase");
assert.deepStrictEqual([clase.habilitados, clase.confirmados, clase.noAsistiran, clase.porConfirmar, clase.sinResponder, clase.totalPrevisto], [13, 4, 0, 0, 9, 11]);
const rec = r.porActividad.find((a) => a.codigo === "recepcion");
// Recepción: 9 padrinos (sin Viña) + R2 (regla) + otro con excepción = 11 habilitados; R1 no aplica
assert.strictEqual(rec.habilitados, 11);
assert.strictEqual(rec.confirmados, 1);
assert.strictEqual(rec.totalPrevisto, 8, "1 confirmado + 7 graduandos");
assert.deepStrictEqual([g.asistiranTres, g.asistiranDos, g.asistiranUna], [1, 1, 2]);
console.log("✔ 17 comprobaciones de indicadores superadas");
