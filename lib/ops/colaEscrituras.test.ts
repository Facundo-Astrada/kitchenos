import { describe, it, expect } from 'vitest'
import { encolarEscritura, escriturasEnVuelo } from './colaEscrituras'

const esperar = (ms: number) => new Promise(r => setTimeout(r, ms))

describe('encolarEscritura', () => {
  it('serializa las escrituras de la misma fila, aunque la primera sea más lenta', async () => {
    const orden: string[] = []
    const a = encolarEscritura('t1', async () => { await esperar(30); orden.push('A') })
    const b = encolarEscritura('t1', async () => { orden.push('B') })
    await Promise.all([a, b])
    expect(orden).toEqual(['A', 'B'])
  })

  it('filas distintas no se esperan entre sí', async () => {
    const orden: string[] = []
    const a = encolarEscritura('t1', async () => { await esperar(30); orden.push('A') })
    const b = encolarEscritura('t2', async () => { orden.push('B') })
    await Promise.all([a, b])
    expect(orden).toEqual(['B', 'A'])
  })

  it('una escritura que falla no frena a la siguiente y devuelve su error', async () => {
    const a = encolarEscritura('t1', async () => { throw new Error('boom') })
    const b = encolarEscritura('t1', async () => 'ok')
    await expect(a).rejects.toThrow('boom')
    await expect(b).resolves.toBe('ok')
  })

  it('el contador vuelve a cero cuando todo terminó', async () => {
    await Promise.all([
      encolarEscritura('t1', async () => { await esperar(5) }),
      encolarEscritura('t1', async () => { throw new Error('x') }).catch(() => {}),
    ])
    await esperar(5)
    expect(escriturasEnVuelo.n).toBe(0)
  })
})
