'use client'
/**
 * Matriz de polivalencia — persona × plaza × nivel 0-4.
 *
 * Ver `PLAN-IMPLANTACION-2026-09.md` § 5.3. Tres cosas salen de acá y ninguna
 * es "medir a la gente":
 *   1. `referentesDePlaza()` — quién sabe y enseña. Alimenta la columna
 *      "referente" de la ruta de implantación.
 *   2. `riesgoDePlaza()` — qué plaza se cae si falta una sola persona.
 *   3. El nivel propio de cada uno, que es el único número personal que el
 *      producto muestra (DECISIONES.md § 25).
 *
 * Una fila ausente NO es un error: significa nivel 0. Por eso `nivelDe()`
 * devuelve 0 por defecto y la grilla se dibuja completa aunque la tabla esté
 * vacía — un restaurante que recién carga el plantel ve la matriz entera en
 * gris, que es exactamente su situación real.
 */
import { useMemo, useCallback } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { useRestauranteId } from './useRestauranteId'
import { NIVEL_AUTONOMO, NIVEL_REFERENTE, type NivelCompetencia } from '@/lib/constants'
import type { Plaza } from '@/types'

export interface Competencia {
  id: string
  restaurante_id: string
  miembro_id: string
  plaza: string
  nivel: NivelCompetencia
  evidencia_url: string | null
  nota: string | null
  actualizado_por: string | null
  updated_at: string
  created_at: string
}

/** Identidad estable — si fuera inline, cada render dispararía efectos ajenos
 *  que dependan de esta lista (gotcha #5 de `.claude/docs/hooks.md`). */
const SIN_COMPETENCIAS: Competencia[] = []

async function fetchCompetencias(key: string): Promise<Competencia[]> {
  const rid = key.slice('competencias-'.length)
  const supabase = createClient()
  const { data, error } = await supabase
    .from('competencias')
    .select('*')
    .eq('restaurante_id', rid)
  if (error) throw error
  return (data ?? []) as Competencia[]
}

export interface RiesgoPlaza {
  plaza: string
  /** Cuántas personas pueden cubrirla solas (nivel >= 3). */
  autonomos: number
  /** Cuántas pueden enseñarla (nivel 4). */
  referentes: number
  /**
   * `critico`  — nadie puede cubrirla solo: la plaza no tiene quién la sostenga.
   * `fragil`   — una sola persona la sostiene: si falta, se cae.
   * `sin-relevo` — hay quien la cubre pero nadie que la enseñe: no se transmite.
   * `ok`       — al menos dos autónomos y un referente.
   */
  estado: 'critico' | 'fragil' | 'sin-relevo' | 'ok'
}

export function useCompetencias() {
  const RESTAURANTE_ID = useRestauranteId()
  const swrKey = RESTAURANTE_ID ? `competencias-${RESTAURANTE_ID}` : null

  const { data = SIN_COMPETENCIAS, isLoading: loading, mutate } = useSWR(
    swrKey, fetchCompetencias,
    { revalidateOnFocus: false, revalidateOnReconnect: true, dedupingInterval: 300_000, keepPreviousData: true },
  )

  /** Índice `miembroId::plaza → nivel` para no recorrer el array en cada celda. */
  const indice = useMemo(() => {
    const m = new Map<string, NivelCompetencia>()
    for (const c of data) m.set(`${c.miembro_id}::${c.plaza}`, c.nivel)
    return m
  }, [data])

  const nivelDe = useCallback(
    (miembroId: string, plaza: string): NivelCompetencia =>
      indice.get(`${miembroId}::${plaza}`) ?? 0,
    [indice],
  )

  /**
   * Escritura optimista: la matriz se carga tocando muchas celdas seguidas y un
   * refetch por celda la haría inusable (`hooks.md` § escrituras del camino
   * crítico). Se pinta primero y se confirma después.
   */
  const setNivel = useCallback(async (
    miembroId: string, plaza: string, nivel: NivelCompetencia, nota?: string | null,
  ) => {
    if (!RESTAURANTE_ID) return
    const supabase = createClient()
    const { data: userRes } = await supabase.auth.getUser()

    const previa = data.find(c => c.miembro_id === miembroId && c.plaza === plaza)
    const optimista: Competencia[] = previa
      ? data.map(c => (c === previa ? { ...c, nivel, nota: nota ?? c.nota } : c))
      : [...data, {
          id: `tmp-${miembroId}-${plaza}`, restaurante_id: RESTAURANTE_ID,
          miembro_id: miembroId, plaza, nivel, evidencia_url: null,
          nota: nota ?? null, actualizado_por: userRes?.user?.id ?? null,
          updated_at: new Date().toISOString(), created_at: new Date().toISOString(),
        }]
    mutate(optimista, { revalidate: false })

    const { error } = await supabase.from('competencias').upsert({
      restaurante_id: RESTAURANTE_ID,
      miembro_id: miembroId,
      plaza,
      nivel,
      ...(nota !== undefined ? { nota } : {}),
      actualizado_por: userRes?.user?.id ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'restaurante_id,miembro_id,plaza' })

    if (error) {
      console.error('[useCompetencias] setNivel Error:', error.message)
      mutate()   // revierte al estado real del servidor
    }
  }, [RESTAURANTE_ID, data, mutate])

  /** Los referentes (nivel 4) de una plaza — a quién le preguntan ahí. */
  const referentesDePlaza = useCallback(
    (plaza: string): string[] =>
      data.filter(c => c.plaza === plaza && c.nivel >= NIVEL_REFERENTE).map(c => c.miembro_id),
    [data],
  )

  /** Las plazas que esta persona puede cubrir sola. Para armar la grilla de turnos. */
  const plazasQueCubre = useCallback(
    (miembroId: string): string[] =>
      data.filter(c => c.miembro_id === miembroId && c.nivel >= NIVEL_AUTONOMO).map(c => c.plaza),
    [data],
  )

  /**
   * Lectura de riesgo por plaza. Es el output más valioso de la matriz y el que
   * ninguna otra pantalla puede dar: dice qué plaza se cae si falta una persona,
   * antes de que falte.
   */
  const riesgo = useCallback((plazas: Plaza[]): RiesgoPlaza[] =>
    plazas.map(plaza => {
      const enLaPlaza = data.filter(c => c.plaza === plaza)
      const autonomos = enLaPlaza.filter(c => c.nivel >= NIVEL_AUTONOMO).length
      const referentes = enLaPlaza.filter(c => c.nivel >= NIVEL_REFERENTE).length
      const estado: RiesgoPlaza['estado'] =
        autonomos === 0 ? 'critico'
        : autonomos === 1 ? 'fragil'
        : referentes === 0 ? 'sin-relevo'
        : 'ok'
      return { plaza, autonomos, referentes, estado }
    }), [data])

  return {
    competencias: data, loading, refetch: mutate,
    nivelDe, setNivel, referentesDePlaza, plazasQueCubre, riesgo,
  }
}
