// Cargar recetas 2026 (8 nuevas + 3 actualizaciones) en Bros
// Uso: node scripts/load-recetas-2026.mjs
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

const SUPABASE_URL = 'https://clipcxcbtlibswfzsgzk.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const RESTAURANTE_ID = 'e65cf95a-2c32-4244-b325-2379be5b3a6e'

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

// ────────────────────────────────────────────────────────────
// Recetas a INSERTAR (no existen en Bros)
// ────────────────────────────────────────────────────────────
const RECETAS_NUEVAS = [
  {
    nombre: 'Chutney Datil',
    categoria: 'Bases y Salsas',
    porciones: 1,
    tiempo_min: 30,
    procedimiento: `1. Colocar la pulpa en una ollita, con el agua. Calentar a fuego suave, hasta que se deshaga y tome un color ámbar. Añadir el azúcar y el vinagre, sin dejar de remover.
2. Agregar los restantes ingredientes.
3. Continuar la cocción a fuego suave.
4. Retirar del fuego y dejar enfriar. De ser necesario blendear y trabar con goma.`,
    ingredientes: [
      { nombre: 'Pulpa de dátil', cantidad: 100, unidad: 'g' },
      { nombre: 'Agua', cantidad: 50, unidad: 'g' },
      { nombre: 'Vinagre Blanco', cantidad: 50, unidad: 'g' },
      { nombre: 'Azucar mascabo', cantidad: 50, unidad: 'g' },
      { nombre: 'Jugo de limon', cantidad: 35, unidad: 'g' },
      { nombre: 'Ajo en polvo', cantidad: 2, unidad: 'g' },
      { nombre: 'Msg', cantidad: 2, unidad: 'g' },
      { nombre: 'Aji Molido', cantidad: 7, unidad: 'g' },
      { nombre: 'Cebolla Desh', cantidad: 5, unidad: 'g' },
    ],
  },
  {
    nombre: 'Croqueta de Chorizo Colorado',
    categoria: 'Bases y Salsas',
    porciones: 1,
    tiempo_min: 45,
    procedimiento: `1. Cortar cebolla y apio en brunoise bien pequeños.
2. Retirar la tripa al chorizo, cortar en trocitos pequeños.
3. Colocar el chorizo con el aceite, el apio y la cebolla en una sarten. Cocinar hasta que transparente la cebolla.
4. Agregar la harina y mezclar, cocinar por 2 minutos. Formando un roux.
5. Añadir la gelatina a la leche y revolver, verter sobre la base y revolver evitando formar grumos, cocinar por 5 minutos. Como una bechamel tomada.
6. Estirar la preparacion sobre un film en una placa. Enfriar.

Rinde: 1450g`,
    ingredientes: [
      { nombre: 'Chorizo Colorado', cantidad: 300, unidad: 'g' },
      { nombre: 'Cebolla de verdeo', cantidad: 140, unidad: 'g' },
      { nombre: 'Apio', cantidad: 40, unidad: 'g' },
      { nombre: 'Aceite', cantidad: 100, unidad: 'g' },
      { nombre: 'Leche', cantidad: 1000, unidad: 'g' },
      { nombre: 'Harina', cantidad: 150, unidad: 'g' },
      { nombre: 'Gelatina sin sabor', cantidad: 50, unidad: 'g' },
      { nombre: 'Huevos duros', cantidad: 4, unidad: 'u' },
    ],
  },
  {
    nombre: 'Fondo Umami',
    categoria: 'Bases y Salsas',
    porciones: 1,
    tiempo_min: 180,
    procedimiento: `1. Cortar los vegetales en trozos pequeños. A mayor superficie mayor cantidad de reacción de maillard!
2. Untarlos con la pasta de tomate, el miso y aceite. Colocarlos en placas de horno bajas. Para facilitar la caramelización. Hornear a media temperatura 160°/170° volteando 2 o 3 veces, no mover mucho para aumentar el dorado de los vegetales. Aprox 45'.
3. Trasferir a una olla. Cubrir con 10 lts de agua fria. Levantar los fondos de las asaderas con un poco de agua, agregar al caldo. Cocinar a fuego bajo por 2 horas desde que aparece la primera burbuja de ebullicion. Mantener sin que hierva.
4. Colar todo el fondo pasando por lienzo. Reducir hasta 1.6lts
5. Trabar con goma y rectificar la sal.
6. Enfriar, envasar, rotular.

Notas:
- Cortar en finas laminas permitirá generar mayor cantidad de superficies doradas
- Como todo caldo debe cocinarse desde frio y tratar de que no hierva
- Retirar los rastros de aceite, espumar las impurezas constantemente
- Colar sin presionar para no forzar sedimentos
- Probar, siempre probar

Rinde: 1.6lt — Inspiración: Chefsteps Umami Bomb Demiglace`,
    ingredientes: [
      { nombre: 'Extracto de tomate', cantidad: 150, unidad: 'g' },
      { nombre: 'Miso', cantidad: 150, unidad: 'g' },
      { nombre: 'Berenjenas', cantidad: 1800, unidad: 'g' },
      { nombre: 'Coliflor o repollo', cantidad: 1800, unidad: 'g' },
      { nombre: 'Zanahoria', cantidad: 600, unidad: 'g' },
      { nombre: 'Remolacha', cantidad: 400, unidad: 'g' },
      { nombre: 'Calabacin', cantidad: 1000, unidad: 'g' },
      { nombre: 'Apio', cantidad: 200, unidad: 'g' },
      { nombre: 'Cebolla', cantidad: 1000, unidad: 'g' }, // 500 + 500
      { nombre: 'Ajo', cantidad: 240, unidad: 'g' },
      { nombre: 'Batatas', cantidad: 500, unidad: 'g' },
      { nombre: 'Hongos secos', cantidad: 240, unidad: 'g' },
      { nombre: 'Alga', cantidad: 36, unidad: 'g' },
      { nombre: 'Aceite', cantidad: 300, unidad: 'ml' },
      { nombre: 'Agua Fria', cantidad: 10000, unidad: 'g' },
      { nombre: 'Goma Xantica', cantidad: 1.6, unidad: 'g' },
      { nombre: 'Sal', cantidad: 16, unidad: 'g' },
    ],
  },
  {
    nombre: 'Manteca de miso',
    categoria: 'Bases y Salsas',
    porciones: 1,
    tiempo_min: 15,
    procedimiento: `1. Fundir la manteca
2. Quitar la impureza de la misma y agregar el aceite de oliva
3. Llevar a 100 grados y añadir el ajo y el miso. Disolver con batidor
4. Retirar del fuego y agregar las especies
5. Colocar en un cambro metálico, rotular y guardar en heladera`,
    ingredientes: [
      { nombre: 'Manteca', cantidad: 300, unidad: 'g' },
      { nombre: 'Aceite de oliva', cantidad: 300, unidad: 'g' },
      { nombre: 'Miso', cantidad: 100, unidad: 'g' },
      { nombre: 'Cayena', cantidad: 5, unidad: 'g' },
      { nombre: 'Pimenton', cantidad: 30, unidad: 'g' },
      { nombre: 'Aji', cantidad: 5, unidad: 'g' },
      { nombre: 'Comino', cantidad: 5, unidad: 'g' },
      { nombre: 'Ajo', cantidad: 4, unidad: 'u' },
    ],
  },
  {
    nombre: 'Mascarpone',
    categoria: 'Bases y Salsas',
    porciones: 1,
    tiempo_min: 480, // 8hs de drenado
    procedimiento: `1. Colocar las leches en thermomix a 80°C por 5min a Velocidad 3.
2. Al llegar a los 80°C agregar el acido, mezclar por 30seg.
3. Poner a drenar sobre lienzo por 8 hs.`,
    ingredientes: [
      { nombre: 'Crema de leche', cantidad: 2000, unidad: 'ml' },
      { nombre: 'Leche en polvo', cantidad: 25, unidad: 'g' },
      { nombre: 'Acido citrico', cantidad: 18, unidad: 'g' },
    ],
  },
  {
    nombre: 'Mayonesa de huevo pasteurizado',
    categoria: 'Bases y Salsas',
    porciones: 1,
    tiempo_min: 75,
    procedimiento: `1. Remojar los huevos en solucion de sanichef por 5'
2. Pasteurizar huevos: cocinar por 60' a 61°C. Cortar coccion. Enfriar.
3. Colocar los ingredientes en la licuadora y emulsionar.`,
    ingredientes: [
      { nombre: 'Huevos', cantidad: 4, unidad: 'u' },
      { nombre: 'Aceite', cantidad: 600, unidad: 'g' },
      { nombre: 'Diente ajo asado', cantidad: 4, unidad: 'g' },
      { nombre: 'Sal', cantidad: 10, unidad: 'g' },
      { nombre: 'Pimienta', cantidad: 5, unidad: 'g' },
      { nombre: 'Jugo de limon', cantidad: 60, unidad: 'g' },
      { nombre: 'MSA', cantidad: 6, unidad: 'g' },
    ],
  },
  {
    nombre: 'Pimientos en escabeche',
    categoria: 'Bases y Salsas',
    porciones: 1,
    tiempo_min: 60,
    procedimiento: `1. Asar los pimientos enteros a la brasa. Quemar la piel por todos lados y colocarlo en un recipiente tapados o dentro de una bolsa de plastico para que el vapor ayude al pelado.
2. Calentar la solucion con el resto de los ingredientes. Cocinarlos sin que hierva por 30min.`,
    ingredientes: [
      { nombre: 'Pimientos Rojos', cantidad: 1000, unidad: 'g' },
      { nombre: 'Vinagre', cantidad: 250, unidad: 'g' },
      { nombre: 'Azucar', cantidad: 250, unidad: 'g' },
      { nombre: 'Aceite', cantidad: 250, unidad: 'g' },
      { nombre: 'Sal', cantidad: 25, unidad: 'g' },
      { nombre: 'Ajo', cantidad: 25, unidad: 'g' },
      { nombre: 'Pimienta', cantidad: 10, unidad: 'g' },
      { nombre: 'Laurel', cantidad: 4, unidad: 'u' },
    ],
  },
  {
    nombre: 'Sarraceno Pop',
    categoria: 'Bases y Salsas',
    porciones: 1,
    tiempo_min: 150,
    procedimiento: `1. Sazona con sal una olla de agua hirviendo y cocina trigo sarraceno durante unos 15 minutos. No tengas miedo de pasarte de cocción: es mejor sobrecocinarlo que dejarlo crudo. Luego, escurre el agua y deja reposar durante 5 minutos. Extiende el trigo sarraceno sobre una lámina de silicona y déjalo secar a 50°C durante un par de horas, removiéndolo de vez en cuando hasta que toda la humedad se haya evaporado.
2. A continuación, fríe el trigo sarraceno seco en aceite a 220°C durante unos segundos. Esto hará que se infle y quede muy crujiente. Ten cuidado, ¡porque el aceite estará muy caliente! Pásalo enseguida a una bandeja cubierta con papel de cocina y sazónalo inmediatamente con sal. Después, puedes conservarlo en un lugar seco y tapado durante varios días o incluso semanas.`,
    ingredientes: [
      // PDF no especifica cantidades, dejamos referencia
      { nombre: 'Trigo sarraceno', cantidad: 500, unidad: 'g' },
      { nombre: 'Sal', cantidad: 10, unidad: 'g' },
      { nombre: 'Aceite', cantidad: 500, unidad: 'ml' },
    ],
  },
]

// ────────────────────────────────────────────────────────────
// Recetas a ACTUALIZAR (existen en Bros — versión 2026)
// ────────────────────────────────────────────────────────────
const RECETAS_ACTUALIZAR = [
  {
    id: '8d933706-c936-4d1f-af7a-9b3cb8d7e97f',
    nombre: 'Chimi cremoso',
    categoria: 'Bases y Salsas',
    procedimiento: `1. Blanquear perejil en agua salada. 20 segundos. Cortar coccion.
2. Colocar los ingr. en la licuadora. Procesar por 4 minutos. Chequear que siempre esté frio o agregar hielo. Hasta que quede todo con color homogeneo.
3. Trabar con goma segun sea necesario.
4. Tiene que quedar acido, citrico, ligeramente picante. De color Verde y con textura de yogurt.`,
    ingredientes: [
      { nombre: 'Perejil Blanqueado', cantidad: 100, unidad: 'g' },
      { nombre: 'Espinaca blanqueada', cantidad: 30, unidad: 'g' },
      { nombre: 'Burrito', cantidad: 30, unidad: 'g' },
      { nombre: 'Tomillo', cantidad: 20, unidad: 'g' },
      { nombre: 'Naranja', cantidad: 200, unidad: 'g' },
      { nombre: 'Limon', cantidad: 150, unidad: 'g' },
      { nombre: 'Cebolla asada', cantidad: 150, unidad: 'g' },
      { nombre: 'Ajo Asado', cantidad: 12, unidad: 'g' },
      { nombre: 'Vinagre de vino', cantidad: 50, unidad: 'g' },
      { nombre: 'Oliva', cantidad: 150, unidad: 'g' },
      { nombre: 'Aji Molido', cantidad: 25, unidad: 'g' },
      { nombre: 'Pimienta negra', cantidad: 10, unidad: 'g' },
      { nombre: 'Sal', cantidad: 20, unidad: 'g' },
      { nombre: 'Msg', cantidad: 1, unidad: 'g' },
      { nombre: 'Goma Xantica', cantidad: 5, unidad: 'g' },
      { nombre: 'Hielo', cantidad: 150, unidad: 'g' },
      { nombre: 'Aceite Verde', cantidad: 100, unidad: 'g' },
    ],
  },
  {
    id: '9fa55d66-8862-44d4-b20f-86b1dfc5dd05',
    nombre: 'Cremoso chocolate',
    categoria: 'Postres',
    procedimiento: `1. Calentar la crema de leche con el azúcar a fuego medio hasta que emita vapor. Evitar que hierva.
2. Fundir el chocolate en microondas (intervalos de 30 segundos, mezclando) o a baño maría, sin contacto directo con el agua.
3. Incorporar la crema caliente sobre el chocolate fundido. Mezclar hasta homogeneizar. Integrar la crema caliente y el chocolate fundido con espátula, realizando movimientos circulares desde el centro hasta formar un remolino.
4. Continuar mezclando hasta lograr una emulsión homogénea y brillante.
5. Dejar enfriar a temperatura ambiente hasta que espese (20–30 min en frío / 45–60 min en calor), mezclando ocasionalmente para un enfriado parejo.
6. Agregar el licor y batir a velocidad alta hasta incorporar aire y obtener textura aireada. Raspar bordes y base del bowl durante el proceso.
7. Enfriar.

Rinde: 1350g`,
    ingredientes: [
      { nombre: 'Chocolate 65%', cantidad: 600, unidad: 'g' },
      { nombre: 'Crema 44%', cantidad: 540, unidad: 'g' },
      { nombre: 'Leche', cantidad: 150, unidad: 'g' },
      { nombre: 'Azucar', cantidad: 150, unidad: 'g' },
      { nombre: 'Licor de nispero', cantidad: 90, unidad: 'ml' },
    ],
  },
  {
    id: '54fa19cc-0c69-4216-a4aa-210bad0e245c',
    nombre: 'Fondo de ternera',
    categoria: 'Bases y Salsas',
    procedimiento: `Un fondo oscuro o demi glace es un caldo muy sabroso, sin agregado de sal y extremadamente reducido 1/10. Requiere muy poco tiempo activo, pero si de paciencia y cuidados. Lo ideal es darle continuidad, iniciarlo en la mañana temprano y terminarlo llegado el final del dia. En total unas 16/18hs. Como resultado final buscamos un fluido viscoso, transparente, dulce y lleno de sabor.

1. Cortar vegetales limpios en trozos grandes (3cm cubicos aprox, segun la dureza del vegetal). Untarlos con la menor cantidad de aceite posible, solo que haga una cubierta fina para que no se quemen. Dorarlos en horno medio, aprox 20 minutos. Revisar que no se quemen, ir girando la bandeja y revolverlos 2 o 3 veces. Agregar el tomate sobre el final cocinar 3 minutos más. Retirar las verduras y levantar lo pegadito con vino, evaporar el alcohol.
2. Dorar la carne y huesos. Colocarlos en bandejas sin apretarlos, sin encimarlos. Necesitamos que el calor pase parejo por entre las piezas para que dore completo y parejo. Si fuera necesario usar dos bandejas o hacer en tandas. Dar vueltas para que se dore todo parejo. Aprox 20 minutos. Retirar la carne, si hay exceso de grasa en la bandeja, descartarla y levantar lo pegadito con vino, evaporar el alcohol.
3. Colocar las patitas en el fondo de la olla, la carne y las verduras encima. Añadir el vino reducido y los 15 lts de agua FRIA.
4. Colocar a fuego medio. Cuando aparecen los primeros signos de hervor reducir el fuego. Necesitamos que esté siempre al borde de la ebullición, mientras menos burbujas menos movimiento de particulas que puedan soltarse y enturbiar el fondo.
5. Desgrasar continuamente con un cucharón.
6. Cocinar a fuego bajo por aprox 5hs. Notaremos que la carne esta blanda, se desprende facil del hueso y el caldo tiene sabor y color ambar transparente.
7. Colar desde la canilla, de a poco. Colocando un lienzo doble sobre un chino.
8. Una vez limpio colocar en olla ancha y poner a reducir hasta que el resultado sea de 1.5lts.
9. Enfriar rapidamente con BAÑO MARIA INVERSO. Envasar en recipiente hermetico con tapa segura. Etiquetar.

Rinde: 1.5LT`,
    ingredientes: [
      { nombre: 'Bocado/corte economico con hueso', cantidad: 4000, unidad: 'g' },
      { nombre: 'Patitas de cerdo blanqueadas', cantidad: 4, unidad: 'u' },
      { nombre: 'Apio', cantidad: 500, unidad: 'g' },
      { nombre: 'Zanahoria', cantidad: 1000, unidad: 'g' },
      { nombre: 'Cebolla', cantidad: 1500, unidad: 'g' },
      { nombre: 'Manzana Roja', cantidad: 500, unidad: 'g' },
      { nombre: 'Concentrado de tomates', cantidad: 150, unidad: 'g' },
      { nombre: 'Vino Tinto', cantidad: 1000, unidad: 'ml' },
      { nombre: 'Agua Fria', cantidad: 15000, unidad: 'ml' },
    ],
  },
]

// ────────────────────────────────────────────────────────────
// Helper: buscar producto_id por nombre fuzzy
// ────────────────────────────────────────────────────────────
function normalize(s) {
  return s.toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ')
}

async function findProductoId(nombreIng, productos) {
  const norm = normalize(nombreIng)
  // Exacto
  const exact = productos.find(p => normalize(p.nombre) === norm)
  if (exact) return { id: exact.id, precio: exact.precio_unitario, unidad: exact.unidad }
  // Contains
  const contains = productos.find(p => {
    const pn = normalize(p.nombre)
    return pn.includes(norm) || (norm.length >= 4 && norm.includes(pn))
  })
  if (contains) return { id: contains.id, precio: contains.precio_unitario, unidad: contains.unidad }
  return null
}

// ────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────
async function main() {
  // Cargar productos para vincular
  const { data: productos } = await supabase
    .from('productos')
    .select('id, nombre, precio_unitario, unidad')
    .eq('restaurante_id', RESTAURANTE_ID)
    .eq('activo', true)

  console.log(`📦 Productos en stock: ${productos.length}`)

  // ── 1. INSERTAR recetas nuevas ──
  console.log('\n🆕 Insertando recetas nuevas:')
  for (const r of RECETAS_NUEVAS) {
    const recetaId = randomUUID()
    const { error: errR } = await supabase.from('recetas').insert({
      id: recetaId,
      nombre: r.nombre,
      categoria: r.categoria,
      porciones: r.porciones,
      tiempo_min: r.tiempo_min,
      procedimiento: r.procedimiento,
      restaurante_id: RESTAURANTE_ID,
      activa: true,
      status: 'published',
    })
    if (errR) { console.error(`  ❌ ${r.nombre}: ${errR.message}`); continue }

    const ingsToInsert = []
    for (const ing of r.ingredientes) {
      const match = await findProductoId(ing.nombre, productos)
      ingsToInsert.push({
        receta_id: recetaId,
        nombre: ing.nombre,
        cantidad: ing.cantidad,
        unidad: ing.unidad,
        tipo: 'producto',
        producto_id: match?.id ?? null,
        costo_unitario: match?.precio ?? 0,
        unidad_costo: match?.unidad ?? ing.unidad,
      })
    }
    const { error: errI } = await supabase.from('ingredientes').insert(ingsToInsert)
    if (errI) { console.error(`  ❌ ${r.nombre} ings: ${errI.message}`); continue }
    const vinc = ingsToInsert.filter(i => i.producto_id).length
    console.log(`  ✓ ${r.nombre} — ${ingsToInsert.length} ings (${vinc} vinculados)`)
  }

  // ── 2. ACTUALIZAR recetas existentes (ya corrido OK) ──
  console.log('\n♻️ Skipping updates (ya corridos OK)')
  if (false) for (const r of RECETAS_ACTUALIZAR) {
    // Borrar ingredientes viejos
    const { error: errD } = await supabase.from('ingredientes').delete().eq('receta_id', r.id)
    if (errD) { console.error(`  ❌ ${r.nombre} delete: ${errD.message}`); continue }

    // Actualizar receta
    const { error: errU } = await supabase.from('recetas').update({
      procedimiento: r.procedimiento,
      categoria: r.categoria,
    }).eq('id', r.id)
    if (errU) { console.error(`  ❌ ${r.nombre} update: ${errU.message}`); continue }

    // Insertar ingredientes nuevos
    const ingsToInsert = []
    for (const ing of r.ingredientes) {
      const match = await findProductoId(ing.nombre, productos)
      ingsToInsert.push({
        receta_id: r.id,
        nombre: ing.nombre,
        cantidad: ing.cantidad,
        unidad: ing.unidad,
        tipo: 'producto',
        producto_id: match?.id ?? null,
        costo_unitario: match?.precio ?? 0,
        unidad_costo: match?.unidad ?? ing.unidad,
      })
    }
    const { error: errI } = await supabase.from('ingredientes').insert(ingsToInsert)
    if (errI) { console.error(`  ❌ ${r.nombre} ings: ${errI.message}`); continue }
    const vinc = ingsToInsert.filter(i => i.producto_id).length
    console.log(`  ✓ ${r.nombre} — ${ingsToInsert.length} ings (${vinc} vinculados)`)
  }

  // ── 3. Resumen final ──
  const { count: recetasCount } = await supabase
    .from('recetas')
    .select('*', { count: 'exact', head: true })
    .eq('restaurante_id', RESTAURANTE_ID)

  console.log(`\n📊 Total recetas en Bros: ${recetasCount}`)
}

main().catch(e => { console.error(e); process.exit(1) })
