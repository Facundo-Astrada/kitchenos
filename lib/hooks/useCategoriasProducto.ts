'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { CategoriaProducto } from '@/types'
import { useRestauranteId } from './useRestauranteId'

const CATEGORIAS_DEFAULT = [
  'Carnes', 'Lácteos', 'Verduras', 'Secos',
  'Bebidas', 'Packaging', 'Limpieza', 'Insumos',
]

export function useCategoriasProducto() {
  const RESTAURANTE_ID = useRestauranteId()
  const [categorias, setCategorias] = useState<CategoriaProducto[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = useMemo(() => createClient(), [])

  const fetchCategorias = useCallback(async () => {
    if (!RESTAURANTE_ID) { setLoading(false); return }
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('categorias_producto')
        .select('*')
        .eq('restaurante_id', RESTAURANTE_ID)
        .order('nombre')
      if (error) throw error
      setCategorias(data ?? [])
    } finally {
      setLoading(false)
    }
  }, [RESTAURANTE_ID, supabase])

  // Seed defaults if table is empty for this restaurante
  const seedDefaults = useCallback(async () => {
    if (!RESTAURANTE_ID) return
    const { count } = await supabase
      .from('categorias_producto')
      .select('*', { count: 'exact', head: true })
      .eq('restaurante_id', RESTAURANTE_ID)
    if ((count ?? 0) === 0) {
      await supabase.from('categorias_producto').insert(
        CATEGORIAS_DEFAULT.map(nombre => ({ restaurante_id: RESTAURANTE_ID, nombre }))
      )
      await fetchCategorias()
    }
  }, [RESTAURANTE_ID, supabase, fetchCategorias])

  useEffect(() => {
    if (!RESTAURANTE_ID) return
    fetchCategorias().then(() => seedDefaults())
  }, [fetchCategorias, seedDefaults, RESTAURANTE_ID])

  async function agregarCategoria(nombre: string, color?: string) {
    if (!RESTAURANTE_ID || !nombre.trim()) return
    const { error } = await supabase
      .from('categorias_producto')
      .insert({ restaurante_id: RESTAURANTE_ID, nombre: nombre.trim(), color: color ?? null })
    if (error) throw error
    await fetchCategorias()
  }

  async function eliminarCategoria(id: string) {
    const { error } = await supabase
      .from('categorias_producto')
      .delete()
      .eq('id', id)
    if (error) throw error
    setCategorias(prev => prev.filter(c => c.id !== id))
  }

  return { categorias, loading, agregarCategoria, eliminarCategoria, refetch: fetchCategorias }
}
