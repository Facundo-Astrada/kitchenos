import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import * as XLSX from 'xlsx'
import mammoth from 'mammoth'
import { pedirAClaude } from '@/lib/ia/claude'

export const maxDuration = 120

const SKIP_SHEETS = ['Template', 'Copia de Template', 'Hoja 6']
const MAX_CHARS_PER_SHEET = 8000
const BATCH_SIZE = 8 // parallel Claude calls per batch — respeta rate limits

const systemPrompt = `Sos un experto en fichas técnicas de cocina profesional argentina.
Te paso UN BLOQUE de texto que contiene UNA receta. Devolvé SOLO un array JSON con la receta extraída.

FORMATO DE SALIDA (array JSON, sin texto extra, sin markdown):
[{"nombre":"string","categoria":"string","porciones":1,"procedimiento":"string","ingredientes":[{"nombre":"string","cantidad":1,"unidad":"string"}]}]

Si el bloque no tiene datos reales (todo en 0 o vacío), devolvé [].

CATEGORÍAS: Entradas | Principales | Postres | Bases y Salsas | Otros
- Subrecetas/bases (ganache, masas, salsas, fondos) → "Bases y Salsas"
- Plato principal de carne/pescado/pasta → "Principales"
- Postres → "Postres"

ESTRUCTURA TÍPICA:
- El bloque empieza con "NombreReceta Rinde: X Unidad" o similar
- Markers opcionales: [BOLD] = texto en negrita, [merged X:Y] = celda combinada en Excel
- Ingredientes en filas tabulares separadas por " | " — columnas típicas: Producto | Cantidad | Unidad | Costo
- Procedimiento: texto libre después de "Procedimiento:"
- Para platos con "Emplatado", los componentes del emplatado son los ingredientes

REGLAS:
- Normalizar unidades: Gr/GR→gr, Kg/KG→kg, L/Lt→l, Ml/ML→ml, Un/UN/Und→u
- Ignorar filas con valor 0 o vacíos
- Si no hay procedimiento, devolver string vacío ""
- NO inventar datos — si un campo no está, omitirlo
- SIEMPRE devolver array JSON válido, NUNCA texto explicativo`

type AnthropicContent =
  | { type: 'text'; text: string }
  | { type: 'document'; source: { type: 'base64'; media_type: 'application/pdf'; data: string } }

interface CellStyle { font?: { bold?: boolean; b?: boolean } }
interface XLSXCell { v?: unknown; w?: string; s?: CellStyle }

// ─────────────────────────────────────────────────────────
// NORMALIZATION LAYER — converts each format to structured text
// ─────────────────────────────────────────────────────────

function extractStructuredSheet(ws: XLSX.WorkSheet, sheetName: string): string {
  if (!ws['!ref']) return ''
  const range = XLSX.utils.decode_range(ws['!ref'])
  const merges = ws['!merges'] ?? []

  const mergeAt = new Map<string, string>()
  const mergeHidden = new Set<string>()
  for (const m of merges) {
    const startAddr = XLSX.utils.encode_cell(m.s)
    const endAddr = XLSX.utils.encode_cell(m.e)
    mergeAt.set(startAddr, `${startAddr}:${endAddr}`)
    for (let r = m.s.r; r <= m.e.r; r++) {
      for (let c = m.s.c; c <= m.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r, c })
        if (addr !== startAddr) mergeHidden.add(addr)
      }
    }
  }

  const lines: string[] = [`=== HOJA: "${sheetName}" ===`]

  for (let r = range.s.r; r <= range.e.r; r++) {
    const cells: { val: string; bold: boolean; merged?: string }[] = []
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c })
      if (mergeHidden.has(addr)) continue
      const cell = ws[addr] as XLSXCell | undefined
      if (!cell) continue
      const val = String(cell.w ?? cell.v ?? '').trim()
      if (!val || val === '0') continue
      const bold = !!(cell.s?.font?.bold || cell.s?.font?.b)
      const merged = mergeAt.get(addr)
      cells.push({ val, bold, merged })
    }
    if (cells.length === 0) continue
    if (cells.length === 1) {
      const { val, bold, merged } = cells[0]
      const tags: string[] = []
      if (merged) tags.push(`merged ${merged}`)
      if (bold) tags.push('BOLD')
      const prefix = tags.length ? `[${tags.join(' ')}] ` : ''
      lines.push(`${prefix}${val}`)
    } else {
      const firstBold = cells[0].bold
      const prefix = firstBold ? '[BOLD] ' : ''
      lines.push(prefix + cells.map(c => c.val).join(' | '))
    }
  }

  if (lines.length === 1) return ''
  return lines.join('\n').slice(0, MAX_CHARS_PER_SHEET)
}

async function extractPdfStructured(buffer: ArrayBuffer): Promise<string> {
  const { extractText } = await import('unpdf')
  const result = await extractText(new Uint8Array(buffer), { mergePages: false })
  const pages = Array.isArray(result.text) ? result.text : [result.text]
  return pages
    .map((p, i) => `=== PÁGINA ${i + 1} ===\n${p.trim()}`)
    .filter(p => p.length > 30)
    .join('\n\n')
}

// ─────────────────────────────────────────────────────────
// BLOCK SPLITTING — same logic for all formats
// Each "Rinde:" marker delimits one recipe
// ─────────────────────────────────────────────────────────

function splitIntoRecipeBlocks(content: string, fallback: string): { name: string; text: string }[] {
  const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('==='))
  const blocks: { name: string; lines: string[] }[] = []
  let current: { name: string; lines: string[] } | null = null

  const RINDE_RX = /\brinde\s*:/i

  function extractName(line: string, fb: string): string {
    const cleaned = line.replace(/\[(merged \S+|BOLD|merged \S+ BOLD)\]\s*/gi, '').trim()
    let name = cleaned.split('|')[0].trim()
    if (RINDE_RX.test(name)) name = name.split(RINDE_RX)[0].trim()
    name = name.replace(/^plato\s*:\s*/i, '').trim()
    // Remove trailing numbers / costs that sometimes appear after the name
    name = name.replace(/\s+\d+[\d.,]*\s*$/, '').trim()
    return name || fb
  }

  for (const line of lines) {
    if (RINDE_RX.test(line)) {
      if (current) blocks.push(current)
      current = { name: extractName(line, fallback), lines: [line] }
    } else if (current) {
      current.lines.push(line)
    } else {
      current = { name: fallback, lines: [line] }
    }
  }
  if (current) blocks.push(current)

  return blocks
    .map(b => ({ name: b.name, text: b.lines.join('\n') }))
    .filter(b => {
      // Block must have at least 2 non-empty data rows to be a real recipe
      const dataLines = b.text.split('\n').filter(l => {
        const cleaned = l.replace(/\[.*?\]\s*/g, '').trim()
        const cols = cleaned.split('|').map(s => s.trim()).filter(s => s && s !== '0')
        return cols.length >= 2
      })
      return dataLines.length >= 2
    })
}

// ─────────────────────────────────────────────────────────
// EXTRACTION LAYER — per-block Claude calls in batches
// ─────────────────────────────────────────────────────────

async function callClaude(content: AnthropicContent[]): Promise<unknown[]> {
  const resultado = await pedirAClaude({
    tag: 'importador/fichas-tecnicas',
    model: 'claude-sonnet-4-6',
    maxTokens: 4000,
    temperature: 0,
    system: systemPrompt,
    messages: [{ role: 'user', content }],
    headers: { 'anthropic-beta': 'pdfs-2024-09-25' },
  })
  // Devolver [] es indistinguible de "el PDF no tenía fichas" para quien lo
  // subió. Al menos que el log de pedirAClaude diga por qué, hasta que el
  // flujo sepa propagar el error a la pantalla.
  if (!resultado.ok) return []

  const text = resultado.texto
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start === -1 || end <= start) return []
  try {
    const parsed = JSON.parse(text.slice(start, end + 1))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function processBlocks(blocks: { name: string; text: string }[]): Promise<unknown[]> {
  const all: unknown[] = []
  for (let i = 0; i < blocks.length; i += BATCH_SIZE) {
    const batch = blocks.slice(i, i + BATCH_SIZE)
    const results = await Promise.allSettled(
      batch.map(b =>
        callClaude([{
          type: 'text',
          text: `Nombre sugerido para la receta: "${b.name}"\n\nBloque:\n${b.text}`,
        }])
      )
    )
    for (const r of results) {
      if (r.status === 'fulfilled') all.push(...r.value)
    }
  }
  return all
}

// ─────────────────────────────────────────────────────────
// POST-PROCESSING — generate emplatado procedures + mark duplicates
// ─────────────────────────────────────────────────────────

interface ExtractedReceta {
  nombre?: string
  categoria?: string
  porciones?: number
  procedimiento?: string
  ingredientes?: { nombre?: string; cantidad?: number; unidad?: string }[]
  _existing?: boolean
  _duplicate?: boolean
}

function normalizeKey(s: string): string {
  return s.toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ')
}

// For recipes without procedimiento but with ingredients, generate "Emplatar: X (qty)..."
function fillEmplatadoProcedures(recetas: ExtractedReceta[]): ExtractedReceta[] {
  return recetas.map(r => {
    const hasProc = (r.procedimiento ?? '').trim().length > 0
    const ings = r.ingredientes ?? []
    if (hasProc || ings.length < 2) return r
    const parts = ings
      .filter(i => i.nombre && i.nombre.trim())
      .map(i => {
        const qty = typeof i.cantidad === 'number' && i.cantidad > 0
          ? ` (${i.cantidad}${i.unidad ?? ''})`
          : ''
        return `${i.nombre}${qty}`
      })
    if (!parts.length) return r
    return { ...r, procedimiento: `Emplatar: ${parts.join(', ')}` }
  })
}

// Mark recipes that already exist in DB or are duplicated within this batch
async function markDuplicates(recetas: ExtractedReceta[], restauranteId: string): Promise<ExtractedReceta[]> {
  let existingNames = new Set<string>()
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('recetas')
      .select('nombre')
      .eq('restaurante_id', restauranteId)
    existingNames = new Set((data ?? []).map(r => normalizeKey(r.nombre ?? '')))
  } catch (e) {
    console.error('[fichas-tecnicas] markDuplicates DB error:', e)
  }

  const seenInBatch = new Set<string>()
  return recetas.map(r => {
    const key = normalizeKey(r.nombre ?? '')
    if (!key) return r
    const _existing = existingNames.has(key)
    const _duplicate = seenInBatch.has(key)
    seenInBatch.add(key)
    return { ...r, _existing, _duplicate }
  })
}

// ─────────────────────────────────────────────────────────
// MAIN ROUTE
// ─────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const t0 = Date.now()
  const diag = {
    ext: '',
    fileSize: 0,
    sheets: 0,
    pagesOrSheets: 0,
    blocksDetected: 0,
    recipesExtracted: 0,
    usedFallback: false,
    elapsedMs: 0,
    sampleBlockNames: [] as string[],
  }

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'API key no configurada' }, { status: 500 })

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 })

    const buffer = await file.arrayBuffer()
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    const docName = file.name.replace(/\.[^.]+$/, '')

    diag.ext = ext
    diag.fileSize = buffer.byteLength

    console.log('[fichas-tecnicas] START', { ext, fileSize: buffer.byteLength, name: file.name })

    const blocks: { name: string; text: string }[] = []

    if (ext === 'xlsx' || ext === 'xls') {
      const wb = XLSX.read(buffer, { type: 'array', cellStyles: true })
      const sheets = wb.SheetNames.filter(n => !SKIP_SHEETS.includes(n))
      diag.sheets = sheets.length
      diag.pagesOrSheets = sheets.length
      for (const sheetName of sheets) {
        const content = extractStructuredSheet(wb.Sheets[sheetName], sheetName)
        if (!content) {
          console.log('[fichas-tecnicas] Sheet empty:', sheetName)
          continue
        }
        const sheetBlocks = splitIntoRecipeBlocks(content, sheetName)
        console.log(`[fichas-tecnicas] Sheet "${sheetName}": ${sheetBlocks.length} blocks`)
        blocks.push(...sheetBlocks)
      }
    } else if (ext === 'pdf') {
      const structured = await extractPdfStructured(buffer)
      diag.pagesOrSheets = (structured.match(/=== PÁGINA/g) ?? []).length
      console.log(`[fichas-tecnicas] PDF parsed: ${diag.pagesOrSheets} pages, ${structured.length} chars`)
      blocks.push(...splitIntoRecipeBlocks(structured, docName))
    } else if (ext === 'docx') {
      const result = await mammoth.extractRawText({ arrayBuffer: buffer })
      console.log(`[fichas-tecnicas] DOCX parsed: ${result.value.length} chars`)
      blocks.push(...splitIntoRecipeBlocks(result.value, docName))
    } else {
      return NextResponse.json({ error: 'Formato no soportado. Usá .xlsx, .docx o .pdf' }, { status: 400 })
    }

    diag.blocksDetected = blocks.length
    diag.sampleBlockNames = blocks.slice(0, 5).map(b => b.name)
    console.log('[fichas-tecnicas] Blocks detected:', blocks.length, diag.sampleBlockNames)

    // Fallback: PDF without detectable blocks → document API
    if (!blocks.length && ext === 'pdf') {
      console.log('[fichas-tecnicas] Using PDF document API fallback')
      diag.usedFallback = true
      const base64 = Buffer.from(buffer).toString('base64')
      const recetas = await callClaude([
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
        { type: 'text', text: 'Extraé todas las recetas de este documento como array JSON.' },
      ])
      diag.recipesExtracted = recetas.length
      diag.elapsedMs = Date.now() - t0
      console.log('[fichas-tecnicas] DONE (fallback)', diag)
      if (!recetas.length) {
        return NextResponse.json({ ok: false, error: 'No se detectaron recetas en el PDF', diag })
      }
      return NextResponse.json({ ok: true, recetas, diag })
    }

    if (!blocks.length) {
      console.log('[fichas-tecnicas] No blocks detected', diag)
      return NextResponse.json({ ok: false, error: 'No se detectaron bloques de receta en el archivo', diag })
    }

    let recetas = await processBlocks(blocks) as ExtractedReceta[]
    diag.recipesExtracted = recetas.length

    if (!recetas.length) {
      diag.elapsedMs = Date.now() - t0
      return NextResponse.json({ ok: false, error: 'No se pudieron extraer recetas válidas', diag })
    }

    // POST-PROCESS: generate emplatado procedures for PLATOs without one
    recetas = fillEmplatadoProcedures(recetas)

    // POST-PROCESS: mark duplicates (existing in DB + intra-batch repeated names)
    const adminSupabase = createAdminClient()
    const { data: ur } = await adminSupabase
      .from('user_restaurantes')
      .select('restaurante_id')
      .eq('user_id', user.id)
      .single()
    if (ur?.restaurante_id) {
      recetas = await markDuplicates(recetas, ur.restaurante_id)
    }

    diag.elapsedMs = Date.now() - t0
    console.log('[fichas-tecnicas] DONE', diag)

    return NextResponse.json({ ok: true, recetas, diag })
  } catch (e) {
    diag.elapsedMs = Date.now() - t0
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[fichas-tecnicas] CRASH', msg, diag)
    return NextResponse.json({ ok: false, error: `Error inesperado: ${msg}`, diag }, { status: 500 })
  }
}
