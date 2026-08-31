import type { Rol } from '@/types'

// Mapea el rol crudo de la base (user_restaurantes.rol / equipo_miembros.rol)
// al Rol de la app, resolviendo cocinero/staff con la plaza asignada. Vivía
// duplicado en lib/auth/context.tsx (cliente) y lib/permisos/server.ts
// (réplica server-side para el Coach) — mismo criterio de extracción que
// lib/permisos/resolver.ts (ver su comentario: dos copias sincronizadas a
// mano no alcanzó, terminaron con los mismos dos bugs). Día 10 de
// plan-consolidado.md §2.
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
    default: return (dbRol as Rol) || 'ayudante'
  }
}
