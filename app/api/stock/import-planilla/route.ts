import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ── Types ──────────────────────────────────────────────────────

export interface SheetData {
  nombre: string
  rows: string[][]
}

export interface PlanillaItem {
  nombre: string
  unidad: string | null
  stock_actual: number | null
  stock_minimo: number | null
  stock_critico: number | null
  hoja: string
  // match result (server-populated in preview mode)
  producto_id: string | null
  producto_nombre: string | null
  producto_unidad: string | null
  confianza: 'exacto' | 'parcial' | 'nuevo'
}

// ── Haiku prompt ───────────────────────────────────────────────

const HAIKU_SYSTEM = `Sos un sistema de extracción de datos de inventario para restaurantes argentinos.

Recibís el contenido de planillas de stock exportadas (Google Sheets/Excel). Pueden tener múltiples hojas y formatos caóticos: headers con colores, sub-tablas por proveedor, filas vacías, secciones mixtas.

Tu tarea: extraé TODOS los productos con sus valores de stock.

REGLAS DE EXTRACCIÓN:
- Ignorá filas que son solo encabezados de columna (contienen "Stock actual", "Mínimo", "Pedir", "Producto" sin números)
- Ignorá filas de sección/proveedor (solo texto, sin valores numéricos)
- Ignorá filas completamente vacías
- El nombre puede incluir la unidad entre paréntesis: "Aceite barbieri (litros)" → nombre:"Aceite barbieri", unidad:"litros"
- Si no hay unidad explícita en el nombre, intentá inferirla del contexto (ej: si dice "kg" en otra columna)
- Columna "Actual" o "Stock actual" → stock_actual
- Columna "Mínimo" o "Stock mínimo" o "Min" → stock_minimo
- Columna "Crítico" o "Stock crítico" → stock_critico (puede no existir → null)
- Columna "Pedir" → IGNORAR (es diferencia, no es stock)
- Los números pueden estar en formato argentino: 12,5 = 12.5; 1.200 = 1200

Respondé ÚNICAMENTE con JSON válido, sin texto adicional, sin backticks, sin markdown:
{
  "items": [
    {
      "nombre": "nombre del producto sin unidad entre paréntesis",
      "unidad": "kg|litros|l|unidades|u|g|ml|etc — null si no se puede determinar",
      "stock_actual": número o null,
      "stock_minimo": número o null,
      "stock_critico": número o null,
      "hoja": "nombre de la hoja"
    }
  ]
}`

// ── Fuzzy match ────────────────────────────────────────────────

function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function matchScore(a: string, b: string): number {
  const na = normalizar(a)
  const nb = normalizar(b)
  if (na === nb) return 1
  if (na.includes(nb) || nb.includes(na)) return 0.85
  const wordsA = new Set(na.split(' ').filter(w => w.length > 2))
  const wordsB = new Set(nb.split(' ').filter(w => w.length > 2))
  if (wordsA.size === 0 || wordsB.size === 0) return 0
  const intersection = [...wordsA].filter(w => wordsB.has(w)).length
  const union = new Set([...wordsA, ...wordsB]).size
  return intersection / union
}

// ── Normalizar unidad ──────────────────────────────────────────

function normalizeUnidad(u: string | null): string {
  if (!u) return 'u'
  const n = u.toLowerCase().trim()
  if (['kg', 'kilogramo', 'kilogramos', 'kilo', 'kilos'].includes(n)) return 'kg'
  if (['g', 'gr', 'gramo', 'gramos', 'grs'].includes(n)) return 'g'
  if (['litro', 'litros', 'l', 'lt', 'lts'].includes(n)) return 'L'
  if (['ml', 'mililitro', 'mililitros', 'cc'].includes(n)) return 'ml'
  if (['u', 'un', 'unidad', 'unidades', 'und', 'unid'].includes(n)) return 'unidad'
  return u
}

// ── Route ─────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: ur } = await supabase
    .from('user_restaurantes')
    .select('restaurante_id')
    .eq('user_id', user.id)
    .single()
  const rid = ur?.restaurante_id
  if (!rid) return NextResponse.json({ error: 'Sin restaurante' }, { status: 400 })

  const body = await req.json()
  const mode: 'preview' | 'apply' = body.mode ?? 'preview'

  // ── APPLY ──────────────────────────────────────────────────────
  if (mode === 'apply') {
    const confirmedItems: PlanillaItem[] = body.items ?? []
    if (!confirmedItems.length) return NextResponse.json({ error: 'Sin items' }, { status: 400 })

    const admin = createAdminClient()
    let updated = 0
    let created = 0
    const errors: string[] = []

    for (const item of confirmedItems) {
      try {
        if (item.producto_id) {
          // Update existing product — only stock fields, never overwrite price/name
          const updates: Record<string, unknown> = {}
          if (item.stock_actual !== null) updates.stock_actual = item.stock_actual
          if (item.stock_minimo !== null) updates.stock_minimo = item.stock_minimo
          if (item.stock_critico !== null) updates.stock_critico = item.stock_critico

          if (Object.keys(updates).length > 0) {
            const { error } = await admin.from('productos').update(updates).eq('id', item.producto_id)
            if (error) throw error
            updated++
          }
        } else {
          // Create new product with stock data
          const { error } = await admin.from('productos').insert({
            restaurante_id: rid,
            nombre: item.nombre,
            unidad: normalizeUnidad(item.unidad),
            stock_actual: item.stock_actual ?? 0,
            stock_minimo: item.stock_minimo ?? 0,
            stock_critico: item.stock_critico ?? null,
            precio_unitario: 0,
            categoria: 'Otros',
          })
          if (error) throw error
          created++
        }
      } catch (e) {
        errors.push(`${item.nombre}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    return NextResponse.json({ updated, created, errors })
  }

  // ── PREVIEW ────────────────────────────────────────────────────
  const sheets: SheetData[] = body.sheets ?? []
  if (!sheets.length) return NextResponse.json({ error: 'Sin hojas' }, { status: 400 })

  // Convert to text for Sonnet — max 300 rows per sheet, max 15 sheets
  // Skip rows that are fully empty or contain only tab characters
  const textData = sheets
    .slice(0, 15)
    .map(s => {
      const text = s.rows
        .slice(0, 300)
        .map(r => r.map(c => String(c ?? '').trim()).join('\t'))
        .filter(line => line.replace(/[\t\s]/g, '').length > 0)
        .join('\n')
      return `=== HOJA: ${s.nombre} ===\n${text}`
    })
    .join('\n\n')

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'Sin API key de IA' }, { status: 500 })

  let extracted: Array<{
    nombre: string
    unidad: string | null
    stock_actual: number | null
    stock_minimo: number | null
    stock_critico: number | null
    hoja: string
  }> = []

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 8192,
        system: HAIKU_SYSTEM,
        messages: [{ role: 'user', content: textData }],
      }),
    })

    if (!resp.ok) {
      const errText = await resp.text()
      console.error('[stock/import-planilla] API error:', resp.status, errText)
      return NextResponse.json({ error: `Error IA (${resp.status}): ${errText.slice(0, 200)}` }, { status: 500 })
    }

    const data = await resp.json()
    const content = (data.content?.[0]?.text ?? '') as string

    // Robust JSON extraction: find the first { ... } block even if there's surrounding text
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error('[stock/import-planilla] No JSON in response. Raw:', content.slice(0, 500))
      return NextResponse.json({ error: `IA no devolvió JSON válido. Respuesta: ${content.slice(0, 150)}` }, { status: 422 })
    }

    const parsed = JSON.parse(jsonMatch[0])
    extracted = parsed.items ?? []
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[stock/import-planilla] Error:', msg)
    return NextResponse.json({ error: `Error al interpretar la planilla: ${msg}` }, { status: 500 })
  }

  if (!extracted.length) {
    return NextResponse.json({ error: 'No se encontraron productos en el archivo' }, { status: 422 })
  }

  // Fuzzy match against existing products
  const admin = createAdminClient()
  const { data: productos } = await admin
    .from('productos')
    .select('id, nombre, unidad, stock_actual, stock_minimo')
    .eq('restaurante_id', rid)

  const items: PlanillaItem[] = extracted.map(item => {
    let bestId: string | null = null
    let bestNombre: string | null = null
    let bestUnidad: string | null = null
    let bestScore = 0

    for (const p of (productos ?? [])) {
      const score = matchScore(item.nombre, p.nombre)
      if (score > bestScore) {
        bestScore = score
        bestId = p.id
        bestNombre = p.nombre
        bestUnidad = p.unidad
      }
    }

    let confianza: PlanillaItem['confianza']
    if (bestScore >= 0.99) {
      confianza = 'exacto'
    } else if (bestScore >= 0.65) {
      confianza = 'parcial'
    } else {
      confianza = 'nuevo'
      bestId = null
      bestNombre = null
      bestUnidad = null
    }

    return {
      nombre: item.nombre,
      unidad: item.unidad,
      stock_actual: item.stock_actual,
      stock_minimo: item.stock_minimo,
      stock_critico: item.stock_critico,
      hoja: item.hoja,
      producto_id: bestId,
      producto_nombre: bestNombre,
      producto_unidad: bestUnidad,
      confianza,
    }
  })

  // Sort: exacto → parcial → nuevo
  const sorted = [
    ...items.filter(i => i.confianza === 'exacto'),
    ...items.filter(i => i.confianza === 'parcial'),
    ...items.filter(i => i.confianza === 'nuevo'),
  ]

  const nExacto = sorted.filter(i => i.confianza === 'exacto').length
  const nParcial = sorted.filter(i => i.confianza === 'parcial').length
  const nNuevo = sorted.filter(i => i.confianza === 'nuevo').length

  return NextResponse.json({ items: sorted, nExacto, nParcial, nNuevo })
}
