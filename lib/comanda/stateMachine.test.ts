import { describe, it, expect } from 'vitest'
import {
  puedeTranicionarComanda,
  transicionarComanda,
  puedeTranicionarItem,
  transicionarItem,
  todosListos,
} from './stateMachine'

describe('Máquina de estados — Comanda', () => {
  it('flujo completo: abierta → enviada → en_prep → lista → cerrada', () => {
    expect(transicionarComanda('abierta', 'enviada')).toBe('enviada')
    expect(transicionarComanda('enviada', 'en_prep')).toBe('en_prep')
    expect(transicionarComanda('en_prep', 'lista')).toBe('lista')
    expect(transicionarComanda('lista', 'cerrada')).toBe('cerrada')
  })

  it('cualquier estado puede cancelarse (excepto cerrada/cancelada)', () => {
    expect(puedeTranicionarComanda('abierta', 'cancelada')).toBe(true)
    expect(puedeTranicionarComanda('enviada', 'cancelada')).toBe(true)
    expect(puedeTranicionarComanda('en_prep', 'cancelada')).toBe(true)
    expect(puedeTranicionarComanda('lista', 'cancelada')).toBe(true)
  })

  it('cerrada y cancelada son estados finales', () => {
    expect(puedeTranicionarComanda('cerrada', 'abierta')).toBe(false)
    expect(puedeTranicionarComanda('cancelada', 'abierta')).toBe(false)
  })

  it('no permite saltos de estado', () => {
    expect(puedeTranicionarComanda('abierta', 'lista')).toBe(false)
    expect(puedeTranicionarComanda('abierta', 'cerrada')).toBe(false)
  })

  it('lanza error en transición inválida', () => {
    expect(() => transicionarComanda('cerrada', 'abierta')).toThrow()
  })
})

describe('Máquina de estados — ComandaItem (KDS)', () => {
  it('fired: pendiente → en_prep', () => {
    expect(transicionarItem('pendiente', 'en_prep')).toBe('en_prep')
  })

  it('bumped: en_prep → listo', () => {
    expect(transicionarItem('en_prep', 'listo')).toBe('listo')
  })

  it('recalled: listo → en_prep', () => {
    expect(transicionarItem('listo', 'en_prep')).toBe('en_prep')
  })

  it('bumpeado es estado final', () => {
    expect(puedeTranicionarItem('bumpeado', 'pendiente')).toBe(false)
    expect(puedeTranicionarItem('bumpeado', 'en_prep')).toBe(false)
  })

  it('no permite saltar etapas', () => {
    expect(puedeTranicionarItem('pendiente', 'listo')).toBe(false)
  })
})

describe('todosListos', () => {
  it('true cuando todos los ítems son listo o bumpeado', () => {
    expect(todosListos([
      { estado: 'listo' },
      { estado: 'bumpeado' },
    ])).toBe(true)
  })

  it('false si algún ítem sigue en_prep o pendiente', () => {
    expect(todosListos([
      { estado: 'listo' },
      { estado: 'en_prep' },
    ])).toBe(false)
  })

  it('false para lista vacía (sin ítems no hay comanda lista)', () => {
    expect(todosListos([])).toBe(false)
  })
})
