import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRestauranteId } from '@/lib/api/tenant'
import { fetchAllRows } from '@/lib/supabase/paginate'
import { normAlias, sugerenciaSegura } from '@/lib/facturas/sugerirProducto'

export const maxDuration = 120

// Revincula TODA la historia: líneas de factura sin producto que hoy sí tienen
// uno (el producto se creó después del import, o el nombre era una variante:
// "Mandarinas", "Champignon"). Solo vínculos seguros — lo dudoso queda para
// confirmar a mano en Compras → Precios. No toca precios.
export async function POST() {
  const tenant = await requireRestauranteId()
  if (!tenant.ok) return NextResponse.json({ error: tenant.error }, { status: tenant.status })
  const { restauranteId } = tenant
  const admin = createAdminClient()

  const { data: productosData } = await admin.from('productos').select('id, nombre')
    .eq('restaurante_id', restauranteId).eq('activo', true).eq('es_produccion', false)
  const productos = (productosData ?? []) as { id: string; nombre: string }[]
  const { data: aliasData } = await admin.from('producto_alias').select('alias_norm, producto_id').eq('restaurante_id', restauranteId)
  const alias = new Map(((aliasData ?? []) as { alias_norm: string; producto_id: string }[]).map(a => [a.alias_norm, a.producto_id]))

  type Fila = { id: string; producto_nombre: string }
  const sueltas = await fetchAllRows<Fila>((from, to) =>
    admin.from('factura_items')
      .select('id, producto_nombre, facturas!inner(restaurante_id)')
      .is('producto_id', null)
      .eq('facturas.restaurante_id', restauranteId)
      .range(from, to) as unknown as PromiseLike<{ data: Fila[] | null; error: { message: string } | null }>
  )

  const porNombre = new Map<string, { nombre: string; ids: string[] }>()
  for (const f of sueltas) {
    const k = normAlias(f.producto_nombre)
    if (!k) continue
    const g = porNombre.get(k) ?? { nombre: f.producto_nombre, ids: [] }
    g.ids.push(f.id)
    porNombre.set(k, g)
  }

  const asignaciones = new Map<string, string[]>() // producto_id -> item ids
  const ejemplos: Array<{ factura: string; producto: string; lineas: number }> = []
  for (const [k, g] of porNombre) {
    const pid = alias.get(k) ?? sugerenciaSegura(g.nombre, productos)?.id
    if (!pid) continue
    asignaciones.set(pid, [...(asignaciones.get(pid) ?? []), ...g.ids])
    if (ejemplos.length < 40) ejemplos.push({ factura: g.nombre, producto: productos.find(p => p.id === pid)?.nombre ?? '', lineas: g.ids.length })
  }

  let vinculadas = 0
  const tareas: Array<{ pid: string; ids: string[] }> = []
  for (const [pid, ids] of asignaciones) for (let i = 0; i < ids.length; i += 200) tareas.push({ pid, ids: ids.slice(i, i + 200) })
  for (let i = 0; i < tareas.length; i += 10) {
    const res = await Promise.all(tareas.slice(i, i + 10).map(t =>
      admin.from('factura_items').update({ producto_id: t.pid }).in('id', t.ids)))
    res.forEach((r, j) => { if (!r.error) vinculadas += tareas[i + j].ids.length })
  }

  return NextResponse.json({ vinculadas, nombres: ejemplos.length, ejemplos, quedan: porNombre.size - asignaciones.size })
}
