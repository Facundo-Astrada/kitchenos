import { createClient } from '@supabase/supabase-js'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient('https://clipcxcbtlibswfzsgzk.supabase.co', KEY)
const RID = 'e65cf95a-2c32-4244-b325-2379be5b3a6e'

// Mapeo manual: nombre_ingrediente_normalizado -> nombre_producto_busqueda
const MAPEO = {
  'cebolla asada': 'Cebolla morada',
  'oliva': 'Box 5 L Zuelo',
  'aceite verde': 'Aceite barbieri',
  'aceite de oliva': 'Box 5 L Zuelo',
  'vinagre blanco': 'Vinagre de alcohol',
  'cebolla desh': 'Cebolla en escamas',
  'chocolate 65%': 'Chocolate negro',
  'crema 44%': 'Crema tacho',
  'crema de leche': 'Crema tacho',
  'bocado/corte economico con hueso': 'Bondiola navidad',
  'concentrado de tomates': 'Polvo de tomate',
  'pimientos rojos': 'Pimiento rojo',
  'hongos secos': 'Girgolas',
  'burrito': 'Tomillo',
  'pulpa de dátil': 'Datiles',
  'hielo': 'Hielo',
  'licor de nispero': 'Licor de mistol',
  'agua fria': null, // sin costo
  'agua': null,
}

function norm(s) {
  return s.toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ')
}

// 1. Cargar productos
const { data: productos } = await supabase
  .from('productos')
  .select('id, nombre, precio_unitario, unidad')
  .eq('restaurante_id', RID)
  .eq('activo', true)

const prodByName = new Map()
for (const p of productos) prodByName.set(norm(p.nombre), p)

// 2. Cargar todos los ingredientes sin vincular de las 11 recetas
const RECETA_NOMBRES = ['Chutney Datil','Croqueta de Chorizo Colorado','Fondo Umami','Manteca de miso','Mascarpone','Mayonesa de huevo pasteurizado','Pimientos en escabeche','Sarraceno Pop','Chimi cremoso','Cremoso chocolate','Fondo de ternera']

const { data: recetas } = await supabase
  .from('recetas')
  .select('id, nombre')
  .eq('restaurante_id', RID)
  .in('nombre', RECETA_NOMBRES)

const recetaIds = recetas.map(r => r.id)

const { data: ings } = await supabase
  .from('ingredientes')
  .select('id, nombre, receta_id, producto_id, unidad')
  .in('receta_id', recetaIds)
  .is('producto_id', null)

console.log(`Ingredientes sin vincular: ${ings.length}`)

let vinculados = 0
let skipped = 0
for (const ing of ings) {
  const key = norm(ing.nombre)
  let prod = null
  let prodNombreUsado = null

  if (key in MAPEO) {
    const target = MAPEO[key]
    if (target === null) { skipped++; continue }
    prod = prodByName.get(norm(target)) ||
           productos.find(p => norm(p.nombre).includes(norm(target)) || norm(target).includes(norm(p.nombre)))
    prodNombreUsado = target
  }

  if (!prod) {
    // Intentar fuzzy directo en productos
    prod = productos.find(p => {
      const pn = norm(p.nombre)
      return pn === key || (key.length >= 4 && (pn.includes(key) || key.includes(pn)))
    })
  }

  if (prod) {
    const { error } = await supabase
      .from('ingredientes')
      .update({
        producto_id: prod.id,
        costo_unitario: prod.precio_unitario,
        unidad_costo: prod.unidad,
      })
      .eq('id', ing.id)
    if (!error) {
      vinculados++
      console.log(`  ✓ "${ing.nombre}" → "${prod.nombre}" ($${prod.precio_unitario})`)
    } else {
      console.log(`  ❌ "${ing.nombre}": ${error.message}`)
    }
  } else {
    console.log(`  ✗ "${ing.nombre}" — sin match`)
  }
}

console.log(`\n📊 Vinculados: ${vinculados}, Skipped (agua/sin costo): ${skipped}, Sin match: ${ings.length - vinculados - skipped}`)
