const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const RID = 'e65cf95a-2c32-4244-b325-2379be5b3a6e'
const recetasNombres = ['Chutney Datil','Croqueta de Chorizo Colorado','Fondo Umami','Manteca de miso','Mascarpone','Mayonesa de huevo pasteurizado','Pimientos en escabeche','Sarraceno Pop','Chimi cremoso','Cremoso chocolate','Fondo de ternera']

const url = `https://clipcxcbtlibswfzsgzk.supabase.co/rest/v1/recetas?restaurante_id=eq.${RID}&nombre=in.(${recetasNombres.map(n => '"' + n + '"').join(',')})&select=id,nombre,categoria,tiempo_min,porciones,ingredientes!ingredientes_receta_id_fkey(nombre,cantidad,unidad,producto_id,costo_unitario)`

const res = await fetch(url, { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } })
const data = await res.json()
if (!Array.isArray(data)) {
  console.error('Error:', JSON.stringify(data, null, 2))
  process.exit(1)
}

data.sort((a, b) => a.nombre.localeCompare(b.nombre))
for (const r of data) {
  const vinc = r.ingredientes.filter(i => i.producto_id).length
  console.log(`\n📋 ${r.nombre} [${r.categoria}] — ${r.ingredientes.length} ings (${vinc} vinc)`)
  for (const i of r.ingredientes) {
    const mark = i.producto_id ? '✓' : '✗'
    console.log(`   ${mark} ${i.nombre.padEnd(35)} ${String(i.cantidad).padEnd(7)}${i.unidad}  ($${i.costo_unitario || 0})`)
  }
}

console.log(`\n📊 Total recetas verificadas: ${data.length}/${recetasNombres.length}`)
