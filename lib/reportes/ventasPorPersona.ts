// Ventas por mesero con desglose de objetivo (PLAN-4-CAPAS B6): % de cuentas
// con postre, % con café, ticket promedio. Extraído para no repetir el cruce
// comanda_items → carta_items.categoria entre Reportes → Ventas
// (useReporteVentas.ts) y Reportes → Personal (donde se fusiona con la vista
// de producción — misma persona, una fila).

import { slugify } from '@/lib/utils'

/** ¿La categoría de un ítem de carta corresponde a postre o café? Match por
 * slug (sin acentos/mayúsculas): "Postres" matchea postre, "Cafetería"/"Café"
 * matchean cafe. */
export function categoriaEs(categoria: string | null | undefined, tipo: 'postre' | 'cafe'): boolean {
  if (!categoria) return false
  const s = slugify(categoria)
  return s.includes(tipo)
}

export interface CuentaParaVenta { id: string; mozo_id: string | null; total: number }

export interface VentaPersonaStats {
  cantidad: number          // cuentas cerradas en el período
  ventas: number            // $ total
  ticket_promedio: number
  pct_postre: number        // % de cuentas con ≥1 ítem de categoría postre
  pct_cafe: number          // % de cuentas con ≥1 ítem de categoría café
}

/**
 * Agrega cuentas cerradas por mozo_id, cruzando contra las categorías de los
 * ítems vendidos en cada cuenta (`categoriasPorCuenta`: cuenta_id → lista de
 * `carta_items.categoria` de esa cuenta, sin normalizar — se normalizan acá).
 * Cuentas sin mozo asignado se agrupan bajo la key `'—'`.
 */
export function agregarVentasPorPersona(
  cuentas: CuentaParaVenta[],
  categoriasPorCuenta: Map<string, string[]>,
): Map<string, VentaPersonaStats> {
  const agg = new Map<string, { cantidad: number; ventas: number; conPostre: number; conCafe: number }>()

  for (const c of cuentas) {
    const k = c.mozo_id ?? '—'
    const g = agg.get(k) ?? { cantidad: 0, ventas: 0, conPostre: 0, conCafe: 0 }
    g.cantidad++
    g.ventas += c.total
    const cats = categoriasPorCuenta.get(c.id) ?? []
    if (cats.some(cat => categoriaEs(cat, 'postre'))) g.conPostre++
    if (cats.some(cat => categoriaEs(cat, 'cafe'))) g.conCafe++
    agg.set(k, g)
  }

  const result = new Map<string, VentaPersonaStats>()
  for (const [k, g] of agg) {
    result.set(k, {
      cantidad: g.cantidad,
      ventas: g.ventas,
      ticket_promedio: g.cantidad > 0 ? g.ventas / g.cantidad : 0,
      pct_postre: g.cantidad > 0 ? (g.conPostre / g.cantidad) * 100 : 0,
      pct_cafe: g.cantidad > 0 ? (g.conCafe / g.cantidad) * 100 : 0,
    })
  }
  return result
}

// ── Objetivos: puesto (base) + equipo_miembros (override por persona) ──────
// Mismo patrón que permisos_app/modulos_extra (lib/hooks/useEquipo.ts): la
// base vive en el puesto, la persona puede pisar claves puntuales.

export interface ObjetivosVenta {
  pct_comandas_con_postre?: number
  pct_comandas_con_cafe?: number
  ticket_promedio?: number
}

export function getObjetivosEfectivos(
  puestoObjetivos: ObjetivosVenta | null | undefined,
  miembroObjetivos: ObjetivosVenta | null | undefined,
): ObjetivosVenta {
  return { ...(puestoObjetivos ?? {}), ...(miembroObjetivos ?? {}) }
}
