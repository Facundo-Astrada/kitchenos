import { describe, it, expect, vi } from 'vitest'
import { insertarTareas, esViolacionDeUnicidad, PG_UNIQUE_VIOLATION } from './insertarTareas'

/** Cliente falso que responde según lo que se le programe por llamada. */
function fakeCliente(respuestas: Array<{ code?: string; message: string } | null>) {
  const llamadas: unknown[][] = []
  let i = 0
  const cliente = {
    from: () => ({
      insert: (filas: unknown) => {
        llamadas.push(Array.isArray(filas) ? filas : [filas])
        const r = respuestas[Math.min(i++, respuestas.length - 1)]
        return Promise.resolve({ error: r })
      },
    }),
  }
  return { cliente, llamadas, get llamadasHechas() { return i } }
}

const dup = { code: PG_UNIQUE_VIOLATION, message: 'duplicate key value violates unique constraint' }

describe('esViolacionDeUnicidad', () => {
  it('reconoce el 23505', () => {
    expect(esViolacionDeUnicidad(dup)).toBe(true)
  })
  it('no confunde otros errores', () => {
    expect(esViolacionDeUnicidad({ code: '42501', message: 'permission denied' })).toBe(false)
    expect(esViolacionDeUnicidad(null)).toBe(false)
    expect(esViolacionDeUnicidad(undefined)).toBe(false)
  })
})

describe('insertarTareas', () => {
  it('un lote vacío no le pega a la base', async () => {
    const { cliente, llamadasHechas } = fakeCliente([null])
    const r = await insertarTareas(cliente, [])
    expect(r).toEqual({ insertadas: 0, omitidas: 0, error: null })
    expect(llamadasHechas).toBe(0)
  })

  // El caso de HOY: sin índice único no hay 23505 posible, así que esto tiene
  // que comportarse exactamente igual que el insert pelado que reemplaza.
  it('sin conflicto es un passthrough: un solo insert en lote', async () => {
    const f = fakeCliente([null])
    const r = await insertarTareas(f.cliente, [{ a: 1 }, { a: 2 }, { a: 3 }])
    expect(r).toEqual({ insertadas: 3, omitidas: 0, error: null })
    expect(f.llamadasHechas).toBe(1)
    expect(f.llamadas[0]).toHaveLength(3)
  })

  it('un error que no es 23505 se devuelve tal cual, sin reintentar fila por fila', async () => {
    const permiso = { code: '42501', message: 'permission denied' }
    const f = fakeCliente([permiso])
    const r = await insertarTareas(f.cliente, [{ a: 1 }, { a: 2 }])
    expect(r.error).toBe(permiso)
    expect(r.insertadas).toBe(0)
    expect(f.llamadasHechas).toBe(1)
  })

  // El caso que justifica todo el helper: Postgres tumba el lote entero si una
  // sola fila choca. Las 13 preparaciones nuevas no se pueden perder porque 1
  // ya estaba.
  it('si el lote choca, reintenta fila por fila y salva las nuevas', async () => {
    const f = fakeCliente([dup, null, dup, null])
    const r = await insertarTareas(f.cliente, [{ a: 1 }, { a: 2 }, { a: 3 }])
    expect(r.insertadas).toBe(2)
    expect(r.omitidas).toBe(1)
    expect(r.error).toBeNull()
    expect(f.llamadasHechas).toBe(4) // 1 lote + 3 filas
  })

  it('si TODAS ya estaban, no es error: 0 insertadas y todas omitidas', async () => {
    const f = fakeCliente([dup, dup, dup])
    const r = await insertarTareas(f.cliente, [{ a: 1 }, { a: 2 }])
    expect(r).toEqual({ insertadas: 0, omitidas: 2, error: null })
  })

  it('un error real durante el reintento corta y se reporta, conservando la cuenta', async () => {
    const roto = { code: '08006', message: 'connection failure' }
    const f = fakeCliente([dup, null, roto])
    const r = await insertarTareas(f.cliente, [{ a: 1 }, { a: 2 }, { a: 3 }])
    expect(r.insertadas).toBe(1)
    expect(r.error).toBe(roto)
  })

  it('en el reintento manda las filas de a una, no el lote', async () => {
    const f = fakeCliente([dup, null, null])
    await insertarTareas(f.cliente, [{ a: 1 }, { a: 2 }])
    expect(f.llamadas[1]).toEqual([{ a: 1 }])
    expect(f.llamadas[2]).toEqual([{ a: 2 }])
  })
})
