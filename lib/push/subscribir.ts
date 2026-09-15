/**
 * `pushManager.subscribe()` pide la VAPID public key como `Uint8Array`, no
 * como el base64url que devuelve `web-push generate-vapid-keys` — conversión
 * estándar (padding a múltiplo de 4, alfabeto base64url → base64).
 */
export function urlBase64ToUint8Array(base64Url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4)
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}
