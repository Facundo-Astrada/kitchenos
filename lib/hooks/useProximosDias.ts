'use client'

// Franja "próximos días" del dashboard (S6, sep 2026, Bloque 6). Deliberadamente
// NO reusa useCalendario() completo: ese hook trae eventos auto-generados desde
// pedidos/produccion_diaria/tareas de menú además de la tabla `eventos`, con el
// peso de esos joins — de más para un teaser que solo necesita título+fecha.
// Acá se consulta `eventos` (reales, no derivados) y `menus` (solo para marcar
// cuándo arranca un menú fijo o cuándo es un evento con fecha propia) con
// selects angostos. Ver hooks.md § Peso de la pantalla.

import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { useRestauranteId } from './useRestauranteId'
import { hoyOperativo, sumarDias } from '@/lib/ops/turnos'
import { TIPO_CONFIG, type TipoEvento } from './useCalendario'

export interface ItemProximoDia {
  id: string
  titulo: string
  color: string
  icon: string
  hora: string | null
}

export interface DiaProximo {
  fecha: string
  items: ItemProximoDia[]
}

const SWR_OPTS = {
  revalidateOnFocus: false,
  revalidateOnReconnect: true,
  dedupingInterval: 300_000,
  keepPreviousData: true,
} as const

async function fetchProximosDiasData(key: string): Promise<DiaProximo[]> {
  const [, restauranteId, hoy, diasStr] = key.split('|')
  const dias = Number(diasStr)
  const hasta = sumarDias(hoy, dias - 1)
  const supabase = createClient()

  const [{ data: eventos }, { data: menus }] = await Promise.all([
    supabase
      .from('eventos')
      .select('id, titulo, tipo, fecha_inicio, hora_inicio')
      .eq('restaurante_id', restauranteId)
      .gte('fecha_inicio', hoy)
      .lte('fecha_inicio', hasta)
      .order('fecha_inicio', { ascending: true }),
    supabase
      .from('menus')
      .select('id, nombre, tipo, vigencia_desde, fecha_evento')
      .eq('restaurante_id', restauranteId)
      .eq('activo', true),
  ])

  const fechas = Array.from({ length: dias }, (_, i) => sumarDias(hoy, i))

  return fechas.map(fecha => {
    const items: ItemProximoDia[] = []

    for (const e of eventos ?? []) {
      if (e.fecha_inicio !== fecha) continue
      const cfg = TIPO_CONFIG[e.tipo as TipoEvento]
      items.push({
        id: e.id, titulo: e.titulo, color: cfg?.color ?? '#6b7280', icon: cfg?.icon ?? 'event',
        hora: e.hora_inicio ? e.hora_inicio.slice(0, 5) : null,
      })
    }

    for (const m of menus ?? []) {
      // Evento con fecha propia, o el día en que arranca un menú fijo — no se
      // repite el menú fijo todos los días de su vigencia, sería ruido.
      const esDelDia = (m.tipo === 'evento' && m.fecha_evento === fecha) || (m.tipo === 'fijo' && m.vigencia_desde === fecha)
      if (!esDelDia) continue
      items.push({ id: `menu-${m.id}`, titulo: m.nombre, color: '#10b981', icon: 'menu_book', hora: null })
    }

    return { fecha, items }
  })
}

export function useProximosDias(dias = 5) {
  const RESTAURANTE_ID = useRestauranteId()
  const hoy = hoyOperativo()
  const swrKey = RESTAURANTE_ID ? `proximos-dias|${RESTAURANTE_ID}|${hoy}|${dias}` : null

  const { data, isLoading } = useSWR(swrKey, fetchProximosDiasData, SWR_OPTS)

  return { dias: data ?? [], loading: isLoading }
}
