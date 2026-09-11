import { describe, it, expect, vi } from 'vitest'
import type { Producto } from '@/types'

// El módulo es 'use client' y arma un cliente Supabase al importarse.
vi.mock('@/lib/supabase/client', () => ({ createClient: vi.fn() }))

import { calcEstado, calcStockSeguridad } from './useStock'

const prod = (over: Partial<Producto>): Producto => ({
  id: 'p1', nombre: 'Nuez pecán', categoria: 'Secos', unidad: 'kg',
  stock_actual: 10, stock_minimo: 5, stock_critico: 2,
  precio_unitario: 100,
  ...over,
} as Producto)

describe('calcStockSeguridad', () => {
  it('es el mínimo más un 25% de colchón', () => {
    expect(calcStockSeguridad(prod({ stock_minimo: 4 }))).toBe(5)
    expect(calcStockSeguridad(prod({ stock_minimo: 10 }))).toBe(12.5)
  })

  it('con mínimo 0 no inventa colchón', () => {
    expect(calcStockSeguridad(prod({ stock_minimo: 0 }))).toBe(0)
  })
})

describe('calcEstado', () => {
  it('por encima del mínimo está ok', () => {
    expect(calcEstado(prod({ stock_actual: 10, stock_minimo: 5, stock_critico: 2 }))).toBe('ok')
  })

  it('justo en el mínimo ya es bajo, no ok — el borde cuenta como alerta', () => {
    expect(calcEstado(prod({ stock_actual: 5, stock_minimo: 5, stock_critico: 2 }))).toBe('bajo')
  })

  it('justo en el crítico es crítico', () => {
    expect(calcEstado(prod({ stock_actual: 2, stock_minimo: 5, stock_critico: 2 }))).toBe('critico')
  })

  it('crítico gana sobre bajo cuando aplican los dos', () => {
    expect(calcEstado(prod({ stock_actual: 1, stock_minimo: 5, stock_critico: 2 }))).toBe('critico')
  })

  // `stock_critico` está en 0 para todas las cuentas (la columna quedó pero la
  // pantalla dejó de mostrar "crítico", ago 2026): con ese default, lo único
  // que cae en 'critico' es un producto en cero o negativo.
  it('con stock_critico en 0 (el default real), solo el cero es crítico', () => {
    expect(calcEstado(prod({ stock_actual: 0, stock_minimo: 5, stock_critico: 0 }))).toBe('critico')
    expect(calcEstado(prod({ stock_actual: 1, stock_minimo: 5, stock_critico: 0 }))).toBe('bajo')
  })

  it('por encima del máximo es alto', () => {
    expect(calcEstado(prod({ stock_actual: 30, stock_minimo: 5, stock_maximo: 20 }))).toBe('alto')
  })

  it('justo en el máximo NO es alto — el borde acá no cuenta', () => {
    expect(calcEstado(prod({ stock_actual: 20, stock_minimo: 5, stock_maximo: 20 }))).toBe('ok')
  })

  it('sin máximo cargado nunca da alto', () => {
    expect(calcEstado(prod({ stock_actual: 9999, stock_maximo: null }))).toBe('ok')
  })

  // Vale capital pero no se opera: no tiene que ensuciar las alertas.
  it('fuera de uso siempre es ok, aunque esté en cero', () => {
    expect(calcEstado(prod({ stock_actual: 0, stock_critico: 5, fuera_de_uso: true }))).toBe('ok')
    expect(calcEstado(prod({ stock_actual: 999, stock_maximo: 10, fuera_de_uso: true }))).toBe('ok')
  })
})
