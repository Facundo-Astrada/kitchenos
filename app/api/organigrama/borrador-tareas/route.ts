import { NextRequest, NextResponse } from 'next/server'
import { requireRestauranteId } from '@/lib/api/tenant'
import { pedirAClaude } from '@/lib/ia/claude'
import { respuestaErrorIA, statusErrorIA } from '@/lib/ia/errores'

// Descripción de puesto — Fase 4, punto 2 (PLAN-DESCRIPCION-PUESTO-2026-09.md
// § 8): borrador de tareas para un puesto SIN plantilla. Es la única parte de
// toda la función donde la IA inventa en vez de redactar — el plan lo marca
// explícito: "K-OS se vende a varios sectores, no solo parrilla... ahí sí
// conviene un borrador generado". Sale genérico a propósito (nunca inventa un
// plato, un proveedor o un número de la casa) porque no tiene con qué
// redactar algo real: no hay dictado del dueño detrás.
const ESQUEMA_TAREAS = {
  type: 'object',
  properties: {
    tareas: { type: 'array', items: { type: 'string' } },
  },
  required: ['tareas'],
  additionalProperties: false,
}

export async function POST(req: NextRequest) {
  const tenant = await requireRestauranteId()
  if (!tenant.ok) return NextResponse.json({ error: tenant.error }, { status: tenant.status })
  const { restauranteId, user } = tenant

  const body = await req.json() as { puestoNombre?: string; areaNombre?: string; plaza?: string }
  const { puestoNombre, areaNombre, plaza } = body
  if (!puestoNombre?.trim()) {
    return NextResponse.json({ error: 'Falta el nombre del puesto' }, { status: 400 })
  }

  const contexto = [areaNombre && `área: ${areaNombre}`, plaza && `plaza: ${plaza}`].filter(Boolean).join(', ')
  const prompt = `Sos un editor de descripciones de puesto para restaurantes y locales gastronómicos argentinos. Alguien va a ocupar el puesto de "${puestoNombre}"${contexto ? ` (${contexto})` : ''}. No existe una plantilla previa para este puesto en el sistema.

Generá entre 5 y 8 tareas típicas y concretas de ese rol, una frase corta y accionable cada una, en español rioplatense. NO inventes datos específicos de un local en particular (nombres de platos, proveedores, cifras) — mantenelo genérico y editable, porque el dueño lo va a corregir después. Es un punto de partida, no la versión final.`

  const resultado = await pedirAClaude({
    tag: '/api/organigrama/borrador-tareas',
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 500,
    messages: [{ role: 'user', content: prompt }],
    formatoJson: ESQUEMA_TAREAS,
    restauranteId,
    usuarioId: user.id,
  })

  if (!resultado.ok) {
    return NextResponse.json(respuestaErrorIA(resultado.error), { status: statusErrorIA(resultado.error) })
  }

  try {
    const { tareas } = JSON.parse(resultado.texto) as { tareas: string[] }
    return NextResponse.json({ tareas: (tareas ?? []).filter(t => t.trim()) })
  } catch {
    return NextResponse.json({ error: 'No se pudo interpretar el borrador' }, { status: 502 })
  }
}
