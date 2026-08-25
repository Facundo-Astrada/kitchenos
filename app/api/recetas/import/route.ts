import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/server'
import { clasificarErrorIA, statusErrorIA } from '@/lib/ia/errores'

const SYSTEM_PROMPT = `Sos un asistente de cocina profesional que analiza recetas.
Analizá la información proporcionada (puede ser una imagen de receta, texto copiado, o una transcripción de audio) y extraé los datos estructurados.

SIEMPRE respondé ÚNICAMENTE con un JSON válido, sin texto adicional, sin markdown, sin backticks. El JSON debe tener esta estructura exacta:

{
  "nombre_sugerido": "string - nombre de la receta",
  "categoria_sugerida": "string - una de: Entradas, Principales, Postres, Guarniciones, Bebidas, Pastelería, Panadería",
  "porciones": number,
  "tiempo_minutos": number,
  "ingredientes": [
    { "nombre": "string", "cantidad": "string con coma decimal (ej: 0,5)", "unidad": "kg|g|l|ml|u" }
  ],
  "procedimiento": ["paso 1", "paso 2", "..."]
}

Reglas:
- Las cantidades deben usar coma como separador decimal (formato argentino): "0,5" no "0.5"
- Unidades válidas: kg, g, l, ml, u (unidades)
- Si no podés determinar un campo, usá un valor razonable
- El procedimiento debe ser pasos claros y concisos
- Si la imagen/texto está borrosa o es ilegible, hacé tu mejor esfuerzo e indicá incertidumbre en el nombre`

const ADJUST_SYSTEM = `Sos un asistente de cocina profesional. El usuario ya importó una receta con IA y quiere hacer ajustes.
Recibís la receta actual en JSON y el pedido del usuario. Devolvé ÚNICAMENTE el JSON corregido completo (misma estructura), sin texto adicional, sin markdown, sin backticks.

La estructura JSON es:
{
  "nombre_sugerido": "string",
  "categoria_sugerida": "string",
  "porciones": number,
  "tiempo_minutos": number,
  "ingredientes": [{ "nombre": "string", "cantidad": "string con coma decimal", "unidad": "kg|g|l|ml|u" }],
  "procedimiento": ["paso 1", "paso 2"]
}`

const MULTI_SYSTEM_PROMPT = `Sos un asistente de cocina profesional que analiza archivos con MÚLTIPLES recetas.
Analizá toda la información proporcionada y extraé TODAS las recetas que encuentres.

SIEMPRE respondé ÚNICAMENTE con un JSON válido, sin texto adicional, sin markdown, sin backticks. El JSON debe ser un objeto con esta estructura:

{
  "recetas": [
    {
      "nombre_sugerido": "string",
      "categoria_sugerida": "string - una de: Entradas, Principales, Postres, Guarniciones, Bebidas, Pastelería, Panadería, Salsas, Bases",
      "porciones": number,
      "tiempo_minutos": number,
      "ingredientes": [
        { "nombre": "string", "cantidad": "string con coma decimal", "unidad": "kg|g|l|ml|u" }
      ],
      "procedimiento": ["paso 1", "paso 2"]
    }
  ]
}

Reglas:
- Extraé TODAS las recetas que puedas identificar, no solo la primera
- Las cantidades deben usar coma como separador decimal (formato argentino)
- Unidades válidas: kg, g, l, ml, u
- Si una receta no tiene procedimiento pero sí ingredientes, incluila igual con procedimiento vacío
- Si hay datos parciales, completá con valores razonables
- Ignorá filas vacías, encabezados repetidos, y datos que no sean recetas
- Si los datos están en múltiples hojas/secciones, revisá TODAS
- Devolvé al menos 1 receta. Si no encontrás ninguna, devolvé un array vacío`

async function callClaude(
  apiKey: string,
  system: string,
  content: Array<{ type: string; source?: any; text?: string }>,
  maxTokens: number = 2048,
  model: string = 'claude-sonnet-4-6'
): Promise<{ ok: true; text: string } | { ok: false; error: string; status: number }> {

  console.log(`[recetas/import] Calling Claude API (${model})...`)

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content }],
    }),
  })

  if (!response.ok) {
    // Devolvía el mensaje crudo de Anthropic ("Your credit balance is too
    // low…", en inglés y hablando de facturación) o el status pelado. El
    // cocinero leía eso como "la foto no sirve" y reintentaba con otra.
    const err = clasificarErrorIA(response.status, await response.text())
    console.error('[recetas/import] IA:', err.tipo, err.requestId ?? '')
    return { ok: false, error: err.mensaje, status: statusErrorIA(err) }
  }

  const data = await response.json()
  return { ok: true, text: data.content?.[0]?.text || '' }
}

function parseClaudeJson(rawText: string) {
  const cleaned = rawText
    .replace(/^```json?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim()
  return JSON.parse(cleaned)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY no configurada' }, { status: 500 })
  }

  try {
    const body = await req.json()
    const { action, mode, text, image_base64, media_type, currentRecipe, userMessage, google_url } = body as {
      action?: 'import' | 'adjust' | 'import_multi'
      mode?: 'image' | 'text' | 'google_url'
      text?: string
      image_base64?: string
      media_type?: string
      google_url?: string
      currentRecipe?: any
      userMessage?: string
    }

    // ── Helper: build content array from mode+data (reused by import & import_multi) ──
    async function buildContent(): Promise<{ content: Array<{ type: string; source?: any; text?: string }>; error?: string; errorStatus?: number }> {
      const content: Array<{ type: string; source?: any; text?: string }> = []

      if (mode === 'image' && image_base64) {
        content.push({ type: 'image', source: { type: 'base64', media_type: media_type || 'image/jpeg', data: image_base64 } })
        content.push({ type: 'text', text: 'Analizá esta imagen. Puede contener una o múltiples recetas. Extraé TODAS las recetas que veas.' })
      } else if (mode === 'text' && text && text.startsWith('__XLSX_BASE64__:')) {
        const b64 = text.replace('__XLSX_BASE64__:', '')
        const buf = Buffer.from(b64, 'base64')
        const wb = XLSX.read(buf, { type: 'buffer' })
        const sheetTexts: string[] = []
        for (const name of wb.SheetNames) {
          const ws = wb.Sheets[name]
          const csv = XLSX.utils.sheet_to_csv(ws, { blankrows: false })
          const lines = csv.split('\n').filter((l: string) => l.trim())
          if (lines.length > 0) sheetTexts.push(`\n══ HOJA: "${name}" (${lines.length} filas) ══\n${lines.join('\n')}`)
        }
        if (sheetTexts.length === 0) return { content: [], error: 'El archivo no contiene datos.', errorStatus: 400 }
        const xlsText = sheetTexts.join('\n\n')
        const maxChars = 14000
        content.push({ type: 'text', text: `Analizá este archivo Excel/planilla con recetas de cocina. Puede tener múltiples hojas.\n\nCONTENIDO:\n${xlsText.substring(0, maxChars)}${xlsText.length > maxChars ? '\n[...truncado...]' : ''}` })
      } else if (mode === 'text' && text) {
        content.push({ type: 'text', text: `Analizá este texto. Puede contener una o múltiples recetas:\n\n${text}` })
      } else if (mode === 'google_url' && google_url) {
        const url = google_url.trim()
        const sheetsMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)
        const docsMatch = url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/)
        if (sheetsMatch) {
          const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetsMatch[1]}/export?format=xlsx`
          const gRes = await fetch(exportUrl, { redirect: 'follow' })
          if (!gRes.ok) return { content: [], error: `No se pudo descargar (${gRes.status}). Verificá que esté compartido.`, errorStatus: 400 }
          const buf = Buffer.from(await gRes.arrayBuffer())
          if (buf.byteLength < 100) return { content: [], error: 'Archivo vacío o inválido.', errorStatus: 400 }
          const wb = XLSX.read(buf, { type: 'buffer' })
          const sheetTexts: string[] = []
          for (const name of wb.SheetNames) {
            const ws = wb.Sheets[name]
            const csv = XLSX.utils.sheet_to_csv(ws, { blankrows: false })
            const lines = csv.split('\n').filter((l: string) => l.trim())
            if (lines.length > 0) sheetTexts.push(`\n══ HOJA: "${name}" (${lines.length} filas) ══\n${lines.join('\n')}`)
          }
          if (sheetTexts.length === 0) return { content: [], error: 'Todas las hojas están vacías.', errorStatus: 400 }
          const xlsText = sheetTexts.join('\n\n')
          const maxChars = 14000
          content.push({ type: 'text', text: `Analizá este Google Sheets con recetas de cocina. Tiene múltiples hojas.\n\nCONTENIDO:\n${xlsText.substring(0, maxChars)}${xlsText.length > maxChars ? '\n[...truncado...]' : ''}` })
        } else if (docsMatch) {
          const exportUrl = `https://docs.google.com/document/d/${docsMatch[1]}/export?format=txt`
          const gRes = await fetch(exportUrl, { redirect: 'follow' })
          if (!gRes.ok) return { content: [], error: `No se pudo descargar (${gRes.status}). Verificá permisos.`, errorStatus: 400 }
          const googleText = await gRes.text()
          if (!googleText.trim()) return { content: [], error: 'Documento vacío.', errorStatus: 400 }
          content.push({ type: 'text', text: `Analizá este Google Doc con recetas:\n\n${googleText.substring(0, 14000)}` })
        } else {
          return { content: [], error: 'URL no reconocida.', errorStatus: 400 }
        }
      } else {
        return { content: [], error: 'Datos insuficientes.', errorStatus: 400 }
      }
      return { content }
    }

    // ── IMPORT_MULTI: múltiples recetas ──
    if (action === 'import_multi') {
      const { content, error: buildErr, errorStatus } = await buildContent()
      if (buildErr) return NextResponse.json({ error: buildErr }, { status: errorStatus || 400 })

      console.log('[recetas/import_multi] Calling Claude for multi-recipe extraction...')
      const result = await callClaude(apiKey, MULTI_SYSTEM_PROMPT, content, 4096, 'claude-sonnet-4-6')
      if (!result.ok) {
        // Sin crédito devolvía dos recetas inventadas. El usuario subía un
        // archivo con sus recetas y recibía "Lomo al Malbec" y "Pizza
        // Napolitana" — ver el bloque de import simple más abajo.
        return NextResponse.json({ error: result.error }, { status: result.status })
      }

      try {
        const parsed = parseClaudeJson(result.text)
        // Handle both { recetas: [...] } and direct array
        const recetas = Array.isArray(parsed) ? parsed : (parsed.recetas || [parsed])
        return NextResponse.json({ recetas })
      } catch {
        console.error('[recetas/import_multi] Parse error:', result.text?.substring(0, 500))
        return NextResponse.json({ error: 'La IA no devolvió JSON válido.' }, { status: 422 })
      }
    }

    // ── ADJUST: usuario pide correcciones ──
    if (action === 'adjust' && currentRecipe && userMessage) {
      const content = [{
        type: 'text' as const,
        text: `Receta actual:\n${JSON.stringify(currentRecipe, null, 2)}\n\nPedido del usuario: ${userMessage}`,
      }]

      const result = await callClaude(apiKey, ADJUST_SYSTEM, content, 2048, 'claude-haiku-4-5-20251001')
      if (!result.ok) {
        // Sin crédito devolvía la receta SIN el ajuste pedido, marcada como
        // "ajuste simulado". El usuario pedía un cambio, no pasaba nada, y no
        // había forma de distinguirlo de que la IA hubiera decidido no cambiar
        // nada. Mejor decir que falló.
        return NextResponse.json({ error: result.error }, { status: result.status })
      }

      try {
        return NextResponse.json(parseClaudeJson(result.text))
      } catch {
        console.error('[recetas/import] Failed to parse adjust response:', result.text)
        return NextResponse.json({ error: 'La IA no devolvió JSON válido.', raw: result.text }, { status: 422 })
      }
    }

    // ── IMPORT: análisis inicial ──
    const content: Array<{ type: string; source?: any; text?: string }> = []

    if (mode === 'image' && image_base64) {
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: media_type || 'image/jpeg', data: image_base64 },
      })
      content.push({
        type: 'text',
        text: 'Analizá esta imagen de receta y extraé toda la información estructurada.',
      })
    } else if (mode === 'text' && text && text.startsWith('__XLSX_BASE64__:')) {
      // ── Uploaded Excel/spreadsheet file as base64 ──
      console.log('[recetas/import] Parsing uploaded spreadsheet file')
      try {
        const b64 = text.replace('__XLSX_BASE64__:', '')
        const buf = Buffer.from(b64, 'base64')
        const wb = XLSX.read(buf, { type: 'buffer' })

        const sheetTexts: string[] = []
        for (const name of wb.SheetNames) {
          const ws = wb.Sheets[name]
          const csv = XLSX.utils.sheet_to_csv(ws, { blankrows: false })
          const lines = csv.split('\n').filter((l: string) => l.trim())
          if (lines.length > 0) {
            sheetTexts.push(`\n══ HOJA: "${name}" (${lines.length} filas) ══\n${lines.join('\n')}`)
          }
        }

        if (sheetTexts.length === 0) {
          return NextResponse.json({ error: 'El archivo no contiene datos.' }, { status: 400 })
        }

        const xlsText = sheetTexts.join('\n\n')
        const maxChars = 12000
        const textForClaude = xlsText.length > maxChars
          ? xlsText.substring(0, maxChars) + '\n\n[... contenido truncado ...]'
          : xlsText

        content.push({
          type: 'text',
          text: `Analizá este archivo Excel/planilla que contiene recetas de cocina. Tiene múltiples hojas con recetas, ingredientes, cantidades y procedimientos distribuidos de forma irregular.

Identificá las recetas y elegí la más completa. Extraé ingredientes, cantidades, procedimiento y toda la info posible.

CONTENIDO DEL ARCHIVO:
${textForClaude}`,
        })
      } catch (e) {
        console.error('[recetas/import] XLSX parse error:', e)
        return NextResponse.json({ error: 'No se pudo leer el archivo. Verificá que sea un Excel válido.' }, { status: 400 })
      }
    } else if (mode === 'text' && text) {
      content.push({
        type: 'text',
        text: `Analizá esta receta y extraé la información estructurada:\n\n${text}`,
      })
    } else if (mode === 'google_url' && google_url) {
      // ── Fetch content from Google Sheets/Docs ──
      console.log('[recetas/import] Fetching Google URL:', google_url)
      try {
        const url = google_url.trim()
        let googleText = ''
        let docType = ''

        // Google Sheets → export as XLSX and parse all sheets
        const sheetsMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)
        if (sheetsMatch) {
          const sheetId = sheetsMatch[1]
          const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx`
          docType = 'Google Sheets'

          const gRes = await fetch(exportUrl, { redirect: 'follow' })
          if (!gRes.ok) {
            console.error('[recetas/import] Google Sheets fetch error:', gRes.status)
            return NextResponse.json({
              error: `No se pudo descargar el documento (${gRes.status}). Verificá que esté compartido como "Cualquier persona con el enlace".`
            }, { status: 400 })
          }

          const buf = Buffer.from(await gRes.arrayBuffer())
          if (buf.byteLength < 100) {
            return NextResponse.json({ error: 'El archivo descargado está vacío o es inválido.' }, { status: 400 })
          }

          console.log('[recetas/import] XLSX downloaded, bytes:', buf.byteLength)
          const wb = XLSX.read(buf, { type: 'buffer' })

          // Extract all sheets into readable text
          const sheetTexts: string[] = []
          for (const name of wb.SheetNames) {
            const ws = wb.Sheets[name]
            const csv = XLSX.utils.sheet_to_csv(ws, { blankrows: false })
            const lines = csv.split('\n').filter((l: string) => l.trim())
            if (lines.length > 0) {
              sheetTexts.push(`\n══ HOJA: "${name}" (${lines.length} filas) ══\n${lines.join('\n')}`)
            }
          }

          if (sheetTexts.length === 0) {
            return NextResponse.json({ error: 'Todas las hojas del documento están vacías.' }, { status: 400 })
          }

          googleText = sheetTexts.join('\n\n')
          console.log('[recetas/import] Parsed', wb.SheetNames.length, 'sheets, total text length:', googleText.length)
        }

        // Google Docs → export as plain text
        const docsMatch = url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/)
        if (docsMatch && !sheetsMatch) {
          const docId = docsMatch[1]
          const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=txt`
          docType = 'Google Docs'

          const gRes = await fetch(exportUrl, { redirect: 'follow' })
          if (!gRes.ok) {
            console.error('[recetas/import] Google Docs fetch error:', gRes.status)
            return NextResponse.json({
              error: `No se pudo descargar el documento (${gRes.status}). Verificá que esté compartido como "Cualquier persona con el enlace".`
            }, { status: 400 })
          }

          googleText = await gRes.text()
        }

        if (!sheetsMatch && !docsMatch) {
          return NextResponse.json({ error: 'URL no reconocida. Usá un link de Google Sheets o Google Docs.' }, { status: 400 })
        }

        if (!googleText.trim()) {
          return NextResponse.json({ error: 'El documento está vacío.' }, { status: 400 })
        }

        // Truncate to fit Claude's context but keep as much as possible
        const maxChars = 12000
        const textForClaude = googleText.length > maxChars
          ? googleText.substring(0, maxChars) + '\n\n[... contenido truncado por longitud ...]'
          : googleText

        content.push({
          type: 'text',
          text: `Analizá este archivo de ${docType} que contiene recetas de cocina profesional. El archivo tiene múltiples hojas con recetas, ingredientes, cantidades y procedimientos distribuidos de forma irregular.

Tu tarea: Identificá TODAS las recetas que puedas encontrar y elegí la más completa o la primera con datos suficientes. Extraé ingredientes, cantidades, procedimiento y toda la información posible.

Si hay varias recetas, elegí la primera que tenga ingredientes Y procedimiento completos.

CONTENIDO DEL ARCHIVO:
${textForClaude}`,
        })
      } catch (e) {
        console.error('[recetas/import] Google fetch exception:', e)
        return NextResponse.json({ error: 'Error al descargar el documento de Google. Verificá el link y los permisos.' }, { status: 400 })
      }
    } else {
      return NextResponse.json({ error: 'Datos insuficientes. Enviá texto o imagen.' }, { status: 400 })
    }

    console.log('[recetas/import] Request:', { mode, hasImage: !!image_base64, textLen: text?.length || 0, mediaType: media_type })

    // Use Haiku for text-only imports (faster + cheaper), Sonnet for images
    const singleModel = image_base64 ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001'
    const result = await callClaude(apiKey, SYSTEM_PROMPT, content, 2048, singleModel)

    if (!result.ok) {
      // Acá estaba el bug que se reportó como "no se reconocen las fotos"
      // (ago 2026). Sin crédito, esto devolvía getDemoResult(): una receta
      // inventada — "Lomo al Malbec", o "Pizza Napolitana" si el nombre del
      // archivo decía pizza — después de un setTimeout de 1500ms puesto a
      // propósito para simular el procesamiento. El cocinero fotografiaba su
      // receta, esperaba, y recibía otra receta con un cartelito "DEMO".
      // Indistinguible de "la IA leyó mal la foto".
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    try {
      return NextResponse.json(parseClaudeJson(result.text))
    } catch {
      console.error('[recetas/import] Failed to parse response:', result.text)
      return NextResponse.json({ error: 'La IA no devolvió JSON válido. Intentá de nuevo.', raw: result.text }, { status: 422 })
    }
  } catch (e) {
    console.error('[recetas/import] Unexpected error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error inesperado' }, { status: 500 })
  }
}
