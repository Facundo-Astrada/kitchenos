import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'

export const maxDuration = 60

// ── Types ────────────────────────────────────────────────────────────────
export interface ItemImportado {
  nombre: string
  categoria: string
  descripcion: string
  precio_venta: number | null
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

// Intenta inferir categoría a partir del texto
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

    // Detectar columnas por nombre normalizado
    const headers = Object.keys(rows[0]).map(h => h.toLowerCase().trim())
    const findCol = (...candidates: string[]) =>
      Object.keys(rows[0]).find(k =>
        candidates.some(c => k.toLowerCase().includes(c))
      ) ?? null

    const colNombre    = findCol('nombre', 'plato', 'item', 'producto', 'descripcion', 'name')
    const colCategoria = findCol('categoria', 'seccion', 'rubro', 'tipo', 'category')
    const colDesc      = findCol('descripcion', 'detalle', 'description', 'nota')
    const colPrecio    = findCol('precio', 'price', 'venta', 'importe', 'cost')

    for (const row of rows) {
      const nombre = norm(colNombre ? row[colNombre] : Object.values(row)[0])
      if (!nombre || nombre.length < 2) continue

      const desc      = norm(colDesc ? row[colDesc] : '')
      const categoria = norm(colCategoria ? row[colCategoria] : '') || inferCategoria(nombre, desc)
      const precio    = parsePrice(colPrecio ? row[colPrecio] : null)

      items.push({ nombre, categoria, descripcion: desc, precio_venta: precio })
    }
  }

  // Deduplicar por nombre normalizado
  const seen = new Set<string>()
  return items.filter(i => {
    const key = i.nombre.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
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
    // Texto plano
    userContent.push({ type: 'text', text: content })
  } else if (mimeType === 'application/pdf') {
    const b64 = Buffer.from(content).toString('base64')
    userContent.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } })
  } else {
    // Imagen
    const b64 = Buffer.from(content).toString('base64')
    userContent.push({ type: 'image', source: { type: 'base64', media_type: mimeType as string, data: b64 } })
  }

  userContent.push({
    type: 'text',
    text: `Extraé todos los platos/productos del menú o carta que aparecen en el contenido.
Devolvé SOLO un JSON array con este formato exacto (sin markdown, sin texto adicional):
[{"nombre":"...","categoria":"...","descripcion":"...","precio_venta":null_o_numero}]

Reglas:
- "nombre": nombre del plato tal como aparece
- "categoria": una de estas: Entradas, Principales, Postres, Bebidas, Guarniciones, Brunch, Cafetería — elegí la más apropiada
- "descripcion": descripción corta del plato si existe, si no ""
- "precio_venta": precio numérico sin símbolo (ej: 1500), null si no hay precio
- Omití bebidas genéricas sin nombre (ej: "Agua", "Vino de la casa" sí, pero no encabezados de sección)
- Omití títulos de sección, encabezados, notas al pie`,
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
      max_tokens: 4096,
      messages: [{ role: 'user', content: userContent }],
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Claude error: ${err}`)
  }

  const data = await response.json()
  const text = data.content?.[0]?.text ?? '[]'

  // Extraer JSON aunque venga con texto alrededor
  const match = text.match(/\[[\s\S]*\]/)
  if (!match) return []

  const parsed = JSON.parse(match[0]) as Record<string, unknown>[]
  return parsed.map(p => ({
    nombre: norm(p.nombre),
    categoria: norm(p.categoria) || 'Principales',
    descripcion: norm(p.descripcion),
    precio_venta: parsePrice(p.precio_venta),
  })).filter(p => p.nombre.length >= 2)
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
    const modo = (formData.get('modo') as string) ?? 'preview'  // 'preview' | 'apply'
    const itemsJson = formData.get('items') as string | null     // JSON para modo apply

    // ── Modo apply: guardar items ya confirmados ──────────────────────────
    if (modo === 'apply' && itemsJson) {
      const items = JSON.parse(itemsJson) as ItemImportado[]
      const restauranteId = formData.get('restaurante_id') as string
      if (!restauranteId) return NextResponse.json({ error: 'restaurante_id requerido' }, { status: 400 })

      // Categorías del restaurante
      const { data: cats } = await supabase
        .from('carta_categorias')
        .select('nombre')
        .eq('restaurante_id', restauranteId)

      const catNombres = new Set((cats ?? []).map((c: { nombre: string }) => c.nombre))

      // Detectar máximo orden por categoría
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
        return {
          nombre: item.nombre,
          descripcion: item.descripcion || null,
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
      return NextResponse.json({ insertados: inserted?.length ?? 0 })
    }

    // ── Modo preview: parsear archivo ─────────────────────────────────────
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
      // PDF o imagen — Claude con vision
      items = await parseConIA(buffer, mimeType || 'application/pdf', apiKey)
    }

    return NextResponse.json({ items, total: items.length })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error al importar carta'
    console.error('[api/carta/import]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
