'use client'

import { useCallback, useMemo } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import type { CategoriaGasto, CategoriaFinanciera } from '@/types'
import { useRestauranteId } from './useRestauranteId'
import { invalidarPresupuesto } from './invalidarPresupuesto'

export const CATEGORIA_FINANCIERA_LABELS: Record<CategoriaFinanciera, string> = {
  mercaderia: 'Compra de mercadería',
  rrhh: 'Personal (RR.HH.)',
  alquiler: 'Alquiler',
  operacional: 'Gastos operacionales',
  administrativo: 'Gastos administrativos',
}

// Familia de gasto (PLAN-4-CAPAS B4) — 4 familias del material de gestión,
// contra las que se arma el presupuesto (objetivo 30/33/5/17). operacional y
// administrativo ruedan juntas hacia "gastos generales".
export type FamiliaGasto = 'materia_prima' | 'personal' | 'alquiler' | 'gastos_generales'

export const FAMILIA_GASTO_LABELS: Record<FamiliaGasto, string> = {
  materia_prima: 'Materia prima',
  personal: 'Personal',
  alquiler: 'Alquiler',
  gastos_generales: 'Gastos generales',
}

// Estructura estándar 30/33/5/17 — punto de partida para todo restaurante
// nuevo. Cada restaurante puede pisar estos % (ver objetivos_familia abajo);
// esto queda como el fallback cuando todavía no cargó nada.
export const FAMILIA_GASTO_OBJETIVO_PCT: Record<FamiliaGasto, number> = {
  materia_prima: 30,
  personal: 33,
  alquiler: 5,
  gastos_generales: 17,
}

export type ObjetivosFamilia = Record<FamiliaGasto, number>

function mergeObjetivosFamilia(overrides: Partial<ObjetivosFamilia> | null | undefined): ObjetivosFamilia {
  return {
    materia_prima: overrides?.materia_prima ?? FAMILIA_GASTO_OBJETIVO_PCT.materia_prima,
    personal: overrides?.personal ?? FAMILIA_GASTO_OBJETIVO_PCT.personal,
    alquiler: overrides?.alquiler ?? FAMILIA_GASTO_OBJETIVO_PCT.alquiler,
    gastos_generales: overrides?.gastos_generales ?? FAMILIA_GASTO_OBJETIVO_PCT.gastos_generales,
  }
}

// Objetivo % por familia, editable por restaurante — vive en
// restaurantes.configuracion (JSONB), mismo patrón que las plazas custom:
// sin tabla ni migración nueva. Función standalone (no hook) porque la
// consumen fetchers de SWR (usePresupuestoCMV, fetchPresupuestoFamilias) que
// no pueden llamar hooks entre sí.
export async function fetchObjetivosFamilia(
  supabase: ReturnType<typeof createClient>,
  restauranteId: string
): Promise<ObjetivosFamilia> {
  const { data } = await supabase.from('restaurantes').select('configuracion').eq('id', restauranteId).single()
  const cfg = data?.configuracion as { objetivos_familia?: Partial<ObjetivosFamilia> } | null
  return mergeObjetivosFamilia(cfg?.objetivos_familia)
}

export async function guardarObjetivoFamilia(
  supabase: ReturnType<typeof createClient>,
  restauranteId: string,
  familia: FamiliaGasto,
  pct: number
): Promise<void> {
  const { data } = await supabase.from('restaurantes').select('configuracion').eq('id', restauranteId).single()
  const cfg = (data?.configuracion as Record<string, unknown> | null) ?? {}
  const actuales = mergeObjetivosFamilia(cfg.objetivos_familia as Partial<ObjetivosFamilia> | undefined)
  const { error } = await supabase.from('restaurantes')
    .update({ configuracion: { ...cfg, objetivos_familia: { ...actuales, [familia]: pct } } })
    .eq('id', restauranteId)
  if (error) throw error
}

export const FAMILIA_DE_CATEGORIA_FINANCIERA: Record<CategoriaFinanciera, FamiliaGasto> = {
  mercaderia: 'materia_prima',
  rrhh: 'personal',
  alquiler: 'alquiler',
  operacional: 'gastos_generales',
  administrativo: 'gastos_generales',
}

async function fetchCategoriasGasto(key: string): Promise<CategoriaGasto[]> {
  const rid = key.slice('cat-gasto-'.length)
  const supabase = createClient()
  const { data, error } = await supabase
    .from('categorias_gasto')
    .select('*')
    .eq('restaurante_id', rid)
    .order('orden')
    .order('nombre')
  if (error) throw error
  return (data ?? []) as CategoriaGasto[]
}

// Proveedores con facturas sin categorizar — para el panel "Sin categorizar"
// de Cat. de Gastos. Pagina (PostgREST corta a 1000 filas/request).
export interface ProveedorSinCategoria { proveedor_nombre: string; n: number; total: number }

async function fetchProveedoresSinCategoria(rid: string): Promise<ProveedorSinCategoria[]> {
  const supabase = createClient()
  const rows: { proveedor_nombre: string; total: number }[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('facturas')
      .select('proveedor_nombre, total')
      .eq('restaurante_id', rid)
      .is('categoria_gasto_id', null)
      .range(from, from + 999)
    if (error) throw error
    rows.push(...((data ?? []) as { proveedor_nombre: string; total: number }[]))
    if (!data || data.length < 1000) break
  }
  const map = new Map<string, ProveedorSinCategoria>()
  for (const r of rows) {
    const g = map.get(r.proveedor_nombre) ?? { proveedor_nombre: r.proveedor_nombre, n: 0, total: 0 }
    g.n++
    g.total += r.total ?? 0
    map.set(r.proveedor_nombre, g)
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total)
}

export function useCategoriasGasto() {
  const RESTAURANTE_ID = useRestauranteId()
  const supabase = useMemo(() => createClient(), [])

  const swrKey = RESTAURANTE_ID ? `cat-gasto-${RESTAURANTE_ID}` : null
  const { data: categorias = [], isLoading: loading, mutate } = useSWR(swrKey, fetchCategoriasGasto, {
    revalidateOnFocus: false,
    dedupingInterval: 300_000,
    keepPreviousData: true,
  })

  const sinCatKey = RESTAURANTE_ID ? `sin-cat-gasto-${RESTAURANTE_ID}` : null
  const { data: proveedoresSinCategoria = [], isLoading: loadingSinCat, mutate: mutateSinCat } = useSWR(
    sinCatKey,
    () => fetchProveedoresSinCategoria(RESTAURANTE_ID),
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  )

  const crearCategoria = useCallback(async (nombre: string, categoria_financiera: CategoriaFinanciera, parent_id: string | null = null) => {
    if (!RESTAURANTE_ID) throw new Error('Sesión no cargada')
    const nextOrden = categorias.length
    const { error } = await supabase.from('categorias_gasto').insert({
      nombre: nombre.trim(), categoria_financiera, parent_id, restaurante_id: RESTAURANTE_ID, orden: nextOrden,
    })
    if (error) throw error
    await mutate()
  }, [RESTAURANTE_ID, supabase, categorias.length, mutate])

  const actualizarCategoria = useCallback(async (id: string, datos: Partial<Pick<CategoriaGasto, 'nombre' | 'categoria_financiera' | 'activa' | 'parent_id'>>) => {
    const { error } = await supabase.from('categorias_gasto').update(datos).eq('id', id)
    if (error) throw error
    await mutate()
  }, [supabase, mutate])

  // Soft delete (activa=false) — facturas ya categorizadas conservan el vínculo,
  // pero la categoría deja de ofrecerse para nuevas cargas. Mismo patrón que recetas.activa.
  const desactivarCategoria = useCallback(async (id: string) => {
    await actualizarCategoria(id, { activa: false })
  }, [actualizarCategoria])

  // Asigna una categoría a TODAS las facturas sin categorizar de un proveedor
  // (bulk, retroactivo) Y la deja guardada en proveedores.categoria_gasto_id —
  // sin esto, la próxima tanda importada del mismo proveedor volvía a entrar
  // sin categoría (ver .claude/docs/importador.md, gotcha de categorización).
  const asignarCategoriaAProveedor = useCallback(async (proveedorNombre: string, categoriaId: string) => {
    if (!RESTAURANTE_ID) throw new Error('Sesión no cargada')
    const { error } = await supabase.from('facturas')
      .update({ categoria_gasto_id: categoriaId })
      .eq('restaurante_id', RESTAURANTE_ID)
      .eq('proveedor_nombre', proveedorNombre)
      .is('categoria_gasto_id', null)
    if (error) throw error

    const nombre = proveedorNombre.trim()
    if (nombre) {
      const { data: existente } = await supabase.from('proveedores').select('id')
        .eq('restaurante_id', RESTAURANTE_ID).ilike('nombre', nombre).maybeSingle()
      if (existente) {
        await supabase.from('proveedores').update({ categoria_gasto_id: categoriaId }).eq('id', existente.id)
      } else {
        await supabase.from('proveedores').insert({
          nombre, restaurante_id: RESTAURANTE_ID, activo: true, categoria_gasto_id: categoriaId,
        })
      }
    }
    await mutateSinCat()
    invalidarPresupuesto()
  }, [RESTAURANTE_ID, supabase, mutateSinCat])

  return {
    categorias, loading,
    proveedoresSinCategoria, loadingSinCat,
    crearCategoria, actualizarCategoria, desactivarCategoria, asignarCategoriaAProveedor,
    refetch: useCallback(() => { mutate(); mutateSinCat() }, [mutate, mutateSinCat]),
  }
}
