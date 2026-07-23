import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ModuloId } from '@/lib/constants'
import type { CampoUI } from '@/lib/coach/types'

const fmtARS = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')

function turnoActual(): 'apertura' | 'servicio' | 'cierre' {
  const h = new Date().getHours()
  return h < 12 ? 'apertura' : h < 18 ? 'servicio' : 'cierre'
}

export interface ToolRegistryEntry<T = Record<string, unknown>> {
  moduloId: ModuloId
  recurso?: 'stock' | 'carta'
  schema: z.ZodType<T>
  tituloHumano: string
  resumen: (input: T) => string
  campos: (input: T) => CampoUI[]
  warnings?: (input: T, ctx: { supabase: SupabaseClient; restauranteId: string }) => Promise<string[]>
  execute: (supabase: SupabaseClient, restauranteId: string, input: T) => Promise<{ ok: boolean; message: string }>
}

const crearTareaSchema = z.object({
  titulo: z.string().trim().min(1),
  prioridad: z.enum(['critica', 'alta', 'media', 'baja']).default('media'),
  plaza: z.string().trim().optional(),
  descripcion: z.string().trim().optional(),
})

const marcar86Schema = z.object({
  plato: z.string().trim().min(1),
})

const MOTIVOS_MERMA = ['vencimiento', 'error_coccion', 'mala_recepcion', 'sobro_servicio', 'deterioro', 'devolucion_cliente', 'mala_conservacion', 'otro'] as const

const registrarMermaSchema = z.object({
  producto: z.string().trim().min(1),
  cantidad: z.number().positive(),
  unidad: z.string().trim().min(1),
  motivo: z.enum(MOTIVOS_MERMA),
  detalle: z.string().trim().optional(),
})

const cargarProductoSchema = z.object({
  nombre: z.string().trim().min(1),
  unidad: z.string().trim().min(1),
  precio_unitario: z.number().nonnegative().optional(),
  stock_actual: z.number().nonnegative().optional(),
  stock_minimo: z.number().nonnegative().optional(),
  categoria: z.string().trim().optional(),
})

const ajustarStockSchema = z.object({
  producto: z.string().trim().min(1),
  cantidad: z.number(),
  operacion: z.enum(['set', 'sumar', 'restar']).default('set'),
})

const registrarVentaSchema = z.object({
  total_ventas: z.number().positive(),
  cantidad_cubiertos: z.number().nonnegative().optional(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

export const COACH_TOOL_REGISTRY: Record<string, ToolRegistryEntry<any>> = {
  crear_tarea: {
    moduloId: 'tareas',
    schema: crearTareaSchema,
    tituloHumano: 'Crear tarea',
    resumen: i => `${i.titulo}${i.plaza ? ` — ${i.plaza}` : ''} (${i.prioridad})`,
    campos: () => [
      { key: 'titulo', label: 'Título', tipo: 'texto', requerido: true },
      { key: 'prioridad', label: 'Prioridad', tipo: 'select', opciones: ['critica', 'alta', 'media', 'baja'] },
      { key: 'plaza', label: 'Plaza', tipo: 'texto' },
      { key: 'descripcion', label: 'Descripción', tipo: 'textarea' },
    ],
    execute: async (supabase, restauranteId, input: z.infer<typeof crearTareaSchema>) => {
      const hoy = new Date().toISOString().split('T')[0]
      const { error } = await supabase.from('tareas').insert({
        titulo: input.titulo,
        descripcion: input.descripcion ?? null,
        status: 'pendiente',
        estado: 'pendiente',
        prioridad: input.prioridad,
        categoria: 'general',
        seccion: 'general',
        plaza: input.plaza ?? null,
        turno_fecha: hoy,
        checklist: '[]',
        restaurante_id: restauranteId,
      })
      if (error) return { ok: false, message: `Error al crear la tarea: ${error.message}` }
      return { ok: true, message: `Tarea creada para hoy: "${input.titulo}" (prioridad ${input.prioridad}). Aparece en Producción.` }
    },
  },

  marcar_86: {
    moduloId: 'carta',
    recurso: 'carta',
    schema: marcar86Schema,
    tituloHumano: 'Marcar 86',
    resumen: i => `"${i.plato}" pasa a no disponible`,
    campos: () => [
      { key: 'plato', label: 'Plato (nombre o parte)', tipo: 'texto', requerido: true },
    ],
    warnings: async (input: z.infer<typeof marcar86Schema>, { supabase, restauranteId }) => {
      const { data } = await supabase.from('carta_items').select('nombre')
        .eq('restaurante_id', restauranteId).ilike('nombre', `%${input.plato}%`)
      if (!data || data.length === 0) return [`No encontré ningún plato que coincida con "${input.plato}". Si confirmás, no va a afectar nada.`]
      if (data.length > 1) return [`Esto va a afectar ${data.length} platos: ${data.map(d => d.nombre).join(', ')}`]
      return []
    },
    execute: async (supabase, restauranteId, input: z.infer<typeof marcar86Schema>) => {
      const { data, error } = await supabase.from('carta_items')
        .update({ disponible: false })
        .eq('restaurante_id', restauranteId)
        .ilike('nombre', `%${input.plato}%`)
        .select('nombre')
      if (error) return { ok: false, message: `Error al marcar 86: ${error.message}` }
      if (!data || data.length === 0) return { ok: false, message: `No encontré ningún plato que coincida con "${input.plato}". No marqué nada.` }
      return { ok: true, message: `Marcado como 86 (no disponible): ${data.map(d => d.nombre).join(', ')}.` }
    },
  },

  registrar_merma: {
    moduloId: 'merma',
    schema: registrarMermaSchema,
    tituloHumano: 'Registrar merma',
    resumen: i => `${i.cantidad} ${i.unidad} de ${i.producto} (${i.motivo})`,
    campos: () => [
      { key: 'producto', label: 'Producto', tipo: 'texto', requerido: true },
      { key: 'cantidad', label: 'Cantidad', tipo: 'numero', requerido: true },
      { key: 'unidad', label: 'Unidad', tipo: 'texto', requerido: true },
      { key: 'motivo', label: 'Motivo', tipo: 'select', opciones: [...MOTIVOS_MERMA], requerido: true },
      { key: 'detalle', label: 'Detalle', tipo: 'textarea' },
    ],
    execute: async (supabase, restauranteId, input: z.infer<typeof registrarMermaSchema>) => {
      const hoy = new Date().toISOString().split('T')[0]
      const { data: prod } = await supabase.from('productos')
        .select('id, precio_unitario, stock_actual')
        .eq('restaurante_id', restauranteId)
        .ilike('nombre', `%${input.producto}%`)
        .limit(1).maybeSingle()

      const costo = prod?.precio_unitario ? Number(prod.precio_unitario) * input.cantidad : 0
      const { error } = await supabase.from('merma').insert({
        producto_nombre: input.producto,
        producto_id: prod?.id ?? null,
        cantidad: input.cantidad,
        unidad: input.unidad,
        motivo: input.motivo,
        motivo_detalle: input.detalle ?? null,
        fecha: hoy,
        turno: turnoActual(),
        costo_estimado: costo,
        restaurante_id: restauranteId,
      })
      if (error) return { ok: false, message: `Error al registrar la merma: ${error.message}` }

      let extra = ''
      if (prod?.id) {
        const nuevo = Math.max(0, (Number(prod.stock_actual) || 0) - input.cantidad)
        await supabase.from('productos').update({ stock_actual: nuevo }).eq('id', prod.id)
        extra = ` Stock actualizado a ${nuevo} ${input.unidad}.`
      }
      const costoTxt = costo > 0 ? ` Costo estimado ${fmtARS(costo)}.` : ''
      return { ok: true, message: `Merma registrada: ${input.cantidad} ${input.unidad} de ${input.producto} (${input.motivo}).${costoTxt}${extra}` }
    },
  },

  cargar_producto: {
    moduloId: 'stock',
    recurso: 'stock',
    schema: cargarProductoSchema,
    tituloHumano: 'Cargar producto',
    resumen: i => `${i.nombre}${i.stock_actual ? ` — ${i.stock_actual} ${i.unidad}` : ` (${i.unidad})`}`,
    campos: () => [
      { key: 'nombre', label: 'Nombre', tipo: 'texto', requerido: true },
      { key: 'unidad', label: 'Unidad', tipo: 'texto', requerido: true },
      { key: 'precio_unitario', label: 'Precio unitario', tipo: 'numero' },
      { key: 'stock_actual', label: 'Stock inicial', tipo: 'numero' },
      { key: 'stock_minimo', label: 'Stock mínimo', tipo: 'numero' },
      { key: 'categoria', label: 'Categoría', tipo: 'texto' },
    ],
    execute: async (supabase, restauranteId, input: z.infer<typeof cargarProductoSchema>) => {
      const { data: existe } = await supabase.from('productos')
        .select('nombre').eq('restaurante_id', restauranteId).ilike('nombre', input.nombre).limit(1).maybeSingle()
      if (existe) return { ok: false, message: `Ya existe un producto llamado "${existe.nombre}". Si querés cambiar su stock, usá ajustar_stock.` }

      const stockActual = input.stock_actual ?? 0
      const stockMinimo = input.stock_minimo ?? 0
      const precio = input.precio_unitario ?? null
      const { error } = await supabase.from('productos').insert({
        nombre: input.nombre,
        unidad: input.unidad,
        stock_actual: stockActual,
        stock_minimo: stockMinimo,
        stock_critico: 0,
        precio_unitario: precio,
        categoria: input.categoria ?? 'Otros',
        activo: true,
        restaurante_id: restauranteId,
      })
      if (error) return { ok: false, message: `Error al cargar el producto: ${error.message}` }
      const detalles = [`${stockActual} ${input.unidad}`]
      if (precio) detalles.push(`precio ${fmtARS(precio)}`)
      return { ok: true, message: `Producto cargado: ${input.nombre} (${detalles.join(', ')}). Ya aparece en Stock.` }
    },
  },

  ajustar_stock: {
    moduloId: 'stock',
    recurso: 'stock',
    schema: ajustarStockSchema,
    tituloHumano: 'Ajustar stock',
    resumen: i => `${i.producto}: ${i.operacion} ${i.cantidad}`,
    campos: () => [
      { key: 'producto', label: 'Producto', tipo: 'texto', requerido: true },
      { key: 'cantidad', label: 'Cantidad', tipo: 'numero', requerido: true },
      { key: 'operacion', label: 'Operación', tipo: 'select', opciones: ['set', 'sumar', 'restar'] },
    ],
    execute: async (supabase, restauranteId, input: z.infer<typeof ajustarStockSchema>) => {
      const { data: prod } = await supabase.from('productos')
        .select('id, nombre, stock_actual, unidad')
        .eq('restaurante_id', restauranteId).ilike('nombre', `%${input.producto}%`).limit(1).maybeSingle()
      if (!prod) return { ok: false, message: `No encontré ningún producto que coincida con "${input.producto}" en el stock.` }
      const actual = Number(prod.stock_actual) || 0
      const nuevo = input.operacion === 'sumar' ? actual + input.cantidad
        : input.operacion === 'restar' ? Math.max(0, actual - input.cantidad)
        : input.cantidad
      const { error } = await supabase.from('productos').update({ stock_actual: nuevo }).eq('id', prod.id)
      if (error) return { ok: false, message: `Error al ajustar el stock: ${error.message}` }
      return { ok: true, message: `Stock de ${prod.nombre} actualizado: ${actual} → ${nuevo} ${prod.unidad ?? ''}.` }
    },
  },

  registrar_venta: {
    moduloId: 'ventas',
    schema: registrarVentaSchema,
    tituloHumano: 'Registrar venta',
    resumen: i => `${fmtARS(i.total_ventas)}${i.cantidad_cubiertos ? ` — ${i.cantidad_cubiertos} cubiertos` : ''}${i.fecha ? ` (${i.fecha})` : ''}`,
    campos: () => [
      { key: 'total_ventas', label: 'Total facturado', tipo: 'numero', requerido: true },
      { key: 'cantidad_cubiertos', label: 'Cubiertos', tipo: 'numero' },
      { key: 'fecha', label: 'Fecha (YYYY-MM-DD)', tipo: 'texto' },
    ],
    execute: async (supabase, restauranteId, input: z.infer<typeof registrarVentaSchema>) => {
      const hoy = new Date().toISOString().split('T')[0]
      const fecha = input.fecha || hoy
      const cubiertos = input.cantidad_cubiertos ?? null
      const { data: existe } = await supabase.from('ventas')
        .select('id').eq('restaurante_id', restauranteId).eq('fecha', fecha).limit(1).maybeSingle()
      const payload = { total_ventas: input.total_ventas, cantidad_cubiertos: cubiertos, fecha, restaurante_id: restauranteId }
      let error
      if (existe) {
        ;({ error } = await supabase.from('ventas').update(payload).eq('id', existe.id))
      } else {
        ;({ error } = await supabase.from('ventas').insert({ ...payload, origen: 'manual' }))
      }
      if (error) return { ok: false, message: `Error al registrar la venta: ${error.message}` }
      const cubTxt = cubiertos ? ` con ${cubiertos} cubiertos (ticket ${fmtARS(input.total_ventas / cubiertos)})` : ''
      return { ok: true, message: `Venta ${existe ? 'actualizada' : 'registrada'} para ${fecha}: ${fmtARS(input.total_ventas)}${cubTxt}.` }
    },
  },
}

export const COACH_MUTATING_TOOLS = Object.keys(COACH_TOOL_REGISTRY)
