/**
 * Seed Parte 2 — Origen: Productos · Turnos · Pedidos · Facturas
 * Consulta IDs reales del restaurante y usuarios antes de insertar.
 * Uso: npx tsx --env-file=.env.local scripts/seed-parte2.ts
 */
import { createClient } from '@supabase/supabase-js'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
if (!URL || !KEY) { console.error('Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local'); process.exit(1) }
const sb = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const DIAS = [5,6,7,8,9,12,13,14,15,16,19,20,21,22,23,26,27,28,29,30]
const md = (n: number) => `2025-03-${String(n).padStart(2, '0')}`
const addDays = (s: string, n: number) => new Date(new Date(s).getTime() + n * 86400000).toISOString().slice(0, 10)

async function main() {
  console.log('\n🌿 Seed Parte 2 — Origen\n')

  // ── Fetch IDs reales ──────────────────────────────────────────────────────────
  const [r1, r2] = await Promise.all([
    sb.from('restaurantes').select('id').eq('nombre', 'Origen - Cocina de Terroir'),
    sb.from('equipo_miembros').select('id,email').like('email', '%@origen-resto.com'),
  ])
  if (!r1.data?.length) { console.error('✗ Restaurante no encontrado. Corrió seed-parte1.ts?'); return }
  const R: string = r1.data[0].id
  const M: Record<string, string> = Object.fromEntries((r2.data ?? []).map((u: any) => [u.email.split('@')[0], u.id]))
  const { data: provs } = await sb.from('proveedores').select('id,nombre').eq('restaurante_id', R)
  const PV: Record<string, string> = Object.fromEntries((provs ?? []).map((p: any) => [p.nombre, p.id]))
  console.log(`  ✅ IDs — restaurante: ${R.slice(0,8)}... · equipo: ${Object.keys(M).length} · proveedores: ${Object.keys(PV).length}`)

  // ── Productos (20) ────────────────────────────────────────────────────────────
  type PR = [string, string, number, number, number, string, string, number]
  const PRODS: PR[] = [
    ['Zapallo',           'kg',      8,  3,  1,   'Verduras', 'La Huerta Orgánica',     2800],
    ['Cebolla',           'kg',     10,  4,  2,   'Verduras', 'La Huerta Orgánica',     2200],
    ['Ajo',               'kg',      2,  1,  0.5, 'Verduras', 'La Huerta Orgánica',     9500],
    ['Tomate',            'kg',      6,  2,  1,   'Verduras', 'La Huerta Orgánica',     3500],
    ['Hierbas Frescas',   'atado',   8,  3,  1,   'Verduras', 'La Huerta Orgánica',     1500],
    ['Semillas Mix',      'kg',      3,  1,  0.5, 'Verduras', 'La Huerta Orgánica',    12000],
    ['Bife de Chorizo',   'kg',      8,  3,  1,   'Carnes',   'Frigorífico El Paso',   18000],
    ['Lomo',              'kg',      5,  2,  1,   'Carnes',   'Frigorífico El Paso',   24000],
    ['Entraña',           'kg',      6,  2,  1,   'Carnes',   'Frigorífico El Paso',   16000],
    ['Pollo Entero',      'kg',     10,  4,  2,   'Carnes',   'Frigorífico El Paso',    7500],
    ['Huesos para Fondo', 'kg',      5,  2,  1,   'Carnes',   'Frigorífico El Paso',    2500],
    ['Trucha Fresca',     'kg',      4,  2,  1,   'Pescados', 'Distribuidora Del Mar', 18000],
    ['Langostinos',       'kg',      3,  1,  0.5, 'Pescados', 'Distribuidora Del Mar', 28000],
    ['Huevos',            'docena', 12,  4,  2,   'Lácteos',  'Casa Láctea',            4200],
    ['Manteca',           'kg',      4,  2,  1,   'Lácteos',  'Casa Láctea',           11000],
    ['Crema de Leche',    'lt',      5,  2,  1,   'Lácteos',  'Casa Láctea',            7200],
    ['Leche Entera',      'lt',     10,  4,  2,   'Lácteos',  'Casa Láctea',            2800],
    ['Queso Cremoso',     'kg',      3,  1,  0.5, 'Lácteos',  'Casa Láctea',           14000],
    ['Ricotta',           'kg',      2,  1,  0.5, 'Lácteos',  'Casa Láctea',            9500],
    ['Chocolate Amargo',  'kg',      2,  1,  0.3, 'Lácteos',  'Casa Láctea',           20000],
  ]
  const { error: pErr } = await sb.from('productos').insert(
    PRODS.map(([n, u, sa, sm, sc, cat, pnm, precio]) => ({
      nombre: n, unidad: u, stock_actual: sa, stock_minimo: sm, stock_critico: sc,
      categoria: cat, proveedor_id: PV[pnm], precio_unitario: precio, activo: true, restaurante_id: R,
    }))
  )
  if (pErr) console.error('  ✗ productos:', pErr.message)
  else console.log(`  ✅ ${PRODS.length} productos`)

  // ── Turnos (UNIQUE miembro_id+fecha → un registro por persona por día) ─────────
  // Personas en ambos turnos (Mise + Servicio) quedan con jornada completa 10–23:30
  const SHIFTS: Record<string, ['almuerzo' | 'cena', string, string]> = {
    marcos:  ['cena',     '18:00', '23:30'],
    laura:   ['cena',     '10:00', '23:30'],
    rodrigo: ['cena',     '10:00', '23:30'],
    camila:  ['almuerzo', '10:00', '15:00'],
    sofia:   ['almuerzo', '10:00', '15:00'],
    julian:  ['almuerzo', '10:00', '15:00'],
    paula:   ['cena',     '18:00', '23:30'],
  }
  const turnosData = DIAS.flatMap(n =>
    Object.entries(SHIFTS)
      .filter(([k]) => M[k])
      .map(([k, [tipo, ent, sal]]) => ({
        miembro_id: M[k], fecha: md(n), turno_tipo: tipo,
        hora_entrada: ent, hora_salida: sal, restaurante_id: R,
      }))
  )
  const { error: tErr } = await sb.from('turnos').upsert(turnosData, { onConflict: 'miembro_id,fecha' })
  if (tErr) console.error('  ✗ turnos:', tErr.message)
  else console.log(`  ✅ ${turnosData.length} turnos (${DIAS.length} días × ${Object.keys(SHIFTS).length} personas)`)

  // ── Pedidos (16 — 4 por semana) ───────────────────────────────────────────────
  type Item = [string, number, string, number]
  const sum = (items: Item[]) => items.reduce((s, [, c, , p]) => s + c * p, 0)
  const PEDS: [string, string, Item[]][] = [
    // Semana 1 (5–9 mar)
    ['La Huerta Orgánica',    md(5),  [['Zapallo',20,'kg',2800],['Cebolla',15,'kg',2200],['Tomate',10,'kg',3500],['Hierbas Frescas',8,'atado',1500]]],
    ['Frigorífico El Paso',   md(5),  [['Bife de Chorizo',10,'kg',18000],['Lomo',5,'kg',24000],['Entraña',8,'kg',16000]]],
    ['Distribuidora Del Mar', md(7),  [['Trucha Fresca',5,'kg',18000],['Langostinos',3,'kg',28000]]],
    ['Casa Láctea',           md(8),  [['Huevos',6,'docena',4200],['Manteca',2,'kg',11000],['Crema de Leche',4,'lt',7200],['Leche Entera',10,'lt',2800]]],
    // Semana 2 (12–16 mar)
    ['La Huerta Orgánica',    md(12), [['Zapallo',20,'kg',2800],['Ajo',2,'kg',9500],['Cebolla',15,'kg',2200],['Semillas Mix',1,'kg',12000]]],
    ['Frigorífico El Paso',   md(12), [['Pollo Entero',15,'kg',7500],['Lomo',6,'kg',24000],['Huesos para Fondo',5,'kg',2500]]],
    ['Distribuidora Del Mar', md(14), [['Trucha Fresca',6,'kg',18000],['Langostinos',4,'kg',28000]]],
    ['Casa Láctea',           md(15), [['Queso Cremoso',2,'kg',14000],['Ricotta',2,'kg',9500],['Manteca',2,'kg',11000],['Crema de Leche',5,'lt',7200]]],
    // Semana 3 (19–23 mar)
    ['La Huerta Orgánica',    md(19), [['Tomate',12,'kg',3500],['Cebolla',10,'kg',2200],['Hierbas Frescas',8,'atado',1500],['Zapallo',15,'kg',2800]]],
    ['Frigorífico El Paso',   md(19), [['Bife de Chorizo',12,'kg',18000],['Entraña',10,'kg',16000],['Pollo Entero',12,'kg',7500]]],
    ['Distribuidora Del Mar', md(21), [['Trucha Fresca',5,'kg',18000],['Langostinos',3,'kg',28000]]],
    ['Casa Láctea',           md(22), [['Huevos',8,'docena',4200],['Chocolate Amargo',1,'kg',20000],['Leche Entera',8,'lt',2800],['Crema de Leche',4,'lt',7200]]],
    // Semana 4 (26–30 mar)
    ['La Huerta Orgánica',    md(26), [['Zapallo',18,'kg',2800],['Ajo',2,'kg',9500],['Tomate',10,'kg',3500],['Semillas Mix',1,'kg',12000]]],
    ['Frigorífico El Paso',   md(26), [['Lomo',6,'kg',24000],['Bife de Chorizo',10,'kg',18000],['Huesos para Fondo',5,'kg',2500]]],
    ['Distribuidora Del Mar', md(28), [['Trucha Fresca',6,'kg',18000],['Langostinos',4,'kg',28000]]],
    ['Casa Láctea',           md(29), [['Manteca',3,'kg',11000],['Ricotta',2,'kg',9500],['Queso Cremoso',2,'kg',14000],['Crema de Leche',3,'lt',7200]]],
  ]
  const { data: pedRows, error: pedErr } = await sb.from('pedidos').insert(
    PEDS.map(([pnom, fecha, items]) => ({
      proveedor_id: PV[pnom], proveedor_nombre: pnom,
      fecha_pedido: fecha, fecha_entrega_esperada: addDays(fecha, 2),
      status: 'recibido', total_estimado: sum(items),
      usuario_id: M.marcos, restaurante_id: R,
    }))
  ).select('id')
  if (pedErr) { console.error('  ✗ pedidos:', pedErr.message); return }
  await Promise.all((pedRows ?? []).map((ped, i) =>
    sb.from('pedido_items').insert(PEDS[i][2].map(([pn, cant, uni, precio]) => ({
      pedido_id: ped.id, producto_nombre: pn, cantidad: cant, unidad: uni,
      precio_estimado: precio, recibido: true,
    })))
  ))
  const totalItems = PEDS.reduce((s, p) => s + p[2].length, 0)
  console.log(`  ✅ ${PEDS.length} pedidos, ${totalItems} items`)

  // ── Facturas (8 — 1 por cada 2 pedidos del mismo proveedor) ───────────────────
  // Condición '30dias' equivale a vencimiento 30 días post-emisión
  const FACS: [string, string, number[], string, string][] = [
    ['La Huerta Orgánica',    '20-34000001-2', [0, 4],   md(14), 'FC-2025-0001'],
    ['Frigorífico El Paso',   '30-71000001-5', [1, 5],   md(14), 'FC-2025-0002'],
    ['Distribuidora Del Mar', '30-62000001-7', [2, 6],   md(15), 'FC-2025-0003'],
    ['Casa Láctea',           '30-87000001-0', [3, 7],   md(15), 'FC-2025-0004'],
    ['La Huerta Orgánica',    '20-34000001-2', [8, 12],  md(28), 'FC-2025-0005'],
    ['Frigorífico El Paso',   '30-71000001-5', [9, 13],  md(28), 'FC-2025-0006'],
    ['Distribuidora Del Mar', '30-62000001-7', [10, 14], md(29), 'FC-2025-0007'],
    ['Casa Láctea',           '30-87000001-0', [11, 15], md(29), 'FC-2025-0008'],
  ]
  const { error: fErr } = await sb.from('facturas').insert(
    FACS.map(([pnom, cuit, idxs, fecha, nro]) => {
      const sub = idxs.reduce((s, i) => s + sum(PEDS[i][2]), 0)
      return {
        proveedor_nombre: pnom, proveedor_cuit: cuit, numero_factura: nro,
        tipo_factura: 'A', fecha_factura: fecha, condicion_pago: '30dias',
        subtotal: sub, iva_total: Math.round(sub * 0.21), total: Math.round(sub * 1.21),
        status: 'confirmada', restaurante_id: R,
      }
    })
  )
  if (fErr) console.error('  ✗ facturas:', fErr.message)
  else console.log(`  ✅ ${FACS.length} facturas`)

  console.log('\n✅ Seed Parte 2 completa\n')
}

main().catch(console.error)

// npx ts-node scripts/seed-parte2.ts
// (Alternativa recomendada — ya disponible en este proyecto):
// npx tsx --env-file=.env.local scripts/seed-parte2.ts
