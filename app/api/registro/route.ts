import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { MODULOS_SEED_POR_ROL_DB } from '@/lib/constants'

// POST /api/registro
// Body: { nombre_restaurante, nombre?, apellido? }
//
// Alta de un restaurante nuevo + vínculo del usuario que lo crea. Vive en el
// servidor a propósito: `user_restaurantes` es la tabla de la que sale
// `mi_restaurante_id()`, o sea la variable de la que dependen TODAS las policies
// RLS. Mientras el browser pudo escribirla, cualquier usuario podía apuntar su
// propia fila al restaurante de otro y quedarse con la cuenta entera. Por eso
// acá el `restaurante_id` lo genera el servidor (el cliente no lo elige) y el
// endpoint se niega si el usuario ya tiene un vínculo — un alta es una sola vez.
export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { nombre_restaurante, nombre, apellido } = await req.json()
    const nombreRest = typeof nombre_restaurante === 'string' ? nombre_restaurante.trim() : ''
    if (!nombreRest) {
      return NextResponse.json({ error: 'Falta el nombre del restaurante' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Un usuario ya vinculado no puede crear otro restaurante desde acá: sería
    // la misma reescritura de tenant que este endpoint existe para cerrar.
    const { data: yaVinculado } = await admin
      .from('user_restaurantes')
      .select('restaurante_id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (yaVinculado?.restaurante_id) {
      return NextResponse.json({ error: 'El usuario ya pertenece a un restaurante' }, { status: 409 })
    }

    // El id lo decide el servidor — que el cliente lo mandara era la mitad del agujero.
    const restauranteId = crypto.randomUUID()

    const { error: restError } = await admin
      .from('restaurantes')
      .insert({ id: restauranteId, nombre: nombreRest })
    if (restError) {
      console.error('[registro] restaurantes:', restError.message)
      return NextResponse.json({ error: restError.message }, { status: 500 })
    }

    const { error: linkError } = await admin
      .from('user_restaurantes')
      .insert({ user_id: user.id, restaurante_id: restauranteId, rol: 'admin' })
    if (linkError) {
      console.error('[registro] user_restaurantes:', linkError.message)
      // Sin vínculo el restaurante queda huérfano e inalcanzable — lo sacamos.
      await admin.from('restaurantes').delete().eq('id', restauranteId)
      return NextResponse.json({ error: linkError.message }, { status: 500 })
    }

    const miembroNombre = (typeof nombre === 'string' && nombre) || user.email?.split('@')[0] || 'Admin'
    const miembroApellido = (typeof apellido === 'string' && apellido) || ''

    const { error: miembroError } = await admin
      .from('equipo_miembros')
      .insert({
        nombre: miembroNombre,
        apellido: miembroApellido,
        rol: 'admin',
        auth_user_id: user.id,
        restaurante_id: restauranteId,
        activo: true,
      })
    if (miembroError) {
      console.error('[registro] equipo_miembros:', miembroError.message)
      return NextResponse.json({ error: miembroError.message }, { status: 500 })
    }

    // Permisos por rol por defecto. Las listas viven tipadas en lib/constants.ts.
    const rolPermisos = [
      { rol: 'admin',     modulos: MODULOS_SEED_POR_ROL_DB.admin,     stock: true,  recetas: true,  carta: true,  equipo: true,  eliminar: true },
      { rol: 'sous_chef', modulos: MODULOS_SEED_POR_ROL_DB.sous_chef, stock: true,  recetas: true,  carta: true,  equipo: true,  eliminar: false },
      { rol: 'cocinero',  modulos: MODULOS_SEED_POR_ROL_DB.cocinero,  stock: false, recetas: false, carta: false, equipo: false, eliminar: false },
      { rol: 'bachero',   modulos: MODULOS_SEED_POR_ROL_DB.bachero,   stock: false, recetas: false, carta: false, equipo: false, eliminar: false },
      { rol: 'compras',   modulos: MODULOS_SEED_POR_ROL_DB.compras,   stock: true,  recetas: false, carta: false, equipo: false, eliminar: false },
    ].map(p => ({
      restaurante_id: restauranteId,
      rol: p.rol,
      modulos_visibles: p.modulos,
      puede_editar_stock: p.stock,
      puede_editar_recetas: p.recetas,
      puede_editar_carta: p.carta,
      puede_editar_equipo: p.equipo,
      puede_eliminar: p.eliminar,
    }))

    const { error: permisosError } = await admin.from('rol_permisos').insert(rolPermisos)
    if (permisosError) {
      console.error('[registro] rol_permisos:', permisosError.message)
      return NextResponse.json({ error: permisosError.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, restaurante_id: restauranteId })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error desconocido'
    console.error('[registro] excepción:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
