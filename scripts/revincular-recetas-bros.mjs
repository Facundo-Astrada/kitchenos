// ============================================================
// Revincula ingredientes de recetas que cuentan $0 (sin producto, producto
// desactivado o producto activo en $0) a un producto ACTIVO con precio.
//
// Misma lógica que las facturas (lib/facturas/sugerirProducto.ts):
//   1. alias aprendido (producto_alias, normAlias del nombre del ingrediente)
//   2. sugerenciaSegura (puntaje >= 0.95 y sin segundo candidato cerca)
// Y como pista extra, si el ingrediente apunta a un producto desactivado, se
// prueba también con el NOMBRE de ese producto (suele ser el duplicado viejo).
//
// Uso:
//   node scripts/revincular-recetas-bros.mjs [--out dir]   (SOLO dry-run: no escribe en la base)
// El apply se hace por SQL (respaldo bak_ + update en una transaccion) a partir de plan.csv.
//
// El costo lo recalcula el trigger ingredientes_costo_desde_producto al cambiar
// producto_id; este script no escribe costo_unitario.
// Salidas del dry-run: <OUT>/diagnostico.md y plan.csv (OUT = --out o cwd).
// ============================================================
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { normAlias, sugerenciaSegura, sugerirProductos, puntaje } from '../lib/facturas/sugerirProducto.ts'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const RID = 'e65cf95a-2c32-4244-b325-2379be5b3a6e' // Bros
const OUT = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : '.'

// $0 legítimos: no se tocan.
const CERO_LEGITIMO = /^(agua|hielo|agua (de )?(coccion|cocción|hervor|fria|fría|caliente|tibia|filtrada|mineral)|agua)\b/i

async function todo(tabla, select, filtro) {
  const out = []
  for (let from = 0; ; from += 1000) {
    let q = supabase.from(tabla).select(select).range(from, from + 999)
    if (filtro) q = filtro(q)
    const { data, error } = await q
    if (error) throw new Error(`${tabla}: ${error.message}`)
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}

const familia = u => {
  const x = (u || '').toLowerCase().trim()
  if (['g', 'gr', 'grs', 'kg', 'kgs', 'gramo', 'gramos', 'kilo', 'kilos'].includes(x)) return 'peso'
  if (['l', 'lt', 'lts', 'litro', 'litros', 'ml', 'cc', 'mililitro'].includes(x)) return 'vol'
  if (['u', 'un', 'unidad', 'unidades', 'uni'].includes(x)) return 'u'
  return 'otra'
}

async function main() {
  const recetas = await todo('recetas', 'id, nombre, activa', q => q.eq('restaurante_id', RID).eq('activa', true))
  const recMap = new Map(recetas.map(r => [r.id, r]))
  const productos = await todo('productos', 'id, nombre, activo, precio_unitario, unidad, es_produccion, fuera_de_uso, peso_por_unidad_g', q => q.eq('restaurante_id', RID))
  const prodMap = new Map(productos.map(p => [p.id, p]))
  const aliasRows = await todo('producto_alias', 'alias_norm, producto_id', q => q.eq('restaurante_id', RID))
  const alias = new Map(aliasRows.map(a => [a.alias_norm, a.producto_id]))
  const ingTodos = await todo('ingredientes', 'id, receta_id, nombre, cantidad, unidad, tipo, producto_id, costo_unitario, unidad_costo, subreceta_id')
  const ings = ingTodos.filter(i => recMap.has(i.receta_id))

  const pool = productos.filter(p => p.activo && !p.es_produccion && Number(p.precio_unitario) > 0)

  const motivoDe = i => {
    if (i.tipo === 'subreceta' || i.subreceta_id) return null
    if (!i.producto_id) return 'sin_producto'
    const p = prodMap.get(i.producto_id)
    if (!p) return 'producto_inexistente'
    if (!p.activo) return 'producto_desactivado'
    if (!(Number(p.precio_unitario) > 0) && !p.es_produccion) return 'producto_en_cero'
    return null
  }

  const filas = []
  for (const i of ings) {
    const motivo = motivoDe(i)
    if (!motivo) continue
    const actual = i.producto_id ? prodMap.get(i.producto_id) : null
    const cero = !(Number(i.costo_unitario) > 0)
    const base = { ing: i, motivo, actual, cero, receta: recMap.get(i.receta_id) }
    if (!/[a-záéíóúñ]{3,}/i.test(i.nombre)) { filas.push({ ...base, decision: 'nombre_invalido' }); continue }
    if (CERO_LEGITIMO.test(i.nombre.trim()) || (actual && CERO_LEGITIMO.test(actual.nombre.trim()))) {
      filas.push({ ...base, decision: 'legitimo_cero' }); continue
    }
    // 1) alias aprendido
    let propuesto = null, fuente = null
    const aliasIng = alias.get(normAlias(i.nombre))
    if (aliasIng && pool.some(p => p.id === aliasIng)) { propuesto = prodMap.get(aliasIng); fuente = 'alias' }
    // un alias aprendido mal ("Aceite de girasol" → "Semillas de girasol") no se aplica
    if (propuesto && puntaje(i.nombre, propuesto.nombre) < 0.6) { filas.push({ ...base, propuesto, fuente: 'alias dudoso', decision: 'alias_dudoso' }); continue }
    // 2) sugerenciaSegura por nombre del ingrediente
    if (!propuesto) { const s = sugerenciaSegura(i.nombre, pool); if (s) { propuesto = s; fuente = 'segura(ingrediente)' } }
    // 3) pista: nombre del producto viejo (desactivado / en cero)
    if (!propuesto && actual) {
      const a = alias.get(normAlias(actual.nombre))
      if (a && pool.some(p => p.id === a)) { propuesto = prodMap.get(a); fuente = 'alias(producto viejo)' }
      else { const s = sugerenciaSegura(actual.nombre, pool.filter(p => p.id !== actual.id)); if (s) { propuesto = s; fuente = 'segura(producto viejo)' } }
    }
    if (!propuesto || (actual && propuesto.id === actual.id)) {
      const candidatos = sugerirProductos(actual ? actual.nombre : i.nombre, pool, 3).map(c => `${c.producto.nombre} $${c.producto.precio_unitario}/${c.producto.unidad}`)
      filas.push({ ...base, decision: 'sin_propuesta', candidatos }); continue
    }
    // frenos extra sobre sugerenciaSegura (falsos "seguros" vistos en el dry-run):
    // el producto viejo es solo una pista, el ingrediente tiene que coincidir con el propuesto;
    // y "Botella de tomate" (por unidad, envase) no es "Tomate fresco" (kg).
    const ENVASE = /\b(botella|bolsa|caja|paquete|pack|frasco|bandeja|bidon|box|lata|sachet)\b/
    if (fuente.endsWith('(producto viejo)') && puntaje(i.nombre, propuesto.nombre) < 0.75) { filas.push({ ...base, propuesto, fuente, decision: 'dudoso' }); continue }
    if (familia(propuesto.unidad) === 'u' && ENVASE.test(normAlias(propuesto.nombre)) && !ENVASE.test(normAlias(i.nombre))) { filas.push({ ...base, propuesto, fuente, decision: 'dudoso' }); continue }
    const fi = familia(i.unidad), fp = familia(propuesto.unidad)
    const riesgo = (fi === 'peso' || fi === 'vol') && fp === 'u' && !(Number(propuesto.peso_por_unidad_g) > 0)
      ? 'unidad: receta en peso/vol y producto por unidad sin peso_por_unidad_g'
      : (fi === 'u' && (fp === 'peso' || fp === 'vol') && !(Number(propuesto.peso_por_unidad_g) > 0))
        ? 'unidad: receta en unidades y producto en peso/vol sin peso_por_unidad_g' : ''
    filas.push({ ...base, propuesto, fuente, riesgo, decision: riesgo ? 'propuesta_con_riesgo_unidad' : 'revincular' })
  }

  // ── resumen ──
  const cuenta = f => filas.filter(f).length
  const recetasAfectadas = new Set(filas.map(f => f.ing.receta_id))
  const recetasQueSeArreglan = new Set()
  const porReceta = new Map()
  for (const f of filas) { if (!porReceta.has(f.ing.receta_id)) porReceta.set(f.ing.receta_id, []); porReceta.get(f.ing.receta_id).push(f) }
  for (const [rid, fs] of porReceta) if (fs.every(f => f.decision === 'revincular')) recetasQueSeArreglan.add(rid)
  const recetasTocadas = new Set(filas.filter(f => f.decision === 'revincular').map(f => f.ing.receta_id))

  // ── agrupado por producto actual ──
  const grupos = new Map()
  for (const f of filas) {
    const k = f.actual ? f.actual.id : `SIN:${normAlias(f.ing.nombre)}`
    if (!grupos.has(k)) grupos.set(k, { actual: f.actual, nombreSin: f.ing.nombre, filas: [] })
    grupos.get(k).filas.push(f)
  }
  const lista = [...grupos.values()].sort((a, b) => b.filas.length - a.filas.length)

  const md = []
  md.push(`# Diagnóstico recetas Bros — ${new Date().toISOString().slice(0, 10)}\n`)
  const ceros = filas.filter(f => f.cero)
  const recetasConCero = new Set(ceros.map(f => f.ing.receta_id))
  const recetasConCeroReal = new Set(ceros.filter(f => f.decision !== 'legitimo_cero' && f.decision !== 'nombre_invalido').map(f => f.ing.receta_id))
  md.push(`Recetas activas: ${recetas.length}. Ingredientes con vínculo roto (sin producto / desactivado / activo en $0): **${filas.length}** en **${recetasAfectadas.size}** recetas. De ésos, **${ceros.length}** cuentan $0 de verdad (costo_unitario=0) en **${recetasConCero.size}** recetas; sacando agua y nombres basura, **${recetasConCeroReal.size}** recetas tienen un $0 que es un faltante real.\n`)
  md.push(`| Motivo | Ingredientes | de ésos, en $0 |\n|---|---|---|`)
  for (const m of ['sin_producto', 'producto_desactivado', 'producto_en_cero', 'producto_inexistente']) md.push(`| ${m} | ${cuenta(f => f.motivo === m)} | ${cuenta(f => f.motivo === m && f.cero)} |`)
  md.push(`\n| Decisión del dry-run | Ingredientes | de ésos, en $0 |\n|---|---|---|`)
  for (const d of ['revincular', 'propuesta_con_riesgo_unidad', 'alias_dudoso', 'dudoso', 'sin_propuesta', 'nombre_invalido', 'legitimo_cero']) md.push(`| ${d} | ${cuenta(f => f.decision === d)} | ${cuenta(f => f.decision === d && f.cero)} |`)
  md.push(`\nRecetas tocadas por \`revincular\`: **${recetasTocadas.size}** · recetas que quedarían sin ningún ingrediente en $0 por vínculo: **${recetasQueSeArreglan.size}**\n`)
  md.push(`## Por producto actual (ordenado por ingredientes afectados)\n`)
  md.push(`| Producto actual | Estado | Ingr. | Recetas | Propuesto (fuente) |\n|---|---|---|---|---|`)
  for (const g of lista) {
    const est = g.actual ? (g.actual.activo ? `activo $${g.actual.precio_unitario}` : `DESACTIVADO $${g.actual.precio_unitario}`) : 'sin producto'
    const props = [...new Set(g.filas.map(f => f.propuesto && f.decision !== 'alias_dudoso' && f.decision !== 'dudoso' ?`${f.propuesto.nombre} (${f.fuente})${f.riesgo ? ' ⚠' : ''}` : f.decision === 'legitimo_cero' ? '— $0 legítimo' : f.decision === 'nombre_invalido' ? '— nombre basura' : f.decision === 'dudoso' ? `— dudoso → ${f.propuesto.nombre}` : f.decision === 'alias_dudoso' ? `— alias dudoso → ${f.propuesto.nombre}` : `— elegir entre: ${(f.candidatos || []).join(' | ') || 'ninguno'}`))]
    md.push(`| ${g.actual ? g.actual.nombre : '∅ ' + g.nombreSin} | ${est} | ${g.filas.length} | ${new Set(g.filas.map(f => f.ing.receta_id)).size} | ${props.slice(0, 2).join(' / ')} |`)
  }
  md.push(`\n## Plan seguro: ingrediente → producto actual → producto propuesto (decision = revincular)\n`)
  md.push(`| Ingrediente | Producto actual | Propuesto | Fuente | Ingr. | Recetas | En $0 |\n|---|---|---|---|---|---|---|`)
  const plan = new Map()
  for (const f of filas.filter(f => f.decision === 'revincular')) {
    const k = `${normAlias(f.ing.nombre)}|${f.actual?.id ?? ''}|${f.propuesto.id}`
    if (!plan.has(k)) plan.set(k, { f, n: 0, rec: new Set(), cero: 0 })
    const e = plan.get(k); e.n++; e.rec.add(f.ing.receta_id); if (f.cero) e.cero++
  }
  for (const e of [...plan.values()].sort((a, b) => b.n - a.n)) {
    const a = e.f.actual
    md.push(`| ${e.f.ing.nombre} | ${a ? `${a.nombre} (${a.activo ? 'activo' : 'desact.'} $${a.precio_unitario})` : '∅'} | ${e.f.propuesto.nombre} $${e.f.propuesto.precio_unitario}/${e.f.propuesto.unidad} | ${e.f.fuente} | ${e.n} | ${e.rec.size} | ${e.cero} |`)
  }
  mkdirSync(OUT, { recursive: true })
  writeFileSync(`${OUT}/diagnostico.md`, md.join('\n'))

  const csv = ['decision,costo_cero,motivo,receta,ingrediente,unidad,producto_actual,estado_actual,producto_propuesto,precio_propuesto,unidad_propuesta,fuente,riesgo,ingrediente_id,producto_propuesto_id']
  const q = s => `"${String(s ?? '').replace(/"/g, '""')}"`
  for (const f of filas) csv.push([f.decision, f.cero ? 'si' : 'no', f.motivo, q(f.receta.nombre), q(f.ing.nombre), f.ing.unidad, q(f.actual?.nombre), f.actual ? (f.actual.activo ? 'activo' : 'desactivado') : '', q(f.propuesto?.nombre), f.propuesto?.precio_unitario ?? '', f.propuesto?.unidad ?? '', f.fuente ?? '', q(f.riesgo), f.ing.id, f.propuesto?.id ?? ''].join(','))
  writeFileSync(`${OUT}/plan.csv`, csv.join('\n'))

  console.log(md.slice(0, 12).join('\n'))
  console.log(`\n→ ${OUT}/diagnostico.md y ${OUT}/plan.csv`)
}

main().catch(e => { console.error(e); process.exit(1) })
