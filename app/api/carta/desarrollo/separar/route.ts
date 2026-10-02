import { NextRequest, NextResponse } from 'next/server'
import { requireRestauranteId } from '@/lib/api/tenant'
import { pedirAClaude } from '@/lib/ia/claude'
import { respuestaErrorIA, statusErrorIA } from '@/lib/ia/errores'
import {
  MAX_CARACTERES_PEGADO, MAX_PLATOS_POR_PEGADO, numerarLineas, recortarPorRangos,
  type RangoPlato,
} from '@/lib/carta/desarrollo'
import { ESQUEMA_SEPARAR, MODELO_SEPARAR, SYSTEM_SEPARAR } from '@/lib/carta/desarrolloIA'

export const maxDuration = 60

/**
 * Paso 1 del flujo "En desarrollo": el chef pega todas sus notas juntas y esta
 * ruta dice dónde empieza y termina cada plato. Haiku devuelve SOLO rangos de
 * líneas; los recortes los hace el servidor, así la IA nunca reescribe lo que
 * el chef escribió. No guarda nada: el cliente dibuja una tarjeta por plato y
 * llama a /ordenar por cada una.
 */
export async function POST(req: NextRequest) {
  const tenant = await requireRestauranteId()
  if (!tenant.ok) return NextResponse.json({ error: tenant.error }, { status: tenant.status })
  const { restauranteId, user } = tenant

  const body = await req.json().catch(() => ({})) as { texto?: unknown }
  const texto = typeof body.texto === 'string' ? body.texto.trim() : ''
  if (!texto) return NextResponse.json({ error: 'Pegá tus notas para poder ordenarlas.' }, { status: 400 })
  if (texto.length > MAX_CARACTERES_PEGADO) {
    return NextResponse.json({
      error: `Es mucho texto de una vez (máximo ${MAX_CARACTERES_PEGADO.toLocaleString('es-AR')} caracteres). Pegalo en dos tandas.`,
    }, { status: 413 })
  }

  const resultado = await pedirAClaude({
    tag: '/api/carta/desarrollo/separar',
    model: MODELO_SEPARAR,
    maxTokens: 1500,
    system: SYSTEM_SEPARAR,
    messages: [{ role: 'user', content: numerarLineas(texto) }],
    formatoJson: ESQUEMA_SEPARAR,
    restauranteId,
    usuarioId: user.id,
  })

  if (!resultado.ok) {
    return NextResponse.json(respuestaErrorIA(resultado.error), { status: statusErrorIA(resultado.error) })
  }

  let rangos: RangoPlato[] = []
  try {
    rangos = (JSON.parse(resultado.texto) as { platos?: RangoPlato[] }).platos ?? []
  } catch {
    // Sin rangos, recortarPorRangos devuelve todo el texto como un solo plato:
    // peor que separar bien, pero el chef no pierde nada.
  }

  const platos = recortarPorRangos(texto, rangos)
  if (platos.length > MAX_PLATOS_POR_PEGADO) {
    return NextResponse.json({
      error: `Encontré ${platos.length} platos; el máximo por vez es ${MAX_PLATOS_POR_PEGADO}. Pegalo en dos tandas.`,
    }, { status: 413 })
  }

  return NextResponse.json({ tanda_id: crypto.randomUUID(), platos })
}
