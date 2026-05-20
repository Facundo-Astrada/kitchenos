import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const SYSTEM_PROMPT = `Sos un asistente de gestión gastronómica argentino. El usuario te envía texto libre con datos de ventas de un restaurante (puede ser un resumen del POS, una lista pegada, un texto de WhatsApp, etc.).

Extraé los datos de ventas y respondé ÚNICAMENTE con un JSON válido, sin texto adicional, sin markdown, sin backticks.

El JSON debe tener esta estructura exacta:

{
  "fecha": "YYYY-MM-DD",
  "total": number,
  "cantidad_cubiertos": number | null,
  "notas": "string | null",
  "items": [
    {
      "nombre_plato": "string",
      "cantidad": number,
      "precio_unitario": number
    }
  ]
}

Reglas:
- "fecha": si el texto menciona una fecha, usala. Si no, usá la fecha de hoy en formato YYYY-MM-DD.
- "total": el total de ventas del día. Si no está explícito, sumá cantidad × precio_unitario de todos los items.
- "cantidad_cubiertos": número de cubiertos/mesas/personas si se menciona, sino null.
- "notas": cualquier observación relevante del texto, sino null.
- "items": lista de platos vendidos con nombre, cantidad vendida y precio unitario. Si el texto no tiene detalle por plato, devolvé un array vacío [].
- Los precios son en pesos argentinos (ARS), sin símbolo, como número.
- Si no podés determinar un campo, usá null o un valor razonable.
- Normalizá los nombres de los platos: capitalización correcta, sin abreviaturas raras.`

function getDemoResult(texto: string): Record<string, unknown> {
  const hint = texto.toLowerCase()
  const hoy = new Date().toISOString().split('T')[0]

  if (hint.includes('empanada') || hint.includes('milanesa')) {
    return {
      fecha: hoy,
      total: 87500,
      cantidad_cubiertos: 42,
      notas: 'Servicio de mediodía',
      items: [
        { nombre_plato: 'Empanadas (docena)', cantidad: 8, precio_unitario: 4200 },
        { nombre_plato: 'Milanesa napolitana', cantidad: 15, precio_unitario: 3200 },
        { nombre_plato: 'Ensalada mixta', cantidad: 12, precio_unitario: 1800 },
        { nombre_plato: 'Agua mineral 500ml', cantidad: 30, precio_unitario: 850 },
      ],
    }
  }

  return {
    fecha: hoy,
    total: 124000,
    cantidad_cubiertos: 58,
    notas: 'Servicio completo',
    items: [
      { nombre_plato: 'Lomo al malbec', cantidad: 18, precio_unitario: 4800 },
      { nombre_plato: 'Bife de chorizo', cantidad: 22, precio_unitario: 5200 },
      { nombre_plato: 'Pasta del día', cantidad: 14, precio_unitario: 3100 },
      { nombre_plato: 'Postre del día', cantidad: 20, precio_unitario: 2200 },
    ],
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const texto: string = body.texto ?? ''

    if (!texto.trim()) {
      return NextResponse.json({ error: 'Se requiere el campo "texto"' }, { status: 400 })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      console.warn('[ventas/import] ANTHROPIC_API_KEY no configurada — devolviendo demo data')
      return NextResponse.json(getDemoResult(texto))
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: [{ type: 'text', text: texto }] }],
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('[ventas/import] Claude API error:', response.status, errText)

      // Fallback to demo on API errors
      if (response.status === 529 || response.status === 503 || response.status === 402) {
        return NextResponse.json(getDemoResult(texto))
      }
      return NextResponse.json({ error: `Error de IA (${response.status})` }, { status: 500 })
    }

    const claudeData = await response.json()
    const content = claudeData.content?.[0]?.text ?? ''

    let parsed: Record<string, unknown>
    try {
      // Strip markdown code fences if present
      const clean = content.replace(/```json?\n?/gi, '').replace(/```/g, '').trim()
      parsed = JSON.parse(clean)
    } catch {
      console.error('[ventas/import] JSON parse error. Raw:', content)
      return NextResponse.json({ error: 'No se pudo interpretar la respuesta de IA', raw: content }, { status: 422 })
    }

    return NextResponse.json(parsed)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error interno'
    console.error('[ventas/import] Error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
