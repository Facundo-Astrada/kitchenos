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
 *
 * Además CREA la ficha si no existe ninguna para matchear (caso Tamara,
 * 08/09/2026): `/api/invitar` tenía un bug de índice único que hacía fallar
 * su upsert de `equipo_miembros` en silencio — la invitación se mandaba, el
 * usuario podía loguearse (alcanza con `user_restaurantes`), pero nunca
 * tuvo ficha. Sin esto, `vincular` no tenía nada que actualizar y el hueco
 * quedaba abierto para siempre. Ver PLAN-ARREGLOS-2026-09-08.md § 1.
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

    // Restaurantes donde no había ninguna ficha para vincular: el caso Tamara.
    // Se crea directo, con el rol que ya tiene en user_restaurantes — sin
    // puesto, para que el admin se lo asigne desde Organigrama.
    const restaurantesVinculados = new Set((vinculadas ?? []).map(v => v.restaurante_id))
    const restaurantesSinFicha = restauranteIds.filter(rid => !restaurantesVinculados.has(rid))

    let creadas: { id: string; restaurante_id: string; puesto_id: string | null }[] = []
    if (restaurantesSinFicha.length > 0) {
      const { data: existentes } = await admin
        .from('equipo_miembros')
        .select('restaurante_id')
        .in('restaurante_id', restaurantesSinFicha)
        .ilike('email', emailPattern)
      const yaExisten = new Set((existentes ?? []).map(e => e.restaurante_id))
      const aCrear = restaurantesSinFicha.filter(rid => !yaExisten.has(rid))

      if (aCrear.length > 0) {
        const { data: ursConRol } = await admin
          .from('user_restaurantes')
          .select('restaurante_id, rol')
          .eq('user_id', user.id)
          .in('restaurante_id', aCrear)
        const rolPorRestaurante = new Map((ursConRol ?? []).map(u => [u.restaurante_id, u.rol]))
        const nombreMeta = (user.user_metadata?.nombre as string | undefined)?.trim()
        const nombre = nombreMeta || email.split('@')[0]
        const emailNormalizado = email.toLowerCase()

        const { data: nuevas, error: insertError } = await admin
          .from('equipo_miembros')
          .insert(aCrear.map(rid => ({
            nombre,
            apellido: '',
            email: emailNormalizado,
            rol: rolPorRestaurante.get(rid) ?? 'cocinero',
            auth_user_id: user.id,
            activo: true,
            restaurante_id: rid,
          })))
          .select('id, restaurante_id, puesto_id')

        if (insertError) throw insertError
        creadas = nuevas ?? []
      }
    }

    return NextResponse.json({
      ok: true,
      vinculado: (vinculadas?.length ?? 0) > 0 || creadas.length > 0,
      miembros: [...(vinculadas ?? []), ...creadas],
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error al vincular el usuario'
    console.error('[/api/invitar/vincular]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
