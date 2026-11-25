/* Capa de datos: fuente única (datos/evento.json) + Supabase vía RPC (sin bibliotecas externas). */
(function () {
  "use strict";
  const C = window.CONFIG || {};
  const configurado = !!(C.supabaseUrl && C.supabaseAnonKey);
  const CLAVE_TOKENS = "invitacion-ula-2026:tokens";

  async function rpc(nombre, args, intentos = 2) {
    if (!configurado) { const e = new Error("sin_backend"); e.codigo = "sin_backend"; throw e; }
    let ultimo;
    for (let i = 0; i <= intentos; i++) {
      try {
        const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 12000);
        const r = await fetch(`${C.supabaseUrl}/rest/v1/rpc/${nombre}`, {
          method: "POST", signal: ctrl.signal,
          headers: { "Content-Type": "application/json", apikey: C.supabaseAnonKey, Authorization: `Bearer ${C.supabaseAnonKey}` },
          body: JSON.stringify(args || {}),
        });
        clearTimeout(t);
        const texto = await r.text();
        const cuerpo = texto ? JSON.parse(texto) : null;
        if (!r.ok) { const e = new Error((cuerpo && cuerpo.message) || "error_servidor"); e.codigo = (cuerpo && cuerpo.message) || "error_servidor"; e.definitivo = r.status < 500; throw e; }
        return cuerpo;
      } catch (e) {
        ultimo = e; if (e.definitivo) throw e;
        if (i < intentos) await new Promise((res) => setTimeout(res, 800 * (i + 1)));
      }
    }
    const e = new Error("sin_conexion"); e.codigo = "sin_conexion"; e.causa = ultimo; throw e;
  }

  const leerTokens = () => { try { return JSON.parse(localStorage.getItem(CLAVE_TOKENS) || "{}"); } catch (e) { return {}; } };
  const guardarTokens = (m) => { try { localStorage.setItem(CLAVE_TOKENS, JSON.stringify(m)); } catch (e) {} };

  window.API = {
    configurado,
    async evento() { const r = await fetch("datos/evento.json", { cache: "no-cache" }); return r.json(); },
    config: () => rpc("invitacion_config", {}, 1),
    miInvitacion: (token) => rpc("mi_invitacion", { p_token: token }),
    guardar: (p) => rpc("guardar_confirmacion", { p_token: p.token || null, p_categoria: p.categoria, p_padrino_id: p.padrinoId || null, p_nombre: p.nombre, p_respuestas: p.respuestas, p_trampa: p.trampa || null, p_nota: p.nota || null }),
    // Un token por identidad en este dispositivo (permite modificar sin duplicar)
    tokenDe: (clave) => leerTokens()[clave] || null,
    recordarToken(clave, token) { const m = leerTokens(); m[clave] = token; guardarTokens(m); },
  };
})();
