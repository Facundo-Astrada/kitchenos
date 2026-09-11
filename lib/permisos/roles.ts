import type { Rol } from '@/types'

// Mapea el rol crudo de la base (user_restaurantes.rol / equipo_miembros.rol)
// al Rol de la app, resolviendo cocinero/staff con la plaza asignada. Vivía
// duplicado en lib/auth/context.tsx (cliente) y lib/permisos/server.ts
// (réplica server-side para el Coach) — mismo criterio de extracción que
// lib/permisos/resolver.ts (ver su comentario: dos copias sincronizadas a
// mano no alcanzó, terminaron con los mismos dos bugs). Día 10 de
// plan-consolidado.md §2.
/**
 * Los `Rol` que la app sabe dibujar. Existe para que el `default` de `mapRol`
 * no pueda inventar uno.
 *
 * El casteo `dbRol as Rol` que había antes era una promesa que la base no
 * cumple: `equipo_miembros.rol` y `user_restaurantes.rol` son TEXT libre, y
 * cualquier valor fuera de esta lista llegaba igual hasta `MODULOS_POR_ROL[rol]`
 * — que devuelve `undefined` y hace reventar el `.includes()` de `SidebarNav`
 * con un TypeError, no con un sidebar vacío. Hoy los 14 roles cargados en la
 * base mapean todos bien; esto es para el día que alguien agregue el 15º.
 */
const ROLES_VALIDOS: ReadonlySet<string> = new Set<Rol>([
  'admin', 'chef', 'parrilla', 'frios', 'calientes', 'pase',
  'pasteleria', 'panaderia', 'linea', 'ayudante',
])

export function esRolValido(r: string): r is Rol {
  return ROLES_VALIDOS.has(r)
}

export function mapRol(dbRol: string, plaza?: string | null): Rol {
  const plazaMap: Record<string, Rol> = {
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
    // Un rol que la base tiene y la app no conoce cae al más restrictivo, no
    // a un valor inventado: ver mejor de menos que romper la navegación.
    default: return esRolValido(dbRol) ? dbRol : 'ayudante'
  }
}
