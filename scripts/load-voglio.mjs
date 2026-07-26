// ============================================================
// Carga VOGLIO Farina (pastas) a KitchenOS — cuenta nueva + catálogo completo
// desde el Excel de costeo. Ver plan:
//   C:\Users\Equipo\.claude\plans\email-facuastrada15-gmail-com-contrase-a-splendid-pudding.md
//
// Uso:
//   node scripts/load-voglio.mjs            (dry-run — parsea, calcula y compara food cost)
//   node scripts/load-voglio.mjs --apply    (aplica contra Supabase real)
//
// JS puro (sin anotaciones TS). Lee .env.local con readFileSync (Variante B,
// mismo patrón que scripts/recategorizar-productos.mjs).
// ============================================================
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import XLSX from 'xlsx'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(1)
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

const APPLY = process.argv.includes('--apply')
const EXCEL_PATH = 'C:/Users/Equipo/Desktop/VOGLIO/KOS/Voglio Farina - Proveedores y Costeo.xlsx'

const RESTAURANTE_ID = '00000000-0000-0000-0000-000000000003'
const EMAIL = 'facuastrada15@gmail.com'
const PASSWORD = 'Vogliofarina'

// Debe quedar en sync con lib/constants.ts (MODULOS_EMPRENDIMIENTO, Fase B)
const MODULOS_EMPRENDIMIENTO = [
  'home', 'stock', 'proveedores', 'recetario', 'carta', 'produccion',
  'pedidos', 'ventas', 'reportes', 'merma', 'facturas', 'configuracion', 'coach',
]

// ────────────────────────────────────────────────────────────
// Helpers genéricos
// ────────────────────────────────────────────────────────────
function norm(s) {
  return (s ?? '').toString().toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ')
}
function hasContent(v) {
  return v !== null && v !== undefined && v !== ''
}
function wordOverlap(a, b) {
  const words = s => s.split(' ').filter(w => w.length > 2)
  const wa = words(a), wb = new Set(words(b))
  if (wa.length === 0 || wb.size === 0) return 0
  return wa.filter(w => wb.has(w)).length / Math.min(wa.length, wb.size)
}
// Matcher 3 niveles (mismo patrón que scripts/autolink-ingredientes.mjs)
function findMatch(nombre, items, getNombre) {
  const n = norm(nombre)
  const exact = items.find(it => norm(getNombre(it)) === n)
  if (exact) return { item: exact, conf: 'exacto' }
  const contains = items.find(it => { const pn = norm(getNombre(it)); return pn.includes(n) || (n.length >= 4 && n.includes(pn)) })
  if (contains) return { item: contains, conf: 'parcial' }
  let best, score = 0
  for (const it of items) { const s = wordOverlap(n, norm(getNombre(it))); if (s >= 0.7 && s > score) { score = s; best = it } }
  if (best) return { item: best, conf: 'fuzzy' }
  return null
}

// ────────────────────────────────────────────────────────────
// Categorización de productos (16 categorías canónicas — reglas de
// scripts/recategorizar-productos.mjs + overrides puntuales de VOGLIO)
// ────────────────────────────────────────────────────────────
const CATEGORIA_KEYWORDS = {
  Carnes: ['bife', 'lomo', 'pollo', 'cerdo', 'cordero', 'ternera', 'carne', 'jamon', 'panceta', 'morcilla', 'chorizo', 'matambre', 'milanesa', 'bondiola', 'pechuga', 'molida', 'marucha', 'vacio', 'asado'],
  Pescados: ['salmon', 'atun', 'merluza', 'trucha', 'langostino', 'camaron', 'calamar', 'pulpo', 'mejillon', 'marisco'],
  Verduras: ['cebolla', 'tomate', 'zanahoria', 'papa', 'lechuga', 'rucula', 'espinaca', 'apio', 'ajo', 'perejil', 'albahaca', 'romero', 'tomillo', 'zapallo', 'calabaza', 'verdeo'],
  Frutas: ['manzana', 'pera', 'naranja', 'limon', 'lima', 'banana', 'frutilla'],
  Lácteos: ['leche', 'crema', 'queso', 'manteca', 'mantequilla', 'yogur', 'ricota', 'mozzarella', 'parmesano', 'mascarpone', 'huevo'],
  Panadería: ['harina', 'levadura', 'pan rallado'],
  Secos: ['arroz', 'quinoa', 'fideo', 'pasta', 'lenteja', 'poroto', 'garbanzo', 'azucar', 'sal', 'gelatina', 'semola', 'semolin', 'nuez', 'almendra', 'mani', 'bicarbonato'],
  Especias: ['pimienta', 'comino', 'oregano', 'curry', 'paprika', 'jengibre', 'canela', 'laurel', 'nuez moscada', 'mostaza', 'pimenton', 'ajimomoto', 'ajinomoto', 'msg'],
  Bebidas: ['vino', 'cerveza', 'agua', 'gaseosa', 'jugo', 'cafe'],
  Aceites: ['aceite', 'oliva', 'girasol'],
  Vinagres: ['vinagre', 'aceto', 'balsamico'],
  Conservas: ['pure de tomate', 'extracto de tomate', 'aceitunas', 'alcaparra', 'conserva'],
  Congelados: ['congelado', 'frozen'],
  Limpieza: ['detergente', 'lavandina', 'jabon', 'desengrasante'],
  Descartables: ['servilleta', 'bolsa', 'papel', 'guantes', 'cofia', 'film', 'descartable', 'vaso', 'sorbete', 'caja', 'box', 'folex'],
  Otros: [],
}
const PRIORIDAD = [
  'Limpieza', 'Descartables', 'Aceites', 'Vinagres', 'Conservas', 'Carnes', 'Pescados',
  'Lácteos', 'Especias', 'Panadería', 'Secos', 'Frutas', 'Verduras', 'Bebidas', 'Congelados',
]
function categorizarRule(nombre) {
  const n = norm(nombre)
  for (const cat of PRIORIDAD) {
    if (CATEGORIA_KEYWORDS[cat].some(kw => n.includes(norm(kw)))) return cat
  }
  return 'Otros'
}

// ────────────────────────────────────────────────────────────
// Nombres "de fantasía" (display) — la planilla usa mayúsculas/typos;
// se limpian para mostrar bien en la app. Las claves son los nombres
// RAW tal como aparecen en el Excel (usadas también para el lookup).
// ────────────────────────────────────────────────────────────
const RECETA_DISPLAY = {
  'Masa de pasta': 'Masa de Pasta',
  'Relleno zapallo': 'Relleno de Zapallo',
  'Relleno ricotta y espinca': 'Relleno de Ricotta y Espinaca',
  'Relleno jamon y queso': 'Relleno de Jamón y Queso',
  'Relleno carne braseada': 'Relleno de Carne Braseada',
  'Ñoquis': 'Ñoquis de Papa',
  'Queso Roamanito': 'Queso Romanito',
  'Pure de tomate Voglio': 'Puré de Tomate',
  'Filetto': 'Filetto',
  'Bolognesa': 'Bolognesa',
}
const RECETA_CATEGORIA = {
  'Masa de pasta': 'Masas',
  'Relleno zapallo': 'Rellenos',
  'Relleno ricotta y espinca': 'Rellenos',
  'Relleno jamon y queso': 'Rellenos',
  'Relleno carne braseada': 'Rellenos',
  'Ñoquis': 'Masas',
  'Queso Roamanito': 'Salsas',
  'Pure de tomate Voglio': 'Bases',
  'Filetto': 'Salsas',
  'Bolognesa': 'Salsas',
}

const PLATO_DISPLAY = {
  'SORRENTINO ZAPALLO BOLO': 'Sorrentino de Zapallo con Bolognesa',
  'SORRENTINO ZAPALLO FILETTO': 'Sorrentino de Zapallo con Filetto',
  'SORRENTINO ESPINACA BOLO': 'Sorrentino de Ricotta y Espinaca con Bolognesa',
  'SORRENTINO ESPINACA FILETTO': 'Sorrentino de Ricotta y Espinaca con Filetto',
  'SORRENTINO J&Q BOLO': 'Sorrentino de Jamón y Queso con Bolognesa',
  'SORRENTINO J&Q FILETTO': 'Sorrentino de Jamón y Queso con Filetto',
  'SORRENTINO MARUCHA BOLO': 'Sorrentino de Carne Braseada con Bolognesa',
  'SORRENTINO MARUCHA FILETTO': 'Sorrentino de Carne Braseada con Filetto',
  'ÑOQUIS DE PAPA BOLO': 'Ñoquis de Papa con Bolognesa',
  'ÑOQUIS DE PAPA FILETTO': 'Ñoquis de Papa con Filetto',
  'SORRENTINO ZAPALLO': 'Sorrentino de Zapallo (sin salsa)',
  'SORRENTINO ESPINACA': 'Sorrentino de Ricotta y Espinaca (sin salsa)',
  'SORRENTINO J&Q': 'Sorrentino de Jamón y Queso (sin salsa)',
  'SORRENTINO CARNE': 'Sorrentino de Carne Braseada (sin salsa)',
  'SALSA FILETTO': 'Salsa Filetto',
  'SALSA BOLOGNESA': 'Salsa Bolognesa',
  'QUESO ROMANITO': 'Queso Romanito',
  'ÑOQUIS DE PAPA': 'Ñoquis de Papa',
}

const VOGLIO_CATEGORIA_OVERRIDE = {
  'molida especial': 'Carnes',
  'marucha': 'Carnes',
  'ajimomoto': 'Especias',
  'bicarbonato': 'Secos',
  'semola rimacinata de trigo candeal': 'Secos',
  'semolin chacabuco': 'Secos',
  'extracto de tomate la campagnola': 'Conservas',
  'pure de tomate voglio': 'Conservas',
  'caja lomo pd grande 22x16x5,5': 'Descartables',
  'box bisagra 22x16x6': 'Descartables',
  'folex lamina ad (20x25)': 'Descartables',
}

const PROVEEDOR_RUBRO = {
  'La Mensola': 'Harinas y secos',
  'Waggon': 'Lácteos',
  'Carrefour': 'Almacén',
  'Distribuidora 550': 'Harinas y secos',
  'Huevería': 'Huevos',
  'Fiambrería Feta': 'Fiambres y quesos',
  'Fungalabs': 'Packaging',
  'Class': 'Packaging',
  'Polides Descartables': 'Descartables',
  'Carnes Horizonte': 'Carnicería',
  'Angel Verduleria': 'Verdulería',
  'Entresano': 'Almacén',
  'Agua': 'Bebidas',
}

// Nombres de packaging → siempre por unidad, cantidad/und no confiable (D nulo en algunas filas)
const PACKAGING_KEYWORDS = /bolsa|caja|box|folex|papel|film|guante|servilleta|cofia/i

// ────────────────────────────────────────────────────────────
// unitConversionFactor (mismo criterio que lib/hooks/useRecetas.ts):
// si unidad === unidad_costo el factor es 1. Usamos SIEMPRE unidad=unidad_costo
// para el ingrediente de receta, así que en la práctica el factor es 1 acá.
// ────────────────────────────────────────────────────────────
function calcFoodCostLocal(ingredientes) {
  // Reproduce lib/hooks/useRecetas.ts::calcFoodCost con factor=1 (unidad===unidad_costo siempre)
  return ingredientes.reduce((sum, i) => sum + i.cantidad * (i.costo_unitario ?? 0), 0)
}

// ────────────────────────────────────────────────────────────
// 1) Parseo del Excel
// ────────────────────────────────────────────────────────────
function parsePROVEEYPRODUCTOS(wb) {
  const ws = wb.Sheets['PROVEE Y PRODUCTOS']
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
  const productosRaw = []
  for (let i = 2; i < rows.length; i++) {
    const r = rows[i]
    if (!hasContent(r[1])) break // fin de la tabla
    const proveedorNombre = hasContent(r[0]) ? String(r[0]).trim() : null
    const nombre = String(r[1]).trim()
    const cantidad = r[2]
    const unidadMedida = hasContent(r[3]) ? String(r[3]).trim() : null
    const precio = r[4]
    let colG = r[6]
    if (colG === null || colG === undefined) {
      // Fallback: reconstruir el precio por gramo/unidad si la celda vino vacía
      if (hasContent(precio) && hasContent(cantidad) && cantidad !== 0) {
        const um = norm(unidadMedida)
        colG = um === 'kg' ? precio / (cantidad * 1000) : precio / cantidad
      } else {
        colG = 0
      }
    }
    productosRaw.push({ proveedorNombre, nombre, cantidad, unidadMedida, precio, colG })
  }
  const proveedoresNombres = [...new Set(
    productosRaw.map(p => p.proveedorNombre).filter(n => n && norm(n) !== 'voglio')
  )]
  return { proveedoresNombres, productosRaw }
}

function parseCOSTEORECETAS(wb) {
  const ws = wb.Sheets['COSTEO RECETAS']
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
  let lastDataRow = 0
  for (let i = 1; i < rows.length; i++) {
    if (hasContent(rows[i][0]) || hasContent(rows[i][1])) lastDataRow = i
  }
  const recetasRaw = []
  let current = null
  for (let i = 1; i <= lastDataRow; i++) {
    const r = rows[i]
    if (hasContent(r[0])) {
      current = { nombreRaw: String(r[0]).trim(), ingredientes: [], totalExcel: r[8] }
      recetasRaw.push(current)
    }
    if (!current) continue
    if (hasContent(r[1])) {
      current.ingredientes.push({
        nombre: String(r[1]).trim(),
        pesoBruto: r[2],
        desperdicioPct: r[3],
        pesoNeto: r[4],
        unidadMedida: r[5],
        precio: r[6],
        subtotalExcel: r[7],
      })
    }
  }
  return recetasRaw
}

function parseCOSTORECETAPACK(wb) {
  const ws = wb.Sheets['COSTO RECETA+PACK']
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
  let lastDataRow = 0
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    if (hasContent(r[0]) || hasContent(r[1]) || hasContent(r[4])) lastDataRow = i
  }
  const TOP_SECCIONES = new Set(['COMBOS X2', 'X UNIDAD', 'COMBOS X4'])
  const platosRaw = []
  let currentSection = null
  let currentSubsection = null
  let currentPlato = null
  for (let i = 1; i <= lastDataRow; i++) {
    const r = rows[i]
    const nombrePlato = hasContent(r[0]) ? String(r[0]).trim() : null
    const recetaComp = hasContent(r[1]) ? String(r[1]).trim() : null
    const packagingNombre = hasContent(r[4]) ? String(r[4]).trim() : null
    const packagingPrecioUnit = r[5]

    if (nombrePlato && !recetaComp) {
      // fila de sección / subsección
      if (TOP_SECCIONES.has(nombrePlato)) { currentSection = nombrePlato; currentSubsection = null }
      else { currentSubsection = nombrePlato }
      currentPlato = null
      continue
    }
    if (nombrePlato && recetaComp) {
      currentPlato = {
        nombreRaw: nombrePlato,
        section: currentSection,
        subsection: currentSubsection,
        recetaComponentes: new Map(),
        packagingComponentes: new Map(),
        packagingPrecioUnitPorNombre: new Map(),
        pvp: r[8],
        foodCostPctExcel: r[9],
        precioComponentesTotalExcel: r[3],
        precioTotalPackExcel: r[6],
      }
      platosRaw.push(currentPlato)
    }
    if (!currentPlato) continue
    if (recetaComp) {
      currentPlato.recetaComponentes.set(recetaComp, (currentPlato.recetaComponentes.get(recetaComp) || 0) + 1)
    }
    if (packagingNombre) {
      currentPlato.packagingComponentes.set(packagingNombre, (currentPlato.packagingComponentes.get(packagingNombre) || 0) + 1)
      if (!currentPlato.packagingPrecioUnitPorNombre.has(packagingNombre)) {
        currentPlato.packagingPrecioUnitPorNombre.set(packagingNombre, packagingPrecioUnit)
      }
    }
  }
  return platosRaw
}

function categoriaPlato(p) {
  if (p.section === 'COMBOS X2' || p.section === 'COMBOS X4') return 'Combos'
  if (p.subsection === 'SORRENTINOS X2PORC' || p.subsection === 'ÑOQUIS X 2 PORC') return 'Pastas'
  if (p.subsection === 'SALSAS X 2 PORC' || p.subsection === 'QUESO X 2 PORC') return 'Salsas'
  return 'Otros'
}
function nombrePlato(p) {
  const base = PLATO_DISPLAY[p.nombreRaw] ?? p.nombreRaw
  return p.section === 'COMBOS X4' ? `${base} x4` : base
}

// ────────────────────────────────────────────────────────────
// 2) Construcción de las entidades en memoria (con UUIDs propios)
// ────────────────────────────────────────────────────────────
async function build() {
  const wb = XLSX.readFile(EXCEL_PATH)
  const { proveedoresNombres, productosRaw } = parsePROVEEYPRODUCTOS(wb)
  const recetasRaw = parseCOSTEORECETAS(wb)
  const platosRaw = parseCOSTORECETAPACK(wb)

  // -- Proveedores --
  const proveedores = proveedoresNombres.map(nombre => ({
    id: randomUUID(),
    nombre,
    rubro: PROVEEDOR_RUBRO[nombre] ?? 'Otros',
    activo: true,
    restaurante_id: RESTAURANTE_ID,
  }))
  const proveedorIdPorNombre = new Map(proveedores.map(p => [norm(p.nombre), p.id]))

  // -- Productos --
  const productos = []
  const warnings = []
  for (const p of productosRaw) {
    try {
      const esPorUnidad = norm(p.unidadMedida) === 'und' || norm(p.unidadMedida) === 'un' || norm(p.unidadMedida) === 'u'
        || PACKAGING_KEYWORDS.test(p.nombre)
      const unidad = esPorUnidad ? 'u' : 'kg'
      const precio_unitario = esPorUnidad ? p.colG : p.colG * 1000
      const override = VOGLIO_CATEGORIA_OVERRIDE[norm(p.nombre)]
      const categoria = override ?? categorizarRule(p.nombre)
      const proveedor_id = p.proveedorNombre ? (proveedorIdPorNombre.get(norm(p.proveedorNombre)) ?? null) : null
      productos.push({
        id: randomUUID(),
        nombre: p.nombre,
        unidad,
        precio_unitario,
        colGGramoOUnidad: p.colG, // solo para costeo de ingredientes, no se inserta
        categoria,
        proveedor_id,
        stock_actual: 0,
        stock_minimo: 0,
        stock_critico: 0,
        activo: true,
        restaurante_id: RESTAURANTE_ID,
      })
    } catch (e) {
      warnings.push(`Producto "${p.nombre}": ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // -- Recetas + ingredientes --
  const recetas = []
  const recetaIdPorNombreRaw = new Map()
  let ingredientesTotal = 0
  let ingredientesMatched = 0
  const ingredientesSinMatch = []
  for (const r of recetasRaw) {
    try {
      const id = randomUUID()
      const nombre = RECETA_DISPLAY[r.nombreRaw] ?? r.nombreRaw
      const categoria = RECETA_CATEGORIA[r.nombreRaw] ?? 'Bases'
      const ingredientes = []
      let pesoTotal = 0, pesoEscurrido = 0
      for (const ing of r.ingredientes) {
        ingredientesTotal++
        const esU = norm(ing.unidadMedida) === 'und' || norm(ing.unidadMedida) === 'un' || norm(ing.unidadMedida) === 'u'
        const unidad = esU ? 'u' : 'g'
        const match = findMatch(ing.nombre, productos, pr => pr.nombre)
        if (match) ingredientesMatched++
        else ingredientesSinMatch.push(`${r.nombreRaw} → "${ing.nombre}"`)
        ingredientes.push({
          id: randomUUID(),
          receta_id: id,
          nombre: ing.nombre,
          cantidad: ing.pesoBruto ?? 0,
          unidad,
          unidad_costo: unidad,
          costo_unitario: ing.precio ?? 0,
          merma_pct: ing.desperdicioPct ?? null,
          tipo: 'producto',
          producto_id: match ? match.item.id : null,
        })
        pesoTotal += ing.pesoBruto ?? 0
        pesoEscurrido += ing.pesoNeto ?? ing.pesoBruto ?? 0
      }
      recetaIdPorNombreRaw.set(r.nombreRaw, id)
      recetas.push({
        id, nombre, categoria, porciones: 1, precio_venta: 0,
        status: 'published', activa: true, restaurante_id: RESTAURANTE_ID,
        peso_total_g: pesoTotal, peso_escurrido_g: pesoEscurrido,
        ingredientes, // para verificación local, no se inserta tal cual
        totalExcel: r.totalExcel,
      })
    } catch (e) {
      warnings.push(`Receta "${r.nombreRaw}": ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // -- Carta items + plato_recetas + plato_packaging --
  const cartaItems = []
  const platoRecetasRows = []
  const platoPackagingRows = []
  const componentesSinMatch = []
  let ordenPorCategoria = {}
  for (const p of platosRaw) {
    try {
      const categoria = categoriaPlato(p)
      const nombre = nombrePlato(p)
      const id = randomUUID()
      const orden = (ordenPorCategoria[categoria] = (ordenPorCategoria[categoria] ?? 0) + 1)
      cartaItems.push({
        id, nombre, categoria, precio_venta: p.pvp ?? 0,
        disponible: true, orden, restaurante_id: RESTAURANTE_ID,
        foodCostPctExcel: p.foodCostPctExcel, precioComponentesTotalExcel: p.precioComponentesTotalExcel,
        precioTotalPackExcel: p.precioTotalPackExcel,
      })
      let ordenPr = 0
      for (const [recetaNombre, count] of p.recetaComponentes) {
        const recetaId = recetaIdPorNombreRaw.get(recetaNombre)
        if (!recetaId) { componentesSinMatch.push(`${p.nombreRaw} → receta "${recetaNombre}"`); continue }
        platoRecetasRows.push({ id: randomUUID(), plato_id: id, receta_id: recetaId, porciones: count, orden: ordenPr++ })
      }
      let ordenPk = 0
      for (const [pkgNombre, count] of p.packagingComponentes) {
        const match = findMatch(pkgNombre, productos, pr => pr.nombre)
        if (!match) { componentesSinMatch.push(`${p.nombreRaw} → packaging "${pkgNombre}"`); continue }
        platoPackagingRows.push({ id: randomUUID(), plato_id: id, producto_id: match.item.id, cantidad: count, orden: ordenPk++ })
      }
    } catch (e) {
      warnings.push(`Plato "${p.nombreRaw}": ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return {
    proveedores, productos, recetas, cartaItems, platoRecetasRows, platoPackagingRows,
    warnings, ingredientesTotal, ingredientesMatched, ingredientesSinMatch, componentesSinMatch,
  }
}

// ────────────────────────────────────────────────────────────
// 3) Verificación de food cost (local, sin tocar DB)
// ────────────────────────────────────────────────────────────
function verificar(data) {
  console.log('\n=== VERIFICACIÓN FOOD COST — RECETAS (calculado vs Excel TOTAL) ===')
  for (const r of data.recetas) {
    const calculado = calcFoodCostLocal(r.ingredientes)
    const excel = r.totalExcel ?? calculado
    const diffPct = excel ? Math.abs(calculado - excel) / excel * 100 : 0
    const flag = diffPct > 1 ? '  ⚠ DIFF > 1%' : ''
    console.log(`  ${r.nombre.padEnd(32)} calculado=${calculado.toFixed(2).padStart(10)}  excel=${String(excel.toFixed?.(2) ?? excel).padStart(10)}  diff=${diffPct.toFixed(2)}%${flag}`)
  }

  console.log('\n=== VERIFICACIÓN FOOD COST — PLATOS (calculado vs Excel FOOD COST %) ===')
  const recetaCostoTotalPorId = new Map(data.recetas.map(r => [r.id, calcFoodCostLocal(r.ingredientes)]))
  const productoPrecioPorId = new Map(data.productos.map(p => [p.id, p.precio_unitario]))
  for (const item of data.cartaItems) {
    const prRows = data.platoRecetasRows.filter(pr => pr.plato_id === item.id)
    const pkgRows = data.platoPackagingRows.filter(pk => pk.plato_id === item.id)
    const costoRecetas = prRows.reduce((sum, pr) => sum + (recetaCostoTotalPorId.get(pr.receta_id) ?? 0) * pr.porciones, 0)
    const costoPackaging = pkgRows.reduce((sum, pk) => sum + (productoPrecioPorId.get(pk.producto_id) ?? 0) * pk.cantidad, 0)
    const costoTotal = costoRecetas + costoPackaging
    const foodCostCalc = item.precio_venta > 0 ? (costoTotal / item.precio_venta) * 100 : 0
    const foodCostExcel = (item.foodCostPctExcel ?? 0) * 100
    const diffPp = Math.abs(foodCostCalc - foodCostExcel)
    const flag = diffPp > 1 ? '  ⚠ DIFF > 1pp' : ''
    console.log(`  ${item.nombre.padEnd(48)} FC calc=${foodCostCalc.toFixed(2).padStart(6)}%  FC excel=${foodCostExcel.toFixed(2).padStart(6)}%  diff=${diffPp.toFixed(2)}pp${flag}`)
  }
}

// ────────────────────────────────────────────────────────────
// 4) Resumen
// ────────────────────────────────────────────────────────────
function imprimirResumen(data) {
  console.log('\n=== RESUMEN ===')
  console.log(`Proveedores: ${data.proveedores.length}`)
  console.log(`Productos:   ${data.productos.length}`)
  console.log(`Recetas:     ${data.recetas.length}`)
  console.log(`  Ingredientes totales: ${data.ingredientesTotal} · vinculados a producto: ${data.ingredientesMatched}`)
  const porCategoria = {}
  for (const c of data.cartaItems) porCategoria[c.categoria] = (porCategoria[c.categoria] ?? 0) + 1
  console.log(`Carta items (platos): ${data.cartaItems.length} — ${Object.entries(porCategoria).map(([k, v]) => `${k}: ${v}`).join(', ')}`)
  console.log(`plato_recetas rows:   ${data.platoRecetasRows.length}`)
  console.log(`plato_packaging rows: ${data.platoPackagingRows.length}`)
  if (data.ingredientesSinMatch.length) {
    console.log(`\n⚠ Ingredientes sin match a producto (${data.ingredientesSinMatch.length}):`)
    data.ingredientesSinMatch.forEach(w => console.log(`  - ${w}`))
  }
  if (data.componentesSinMatch.length) {
    console.log(`\n⚠ Componentes de plato sin match (${data.componentesSinMatch.length}):`)
    data.componentesSinMatch.forEach(w => console.log(`  - ${w}`))
  }
  if (data.warnings.length) {
    console.log(`\n⚠ Warnings de construcción (${data.warnings.length}):`)
    data.warnings.forEach(w => console.log(`  - ${w}`))
  }
}

// ────────────────────────────────────────────────────────────
// 5) A0 — crear cuenta (idempotente)
// ────────────────────────────────────────────────────────────
async function crearCuenta() {
  const { data: existingRest } = await supabase.from('restaurantes').select('configuracion').eq('id', RESTAURANTE_ID).maybeSingle()
  const configuracion = { ...(existingRest?.configuracion ?? {}), perfil: 'emprendimiento' }

  const { error: restError } = await supabase
    .from('restaurantes')
    .upsert({ id: RESTAURANTE_ID, nombre: 'Voglio Farina', configuracion }, { onConflict: 'id' })
  if (restError) throw restError
  console.log('✓ restaurantes: Voglio Farina', RESTAURANTE_ID)

  let userId
  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email: EMAIL, password: PASSWORD, email_confirm: true,
  })
  if (createErr) {
    const yaExiste = createErr.code === 'email_exists' || /already registered|already exists|already been registered/i.test(createErr.message ?? '')
    if (!yaExiste) throw createErr
    const { data: list, error: listErr } = await supabase.auth.admin.listUsers()
    if (listErr) throw listErr
    const existing = list.users.find(u => u.email === EMAIL)
    if (!existing) throw new Error('No se encontró el usuario Voglio existente')
    userId = existing.id
    console.log('✓ auth user ya existía:', userId)
  } else {
    userId = created.user.id
    console.log('✓ auth user creado:', userId)
  }

  const { error: linkError } = await supabase
    .from('user_restaurantes')
    .upsert({ user_id: userId, restaurante_id: RESTAURANTE_ID, rol: 'admin' }, { onConflict: 'user_id,restaurante_id' })
  if (linkError) throw linkError
  console.log('✓ user_restaurantes vinculado')

  const { data: miembroExistente } = await supabase
    .from('equipo_miembros').select('id').eq('auth_user_id', userId).maybeSingle()
  if (!miembroExistente) {
    const { error: miembroError } = await supabase.from('equipo_miembros').insert({
      nombre: 'Facundo', apellido: '', rol: 'admin',
      auth_user_id: userId, restaurante_id: RESTAURANTE_ID, activo: true,
    })
    if (miembroError) throw miembroError
    console.log('✓ equipo_miembros creado')
  } else {
    console.log('✓ equipo_miembros ya existía')
  }

  const { error: permisosError } = await supabase.from('rol_permisos').upsert({
    restaurante_id: RESTAURANTE_ID,
    rol: 'admin',
    modulos_visibles: MODULOS_EMPRENDIMIENTO,
    puede_editar_stock: true, puede_editar_recetas: true, puede_editar_carta: true,
    puede_editar_equipo: true, puede_eliminar: true,
  }, { onConflict: 'restaurante_id,rol' })
  if (permisosError) throw permisosError
  console.log('✓ rol_permisos admin sembrado (modo emprendimiento)')
}

// ────────────────────────────────────────────────────────────
// A0.5 — reset de datos previos (idempotencia del seed)
// ────────────────────────────────────────────────────────────
async function resetDatos() {
  const { data: cartaIdsData } = await supabase.from('carta_items').select('id').eq('restaurante_id', RESTAURANTE_ID)
  const cartaIds = (cartaIdsData ?? []).map(c => c.id)
  const { data: grupoIdsData } = await supabase.from('packaging_grupos').select('id').eq('restaurante_id', RESTAURANTE_ID)
  const grupoIds = (grupoIdsData ?? []).map(g => g.id)
  const { data: recetaIdsData } = await supabase.from('recetas').select('id').eq('restaurante_id', RESTAURANTE_ID)
  const recetaIds = (recetaIdsData ?? []).map(r => r.id)

  if (cartaIds.length) {
    await supabase.from('plato_packaging').delete().in('plato_id', cartaIds)
    await supabase.from('plato_recetas').delete().in('plato_id', cartaIds)
  }
  if (grupoIds.length) {
    await supabase.from('packaging_grupo_items').delete().in('grupo_id', grupoIds)
    await supabase.from('packaging_grupos').delete().in('id', grupoIds)
  }
  await supabase.from('carta_items').delete().eq('restaurante_id', RESTAURANTE_ID)
  if (recetaIds.length) {
    await supabase.from('ingredientes').delete().in('receta_id', recetaIds)
  }
  await supabase.from('recetas').delete().eq('restaurante_id', RESTAURANTE_ID)
  await supabase.from('productos').delete().eq('restaurante_id', RESTAURANTE_ID)
  await supabase.from('proveedores').delete().eq('restaurante_id', RESTAURANTE_ID)
  console.log('✓ reset de datos previos de Voglio completo')
}

// ────────────────────────────────────────────────────────────
// A1-A5 — inserts reales
// ────────────────────────────────────────────────────────────
async function insertarTodo(data) {
  // A1 — proveedores
  for (const p of data.proveedores) {
    const { error } = await supabase.from('proveedores').insert({
      id: p.id, nombre: p.nombre, rubro: p.rubro, activo: p.activo, restaurante_id: p.restaurante_id,
    })
    if (error) { console.error(`❌ proveedor "${p.nombre}": ${error.message ?? JSON.stringify(error)}`); continue }
  }
  console.log(`✓ proveedores insertados: ${data.proveedores.length}`)

  // A2 — productos
  let okProductos = 0
  for (const p of data.productos) {
    const { error } = await supabase.from('productos').insert({
      id: p.id, nombre: p.nombre, unidad: p.unidad, precio_unitario: p.precio_unitario,
      categoria: p.categoria, proveedor_id: p.proveedor_id,
      stock_actual: p.stock_actual, stock_minimo: p.stock_minimo, stock_critico: p.stock_critico,
      activo: p.activo, restaurante_id: p.restaurante_id,
    })
    if (error) { console.error(`❌ producto "${p.nombre}": ${error.message ?? JSON.stringify(error)}`); continue }
    okProductos++
  }
  console.log(`✓ productos insertados: ${okProductos}/${data.productos.length}`)

  // A3 — recetas + ingredientes
  let okRecetas = 0, okIngredientes = 0, totalIngredientes = 0
  for (const r of data.recetas) {
    const { error: errR } = await supabase.from('recetas').insert({
      id: r.id, nombre: r.nombre, categoria: r.categoria, porciones: r.porciones,
      precio_venta: r.precio_venta, status: r.status, activa: r.activa,
      restaurante_id: r.restaurante_id, peso_total_g: r.peso_total_g, peso_escurrido_g: r.peso_escurrido_g,
    })
    if (errR) { console.error(`❌ receta "${r.nombre}": ${errR.message ?? JSON.stringify(errR)}`); continue }
    okRecetas++
    totalIngredientes += r.ingredientes.length
    const ingsPayload = r.ingredientes.map(i => ({
      id: i.id, receta_id: i.receta_id, nombre: i.nombre, cantidad: i.cantidad,
      unidad: i.unidad, unidad_costo: i.unidad_costo, costo_unitario: i.costo_unitario,
      merma_pct: i.merma_pct, tipo: i.tipo, producto_id: i.producto_id,
    }))
    if (ingsPayload.length) {
      const { error: errI } = await supabase.from('ingredientes').insert(ingsPayload)
      if (errI) { console.error(`❌ ingredientes de "${r.nombre}": ${errI.message ?? JSON.stringify(errI)}`); continue }
      okIngredientes += ingsPayload.length
    }
  }
  console.log(`✓ recetas insertadas: ${okRecetas}/${data.recetas.length} — ingredientes: ${okIngredientes}/${totalIngredientes}`)

  // A4 — carta_categorias (para que agrupen bien en la UI) + carta_items + plato_recetas
  for (const nombre of ['Pastas', 'Salsas', 'Combos']) {
    const { error } = await supabase.from('carta_categorias').upsert(
      { nombre, icono: nombre === 'Pastas' ? 'ramen_dining' : nombre === 'Salsas' ? 'soup_kitchen' : 'inventory_2', orden: 0, restaurante_id: RESTAURANTE_ID },
      { onConflict: 'restaurante_id,nombre', ignoreDuplicates: true },
    )
    if (error && !/duplicate|unique/i.test(error.message ?? '')) console.error(`❌ carta_categoria "${nombre}": ${error.message ?? JSON.stringify(error)}`)
  }

  let okCarta = 0
  for (const item of data.cartaItems) {
    const { error } = await supabase.from('carta_items').insert({
      id: item.id, nombre: item.nombre, categoria: item.categoria, precio_venta: item.precio_venta,
      disponible: item.disponible, orden: item.orden, restaurante_id: item.restaurante_id,
    })
    if (error) { console.error(`❌ carta_item "${item.nombre}": ${error.message ?? JSON.stringify(error)}`); continue }
    okCarta++
  }
  console.log(`✓ carta_items insertados: ${okCarta}/${data.cartaItems.length}`)

  if (data.platoRecetasRows.length) {
    const { error } = await supabase.from('plato_recetas').insert(
      data.platoRecetasRows.map(pr => ({ id: pr.id, plato_id: pr.plato_id, receta_id: pr.receta_id, porciones: pr.porciones, orden: pr.orden }))
    )
    if (error) console.error(`❌ plato_recetas: ${error.message ?? JSON.stringify(error)}`)
    else console.log(`✓ plato_recetas insertados: ${data.platoRecetasRows.length}`)
  }

  // A5 — plato_packaging
  if (data.platoPackagingRows.length) {
    const { error } = await supabase.from('plato_packaging').insert(
      data.platoPackagingRows.map(pk => ({ id: pk.id, plato_id: pk.plato_id, producto_id: pk.producto_id, cantidad: pk.cantidad, orden: pk.orden }))
    )
    if (error) console.error(`❌ plato_packaging: ${error.message ?? JSON.stringify(error)}`)
    else console.log(`✓ plato_packaging insertados: ${data.platoPackagingRows.length}`)
  }

  // A5 (opcional) — packaging_grupos "Pack estándar Voglio"
  try {
    const packagingNombres = ['Caja lomo PD Grande 22x16x5,5', 'Folex Lamina AD (20x25)', 'Bolsa Tubo Bobina Polietileno Cristal 15cm 80mc 50m Selladora', '2 Bolsa Tubo Bobina Polietileno Cristal 15cm 80mc 50m Selladora', 'Bolsa Camiseta (50x60)']
    const grupoId = randomUUID()
    const { error: errG } = await supabase.from('packaging_grupos').insert({ id: grupoId, nombre: 'Pack estándar Voglio', restaurante_id: RESTAURANTE_ID })
    if (errG) throw errG
    let orden = 0
    for (const nombre of packagingNombres) {
      const match = findMatch(nombre, data.productos, p => p.nombre)
      if (!match) continue
      const { error: errI } = await supabase.from('packaging_grupo_items').insert({ id: randomUUID(), grupo_id: grupoId, producto_id: match.item.id, cantidad: 1, orden: orden++ })
      if (errI) console.error(`❌ packaging_grupo_items: ${errI.message ?? JSON.stringify(errI)}`)
    }
    console.log('✓ packaging_grupos "Pack estándar Voglio" creado')
  } catch (e) {
    console.error(`❌ packaging_grupos: ${e instanceof Error ? e.message : JSON.stringify(e)}`)
  }
}

// ────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────
async function main() {
  console.log(`Modo: ${APPLY ? 'APPLY (escribe en Supabase)' : 'DRY-RUN (no escribe nada)'}`)
  const data = await build()
  imprimirResumen(data)
  verificar(data)

  if (!APPLY) {
    console.log('\n[DRY-RUN] No se escribió nada. Corré con --apply para aplicar contra Supabase.')
    return
  }

  console.log('\n=== APLICANDO CONTRA SUPABASE ===')
  await crearCuenta()
  await resetDatos()
  await insertarTodo(data)

  // Verificación final contra DB real
  console.log('\n=== VERIFICACIÓN FINAL (SELECT contra DB) ===')
  const counts = {}
  for (const t of ['proveedores', 'productos', 'recetas', 'carta_items']) {
    const { count } = await supabase.from(t).select('*', { count: 'exact', head: true }).eq('restaurante_id', RESTAURANTE_ID)
    counts[t] = count
  }
  // plato_recetas/plato_packaging no tienen restaurante_id — contarlos vía carta_items
  const { data: cartaIdsFinal } = await supabase.from('carta_items').select('id').eq('restaurante_id', RESTAURANTE_ID)
  const idsFinal = (cartaIdsFinal ?? []).map(c => c.id)
  const { count: prCount } = idsFinal.length ? await supabase.from('plato_recetas').select('*', { count: 'exact', head: true }).in('plato_id', idsFinal) : { count: 0 }
  const { count: pkCount } = idsFinal.length ? await supabase.from('plato_packaging').select('*', { count: 'exact', head: true }).in('plato_id', idsFinal) : { count: 0 }
  console.log(`proveedores: ${counts.proveedores} · productos: ${counts.productos} · recetas: ${counts.recetas} · carta_items: ${counts.carta_items} · plato_recetas: ${prCount} · plato_packaging: ${pkCount}`)
  console.log(`\nListo. Login Voglio: ${EMAIL} / ${PASSWORD} — restaurante_id ${RESTAURANTE_ID}`)
}

main().catch(e => { console.error(e); process.exit(1) })
