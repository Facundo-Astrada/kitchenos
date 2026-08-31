#!/usr/bin/env node
/**
 * Chequeo de huérfanos de las refs polimórficas sin FK del proyecto
 * (dominio-kos.md §5, acción 🟢-5 — "el costo aceptado era 'refs colgantes
 * posibles', no 'refs colgantes invisibles'"). NO agrega FKs: son links
 * deliberadamente sin restricción para que un menú/nota/incidencia
 * sobreviva a que se borre lo que referenciaban. Esto solo hace visible lo
 * que hoy nadie mira.
 *
 * Cubre las 3 refs documentadas en .claude/docs/columnas.md:
 *   - menu_preparaciones.ref_id (+ tipo: 'plato'→carta_items, 'receta'→recetas, 'producto'→productos)
 *   - calendario_nota_items.tarea_id → tareas
 *   - proveedor_incidencias.pedido_id → pedidos
 *
 * Uso:
 *   node scripts/chequear-huerfanos-refs.mjs
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
for (const line of readFileSync(resolve(__dirname, '../.env.local'), 'utf-8').split('\n')) {
  const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/)
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const PROJECT_REF = 'clipcxcbtlibswfzsgzk'
const MGMT_TOKEN = process.env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_MANAGEMENT_TOKEN
if (!MGMT_TOKEN) {
  console.error('Falta SUPABASE_MANAGEMENT_TOKEN en .env.local')
  process.exit(1)
}

async function query(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${MGMT_TOKEN}` },
    body: JSON.stringify({ query: sql }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`Management API ${res.status}: ${JSON.stringify(data)}`)
  return data
}

const CHEQUEOS = [
  {
    nombre: 'menu_preparaciones.ref_id (plato/receta/producto)',
    sql: `
      SELECT mp.id, mp.menu_id, mp.tipo, mp.ref_id, mp.nombre
      FROM menu_preparaciones mp
      LEFT JOIN recetas r ON mp.tipo = 'receta' AND r.id = mp.ref_id
      LEFT JOIN carta_items c ON mp.tipo = 'plato' AND c.id = mp.ref_id
      LEFT JOIN productos p ON mp.tipo = 'producto' AND p.id = mp.ref_id
      WHERE mp.ref_id IS NOT NULL
        AND mp.tipo IN ('receta', 'plato', 'producto')
        AND r.id IS NULL AND c.id IS NULL AND p.id IS NULL
      ORDER BY mp.menu_id;
    `,
  },
  {
    nombre: 'calendario_nota_items.tarea_id',
    sql: `
      SELECT cni.id, cni.fecha, cni.texto, cni.tarea_id
      FROM calendario_nota_items cni
      LEFT JOIN tareas t ON t.id = cni.tarea_id
      WHERE cni.tarea_id IS NOT NULL AND t.id IS NULL
      ORDER BY cni.fecha DESC;
    `,
  },
  {
    nombre: 'proveedor_incidencias.pedido_id',
    sql: `
      SELECT pi.id, pi.proveedor_id, pi.tipo, pi.pedido_id, pi.fecha
      FROM proveedor_incidencias pi
      LEFT JOIN pedidos pe ON pe.id = pi.pedido_id
      WHERE pi.pedido_id IS NOT NULL AND pe.id IS NULL
      ORDER BY pi.fecha DESC;
    `,
  },
]

async function main() {
  console.log('Chequeo de huérfanos de refs polimórficas — proyecto', PROJECT_REF)
  console.log('='.repeat(70))
  let totalHuerfanos = 0
  for (const { nombre, sql } of CHEQUEOS) {
    const filas = await query(sql)
    totalHuerfanos += filas.length
    console.log(`\n${nombre}: ${filas.length} huérfano(s)`)
    if (filas.length > 0) console.table(filas.slice(0, 20))
    if (filas.length > 20) console.log(`  ... y ${filas.length - 20} más`)
  }
  console.log('\n' + '='.repeat(70))
  console.log(totalHuerfanos === 0 ? 'Sin huérfanos.' : `Total: ${totalHuerfanos} huérfano(s) — no bloquean nada (no hay FK), pero conviene revisarlos a mano.`)
  process.exit(totalHuerfanos === 0 ? 0 : 1)
}

main().catch(e => { console.error('FATAL:', e); process.exit(2) })
