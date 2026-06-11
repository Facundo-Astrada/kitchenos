import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRestauranteId } from '@/lib/api/tenant'

export async function POST(req: NextRequest) {
  const tenant = await requireRestauranteId()
  if (!tenant.ok) return NextResponse.json({ error: tenant.error }, { status: tenant.status })
  const { restauranteId } = tenant

  const { tipo, ids } = await req.json() as { tipo: 'stock' | 'proveedores'; ids: string[] }
  if (!ids?.length) return NextResponse.json({ eliminados: 0 })

  const admin = createAdminClient()
  const tabla = tipo === 'stock' ? 'productos' : 'proveedores'

  // Soft-delete en lotes de 100 — filtrar por restaurante_id para que ids ajenos no matcheen
  const BATCH = 100
  let eliminados = 0
  for (let i = 0; i < ids.length; i += BATCH) {
    const lote = ids.slice(i, i + BATCH)
    const { error } = await admin.from(tabla).update({ activo: false }).in('id', lote).eq('restaurante_id', restauranteId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    eliminados += lote.length
  }

  return NextResponse.json({ eliminados })
}
