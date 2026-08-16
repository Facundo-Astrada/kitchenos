import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { PrepInput } from '@/lib/hooks/useMenus'
import { sincronizarMiseDeMenu } from './menuMise'
import { menuItemVisible, TAREA_PRIO_TO_MISE } from './mise'

// ── Fake Supabase mínimo — solo el subset de la query builder que
// sincronizarMiseDeMenu/resolverSeccionMise realmente usan (select/eq/ilike/
// limit/single/insert/update/delete/in), en memoria. No es un mock genérico
// reusable: alcanza para estos dos módulos, nada más. ──
type Row = Record<string, unknown>

class FakeQueryBuilder implements PromiseLike<{ data: unknown; error: null }> {
  private filters: ((row: Row) => boolean)[] = []
  private mode: 'select' | 'insert' | 'update' | 'delete' = 'select'
  private insertPayload: Row | Row[] | null = null
  private updatePayload: Row | null = null
  private limitN: number | null = null
  private singleMode = false

  constructor(private table: string, private store: Record<string, Row[]>) {
    this.store[table] ??= []
  }

  select() { return this }
  insert(payload: Row | Row[]) { this.mode = 'insert'; this.insertPayload = payload; return this }
  update(payload: Row) { this.mode = 'update'; this.updatePayload = payload; return this }
  delete() { this.mode = 'delete'; return this }
  eq(col: string, val: unknown) { this.filters.push(row => row[col] === val); return this }
  ilike(col: string, val: string) { const v = String(val).toLowerCase(); this.filters.push(row => String(row[col] ?? '').toLowerCase() === v); return this }
  in(col: string, vals: unknown[]) { this.filters.push(row => vals.includes(row[col])); return this }
  limit(n: number) { this.limitN = n; return this }
  single() { this.singleMode = true; return this }

  private exec(): { data: unknown; error: null } {
    const rows = this.store[this.table]
    if (this.mode === 'insert') {
      const items = Array.isArray(this.insertPayload) ? this.insertPayload : [this.insertPayload as Row]
      const created = items.map((p, i) => ({ id: `${this.table}-${rows.length + i}-${Math.random().toString(36).slice(2, 7)}`, ...p }))
      rows.push(...created)
      return { data: this.singleMode ? created[0] : created, error: null }
    }
    let matched = rows.filter(r => this.filters.every(f => f(r)))
    if (this.mode === 'update') {
      matched.forEach(r => Object.assign(r, this.updatePayload))
      return { data: matched, error: null }
    }
    if (this.mode === 'delete') {
      const ids = new Set(matched.map(r => r.id))
      this.store[this.table] = rows.filter(r => !ids.has(r.id))
      return { data: matched, error: null }
    }
    if (this.limitN != null) matched = matched.slice(0, this.limitN)
    return { data: this.singleMode ? (matched[0] ?? null) : matched, error: null }
  }

  then<TResult1 = { data: unknown; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.exec()).then(onfulfilled, onrejected)
  }
}

function fakeSupabase() {
  const store: Record<string, Row[]> = {}
  const client = { from: (table: string) => new FakeQueryBuilder(table, store) }
  return { supabase: client as unknown as SupabaseClient, store }
}

const RID = 'rest-1'
const MENU_ID = 'menu-1'

const PREP_PARRILLA: PrepInput = {
  paso: 'Principal', tipo: 'receta', ref_id: 'r1', nombre: 'Bife a la criolla',
  prioridad: 'critica', plaza: 'parrilla', seccion_mise: 'heladera', usuario_asignado: null,
  cantidad_ops: 10, unidad_ops: 'porc',
}
const PREP_PASTELERIA: PrepInput = {
  paso: 'Postre', tipo: 'receta', ref_id: 'r2', nombre: 'Flan casero',
  prioridad: 'media', plaza: 'pasteleria', seccion_mise: 'heladera', usuario_asignado: null,
  cantidad_ops: 6, unidad_ops: 'porc',
}
const PREP_SIN_OPS: PrepInput = {
  paso: 'Entrada', tipo: 'producto', ref_id: 'p1', nombre: 'Pan casero',
  prioridad: 'baja', plaza: null, usuario_asignado: null,
}

describe('sincronizarMiseDeMenu', () => {
  it('crea un checklist_item por candidata (plaza+seccion_mise) y cuenta las que no tienen', async () => {
    const { supabase, store } = fakeSupabase()
    const res = await sincronizarMiseDeMenu({
      supabase, restauranteId: RID,
      menu: { id: MENU_ID, preparaciones: [PREP_PARRILLA, PREP_PASTELERIA, PREP_SIN_OPS] },
    })
    expect(res).toEqual({ creados: 2, sinOps: 1 })
    expect(store.checklist_items).toHaveLength(2)
    const bife = store.checklist_items.find(r => r.nombre === 'Bife a la criolla')
    expect(bife).toMatchObject({ menu_id: MENU_ID, plaza: 'parrilla', prioridad: 'sp', cantidad: 10, unidad: 'porc' })
  })

  it('idempotente — correr dos veces con el mismo menú no duplica filas', async () => {
    const { supabase, store } = fakeSupabase()
    const menu = { id: MENU_ID, preparaciones: [PREP_PARRILLA, PREP_PASTELERIA] }
    await sincronizarMiseDeMenu({ supabase, restauranteId: RID, menu })
    await sincronizarMiseDeMenu({ supabase, restauranteId: RID, menu })
    expect(store.checklist_items).toHaveLength(2)
  })

  it('prune — una preparación que se saca del menú se borra del mise al re-sincronizar', async () => {
    const { supabase, store } = fakeSupabase()
    await sincronizarMiseDeMenu({ supabase, restauranteId: RID, menu: { id: MENU_ID, preparaciones: [PREP_PARRILLA, PREP_PASTELERIA] } })
    expect(store.checklist_items).toHaveLength(2)

    const res = await sincronizarMiseDeMenu({ supabase, restauranteId: RID, menu: { id: MENU_ID, preparaciones: [PREP_PARRILLA] } })
    expect(res.creados).toBe(1)
    expect(store.checklist_items).toHaveLength(1)
    expect(store.checklist_items[0].nombre).toBe('Bife a la criolla')
  })

  it('re-sincronizar con un cambio de prioridad/cantidad actualiza la fila existente, no crea otra', async () => {
    const { supabase, store } = fakeSupabase()
    await sincronizarMiseDeMenu({ supabase, restauranteId: RID, menu: { id: MENU_ID, preparaciones: [PREP_PARRILLA] } })
    await sincronizarMiseDeMenu({
      supabase, restauranteId: RID,
      menu: { id: MENU_ID, preparaciones: [{ ...PREP_PARRILLA, prioridad: 'baja', cantidad_ops: 20 }] },
    })
    expect(store.checklist_items).toHaveLength(1)
    expect(store.checklist_items[0]).toMatchObject({ prioridad: 'chk', cantidad: 20 })
  })
})

describe('TAREA_PRIO_TO_MISE — debe ser exactamente el inverso de MISE_PRIO_TO_TAREA (ProductoMiseCard.tsx)', () => {
  it('mapea las 4 prioridades sin huecos', () => {
    expect(TAREA_PRIO_TO_MISE).toEqual({ critica: 'sp', alta: 'p', media: 'ref', baja: 'chk' })
  })
})

describe('menuItemVisible', () => {
  const CON_VIGENCIA = { menu_id: 'm1', menus: { nombre: 'Ejecutivo', vigencia_desde: '2026-08-18', vigencia_hasta: '2026-08-31' } }

  it('un ítem del mise fijo (sin menu_id) siempre es visible', () => {
    expect(menuItemVisible({ menu_id: null, menus: null }, '2026-01-01')).toBe(true)
  })

  it('con menu_id pero sin vigencia cargada, no se muestra', () => {
    expect(menuItemVisible({ menu_id: 'm1', menus: { nombre: 'X', vigencia_desde: null, vigencia_hasta: null } }, '2026-08-20')).toBe(false)
  })

  it('visible en el borde "desde" y el borde "hasta", inclusive', () => {
    expect(menuItemVisible(CON_VIGENCIA, '2026-08-18')).toBe(true)
    expect(menuItemVisible(CON_VIGENCIA, '2026-08-31')).toBe(true)
  })

  it('invisible el día anterior a "desde" y el día siguiente a "hasta"', () => {
    expect(menuItemVisible(CON_VIGENCIA, '2026-08-17')).toBe(false)
    expect(menuItemVisible(CON_VIGENCIA, '2026-09-01')).toBe(false)
  })
})
