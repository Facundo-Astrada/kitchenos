/**
 * Resolución de módulos visibles — la parte pura, compartida.
 *
 * Existía duplicada en `lib/hooks/usePermisos.ts` (cliente) y en
 * `lib/permisos/server.ts` (réplica server-side para el Coach), sincronizadas
 * a mano con un comentario que pedía acordarse. No alcanzó: en agosto 2026 las
 * dos tenían los mismos dos bugs, y uno dejaba usuarios sin poder entrar a la
 * app. Ahora la lógica vive acá y las dos la importan.
 *
 * Lo que NO vive acá: el mapeo de roles (`mapRol` / `toPermisoRol`), que sigue
 * duplicado. Es otra extracción, no la de este fix.
 */

/**
 * Alias legacy del módulo de inicio.
 *
 * El seed de `rol_permisos` escribía 'inicio' en `modulos_visibles`, pero
 * `RUTA_A_MODULO['/']` siempre pidió 'home'. El desfasaje hacía que
 * `puedeVer('home')` diera false y `RouteGuard` mostrara "Sin acceso a home"
 * en el dashboard — los admin nunca lo vieron porque cortan antes por rol.
 *
 * La migración `fix_rol_permisos_inicio_home_y_operaciones` normalizó los datos
 * y el seed quedó tipado como `ModuloId[]`. Esto cubre lo que quede o vuelva a
 * entrar por una carga manual. Se normaliza al LEER; nunca se reescribe la fila.
 */
export const MODULO_HOME_LEGACY = 'inicio'
export const MODULO_HOME = 'home'

/**
 * Módulos efectivos de un miembro con puesto asignado.
 *
 * `null` significa "este miembro no tiene puesto configurado, usá el fallback
 * por rol" — NO "no ve nada". La distinción importa: `puestos.permisos_app` es
 * `NOT NULL DEFAULT '{}'`, así que un puesto recién creado y sin permisos
 * cargados llega como `[]`, que en JS es truthy. Tratarlo como una lista válida
 * dejaba al usuario con cero módulos (bug real, ago 2026: el puesto
 * "Dueño / Dirección" de Bros tenía `permisos_app` vacío; solo se salvó porque
 * su ocupante era admin y `puedeVer` corta antes).
 */
export function resolverModulosEfectivos(opts: {
  permisosApp: string[] | null | undefined
  modulosExtra?: string[] | null
  modulosRestringidos?: string[] | null
}): string[] | null {
  const base = opts.permisosApp ?? []
  if (base.length === 0) return null

  const extra = opts.modulosExtra ?? []
  const restringidos = opts.modulosRestringidos ?? []
  return [...new Set([...base, ...extra])].filter(m => !restringidos.includes(m))
}

/** `true` si la lista habilita el módulo, contemplando el alias legacy de home. */
export function listaIncluyeModulo(lista: readonly string[], modulo: string): boolean {
  if (lista.includes(modulo)) return true
  return modulo === MODULO_HOME && lista.includes(MODULO_HOME_LEGACY)
}

/**
 * La cascada completa: admin → módulos del puesto → fallback por rol.
 *
 * Un admin ve todo y no consulta ninguna lista: es el atajo que durante meses
 * escondió los dos bugs de arriba, porque Facundo probaba siempre como admin.
 */
export function puedeVerModulo(opts: {
  isAdmin: boolean
  /** null = sin puesto configurado → cae al fallback por rol */
  modulosEfectivos: string[] | null
  /** `rol_permisos.modulos_visibles`; null/undefined = sin fila de permisos */
  modulosVisibles: string[] | null | undefined
}, modulo: string): boolean {
  if (opts.isAdmin) return true
  if (opts.modulosEfectivos !== null) return listaIncluyeModulo(opts.modulosEfectivos, modulo)
  if (!opts.modulosVisibles) return false
  return listaIncluyeModulo(opts.modulosVisibles, modulo)
}

/**
 * Si el usuario ve plata: precios de compra, costo de receta, food cost,
 * margen y stock valorizado.
 *
 * Antes era `rol === 'admin'` cableado en cada pantalla, así que el sous chef
 * —que decide porciones y sustituciones todos los días— no veía un solo número
 * de costo. Ahora es un permiso propio, con la misma cascada de 3 capas que
 * los módulos:
 *
 *   1. admin           → siempre, sin mirar nada
 *   2. override persona→ equipo_miembros.ver_costos (null = no hay override)
 *   3. puesto          → puestos.ver_costos
 *   4. sin puesto      → rol_permisos.puede_ver_costos
 *
 * El default de todo es `false`: si nadie lo configuró, la plata no se muestra.
 * Es lo contrario del default de los módulos, y a propósito — equivocarse para
 * el lado de ocultar un costo es barato; para el otro lado, no.
 */
export function puedeVerCostos(opts: {
  isAdmin: boolean
  /** `equipo_miembros.ver_costos`. null/undefined = sin override, hereda. */
  overrideMiembro?: boolean | null
  /** `puestos.ver_costos` del puesto asignado. undefined = no tiene puesto. */
  verCostosPuesto?: boolean | null
  /** `rol_permisos.puede_ver_costos`, solo se usa si no hay puesto. */
  fallbackRol?: boolean | null
}): boolean {
  if (opts.isAdmin) return true
  // El override por persona gana incluso para negar: un puesto que ve costos
  // con una persona puntual que no debe verlos es un caso legítimo.
  if (opts.overrideMiembro != null) return opts.overrideMiembro
  if (opts.verCostosPuesto != null) return opts.verCostosPuesto
  return opts.fallbackRol ?? false
}
