#!/usr/bin/env node
// Seed realista para El Rescoldo — Parrilla & Cocina de Autor, Córdoba
// Precios reales mercado argentino 2026

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing env vars: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const R = '00000000-0000-0000-0000-000000000001'
const today = new Date().toISOString().slice(0, 10)
const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10)
const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10)

async function main() {
  console.log('🌱 Sembrando datos de El Rescoldo...\n')

  // ═══════════════════════════════════════════════════════════
  // 1. PROVEEDORES
  // ═══════════════════════════════════════════════════════════
  console.log('📦 Creando proveedores...')
  const proveedoresData = [
    { nombre: 'Carnes del Sur SRL', rubro: 'Carnicería', telefono: '3516234567', dias_entrega: ['Lunes', 'Miércoles', 'Viernes'], activo: true, restaurante_id: R },
    { nombre: 'La Huerta Cordobesa', rubro: 'Verdulería', telefono: '3514567890', dias_entrega: ['Lunes', 'Martes', 'Jueves', 'Sábado'], activo: true, restaurante_id: R },
    { nombre: 'Distribuidora Don Mario', rubro: 'Secos y Almacén', telefono: '3517891234', dias_entrega: ['Martes', 'Viernes'], activo: true, restaurante_id: R },
    { nombre: 'Lácteos La Serranita', rubro: 'Lácteos', telefono: '3512345678', dias_entrega: ['Lunes', 'Miércoles', 'Viernes'], activo: true, restaurante_id: R },
    { nombre: 'Bodega Los Toneles', rubro: 'Bebidas', telefono: '3519876543', dias_entrega: ['Martes', 'Jueves'], activo: true, restaurante_id: R },
    { nombre: 'Panadería El Trigal', rubro: 'Panadería', telefono: '3513456789', dias_entrega: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'], activo: true, restaurante_id: R },
    { nombre: 'Higiene Total', rubro: 'Limpieza', telefono: '3518765432', dias_entrega: ['Miércoles'], activo: true, restaurante_id: R },
    { nombre: 'Descartables Córdoba', rubro: 'Descartables', telefono: '3515432198', dias_entrega: ['Lunes', 'Jueves'], activo: true, restaurante_id: R },
  ]

  const { data: proveedores, error: provErr } = await supabase
    .from('proveedores').insert(proveedoresData).select('id, nombre')
  if (provErr) { console.error('Error proveedores:', provErr.message); return }
  console.log(`  ✅ ${proveedores.length} proveedores creados`)

  const provMap = {}
  for (const p of proveedores) provMap[p.nombre] = p.id

  // ═══════════════════════════════════════════════════════════
  // 2. PRODUCTOS EN STOCK
  // ═══════════════════════════════════════════════════════════
  console.log('📋 Creando productos en stock...')
  const productosData = [
    // CARNES — Carnes del Sur SRL
    { nombre: 'Lomo Vetado', unidad: 'kg', stock_actual: 12, stock_minimo: 5, stock_critico: 2, categoria: 'Carnes', proveedor_id: provMap['Carnes del Sur SRL'], precio_unitario: 18500, activo: true, restaurante_id: R },
    { nombre: 'Entraña', unidad: 'kg', stock_actual: 8, stock_minimo: 4, stock_critico: 2, categoria: 'Carnes', proveedor_id: provMap['Carnes del Sur SRL'], precio_unitario: 16800, activo: true, restaurante_id: R },
    { nombre: 'Bife de Chorizo', unidad: 'kg', stock_actual: 15, stock_minimo: 6, stock_critico: 3, categoria: 'Carnes', proveedor_id: provMap['Carnes del Sur SRL'], precio_unitario: 17200, activo: true, restaurante_id: R },
    { nombre: 'Chorizo Parrillero', unidad: 'kg', stock_actual: 6, stock_minimo: 3, stock_critico: 1, categoria: 'Carnes', proveedor_id: provMap['Carnes del Sur SRL'], precio_unitario: 8900, activo: true, restaurante_id: R },
    { nombre: 'Morcilla', unidad: 'kg', stock_actual: 4, stock_minimo: 2, stock_critico: 1, categoria: 'Carnes', proveedor_id: provMap['Carnes del Sur SRL'], precio_unitario: 7200, activo: true, restaurante_id: R },
    { nombre: 'Vacío', unidad: 'kg', stock_actual: 10, stock_minimo: 4, stock_critico: 2, categoria: 'Carnes', proveedor_id: provMap['Carnes del Sur SRL'], precio_unitario: 14500, activo: true, restaurante_id: R },
    { nombre: 'Carne Picada Especial', unidad: 'kg', stock_actual: 8, stock_minimo: 3, stock_critico: 1, categoria: 'Carnes', proveedor_id: provMap['Carnes del Sur SRL'], precio_unitario: 9800, activo: true, restaurante_id: R },
    { nombre: 'Pollo Entero', unidad: 'kg', stock_actual: 6, stock_minimo: 3, stock_critico: 1, categoria: 'Carnes', proveedor_id: provMap['Carnes del Sur SRL'], precio_unitario: 5400, activo: true, restaurante_id: R },

    // VERDURAS — La Huerta Cordobesa
    { nombre: 'Tomate Redondo', unidad: 'kg', stock_actual: 10, stock_minimo: 5, stock_critico: 2, categoria: 'Verduras', proveedor_id: provMap['La Huerta Cordobesa'], precio_unitario: 3200, activo: true, restaurante_id: R },
    { nombre: 'Cebolla', unidad: 'kg', stock_actual: 15, stock_minimo: 5, stock_critico: 2, categoria: 'Verduras', proveedor_id: provMap['La Huerta Cordobesa'], precio_unitario: 2100, activo: true, restaurante_id: R },
    { nombre: 'Papa', unidad: 'kg', stock_actual: 20, stock_minimo: 8, stock_critico: 3, categoria: 'Verduras', proveedor_id: provMap['La Huerta Cordobesa'], precio_unitario: 2400, activo: true, restaurante_id: R },
    { nombre: 'Lechuga Mantecosa', unidad: 'u', stock_actual: 12, stock_minimo: 6, stock_critico: 3, categoria: 'Verduras', proveedor_id: provMap['La Huerta Cordobesa'], precio_unitario: 1800, activo: true, restaurante_id: R },
    { nombre: 'Morrón Rojo', unidad: 'kg', stock_actual: 5, stock_minimo: 3, stock_critico: 1, categoria: 'Verduras', proveedor_id: provMap['La Huerta Cordobesa'], precio_unitario: 5500, activo: true, restaurante_id: R },
    { nombre: 'Limón', unidad: 'kg', stock_actual: 6, stock_minimo: 3, stock_critico: 1, categoria: 'Verduras', proveedor_id: provMap['La Huerta Cordobesa'], precio_unitario: 3800, activo: true, restaurante_id: R },
    { nombre: 'Perejil', unidad: 'u', stock_actual: 8, stock_minimo: 4, stock_critico: 2, categoria: 'Verduras', proveedor_id: provMap['La Huerta Cordobesa'], precio_unitario: 1200, activo: true, restaurante_id: R },
    { nombre: 'Ajo', unidad: 'kg', stock_actual: 3, stock_minimo: 1, stock_critico: 0.5, categoria: 'Verduras', proveedor_id: provMap['La Huerta Cordobesa'], precio_unitario: 8500, activo: true, restaurante_id: R },
    { nombre: 'Rúcula', unidad: 'u', stock_actual: 6, stock_minimo: 3, stock_critico: 1, categoria: 'Verduras', proveedor_id: provMap['La Huerta Cordobesa'], precio_unitario: 2200, activo: true, restaurante_id: R },
    { nombre: 'Palta', unidad: 'u', stock_actual: 10, stock_minimo: 5, stock_critico: 2, categoria: 'Verduras', proveedor_id: provMap['La Huerta Cordobesa'], precio_unitario: 3500, activo: true, restaurante_id: R },

    // SECOS — Distribuidora Don Mario
    { nombre: 'Harina 000', unidad: 'kg', stock_actual: 25, stock_minimo: 10, stock_critico: 5, categoria: 'Secos', proveedor_id: provMap['Distribuidora Don Mario'], precio_unitario: 1800, activo: true, restaurante_id: R },
    { nombre: 'Aceite de Oliva', unidad: 'l', stock_actual: 8, stock_minimo: 3, stock_critico: 1, categoria: 'Secos', proveedor_id: provMap['Distribuidora Don Mario'], precio_unitario: 9500, activo: true, restaurante_id: R },
    { nombre: 'Aceite Girasol', unidad: 'l', stock_actual: 15, stock_minimo: 5, stock_critico: 2, categoria: 'Secos', proveedor_id: provMap['Distribuidora Don Mario'], precio_unitario: 4200, activo: true, restaurante_id: R },
    { nombre: 'Sal Fina', unidad: 'kg', stock_actual: 10, stock_minimo: 3, stock_critico: 1, categoria: 'Secos', proveedor_id: provMap['Distribuidora Don Mario'], precio_unitario: 900, activo: true, restaurante_id: R },
    { nombre: 'Pimienta Negra', unidad: 'kg', stock_actual: 2, stock_minimo: 0.5, stock_critico: 0.2, categoria: 'Secos', proveedor_id: provMap['Distribuidora Don Mario'], precio_unitario: 22000, activo: true, restaurante_id: R },
    { nombre: 'Orégano', unidad: 'kg', stock_actual: 1.5, stock_minimo: 0.5, stock_critico: 0.2, categoria: 'Secos', proveedor_id: provMap['Distribuidora Don Mario'], precio_unitario: 15000, activo: true, restaurante_id: R },
    { nombre: 'Pimentón Dulce', unidad: 'kg', stock_actual: 1, stock_minimo: 0.3, stock_critico: 0.1, categoria: 'Secos', proveedor_id: provMap['Distribuidora Don Mario'], precio_unitario: 18000, activo: true, restaurante_id: R },
    { nombre: 'Vinagre de Vino', unidad: 'l', stock_actual: 5, stock_minimo: 2, stock_critico: 1, categoria: 'Secos', proveedor_id: provMap['Distribuidora Don Mario'], precio_unitario: 3500, activo: true, restaurante_id: R },
    { nombre: 'Azúcar', unidad: 'kg', stock_actual: 10, stock_minimo: 3, stock_critico: 1, categoria: 'Secos', proveedor_id: provMap['Distribuidora Don Mario'], precio_unitario: 2200, activo: true, restaurante_id: R },
    { nombre: 'Chocolate Cobertura', unidad: 'kg', stock_actual: 3, stock_minimo: 1, stock_critico: 0.5, categoria: 'Secos', proveedor_id: provMap['Distribuidora Don Mario'], precio_unitario: 14000, activo: true, restaurante_id: R },
    { nombre: 'Dulce de Leche', unidad: 'kg', stock_actual: 4, stock_minimo: 2, stock_critico: 1, categoria: 'Secos', proveedor_id: provMap['Distribuidora Don Mario'], precio_unitario: 7500, activo: true, restaurante_id: R },

    // LÁCTEOS — Lácteos La Serranita
    { nombre: 'Crema de Leche', unidad: 'l', stock_actual: 6, stock_minimo: 3, stock_critico: 1, categoria: 'Lácteos', proveedor_id: provMap['Lácteos La Serranita'], precio_unitario: 5800, activo: true, restaurante_id: R },
    { nombre: 'Queso Provolone', unidad: 'kg', stock_actual: 4, stock_minimo: 2, stock_critico: 1, categoria: 'Lácteos', proveedor_id: provMap['Lácteos La Serranita'], precio_unitario: 14500, activo: true, restaurante_id: R },
    { nombre: 'Manteca', unidad: 'kg', stock_actual: 5, stock_minimo: 2, stock_critico: 1, categoria: 'Lácteos', proveedor_id: provMap['Lácteos La Serranita'], precio_unitario: 9200, activo: true, restaurante_id: R },
    { nombre: 'Queso Parmesano', unidad: 'kg', stock_actual: 2, stock_minimo: 1, stock_critico: 0.5, categoria: 'Lácteos', proveedor_id: provMap['Lácteos La Serranita'], precio_unitario: 19500, activo: true, restaurante_id: R },
    { nombre: 'Leche Entera', unidad: 'l', stock_actual: 10, stock_minimo: 5, stock_critico: 2, categoria: 'Lácteos', proveedor_id: provMap['Lácteos La Serranita'], precio_unitario: 1800, activo: true, restaurante_id: R },
    { nombre: 'Huevos', unidad: 'u', stock_actual: 60, stock_minimo: 30, stock_critico: 12, categoria: 'Lácteos', proveedor_id: provMap['Lácteos La Serranita'], precio_unitario: 250, activo: true, restaurante_id: R },
    { nombre: 'Queso Azul', unidad: 'kg', stock_actual: 1.5, stock_minimo: 0.5, stock_critico: 0.2, categoria: 'Lácteos', proveedor_id: provMap['Lácteos La Serranita'], precio_unitario: 18000, activo: true, restaurante_id: R },

    // BEBIDAS — Bodega Los Toneles
    { nombre: 'Vino Malbec (Reserva)', unidad: 'u', stock_actual: 24, stock_minimo: 12, stock_critico: 6, categoria: 'Bebidas', proveedor_id: provMap['Bodega Los Toneles'], precio_unitario: 8500, activo: true, restaurante_id: R },
    { nombre: 'Vino Torrontés', unidad: 'u', stock_actual: 12, stock_minimo: 6, stock_critico: 3, categoria: 'Bebidas', proveedor_id: provMap['Bodega Los Toneles'], precio_unitario: 7200, activo: true, restaurante_id: R },
    { nombre: 'Agua Mineral s/gas', unidad: 'u', stock_actual: 48, stock_minimo: 24, stock_critico: 12, categoria: 'Bebidas', proveedor_id: provMap['Bodega Los Toneles'], precio_unitario: 1800, activo: true, restaurante_id: R },
    { nombre: 'Gaseosa Cola 1.5L', unidad: 'u', stock_actual: 20, stock_minimo: 10, stock_critico: 5, categoria: 'Bebidas', proveedor_id: provMap['Bodega Los Toneles'], precio_unitario: 3200, activo: true, restaurante_id: R },

    // PANADERÍA — Panadería El Trigal
    { nombre: 'Pan de Campo', unidad: 'u', stock_actual: 15, stock_minimo: 8, stock_critico: 4, categoria: 'Secos', proveedor_id: provMap['Panadería El Trigal'], precio_unitario: 2800, activo: true, restaurante_id: R },
    { nombre: 'Tapas de Empanada', unidad: 'paq', stock_actual: 8, stock_minimo: 4, stock_critico: 2, categoria: 'Secos', proveedor_id: provMap['Panadería El Trigal'], precio_unitario: 4500, activo: true, restaurante_id: R },

    // LIMPIEZA — Higiene Total
    { nombre: 'Detergente 5L', unidad: 'u', stock_actual: 3, stock_minimo: 1, stock_critico: 0, categoria: 'Limpieza', proveedor_id: provMap['Higiene Total'], precio_unitario: 8500, activo: true, restaurante_id: R },
    { nombre: 'Lavandina 5L', unidad: 'u', stock_actual: 4, stock_minimo: 2, stock_critico: 1, categoria: 'Limpieza', proveedor_id: provMap['Higiene Total'], precio_unitario: 5200, activo: true, restaurante_id: R },
    { nombre: 'Guantes Descartables x100', unidad: 'paq', stock_actual: 5, stock_minimo: 2, stock_critico: 1, categoria: 'Limpieza', proveedor_id: provMap['Higiene Total'], precio_unitario: 6800, activo: true, restaurante_id: R },
    { nombre: 'Rollo Cocina x3', unidad: 'paq', stock_actual: 6, stock_minimo: 3, stock_critico: 1, categoria: 'Limpieza', proveedor_id: provMap['Higiene Total'], precio_unitario: 4500, activo: true, restaurante_id: R },
  ]

  const { data: productos, error: prodErr } = await supabase
    .from('productos').insert(productosData).select('id, nombre')
  if (prodErr) { console.error('Error productos:', prodErr.message); return }
  console.log(`  ✅ ${productos.length} productos creados`)

  const prodMap = {}
  for (const p of productos) prodMap[p.nombre] = p.id

  // ═══════════════════════════════════════════════════════════
  // 3. FACTURAS
  // ═══════════════════════════════════════════════════════════
  console.log('🧾 Creando facturas...')

  const facturasData = [
    {
      proveedor_nombre: 'Carnes del Sur SRL', proveedor_cuit: '30-71234567-8',
      fecha_factura: twoDaysAgo, tipo_factura: 'A', numero_factura: '0001-00004521',
      subtotal: 285000, iva_total: 59850, total: 344850,
      condicion_pago: 'cuenta_corriente', status: 'confirmada', restaurante_id: R,
    },
    {
      proveedor_nombre: 'La Huerta Cordobesa', proveedor_cuit: '20-34567891-2',
      fecha_factura: yesterday, tipo_factura: 'B', numero_factura: '0003-00012847',
      subtotal: 78500, iva_total: 16485, total: 94985,
      condicion_pago: 'contado', status: 'confirmada', restaurante_id: R,
    },
    {
      proveedor_nombre: 'Lácteos La Serranita', proveedor_cuit: '30-87654321-0',
      fecha_factura: yesterday, tipo_factura: 'A', numero_factura: '0001-00008934',
      subtotal: 142000, iva_total: 29820, total: 171820,
      condicion_pago: '30dias', status: 'confirmada', restaurante_id: R,
    },
    {
      proveedor_nombre: 'Distribuidora Don Mario', proveedor_cuit: '20-45678912-3',
      fecha_factura: threeDaysAgo, tipo_factura: 'A', numero_factura: '0002-00034122',
      subtotal: 165000, iva_total: 34650, total: 199650,
      condicion_pago: 'contado', status: 'confirmada', restaurante_id: R,
    },
  ]

  const facturaItemsMap = [
    // Carnes del Sur
    [
      { producto_nombre: 'Lomo Vetado', producto_id: prodMap['Lomo Vetado'], cantidad: 10, unidad: 'kg', precio_unitario: 18500, alicuota_iva: 21, subtotal: 185000 },
      { producto_nombre: 'Entraña', producto_id: prodMap['Entraña'], cantidad: 5, unidad: 'kg', precio_unitario: 16800, alicuota_iva: 21, subtotal: 84000 },
      { producto_nombre: 'Chorizo Parrillero', producto_id: prodMap['Chorizo Parrillero'], cantidad: 2, unidad: 'kg', precio_unitario: 8900, alicuota_iva: 21, subtotal: 17800 },
    ],
    // La Huerta
    [
      { producto_nombre: 'Tomate Redondo', producto_id: prodMap['Tomate Redondo'], cantidad: 8, unidad: 'kg', precio_unitario: 3200, alicuota_iva: 10.5, subtotal: 25600 },
      { producto_nombre: 'Cebolla', producto_id: prodMap['Cebolla'], cantidad: 10, unidad: 'kg', precio_unitario: 2100, alicuota_iva: 10.5, subtotal: 21000 },
      { producto_nombre: 'Lechuga Mantecosa', producto_id: prodMap['Lechuga Mantecosa'], cantidad: 10, unidad: 'u', precio_unitario: 1800, alicuota_iva: 10.5, subtotal: 18000 },
      { producto_nombre: 'Limón', producto_id: prodMap['Limón'], cantidad: 4, unidad: 'kg', precio_unitario: 3800, alicuota_iva: 10.5, subtotal: 15200 },
    ],
    // Lácteos La Serranita
    [
      { producto_nombre: 'Crema de Leche', producto_id: prodMap['Crema de Leche'], cantidad: 6, unidad: 'l', precio_unitario: 5800, alicuota_iva: 21, subtotal: 34800 },
      { producto_nombre: 'Queso Provolone', producto_id: prodMap['Queso Provolone'], cantidad: 4, unidad: 'kg', precio_unitario: 14500, alicuota_iva: 21, subtotal: 58000 },
      { producto_nombre: 'Manteca', producto_id: prodMap['Manteca'], cantidad: 3, unidad: 'kg', precio_unitario: 9200, alicuota_iva: 21, subtotal: 27600 },
      { producto_nombre: 'Huevos', producto_id: prodMap['Huevos'], cantidad: 60, unidad: 'u', precio_unitario: 250, alicuota_iva: 21, subtotal: 15000 },
    ],
    // Distribuidora Don Mario
    [
      { producto_nombre: 'Harina 000', producto_id: prodMap['Harina 000'], cantidad: 25, unidad: 'kg', precio_unitario: 1800, alicuota_iva: 21, subtotal: 45000 },
      { producto_nombre: 'Aceite de Oliva', producto_id: prodMap['Aceite de Oliva'], cantidad: 5, unidad: 'l', precio_unitario: 9500, alicuota_iva: 21, subtotal: 47500 },
      { producto_nombre: 'Chocolate Cobertura', producto_id: prodMap['Chocolate Cobertura'], cantidad: 3, unidad: 'kg', precio_unitario: 14000, alicuota_iva: 21, subtotal: 42000 },
      { producto_nombre: 'Dulce de Leche', producto_id: prodMap['Dulce de Leche'], cantidad: 4, unidad: 'kg', precio_unitario: 7500, alicuota_iva: 21, subtotal: 30000 },
    ],
  ]

  for (let i = 0; i < facturasData.length; i++) {
    const { data: fac, error: facErr } = await supabase
      .from('facturas').insert(facturasData[i]).select('id').single()
    if (facErr) { console.error('Error factura:', facErr.message); continue }

    const items = facturaItemsMap[i].map(it => ({ ...it, factura_id: fac.id }))
    const { error: itemErr } = await supabase.from('factura_items').insert(items)
    if (itemErr) console.error('Error factura_items:', itemErr.message)
  }
  console.log(`  ✅ ${facturasData.length} facturas con items creadas`)

  // ═══════════════════════════════════════════════════════════
  // 4. RECETAS
  // ═══════════════════════════════════════════════════════════
  console.log('📖 Creando recetas...')

  const recetasRaw = [
    {
      nombre: 'Bife de Chorizo a la Parrilla',
      categoria: 'Principales',
      porciones: 1,
      tiempo_min: 25,
      precio_venta: 28000,
      procedimiento: '1. Sacar la carne de la heladera 30 min antes.\n2. Salpimentar generosamente con sal gruesa y pimienta.\n3. Colocar en parrilla a fuego fuerte, cocción 7 min por lado para punto medio.\n4. Dejar reposar 3 minutos antes de servir.\n5. Acompañar con papas al rescoldo y ensalada mixta.\n6. Terminar con una rama de romero quemado sobre la carne.',
      activa: true, status: 'published', restaurante_id: R,
      ingredientes: [
        { nombre: 'Bife de Chorizo', cantidad: 0.4, unidad: 'kg', costo_unitario: 17200, unidad_costo: 'kg' },
        { nombre: 'Papa', cantidad: 0.3, unidad: 'kg', costo_unitario: 2400, unidad_costo: 'kg' },
        { nombre: 'Sal Fina', cantidad: 0.01, unidad: 'kg', costo_unitario: 900, unidad_costo: 'kg' },
        { nombre: 'Pimienta Negra', cantidad: 0.003, unidad: 'kg', costo_unitario: 22000, unidad_costo: 'kg' },
        { nombre: 'Aceite de Oliva', cantidad: 0.02, unidad: 'l', costo_unitario: 9500, unidad_costo: 'l' },
      ],
    },
    {
      nombre: 'Entraña a la Llama',
      categoria: 'Principales',
      porciones: 1,
      tiempo_min: 20,
      precio_venta: 26000,
      procedimiento: '1. Limpiar la entraña retirando el exceso de grasa.\n2. Salpimentar con sal gruesa.\n3. Sellar sobre llama directa 4-5 min por lado.\n4. Cortar en tiras al sesgo.\n5. Servir con chimichurri casero y papas rústicas.\n6. Decorar con cebolla de verdeo grillada.',
      activa: true, status: 'published', restaurante_id: R,
      ingredientes: [
        { nombre: 'Entraña', cantidad: 0.35, unidad: 'kg', costo_unitario: 16800, unidad_costo: 'kg' },
        { nombre: 'Papa', cantidad: 0.25, unidad: 'kg', costo_unitario: 2400, unidad_costo: 'kg' },
        { nombre: 'Sal Fina', cantidad: 0.01, unidad: 'kg', costo_unitario: 900, unidad_costo: 'kg' },
        { nombre: 'Aceite de Oliva', cantidad: 0.015, unidad: 'l', costo_unitario: 9500, unidad_costo: 'l' },
      ],
    },
    {
      nombre: 'Empanadas de Carne (x6)',
      categoria: 'Entradas',
      porciones: 1,
      tiempo_min: 45,
      precio_venta: 14000,
      procedimiento: '1. Rehogar cebolla picada en grasa hasta transparente.\n2. Agregar carne picada, sal, comino, pimentón y ají molido.\n3. Cocinar 15 min, agregar huevo duro picado y aceitunas.\n4. Dejar enfriar el relleno.\n5. Rellenar tapas de empanada con 2 cucharadas de relleno.\n6. Hacer el repulgue a mano.\n7. Hornear a 220°C por 15-18 min hasta dorar.',
      activa: true, status: 'published', restaurante_id: R,
      ingredientes: [
        { nombre: 'Carne Picada Especial', cantidad: 0.3, unidad: 'kg', costo_unitario: 9800, unidad_costo: 'kg' },
        { nombre: 'Tapas de Empanada', cantidad: 0.5, unidad: 'paq', costo_unitario: 4500, unidad_costo: 'paq' },
        { nombre: 'Cebolla', cantidad: 0.15, unidad: 'kg', costo_unitario: 2100, unidad_costo: 'kg' },
        { nombre: 'Huevos', cantidad: 1, unidad: 'u', costo_unitario: 250, unidad_costo: 'u' },
        { nombre: 'Pimentón Dulce', cantidad: 0.005, unidad: 'kg', costo_unitario: 18000, unidad_costo: 'kg' },
        { nombre: 'Sal Fina', cantidad: 0.005, unidad: 'kg', costo_unitario: 900, unidad_costo: 'kg' },
      ],
    },
    {
      nombre: 'Provoleta con Tomate y Orégano',
      categoria: 'Entradas',
      porciones: 1,
      tiempo_min: 10,
      precio_venta: 12000,
      procedimiento: '1. Cortar el provolone en rodajas de 1.5 cm de grosor.\n2. Colocar en sartén de hierro aceitada.\n3. Llevar a parrilla fuerte hasta que burbujee.\n4. Cubrir con rodajas finas de tomate y orégano.\n5. Terminar con un hilo de aceite de oliva y pimienta.\n6. Servir inmediatamente en la sartén.',
      activa: true, status: 'published', restaurante_id: R,
      ingredientes: [
        { nombre: 'Queso Provolone', cantidad: 0.2, unidad: 'kg', costo_unitario: 14500, unidad_costo: 'kg' },
        { nombre: 'Tomate Redondo', cantidad: 0.1, unidad: 'kg', costo_unitario: 3200, unidad_costo: 'kg' },
        { nombre: 'Orégano', cantidad: 0.003, unidad: 'kg', costo_unitario: 15000, unidad_costo: 'kg' },
        { nombre: 'Aceite de Oliva', cantidad: 0.01, unidad: 'l', costo_unitario: 9500, unidad_costo: 'l' },
      ],
    },
    {
      nombre: 'Ensalada Caesar',
      categoria: 'Entradas',
      porciones: 1,
      tiempo_min: 15,
      precio_venta: 11000,
      procedimiento: '1. Lavar y trozar la lechuga mantecosa.\n2. Preparar dressing: mezclar yema, ajo, mostaza, aceite de oliva, limón y parmesano rallado.\n3. Cortar pan de campo en cubos y tostar con aceite y ajo (croutons).\n4. Mezclar lechuga con dressing.\n5. Servir con croutons, parmesano en láminas y pimienta negra.',
      activa: true, status: 'published', restaurante_id: R,
      ingredientes: [
        { nombre: 'Lechuga Mantecosa', cantidad: 1, unidad: 'u', costo_unitario: 1800, unidad_costo: 'u' },
        { nombre: 'Queso Parmesano', cantidad: 0.04, unidad: 'kg', costo_unitario: 19500, unidad_costo: 'kg' },
        { nombre: 'Pan de Campo', cantidad: 0.5, unidad: 'u', costo_unitario: 2800, unidad_costo: 'u' },
        { nombre: 'Aceite de Oliva', cantidad: 0.03, unidad: 'l', costo_unitario: 9500, unidad_costo: 'l' },
        { nombre: 'Limón', cantidad: 0.05, unidad: 'kg', costo_unitario: 3800, unidad_costo: 'kg' },
        { nombre: 'Huevos', cantidad: 1, unidad: 'u', costo_unitario: 250, unidad_costo: 'u' },
        { nombre: 'Ajo', cantidad: 0.005, unidad: 'kg', costo_unitario: 8500, unidad_costo: 'kg' },
      ],
    },
    {
      nombre: 'Tabla de Fiambres y Quesos',
      categoria: 'Entradas',
      porciones: 2,
      tiempo_min: 10,
      precio_venta: 18000,
      procedimiento: '1. Seleccionar variedad de quesos: provolone, azul, parmesano.\n2. Cortar en porciones y cubos variados.\n3. Armar la tabla con frutos secos, aceitunas y tomates cherry.\n4. Agregar pan de campo tostado cortado en triángulos.\n5. Completar con un cuenco de aceite de oliva con orégano.\n6. Decorar con hojas de rúcula fresca.',
      activa: true, status: 'published', restaurante_id: R,
      ingredientes: [
        { nombre: 'Queso Provolone', cantidad: 0.15, unidad: 'kg', costo_unitario: 14500, unidad_costo: 'kg' },
        { nombre: 'Queso Azul', cantidad: 0.1, unidad: 'kg', costo_unitario: 18000, unidad_costo: 'kg' },
        { nombre: 'Queso Parmesano', cantidad: 0.08, unidad: 'kg', costo_unitario: 19500, unidad_costo: 'kg' },
        { nombre: 'Pan de Campo', cantidad: 1, unidad: 'u', costo_unitario: 2800, unidad_costo: 'u' },
        { nombre: 'Rúcula', cantidad: 0.5, unidad: 'u', costo_unitario: 2200, unidad_costo: 'u' },
        { nombre: 'Aceite de Oliva', cantidad: 0.03, unidad: 'l', costo_unitario: 9500, unidad_costo: 'l' },
      ],
    },
    {
      nombre: 'Flan Casero con Dulce de Leche',
      categoria: 'Postres',
      porciones: 8,
      tiempo_min: 60,
      precio_venta: 9000,
      procedimiento: '1. Preparar caramelo: derretir azúcar con unas gotas de limón.\n2. Volcar en flanera y rotar para cubrir el fondo.\n3. Batir huevos con azúcar y esencia de vainilla.\n4. Agregar leche tibia en hilo mientras se mezcla.\n5. Colar la mezcla y verter en la flanera.\n6. Cocinar a baño maría en horno a 160°C por 50 min.\n7. Dejar enfriar y desmoldar.\n8. Servir con dulce de leche y crema batida.',
      activa: true, status: 'published', restaurante_id: R,
      ingredientes: [
        { nombre: 'Huevos', cantidad: 8, unidad: 'u', costo_unitario: 250, unidad_costo: 'u' },
        { nombre: 'Leche Entera', cantidad: 1, unidad: 'l', costo_unitario: 1800, unidad_costo: 'l' },
        { nombre: 'Azúcar', cantidad: 0.3, unidad: 'kg', costo_unitario: 2200, unidad_costo: 'kg' },
        { nombre: 'Dulce de Leche', cantidad: 0.3, unidad: 'kg', costo_unitario: 7500, unidad_costo: 'kg' },
        { nombre: 'Crema de Leche', cantidad: 0.2, unidad: 'l', costo_unitario: 5800, unidad_costo: 'l' },
      ],
    },
    {
      nombre: 'Volcán de Chocolate',
      categoria: 'Postres',
      porciones: 4,
      tiempo_min: 30,
      precio_venta: 10000,
      procedimiento: '1. Fundir chocolate cobertura con manteca a baño maría.\n2. Batir huevos con azúcar hasta punto letra.\n3. Incorporar el chocolate fundido a la mezcla de huevos.\n4. Agregar harina tamizada con movimientos envolventes.\n5. Volcar en moldes individuales enmantecados y enharinados.\n6. Hornear a 200°C por 12-14 min (centro debe estar líquido).\n7. Desmoldar inmediatamente y servir con helado de crema.',
      activa: true, status: 'published', restaurante_id: R,
      ingredientes: [
        { nombre: 'Chocolate Cobertura', cantidad: 0.2, unidad: 'kg', costo_unitario: 14000, unidad_costo: 'kg' },
        { nombre: 'Manteca', cantidad: 0.1, unidad: 'kg', costo_unitario: 9200, unidad_costo: 'kg' },
        { nombre: 'Huevos', cantidad: 4, unidad: 'u', costo_unitario: 250, unidad_costo: 'u' },
        { nombre: 'Azúcar', cantidad: 0.08, unidad: 'kg', costo_unitario: 2200, unidad_costo: 'kg' },
        { nombre: 'Harina 000', cantidad: 0.06, unidad: 'kg', costo_unitario: 1800, unidad_costo: 'kg' },
      ],
    },
    {
      nombre: 'Salsa Criolla',
      categoria: 'Bases',
      porciones: 12,
      tiempo_min: 15,
      precio_venta: 0,
      procedimiento: '1. Cortar tomate, cebolla y morrón en brunoise fino.\n2. Picar perejil fresco.\n3. Mezclar todo en un bowl.\n4. Agregar aceite de oliva, vinagre de vino, sal y pimienta.\n5. Dejar marinar al menos 30 min en heladera.\n6. Servir a temperatura ambiente como acompañamiento de carnes.',
      activa: true, status: 'published', restaurante_id: R,
      ingredientes: [
        { nombre: 'Tomate Redondo', cantidad: 0.5, unidad: 'kg', costo_unitario: 3200, unidad_costo: 'kg' },
        { nombre: 'Cebolla', cantidad: 0.3, unidad: 'kg', costo_unitario: 2100, unidad_costo: 'kg' },
        { nombre: 'Morrón Rojo', cantidad: 0.2, unidad: 'kg', costo_unitario: 5500, unidad_costo: 'kg' },
        { nombre: 'Perejil', cantidad: 1, unidad: 'u', costo_unitario: 1200, unidad_costo: 'u' },
        { nombre: 'Aceite de Oliva', cantidad: 0.1, unidad: 'l', costo_unitario: 9500, unidad_costo: 'l' },
        { nombre: 'Vinagre de Vino', cantidad: 0.05, unidad: 'l', costo_unitario: 3500, unidad_costo: 'l' },
        { nombre: 'Sal Fina', cantidad: 0.01, unidad: 'kg', costo_unitario: 900, unidad_costo: 'kg' },
      ],
    },
    {
      nombre: 'Chimichurri',
      categoria: 'Bases',
      porciones: 8,
      tiempo_min: 10,
      precio_venta: 0,
      procedimiento: '1. Picar perejil bien fino.\n2. Picar ajo en brunoise.\n3. Mezclar perejil y ajo en un frasco.\n4. Agregar orégano, ají molido, sal.\n5. Cubrir con aceite de oliva y vinagre de vino.\n6. Mezclar bien y dejar reposar mínimo 2 horas.\n7. Conservar en heladera hasta 5 días.',
      activa: true, status: 'published', restaurante_id: R,
      ingredientes: [
        { nombre: 'Perejil', cantidad: 2, unidad: 'u', costo_unitario: 1200, unidad_costo: 'u' },
        { nombre: 'Ajo', cantidad: 0.03, unidad: 'kg', costo_unitario: 8500, unidad_costo: 'kg' },
        { nombre: 'Orégano', cantidad: 0.01, unidad: 'kg', costo_unitario: 15000, unidad_costo: 'kg' },
        { nombre: 'Aceite de Oliva', cantidad: 0.15, unidad: 'l', costo_unitario: 9500, unidad_costo: 'l' },
        { nombre: 'Vinagre de Vino', cantidad: 0.05, unidad: 'l', costo_unitario: 3500, unidad_costo: 'l' },
        { nombre: 'Sal Fina', cantidad: 0.005, unidad: 'kg', costo_unitario: 900, unidad_costo: 'kg' },
      ],
    },
  ]

  const recetaMap = {}
  for (const r of recetasRaw) {
    const { ingredientes, ...recetaData } = r
    const { data: rec, error: recErr } = await supabase
      .from('recetas').insert(recetaData).select('id').single()
    if (recErr) { console.error('Error receta:', r.nombre, recErr.message); continue }
    recetaMap[r.nombre] = rec.id

    const ingData = ingredientes.map(ing => ({ ...ing, receta_id: rec.id }))
    const { error: ingErr } = await supabase.from('ingredientes').insert(ingData)
    if (ingErr) console.error('Error ingredientes:', ingErr.message)
  }
  console.log(`  ✅ ${Object.keys(recetaMap).length} recetas con ingredientes creadas`)

  // ═══════════════════════════════════════════════════════════
  // 5. CARTA
  // ═══════════════════════════════════════════════════════════
  console.log('🍽️  Creando carta...')

  const cartaData = [
    // Entradas
    { nombre: 'Empanadas de Carne (x6)', descripcion: 'Empanadas cortadas a cuchillo con masa casera, horneadas al horno de barro. Relleno jugoso con huevo y aceituna.', precio_venta: 14000, categoria: 'Entradas', receta_id: recetaMap['Empanadas de Carne (x6)'], disponible: true, orden: 0, restaurante_id: R },
    { nombre: 'Provoleta a la Parrilla', descripcion: 'Provolone fundido sobre sartén de hierro con tomate fresco, orégano y aceite de oliva virgen.', precio_venta: 12000, categoria: 'Entradas', receta_id: recetaMap['Provoleta con Tomate y Orégano'], disponible: true, orden: 1, restaurante_id: R },
    { nombre: 'Ensalada Caesar', descripcion: 'Lechuga mantecosa, croutons de pan de campo, parmesano en láminas y dressing clásico con ajo asado.', precio_venta: 11000, categoria: 'Entradas', receta_id: recetaMap['Ensalada Caesar'], disponible: true, orden: 2, restaurante_id: R },
    { nombre: 'Tabla de Quesos Artesanales', descripcion: 'Selección de quesos argentinos: provolone, azul y parmesano. Con pan de campo tostado, rúcula y aceite de oliva.', precio_venta: 18000, categoria: 'Entradas', receta_id: recetaMap['Tabla de Fiambres y Quesos'], disponible: true, orden: 3, restaurante_id: R },

    // Principales
    { nombre: 'Bife de Chorizo a la Parrilla', descripcion: 'Corte premium de 400g cocido sobre brasas de quebracho. Con papas al rescoldo y ensalada de estación.', precio_venta: 28000, categoria: 'Principales', receta_id: recetaMap['Bife de Chorizo a la Parrilla'], disponible: true, orden: 0, restaurante_id: R },
    { nombre: 'Entraña a la Llama', descripcion: 'Entraña sellada sobre llama directa, cortada al sesgo. Acompañada de chimichurri casero y papas rústicas.', precio_venta: 26000, categoria: 'Principales', receta_id: recetaMap['Entraña a la Llama'], disponible: true, orden: 1, restaurante_id: R },
    { nombre: 'Vacío al Asador', descripcion: 'Vacío cocinado lentamente en asador de hierro por 3 horas. Punto justo, con salsa criolla de la casa.', precio_venta: 24000, categoria: 'Principales', receta_id: null, disponible: true, orden: 2, restaurante_id: R },
    { nombre: 'Parrillada para Dos', descripcion: 'Selección de cortes: bife, entraña, chorizo y morcilla. Con ensalada mixta, papas y salsas de la casa.', precio_venta: 45000, categoria: 'Principales', receta_id: null, disponible: true, orden: 3, restaurante_id: R },

    // Postres
    { nombre: 'Flan Casero', descripcion: 'Flan de huevos de campo con caramelo, dulce de leche artesanal y crema batida.', precio_venta: 9000, categoria: 'Postres', receta_id: recetaMap['Flan Casero con Dulce de Leche'], disponible: true, orden: 0, restaurante_id: R },
    { nombre: 'Volcán de Chocolate', descripcion: 'Bizcochuelo tibio de chocolate amargo con corazón líquido. Servido con helado de crema americana.', precio_venta: 10000, categoria: 'Postres', receta_id: recetaMap['Volcán de Chocolate'], disponible: false, orden: 1, restaurante_id: R },

    // Bebidas
    { nombre: 'Vino Malbec Reserva', descripcion: 'Copa de Malbec reserva de Bodega Los Toneles. Notas de frutos rojos y roble.', precio_venta: 8500, categoria: 'Bebidas', receta_id: null, disponible: true, orden: 0, restaurante_id: R },
    { nombre: 'Agua Mineral', descripcion: 'Agua mineral sin gas, 500ml.', precio_venta: 3500, categoria: 'Bebidas', receta_id: null, disponible: true, orden: 1, restaurante_id: R },
  ]

  const { data: cartaItems, error: cartaErr } = await supabase
    .from('carta_items').insert(cartaData).select('id')
  if (cartaErr) console.error('Error carta:', cartaErr.message)
  else console.log(`  ✅ ${cartaItems.length} platos en la carta`)

  // ═══════════════════════════════════════════════════════════
  // 6. TAREAS
  // ═══════════════════════════════════════════════════════════
  console.log('📝 Creando tareas...')

  const tareasData = [
    {
      titulo: 'Producir Salsa Criolla x12 porciones',
      descripcion: 'Preparar salsa criolla para el servicio de la noche. Alcanza para 12 platos.',
      plaza: 'frios', prioridad: 'alta', status: 'pendiente', categoria: 'produccion',
      receta_id: recetaMap['Salsa Criolla'], tiempo_estimado_min: 20,
      fecha_limite: today,
      checklist: JSON.stringify([
        { texto: 'Cortar tomate en brunoise', completado: false },
        { texto: 'Cortar cebolla en brunoise', completado: false },
        { texto: 'Picar morrón', completado: false },
        { texto: 'Mezclar con aliño', completado: false },
        { texto: 'Refrigerar mínimo 30 min', completado: false },
      ]),
      restaurante_id: R,
    },
    {
      titulo: 'Producir Chimichurri x8 porciones',
      descripcion: 'Preparar chimichurri fresco para el servicio. Usar perejil del día.',
      plaza: 'frios', prioridad: 'alta', status: 'pendiente', categoria: 'produccion',
      receta_id: recetaMap['Chimichurri'], tiempo_estimado_min: 15,
      fecha_limite: today,
      checklist: JSON.stringify([
        { texto: 'Picar perejil bien fino', completado: false },
        { texto: 'Picar ajo', completado: false },
        { texto: 'Mezclar con aceite, vinagre y especias', completado: false },
        { texto: 'Dejar reposar 2 horas', completado: false },
      ]),
      restaurante_id: R,
    },
    {
      titulo: 'Mise en place parrilla',
      descripcion: 'Preparar todos los cortes para el servicio de la noche. Verificar stock de carbón.',
      plaza: 'parrilla', prioridad: 'alta', status: 'en_proceso', categoria: 'plaza',
      tiempo_estimado_min: 45, fecha_limite: today,
      checklist: JSON.stringify([
        { texto: 'Sacar cortes de cámara', completado: true },
        { texto: 'Atemperar bifes y entrañas', completado: true },
        { texto: 'Verificar stock de carbón y leña', completado: false },
        { texto: 'Limpiar parrilla', completado: false },
        { texto: 'Encender fuego 1 hora antes del servicio', completado: false },
      ]),
      restaurante_id: R,
    },
    {
      titulo: 'Cortar verduras para ensaladas',
      descripcion: 'Preparar mise en place de vegetales: lechugas lavadas, tomates, cebollas.',
      plaza: 'frios', prioridad: 'media', status: 'pendiente', categoria: 'produccion',
      tiempo_estimado_min: 30, fecha_limite: today,
      checklist: JSON.stringify([
        { texto: 'Lavar y cortar lechugas', completado: false },
        { texto: 'Cortar tomates en gajos', completado: false },
        { texto: 'Laminar cebolla morada', completado: false },
        { texto: 'Preparar croutons de pan', completado: false },
        { texto: 'Rallar parmesano', completado: false },
      ]),
      restaurante_id: R,
    },
    {
      titulo: 'Preparar base de flan x8',
      descripcion: 'Hornear flan para tener stock de postre para 2 días.',
      plaza: 'pasteleria', prioridad: 'media', status: 'pendiente', categoria: 'produccion',
      receta_id: recetaMap['Flan Casero con Dulce de Leche'], tiempo_estimado_min: 60,
      fecha_limite: today,
      checklist: JSON.stringify([
        { texto: 'Preparar caramelo', completado: false },
        { texto: 'Batir huevos con azúcar', completado: false },
        { texto: 'Incorporar leche', completado: false },
        { texto: 'Hornear a baño maría 50 min', completado: false },
        { texto: 'Dejar enfriar y refrigerar', completado: false },
      ]),
      restaurante_id: R,
    },
  ]

  const { data: tareas, error: tarErr } = await supabase.from('tareas').insert(tareasData).select('id')
  if (tarErr) console.error('Error tareas:', tarErr.message)
  else console.log(`  ✅ ${tareas.length} tareas creadas`)

  // ═══════════════════════════════════════════════════════════
  // 7. PASE DE TURNO
  // ═══════════════════════════════════════════════════════════
  console.log('💬 Creando mensajes del pase...')

  const paseData = [
    {
      texto: 'Quedan 3 lomos en cámara. Pedir mañana a Carnes del Sur sin falta.',
      usuario_nombre: 'Marcos (Parrillero)',
      tipo: 'alerta', prioridad: 'importante',
      turno_fecha: today, turno_tipo: 'almuerzo',
      plaza: 'parrilla', leido_por: '[]', restaurante_id: R,
    },
    {
      texto: '86 — Volcán de chocolate. Se terminó el chocolate cobertura, recién pedimos pero llega el viernes.',
      usuario_nombre: 'Lucía (Pastelera)',
      tipo: 'alerta', prioridad: 'urgente',
      turno_fecha: today, turno_tipo: 'almuerzo',
      plaza: 'pasteleria', leido_por: '[]', restaurante_id: R,
    },
    {
      texto: 'La cámara 2 está haciendo ruido raro. Avisar a mantenimiento mañana primera hora. Los lácteos los pasé a la cámara 1 por las dudas.',
      usuario_nombre: 'Diego (Sous Chef)',
      tipo: 'texto', prioridad: 'importante',
      turno_fecha: today, turno_tipo: 'almuerzo',
      plaza: null, leido_por: '[]', restaurante_id: R,
    },
    {
      texto: 'Hoy viene grupo de 12 personas a las 21:30, reserva confirmada. Preparar mesa larga del fondo y tener stock de parrillada para 6.',
      usuario_nombre: 'Facundo (Chef)',
      tipo: 'texto', prioridad: 'importante',
      turno_fecha: today, turno_tipo: 'cena',
      plaza: null, leido_por: '[]', restaurante_id: R,
    },
  ]

  const { data: pase, error: paseErr } = await supabase.from('pase_mensajes').insert(paseData).select('id')
  if (paseErr) console.error('Error pase:', paseErr.message)
  else console.log(`  ✅ ${pase.length} mensajes de pase creados`)

  // ═══════════════════════════════════════════════════════════
  // RESUMEN
  // ═══════════════════════════════════════════════════════════
  console.log('\n🎉 Seed completo!')
  console.log('──────────────────────────────────')
  console.log(`  Proveedores:  ${proveedores.length}`)
  console.log(`  Productos:    ${productos.length}`)
  console.log(`  Facturas:     ${facturasData.length}`)
  console.log(`  Recetas:      ${Object.keys(recetaMap).length}`)
  console.log(`  Carta:        ${cartaItems?.length ?? 0}`)
  console.log(`  Tareas:       ${tareas?.length ?? 0}`)
  console.log(`  Pase:         ${pase?.length ?? 0}`)
  console.log('──────────────────────────────────')
}

main().catch(console.error)
