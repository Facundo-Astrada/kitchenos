import type { SupabaseClient } from '@supabase/supabase-js'
import { COACH_TOOL_REGISTRY } from '@/lib/coach/tools/registry'
import { puedeVerModulo, resolverModulosEfectivos } from '@/lib/permisos/resolver'

// Replica server-side, sin cambiar semántica, la cascada de dos pasos que hoy es client-only:
// 1) lib/auth/context.tsx: mapRol(user_restaurantes.rol, equipo_miembros.plaza_asignada) -> Rol de la app.
// 2) lib/hooks/usePermisos.ts: Rol de la app -> dbRol de rol_permisos (admin/sous_chef/cocinero/bachero),
//    y desde ahí: módulos efectivos del puesto (permisos_app + modulos_extra - modulos_restringidos)
//    o, si no hay puesto, fallback a rol_permisos.modulos_visibles / puede_editar_*.
//
// El paso (2) ya NO está duplicado: vive en lib/permisos/resolver.ts y lo importan
// los dos lados. Mantener dos copias sincronizadas a mano no funcionó — en ago 2026
// las dos tenían los mismos dos bugs (permisos_app vacío tratado como lista válida,
// y el alias 'inicio'/'home' sin contemplar). El mapeo de roles de (1) sigue duplicado.

type AppRol =
  | 'admin' | 'chef' | 'ayudante'
  | 'parrilla' | 'frios' | 'calientes' | 'pase' | 'pasteleria' | 'panaderia' | 'linea'
  | string

function mapRol(dbRol: string, plaza?: string | null): AppRol {
  const plazaMap: Record<string, AppRol> = {
    parrilla: 'parrilla', frios: 'frios', calientes: 'calientes', pase: 'pase',
    pasteleria: 'pasteleria', panaderia: 'panaderia', linea: 'linea',
  }
  const primaryPlaza = plaza?.split(',')[0]?.trim()
  switch (dbRol) {
    case 'admin': return 'admin'
    case 'owner': return 'admin'
    case 'compras': return 'admin'
    case 'sous_chef': return 'chef'
    case 'chef': return 'chef'
    case 'cocinero': return (primaryPlaza && plazaMap[primaryPlaza]) || 'linea'
    case 'staff': return (primaryPlaza && plazaMap[primaryPlaza]) || 'ayudante'
    case 'bachero': return 'ayudante'
    default: return dbRol || 'ayudante'
  }
}

function toPermisoRol(appRol: AppRol): string {
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
}

export async function getPermisosServer(
  supabase: SupabaseClient, userId: string, restauranteId: string
): Promise<PermisosServer> {
  const { data: ur } = await supabase.from('user_restaurantes')
    .select('rol').eq('user_id', userId).maybeSingle()

  const appRol = mapRol(ur?.rol ?? '', null)
  const permisoRol = toPermisoRol(appRol)

  if (permisoRol === 'admin') {
    return { isAdmin: true, puedeVer: () => true, puedeEditar: () => true }
  }

  const { data: miembro } = await supabase.from('equipo_miembros')
    .select('puesto_id, plaza_asignada, modulos_extra, modulos_restringidos')
    .eq('restaurante_id', restauranteId).eq('auth_user_id', userId).eq('activo', true)
    .maybeSingle()

  // plaza_asignada puede afectar el rol de permisos (cocinero/staff con plaza) — recalcular con el dato real.
  const appRolConPlaza = mapRol(ur?.rol ?? '', miembro?.plaza_asignada ?? null)
  const permisoRolFinal = toPermisoRol(appRolConPlaza)
  if (permisoRolFinal === 'admin') {
    return { isAdmin: true, puedeVer: () => true, puedeEditar: () => true }
  }

  let modulosEfectivos: string[] | null = null
  if (miembro?.puesto_id) {
    const { data: puesto } = await supabase.from('puestos')
      .select('permisos_app').eq('id', miembro.puesto_id).maybeSingle()
    modulosEfectivos = resolverModulosEfectivos({
      permisosApp: puesto?.permisos_app as string[] | null | undefined,
      modulosExtra: miembro.modulos_extra as string[] | null,
      modulosRestringidos: miembro.modulos_restringidos as string[] | null,
    })
  }

  let permisos: { modulos_visibles: string[]; puede_editar_stock: boolean; puede_editar_carta: boolean } | null = null
  if (modulosEfectivos === null) {
    const { data } = await supabase.from('rol_permisos')
      .select('modulos_visibles, puede_editar_stock, puede_editar_carta')
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
