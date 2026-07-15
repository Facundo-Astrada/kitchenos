'use client'

import { useCallback, useMemo } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { useRestauranteId } from './useRestauranteId'
import type { Cliente } from '@/types'

// Segmento derivado del comportamiento de compra — heurística propia de KOS
// (no es un clon de la lógica de Fudo, que es opaca). Reglas, en orden:
//   'sin_compras' → nunca compró
//   'dormido'     → no compra hace más de 45 días
//   'nuevo'       → su primera compra fue hace <= 30 días
//   null          → cliente activo habitual, sin badge (igual que Fudo deja "-")
export type GrupoCliente = 'nuevo' | 'dormido' | 'sin_compras' | null
export const GRUPO_LABELS: Record<Exclude<GrupoCliente, null>, string> = {
  nuevo: 'Clientes nuevos', dormido: 'Clientes dormidos', sin_compras: 'Sin compras',
}

export interface ClienteConMetricas extends Cliente {
  ultima_compra: string | null
  cant_compras: number
  total_gastado: number
  grupo: GrupoCliente
}

const DORMIDO_DIAS = 45
const NUEVO_DIAS = 30

function calcularGrupo(cantCompras: number, primeraCompra: string | null, ultimaCompra: string | null): GrupoCliente {
  if (cantCompras === 0 || !ultimaCompra) return 'sin_compras'
  const diasDesdeUltima = (Date.now() - new Date(ultimaCompra).getTime()) / 86_400_000
  if (diasDesdeUltima > DORMIDO_DIAS) return 'dormido'
  if (primeraCompra) {
    const diasDesdePrimera = (Date.now() - new Date(primeraCompra).getTime()) / 86_400_000
    if (diasDesdePrimera <= NUEVO_DIAS) return 'nuevo'
  }
  return null
}

async function fetchClientesData(key: string): Promise<ClienteConMetricas[]> {
  const rid = key.slice('clientes-'.length)
  const supabase = createClient()

  const { data: clientesData, error } = await supabase
    .from('clientes').select('*').eq('restaurante_id', rid).order('nombre')
  if (error) throw error
  const clientes = (clientesData ?? []) as Cliente[]
  if (clientes.length === 0) return []

  // Métricas desde cuentas cerradas — paginado (PostgREST corta a 1000/request).
  const agg = new Map<string, { primera: string; ultima: string; cant: number; total: number }>()
  for (let from = 0; ; from += 1000) {
    const { data, error: cErr } = await supabase
      .from('cuentas')
      .select('cliente_id, total, cerrada_at')
      .eq('restaurante_id', rid).eq('estado', 'cerrada')
      .not('cliente_id', 'is', null)
      .range(from, from + 999)
    if (cErr) throw cErr
    for (const c of (data ?? []) as { cliente_id: string; total: number; cerrada_at: string }[]) {
      const g = agg.get(c.cliente_id) ?? { primera: c.cerrada_at, ultima: c.cerrada_at, cant: 0, total: 0 }
      if (c.cerrada_at < g.primera) g.primera = c.cerrada_at
      if (c.cerrada_at > g.ultima) g.ultima = c.cerrada_at
      g.cant++; g.total += c.total
      agg.set(c.cliente_id, g)
    }
    if (!data || data.length < 1000) break
  }

  return clientes.map(c => {
    const m = agg.get(c.id)
    const cant_compras = m?.cant ?? 0
    const ultima_compra = m?.ultima ?? null
    return {
      ...c,
      ultima_compra,
      cant_compras,
      total_gastado: m?.total ?? 0,
      grupo: calcularGrupo(cant_compras, m?.primera ?? null, ultima_compra),
    }
  })
}

export function useClientes() {
  const RESTAURANTE_ID = useRestauranteId()
  const supabase = useMemo(() => createClient(), [])

  const swrKey = RESTAURANTE_ID ? `clientes-${RESTAURANTE_ID}` : null
  const { data: clientes = [], isLoading: loading, mutate } = useSWR(swrKey, fetchClientesData, {
    revalidateOnFocus: false, dedupingInterval: 60_000, keepPreviousData: true,
  })

  const crearCliente = useCallback(async (datos: { nombre: string; telefono?: string | null; email?: string | null; origen?: string; notas?: string | null }): Promise<string> => {
    if (!RESTAURANTE_ID) throw new Error('Sesión no cargada')
    const { data, error } = await supabase.from('clientes').insert({
      nombre: datos.nombre.trim(), telefono: datos.telefono || null, email: datos.email || null,
      origen: datos.origen || 'local', notas: datos.notas || null, restaurante_id: RESTAURANTE_ID,
    }).select('id').single()
    if (error) throw error
    await mutate()
    return data.id as string
  }, [RESTAURANTE_ID, supabase, mutate])

  const actualizarCliente = useCallback(async (id: string, datos: Partial<Pick<Cliente, 'nombre' | 'telefono' | 'email' | 'origen' | 'notas' | 'activo'>>) => {
    const { error } = await supabase.from('clientes').update(datos).eq('id', id)
    if (error) throw error
    await mutate()
  }, [supabase, mutate])

  const desactivarCliente = useCallback(async (id: string) => {
    await actualizarCliente(id, { activo: false })
  }, [actualizarCliente])

  // Historial de compras de un cliente — on-demand (detalle), no en el fetch masivo.
  const fetchHistorialCompras = useCallback(async (clienteId: string) => {
    const { data, error } = await supabase
      .from('cuentas').select('id, total, cerrada_at, mesa:mesas(numero)')
      .eq('cliente_id', clienteId).eq('estado', 'cerrada')
      .order('cerrada_at', { ascending: false }).limit(50)
    if (error) throw error
    return (data ?? []) as unknown as { id: string; total: number; cerrada_at: string; mesa: { numero: string } | null }[]
  }, [supabase])

  return {
    clientes, loading,
    crearCliente, actualizarCliente, desactivarCliente, fetchHistorialCompras,
    refetch: useCallback(() => mutate(), [mutate]),
  }
}
