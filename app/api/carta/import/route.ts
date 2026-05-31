import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'

export const maxDuration = 60

// ── Types ────────────────────────────────────────────────────────────────
export interface ComponenteImportado {
  nombre: string
  tipo: 'receta' | 'producto' | 'plato' | null
  ref_id: string | null
  ref_nombre: string | null
}

export interface ItemImportado {
  nombre: string
  categoria: string
  descripcion: string
  componentes: ComponenteImportado[]   // sub-recetas/preparaciones vinculadas
  precio_venta: number | null
  porciones: number
  tags: string[]
}

// ── Helpers ──────────────────────────────────────────────────────────────
function norm(s: unknown): string {
  return String(s ?? '').trim()
}

function parsePrice(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = parseFloat(String(v).replace(/[^0-9.,]/g, '').replace(',', '.'))
  return isNaN(n) || n <= 0 ? null : n
}

function inferCategoria(nombre: string, desc: string): string {
  const texto = (nombre + ' ' + desc).toLowerCase()
  if (/\b(agua|vino|cerveza|bebida|gaseosa|jugo|café|te\b|infusion|licor|coctel|aperitivo)\b/.test(texto)) return 'Bebidas'
  if (/\b(postre|helado|torta|tarta|flan|mousse|dulce|chocolate|brownie|cheesecake)\b/.test(texto)) return 'Postres'
  if (/\b(entrada|tapa|empanada|croqueta|bruschetta|carpaccio|tabla)\b/.test(texto)) return 'Entradas'
  if (/\b(guarnicion|ensalada|papas|vegetales|arroz|pure|wok)\b/.test(texto)) return 'Guarniciones'
  if (/\b(brunch|desayuno|tostada|medialunas|granola|smoothie)\b/.test(texto)) return 'Brunch'
  if (/\b(cafe|espresso|capuchino|latte|cortado|pastry|medialuna)\b/.test(texto)) return 'Cafetería'
  return 'Principales'
}

// ── Parser XLSX/CSV ───────────────────────────────────────────────────────
function parseSheet(buffer: ArrayBuffer): ItemImportado[] {
  const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' })
  const items: ItemImportado[] = []

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
    if (rows.length === 0) continue

    const findCol = (...candidates: string[]) =>
      Object.keys(rows[0]).find(k =>
        candidates.some(c => k.toLowerCase().includes(c))
      ) ?? null

    const colNombre    = findCol('nombre', 'plato', 'item', 'producto', 'name')
    const colCategoria = findCol('categoria', 'seccion', 'rubro', 'tipo', 'category')
    const colDesc      = findCol('descripcion', 'detalle', 'description', 'nota')
    const colPrecio    = findCol('precio', 'price', 'venta', 'importe')
    const colPorciones = findCol('porciones', 'personas', 'serves', 'para')

    for (const row of rows) {
      const nombre = norm(colNombre ? row[colNombre] : Object.values(row)[0])
      if (!nombre || nombre.length < 2) continue

      const desc      = norm(colDesc ? row[colDesc] : '')
      const categoria = norm(colCategoria ? row[colCategoria] : '') || inferCategoria(nombre, desc)
      const precio    = parsePrice(colPrecio ? row[colPrecio] : null)
      const porciones = parsePrice(colPorciones ? row[colPorciones] : null) ?? 1

      items.push({
        nombre, categoria, descripcion: desc,
        componentes: [] as ComponenteImportado[],
        precio_venta: precio,
        porciones: Math.max(1, Math.round(porciones)),
        tags: detectTags(nombre + ' ' + desc),
      })
    }
  }

  const seen = new Set<string>()
  return items.filter(i => {
    const key = i.nombre.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function detectTags(texto: string): string[] {
  const t = texto.toLowerCase()
  const tags: string[] = []
  if (/\b(sin tacc|s\/tacc|gluten.?free|sin gluten|gf\b|celiac)/.test(t)) tags.push('s/tacc')
  if (/\b(vegano|vegan\b)/.test(t)) tags.push('vegano')
  else if (/\b(vegetariano|vegetarian|veggie)/.test(t)) tags.push('vegetariano')
  if (/\b(keto|low.?carb|sin carbohidratos)/.test(t)) tags.push('keto')
  if (/\b(picante|spicy|chile|aji\b|habanero|sriracha)/.test(t)) tags.push('picante')
  if (/\b(sin lactosa|lactose.?free|sin leche|dairy.?free)/.test(t)) tags.push('sin lactosa')
  return tags
}

// ── Llamada a Claude (imagen / PDF / texto) ───────────────────────────────
async function parseConIA(
  content: string | ArrayBuffer,
  mimeType: string,
  apiKey: string,
): Promise<ItemImportado[]> {
  type AnthrContent =
    | { type: 'text'; text: string }
    | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
    | { type: 'document'; source: { type: 'base64'; media_type: string; data: string } }

  const userContent: AnthrContent[] = []

  if (typeof content === 'string') {
    userContent.push({ type: 'text', text: content })
  } else if (mimeType === 'application/pdf') {
    const b64 = Buffer.from(content).toString('base64')
    userContent.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } })
  } else {
    const b64 = Buffer.from(content).toString('base64')
    userContent.push({ type: 'image', source: { type: 'base64', media_type: mimeType as string, data: b64 } })
  }

  userContent.push({
    type: 'text',
    text: `Analizá este menú/carta y extraé cada plato con su estructura completa.

Devolvé SOLO un JSON array sin markdown (sin \`\`\`json). Formato exacto:
[{
  "nombre": "Nombre del plato",
  "categoria": "Entradas|Principales|Postres|Bebidas|Guarniciones|Brunch|Cafetería",
  "descripcion": "descripción libre si hay, si no vacío",
  "componentes": ["componente 1", "componente 2"],
  "precio_venta": 1500,
  "porciones": 1,
  "tags": []
}]

Instrucciones importantes:
- "nombre": SOLO el nombre principal del plato. Ej: si dice "Pastelito. Calabaza. Ricotta. Miel" → nombre es "Pastelito"
- "componentes": todo lo que compone el plato separado por puntos, comas o líneas después del nombre. Ej: ["Calabaza", "Ricotta de cabra", "Miel"]
- "porciones": si dice "(x1)", "(x2)", "para 2 personas", etc → ese número. Default: 1
- "tags": array con los que apliquen: "s/tacc" (sin TACC/gluten), "vegano", "vegetariano", "keto", "picante", "sin lactosa". Array vacío si ninguno.
- "precio_venta": número sin símbolo, null si no hay precio
- Omití encabezados de sección, títulos, notas al pie, separadores
- Incluí todas las entradas, principales, postres, bebidas y guarniciones`,
  })

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 8096,
      messages: [{ role: 'user', content: userContent }],
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Claude error: ${err}`)
  }

  const data = await response.json()
  const text = data.content?.[0]?.text ?? '[]'

  const match = text.match(/\[[\s\S]*\]/)
  if (!match) return []

  const parsed = JSON.parse(match[0]) as Record<string, unknown>[]
  return parsed.map(p => {
    const nombre = norm(p.nombre)
    const compNombres = Array.isArray(p.componentes)
      ? (p.componentes as unknown[]).map(c => norm(c)).filter(c => c.length > 1)
      : []
    const allText = nombre + ' ' + norm(p.descripcion) + ' ' + compNombres.join(' ')
    return {
      nombre,
      categoria: norm(p.categoria) || inferCategoria(nombre, norm(p.descripcion)),
      descripcion: norm(p.descripcion),
      // devolvemos strings; el cliente hace el auto-match con su DB local
      componentes: compNombres.map(n => ({ nombre: n, tipo: null, ref_id: null, ref_nombre: null })) as ComponenteImportado[],
      precio_venta: parsePrice(p.precio_venta),
      porciones: Math.max(1, Math.round(parsePrice(p.porciones) ?? 1)),
      tags: Array.isArray(p.tags)
        ? (p.tags as unknown[]).map(t => norm(t)).filter(Boolean)
        : detectTags(allText),
    }
  }).filter(p => p.nombre.length >= 2)
}

// ── Handler ───────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'API key no configurada' }, { status: 500 })

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const modo = (formData.get('modo') as string) ?? 'preview'
    const itemsJson = formData.get('items') as string | null

    // ── Modo apply ────────────────────────────────────────────────────────
    if (modo === 'apply' && itemsJson) {
      const items = JSON.parse(itemsJson) as ItemImportado[]
      const restauranteId = formData.get('restaurante_id') as string
      if (!restauranteId) return NextResponse.json({ error: 'restaurante_id requerido' }, { status: 400 })

      const { data: cats } = await supabase
        .from('carta_categorias')
        .select('nombre')
        .eq('restaurante_id', restauranteId)

      const catNombres = new Set((cats ?? []).map((c: { nombre: string }) => c.nombre))

      const { data: existentes } = await supabase
        .from('carta_items')
        .select('categoria, orden')
        .eq('restaurante_id', restauranteId)
        .order('orden', { ascending: false })

      const maxOrden: Record<string, number> = {}
      for (const e of existentes ?? []) {
        const cat = (e as { categoria: string; orden: number }).categoria
        const ord = (e as { categoria: string; orden: number }).orden
        if (maxOrden[cat] === undefined || ord > maxOrden[cat]) maxOrden[cat] = ord
      }

      const inserts = items.map(item => {
        const cat = catNombres.has(item.categoria) ? item.categoria : 'Principales'
        maxOrden[cat] = (maxOrden[cat] ?? -1) + 1

        // Descripción: nombres de componentes + descripción libre
        const nombresComp = item.componentes.map(c => c.nombre).filter(Boolean)
        const partes: string[] = []
        if (nombresComp.length > 0) partes.push(nombresComp.join(', '))
        if (item.descripcion && !nombresComp.some(c => item.descripcion.includes(c))) partes.push(item.descripcion)
        const descripcionFinal = partes.join(' · ') || null

        return {
          nombre: item.nombre,
          descripcion: descripcionFinal,
          precio_venta: item.precio_venta ?? 0,
          categoria: cat,
          disponible: true,
          restaurante_id: restauranteId,
          orden: maxOrden[cat],
        }
      })

      const { data: inserted, error: insertErr } = await supabase
        .from('carta_items')
        .insert(inserts)
        .select('id')

      if (insertErr) throw insertErr

      // Crear plato_recetas para componentes vinculados a recetas
      const recetaLinks: { plato_id: string; receta_id: string; porciones: number; orden: number }[] = []
      ;(inserted ?? []).forEach((row: { id: string }, i: number) => {
        const item = items[i]
        item.componentes
          .filter(c => c.tipo === 'receta' && c.ref_id)
          .forEach((c, orden) => {
            recetaLinks.push({ plato_id: row.id, receta_id: c.ref_id!, porciones: 1, orden })
          })
      })
      if (recetaLinks.length > 0) {
        await supabase.from('plato_recetas').insert(recetaLinks)
      }

      return NextResponse.json({ insertados: inserted?.length ?? 0, recetas_vinculadas: recetaLinks.length })
    }

    // ── Modo preview ──────────────────────────────────────────────────────
    if (!file) return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 })

    const mimeType = file.type
    const buffer = await file.arrayBuffer()
    let items: ItemImportado[] = []

    if (mimeType.includes('spreadsheet') || mimeType.includes('csv') ||
        file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv')) {
      items = parseSheet(buffer)
    } else if (mimeType === 'text/plain' || file.name.endsWith('.txt')) {
      const text = new TextDecoder().decode(buffer)
      items = await parseConIA(text, mimeType, apiKey)
    } else {
      items = await parseConIA(buffer, mimeType || 'application/pdf', apiKey)
    }

    return NextResponse.json({ items, total: items.length })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error al importar carta'
    console.error('[api/carta/import]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
