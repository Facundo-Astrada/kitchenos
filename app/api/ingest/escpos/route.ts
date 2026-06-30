import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

// ──────────────────────────────────────────────────────────────
// Stub — Fase 1: solo contrato + validación de entrada.
// El parseo real del texto crudo de comanda POS legacy va en Fase 2.
// ──────────────────────────────────────────────────────────────

const EscPosSchema = z.object({
  raw: z.string().min(1),
  restaurante_id: z.string().uuid(),
  fuente: z.string().optional(),
})

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  const parsed = EscPosSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  // Stub: registrar recepción y devolver pending
  return NextResponse.json({
    status: 'received',
    message: 'Parseo ESC/POS no implementado aún (Fase 2)',
    bytes: parsed.data.raw.length,
  })
}
