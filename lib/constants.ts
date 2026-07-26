import type { Rol, Plaza } from '@/types'

// ── Plazas fijas (fuente única, compartida por checklist/mise y espacios) ──
export const PLAZAS_FIJAS: Plaza[] = ['parrilla', 'frios', 'calientes', 'pase', 'pasteleria', 'panaderia', 'general']
export const PLAZA_LABELS: Record<Plaza, string> = {
  parrilla: 'Parrilla', frios: 'Fríos', calientes: 'Calientes',
  pase: 'Pase', pasteleria: 'Pastelería', panaderia: 'Panadería',
  general: 'General',
}
export const PLAZA_ICONS: Record<Plaza, string> = {
  parrilla: 'local_fire_department', frios: 'ac_unit', calientes: 'soup_kitchen',
  pase: 'room_service', pasteleria: 'cake', panaderia: 'bakery_dining',
  general: 'groups',
}
// Plazas de cocina usadas para sembrar el espacio "Cocina" por defecto
export const PLAZAS_COCINA: Plaza[] = ['parrilla', 'frios', 'calientes', 'pase', 'pasteleria', 'panaderia', 'general']

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
  | 'configuracion'
  | 'ventas'
  | 'espacios'
  | 'salon'
  | 'kds'
  | 'clientes'
  | 'coach'

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
  configuracion: { label: 'Config', icon: 'settings', href: '/configuracion' },
  ventas: { label: 'Ventas', icon: 'bar_chart', href: '/ventas' },
  espacios: { label: 'Mesa de trabajo', icon: 'dashboard', href: '/espacios' },
  salon: { label: 'Salón', icon: 'table_restaurant', href: '/salon' },
  kds: { label: 'KDS Cocina', icon: 'kitchen', href: '/kds' },
  clientes: { label: 'Clientes', icon: 'contacts', href: '/clientes' },
  coach: { label: 'Coach', icon: 'forum', href: '/coach' },
}

// Módulos accesibles por rol (base hardcodeada — se sobrescribe con puestos/permisos del admin)
export const MODULOS_POR_ROL: Record<Rol, ModuloId[]> = {
  admin: [
    'home', 'operaciones', 'recetario', 'stock', 'pedidos',
    'haccp', 'reportes', 'calendario',
    'carta', 'pase', 'facturas', 'merma', 'equipo', 'configuracion', 'ventas', 'espacios',
    'salon', 'kds', 'clientes',
  ],
  chef: [
    'home', 'operaciones', 'recetario', 'stock', 'pedidos',
    'haccp', 'reportes', 'calendario',
    'carta', 'pase', 'facturas', 'merma', 'equipo', 'ventas', 'espacios',
    'salon', 'kds', 'clientes',
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
  'home', 'stock', 'proveedores', 'recetario', 'carta', 'produccion',
  'pedidos', 'ventas', 'reportes', 'merma', 'facturas', 'configuracion', 'coach',
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
  // /perfil — not listed: modulo = undefined → always accessible
  // /tareas, /checklist, /produccion — rutas viejas: redirigen a /operaciones (tab correspondiente).
  // La vista real vive embebida en OPS. Mapeadas a 'operaciones' por consistencia de permisos.
  '/tareas': 'operaciones',
  '/checklist': 'operaciones',
  '/produccion': 'operaciones',
}

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
