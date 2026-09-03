'use client'

/**
 * Consumo de IA del mes en curso, leído de `ia_uso`.
 *
 * Las 12 rutas que llaman a Claude vienen asentando su costo con
 * `restaurante_id` desde hace meses, pero ninguna pantalla lo mostraba: el
 * único número de costo variable del producto no se veía por ningún lado.
 *
 * `ia_uso` tiene RLS con SELECT filtrado por `mi_restaurante_id()`, así que se
 * lee directo desde el browser — no hace falta API route.
 */

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRestauranteId } from './useRestauranteId'

/** Etiquetas para el `tag` con el que cada ruta se identifica en `ia_uso`. */
const NOMBRE_POR_TAG: Record<string, string> = {
  'recetas/import': 'Importar recetas',
  'recetas/import:adjust': 'Ajustar receta con IA',
  'importador/fichas-tecnicas': 'Importar fichas técnicas',
  'importador/facturas-universal': 'Importar facturas',
  'importador/productos-desde-facturas': 'Productos desde facturas',
  'importador/mapeo': 'Mapeo de importación',
  'carta/import': 'Importar carta',
  'facturas': 'Leer facturas',
  'listas-precios': 'Listas de precios',
  'stock/import-planilla': 'Importar planilla de stock',
  'ventas/import': 'Importar ventas',
  'produccion/sugerencia/explicar': 'Sugerencia de producción',
  'coach': 'Kitchen Coach',
}

export function nombreDeTag(tag: string): string {
  return NOMBRE_POR_TAG[tag] ?? tag
}

export interface UsoPorFuncion {
  tag: string
  nombre: string
  llamadas: number
  costoUsd: number
}

export interface ConsumoIAMes {
  llamadas: number
  costoUsd: number
  porFuncion: UsoPorFuncion[]
  desde: Date
}

export function useConsumoIA() {
  const restauranteId = useRestauranteId()
  const [consumo, setConsumo] = useState<ConsumoIAMes | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // `useRestauranteId()` devuelve '' mientras carga — sin esto la query sale
    // con un filtro vacío (regla crítica de CLAUDE.md).
    if (!restauranteId) return

    let cancelado = false
    const supabase = createClient()

    async function cargar() {
      setLoading(true)
      const ahora = new Date()
      const desde = new Date(ahora.getFullYear(), ahora.getMonth(), 1)

      const { data, error } = await supabase
        .from('ia_uso')
        .select('tag, costo_usd')
        .eq('restaurante_id', restauranteId)
        .gte('created_at', desde.toISOString())

      if (cancelado) return
      if (error || !data) {
        console.error('[useConsumoIA]', error?.message)
        setConsumo(null)
        setLoading(false)
        return
      }

      const acum = new Map<string, UsoPorFuncion>()
      let costoUsd = 0
      for (const fila of data as { tag: string; costo_usd: number | null }[]) {
        const costo = fila.costo_usd ?? 0
        costoUsd += costo
        const prev = acum.get(fila.tag)
        if (prev) {
          prev.llamadas += 1
          prev.costoUsd += costo
        } else {
          acum.set(fila.tag, { tag: fila.tag, nombre: nombreDeTag(fila.tag), llamadas: 1, costoUsd: costo })
        }
      }

      setConsumo({
        llamadas: data.length,
        costoUsd,
        porFuncion: [...acum.values()].sort((a, b) => b.costoUsd - a.costoUsd),
        desde,
      })
      setLoading(false)
    }

    void cargar()
    return () => { cancelado = true }
  }, [restauranteId])

  return { consumo, loading }
}
