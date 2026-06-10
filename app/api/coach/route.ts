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

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { messages, context, systemPrompt: bodySystemPrompt } = await req.json()

  // ── TODO (M5) acciones ejecutables vía tool use ──
  //   stock: marcar producto para reponer · carta: marcar 86 · tareas: crear tarea
  //   merma: registrar merma (hoy es botón en el panel del FAB → candidato a tool)

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
