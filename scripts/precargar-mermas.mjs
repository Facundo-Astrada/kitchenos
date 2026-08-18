// ============================================================
// Precarga productos.merma_esperada_pct (PLAN-4-CAPAS bloque B2) con la
// tabla de mermas típicas de la síntesis §5.5. Matchea por nombre de
// producto normalizado (palabra completa, sin acentos) contra una lista
// curada de ítems — no toca productos que ya tienen el campo cargado
// (idempotente, no pisa ediciones manuales).
//
// Uso:
//   node scripts/precargar-mermas.mjs                    (dry-run, El Rescoldo demo)
//   node scripts/precargar-mermas.mjs --apply             (aplica, El Rescoldo demo)
//   node scripts/precargar-mermas.mjs <restaurante_id> --apply
//
// Lee SUPABASE_SERVICE_ROLE_KEY de .env.local
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
const EL_RESCOLDO = '00000000-0000-0000-0000-000000000001' // demo — correr acá primero, no en producción
const APPLY = process.argv.includes('--apply')
const RID = process.argv.find(a => /^[0-9a-f-]{36}$/i.test(a)) ?? EL_RESCOLDO

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

// Tabla de la síntesis §5.5. Palabras exactas (con su plural), no
// keywords parciales — "res" como substring rompería contra "reserva".
const MERMA_TABLE = [
  { pct: 8, palabras: ['uva', 'uvas', 'melon', 'melones', 'durazno', 'duraznos', 'cereza', 'cerezas', 'mandarina', 'mandarinas', 'arandano', 'arandanos', 'coco', 'cocos', 'lechuga', 'lechugas'] },
  { pct: 10, palabras: ['manzana', 'manzanas', 'naranja', 'naranjas', 'pina', 'pinas', 'sandia', 'sandias', 'mango', 'mangos', 'pera', 'peras', 'limon', 'limones', 'granada', 'granadas', 'guayaba', 'guayabas', 'zanahoria', 'zanahorias', 'brocoli', 'brocolis', 'pepino', 'pepinos', 'pimiento', 'pimientos', 'esparrago', 'esparragos'] },
  { pct: 12, palabras: ['fresa', 'fresas', 'frutilla', 'frutillas', 'kiwi', 'kiwis', 'frambuesa', 'frambuesas', 'cebolla', 'cebollas', 'calabaza', 'calabazas', 'apio', 'apios', 'berenjena', 'berenjenas'] },
  { pct: 15, palabras: ['tomate', 'tomates', 'papa', 'papas', 'remolacha', 'remolachas', 'calabacin', 'calabacines', 'acelga', 'acelgas', 'espinaca', 'espinacas'] },
  { pct: 18, palabras: ['res'] },
  { pct: 20, palabras: ['pollo', 'pollos', 'cordero', 'corderos'] },
  { pct: 22, palabras: ['cerdo', 'cerdos'] },
]

const PALABRA_A_PCT = new Map()
for (const { pct, palabras } of MERMA_TABLE) {
  for (const p of palabras) PALABRA_A_PCT.set(p, pct)
}

// La merma de la tabla es de la fruta/verdura/carne CRUDA, entera. Un
// producto derivado (jugo, polvo, salsa, enlatado…) tiene su propia
// merma — casi siempre nula una vez envasado — y no la de la materia
// prima. Si el nombre trae alguna de estas palabras, no matchea aunque
// contenga "limón" o "tomate" adentro.
const PALABRAS_PROCESADO = new Set([
  'polvo', 'jugo', 'ralladura', 'rallado', 'rallada', 'salsa', 'vinagre',
  'pickle', 'enlatado', 'enlatados', 'enlatada', 'enlatadas', 'lata',
  'reducido', 'reducida', 'rehidratado', 'rehidratada', 'seco', 'seca',
  'secos', 'secas', 'sabor', 'topping', 'concentrado', 'concentrada',
  'deshidratado', 'deshidratada', 'pure', 'conserva', 'confitado', 'confitada',
])

function normalize(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

function matchPct(nombre) {
  const tokens = normalize(nombre).split(/[^a-z0-9]+/).filter(Boolean)
  if (tokens.some(t => PALABRAS_PROCESADO.has(t))) return null
  for (const t of tokens) {
    const pct = PALABRA_A_PCT.get(t)
    if (pct != null) return pct
  }
  return null
}

// --- main ---
const { data: productos, error } = await supabase
  .from('productos')
  .select('id, nombre, merma_esperada_pct, fuera_de_uso')
  .eq('restaurante_id', RID)
  .eq('activo', true)

if (error) { console.error('Error cargando productos:', error.message); process.exit(1) }
console.log(`Restaurante: ${RID}`)
console.log(`Productos activos: ${productos.length}\n`)

const candidatos = productos.filter(p => !p.fuera_de_uso && p.merma_esperada_pct == null)
const propuestas = []
for (const p of candidatos) {
  const pct = matchPct(p.nombre)
  if (pct != null) propuestas.push({ id: p.id, nombre: p.nombre, pct })
}

const dist = {}
for (const { pct } of propuestas) dist[pct] = (dist[pct] || 0) + 1
console.log('Distribución de mermas a cargar:')
for (const [pct, n] of Object.entries(dist).sort((a, b) => +a[0] - +b[0])) console.log(`  ${pct}%  ${n} producto${n !== 1 ? 's' : ''}`)
console.log(`\nCon match: ${propuestas.length}/${candidatos.length} candidatos (ya tenían el campo cargado: ${productos.length - candidatos.length})`)
console.log('\nEjemplos:')
for (const p of propuestas.slice(0, 15)) console.log(`  "${p.nombre}" → ${p.pct}%`)

const sinMatch = candidatos.filter(p => matchPct(p.nombre) == null)
if (sinMatch.length > 0) {
  console.log(`\nSin match (${sinMatch.length}), quedan sin merma esperada — cargar a mano si corresponde:`)
  for (const p of sinMatch.slice(0, 20)) console.log(`  "${p.nombre}"`)
  if (sinMatch.length > 20) console.log(`  … y ${sinMatch.length - 20} más`)
}

if (!APPLY) {
  console.log('\n[DRY-RUN] No se escribió nada. Corré con --apply para aplicar.')
  process.exit(0)
}

let ok = 0
for (let i = 0; i < propuestas.length; i += 20) {
  const chunk = propuestas.slice(i, i + 20)
  const res = await Promise.all(chunk.map(p =>
    supabase.from('productos').update({ merma_esperada_pct: p.pct }).eq('id', p.id).then(r => !r.error)
  ))
  ok += res.filter(Boolean).length
}
console.log(`\n✓ Actualizados: ${ok}/${propuestas.length}`)
