// Guardado del Mise a prueba de wifi.
//
// El tilde se pinta en el mismo frame del tap y la escritura viaja después. Si
// viajaba mal (celular sin señal en la cámara, wifi que se cae entre la cocina
// y el salón) el cambio se perdía en silencio: el cocinero veía verde, la base
// no tenía nada, y el que entraba al turno siguiente recibía otra cosa.
//
// Ahora cada cambio entra a una bandeja (localStorage: sobrevive a cerrar la
// app) y se reintenta solo hasta que sube. Los cambios sobre el mismo registro
// se fusionan — lo último que el cocinero hizo gana, y lo que falló no se pierde
// aunque llegue otro toque encima.
//
// Sin React ni Supabase: recibe la función que escribe. La usan useChecklist y
// syncMise (el tilde que viene de Producción).
import type { SupabaseClient } from '@supabase/supabase-js'
import { encolarEscritura } from './colaEscrituras'

export interface DatosRegistro {
  completado?: boolean
  cantidad_actual?: number | null
  usuario_id?: string | null
}

export interface FilaRegistro extends DatosRegistro {
  checklist_item_id: string
  fecha: string
  turno: string
}

export interface ErrorEscritura { message: string; code?: string; status?: number }
export type Escritor = (fila: FilaRegistro) => Promise<{ error: ErrorEscritura | null }>

interface Pendiente { itemId: string; fecha: string; turno: string; datos: DatosRegistro; version: number }

const STORAGE_KEY = 'kos_mise_bandeja_v1'
const pendientes = new Map<string, Pendiente>()
const oyentes = new Set<() => void>()
let cargado = false
let version = 0

const clave = (itemId: string, fecha: string, turno: string) => `${itemId}|${fecha}|${turno}`

function cargar() {
  if (cargado) return
  cargado = true
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
    if (!raw) return
    for (const p of JSON.parse(raw) as Pendiente[]) pendientes.set(clave(p.itemId, p.fecha, p.turno), { ...p, version: ++version })
  } catch { /* storage bloqueado o roto: arranca vacía */ }
}

function persistir() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...pendientes.values()])) } catch { /* sin storage: vive en memoria */ }
  oyentes.forEach(cb => cb())
}

/** Errores de conexión o del servidor se reintentan; el resto (permisos, datos inválidos) no se arregla solo. */
export function esErrorTransitorio(e: ErrorEscritura): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  if (e.status != null && (e.status === 0 || e.status === 408 || e.status === 429 || e.status >= 500)) return true
  return /fetch|network|load failed|timeout|timed out|connection|offline/i.test(e.message)
}

/** Cuántos cambios esperan subir. Para el indicador del header. */
export function cantidadPendientes(): number { cargar(); return pendientes.size }

export function suscribirPendientes(cb: () => void): () => void {
  oyentes.add(cb)
  return () => { oyentes.delete(cb) }
}

function vaciarUno(k: string, escribir: Escritor): Promise<'ok' | 'pendiente'> {
  return encolarEscritura(k, async () => {
    const p = pendientes.get(k)
    if (!p) return 'ok' as const
    const enviado = p.version
    let error: ErrorEscritura | null
    try {
      ;({ error } = await escribir({ checklist_item_id: p.itemId, fecha: p.fecha, turno: p.turno, ...p.datos }))
    } catch (e) {
      error = { message: e instanceof Error ? e.message : 'fetch failed' }
    }
    if (!error) {
      // Si mientras viajaba llegó otro cambio sobre el mismo registro, la
      // entrada ya tiene otra versión y su propio vaciado en cola: no se borra.
      if (pendientes.get(k)?.version === enviado) { pendientes.delete(k); persistir() }
      return 'ok' as const
    }
    if (esErrorTransitorio(error)) return 'pendiente' as const
    pendientes.delete(k)
    persistir()
    throw new Error(error.message)
  })
}

/**
 * Guarda un cambio. Resuelve 'ok' cuando ya está en la base y 'pendiente' si no
 * hubo conexión (queda en la bandeja y se reintenta). Rechaza solo ante un error
 * que reintentar no arregla — ahí el llamador vuelve a leer del servidor.
 */
export function guardarRegistro(
  itemId: string, fecha: string, turno: string, datos: DatosRegistro, escribir: Escritor,
): Promise<'ok' | 'pendiente'> {
  cargar()
  const k = clave(itemId, fecha, turno)
  const previo = pendientes.get(k)
  pendientes.set(k, { itemId, fecha, turno, datos: { ...previo?.datos, ...datos }, version: ++version })
  persistir()
  return vaciarUno(k, escribir)
}

/** Reintenta todo lo pendiente. Devuelve cuántos cambios siguen sin subir. */
export async function vaciarPendientes(escribir: Escritor): Promise<number> {
  cargar()
  await Promise.all([...pendientes.keys()].map(k => vaciarUno(k, escribir).catch(() => 'pendiente')))
  return pendientes.size
}

/** Solo para tests. */
export function _resetBandeja() {
  pendientes.clear(); cargado = true; version = 0
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
}

/** El escritor real: upsert sobre checklist_registros por (item, fecha, turno). */
export function escritorRegistros(supabase: SupabaseClient): Escritor {
  return async fila => {
    const { error, status } = await supabase.from('checklist_registros').upsert(fila, { onConflict: 'checklist_item_id,fecha,turno' })
    return { error: error ? { message: error.message, code: error.code, status } : null }
  }
}
