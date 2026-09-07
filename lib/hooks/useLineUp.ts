'use client'
/**
 * Junta lo que va en la ficha de line-up (`lib/ops/lineup.ts`).
 *
 * Hook dedicado y no una suma de `useCarta()` + `useTareas()` + `useStock()` +
 * `useCalendario()` a propósito: montar cinco hooks completos para leer seis
 * listas cortas trae la carta entera con costeo, el stock entero y el mes de
 * calendario — ver `.claude/docs/hooks.md` § "Peso de la pantalla". Acá se
 * piden solo las columnas que se leen en voz alta.
 *
 * Todas las consultas son de solo lectura y van en paralelo. Si una falla, la
 * ficha se arma igual sin ese bloque: es mejor un line-up sin el stock que
 * ningún line-up cinco minutos antes de abrir.
 */
import { useMemo } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { useRestauranteId } from './useRestauranteId'
import { useTurnosServicio } from './useTurnosServicio'
import { usePlazasCustom } from './usePlazasCustom'
import { turnoActivo } from '@/lib/ops/turnos'
import { PRIO_A_CODIGO } from '@/lib/ops/textoPase'
import { plazaLabel } from '@/lib/constants'
import type { DatosLineUp, ItemPendiente, NotaLineUp, EventoLineUp } from '@/lib/ops/lineup'
import type { TareaPrioridad } from '@/types'

interface CrudoLineUp {
  ochentaySeis: string[]
  pendientes: { plaza: string; texto: string; codigo: string }[]
  notas: NotaLineUp[]
  eventos: EventoLineUp[]
  menuVigente: string | null
  faltantes: string[]
}

const VACIO: CrudoLineUp = {
  ochentaySeis: [], pendientes: [], notas: [], eventos: [], menuVigente: null, faltantes: [],
}

/** YYYY-MM-DD de hoy en horario local — la jornada, no el UTC. */
export function jornadaHoy(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function sumarDias(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const f = new Date(y, m - 1, d + n)
  return jornadaHoy(f)
}

// El orden en el que se leen los pendientes: primero lo que hay que marchar ya.
const PRIO_ORDEN: TareaPrioridad[] = ['critica', 'alta', 'media', 'baja']

async function fetchLineUp(key: string): Promise<CrudoLineUp> {
  const [, rid, jornada] = key.split('|')
  const supabase = createClient()
  const pasadoManana = sumarDias(jornada, 2)

  const [carta, tareas, notas, eventos, menus, productos] = await Promise.allSettled([
    supabase.from('carta_items').select('nombre')
      .eq('restaurante_id', rid).eq('disponible', false).order('nombre'),

    // Lo que el turno anterior dejó agendado para éste (categoria 'pase_turno').
    supabase.from('tareas').select('titulo, plaza, prioridad, estado')
      .eq('restaurante_id', rid).eq('categoria', 'pase_turno')
      .eq('turno_fecha', jornada).neq('estado', 'listo'),

    supabase.from('pase_mensajes').select('texto, plaza, usuario_nombre, created_at')
      .eq('restaurante_id', rid).gte('turno_fecha', sumarDias(jornada, -1))
      .order('created_at', { ascending: false }).limit(12),

    // Hoy y mañana: el aviso anticipado de un evento grande vale tanto como el de hoy.
    supabase.from('eventos').select('titulo, hora_inicio, fecha_inicio')
      .eq('restaurante_id', rid)
      .gte('fecha_inicio', jornada).lt('fecha_inicio', pasadoManana)
      .order('fecha_inicio').order('hora_inicio'),

    supabase.from('menus').select('nombre, tipo, vigencia_desde, vigencia_hasta, fecha_evento, activo')
      .eq('restaurante_id', rid).eq('activo', true),

    supabase.from('productos').select('nombre, stock_actual, stock_minimo, unidad')
      .eq('restaurante_id', rid).eq('activo', true).eq('fuera_de_uso', false)
      .gt('stock_minimo', 0),
  ])

  const ok = <T,>(r: PromiseSettledResult<{ data: T[] | null }>): T[] =>
    r.status === 'fulfilled' ? (r.value.data ?? []) : []

  const filasTareas = ok<{ titulo: string; plaza: string | null; prioridad: string | null }>(tareas)
  const filasMenus = ok<{
    nombre: string; tipo: string | null; vigencia_desde: string | null
    vigencia_hasta: string | null; fecha_evento: string | null
  }>(menus)

  const vigente = filasMenus.find(m =>
    m.fecha_evento === jornada ||
    ((!m.vigencia_desde || m.vigencia_desde <= jornada) &&
     (!m.vigencia_hasta || m.vigencia_hasta >= jornada) &&
     (!!m.vigencia_desde || !!m.vigencia_hasta)),
  )

  return {
    ochentaySeis: ok<{ nombre: string }>(carta).map(c => c.nombre),

    pendientes: filasTareas
      .slice()
      .sort((a, b) =>
        PRIO_ORDEN.indexOf((a.prioridad ?? 'baja') as TareaPrioridad) -
        PRIO_ORDEN.indexOf((b.prioridad ?? 'baja') as TareaPrioridad))
      .map(t => ({
        plaza: t.plaza ?? 'general',
        texto: t.titulo,
        codigo: PRIO_A_CODIGO[(t.prioridad ?? 'baja') as TareaPrioridad] ?? 'CHK',
      })),

    notas: ok<{ texto: string; plaza: string | null; usuario_nombre: string | null }>(notas)
      .filter(n => (n.texto ?? '').trim())
      .map(n => ({ plaza: n.plaza ?? 'general', texto: n.texto, autor: n.usuario_nombre })),

    eventos: ok<{ titulo: string; hora_inicio: string | null; fecha_inicio: string }>(eventos)
      .map(e => ({
        titulo: e.titulo,
        hora: e.hora_inicio ? e.hora_inicio.slice(0, 5) : null,
        esHoy: e.fecha_inicio === jornada,
      })),

    menuVigente: vigente?.nombre ?? null,

    faltantes: ok<{ nombre: string; stock_actual: number | null; stock_minimo: number | null; unidad: string | null }>(productos)
      .filter(p => (p.stock_actual ?? 0) < (p.stock_minimo ?? 0))
      .map(p => `${p.nombre} (${p.stock_actual ?? 0}${p.unidad ? ` ${p.unidad}` : ''})`),
  }
}

export function useLineUp(jornada?: string) {
  const RESTAURANTE_ID = useRestauranteId()
  const { turnosActivos } = useTurnosServicio()
  const { plazasCustom } = usePlazasCustom()

  const dia = jornada ?? jornadaHoy()
  const swrKey = RESTAURANTE_ID ? `lineup|${RESTAURANTE_ID}|${dia}` : null

  const { data = VACIO, isLoading: loading, mutate } = useSWR(swrKey, fetchLineUp, {
    // Corto a propósito: el line-up se abre justo antes de servicio y el 86 de
    // hace media hora ya no sirve. Es la pantalla donde el dato viejo miente más.
    revalidateOnFocus: true, revalidateOnReconnect: true, dedupingInterval: 30_000,
    keepPreviousData: true,
  })

  const turno = useMemo(() => turnoActivo(new Date(), turnosActivos), [turnosActivos])

  const datos: DatosLineUp = useMemo(() => ({
    turnoNombre: turno?.nombre ?? 'Servicio',
    jornada: dia,
    equipo: null,   // lo completa la pantalla con la grilla de turnos si la tiene
    ochentaySeis: data.ochentaySeis,
    pendientes: data.pendientes.map<ItemPendiente>(p => ({
      ...p, plaza: plazaLabel(p.plaza, plazasCustom),
    })),
    notas: data.notas.map<NotaLineUp>(n => ({ ...n, plaza: plazaLabel(n.plaza, plazasCustom) })),
    eventos: data.eventos as EventoLineUp[],
    menuVigente: data.menuVigente,
    faltantes: data.faltantes,
  }), [turno, dia, data, plazasCustom])

  return { datos, loading, refetch: mutate }
}
