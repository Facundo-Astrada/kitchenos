import { describe, it, expect, vi } from 'vitest'
import { onMiseRegistroPatch, emitMiseRegistroPatch, type MiseRegistroPatch } from './miseBus'

const PATCH: MiseRegistroPatch = {
  itemId: 'item-1', fecha: '2026-08-06', turno: 'almuerzo:apertura', completado: true,
}

describe('miseBus — puente Producción → Mise en la misma pestaña', () => {
  it('entrega el parche a los suscriptores', () => {
    const fn = vi.fn()
    const off = onMiseRegistroPatch(fn)
    emitMiseRegistroPatch(PATCH)
    expect(fn).toHaveBeenCalledWith(PATCH)
    off()
  })

  it('deja de entregar después de desuscribirse — un mise desmontado no se toca', () => {
    const fn = vi.fn()
    onMiseRegistroPatch(fn)()
    emitMiseRegistroPatch(PATCH)
    expect(fn).not.toHaveBeenCalled()
  })

  it('llega a todas las instancias montadas a la vez (OPS + /checklist)', () => {
    const a = vi.fn(); const b = vi.fn()
    const offA = onMiseRegistroPatch(a); const offB = onMiseRegistroPatch(b)
    emitMiseRegistroPatch(PATCH)
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
    offA(); offB()
  })

  it('un listener que explota no deja sin avisar a los demás', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const roto = vi.fn(() => { throw new Error('boom') })
    const sano = vi.fn()
    const off1 = onMiseRegistroPatch(roto); const off2 = onMiseRegistroPatch(sano)
    expect(() => emitMiseRegistroPatch(PATCH)).not.toThrow()
    expect(sano).toHaveBeenCalledTimes(1)
    off1(); off2(); err.mockRestore()
  })
})
