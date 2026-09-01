import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { errorSinApiKey, respuestaErrorIA, statusErrorIA } from '@/lib/ia/errores'
import { pedirAClaude } from '@/lib/ia/claude'

const SYSTEM_PROMPT = `Sos un asistente de cocina profesional. Extraé TODOS los productos y precios de esta lista de precios de un proveedor.

Devolvé SOLAMENTE un JSON válido con esta estructura:
{
  "items": [
    {
      "producto_nombre": "nombre del producto normalizado",
      "precio_unitario": 1234.56,
      "unidad": "kg" | "g" | "l" | "ml" | "u" | "caja" | "docena" | "pack" | "bolsa" | "lata" | "botella",
      "cantidad_envase": 1,
      "observaciones": "cualquier detalle relevante o null"
    }
  ],
  "moneda": "ARS",
  "fecha_detectada": "YYYY-MM-DD o null",
  "notas": "observaciones generales o null"
}

Reglas:
- Normalizá los nombres: sin mayúsculas innecesarias, sin abreviaturas raras
- Si el precio incluye IVA, extraé el precio tal cual
- Si hay varios tamaños/presentaciones del mismo producto, ponelos como items separados
- "unidad" es la unidad de venta (kg, u, caja, etc.)
- "cantidad_envase" es cuántas unidades vienen en el envase (ej: "Caja x12" → cantidad_envase: 12, unidad: "caja")
- Extraé TODOS los productos, no te saltes ninguno
- Si no podés leer un precio, poné 0 y agregá observación "precio ilegible"
- Los precios son en pesos argentinos (ARS) a menos que se indique lo contrario`

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  // Solo para imputar el consumo de IA en ia_uso — no bloquea el import si falta.
  const { data: ur } = await supabase.from('user_restaurantes').select('restaurante_id').eq('user_id', user.id).maybeSingle()
  const restauranteId = (ur?.restaurante_id as string | undefined) ?? null

  const formData = await req.formData()
  const mode = formData.get('mode') as string // 'image' | 'pdf' | 'text' | 'excel'
  const apiKey = process.env.ANTHROPIC_API_KEY

  if (!apiKey) {
    // Ver /api/facturas: sin key, un aviso — no una lista de precios inventada.
    const err = errorSinApiKey()
    return NextResponse.json(respuestaErrorIA(err), { status: statusErrorIA(err) })
  }

  let userContent: Array<Record<string, unknown>> = []

  if (mode === 'image' || mode === 'camera') {
    const imagen = formData.get('file') as File | null
    if (!imagen) return NextResponse.json({ error: 'No se recibió imagen' }, { status: 400 })

    const buffer = await imagen.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')
    const mediaType = imagen.type as string

    userContent = [
      { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
      { type: 'text', text: 'Extraé todos los productos y precios de esta lista de precios de proveedor.' },
    ]
  } else if (mode === 'pdf') {
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No se recibió PDF' }, { status: 400 })

    const buffer = await file.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')

    userContent = [
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
      { type: 'text', text: 'Extraé todos los productos y precios de esta lista de precios de proveedor.' },
    ]
  } else if (mode === 'text') {
    const texto = formData.get('text') as string
    if (!texto?.trim()) return NextResponse.json({ error: 'No se recibió texto' }, { status: 400 })

    userContent = [
      { type: 'text', text: `Extraé todos los productos y precios de esta lista de precios:\n\n${texto}` },
    ]
  } else if (mode === 'excel') {
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 })

    // Read Excel/CSV as text
    const text = await file.text()
    userContent = [
      { type: 'text', text: `Extraé todos los productos y precios de esta lista de precios (formato CSV/Excel):\n\n${text}` },
    ]
  } else if (mode === 'url') {
    const url = formData.get('url') as string
    if (!url?.trim()) return NextResponse.json({ error: 'No se recibió URL' }, { status: 400 })

    // Try to fetch Google Sheets as CSV
    let csvUrl = url.trim()
    if (csvUrl.includes('docs.google.com/spreadsheets')) {
      // Convert to CSV export URL
      csvUrl = csvUrl.replace(/\/edit.*$/, '/export?format=csv')
      if (!csvUrl.includes('/export?format=csv')) {
        csvUrl = csvUrl.replace(/\/?$/, '/export?format=csv')
      }
    }

    try {
      const csvRes = await fetch(csvUrl)
      if (!csvRes.ok) {
        return NextResponse.json({ error: 'No se pudo acceder al documento. Verificá que esté compartido como público.' }, { status: 400 })
      }
      const csvText = await csvRes.text()
      userContent = [
        { type: 'text', text: `Extraé todos los productos y precios de esta lista de precios (Google Sheets CSV):\n\n${csvText}` },
      ]
    } catch {
      return NextResponse.json({ error: 'No se pudo acceder al documento. Verificá que esté compartido como público.' }, { status: 400 })
    }
  } else {
    return NextResponse.json({ error: 'Modo no soportado' }, { status: 400 })
  }

  // Ver /api/facturas: devolver DEMO_RESULT ante un fallo de la API le metía
  // al usuario una lista de precios inventada como si fuera la suya.
  const resultado = await pedirAClaude({
    tag: '/api/listas-precios',
    model: 'claude-sonnet-4-6',
    maxTokens: 8192,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userContent }],
    restauranteId,
  })

  if (!resultado.ok) {
    return NextResponse.json(respuestaErrorIA(resultado.error), { status: statusErrorIA(resultado.error) })
  }

  const text = resultado.texto

  try {
    const parsed = JSON.parse(text)
    return NextResponse.json(parsed)
  } catch {
    const match = text.match(/\{[\s\S]*\}/)
    if (match) {
      return NextResponse.json(JSON.parse(match[0]))
    }
    return NextResponse.json({ error: 'No se pudo parsear respuesta', raw: text }, { status: 500 })
  }
}
