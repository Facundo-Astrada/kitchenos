import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { COACH_TOOL_REGISTRY } from './registry'

// Las notas de una reunión de planificación (caso real, oct 2026) tal como el
// Coach debería mandarlas: cada línea un evento, los rangos como UN evento.
const NOTAS = {
  eventos: [
    { titulo: 'Vinito y chamuyo', fecha: '2026-10-16', tipo: 'reserva_especial' },
    { titulo: 'Día de la Madre — menú especial', fecha: '2026-10-18', tipo: 'reserva_especial', descripcion: 'Menú especial' },
    { titulo: 'Vacaciones de León', fecha: '2026-10-19', hasta: '2026-10-25', tipo: 'ausencia' },
    { titulo: 'Zoe se toma los días', fecha: '2026-11-06', hasta: '2026-11-08', tipo: 'ausencia' },
  ],
}

function fakeSupabase() {
  const insertados: Record<string, unknown>[] = []
  const sb = { from: () => ({ insert: (rows: Record<string, unknown>[]) => { insertados.push(...rows); return Promise.resolve({ error: null }) } }) }
  return { sb: sb as unknown as SupabaseClient, insertados }
}

describe('agendar_eventos', () => {
  const entry = COACH_TOOL_REGISTRY.agendar_eventos

  it('cada nota queda como su propio evento, los rangos como varios días', async () => {
    const input = entry.schema.parse(NOTAS)
    const { sb, insertados } = fakeSupabase()
    const res = await entry.execute(sb, 'rest-1', input)
    expect(res.ok).toBe(true)
    expect(insertados).toHaveLength(4)
    expect(insertados[0]).toMatchObject({ titulo: 'Vinito y chamuyo', fecha_inicio: '2026-10-16', fecha_fin: null, hora_inicio: '00:00:00', privado: false })
    expect(insertados[2]).toMatchObject({ titulo: 'Vacaciones de León', fecha_inicio: '2026-10-19', fecha_fin: '2026-10-25', tipo: 'ausencia' })
    expect(insertados[3]).toMatchObject({ fecha_inicio: '2026-11-06', fecha_fin: '2026-11-08' })
    // creado_por NO lo manda el cliente: lo pone la base con auth.uid()
    expect(insertados[0]).not.toHaveProperty('creado_por')
  })

  it('con hora: si no dice hasta cuándo, dura una hora', async () => {
    const input = entry.schema.parse({ eventos: [{ titulo: 'Reunión de compras', fecha: '2026-10-20', hora_inicio: '15:00', tipo: 'evento_equipo' }] })
    const { sb, insertados } = fakeSupabase()
    await entry.execute(sb, 'rest-1', input)
    expect(insertados[0]).toMatchObject({ hora_inicio: '15:00:00', hora_fin: '16:00:00' })
  })

  it('rechaza un tipo inventado', () => {
    expect(entry.schema.safeParse({ eventos: [{ titulo: 'x', fecha: '2026-10-20', tipo: 'fiesta' }] }).success).toBe(false)
  })

  it('el resumen de la tarjeta nombra los eventos con su fecha', () => {
    expect(entry.resumen(entry.schema.parse(NOTAS))).toContain('Vacaciones de León (19/10–25/10)')
  })
})

// coach_acciones tiene un CHECK con la lista cerrada de tools. Una tool mutante
// nueva en el registry que no esté ahí falla al proponer ("problema técnico")
// sin ningún error visible — pasó con agendar_eventos (10/10/2026).
describe('coach_acciones.tool_name_check', () => {
  it('incluye todas las tools mutantes del registry', async () => {
    const { readdirSync, readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const { COACH_MUTATING_TOOLS } = await import('./registry')
    const dir = join(process.cwd(), 'supabase', 'migrations')
    const ultima = readdirSync(dir)
      .filter(f => f.endsWith('.sql') && readFileSync(join(dir, f), 'utf8').includes('coach_acciones_tool_name_check'))
      .sort().pop()!
    const sql = readFileSync(join(dir, ultima), 'utf8')
    for (const tool of COACH_MUTATING_TOOLS) expect(sql, `${tool} falta en ${ultima}`).toContain(`'${tool}'`)
  })
})
