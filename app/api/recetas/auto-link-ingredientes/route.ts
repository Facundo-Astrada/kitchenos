import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

function normalize(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
}

function wordOverlap(a: string, b: string): number {
  const words = (s: string) => s.split(' ').filter(w => w.length > 2)
  const wa = words(a)
  const wb = new Set(words(b))
  if (wa.length === 0 || wb.size === 0) return 0
  const shared = wa.filter(w => wb.has(w)).length
  return shared / Math.min(wa.length, wb.size)
}

type Producto = { id: string; nombre: string; precio_unitario: number; unidad: string }

function findMatch(
  nombreKey: string,
  prodList: Producto[]
): { producto: Producto; confianza: 'exacto' | 'parcial' | 'fuzzy' } | undefined {
  const norm = normalize(nombreKey)

  const exact = prodList.find(p => normalize(p.nombre) === norm)
  if (exact) return { producto: exact, confianza: 'exacto' }

  const contains = prodList.find(p => {
    const pn = normalize(p.nombre)
    return pn.includes(norm) || norm.includes(pn)
  })
  if (contains) return { producto: contains, confianza: 'parcial' }

  let best: Producto | undefined
  let bestScore = 0
  for (const p of prodList) {
    const score = wordOverlap(norm, normalize(p.nombre))
    if (score >= 0.7 && score > bestScore) {
      bestScore = score
      best = p
    }
  }
  if (best) return { producto: best, confianza: 'fuzzy' }

  return undefined
}

// POST — devuelve sugerencias de vinculación sin escribir en DB
export async function POST(req: NextRequest) {
  try {
    const serverSupabase = await createClient()
    const { data: { user } } = await serverSupabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { restaurante_id } = await req.json()
    if (!restaurante_id) return NextResponse.json({ error: 'Falta restaurante_id' }, { status: 400 })

    const admin = createAdminClient()

    // 1. Obtener recetas activas del restaurante
    const { data: recetasIds } = await admin
      .from('recetas')
      .select('id, nombre')
      .eq('restaurante_id', restaurante_id)
      .eq('activa', true)

    const recetaMap = new Map((recetasIds ?? []).map(r => [r.id, r.nombre as string]))
    const recetaIds = Array.from(recetaMap.keys())

    if (recetaIds.length === 0) {
      return NextResponse.json({ matches: [], sin_match: [] })
    }

    // 2. Ingredientes no vinculados de tipo 'producto' (o sin tipo) de esas recetas
    const { data: ingredientesRaw } = await admin
      .from('ingredientes')
      .select('id, nombre, receta_id, tipo, producto_id')
      .is('producto_id', null)
      .in('receta_id', recetaIds)

    const ingredientes = (ingredientesRaw ?? []).filter(
      (i: { tipo: string | null }) => i.tipo === 'producto' || i.tipo === null
    ) as Array<{ id: string; nombre: string; receta_id: string; tipo: string | null; producto_id: string | null }>

    // Productos activos del restaurante
    const { data: productosRaw } = await admin
      .from('productos')
      .select('id, nombre, precio_unitario, unidad')
      .eq('restaurante_id', restaurante_id)
      .eq('activo', true)

    const productos = (productosRaw ?? []) as Producto[]

    // Agrupar ingredientes por nombre normalizado
    const grupos = new Map<string, { nombre_original: string; ids: string[]; receta_nombres: string[] }>()
    for (const ing of ingredientes) {
      const key = normalize(ing.nombre)
      if (!grupos.has(key)) {
        grupos.set(key, { nombre_original: ing.nombre, ids: [], receta_nombres: [] })
      }
      const g = grupos.get(key)!
      g.ids.push(ing.id)
      const rn = recetaMap.get(ing.receta_id) ?? ''
      if (rn && !g.receta_nombres.includes(rn)) g.receta_nombres.push(rn)
    }

    const matches: Array<{
      nombre_ingrediente: string
      ingrediente_ids: string[]
      receta_nombres: string[]
      producto_id: string
      nombre_producto: string
      precio_unitario: number
      unidad_producto: string
      confianza: 'exacto' | 'parcial' | 'fuzzy'
    }> = []

    const sin_match: Array<{
      nombre_ingrediente: string
      ingrediente_ids: string[]
      receta_nombres: string[]
    }> = []

    for (const [, grupo] of grupos) {
      const result = findMatch(grupo.nombre_original, productos)
      if (result) {
        matches.push({
          nombre_ingrediente: grupo.nombre_original,
          ingrediente_ids: grupo.ids,
          receta_nombres: grupo.receta_nombres,
          producto_id: result.producto.id,
          nombre_producto: result.producto.nombre,
          precio_unitario: result.producto.precio_unitario,
          unidad_producto: result.producto.unidad,
          confianza: result.confianza,
        })
      } else {
        sin_match.push({
          nombre_ingrediente: grupo.nombre_original,
          ingrediente_ids: grupo.ids,
          receta_nombres: grupo.receta_nombres,
        })
      }
    }

    matches.sort((a, b) => {
      const order = { exacto: 0, parcial: 1, fuzzy: 2 }
      return order[a.confianza] - order[b.confianza]
    })

    return NextResponse.json({ matches, sin_match })
  } catch (e) {
    console.error('[auto-link-ingredientes] POST error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error interno' }, { status: 500 })
  }
}

// PATCH — aplica los vínculos seleccionados
export async function PATCH(req: NextRequest) {
  try {
    const serverSupabase = await createClient()
    const { data: { user } } = await serverSupabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { links } = await req.json() as {
      links: Array<{ ingrediente_ids: string[]; producto_id: string }>
    }
    if (!links?.length) return NextResponse.json({ error: 'Sin vínculos' }, { status: 400 })

    const admin = createAdminClient()
    let vinculados = 0

    for (const link of links) {
      if (!link.ingrediente_ids?.length || !link.producto_id) continue

      // Obtener precio actual del producto
      const { data: prod } = await admin
        .from('productos')
        .select('precio_unitario')
        .eq('id', link.producto_id)
        .single()

      if (!prod) continue

      const { error } = await admin
        .from('ingredientes')
        .update({
          producto_id: link.producto_id,
          costo_unitario: prod.precio_unitario,
        })
        .in('id', link.ingrediente_ids)

      if (!error) vinculados += link.ingrediente_ids.length
    }

    return NextResponse.json({ vinculados })
  } catch (e) {
    console.error('[auto-link-ingredientes] PATCH error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error interno' }, { status: 500 })
  }
}
