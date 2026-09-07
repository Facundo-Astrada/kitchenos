// Constantes, tipos de form y estilos compartidos entre FichaMiembro.tsx y
// PuestosEditor.tsx (movido de turnos/page.tsx, S6 sep 2026 — la ficha del
// equipo y el editor de puestos migraron de Turnos a Organigrama).

import { NIVELES_ACCESO, type ObjetivosVenta } from '@/lib/hooks/useEquipo'

export const PLAZAS_OPS = ['parrilla', 'frios', 'calientes', 'pase', 'pasteleria', 'panaderia', 'linea']

// Módulos que el dueño puede asignar a un puesto.
// Debe cubrir todo ModuloId gateado en SidebarNav (SECCIONES) — 'coach' queda
// afuera a propósito: no está en RUTA_A_MODULO, el FAB/pantalla son siempre
// accesibles sin importar permisos (ver lib/coach).
export const MODULOS_ASIGNABLES = [
  'home', 'operaciones', 'tareas', 'checklist', 'recetario', 'stock', 'pedidos',
  'haccp', 'reportes', 'calendario', 'turnos', 'proveedores', 'carta', 'pase',
  'facturas', 'produccion', 'merma', 'equipo', 'organigrama', 'configuracion',
  'ventas', 'espacios', 'salon', 'kds', 'clientes', 'muro', 'bitacora', 'reservas',
] as const

export function getInitials(nombre: string, apellido: string) {
  return ((nombre?.[0] ?? '') + (apellido?.[0] ?? '')).toUpperCase()
}

export function nivelLabel(nivel: string) {
  return NIVELES_ACCESO.find(n => n.value === nivel)?.label ?? nivel
}
export function nivelColor(nivel: string) {
  return NIVELES_ACCESO.find(n => n.value === nivel)?.color ?? '#6b7280'
}

// ── Estilos compartidos ──

export const fieldStyle: React.CSSProperties = {
  width: '100%', padding: '12px 14px', borderRadius: 12,
  border: '1px solid var(--border)', background: 'var(--surface)',
  color: 'var(--text-1)', fontSize: 14, outline: 'none', boxSizing: 'border-box',
}
export const labelStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 4, display: 'block',
}
export const btnPrimary: React.CSSProperties = {
  padding: '12px 20px', borderRadius: 12, background: 'var(--navy)',
  color: '#fff', fontSize: 14, fontWeight: 600, border: 'none', cursor: 'pointer',
  width: '100%', textAlign: 'center',
}
export const btnSecondary: React.CSSProperties = {
  padding: '12px 20px', borderRadius: 12, background: 'var(--surface)',
  color: 'var(--text-1)', fontSize: 14, fontWeight: 600,
  border: '1px solid var(--border)', cursor: 'pointer', width: '100%', textAlign: 'center',
}
export const btnDanger: React.CSSProperties = {
  padding: '12px 20px', borderRadius: 12, background: '#fee2e2',
  color: '#dc2626', fontSize: 14, fontWeight: 600, border: 'none',
  cursor: 'pointer', width: '100%', textAlign: 'center',
}

// ── Types de form ──

// Prendas comunes en una cocina — set fijo y chico, no un editor de items
// arbitrarios: alcanza para lo que un encargado presta de verdad y evita una
// UI de agregar/quitar filas para un caso de uso tan chico.
export const PRENDAS_UNIFORME: { key: string; label: string }[] = [
  { key: 'chaqueta', label: 'Chaqueta' },
  { key: 'pantalon', label: 'Pantalón' },
  { key: 'delantal', label: 'Delantal' },
  { key: 'gorro', label: 'Gorro' },
]

export function uniformeFormFromRecord(u: Record<string, number> | null): Record<string, string> {
  const form: Record<string, string> = {}
  for (const { key } of PRENDAS_UNIFORME) form[key] = u?.[key] != null ? String(u[key]) : ''
  return form
}

// Guarda {} (no null) cuando se pasa por acá: el form se completó a mano, ya
// no es "nunca se cargó" — ver el comentario de NULL vs {} en columnas.md.
export function uniformeRecordFromForm(f: Record<string, string>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const { key } of PRENDAS_UNIFORME) {
    const n = parseInt(f[key], 10)
    if (f[key] !== '' && !Number.isNaN(n) && n > 0) out[key] = n
  }
  return out
}

export interface MiembroForm {
  nombre: string; apellido: string; rol: string; puesto_id: string
  plaza_asignada: string; telefono: string; email: string; fecha_ingreso: string
  costo_hora: string; foto_url: string | null
  observaciones: string
  uniforme: Record<string, string>
}
export const EMPTY_MIEMBRO_FORM: MiembroForm = {
  nombre: '', apellido: '', rol: '', puesto_id: '',
  plaza_asignada: '', telefono: '', email: '', fecha_ingreso: '',
  costo_hora: '', foto_url: null,
  observaciones: '', uniforme: uniformeFormFromRecord(null),
}

export interface PuestoForm {
  nombre: string; descripcion: string; nivel: string
  plaza_default: string; permisos_app: string[]; ver_costos: boolean; tareas_funciones: string
  area_key: string; reporta_a_puesto_id: string
  obj_pct_postre: string; obj_pct_cafe: string; obj_ticket_promedio: string
}
export const EMPTY_PUESTO_FORM: PuestoForm = {
  nombre: '', descripcion: '', nivel: 'cocinero',
  plaza_default: '', permisos_app: [], ver_costos: false, tareas_funciones: '',
  area_key: '', reporta_a_puesto_id: '',
  obj_pct_postre: '', obj_pct_cafe: '', obj_ticket_promedio: '',
}

// Objetivos de venta (PLAN-4-CAPAS B6): inputs de texto en el form (como
// costo_hora en MiembroForm), se parsean a número solo si se cargaron —
// campo vacío = sin objetivo para esa métrica, no se fuerza un 0.
export function objetivosDeForm(f: PuestoForm): ObjetivosVenta {
  const obj: ObjetivosVenta = {}
  if (f.obj_pct_postre !== '') obj.pct_comandas_con_postre = parseFloat(f.obj_pct_postre)
  if (f.obj_pct_cafe !== '') obj.pct_comandas_con_cafe = parseFloat(f.obj_pct_cafe)
  if (f.obj_ticket_promedio !== '') obj.ticket_promedio = parseFloat(f.obj_ticket_promedio)
  return obj
}
