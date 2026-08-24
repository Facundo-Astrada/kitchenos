import { describe, it, expect } from 'vitest'
import { tareasAfectadasPorTilde, type TareaSincronizable } from './syncMise'

const HOY = '2026-08-23'
const ITEM = 'item-aceite-de-ajo'

function tarea(over: Partial<TareaSincronizable> = {}): TareaSincronizable {
  return { id: 't1', checklist_item_id: ITEM, turno_fecha: HOY, estado: 'pendiente', ...over }
}

describe('tareasAfectadasPorTilde — al tildar', () => {
  it('cierra la tarea abierta de hoy', () => {
    expect(tareasAfectadasPorTilde([tarea()], ITEM, HOY, true)).toHaveLength(1)
  })

  // El bug de ago 2026: el filtro exigía turno_fecha === hoy, así que un
  // pase_turno heredado con otra fecha quedaba abierto y el mise lo seguía
  // mostrando en "Te dejaron en producción" aunque el ítem estuviera tildado.
  it('cierra el pase_turno heredado que quedó con fecha vieja', () => {
    const heredada = tarea({ id: 't-heredada', turno_fecha: '2026-08-22' })
    expect(tareasAfectadasPorTilde([heredada], ITEM, HOY, true).map(t => t.id))
      .toEqual(['t-heredada'])
  })

  it('cierra una tarea sin turno_fecha', () => {
    const sinFecha = tarea({ id: 't-sin-fecha', turno_fecha: null })
    expect(tareasAfectadasPorTilde([sinFecha], ITEM, HOY, true).map(t => t.id))
      .toEqual(['t-sin-fecha'])
  })

  // Una preparación agendada para mañana no la cierra el tilde de hoy.
  it('NO toca las tareas futuras', () => {
    const manana = tarea({ id: 't-manana', turno_fecha: '2026-08-24' })
    expect(tareasAfectadasPorTilde([manana], ITEM, HOY, true)).toEqual([])
  })

  it('ignora las que ya están listo — no reescribe lo que ya está bien', () => {
    expect(tareasAfectadasPorTilde([tarea({ estado: 'listo' })], ITEM, HOY, true)).toEqual([])
  })

  it("cierra las que están en_curso, no solo las pendiente", () => {
    expect(tareasAfectadasPorTilde([tarea({ estado: 'en_curso' })], ITEM, HOY, true)).toHaveLength(1)
  })

  it('nunca toca tareas de otro ítem', () => {
    const otra = tarea({ id: 't-otra', checklist_item_id: 'otro-item' })
    expect(tareasAfectadasPorTilde([otra], ITEM, HOY, true)).toEqual([])
  })

  it('ignora las tareas sin vínculo al mise', () => {
    expect(tareasAfectadasPorTilde([tarea({ checklist_item_id: null })], ITEM, HOY, true)).toEqual([])
  })
})

describe('tareasAfectadasPorTilde — al destildar', () => {
  it('reabre la tarea de hoy que estaba cerrada', () => {
    expect(tareasAfectadasPorTilde([tarea({ estado: 'listo' })], ITEM, HOY, false)).toHaveLength(1)
  })

  // Asimetría deliberada: destildar hoy no puede resucitar historia.
  it('NO reabre tareas viejas ya cerradas', () => {
    const vieja = tarea({ id: 't-vieja', turno_fecha: '2026-08-20', estado: 'listo' })
    expect(tareasAfectadasPorTilde([vieja], ITEM, HOY, false)).toEqual([])
  })

  it('no toca las que ya están abiertas', () => {
    expect(tareasAfectadasPorTilde([tarea({ estado: 'pendiente' })], ITEM, HOY, false)).toEqual([])
  })
})

describe('tareasAfectadasPorTilde — el caso real de Bros', () => {
  // 23 ago 2026, parrilla. El cierre del turno anterior dejó "aceite de ajo"
  // como pase_turno; el cocinero lo tildó en la apertura del almuerzo y la
  // tarea quedó en pendiente igual.
  it('el tilde de la apertura cierra el pase que dejó el turno anterior', () => {
    const tareas: TareaSincronizable[] = [
      { id: 'aceite-pase', checklist_item_id: ITEM, turno_fecha: HOY, estado: 'pendiente' },
      { id: 'otro-plato', checklist_item_id: 'item-mandarina', turno_fecha: HOY, estado: 'pendiente' },
      { id: 'ya-cerrada', checklist_item_id: ITEM, turno_fecha: HOY, estado: 'listo' },
    ]

    expect(tareasAfectadasPorTilde(tareas, ITEM, HOY, true).map(t => t.id))
      .toEqual(['aceite-pase'])
  })
})
