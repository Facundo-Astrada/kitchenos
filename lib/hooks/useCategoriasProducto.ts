'use client'

import { useCallback, useMemo } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import type { CategoriaProducto } from '@/types'
import { useRestauranteId } from './useRestauranteId'

const CATEGORIAS_DEFAULT = [
  'Carnes', 'Lácteos', 'Verduras', 'Secos',
  'Bebidas', 'Packaging', 'Limpieza', 'Insumos',
]

async function fetchCategoriasData(key: string): Promise<CategoriaProducto[]> {
  const rid = key.slice('categorias-prod-'.length)
  const supabase = createClient()

  const { data, error } = await supabase
    .from('categorias_producto')
    .select('*')
    .eq('restaurante_id', rid)
    .order('nombre')
  if (error) throw error

  // Seed defaults la primera vez (idempotente: solo si está vacío)
  if ((data ?? []).length === 0) {
    await supabase.from('categorias_producto').insert(
      CATEGORIAS_DEFAULT.map(nombre => ({ restaurante_id: rid, nombre }))
    )
    const { data: seeded } = await supabase
      .from('categorias_producto')
      .select('*')
      .eq('restaurante_id', rid)
      .order('nombre')
    return seeded ?? []
  }

  return data ?? []
}

export function useCategoriasProducto() {
  const RESTAURANTE_ID = useRestauranteId()
  const supabase = useMemo(() => createClient(), [])

  const swrKey = RESTAURANTE_ID ? `categorias-prod-${RESTAURANTE_ID}` : null

  const { data: categorias = [], isLoading: loading, mutate } = useSWR(
    swrKey,
    fetchCategoriasData,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      dedupingInterval: 300_000,
      keepPreviousData: true,
    }
  )

  async function agregarCategoria(nombre: string, color?: string) {
    if (!RESTAURANTE_ID || !nombre.trim()) return
    const { error } = await supabase
      .from('categorias_producto')
      .insert({ restaurante_id: RESTAURANTE_ID, nombre: nombre.trim(), color: color ?? null })
    if (error) throw error
    await mutate()
  }

  async function eliminarCategoria(id: string) {
    const { error } = await supabase
      .from('categorias_producto')
      .delete()
      .eq('id', id)
    if (error) throw error
    mutate(prev => prev?.filter(c => c.id !== id), { revalidate: false })
  }

  return { categorias, loading, agregarCategoria, eliminarCategoria, refetch: useCallback(() => { mutate() }, [mutate]) }
}
