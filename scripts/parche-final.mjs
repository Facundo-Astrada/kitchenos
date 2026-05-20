import { createClient } from '@supabase/supabase-js'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient('https://clipcxcbtlibswfzsgzk.supabase.co', KEY)
const RID = 'e65cf95a-2c32-4244-b325-2379be5b3a6e'

// 1. Crear producto "Hielo" en stock (no existe)
const { data: existingHielo } = await supabase
  .from('productos').select('id').eq('restaurante_id', RID).ilike('nombre', 'Hielo').maybeSingle()

let hieloId
if (existingHielo) {
  hieloId = existingHielo.id
  console.log('Hielo ya existe:', hieloId)
} else {
  const { data: nuevo, error } = await supabase.from('productos').insert({
    nombre: 'Hielo', unidad: 'kg', stock_actual: 0, stock_minimo: 0, stock_critico: 0,
    categoria: 'Otros', precio_unitario: 980.76, restaurante_id: RID, activo: true,
  }).select('id').single()
  if (error) { console.error('Error creando Hielo:', error.message); process.exit(1) }
  hieloId = nuevo.id
  console.log('✓ Producto Hielo creado:', hieloId)
}

// 2. Vincular "Hielo" ingredient con producto Hielo
const { data: hieloIng } = await supabase
  .from('ingredientes').select('id, receta_id')
  .ilike('nombre', 'Hielo')
  .is('producto_id', null)

for (const ing of hieloIng) {
  // Check receta_id pertenece a Bros
  const { data: r } = await supabase.from('recetas').select('restaurante_id').eq('id', ing.receta_id).single()
  if (r?.restaurante_id !== RID) continue
  await supabase.from('ingredientes').update({
    producto_id: hieloId, costo_unitario: 980.76, unidad_costo: 'kg',
  }).eq('id', ing.id)
  console.log('  ✓ ingrediente Hielo vinculado:', ing.id)
}

// 3. Vincular "Pulpa de dátil" con "Datiles"
const { data: datilesProd } = await supabase
  .from('productos').select('id, precio_unitario, unidad')
  .eq('restaurante_id', RID).ilike('nombre', 'Datiles').maybeSingle()

if (datilesProd) {
  const { data: pulpaIng } = await supabase
    .from('ingredientes').select('id, receta_id')
    .ilike('nombre', 'Pulpa de dátil')
    .is('producto_id', null)

  for (const ing of pulpaIng) {
    const { data: r } = await supabase.from('recetas').select('restaurante_id').eq('id', ing.receta_id).single()
    if (r?.restaurante_id !== RID) continue
    await supabase.from('ingredientes').update({
      producto_id: datilesProd.id, costo_unitario: datilesProd.precio_unitario, unidad_costo: datilesProd.unidad,
    }).eq('id', ing.id)
    console.log('  ✓ Pulpa de dátil → Datiles ($' + datilesProd.precio_unitario + ')')
  }
}

// 4. Resumen final
const RECETA_NOMBRES = ['Chutney Datil','Croqueta de Chorizo Colorado','Fondo Umami','Manteca de miso','Mascarpone','Mayonesa de huevo pasteurizado','Pimientos en escabeche','Sarraceno Pop','Chimi cremoso','Cremoso chocolate','Fondo de ternera']
const { data: recetas } = await supabase
  .from('recetas')
  .select('id, nombre, ingredientes:ingredientes!ingredientes_receta_id_fkey(id, producto_id, nombre)')
  .eq('restaurante_id', RID)
  .in('nombre', RECETA_NOMBRES)

let totalIngs = 0, vinc = 0
for (const r of recetas) {
  const v = r.ingredientes.filter(i => i.producto_id).length
  totalIngs += r.ingredientes.length
  vinc += v
}
console.log(`\n📊 Resumen final 11 recetas 2026: ${vinc}/${totalIngs} ingredientes vinculados (${Math.round(vinc * 100 / totalIngs)}%)`)
