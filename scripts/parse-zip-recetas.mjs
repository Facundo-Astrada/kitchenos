// Carga masiva de recetas desde ZIP de Google Drive
// Uso: node scripts/parse-zip-recetas.mjs
// El ZIP debe estar en: C:\Users\Equipo\Downloads\recetas para cargar K-OS.zip

import AdmZip from 'adm-zip'
import mammoth from 'mammoth'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

const ZIP_PATH = 'C:\\Users\\Equipo\\Downloads\\recetas para cargar K-OS.zip'
const SUPABASE_URL = 'https://clipcxcbtlibswfzsgzk.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const RESTAURANTE_ID = 'e65cf95a-2c32-4244-b325-2379be5b3a6e'

// ─── Archivos a ignorar (templates, notas, etiquetas) ───────────────────────
const SKIP_NAMES = [
  'template', 'copia de', 'etiquetas', 'sandwichs', 'salsas y aderezos',
  'panadería_pastelería', 'mermelada. aspectos', 'bbq _ barbacoa',
  'kimchi lucre', 'ramen de cabello', 'dulces.docx', 'masa de tarta',
]

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

// ─── Normalización ───────────────────────────────────────────────────────────
function normalize(s) {
  return s.toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ')
}

function normalizeUnit(u) {
  if (!u) return 'u'
  const s = u.toLowerCase().trim()
  if (['gr', 'grs', 'g.', 'gramo', 'gramos', 'gram'].includes(s)) return 'g'
  if (['kg', 'kgs', 'kilo', 'kilos', 'kilogramo'].includes(s)) return 'kg'
  if (['ml', 'cc', 'mililitro', 'mililitros'].includes(s)) return 'ml'
  if (['lt', 'lts', 'l.', 'litro', 'litros', 'liter'].includes(s)) return 'l'
  if (['un', 'und', 'unidad', 'unidades', 'unit', 'units', 'u.'].includes(s)) return 'u'
  if (['diente', 'dientes'].includes(s)) return 'u'
  if (['hoja', 'hojas'].includes(s)) return 'u'
  if (['rama', 'ramas'].includes(s)) return 'u'
  if (['atado', 'atados'].includes(s)) return 'u'
  return s || 'u'
}

function inferCategoria(nombre, ingredientes) {
  const n = normalize(nombre)
  const ings = ingredientes.map(i => normalize(i.nombre)).join(' ')
  if (['chimi', 'salsa', 'aderezo', 'mole', 'pesto', 'mayo', 'aioli', 'chutney',
       'sriracha', 'ponzu', 'tahini', 'dukkah', 'lactonesa', 'barbacoa', 'fondo',
       'vinagreta', 'rub', 'manteca', 'leche de coco', 'ricotta', 'yogurt',
       'crema acida', 'mostaza', 'beer batter', 'tempura', 'satay', 'muhamara',
       'aceite', 'guacachile', 'aguachile', 'llajua', 'pipian', 'miso',
       'corn dog', 'crema de queso', 'leche de tigre'].some(k => n.includes(k))) return 'Salsas y Bases'
  if (['pickle', 'pickles', 'conserva', 'escabeche', 'marinado', 'ajitama',
       'berenjena agri', 'relish', 'wickles', 'okra', 'pepino pickle',
       'aji ahumado'].some(k => n.includes(k))) return 'Conservas y Pickles'
  if (['cake', 'flan', 'mousse', 'panacotta', 'creme brulee', 'toffee', 'trufa',
       'alfajor', 'cobbler', 'granola', 'helado', 'apple pie', 'postre',
       'crumble', 'cremoso choco', 'ddl', 'dulce', 'mermelada', 'cremoso de',
       'parfait', 'baked alaska', 'borrachito'].some(k => n.includes(k))) return 'Postres'
  if (['pan ', 'bread', 'masa madre', 'brioche', 'mbeju', 'sopa paraguaya',
       'burek', 'carta de musica', 'gnocco', 'cracker', 'crackers'].some(k => n.includes(k))) return 'Panificados'
  if (['pasta', 'tagliatelle', 'spaghetti', 'linguine', 'gnocc', 'wonton',
       'dumpling', 'ravioli', 'fideos'].some(k => n.includes(k))) return 'Pastas'
  if (['pollo', 'chicken', 'gallina', 'pate citrico'].some(k => n.includes(k))) return 'Aves'
  if (['pejerrey', 'langostino', 'salmon', 'trucha', 'pacu', 'calamar',
       'boqueron', 'camaron', 'marisco', 'pescado', 'gilda'].some(k => n.includes(k))) return 'Pescados y Mariscos'
  if (['cerdo', 'bondiola', 'carnitas', 'tinga', 'salchicha de cordero',
       'costilla', 'vacstrami', 'tacosaña', 'birria', 'barbacoa de'].some(k => n.includes(k))) return 'Cerdo'
  if (['asado', 'bife', 'ternera', 'cordero', 'chivo', 'vacuno', 'riñon',
       'lengua', 'queso de lengua', 'kebab', 'lahmacun', 'picanha',
       'duck', 'falda', 'chivo'].some(k => n.includes(k))) return 'Carnes Rojas'
  if (['hummus', 'pure', 'papas', 'papines', 'repollo', 'kimchi', 'dosa',
       'aloo', 'arroz', 'tamale', 'polenta', 'wonton', 'ñoqui', 'pate brulle',
       'pate de alubias', 'pate de hongos', 'porotos', 'spread',
       'hongos rellenos', 'lechuga asada', 'chips de', 'ensalada berro',
       'tempura de repollo', 'tetelas', 'smoky garlic'].some(k => n.includes(k))) return 'Guarniciones'
  if (['taco', 'empanada', 'arepa', 'tamale'].some(k => n.includes(k))) return 'Entrantes'
  if (ings.includes('harina') && ings.includes('manteca')) return 'Pastas'
  return 'Otros'
}

// ─── Parser HTML → receta ────────────────────────────────────────────────────
function parseHtml(html, fileName) {
  // Nombre: del filename sin extensión y carpeta
  const baseName = fileName.split('/').pop().replace(/\.docx$/i, '')

  // Extraer texto plano básico (quitar tags HTML)
  const plain = html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, '').replace(/\s{2,}/g, ' ').trim()

  // ── Porciones / rendimiento ──
  let porciones = 1
  const yieldMatch = plain.match(/[Yy]ield\s*[:：]\s*([^\n|]+)/i) || plain.match(/[Rr]inde\s*[:：]\s*([^\n|]+)/i)
  if (yieldMatch) {
    const yieldText = yieldMatch[1].trim()
    const numMatch = yieldText.match(/(\d+(?:[.,]\d+)?)\s*(pax|porc|porci|person|pers|tamales?|uni?|u\b)?/i)
    if (numMatch) porciones = parseInt(numMatch[1]) || 1
  }

  // ── Procedimiento ──
  let procedimiento = ''
  const methodMatch = plain.match(/[Mm]ethod\s*[:：]?\s*([\s\S]+?)(?:Notes?[:：]|Submitted|Photos?|Tags?|$)/i)
             || plain.match(/[Pp]rocedimiento\s*[:：]?\s*([\s\S]+?)(?:$)/i)
  if (methodMatch) {
    procedimiento = methodMatch[1].trim().substring(0, 3000)
  }

  // ── Ingredientes desde tabla HTML ──
  const ingredientes = []
  const tableMatches = html.match(/<table[^>]*>([\s\S]*?)<\/table>/gi) || []

  for (const table of tableMatches) {
    const rows = table.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || []
    let headerFound = false

    for (const row of rows) {
      const cells = (row.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) || [])
        .map(c => c.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim())

      if (cells.length < 2) continue

      // Detectar fila de header
      const joined = cells.join(' ').toLowerCase()
      if (joined.includes('amount') || joined.includes('ingredient') || joined.includes('cantidad') || joined.includes('producto')) {
        headerFound = true
        continue
      }
      if (!headerFound) continue

      // Fila de datos
      // Formato puede ser [Amount, Unit, Ingredient] o [Producto, Cantidad, Und, ...]
      let cantidad = null, unidad = 'u', nombre = ''

      if (cells.length >= 3) {
        const first = cells[0], second = cells[1], third = cells[2]
        // Detectar si es formato [Producto, Cantidad, Und] (fichas técnicas)
        const secondIsNum = /^[\d.,\s]+$/.test(second)
        const firstIsNum = /^[\d.,\s]+$/.test(first)

        if (!firstIsNum && secondIsNum) {
          // [Producto, Cantidad, Unidad, ...]
          nombre = first
          cantidad = parseFloat(second.replace(',', '.')) || null
          unidad = cells[2] || 'u'
        } else if (firstIsNum) {
          // [Amount, Unit, Ingredient]
          cantidad = parseFloat(first.replace(',', '.')) || null
          unidad = second
          nombre = third
        } else {
          nombre = first
        }
      } else if (cells.length === 2) {
        nombre = cells[0]
        cantidad = parseFloat(cells[1].replace(',', '.')) || null
      }

      nombre = nombre.replace(/\*/g, '').trim()
      if (!nombre || nombre.length < 2) continue
      // Skip filas de sección (ej: "Relleno", "Masa", solo letras sin cantidad)
      if (!cantidad && /^[A-ZÁÉÍÓÚ][a-záéíóú\s]+$/.test(nombre) && nombre.split(' ').length <= 2 && nombre.length < 20) continue

      ingredientes.push({ nombre, cantidad, unidad: normalizeUnit(unidad) })
    }
  }

  // Si no hay tabla, intentar parsear líneas con formato "cantidad unidad nombre"
  if (ingredientes.length === 0) {
    const lines = plain.split(/\n|•|·/).map(l => l.trim()).filter(l => l.length > 3)
    for (const line of lines) {
      const m = line.match(/^(\d+(?:[.,]\d+)?)\s*(g|kg|ml|l|lt|gr|cc|u|un|und)?\s+(.+)$/i)
      if (m) {
        ingredientes.push({
          nombre: m[3].trim(),
          cantidad: parseFloat(m[1].replace(',', '.')) || null,
          unidad: normalizeUnit(m[2] || 'u'),
        })
      }
    }
  }

  if (ingredientes.length === 0 && !procedimiento) return null

  const categoria = inferCategoria(baseName, ingredientes)

  return {
    nombre: baseName,
    categoria,
    porciones,
    tiempo_min: 0,
    procedimiento,
    ingredientes,
  }
}

// ─── Fuzzy match producto ────────────────────────────────────────────────────
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

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('Abriendo ZIP...')
  const zip = new AdmZip(ZIP_PATH)
  const entries = zip.getEntries().filter(e => e.entryName.endsWith('.docx') && !e.entryName.includes('__MACOSX'))

  console.log(`Archivos .docx encontrados: ${entries.length}`)

  // Cargar estado actual de Supabase
  const { data: existentes } = await supabase.from('recetas').select('nombre').eq('restaurante_id', RESTAURANTE_ID)
  const nombresExistentes = new Set((existentes || []).map(r => normalize(r.nombre)))
  console.log(`Recetas ya en DB: ${nombresExistentes.size}`)

  const { data: productos } = await supabase.from('productos').select('id, nombre, precio_unitario, unidad').eq('restaurante_id', RESTAURANTE_ID).eq('activo', true)
  console.log(`Productos en stock: ${productos?.length ?? 0}\n`)

  let insertadas = 0, saltadas = 0, sinDatos = 0, errores = 0

  for (const entry of entries) {
    const fileName = entry.entryName
    const baseName = fileName.split('/').pop().replace(/\.docx$/i, '').trim()

    // Skip por nombre
    const baseNorm = normalize(baseName)
    if (SKIP_NAMES.some(s => baseNorm.includes(s))) {
      console.log(`  SKIP [template/nota]: ${baseName}`)
      sinDatos++
      continue
    }

    // Skip si ya existe
    if (nombresExistentes.has(baseNorm)) {
      console.log(`  SKIP [ya existe]: ${baseName}`)
      saltadas++
      continue
    }

    // Leer y parsear .docx
    let receta = null
    try {
      const buf = entry.getData()
      const result = await mammoth.convertToHtml({ buffer: buf })
      receta = parseHtml(result.value, fileName)
    } catch (e) {
      console.error(`  ERROR parseando ${baseName}: ${e.message}`)
      errores++
      continue
    }

    if (!receta || (receta.ingredientes.length === 0 && !receta.procedimiento)) {
      console.log(`  SKIP [sin datos]: ${baseName}`)
      sinDatos++
      continue
    }

    // Insertar receta
    const recetaId = randomUUID()
    const { error: errR } = await supabase.from('recetas').insert({
      id: recetaId,
      nombre: receta.nombre,
      categoria: receta.categoria,
      porciones: receta.porciones || 1,
      tiempo_min: receta.tiempo_min || 0,
      procedimiento: receta.procedimiento || '',
      restaurante_id: RESTAURANTE_ID,
      activa: true,
      status: 'published',
    })

    if (errR) {
      console.error(`  ERROR insertando ${baseName}: ${errR.message}`)
      errores++
      continue
    }

    // Insertar ingredientes
    if (receta.ingredientes.length > 0) {
      const ingsToInsert = []
      for (const ing of receta.ingredientes) {
        const match = await findProductoId(ing.nombre, productos || [])
        ingsToInsert.push({
          receta_id: recetaId,
          nombre: ing.nombre,
          cantidad: ing.cantidad ?? 0,
          unidad: ing.unidad || 'u',
          tipo: 'producto',
          producto_id: match?.id ?? null,
          costo_unitario: match?.precio ?? 0,
          unidad_costo: match?.unidad ?? ing.unidad ?? 'u',
        })
      }
      const { error: errI } = await supabase.from('ingredientes').insert(ingsToInsert)
      const vinc = ingsToInsert.filter(i => i.producto_id).length
      if (errI) {
        console.error(`  WARN ings ${baseName}: ${errI.message}`)
      }
      console.log(`  OK [${receta.categoria}] ${baseName} — ${ingsToInsert.length} ings (${vinc} vinculados)`)
    } else {
      console.log(`  OK [${receta.categoria}] ${baseName} — sin ingredientes`)
    }

    insertadas++
    nombresExistentes.add(baseNorm) // evitar duplicados dentro del mismo ZIP
  }

  console.log(`\n${'─'.repeat(50)}`)
  console.log(`Insertadas:   ${insertadas}`)
  console.log(`Ya existían:  ${saltadas}`)
  console.log(`Sin datos:    ${sinDatos}`)
  console.log(`Errores:      ${errores}`)
  console.log(`TOTAL:        ${entries.length} archivos procesados`)
}

main().catch(e => { console.error(e); process.exit(1) })
