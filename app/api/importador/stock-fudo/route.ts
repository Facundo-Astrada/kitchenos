import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import * as XLSX from 'xlsx'

export const maxDuration = 60

const FUDO_STOCK_SHEETS = ['Ingredientes', 'Productos']

function parseSheet(wb: XLSX.WorkBook, sheetName: string): { nombre: string; precio: number }[] {
  const raw = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, defval: '' }) as unknown[][]
  const headerIdx = raw.findIndex(r => (r as unknown[]).some(c => String(c).trim() === 'Costo unitario'))
  if (headerIdx < 0) return []

  const headers = raw[headerIdx] as string[]
  const col = (name: string) => headers.findIndex(h => String(h).trim().toLowerCase() === name.toLowerCase())
  const C_NOMBRE = col('Nombre')
  const C_PRECIO = col('Costo unitario')
  if (C_NOMBRE < 0 || C_PRECIO < 0) return []

  const result: { nombre: string; precio: number }[] = []
  for (const r of raw.slice(headerIdx + 1)) {
    const row = r as unknown[]
    const nombre = String(row[C_NOMBRE] ?? '').trim()
    if (!nombre) continue
    const precio = parseFloat(String(row[C_PRECIO] ?? '')) || 0
    result.push({ nombre, precio })
  }
  return result
}

// Quita acentos y normaliza espacios
function normalize(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
}

// Porcentaje de palabras significativas compartidas entre a y b
function wordOverlap(a: string, b: string): number {
  const words = (s: string) => s.split(' ').filter(w => w.length > 2)
  const wa = words(a)
  const wb2 = new Set(words(b))
  if (wa.length === 0 || wb2.size === 0) return 0
  const shared = wa.filter(w => wb2.has(w)).length
  return shared / Math.min(wa.length, wb2.size)
}

function findMatch(
  nombreKey: string,
  prodList: { id: string; nombre: string }[]
): { id: string; nombre: string } | undefined {
  const norm = normalize(nombreKey)

  // 1. Exacto
  const exact = prodList.find(p => normalize(p.nombre) === norm)
  if (exact) return exact

  // 2. Contención (uno contiene al otro)
  const contains = prodList.find(p => {
    const pn = normalize(p.nombre)
    return pn.includes(norm) || norm.includes(pn)
  })
  if (contains) return contains

  // 3. Solapamiento de palabras ≥ 70%
  let best: { id: string; nombre: string } | undefined
  let bestScore = 0
  for (const p of prodList) {
    const score = wordOverlap(norm, normalize(p.nombre))
    if (score >= 0.7 && score > bestScore) {
      bestScore = score
      best = p
    }
  }
  return best
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const restauranteId = formData.get('restauranteId') as string | null
  if (!file || !restauranteId) return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })

  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array' })

  const sheetsPresentes = FUDO_STOCK_SHEETS.filter(s => wb.Sheets[s])
  if (sheetsPresentes.length === 0) {
    return NextResponse.json({ error: 'No se encontraron hojas Ingredientes ni Productos' }, { status: 400 })
  }

  // Consolidar filas de ambas hojas (sin duplicados por nombre, precio > 0)
  const byNombre = new Map<string, number>()
  for (const sheet of sheetsPresentes) {
    for (const row of parseSheet(wb, sheet)) {
      const key = row.nombre.toLowerCase().trim()
      if (!byNombre.has(key) && row.precio > 0) {
        byNombre.set(key, row.precio)
      }
    }
  }

  const admin = createAdminClient()
  const { data: productos } = await admin
    .from('productos')
    .select('id, nombre')
    .eq('restaurante_id', restauranteId)

  const prodList = (productos ?? []) as { id: string; nombre: string }[]

  let actualizados = 0
  const sin_match_nombres: string[] = []

  for (const [nombreKey, precio] of byNombre.entries()) {
    const match = findMatch(nombreKey, prodList)

    if (!match) {
      sin_match_nombres.push(nombreKey)
      continue
    }

    const { error } = await admin
      .from('productos')
      .update({ precio_unitario: precio })
      .eq('id', match.id)

    if (!error) {
      actualizados++
      // Propagar a ingredientes vinculados
      await admin
        .from('ingredientes')
        .update({ costo_unitario: precio })
        .eq('producto_id', match.id)
    }
  }

  return NextResponse.json({
    actualizados,
    sin_match: sin_match_nombres.length,
    sin_match_nombres: sin_match_nombres.slice(0, 30), // primeros 30 para mostrar en UI
  })
}
