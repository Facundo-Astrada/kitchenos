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

// ── Prompt (por hoja individual) ───────────────────────────────

const SHEET_SYSTEM = `Sos un extractor de datos de inventario para restaurantes argentinos.
Recibís el contenido de UNA HOJA de una planilla de stock (Google Sheets/Excel exportado).
El formato puede ser caótico: headers de colores, sub-tablas por proveedor, filas vacías.

Tu tarea: extraé TODOS los productos de esa hoja.

REGLAS:
- Ignorá filas de encabezado de columnas ("Stock actual", "Mínimo", "Pedir", "Producto", etc.)
- Ignorá filas de sección/proveedor (solo texto, sin números)
- Ignorá filas vacías
- Nombre con unidad entre paréntesis: "Aceite barbieri (litros)" → nombre:"Aceite barbieri", unidad:"litros"
- "Actual" / "Stock actual" → stock_actual
- "Mínimo" / "Min" → stock_minimo
- "Crítico" → stock_critico (null si no existe)
- "Pedir" → IGNORAR
- Números en formato AR: 12,5 → 12.5; 1.200 → 1200

Respondé SOLO con JSON, sin texto ni backticks:
{"items":[{"nombre":"...","unidad":"kg|l|ml|g|unidades|etc o null","stock_actual":número_o_null,"stock_minimo":número_o_null,"stock_critico":número_o_null}]}`

type ExtractedItem = {
  nombre: string
  unidad: string | null
  stock_actual: number | null
  stock_minimo: number | null
  stock_critico: number | null
  hoja: string
}

async function extractSheetItems(sheet: SheetData, apiKey: string): Promise<ExtractedItem[]> {
  const text = sheet.rows
    .slice(0, 400)
    .map(r => r.map(c => String(c ?? '').trim()).join('\t'))
    .filter(line => line.replace(/[\t\s]/g, '').length > 0)
    .join('\n')

  if (!text.trim()) return []

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        system: SHEET_SYSTEM,
        messages: [{ role: 'user', content: `HOJA "${sheet.nombre}":\n${text}` }],
      }),
    })

    if (!resp.ok) {
      console.warn(`[import-planilla] hoja "${sheet.nombre}" error ${resp.status}`)
      return []
    }

    const data = await resp.json()
    const content = (data.content?.[0]?.text ?? '') as string
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return []

    const parsed = JSON.parse(jsonMatch[0])
    return (parsed.items ?? []).map((item: Omit<ExtractedItem, 'hoja'>) => ({
      ...item,
      hoja: sheet.nombre,
    }))
  } catch {
    console.warn(`[import-planilla] hoja "${sheet.nombre}" falló silenciosamente`)
    return []
  }
}

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
            // .eq('restaurante_id', rid) además de 'id': item.producto_id lo manda el
            // cliente en el body del "apply" — sin este filtro, el admin client (bypasea
            // RLS) dejaría pisar el stock de un producto de OTRO restaurante con un id
            // forjado. El preview ya matchea solo contra productos de rid (línea de abajo),
            // pero eso no evita que el apply reciba un id distinto.
            const { data: actualizado, error } = await admin.from('productos').update(updates)
              .eq('id', item.producto_id).eq('restaurante_id', rid)
              .select('id')
            if (error) throw error
            if (!actualizado?.length) throw new Error('producto no pertenece a este restaurante')
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

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'Sin API key de IA' }, { status: 500 })

  // Procesar cada hoja en paralelo — cada llamada IA es pequeña, nunca se trunca
  const BATCH = 5 // max paralelas simultáneas para no saturar rate limit
  const allSheets = sheets.slice(0, 15)
  let extracted: ExtractedItem[] = []

  for (let i = 0; i < allSheets.length; i += BATCH) {
    const batch = allSheets.slice(i, i + BATCH)
    const results = await Promise.all(batch.map(s => extractSheetItems(s, apiKey)))
    extracted.push(...results.flat())
  }

  if (!extracted.length) {
    return NextResponse.json({ error: 'No se encontraron productos en ninguna hoja del archivo' }, { status: 422 })
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
