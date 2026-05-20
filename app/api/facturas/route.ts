import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const SYSTEM_PROMPT = `Sos un sistema experto en OCR de facturas de proveedores gastronómicos argentinos.
Extraé TODOS los datos de la factura. Respondé SOLO con JSON válido (sin markdown, sin backticks).

Estructura requerida:
{
  "proveedor_nombre": "string",
  "proveedor_cuit": "string o null",
  "fecha_factura": "YYYY-MM-DD",
  "tipo_factura": "A" | "B" | "C" | "X" | "remito" | "ticket",
  "numero_factura": "string o null",
  "condicion_pago": "contado" | "30dias" | "60dias" | "cuenta_corriente",
  "items": [
    {
      "producto_nombre": "string (nombre limpio y normalizado)",
      "cantidad": number,
      "unidad": "kg" | "g" | "l" | "ml" | "u" | "caja" | "docena" | "pack",
      "precio_unitario": number,
      "alicuota_iva": 21 | 10.5 | 27 | 0,
      "subtotal": number
    }
  ],
  "subtotal": number,
  "iva_total": number,
  "total": number,
  "notas": "string o null (observaciones relevantes)"
}

Reglas:
- Todos los montos en pesos argentinos (ARS), sin símbolo $
- Normalizar nombres de productos: "LOMO VETADO X KG" → "Lomo vetado"
- Si no se detecta un campo, usar null
- Si es un ticket sin tipo explícito, usar "ticket"
- Si la condición de pago no es clara, usar "contado"
- Calcular subtotales si no están explícitos (cantidad × precio_unitario)
- Separar IVA si está discriminado, sino iva_total = 0`

const DEMO_RESULT = {
  proveedor_nombre: 'Distribuidora Norte SRL',
  proveedor_cuit: '30-71234567-8',
  fecha_factura: new Date().toISOString().slice(0, 10),
  tipo_factura: 'A',
  numero_factura: '0001-00042851',
  condicion_pago: 'cuenta_corriente',
  items: [
    { producto_nombre: 'Lomo vetado', cantidad: 10, unidad: 'kg', precio_unitario: 8500, alicuota_iva: 21, subtotal: 85000 },
    { producto_nombre: 'Entraña', cantidad: 5, unidad: 'kg', precio_unitario: 6200, alicuota_iva: 21, subtotal: 31000 },
    { producto_nombre: 'Sal entrefina', cantidad: 2, unidad: 'kg', precio_unitario: 1800, alicuota_iva: 21, subtotal: 3600 },
    { producto_nombre: 'Aceite de oliva', cantidad: 5, unidad: 'l', precio_unitario: 4500, alicuota_iva: 21, subtotal: 22500 },
  ],
  subtotal: 142100,
  iva_total: 29841,
  total: 171941,
  notas: null,
  _demo: true,
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const formData = await req.formData()
  const mode = formData.get('mode') as string // 'image' | 'pdf' | 'text' | 'camera'
  const apiKey = process.env.ANTHROPIC_API_KEY

  if (!apiKey) {
    // Return demo data when no API key
    return NextResponse.json(DEMO_RESULT)
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
      { type: 'text', text: 'Extraé todos los datos de esta factura de proveedor gastronómico.' },
    ]
  } else if (mode === 'pdf') {
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No se recibió PDF' }, { status: 400 })

    const buffer = await file.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')

    userContent = [
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
      { type: 'text', text: 'Extraé todos los datos de esta factura de proveedor gastronómico.' },
    ]
  } else if (mode === 'text') {
    const texto = formData.get('text') as string
    if (!texto?.trim()) return NextResponse.json({ error: 'No se recibió texto' }, { status: 400 })

    userContent = [
      { type: 'text', text: `Extraé los datos de esta factura:\n\n${texto}` },
    ]
  } else {
    return NextResponse.json({ error: 'Modo no soportado' }, { status: 400 })
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userContent }],
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      // If credit issue, return demo
      if (response.status === 429 || response.status === 403) {
        return NextResponse.json(DEMO_RESULT)
      }
      return NextResponse.json({ error }, { status: response.status })
    }

    const data = await response.json()
    const text = data.content[0].text

    try {
      const parsed = JSON.parse(text)
      return NextResponse.json(parsed)
    } catch {
      // Try extracting JSON from response
      const match = text.match(/\{[\s\S]*\}/)
      if (match) {
        return NextResponse.json(JSON.parse(match[0]))
      }
      return NextResponse.json({ error: 'No se pudo parsear respuesta', raw: text }, { status: 500 })
    }
  } catch (e) {
    return NextResponse.json(DEMO_RESULT)
  }
}
