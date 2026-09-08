import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const { email, rol, nombre, apellido, puesto_id } = await req.json()
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
    // El índice único de equipo_miembros es sobre la columna cruda (sin
    // lower()) — normalizar acá para que dos invitaciones con distinta
    // capitalización no dupliquen la ficha ni vuelvan a fallar el upsert.
    const emailNormalizado = (email as string).trim().toLowerCase()

    // Enviar magic link de invitación
    const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://kos-app-one.vercel.app'}/registro-invitado`
    const { data: inviteData, error: inviteError } = await adminSupabase.auth.admin.inviteUserByEmail(emailNormalizado, {
      redirectTo,
      data: { restaurante_id: restauranteId, rol_asignado: rol },
    })

    if (inviteError) throw inviteError

    const newUserId = inviteData.user?.id
    if (!newUserId) throw new Error('No se pudo obtener el ID del usuario invitado')

    // Pre-crear user_restaurantes (puede ya existir si el usuario ya está en otra cuenta)
    const { error: urError } = await adminSupabase.from('user_restaurantes').upsert(
      { user_id: newUserId, restaurante_id: restauranteId, rol },
      { onConflict: 'user_id,restaurante_id', ignoreDuplicates: true }
    )
    if (urError) throw urError

    // Pre-crear equipo_miembros placeholder (con puesto si se eligió, para que
    // los permisos finos apliquen desde el primer login y no dependan de que
    // el admin vuelva a editar la ficha después). Antes de la migración
    // 20260908_equipo_miembros_email_unico este upsert fallaba con 42P10 (no
    // había índice único para el onConflict) y el error se ignoraba: la
    // invitación se mandaba pero la ficha nunca se creaba.
    const { error: miembroError } = await adminSupabase.from('equipo_miembros').upsert(
      {
        nombre: nombre || emailNormalizado.split('@')[0],
        apellido: apellido || '',
        email: emailNormalizado,
        rol,
        puesto_id: puesto_id || null,
        activo: false,
        restaurante_id: restauranteId,
      },
      { onConflict: 'email,restaurante_id', ignoreDuplicates: true }
    )
    if (miembroError) throw miembroError

    return NextResponse.json({ ok: true, message: `Invitación enviada a ${emailNormalizado}` })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error al enviar invitación'
    console.error('[/api/invitar]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
