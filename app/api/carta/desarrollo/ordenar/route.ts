import { NextRequest, NextResponse } from 'next/server'
import { requireRestauranteId } from '@/lib/api/tenant'
import { pedirAClaude } from '@/lib/ia/claude'
import { respuestaErrorIA, statusErrorIA } from '@/lib/ia/errores'
import { MAX_CARACTERES_PEGADO, normalizarFichaIA, vincularFicha } from '@/lib/carta/desarrollo'
import { ESQUEMA_FICHA, MODELO_ORDENAR, SYSTEM_ORDENAR } from '@/lib/carta/desarrolloIA'

export const maxDuration = 60

/**
 * Paso 2 del flujo "En desarrollo": ordena las notas de UN plato en una ficha
 * (Sonnet), la vincula contra las recetas que el restaurante ya tiene
 * (determinístico, no en el prompt) y la guarda en `platos_desarrollo`. El
 * cliente lanza varias en paralelo, una por plato: cada ficha se guarda apenas
 * vuelve, así que si se corta la conexión no se pierden las que ya estaban.
 */
export async function POST(req: NextRequest) {
  const tenant = await requireRestauranteId()
  if (!tenant.ok) return NextResponse.json({ error: tenant.error }, { status: tenant.status })
  const { restauranteId, user, supabase } = tenant

  const body = await req.json().catch(() => ({})) as {
    texto?: unknown; nombre_tentativo?: unknown; tanda_id?: unknown
  }
  const texto = typeof body.texto === 'string' ? body.texto.trim() : ''
  const nombreTentativo = typeof body.nombre_tentativo === 'string' ? body.nombre_tentativo : ''
  const tandaId = typeof body.tanda_id === 'string' && body.tanda_id ? body.tanda_id : null
  if (!texto) return NextResponse.json({ error: 'Falta el texto del plato.' }, { status: 400 })
  if (texto.length > MAX_CARACTERES_PEGADO) {
    return NextResponse.json({ error: 'El texto de un solo plato es demasiado largo.' }, { status: 413 })
  }

  const resultado = await pedirAClaude({
    tag: '/api/carta/desarrollo/ordenar',
    model: MODELO_ORDENAR,
    maxTokens: 4000,
    // Igual para todos los platos de la tanda → se cachea (los 10 comparten el prefijo).
    system: [{ type: 'text', text: SYSTEM_ORDENAR, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: texto }],
    formatoJson: ESQUEMA_FICHA,
    restauranteId,
    usuarioId: user.id,
  })

  if (!resultado.ok) {
    return NextResponse.json(respuestaErrorIA(resultado.error), { status: statusErrorIA(resultado.error) })
  }

  let crudo: unknown = null
  try {
    crudo = JSON.parse(resultado.texto)
  } catch {
    return NextResponse.json({ error: 'No se pudo interpretar la ficha. Probá de nuevo.' }, { status: 502 })
  }

  const ordenado = normalizarFichaIA(crudo, nombreTentativo)

  // Recetas del restaurante: solo id y nombre, para el vínculo determinístico.
  const { data: recetas } = await supabase
    .from('recetas')
    .select('id, nombre')
    .eq('restaurante_id', restauranteId)
    .limit(3000)
  const { ficha, resumen } = vincularFicha(ordenado.ficha, (recetas ?? []) as { id: string; nombre: string }[])

  const { data: guardado, error } = await supabase
    .from('platos_desarrollo')
    .insert({
      restaurante_id: restauranteId,
      nombre: ordenado.nombre,
      descripcion: ordenado.descripcion,
      categoria: ordenado.categoria,
      estado: 'idea',
      ficha,
      texto_origen: texto,
      tanda_id: tandaId,
      creado_por: user.id,
    })
    .select('*')
    .single()

  if (error) {
    console.error('[carta/desarrollo/ordenar] insert:', error.message)
    return NextResponse.json({ error: 'No se pudo guardar la ficha.' }, { status: 500 })
  }

  return NextResponse.json({ plato: guardado, bases_reutilizadas: resumen.basesReutilizadas })
}
