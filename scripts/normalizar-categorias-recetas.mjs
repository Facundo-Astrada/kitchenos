#!/usr/bin/env node
/**
 * Normaliza categorías de recetas en Supabase.
 * Dry-run por defecto. Pasar --apply para ejecutar los updates.
 *
 * Uso:
 *   node scripts/normalizar-categorias-recetas.mjs
 *   node scripts/normalizar-categorias-recetas.mjs --apply
 *   node scripts/normalizar-categorias-recetas.mjs --restaurante-id <uuid>
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

const args = process.argv.slice(2)
const DRY_RUN = !args.includes('--apply')
const RID_IDX = args.indexOf('--restaurante-id')
const RESTAURANTE_ID = RID_IDX !== -1 ? args[RID_IDX + 1] : null

// Mapa de normalización: clave en lowercase → valor canónico
const NORM_MAP = {
  entrantes: 'Entradas',
  garnishes: 'Guarniciones',
  guarniciones: 'Guarniciones',
  'carnes rojas': 'Carnes',
  otros: 'Otros',
  otras: 'Otros',
  other: 'Otros',
  'bases y salsas': 'Salsas',
  salsa: 'Salsas',
}

async function run() {
  console.log(`\n🔍 Normalización de categorías de recetas (${DRY_RUN ? 'DRY-RUN' : 'APPLY'})\n`)

  let query = supabase
    .from('recetas')
    .select('id, nombre, categoria, restaurante_id')
    .not('categoria', 'is', null)

  if (RESTAURANTE_ID) query = query.eq('restaurante_id', RESTAURANTE_ID)

  const { data: recetas, error } = await query
  if (error) { console.error('Error:', error.message); process.exit(1) }

  // Agrupar por categoría
  const byCategoria = {}
  for (const r of recetas) {
    const cat = r.categoria?.trim() || ''
    if (!byCategoria[cat]) byCategoria[cat] = []
    byCategoria[cat].push(r)
  }

  console.log('Categorías encontradas:')
  Object.entries(byCategoria)
    .sort(([a], [b]) => a.localeCompare(b, 'es'))
    .forEach(([cat, items]) => {
      const normalized = NORM_MAP[cat.toLowerCase()] ?? null
      const tag = normalized ? ` → ${normalized}` : ''
      console.log(`  "${cat}" (${items.length})${tag}`)
    })

  // Determinar cambios
  const cambios = []
  for (const [cat, items] of Object.entries(byCategoria)) {
    const normalizado = NORM_MAP[cat.toLowerCase()]
    if (normalizado && normalizado !== cat) {
      cambios.push({ de: cat, a: normalizado, ids: items.map(r => r.id) })
    }
  }

  if (cambios.length === 0) {
    console.log('\n✅ Sin cambios necesarios.')
    return
  }

  console.log(`\n📝 Cambios pendientes (${cambios.length} grupos):`)
  for (const c of cambios) {
    console.log(`  "${c.de}" → "${c.a}" (${c.ids.length} recetas)`)
  }

  if (DRY_RUN) {
    console.log('\n⚠️  Modo DRY-RUN — nada fue modificado. Pasá --apply para ejecutar.')
    return
  }

  console.log('\n🔄 Aplicando cambios…')
  let total = 0
  for (const c of cambios) {
    const { error: upErr } = await supabase
      .from('recetas')
      .update({ categoria: c.a })
      .in('id', c.ids)
    if (upErr) {
      console.error(`  ❌ Error actualizando "${c.de}":`, upErr.message)
    } else {
      console.log(`  ✅ "${c.de}" → "${c.a}" (${c.ids.length} recetas)`)
      total += c.ids.length
    }
  }
  console.log(`\n✅ Listo. ${total} recetas actualizadas.`)
}

run().catch(e => { console.error(e); process.exit(1) })
