// Las claves y URLs de Supabase se leen SIEMPRE por acá.
//
// Motivo (01/09/2026): la env var `NEXT_PUBLIC_SUPABASE_ANON_KEY` en Vercel tenía
// un `\n` al final. REST lo toleraba, pero el realtime manda la clave en el query
// string del WebSocket — el `%0A` viajaba tal cual y el handshake devolvía 401.
// Resultado: pase, sync del mise entre dispositivos, bumps del KDS, Muro y la
// campanita estaban silenciosamente muertos en producción, sin un solo error
// visible del lado del servidor. Verificado: con `\n` da 401, con trim conecta.
//
// Un `.trim()` es más barato que volver a perder una tarde por un carácter
// invisible pegado en un dashboard.
//
// OJO con la firma: recibe el VALOR, no el nombre. Next.js inlinea las
// `NEXT_PUBLIC_*` del bundle del browser por reemplazo estático del texto
// `process.env.NEXT_PUBLIC_FOO`; un acceso dinámico (`process.env[nombre]`) no
// lo puede resolver y llegaría `undefined` al cliente. El nombre viaja aparte
// solo para que el mensaje de error diga cuál falta.
export function envSupabase(nombre: string, valor: string | undefined): string {
  if (!valor) throw new Error(`Falta la variable de entorno ${nombre}`)
  return valor.trim()
}
