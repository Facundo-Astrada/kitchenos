import type { SupabaseClient } from '@supabase/supabase-js'
import type { Rol } from '@/types'
import { COACH_TOOL_REGISTRY } from '@/lib/coach/tools/registry'
import { puedeVerCostos, puedeVerModulo, resolverModulosEfectivos } from '@/lib/permisos/resolver'
import { mapRol } from '@/lib/permisos/roles'

// Replica server-side, sin cambiar semántica, la cascada de dos pasos que hoy es client-only:
// 1) lib/permisos/roles.ts: mapRol(user_restaurantes.rol, equipo_miembros.plaza_asignada) -> Rol de la app.
// 2) lib/hooks/usePermisos.ts: Rol de la app -> dbRol de rol_permisos (admin/sous_chef/cocinero/bachero),
//    y desde ahí: módulos efectivos del puesto (permisos_app + modulos_extra - modulos_restringidos)
//    o, si no hay puesto, fallback a rol_permisos.modulos_visibles / puede_editar_*.
//
// Ni (1) ni (2) están duplicados: (2) vive en lib/permisos/resolver.ts, (1) en
// lib/permisos/roles.ts, y lo importan los dos lados (cliente y este archivo).
// Mantener copias sincronizadas a mano no funcionó — en ago 2026 las dos tenían
// los mismos dos bugs (permisos_app vacío tratado como lista válida, y el alias
// 'inicio'/'home' sin contemplar); el mapeo de roles se unificó en Día 10 del
// plan consolidado por el mismo motivo.

function toPermisoRol(appRol: Rol): string {
  if (appRol === 'admin') return 'admin'
  if (appRol === 'chef') return 'sous_chef'
  if (appRol === 'ayudante') return 'bachero'
  if (['parrilla', 'frios', 'calientes', 'pase', 'pasteleria', 'panaderia', 'linea'].includes(appRol)) return 'cocinero'
  return appRol
}

export interface PermisosServer {
  isAdmin: boolean
  puedeVer: (modulo: string) => boolean
  puedeEditar: (recurso: 'stock' | 'carta') => boolean
  /**
   * Ve precios, costos y food cost. Se resuelve acá y no en el cliente porque
   * el Coach devuelve estos numeros desde el server: esconder un chip en la UI
   * no sirve de nada si el modelo igual los recibe y los dice.
   */
  verCostos: boolean
}

export async function getPermisosServer(
  supabase: SupabaseClient, userId: string, restauranteId: string
): Promise<PermisosServer> {
  const { data: ur } = await supabase.from('user_restaurantes')
    .select('rol').eq('user_id', userId).maybeSingle()

  const appRol = mapRol(ur?.rol ?? '', null)
  const permisoRol = toPermisoRol(appRol)

  if (permisoRol === 'admin') {
    return { isAdmin: true, puedeVer: () => true, puedeEditar: () => true, verCostos: true }
  }

  const { data: miembro } = await supabase.from('equipo_miembros')
    .select('puesto_id, plaza_asignada, modulos_extra, modulos_restringidos, ver_costos')
    .eq('restaurante_id', restauranteId).eq('auth_user_id', userId).eq('activo', true)
    .maybeSingle()

  // plaza_asignada puede afectar el rol de permisos (cocinero/staff con plaza) — recalcular con el dato real.
  const appRolConPlaza = mapRol(ur?.rol ?? '', miembro?.plaza_asignada ?? null)
  const permisoRolFinal = toPermisoRol(appRolConPlaza)
  if (permisoRolFinal === 'admin') {
    return { isAdmin: true, puedeVer: () => true, puedeEditar: () => true, verCostos: true }
  }

  let modulosEfectivos: string[] | null = null
  let verCostosPuesto: boolean | null = null
  if (miembro?.puesto_id) {
    const { data: puesto } = await supabase.from('puestos')
      .select('permisos_app, ver_costos').eq('id', miembro.puesto_id).maybeSingle()
    verCostosPuesto = (puesto?.ver_costos as boolean | null | undefined) ?? null
    modulosEfectivos = resolverModulosEfectivos({
      permisosApp: puesto?.permisos_app as string[] | null | undefined,
      modulosExtra: miembro.modulos_extra as string[] | null,
      modulosRestringidos: miembro.modulos_restringidos as string[] | null,
    })
  }

  let permisos: { modulos_visibles: string[]; puede_editar_stock: boolean; puede_editar_carta: boolean; puede_ver_costos: boolean } | null = null
  if (modulosEfectivos === null) {
    const { data } = await supabase.from('rol_permisos')
      .select('modulos_visibles, puede_editar_stock, puede_editar_carta, puede_ver_costos')
      .eq('restaurante_id', restauranteId).eq('rol', permisoRolFinal).maybeSingle()
    permisos = data
  }

  return {
    isAdmin: false,
    puedeVer: modulo => puedeVerModulo({
      isAdmin: false,
      modulosEfectivos,
      modulosVisibles: permisos?.modulos_visibles,
    }, modulo),
    // Nota: igual que en usePermisos.ts, puedeEditar solo se resuelve contra rol_permisos —
    // con puesto asignado (modulosEfectivos !== null) siempre da false salvo admin. Es un
    // comportamiento preexistente del cliente que se replica tal cual, no se corrige acá.
    puedeEditar: recurso => recurso === 'stock' ? (permisos?.puede_editar_stock ?? false)
      : recurso === 'carta' ? (permisos?.puede_editar_carta ?? false)
      : false,
    verCostos: puedeVerCostos({
      isAdmin: false,
      overrideMiembro: (miembro?.ver_costos as boolean | null | undefined) ?? null,
      verCostosPuesto,
      fallbackRol: permisos?.puede_ver_costos,
    }),
  }
}

// Doble enforcement: se usa en route.ts para filtrar qué tools ve el modelo, y de nuevo
// en confirm/route.ts antes de ejecutar el write real (el boundary que importa de verdad).
export function puedeEjecutarTool(permisos: PermisosServer, toolName: string): boolean {
  const entry = COACH_TOOL_REGISTRY[toolName]
  if (!entry) return false
  if (!permisos.puedeVer(entry.moduloId)) return false
  if (entry.recurso && !permisos.puedeEditar(entry.recurso)) return false
  return true
}
