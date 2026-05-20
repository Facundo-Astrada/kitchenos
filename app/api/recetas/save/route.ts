import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { receta, ingredientes, addIngredientsOnly } = body

    const adminSupabase = createAdminClient()

    // Obtener restaurante_id del usuario autenticado (más confiable que el body)
    let restauranteId = receta?.restaurante_id || ''
    if (!restauranteId) {
      try {
        const serverSupabase = await createClient()
        const { data: { user } } = await serverSupabase.auth.getUser()
        if (user) {
          const { data: ur } = await adminSupabase
            .from('user_restaurantes')
            .select('restaurante_id')
            .eq('user_id', user.id)
            .single()
          restauranteId = ur?.restaurante_id || ''
        }
      } catch {
        // Si falla, intentar con lo que vino en el body
      }
    }

    // Mode: add ingredients only (no new receta)
    if (addIngredientsOnly && ingredientes?.length > 0) {
      const { error } = await adminSupabase.from('ingredientes').insert(ingredientes)
      if (error) {
        console.error('[save-receta] Ingredientes error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ ok: true })
    }

    if (!receta || !restauranteId) {
      console.error('[save-receta] Missing restaurante_id. receta:', !!receta, 'restauranteId:', restauranteId)
      return NextResponse.json({ error: 'Datos incompletos: falta restaurante_id' }, { status: 400 })
    }

    // Insert receta
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

    // Insert ingredientes if provided
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
