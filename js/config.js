/* Configuración pública de conexión a Supabase.
   La «anon key» (o «publishable key») de Supabase está diseñada para usarse en el navegador:
   la seguridad la imponen las políticas RLS y las funciones de supabase/esquema.sql.
   NUNCA coloque aquí la «service_role key».
   Mientras estos valores estén vacíos, la invitación funciona completa pero la confirmación
   en línea muestra un aviso de «no disponible» (no simula guardados). */
window.CONFIG = {
  supabaseUrl: "",        // p. ej. "https://abcdefghijkl.supabase.co"
  supabaseAnonKey: "",    // clave pública anon / publishable
};
