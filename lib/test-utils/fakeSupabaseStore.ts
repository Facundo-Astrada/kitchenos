import type { SupabaseClient } from '@supabase/supabase-js'

// ── Fake Supabase en memoria, con filtrado REAL ─────────────────────────
// Distinto de `mockSupabase.ts` (que devuelve lo que le setean y no filtra):
// acá el subset de la query builder que usan los helpers de menús/mise
// (select/eq/ilike/is/in/limit/single/count, insert/update/delete) se ejecuta
// contra un store de filas, así que se pueden probar dedupe, prune y "qué
// quedó en qué día" de verdad.
//
// No es un cliente PostgREST completo — es exactamente lo que esos módulos
// llaman. Si un módulo nuevo necesita otro operador, se agrega acá.
export type Row = Record<string, unknown>

export class FakeQueryBuilder implements PromiseLike<{ data: unknown; count: number | null; error: null }> {
  private filters: ((row: Row) => boolean)[] = []
  private mode: 'select' | 'insert' | 'update' | 'delete' = 'select'
  private insertPayload: Row | Row[] | null = null
  private updatePayload: Row | null = null
  private limitN: number | null = null
  private singleMode = false
  private countMode = false

  constructor(private table: string, private store: Record<string, Row[]>) {
    this.store[table] ??= []
  }

  select(_cols?: string, opts?: { count?: string; head?: boolean }) { if (opts?.count) this.countMode = true; return this }
  insert(payload: Row | Row[]) { this.mode = 'insert'; this.insertPayload = payload; return this }
  update(payload: Row) { this.mode = 'update'; this.updatePayload = payload; return this }
  delete() { this.mode = 'delete'; return this }
  eq(col: string, val: unknown) { this.filters.push(row => row[col] === val); return this }
  ilike(col: string, val: string) { const v = String(val).toLowerCase(); this.filters.push(row => String(row[col] ?? '').toLowerCase() === v); return this }
  in(col: string, vals: unknown[]) { this.filters.push(row => vals.includes(row[col])); return this }
  is(col: string, val: unknown) { this.filters.push(row => (row[col] ?? null) === val); return this }
  limit(n: number) { this.limitN = n; return this }
  single() { this.singleMode = true; return this }

  private exec(): { data: unknown; count: number | null; error: null } {
    const rows = this.store[this.table]
    if (this.mode === 'insert') {
      const items = Array.isArray(this.insertPayload) ? this.insertPayload : [this.insertPayload as Row]
      const created = items.map((p, i) => ({ id: `${this.table}-${rows.length + i}-${Math.random().toString(36).slice(2, 7)}`, ...p }))
      rows.push(...created)
      return { data: this.singleMode ? created[0] : created, count: null, error: null }
    }
    let matched = rows.filter(r => this.filters.every(f => f(r)))
    if (this.mode === 'update') {
      matched.forEach(r => Object.assign(r, this.updatePayload))
      return { data: matched, count: null, error: null }
    }
    if (this.mode === 'delete') {
      const ids = new Set(matched.map(r => r.id))
      this.store[this.table] = rows.filter(r => !ids.has(r.id))
      return { data: matched, count: null, error: null }
    }
    if (this.countMode) return { data: null, count: matched.length, error: null }
    if (this.limitN != null) matched = matched.slice(0, this.limitN)
    return { data: this.singleMode ? (matched[0] ?? null) : matched, count: null, error: null }
  }

  then<TResult1 = { data: unknown; count: number | null; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; count: number | null; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.exec()).then(onfulfilled, onrejected)
  }
}

/** Cliente fake + acceso directo al store para armar el estado inicial y verificar. */
export function fakeSupabase(inicial: Record<string, Row[]> = {}) {
  const store: Record<string, Row[]> = { ...inicial }
  const client = { from: (table: string) => new FakeQueryBuilder(table, store) }
  return { supabase: client as unknown as SupabaseClient, store }
}
