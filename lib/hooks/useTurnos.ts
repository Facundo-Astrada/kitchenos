'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRestauranteId } from './useRestauranteId'
import { useRestauranteConfig, useGuardarRestauranteConfig } from './useRestauranteConfig'
import { claveTurno } from '@/lib/turnos/planilla'
import { HORARIOS_DEFAULT, type HorariosTurno, type TurnoTipo } from '@/lib/turnos/tipos'

// La grilla de personal (tabla `turnos`, UNIQUE(miembro_id, fecha)). Salió de
// useEquipo: ahí cada cambio esperaba el upsert y volvía a pedir la semana
// entera, y cada celda asignada le mandaba un aviso + push a la persona —
// armar una semana de 10 personas eran 60 notificaciones. Acá los cambios son
// optimistas, van en lote y devuelven su inverso (deshacer); avisar al equipo
// es un acto aparte que decide quien arma la planilla (ver /turnos).

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

export interface DatosTurno {
  turno_tipo: TurnoTipo
  hora_entrada: string | null
  hora_salida: string | null
  notas?: string | null
}

/** Un cambio sobre una celda. `turno: null` = dejarla vacía. */
export interface CambioTurno {
  miembro_id: string
  fecha: string
  turno: DatosTurno | null
}

const datosDe = (t: Turno): DatosTurno => ({
  turno_tipo: t.turno_tipo as TurnoTipo, hora_entrada: t.hora_entrada, hora_salida: t.hora_salida, notas: t.notas,
})

export function useTurnos() {
  const RESTAURANTE_ID = useRestauranteId()
  const restIdRef = useRef(RESTAURANTE_ID)
  restIdRef.current = RESTAURANTE_ID
  const supabase = useMemo(() => createClient(), [])

  const [turnos, setTurnos] = useState<Turno[]>([])
  // loading = primera carga (skeleton); refreshing = cambio de semana con la
  // grilla ya en pantalla (no se reemplaza por "Cargando...").
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const turnosRef = useRef<Turno[]>([])
  turnosRef.current = turnos
  const rangoRef = useRef<{ desde: string; hasta: string } | null>(null)
  const cargadoRef = useRef(false)
  // Descarta respuestas viejas si se navega rápido (semana → semana → semana).
  const reqRef = useRef(0)
  // Escrituras en vuelo: un refetch que llega en el medio pisaría lo optimista.
  const pendientesRef = useRef(0)
  const refetchPendienteRef = useRef(false)

  // `silencioso`: relectura de fondo (realtime, reconciliar tras un error) —
  // no prende la barra de recarga, que si no parpadea con cada celda pintada.
  const fetchRango = useCallback(async (desde: string, hasta: string, { silencioso = false } = {}) => {
    rangoRef.current = { desde, hasta }
    const rid = restIdRef.current
    if (!rid) { setLoading(false); return }
    const req = ++reqRef.current
    if (!cargadoRef.current) setLoading(true)
    else if (!silencioso) setRefreshing(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('turnos').select('*').eq('restaurante_id', rid).gte('fecha', desde).lte('fecha', hasta)
      if (req !== reqRef.current) return
      if (err) throw err
      // Llegó mientras se guardaba otro cambio: esta foto ya es vieja y
      // pisaría lo optimista. Se vuelve a pedir cuando terminen las escrituras.
      if (pendientesRef.current > 0) { refetchPendienteRef.current = true; return }
      turnosRef.current = (data ?? []) as Turno[]
      setTurnos(turnosRef.current)
      cargadoRef.current = true
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al cargar los turnos'
      console.error('[useTurnos] fetchRango Error:', msg)
      if (req === reqRef.current) setError(msg)
    } finally {
      if (req === reqRef.current) { setLoading(false); setRefreshing(false) }
    }
  }, [supabase])

  const refetch = useCallback(() => {
    const r = rangoRef.current
    if (!r) return
    if (pendientesRef.current > 0) { refetchPendienteRef.current = true; return }
    return fetchRango(r.desde, r.hasta, { silencioso: true })
  }, [fetchRango])

  /**
   * Aplica un lote de cambios: se ve al instante y devuelve el lote inverso
   * (para deshacer). Si la base rechaza algo, se relee la semana y tira.
   */
  const aplicar = useCallback(async (cambios: CambioTurno[]): Promise<CambioTurno[]> => {
    const rid = restIdRef.current
    if (!rid) throw new Error('Sesión no cargada')
    if (cambios.length === 0) return []

    const porClave = new Map(turnosRef.current.map(t => [claveTurno(t.miembro_id, t.fecha), t]))
    const inverso: CambioTurno[] = cambios.map(c => {
      const prev = porClave.get(claveTurno(c.miembro_id, c.fecha))
      return { miembro_id: c.miembro_id, fecha: c.fecha, turno: prev ? datosDe(prev) : null }
    })

    for (const c of cambios) {
      const k = claveTurno(c.miembro_id, c.fecha)
      const prev = porClave.get(k)
      if (!c.turno) { porClave.delete(k); continue }
      porClave.set(k, {
        id: prev?.id ?? `tmp-${k}`, miembro_id: c.miembro_id, fecha: c.fecha, restaurante_id: rid,
        created_at: prev?.created_at ?? new Date().toISOString(),
        turno_tipo: c.turno.turno_tipo, hora_entrada: c.turno.hora_entrada, hora_salida: c.turno.hora_salida,
        notas: c.turno.notas ?? null,
      })
    }
    // La ref se adelanta al render: dos cambios en el mismo frame (pintar
    // arrastrando) tienen que ver cada uno el resultado del anterior.
    turnosRef.current = [...porClave.values()]
    setTurnos(turnosRef.current)

    pendientesRef.current++
    try {
      const filas = cambios.filter(c => c.turno).map(c => ({
        miembro_id: c.miembro_id, fecha: c.fecha, restaurante_id: rid,
        turno_tipo: c.turno!.turno_tipo, hora_entrada: c.turno!.hora_entrada, hora_salida: c.turno!.hora_salida,
        notas: c.turno!.notas ?? null,
      }))
      // Borrados agrupados por día: a lo sumo 7 requests aunque se vacíe una semana entera.
      const borrarPorDia = new Map<string, string[]>()
      for (const c of cambios) if (!c.turno) borrarPorDia.set(c.fecha, [...(borrarPorDia.get(c.fecha) ?? []), c.miembro_id])

      const [up, ...dels] = await Promise.all([
        filas.length
          ? supabase.from('turnos').upsert(filas, { onConflict: 'miembro_id,fecha' }).select('*')
          : Promise.resolve({ data: [] as Turno[], error: null }),
        ...[...borrarPorDia].map(([fecha, ids]) =>
          supabase.from('turnos').delete().eq('restaurante_id', rid).eq('fecha', fecha).in('miembro_id', ids)),
      ])
      const fallo = up.error ?? dels.find(d => d.error)?.error
      if (fallo) throw fallo

      // Las filas optimistas toman el id real. Los datos no se pisan: si la
      // celda volvió a cambiar mientras viajaba el upsert, manda lo último.
      const reales = new Map(((up.data ?? []) as Turno[]).map(t => [claveTurno(t.miembro_id, t.fecha), t]))
      if (reales.size > 0) {
        setTurnos(prev => prev.map(t => {
          const real = t.id.startsWith('tmp-') ? reales.get(claveTurno(t.miembro_id, t.fecha)) : undefined
          return real ? { ...t, id: real.id, created_at: real.created_at } : t
        }))
      }
      return inverso
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message
        : e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message)
        : 'No se pudieron guardar los turnos'
      console.error('[useTurnos] aplicar Error:', msg)
      refetchPendienteRef.current = true
      throw new Error(msg)
    } finally {
      pendientesRef.current--
      if (pendientesRef.current === 0 && refetchPendienteRef.current) {
        refetchPendienteRef.current = false
        const r = rangoRef.current
        if (r) fetchRango(r.desde, r.hasta, { silencioso: true })
      }
    }
  }, [supabase, fetchRango])

  /** Turnos de un rango cualquiera, sin tocar el estado de la pantalla (resumen de horas del mes). */
  const fetchSuelto = useCallback(async (desde: string, hasta: string): Promise<Turno[]> => {
    const rid = restIdRef.current
    if (!rid) return []
    const { data, error: err } = await supabase
      .from('turnos').select('*').eq('restaurante_id', rid).gte('fecha', desde).lte('fecha', hasta)
    if (err) throw new Error(err.message)
    return (data ?? []) as Turno[]
  }, [supabase])

  // Realtime: otra persona armando la misma semana desde otro dispositivo.
  useEffect(() => {
    if (!RESTAURANTE_ID) return
    let t: ReturnType<typeof setTimeout> | null = null
    const ch = supabase
      .channel(`turnos-rt-${RESTAURANTE_ID}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'turnos', filter: `restaurante_id=eq.${RESTAURANTE_ID}` }, () => {
        if (t) clearTimeout(t)
        t = setTimeout(() => { refetch() }, 500)
      })
      .subscribe()
    return () => { if (t) clearTimeout(t); supabase.removeChannel(ch) }
  }, [RESTAURANTE_ID, supabase, refetch])

  return { turnos, loading, refreshing, error, fetchRango, refetch, aplicar, fetchSuelto }
}

/* ─── Horarios habituales por tipo de turno ─── */

const CLAVE_HORARIOS = 'turnos_horarios'

/**
 * A qué hora entra y sale cada tipo de turno en ESTE restaurante. Vive en
 * `restaurantes.configuracion.turnos_horarios` (JSONB existente, sin
 * migración — mismo patrón que plazas_custom y turnos_servicio). Antes eran
 * constantes del código (9–17, 13–21, 20–02): un local que abre 11 a 16
 * tenía que corregir cada celda a mano.
 */
export function useHorariosTurno() {
  const { configuracion } = useRestauranteConfig()
  const guardarConfig = useGuardarRestauranteConfig()

  const horarios = useMemo<HorariosTurno>(() => {
    const g = (configuracion[CLAVE_HORARIOS] ?? {}) as Partial<Record<string, unknown>>
    const leer = (k: keyof HorariosTurno): [string, string] => {
      const v = g[k]
      return Array.isArray(v) && typeof v[0] === 'string' && typeof v[1] === 'string' && v[0] && v[1]
        ? [v[0], v[1]] : HORARIOS_DEFAULT[k]
    }
    return { mañana: leer('mañana'), tarde: leer('tarde'), noche: leer('noche') }
  }, [configuracion])

  const guardarHorarios = useCallback(async (nuevos: HorariosTurno) => {
    await guardarConfig({ [CLAVE_HORARIOS]: nuevos })
  }, [guardarConfig])

  return { horarios, guardarHorarios }
}
