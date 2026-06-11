import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRestauranteId } from '@/lib/api/tenant'

export async function POST(req: NextRequest) {
  try {
    const tenant = await requireRestauranteId()
    if (!tenant.ok) return NextResponse.json({ error: tenant.error }, { status: tenant.status })
    const { restauranteId } = tenant

    const body = await req.json()
    const { receta, ingredientes, addIngredientsOnly, enrichRecetaId } = body

    const adminSupabase = createAdminClient()

    // Mode: add ingredients only (no new receta)
    if (addIngredientsOnly && ingredientes?.length > 0) {
      // Verificar que todos los receta_id de los ingredientes pertenecen al tenant
      const recetaIds = [...new Set((ingredientes as Array<{ receta_id: string }>).map(i => i.receta_id).filter(Boolean))]
      if (recetaIds.length > 0) {
        const { data: owned } = await adminSupabase
          .from('recetas')
          .select('id')
          .in('id', recetaIds)
          .eq('restaurante_id', restauranteId)
        if ((owned?.length ?? 0) < recetaIds.length) {
          return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
        }
      }
      const { error } = await adminSupabase.from('ingredientes').insert(ingredientes)
      if (error) {
        console.error('[save-receta] Ingredientes error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ ok: true })
    }

    // Mode: enrich existing recipe (replace ingredients + update procedimiento)
    if (enrichRecetaId) {
      const { data: owned } = await adminSupabase
        .from('recetas')
        .select('id')
        .eq('id', enrichRecetaId)
        .eq('restaurante_id', restauranteId)
        .maybeSingle()
      if (!owned) return NextResponse.json({ error: 'Receta no encontrada' }, { status: 404 })

      await adminSupabase.from('ingredientes').delete().eq('receta_id', enrichRecetaId)
      if (ingredientes?.length > 0) {
        const rows = ingredientes.map((ing: Record<string, unknown>) => ({ ...ing, receta_id: enrichRecetaId }))
        const { error: ingErr } = await adminSupabase.from('ingredientes').insert(rows)
        if (ingErr) console.error('[save-receta] Enrich ingredientes error:', ingErr)
      }
      if (receta) {
        const { error: upErr } = await adminSupabase
          .from('recetas')
          .update({ procedimiento: receta.procedimiento, updated_at: new Date().toISOString() })
          .eq('id', enrichRecetaId)
        if (upErr) console.error('[save-receta] Enrich update error:', upErr)
      }
      return NextResponse.json({ id: enrichRecetaId, ok: true })
    }

    if (!receta) {
      return NextResponse.json({ error: 'Datos incompletos: falta receta' }, { status: 400 })
    }

    // Insert receta — restaurante_id siempre de la sesión
    const { data, error } = await adminSupabase
      .from('recetas')
      .insert({
        ...receta,
        restaurante_id: restauranteId,
        status: receta.status || 'published',
      })
      .select('id')
      .single()

    if (error) {
      console.error('[save-receta] Insert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const recetaId = data.id

    if (ingredientes && ingredientes.length > 0) {
      const rows = ingredientes.map((ing: Record<string, unknown>) => ({
        ...ing,
        receta_id: recetaId,
      }))
      const { error: ingError } = await adminSupabase.from('ingredientes').insert(rows)
      if (ingError) {
        console.error('[save-receta] Ingredientes error:', ingError)
      }
    }

    return NextResponse.json({ id: recetaId })
  } catch (e) {
    console.error('[save-receta] Unexpected error:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Error interno' },
      { status: 500 }
    )
  }
}
