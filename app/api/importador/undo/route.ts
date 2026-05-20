import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { tipo, ids } = await req.json() as { tipo: 'stock' | 'proveedores'; ids: string[] }
  if (!ids?.length) return NextResponse.json({ eliminados: 0 })

  const admin = createAdminClient()
  const tabla = tipo === 'stock' ? 'productos' : 'proveedores'

  // Soft-delete en lotes de 100
  const BATCH = 100
  let eliminados = 0
  for (let i = 0; i < ids.length; i += BATCH) {
    const lote = ids.slice(i, i + BATCH)
    const { error } = await admin.from(tabla).update({ activo: false }).in('id', lote)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    eliminados += lote.length
  }

  return NextResponse.json({ eliminados })
}
