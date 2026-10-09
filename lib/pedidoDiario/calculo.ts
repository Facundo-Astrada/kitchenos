// Cálculo puro del pedido diario (PLAN-PEDIDO-DIARIO-2026-10.md).
// Sin React ni Supabase: la pantalla y los tests usan las mismas reglas.
//
// stock_minimo = lo que tiene que haber sí o sí; stock_maximo = techo, no se
// compra más que eso. Cada producto termina en 'hay' (suficiente) o 'pedir'.

export type EstadoLinea = 'pendiente' | 'hay' | 'pedir'

export interface LineaPedido {
  estado: EstadoLinea
  /** Cantidad a pedir (solo cuenta si estado === 'pedir'), en la unidad del producto. */
  cantidad: number
}

export interface UmbralesProducto {
  stock_minimo: number
  stock_maximo?: number | null
}

const redondear = (n: number) => Math.round(n * 100) / 100

/** Cuánto pedir para volver al objetivo (máximo si está cargado, si no el mínimo). */
export function cantidadParaReponer(hay: number, p: UmbralesProducto): number {
  const objetivo = p.stock_maximo != null && p.stock_maximo > 0 ? p.stock_maximo : p.stock_minimo
  return Math.max(0, redondear(objetivo - hay))
}

/** Con conteo: si lo que hay alcanza el mínimo es ✓; si no, se pide hasta el objetivo. */
export function proponerConConteo(hay: number, p: UmbralesProducto): LineaPedido {
  if (hay >= p.stock_minimo) return { estado: 'hay', cantidad: 0 }
  const cantidad = cantidadParaReponer(hay, p)
  if (cantidad <= 0) return { estado: 'hay', cantidad: 0 }
  return { estado: 'pedir', cantidad }
}

/**
 * Sin conteo: al tocar "Pedir" propone la última cantidad pedida de ese
 * producto; si nunca se pidió, el mínimo; y si tampoco hay mínimo, 1.
 */
export function cantidadInicialSinConteo(p: UmbralesProducto, ultimaPedida?: number | null): number {
  if (ultimaPedida != null && ultimaPedida > 0) return ultimaPedida
  if (p.stock_minimo > 0) return p.stock_minimo
  return 1
}

/** Paso del +/−: enteros para unidades, 0,5 para el resto (kg, l). */
export function pasoCantidad(unidad: string): number {
  const u = unidad.trim().toLowerCase()
  return u === 'u' || u === 'un' || u === 'unidad' || u === 'unidades' || u === 'atado' || u === 'atados' ? 1 : 0.5
}

export function ajustarCantidad(actual: number, delta: number): number {
  return Math.max(0, redondear(actual + delta))
}

export interface ResumenAvance {
  revisados: number
  total: number
  completo: boolean
}

export function avance(lineas: Record<string, LineaPedido>, ids: string[]): ResumenAvance {
  const revisados = ids.filter(id => {
    const l = lineas[id]
    return l && (l.estado === 'hay' || (l.estado === 'pedir' && l.cantidad > 0))
  }).length
  return { revisados, total: ids.length, completo: ids.length > 0 && revisados === ids.length }
}

export function totalEstimado(
  lineas: Record<string, LineaPedido>,
  precios: Record<string, number>,
): number {
  let total = 0
  for (const [id, l] of Object.entries(lineas)) {
    if (l.estado === 'pedir') total += l.cantidad * (precios[id] ?? 0)
  }
  return Math.round(total)
}

/** Minutos que faltan para la hora de corte ('HH:MM'), o null si no hay corte válido. */
export function minutosParaCorte(corte: string | null | undefined, ahora: Date): number | null {
  const m = corte?.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  const hh = Number(m[1]); const mm = Number(m[2])
  if (hh > 23 || mm > 59) return null
  return hh * 60 + mm - (ahora.getHours() * 60 + ahora.getMinutes())
}

export function textoCorte(corte: string | null | undefined, ahora: Date): string | null {
  const min = minutosParaCorte(corte, ahora)
  if (min == null) return null
  if (min <= 0) return `Cerró a las ${corte}`
  if (min < 60) return `Cierra ${corte} · faltan ${min} min`
  return `Cierra ${corte} · faltan ${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}`
}

/** Antigüedad del precio en días, o null si no se sabe. */
export function diasDesde(fechaISO: string | null | undefined, hoy: Date): number | null {
  if (!fechaISO) return null
  const f = new Date(fechaISO.slice(0, 10) + 'T12:00:00')
  if (Number.isNaN(f.getTime())) return null
  const h = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 12)
  return Math.max(0, Math.round((h.getTime() - f.getTime()) / 86_400_000))
}

export function textoAntiguedad(dias: number | null): string {
  if (dias == null) return 'sin fecha'
  if (dias === 0) return 'hoy'
  if (dias === 1) return 'ayer'
  return `hace ${dias} días`
}

export interface ItemMensaje { nombre: string; cantidad: number; unidad: string }

const fmtCant = (n: number) => String(Number.isInteger(n) ? n : Number(n.toFixed(2))).replace('.', ',')

/** Mensaje para el proveedor. Sin precios a propósito: el total es solo para quien pide. */
export function armarMensaje(opts: { proveedor: string; fecha: string; items: ItemMensaje[]; nota?: string }): string {
  let msg = `*Pedido - ${opts.proveedor}*\n${opts.fecha}\n\n`
  opts.items.forEach(it => { msg += `• ${it.nombre} — ${fmtCant(it.cantidad)} ${it.unidad}\n` })
  if (opts.nota?.trim()) msg += `\n${opts.nota.trim()}`
  return msg.trimEnd()
}

/** Teléfono → solo dígitos para wa.me (igual que el resto de la app); sin teléfono, null. */
export function telefonoWhatsApp(tel: string | null | undefined): string | null {
  const d = (tel ?? '').replace(/\D/g, '')
  return d.length >= 8 ? d : null
}
