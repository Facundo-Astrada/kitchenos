// ============================================================
// Limpia el gramaje por-plato NO expresado en gramos en la cuenta Bros.
//
// Contexto: plato_recetas.cantidad_ops/unidad_ops es el "cuántos gramos de
// esta receta van al plato" que se ve en la ficha derivada del recetario
// (pestaña Platos). Se decidió que ese campo sea SOLO en gramos: valores en
// 'pax' / 'u' (heredados del panel OPS/mise) no cuentan para el total del
// plato y confunden. Este script los pone en NULL para que arranquen limpios
// como "+ g" y se carguen a mano en gramos.
//
// NO toca las filas que ya están en 'g'. NO toca plaza (ruteo OPS) ni porciones.
//
// Uso:
//   node scripts/limpiar-gramaje-noG-bros.mjs           (dry-run — solo muestra)
//   node scripts/limpiar-gramaje-noG-bros.mjs --apply   (aplica cambios)
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

async function main() {
  // 1. Platos (carta_items) de Bros
  const { data: platos, error: e1 } = await supabase
    .from('carta_items')
    .select('id, nombre')
    .eq('restaurante_id', RESTAURANTE_ID)
  if (e1) throw e1
  const platoMap = Object.fromEntries((platos ?? []).map(p => [p.id, p.nombre]))
  const platoIds = Object.keys(platoMap)
  if (platoIds.length === 0) { console.log('Sin platos en Bros.'); return }

  // 2. plato_recetas de esos platos
  const { data: prs, error: e2 } = await supabase
    .from('plato_recetas')
    .select('id, plato_id, receta_id, cantidad_ops, unidad_ops')
    .in('plato_id', platoIds)
  if (e2) throw e2

  // 3. Filtrar: tiene algún valor de gramaje pero NO está en gramos
  const aLimpiar = (prs ?? []).filter(pr =>
    (pr.cantidad_ops != null || pr.unidad_ops != null) && pr.unidad_ops !== 'g'
  )
  const enGramos = (prs ?? []).filter(pr => pr.unidad_ops === 'g' && pr.cantidad_ops != null)

  console.log(`\nplato_recetas totales en Bros: ${(prs ?? []).length}`)
  console.log(`ya en gramos (se conservan):   ${enGramos.length}`)
  console.log(`a limpiar (no-gramos):         ${aLimpiar.length}\n`)

  const porUnidad = {}
  for (const pr of aLimpiar) { const u = pr.unidad_ops ?? '(null)'; porUnidad[u] = (porUnidad[u] ?? 0) + 1 }
  console.log('Desglose por unidad:', porUnidad)
  for (const pr of aLimpiar.slice(0, 15)) {
    console.log(`  · ${platoMap[pr.plato_id]} → cantidad_ops=${pr.cantidad_ops} unidad=${pr.unidad_ops ?? '(null)'}`)
  }
  if (aLimpiar.length > 15) console.log(`  … +${aLimpiar.length - 15} más`)

  if (!APPLY) {
    console.log('\n[DRY-RUN] No se aplicó nada. Correr con --apply para limpiar.')
    return
  }
  if (aLimpiar.length === 0) { console.log('\nNada que limpiar.'); return }

  const ids = aLimpiar.map(pr => pr.id)
  const { error: e3 } = await supabase
    .from('plato_recetas')
    .update({ cantidad_ops: null, unidad_ops: null })
    .in('id', ids)
  if (e3) throw e3
  console.log(`\n✅ Limpiadas ${ids.length} filas (cantidad_ops/unidad_ops → NULL).`)
}

main().catch(e => { console.error('Error:', e.message ?? e); process.exit(1) })
