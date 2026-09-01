/**
 * Quien puede ver `/admin` y `/api/admin/*` — dashboard de control del
 * ecosistema (PENDIENTES.md § Dashboard de control del ecosistema).
 *
 * Hardcodeado a propósito: es una lista de 1-2 personas (los fundadores),
 * no un permiso de producto. No vive en `puestos`/`rol_permisos` porque esas
 * tablas son por-restaurante y esto lee A TRAVÉS de todos los restaurantes con
 * el admin client — un allow-list de producto (aunque sea `USING(true)`
 * filtrado en el cliente) sería el mismo error que ya se pagó con
 * `user_restaurantes` (ver commit `44bd500`): la puerta tiene que estar del
 * lado del servidor, antes de tocar el admin client, no después.
 */
const ADMIN_EMAILS = [
  'facuastrada15@gmail.com',
  'facu@broscomedor.com', // cuenta de Facundo dentro del tenant Bros (chef) — 01/09
]

export function esAdminKOS(email: string | null | undefined): boolean {
  if (!email) return false
  return ADMIN_EMAILS.includes(email.toLowerCase())
}
