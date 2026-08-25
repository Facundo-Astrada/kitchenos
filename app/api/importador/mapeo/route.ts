import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { clasificarErrorIA } from '@/lib/ia/errores'

const SCHEMA_KITCHENOS = `
## KitchenOS — Schema de módulos para restaurantes

### Stock (tabla: productos)
Campos: nombre*, categoria, unidad (kg/g/l/ml/unidad), stock_actual (número), stock_minimo (número), precio_unitario (número en pesos), proveedor_nombre (texto), activo (sí/no)
Señales: columnas como "cantidad", "existencia", "precio", "costo", "stock", "insumo", "ingrediente", "materia prima"
UNIDAD: columnas como "u/m", "um", "und", "unid", "medida", "unidad de medida", "tipo", "presentación" → mapear a "unidad". Los valores posibles son kg, g, l, ml, unidad.

### Proveedores (tabla: proveedores)
Campos: nombre*, telefono, rubro, dias_entrega, activo (sí/no)
Señales: columnas como "proveedor", "supplier", "teléfono", "rubro", "contacto", "empresa", "distribuidor". IMPORTANTE: "Empleado - X" es un proveedor de servicio (tipo de rubro)

### Facturas (tabla: facturas + factura_items)
Campos cabecera: proveedor_nombre*, fecha_factura, numero_factura, tipo_factura (A/B/C/X), subtotal, iva_total, total, condicion_pago
Campos items: producto_nombre*, cantidad, unidad, precio_unitario, alicuota_iva (%), subtotal_item
Señales: columnas como "factura", "IVA", "subtotal", "total", "fecha de compra", "remito"

### Recetas (tabla: recetas + ingredientes)
Campos receta: nombre*, categoria, porciones, precio_venta, procedimiento
Campos ingredientes: nombre_ingrediente*, cantidad, unidad, costo_unitario, merma_pct (%)
Señales: columnas como "receta", "ficha técnica", "ingrediente", "porción", "merma", "procedimiento", "elaboración"
`

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { headers, sampleRows, tipo, campos, fileName } = await req.json() as {
    headers: string[]
    sampleRows?: unknown[][]
    tipo?: string
    campos?: string[]
    fileName?: string
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ tipo_detectado: tipo ?? 'desconocido', confianza: 'baja', mapeo: {}, advertencias: [] })

  const muestraTexto = sampleRows?.slice(0, 5).map((row, i) =>
    `Fila ${i + 1}: ${(row as unknown[]).map(v => String(v ?? '').trim()).join(' | ')}`
  ).join('\n') ?? ''

  const tipoHint = tipo && tipo !== 'auto'
    ? `El usuario indica que este archivo es de tipo: ${tipo}. Confirmá si tiene sentido o corregí.`
    : 'Detectá automáticamente el tipo de datos.'

  const camposDisponibles = campos?.length
    ? `Campos disponibles para mapear: ${campos.join(', ')}`
    : `Usá los campos del schema correspondiente al tipo detectado.`

  const prompt = `Sos un experto en sistemas de gestión para restaurantes. Analizás archivos de datos y sabés exactamente dónde va cada dato en KitchenOS.

${SCHEMA_KITCHENOS}

---
Archivo: "${fileName ?? 'archivo'}"
Headers detectados: ${JSON.stringify(headers)}
${muestraTexto ? `\nMuestra de datos:\n${muestraTexto}` : ''}

${tipoHint}
${camposDisponibles}

Reglas:
- Mirá tanto los headers COMO los datos de muestra para entender el contenido real
- Headers como "(col. A)", "(col. B)" etc. son columnas sin encabezado — mapealas basándote SOLO en sus valores de datos
- Si una columna tiene nombres de personas/empresas con teléfonos → probablemente proveedores
- Si tiene precios, cantidades y unidades → probablemente stock
- Para la columna "unidad": buscá headers como "u/m", "um", "und", "unid", "medida", "unidad de medida", "presentación", "tipo" cuyos valores sean kg/g/l/ml/litros/kilos/gramos etc.
- Si los valores de una columna son mayoritariamente "kg", "g", "l", "ml", "litros", "kilos", "unidad", "unid" → es la columna "unidad"
- Usá "ignorar" para columnas sin equivalente en KitchenOS (ej: "Pedir", "Diferencia", "Observaciones", "Código interno")

PATRONES QUE SE MANEJAN AUTOMÁTICAMENTE — NO incluir en advertencias:
- "Nombre del producto (litros)" o "(kg)" o "(unidades)" al final del nombre → la app extrae la unidad automáticamente
- Columna de categoría dispersa con celdas vacías entre grupos → la app propaga el valor hacia abajo (forward-fill)
- Variantes de unidades (litros/Litros/lt/LT/kilogramos/kilos/unidades/und) → se normalizan automáticamente

SÍ advertir cuando:
- Hay columnas que parecen importantes (precio, stock, nombre) pero quedan sin mapear
- El archivo podría ser de un tipo diferente al detectado
- Hay datos claramente corruptos o mezclados en una columna

Respondé SOLO con JSON válido, sin texto extra:
{
  "tipo_detectado": "stock|proveedores|facturas|recetas|desconocido",
  "confianza": "alta|media|baja",
  "mapeo": { "header_original": "campo_kitchenos_o_ignorar" },
  "advertencias": ["string..."]
}`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        // Mapeo de columnas: tarea de texto simple y acotada → Haiku (más barato,
        // suficiente). Falla seguro a un fallback en cada catch.
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        temperature: 0,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) {
      // Degradar a "confianza baja" es razonable acá (el usuario mapea a mano),
      // pero el motivo va al log y a las advertencias para que no parezca que
      // el archivo era ilegible.
      const err = clasificarErrorIA(res.status, await res.text())
      console.error('[importador/mapeo] IA:', err.tipo, err.requestId ?? '')
      return NextResponse.json({
        tipo_detectado: tipo ?? 'desconocido', confianza: 'baja', mapeo: {},
        advertencias: [err.mensaje],
      })
    }

    const data = await res.json()
    const text: string = data.content?.[0]?.text ?? '{}'
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return NextResponse.json({ tipo_detectado: tipo ?? 'desconocido', confianza: 'baja', mapeo: {}, advertencias: [] })

    const parsed = JSON.parse(match[0]) as {
      tipo_detectado?: string
      confianza?: string
      mapeo?: Record<string, string | null>
      advertencias?: string[]
    }

    const mapeo: Record<string, string> = {}
    for (const [k, v] of Object.entries(parsed.mapeo ?? {})) {
      mapeo[k] = v == null ? 'ignorar' : String(v)
    }

    return NextResponse.json({
      tipo_detectado: parsed.tipo_detectado ?? (tipo ?? 'desconocido'),
      confianza: parsed.confianza ?? 'media',
      mapeo,
      advertencias: parsed.advertencias ?? [],
    })
  } catch {
    return NextResponse.json({ tipo_detectado: tipo ?? 'desconocido', confianza: 'baja', mapeo: {}, advertencias: [] })
  }
}
