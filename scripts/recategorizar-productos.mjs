// ============================================================
// Re-categoriza los productos de un restaurante a las 16 categorías
// canónicas de KitchenOS. Reglas de keyword primero; los que caen en
// 'Otros' se mandan a Claude Haiku en batch.
//
// Uso:
//   node scripts/recategorizar-productos.mjs            (dry-run, no escribe)
//   node scripts/recategorizar-productos.mjs --apply    (aplica cambios)
//
// Lee SUPABASE_SERVICE_ROLE_KEY y ANTHROPIC_API_KEY de .env.local
// ============================================================
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

// --- cargar .env.local manualmente (sin dependencias) ---
const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
const ANTHROPIC_KEY = env.ANTHROPIC_API_KEY
const RID = 'e65cf95a-2c32-4244-b325-2379be5b3a6e' // Bros comedor
const APPLY = process.argv.includes('--apply')

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

const CATEGORIAS_VALIDAS = [
  'Carnes', 'Pescados', 'Verduras', 'Frutas', 'Lácteos', 'Panadería',
  'Secos', 'Especias', 'Bebidas', 'Aceites', 'Vinagres', 'Conservas',
  'Congelados', 'Limpieza', 'Descartables', 'Otros',
]

const CATEGORIA_KEYWORDS = {
  Carnes: ['bife', 'lomo', 'pollo', 'cerdo', 'cordero', 'ternera', 'carne', 'jamon', 'panceta', 'morcilla', 'chorizo', 'matambre', 'milanesa', 'bondiola', 'pechuga', 'pata muslo', 'picana', 'mollejas', 'grasa', 'osobuco', 'vacio', 'asado', 'roast beef'],
  Pescados: ['salmon', 'atun', 'merluza', 'trucha', 'langostino', 'camaron', 'pacu', 'pejerrey', 'anchoa', 'sardina', 'calamar', 'pulpo', 'mejillon', 'marisco'],
  Verduras: ['cebolla', 'tomate', 'zanahoria', 'papa', 'lechuga', 'rucula', 'espinaca', 'kale', 'apio', 'ajo', 'perejil', 'cilantro', 'albahaca', 'romero', 'tomillo', 'puerro', 'verdeo', 'remolacha', 'pepino', 'jalapeno', 'pimiento', 'pimenton', 'choclo', 'chaucha', 'arveja', 'brocoli', 'coliflor', 'repollo', 'batata', 'calabacin', 'berenjena', 'champinon', 'portobello', 'girgolas', 'menta', 'hinojo', 'zapallo', 'calabaza', 'hongo', 'rabano', 'radicheta', 'hidroponic'],
  Frutas: ['manzana', 'pera', 'naranja', 'limon', 'lima', 'banana', 'frutilla', 'arandano', 'durazno', 'mandarina', 'pomelo', 'uva', 'mango', 'ciruela', 'cereza', 'membrillo', 'piña', 'palta', 'datil', 'higo', 'frambuesa', 'mora'],
  Lácteos: ['leche', 'crema', 'queso', 'manteca', 'mantequilla', 'yogur', 'ricota', 'mozzarella', 'parmesano', 'mascarpone', 'provolone', 'reggianito', 'huevo', 'fior di late', 'fior di latte', 'fontina', 'gouda', 'cheddar'],
  Panadería: ['harina', 'pan ', 'levadura', 'masa', 'galleta', 'tostada', 'panko', 'pan rallado', 'budin', 'factura', 'medialuna', 'bizcocho'],
  Secos: ['arroz', 'quinoa', 'fideo', 'pasta', 'lenteja', 'poroto', 'garbanzo', 'cuscus', 'avena', 'cereal', 'azucar', 'sal', 'gelatina', 'glucosa', 'almidon', 'fecula', 'semola', 'polenta', 'trigo', 'lino', 'chia', 'cacao', 'nuez', 'almendra', 'mani', 'sarraceno', 'coco rallado', 'chocolate', 'isomalta', 'goma xant'],
  Especias: ['pimienta', 'comino', 'oregano', 'curry', 'azafran', 'paprika', 'cayena', 'curcuma', 'jengibre', 'canela', 'laurel', 'clavo', 'nuez moscada', 'cardamomo', 'mostaza', 'aji molido', 'coriandro', 'enebro', 'especia', 'garam', 'masala', 'sumak', 'fenogreco'],
  Bebidas: ['vino', 'cerveza', 'agua', 'gaseosa', 'jugo', 'cafe', 'te ', 'fernet', 'gin', 'whisky', 'vodka', 'campari', 'aperol', 'malbec', 'cabernet', 'espumante', 'champagne', 'licor', 'mosto', 'tonica', 'coca', 'sprite', 'pepsi', 'yerba', 'proseco', 'ipa', 'espiritus', 'saquitos de te'],
  Aceites: ['aceite', 'oliva', 'sesamo', 'sésamo', 'girasol', 'zuelo', 'fritolin', 'barbieri'],
  Vinagres: ['vinagre', 'aceto', 'balsamico'],
  Conservas: ['aceitunas', 'alcaparra', 'tomate triturado', 'pickle', 'salsa de soja', 'salsa inglesa', 'pure de tomate', 'conserva', 'alga', 'miso', 'arrope'],
  Congelados: ['congelado', 'frozen', 'helado'],
  Limpieza: ['detergente', 'lavandina', 'jabon', 'desengrasante', 'cif', 'cera', 'esponja', 'paño', 'pano', 'cloro', 'quimica', 'cellwash', 'desinfect', 'detercell', 'descarboniz', 'descalcific', 'bacteria para', 'blem', 'gotita', 'hot plus'],
  Descartables: ['servilleta', 'bolsa', 'cinta', 'papel aluminio', 'papel manteca', 'guantes', 'cofia', 'film', 'descartable', 'vaso', 'sorbete', 'contenedor', 'bandeja', 'packaging', 'toalla', 'manga repostera', 'tripa', 'envase', 'microfibra', 'curitas', 'carbon', 'leña', 'lena', 'gas'],
  Otros: [],
}

function norm(s) {
  return (s || '').toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ')
}

// Orden de evaluación: más específico primero. Aceites/Vinagres ANTES que
// Verduras (que tiene 'ajo' → capturaba "Aceite de ajo") y Bebidas.
const PRIORIDAD = [
  'Limpieza', 'Descartables', 'Aceites', 'Vinagres', 'Carnes', 'Pescados',
  'Lácteos', 'Especias', 'Conservas', 'Panadería', 'Secos',
  'Frutas', 'Verduras', 'Bebidas', 'Congelados',
]

function categorizarRule(nombre) {
  const n = norm(nombre)
  for (const cat of PRIORIDAD) {
    if (CATEGORIA_KEYWORDS[cat].some(kw => n.includes(norm(kw)))) return cat
  }
  return 'Otros'
}

async function categorizarIA(nombres) {
  const out = new Map()
  if (!ANTHROPIC_KEY || nombres.length === 0) return out
  const chunks = []
  for (let i = 0; i < nombres.length; i += 50) chunks.push(nombres.slice(i, i + 50))
  const responses = await Promise.all(chunks.map(chunk => {
    const prompt = `Categorizá cada producto de cocina en UNA de estas categorías:
${CATEGORIAS_VALIDAS.join(', ')}

Productos:
${chunk.map((n, i) => `${i + 1}. ${n}`).join('\n')}

Responde SOLO un JSON array con la categoría de cada producto en el mismo orden, sin texto adicional.
Ejemplo: ["Carnes", "Verduras", ...]`
    return fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 2048, messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }] }),
    }).then(r => r.ok ? r.json() : null).catch(() => null)
  }))
  responses.forEach((data, idx) => {
    if (!data) return
    const text = data.content?.[0]?.text ?? ''
    const clean = text.replace(/```json?\n?/gi, '').replace(/```/g, '').trim()
    try {
      const arr = JSON.parse(clean)
      chunks[idx].forEach((nombre, i) => {
        if (CATEGORIAS_VALIDAS.includes(arr[i])) out.set(nombre, arr[i])
      })
    } catch {}
  })
  return out
}

// --- main ---
const { data: productos, error } = await supabase
  .from('productos')
  .select('id, nombre, categoria')
  .eq('restaurante_id', RID)
  .eq('activo', true)

if (error) { console.error('Error cargando productos:', error.message); process.exit(1) }
console.log(`Productos: ${productos.length}\n`)

const nuevaCategoria = new Map()
for (const p of productos) nuevaCategoria.set(p.id, categorizarRule(p.nombre))

// IA para los que quedaron en Otros
const ambiguos = productos.filter(p => nuevaCategoria.get(p.id) === 'Otros')
console.log(`Resueltos por reglas: ${productos.length - ambiguos.length} · Ambiguos → IA: ${ambiguos.length}`)
if (ambiguos.length > 0) {
  const iaMap = await categorizarIA(ambiguos.map(p => p.nombre))
  for (const p of ambiguos) {
    const cat = iaMap.get(p.nombre)
    if (cat) nuevaCategoria.set(p.id, cat)
  }
}

// Guard: keywords muy confiables de packaging/limpieza pisan a la IA,
// que a veces manda servilletas/bolsas a 'Bebidas' u 'Otros'.
const GUARD = {
  Aceites: ['aceite', 'oliva', 'zuelo', 'fritolin', 'barbieri'],
  Vinagres: ['vinagre', 'aceto', 'balsamico'],
  Descartables: ['servilleta', 'bolsa', 'film', 'guantes', 'cofia', 'vaso', 'sorbete', 'bandeja', 'contenedor', 'descartable', 'papel aluminio', 'papel manteca', 'toalla', 'tripa', 'envase', 'microfibra', 'manga repostera'],
  Limpieza: ['detergente', 'lavandina', 'desengrasante', 'cloro', 'desinfect', 'jabon', 'detercell', 'descarboniz', 'bacteria para', 'blem', 'gotita', 'hot plus'],
}
for (const p of productos) {
  const n = norm(p.nombre)
  for (const [cat, kws] of Object.entries(GUARD)) {
    if (kws.some(kw => n.includes(norm(kw)))) { nuevaCategoria.set(p.id, cat); break }
  }
}

// resumen de cambios
const cambios = productos.filter(p => p.categoria !== nuevaCategoria.get(p.id))
const dist = {}
for (const p of productos) { const c = nuevaCategoria.get(p.id); dist[c] = (dist[c] || 0) + 1 }
console.log('\nDistribución final:')
for (const [c, n] of Object.entries(dist).sort((a, b) => b[1] - a[1])) console.log(`  ${c.padEnd(14)} ${n}`)
console.log(`\nProductos que cambian de categoría: ${cambios.length}`)
console.log('Ejemplos:')
for (const p of cambios.slice(0, 15)) console.log(`  "${p.nombre}": ${p.categoria} → ${nuevaCategoria.get(p.id)}`)

if (!APPLY) {
  console.log('\n[DRY-RUN] No se escribió nada. Corré con --apply para aplicar.')
  process.exit(0)
}

// aplicar en chunks
let ok = 0
for (let i = 0; i < cambios.length; i += 20) {
  const chunk = cambios.slice(i, i + 20)
  const res = await Promise.all(chunk.map(p =>
    supabase.from('productos').update({ categoria: nuevaCategoria.get(p.id) }).eq('id', p.id).then(r => !r.error)
  ))
  ok += res.filter(Boolean).length
}
console.log(`\n✓ Actualizados: ${ok}/${cambios.length}`)
