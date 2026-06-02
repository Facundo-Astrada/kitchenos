import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const { email, rol, nombre, apellido } = await req.json()
    if (!email || !rol) {
      return NextResponse.json({ error: 'Email y rol son requeridos' }, { status: 400 })
    }

    // Obtener restaurante_id del usuario que invita
    const serverSupabase = await createClient()
    const { data: { user } } = await serverSupabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { data: urData } = await serverSupabase
      .from('user_restaurantes')
      .select('restaurante_id, rol')
      .eq('user_id', user.id)
      .single()

    if (!urData || urData.rol !== 'admin') {
      return NextResponse.json({ error: 'Solo admins pueden invitar' }, { status: 403 })
    }

    const restauranteId = urData.restaurante_id
    const adminSupabase = createAdminClient()

    // Enviar magic link de invitación
    const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://kos-app-one.vercel.app'}/registro-invitado`
    const { data: inviteData, error: inviteError } = await adminSupabase.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: { restaurante_id: restauranteId, rol_asignado: rol },
    })

    if (inviteError) throw inviteError

    const newUserId = inviteData.user?.id
    if (!newUserId) throw new Error('No se pudo obtener el ID del usuario invitado')

    // Pre-crear user_restaurantes (puede ya existir si el usuario ya está en otra cuenta)
    await adminSupabase.from('user_restaurantes').upsert(
      { user_id: newUserId, restaurante_id: restauranteId, rol },
      { onConflict: 'user_id,restaurante_id', ignoreDuplicates: true }
    )

    // Pre-crear equipo_miembros placeholder
    await adminSupabase.from('equipo_miembros').upsert(
      {
        nombre: nombre || email.split('@')[0],
        apellido: apellido || '',
        email,
        rol,
        activo: false,
        restaurante_id: restauranteId,
      },
      { onConflict: 'email,restaurante_id', ignoreDuplicates: true }
    )

    return NextResponse.json({ ok: true, message: `Invitación enviada a ${email}` })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error al enviar invitación'
    console.error('[/api/invitar]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
