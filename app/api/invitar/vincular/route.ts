import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

/**
 * Vincula al usuario autenticado con su fila de `equipo_miembros`.
 *
 * Por qué existe: `/api/invitar` pre-crea la fila de `equipo_miembros` con el
 * email pero SIN `auth_user_id` (el usuario de auth todavía no aceptó nada).
 * Hasta agosto 2026 nadie cerraba ese vínculo: `registro-invitado` actualizaba
 * `activo` y `nombre` y se olvidaba del `auth_user_id`. Consecuencia real
 * (caso Valentino / Bros): `usePermisos` busca el miembro por `auth_user_id`,
 * no lo encuentra, ignora el `permisos_app` del puesto y cae al fallback por
 * rol — que además tenía 'inicio' donde la ruta '/' pide 'home', así que el
 * usuario terminaba con "Sin acceso a home" y sin poder entrar a la app.
 *
 * Va en el server con el admin client a propósito:
 *  - no depende de que RLS deje al invitado escribir su propia fila;
 *  - no depende del estado de `activo` (el update viejo tenía `.eq('activo', false)`,
 *    así que no corría si el admin ya había activado la ficha a mano);
 *  - el match por email lo resuelve el server, que es quien sabe el email real
 *    del usuario de auth — el cliente no puede mentirlo.
 *
 * Es idempotente: si ya está vinculado no hace nada. Se puede llamar en cada
 * login sin efecto, y por eso `lib/auth/context.tsx` lo usa como auto-reparación
 * para los usuarios que ya quedaron rotos antes de este fix.
 */
export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const email = user.email?.trim()
    if (!email) {
      // Usuario de auth sin email (no debería pasar con invitaciones por mail):
      // no hay por dónde matchear la ficha, pero no es un error del cliente.
      return NextResponse.json({ ok: true, vinculado: false, motivo: 'sin_email' })
    }

    const admin = createAdminClient()

    // ¿Ya está vinculado? Idempotencia barata, evita el UPDATE en el 99% de los logins.
    const { data: yaVinculado } = await admin
      .from('equipo_miembros')
      .select('id, restaurante_id')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (yaVinculado) {
      return NextResponse.json({ ok: true, vinculado: false, motivo: 'ya_vinculado' })
    }

    // Los restaurantes a los que el usuario pertenece de verdad. El match es por
    // email, así que sin este filtro una ficha homónima en otra cuenta podría
    // capturar el vínculo.
    const { data: urs } = await admin
      .from('user_restaurantes')
      .select('restaurante_id')
      .eq('user_id', user.id)

    const restauranteIds = (urs ?? []).map(r => r.restaurante_id)
    if (restauranteIds.length === 0) {
      return NextResponse.json({ ok: true, vinculado: false, motivo: 'sin_restaurante' })
    }

    // `ilike` y no `eq`: los emails se cargan a mano en la ficha del equipo y
    // llegan con mayúsculas mezcladas. Se escapan los comodines de LIKE para que
    // un email con '%' o '_' no matchee de más.
    const emailPattern = email.replace(/[\\%_]/g, m => `\\${m}`)

    const { data: vinculadas, error } = await admin
      .from('equipo_miembros')
      .update({ auth_user_id: user.id, activo: true })
      .ilike('email', emailPattern)
      .in('restaurante_id', restauranteIds)
      .is('auth_user_id', null)
      .select('id, restaurante_id, puesto_id')

    if (error) throw error

    return NextResponse.json({
      ok: true,
      vinculado: (vinculadas?.length ?? 0) > 0,
      miembros: vinculadas ?? [],
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error al vincular el usuario'
    console.error('[/api/invitar/vincular]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
