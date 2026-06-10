import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'

// ── M1: snapshot de datos reales del restaurante ──────────────
// Consulta en vivo vía el server client (lleva la sesión del usuario →
// RLS filtra por su restaurante automáticamente, sin necesidad de pasar
// restauranteId). Acotado y a prueba de fallos: si una query rompe, se
// omite esa sección y el chat sigue funcionando.
async function buildSnapshot(supabase: SupabaseClient): Promise<string> {
  const hoy = new Date()
  const hoyStr = hoy.toISOString().split('T')[0]
  const en3dias = new Date(hoy.getTime() + 3 * 86_400_000).toISOString().split('T')[0]
  const fmt = (n: number) => Math.round(n).toLocaleString('es-AR')

  const [prodRes, vencRes, factRes] = await Promise.all([
    // Solo los 120 de menor stock — ahí viven críticos y bajos (acotado para Bros ~600).
    supabase.from('productos')
      .select('nombre, stock_actual, stock_critico, stock_minimo, unidad')
      .eq('activo', true)
      .order('stock_actual', { ascending: true })
      .limit(120),
    supabase.from('haccp_vencimientos')
      .select('nombre, fecha_vencimiento')
      .in('status', ['vigente', 'por_vencer'])
      .lte('fecha_vencimiento', en3dias)
      .order('fecha_vencimiento', { ascending: true })
      .limit(10),
    supabase.from('facturas')
      .select('proveedor_nombre, total')
      .eq('status', 'pendiente')
      .order('fecha_factura', { ascending: false })
      .limit(20),
  ])

  const lines: string[] = []

  // Stock crítico / bajo
  const productos = (prodRes.data ?? []) as Array<{ nombre: string; stock_actual: number; stock_critico: number | null; stock_minimo: number | null; unidad: string | null }>
  const criticos = productos.filter(p => p.stock_actual <= (p.stock_critico ?? 0))
  const bajos = productos.filter(p => p.stock_actual > (p.stock_critico ?? 0) && p.stock_actual <= (p.stock_minimo ?? 0))
  if (criticos.length) {
    lines.push(`Stock CRÍTICO (${criticos.length}): ` + criticos.slice(0, 8)
      .map(p => `${p.nombre} (${p.stock_actual} ${p.unidad ?? ''}, umbral ${p.stock_critico})`).join('; '))
  }
  if (bajos.length) {
    lines.push(`Stock bajo (${bajos.length}): ` + bajos.slice(0, 6).map(p => p.nombre).join(', '))
  }

  // Vencimientos próximos
  const venc = (vencRes.data ?? []) as Array<{ nombre: string; fecha_vencimiento: string }>
  if (venc.length) {
    lines.push(`Vencen en ≤3 días (${venc.length}): ` + venc.map(v => `${v.nombre} (${v.fecha_vencimiento})`).join('; '))
  }

  // Facturas pendientes de pago
  const facts = (factRes.data ?? []) as Array<{ proveedor_nombre: string | null; total: number | null }>
  if (facts.length) {
    const totalPend = facts.reduce((s, f) => s + (Number(f.total) || 0), 0)
    lines.push(`Facturas pendientes de pago (${facts.length}, total $${fmt(totalPend)}): ` + facts.slice(0, 6)
      .map(f => `${f.proveedor_nombre ?? 'Proveedor'} $${fmt(Number(f.total) || 0)}`).join('; '))
  }

  if (lines.length === 0) return ''
  return `\n\n## Datos reales del restaurante (consultados en vivo, ${hoyStr}) — son la verdad, usá estos números:\n`
    + lines.map(l => '- ' + l).join('\n')
}

// ── M5: tool use agéntico ─────────────────────────────────────
// El Coach puede EJECUTAR acciones. Las herramientas corren server-side
// con el server client → RLS asegura que solo tocan el restaurante del
// usuario. restauranteId se resuelve de la sesión (no se confía en el body).
const COACH_TOOLS = [
  {
    name: 'crear_tarea',
    description: 'Crea una tarea/producción pendiente para el día de hoy. Usar solo cuando el usuario pide explícitamente crear una tarea o anotar algo para hacer.',
    input_schema: {
      type: 'object' as const,
      properties: {
        titulo: { type: 'string', description: 'Qué hay que hacer. Ej: "Cortar mirepoix", "Preparar fondo oscuro".' },
        prioridad: { type: 'string', enum: ['critica', 'alta', 'media', 'baja'], description: 'Prioridad. Default media.' },
        plaza: { type: 'string', description: 'Plaza/estación opcional. Ej: parrilla, frios, pasteleria.' },
        descripcion: { type: 'string', description: 'Detalle opcional.' },
      },
      required: ['titulo'],
    },
  },
  {
    name: 'marcar_86',
    description: 'Marca un plato de la carta como NO disponible (86). Usar cuando el usuario dice que se acabó o no hay un plato.',
    input_schema: {
      type: 'object' as const,
      properties: {
        plato: { type: 'string', description: 'Nombre (o parte) del plato a marcar como no disponible.' },
      },
      required: ['plato'],
    },
  },
  {
    name: 'registrar_merma',
    description: 'Registra una merma (desperdicio) de un producto. Si el producto está en stock, descuenta la cantidad. Usar cuando el usuario reporta que se tiró/perdió/venció algo.',
    input_schema: {
      type: 'object' as const,
      properties: {
        producto: { type: 'string', description: 'Nombre del producto mermado.' },
        cantidad: { type: 'number', description: 'Cantidad mermada.' },
        unidad: { type: 'string', description: 'Unidad. Ej: kg, g, l, ml, u.' },
        motivo: { type: 'string', enum: ['vencimiento', 'error_coccion', 'mala_recepcion', 'sobro_servicio', 'deterioro', 'devolucion_cliente', 'mala_conservacion', 'otro'], description: 'Motivo de la merma.' },
        detalle: { type: 'string', description: 'Detalle opcional.' },
      },
      required: ['producto', 'cantidad', 'unidad', 'motivo'],
    },
  },
]

function turnoActual(): 'apertura' | 'servicio' | 'cierre' {
  const h = new Date().getHours()
  return h < 12 ? 'apertura' : h < 18 ? 'servicio' : 'cierre'
}

type ToolInput = Record<string, unknown>

async function executeTool(name: string, input: ToolInput, supabase: SupabaseClient, restauranteId: string | null): Promise<string> {
  if (!restauranteId) return 'Error: no pude identificar tu restaurante. No ejecuté la acción.'
  const hoy = new Date().toISOString().split('T')[0]

  try {
    if (name === 'crear_tarea') {
      const titulo = String(input.titulo ?? '').trim()
      if (!titulo) return 'Error: falta el título de la tarea.'
      const prioridad = ['critica', 'alta', 'media', 'baja'].includes(String(input.prioridad)) ? String(input.prioridad) : 'media'
      const { error } = await supabase.from('tareas').insert({
        titulo,
        descripcion: input.descripcion ? String(input.descripcion) : null,
        status: 'pendiente',
        estado: 'pendiente',
        prioridad,
        categoria: 'general',
        seccion: 'general',
        plaza: input.plaza ? String(input.plaza) : null,
        turno_fecha: hoy,
        checklist: '[]',
        restaurante_id: restauranteId,
      })
      if (error) return `Error al crear la tarea: ${error.message}`
      return `Tarea creada para hoy: "${titulo}" (prioridad ${prioridad}). Aparece en Producción.`
    }

    if (name === 'marcar_86') {
      const plato = String(input.plato ?? '').trim()
      if (!plato) return 'Error: falta el nombre del plato.'
      const { data, error } = await supabase.from('carta_items')
        .update({ disponible: false })
        .eq('restaurante_id', restauranteId)
        .ilike('nombre', `%${plato}%`)
        .select('nombre')
      if (error) return `Error al marcar 86: ${error.message}`
      if (!data || data.length === 0) return `No encontré ningún plato que coincida con "${plato}". No marqué nada.`
      return `Marcado como 86 (no disponible): ${data.map(d => d.nombre).join(', ')}.`
    }

    if (name === 'registrar_merma') {
      const producto = String(input.producto ?? '').trim()
      const cantidad = Number(input.cantidad)
      const unidad = String(input.unidad ?? '').trim()
      const motivo = String(input.motivo ?? 'otro')
      if (!producto || !cantidad || cantidad <= 0 || !unidad) return 'Error: faltan datos de la merma (producto, cantidad o unidad).'

      // Intentar resolver el producto en stock para costo y descuento.
      const { data: prod } = await supabase.from('productos')
        .select('id, precio_unitario, stock_actual')
        .eq('restaurante_id', restauranteId)
        .ilike('nombre', `%${producto}%`)
        .limit(1)
        .maybeSingle()

      const costo = prod?.precio_unitario ? Number(prod.precio_unitario) * cantidad : 0
      const { error } = await supabase.from('merma').insert({
        producto_nombre: producto,
        producto_id: prod?.id ?? null,
        cantidad,
        unidad,
        motivo,
        motivo_detalle: input.detalle ? String(input.detalle) : null,
        fecha: hoy,
        turno: turnoActual(),
        costo_estimado: costo,
        restaurante_id: restauranteId,
      })
      if (error) return `Error al registrar la merma: ${error.message}`

      let extra = ''
      if (prod?.id) {
        const nuevo = Math.max(0, (Number(prod.stock_actual) || 0) - cantidad)
        await supabase.from('productos').update({ stock_actual: nuevo }).eq('id', prod.id)
        extra = ` Stock actualizado a ${nuevo} ${unidad}.`
      }
      const costoTxt = costo > 0 ? ` Costo estimado $${Math.round(costo).toLocaleString('es-AR')}.` : ''
      return `Merma registrada: ${cantidad} ${unidad} de ${producto} (${motivo}).${costoTxt}${extra}`
    }

    return `Error: herramienta desconocida "${name}".`
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'desconocido'
    return `Error al ejecutar ${name}: ${msg}`
  }
}

interface ContentBlock { type: string; [k: string]: unknown }
interface AnthropicMsg { role: string; content: unknown }

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  // restaurante_id de la sesión (fuente confiable para writes; no del body).
  const { data: ur } = await supabase.from('user_restaurantes')
    .select('restaurante_id').eq('user_id', user.id).maybeSingle()
  const restauranteId = (ur?.restaurante_id as string | undefined) ?? null

  const { messages, context, systemPrompt: bodySystemPrompt } = await req.json()

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'API key no configurada' }, { status: 500 })
  }

  let systemPrompt = bodySystemPrompt ?? `Sos el Kitchen Coach de KitchenOS, un asistente de cocina profesional para ${context?.restaurante ?? 'el restaurante'}.
Tenés acceso al estado actual de la cocina:
- Usuario: ${context?.usuario ?? 'desconocido'} (${context?.rol ?? ''})
- Stock crítico: ${JSON.stringify(context?.stockCritico ?? [])}
- Vencimientos próximos: ${JSON.stringify(context?.vencimientos ?? [])}
- Food cost por receta: ${JSON.stringify(context?.foodCost ?? [])}

Respondé de forma concisa y práctica. Usá el contexto para dar recomendaciones específicas.`

  // M1 — inyectar datos reales server-side. No rompe el chat si falla.
  try {
    const snapshot = await buildSnapshot(supabase)
    if (snapshot) systemPrompt += snapshot
  } catch { /* sin snapshot — seguimos */ }

  // M5 — instrucciones de acciones ejecutables.
  systemPrompt += `\n\n## Acciones ejecutables
Tenés herramientas para EJECUTAR acciones reales: crear_tarea, marcar_86, registrar_merma.
- Usalas SOLO cuando el usuario pide explícitamente hacer la acción ("creá una tarea…", "se acabó el…", "se tiraron 2 kg de…").
- Después de ejecutar, confirmá en una frase breve en texto plano (sin JSON, sin markdown) lo que hiciste.
- Si faltan datos para ejecutar (ej. cantidad de la merma), preguntá antes de llamar la herramienta.`

  // Loop agéntico: hasta 4 vueltas (modelo → tool → resultado → modelo).
  const convo: AnthropicMsg[] = Array.isArray(messages) ? [...messages] : []
  let finalContent: unknown = [{ type: 'text', text: 'Sin respuesta' }]

  for (let i = 0; i < 4; i++) {
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
        tools: COACH_TOOLS,
        messages: convo,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      return NextResponse.json({ error }, { status: response.status })
    }

    const data = await response.json()
    finalContent = data.content
    const blocks = (data.content ?? []) as ContentBlock[]

    if (data.stop_reason === 'tool_use') {
      convo.push({ role: 'assistant', content: data.content })
      const toolResults = []
      for (const block of blocks) {
        if (block.type === 'tool_use') {
          const result = await executeTool(
            String(block.name),
            (block.input ?? {}) as ToolInput,
            supabase,
            restauranteId,
          )
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result })
        }
      }
      convo.push({ role: 'user', content: toolResults })
      continue
    }

    break // end_turn — respuesta final lista
  }

  return NextResponse.json({ content: finalContent })
}
