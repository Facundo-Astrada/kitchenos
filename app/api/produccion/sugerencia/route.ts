import { NextRequest, NextResponse } from 'next/server'
import { requireRestauranteId } from '@/lib/api/tenant'
import { calcularSugerenciaProduccion } from '@/lib/produccion/sugerencia'

function manana(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

export async function GET(req: NextRequest) {
  const tenant = await requireRestauranteId()
  if (!tenant.ok) return NextResponse.json({ error: tenant.error }, { status: tenant.status })
  const { restauranteId, supabase } = tenant

  const { searchParams } = new URL(req.url)
  const fechaObjetivo = searchParams.get('fecha') || manana()
  const semanasParam = Number(searchParams.get('semanas'))
  const semanas = Number.isFinite(semanasParam) && semanasParam > 0 ? semanasParam : 8

  try {
    const resultado = await calcularSugerenciaProduccion({ supabase, restauranteId, fechaObjetivo, semanas })
    return NextResponse.json(resultado)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : (e && typeof e === 'object' && 'message' in e) ? String((e as { message: unknown }).message) : 'Error al calcular la sugerencia'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
