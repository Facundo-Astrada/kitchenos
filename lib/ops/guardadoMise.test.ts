import { describe, it, expect, beforeEach } from 'vitest'
import { guardarRegistro, vaciarPendientes, cantidadPendientes, _resetBandeja, esErrorTransitorio, type Escritor, type FilaRegistro } from './guardadoMise'

const ok: Escritor = async () => ({ error: null })
const sinRed: Escritor = async () => ({ error: { message: 'TypeError: Failed to fetch' } })
const permisos: Escritor = async () => ({ error: { message: 'new row violates row-level security policy', code: '42501', status: 403 } })

beforeEach(() => _resetBandeja())

describe('guardarRegistro', () => {
  it('sube y deja la bandeja vacía', async () => {
    expect(await guardarRegistro('i1', '2026-10-16', 'cena:cierre', { completado: true }, ok)).toBe('ok')
    expect(cantidadPendientes()).toBe(0)
  })

  it('sin conexión queda pendiente y no rechaza', async () => {
    expect(await guardarRegistro('i1', '2026-10-16', 'cena:cierre', { completado: true }, sinRed)).toBe('pendiente')
    expect(cantidadPendientes()).toBe(1)
  })

  it('al volver la conexión el reintento lo sube', async () => {
    await guardarRegistro('i1', '2026-10-16', 'cena:cierre', { completado: true }, sinRed)
    expect(await vaciarPendientes(ok)).toBe(0)
  })

  it('los cambios del mismo registro se fusionan: nada de lo que falló se pierde', async () => {
    await guardarRegistro('i1', 'f', 't', { cantidad_actual: 4 }, sinRed)
    await guardarRegistro('i1', 'f', 't', { completado: true }, sinRed)
    expect(cantidadPendientes()).toBe(1)
    const enviadas: FilaRegistro[] = []
    await vaciarPendientes(async fila => { enviadas.push(fila); return { error: null } })
    expect(enviadas).toEqual([{ checklist_item_id: 'i1', fecha: 'f', turno: 't', cantidad_actual: 4, completado: true }])
  })

  it('lo último gana: tildar y destildar sin red sube el destildado', async () => {
    await guardarRegistro('i1', 'f', 't', { completado: true }, sinRed)
    await guardarRegistro('i1', 'f', 't', { completado: false }, sinRed)
    const enviadas: FilaRegistro[] = []
    await vaciarPendientes(async fila => { enviadas.push(fila); return { error: null } })
    expect(enviadas[0].completado).toBe(false)
  })

  it('un error de permisos no se reintenta: rechaza y limpia la bandeja', async () => {
    await expect(guardarRegistro('i1', 'f', 't', { completado: true }, permisos)).rejects.toThrow('row-level security')
    expect(cantidadPendientes()).toBe(0)
  })

  it('un cambio que llega mientras otro viaja no se borra al terminar el primero', async () => {
    let soltar!: () => void
    const lento: Escritor = () => new Promise(r => { soltar = () => r({ error: null }) })
    const a = guardarRegistro('i1', 'f', 't', { cantidad_actual: 1 }, lento)
    await new Promise(r => setTimeout(r, 0))   // el primero ya está viajando
    const b = guardarRegistro('i1', 'f', 't', { cantidad_actual: 2 }, ok)
    soltar()
    await Promise.all([a, b])
    expect(cantidadPendientes()).toBe(0)
  })
})

describe('esErrorTransitorio', () => {
  it('distingue red/servidor de permisos', () => {
    expect(esErrorTransitorio({ message: 'Failed to fetch' })).toBe(true)
    expect(esErrorTransitorio({ message: 'x', status: 503 })).toBe(true)
    expect(esErrorTransitorio({ message: 'denied', status: 403 })).toBe(false)
  })
})
