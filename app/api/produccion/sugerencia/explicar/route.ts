import { NextRequest, NextResponse } from 'next/server'
import { requireRestauranteId } from '@/lib/api/tenant'
import type { SugerenciaItem } from '@/lib/produccion/sugerencia'
import { pedirAClaude } from '@/lib/ia/claude'
import { respuestaErrorIA, statusErrorIA } from '@/lib/ia/errores'

// E1b: capa IA que solo EXPLICA la sugerencia del motor de reglas (nunca cambia los números —
// misma fuente en OPS y en el Coach) en una línea por ítem, con contexto de eventos del calendario.
export async function POST(req: NextRequest) {
  const tenant = await requireRestauranteId()
  if (!tenant.ok) return NextResponse.json({ error: tenant.error }, { status: tenant.status })
  const { restauranteId, supabase } = tenant

  const { fechaObjetivo, diaSemanaLabel, sugerencias } = await req.json() as {
    fechaObjetivo: string; diaSemanaLabel: string; sugerencias: SugerenciaItem[]
  }
  if (!Array.isArray(sugerencias) || sugerencias.length === 0) {
    return NextResponse.json({ explicaciones: {} })
  }

  let eventosTxt = ''
  try {
    const { data: eventos } = await supabase
      .from('eventos')
      .select('titulo, tipo')
      .eq('restaurante_id', restauranteId)
      .lte('fecha_inicio', fechaObjetivo)
      .or(`fecha_fin.gte.${fechaObjetivo},fecha_fin.is.null`)
    if (eventos && eventos.length > 0) {
      eventosTxt = eventos.map((e: { titulo: string; tipo: string }) => `${e.titulo} (${e.tipo})`).join(', ')
    }
  } catch { /* sin eventos — seguimos igual */ }

  const items = sugerencias.map(s => ({
    id: s.recetaId, nombre: s.nombre, promedioVenta: s.promedioVenta,
    muestras: s.muestras, stockActual: s.stockActual, sugerido: s.sugerido,
  }))

  const prompt = `Sos el asistente de cocina de un restaurante argentino. Para cada ítem de esta lista de sugerencia de producción para ${diaSemanaLabel} ${fechaObjetivo}, escribí UNA línea corta (máx 18 palabras, español argentino, sin markdown) explicando el número — estilo "los viernes vendés en promedio 12 unidades y te quedan 3, por eso sugerimos producir 9".
${eventosTxt ? `Contexto del día: ${eventosTxt}. Si es relevante, mencionalo brevemente (ej. "hay un evento hoy, puede haber más demanda").` : ''}
NO cambies ni inventes números — usá exactamente los que te paso. Cada explicación es sobre UN solo ítem: no menciones el nombre de ningún otro ítem de la lista ni mezcles datos entre ítems distintos.

Ítems (JSON): ${JSON.stringify(items)}

Respondé SOLO con un objeto JSON válido {"<id>": "<explicación>", ...}, sin texto antes ni después.`

  const resultado = await pedirAClaude({
    tag: '/api/produccion/sugerencia/explicar',
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  })

  if (!resultado.ok) {
    return NextResponse.json(respuestaErrorIA(resultado.error), { status: statusErrorIA(resultado.error) })
  }

  try {
    const match = resultado.texto.match(/\{[\s\S]*\}/)
    const explicaciones = match ? JSON.parse(match[0]) : {}
    return NextResponse.json({ explicaciones })
  } catch {
    return NextResponse.json({ error: 'No se pudo interpretar la respuesta de IA' }, { status: 500 })
  }
}
