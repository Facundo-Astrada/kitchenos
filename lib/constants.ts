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
  // activado en el mise (ver lib/ops/menuMise.ts). Índigo — distinto del
  // violeta de Pase, para que no se confundan una al lado de la otra en el
  // selector. Nunca entra a PLAZAS_FIJAS/todasLasPlazas: no es una columna
  // real de Espacios/Mesa de Trabajo/Producción por plaza, solo aparece como
  // opción en el selector del mise cuando hay ítems ahí.
  menu: '#6366f1',
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
  calendario: { label: 'Calendario', icon: 'calendar_month', href: '/calendario' },
  turnos: { label: 'Turnos', icon: 'schedule', href: '/turnos' },
  proveedores: { label: 'Proveedores', icon: 'local_shipping', href: '/proveedores' },
  carta: { label: 'Carta', icon: 'receipt_long', href: '/carta' },
  checklist: { label: 'Plazas', icon: 'playlist_add_check', href: '/checklist' },
  pase: { label: 'Pase', icon: 'swap_horiz', href: '/pase' },
  facturas: { label: 'Facturas', icon: 'description', href: '/facturas' },
  produccion: { label: 'Producción', icon: 'factory', href: '/produccion' },
  merma: { label: 'Merma', icon: 'delete_sweep', href: '/merma' },
  equipo: { label: 'Equipo', icon: 'groups', href: '/turnos' },
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
}

// Módulos accesibles por rol (base hardcodeada — se sobrescribe con puestos/permisos del admin)
export const MODULOS_POR_ROL: Record<Rol, ModuloId[]> = {
  admin: [
    'home', 'operaciones', 'recetario', 'stock', 'pedidos',
    'haccp', 'reportes', 'calendario',
    'carta', 'pase', 'facturas', 'merma', 'equipo', 'organigrama', 'configuracion', 'ventas', 'espacios',
    'salon', 'kds', 'clientes', 'muro', 'bitacora',
  ],
  chef: [
    'home', 'operaciones', 'recetario', 'stock', 'pedidos',
    'haccp', 'reportes', 'calendario',
    'carta', 'pase', 'facturas', 'merma', 'equipo', 'organigrama', 'ventas', 'espacios',
    'salon', 'kds', 'clientes', 'muro', 'bitacora',
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

// ── Modo Emprendimiento — subconjunto de módulos para productores ──
// (VOGLIO Farina, caso piloto). Restaurantes con
// `restaurantes.configuracion.perfil === 'emprendimiento'` ven SOLO estos
// módulos, incluso siendo admin. Ver lib/hooks/usePermisos.ts (moduloEnPerfil).
export const MODULOS_EMPRENDIMIENTO: ModuloId[] = [
  'home', 'espacios', 'tareas', 'recetario', 'carta', 'produccion',
  'stock', 'facturas', 'proveedores', 'pedidos', 'merma', 'reportes', 'ventas', 'clientes',
  'calendario', 'equipo', 'organigrama', 'configuracion', 'coach', 'pase', 'haccp',
]

// ── Nav inferior (4 ítems fijos) ────────────────────────────
export const NAV_ITEMS: ModuloId[] = ['home', 'operaciones', 'recetario', 'stock']

// ── Mapeo ruta → módulo (para protección de rutas) ──────────
export const RUTA_A_MODULO: Record<string, string> = {
  '/': 'home',
  '/operaciones': 'operaciones',
  '/recetario': 'recetario',
  '/stock': 'stock',
  '/pedidos': 'pedidos',
  '/haccp': 'haccp',
  '/reportes': 'reportes',
  '/calendario': 'calendario',
  '/turnos': 'equipo',
  '/organigrama': 'organigrama',
  '/proveedores': 'proveedores',
  '/carta': 'carta',
  '/pase': 'pase',
  '/facturas': 'facturas',
  '/configuracion': 'configuracion',
  '/merma': 'merma',
  '/ventas': 'ventas',
  '/espacios': 'espacios',
  '/salon': 'salon',
  '/kds': 'kds',
  '/clientes': 'clientes',
  '/muro': 'muro',
  '/bitacora': 'bitacora',
  // /perfil — not listed: modulo = undefined → always accessible
  // /tareas, /checklist, /produccion — rutas viejas: redirigen a /operaciones (tab correspondiente).
  // La vista real vive embebida en OPS. Mapeadas a 'operaciones' por consistencia de permisos.
  '/tareas': 'operaciones',
  '/checklist': 'operaciones',
  '/produccion': 'operaciones',
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
  modulos: ModuloId[]
  activaPorDefecto: boolean
}

export const AREA_CATALOGO: AreaCatalogoItem[] = [
  {
    key: 'direccion', nombre: 'Dirección', icon: 'explore', color: '#4361a0',
    explicacion: 'Toma de decisiones final, filosofía del negocio, finanzas y presupuesto.',
    modulos: ['home', 'reportes', 'ventas', 'configuracion'], activaPorDefecto: true,
  },
  {
    key: 'cocina', nombre: 'Cocina', icon: 'local_fire_department', color: '#ef4444',
    explicacion: 'Producción, mise en place, escandallos, plazas y pase — el corazón operativo.',
    modulos: ['operaciones', 'recetario', 'produccion', 'pase', 'checklist', 'espacios', 'muro'], activaPorDefecto: true,
  },
  {
    key: 'salon', nombre: 'Salón', icon: 'table_restaurant', color: '#8b5cf6',
    explicacion: 'Servicio, rangos, relación con el cliente, cierre de caja.',
    modulos: ['salon', 'clientes', 'kds'], activaPorDefecto: false,
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
    modulos: ['facturas', 'reportes'], activaPorDefecto: false,
  },
  {
    key: 'comercial_reservas', nombre: 'Comercial y reservas', icon: 'calendar_month', color: '#ec4899',
    explicacion: 'Reservas, eventos, no-shows, cartera de clientes.',
    modulos: ['calendario', 'clientes'], activaPorDefecto: false,
  },
  {
    key: 'rrhh', nombre: 'RRHH', icon: 'groups', color: '#1e3a6e',
    explicacion: 'Selección, capacitación, turnos y permisos de acceso por usuario.',
    modulos: ['equipo'], activaPorDefecto: true,
  },
  {
    key: 'id_producto', nombre: 'I+D · desarrollo de producto', icon: 'science', color: '#d97706',
    explicacion: 'Cambios de carta, platos nuevos — el juego de autoría, fuera del servicio.',
    modulos: ['recetario', 'carta'], activaPorDefecto: true,
  },
  {
    key: 'sistemas', nombre: 'Sistemas', icon: 'settings', color: '#64748b',
    explicacion: 'POS, mantenimiento de la app, gestión de datos.',
    modulos: ['configuracion', 'coach'], activaPorDefecto: false,
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
