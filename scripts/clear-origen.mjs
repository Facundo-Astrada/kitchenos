#!/usr/bin/env node
/**
 * Elimina TODOS los datos del restaurante Origen (restaurante_id c0000000-...).
 * No borra el registro del restaurante ni los auth users de seed-parte1.ts.
 * Uso: node --env-file=.env.local scripts/clear-origen.mjs
 */
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
const sb = createClient(SUPABASE_URL, SUPABASE_KEY)

const R = 'c0000000-0000-0000-0000-000000000001'

async function main() {
  console.log('\n🗑️  Limpiando todos los datos de Origen...\n')

  const ids = async t => { const { data } = await sb.from(t).select('id').eq('restaurante_id', R); return data?.map(x => x.id) ?? [] }

  const vIds = await ids('ventas');   if (vIds.length) await sb.from('ventas_items').delete().in('venta_id', vIds)
  const fIds = await ids('facturas'); if (fIds.length) await sb.from('factura_items').delete().in('factura_id', fIds)
  const pIds = await ids('pedidos');  if (pIds.length) await sb.from('pedido_items').delete().in('pedido_id', pIds)
  const rIds = await ids('recetas');  if (rIds.length) await sb.from('ingredientes').delete().in('receta_id', rIds)
  await sb.from('haccp_temperaturas').delete().eq('restaurante_id', R)

  const tables = ['ventas','facturas','pedidos','pase_mensajes','merma','turnos','eventos',
                  'tareas','carta_items','recetas','haccp_equipos','productos','proveedores',
                  'equipo_miembros','user_restaurantes']

  for (const t of tables) {
    const col = t === 'user_restaurantes' ? 'restaurante_id' : 'restaurante_id'
    const { error, count } = await sb.from(t).delete({ count: 'exact' }).eq(col, R)
    if (error) console.warn(`  ⚠  ${t}: ${error.message}`)
    else console.log(`  ✅ ${t}: ${count ?? '?'} filas eliminadas`)
  }

  console.log('\n✅ Listo — restaurante y auth users conservados\n')
}

main().catch(console.error)
