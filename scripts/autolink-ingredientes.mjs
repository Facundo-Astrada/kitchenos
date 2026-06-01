// ============================================================
// Vincula ingredientes sin producto_id contra el catálogo de productos
// (match exacto → parcial → fuzzy por overlap de palabras) y copia el
// precio del producto como costo_unitario + su unidad como unidad_costo.
//
// Uso:
//   node scripts/autolink-ingredientes.mjs            (dry-run)
//   node scripts/autolink-ingredientes.mjs --apply    (aplica)
//
// Es la versión batch del endpoint /api/recetas/auto-link-ingredientes,
// pero corre directo con service role para procesar las ~831 filas de Bros.
// ============================================================
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const RID = 'e65cf95a-2c32-4244-b325-2379be5b3a6e' // Bros comedor
const APPLY = process.argv.includes('--apply')

function norm(s) {
  return (s || '').toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ')
}
function wordOverlap(a, b) {
  const words = s => s.split(' ').filter(w => w.length > 2)
  const wa = words(a), wb = new Set(words(b))
  if (wa.length === 0 || wb.size === 0) return 0
  return wa.filter(w => wb.has(w)).length / Math.min(wa.length, wb.size)
}
function findMatch(nombre, prods) {
  const n = norm(nombre)
  const exact = prods.find(p => norm(p.nombre) === n)
  if (exact) return { p: exact, conf: 'exacto' }
  const contains = prods.find(p => { const pn = norm(p.nombre); return pn.includes(n) || n.includes(pn) })
  if (contains) return { p: contains, conf: 'parcial' }
  let best, score = 0
  for (const p of prods) { const s = wordOverlap(n, norm(p.nombre)); if (s >= 0.7 && s > score) { score = s; best = p } }
  if (best) return { p: best, conf: 'fuzzy' }
  return null
}

// productos activos
const { data: productos } = await supabase
  .from('productos').select('id, nombre, precio_unitario, unidad')
  .eq('restaurante_id', RID).eq('activo', true)

// recetas activas
const { data: recetas } = await supabase
  .from('recetas').select('id').eq('restaurante_id', RID).eq('activa', true)
const recetaIds = recetas.map(r => r.id)

// ingredientes sin vincular
const { data: ings } = await supabase
  .from('ingredientes').select('id, nombre, receta_id, producto_id, tipo')
  .is('producto_id', null).in('receta_id', recetaIds)

const candidatos = (ings ?? []).filter(i => i.tipo === 'producto' || i.tipo === null)
console.log(`Productos: ${productos.length} · Ingredientes sin vincular: ${candidatos.length}\n`)

const plan = []
const stats = { exacto: 0, parcial: 0, fuzzy: 0, sin_match: 0 }
for (const ing of candidatos) {
  const m = findMatch(ing.nombre, productos)
  if (m) {
    stats[m.conf]++
    plan.push({ id: ing.id, nombre: ing.nombre, prod: m.p, conf: m.conf })
  } else {
    stats.sin_match++
  }
}

console.log(`Match exacto: ${stats.exacto} · parcial: ${stats.parcial} · fuzzy: ${stats.fuzzy} · sin match: ${stats.sin_match}`)
console.log('\nEjemplos (incluye fuzzy para revisar):')
for (const x of plan.filter(p => p.conf === 'fuzzy').slice(0, 12))
  console.log(`  [${x.conf}] "${x.nombre}" → "${x.prod.nombre}" ($${x.prod.precio_unitario}/${x.prod.unidad})`)

if (!APPLY) {
  console.log('\n[DRY-RUN] No se escribió nada. Corré con --apply para aplicar.')
  process.exit(0)
}

let ok = 0
for (let i = 0; i < plan.length; i += 20) {
  const chunk = plan.slice(i, i + 20)
  const res = await Promise.all(chunk.map(x =>
    supabase.from('ingredientes').update({
      producto_id: x.prod.id,
      costo_unitario: x.prod.precio_unitario,
      unidad_costo: x.prod.unidad,
    }).eq('id', x.id).then(r => !r.error)
  ))
  ok += res.filter(Boolean).length
}
console.log(`\n✓ Vinculados: ${ok}/${plan.length}`)
