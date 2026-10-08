import { NextRequest, NextResponse } from 'next/server'
import { requireRestauranteId } from '@/lib/api/tenant'
import { pedirAClaude } from '@/lib/ia/claude'
import { statusErrorIA } from '@/lib/ia/errores'
import {
  armarCatalogo, armarPedido, interpretarRespuesta,
  ESQUEMA_VINCULO_IA, SISTEMA_VINCULO_IA,
} from '@/lib/recetas/vinculoIA'

// Vincula por IA los ingredientes que el nombre exacto no resolvió (ver
// lib/recetas/vinculoIA.ts). Lo llama la Nueva receta apenas la IA la carga.
// No escribe nada: devuelve candidatos y el cliente vincula (solo o
// preguntando). Haiku: es una tarea de emparejar nombres, no de leer.

export const maxDuration = 60

const MODELO = 'claude-haiku-4-5-20251001'
const MAX_INGREDIENTES = 60

export async function POST(req: NextRequest) {
  const tenant = await requireRestauranteId()
  if (!tenant.ok) return NextResponse.json({ error: tenant.error }, { status: tenant.status })
  const { supabase, restauranteId, user } = tenant

  const body = await req.json().catch(() => ({})) as { ingredientes?: { nombre?: unknown; unidad?: unknown }[] }
  const ingredientes = (body.ingredientes ?? [])
    .map(i => ({ nombre: String(i?.nombre ?? '').trim().slice(0, 120), unidad: String(i?.unidad ?? '').trim().slice(0, 12) }))
    .filter(i => i.nombre)
    .slice(0, MAX_INGREDIENTES)
  if (ingredientes.length === 0) return NextResponse.json({ resultados: [] })

  // Cliente con sesión (RLS por restaurante), no el admin: solo lee.
  const [{ data: productos }, { data: recetas }] = await Promise.all([
    supabase.from('productos').select('id, nombre, unidad').eq('restaurante_id', restauranteId).eq('activo', true).order('nombre'),
    supabase.from('recetas').select('id, nombre').eq('restaurante_id', restauranteId).eq('status', 'published').order('nombre'),
  ])
  if (!productos?.length && !recetas?.length) return NextResponse.json({ resultados: [] })

  const { texto: catalogo, refs } = armarCatalogo(productos ?? [], recetas ?? [])

  const resultado = await pedirAClaude({
    tag: 'recetas/vincular-ia',
    model: MODELO,
    maxTokens: 2000,
    // El catálogo es igual entre importaciones seguidas del mismo restaurante:
    // va cacheado para que la segunda receta de la tanda salga casi gratis.
    system: [
      { type: 'text', text: SISTEMA_VINCULO_IA },
      { type: 'text', text: catalogo, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: armarPedido(ingredientes) }],
    formatoJson: ESQUEMA_VINCULO_IA as unknown as Record<string, unknown>,
    restauranteId,
    usuarioId: user.id,
  })

  if (!resultado.ok) {
    return NextResponse.json({ error: resultado.error.mensaje }, { status: statusErrorIA(resultado.error) })
  }

  let crudo: unknown = null
  try { crudo = JSON.parse(resultado.texto) } catch { /* respuesta rota → sin resultados */ }
  return NextResponse.json({ resultados: interpretarRespuesta(crudo, refs, ingredientes.length) })
}
