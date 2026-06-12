'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { useRestauranteId } from './useRestauranteId'

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
  modulos_extra: string[]
  modulos_restringidos: string[]
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
  tareas_funciones: string[] | null
  permisos_app: string[] | null   // ModuloId[]
  nivel: string                   // admin | sous_chef | cocinero | bachero
  plaza_default: string | null
  restaurante_id: string
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
    permisos_app: p.permisos_app ?? [],
  })) as Puesto[]
}

export function useEquipo() {
  const RESTAURANTE_ID = useRestauranteId()
  const supabase = useMemo(() => createClient(), [])
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

  const fetchMiembros = useCallback(async () => { await mutateMiembros() }, [mutateMiembros])

  async function crearMiembro(
    datos: Omit<Miembro, 'id' | 'restaurante_id' | 'created_at' | 'activo' | 'modulos_extra' | 'modulos_restringidos'>
  ) {
    try {
      const { error } = await supabase.from('equipo_miembros').insert({
        ...datos,
        activo: true,
        modulos_extra: [],
        modulos_restringidos: [],
        restaurante_id: RESTAURANTE_ID,
      })
      if (error) throw error
      await fetchMiembros()
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

  async function actualizarOverridesMiembro(id: string, modulos_extra: string[], modulos_restringidos: string[]) {
    try {
      const { error } = await supabase
        .from('equipo_miembros')
        .update({ modulos_extra, modulos_restringidos })
        .eq('id', id)
      if (error) throw error
      mutateMiembros(prev => (prev ?? []).map(m => m.id === id ? { ...m, modulos_extra, modulos_restringidos } : m), { revalidate: false })
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
  ) {
    try {
      const { error } = await supabase.from('puestos').insert({
        ...datos,
        restaurante_id: RESTAURANTE_ID,
      })
      if (error) throw error
      await fetchPuestos()
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
  }
}
