// ============================================================
// Limpia facturas que NO son compras de mercadería: pagos a
// empleados/socios (sueldos, adelantos, retiros) que contaminan
// los reportes de compras y CMV.
//
// Detección por capas:
//   1. EMPLEADOS  — proveedor empieza con "Empleado" (100% confiable en Fudo)
//   2. LISTA      — proveedor matchea restaurantes.configuracion.nombres_excluidos
//   3. EXTRA      — nombres pasados por --nombres "Franco Ghione,Bustos Beltran"
//
// Uso:
//   node scripts/limpiar-facturas-personales.mjs                          (dry-run)
//   node scripts/limpiar-facturas-personales.mjs --nombres "A,B"          (dry-run + extra)
//   node scripts/limpiar-facturas-personales.mjs --apply                  (BORRA grupos 1+2+extra)
//   node scripts/limpiar-facturas-personales.mjs --nombres "A,B" --apply  (BORRA todo)
//
// Lee SUPABASE_SERVICE_ROLE_KEY de .env.local. Borra factura_items primero, luego facturas.
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

const nombresArgIdx = process.argv.indexOf('--nombres')
const nombresExtra = nombresArgIdx >= 0 && process.argv[nombresArgIdx + 1]
  ? process.argv[nombresArgIdx + 1].split(',').map(s => s.trim()).filter(Boolean)
  : []

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

function norm(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const fmt = n => '$' + Number(n || 0).toLocaleString('es-AR')

async function main() {
  // Lista configurada en el restaurante
  const { data: rest } = await supabase.from('restaurantes').select('configuracion').eq('id', RID).single()
  const cfg = rest?.configuracion ?? {}
  const listaConfig = Array.isArray(cfg.nombres_excluidos) ? cfg.nombres_excluidos : []
  const internosNorm = [...listaConfig, ...nombresExtra].map(norm).filter(Boolean)

  // Todas las facturas del restaurante
  const { data: facturas, error } = await supabase
    .from('facturas')
    .select('id, proveedor_nombre, total')
    .eq('restaurante_id', RID)
  if (error) { console.error('Error leyendo facturas:', error.message); process.exit(1) }

  const grupoEmpleados = []
  const grupoLista = []
  for (const f of facturas) {
    const prov = norm(f.proveedor_nombre)
    if (prov.startsWith('empleado')) { grupoEmpleados.push(f); continue }
    if (internosNorm.some(n => n && (prov.includes(n) || n.includes(prov)))) { grupoLista.push(f); continue }
  }

  const aBorrar = [...grupoEmpleados, ...grupoLista]
  const idsBorrar = aBorrar.map(f => f.id)
  const totalBorrar = aBorrar.reduce((s, f) => s + (f.total || 0), 0)

  // Resumen por proveedor de lo que se borraría
  const porProv = {}
  for (const f of aBorrar) {
    porProv[f.proveedor_nombre] = porProv[f.proveedor_nombre] || { n: 0, total: 0 }
    porProv[f.proveedor_nombre].n++
    porProv[f.proveedor_nombre].total += f.total || 0
  }

  console.log('\n══════════════════════════════════════════════════════')
  console.log(`  LIMPIEZA DE FACTURAS PERSONALES — Bros`)
  console.log(`  Modo: ${APPLY ? '⚠️  APPLY (BORRA)' : 'dry-run (no escribe)'}`)
  console.log('══════════════════════════════════════════════════════')
  console.log(`\nFacturas totales del restaurante: ${facturas.length}`)
  console.log(`Lista configurada (nombres_excluidos): ${listaConfig.length ? listaConfig.join(', ') : '(vacía)'}`)
  if (nombresExtra.length) console.log(`Nombres extra (--nombres): ${nombresExtra.join(', ')}`)

  console.log(`\n── A BORRAR (${aBorrar.length} facturas · ${fmt(totalBorrar)}) ──`)
  console.log(`   Grupo "Empleado *": ${grupoEmpleados.length} facturas`)
  console.log(`   Grupo lista/extra:  ${grupoLista.length} facturas`)
  Object.entries(porProv).sort((a, b) => b[1].total - a[1].total).forEach(([prov, v]) => {
    console.log(`   · ${prov.padEnd(45)} ${String(v.n).padStart(3)} fact  ${fmt(v.total)}`)
  })

  // Candidatos persona física no incluidos (para que el usuario los revise)
  const incluidos = new Set(aBorrar.map(f => f.proveedor_nombre))
  const provUnicos = {}
  for (const f of facturas) {
    if (incluidos.has(f.proveedor_nombre)) continue
    provUnicos[f.proveedor_nombre] = provUnicos[f.proveedor_nombre] || { n: 0, total: 0 }
    provUnicos[f.proveedor_nombre].n++
    provUnicos[f.proveedor_nombre].total += f.total || 0
  }
  const EMPRESA_KW = ['srl', 'sa', 'sas', 'distribuidora', 'frigorifico', 'mercado', 'banco', 'club', 'hielo',
    'bebidas', 'ferreteria', 'dietetica', 'finca', 'grupo', 'community', 'managers', 'afip', 'rentas',
    'municipalidad', 'aguas', 'fibertel', 'mapfre', 'rappi', 'fudo', 'pixel', 'carnes', 'pescado',
    'hidroponic', 'girgolas', 'productos', 'eventual', 'jardineros', 'estancia', 'horizonte', 'distrib']
  const candidatos = Object.entries(provUnicos).filter(([prov]) => {
    const limpio = prov.replace(/\(.*?\)/g, '').split(/[-–]/)[0].trim()
    const palabras = norm(limpio).split(' ').filter(Boolean)
    if (palabras.length < 2 || palabras.length > 3) return false
    if (palabras.some(p => /\d/.test(p))) return false
    if (EMPRESA_KW.some(kw => norm(prov).includes(kw))) return false
    return true
  }).sort((a, b) => b[1].total - a[1].total)

  if (candidatos.length) {
    console.log(`\n── CANDIDATOS persona física (NO se borran — revisá y pasalos con --nombres) ──`)
    candidatos.forEach(([prov, v]) => {
      console.log(`   ? ${prov.padEnd(45)} ${String(v.n).padStart(3)} fact  ${fmt(v.total)}`)
    })
  }

  if (!APPLY) {
    console.log(`\n→ Dry-run. Para borrar las ${aBorrar.length} facturas: agregá --apply`)
    console.log(`→ Para incluir socios/candidatos: --nombres "Franco Ghione,Bustos Beltran" --apply\n`)
    return
  }

  if (idsBorrar.length === 0) { console.log('\nNada para borrar.\n'); return }

  // Borrar items primero (FK), luego facturas, en lotes
  const BATCH = 100
  let itemsBorrados = 0
  for (let i = 0; i < idsBorrar.length; i += BATCH) {
    const lote = idsBorrar.slice(i, i + BATCH)
    const { count } = await supabase.from('factura_items').delete({ count: 'exact' }).in('factura_id', lote)
    itemsBorrados += count || 0
  }
  let factBorradas = 0
  for (let i = 0; i < idsBorrar.length; i += BATCH) {
    const lote = idsBorrar.slice(i, i + BATCH)
    const { count, error: e } = await supabase.from('facturas').delete({ count: 'exact' }).in('id', lote)
    if (e) { console.error('Error borrando facturas:', e.message); process.exit(1) }
    factBorradas += count || 0
  }

  console.log(`\n✓ Borradas ${factBorradas} facturas (${fmt(totalBorrar)}) y ${itemsBorrados} items.\n`)
}

main().catch(e => { console.error(e); process.exit(1) })
