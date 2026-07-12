// ============================================================
// Fusiona productos duplicados en `productos`: mismo nombre salvo
// tildes/mayúsculas, o variante singular/plural simple (Huevo/Huevos).
// Ej. reales detectados en auditoría: "Azucar"/"Azúcar", "Limon"/"Limón",
// "Ají molido"/"Aji molido", "Huevo"/"Huevos".
//
// Por cada grupo:
//   - Elige un canónico: 1) el que tiene precio_unitario > 0,
//     2) el que tiene stock_actual > 0, 3) el más viejo (created_at).
//   - Suma los stock_actual de todo el grupo en el canónico.
//   - Re-apunta ingredientes.producto_id, precio_historial.producto_id
//     y pedido_items.producto_id al canónico.
//   - Desactiva (activo=false) los demás — no se borran.
//
// Pares "base↔extendido" (ej. "Alcaparras" / "Alcaparras en frasco") NO
// se fusionan automáticamente — quedan en un reporte aparte para decidir
// a mano (pueden ser productos genuinamente distintos).
//
// Excluye es_produccion=true del auto-merge (son recetas internas, no
// materia prima — un nombre igual por casualidad no debería fusionarse
// a ciegas).
//
// Uso:
//   node scripts/fusionar-duplicados-productos.mjs                        (dry-run, todos los restaurantes)
//   node scripts/fusionar-duplicados-productos.mjs --restaurante <id>     (dry-run, uno solo)
//   node scripts/fusionar-duplicados-productos.mjs --apply                (aplica en todos)
//   node scripts/fusionar-duplicados-productos.mjs --restaurante <id> --apply
//
// Lee SUPABASE_SERVICE_ROLE_KEY de .env.local.
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
const APPLY = process.argv.includes('--apply')

const restArgIdx = process.argv.indexOf('--restaurante')
const RESTAURANTE_ARG = restArgIdx >= 0 ? process.argv[restArgIdx + 1] : null

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

function sinTildes(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function normKey(nombre) {
  return sinTildes((nombre || '').toLowerCase().trim().replace(/\s+/g, ' '))
}

// Heurística simple: singular quitando la 's' final (solo si el nombre no es muy corto,
// para no colapsar cosas como "gas").
function singularKey(key) {
  return key.length > 4 && key.endsWith('s') ? key.slice(0, -1) : null
}

const fmt = n => '$' + Number(n || 0).toLocaleString('es-AR')

function elegirCanonico(grupo) {
  const orden = [...grupo].sort((a, b) => {
    const aPrecio = (a.precio_unitario ?? 0) > 0 ? 0 : 1
    const bPrecio = (b.precio_unitario ?? 0) > 0 ? 0 : 1
    if (aPrecio !== bPrecio) return aPrecio - bPrecio
    const aStock = (a.stock_actual ?? 0) > 0 ? 0 : 1
    const bStock = (b.stock_actual ?? 0) > 0 ? 0 : 1
    if (aStock !== bStock) return aStock - bStock
    return new Date(a.created_at) - new Date(b.created_at)
  })
  return orden[0]
}

async function procesarRestaurante(restauranteId, nombreRestaurante) {
  const { data: productos, error } = await supabase
    .from('productos')
    .select('id, nombre, precio_unitario, stock_actual, created_at, es_produccion')
    .eq('restaurante_id', restauranteId)
    .eq('activo', true)
  if (error) { console.error(`  Error leyendo productos: ${error.message}`); return }

  const candidatos = productos.filter(p => !p.es_produccion)

  // ── Agrupar por nombre normalizado + colapsar singular/plural ──
  const byKey = new Map()
  for (const p of candidatos) {
    const k = normKey(p.nombre)
    if (!byKey.has(k)) byKey.set(k, [])
    byKey.get(k).push(p)
  }
  for (const k of Array.from(byKey.keys())) {
    const sing = singularKey(k)
    if (sing && sing !== k && byKey.has(sing)) {
      byKey.get(sing).push(...byKey.get(k))
      byKey.delete(k)
    }
  }
  const dupGroups = Array.from(byKey.values()).filter(arr => arr.length > 1)

  // ── Candidatos base↔extendido (reporte, NO se fusionan) ──
  const enGrupo = new Set(dupGroups.flat().map(p => p.id))
  const sueltos = candidatos.filter(p => !enGrupo.has(p.id))
  const candidatosExtendido = []
  for (const a of sueltos) {
    const ak = normKey(a.nombre)
    if (ak.length < 5) continue
    for (const b of sueltos) {
      if (a.id === b.id) continue
      const bk = normKey(b.nombre)
      if (bk.startsWith(ak + ' ')) candidatosExtendido.push([a, b])
    }
  }

  console.log(`\n${nombreRestaurante} (${restauranteId})`)
  console.log(`  Productos activos (no producción): ${candidatos.length}`)
  console.log(`  Grupos duplicados detectados: ${dupGroups.length}`)

  if (dupGroups.length === 0) {
    console.log('  Sin duplicados exactos/singular-plural.')
  }

  let totalDesactivados = 0
  let totalIngredientes = 0
  let totalPrecioHist = 0
  let totalPedidoItems = 0

  for (const grupo of dupGroups) {
    const canonico = elegirCanonico(grupo)
    const otros = grupo.filter(p => p.id !== canonico.id)
    const stockTotal = grupo.reduce((s, p) => s + (p.stock_actual ?? 0), 0)
    const otrosIds = otros.map(p => p.id)

    console.log(`\n  · "${canonico.nombre}" — ${grupo.length} duplicados`)
    for (const p of grupo) {
      const marca = p.id === canonico.id ? '→ canónico' : '  desactivar'
      console.log(`      ${marca}  ${p.nombre.padEnd(30)} precio=${fmt(p.precio_unitario)}  stock=${p.stock_actual}  id=${p.id}`)
    }
    console.log(`      stock combinado: ${stockTotal}`)

    if (!APPLY) continue

    const { error: eStock } = await supabase.from('productos').update({ stock_actual: stockTotal }).eq('id', canonico.id)
    if (eStock) { console.error(`      ✗ error actualizando stock del canónico: ${eStock.message}`); continue }

    const { count: cIng } = await supabase.from('ingredientes').update({ producto_id: canonico.id }, { count: 'exact' }).in('producto_id', otrosIds)
    const { count: cHist } = await supabase.from('precio_historial').update({ producto_id: canonico.id }, { count: 'exact' }).in('producto_id', otrosIds)
    const { count: cPed } = await supabase.from('pedido_items').update({ producto_id: canonico.id }, { count: 'exact' }).in('producto_id', otrosIds)
    const { error: eDeact } = await supabase.from('productos').update({ activo: false }).in('id', otrosIds)
    if (eDeact) { console.error(`      ✗ error desactivando duplicados: ${eDeact.message}`); continue }

    totalDesactivados += otrosIds.length
    totalIngredientes += cIng || 0
    totalPrecioHist += cHist || 0
    totalPedidoItems += cPed || 0
    console.log(`      ✓ fusionado — ${cIng || 0} ingredientes, ${cHist || 0} precio_historial, ${cPed || 0} pedido_items repuntados`)
  }

  if (candidatosExtendido.length) {
    console.log(`\n  ── Candidatos base↔extendido (revisar a mano, NO fusionados) ──`)
    for (const [a, b] of candidatosExtendido) {
      console.log(`      ? "${a.nombre}" (${fmt(a.precio_unitario)}) ⊂ "${b.nombre}" (${fmt(b.precio_unitario)})`)
    }
  }

  if (APPLY) {
    console.log(`\n  ✓ Resumen: ${totalDesactivados} productos desactivados, ${totalIngredientes} ingredientes + ${totalPrecioHist} precio_historial + ${totalPedidoItems} pedido_items repuntados.`)
  }
}

async function main() {
  console.log('══════════════════════════════════════════════════════')
  console.log(`  FUSIÓN DE PRODUCTOS DUPLICADOS`)
  console.log(`  Modo: ${APPLY ? '⚠️  APPLY (escribe)' : 'dry-run (no escribe)'}`)
  console.log('══════════════════════════════════════════════════════')

  let restaurantes
  if (RESTAURANTE_ARG) {
    const { data } = await supabase.from('restaurantes').select('id, nombre').eq('id', RESTAURANTE_ARG)
    restaurantes = data ?? []
  } else {
    const { data: prods } = await supabase.from('productos').select('restaurante_id').eq('activo', true)
    const ids = Array.from(new Set((prods ?? []).map(p => p.restaurante_id)))
    const { data } = await supabase.from('restaurantes').select('id, nombre').in('id', ids)
    restaurantes = data ?? []
  }

  if (restaurantes.length === 0) { console.log('\nNingún restaurante para procesar.\n'); return }

  for (const r of restaurantes) {
    await procesarRestaurante(r.id, r.nombre)
  }

  if (!APPLY) {
    console.log(`\n→ Dry-run. Para aplicar la fusión: agregá --apply`)
    console.log(`→ Para un solo restaurante: --restaurante <id>\n`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
