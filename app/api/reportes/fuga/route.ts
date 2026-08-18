import { NextRequest, NextResponse } from 'next/server'
import { requireRestauranteId } from '@/lib/api/tenant'
import { calcularFugaInventario } from '@/lib/reportes/fuga'

type Periodo = 'semana' | 'mes' | 'mes_anterior'

// Mismos 3 períodos y mismo criterio que el resto de Reportes (rangoAuditoria
// en app/(app)/reportes/page.tsx) — sin comparación vs. anterior.
function rango(periodo: Periodo): { desde: string; hasta: string } {
  const hoy = new Date()
  const hastaStr = hoy.toISOString().slice(0, 10)
  if (periodo === 'semana') {
    const d = new Date(hoy); d.setDate(d.getDate() - 7)
    return { desde: d.toISOString().slice(0, 10), hasta: hastaStr }
  }
  if (periodo === 'mes') {
    return { desde: new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10), hasta: hastaStr }
  }
  const pm = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)
  const endPrev = new Date(hoy.getFullYear(), hoy.getMonth(), 0)
  return { desde: pm.toISOString().slice(0, 10), hasta: endPrev.toISOString().slice(0, 10) }
}

export async function GET(req: NextRequest) {
  const tenant = await requireRestauranteId()
  if (!tenant.ok) return NextResponse.json({ error: tenant.error }, { status: tenant.status })
  const { restauranteId, supabase } = tenant

  const { searchParams } = new URL(req.url)
  const periodoParam = searchParams.get('periodo')
  const periodo: Periodo = periodoParam === 'semana' || periodoParam === 'mes_anterior' ? periodoParam : 'mes'
  const { desde, hasta } = rango(periodo)

  try {
    const resultado = await calcularFugaInventario({ supabase, restauranteId, desde, hasta })
    return NextResponse.json(resultado)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : (e && typeof e === 'object' && 'message' in e) ? String((e as { message: unknown }).message) : 'Error al calcular la fuga de inventario'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
