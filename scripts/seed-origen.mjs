#!/usr/bin/env node
/**
 * Seed Origen — datos completos (productos, recetas, pedidos, facturas,
 * HACCP, tareas, merma, turnos, ventas, pase).
 * Requiere haber corrido seed-parte1.ts primero (restaurante + equipo + proveedores).
 * Idempotente: limpia y re-inserta todos los datos manejados por este script.
 * Uso: node --env-file=.env.local scripts/seed-origen.mjs
 */
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
const sb = createClient(SUPABASE_URL, SUPABASE_KEY)

// ── UUIDs (en sintonía con seed-parte1.ts) ────────────────────────────────────
const R = 'c0000000-0000-0000-0000-000000000001'

const M = {
  marcos:  'c0000001-0000-0000-0000-000000000001',
  laura:   'c0000001-0000-0000-0000-000000000002',
  rodrigo: 'c0000001-0000-0000-0000-000000000003',
  camila:  'c0000001-0000-0000-0000-000000000004',
  sofia:   'c0000001-0000-0000-0000-000000000005',
  julian:  'c0000001-0000-0000-0000-000000000006',
  paula:   'c0000001-0000-0000-0000-000000000007',
  tomas:   'c0000001-0000-0000-0000-000000000008',
}

const PV = {
  huerta:  'c0000002-0000-0000-0000-000000000001', // La Huerta Orgánica
  frigori: 'c0000002-0000-0000-0000-000000000002', // Frigorífico El Paso
  mar:     'c0000002-0000-0000-0000-000000000003', // Distribuidora Del Mar
  lactea:  'c0000002-0000-0000-0000-000000000004', // Casa Láctea
  secos:   'c0000002-0000-0000-0000-000000000005', // Almacén Serrano (nuevo)
  bodega:  'c0000002-0000-0000-0000-000000000006', // Bodega Los Cóndores (nuevo)
}

const EQ = {
  camCarnes: 'c0000005-0000-0000-0000-000000000001',
  camVeg:    'c0000005-0000-0000-0000-000000000002',
  congelador:'c0000005-0000-0000-0000-000000000003',
  lineaFrio: 'c0000005-0000-0000-0000-000000000004',
  banioMaria:'c0000005-0000-0000-0000-000000000005',
}

// Días de servicio marzo 2025 (mié–dom; cierra lun y mar)
const DIAS = [1,2,5,6,7,8,9,12,13,14,15,16,19,20,21,22,23,26,27,28,29,30]
const d  = n => `2025-03-${String(n).padStart(2,'0')}`
const dt = (n, h=9) => `2025-03-${String(n).padStart(2,'0')}T${String(h).padStart(2,'0')}:00:00.000Z`

// ── Limpieza ──────────────────────────────────────────────────────────────────
async function clear() {
  console.log('🧹 Limpiando datos previos...')
  const ids = async t => { const { data } = await sb.from(t).select('id').eq('restaurante_id', R); return data?.map(x => x.id) ?? [] }

  const vIds = await ids('ventas');   if (vIds.length) await sb.from('ventas_items').delete().in('venta_id', vIds)
  const fIds = await ids('facturas'); if (fIds.length) await sb.from('factura_items').delete().in('factura_id', fIds)
  const pIds = await ids('pedidos');  if (pIds.length) await sb.from('pedido_items').delete().in('pedido_id', pIds)
  const rIds = await ids('recetas');  if (rIds.length) await sb.from('ingredientes').delete().in('receta_id', rIds)
  await sb.from('haccp_temperaturas').delete().eq('restaurante_id', R)

  for (const t of ['ventas','facturas','pedidos','pase_mensajes','merma','turnos','eventos',
                   'tareas','carta_items','recetas','haccp_equipos','productos']) {
    await sb.from(t).delete().eq('restaurante_id', R)
  }
  // proveedores extra agregados por este script
  await sb.from('proveedores').delete().in('id', [PV.secos, PV.bodega])
  console.log('  ✅ Listo')
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🌿 Seed Origen — datos completos  |  Córdoba, Marzo 2025\n')
  await clear()

  // ── Proveedores extra ───────────────────────────────────────────────────────
  await sb.from('proveedores').upsert([
    { id: PV.secos,  nombre: 'Almacén Serrano',      rubro: 'Secos y Especias',  telefono: '3512100005', dias_entrega: ['Lunes','Jueves'],             activo: true, restaurante_id: R },
    { id: PV.bodega, nombre: 'Bodega Los Cóndores',   rubro: 'Vinos y Bebidas',   telefono: '3512100006', dias_entrega: ['Martes','Viernes'],           activo: true, restaurante_id: R },
  ], { onConflict: 'id' })

  // ── Productos ─────────────────────────────────────────────────────────────────
  console.log('🥩 Productos...')
  const { data: prodRows, error: prodErr } = await sb.from('productos').insert([
    // Carnes — Frigorífico El Paso
    { nombre:'Lomo de Ternera',           unidad:'kg', stock_actual:5,   stock_minimo:2,   stock_critico:1,   categoria:'Carnes',    proveedor_id:PV.frigori, precio_unitario:23000, activo:true, restaurante_id:R },
    { nombre:'Entraña Fina',              unidad:'kg', stock_actual:4,   stock_minimo:2,   stock_critico:1,   categoria:'Carnes',    proveedor_id:PV.frigori, precio_unitario:17500, activo:true, restaurante_id:R },
    { nombre:'Mollejas de Ternera',       unidad:'kg', stock_actual:2,   stock_minimo:1,   stock_critico:0.5, categoria:'Carnes',    proveedor_id:PV.frigori, precio_unitario:13000, activo:true, restaurante_id:R },
    { nombre:'Cordero Pierna Deshuesada', unidad:'kg', stock_actual:3,   stock_minimo:1.5, stock_critico:0.5, categoria:'Carnes',    proveedor_id:PV.frigori, precio_unitario:20000, activo:true, restaurante_id:R },
    { nombre:'Pato Pechuga',              unidad:'kg', stock_actual:2.5, stock_minimo:1,   stock_critico:0.5, categoria:'Carnes',    proveedor_id:PV.frigori, precio_unitario:29000, activo:true, restaurante_id:R },
    { nombre:'Cerdo Carré',               unidad:'kg', stock_actual:3,   stock_minimo:1.5, stock_critico:0.5, categoria:'Carnes',    proveedor_id:PV.frigori, precio_unitario:18000, activo:true, restaurante_id:R },
    // Pescados — Distribuidora Del Mar
    { nombre:'Trucha Filete',             unidad:'kg', stock_actual:4,   stock_minimo:2,   stock_critico:1,   categoria:'Pescados',  proveedor_id:PV.mar,     precio_unitario:18000, activo:true, restaurante_id:R },
    { nombre:'Pulpo Entero',              unidad:'kg', stock_actual:3,   stock_minimo:1,   stock_critico:0.5, categoria:'Pescados',  proveedor_id:PV.mar,     precio_unitario:25000, activo:true, restaurante_id:R },
    // Verduras — La Huerta Orgánica
    { nombre:'Remolacha',                 unidad:'kg', stock_actual:5,   stock_minimo:2,   stock_critico:1,   categoria:'Verduras',  proveedor_id:PV.huerta,  precio_unitario:4000,  activo:true, restaurante_id:R },
    { nombre:'Zapallo Criollo',           unidad:'kg', stock_actual:8,   stock_minimo:3,   stock_critico:1,   categoria:'Verduras',  proveedor_id:PV.huerta,  precio_unitario:2500,  activo:true, restaurante_id:R },
    { nombre:'Papa Andina',               unidad:'kg', stock_actual:10,  stock_minimo:4,   stock_critico:2,   categoria:'Verduras',  proveedor_id:PV.huerta,  precio_unitario:3200,  activo:true, restaurante_id:R },
    { nombre:'Puerro',                    unidad:'u',  stock_actual:10,  stock_minimo:4,   stock_critico:2,   categoria:'Verduras',  proveedor_id:PV.huerta,  precio_unitario:1600,  activo:true, restaurante_id:R },
    { nombre:'Zanahoria Baby',            unidad:'kg', stock_actual:3,   stock_minimo:1,   stock_critico:0.5, categoria:'Verduras',  proveedor_id:PV.huerta,  precio_unitario:5000,  activo:true, restaurante_id:R },
    { nombre:'Hongos Porcini',            unidad:'kg', stock_actual:1.5, stock_minimo:0.5, stock_critico:0.2, categoria:'Verduras',  proveedor_id:PV.huerta,  precio_unitario:34000, activo:true, restaurante_id:R },
    { nombre:'Cebolla Morada',            unidad:'kg', stock_actual:5,   stock_minimo:2,   stock_critico:1,   categoria:'Verduras',  proveedor_id:PV.huerta,  precio_unitario:2200,  activo:true, restaurante_id:R },
    { nombre:'Tomate Perita',             unidad:'kg', stock_actual:6,   stock_minimo:2,   stock_critico:1,   categoria:'Verduras',  proveedor_id:PV.huerta,  precio_unitario:3000,  activo:true, restaurante_id:R },
    { nombre:'Hierbas Frescas',           unidad:'u',  stock_actual:8,   stock_minimo:3,   stock_critico:1,   categoria:'Verduras',  proveedor_id:PV.huerta,  precio_unitario:1400,  activo:true, restaurante_id:R },
    // Lácteos — Casa Láctea
    { nombre:'Queso Caprino',             unidad:'kg', stock_actual:2,   stock_minimo:0.5, stock_critico:0.2, categoria:'Lácteos',   proveedor_id:PV.lactea,  precio_unitario:26000, activo:true, restaurante_id:R },
    { nombre:'Crema de Leche',            unidad:'l',  stock_actual:6,   stock_minimo:2,   stock_critico:0.5, categoria:'Lácteos',   proveedor_id:PV.lactea,  precio_unitario:6500,  activo:true, restaurante_id:R },
    { nombre:'Manteca',                   unidad:'kg', stock_actual:3,   stock_minimo:1,   stock_critico:0.5, categoria:'Lácteos',   proveedor_id:PV.lactea,  precio_unitario:10000, activo:true, restaurante_id:R },
    { nombre:'Huevos de Campo',           unidad:'u',  stock_actual:48,  stock_minimo:24,  stock_critico:12,  categoria:'Lácteos',   proveedor_id:PV.lactea,  precio_unitario:300,   activo:true, restaurante_id:R },
    // Secos — Almacén Serrano
    { nombre:'Aceite de Oliva Serrano',   unidad:'l',  stock_actual:8,   stock_minimo:3,   stock_critico:1,   categoria:'Aceites',   proveedor_id:PV.secos,   precio_unitario:13000, activo:true, restaurante_id:R },
    { nombre:'Vinagre de Vino Tinto',     unidad:'l',  stock_actual:3,   stock_minimo:1,   stock_critico:0.5, categoria:'Secos',     proveedor_id:PV.secos,   precio_unitario:7500,  activo:true, restaurante_id:R },
    { nombre:'Sal Patagónica',            unidad:'kg', stock_actual:5,   stock_minimo:2,   stock_critico:1,   categoria:'Secos',     proveedor_id:PV.secos,   precio_unitario:3000,  activo:true, restaurante_id:R },
    { nombre:'Azúcar Mascabo',            unidad:'kg', stock_actual:3,   stock_minimo:1,   stock_critico:0.5, categoria:'Secos',     proveedor_id:PV.secos,   precio_unitario:5200,  activo:true, restaurante_id:R },
    { nombre:'Chocolate Amargo 70%',      unidad:'kg', stock_actual:2,   stock_minimo:0.5, stock_critico:0.2, categoria:'Secos',     proveedor_id:PV.secos,   precio_unitario:19000, activo:true, restaurante_id:R },
    { nombre:'Harina de Trigo Sarraceno', unidad:'kg', stock_actual:4,   stock_minimo:2,   stock_critico:1,   categoria:'Secos',     proveedor_id:PV.secos,   precio_unitario:4500,  activo:true, restaurante_id:R },
    { nombre:'Arroz Arborio',             unidad:'kg', stock_actual:5,   stock_minimo:2,   stock_critico:1,   categoria:'Secos',     proveedor_id:PV.secos,   precio_unitario:5800,  activo:true, restaurante_id:R },
    // Bebidas — Bodega Los Cóndores
    { nombre:'Malbec Reserva 750ml',      unidad:'u',  stock_actual:24,  stock_minimo:12,  stock_critico:6,   categoria:'Vinos',     proveedor_id:PV.bodega,  precio_unitario:14500, activo:true, restaurante_id:R },
    { nombre:'Torrontés 750ml',           unidad:'u',  stock_actual:18,  stock_minimo:9,   stock_critico:4,   categoria:'Vinos',     proveedor_id:PV.bodega,  precio_unitario:11000, activo:true, restaurante_id:R },
    { nombre:'Espumante Extra Brut',      unidad:'u',  stock_actual:12,  stock_minimo:6,   stock_critico:3,   categoria:'Vinos',     proveedor_id:PV.bodega,  precio_unitario:17000, activo:true, restaurante_id:R },
    { nombre:'Agua Mineral 500ml',        unidad:'u',  stock_actual:60,  stock_minimo:24,  stock_critico:12,  categoria:'Bebidas',   proveedor_id:PV.bodega,  precio_unitario:1800,  activo:true, restaurante_id:R },
    { nombre:'Agua con Gas 500ml',        unidad:'u',  stock_actual:48,  stock_minimo:18,  stock_critico:9,   categoria:'Bebidas',   proveedor_id:PV.bodega,  precio_unitario:2200,  activo:true, restaurante_id:R },
  ]).select('id, nombre')
  if (prodErr) { console.error('  ✗', prodErr.message); return }
  const pm = {}; for (const p of prodRows) pm[p.nombre] = p.id
  console.log(`  ✅ ${prodRows.length} productos`)

  // ── Recetas ───────────────────────────────────────────────────────────────────
  console.log('📖 Recetas...')
  const recetasRaw = [
    { nombre:'Lomo de Ternera al Carbón con Puré de Remolacha', categoria:'Principales', porciones:1, tiempo_min:30, precio_venta:38000, status:'published', activa:true,
      procedimiento:'1. Atemperar el lomo 30 min. 2. Sellar a fuego fuerte 4 min por lado. 3. Reposar 5 min y servir sobre puré de remolacha con reducción de Malbec.',
      ing:[['Lomo de Ternera',0.22,'kg',23000],['Remolacha',0.15,'kg',4000],['Manteca',0.03,'kg',10000],['Sal Patagónica',0.005,'kg',3000],['Aceite de Oliva Serrano',0.02,'l',13000]] },
    { nombre:'Cordero Patagónico Confitado', categoria:'Principales', porciones:1, tiempo_min:180, precio_venta:36000, status:'published', activa:true,
      procedimiento:'1. Confitar la pierna a 80°C en aceite de oliva con hierbas por 3h. 2. Dorar en sartén hasta crujiente. 3. Servir con papa andina aplastada y jus del confit.',
      ing:[['Cordero Pierna Deshuesada',0.25,'kg',20000],['Papa Andina',0.2,'kg',3200],['Hierbas Frescas',1,'u',1400],['Aceite de Oliva Serrano',0.1,'l',13000],['Sal Patagónica',0.006,'kg',3000]] },
    { nombre:'Pato Moulard con Reducción de Malbec', categoria:'Principales', porciones:1, tiempo_min:25, precio_venta:42000, status:'published', activa:true,
      procedimiento:'1. Marcar la pechuga con la piel hacia abajo a fuego moderado 12 min. 2. Terminar al horno 8 min. 3. Servir con zapallo caramelizado y reducción de Malbec.',
      ing:[['Pato Pechuga',0.22,'kg',29000],['Zapallo Criollo',0.2,'kg',2500],['Malbec Reserva 750ml',0.1,'u',14500],['Azúcar Mascabo',0.02,'kg',5200],['Manteca',0.02,'kg',10000]] },
    { nombre:'Trucha Andina a la Sartén con Puerro', categoria:'Principales', porciones:1, tiempo_min:20, precio_venta:32000, status:'published', activa:true,
      procedimiento:'1. Salpimentar el filete y cocinar piel abajo en sartén con aceite 5 min. 2. Terminar al horno 3 min. 3. Servir con puerro braseado y aceite de oliva.',
      ing:[['Trucha Filete',0.2,'kg',18000],['Puerro',1,'u',1600],['Aceite de Oliva Serrano',0.03,'l',13000],['Sal Patagónica',0.005,'kg',3000],['Manteca',0.02,'kg',10000]] },
    { nombre:'Pulpo a la Brasa con Papa Andina', categoria:'Principales', porciones:1, tiempo_min:90, precio_venta:40000, status:'published', activa:true,
      procedimiento:'1. Hervir el pulpo 60 min hasta tierno. 2. Marcar en parrilla a fuego fuerte. 3. Servir sobre puré rústico de papa andina con aceite de oliva y pimentón.',
      ing:[['Pulpo Entero',0.28,'kg',25000],['Papa Andina',0.2,'kg',3200],['Aceite de Oliva Serrano',0.04,'l',13000],['Sal Patagónica',0.005,'kg',3000],['Hierbas Frescas',0.5,'u',1400]] },
    { nombre:'Carré de Cerdo con Miel y Hierbas', categoria:'Principales', porciones:1, tiempo_min:40, precio_venta:30000, status:'published', activa:true,
      procedimiento:'1. Marinar el carré con hierbas 2h. 2. Sellar y hornear 25 min a 180°C. 3. Glasear con reducción de miel al final. 4. Acompañar con zanahoria baby caramelizada.',
      ing:[['Cerdo Carré',0.28,'kg',18000],['Zanahoria Baby',0.12,'kg',5000],['Azúcar Mascabo',0.02,'kg',5200],['Hierbas Frescas',1,'u',1400],['Aceite de Oliva Serrano',0.02,'l',13000]] },
    { nombre:'Mollejas Crujientes con Chimichurri Serrano', categoria:'Entradas', porciones:1, tiempo_min:20, precio_venta:22000, status:'published', activa:true,
      procedimiento:'1. Limpiar y blanquear las mollejas. 2. Dorar en sartén con manteca a fuego fuerte 4 min por lado. 3. Servir sobre cama de hierbas con chimichurri serrano.',
      ing:[['Mollejas de Ternera',0.18,'kg',13000],['Manteca',0.04,'kg',10000],['Hierbas Frescas',1,'u',1400],['Vinagre de Vino Tinto',0.02,'l',7500],['Aceite de Oliva Serrano',0.03,'l',13000]] },
    { nombre:'Carpaccio de Remolacha con Queso Caprino', categoria:'Entradas', porciones:1, tiempo_min:15, precio_venta:18000, status:'published', activa:true,
      procedimiento:'1. Hornear remolachas enteras 60 min y dejar enfriar. 2. Laminar fino con mandolina. 3. Emplatar con caprino desmenuzado, nueces tostadas y vinagreta de Malbec.',
      ing:[['Remolacha',0.2,'kg',4000],['Queso Caprino',0.06,'kg',26000],['Aceite de Oliva Serrano',0.02,'l',13000],['Vinagre de Vino Tinto',0.01,'l',7500]] },
    { nombre:'Sopa Fría de Zapallo con Aceite de Oliva', categoria:'Entradas', porciones:1, tiempo_min:25, precio_venta:15000, status:'published', activa:true,
      procedimiento:'1. Asar el zapallo al horno con aceite. 2. Procesar con caldo y cebolla morada. 3. Enfriar, colar y servir con hilo de aceite de oliva y hierbas.',
      ing:[['Zapallo Criollo',0.25,'kg',2500],['Cebolla Morada',0.08,'kg',2200],['Aceite de Oliva Serrano',0.03,'l',13000],['Sal Patagónica',0.004,'kg',3000]] },
    { nombre:'Tataki de Lomo con Vinagreta de Hierbas', categoria:'Entradas', porciones:1, tiempo_min:15, precio_venta:24000, status:'published', activa:true,
      procedimiento:'1. Sellar el lomo 30 segundos por cada lado a fuego máximo. 2. Cortar en finas láminas y servir frío. 3. Aliñar con vinagreta de hierbas frescas y aceite.',
      ing:[['Lomo de Ternera',0.12,'kg',23000],['Hierbas Frescas',1,'u',1400],['Aceite de Oliva Serrano',0.02,'l',13000],['Vinagre de Vino Tinto',0.01,'l',7500]] },
    { nombre:'Tatin de Zapallo con Caprino', categoria:'Entradas', porciones:2, tiempo_min:45, precio_venta:20000, status:'published', activa:true,
      procedimiento:'1. Caramelizar el zapallo con azúcar mascabo. 2. Cubrir con masa de trigo sarraceno y hornear 20 min invertido. 3. Desmoldar y terminar con caprino y hierbas.',
      ing:[['Zapallo Criollo',0.3,'kg',2500],['Queso Caprino',0.08,'kg',26000],['Harina de Trigo Sarraceno',0.1,'kg',4500],['Azúcar Mascabo',0.04,'kg',5200],['Manteca',0.05,'kg',10000]] },
    { nombre:'Risotto de Hongos Porcini', categoria:'Principales', porciones:1, tiempo_min:35, precio_venta:28000, status:'published', activa:true,
      procedimiento:'1. Rehogar cebolla morada en manteca. 2. Agregar arroz arborio y tostar. 3. Incorporar vino blanco y caldo en ladles. 4. Terminar con porcini salteados y crema.',
      ing:[['Arroz Arborio',0.12,'kg',5800],['Hongos Porcini',0.1,'kg',34000],['Cebolla Morada',0.06,'kg',2200],['Crema de Leche',0.06,'l',6500],['Manteca',0.04,'kg',10000],['Torrontés 750ml',0.08,'u',11000]] },
    { nombre:'Crème Brûlée de Malbec', categoria:'Postres', porciones:1, tiempo_min:60, precio_venta:14000, status:'published', activa:true,
      procedimiento:'1. Infusionar crema con reducción de Malbec. 2. Batir con yemas y azúcar. 3. Hornear en baño maría 40 min a 150°C. 4. Enfriar y quemar el azúcar antes de servir.',
      ing:[['Crema de Leche',0.15,'l',6500],['Huevos de Campo',2,'u',300],['Azúcar Mascabo',0.04,'kg',5200],['Malbec Reserva 750ml',0.05,'u',14500]] },
    { nombre:'Fondant de Chocolate Amargo', categoria:'Postres', porciones:1, tiempo_min:25, precio_venta:15000, status:'published', activa:true,
      procedimiento:'1. Fundir chocolate con manteca. 2. Batir huevos con azúcar e integrar. 3. Moldear y refrigerar 1h. 4. Hornear 12 min a 190°C — centro debe quedar líquido.',
      ing:[['Chocolate Amargo 70%',0.08,'kg',19000],['Manteca',0.06,'kg',10000],['Huevos de Campo',2,'u',300],['Azúcar Mascabo',0.04,'kg',5200],['Harina de Trigo Sarraceno',0.02,'kg',4500]] },
    { nombre:'Panna Cotta de Caprino con Miel', categoria:'Postres', porciones:1, tiempo_min:20, precio_venta:12000, status:'published', activa:true,
      procedimiento:'1. Calentar crema con caprino desmenuzado y azúcar. 2. Agregar gelatina hidratada. 3. Verter en moldes y refrigerar 4h. 4. Desmoldar y servir con miel serrana.',
      ing:[['Crema de Leche',0.15,'l',6500],['Queso Caprino',0.04,'kg',26000],['Azúcar Mascabo',0.03,'kg',5200]] },
    { nombre:'Helado de Aceite de Oliva con Sal Patagónica', categoria:'Postres', porciones:4, tiempo_min:120, precio_venta:11000, status:'draft', activa:true,
      procedimiento:'1. Preparar base de yemas, leche y azúcar. 2. Incorporar aceite de oliva en frío emulsionando. 3. Mantecadora 40 min. 4. Servir con flor de sal patagónica.',
      ing:[['Huevos de Campo',4,'u',300],['Aceite de Oliva Serrano',0.1,'l',13000],['Azúcar Mascabo',0.1,'kg',5200],['Sal Patagónica',0.002,'kg',3000]] },
    { nombre:'Puré de Papa Andina', categoria:'Guarniciones', porciones:4, tiempo_min:30, precio_venta:0, status:'published', activa:true,
      procedimiento:'1. Hervir las papas con cáscara hasta tiernas. 2. Pelar y pisarlas calientes. 3. Incorporar manteca y crema. 4. Salpimentar y servir inmediatamente.',
      ing:[['Papa Andina',0.5,'kg',3200],['Manteca',0.05,'kg',10000],['Crema de Leche',0.05,'l',6500],['Sal Patagónica',0.004,'kg',3000]] },
    { nombre:'Vegetales de Temporada al Rescoldo', categoria:'Guarniciones', porciones:2, tiempo_min:20, precio_venta:0, status:'published', activa:true,
      procedimiento:'1. Pincelar los vegetales con aceite de oliva. 2. Asar directamente sobre brasas, rotando. 3. Pelar, salpimentar y servir con hierbas frescas.',
      ing:[['Zanahoria Baby',0.15,'kg',5000],['Remolacha',0.15,'kg',4000],['Aceite de Oliva Serrano',0.03,'l',13000],['Sal Patagónica',0.004,'kg',3000],['Hierbas Frescas',0.5,'u',1400]] },
    { nombre:'Espuma de Puerro', categoria:'Guarniciones', porciones:4, tiempo_min:20, precio_venta:0, status:'draft', activa:true,
      procedimiento:'1. Blanquear y procesar el puerro con caldo. 2. Colar y agregar crema y manteca. 3. Cargar el sifón y refrigerar al menos 1h antes de servir.',
      ing:[['Puerro',3,'u',1600],['Crema de Leche',0.12,'l',6500],['Manteca',0.03,'kg',10000],['Sal Patagónica',0.003,'kg',3000]] },
    { nombre:'Salsa Malbec Reducción', categoria:'Bases', porciones:8, tiempo_min:30, precio_venta:0, status:'published', activa:true,
      procedimiento:'1. Reducir el vino a la mitad con cebolla morada y hierbas. 2. Colar y montar con manteca fría. 3. Rectificar y conservar en caliente.',
      ing:[['Malbec Reserva 750ml',0.375,'u',14500],['Cebolla Morada',0.1,'kg',2200],['Manteca',0.06,'kg',10000],['Hierbas Frescas',0.5,'u',1400]] },
    { nombre:'Chimichurri Serrano', categoria:'Bases', porciones:10, tiempo_min:10, precio_venta:0, status:'published', activa:true,
      procedimiento:'1. Picar finamente las hierbas frescas. 2. Mezclar con aceite de oliva, vinagre de vino, sal y ají. 3. Macerar mínimo 2h. 4. Conservar en heladera hasta 5 días.',
      ing:[['Hierbas Frescas',2,'u',1400],['Aceite de Oliva Serrano',0.15,'l',13000],['Vinagre de Vino Tinto',0.04,'l',7500],['Sal Patagónica',0.005,'kg',3000]] },
    { nombre:'Pan de Trigo Sarraceno con Masa Madre', categoria:'Entradas', porciones:4, tiempo_min:90, precio_venta:8000, status:'published', activa:true,
      procedimiento:'1. Mezclar sarraceno, sal y masa madre. 2. Fermentar 1h a temperatura ambiente. 3. Hornear a 230°C con vapor 30 min y 20 min sin vapor.',
      ing:[['Harina de Trigo Sarraceno',0.4,'kg',4500],['Sal Patagónica',0.008,'kg',3000],['Aceite de Oliva Serrano',0.02,'l',13000]] },
    { nombre:'Ceviche de Trucha con Leche de Tigre', categoria:'Entradas', porciones:1, tiempo_min:20, precio_venta:22000, status:'draft', activa:true,
      procedimiento:'1. Cortar la trucha en cubos y marinar 8 min en jugo de limón. 2. Procesar los recortes con cebolla morada, ají y leche de tigre. 3. Servir con cebolla encurtida.',
      ing:[['Trucha Filete',0.15,'kg',18000],['Cebolla Morada',0.06,'kg',2200],['Sal Patagónica',0.003,'kg',3000],['Aceite de Oliva Serrano',0.01,'l',13000]] },
    { nombre:'Granita de Torrontés con Hierbas', categoria:'Postres', porciones:4, tiempo_min:240, precio_venta:10000, status:'draft', activa:true,
      procedimiento:'1. Mezclar Torrontés con azúcar y hierbas infusionadas. 2. Congelar en bandeja plana. 3. Raspar cada hora por 4h para obtener textura granizada. 4. Servir en copa fría.',
      ing:[['Torrontés 750ml',0.375,'u',11000],['Azúcar Mascabo',0.06,'kg',5200],['Hierbas Frescas',1,'u',1400]] },
  ]

  const recetaMap = {}
  for (const r of recetasRaw) {
    const { ing, ...rData } = r
    const { data: rec, error: rErr } = await sb.from('recetas').insert({ ...rData, restaurante_id: R }).select('id').single()
    if (rErr) { console.warn(`  ⚠ receta ${r.nombre}: ${rErr.message}`); continue }
    recetaMap[r.nombre] = rec.id
    await sb.from('ingredientes').insert(ing.map(([nombre, cantidad, unidad, costo_unitario]) => ({ receta_id: rec.id, nombre, cantidad, unidad, costo_unitario, unidad_costo: unidad })))
  }
  console.log(`  ✅ ${Object.keys(recetaMap).length} recetas`)

  // ── Carta ─────────────────────────────────────────────────────────────────────
  console.log('🍽️  Carta...')
  const rm = recetaMap
  await sb.from('carta_items').insert([
    { nombre:'Pan Sarraceno de la Casa',      descripcion:'Pan de masa madre de trigo sarraceno, servido tibio con aceite de oliva serrano.', precio_venta:8000,  categoria:'Entradas',   receta_id:rm['Pan de Trigo Sarraceno con Masa Madre'], disponible:true, orden:0, restaurante_id:R },
    { nombre:'Mollejas Crujientes',           descripcion:'Mollejas de ternera doradas en manteca, con chimichurri serrano de la casa.',      precio_venta:22000, categoria:'Entradas',   receta_id:rm['Mollejas Crujientes con Chimichurri Serrano'], disponible:true, orden:1, restaurante_id:R },
    { nombre:'Carpaccio de Remolacha',        descripcion:'Láminas de remolacha asada con caprino artesanal y vinagreta de Malbec.',           precio_venta:18000, categoria:'Entradas',   receta_id:rm['Carpaccio de Remolacha con Queso Caprino'],    disponible:true, orden:2, restaurante_id:R },
    { nombre:'Sopa Fría de Zapallo',          descripcion:'Crema fría de zapallo criollo asado, aceite de oliva y hierbas serranas.',          precio_venta:15000, categoria:'Entradas',   receta_id:rm['Sopa Fría de Zapallo con Aceite de Oliva'],   disponible:true, orden:3, restaurante_id:R },
    { nombre:'Tataki de Lomo',               descripcion:'Lomo de ternera vuelta y vuelta, laminado y aliñado con vinagreta de hierbas.',      precio_venta:24000, categoria:'Entradas',   receta_id:rm['Tataki de Lomo con Vinagreta de Hierbas'],    disponible:true, orden:4, restaurante_id:R },
    { nombre:'Tatin de Zapallo y Caprino',   descripcion:'Tarta invertida de zapallo caramelizado con masa de sarraceno y queso caprino.',     precio_venta:20000, categoria:'Entradas',   receta_id:rm['Tatin de Zapallo con Caprino'],               disponible:true, orden:5, restaurante_id:R },
    { nombre:'Lomo de Ternera al Carbón',    descripcion:'220g de lomo angus, puré de remolacha y reducción de Malbec de la bodega.',          precio_venta:38000, categoria:'Principales',receta_id:rm['Lomo de Ternera al Carbón con Puré de Remolacha'], disponible:true, orden:0, restaurante_id:R },
    { nombre:'Cordero Confitado',            descripcion:'Pierna de cordero patagónico 3 horas en aceite de oliva con papa andina aplastada.', precio_venta:36000, categoria:'Principales',receta_id:rm['Cordero Patagónico Confitado'],               disponible:true, orden:1, restaurante_id:R },
    { nombre:'Pato con Reducción de Malbec', descripcion:'Pechuga de pato moulard con zapallo caramelizado y salsa Malbec.',                   precio_venta:42000, categoria:'Principales',receta_id:rm['Pato Moulard con Reducción de Malbec'],        disponible:true, orden:2, restaurante_id:R },
    { nombre:'Trucha Andina a la Sartén',    descripcion:'Filete de trucha de río sobre puerro braseado con manteca y aceite de oliva.',        precio_venta:32000, categoria:'Principales',receta_id:rm['Trucha Andina a la Sartén con Puerro'],       disponible:true, orden:3, restaurante_id:R },
    { nombre:'Pulpo a la Brasa',             descripcion:'Pulpo cocido lento, terminado a la brasa con papa andina y aceite de pimentón.',      precio_venta:40000, categoria:'Principales',receta_id:rm['Pulpo a la Brasa con Papa Andina'],           disponible:true, orden:4, restaurante_id:R },
    { nombre:'Risotto de Porcini',           descripcion:'Arroz arborio con hongos porcini frescos, Torrontés y crema de leche.',               precio_venta:28000, categoria:'Principales',receta_id:rm['Risotto de Hongos Porcini'],                  disponible:true, orden:5, restaurante_id:R },
    { nombre:'Carré de Cerdo con Miel',      descripcion:'Carré marinado en hierbas serranas con glaseado de miel y zanahoria baby.',           precio_venta:30000, categoria:'Principales',receta_id:rm['Carré de Cerdo con Miel y Hierbas'],          disponible:false,orden:6, restaurante_id:R },
    { nombre:'Crème Brûlée de Malbec',       descripcion:'Crema quemada infusionada con reducción de Malbec Reserva.',                         precio_venta:14000, categoria:'Postres',    receta_id:rm['Crème Brûlée de Malbec'],                     disponible:true, orden:0, restaurante_id:R },
    { nombre:'Fondant de Chocolate Amargo',  descripcion:'Corazón líquido de chocolate 70% cacao. Servir inmediatamente.',                     precio_venta:15000, categoria:'Postres',    receta_id:rm['Fondant de Chocolate Amargo'],                disponible:true, orden:1, restaurante_id:R },
    { nombre:'Panna Cotta de Caprino',       descripcion:'Panna cotta con caprino artesanal serrano y miel de flores.',                        precio_venta:12000, categoria:'Postres',    receta_id:rm['Panna Cotta de Caprino con Miel'],            disponible:true, orden:2, restaurante_id:R },
    { nombre:'Copa Malbec Reserva',          descripcion:'Copa de Malbec Reserva — Bodega Los Cóndores, Valle de Calamuchita.',                 precio_venta:9500,  categoria:'Bebidas',    receta_id:null, disponible:true, orden:0, restaurante_id:R },
    { nombre:'Copa Torrontés',               descripcion:'Torrontés fresco con notas florales y cítricos — ideal para pescados.',               precio_venta:8000,  categoria:'Bebidas',    receta_id:null, disponible:true, orden:1, restaurante_id:R },
    { nombre:'Espumante Extra Brut',         descripcion:'Botella de espumante extra brut para festejos.',                                      precio_venta:28000, categoria:'Bebidas',    receta_id:null, disponible:true, orden:2, restaurante_id:R },
    { nombre:'Agua Mineral',                 descripcion:'Agua mineral sin gas 500ml.',                                                         precio_venta:3500,  categoria:'Bebidas',    receta_id:null, disponible:true, orden:3, restaurante_id:R },
  ])
  console.log('  ✅ 20 platos en carta')

  // ── Pedidos ───────────────────────────────────────────────────────────────────
  console.log('🛒 Pedidos...')
  const pedidosSrc = [
    { prov:PV.frigori, pnom:'Frigorífico El Paso',   fped:d(1), fent:d(2),  status:'recibido', items:[['Lomo de Ternera',5,'kg',23000],['Cordero Pierna Deshuesada',3,'kg',20000],['Mollejas de Ternera',2,'kg',13000]] },
    { prov:PV.huerta,  pnom:'La Huerta Orgánica',    fped:d(1), fent:d(2),  status:'recibido', items:[['Remolacha',4,'kg',4000],['Zapallo Criollo',8,'kg',2500],['Papa Andina',10,'kg',3200],['Hierbas Frescas',6,'u',1400]] },
    { prov:PV.lactea,  pnom:'Casa Láctea',           fped:d(5), fent:d(6),  status:'recibido', items:[['Crema de Leche',6,'l',6500],['Huevos de Campo',48,'u',300],['Queso Caprino',2,'kg',26000]] },
    { prov:PV.secos,   pnom:'Almacén Serrano',       fped:d(5), fent:d(7),  status:'recibido', items:[['Aceite de Oliva Serrano',6,'l',13000],['Chocolate Amargo 70%',2,'kg',19000],['Harina de Trigo Sarraceno',4,'kg',4500]] },
    { prov:PV.mar,     pnom:'Distribuidora Del Mar', fped:d(6), fent:d(7),  status:'recibido', items:[['Trucha Filete',5,'kg',18000],['Pulpo Entero',3,'kg',25000]] },
    { prov:PV.bodega,  pnom:'Bodega Los Cóndores',   fped:d(6), fent:d(8),  status:'recibido', items:[['Malbec Reserva 750ml',12,'u',14500],['Torrontés 750ml',9,'u',11000],['Espumante Extra Brut',6,'u',17000]] },
    { prov:PV.frigori, pnom:'Frigorífico El Paso',   fped:d(9), fent:d(12), status:'recibido', items:[['Pato Pechuga',3,'kg',29000],['Cerdo Carré',4,'kg',18000],['Entraña Fina',3,'kg',17500]] },
    { prov:PV.huerta,  pnom:'La Huerta Orgánica',    fped:d(9), fent:d(12), status:'recibido', items:[['Hongos Porcini',1.5,'kg',34000],['Cebolla Morada',5,'kg',2200],['Zanahoria Baby',3,'kg',5000],['Puerro',10,'u',1600]] },
    { prov:PV.lactea,  pnom:'Casa Láctea',           fped:d(12),fent:d(13), status:'recibido', items:[['Manteca',3,'kg',10000],['Crema de Leche',5,'l',6500],['Huevos de Campo',48,'u',300]] },
    { prov:PV.frigori, pnom:'Frigorífico El Paso',   fped:d(16),fent:d(19), status:'recibido', items:[['Lomo de Ternera',6,'kg',23000],['Cordero Pierna Deshuesada',4,'kg',20000],['Mollejas de Ternera',2,'kg',13000]] },
    { prov:PV.mar,     pnom:'Distribuidora Del Mar', fped:d(16),fent:d(19), status:'recibido', items:[['Trucha Filete',4,'kg',18000],['Pulpo Entero',3,'kg',25000]] },
    { prov:PV.secos,   pnom:'Almacén Serrano',       fped:d(19),fent:d(21), status:'recibido', items:[['Arroz Arborio',5,'kg',5800],['Vinagre de Vino Tinto',3,'l',7500],['Sal Patagónica',3,'kg',3000]] },
    { prov:PV.huerta,  pnom:'La Huerta Orgánica',    fped:d(21),fent:d(22), status:'recibido', items:[['Remolacha',5,'kg',4000],['Tomate Perita',6,'kg',3000],['Hierbas Frescas',6,'u',1400]] },
    { prov:PV.bodega,  pnom:'Bodega Los Cóndores',   fped:d(22),fent:d(26), status:'recibido', items:[['Malbec Reserva 750ml',18,'u',14500],['Torrontés 750ml',12,'u',11000],['Agua Mineral 500ml',48,'u',1800]] },
    { prov:PV.frigori, pnom:'Frigorífico El Paso',   fped:d(23),fent:d(26), status:'enviado',  items:[['Pato Pechuga',3,'kg',29000],['Cerdo Carré',3,'kg',18000]] },
    { prov:PV.lactea,  pnom:'Casa Láctea',           fped:d(26),fent:d(28), status:'borrador', items:[['Queso Caprino',2,'kg',26000],['Crema de Leche',6,'l',6500],['Huevos de Campo',60,'u',300]] },
  ]

  for (const p of pedidosSrc) {
    const total = p.items.reduce((s,[,cant,,precio]) => s + cant * precio, 0)
    const { data: ped, error: pedErr } = await sb.from('pedidos').insert({ proveedor_id:p.prov, proveedor_nombre:p.pnom, fecha_pedido:p.fped, fecha_entrega_esperada:p.fent, status:p.status, total_estimado:total, restaurante_id:R }).select('id').single()
    if (pedErr) { console.warn(`  ⚠ pedido: ${pedErr.message}`); continue }
    await sb.from('pedido_items').insert(p.items.map(([producto_nombre, cantidad, unidad, precio_estimado]) => ({ pedido_id:ped.id, producto_nombre, cantidad, unidad, precio_estimado, recibido: p.status === 'recibido' })))
  }
  console.log(`  ✅ ${pedidosSrc.length} pedidos (${pedidosSrc.reduce((s,p)=>s+p.items.length,0)} items)`)

  // ── Facturas ──────────────────────────────────────────────────────────────────
  console.log('🧾 Facturas...')
  const facturasSrc = [
    { pnom:'Frigorífico El Paso',   cuit:'30-71000001-5', nro:'0001-00008712', tipo:'A', fecha:d(3),  cond:'cuenta_corriente', items:[['Lomo de Ternera',5,'kg',23000,21],['Cordero Pierna Deshuesada',3,'kg',20000,21],['Mollejas de Ternera',2,'kg',13000,21]] },
    { pnom:'La Huerta Orgánica',    cuit:'20-34000001-2', nro:'0003-00021045', tipo:'B', fecha:d(3),  cond:'contado',          items:[['Remolacha',4,'kg',4000,10.5],['Zapallo Criollo',8,'kg',2500,10.5],['Papa Andina',10,'kg',3200,10.5],['Hierbas Frescas',6,'u',1400,10.5]] },
    { pnom:'Casa Láctea',           cuit:'30-87000001-0', nro:'0001-00005540', tipo:'A', fecha:d(7),  cond:'30dias',           items:[['Crema de Leche',6,'l',6500,21],['Huevos de Campo',48,'u',300,21],['Queso Caprino',2,'kg',26000,21]] },
    { pnom:'Almacén Serrano',       cuit:'20-45000001-3', nro:'0002-00013388', tipo:'A', fecha:d(7),  cond:'contado',          items:[['Aceite de Oliva Serrano',6,'l',13000,21],['Chocolate Amargo 70%',2,'kg',19000,21],['Harina de Trigo Sarraceno',4,'kg',4500,21]] },
    { pnom:'Distribuidora Del Mar', cuit:'30-62000001-7', nro:'0001-00004221', tipo:'A', fecha:d(8),  cond:'contado',          items:[['Trucha Filete',5,'kg',18000,21],['Pulpo Entero',3,'kg',25000,21]] },
    { pnom:'Bodega Los Cóndores',   cuit:'30-53000001-1', nro:'0002-00009014', tipo:'A', fecha:d(9),  cond:'30dias',           items:[['Malbec Reserva 750ml',12,'u',14500,21],['Torrontés 750ml',9,'u',11000,21],['Espumante Extra Brut',6,'u',17000,21]] },
    { pnom:'Frigorífico El Paso',   cuit:'30-71000001-5', nro:'0001-00008823', tipo:'A', fecha:d(12), cond:'cuenta_corriente', items:[['Pato Pechuga',3,'kg',29000,21],['Cerdo Carré',4,'kg',18000,21],['Entraña Fina',3,'kg',17500,21]] },
    { pnom:'La Huerta Orgánica',    cuit:'20-34000001-2', nro:'0003-00021210', tipo:'B', fecha:d(12), cond:'contado',          items:[['Hongos Porcini',1.5,'kg',34000,10.5],['Cebolla Morada',5,'kg',2200,10.5],['Zanahoria Baby',3,'kg',5000,10.5],['Puerro',10,'u',1600,10.5]] },
    { pnom:'Casa Láctea',           cuit:'30-87000001-0', nro:'0001-00005618', tipo:'A', fecha:d(13), cond:'30dias',           items:[['Manteca',3,'kg',10000,21],['Crema de Leche',5,'l',6500,21]] },
    { pnom:'Almacén Serrano',       cuit:'20-45000001-3', nro:'0002-00013512', tipo:'A', fecha:d(14), cond:'contado',          items:[['Arroz Arborio',5,'kg',5800,21],['Vinagre de Vino Tinto',3,'l',7500,21]] },
    { pnom:'Frigorífico El Paso',   cuit:'30-71000001-5', nro:'0001-00008987', tipo:'A', fecha:d(19), cond:'cuenta_corriente', items:[['Lomo de Ternera',6,'kg',23000,21],['Cordero Pierna Deshuesada',4,'kg',20000,21]] },
    { pnom:'Distribuidora Del Mar', cuit:'30-62000001-7', nro:'0001-00004355', tipo:'A', fecha:d(19), cond:'contado',          items:[['Trucha Filete',4,'kg',18000,21],['Pulpo Entero',3,'kg',25000,21]] },
    { pnom:'La Huerta Orgánica',    cuit:'20-34000001-2', nro:'0003-00021380', tipo:'B', fecha:d(21), cond:'contado',          items:[['Remolacha',5,'kg',4000,10.5],['Tomate Perita',6,'kg',3000,10.5],['Hierbas Frescas',6,'u',1400,10.5]] },
    { pnom:'Bodega Los Cóndores',   cuit:'30-53000001-1', nro:'0002-00009198', tipo:'A', fecha:d(22), cond:'30dias',           items:[['Malbec Reserva 750ml',18,'u',14500,21],['Torrontés 750ml',12,'u',11000,21]] },
    { pnom:'Casa Láctea',           cuit:'30-87000001-0', nro:'0001-00005720', tipo:'A', fecha:d(26), cond:'30dias',           items:[['Queso Caprino',2,'kg',26000,21],['Crema de Leche',6,'l',6500,21],['Huevos de Campo',60,'u',300,21]] },
    { pnom:'Frigorífico El Paso',   cuit:'30-71000001-5', nro:'0001-00009100', tipo:'A', fecha:d(26), cond:'cuenta_corriente', items:[['Pato Pechuga',3,'kg',29000,21],['Cerdo Carré',3,'kg',18000,21]] },
    { pnom:'Almacén Serrano',       cuit:'20-45000001-3', nro:'0002-00013640', tipo:'A', fecha:d(28), cond:'contado',          items:[['Aceite de Oliva Serrano',5,'l',13000,21],['Sal Patagónica',3,'kg',3000,21],['Azúcar Mascabo',2,'kg',5200,21]] },
    { pnom:'La Huerta Orgánica',    cuit:'20-34000001-2', nro:'0003-00021500', tipo:'B', fecha:d(29), cond:'contado',          items:[['Papa Andina',8,'kg',3200,10.5],['Zapallo Criollo',6,'kg',2500,10.5],['Hierbas Frescas',4,'u',1400,10.5]] },
  ]

  for (const f of facturasSrc) {
    const subtotal = f.items.reduce((s,[,cant,,precio]) => s + cant * precio, 0)
    const iva_total = f.items.reduce((s,[,cant,,precio,iva]) => s + cant * precio * iva / 100, 0)
    const { data: fac, error: fErr } = await sb.from('facturas').insert({ proveedor_nombre:f.pnom, proveedor_cuit:f.cuit, numero_factura:f.nro, tipo_factura:f.tipo, fecha_factura:f.fecha, condicion_pago:f.cond, subtotal, iva_total, total:subtotal + iva_total, status:'confirmada', restaurante_id:R }).select('id').single()
    if (fErr) { console.warn(`  ⚠ factura: ${fErr.message}`); continue }
    await sb.from('factura_items').insert(f.items.map(([producto_nombre, cantidad, unidad, precio_unitario, alicuota_iva]) => ({ factura_id:fac.id, producto_nombre, cantidad, unidad, precio_unitario, alicuota_iva, subtotal:cantidad * precio_unitario })))
  }
  console.log(`  ✅ ${facturasSrc.length} facturas`)

  // ── HACCP ─────────────────────────────────────────────────────────────────────
  console.log('🌡️  HACCP...')
  const servicioSet = new Set(DIAS)
  const { error: eqErr } = await sb.from('haccp_equipos').upsert([
    { id:EQ.camCarnes,  nombre:'Cámara de Carnes',    tipo:'camara_fria',      ubicacion:'Área cocina',  plaza:'calientes', temp_min:-1,  temp_max:3,   activo:true, restaurante_id:R },
    { id:EQ.camVeg,     nombre:'Cámara de Vegetales', tipo:'camara_fria',      ubicacion:'Área cocina',  plaza:'frios',     temp_min:2,   temp_max:6,   activo:true, restaurante_id:R },
    { id:EQ.congelador, nombre:'Congelador Central',  tipo:'congelador',        ubicacion:'Depósito',     plaza:'calientes', temp_min:-22, temp_max:-15, activo:true, restaurante_id:R },
    { id:EQ.lineaFrio,  nombre:'Línea de Frío',       tipo:'camara_fria',      ubicacion:'Línea de pase',plaza:'pase',      temp_min:0,   temp_max:5,   activo:true, restaurante_id:R },
    { id:EQ.banioMaria, nombre:'Baño María',           tipo:'equipo_caliente',  ubicacion:'Línea caliente',plaza:'calientes',temp_min:65,  temp_max:85,  activo:true, restaurante_id:R },
  ], { onConflict: 'id' })
  if (eqErr) console.warn('  ⚠ haccp_equipos:', eqErr.message)

  const haccpTemps = []
  const equipDefs = [
    { id:EQ.camCarnes,  base:1.5,   jitter:0.8, min:-1,  max:3   },
    { id:EQ.camVeg,     base:3.5,   jitter:1.0, min:2,   max:6   },
    { id:EQ.congelador, base:-17.5, jitter:1.5, min:-22, max:-15 },
    { id:EQ.lineaFrio,  base:2.5,   jitter:0.8, min:0,   max:5   },
    { id:EQ.banioMaria, base:0,     jitter:2,   min:65,  max:85  },
  ]
  // Lecturas fuera de rango planificadas (día → equipo índice → temperatura)
  const outOfRange = { '8-0': 3.8, '14-3': 6.2, '19-2': -14, '22-1': 7.1, '6-4': 58 }

  for (let day = 1; day <= 24; day++) {
    const esServicio = servicioSet.has(day)
    for (let i = 0; i < equipDefs.length; i++) {
      const e = equipDefs[i]
      const key = `${day}-${i}`
      let temp
      if (outOfRange[key]) {
        temp = outOfRange[key]
      } else if (i === 4) { // banioMaria
        temp = esServicio ? e.base + (((day * 13 + i * 7) % 11) / 11 - 0.5) * 2 * e.jitter : 22
      } else {
        temp = e.base + (((day * 17 + i * 7) % 19) / 19 - 0.5) * 2 * e.jitter
      }
      temp = Math.round(temp * 10) / 10
      const dentroRango = temp >= e.min && temp <= e.max
      haccpTemps.push({
        equipo_id: e.id,
        temperatura: temp,
        dentro_rango: dentroRango,
        observacion: dentroRango ? null : (esServicio ? 'Temperatura fuera de rango — verificada' : 'Equipo sin servicio'),
        accion_correctiva: (!dentroRango && esServicio) ? 'Corregida la temperatura. Notificado al chef.' : null,
        restaurante_id: R,
        created_at: dt(day, 9),
      })
    }
  }
  const { error: tempErr } = await sb.from('haccp_temperaturas').insert(haccpTemps)
  if (tempErr) console.warn('  ⚠ temperaturas:', tempErr.message)
  else console.log(`  ✅ 5 equipos, ${haccpTemps.length} registros de temperatura`)

  // ── Tareas ────────────────────────────────────────────────────────────────────
  console.log('📝 Tareas...')
  const tareasBase = [
    // Producción ligada a recetas
    { titulo:'Producir Salsa Malbec x8 porciones',          descripcion:'Reducir el Malbec con cebolla morada y montar con manteca fría.',                  plaza:'calientes', prioridad:'alta',   status:'pendiente',   categoria:'produccion', receta:rm['Salsa Malbec Reducción'],                   dia:DIAS[0],  tiempo:30 },
    { titulo:'Producir Chimichurri Serrano x10',             descripcion:'Picar hierbas, macerar con aceite y vinagre. Mínimo 2h de reposo.',                plaza:'frios',     prioridad:'alta',   status:'completada',  categoria:'produccion', receta:rm['Chimichurri Serrano'],                       dia:DIAS[0],  tiempo:15 },
    { titulo:'Preparar Puré de Papa Andina x4',              descripcion:'Cocinar y pisar las papas. Incorporar manteca y crema al final.',                  plaza:'calientes', prioridad:'media',  status:'completada',  categoria:'produccion', receta:rm['Puré de Papa Andina'],                       dia:DIAS[0],  tiempo:30 },
    { titulo:'Elaborar Crème Brûlée x8',                     descripcion:'Hornear en baño maría. Enfriar 4h antes del servicio.',                            plaza:'pasteleria',prioridad:'alta',   status:'completada',  categoria:'produccion', receta:rm['Crème Brûlée de Malbec'],                   dia:DIAS[1],  tiempo:60 },
    { titulo:'Preparar Fondant de Chocolate x6',             descripcion:'Moldear y refrigerar. Hornear al momento del pedido.',                             plaza:'pasteleria',prioridad:'alta',   status:'pendiente',   categoria:'produccion', receta:rm['Fondant de Chocolate Amargo'],               dia:DIAS[1],  tiempo:25 },
    { titulo:'Confitar Cordero para la noche',               descripcion:'Iniciar a las 14:00 para tener listo a las 17:00.',                                plaza:'calientes', prioridad:'critica',status:'en_proceso',  categoria:'produccion', receta:rm['Cordero Patagónico Confitado'],              dia:DIAS[2],  tiempo:180 },
    { titulo:'Mise en place Tataki de Lomo',                 descripcion:'Porcionar el lomo y preparar la vinagreta de hierbas.',                            plaza:'frios',     prioridad:'alta',   status:'pendiente',   categoria:'produccion', receta:rm['Tataki de Lomo con Vinagreta de Hierbas'],  dia:DIAS[2],  tiempo:15 },
    { titulo:'Preparar Carpaccio de Remolacha x6',           descripcion:'Asar remolachas, enfriar y laminar. Mantener en frío hasta servicio.',             plaza:'frios',     prioridad:'media',  status:'completada',  categoria:'produccion', receta:rm['Carpaccio de Remolacha con Queso Caprino'], dia:DIAS[3],  tiempo:15 },
    { titulo:'Elaborar Pan de Sarraceno x4 unidades',        descripcion:'Fermentar 1h y hornear. Preparar para el servicio de las 20:00.',                  plaza:'pasteleria',prioridad:'media',  status:'en_proceso',  categoria:'produccion', receta:rm['Pan de Trigo Sarraceno con Masa Madre'],   dia:DIAS[3],  tiempo:90 },
    { titulo:'Cocinar Pulpo — método 3 fases',               descripcion:'Hervir, enfriar, y marcar a la brasa al momento del pedido.',                      plaza:'calientes', prioridad:'alta',   status:'completada',  categoria:'produccion', receta:rm['Pulpo a la Brasa con Papa Andina'],         dia:DIAS[4],  tiempo:90 },
    { titulo:'Preparar Risotto base',                        descripcion:'Hacer el fondo y tener el arroz nacarado listo. Terminar al pedido.',              plaza:'calientes', prioridad:'alta',   status:'pendiente',   categoria:'produccion', receta:rm['Risotto de Hongos Porcini'],                dia:DIAS[4],  tiempo:35 },
    { titulo:'Mise en place Panna Cotta x8',                 descripcion:'Preparar los moldes y refrigerar. Listo para el servicio de la noche.',            plaza:'pasteleria',prioridad:'media',  status:'completada',  categoria:'produccion', receta:rm['Panna Cotta de Caprino con Miel'],          dia:DIAS[5],  tiempo:20 },
    { titulo:'Producir Espuma de Puerro x2 sifones',        descripcion:'Blanquear puerros, procesar y cargar sifones. Refrigerar 1h.',                     plaza:'calientes', prioridad:'media',  status:'pendiente',   categoria:'produccion', receta:rm['Espuma de Puerro'],                          dia:DIAS[6],  tiempo:20 },
    { titulo:'Marinar Carré de Cerdo para el día siguiente', descripcion:'Cubrir con hierbas serranas y aceite. Refrigerar toda la noche.',                  plaza:'calientes', prioridad:'baja',   status:'completada',  categoria:'produccion', receta:rm['Carré de Cerdo con Miel y Hierbas'],        dia:DIAS[6],  tiempo:10 },
    { titulo:'Preparar Sopa de Zapallo x6 porciones',        descripcion:'Asar, procesar y enfriar. Servir con aceite de oliva al momento.',                 plaza:'frios',     prioridad:'media',  status:'pendiente',   categoria:'produccion', receta:rm['Sopa Fría de Zapallo con Aceite de Oliva'], dia:DIAS[7],  tiempo:25 },
    { titulo:'Limpiar y blanquear mollejas — 2kg',           descripcion:'Retirar los nervios y blanquear en agua con limón. Prensar y refrigerar.',          plaza:'calientes', prioridad:'alta',   status:'completada',  categoria:'produccion', receta:rm['Mollejas Crujientes con Chimichurri Serrano'],dia:DIAS[7], tiempo:20 },
    // Plaza
    { titulo:'Mise en place Cocina Caliente',       descripcion:'Verificar fondos, salsas y mise de cada proteína.',   plaza:'calientes', prioridad:'alta',  status:'completada', categoria:'plaza',     receta:null, dia:DIAS[8],  tiempo:60 },
    { titulo:'Mise en place Cocina Fría',           descripcion:'Preparar ensaladas, carpaccios y entradas frías.',    plaza:'frios',     prioridad:'alta',  status:'completada', categoria:'plaza',     receta:null, dia:DIAS[8],  tiempo:45 },
    { titulo:'Mise en place Pastelería',            descripcion:'Verificar postres en frío y mise de crêmes brûlées.', plaza:'pasteleria',prioridad:'alta',  status:'completada', categoria:'plaza',     receta:null, dia:DIAS[8],  tiempo:40 },
    { titulo:'Mise en place Cocina Caliente',       descripcion:'Verificar fondos, salsas y mise de cada proteína.',   plaza:'calientes', prioridad:'alta',  status:'en_proceso', categoria:'plaza',     receta:null, dia:DIAS[10], tiempo:60 },
    { titulo:'Mise en place Cocina Fría',           descripcion:'Preparar entradas frías y carpaccios del día.',       plaza:'frios',     prioridad:'alta',  status:'en_proceso', categoria:'plaza',     receta:null, dia:DIAS[10], tiempo:45 },
    { titulo:'Verificar stock de proteínas',        descripcion:'Contar filetes, lomo y cordero disponibles para hoy.',plaza:'calientes', prioridad:'alta',  status:'completada', categoria:'plaza',     receta:null, dia:DIAS[11], tiempo:15 },
    { titulo:'Mise en place Pastelería',            descripcion:'Verificar postres fríos y preparar bases de fondant.',plaza:'pasteleria',prioridad:'media', status:'pendiente',  categoria:'plaza',     receta:null, dia:DIAS[12], tiempo:40 },
    { titulo:'Ordenar mise frío por servicio',      descripcion:'Etiquetar y ordenar todos los mise en el frío de servicio.', plaza:'frios', prioridad:'media',status:'pendiente',  categoria:'plaza',     receta:null, dia:DIAS[13], tiempo:20 },
    { titulo:'Preparar línea para servicio doble',  descripcion:'Sábado con reservas dobles — mise para 70 cubiertos.', plaza:'calientes',prioridad:'critica',status:'pendiente', categoria:'plaza',    receta:null, dia:DIAS[15], tiempo:90 },
    { titulo:'Mise en place Cocina Caliente',       descripcion:'Verificar fondos, salsas y mise de cada proteína.',   plaza:'calientes', prioridad:'alta',  status:'pendiente',  categoria:'plaza',     receta:null, dia:DIAS[16], tiempo:60 },
    // Rutinas
    { titulo:'Control HACCP de apertura',       descripcion:'Registrar temperaturas de cámaras y congelador.',           plaza:'calientes', prioridad:'alta',   status:'completada', categoria:'rutina', receta:null, dia:DIAS[0],  tiempo:10 },
    { titulo:'Control HACCP de apertura',       descripcion:'Registrar temperaturas de cámaras y congelador.',           plaza:'calientes', prioridad:'alta',   status:'completada', categoria:'rutina', receta:null, dia:DIAS[3],  tiempo:10 },
    { titulo:'Control HACCP de apertura',       descripcion:'Registrar temperaturas de cámaras y congelador.',           plaza:'calientes', prioridad:'alta',   status:'completada', categoria:'rutina', receta:null, dia:DIAS[7],  tiempo:10 },
    { titulo:'Control HACCP de apertura',       descripcion:'Registrar temperaturas de cámaras y congelador.',           plaza:'calientes', prioridad:'alta',   status:'en_proceso', categoria:'rutina', receta:null, dia:DIAS[11], tiempo:10 },
    { titulo:'Limpieza profunda cámara carnes', descripcion:'Vaciar, limpiar y desinfectar la cámara de carnes.',        plaza:'calientes', prioridad:'alta',   status:'completada', categoria:'rutina', receta:null, dia:DIAS[1],  tiempo:45 },
    { titulo:'Limpieza de campana y filtros',   descripcion:'Retirar filtros de campana y lavar. Periodicidad: semanal.', plaza:'calientes',prioridad:'media',  status:'completada', categoria:'rutina', receta:null, dia:DIAS[4],  tiempo:30 },
    { titulo:'Limpieza profunda pisos cocina',  descripcion:'Limpiar pisos con detergente desengrasante y enjuagar.',    plaza:'calientes', prioridad:'media',  status:'completada', categoria:'rutina', receta:null, dia:DIAS[9],  tiempo:40 },
    { titulo:'Revisar vencimientos en cámara',  descripcion:'Controlar fechas de vencimiento de todos los productos.',   plaza:'frios',     prioridad:'alta',   status:'completada', categoria:'rutina', receta:null, dia:DIAS[2],  tiempo:20 },
    { titulo:'Revisar vencimientos en cámara',  descripcion:'Controlar fechas de vencimiento de todos los productos.',   plaza:'frios',     prioridad:'alta',   status:'completada', categoria:'rutina', receta:null, dia:DIAS[9],  tiempo:20 },
    { titulo:'Revisar vencimientos en cámara',  descripcion:'Controlar fechas de vencimiento de todos los productos.',   plaza:'frios',     prioridad:'alta',   status:'pendiente',  categoria:'rutina', receta:null, dia:DIAS[16], tiempo:20 },
    { titulo:'Sanitización de tablas y cuchillos', descripcion:'Sanitizar con solución clorada al 0.5%.',                plaza:'frios',     prioridad:'media',  status:'completada', categoria:'rutina', receta:null, dia:DIAS[5],  tiempo:15 },
    { titulo:'Etiquetado de mise en place',     descripcion:'Reetiquetear todos los recipientes con fecha de hoy.',      plaza:'frios',     prioridad:'baja',   status:'completada', categoria:'rutina', receta:null, dia:DIAS[6],  tiempo:20 },
    { titulo:'Limpieza deep pastry',            descripcion:'Limpiar horno, heladera y mesada de pastelería.',           plaza:'pasteleria',prioridad:'media',  status:'completada', categoria:'rutina', receta:null, dia:DIAS[8],  tiempo:35 },
    { titulo:'Control stock seco',              descripcion:'Contar secos, harinas y especias. Armar pedido si falta.', plaza:'calientes', prioridad:'baja',   status:'pendiente',  categoria:'rutina', receta:null, dia:DIAS[14], tiempo:20 },
    // General / admin
    { titulo:'Reunión de equipo — inicio de semana', descripcion:'Repaso de reservas, especiales y ajustes de carta.',  plaza:null,        prioridad:'media',  status:'completada', categoria:'general', receta:null, dia:DIAS[0],  tiempo:20 },
    { titulo:'Actualizar carta QR',                 descripcion:'Subir cambios de disponibilidad a la carta digital.',  plaza:null,        prioridad:'baja',   status:'completada', categoria:'general', receta:null, dia:DIAS[1],  tiempo:15 },
    { titulo:'Confirmar reservas del fin de semana', descripcion:'Llamar o WhatsApp a reservas del sábado y domingo.',  plaza:null,        prioridad:'alta',   status:'completada', categoria:'general', receta:null, dia:DIAS[5],  tiempo:15 },
    { titulo:'Cargar facturas de la semana',         descripcion:'Ingresar facturas de proveedores al sistema.',        plaza:null,        prioridad:'media',  status:'completada', categoria:'general', receta:null, dia:DIAS[4],  tiempo:20 },
    { titulo:'Revisar y aprobar pedidos de la semana', descripcion:'Confirmar cantidades y enviar a proveedores.',      plaza:null,        prioridad:'alta',   status:'completada', categoria:'general', receta:null, dia:DIAS[10], tiempo:15 },
    { titulo:'Planificar menú especial Semana Santa', descripcion:'Armar propuesta de menú degustación de 5 pasos.',   plaza:null,        prioridad:'media',  status:'pendiente',  categoria:'general', receta:null, dia:DIAS[13], tiempo:30 },
    { titulo:'Mantenimiento preventivo horno',       descripcion:'Llamar al técnico para revisión del horno Rational.', plaza:'calientes',prioridad:'baja',   status:'pendiente',  categoria:'general', receta:null, dia:DIAS[17], tiempo:0 },
    { titulo:'Cierre de caja y conciliación',        descripcion:'Cerrar caja del fin de semana y cuadrar con Supabase.',plaza:null,       prioridad:'alta',   status:'completada', categoria:'general', receta:null, dia:DIAS[15], tiempo:20 },
    { titulo:'Llamar a Frigorífico El Paso — urgente', descripcion:'Quedan solo 2 porciones de lomo. Pedir entrega anticipada.', plaza:null, prioridad:'critica', status:'completada', categoria:'general', receta:null, dia:DIAS[12], tiempo:5 },
    { titulo:'Preparar especiales de la semana',     descripcion:'Definir platos off-menu según disponibilidad.',       plaza:null,        prioridad:'media',  status:'pendiente',  categoria:'general', receta:null, dia:DIAS[18], tiempo:20 },
  ]

  const { error: tarErr } = await sb.from('tareas').insert(tareasBase.map(t => ({
    titulo: t.titulo, descripcion: t.descripcion, plaza: t.plaza, prioridad: t.prioridad,
    status: t.status, categoria: t.categoria, receta_id: t.receta ?? null,
    fecha_limite: d(t.dia), tiempo_estimado_min: t.tiempo,
    checklist: [], restaurante_id: R,
  })))
  if (tarErr) console.warn('  ⚠ tareas:', tarErr.message)
  else console.log(`  ✅ ${tareasBase.length} tareas`)

  // ── Merma ─────────────────────────────────────────────────────────────────────
  console.log('🗑️  Merma...')
  const mermaData = [
    { pnom:'Trucha Filete',           pid:pm['Trucha Filete'],           cant:0.3, uni:'kg', motivo:'mala_recepcion',   plaza:'calientes', unom:'Laura', fecha:d(2),  turno:'apertura', costo:5400  },
    { pnom:'Hierbas Frescas',         pid:pm['Hierbas Frescas'],         cant:2,   uni:'u',  motivo:'vencimiento',      plaza:'frios',     unom:'Camila',fecha:d(2),  turno:'apertura', costo:2800  },
    { pnom:'Crema de Leche',          pid:pm['Crema de Leche'],          cant:0.5, uni:'l',  motivo:'sobro_servicio',   plaza:'pasteleria',unom:'Sofía', fecha:d(5),  turno:'cierre',   costo:3250  },
    { pnom:'Lomo de Ternera',         pid:pm['Lomo de Ternera'],         cant:0.1, uni:'kg', motivo:'error_coccion',    plaza:'calientes', unom:'Rodrigo',fecha:d(5), turno:'servicio', costo:2300  },
    { pnom:'Remolacha',               pid:pm['Remolacha'],               cant:0.4, uni:'kg', motivo:'deterioro',        plaza:'frios',     unom:'Camila',fecha:d(6),  turno:'apertura', costo:1600  },
    { pnom:'Papa Andina',             pid:pm['Papa Andina'],             cant:1,   uni:'kg', motivo:'sobro_servicio',   plaza:'calientes', unom:'Rodrigo',fecha:d(7), turno:'cierre',   costo:3200  },
    { pnom:'Pato Pechuga',            pid:pm['Pato Pechuga'],            cant:0.2, uni:'kg', motivo:'error_coccion',    plaza:'calientes', unom:'Laura', fecha:d(8),  turno:'servicio', costo:5800  },
    { pnom:'Huevos de Campo',         pid:pm['Huevos de Campo'],         cant:4,   uni:'u',  motivo:'error_coccion',    plaza:'pasteleria',unom:'Sofía', fecha:d(8),  turno:'servicio', costo:1200  },
    { pnom:'Zapallo Criollo',         pid:pm['Zapallo Criollo'],         cant:0.5, uni:'kg', motivo:'deterioro',        plaza:'frios',     unom:'Tomás', fecha:d(9),  turno:'apertura', costo:1250  },
    { pnom:'Hongos Porcini',          pid:pm['Hongos Porcini'],          cant:0.1, uni:'kg', motivo:'vencimiento',      plaza:'calientes', unom:'Rodrigo',fecha:d(9), turno:'apertura', costo:3400  },
    { pnom:'Queso Caprino',           pid:pm['Queso Caprino'],           cant:0.1, uni:'kg', motivo:'mala_conservacion',plaza:'frios',     unom:'Camila',fecha:d(12), turno:'apertura', costo:2600  },
    { pnom:'Trucha Filete',           pid:pm['Trucha Filete'],           cant:0.2, uni:'kg', motivo:'sobro_servicio',   plaza:'calientes', unom:'Laura', fecha:d(12), turno:'cierre',   costo:3600  },
    { pnom:'Cordero Pierna Deshuesada',pid:pm['Cordero Pierna Deshuesada'],cant:0.15,uni:'kg',motivo:'error_coccion',   plaza:'calientes', unom:'Rodrigo',fecha:d(13),turno:'servicio', costo:3000  },
    { pnom:'Manteca',                 pid:pm['Manteca'],                 cant:0.2, uni:'kg', motivo:'vencimiento',      plaza:'calientes', unom:'Laura', fecha:d(14), turno:'apertura', costo:2000  },
    { pnom:'Hierbas Frescas',         pid:pm['Hierbas Frescas'],         cant:1,   uni:'u',  motivo:'vencimiento',      plaza:'frios',     unom:'Camila',fecha:d(14), turno:'apertura', costo:1400  },
    { pnom:'Pulpo Entero',            pid:pm['Pulpo Entero'],            cant:0.2, uni:'kg', motivo:'sobro_servicio',   plaza:'calientes', unom:'Rodrigo',fecha:d(15),turno:'cierre',   costo:5000  },
    { pnom:'Papa Andina',             pid:pm['Papa Andina'],             cant:0.5, uni:'kg', motivo:'sobro_servicio',   plaza:'calientes', unom:'Julián',fecha:d(15), turno:'cierre',   costo:1600  },
    { pnom:'Chocolate Amargo 70%',    pid:pm['Chocolate Amargo 70%'],    cant:0.1, uni:'kg', motivo:'error_coccion',    plaza:'pasteleria',unom:'Sofía', fecha:d(16), turno:'servicio', costo:1900  },
    { pnom:'Crema de Leche',          pid:pm['Crema de Leche'],          cant:0.3, uni:'l',  motivo:'sobro_servicio',   plaza:'pasteleria',unom:'Sofía', fecha:d(16), turno:'cierre',   costo:1950  },
    { pnom:'Mollejas de Ternera',     pid:pm['Mollejas de Ternera'],     cant:0.1, uni:'kg', motivo:'devolucion_cliente',plaza:'calientes',unom:'Laura', fecha:d(19), turno:'servicio', costo:1300  },
    { pnom:'Tomate Perita',           pid:pm['Tomate Perita'],           cant:0.5, uni:'kg', motivo:'deterioro',        plaza:'frios',     unom:'Tomás', fecha:d(19), turno:'apertura', costo:1500  },
    { pnom:'Zanahoria Baby',          pid:pm['Zanahoria Baby'],          cant:0.2, uni:'kg', motivo:'sobro_servicio',   plaza:'frios',     unom:'Camila',fecha:d(20), turno:'cierre',   costo:1000  },
    { pnom:'Lomo de Ternera',         pid:pm['Lomo de Ternera'],         cant:0.15,uni:'kg', motivo:'sobro_servicio',   plaza:'calientes', unom:'Rodrigo',fecha:d(20),turno:'cierre',   costo:3450  },
    { pnom:'Trucha Filete',           pid:pm['Trucha Filete'],           cant:0.25,uni:'kg', motivo:'mala_conservacion',plaza:'calientes', unom:'Laura', fecha:d(21), turno:'apertura', costo:4500  },
    { pnom:'Pan de Sarraceno',        pid:null,                          cant:2,   uni:'u',  motivo:'sobro_servicio',   plaza:'pasteleria',unom:'Sofía', fecha:d(21), turno:'cierre',   costo:0     },
    { pnom:'Puerro',                  pid:pm['Puerro'],                  cant:2,   uni:'u',  motivo:'vencimiento',      plaza:'frios',     unom:'Camila',fecha:d(22), turno:'apertura', costo:3200  },
    { pnom:'Huevos de Campo',         pid:pm['Huevos de Campo'],         cant:6,   uni:'u',  motivo:'error_coccion',    plaza:'pasteleria',unom:'Sofía', fecha:d(22), turno:'servicio', costo:1800  },
    { pnom:'Arroz Arborio',           pid:pm['Arroz Arborio'],           cant:0.3, uni:'kg', motivo:'sobro_servicio',   plaza:'calientes', unom:'Rodrigo',fecha:d(23),turno:'cierre',   costo:1740  },
    { pnom:'Cebolla Morada',          pid:pm['Cebolla Morada'],          cant:0.5, uni:'kg', motivo:'deterioro',        plaza:'frios',     unom:'Tomás', fecha:d(26), turno:'apertura', costo:1100  },
    { pnom:'Pato Pechuga',            pid:pm['Pato Pechuga'],            cant:0.2, uni:'kg', motivo:'error_coccion',    plaza:'calientes', unom:'Laura', fecha:d(27), turno:'servicio', costo:5800  },
    { pnom:'Cordero Pierna Deshuesada',pid:pm['Cordero Pierna Deshuesada'],cant:0.2,uni:'kg',motivo:'sobro_servicio',   plaza:'calientes', unom:'Rodrigo',fecha:d(28),turno:'cierre',   costo:4000  },
  ]

  const { error: merErr } = await sb.from('merma').insert(mermaData.map(m => ({
    producto_nombre:m.pnom, producto_id:m.pid, cantidad:m.cant, unidad:m.uni,
    motivo:m.motivo, plaza:m.plaza, usuario_nombre:m.unom, fecha:m.fecha,
    turno:m.turno, costo_estimado:m.costo, restaurante_id:R,
  })))
  if (merErr) console.warn('  ⚠ merma:', merErr.message)
  else console.log(`  ✅ ${mermaData.length} registros de merma`)

  // ── Turnos (generados) ────────────────────────────────────────────────────────
  console.log('🗓️  Turnos...')
  // Días libres por miembro (índices en DIAS)
  const skipDias = {
    [M.laura]:   new Set([1, 15]),
    [M.rodrigo]: new Set([7, 21]),
    [M.camila]:  new Set([5, 12, 18, 26]),
    [M.sofia]:   new Set([0, 8, 14, 19, 25, 29]),
    [M.julian]:  new Set([4, 11, 22, DIAS.length - 1]),
    [M.paula]:   new Set([6, 13, 20, 27]),
    [M.tomas]:   new Set([1, 7, 14, 21, 25, DIAS.length - 1]),
  }
  const turnoConf = [
    { id:M.marcos,  tipo:'cena',     entrada:'18:30', salida:'01:00' },
    { id:M.laura,   tipo:'cena',     entrada:'17:00', salida:'01:00' },
    { id:M.rodrigo, tipo:'cena',     entrada:'17:00', salida:'01:00' },
    { id:M.camila,  tipo:'almuerzo', entrada:'09:30', salida:'17:00' },
    { id:M.sofia,   tipo:'almuerzo', entrada:'10:00', salida:'16:30' },
    { id:M.julian,  tipo:'cena',     entrada:'17:30', salida:'01:00' },
    { id:M.paula,   tipo:'cena',     entrada:'19:00', salida:'01:00' },
    { id:M.tomas,   tipo:'almuerzo', entrada:'09:00', salida:'15:30' },
  ]
  const turnosData = []
  DIAS.forEach((dia, idx) => {
    for (const tc of turnoConf) {
      if (skipDias[tc.id]?.has(idx)) continue
      turnosData.push({ miembro_id:tc.id, fecha:d(dia), turno_tipo:tc.tipo, hora_entrada:tc.entrada, hora_salida:tc.salida, restaurante_id:R })
    }
  })
  const { error: turnErr } = await sb.from('turnos').upsert(turnosData, { onConflict: 'miembro_id,fecha' })
  if (turnErr) console.warn('  ⚠ turnos:', turnErr.message)
  else console.log(`  ✅ ${turnosData.length} turnos`)

  // ── Eventos ───────────────────────────────────────────────────────────────────
  console.log('📅 Eventos...')
  await sb.from('eventos').insert([
    { titulo:'Noche de Terroir — Cena Privada', descripcion:'Grupo de 18 personas. Menú degustación 6 pasos acordado con el dueño. Emparedar con los mejores vinos de la bodega.', tipo:'reserva', fecha_inicio:d(8), hora_inicio:'20:30', hora_fin:'01:00', color:'#4361a0', restaurante_id:R },
    { titulo:'Entrega Bodega Los Cóndores',     descripcion:'Entrega de 18 botellas Malbec + 12 Torrontés + 6 Espumante. Confirmar orden 24h antes.', tipo:'proveedor', fecha_inicio:d(14), hora_inicio:'10:00', hora_fin:'11:00', proveedor_id:PV.bodega, color:'#f97316', restaurante_id:R },
    { titulo:'Capacitación HACCP — todo el equipo', descripcion:'Repaso de protocolos de temperatura, etiquetado y BPM. A cargo de Marcos. Obligatorio para todos.', tipo:'reunion', fecha_inicio:d(21), hora_inicio:'09:00', hora_fin:'11:00', color:'#10b981', restaurante_id:R },
  ])
  console.log('  ✅ 3 eventos')

  // ── Ventas ────────────────────────────────────────────────────────────────────
  console.log('💰 Ventas...')
  // Cubiertos y totales variables por día (más el fin de semana)
  const ventaConf = [
    [DIAS[0],  28, 1050000], [DIAS[1],  32, 1230000],
    [DIAS[2],  22,  830000], [DIAS[3],  26,  980000], [DIAS[4],  30, 1140000], [DIAS[5],  38, 1480000], [DIAS[6],  42, 1650000],
    [DIAS[7],  24,  920000], [DIAS[8],  27, 1020000], [DIAS[9],  31, 1190000], [DIAS[10], 29, 1080000], [DIAS[11], 35, 1360000], [DIAS[12], 44, 1720000], [DIAS[13], 48, 1890000],
    [DIAS[14], 20,  760000], [DIAS[15], 25,  950000], [DIAS[16], 30, 1150000], [DIAS[17], 28, 1060000], [DIAS[18], 36, 1400000], [DIAS[19], 41, 1600000], [DIAS[20], 45, 1780000],
    [DIAS[21], 22,  840000],
  ]

  for (const [dia, cubiertos, total] of ventaConf) {
    const { data: venta, error: vErr } = await sb.from('ventas').insert({ restaurante_id:R, fecha:d(dia), origen:'manual', total_ventas:total, cantidad_cubiertos:cubiertos }).select('id').single()
    if (vErr) { console.warn(`  ⚠ venta ${d(dia)}: ${vErr.message}`); continue }
    await sb.from('ventas_items').insert([
      { venta_id:venta.id, nombre_plato:'Lomo de Ternera al Carbón',    cantidad:Math.round(cubiertos*0.25), precio_unitario:38000 },
      { venta_id:venta.id, nombre_plato:'Trucha Andina a la Sartén',    cantidad:Math.round(cubiertos*0.18), precio_unitario:32000 },
      { venta_id:venta.id, nombre_plato:'Cordero Confitado',            cantidad:Math.round(cubiertos*0.15), precio_unitario:36000 },
      { venta_id:venta.id, nombre_plato:'Fondant de Chocolate Amargo',  cantidad:Math.round(cubiertos*0.40), precio_unitario:15000 },
      { venta_id:venta.id, nombre_plato:'Copa Malbec Reserva',          cantidad:Math.round(cubiertos*0.70), precio_unitario:9500  },
    ])
  }
  console.log(`  ✅ ${ventaConf.length} días de ventas`)

  // ── Pase de turno ─────────────────────────────────────────────────────────────
  console.log('💬 Pase de turno...')
  await sb.from('pase_mensajes').insert([
    { texto:'86 — Cordero hasta mañana. Entró poco stock hoy, se vendieron todas las porciones.',                     tipo:'alerta', prioridad:'urgente',    plaza:null,          turno_fecha:d(DIAS[1]),  turno_tipo:'cena',    usuario_nombre:'Laura Suárez',   leido_por:[], restaurante_id:R },
    { texto:'La cámara de carnes subió a 3.8°C durante el mediodía. La sellé y está bajando. Control a las 18hs.',    tipo:'alerta', prioridad:'importante', plaza:'calientes',   turno_fecha:d(DIAS[3]),  turno_tipo:'almuerzo',usuario_nombre:'Rodrigo Castro', leido_por:[], restaurante_id:R },
    { texto:'Grupo de 18 personas el sábado — confirmaron el menú degustación. Necesitamos mise extra de porcini.',   tipo:'texto',  prioridad:'importante', plaza:null,          turno_fecha:d(DIAS[4]),  turno_tipo:'cena',    usuario_nombre:'Marcos Villalba',leido_por:[], restaurante_id:R },
    { texto:'Hoy se usó toda la trucha del stock. Rodrigo ya hizo el pedido a Del Mar para el jueves.',               tipo:'texto',  prioridad:'normal',     plaza:'calientes',   turno_fecha:d(DIAS[5]),  turno_tipo:'cena',    usuario_nombre:'Laura Suárez',   leido_por:[], restaurante_id:R },
    { texto:'Los fondants salieron perfectos esta noche. Método de 12 min a 190°C confirmado para esta semana.',       tipo:'texto',  prioridad:'normal',     plaza:'pasteleria',  turno_fecha:d(DIAS[6]),  turno_tipo:'cena',    usuario_nombre:'Sofía Rizzo',    leido_por:[], restaurante_id:R },
    { texto:'Noche Terroir — servicio impecable. Mesa quedó muy conforme. Dejaron propina para todo el equipo.',       tipo:'texto',  prioridad:'importante', plaza:null,          turno_fecha:d(DIAS[7]),  turno_tipo:'cena',    usuario_nombre:'Marcos Villalba',leido_por:[], restaurante_id:R },
    { texto:'Urgente — quedan 2 porciones de lomo. Llamé a El Paso para entrega anticipada mañana temprano.',         tipo:'alerta', prioridad:'urgente',    plaza:'calientes',   turno_fecha:d(DIAS[11]), turno_tipo:'cena',    usuario_nombre:'Rodrigo Castro', leido_por:[], restaurante_id:R },
    { texto:'Mesa 4 devolvió las mollejas — las encontró "duras". Revisar el tiempo de blanqueo mañana en el mise.',  tipo:'alerta', prioridad:'importante', plaza:'calientes',   turno_fecha:d(DIAS[13]), turno_tipo:'cena',    usuario_nombre:'Paula Ibáñez',   leido_por:[], restaurante_id:R },
    { texto:'Sábado lleno — 44 cubiertos. Equipo de 10 personas a las 21:00. Tienen reserva confirmada por Marcos.',  tipo:'texto',  prioridad:'importante', plaza:null,          turno_fecha:d(DIAS[14]), turno_tipo:'cena',    usuario_nombre:'Marcos Villalba',leido_por:[], restaurante_id:R },
    { texto:'Capacitación HACCP el viernes 21 a las 9:00. Presencia obligatoria todo el equipo de cocina.',           tipo:'texto',  prioridad:'importante', plaza:null,          turno_fecha:d(DIAS[15]), turno_tipo:'almuerzo',usuario_nombre:'Marcos Villalba',leido_por:[], restaurante_id:R },
    { texto:'Congelador marcó -14°C en el control de hoy. Técnico de refrigeración va mañana a las 8:00.',            tipo:'alerta', prioridad:'urgente',    plaza:'calientes',   turno_fecha:d(DIAS[17]), turno_tipo:'almuerzo',usuario_nombre:'Camila Fontana', leido_por:[], restaurante_id:R },
    { texto:'La línea de frío está a 6.2°C — la bajé a 2°C. Reubicar lácteos a la cámara de vegetales por precaución.',tipo:'alerta',prioridad:'urgente',   plaza:'frios',       turno_fecha:d(DIAS[9]),  turno_tipo:'almuerzo',usuario_nombre:'Camila Fontana', leido_por:[], restaurante_id:R },
    { texto:'Porcini llegó excelente hoy, bien frescos. Aprovechar para el risotto esta semana.',                      tipo:'texto',  prioridad:'normal',     plaza:'calientes',   turno_fecha:d(DIAS[7]),  turno_tipo:'almuerzo',usuario_nombre:'Laura Suárez',   leido_por:[], restaurante_id:R },
    { texto:'Granita de Torrontés lista para testetear — espero feedback del chef antes de agregarla a la carta.',    tipo:'texto',  prioridad:'normal',     plaza:'pasteleria',  turno_fecha:d(DIAS[18]), turno_tipo:'almuerzo',usuario_nombre:'Sofía Rizzo',    leido_por:[], restaurante_id:R },
    { texto:'Semana del 26: Semana Santa. Esperamos lleno viernes y sábado. Pedí refuerzo a Julián para los dos días.',tipo:'texto', prioridad:'importante', plaza:null,          turno_fecha:d(DIAS[20]), turno_tipo:'cena',    usuario_nombre:'Marcos Villalba',leido_por:[], restaurante_id:R },
  ])
  console.log('  ✅ 15 mensajes de pase')

  // ── Resumen ───────────────────────────────────────────────────────────────────
  console.log('\n🎉 Seed completo — Origen, Cocina de Terroir')
  console.log('─────────────────────────────────────────────')
  console.log(`  Restaurante ID : ${R}`)
  console.log(`  Productos      : ${prodRows.length}`)
  console.log(`  Recetas        : ${Object.keys(recetaMap).length}`)
  console.log(`  Carta          : 20 platos`)
  console.log(`  Pedidos        : ${pedidosSrc.length} (${pedidosSrc.reduce((s,p)=>s+p.items.length,0)} items)`)
  console.log(`  Facturas       : ${facturasSrc.length}`)
  console.log(`  HACCP          : 5 equipos, ${haccpTemps.length} lecturas`)
  console.log(`  Tareas         : ${tareasBase.length}`)
  console.log(`  Merma          : ${mermaData.length} registros`)
  console.log(`  Turnos         : ${turnosData.length}`)
  console.log(`  Ventas         : ${ventaConf.length} días`)
  console.log(`  Pase mensajes  : 15`)
  console.log('─────────────────────────────────────────────')
}

main().catch(console.error)
