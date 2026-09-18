import { NextRequest, NextResponse } from 'next/server'
import { requireRestauranteId } from '@/lib/api/tenant'
import { pedirAClaude } from '@/lib/ia/claude'
import { respuestaErrorIA, statusErrorIA } from '@/lib/ia/errores'

// Descripción de puesto — Fase 1 (PLAN-DESCRIPCION-PUESTO-2026-09.md § 8).
// Única tarea de esta ruta: convertir lo que el dueño DICTÓ (crudo, en su
// forma de hablar) en la frase que va al documento. "Redactar, no inventar":
// el prompt tiene prohibido agregar un dato que el relato no dijo, y la regla
// de § 10.1 B (describe tareas, nunca responsabilidad legal) va en el propio
// prompt para no depender de que cada pantalla la repita.
type Campo = 'mision' | 'dia'

function prompt(campo: Campo, puestoNombre: string, crudo: string, momento?: string): string {
  const reglas = [
    'No agregues ningún dato, cifra, plazo o responsabilidad que el relato no haya dicho.',
    'Describí una tarea que la persona ejecuta, nunca una responsabilidad legal que asume — "registra la temperatura", no "es responsable de la cadena de frío".',
    'Español rioplatense, tono directo, sin viñetas ni comillas. Devolvé únicamente el texto final.',
  ].join(' ')

  if (campo === 'mision') {
    return `Sos un editor de descripciones de puesto para restaurantes argentinos. El dueño de un restaurante contó, con sus palabras, por qué existe el puesto de "${puestoNombre}" — qué pasaría si mañana no estuviera. Redactá su relato en 1 o 2 frases claras.\n${reglas}\n\nRelato del dueño: "${crudo}"`
  }
  return `Sos un editor de descripciones de puesto para restaurantes argentinos. El dueño de un restaurante contó qué hace quien ocupa el puesto de "${puestoNombre}" en este momento del turno: "${momento}". Redactá su relato en UNA sola frase concreta.\n${reglas}\n\nRelato del dueño: "${crudo}"`
}

export async function POST(req: NextRequest) {
  const tenant = await requireRestauranteId()
  if (!tenant.ok) return NextResponse.json({ error: tenant.error }, { status: tenant.status })
  const { restauranteId, user } = tenant

  const body = await req.json() as { campo?: string; crudo?: string; puestoNombre?: string; momento?: string }
  const { campo, crudo, puestoNombre, momento } = body

  if (campo !== 'mision' && campo !== 'dia') {
    return NextResponse.json({ error: 'campo inválido' }, { status: 400 })
  }
  if (!crudo || crudo.trim().length < 3) {
    return NextResponse.json({ error: 'Contame un poco más — todavía no hay nada para redactar' }, { status: 400 })
  }
  if (!puestoNombre) {
    return NextResponse.json({ error: 'Falta el nombre del puesto' }, { status: 400 })
  }

  const resultado = await pedirAClaude({
    tag: '/api/organigrama/redactar-descripcion',
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 300,
    messages: [{ role: 'user', content: prompt(campo, puestoNombre, crudo.trim().slice(0, 2000), momento) }],
    restauranteId,
    usuarioId: user.id,
  })

  if (!resultado.ok) {
    return NextResponse.json(respuestaErrorIA(resultado.error), { status: statusErrorIA(resultado.error) })
  }

  const texto = resultado.texto.trim().replace(/^"|"$/g, '')
  if (!texto) {
    return NextResponse.json({ error: 'La IA no devolvió texto' }, { status: 502 })
  }
  return NextResponse.json({ texto })
}
