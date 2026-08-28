'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { useRestauranteId } from './useRestauranteId'
import { AREA_CATALOGO, areaCatalogoItem, type AreaKey, type Capa } from '@/lib/constants'
import { getObjetivosEfectivos, type ObjetivosVenta } from '@/lib/reportes/ventasPorPersona'
import { useAuth } from '@/lib/auth/context'
import { crearNotificacion } from '@/lib/notificaciones/crear'

export type { ObjetivosVenta }

const SWR_OPTS = {
  revalidateOnFocus: false,
  revalidateOnReconnect: true,
  dedupingInterval: 300_000,
  keepPreviousData: true,
} as const

// ── Types ──

export interface Miembro {
  id: string
  auth_user_id: string | null
  nombre: string
  apellido: string
  rol: string
  puesto_id: string | null
  plaza_asignada: string | null
  telefono: string | null
  email: string | null
  fecha_ingreso: string | null
  activo: boolean
  foto_url: string | null
  costo_hora: number | null
  modulos_extra: string[]
  modulos_restringidos: string[]
  /** Override de `puestos.ver_costos` para esta persona. null = hereda del puesto. */
  ver_costos: boolean | null
  objetivos: ObjetivosVenta   // override puntual sobre los objetivos del puesto (PLAN-4-CAPAS B6)
  restaurante_id: string
  created_at: string
}

export interface Turno {
  id: string
  miembro_id: string
  fecha: string
  turno_tipo: string
  hora_entrada: string | null
  hora_salida: string | null
  notas: string | null
  restaurante_id: string
  created_at: string
}

export interface Puesto {
  id: string
  nombre: string
  descripcion: string | null
  tareas_funciones: string[]
  permisos_app: string[]        // ModuloId[]
  nivel: string                 // admin | sous_chef | cocinero | bachero
  plaza_default: string | null
  /** Ve precios, costos, food cost, margen y stock valorizado (PLAN-ACCESO-Y-USO B3). Default false. */
  ver_costos: boolean
  reporta_a_puesto_id: string | null  // organigrama: puesto al que reporta. NULL = raíz
  area_key: string | null             // organigrama: clave de AREA_CATALOGO
  orden: number                        // organigrama: orden manual dentro del área
  objetivos: ObjetivosVenta            // objetivos de venta base del puesto (PLAN-4-CAPAS B6)
  restaurante_id: string
  created_at: string
}

// Puesto con sus hijos directos resueltos, para renderizar el árbol del organigrama.
export interface PuestoNode extends Puesto {
  hijos: PuestoNode[]
}

// Descendientes de un puesto (vía reporta_a_puesto_id) — para no dejar
// elegir como "reporta a" a alguien que ya está debajo en la cadena
// (crearía un loop en el árbol del organigrama).
export function idsDescendientes(id: string, todos: Puesto[]): Set<string> {
  const hijosDirectos = (padreId: string) => todos.filter(p => p.reporta_a_puesto_id === padreId).map(p => p.id)
  const set = new Set<string>()
  const stack = hijosDirectos(id)
  while (stack.length) {
    const actual = stack.pop()!
    if (set.has(actual)) continue
    set.add(actual)
    stack.push(...hijosDirectos(actual))
  }
  return set
}

// Arma el árbol de puestos a partir de reporta_a_puesto_id. Puestos cuyo
// reporta_a_puesto_id apunta a un puesto inexistente (borrado, de otra
// cuenta) caen como raíz en vez de perderse.
export function construirArbolPuestos(puestos: Puesto[]): PuestoNode[] {
  const porId = new Map(puestos.map(p => [p.id, p]))
  const nodos = new Map<string, PuestoNode>(puestos.map(p => [p.id, { ...p, hijos: [] }]))
  const raices: PuestoNode[] = []
  for (const p of puestos) {
    const nodo = nodos.get(p.id)!
    const padreId = p.reporta_a_puesto_id
    if (padreId && porId.has(padreId) && padreId !== p.id) {
      nodos.get(padreId)!.hijos.push(nodo)
    } else {
      raices.push(nodo)
    }
  }
  const porOrden = (a: PuestoNode, b: PuestoNode) => a.orden - b.orden || a.nombre.localeCompare(b.nombre)
  const ordenarRec = (n: PuestoNode) => { n.hijos.sort(porOrden); n.hijos.forEach(ordenarRec) }
  raices.sort(porOrden)
  raices.forEach(ordenarRec)
  return raices
}

// ── Áreas del organigrama ──

export interface AreaRow {
  id: string
  restaurante_id: string
  area_key: string
  activa: boolean
  responsables: string[]   // puede haber más de un responsable (socios, co-chefs)
  orden: number
  created_at: string
}

// Catálogo fijo (AREA_CATALOGO) fusionado con el estado guardado por cuenta.
// Un área sin fila en `areas` todavía existe acá — activa según el default del
// catálogo, sin responsable. Nunca desaparece (ver comentario en la migración).
export interface AreaEstado {
  key: AreaKey
  nombre: string
  icon: string
  color: string
  explicacion: string
  modulos: string[]
  activa: boolean
  responsables: string[]
  orden: number
  guardada: boolean   // false = todavía no tiene fila propia en `areas`
}

// Responsable por (área, capa) — Vista Cobertura. Fila ausente en DB = sin
// asignar: se lee "sin responsable" (alerta) salvo en 'ejecutar', que se lee
// "todo el equipo" por defecto.
export interface AreaCapaRow {
  id: string
  restaurante_id: string
  area_key: string
  capa: Capa
  responsables: string[]
  created_at: string
}

export type TurnoTipo = 'mañana' | 'tarde' | 'noche' | 'franco' | 'vacaciones'

export const TURNO_CONFIG: Record<TurnoTipo, { label: string; fullLabel: string; color: string; bg: string }> = {
  mañana:     { label: 'M', fullLabel: 'Mañana',     color: '#f59e0b', bg: '#fef3c7' },
  tarde:      { label: 'T', fullLabel: 'Tarde',      color: '#3b82f6', bg: '#dbeafe' },
  noche:      { label: 'N', fullLabel: 'Noche',      color: '#4361a0', bg: '#e0e7ff' },
  franco:     { label: 'F', fullLabel: 'Franco',     color: '#6b7280', bg: '#f3f4f6' },
  vacaciones: { label: 'V', fullLabel: 'Vacaciones', color: '#10b981', bg: '#d1fae5' },
}

// ── Niveles de acceso ──

export const NIVELES_ACCESO = [
  { value: 'admin',      label: 'Administrador',   color: '#4361a0' },
  { value: 'sous_chef',  label: 'Jefe de cocina',  color: '#1e3a6e' },
  { value: 'cocinero',   label: 'Cocinero',         color: '#f59e0b' },
  { value: 'bachero',    label: 'Bachero / Ayudante', color: '#6b7280' },
] as const

// ── Templates de puestos pre-definidos ──

export interface PuestoTemplate {
  nombre: string
  descripcion: string
  nivel: string
  plaza_default: string | null
  area_key: AreaKey
  permisos_app: string[]
  tareas_funciones: string[]
  icon: string
}

export const PUESTO_TEMPLATES: PuestoTemplate[] = [
  {
    nombre: 'Chef / Sous Chef',
    descripcion: 'Jefatura de cocina, supervisión general de plazas',
    nivel: 'sous_chef',
    plaza_default: null,
    area_key: 'cocina',
    icon: 'local_fire_department',
    permisos_app: [
      'home', 'operaciones', 'recetario', 'stock', 'pedidos',
      'haccp', 'reportes', 'calendario', 'carta', 'pase',
      'facturas', 'merma', 'equipo', 'ventas',
    ],
    tareas_funciones: [
      'Supervisar todas las plazas', 'Aprobar mise en place', 'Controlar food cost',
      'Gestionar pedidos a proveedores', 'Cerrar turno y pase',
    ],
  },
  {
    nombre: 'Parrillero',
    descripcion: 'Encargado de brasa, fuegos y proteínas',
    nivel: 'cocinero',
    plaza_default: 'parrilla',
    area_key: 'cocina',
    icon: 'outdoor_grill',
    permisos_app: ['home', 'operaciones', 'recetario', 'stock', 'pase', 'carta'],
    tareas_funciones: [
      'Encender y mantener la brasa', 'Mise en place de parrilla',
      'Control de temperaturas de carnes', 'Limpiar estación al cierre',
    ],
  },
  {
    nombre: 'Chef de Fríos',
    descripcion: 'Garde manger, ensaladas, entradas frías y salsas frías',
    nivel: 'cocinero',
    plaza_default: 'frios',
    area_key: 'cocina',
    icon: 'ac_unit',
    permisos_app: ['home', 'operaciones', 'recetario', 'stock', 'pase', 'carta'],
    tareas_funciones: [
      'Mise en place de fríos', 'Preparar entradas y ensaladas',
      'Control de temperatura de heladeras', 'Porcionar y etiquetar',
    ],
  },
  {
    nombre: 'Chef de Calientes',
    descripcion: 'Salsas, fondos, guarniciones y elaboraciones al fuego',
    nivel: 'cocinero',
    plaza_default: 'calientes',
    area_key: 'cocina',
    icon: 'whatshot',
    permisos_app: ['home', 'operaciones', 'recetario', 'stock', 'pase', 'carta'],
    tareas_funciones: [
      'Mise en place de calientes', 'Elaborar fondos y salsas',
      'Preparar guarniciones', 'Mantener temperaturas de servicio',
    ],
  },
  {
    nombre: 'Pastelero',
    descripcion: 'Producción de postres, masas y repostería',
    nivel: 'cocinero',
    plaza_default: 'pasteleria',
    area_key: 'cocina',
    icon: 'cake',
    permisos_app: ['home', 'operaciones', 'recetario', 'stock', 'pase'],
    tareas_funciones: [
      'Mise en place de pastelería', 'Elaborar postres del menú',
      'Control de stock de ingredientes dulces', 'Planificación de producción diaria',
    ],
  },
  {
    nombre: 'Panadero',
    descripcion: 'Producción de panes, masas fermentadas y bollería',
    nivel: 'cocinero',
    plaza_default: 'panaderia',
    area_key: 'cocina',
    icon: 'bakery_dining',
    permisos_app: ['home', 'operaciones', 'recetario', 'stock', 'pase'],
    tareas_funciones: [
      'Elaborar panes del día', 'Controlar fermentaciones', 'Mise en place de panadería',
    ],
  },
  {
    nombre: 'Cocinero Polivalente',
    descripcion: 'Rota entre plazas según necesidad del servicio',
    nivel: 'cocinero',
    plaza_default: null,
    area_key: 'cocina',
    icon: 'soup_kitchen',
    permisos_app: ['home', 'operaciones', 'recetario', 'stock', 'pase', 'carta'],
    tareas_funciones: [
      'Refuerzo en plaza asignada por turno', 'Mise en place general',
      'Apoyo en producción y pase',
    ],
  },
  {
    nombre: 'Bachero / Ayudante',
    descripcion: 'Apoyo operativo, limpieza y tareas de soporte',
    nivel: 'bachero',
    plaza_default: null,
    area_key: 'cocina',
    icon: 'person',
    permisos_app: ['home', 'operaciones', 'pase'],
    tareas_funciones: [
      'Limpieza de cocina', 'Apoyo en mise en place',
      'Lavado de vajilla y ollas', 'Soporte en servicio',
    ],
  },
]

// ── Hook ──

async function fetchMiembrosData(key: string): Promise<Miembro[]> {
  const rid = key.slice('miembros-'.length)
  const supabase = createClient()
  const { data, error } = await supabase
    .from('equipo_miembros')
    .select('*')
    .eq('restaurante_id', rid)
    .eq('activo', true)
    .order('nombre')
  if (error) throw error
  return (data ?? []).map(m => ({
    ...m,
    modulos_extra: m.modulos_extra ?? [],
    modulos_restringidos: m.modulos_restringidos ?? [],
    ver_costos: m.ver_costos ?? null,
    objetivos: m.objetivos ?? {},
  })) as Miembro[]
}

async function fetchPuestosData(key: string): Promise<Puesto[]> {
  const rid = key.slice('puestos-'.length)
  const supabase = createClient()
  const { data, error } = await supabase
    .from('puestos')
    .select('*')
    .eq('restaurante_id', rid)
    .order('nombre')
  if (error) throw error
  return (data ?? []).map(p => ({
    ...p,
    nivel: p.nivel ?? 'cocinero',
    plaza_default: p.plaza_default ?? null,
    reporta_a_puesto_id: p.reporta_a_puesto_id ?? null,
    area_key: p.area_key ?? null,
    orden: p.orden ?? 0,
    tareas_funciones: p.tareas_funciones ?? [],
    permisos_app: p.permisos_app ?? [],
    objetivos: p.objetivos ?? {},
  })) as Puesto[]
}

async function fetchAreasData(key: string): Promise<AreaRow[]> {
  const rid = key.slice('areas-'.length)
  const supabase = createClient()
  const { data, error } = await supabase
    .from('areas')
    .select('*')
    .eq('restaurante_id', rid)
  if (error) throw error
  return (data ?? []) as AreaRow[]
}

async function fetchAreaCapasData(key: string): Promise<AreaCapaRow[]> {
  const rid = key.slice('area-capas-'.length)
  const supabase = createClient()
  const { data, error } = await supabase
    .from('area_capas')
    .select('*')
    .eq('restaurante_id', rid)
  if (error) throw error
  return (data ?? []) as AreaCapaRow[]
}

export function useEquipo() {
  const RESTAURANTE_ID = useRestauranteId()
  const supabase = useMemo(() => createClient(), [])
  const { user } = useAuth()
  const [turnos, setTurnos] = useState<Turno[]>([])
  const [error, setError] = useState<string | null>(null)

  // ── Miembros (SWR) ──
  const { data: miembros = [], isLoading: loading, mutate: mutateMiembros } = useSWR(
    RESTAURANTE_ID ? `miembros-${RESTAURANTE_ID}` : null,
    fetchMiembrosData,
    SWR_OPTS,
  )

  // ── Puestos (SWR) ──
  const { data: puestos = [], mutate: mutatePuestos } = useSWR(
    RESTAURANTE_ID ? `puestos-${RESTAURANTE_ID}` : null,
    fetchPuestosData,
    SWR_OPTS,
  )

  // ── Áreas (SWR) — catálogo fijo fusionado con el estado guardado ──
  const { data: areasRaw = [], mutate: mutateAreas } = useSWR(
    RESTAURANTE_ID ? `areas-${RESTAURANTE_ID}` : null,
    fetchAreasData,
    SWR_OPTS,
  )

  const areas: AreaEstado[] = useMemo(() => AREA_CATALOGO.map(cat => {
    const row = areasRaw.find(a => a.area_key === cat.key)
    return {
      key: cat.key,
      nombre: cat.nombre,
      icon: cat.icon,
      color: cat.color,
      explicacion: cat.explicacion,
      modulos: cat.modulos,
      activa: row?.activa ?? cat.activaPorDefecto,
      responsables: row?.responsables ?? [],
      orden: row?.orden ?? 0,
      guardada: !!row,
    }
  }), [areasRaw])

  const fetchAreas = useCallback(async () => { await mutateAreas() }, [mutateAreas])

  async function upsertAreaEstado(
    area_key: AreaKey,
    patch: Partial<Pick<AreaEstado, 'activa' | 'responsables' | 'orden'>>
  ) {
    const actual = areas.find(a => a.key === area_key)
    const cat = areaCatalogoItem(area_key)
    try {
      const { error } = await supabase.from('areas').upsert({
        restaurante_id: RESTAURANTE_ID,
        area_key,
        activa: patch.activa ?? actual?.activa ?? cat?.activaPorDefecto ?? false,
        responsables: patch.responsables ?? actual?.responsables ?? [],
        orden: patch.orden ?? actual?.orden ?? 0,
      }, { onConflict: 'restaurante_id,area_key' })
      if (error) throw error
      await fetchAreas()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al guardar el área'
      console.error('[useEquipo] upsertAreaEstado Error:', msg)
      throw new Error(msg)
    }
  }

  async function toggleAreaActiva(area_key: AreaKey) {
    const actual = areas.find(a => a.key === area_key)
    await upsertAreaEstado(area_key, { activa: !(actual?.activa ?? false) })
  }

  // Suma o quita a un miembro de la lista de responsables del área — no
  // reemplaza la lista entera, porque puede haber más de un responsable
  // (varios chefs, socios en Dirección).
  async function toggleAreaResponsable(area_key: AreaKey, miembroId: string) {
    const actual = areas.find(a => a.key === area_key)
    const actuales = actual?.responsables ?? []
    const siguientes = actuales.includes(miembroId)
      ? actuales.filter(id => id !== miembroId)
      : [...actuales, miembroId]
    await upsertAreaEstado(area_key, { responsables: siguientes })
  }

  async function setAreaActiva(area_key: AreaKey, activa: boolean) {
    await upsertAreaEstado(area_key, { activa })
  }

  // ── Cobertura (área × capa) — SWR ──
  const { data: areaCapasRaw = [], mutate: mutateAreaCapas } = useSWR(
    RESTAURANTE_ID ? `area-capas-${RESTAURANTE_ID}` : null,
    fetchAreaCapasData,
    SWR_OPTS,
  )

  const fetchAreaCapas = useCallback(async () => { await mutateAreaCapas() }, [mutateAreaCapas])

  const capaResponsables = useCallback((area_key: string, capa: Capa): string[] => {
    return areaCapasRaw.find(r => r.area_key === area_key && r.capa === capa)?.responsables ?? []
  }, [areaCapasRaw])

  async function toggleCapaResponsable(area_key: AreaKey, capa: Capa, miembroId: string) {
    const actuales = capaResponsables(area_key, capa)
    const siguientes = actuales.includes(miembroId)
      ? actuales.filter(id => id !== miembroId)
      : [...actuales, miembroId]
    try {
      const { error } = await supabase.from('area_capas').upsert({
        restaurante_id: RESTAURANTE_ID,
        area_key,
        capa,
        responsables: siguientes,
      }, { onConflict: 'restaurante_id,area_key,capa' })
      if (error) throw error
      await fetchAreaCapas()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al guardar el responsable'
      console.error('[useEquipo] toggleCapaResponsable Error:', msg)
      throw new Error(msg)
    }
  }

  const fetchMiembros = useCallback(async () => { await mutateMiembros() }, [mutateMiembros])

  async function crearMiembro(
    datos: Omit<Miembro, 'id' | 'restaurante_id' | 'created_at' | 'activo' | 'modulos_extra' | 'modulos_restringidos' | 'ver_costos' | 'objetivos'>
  ): Promise<string> {
    try {
      const { data, error } = await supabase.from('equipo_miembros').insert({
        ...datos,
        activo: true,
        modulos_extra: [],
        modulos_restringidos: [],
        objetivos: {},
        restaurante_id: RESTAURANTE_ID,
      }).select('id').single()
      if (error) throw error
      await fetchMiembros()
      return data.id as string
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al crear miembro'
      console.error('[useEquipo] crearMiembro Error:', msg)
      throw new Error(msg)
    }
  }

  async function actualizarMiembro(id: string, datos: Partial<Omit<Miembro, 'id' | 'restaurante_id' | 'created_at'>>) {
    try {
      const { error } = await supabase
        .from('equipo_miembros')
        .update(datos)
        .eq('id', id)
      if (error) throw error
      await fetchMiembros()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al actualizar miembro'
      console.error('[useEquipo] actualizarMiembro Error:', msg)
      throw new Error(msg)
    }
  }

  // `ver_costos`: null = hereda del puesto. Viaja junto a los overrides de
  // modulos porque se edita en la misma pantalla ("Personalizar" de la ficha).
  async function actualizarOverridesMiembro(id: string, modulos_extra: string[], modulos_restringidos: string[], ver_costos: boolean | null = null) {
    try {
      const { error } = await supabase
        .from('equipo_miembros')
        .update({ modulos_extra, modulos_restringidos, ver_costos })
        .eq('id', id)
      if (error) throw error
      mutateMiembros(prev => (prev ?? []).map(m => m.id === id ? { ...m, modulos_extra, modulos_restringidos, ver_costos } : m), { revalidate: false })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al actualizar permisos del miembro'
      console.error('[useEquipo] actualizarOverridesMiembro Error:', msg)
      throw new Error(msg)
    }
  }

  async function desactivarMiembro(id: string) {
    try {
      const { error } = await supabase
        .from('equipo_miembros')
        .update({ activo: false })
        .eq('id', id)
      if (error) throw error
      mutateMiembros((prev) => (prev ?? []).filter((m) => m.id !== id), { revalidate: false })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al desactivar miembro'
      console.error('[useEquipo] desactivarMiembro Error:', msg)
      throw new Error(msg)
    }
  }

  // ── Turnos ──

  const fetchTurnos = useCallback(async (weekStart: string, weekEnd: string) => {
    try {
      const { data, error } = await supabase
        .from('turnos')
        .select('*')
        .eq('restaurante_id', RESTAURANTE_ID)
        .gte('fecha', weekStart)
        .lte('fecha', weekEnd)
      if (error) throw error
      setTurnos(data ?? [])
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al cargar turnos'
      console.error('[useEquipo] fetchTurnos Error:', msg)
      setError(msg)
    }
  }, [RESTAURANTE_ID, supabase])

  const fetchTurnosMes = useCallback(async (mes: number, anio: number): Promise<Turno[]> => {
    if (!RESTAURANTE_ID) return []
    const desde = `${anio}-${String(mes).padStart(2, '0')}-01`
    const lastDay = new Date(anio, mes, 0).getDate()
    const hasta = `${anio}-${String(mes).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    try {
      const { data, error } = await supabase
        .from('turnos')
        .select('*')
        .eq('restaurante_id', RESTAURANTE_ID)
        .gte('fecha', desde)
        .lte('fecha', hasta)
      if (error) throw error
      return (data ?? []) as Turno[]
    } catch {
      return []
    }
  }, [RESTAURANTE_ID, supabase])

  async function asignarTurno(miembro_id: string, fecha: string, turno_tipo: TurnoTipo) {
    try {
      const { error } = await supabase
        .from('turnos')
        .upsert(
          { miembro_id, fecha, turno_tipo, restaurante_id: RESTAURANTE_ID },
          { onConflict: 'miembro_id,fecha' }
        )
      if (error) throw error

      // Avisar a la persona asignada — no a quien se asigna a sí mismo, y
      // solo si su cuenta ya está vinculada (auth_user_id null = invitación
      // sin aceptar todavía). Best-effort, no bloquea el flujo de arriba.
      const destino = miembros.find(m => m.id === miembro_id)
      if (RESTAURANTE_ID && destino?.auth_user_id && destino.auth_user_id !== user?.id) {
        const fechaLabel = new Date(fecha + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'short' })
        crearNotificacion(supabase, {
          restauranteId: RESTAURANTE_ID,
          usuarioId: destino.auth_user_id,
          tipo: 'turno_asignado',
          titulo: `Turno ${TURNO_CONFIG[turno_tipo].fullLabel.toLowerCase()} asignado`,
          cuerpo: `Para el ${fechaLabel}`,
          link: '/turnos',
        })
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al asignar turno'
      console.error('[useEquipo] asignarTurno Error:', msg)
      throw new Error(msg)
    }
  }

  async function limpiarTurno(miembro_id: string, fecha: string) {
    try {
      const { error } = await supabase
        .from('turnos')
        .delete()
        .eq('miembro_id', miembro_id)
        .eq('fecha', fecha)
      if (error) throw error
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al limpiar turno'
      console.error('[useEquipo] limpiarTurno Error:', msg)
    }
  }

  // ── Puestos ──

  const fetchPuestos = useCallback(async () => { await mutatePuestos() }, [mutatePuestos])

  async function crearPuesto(
    datos: Omit<Puesto, 'id' | 'restaurante_id' | 'created_at'>
  ): Promise<string> {
    try {
      const { data, error } = await supabase.from('puestos').insert({
        ...datos,
        restaurante_id: RESTAURANTE_ID,
      }).select('id').single()
      if (error) throw error
      await fetchPuestos()
      return data.id as string
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al crear puesto'
      console.error('[useEquipo] crearPuesto Error:', msg)
      throw new Error(msg)
    }
  }

  async function actualizarPuesto(id: string, datos: Partial<Omit<Puesto, 'id' | 'restaurante_id' | 'created_at'>>) {
    try {
      const { error } = await supabase
        .from('puestos')
        .update(datos)
        .eq('id', id)
      if (error) throw error
      await fetchPuestos()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al actualizar puesto'
      console.error('[useEquipo] actualizarPuesto Error:', msg)
      throw new Error(msg)
    }
  }

  async function eliminarPuesto(id: string) {
    try {
      const { error } = await supabase
        .from('puestos')
        .delete()
        .eq('id', id)
      if (error) throw error
      mutatePuestos(prev => (prev ?? []).filter(p => p.id !== id), { revalidate: false })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al eliminar puesto'
      console.error('[useEquipo] eliminarPuesto Error:', msg)
      throw new Error(msg)
    }
  }

  // Calcula los módulos efectivos de un miembro combinando puesto + overrides
  function getModulosMiembro(miembro: Miembro): string[] {
    const puesto = puestos.find(p => p.id === miembro.puesto_id)
    const base = puesto?.permisos_app ?? []
    const conExtras = [...new Set([...base, ...miembro.modulos_extra])]
    return conExtras.filter(m => !miembro.modulos_restringidos.includes(m))
  }

  // Objetivos de venta efectivos de un miembro: los del puesto, pisados clave
  // por clave por su override propio (PLAN-4-CAPAS B6).
  function getObjetivosMiembro(miembro: Miembro): ObjetivosVenta {
    const puesto = puestos.find(p => p.id === miembro.puesto_id)
    return getObjetivosEfectivos(puesto?.objetivos, miembro.objetivos)
  }

  // ── Realtime + init ──

  useEffect(() => {
    if (!RESTAURANTE_ID) return
    const chMiembros = supabase
      .channel(`equipo-miembros-rt-${RESTAURANTE_ID}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'equipo_miembros' }, () => mutateMiembros())
      .subscribe()

    return () => {
      supabase.removeChannel(chMiembros)
    }
  }, [RESTAURANTE_ID, supabase, mutateMiembros])

  return {
    miembros,
    turnos,
    puestos,
    loading,
    error,
    fetchMiembros,
    crearMiembro,
    actualizarMiembro,
    actualizarOverridesMiembro,
    desactivarMiembro,
    fetchTurnos,
    fetchTurnosMes,
    asignarTurno,
    limpiarTurno,
    fetchPuestos,
    crearPuesto,
    actualizarPuesto,
    eliminarPuesto,
    getModulosMiembro,
    getObjetivosMiembro,
    areas,
    fetchAreas,
    toggleAreaActiva,
    setAreaActiva,
    toggleAreaResponsable,
    capaResponsables,
    toggleCapaResponsable,
  }
}
