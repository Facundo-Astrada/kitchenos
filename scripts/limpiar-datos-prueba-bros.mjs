// ============================================================
// Limpia datos de prueba / basura en la cuenta Bros Comedor.
//
// Acciones:
//   1. MENSAJES PASE   — mensajes con texto basura (caracteres aleatorios)
//                        creados en junio 2026 que contaminan el historial
//   2. STOCK UMBRALES  — productos con stock_minimo absurdamente alto vs
//                        stock_actual (ej. 0.08 unidad / mínimo 40000) o
//                        ambos en 0/NULL que generan alertas falsas
//   3. PLAZAS EQUIPO   — plazas duplicadas y sin tildes en equipo_miembros
//
// Uso:
//   node scripts/limpiar-datos-prueba-bros.mjs           (dry-run — solo muestra)
//   node scripts/limpiar-datos-prueba-bros.mjs --apply   (aplica cambios)
//
// SIEMPRE correr dry-run primero, revisar con Facundo, luego --apply.
// ============================================================

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
const RID = 'e65cf95a-2c32-4244-b325-2379be5b3a6e' // Bros comedor
const APPLY = process.argv.includes('--apply')

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

console.log(`\n========================================`)
console.log(` Limpieza Bros — modo: ${APPLY ? '⚠️  APPLY' : '🔍 DRY-RUN'}`)
console.log(`========================================\n`)

// ── 1. Mensajes de pase con texto basura ─────────────────────
// Detecta mensajes cuyo texto tiene secuencias de ≥5 consonantes seguidas
// (patrón imposible en español normal) — señal de texto aleatorio.
// Ventana: junio 2026 donde se detectó el problema.
const BASURA_REGEX = /[bcdfghjklmnñpqrstvwxyz]{5,}/i

const { data: mensajes } = await supabase
  .from('pase_mensajes')
  .select('id, texto, usuario_nombre, created_at')
  .eq('restaurante_id', RID)
  .gte('created_at', '2026-06-01')
  .lte('created_at', '2026-07-01')

const mensajesBasura = (mensajes ?? []).filter(m => BASURA_REGEX.test(m.texto ?? ''))

console.log(`📨 MENSAJES PASE con texto basura: ${mensajesBasura.length}`)
mensajesBasura.forEach(m => {
  const fecha = m.created_at?.slice(0, 10) ?? '?'
  const texto = (m.texto ?? '').slice(0, 80)
  console.log(`   [${fecha}] ${m.usuario_nombre ?? 'desconocido'}: "${texto}"`)
})

if (APPLY && mensajesBasura.length > 0) {
  const ids = mensajesBasura.map(m => m.id)
  const { error } = await supabase.from('pase_mensajes').delete().in('id', ids)
  if (error) console.error('   ❌ Error:', error.message)
  else console.log(`   ✅ ${ids.length} mensajes eliminados`)
}

// ── 2. Stock: umbrales absurdos ───────────────────────────────
// Detecta dos categorías de problemas:
//   A) stock_minimo > stock_actual × 500 AND stock_actual < 5
//      → umbral absurdo (ej. 0.08 con mínimo 40000)
//   B) stock_minimo = 0 AND stock_critico = 0 AND stock_actual = 0
//      → genera alerta "crítico" pero no tiene configuración real
//
// Fix propuesto: setear stock_minimo = NULL, stock_critico = NULL

const { data: productos } = await supabase
  .from('productos')
  .select('id, nombre, stock_actual, stock_minimo, stock_critico, unidad')
  .eq('restaurante_id', RID)

const absurdos = (productos ?? []).filter(p => {
  const actual = p.stock_actual ?? 0
  const minimo = p.stock_minimo ?? 0
  const critico = p.stock_critico ?? 0
  // Caso A: umbral exageradamente alto
  if (actual > 0 && actual < 5 && minimo > actual * 500) return true
  // Caso B: todo en 0 → falsa alerta roja
  if (actual === 0 && minimo === 0 && critico === 0) return true
  return false
})

const casosA = absurdos.filter(p => {
  const actual = p.stock_actual ?? 0
  const minimo = p.stock_minimo ?? 0
  return actual > 0 && actual < 5 && minimo > actual * 500
})
const casosB = absurdos.filter(p => {
  const actual = p.stock_actual ?? 0
  const minimo = p.stock_minimo ?? 0
  const critico = p.stock_critico ?? 0
  return actual === 0 && minimo === 0 && critico === 0
})

console.log(`\n📦 STOCK — umbrales absurdos: ${absurdos.length} productos`)
console.log(`   Caso A (umbral exagerado, ${casosA.length}):`)
casosA.slice(0, 15).forEach(p =>
  console.log(`   · ${p.nombre} — actual: ${p.stock_actual} ${p.unidad}, mínimo: ${p.stock_minimo}`)
)
if (casosA.length > 15) console.log(`   ... y ${casosA.length - 15} más`)

console.log(`   Caso B (todo en 0, genera alerta falsa, ${casosB.length}):`)
casosB.slice(0, 10).forEach(p =>
  console.log(`   · ${p.nombre} — actual/min/crít: 0/0/0`)
)
if (casosB.length > 10) console.log(`   ... y ${casosB.length - 10} más`)

if (APPLY && casosA.length > 0) {
  // Caso A: umbral exagerado → resetear a 0 (columna es NOT NULL)
  const ids = casosA.map(p => p.id)
  const { error } = await supabase
    .from('productos')
    .update({ stock_minimo: 0, stock_critico: 0 })
    .in('id', ids)
  if (error) console.error('   ❌ Error Caso A:', error.message)
  else console.log(`   ✅ ${ids.length} productos Caso A reseteados a 0`)
}
// Caso B: ya están en 0/0 — nada que cambiar en DB

// ── 3. Plazas equipo — dedup + tildes ────────────────────────
const TILDES = {
  pasteleria: 'Pastelería',
  frios: 'Fríos',
  linea: 'Línea',
  produccion: 'Producción',
  administracion: 'Administración',
  gestion: 'Gestión',
}

function normalizarPlaza(plaza) {
  const key = plaza.toLowerCase().trim()
  return TILDES[key] ?? (plaza.charAt(0).toUpperCase() + plaza.slice(1))
}

const { data: miembros } = await supabase
  .from('equipo_miembros')
  .select('id, nombre, apellido, plaza_asignada')
  .eq('restaurante_id', RID)

const conProblema = (miembros ?? []).filter(m => {
  const plaza = m.plaza_asignada ?? ''
  if (!plaza) return false
  const partes = plaza.split(/[\s·,]+/).filter(Boolean)
  const unicas = [...new Set(partes.map(p => normalizarPlaza(p)))]
  // Hay duplicados o diferente forma
  return JSON.stringify(partes) !== JSON.stringify(unicas) || partes.some(p => normalizarPlaza(p) !== p)
})

console.log(`\n👥 EQUIPO — plazas con duplicados o sin tildes: ${conProblema.length}`)
const updates = conProblema.map(m => {
  const partes = (m.plaza_asignada ?? '').split(/[\s·,]+/).filter(Boolean)
  const unicas = [...new Set(partes.map(normalizarPlaza))]
  const plazaFix = unicas.join(' · ')
  console.log(`   ${m.nombre} ${m.apellido}: "${m.plaza_asignada}" → "${plazaFix}"`)
  return { id: m.id, plaza_asignada: plazaFix }
})

if (APPLY && updates.length > 0) {
  for (const u of updates) {
    const { error } = await supabase
      .from('equipo_miembros')
      .update({ plaza_asignada: u.plaza_asignada })
      .eq('id', u.id)
    if (error) console.error(`   ❌ Error en ${u.id}:`, error.message)
  }
  console.log(`   ✅ ${updates.length} miembros actualizados`)
}

// ── Resumen ───────────────────────────────────────────────────
console.log(`\n========================================`)
if (APPLY) {
  console.log(` ✅ Limpieza aplicada.`)
  console.log(` Verificar: Stock alerts < 50, historial pase limpio.`)
} else {
  console.log(` 🔍 Dry-run completo. Revisá la lista con Facundo.`)
  console.log(` Para aplicar: node scripts/limpiar-datos-prueba-bros.mjs --apply`)
}
console.log(`========================================\n`)
