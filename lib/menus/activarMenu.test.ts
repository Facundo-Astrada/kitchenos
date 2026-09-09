import { describe, it, expect } from 'vitest'
import { fakeSupabase, type Row } from '@/lib/test-utils/fakeSupabaseStore'
import { hoyOperativo, sumarDias } from '@/lib/ops/turnos'
import {
  activarMenuParaFechas, cronogramaDeEvento, fechaProduccion, resumenActivacion,
} from './activarMenu'

const RID = 'rest-1'
const MENU_ID = 'menu-1'

type Prep = Parameters<typeof activarMenuParaFechas>[2]['preparaciones'][number]

function prep(nombre: string, diasAntes: number, paso = 'Principal'): Prep {
  return {
    nombre, paso, prioridad: 'media', plaza: null, usuario_asignado: null,
    tipo: 'receta', ref_id: null, dias_antes: diasAntes,
  }
}

const evento = (preparaciones: Prep[]) => ({ id: MENU_ID, tipo: 'evento' as const, nombre: 'Casamiento Pérez', preparaciones })
const fijo = (preparaciones: Prep[]) => ({ id: MENU_ID, tipo: 'fijo' as const, nombre: 'Cotidiano', preparaciones })

const tareasDe = (store: Record<string, Row[]>) => (store.tareas ?? []) as Row[]
function porFecha(store: Record<string, Row[]>): Record<string, string[]> {
  const m: Record<string, string[]> = {}
  for (const t of tareasDe(store)) {
    const f = String(t.turno_fecha)
    if (!m[f]) m[f] = []
    m[f].push(String(t.titulo))
  }
  for (const f of Object.keys(m)) m[f].sort()
  return m
}

describe('fechaProduccion', () => {
  it('sin anticipación se cocina el día del servicio', () => {
    expect(fechaProduccion('2026-09-12', 0)).toBe('2026-09-12')
    expect(fechaProduccion('2026-09-12', null)).toBe('2026-09-12')
    expect(fechaProduccion('2026-09-12', undefined)).toBe('2026-09-12')
  })

  it('resta los días de anticipación, cruzando el mes', () => {
    expect(fechaProduccion('2026-09-12', 3)).toBe('2026-09-09')
    expect(fechaProduccion('2026-09-02', 3)).toBe('2026-08-30')
  })

  it('una anticipación negativa no manda a producir DESPUÉS de servir', () => {
    expect(fechaProduccion('2026-09-12', -4)).toBe('2026-09-12')
  })
})

describe('cronogramaDeEvento', () => {
  it('agrupa por día de producción y ordena del más lejano al servicio', () => {
    const crono = cronogramaDeEvento('2026-09-12', [
      { nombre: 'Terminación', dias_antes: 0 },
      { nombre: 'Fondo', dias_antes: 3 },
      { nombre: 'Curado', dias_antes: 3 },
      { nombre: 'Porcionado', dias_antes: 1 },
    ])
    expect(crono.map(c => c.fecha)).toEqual(['2026-09-09', '2026-09-11', '2026-09-12'])
    expect(crono[0].preparaciones.map(p => p.nombre)).toEqual(['Fondo', 'Curado'])
    expect(crono[2].preparaciones.map(p => p.nombre)).toEqual(['Terminación'])
  })
})

describe('activarMenuParaFechas — cronograma del evento', () => {
  it('reparte cada preparación en su día, en vez de volcar la lista entera el día del evento', async () => {
    const { supabase, store } = fakeSupabase()
    const res = await activarMenuParaFechas(supabase, RID, evento([
      prep('Fondo oscuro', 3), prep('Curar salmón', 3),
      prep('Porcionar carne', 1),
      prep('Terminar salsas', 0),
    ]), ['2026-09-12'])

    expect(porFecha(store)).toEqual({
      '2026-09-09': ['Curar salmón', 'Fondo oscuro'],
      '2026-09-11': ['Porcionar carne'],
      '2026-09-12': ['Terminar salsas'],
    })
    // 4 trabajos, 4 tareas — no 4 por cada uno de los 3 días.
    expect(res.totalTareas).toBe(4)
    expect(res.diasActivados).toBe(3)
  })

  it('sin dias_antes cargado se comporta igual que antes del cronograma: todo el día del evento', async () => {
    const { supabase, store } = fakeSupabase()
    const res = await activarMenuParaFechas(supabase, RID, evento([
      prep('Fondo oscuro', 0), prep('Terminar salsas', 0),
    ]), ['2026-09-12'])
    expect(porFecha(store)).toEqual({ '2026-09-12': ['Fondo oscuro', 'Terminar salsas'] })
    expect(res.diasActivados).toBe(1)
  })

  it('reactivar el mismo evento no duplica nada y no cuenta días nuevos', async () => {
    const { supabase, store } = fakeSupabase()
    const preps = [prep('Fondo oscuro', 3), prep('Terminar salsas', 0)]
    await activarMenuParaFechas(supabase, RID, evento(preps), ['2026-09-12'])
    const res2 = await activarMenuParaFechas(supabase, RID, evento(preps), ['2026-09-12'])

    expect(tareasDe(store)).toHaveLength(2)
    expect(res2.totalTareas).toBe(0)
    expect(res2.diasActivados).toBe(0)
    expect(res2.diasYaActivos).toBe(1)
  })

  it('agregar una preparación nueva siembra solo esa, en su propio día', async () => {
    const { supabase, store } = fakeSupabase()
    await activarMenuParaFechas(supabase, RID, evento([prep('Fondo oscuro', 3)]), ['2026-09-12'])
    const res = await activarMenuParaFechas(supabase, RID, evento([
      prep('Fondo oscuro', 3), prep('Masa de empanada', 2),
    ]), ['2026-09-12'])

    expect(res.totalTareas).toBe(1)
    expect(porFecha(store)).toEqual({
      '2026-09-09': ['Fondo oscuro'],
      '2026-09-10': ['Masa de empanada'],
    })
  })

  it('el orden de la preparación dentro del menú sobrevive al reparto en días', async () => {
    const { supabase, store } = fakeSupabase()
    await activarMenuParaFechas(supabase, RID, evento([
      prep('Primera', 0), prep('Segunda', 3), prep('Tercera', 0),
    ]), ['2026-09-12'])
    const orden = Object.fromEntries(tareasDe(store).map(t => [String(t.titulo), t.orden]))
    expect(orden).toEqual({ Primera: 0, Segunda: 1, Tercera: 2 })
  })
})

describe('activarMenuParaFechas — carryover del día anterior', () => {
  const hoy = hoyOperativo()
  const ayer = sumarDias(hoy, -1)
  const pendienteDeAyer = (): Row => ({
    id: 't-vieja', restaurante_id: RID, menu_id: MENU_ID, turno_fecha: ayer,
    estado: 'pendiente', titulo: 'Fondo oscuro',
  })

  it('un EVENTO no borra lo pendiente de ayer: es el trabajo que tiene que llegar vivo al día del evento', async () => {
    const { supabase, store } = fakeSupabase({ tareas: [pendienteDeAyer()] })
    await activarMenuParaFechas(supabase, RID, evento([prep('Terminar salsas', 0)]), [hoy])

    expect(tareasDe(store).some(t => t.id === 't-vieja')).toBe(true)
  })

  it('un MENÚ FIJO sí lo borra: se reactiva todos los días y lo de ayer es ruido', async () => {
    const { supabase, store } = fakeSupabase({ tareas: [pendienteDeAyer()] })
    await activarMenuParaFechas(supabase, RID, fijo([prep('Salsa criolla', 0)]), [hoy])

    expect(tareasDe(store).some(t => t.id === 't-vieja')).toBe(false)
  })

  it('un MENÚ FIJO no borra lo que ya estaba listo ayer', async () => {
    const { supabase, store } = fakeSupabase({ tareas: [{ ...pendienteDeAyer(), estado: 'listo' }] })
    await activarMenuParaFechas(supabase, RID, fijo([prep('Salsa criolla', 0)]), [hoy])

    expect(tareasDe(store).some(t => t.id === 't-vieja')).toBe(true)
  })
})

describe('resumenActivacion', () => {
  it('menciona el reparto cuando el trabajo cayó en varios días', () => {
    expect(resumenActivacion({ totalTareas: 14, diasActivados: 4, diasYaActivos: 0 }))
      .toBe('14 tareas repartidas en 4 días de producción')
  })
  it('un solo día se dice sin vueltas', () => {
    expect(resumenActivacion({ totalTareas: 1, diasActivados: 1, diasYaActivos: 0 }))
      .toBe('1 tarea en Producción')
  })
})
