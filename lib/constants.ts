import type { Rol, Plaza, PlazaCustom } from '@/types'

// ── Plazas fijas (fuente única, compartida por checklist/mise y espacios) ──
export const PLAZAS_FIJAS: Plaza[] = ['parrilla', 'frios', 'calientes', 'pase', 'pasteleria', 'panaderia', 'general']
export const PLAZA_LABELS: Record<Plaza, string> = {
  parrilla: 'Parrilla', frios: 'Fríos', calientes: 'Calientes',
  pase: 'Pase', pasteleria: 'Pastelería', panaderia: 'Panadería',
  general: 'General', menu: 'Menú',
}
export const PLAZA_ICONS: Record<Plaza, string> = {
  parrilla: 'local_fire_department', frios: 'ac_unit', calientes: 'soup_kitchen',
  pase: 'room_service', pasteleria: 'cake', panaderia: 'bakery_dining',
  general: 'groups', menu: 'restaurant_menu',
}
export const PLAZA_COLORS: Record<Plaza, string> = {
  // Azul a propósito, distinto del resto: "general" no es una plaza física
  // como las demás, así que se destaca para que se lea como especial.
  general: '#2563eb', parrilla: '#ef4444', frios: '#0ea5e9', calientes: '#f97316',
  pase: '#8b5cf6', pasteleria: '#ec4899', panaderia: '#84cc16',
  // 'menu' tampoco es una plaza física: es la plaza de control de un menú
  // activado en el mise (ver lib/ops/menuMise.ts). Ámbar — mismo color que
  // "Todo" en OpsToggle (Carta+Menú+Evento combinado): es el mismo concepto
  // de "agregado", no una plaza real, y ámbar no pisa a ninguna plaza física
  // (Calientes es naranja, no ámbar — se leen distintos uno al lado del
  // otro). Nunca entra a PLAZAS_FIJAS/todasLasPlazas: no es una columna real
  // de Espacios/Mesa de Trabajo/Producción por plaza, solo aparece como
  // opción en el selector del mise cuando hay ítems ahí.
  menu: '#f59e0b',
}
// Plazas de cocina usadas para sembrar el espacio "Cocina" por defecto
export const PLAZAS_COCINA: Plaza[] = ['parrilla', 'frios', 'calientes', 'pase', 'pasteleria', 'panaderia', 'general']

// ── Plazas fijas + custom (por restaurante, ver usePlazasCustom) ───────────
// Toda pantalla que liste/etiquete plazas (Mesa de Trabajo, Mise, OPS Panel,
// Pase, Reportes) debe combinar PLAZAS_FIJAS con las custom del restaurante
// usando estos helpers, para que una plaza creada por el usuario aparezca
// en todos lados sin duplicar la lista de "fijas + custom" en cada pantalla.
export function todasLasPlazas(custom: PlazaCustom[]): Plaza[] {
  return [...PLAZAS_FIJAS, ...custom.map(c => c.key)]
}
export function plazaLabel(key: Plaza, custom: PlazaCustom[]): string {
  return PLAZA_LABELS[key] ?? custom.find(c => c.key === key)?.nombre ?? key
}
export function plazaIcon(key: Plaza, custom: PlazaCustom[]): string {
  return PLAZA_ICONS[key] ?? custom.find(c => c.key === key)?.icono ?? 'category'
}
export function plazaColor(key: Plaza, custom: PlazaCustom[]): string {
  return PLAZA_COLORS[key] ?? custom.find(c => c.key === key)?.color ?? '#6b7280'
}
export function esPlazaCustom(key: Plaza, custom: PlazaCustom[]): boolean {
  return custom.some(c => c.key === key)
}

// ── Configuración de roles ──────────────────────────────────
export const ROL_CONFIG: Record<
  Rol,
  { label: string; color: string; icon: string }
> = {
  admin: {
    label: 'Dueño · Administración',
    color: '#4361a0',
    icon: 'admin_panel_settings',
  },
  chef: {
    label: 'Jefe de cocina · Todas las plazas',
    color: '#1e3a6e',
    icon: 'local_fire_department',
  },
  parrilla: { label: 'Parrilla · Brasa y fuegos', color: '#f97316', icon: 'outdoor_grill' },
  frios: { label: 'Frío · Garde manger', color: '#0ea5e9', icon: 'ac_unit' },
  calientes: { label: 'Caliente · Salsas y fondos', color: '#ef4444', icon: 'whatshot' },
  pase: { label: 'Pase · Despacho y emplatado', color: '#8b5cf6', icon: 'restaurant' },
  pasteleria: { label: 'Pastelería · Producción dulce', color: '#ec4899', icon: 'cake' },
  panaderia: { label: 'Panadería · Producción de panes', color: '#d97706', icon: 'bakery_dining' },
  linea: { label: 'Cocinero · Línea general', color: '#10b981', icon: 'soup_kitchen' },
  ayudante: { label: 'Ayudante · Polivalente', color: '#64748b', icon: 'person' },
}

// ── Módulos disponibles por rol ─────────────────────────────
export type ModuloId =
  | 'home'
  | 'operaciones'
  | 'tareas'
  | 'recetario'
  | 'stock'
  | 'pedidos'
  | 'haccp'
  | 'reportes'
  | 'calendario'
  | 'turnos'
  | 'proveedores'
  | 'carta'
  | 'checklist'
  | 'pase'
  | 'facturas'
  | 'produccion'
  | 'merma'
  | 'equipo'
  | 'organigrama'
  | 'configuracion'
  | 'ventas'
  | 'espacios'
  | 'salon'
  | 'kds'
  | 'clientes'
  | 'coach'
  | 'muro'
  | 'bitacora'
  | 'reservas'
  | 'presupuesto'

export const MODULO_CONFIG: Record<
  ModuloId,
  { label: string; icon: string; href: string }
> = {
  home: { label: 'Inicio', icon: 'home', href: '/' },
  operaciones: { label: 'Ops', icon: 'assignment', href: '/operaciones' },
  tareas: { label: 'Tareas', icon: 'check_circle', href: '/tareas' },
  recetario: { label: 'Recetario', icon: 'menu_book', href: '/recetario' },
  stock: { label: 'Stock', icon: 'inventory_2', href: '/stock' },
  pedidos: { label: 'Pedidos', icon: 'shopping_cart', href: '/pedidos' },
  haccp: { label: 'Limpieza', icon: 'cleaning_services', href: '/haccp' },
  reportes: { label: 'Reportes', icon: 'bar_chart', href: '/reportes' },
  presupuesto: { label: 'Presupuesto', icon: 'account_balance_wallet', href: '/presupuesto' },
  calendario: { label: 'Calendario', icon: 'calendar_month', href: '/calendario' },
  turnos: { label: 'Turnos', icon: 'schedule', href: '/turnos' },
  proveedores: { label: 'Proveedores', icon: 'local_shipping', href: '/proveedores' },
  carta: { label: 'Carta', icon: 'receipt_long', href: '/carta' },
  checklist: { label: 'Plazas', icon: 'playlist_add_check', href: '/checklist' },
  pase: { label: 'Pase', icon: 'swap_horiz', href: '/pase' },
  // Label/ícono actualizados (S6, sep 2026): Pedidos y Proveedores se
  // consolidaron acá como tabs (ver TAB_PERMISO en facturas/page.tsx) — un
  // solo acceso de sidebar para todo el circuito de compras. El id sigue
  // siendo 'facturas' (no se toca el permiso real de nadie); RUTA_A_MODULO
  // ahora acepta facturas/pedidos/proveedores para esta ruta.
  facturas: { label: 'Compras', icon: 'shopping_cart', href: '/facturas' },
  produccion: { label: 'Producción', icon: 'factory', href: '/produccion' },
  merma: { label: 'Merma', icon: 'delete_sweep', href: '/merma' },
  // Label/ícono actualizados (sep 2026, S6): la ficha del equipo, permisos y
  // puestos se mudaron a Organigrama — /turnos quedó solo con la grilla de
  // turnos y el fichaje. El id 'equipo' se deja sin tocar a propósito: es la
  // clave de permiso real en `puestos.permisos_app`/`MODULOS_POR_ROL`
  // (ver RUTA_A_MODULO — cambiar el id exigiría re-otorgar el permiso a mano
  // en cada cuenta existente). Solo cambia lo que se muestra.
  equipo: { label: 'Turnos', icon: 'schedule', href: '/turnos' },
  organigrama: { label: 'Organigrama', icon: 'account_tree', href: '/organigrama' },
  configuracion: { label: 'Config', icon: 'settings', href: '/configuracion' },
  ventas: { label: 'Ventas', icon: 'bar_chart', href: '/ventas' },
  espacios: { label: 'Mesa de trabajo', icon: 'dashboard', href: '/espacios' },
  salon: { label: 'Salón', icon: 'table_restaurant', href: '/salon' },
  kds: { label: 'KDS Cocina', icon: 'kitchen', href: '/kds' },
  clientes: { label: 'Clientes', icon: 'contacts', href: '/clientes' },
  coach: { label: 'Coach', icon: 'forum', href: '/coach' },
  muro: { label: 'Muro', icon: 'view_kanban', href: '/muro' },
  bitacora: { label: 'Bitácora', icon: 'history_edu', href: '/bitacora' },
  reservas: { label: 'Reservas', icon: 'event_seat', href: '/reservas' },
}

// Módulos accesibles por rol (base hardcodeada — se sobrescribe con puestos/permisos del admin)
export const MODULOS_POR_ROL: Record<Rol, ModuloId[]> = {
  admin: [
    'home', 'operaciones', 'recetario', 'stock', 'pedidos',
    'haccp', 'reportes', 'presupuesto', 'calendario',
    'carta', 'pase', 'facturas', 'merma', 'equipo', 'organigrama', 'configuracion', 'ventas', 'espacios',
    'salon', 'kds', 'clientes', 'muro', 'bitacora', 'reservas',
  ],
  chef: [
    'home', 'operaciones', 'recetario', 'stock', 'pedidos',
    'haccp', 'reportes', 'presupuesto', 'calendario',
    'carta', 'pase', 'facturas', 'merma', 'equipo', 'organigrama', 'ventas', 'espacios',
    'salon', 'kds', 'clientes', 'muro', 'bitacora', 'reservas',
  ],
  parrilla:   ['home', 'operaciones', 'recetario', 'stock', 'pase', 'carta', 'merma', 'calendario', 'haccp'],
  frios:      ['home', 'operaciones', 'recetario', 'stock', 'pase', 'carta', 'merma', 'calendario', 'haccp'],
  calientes:  ['home', 'operaciones', 'recetario', 'stock', 'pase', 'carta', 'merma', 'calendario', 'haccp'],
  pase:       ['home', 'operaciones', 'carta', 'pase', 'merma', 'calendario'],
  pasteleria: ['home', 'operaciones', 'recetario', 'stock', 'pase', 'merma', 'calendario', 'haccp'],
  panaderia:  ['home', 'operaciones', 'recetario', 'stock', 'pase', 'merma', 'calendario', 'haccp'],
  linea:      ['home', 'operaciones', 'recetario', 'stock', 'pase', 'merma', 'calendario', 'haccp'],
  ayudante:   ['home', 'operaciones', 'pase', 'merma', 'calendario'],
}

// ── Seed de rol_permisos para un restaurante nuevo ──────────
// Ojo con la taxonomía: las claves son los roles de DB (`rol_permisos.rol`,
// `user_restaurantes.rol`), NO el tipo `Rol` de la app que usa MODULOS_POR_ROL
// de arriba. `mapRol()` en lib/auth/context.tsx traduce de una a la otra.
//
// Vive acá y tipado como ModuloId[] por un bug real (ago 2026): el seed estaba
// inline en `signUp` con strings sueltos y decía 'inicio' donde la ruta '/'
// pide 'home' (ver RUTA_A_MODULO abajo). Resultado: todo cocinero/bachero/
// compras que dependiera de este fallback no podía entrar al dashboard —
// RouteGuard le mostraba "Sin acceso a home". Tipado, TypeScript lo agarra.
export const TODOS_LOS_MODULOS: ModuloId[] = [
  'home', 'operaciones', 'tareas', 'recetario', 'stock', 'carta', 'checklist', 'pase',
  'pedidos', 'proveedores', 'facturas', 'reportes', 'presupuesto', 'turnos', 'calendario',
  'haccp', 'equipo', 'configuracion', 'produccion', 'merma', 'ventas',
]

export const MODULOS_SEED_POR_ROL_DB: Record<string, ModuloId[]> = {
  admin: TODOS_LOS_MODULOS,
  sous_chef: TODOS_LOS_MODULOS.filter(m => m !== 'configuracion'),
  // 'operaciones' es obligatorio para cualquiera que trabaje en cocina: las
  // rutas /tareas, /checklist y /produccion mapean todas a ese módulo desde la
  // consolidación de OPS. Sin él, el cocinero no entra a su pantalla principal.
  cocinero: ['home', 'operaciones', 'tareas', 'recetario', 'stock', 'checklist', 'pase', 'produccion'],
  bachero: ['home', 'operaciones', 'tareas', 'checklist', 'pase'],
  compras: ['home', 'stock', 'pedidos', 'proveedores', 'facturas', 'calendario'],
}

// ── Modo Emprendimiento — subconjunto de módulos para productores ──
// (VOGLIO Farina, caso piloto). Restaurantes con
// `restaurantes.configuracion.perfil === 'emprendimiento'` ven SOLO estos
// módulos, incluso siendo admin. Ver lib/hooks/usePermisos.ts (moduloEnPerfil).
export const MODULOS_EMPRENDIMIENTO: ModuloId[] = [
  'home', 'espacios', 'tareas', 'recetario', 'carta', 'produccion',
  'stock', 'facturas', 'proveedores', 'pedidos', 'merma', 'reportes', 'presupuesto', 'ventas', 'clientes',
  'calendario', 'equipo', 'organigrama', 'configuracion', 'coach', 'pase', 'haccp',
]

// ── Nav inferior (4 ítems fijos) ────────────────────────────
export const NAV_ITEMS: ModuloId[] = ['home', 'operaciones', 'recetario', 'stock']

// ── Mapeo ruta → módulo (para protección de rutas) ──────────
// Un valor string[] es OR: entra con cualquiera de esos permisos (ver
// RouteGuard.tsx). Usado por /facturas/pedidos/proveedores desde la
// consolidación en Compras (S6, sep 2026) — hay puestos reales con 'pedidos'
// pero sin 'facturas'/'proveedores' (o viceversa), así que la ruta entra con
// cualquiera de los tres; qué tabs se VEN adentro lo decide cada permiso por
// separado (facturas/page.tsx filtra MAIN_TABS con puedeVer()).
export const RUTA_A_MODULO: Record<string, string | string[]> = {
  '/': 'home',
  '/operaciones': 'operaciones',
  '/recetario': 'recetario',
  '/stock': 'stock',
  '/pedidos': ['facturas', 'pedidos', 'proveedores'],
  '/haccp': 'haccp',
  '/reportes': 'reportes',
  '/presupuesto': 'presupuesto',
  '/calendario': 'calendario',
  '/turnos': 'equipo',
  '/organigrama': 'organigrama',
  '/proveedores': ['facturas', 'pedidos', 'proveedores'],
  '/carta': 'carta',
  '/pase': 'pase',
  '/facturas': ['facturas', 'pedidos', 'proveedores'],
  '/configuracion': 'configuracion',
  '/merma': 'merma',
  '/ventas': 'ventas',
  '/espacios': 'espacios',
  '/salon': 'salon',
  '/kds': 'kds',
  '/clientes': 'clientes',
  '/muro': 'muro',
  '/bitacora': 'bitacora',
  '/reservas': 'reservas',
  // /perfil — not listed: modulo = undefined → always accessible
  // /tareas, /checklist, /produccion — rutas viejas: redirigen a /operaciones (tab correspondiente).
  // La vista real vive embebida en OPS. Mapeadas a 'operaciones' por consistencia de permisos.
  '/tareas': 'operaciones',
  '/checklist': 'operaciones',
  // /lineup — la ficha que se lee antes de abrir el servicio. No tiene ModuloId
  // propio a propósito: es la apertura del turno, así que cae bajo 'operaciones'
  // y ningún puesto ya creado necesita backfill de permisos para verla.
  '/lineup': 'operaciones',
  '/produccion': 'operaciones',
  // /control-carta (PLAN-4-CAPAS B7) — sin ítem de nav propio, se llega por el
  // CTA de OPS en la ventana previa a la apertura. Mismo gate que OPS.
  '/control-carta': 'operaciones',
}

// ── Catálogo de áreas (organigrama) ─────────────────────────
// 12 funciones organizacionales fijas: dirección, cocina, salón, compras y
// almacén, calidad y seguridad alimentaria, administración, comercial y
// reservas, RRHH, desarrollo de producto, sistemas, marketing e
// infraestructura. Fuente única del catálogo — la tabla `areas` en Supabase
// solo guarda estado por restaurante (activa, responsable, orden), nunca el
// catálogo en sí. Un negocio chico no tiene departamentos formales, pero las
// funciones existen igual y las termina cubriendo menos gente — por eso un
// área inactiva sigue en el catálogo con su explicación, nunca desaparece.
export type AreaKey =
  | 'direccion'
  | 'cocina'
  | 'salon'
  | 'compras_almacen'
  | 'calidad_seguridad'
  | 'administracion'
  | 'comercial_reservas'
  | 'rrhh'
  | 'id_producto'
  | 'sistemas'
  | 'marketing'
  | 'infraestructura'

export interface AreaCatalogoItem {
  key: AreaKey
  nombre: string
  icon: string
  color: string
  explicacion: string
  /**
   * Módulos que esta área **posee**: es la única que responde por ellos y la
   * única a la que se le avisa cuando algo falta (ver `responsableDeModulo()`).
   *
   * Invariante: cada `ModuloId` aparece como propio en **exactamente un** área.
   * Lo garantiza el test de `constants.test.ts` — si agregás un módulo nuevo y
   * no lo ponés acá, el test falla antes que la ruta de implantación se quede
   * sin a quién avisarle (sep 2026: `presupuesto`, `organigrama`, `tareas` y
   * `turnos` estaban huérfanos y por eso no tenían responsable posible).
   */
  modulos: ModuloId[]
  /**
   * Módulos que esta área **usa** pero no posee. Se muestran en Estructura para
   * que se entienda el alcance real del área, pero no generan responsabilidad ni
   * avisos: de eso responde el área dueña.
   *
   * Existe porque 5 módulos vivían en dos áreas a la vez (`facturas`, `reportes`,
   * `recetario`, `clientes`, `configuracion`) y un aviso que sale a dos personas
   * no lo atiende ninguna.
   */
  modulosUsa?: ModuloId[]
  activaPorDefecto: boolean
}

export const AREA_CATALOGO: AreaCatalogoItem[] = [
  {
    key: 'direccion', nombre: 'Dirección', icon: 'explore', color: '#4361a0',
    explicacion: 'Toma de decisiones final, filosofía del negocio, finanzas y presupuesto.',
    // `presupuesto` estaba huérfano (sep 2026): es el estándar declarado del
    // negocio, lo fija Dirección. `configuracion` y `reportes` son suyos aunque
    // Sistemas y Administración también los usen.
    modulos: ['home', 'reportes', 'ventas', 'configuracion', 'presupuesto'], activaPorDefecto: true,
  },
  {
    key: 'cocina', nombre: 'Cocina', icon: 'local_fire_department', color: '#ef4444',
    explicacion: 'Producción, mise en place, escandallos, plazas y pase — el corazón operativo.',
    modulos: ['operaciones', 'tareas', 'produccion', 'pase', 'checklist', 'espacios', 'muro'], activaPorDefecto: true,
    // La ficha técnica la define I+D; la cocina la ejecuta todos los días.
    modulosUsa: ['recetario', 'carta'],
  },
  {
    key: 'salon', nombre: 'Salón', icon: 'table_restaurant', color: '#8b5cf6',
    explicacion: 'Servicio, rangos, relación con el cliente, cierre de caja.',
    modulos: ['salon', 'kds'], activaPorDefecto: false,
    modulosUsa: ['clientes', 'reservas', 'carta'],
  },
  {
    key: 'compras_almacen', nombre: 'Compras y almacén', icon: 'local_shipping', color: '#f97316',
    explicacion: 'Proveedores, recepción, inventario — evita la fuga que puede quebrar el negocio.',
    modulos: ['stock', 'pedidos', 'proveedores', 'facturas', 'merma'], activaPorDefecto: true,
  },
  {
    key: 'calidad_seguridad', nombre: 'Calidad y seguridad alimentaria', icon: 'health_and_safety', color: '#10b981',
    explicacion: 'BPM/HACCP, trazabilidad. Institución constitutiva: sin esto, no operás.',
    modulos: ['haccp', 'bitacora'], activaPorDefecto: true,
  },
  {
    key: 'administracion', nombre: 'Administración', icon: 'account_balance', color: '#0ea5e9',
    explicacion: 'Contabilidad, impuestos, nóminas, pólizas. En equipos chicos la cubre Dirección.',
    // Ninguno propio a propósito: en un restaurante chico esta área no existe y
    // Dirección la cubre. Lee facturas y reportes, pero el aviso va a su dueño.
    modulos: [], activaPorDefecto: false,
    modulosUsa: ['facturas', 'reportes', 'presupuesto'],
  },
  {
    key: 'comercial_reservas', nombre: 'Comercial y reservas', icon: 'calendar_month', color: '#ec4899',
    explicacion: 'Reservas, eventos, no-shows, cartera de clientes.',
    modulos: ['calendario', 'clientes', 'reservas'], activaPorDefecto: false,
  },
  {
    key: 'rrhh', nombre: 'RRHH', icon: 'groups', color: '#1e3a6e',
    explicacion: 'Selección, capacitación, turnos y permisos de acceso por usuario.',
    // `organigrama` y `turnos` estaban huérfanos: son literalmente el trabajo de
    // esta área. `equipo` es el id de permiso real de /turnos (ver MODULO_CONFIG).
    modulos: ['equipo', 'organigrama', 'turnos'], activaPorDefecto: true,
  },
  {
    key: 'id_producto', nombre: 'I+D · desarrollo de producto', icon: 'science', color: '#d97706',
    explicacion: 'Cambios de carta, platos nuevos — el juego de autoría, fuera del servicio.',
    modulos: ['recetario', 'carta'], activaPorDefecto: true,
  },
  {
    key: 'sistemas', nombre: 'Sistemas', icon: 'settings', color: '#64748b',
    explicacion: 'POS, mantenimiento de la app, gestión de datos.',
    // `configuracion` queda en Dirección: Sistemas está apagada por defecto y un
    // módulo cuyo dueño no existe en la mayoría de las cuentas no tiene a quién avisarle.
    modulos: ['coach'], activaPorDefecto: false,
    modulosUsa: ['configuracion'],
  },
  {
    key: 'marketing', nombre: 'Marketing y comunicación', icon: 'campaign', color: '#94a3b8',
    explicacion: 'Redes, prensa, publicidad. Existe como función aunque hoy no tenga módulo propio.',
    modulos: [], activaPorDefecto: false,
  },
  {
    key: 'infraestructura', nombre: 'Infraestructura', icon: 'build', color: '#78716c',
    explicacion: 'Mantenimiento del local, maquinaria e instalaciones. Sin módulo propio todavía.',
    modulos: [], activaPorDefecto: false,
  },
]

export function areaCatalogoItem(key: string): AreaCatalogoItem | undefined {
  return AREA_CATALOGO.find(a => a.key === key)
}

/**
 * El área que **posee** un módulo — la que responde por él y la que recibe el
 * aviso cuando algo de ese módulo falta.
 *
 * Nunca devuelve dos. Si algún día devuelve `undefined`, el módulo quedó
 * huérfano al agregarlo y el test de `constants.test.ts` ya falló.
 */
export function areaDuenaDeModulo(modulo: ModuloId): AreaCatalogoItem | undefined {
  return AREA_CATALOGO.find(a => a.modulos.includes(modulo))
}

/** Áreas que usan el módulo sin poseerlo. Informativo: no genera responsabilidad. */
export function areasQueUsanModulo(modulo: ModuloId): AreaCatalogoItem[] {
  return AREA_CATALOGO.filter(a => a.modulosUsa?.includes(modulo))
}

// ── Capas del ciclo (Vista Cobertura) ────────────────────────
// Definir → Preparar → Ejecutar → Controlar → vuelve a Definir (framework
// propio, ver PLAN-4-CAPAS.md / AUDITORIA-4-CAPAS.md — no reproducir texto
// del material de research de terceros, que es de uso interno). "Ejecutar"
// es la única capa cuyo default sin responsable NO es una alerta: se
// ejecuta en equipo durante el servicio, las otras tres sí necesitan que
// alguien concreto responda.
export type Capa = 'definir' | 'preparar' | 'ejecutar' | 'controlar'

export const CAPAS: { key: Capa; label: string; icon: string; explicacion: string }[] = [
  {
    key: 'definir', label: 'Definir', icon: 'edit_note',
    explicacion: 'El estándar de la temporada: qué se hace y cómo. Se fija una vez y se sostiene hasta el próximo cambio de carta o de proceso.',
  },
  {
    key: 'preparar', label: 'Preparar', icon: 'inventory_2',
    explicacion: 'El trabajo antes de abrir, día a día o semana a semana: compras, mise en place, organización — todo lo que deja el terreno listo.',
  },
  {
    key: 'ejecutar', label: 'Ejecutar', icon: 'bolt',
    explicacion: 'Lo que pasa mientras el local está abierto y atendiendo. Es tarea de todo el que está de turno, no de una sola persona.',
  },
  {
    key: 'controlar', label: 'Controlar', icon: 'fact_check',
    explicacion: 'El cierre y la revisión: qué salió bien, qué faltó, qué hay que ajustar antes de volver a definir el estándar.',
  },
]

// ── Matriz de polivalencia (Organigrama → Polivalencia) ──────
// Escala estándar de la gestión de equipos gastronómicos, no inventada acá.
// El nivel 4 es el que importa de más: es el REFERENTE de esa plaza, la persona
// a la que el resto le pregunta. El research de adopción es claro en que la
// gente consulta a un par de confianza antes que a un jefe o a soporte, así que
// el referente no se designa a dedo — sale de acá.
//
// Se mide cobertura del restaurante, NO rendimiento de la persona
// (ver DECISIONES.md § 25): de esta escala no sale ningún ranking.
export type NivelCompetencia = 0 | 1 | 2 | 3 | 4

export const NIVELES_COMPETENCIA: {
  nivel: NivelCompetencia; label: string; corto: string; color: string; ayuda: string
}[] = [
  { nivel: 0, label: 'Sin formar', corto: 'Sin formar', color: '#94a3b8',
    ayuda: 'No la hizo nunca. No puede quedar solo en esta plaza.' },
  { nivel: 1, label: 'En formación', corto: 'Formándose', color: '#f59e0b',
    ayuda: 'La está aprendiendo. Siempre acompañado.' },
  { nivel: 2, label: 'Con supervisión', corto: 'Supervisado', color: '#f97316',
    ayuda: 'La hace, pero alguien la revisa antes del servicio.' },
  { nivel: 3, label: 'Autónomo', corto: 'Autónomo', color: '#0ea5e9',
    ayuda: 'La hace solo, con el estándar. Puede cubrir el turno.' },
  { nivel: 4, label: 'Referente', corto: 'Referente', color: '#10b981',
    ayuda: 'La hace y la enseña. Es a quien le preguntan en esta plaza.' },
]

export function nivelCompetencia(nivel: number) {
  return NIVELES_COMPETENCIA[Math.max(0, Math.min(4, nivel))]
}

/** Desde qué nivel una persona puede cubrir la plaza sola en un turno. */
export const NIVEL_AUTONOMO: NivelCompetencia = 3
/** El nivel que convierte a alguien en referente (sabe y enseña). */
export const NIVEL_REFERENTE: NivelCompetencia = 4

// ── Colores de prioridad ─────────────────────────────────────
export const PRIORIDAD_CONFIG = {
  SP: { label: 'S/P', bgClass: 'bg-red-100', textClass: 'text-red-500' },
  P: { label: 'P', bgClass: 'bg-orange-100', textClass: 'text-orange-500' },
  R: { label: 'R', bgClass: 'bg-blue-100', textClass: 'text-blue-500' },
  CK: { label: 'CK', bgClass: 'bg-yellow-100', textClass: 'text-yellow-500' },
} as const

// ── Alertas Food Cost ────────────────────────────────────────
export const FC_ALERT_HIGH = 33 // % — rojo
export const FC_ALERT_OK = 25   // % — verde

// ── Primer ingreso (PLAN-ACCESO-Y-USO B4) ───────────────────
// Una línea por módulo, para la carta de bienvenida: qué hace, en el idioma
// de la cocina y no en el del software. Se muestran SOLO los módulos que la
// persona efectivamente ve — enseñar lo que no puede tocar solo enseña a
// pedir permisos.
export const MODULO_DESCRIPCION: Record<ModuloId, string> = {
  home: 'El resumen del día: qué falta, qué está por vencer y por dónde arrancar.',
  operaciones: 'Tu turno: el mise de tu plaza, lo que hay que producir y la planificación.',
  tareas: 'Las tareas del turno, por plaza y prioridad.',
  recetario: 'Las fichas técnicas: ingredientes, pasos y porciones de cada preparación.',
  stock: 'Qué hay en el depósito y en las heladeras, y qué está por faltar.',
  pedidos: 'Los pedidos a proveedores: qué se pidió, qué llegó y qué falta recibir.',
  haccp: 'Los controles de seguridad alimentaria: temperaturas, limpieza y vencimientos.',
  reportes: 'Los números del negocio: ventas, costos y desvíos del período.',
  presupuesto: 'El estándar declarado: cuánto tenés pensado gastar por sector, contra lo que gastaste de verdad.',
  calendario: 'La agenda: entregas, eventos y lo que viene esta semana.',
  turnos: 'La grilla del personal y el fichaje de entrada y salida.',
  proveedores: 'La libreta de proveedores: contacto, días de entrega y precios.',
  carta: 'Los platos que se venden, con su precio y disponibilidad.',
  checklist: 'El recorrido de tu plaza: contás lo que hay y mandás a producir lo que falta.',
  pase: 'El canal entre cocina y salón: 86, avisos y novedades del servicio.',
  facturas: 'Compras: pedidos a proveedores, facturas cargadas por foto o PDF y recepción de mercadería.',
  produccion: 'El tablero de lo que hay que cocinar hoy, columna por plaza.',
  merma: 'El registro del desperdicio: qué se tiró, cuánto y por qué.',
  equipo: 'La grilla del personal y el fichaje de entrada y salida.',
  organigrama: 'Quién es quién: el plantel, los puestos, los permisos y las áreas del negocio.',
  configuracion: 'Los ajustes del restaurante: turnos, plazas, categorías y datos generales.',
  ventas: 'Lo que se vendió: cubiertos, ticket promedio y platos más pedidos.',
  espacios: 'La mesa de trabajo: espacios, plazas y producciones en curso.',
  salon: 'El plano del salón: mesas, estado y ocupación en vivo.',
  kds: 'La pantalla de cocina: las comandas que entran, en orden.',
  clientes: 'Los clientes del restaurante y su historial.',
  coach: 'El asistente: le preguntás cualquier cosa de la app o de tus datos.',
  muro: 'La pantalla grande de la cocina: todo lo que hay que producir, a dos metros.',
  bitacora: 'El registro del día a día: qué pasó en cada turno.',
  reservas: 'Las reservas: quién viene, cuándo y a qué mesa.',
}

// Qué recorrido de `lib/coach/tours.ts` le corresponde a cada ruta. El permiso
// se chequea aparte con RUTA_A_MODULO sobre la misma ruta — un tour nunca
// arranca en una pantalla que la persona no puede ver.
export const RUTA_A_TOUR: Record<string, string> = {
  '/': 'dashboard',
  '/operaciones': 'operaciones',
  '/recetario': 'recetario',
  '/stock': 'stock',
  '/carta': 'carta',
  '/pase': 'pase',
  '/pedidos': 'pedidos',
  '/proveedores': 'proveedores',
  '/facturas': 'facturas',
  '/reportes': 'reportes',
  '/presupuesto': 'presupuesto',
  '/merma': 'merma',
  '/haccp': 'haccp',
  '/calendario': 'calendario',
  '/turnos': 'turnos',
  '/ventas': 'ventas',
  '/salon': 'salon',
  '/clientes': 'clientes',
  '/espacios': 'espacios',
  '/organigrama': 'organigrama',
  '/tareas': 'tareas',
  '/kds': 'kds',
  '/coach': 'coach',
  '/muro': 'muro',
  '/bitacora': 'bitacora',
  '/configuracion': 'configuracion',
}
