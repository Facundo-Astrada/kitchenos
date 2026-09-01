/**
 * Planes comerciales — decision de negocio 006, en
 * `~/Desktop/START UP KOS/00-decisiones/DECISIONES.md`. Si este archivo y esa
 * decision difieren, manda la decision.
 *
 * SIN VALIDAR contra ningun cliente pago (decision 003: a Bros no se le cobra
 * todavia). Es la grilla hipotetica de precio y empaquetado, no la version
 * final — puede cambiar de nombre o de contenido antes de la primera factura.
 *
 * Este archivo es solo el mapeo de datos. El gating real (bloquear una
 * pantalla si el plan no la incluye) es un paso aparte, todavia no cableado
 * a ninguna pantalla — ver PENDIENTES.md § Roadmap: Planes y cobro.
 */

import type { ModuloId } from './constants'

export type Plan = 'base' | 'cocina' | 'control' | 'produccion'

export const PLAN_LABEL: Record<Plan, string> = {
  base: 'Base',
  cocina: 'Cocina',
  control: 'Control',
  produccion: 'Producción',
}

/** ARS/mes, decision 006. No incluye el fee de implementacion ($300.000, unico). */
export const PLAN_PRECIO_ARS: Record<Plan, number> = {
  base: 48_000,
  cocina: 75_000,
  control: 110_000,
  produccion: 26_000,
}

// Navegacion/config basica — no son una feature que se vende, van en todos los planes.
const MODULOS_UTILIDAD: ModuloId[] = ['home', 'configuracion']

// ─── Explicitos en la decision 006 ───────────────────────────────────────
const MODULOS_BASE: ModuloId[] = [
  'recetario', 'stock', 'pedidos', 'proveedores', 'carta', 'merma', 'facturas',
]
const MODULOS_COCINA_EXPLICITO: ModuloId[] = [
  'operaciones', 'checklist', 'pase', 'produccion', 'kds', 'muro', 'turnos',
]
const MODULOS_CONTROL_EXPLICITO: ModuloId[] = [
  'coach', 'haccp', 'presupuesto', 'reportes', 'bitacora',
]

// ─── Inferidos por analogia — la decision 006 no los nombra ──────────────
// Revisar cuando un segundo cliente fuerce a confirmar o corregir la ubicacion.
// Mismo criterio que las filas de "confianza media/baja" en PERFILES-DE-USO.md.
const MODULOS_COCINA_INFERIDO: ModuloId[] = [
  'tareas', 'calendario', 'equipo', 'ventas', 'espacios', 'salon',
]
const MODULOS_CONTROL_INFERIDO: ModuloId[] = [
  'organigrama', 'clientes', 'reservas',
]

/** Modulos incluidos por plan, acumulativo (Cocina = Base + lo suyo; Control = Cocina + lo suyo). */
export const PLAN_MODULOS: Record<Plan, ModuloId[]> = {
  base: [
    ...MODULOS_UTILIDAD,
    ...MODULOS_BASE,
  ],
  cocina: [
    ...MODULOS_UTILIDAD,
    ...MODULOS_BASE,
    ...MODULOS_COCINA_EXPLICITO,
    ...MODULOS_COCINA_INFERIDO,
  ],
  control: [
    ...MODULOS_UTILIDAD,
    ...MODULOS_BASE,
    ...MODULOS_COCINA_EXPLICITO,
    ...MODULOS_COCINA_INFERIDO,
    ...MODULOS_CONTROL_EXPLICITO,
    ...MODULOS_CONTROL_INFERIDO,
  ],
  // Perfil B3 (decision 005, segunda ola): "Recetario, fichas tecnicas,
  // etiquetas, costeo (sin OPS)". Fichas tecnicas y etiquetas son funciones
  // dentro del modulo Recetario, no ModuloId propios.
  produccion: [
    ...MODULOS_UTILIDAD,
    'recetario',
  ],
}
