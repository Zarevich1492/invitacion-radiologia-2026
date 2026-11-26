/* Ayudas comunes de prueba: apunta la página a la API local de prueba y entra con los códigos SOLO de prueba. */
const API_PRUEBA = process.env.API_PRUEBA || "http://127.0.0.1:8787";
async function usarApiLocal(ctxOrPage) {
  await ctxOrPage.route(/\/js\/config\.js(\?.*)?$/, (r) => r.fulfill({ contentType: "application/javascript", body: `window.CONFIG={supabaseUrl:${JSON.stringify(API_PRUEBA)},supabaseAnonKey:"sb_publishable_prueba_local"}` }));
}
async function entrarGrupo(p, grupo) {
  await p.click(`[data-acceso="${grupo}"]`);
  await p.waitForSelector("#campo-codigo", { state: "visible" });
  await p.fill("#campo-codigo", "codigo-e2e-" + grupo); await p.click("#btn-ingresar");
  await p.waitForSelector(grupo === "padrinos" ? "#lista-nombres [data-padrino]" : "#opciones-cat .opcion-cat", { state: "visible" });
}
module.exports = { API_PRUEBA, usarApiLocal, entrarGrupo };
