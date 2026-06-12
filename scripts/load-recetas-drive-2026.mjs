// Cargar recetas desde Google Drive (batch - 57 recetas)
// Uso: node scripts/load-recetas-drive-2026.mjs
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

const SUPABASE_URL = 'https://clipcxcbtlibswfzsgzk.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const RESTAURANTE_ID = 'e65cf95a-2c32-4244-b325-2379be5b3a6e'

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

function normalize(s) {
  return s.toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ')
}

async function findProductoId(nombreIng, productos) {
  const norm = normalize(nombreIng)
  const exact = productos.find(p => normalize(p.nombre) === norm)
  if (exact) return { id: exact.id, precio: exact.precio_unitario, unidad: exact.unidad }
  const contains = productos.find(p => {
    const pn = normalize(p.nombre)
    return pn.includes(norm) || (norm.length >= 4 && norm.includes(pn))
  })
  if (contains) return { id: contains.id, precio: contains.precio_unitario, unidad: contains.unidad }
  return null
}

const RECETAS = [
  // ─────────────────────────────────────────────────────
  // PRINCIPALES
  // ─────────────────────────────────────────────────────
  {
    nombre: 'Tamal de hongos',
    categoria: 'Principales',
    porciones: 25,
    rendimiento: '25 TAMALES',
    tiempo_min: null,
    procedimiento: `1. Grillar las girgolas a la parrilla.
2. Colocar las girgolas, 2 cebollas, una cabeza de ajo, el zapallo y la zanahoria, el laurel y el romero. Cubrir completamente de agua, agregar la salsa de soja y el vino.
3. Hervir por 40 min. Separar las girgolas. Colar y descartar los solidos.
4. En el mismo caldo hervir la papa cortada en cubitos de 0.5cm. Que quede cocida pero firme.
5. Cortar los hongos en cubitos pequeños.
6. En una olla grande, calentar 200grs de manteca. Sofreir la cebolla y los pimientos en brunoise. El ajo picado. Cuando transparente la cebolla agregar las girgolas picadas, el verdeo picado, la papa y el condimento. Revolver e integrar bien. Apagar el fuego. Enfriar.
7. Masa: Colocar la harina con los condimentos. Agregar la grasa pomada e ir amasando y agregando el caldo de a poco hasta obtener una masa lisa. Maleable y que no se pegue a las manos.
8. Armado del tamal: hacer una bolita del tamaño de la mano, e ir estirando formando un huevo al medio, donde se pone el relleno. Con la misma masa vamos cerrando la parte superior formando nuevamente la bolita.
9. Colocar la bolita en 2 chalas hidratadas y superpuestas. Atar las puntas formando un caramelito.
10. Hervir los tamales por hora y media. Servir calientes.`,
    ingredientes: [
      { nombre: 'Aceite de ajo', cantidad: 200, unidad: 'g' },
      { nombre: 'Girgolas', cantidad: 2000, unidad: 'g' },
      { nombre: 'Hongos deshidratados', cantidad: 200, unidad: 'g' },
      { nombre: 'Tomillo', cantidad: 20, unidad: 'g' },
      { nombre: 'Laurel', cantidad: 5, unidad: 'u' },
      { nombre: 'Cebolla', cantidad: 350, unidad: 'g' },
      { nombre: 'Cabeza de ajo', cantidad: 1, unidad: 'u' },
      { nombre: 'Zanahoria', cantidad: 300, unidad: 'g' },
      { nombre: 'Zapallo', cantidad: 300, unidad: 'g' },
      { nombre: 'Vino tinto', cantidad: null, unidad: 'ml' },
      { nombre: 'Salsa de soja', cantidad: null, unidad: 'ml' },
      { nombre: 'Ajo', cantidad: 40, unidad: 'g' },
      { nombre: 'Pimiento Rojo', cantidad: 300, unidad: 'g' },
      { nombre: 'Pimiento Verde', cantidad: 300, unidad: 'g' },
      { nombre: 'Cebolla', cantidad: 500, unidad: 'g' },
      { nombre: 'Aji molido', cantidad: 30, unidad: 'g' },
      { nombre: 'Comino', cantidad: 20, unidad: 'g' },
      { nombre: 'Papa', cantidad: 500, unidad: 'g' },
      { nombre: 'Verdeo', cantidad: 300, unidad: 'g' },
      { nombre: 'Harina de maiz', cantidad: 750, unidad: 'g' },
      { nombre: 'Manteca', cantidad: 150, unidad: 'g' },
      { nombre: 'Pimenton', cantidad: 20, unidad: 'g' },
      { nombre: 'Curcuma', cantidad: 20, unidad: 'g' },
    ],
  },
  {
    nombre: 'Tamal de carne',
    categoria: 'Principales',
    porciones: 50,
    rendimiento: '50 TAMALES',
    tiempo_min: null,
    procedimiento: `1. Salpimentar y marcar la carne a la parrilla.
2. Colocar la carne, el chorizo y las patitas en una olla con 2 cebollas, una cabeza de ajo, el zapallo y la zanahoria, el laurel y el romero. Cubrir completamente de agua.
3. Hervir por hora y media. Separar la carne y el chorizo, enfriar. Colar y descartar los solidos.
4. En el mismo caldo hervir la papa cortada en cubitos de 0.5cm. Que quede cocida pero firme.
5. Cortar la carne en cubitos pequeños.
6. En una olla grande, calentar 200grs de grasa. Sofreir la cebolla y los pimientos en brunoise. El ajo picado. Cuando transparente la cebolla agregar la carne, el verdeo picado, la papa y el condimento. Revolver e integrar bien. Apagar el fuego. Enfriar.
7. Masa: Colocar la harina con los condimentos. Agregar la grasa pomada e ir amasando y agregando el caldo de a poco hasta obtener una masa lisa. Maleable y que no se pegue a las manos.
8. Armado del tamal: hacer una bolita del tamaño de la mano, e ir estirando formando un huevo al medio, donde se pone el relleno. Con la misma masa vamos cerrando la parte superior formando nuevamente la bolita.
9. Colocar la bolita en 2 chalas hidratadas y superpuestas. Atar las puntas formando un caramelito.
10. Hervir los tamales por hora y media. Servir calientes.`,
    ingredientes: [
      { nombre: 'Roast beef', cantidad: 1700, unidad: 'g' },
      { nombre: 'Huesito', cantidad: 500, unidad: 'g' },
      { nombre: 'Chorizo colorado', cantidad: 300, unidad: 'g' },
      { nombre: 'Romero', cantidad: 20, unidad: 'g' },
      { nombre: 'Laurel', cantidad: 5, unidad: 'u' },
      { nombre: 'Cebolla', cantidad: 350, unidad: 'g' },
      { nombre: 'Cabeza de ajo', cantidad: 1, unidad: 'u' },
      { nombre: 'Zanahoria', cantidad: 300, unidad: 'g' },
      { nombre: 'Zapallo', cantidad: 300, unidad: 'g' },
      { nombre: 'Ajo', cantidad: 40, unidad: 'g' },
      { nombre: 'Pimiento Rojo', cantidad: 300, unidad: 'g' },
      { nombre: 'Pimiento Verde', cantidad: 300, unidad: 'g' },
      { nombre: 'Cebolla', cantidad: 500, unidad: 'g' },
      { nombre: 'Aji molido', cantidad: 30, unidad: 'g' },
      { nombre: 'Comino', cantidad: 20, unidad: 'g' },
      { nombre: 'Papa', cantidad: 500, unidad: 'g' },
      { nombre: 'Verdeo', cantidad: 300, unidad: 'g' },
      { nombre: 'Harina de maiz', cantidad: 1500, unidad: 'g' },
      { nombre: 'Grasa', cantidad: 300, unidad: 'g' },
      { nombre: 'Pimenton', cantidad: 40, unidad: 'g' },
      { nombre: 'Curcuma', cantidad: 40, unidad: 'g' },
    ],
  },
  {
    nombre: 'Solomillo',
    categoria: 'Principales',
    porciones: null,
    rendimiento: null,
    tiempo_min: 90,
    procedimiento: `1. Limpiar el solomillo de aponeurosis y dejarlo parejo.
2. Salar con sal de parri, envasar con la manteca de parri y cocinar sous vide 63°C por 1:30 hs.
3. Grillar entero. Sellar. Porcionar. Usar la manteca/liquido de coccion para pincelar.`,
    ingredientes: [
      { nombre: 'Solomillo', cantidad: 2000, unidad: 'g' },
      { nombre: 'Sal de parri', cantidad: 30, unidad: 'g' },
      { nombre: 'Manteca de parri', cantidad: 100, unidad: 'g' },
    ],
  },
  {
    nombre: 'Guiso de lenteja',
    categoria: 'Principales',
    porciones: 50,
    rendimiento: '50 porciones',
    tiempo_min: null,
    procedimiento: `1. Cocinar la falda y la costilla de cerdo a la parrilla, tapar con un gn asi se ahuma mejor. Enfriar y cortar en bocados.
2. Lentejas hidratadas por la noche. Hervir por 20'. Reservar.
3. Calentar una olla grande. Sofreir los vegetales cortados en brunoise. Sumar la carne, los condimentos y el chorizo. Desglasar con vino, evaporar el alcohol. Agregar el tomate. Simmer por 1hr.
4. Agregar las lentejas y el zapallo cubeteado.`,
    ingredientes: [
      { nombre: 'Falda', cantidad: 3000, unidad: 'g' },
      { nombre: 'Costilla de cerdo', cantidad: 3000, unidad: 'g' },
      { nombre: 'Chorizo colorado', cantidad: 1000, unidad: 'g' },
      { nombre: 'Cebolla', cantidad: 2000, unidad: 'g' },
      { nombre: 'Zanahoria', cantidad: 1000, unidad: 'g' },
      { nombre: 'Pimiento rojo', cantidad: 1000, unidad: 'g' },
      { nombre: 'Pimiento Verde', cantidad: 1000, unidad: 'g' },
      { nombre: 'Ajo', cantidad: 100, unidad: 'g' },
      { nombre: 'Tomillo', cantidad: null, unidad: 'g' },
      { nombre: 'Laurel', cantidad: 5, unidad: 'u' },
      { nombre: 'Pimenton', cantidad: 30, unidad: 'g' },
      { nombre: 'Oregano seco', cantidad: 20, unidad: 'g' },
      { nombre: 'Vino blanco', cantidad: 1000, unidad: 'ml' },
      { nombre: 'Tomate conserva', cantidad: null, unidad: 'u' },
      { nombre: 'Lentejas', cantidad: 4000, unidad: 'g' },
      { nombre: 'Calabaza rallada', cantidad: 2000, unidad: 'g' },
    ],
  },
  {
    nombre: 'Puchero',
    categoria: 'Principales',
    porciones: null,
    rendimiento: null,
    tiempo_min: 240,
    procedimiento: `1. Ahumar ligeramente el pecho/tapa de asado (10-15min).
2. Dorar la patita de chancho sobre brasa.
3. Sofrito (en la misma olla): abrir un chorizo y colocarlo de base en la olla. Agregar oliva. Agregar los vegetales. Sofreir hasta lograr un dorado.
4. Cargar agua hasta 3/4 de la olla.
5. Calentar, con las hierbas bouquet, hasta hervor suave. Retirarlas cuando esten blanduscas/opacas.
6. Agregar la sal y las especias en un sachet.
7. Colocar la carne, los chorizos (pinchados) y la patita. Hervor suave/simmer por 4 horas.
8. Retirar la carne. Filtrar las impurezas del caldo. Reservar ambos por separado.`,
    ingredientes: [
      { nombre: 'Pecho', cantidad: 3000, unidad: 'g' },
      { nombre: 'Chorizo colorado', cantidad: 3, unidad: 'u' },
      { nombre: 'Patita de cerdo', cantidad: 1, unidad: 'u' },
      { nombre: 'Verdeo', cantidad: 300, unidad: 'g' },
      { nombre: 'Apio', cantidad: 100, unidad: 'g' },
      { nombre: 'Zanahoria', cantidad: 200, unidad: 'g' },
      { nombre: 'Ajo', cantidad: 20, unidad: 'g' },
      { nombre: 'Cebolla', cantidad: 400, unidad: 'g' },
      { nombre: 'Tallos de perejil', cantidad: 40, unidad: 'g' },
      { nombre: 'Tomillo', cantidad: 10, unidad: 'g' },
      { nombre: 'Laurel', cantidad: 3, unidad: 'u' },
      { nombre: 'Pimienta blanca', cantidad: 3, unidad: 'g' },
      { nombre: 'Pimienta roja', cantidad: 3, unidad: 'g' },
      { nombre: 'Fenogreco', cantidad: 3, unidad: 'g' },
    ],
  },

  // ─────────────────────────────────────────────────────
  // SALSAS Y BASES
  // ─────────────────────────────────────────────────────
  {
    nombre: 'Bagna cauda veggie',
    categoria: 'Salsas y Bases',
    porciones: null,
    rendimiento: null,
    tiempo_min: 40,
    procedimiento: `1. Derretir la manteca con el aceite y agregar el ajo crudo. Cocinar por 3' suavemente, sin que tome color.
2. Añadir el ajo asado y alcaparras. Cocinar por 3'.
3. Agregar el nori, polvo de hongos y el miso. Integrar.
4. Colocar la crema y la kombu con su agua. Cocinar sin que hierva por 30'.`,
    ingredientes: [
      { nombre: 'Aceite', cantidad: 100, unidad: 'ml' },
      { nombre: 'Manteca', cantidad: 100, unidad: 'g' },
      { nombre: 'Ajo asado', cantidad: 1, unidad: 'cabeza' },
      { nombre: 'Ajo crudo', cantidad: 1, unidad: 'cabeza' },
      { nombre: 'Alga nori', cantidad: 10, unidad: 'g' },
      { nombre: 'Alga Kombu', cantidad: 5, unidad: 'g' },
      { nombre: 'Polvo de hongos', cantidad: 15, unidad: 'g' },
      { nombre: 'Alcaparras', cantidad: 30, unidad: 'g' },
      { nombre: 'Miso blanco', cantidad: 30, unidad: 'g' },
      { nombre: 'Crema', cantidad: 1000, unidad: 'g' },
    ],
  },
  {
    nombre: 'Salsa crema de espinaca',
    categoria: 'Salsas y Bases',
    porciones: null,
    rendimiento: '1.7 kg',
    tiempo_min: null,
    procedimiento: `1. Asar cabezas de ajo envueltas en aluminio al horno o la brasa hasta que esten tiernas (40 min).
2. Procesar todos los ingredientes en licuadora potente. Comenzar con los solidos y el limon para evitar oxidaciones. Agregar crema de a poco para ayudar al procesado. Puede hacerse un concentrado.
3. Llevar la crema verde casi a hervor para integrar, cocinar y evitar que se corte.`,
    ingredientes: [
      { nombre: 'Espinaca', cantidad: 500, unidad: 'g' },
      { nombre: 'Ajo asado', cantidad: 50, unidad: 'g' },
      { nombre: 'Crema', cantidad: 1000, unidad: 'g' },
      { nombre: 'Limon', cantidad: 2, unidad: 'u' },
      { nombre: 'Sal', cantidad: 20, unidad: 'g' },
      { nombre: 'Pimienta', cantidad: 5, unidad: 'g' },
    ],
  },
  {
    nombre: 'Crema de Kale',
    categoria: 'Salsas y Bases',
    porciones: null,
    rendimiento: '1.7 kg',
    tiempo_min: null,
    procedimiento: `1. Procesar todos los ingredientes en thermomix. Comenzar con los solidos y el limon para evitar oxidaciones. Agregar crema de a poco para ayudar al procesado. Puede hacerse un concentrado.
2. Llevar la crema verde a 90°c para integrar, cocinar y evitar que se corte.`,
    ingredientes: [
      { nombre: 'Kale', cantidad: 500, unidad: 'g' },
      { nombre: 'Ajo asado', cantidad: 50, unidad: 'g' },
      { nombre: 'Crema', cantidad: 1000, unidad: 'g' },
      { nombre: 'Limon', cantidad: 2, unidad: 'u' },
      { nombre: 'Sal', cantidad: 20, unidad: 'g' },
      { nombre: 'Pimienta', cantidad: 5, unidad: 'g' },
    ],
  },
  {
    nombre: 'Salsa putanesca',
    categoria: 'Salsas y Bases',
    porciones: null,
    rendimiento: null,
    tiempo_min: 30,
    procedimiento: `1. Sofreir la cebolla y el ajo en oliva. Hasta transparentar.
2. Agregar las alcaparras, aji y aceitunas. Cocinar 5'.
3. Añadir el tomate y cocinar 15'.
4. Agregar el atun y el agua.
5. Procesar y agregar la goma para mejorar textura y emulsionar.
6. Toppings: Lavar las hojas de alcaparra para quitar el exceso de salinidad. Romper las aceitunas. Cortar el tomate en trozos de 1cm e hidratar con agua caliente. Mezclar todos los ingredientes y reservar.`,
    ingredientes: [
      { nombre: 'Aceite de Oliva', cantidad: 50, unidad: 'g' },
      { nombre: 'Cebolla morada', cantidad: 150, unidad: 'g' },
      { nombre: 'Ajo', cantidad: 15, unidad: 'g' },
      { nombre: 'Alcaparras', cantidad: 25, unidad: 'g' },
      { nombre: 'Aceitunas negras', cantidad: 40, unidad: 'g' },
      { nombre: 'Anchoas', cantidad: 30, unidad: 'g' },
      { nombre: 'Aji molido', cantidad: 5, unidad: 'g' },
      { nombre: 'Atun escurrido', cantidad: 150, unidad: 'g' },
      { nombre: 'Tomate salsa', cantidad: 1000, unidad: 'g' },
      { nombre: 'Agua', cantidad: 250, unidad: 'g' },
      { nombre: 'Goma xantica', cantidad: 5, unidad: 'g' },
    ],
  },
  {
    nombre: 'Crema de hongos',
    categoria: 'Salsas y Bases',
    porciones: null,
    rendimiento: '2 kg',
    tiempo_min: 30,
    procedimiento: `1. Cocinar la cebolla con el aceite de ajo hasta caramelizar.
2. Levantar con vino blanco y reducir el alcohol.
3. Añadir el polvo de hongos y la crema.
4. Procesar.
5. Asar girgolas pequeñas. Agregar a la crema.`,
    ingredientes: [
      { nombre: 'Cebolla', cantidad: 1000, unidad: 'g' },
      { nombre: 'Aceite de ajo', cantidad: 50, unidad: 'g' },
      { nombre: 'Vino blanco', cantidad: 200, unidad: 'ml' },
      { nombre: 'Polvo de hongos', cantidad: 100, unidad: 'g' },
      { nombre: 'Girgolas', cantidad: 500, unidad: 'g' },
      { nombre: 'Crema', cantidad: 1000, unidad: 'g' },
    ],
  },
  {
    nombre: 'Crema de chorizo colorado',
    categoria: 'Salsas y Bases',
    porciones: null,
    rendimiento: '800 g',
    tiempo_min: 20,
    procedimiento: `1. Desarmar el chorizo, colocarlo en una olla y comenzarlo a cocinar. Agregar la cebolla y el pimiento en brunoise. Sudar.
2. Llevar a licuadora, agregar la crema y procesar todo hasta dejar una crema lisa.
3. Rectificar de sal si fuera necesario.
4. Enfriar. Etiquetar.`,
    ingredientes: [
      { nombre: 'Chorizo colorado', cantidad: 400, unidad: 'g' },
      { nombre: 'Cebolla', cantidad: 200, unidad: 'g' },
      { nombre: 'Pimiento', cantidad: 100, unidad: 'g' },
      { nombre: 'Crema', cantidad: 500, unidad: 'g' },
      { nombre: 'Sal', cantidad: 5, unidad: 'g' },
    ],
  },
  {
    nombre: 'Mayonesa de huevo pasteurizado',
    categoria: 'Salsas y Bases',
    porciones: null,
    rendimiento: null,
    tiempo_min: 70,
    procedimiento: `1. Remojar los huevos en solucion de sanichef por 5'.
2. Pasteurizar huevos: cocinar por 60' a 61°c. Cortar coccion. Enfriar.
3. Colocar los ingredientes en la licuadora y emulsionar.`,
    ingredientes: [
      { nombre: 'Huevos pasteurizados', cantidad: 4, unidad: 'u' },
      { nombre: 'Aceite', cantidad: 600, unidad: 'g' },
      { nombre: 'Diente ajo asado', cantidad: 4, unidad: 'g' },
      { nombre: 'Sal', cantidad: 10, unidad: 'g' },
      { nombre: 'Pimienta', cantidad: 5, unidad: 'g' },
      { nombre: 'Jugo de limon', cantidad: 60, unidad: 'g' },
      { nombre: 'Ralladura de limon', cantidad: null, unidad: 'g' },
      { nombre: 'MSA', cantidad: 6, unidad: 'g' },
    ],
  },
  {
    nombre: 'Provenzal cremosa',
    categoria: 'Salsas y Bases',
    porciones: null,
    rendimiento: '500 g',
    tiempo_min: 15,
    procedimiento: `1. Hervir agua con sal. Blanquear el perejil por 30 seg, cortar coccion en agua con hielo.
2. Escurrir el agua. Apretar para quitar el excedente.
3. Colocar todos los ingredientes en la licuadora. Exprimir el limon y agregar la ralladura. Procesar.
4. Colocar en mamadera. Etiquetar. Reservar.`,
    ingredientes: [
      { nombre: 'Perejil', cantidad: 300, unidad: 'g' },
      { nombre: 'Aceite de girasol', cantidad: 200, unidad: 'g' },
      { nombre: 'Sal', cantidad: 15, unidad: 'g' },
      { nombre: 'Ajo', cantidad: 20, unidad: 'g' },
      { nombre: 'Limon', cantidad: 150, unidad: 'g' },
      { nombre: 'Cayena', cantidad: 5, unidad: 'g' },
      { nombre: 'Hielo', cantidad: 300, unidad: 'g' },
    ],
  },
  {
    nombre: 'Salsa de queso ahumado',
    categoria: 'Salsas y Bases',
    porciones: null,
    rendimiento: null,
    tiempo_min: 20,
    procedimiento: `1. Hacer una bechamel con la manteca, la harina de arroz y la leche.
2. Agregar los quesos y fundir.`,
    ingredientes: [
      { nombre: 'Queso cremoso', cantidad: 3000, unidad: 'g' },
      { nombre: 'Queso ahumado', cantidad: 1000, unidad: 'g' },
      { nombre: 'Leche', cantidad: 1000, unidad: 'ml' },
      { nombre: 'Sal', cantidad: null, unidad: 'g' },
      { nombre: 'Pimienta', cantidad: null, unidad: 'g' },
      { nombre: 'Harina de arroz', cantidad: 200, unidad: 'g' },
      { nombre: 'Manteca', cantidad: 200, unidad: 'g' },
    ],
  },
  {
    nombre: 'Quiquirimichi',
    categoria: 'Salsas y Bases',
    porciones: null,
    rendimiento: null,
    tiempo_min: 15,
    procedimiento: `1. Calentar el aceite y sofreir el verdeo con el pimenton y aji molido.`,
    ingredientes: [
      { nombre: 'Aceite', cantidad: 4000, unidad: 'ml' },
      { nombre: 'Verdeo', cantidad: 1000, unidad: 'g' },
      { nombre: 'Aji molido', cantidad: 100, unidad: 'g' },
      { nombre: 'Pimenton', cantidad: 100, unidad: 'g' },
      { nombre: 'Sal', cantidad: null, unidad: 'g' },
    ],
  },
  {
    nombre: 'Pesto de Cedron',
    categoria: 'Salsas y Bases',
    porciones: null,
    rendimiento: '1.7 kg',
    tiempo_min: 10,
    procedimiento: `1. Procesar los ingredientes. Envasar al vacio si se hace antes del servicio.`,
    ingredientes: [
      { nombre: 'Nueces', cantidad: 250, unidad: 'g' },
      { nombre: 'Limon', cantidad: 150, unidad: 'g' },
      { nombre: 'Cedron en polvo', cantidad: 500, unidad: 'g' },
      { nombre: 'Burro en polvo', cantidad: 300, unidad: 'g' },
      { nombre: 'Perejil blanqueado', cantidad: 300, unidad: 'g' },
      { nombre: 'Albahaca blanqueada', cantidad: 100, unidad: 'g' },
      { nombre: 'Aceite verde', cantidad: 500, unidad: 'g' },
      { nombre: 'Queso Romanito', cantidad: 100, unidad: 'g' },
    ],
  },
  {
    nombre: 'Leche de tigre',
    categoria: 'Salsas y Bases',
    porciones: null,
    rendimiento: '725 g',
    tiempo_min: 10,
    procedimiento: `1. Colocar todo en la licuadora.
2. Procesar. Filtrar.`,
    ingredientes: [
      { nombre: 'Apio', cantidad: 60, unidad: 'g' },
      { nombre: 'Cebolla', cantidad: 80, unidad: 'g' },
      { nombre: 'Ajo', cantidad: 6, unidad: 'g' },
      { nombre: 'Pimiento rojo', cantidad: 40, unidad: 'g' },
      { nombre: 'Jengibre', cantidad: 10, unidad: 'g' },
      { nombre: 'Jugo de limon', cantidad: 100, unidad: 'g' },
      { nombre: 'Jugo de mandarina', cantidad: 200, unidad: 'g' },
      { nombre: 'Cilantro', cantidad: 10, unidad: 'g' },
      { nombre: 'Sal', cantidad: 10, unidad: 'g' },
      { nombre: 'Cayena', cantidad: 5, unidad: 'g' },
      { nombre: 'MSG', cantidad: 5, unidad: 'g' },
      { nombre: 'Pimienta negra', cantidad: 5, unidad: 'g' },
      { nombre: 'Pescado', cantidad: 60, unidad: 'g' },
      { nombre: 'Hielo', cantidad: 200, unidad: 'g' },
    ],
  },
  {
    nombre: 'Aceite de Achiote',
    categoria: 'Salsas y Bases',
    porciones: null,
    rendimiento: '250 ml',
    tiempo_min: 15,
    procedimiento: `1. Calentar el aceite con el achiote a fuego bajo. Confitar por 10 minutos o hasta que el aceite este rojo.
2. Colar y colocar dentro de mamadera.`,
    ingredientes: [
      { nombre: 'Aceite de girasol', cantidad: 260, unidad: 'ml' },
      { nombre: 'Achiote', cantidad: 25, unidad: 'g' },
    ],
  },
  {
    nombre: 'Marinara en polvo',
    categoria: 'Salsas y Bases',
    porciones: null,
    rendimiento: null,
    tiempo_min: 5,
    procedimiento: `1. Mezclar todos los ingredientes.`,
    ingredientes: [
      { nombre: 'Tomate en polvo', cantidad: 200, unidad: 'g' },
      { nombre: 'Ajo en polvo', cantidad: 5, unidad: 'g' },
      { nombre: 'Cebolla en polvo', cantidad: 10, unidad: 'g' },
      { nombre: 'Oregano', cantidad: 10, unidad: 'g' },
      { nombre: 'Leche en polvo', cantidad: 30, unidad: 'g' },
      { nombre: 'Queso Romanito en polvo', cantidad: 30, unidad: 'g' },
      { nombre: 'Acido citrico', cantidad: 5, unidad: 'g' },
      { nombre: 'Sal', cantidad: 2, unidad: 'g' },
      { nombre: 'Azucar', cantidad: 5, unidad: 'g' },
      { nombre: 'MSG', cantidad: 2, unidad: 'g' },
    ],
  },
  {
    nombre: 'Criolla de limon quemado',
    categoria: 'Salsas y Bases',
    porciones: null,
    rendimiento: '850 g',
    tiempo_min: 20,
    procedimiento: `1. Cortar cebolla en brunoise pequeño. Picar ajo.
2. Cortar limon en rodajas de 0.5cm. Cocinar en sarten bien caliente con aceite. Dorar/quemar de ambos lados. Retirar las semillas. Cortar en brunoise.
3. Picar las hierbas.
4. Aderezar con la sal, pimienta, vinagre, aceite de oliva, agua y el jugo de la naranja.
5. Reservar en frio. Rotular.`,
    ingredientes: [
      { nombre: 'Limon', cantidad: 650, unidad: 'g' },
      { nombre: 'Ajo', cantidad: 17, unidad: 'g' },
      { nombre: 'Cebolla', cantidad: 130, unidad: 'g' },
      { nombre: 'Aji pickle', cantidad: 130, unidad: 'g' },
      { nombre: 'Peperina', cantidad: 15, unidad: 'g' },
      { nombre: 'Oregano', cantidad: 10, unidad: 'g' },
      { nombre: 'Perejil', cantidad: 40, unidad: 'g' },
      { nombre: 'Sal', cantidad: 10, unidad: 'g' },
      { nombre: 'Vinagre de vino', cantidad: 150, unidad: 'g' },
      { nombre: 'Aceite de oliva', cantidad: 150, unidad: 'g' },
      { nombre: 'Agua fria', cantidad: 130, unidad: 'g' },
      { nombre: 'Naranja', cantidad: 160, unidad: 'g' },
      { nombre: 'Pimienta', cantidad: 2, unidad: 'g' },
    ],
  },
  {
    nombre: 'Chimicrunch serrano',
    categoria: 'Salsas y Bases',
    porciones: null,
    rendimiento: null,
    tiempo_min: 20,
    procedimiento: `1. Calentar el aceite a 180/170. Freir ajo, verdeo y jengibre.
2. Agregar pasas de uva con pimientas, pecanes y tofu.
3. Agregar perejil, tomillo, cedron, peperina.
4. Apagar fuego. Templar a 90°C, agregar el aji molido, pimenton y achiote para color.
5. Agregar sal, azucar y vinagre.`,
    ingredientes: [
      { nombre: 'Aceite de girasol', cantidad: 500, unidad: 'ml' },
      { nombre: 'Jengibre', cantidad: 30, unidad: 'g' },
      { nombre: 'Ajo', cantidad: 30, unidad: 'g' },
      { nombre: 'Cebolla de verdeo', cantidad: 100, unidad: 'g' },
      { nombre: 'Perejil tallos', cantidad: 50, unidad: 'g' },
      { nombre: 'Tomillo deshojado', cantidad: 20, unidad: 'g' },
      { nombre: 'Peperina', cantidad: 20, unidad: 'g' },
      { nombre: 'Cedron', cantidad: 20, unidad: 'g' },
      { nombre: 'Romero seco', cantidad: 10, unidad: 'g' },
      { nombre: 'Frutos de Moradillo', cantidad: 15, unidad: 'g' },
      { nombre: 'Pimienta blanca', cantidad: 3, unidad: 'g' },
      { nombre: 'Pimienta negra', cantidad: 3, unidad: 'g' },
      { nombre: 'Tofu', cantidad: 100, unidad: 'g' },
      { nombre: 'Pasas de uva', cantidad: 40, unidad: 'g' },
      { nombre: 'Nueces de pecan', cantidad: 75, unidad: 'g' },
      { nombre: 'Sal', cantidad: 20, unidad: 'g' },
      { nombre: 'Pimenton', cantidad: 15, unidad: 'g' },
      { nombre: 'Aji kitucho', cantidad: 100, unidad: 'g' },
      { nombre: 'Vinagre de piquillin', cantidad: 100, unidad: 'ml' },
      { nombre: 'Arrope de Mistol', cantidad: 50, unidad: 'ml' },
    ],
  },
  {
    nombre: 'Guacamole tramposo',
    categoria: 'Salsas y Bases',
    porciones: null,
    rendimiento: null,
    tiempo_min: 20,
    procedimiento: `1. Cortar el brocoli en partes pequeñas. Separar la parte de las inflorescencias de los tallos. Cortar los tallos en trocitos de 3cm. Blanquear el brocoli en agua hirviendo con mucha sal (3 a 4%). Retirar y cortar coccion.
2. Colocar los ingredientes, excepto el aceite, en la thermomix y procesar hasta lograr una pasta. Ir agregando el aceite de a poco para emulsionar.
3. Probar, rectificar de sabor.`,
    ingredientes: [
      { nombre: 'Brocoli', cantidad: 1, unidad: 'u' },
      { nombre: 'Cebolla', cantidad: 200, unidad: 'g' },
      { nombre: 'Ajo', cantidad: 7, unidad: 'g' },
      { nombre: 'Cilantro', cantidad: 30, unidad: 'g' },
      { nombre: 'Jalapeno', cantidad: 10, unidad: 'g' },
      { nombre: 'Palta', cantidad: 200, unidad: 'g' },
      { nombre: 'Aceite de girasol', cantidad: 200, unidad: 'g' },
      { nombre: 'Jugo de limon', cantidad: 50, unidad: 'g' },
      { nombre: 'Sal', cantidad: 20, unidad: 'g' },
      { nombre: 'Pimienta', cantidad: 15, unidad: 'g' },
    ],
  },
  {
    nombre: 'Cinco especias chinas',
    categoria: 'Salsas y Bases',
    porciones: null,
    rendimiento: '320 g',
    tiempo_min: 5,
    procedimiento: `1. Mezclar todos los ingredientes molidos.`,
    ingredientes: [
      { nombre: 'Pimienta', cantidad: 100, unidad: 'g' },
      { nombre: 'Anis estrellado', cantidad: 40, unidad: 'g' },
      { nombre: 'Canela', cantidad: 50, unidad: 'g' },
      { nombre: 'Clavo', cantidad: 100, unidad: 'g' },
      { nombre: 'Hinojo semillas', cantidad: 50, unidad: 'g' },
    ],
  },
  {
    nombre: 'Gazpacho',
    categoria: 'Salsas y Bases',
    porciones: null,
    rendimiento: '1.2 kg',
    tiempo_min: 15,
    procedimiento: `1. Asar pimiento, quitar la piel y semillas.
2. Procesar en licuadora. Probar. Etiquetar. Reservar.`,
    ingredientes: [
      { nombre: 'Tomate', cantidad: 1000, unidad: 'g' },
      { nombre: 'Cebolla', cantidad: 45, unidad: 'g' },
      { nombre: 'Pimiento', cantidad: 40, unidad: 'g' },
      { nombre: 'Ajo', cantidad: 3, unidad: 'g' },
      { nombre: 'Cilantro', cantidad: 3, unidad: 'g' },
      { nombre: 'Vinagre de vino', cantidad: 20, unidad: 'ml' },
      { nombre: 'Pimenton', cantidad: 4, unidad: 'g' },
      { nombre: 'MSA', cantidad: 20, unidad: 'g' },
      { nombre: 'Hielo', cantidad: 100, unidad: 'g' },
    ],
  },
  {
    nombre: 'Mascarpone',
    categoria: 'Salsas y Bases',
    porciones: null,
    rendimiento: null,
    tiempo_min: 30,
    procedimiento: `1. Colocar las leches en thermomix a 80°c por 5min a velocidad 3.
2. Al llegar a los 80°c agregar el acido citrico, mezclar por 30 seg.
3. Poner a drenar sobre lienzo por 8 hs.`,
    ingredientes: [
      { nombre: 'Crema de leche', cantidad: 2000, unidad: 'ml' },
      { nombre: 'Leche en polvo', cantidad: 25, unidad: 'g' },
      { nombre: 'Acido citrico', cantidad: 18, unidad: 'g' },
    ],
  },

  // ─────────────────────────────────────────────────────
  // SOPAS Y CREMAS
  // ─────────────────────────────────────────────────────
  {
    nombre: 'Sopa de zanahoria',
    categoria: 'Sopas y Cremas',
    porciones: null,
    rendimiento: null,
    tiempo_min: 60,
    procedimiento: `1. Asar las zanahorias cortadas a lo largo en 2, cebollas y apio cortados mirepoix al horno con leña. Dorar.
2. Colocarlas en una olla grande, cubrir con agua y cocinar hasta que esten bien tiernas.
3. Agregar el condimento. Procesar hasta lograr textura bien cremosa y fluida. Si fuera necesario emulsionar con un poquito de goma xantica.`,
    ingredientes: [
      { nombre: 'Zanahoria', cantidad: 3000, unidad: 'g' },
      { nombre: 'Ajo asado', cantidad: 2, unidad: 'cabeza' },
      { nombre: 'Apio', cantidad: 500, unidad: 'g' },
      { nombre: 'Cebolla', cantidad: 500, unidad: 'g' },
      { nombre: 'Ras al hanout', cantidad: null, unidad: 'g' },
      { nombre: 'Agua', cantidad: null, unidad: 'ml' },
    ],
  },
  {
    nombre: 'Crema de arvejas y wasabi',
    categoria: 'Sopas y Cremas',
    porciones: null,
    rendimiento: '950 g',
    tiempo_min: 15,
    procedimiento: `1. Colocar en thermomix las arvejas, sal y jugo de limon. Procesar hasta obtener una pasta.
2. Agregar el wasabi y el aceite. Seguir emulsionando hasta que quede una crema lisa, verde clara y brillosa.`,
    ingredientes: [
      { nombre: 'Arvejas blanqueadas', cantidad: 750, unidad: 'g' },
      { nombre: 'Aceite de girasol', cantidad: 150, unidad: 'g' },
      { nombre: 'Jugo de limon', cantidad: 100, unidad: 'g' },
      { nombre: 'Sal', cantidad: 20, unidad: 'g' },
      { nombre: 'Wasabi en polvo', cantidad: 30, unidad: 'g' },
    ],
  },
  {
    nombre: 'Ajoblanco de castanas',
    categoria: 'Sopas y Cremas',
    porciones: null,
    rendimiento: '1500 g',
    tiempo_min: 30,
    procedimiento: `1. Hervir el agua e hidratar las castanas en ella por al menos 2 hs.
2. Procesar las castanas con los ajos y la sal.
3. Agregar el agua de hidratacion y el vinagre de a poco. Buscamos textura de sopa ligera, con el frio tendera a espesar.`,
    ingredientes: [
      { nombre: 'Castanas', cantidad: 430, unidad: 'g' },
      { nombre: 'Agua', cantidad: 850, unidad: 'g' },
      { nombre: 'Pasta de ajo asado', cantidad: 50, unidad: 'g' },
      { nombre: 'Ajo', cantidad: 3, unidad: 'g' },
      { nombre: 'Sal', cantidad: 30, unidad: 'g' },
      { nombre: 'Agua de pickle', cantidad: 200, unidad: 'g' },
    ],
  },

  // ─────────────────────────────────────────────────────
  // ENTRANTES Y SNACKS
  // ─────────────────────────────────────────────────────
  {
    nombre: 'Berenjenas a la andaluza',
    categoria: 'Entrantes',
    porciones: null,
    rendimiento: null,
    tiempo_min: 30,
    procedimiento: `1. Cortar las berenjenas en rodajas finas de 4mm.
2. Marinarlas en cerveza por 20'.
3. Escurrirlas.
4. Mezclar la sal, harina, con panko y pan rallado.
5. Rebozarlas en ellas y freir.
6. Salsa de miel: combinar los ingredientes con agua segun amargor, dulzor y textura.`,
    ingredientes: [
      { nombre: 'Berenjenas', cantidad: 1, unidad: 'kg' },
      { nombre: 'Cerveza', cantidad: 500, unidad: 'g' },
      { nombre: 'Harina', cantidad: 250, unidad: 'g' },
      { nombre: 'Pan rallado', cantidad: 125, unidad: 'g' },
      { nombre: 'Panko', cantidad: 125, unidad: 'g' },
      { nombre: 'Sal', cantidad: 15, unidad: 'g' },
      { nombre: 'Arrope', cantidad: 300, unidad: 'g' },
      { nombre: 'Salsa de soja', cantidad: 100, unidad: 'g' },
    ],
  },
  {
    nombre: 'Bombas de papa y hongos',
    categoria: 'Entrantes',
    porciones: null,
    rendimiento: null,
    tiempo_min: 60,
    procedimiento: `1. Cocinar las papas al vapor. Enteras adentro de un GN con 3cm de agua. Tapar y cocinar por 45' hasta que esten tiernas. Pelar. Cortar en trocitos de 2cm. Colocar en thermomix con la leche y la sal. 12' vel 2 con mariposa a 90°c. Emulsionar: agregar la manteca fria 2' vel 2 con mariposa. Enfriar.
2. Sudar la cebolla, agregar los hongos y el ajo. Cocinar por 10 minutos.
3. Agregar la salsa de soja y el tomillo. Integrar. Enfriar.
4. Cortar el queso cremoso en cubos de 3cm.
5. Con el pure muy frio, separar bolas de 40 grs, aplastarlas y colocar 10g de queso y 10g de relleno de hongos al medio. Cerrar y bolear. Enfriar.
6. Pasar las bolas por huevo con sal, pimienta y perejil. Rebozar en harina. Otra vez por huevo y terminar con la mezcla de panko y pan rallado.
7. Freir.`,
    ingredientes: [
      { nombre: 'Papas', cantidad: 1000, unidad: 'g' },
      { nombre: 'Manteca ahumada', cantidad: 150, unidad: 'g' },
      { nombre: 'Leche', cantidad: 70, unidad: 'g' },
      { nombre: 'Sal', cantidad: 10, unidad: 'g' },
      { nombre: 'Cebolla', cantidad: 200, unidad: 'g' },
      { nombre: 'Girgolas', cantidad: 200, unidad: 'g' },
      { nombre: 'Champinones', cantidad: 200, unidad: 'g' },
      { nombre: 'Ajo asado', cantidad: 5, unidad: 'g' },
      { nombre: 'Salsa de soja', cantidad: 100, unidad: 'g' },
      { nombre: 'Tomillo', cantidad: 2, unidad: 'g' },
      { nombre: 'Queso cremoso', cantidad: 500, unidad: 'g' },
      { nombre: 'Harina', cantidad: 250, unidad: 'g' },
      { nombre: 'Pan rallado', cantidad: 125, unidad: 'g' },
      { nombre: 'Panko', cantidad: 125, unidad: 'g' },
      { nombre: 'Huevo', cantidad: 6, unidad: 'u' },
      { nombre: 'Perejil', cantidad: 10, unidad: 'g' },
      { nombre: 'Pimienta', cantidad: 5, unidad: 'g' },
    ],
  },
  {
    nombre: 'Croqueta de chorizo colorado',
    categoria: 'Entrantes',
    porciones: null,
    rendimiento: '1450 g',
    tiempo_min: 30,
    procedimiento: `1. Cortar cebolla y apio en brunoise bien pequeños.
2. Retirar la tripa al chorizo, cortar en trocitos pequeños.
3. Colocar el chorizo con el aceite, el apio y la cebolla en una sarten. Cocinar hasta que transparente la cebolla.
4. Agregar la harina y mezclar, cocinar por 2 minutos. Formando un roux.
5. Añadir la gelatina a la leche y revolver, verter sobre la base y revolver evitando formar grumos, cocinar por 5 minutos. Como una bechamel tomada.
6. Estirar la preparacion sobre un film en una placa. Enfriar.`,
    ingredientes: [
      { nombre: 'Chorizo colorado', cantidad: 300, unidad: 'g' },
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
    nombre: 'Alitas pegajosas chinas',
    categoria: 'Entrantes',
    porciones: null,
    rendimiento: null,
    tiempo_min: 60,
    procedimiento: `1. Cortar las alitas en piezas individuales.
2. Mezclar los ingredientes de la marinada.
3. Colocar las alitas en la marinada por 20 min, maximo 1 hora.
4. Cubrir una placa de horno con aluminio y papel manteca. Sacudir las alitas retirando el exceso de marinada y disponerlas en la placa separadas por 2-3 cm.
5. Colocar en horno medio. Ir pintando con la marinada cada 15'. Hornear por 45'. Regenerar por 5 minutos antes de servir.`,
    ingredientes: [
      { nombre: 'Alitas de pollo', cantidad: null, unidad: 'kg' },
      { nombre: 'Aceite de sesamo', cantidad: 25, unidad: 'ml' },
      { nombre: 'Jugo de limon', cantidad: 50, unidad: 'ml' },
      { nombre: 'Salsa de soja', cantidad: 50, unidad: 'ml' },
      { nombre: 'Aceto balsamico', cantidad: 50, unidad: 'ml' },
      { nombre: 'Miel', cantidad: 50, unidad: 'g' },
      { nombre: 'Chutney de datiles', cantidad: 100, unidad: 'g' },
      { nombre: 'Extracto de tomate', cantidad: 50, unidad: 'g' },
      { nombre: 'Sriracha', cantidad: 25, unidad: 'ml' },
      { nombre: 'Ajo', cantidad: 20, unidad: 'g' },
      { nombre: 'Jengibre', cantidad: 20, unidad: 'g' },
      { nombre: 'Cinco especias', cantidad: 10, unidad: 'g' },
    ],
  },
  {
    nombre: 'Pejerrey frito - tempura de cerveza',
    categoria: 'Entrantes',
    porciones: null,
    rendimiento: null,
    tiempo_min: 30,
    procedimiento: `1. Mezclar la harina con los almidones y el MSA. Separar 800g para continuar la receta.
2. Integrar la miel a la ginebra. Añadir la cerveza y el polvo para hornear. Agregar solo los 800g de mezcla de harinas y almidones. Refrigerar. Rinde: 1650g de tempura.
3. Limpiar el pescado, retirar espinas, escamas y aletas. Recortar en bastones de entre 50-55g.
4. Pasar los bastoncitos por los 300g de mezcla de secos restantes para retirar el exceso de humedad. Pasar los bastoncitos por la tempura y directo a la freidora, sin escurrir totalmente.
5. Freir por 4 minutos a 200°C hasta que tome un color caramelo. Escurrir sobre rejilla y espolvorear con sal en escamas. Servir de inmediato.`,
    ingredientes: [
      { nombre: 'Harina 0000', cantidad: 600, unidad: 'g' },
      { nombre: 'Almidon de papa', cantidad: 200, unidad: 'g' },
      { nombre: 'Almidon de maiz', cantidad: 200, unidad: 'g' },
      { nombre: 'MSA', cantidad: 100, unidad: 'g' },
      { nombre: 'Polvo para hornear', cantidad: 20, unidad: 'g' },
      { nombre: 'Miel', cantidad: 50, unidad: 'g' },
      { nombre: 'Cerveza', cantidad: 475, unidad: 'g' },
      { nombre: 'Ginebra', cantidad: 350, unidad: 'g' },
      { nombre: 'Pejerrey', cantidad: null, unidad: 'g' },
    ],
  },
  {
    nombre: 'Pimientos en escabeche',
    categoria: 'Entrantes',
    porciones: null,
    rendimiento: null,
    tiempo_min: 40,
    procedimiento: `1. Asar los pimientos enteros a la brasa. Quemar la piel por todos lados y colocarlos en un recipiente tapados o dentro de una bolsa de plastico para que el vapor ayude al pelado.
2. Calentar la solucion con el resto de los ingredientes. Cocinarlos sin que hierva por 30 min.`,
    ingredientes: [
      { nombre: 'Pimientos rojos', cantidad: 1000, unidad: 'g' },
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
    nombre: 'Pate de higado de pollo',
    categoria: 'Entrantes',
    porciones: null,
    rendimiento: '900 g',
    tiempo_min: 30,
    procedimiento: `1. Limpiar los higados.
2. Calentar sarten con aceite. Dorar higaditos. Agregar el ajo, jengibre, cebolla, zanahoria y apio. Salpimentar. Sudar.
3. Desglasar con vermut y whisky. Evaporar alcoholes.
4. Procesar con los citricos.
5. Emulsionar con la manteca.
6. Reservar. Etiquetar.`,
    ingredientes: [
      { nombre: 'Higados y corazones de pollo', cantidad: 1000, unidad: 'g' },
      { nombre: 'Ajo', cantidad: 15, unidad: 'g' },
      { nombre: 'Cebolla', cantidad: 100, unidad: 'g' },
      { nombre: 'Zanahoria', cantidad: 50, unidad: 'g' },
      { nombre: 'Apio', cantidad: 50, unidad: 'g' },
      { nombre: 'Jengibre', cantidad: 40, unidad: 'g' },
      { nombre: 'Triple Sec o Whisky', cantidad: 100, unidad: 'g' },
      { nombre: 'Vermut', cantidad: 100, unidad: 'g' },
      { nombre: 'Naranjas', cantidad: 2, unidad: 'u' },
      { nombre: 'Limon', cantidad: 2, unidad: 'u' },
      { nombre: 'Manteca', cantidad: 200, unidad: 'g' },
      { nombre: 'Sal', cantidad: 10, unidad: 'g' },
      { nombre: 'Pimienta', cantidad: 2, unidad: 'g' },
      { nombre: 'Azucar', cantidad: 100, unidad: 'g' },
      { nombre: 'Aceite de oliva', cantidad: 100, unidad: 'g' },
    ],
  },
  {
    nombre: 'Ensalada de akusai y ciruela',
    categoria: 'Entrantes',
    porciones: 1,
    rendimiento: '1 porcion',
    tiempo_min: 15,
    procedimiento: `1. Lavar hojas de akusai y guardar en heladera con agua.
2. Pelar las ciruelas: con una cuchara de noisette, retirar el carozo. Luego desde el extremo inferior hacer unos cortes en cruz e ir tirando de la piel con firmeza pero lentamente.
3. Vinagreta: colocar, excepto el chile, todos los ingredientes en un mixer. Procesar. Cortar los chiles en rodajitas y agregar.
4. Emplatado: cortar los extremos inferiores del akusai y colocar en el fondo del plato. Acomodar las hojas en forma circular. Bañar con la vinagreta. Espolvorear con levadura y el praline especiado. Colocar las ciruelas cortadas en cuartos.`,
    ingredientes: [
      { nombre: 'Akusai', cantidad: 100, unidad: 'g' },
      { nombre: 'Ciruela', cantidad: 120, unidad: 'g' },
      { nombre: 'Levadura nutricional', cantidad: 5, unidad: 'g' },
      { nombre: 'Aceto balsamico', cantidad: 100, unidad: 'ml' },
      { nombre: 'Salsa de soja', cantidad: 50, unidad: 'g' },
      { nombre: 'Aceite de girasol', cantidad: 50, unidad: 'g' },
      { nombre: 'Jengibre', cantidad: 3, unidad: 'g' },
      { nombre: 'Ajo', cantidad: 3, unidad: 'g' },
      { nombre: 'Miel', cantidad: 30, unidad: 'g' },
      { nombre: 'Agua', cantidad: 150, unidad: 'g' },
      { nombre: 'Goma xantica', cantidad: 3, unidad: 'g' },
      { nombre: 'Chile fresco', cantidad: 1, unidad: 'u' },
    ],
  },

  // ─────────────────────────────────────────────────────
  // PASTAS Y CEREALES
  // ─────────────────────────────────────────────────────
  {
    nombre: 'Ñoquis rellenos',
    categoria: 'Pastas',
    porciones: 6,
    rendimiento: '47 unidades / 6 porciones',
    tiempo_min: 45,
    procedimiento: `1. Lavar las papas y cocinar enteras al horno o al vapor.
2. Pelar y pisar.
3. Agregar la fecula y el huevo, mezclar con un cornet y amasar ligeramente hasta formar una masa lisa.
4. Hacer bolitas de 25 grs aprox. Estirarlas en la palma de la mano, colocar el queso en cubito de 4mm en el centro y cerrar la bolita.
5. Colocar en una placa, congelar.`,
    ingredientes: [
      { nombre: 'Papas', cantidad: 1200, unidad: 'g' },
      { nombre: 'Huevos', cantidad: 60, unidad: 'g' },
      { nombre: 'Fecula de papa', cantidad: 250, unidad: 'g' },
      { nombre: 'Sal fina', cantidad: 15, unidad: 'g' },
      { nombre: 'Polvo de hornear', cantidad: 10, unidad: 'g' },
      { nombre: 'Queso cremoso', cantidad: 150, unidad: 'g' },
    ],
  },
  {
    nombre: 'Arroz al horno',
    categoria: 'Pastas',
    porciones: null,
    rendimiento: null,
    tiempo_min: 45,
    procedimiento: `1. Cortar la verdura en brunoise. Dorar y hacer sofrito. Agregar el tomate.
2. Nacarar el arroz con el sofrito. Desglasar con vino blanco.
3. Agregar el caldo hasta cubrir y no revolver. De a poco ir agregando a medida que se necesite humedad sin revolver. Probar. Cocinar hasta que quede al dente (3/4 de la coccion). Reposar. Enfriar.`,
    ingredientes: [
      { nombre: 'Aceite', cantidad: 50, unidad: 'g' },
      { nombre: 'Pimiento verde', cantidad: 200, unidad: 'g' },
      { nombre: 'Cebolla', cantidad: 300, unidad: 'g' },
      { nombre: 'Ajo', cantidad: 20, unidad: 'g' },
      { nombre: 'Extracto de tomate', cantidad: 50, unidad: 'g' },
      { nombre: 'Pimenton', cantidad: 10, unidad: 'g' },
      { nombre: 'Comino', cantidad: 4, unidad: 'g' },
      { nombre: 'Sal', cantidad: 15, unidad: 'g' },
      { nombre: 'Aji molido', cantidad: 4, unidad: 'g' },
      { nombre: 'Pimienta negra', cantidad: 3, unidad: 'g' },
      { nombre: 'Pasas de uva', cantidad: 150, unidad: 'g' },
      { nombre: 'Arroz', cantidad: 375, unidad: 'g' },
      { nombre: 'Caldo de verduras', cantidad: 2000, unidad: 'ml' },
    ],
  },
  {
    nombre: 'Polenta blanca tres quesos',
    categoria: 'Pastas',
    porciones: 8,
    rendimiento: '8 porciones',
    tiempo_min: 30,
    procedimiento: `1. Poner a calentar una olla con agua, ajo, laurel y la sal.
2. Añadir la polenta. Cocinar revolviendo por 20-25 minutos con batidor de acero.
3. Hacia el final de la coccion agregar aceite de oliva. Seguir batiendo hasta encontrar el punto cremoso.
4. Sumar los quesos. Integrar y reservar tapado.`,
    ingredientes: [
      { nombre: 'Polenta blanca', cantidad: 500, unidad: 'g' },
      { nombre: 'Agua', cantidad: 2500, unidad: 'g' },
      { nombre: 'Ajo', cantidad: 25, unidad: 'g' },
      { nombre: 'Laurel', cantidad: 2, unidad: 'u' },
      { nombre: 'Sal', cantidad: 25, unidad: 'g' },
      { nombre: 'Aceite de oliva', cantidad: 50, unidad: 'ml' },
      { nombre: 'Queso cremoso', cantidad: 300, unidad: 'g' },
      { nombre: 'Queso Sassares', cantidad: 50, unidad: 'g' },
      { nombre: 'Queso Gouwe', cantidad: 150, unidad: 'g' },
    ],
  },

  // ─────────────────────────────────────────────────────
  // PANIFICADOS Y MASAS
  // ─────────────────────────────────────────────────────
  {
    nombre: 'Pan de burgers de boniato',
    categoria: 'Panificados',
    porciones: null,
    rendimiento: null,
    tiempo_min: 120,
    procedimiento: `1. En batidora con gancho amasador trabajar pure de boniato, manteca fundida y huevo hasta integrar.
2. Entibiar leche, azucar y disolver la levadura.
3. Dejar unos minutos hasta que se forme una esponja y agregar a la batidora junto con harina y sal.
4. Amasar hasta que se despegue del bowl y terminar de amasar a mano hasta formar un bollo liso.
5. Dejar levar por 60 minutos.
6. Hacer bollos de 100 gramos y dejar levar 30 minutos.
7. Pincelar con huevo batido con leche, espolvorear con semillas de sesamo y llevar a horno a 190°C por 15 minutos.`,
    ingredientes: [
      { nombre: 'Azucar mascabo', cantidad: 30, unidad: 'g' },
      { nombre: 'Harina 000', cantidad: 500, unidad: 'g' },
      { nombre: 'Huevo', cantidad: 1, unidad: 'u' },
      { nombre: 'Leche', cantidad: 180, unidad: 'g' },
      { nombre: 'Levadura seca', cantidad: 11, unidad: 'g' },
      { nombre: 'Manteca', cantidad: 50, unidad: 'g' },
      { nombre: 'Pure de boniato', cantidad: 200, unidad: 'g' },
      { nombre: 'Sal', cantidad: 8, unidad: 'g' },
      { nombre: 'Sesamo', cantidad: 20, unidad: 'g' },
    ],
  },
  {
    nombre: 'Pastelitos de calabaza y ricota',
    categoria: 'Panificados',
    porciones: null,
    rendimiento: null,
    tiempo_min: null,
    procedimiento: `Relleno:
1. Hornear cabutia entero. Cuando este tierna (1 hs aprox), extraer la pulpa y descartar las semillas.
2. Hacer pure rustico y colocar nuevamente en el horno para evaporar humedad. 1 hora. Enfriar.
3. Batir la ricota con el buthet desgranado hasta integrar. Añadir la calabaza. Reservar.

Hojaldre rapido:
1. Integrar la harina, la sal, los 60g de manteca y el agua. Amasar hasta obtener una masa lisa y homogenea. Dejar descansar 10'.
2. Pomar los 150g de manteca.
3. Estirar la masa hasta obtener unos 2mm de grosor y pincelar con manteca pomada por toda la superficie.
4. Espolvorear con maicena y hacer un pliegue doble, llevando los extremos al centro. Pincelar con manteca pomada, espolvorear con almidon y volver a plegar.
5. Estirar y hacer un pliegue simple. Descansar en frio minimo 12 hs.
6. Dividir en dos partes. Estirar a 2mm de espesor. Cortar en tapas cuadradas de 9x9.
7. Rellenar con 20g de relleno en el centro de cada tapa. Humedecer, cubrir con otra tapa y hacer presion alrededor del relleno.`,
    ingredientes: [
      { nombre: 'Cabutia', cantidad: 1, unidad: 'u' },
      { nombre: 'Ricota', cantidad: 1000, unidad: 'g' },
      { nombre: 'Queso Buthet', cantidad: 250, unidad: 'g' },
      { nombre: 'Harina 0000', cantidad: 1000, unidad: 'g' },
      { nombre: 'Manteca para la masa', cantidad: 120, unidad: 'g' },
      { nombre: 'Manteca para el empaste', cantidad: 150, unidad: 'g' },
      { nombre: 'Sal', cantidad: 50, unidad: 'g' },
      { nombre: 'Maicena', cantidad: 150, unidad: 'g' },
      { nombre: 'Agua', cantidad: 420, unidad: 'g' },
    ],
  },
  {
    nombre: 'Torta de algarroba',
    categoria: 'Panificados',
    porciones: null,
    rendimiento: null,
    tiempo_min: 120,
    procedimiento: `1. Calienta una sarten a fuego bajo.
2. Vierte el azucar en la sarten y deja que se caramelice sin remover (50-60 minutos).
3. Mientras tanto, mezcla los huevos, la sal, la leche condensada y la mantequilla derretida. Bate hasta integrar.
4. Tamiza la harina y el bicarbonato sobre la mezcla de huevo. Bate hasta homogeneizar.
5. Una vez que el azucar se haya convertido en caramelo, apaga el fuego y vierte cuidadosamente el agua caliente. Remueve hasta integrar. Deja enfriar.
6. Incorpora el caramelo a la mezcla de huevo y harina. Remueve bien.
7. Vierte la mezcla en un molde para pan engrasado.
8. Cubre el molde con un pano y deja reposar la mezcla durante al menos 1 hora antes de hornear.
9. Precalienta el horno a 190°C. Hornea durante 35 minutos o hasta que al insertar un palillo, este salga limpio.
10. Deja enfriar sobre una rejilla antes de desmoldar.`,
    ingredientes: [
      { nombre: 'Azucar', cantidad: 200, unidad: 'g' },
      { nombre: 'Agua caliente', cantidad: 240, unidad: 'ml' },
      { nombre: 'Harina de trigo 0000', cantidad: 100, unidad: 'g' },
      { nombre: 'Harina de algarroba', cantidad: 25, unidad: 'g' },
      { nombre: 'Leche condensada', cantidad: 120, unidad: 'g' },
      { nombre: 'Mantequilla', cantidad: 120, unidad: 'g' },
      { nombre: 'Huevos', cantidad: 3, unidad: 'u' },
      { nombre: 'Bicarbonato de sodio', cantidad: 15, unidad: 'g' },
      { nombre: 'Sal', cantidad: 5, unidad: 'g' },
    ],
  },

  // ─────────────────────────────────────────────────────
  // POSTRES
  // ─────────────────────────────────────────────────────
  {
    nombre: 'Cremoso de chocolate',
    categoria: 'Postres',
    porciones: null,
    rendimiento: '1350 g',
    tiempo_min: 45,
    procedimiento: `1. Calentar la crema de leche con el azucar a fuego medio hasta que emita vapor. Evitar que hierva.
2. Fundir el chocolate en microondas (intervalos de 30 segundos, mezclando) o a baño maria.
3. Incorporar la crema caliente sobre el chocolate fundido. Mezclar hasta homogeneizar con movimientos circulares desde el centro.
4. Continuar mezclando hasta lograr una emulsion homogenea y brillante.
5. Dejar enfriar a temperatura ambiente hasta que espese (20-30 min en frio / 45-60 min en calor).
6. Agregar el licor y batir a velocidad alta hasta incorporar aire y obtener textura aireada.
7. Enfriar.`,
    ingredientes: [
      { nombre: 'Chocolate 65%', cantidad: 600, unidad: 'g' },
      { nombre: 'Crema 44%', cantidad: 540, unidad: 'g' },
      { nombre: 'Leche', cantidad: 150, unidad: 'g' },
      { nombre: 'Azucar', cantidad: 150, unidad: 'g' },
      { nombre: 'Licor de nispero', cantidad: 90, unidad: 'ml' },
    ],
  },
  {
    nombre: 'Mousse de cafe',
    categoria: 'Postres',
    porciones: null,
    rendimiento: null,
    tiempo_min: 30,
    procedimiento: `1. Hidratar la gelatina en agua.
2. Separar las yemas de las claras, y montar las claras a punto de nieve. Reservar en heladera.
3. Montar la crema ligeramente, no debe estar demasiado firme. Reservar en heladera.
4. En un cazo al fuego poner las yemas con el azucar, revolver y agregar el cafe liquido poco a poco sin dejar de revolver. Dejar cocer unos minutos hasta que la mezcla tome consistencia. Retirar del fuego, agregar la gelatina removiendo hasta que se disuelva.
5. Dejar templar.
6. Incorporar la nata semimontada en dos veces. Por ultimo incorporar las claras montadas con movimientos envolventes.`,
    ingredientes: [
      { nombre: 'Azucar', cantidad: 75, unidad: 'g' },
      { nombre: 'Crema', cantidad: 125, unidad: 'g' },
      { nombre: 'Cafe', cantidad: 60, unidad: 'ml' },
      { nombre: 'Huevos', cantidad: 3, unidad: 'u' },
      { nombre: 'Gelatina', cantidad: 2, unidad: 'g' },
    ],
  },
  {
    nombre: 'Crema de mandarina',
    categoria: 'Postres',
    porciones: null,
    rendimiento: null,
    tiempo_min: 20,
    procedimiento: `1. Hidratar la gelatina.
2. En un bowl batir yemas con el azucar. Reservar.
3. Calentar en un cazo el jugo de mandarina, con la manteca y las ralladuras. Dejar que hierva, y verter esta mezcla sobre las yemas. Mezclar bien, pasar por un colador y devolver al cazo. Cocer durante 10 minutos removiendo con varillas.
4. Retirar del fuego e incorporar la gelatina removiendo bien hasta que se disuelva completamente.
5. Verter la crema de mandarina en el molde, llenando un dedo de grosor. Guardar en heladera.`,
    ingredientes: [
      { nombre: 'Azucar', cantidad: 100, unidad: 'g' },
      { nombre: 'Yemas', cantidad: 3, unidad: 'u' },
      { nombre: 'Jugo de mandarina', cantidad: 200, unidad: 'ml' },
      { nombre: 'Mandarina ralladura', cantidad: 1, unidad: 'u' },
      { nombre: 'Limon ralladura', cantidad: null, unidad: 'u' },
      { nombre: 'Manteca pomada', cantidad: 50, unidad: 'g' },
      { nombre: 'Gelatina', cantidad: 4, unidad: 'g' },
    ],
  },
  {
    nombre: 'Frichei',
    categoria: 'Postres',
    porciones: null,
    rendimiento: null,
    tiempo_min: 60,
    procedimiento: `1. Masa: Tamiza la harina con el polvo de hornear sobre la mesada y forma una corona. Coloca en el centro los huevos batidos, el azucar, la sal, el licor y la manteca derretida. Amasa con energia hasta que la masa este lisa. Forma un bollo, envuelvelo en film y dejalo reposar 30 minutos a temperatura ambiente.
2. Corta la masa en 4 partes. Enharinar la mesada y estirar cada parte con palo de amasar, hasta el ajuste mas fino. La masa debe quedar fina, de unos 2 mm de grosor.
3. Con una ruedita dentada, cortar tiras de 5 cm de ancho. Luego cortar cada tira en rectangulos de 8-10 cm. Hacer 1 o 2 cortes en el centro de cada rectangulo.
4. Freir: Calentar el aceite a 170-180°C. Freir, solo unos segundos por lado, hasta que esten doradas. Retirar con espumadera y escurrir.
5. Una vez frias, espolvorear con azucar impalpable de mandarina.`,
    ingredientes: [
      { nombre: 'Harina', cantidad: 250, unidad: 'g' },
      { nombre: 'Yema', cantidad: 1, unidad: 'u' },
      { nombre: 'Huevo', cantidad: 1, unidad: 'u' },
      { nombre: 'Manteca derretida', cantidad: 25, unidad: 'g' },
      { nombre: 'Leche', cantidad: 30, unidad: 'ml' },
      { nombre: 'Azucar', cantidad: 50, unidad: 'g' },
      { nombre: 'Grappa', cantidad: 50, unidad: 'ml' },
      { nombre: 'Ralladura de mandarina', cantidad: 1, unidad: 'u' },
      { nombre: 'Sal', cantidad: 5, unidad: 'g' },
      { nombre: 'Polvo para hornear', cantidad: 5, unidad: 'g' },
    ],
  },
  {
    nombre: 'Panacota de banana y dulce de leche',
    categoria: 'Postres',
    porciones: null,
    rendimiento: null,
    tiempo_min: 30,
    procedimiento: `1. Cocinar las bananas con la manteca. Procesar. Integrar la leche.
2. Hacer un caramelo liquido.
3. Cubrir los moldes de caramelo.
4. Activar la gelatina: hidratar, calentar en micro.
5. Integrar la gelatina con la mezcla.
6. Colocar en los moldes acaramelados y refrigerar.`,
    ingredientes: [
      { nombre: 'Bananas', cantidad: 4, unidad: 'u' },
      { nombre: 'Manteca', cantidad: 40, unidad: 'g' },
      { nombre: 'Dulce de leche', cantidad: 160, unidad: 'g' },
      { nombre: 'Leche', cantidad: 1000, unidad: 'ml' },
      { nombre: 'Azucar', cantidad: 200, unidad: 'g' },
      { nombre: 'Gelatina', cantidad: 60, unidad: 'g' },
    ],
  },
  {
    nombre: 'Peras pochadas en vino',
    categoria: 'Postres',
    porciones: 5,
    rendimiento: '5 porciones',
    tiempo_min: 80,
    procedimiento: `1. Mezclar el champagne con el azucar, la piel del limon, las pimientas largas, el anis estrellado, la lavanda y la rama de canela. Llevar todo a ebullicion. Mientras tanto, pelar las peras.
2. Cuando el liquido rompa hervor, agregar las peras y asegurarse de que queden completamente sumergidas. Cubrir la superficie con un circulo de papel manteca.
3. Dejar pochar a fuego bajo durante 1 hora. Luego apagar el fuego y dejar enfriar por completo.
4. Retirar las peras del liquido. Reducir el liquido a un jarabe y pasar por colador fino. Usar para glasear las peras.
5. Cortar las peras pochadas por la mitad, retirar el centro con una cucharita parisina. Guardar en heladera hasta el momento de usar.`,
    ingredientes: [
      { nombre: 'Champagne o vino blanco', cantidad: 900, unidad: 'g' },
      { nombre: 'Azucar', cantidad: 180, unidad: 'g' },
      { nombre: 'Limon', cantidad: 1, unidad: 'u' },
      { nombre: 'Pimienta larga', cantidad: 5, unidad: 'u' },
      { nombre: 'Lavanda', cantidad: 10, unidad: 'g' },
      { nombre: 'Anis estrellado', cantidad: 1, unidad: 'u' },
      { nombre: 'Canela en rama', cantidad: 1, unidad: 'u' },
      { nombre: 'Peras', cantidad: 5, unidad: 'u' },
    ],
  },
  {
    nombre: 'Panqueques con dulce de leche',
    categoria: 'Postres',
    porciones: 70,
    rendimiento: '70 unidades',
    tiempo_min: null,
    procedimiento: `1. Batir los huevos, con la leche, la sal, la manteca derretida y la ralladura de naranja. Agregar e integrar la harina tamizada.
2. Reservar por 1 dia.
3. Enmantecar una sarten y cocinar los panqueques a fuego bajo.
4. Crema dulce de leche: infusionar la leche con el hinojo y el jengibre. Colar. Espesar la leche con la maicena. Batir el dulce de leche con la leche infusionada y el jugo de naranja. Enfriar y colocar en manga.
5. Azucar para terminar: sacar la ralladura de los limones y la naranja en papel antiadherente. Dejar orear para que se sequen. Mezclar las azucares y la ralladura.`,
    ingredientes: [
      { nombre: 'Huevos', cantidad: 20, unidad: 'u' },
      { nombre: 'Azucar', cantidad: 200, unidad: 'g' },
      { nombre: 'Sal', cantidad: 10, unidad: 'g' },
      { nombre: 'Leche', cantidad: 2600, unidad: 'ml' },
      { nombre: 'Harina 0000', cantidad: 1300, unidad: 'g' },
      { nombre: 'Ralladura de naranja', cantidad: 5, unidad: 'u' },
      { nombre: 'Manteca derretida', cantidad: 300, unidad: 'g' },
      { nombre: 'Dulce de leche', cantidad: 3000, unidad: 'g' },
      { nombre: 'Jugo de naranja', cantidad: 5, unidad: 'u' },
      { nombre: 'Hinojo', cantidad: 200, unidad: 'g' },
      { nombre: 'Maicena', cantidad: 50, unidad: 'g' },
    ],
  },

  // ─────────────────────────────────────────────────────
  // GARNISHES Y COMPLEMENTOS
  // ─────────────────────────────────────────────────────
  {
    nombre: 'Tarteleta de apio',
    categoria: 'Garnishes',
    porciones: null,
    rendimiento: null,
    tiempo_min: 70,
    procedimiento: `1. Procesar el apio con el agua, el aceite verde, la yema de huevo y la sal. Procesar hasta obtener una mezcla lisa de color uniforme.
2. Colocar la harina sobre la mesada y formar un hueco en el centro. Verter alli la mezcla y comenzar a integrar desde el centro hacia afuera.
3. Amasar hasta obtener una masa homogenea y lisa.
4. Dejar reposar en la heladera durante al menos 1 hora.
5. Colocar la masa sobre una superficie enharinada y estirarla hasta 2-3 mm de espesor.
6. Cortar circulos con un cortante redondo grande.
7. Colocar los discos sobre moldes de tarteleta y cubrirlos con otra tartaleta por encima.
8. Poner otra bandeja encima para mantener la forma y hornear a 150°C durante aproximadamente 40 minutos.
9. Una vez horneados, rebajar la superficie con un microplane. Conservar en un lugar seco y bien cubiertos.`,
    ingredientes: [
      { nombre: 'Apio hojas', cantidad: 20, unidad: 'g' },
      { nombre: 'Apio en polvo', cantidad: 20, unidad: 'g' },
      { nombre: 'Agua', cantidad: 40, unidad: 'g' },
      { nombre: 'Aceite verde', cantidad: 20, unidad: 'g' },
      { nombre: 'Yema', cantidad: 15, unidad: 'g' },
      { nombre: 'Sal', cantidad: 3, unidad: 'g' },
      { nombre: 'Harina', cantidad: 160, unidad: 'g' },
    ],
  },
  {
    nombre: 'Tarteleta de polenta',
    categoria: 'Garnishes',
    porciones: null,
    rendimiento: null,
    tiempo_min: 60,
    procedimiento: `1. Transferir la harina a la mesada y hacer un hueco en el centro. Llenar el hueco con la polenta, el agua, el aceite de maiz, la yema de huevo, la sal y el azucar. Mezclar todo y amasar hasta obtener una masa uniforme. Dejar reposar en heladera por al menos 30 minutos.
2. Espolvorear la mesada con harina y estirar la masa hasta 3 mm de espesor. Cortar con un cortante redondo.
3. Colocar los discos sobre moldes de tarteletas invertidos y poner otro molde encima. No apilar mas de 4 tarteletas.
4. Hornear a 160°C hasta que esten doradas, unos 20-25 minutos. Retirar aun calientes y guardar en lugar seco.`,
    ingredientes: [
      { nombre: 'Harina', cantidad: 100, unidad: 'g' },
      { nombre: 'Polenta', cantidad: 70, unidad: 'g' },
      { nombre: 'Agua', cantidad: 60, unidad: 'g' },
      { nombre: 'Aceite de maiz', cantidad: 20, unidad: 'g' },
      { nombre: 'Yema de huevo', cantidad: 1, unidad: 'u' },
      { nombre: 'Sal', cantidad: 3, unidad: 'g' },
      { nombre: 'Azucar', cantidad: 8, unidad: 'g' },
    ],
  },
  {
    nombre: 'Sarraceno pop',
    categoria: 'Garnishes',
    porciones: null,
    rendimiento: null,
    tiempo_min: 150,
    procedimiento: `1. Sazonar con sal una olla de agua hirviendo y cocinar trigo sarraceno durante unos 15 minutos. No tener miedo de pasarse de coccion. Escurrir el agua y dejar reposar durante 5 minutos.
2. Extender el trigo sarraceno sobre una lamina de silicona y dejar secar a 50°C durante un par de horas, removiendolo de vez en cuando hasta que toda la humedad se haya evaporado.
3. Freir el trigo sarraceno seco en aceite a 220°C durante unos segundos hasta que se infle y quede muy crujiente. Pasar enseguida a una bandeja cubierta con papel de cocina y sazonar inmediatamente con sal. Conservar en un lugar seco y tapado.`,
    ingredientes: [
      { nombre: 'Trigo sarraceno', cantidad: null, unidad: 'g' },
      { nombre: 'Sal', cantidad: null, unidad: 'g' },
      { nombre: 'Aceite', cantidad: null, unidad: 'ml' },
    ],
  },
  {
    nombre: 'Tuile de cacao',
    categoria: 'Garnishes',
    porciones: null,
    rendimiento: null,
    tiempo_min: 20,
    procedimiento: `1. Mezclar la clara de huevo con la harina, el cacao en polvo, la manteca, el azucar y el aceite de girasol. Licuar hasta suavizar.
2. Extender en un molde de tuile.
3. Hornear a 160°C por 15 minutos.
4. Cuando aun este caliente, retirar directamente del molde.
5. Conservar seco y cubierto.`,
    ingredientes: [
      { nombre: 'Clara de huevo', cantidad: 60, unidad: 'g' },
      { nombre: 'Harina', cantidad: 25, unidad: 'g' },
      { nombre: 'Cacao en polvo', cantidad: 25, unidad: 'g' },
      { nombre: 'Manteca', cantidad: 10, unidad: 'g' },
      { nombre: 'Azucar', cantidad: 50, unidad: 'g' },
      { nombre: 'Aceite de girasol', cantidad: 40, unidad: 'g' },
    ],
  },
  {
    nombre: 'Pangrattato',
    categoria: 'Garnishes',
    porciones: null,
    rendimiento: '250 g',
    tiempo_min: 15,
    procedimiento: `1. Procesar el pan hasta lograr textura de migas grandes.
2. Picar muy fino el ajo, colocarlo con el aceite en una sarten, calentar a fuego bajo.
3. Añadir el pan. Tostar/dorar.
4. Agregar la sal y perejil.`,
    ingredientes: [
      { nombre: 'Pan viejo', cantidad: 200, unidad: 'g' },
      { nombre: 'Ajo picado', cantidad: 3, unidad: 'g' },
      { nombre: 'Aceite de oliva', cantidad: 30, unidad: 'g' },
      { nombre: 'Perejil picado', cantidad: 10, unidad: 'g' },
      { nombre: 'Sal', cantidad: null, unidad: 'g' },
    ],
  },

  // ─────────────────────────────────────────────────────
  // "SALADAS" — doc con varias recetas separadas
  // ─────────────────────────────────────────────────────
  {
    nombre: 'Kebab',
    categoria: 'Principales',
    porciones: null,
    rendimiento: null,
    tiempo_min: null,
    procedimiento: `Preparar la carne picada mezclada con los condimentos. Formar los kebabs y grillar.`,
    ingredientes: [
      { nombre: 'Falda / pecho / costilla', cantidad: 1000, unidad: 'g' },
      { nombre: 'Cebolla morada', cantidad: 250, unidad: 'g' },
      { nombre: 'Aji picante', cantidad: 25, unidad: 'g' },
      { nombre: 'Pimiento', cantidad: 100, unidad: 'g' },
      { nombre: 'Ajo', cantidad: 25, unidad: 'g' },
      { nombre: 'Cebolla morada', cantidad: 50, unidad: 'g' },
      { nombre: 'Perejil', cantidad: 50, unidad: 'g' },
      { nombre: 'Cilantro', cantidad: 20, unidad: 'g' },
      { nombre: 'Menta', cantidad: 20, unidad: 'g' },
    ],
  },
  {
    nombre: 'Lengua grillada',
    categoria: 'Principales',
    porciones: null,
    rendimiento: null,
    tiempo_min: null,
    procedimiento: `1. Marinar la lengua por 24 hs en una solucion de agua con el 2% de sal y azucar, mas los aromaticos.
2. Cocinar la lengua en un hervido suave (simmer) hasta que la piel se desprenda facilmente (1.5 a 2 hs).
3. Retirar la piel. Enfriar. Porcionar.
4. Grillar a fuego fuerte.`,
    ingredientes: [
      { nombre: 'Lengua', cantidad: 1000, unidad: 'g' },
      { nombre: 'Agua', cantidad: 1000, unidad: 'g' },
      { nombre: 'Azucar', cantidad: 20, unidad: 'g' },
      { nombre: 'Sal', cantidad: 20, unidad: 'g' },
      { nombre: 'Pimienta negra en grano', cantidad: 1, unidad: 'g' },
      { nombre: 'Coriandro en grano', cantidad: 1, unidad: 'g' },
      { nombre: 'Aji criollo molido', cantidad: 1, unidad: 'g' },
      { nombre: 'Ajo en polvo', cantidad: 1, unidad: 'g' },
      { nombre: 'Laurel', cantidad: 1, unidad: 'u' },
    ],
  },
  {
    nombre: 'Salchicha de la casa',
    categoria: 'Principales',
    porciones: null,
    rendimiento: null,
    tiempo_min: null,
    procedimiento: `1. Mezclar todos los ingredientes. Amasado intenso para mejorar la mezcla y evitar el desgrano. Golpear contra mesada en forma de bolas.
2. Molienda: disco 4mm.`,
    ingredientes: [
      { nombre: 'Bondiola', cantidad: 5000, unidad: 'g' },
      { nombre: 'Sal', cantidad: 75, unidad: 'g' },
      { nombre: 'Pimienta negra', cantidad: 25, unidad: 'g' },
      { nombre: 'Pimentones y ajies', cantidad: 80, unidad: 'g' },
      { nombre: 'Ajo', cantidad: 1, unidad: 'diente' },
      { nombre: 'Jengibre', cantidad: null, unidad: 'g' },
      { nombre: 'Agua', cantidad: 100, unidad: 'ml' },
      { nombre: 'Vermouth o vino torrontes', cantidad: 200, unidad: 'ml' },
      { nombre: 'Melisa', cantidad: null, unidad: 'g' },
      { nombre: 'Cedron', cantidad: null, unidad: 'g' },
      { nombre: 'Salvia', cantidad: null, unidad: 'g' },
      { nombre: 'Pasas de ciruelas', cantidad: 250, unidad: 'g' },
      { nombre: 'Nueces o castañas', cantidad: 250, unidad: 'g' },
    ],
  },
  {
    nombre: 'Costilla marinada con miso',
    categoria: 'Principales',
    porciones: null,
    rendimiento: null,
    tiempo_min: null,
    procedimiento: `1. Porcionar costillas en unidades de 500g. Pinchar la carne para que penetre la marinada.
2. Masajear con pasta de miso y salsa de soja. Reservar 24 hs cubierto.
3. Realizar un caldo de coccion con salsa de soja, miso, salsa inglesa, agua, clavo, laurel.
4. Sellar de ambos lados a fuego fuerte. Reservar.
5. Hacer una mirepoix con ajo, cebolla, remolacha, manzana, apio. Dorar vegetales. Retirar del fuego y agregar las costillas. Añadir caldo de coccion. Cubrir con papel aluminio.
6. Cocinar varias horas a fuego suave sobre mirepoix.
7. Reconstituir en horno fuerte con caldo de coccion por 5'.`,
    ingredientes: [
      { nombre: 'Costilla', cantidad: 3500, unidad: 'g' },
      { nombre: 'Miso', cantidad: 350, unidad: 'g' },
      { nombre: 'Salsa de soja', cantidad: 100, unidad: 'ml' },
      { nombre: 'Cebolla', cantidad: 300, unidad: 'g' },
      { nombre: 'Manzana', cantidad: 250, unidad: 'g' },
      { nombre: 'Remolacha', cantidad: 300, unidad: 'g' },
      { nombre: 'Ajo', cantidad: 50, unidad: 'g' },
      { nombre: 'Apio', cantidad: 150, unidad: 'g' },
      { nombre: 'Salsa de soja para el caldo', cantidad: 200, unidad: 'ml' },
      { nombre: 'Agua', cantidad: 350, unidad: 'ml' },
      { nombre: 'Salsa inglesa', cantidad: 60, unidad: 'ml' },
      { nombre: 'Miso para el caldo', cantidad: 100, unidad: 'g' },
      { nombre: 'Clavo de olor', cantidad: 4, unidad: 'u' },
      { nombre: 'Laurel', cantidad: 2, unidad: 'u' },
    ],
  },
  {
    nombre: 'Pure de zapallo cabutier',
    categoria: 'Salsas y Bases',
    porciones: null,
    rendimiento: null,
    tiempo_min: 60,
    procedimiento: `1. Hornear los zapallos hasta que esten blandos.
2. Retirar la carne y procesar en licuadora.
3. Salpimentar. Regular textura agregando aceite de a poco.`,
    ingredientes: [
      { nombre: 'Zapallo cabutier', cantidad: 2, unidad: 'u' },
      { nombre: 'Sal', cantidad: 30, unidad: 'g' },
      { nombre: 'Pimienta', cantidad: 15, unidad: 'g' },
      { nombre: 'Aceite de girasol', cantidad: 100, unidad: 'ml' },
    ],
  },
  {
    nombre: 'Pure de arvejas',
    categoria: 'Salsas y Bases',
    porciones: null,
    rendimiento: null,
    tiempo_min: 15,
    procedimiento: `1. Calentar una sarten con un poco de oliva. Dorar ligeramente la cebolla y el ajo. Agregar las arvejas congeladas. Salpimentar y cocinar 2 minutos. Desglasar con vino, cocinar hasta evaporar alcohol.
2. Procesar en licuadora, agregar jugo de limon y aceite de oliva para suavizar hasta lograr textura lisa.`,
    ingredientes: [
      { nombre: 'Arvejas congeladas', cantidad: 140, unidad: 'g' },
      { nombre: 'Cebolla picada', cantidad: 50, unidad: 'g' },
      { nombre: 'Ajo picado', cantidad: 10, unidad: 'g' },
      { nombre: 'Aceite de oliva', cantidad: 100, unidad: 'ml' },
      { nombre: 'Vino blanco', cantidad: 60, unidad: 'ml' },
      { nombre: 'Jugo de limon', cantidad: 60, unidad: 'ml' },
    ],
  },
  {
    nombre: 'Confitura de remolachas balsamicas',
    categoria: 'Salsas y Bases',
    porciones: null,
    rendimiento: null,
    tiempo_min: 60,
    procedimiento: `1. Colocar las remolachas en mitades en una placa para horno. Rociar con oliva y aceto. Espolvorear con sal. Asar hasta que esten tiernas y caramelizadas. Pelarlas.
2. Procesar 3/4 de las remolachas en licuadora con aceite hasta que quede una pulpa lisa.
3. Saltear la cebolla en una sarten. Agregar el azucar, vinagre y limon. Incorporar el pure de remolachas y el tomillo. Reducir a fuego moderado por 30'.
4. Cortar las remolachas reservadas en cubitos y mezclar con la confitura.`,
    ingredientes: [
      { nombre: 'Remolachas', cantidad: 1500, unidad: 'g' },
      { nombre: 'Aceite de oliva', cantidad: 100, unidad: 'ml' },
      { nombre: 'Aceto balsamico', cantidad: 70, unidad: 'ml' },
      { nombre: 'Sal', cantidad: 30, unidad: 'g' },
      { nombre: 'Cebolla morada', cantidad: 250, unidad: 'g' },
      { nombre: 'Azucar mascabo', cantidad: 55, unidad: 'g' },
      { nombre: 'Vinagre de vino', cantidad: 125, unidad: 'ml' },
      { nombre: 'Jugo de limon', cantidad: 70, unidad: 'ml' },
    ],
  },
  {
    nombre: 'Manteca de hierbas ahumada',
    categoria: 'Salsas y Bases',
    porciones: null,
    rendimiento: null,
    tiempo_min: 40,
    procedimiento: `1. Colocar la manteca dentro de un bowl metalico. A su vez colocar el bowl dentro de una olla, encender los chips y tapar. Dejar tapado por 30'.
2. Agregar las hierbas picadas. Batir, enrolar en film. Refrigerar.`,
    ingredientes: [
      { nombre: 'Manteca', cantidad: 250, unidad: 'g' },
      { nombre: 'Tomillo', cantidad: null, unidad: 'g' },
      { nombre: 'Salvia', cantidad: null, unidad: 'g' },
      { nombre: 'Oregano', cantidad: null, unidad: 'g' },
      { nombre: 'Perejil', cantidad: null, unidad: 'g' },
    ],
  },
  {
    nombre: 'Dumplings de bondiola',
    categoria: 'Entrantes',
    porciones: null,
    rendimiento: '20 unidades',
    tiempo_min: 60,
    procedimiento: `Masa:
1. Amasar unos 10 minutos hasta que queda una masa compacta y lisa. Reposar 30' minimo. Estirar con pastalinda hasta el numero 7. Cortar con disco de 7-8 cm de diametro.

Relleno de bondiola:
1. Mezclar todo en un bowl hasta que se forme una masa. Refrigerar y reposar.

Armado:
1. Colocar una cucharada de relleno en el centro, pintar los bordes con agua y doblar en forma de empanada. Unir las puntas con el menique en el medio.

Coccion:
1. Calentar una sarten con una fina pelicula de aceite neutro. Colocarlos hasta que doren la base (2-3 min, sin mover). Arrojar una taza de agua y tapar, cocinar al vapor por 4-5 minutos mas. Servir con caldo y sriracha.`,
    ingredientes: [
      { nombre: 'Harina 000', cantidad: 250, unidad: 'g' },
      { nombre: 'Agua caliente', cantidad: 125, unidad: 'g' },
      { nombre: 'Fecula de maiz', cantidad: 50, unidad: 'g' },
      { nombre: 'Bondiola picada', cantidad: 500, unidad: 'g' },
      { nombre: 'Verdeo', cantidad: 150, unidad: 'g' },
      { nombre: 'Jengibre', cantidad: 50, unidad: 'g' },
      { nombre: 'Ajo', cantidad: 50, unidad: 'g' },
      { nombre: 'Repollo o akusai', cantidad: null, unidad: 'g' },
      { nombre: 'Salsa de soja', cantidad: null, unidad: 'ml' },
      { nombre: 'Vinagre de arroz', cantidad: null, unidad: 'ml' },
      { nombre: 'Mirin', cantidad: null, unidad: 'ml' },
      { nombre: 'Aceite de sesamo', cantidad: null, unidad: 'ml' },
      { nombre: 'Sal', cantidad: 15, unidad: 'g' },
      { nombre: 'Azucar', cantidad: 25, unidad: 'g' },
      { nombre: 'Aji molido', cantidad: 5, unidad: 'g' },
    ],
  },
]

async function main() {
  if (!SERVICE_KEY) {
    console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY no esta definida')
    process.exit(1)
  }

  // Verificar cuales ya existen para no duplicar
  const { data: existentes } = await supabase
    .from('recetas')
    .select('nombre')
    .eq('restaurante_id', RESTAURANTE_ID)

  const nombresExistentes = new Set((existentes || []).map(r => normalize(r.nombre)))

  const { data: productos } = await supabase
    .from('productos')
    .select('id, nombre, precio_unitario, unidad')
    .eq('restaurante_id', RESTAURANTE_ID)
    .eq('activo', true)

  console.log(`Productos en stock: ${productos?.length ?? 0}`)
  console.log(`Recetas existentes: ${nombresExistentes.size}`)
  console.log(`Recetas a procesar: ${RECETAS.length}`)
  console.log()

  let insertadas = 0, saltadas = 0, errores = 0

  for (const r of RECETAS) {
    if (nombresExistentes.has(normalize(r.nombre))) {
      console.log(`  SKIP (ya existe): ${r.nombre}`)
      saltadas++
      continue
    }

    const recetaId = randomUUID()
    const { error: errR } = await supabase.from('recetas').insert({
      id: recetaId,
      nombre: r.nombre,
      categoria: r.categoria,
      porciones: r.porciones ?? 1,
      tiempo_min: r.tiempo_min ?? 0,
      procedimiento: r.procedimiento,
      restaurante_id: RESTAURANTE_ID,
      activa: true,
      status: 'published',
    })
    if (errR) {
      console.error(`  ERROR ${r.nombre}: ${errR.message}`)
      errores++
      continue
    }

    const ingsToInsert = []
    for (const ing of (r.ingredientes || [])) {
      const match = await findProductoId(ing.nombre, productos || [])
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
    if (ingsToInsert.length > 0) {
      const { error: errI } = await supabase.from('ingredientes').insert(ingsToInsert)
      if (errI) console.error(`  WARN ${r.nombre} ings: ${errI.message}`)
    }
    const vinc = ingsToInsert.filter(i => i.producto_id).length
    console.log(`  OK ${r.nombre} — ${ingsToInsert.length} ings (${vinc} vinculados)`)
    insertadas++
  }

  console.log()
  console.log(`Resultado: ${insertadas} insertadas, ${saltadas} ya existian, ${errores} errores`)
}

main().catch(e => { console.error(e); process.exit(1) })
