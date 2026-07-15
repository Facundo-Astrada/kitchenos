// ============================================================
// Módulo Gastos — Fase 1 para Bros: siembra categorias_gasto (taxonomía real
// que el cliente ya usa en Fudo, tomada de una captura de su Cat. de Gastos)
// y auto-categoriza facturas.categoria_gasto_id por reglas de proveedor_nombre.
//
// Reglas CONSERVADORAS a propósito: solo categoriza cuando el nombre del
// proveedor da una señal clara e inequívoca. Datos ambiguos quedan sin
// categorizar (NULL) y se listan al final — mejor eso que adivinar mal en
// un P&L. Idempotente: solo toca facturas con categoria_gasto_id IS NULL,
// así una corrida posterior no pisa categorizaciones manuales.
//
// Uso:
//   node scripts/categorizar-gastos-bros.mjs           (dry-run — solo muestra)
//   node scripts/categorizar-gastos-bros.mjs --apply   (aplica cambios)
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
const RESTAURANTE_ID = 'e65cf95a-2c32-4244-b325-2379be5b3a6e' // Bros
const APPLY = process.argv.includes('--apply')

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

function sinTildes(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

// Taxonomía real de Bros (extraída de su Cat. de Gastos en Fudo) + agregados
// mínimos justificados por proveedores reales que no encajaban en ninguna.
const CATEGORIAS = [
  // mercadería
  { nombre: 'Almacen', financiera: 'mercaderia' },
  { nombre: 'Verduras y Frutas', financiera: 'mercaderia' },
  { nombre: 'Carnes', financiera: 'mercaderia' },
  { nombre: 'Pesca', financiera: 'mercaderia' },
  { nombre: 'Lácteos y quesos', financiera: 'mercaderia' },
  { nombre: 'Bebidas con Alcohol', financiera: 'mercaderia' },
  { nombre: 'Bebidas sin alcohol', financiera: 'mercaderia' },
  { nombre: 'Helado', financiera: 'mercaderia' },
  // operacional
  { nombre: 'Descartables', financiera: 'operacional' },
  { nombre: 'Egresos Varios', financiera: 'operacional' },
  { nombre: 'Equipamiento', financiera: 'operacional' },
  { nombre: 'Impuestos y Servicios', financiera: 'operacional' },
  { nombre: 'Mano de Obra', financiera: 'operacional' },
  { nombre: 'Mantenimiento e Infraestructura', financiera: 'operacional' },
  { nombre: 'Alquiler', financiera: 'operacional' },
  { nombre: 'Marketing y Publicidad', financiera: 'operacional' },
  { nombre: 'Suscripciones y Software', financiera: 'operacional' },
  // administrativo
  { nombre: 'Honorarios', financiera: 'administrativo' },
  { nombre: 'Seguros', financiera: 'administrativo' },
]

// Reglas por proveedor_nombre (case/tilde-insensitive, primera que matchea gana).
const RULES = [
  [/afip/i, 'Impuestos y Servicios'],
  [/\brentas\b/i, 'Impuestos y Servicios'],
  [/municipalidad/i, 'Impuestos y Servicios'],
  [/provincia de cordoba/i, 'Impuestos y Servicios'],
  [/\bepec\b/i, 'Impuestos y Servicios'],
  [/ecogas/i, 'Impuestos y Servicios'],
  [/aguas cordobesas/i, 'Impuestos y Servicios'],
  [/fibertel/i, 'Impuestos y Servicios'],
  [/mercado pago/i, 'Impuestos y Servicios'],
  [/payway/i, 'Impuestos y Servicios'],
  [/banco macro/i, 'Impuestos y Servicios'],
  [/banco frances/i, 'Impuestos y Servicios'],
  [/sadaic/i, 'Impuestos y Servicios'],
  [/aadi capif/i, 'Impuestos y Servicios'],
  [/bromatolog/i, 'Impuestos y Servicios'],
  [/rappi/i, 'Impuestos y Servicios'],
  [/\bsimple\b/i, 'Impuestos y Servicios'],

  [/^alquiler/i, 'Alquiler'],

  [/^contador/i, 'Honorarios'],

  [/mapfre/i, 'Seguros'],

  [/fumigaci/i, 'Mantenimiento e Infraestructura'],
  [/mantenimiento/i, 'Mantenimiento e Infraestructura'],
  [/camaras/i, 'Mantenimiento e Infraestructura'],
  [/cellwash/i, 'Mantenimiento e Infraestructura'],
  [/pura quimica/i, 'Mantenimiento e Infraestructura'],
  [/ferreteria/i, 'Mantenimiento e Infraestructura'],
  [/jardineros/i, 'Mantenimiento e Infraestructura'],

  [/mortal community/i, 'Marketing y Publicidad'],
  [/^pixel$/i, 'Marketing y Publicidad'],
  [/linktre/i, 'Marketing y Publicidad'],
  [/browix/i, 'Marketing y Publicidad'],
  [/circuito gastronomico/i, 'Marketing y Publicidad'],
  [/alfa impresiones/i, 'Marketing y Publicidad'],

  [/spotify/i, 'Suscripciones y Software'],
  [/open 365/i, 'Suscripciones y Software'],
  [/^fudo$/i, 'Suscripciones y Software'],

  [/uthgra/i, 'Mano de Obra'],

  [/frigorifico/i, 'Carnes'],
  [/^carnes/i, 'Carnes'],

  [/pescado/i, 'Pesca'],

  [/alqueria/i, 'Lácteos y quesos'],
  [/lacte/i, 'Lácteos y quesos'],
  [/^queso/i, 'Lácteos y quesos'],

  [/vino/i, 'Bebidas con Alcohol'],
  [/zuccardi/i, 'Bebidas con Alcohol'],
  [/grupo vid/i, 'Bebidas con Alcohol'],
  [/^vitis/i, 'Bebidas con Alcohol'],
  [/casta 1994/i, 'Bebidas con Alcohol'],
  [/medalla/i, 'Bebidas con Alcohol'],
  [/magnum/i, 'Bebidas con Alcohol'],
  [/cerveny/i, 'Bebidas con Alcohol'],
  [/nuevo munich/i, 'Bebidas con Alcohol'],
  [/r\.b bebidas/i, 'Bebidas con Alcohol'],

  [/alpes hielo/i, 'Bebidas sin alcohol'],
  [/nespresso/i, 'Bebidas sin alcohol'],

  [/hueveria/i, 'Almacen'],
  [/carrefour/i, 'Almacen'],
  [/dietetica/i, 'Almacen'],
  [/especiera/i, 'Almacen'],

  [/hidroponic/i, 'Verduras y Frutas'],
  [/girgolas/i, 'Verduras y Frutas'],

  [/estancia/i, 'Carnes'],

  [/^mosto/i, 'Bebidas sin alcohol'],

  [/^proveedor eventual$/i, 'Egresos Varios'],
  [/farmacia/i, 'Egresos Varios'],
]

function matchCategoria(nombreProveedor) {
  const n = sinTildes(nombreProveedor)
  for (const [rx, cat] of RULES) {
    if (rx.test(n)) return cat
  }
  return null
}

async function main() {
  // 1. Sembrar categorías (idempotente: solo crea las que faltan por nombre)
  const { data: existentes, error: eCat } = await supabase
    .from('categorias_gasto')
    .select('id, nombre')
    .eq('restaurante_id', RESTAURANTE_ID)
  if (eCat) throw eCat
  const existentesMap = Object.fromEntries((existentes ?? []).map(c => [c.nombre, c.id]))
  const faltantes = CATEGORIAS.filter(c => !existentesMap[c.nombre])

  console.log(`\nCategorías existentes: ${existentes?.length ?? 0}`)
  console.log(`Categorías a crear:    ${faltantes.length}`)
  if (faltantes.length > 0) console.log('  ' + faltantes.map(c => c.nombre).join(', '))

  if (APPLY && faltantes.length > 0) {
    const { data: creadas, error: eIns } = await supabase
      .from('categorias_gasto')
      .insert(faltantes.map((c, i) => ({
        restaurante_id: RESTAURANTE_ID,
        nombre: c.nombre,
        categoria_financiera: c.financiera,
        orden: existentes.length + i,
      })))
      .select('id, nombre')
    if (eIns) throw eIns
    for (const c of creadas) existentesMap[c.nombre] = c.id
  }

  // 2. Facturas sin categorizar — PostgREST corta a 1000 filas/request sin
  // .range(), y Bros tiene 2800 facturas. Paginar (ver lib/supabase/paginate.ts).
  const facturas = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('facturas')
      .select('id, proveedor_nombre, total')
      .eq('restaurante_id', RESTAURANTE_ID)
      .is('categoria_gasto_id', null)
      .range(from, from + 999)
    if (error) throw error
    facturas.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }

  console.log(`\nFacturas sin categorizar: ${facturas.length}`)

  // 3. Aplicar reglas
  const porCategoria = {} // nombre categoria -> [factura_id...]
  const sinMatch = {} // proveedor -> { n, total }

  for (const f of facturas ?? []) {
    const cat = matchCategoria(f.proveedor_nombre)
    if (cat) {
      if (!porCategoria[cat]) porCategoria[cat] = []
      porCategoria[cat].push(f.id)
    } else {
      const k = f.proveedor_nombre
      if (!sinMatch[k]) sinMatch[k] = { n: 0, total: 0 }
      sinMatch[k].n++
      sinMatch[k].total += f.total ?? 0
    }
  }

  console.log('\n== Matcheadas por categoría ==')
  let totalMatch = 0
  for (const [cat, ids] of Object.entries(porCategoria).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${cat.padEnd(30)} ${ids.length}`)
    totalMatch += ids.length
  }
  console.log(`  TOTAL matcheadas: ${totalMatch}`)

  const sinMatchList = Object.entries(sinMatch).sort((a, b) => b[1].n - a[1].n)
  console.log(`\n== Sin categorizar (quedan NULL): ${sinMatchList.length} proveedores, ${sinMatchList.reduce((s, [, v]) => s + v.n, 0)} facturas ==`)
  for (const [prov, v] of sinMatchList.slice(0, 40)) {
    console.log(`  · ${prov.padEnd(45)} n=${v.n}  $${Math.round(v.total).toLocaleString('es-AR')}`)
  }
  if (sinMatchList.length > 40) console.log(`  … +${sinMatchList.length - 40} más`)

  if (!APPLY) {
    console.log('\n[DRY-RUN] No se aplicó nada. Correr con --apply para categorizar.')
    return
  }

  // 4. Update en batch por categoría
  for (const [cat, ids] of Object.entries(porCategoria)) {
    const catId = existentesMap[cat]
    if (!catId) { console.warn(`⚠️  Categoría "${cat}" no encontrada, se salta`); continue }
    // Supabase permite .in() con muchos ids, pero por prolijidad batch de 500
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500)
      const { error } = await supabase.from('facturas').update({ categoria_gasto_id: catId }).in('id', chunk)
      if (error) throw error
    }
  }
  console.log(`\n✅ Categorizadas ${totalMatch} facturas en ${Object.keys(porCategoria).length} categorías.`)
}

main().catch(e => { console.error('Error:', e.message ?? e); process.exit(1) })
