import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { messages, context, systemPrompt: bodySystemPrompt } = await req.json()

  // ── TODO (M1) datos reales server-side por pantalla ──
  // Hoy el Coach solo conoce lo que el cliente mandó en kc_screen_context.
  // Para volverlo asesor, consultar Supabase acá según context.screen, p.ej:
  //   stock      → productos en crítico/bajo + sin precio (subvalúan food cost)
  //   carta      → platos con food_cost_pct > 35 + márgenes negativos
  //   facturas   → variación de precios por proveedor (inflación de compras)
  // ── TODO (M5) acciones ejecutables vía tool use ──
  //   stock: marcar producto para reponer · carta: marcar 86 · tareas: crear tarea
  //   merma: registrar merma (hoy es botón en el panel del FAB → candidato a tool)

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'API key no configurada' }, { status: 500 })
  }

  const systemPrompt = bodySystemPrompt ?? `Sos el Kitchen Coach de KitchenOS, un asistente de cocina profesional para ${context?.restaurante ?? 'el restaurante'}.
Tenés acceso al estado actual de la cocina:
- Usuario: ${context?.usuario ?? 'desconocido'} (${context?.rol ?? ''})
- Stock crítico: ${JSON.stringify(context?.stockCritico ?? [])}
- Vencimientos próximos: ${JSON.stringify(context?.vencimientos ?? [])}
- Food cost por receta: ${JSON.stringify(context?.foodCost ?? [])}

Respondé de forma concisa y práctica. Usá el contexto para dar recomendaciones específicas.`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    return NextResponse.json({ error }, { status: response.status })
  }

  const data = await response.json()
  return NextResponse.json({ content: data.content })
}
