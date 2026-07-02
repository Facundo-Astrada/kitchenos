import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/ingest/escpos
 *
 * Dos modos:
 *   1. { mode: 'generate', tipo: 'cocina'|'cliente', comanda | cuenta } → devuelve bytes ESC/POS en base64
 *   2. { mode: 'ingest', raw: string, restaurante_id: uuid }  → parsea texto de POS legacy (stub)
 *
 * ESC/POS specs usados:
 *   ESC @ (0x1B 0x40)  — init
 *   ESC a N (0x1B 0x61 0x00/01/02) — alineación (0=izq, 1=centro, 2=der)
 *   ESC ! N (0x1B 0x21)  — modo texto (0=normal, 0x10=doble-ancho, 0x20=doble-alto, 0x30=doble+doble)
 *   GS V N  (0x1D 0x56 0x42 0x00)  — corte parcial
 *   LF (0x0A) — salto de línea
 */

// ── Builders ESC/POS ──────────────────────────────────────────────────────────

const ESC = 0x1b
const GS  = 0x1d
const LF  = 0x0a

function init(): number[]       { return [ESC, 0x40] }
function left(): number[]       { return [ESC, 0x61, 0x00] }
function center(): number[]     { return [ESC, 0x61, 0x01] }
function bold(on: boolean): number[] { return [ESC, 0x45, on ? 1 : 0] }
function doubleHeight(): number[] { return [ESC, 0x21, 0x10] }
function normal(): number[]     { return [ESC, 0x21, 0x00] }
function cut(): number[]        { return [GS, 0x56, 0x42, 0x00] }

function text(s: string): number[] {
  // Codificación latin-1 (CP437 / ISO-8859-1 — lo más común en impresoras térmicas)
  const bytes: number[] = []
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    bytes.push(c <= 0xff ? c : 0x3f) // '?' fallback
  }
  return bytes
}

function line(s: string): number[] { return [...text(s), LF] }
function blank(): number[]          { return [LF] }
function divider(): number[]        { return line('-'.repeat(42)) }

function padRight(l: string, r: string, width: number): string {
  const gap = width - l.length - r.length
  return l + (gap > 0 ? ' '.repeat(gap) : ' ') + r
}

// ── Ticket de cocina ──────────────────────────────────────────────────────────

interface TicketCocina {
  mesa: string
  mozo?: string
  items: { cantidad: number; nombre: string; notas?: string | null; modificadores?: { tipo: string; texto: string }[] }[]
  hora?: string
}

function buildTicketCocina(t: TicketCocina): number[] {
  const bytes: number[] = [
    ...init(),
    ...center(), ...doubleHeight(), ...bold(true),
    ...line('** COCINA **'),
    ...normal(), ...bold(false),
    ...center(), ...line(`Mesa ${t.mesa}`),
  ]
  if (t.mozo) bytes.push(...center(), ...line(t.mozo))
  const hora = t.hora ?? new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  bytes.push(...center(), ...line(hora), ...divider(), ...left())
  for (const item of t.items) {
    bytes.push(...bold(true), ...line(`${item.cantidad}x ${item.nombre}`), ...bold(false))
    for (const m of item.modificadores ?? []) {
      bytes.push(...line(`  ${m.tipo === 'sin' ? 'SIN' : m.tipo === 'con' ? 'CON' : 'EXTRA'} ${m.texto}`))
    }
    if (item.notas) bytes.push(...line(`  >> ${item.notas}`))
  }
  bytes.push(...divider(), ...blank(), ...blank(), ...cut())
  return bytes
}

// ── Ticket de cliente (recibo) ────────────────────────────────────────────────

interface TicketCliente {
  nombreLocal: string
  mesa: string
  items: { nombre: string; cantidad: number; precio: number }[]
  subtotal: number
  propina: number
  total: number
  pagos: { nombre: string; monto: number }[]
  vuelto: number
  cae?: string
  caeVto?: string
  numeroComprobante?: number
  qrData?: string
  fecha?: string
  hora?: string
}

function buildTicketCliente(t: TicketCliente): number[] {
  const ANCHO = 42
  const fecha = t.fecha ?? new Date().toLocaleDateString('es-AR')
  const hora  = t.hora  ?? new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })

  const bytes: number[] = [
    ...init(),
    ...center(), ...doubleHeight(), ...bold(true),
    ...line(t.nombreLocal.slice(0, 20)),
    ...normal(), ...bold(false),
    ...center(), ...line(`Mesa ${t.mesa}   ${fecha}  ${hora}`),
    ...divider(),
    ...left(),
  ]

  for (const item of t.items) {
    const precio = `$${Math.round(item.precio * item.cantidad).toLocaleString('es-AR')}`
    bytes.push(...line(padRight(`${item.cantidad}x ${item.nombre}`.slice(0, 32), precio, ANCHO)))
  }

  bytes.push(...divider())

  const sub = `$${Math.round(t.subtotal).toLocaleString('es-AR')}`
  bytes.push(...line(padRight('Subtotal', sub, ANCHO)))

  if (t.propina > 0) {
    const prop = `$${Math.round(t.propina).toLocaleString('es-AR')}`
    bytes.push(...line(padRight('Propina', prop, ANCHO)))
  }

  bytes.push(...bold(true), ...line(padRight('TOTAL', `$${Math.round(t.total).toLocaleString('es-AR')}`, ANCHO)), ...bold(false))
  bytes.push(...divider())

  for (const pago of t.pagos) {
    bytes.push(...line(padRight(pago.nombre, `$${Math.round(pago.monto).toLocaleString('es-AR')}`, ANCHO)))
  }
  if (t.vuelto > 0) {
    bytes.push(...bold(true), ...line(padRight('Vuelto', `$${Math.round(t.vuelto).toLocaleString('es-AR')}`, ANCHO)), ...bold(false))
  }

  if (t.cae) {
    bytes.push(...divider(), ...center(), ...line('Comprobante electronico'), ...left(),
      ...line(`CAE: ${t.cae}`),
      ...(t.caeVto ? line(`Vto CAE: ${t.caeVto}`) : []),
      ...(t.numeroComprobante ? line(`Nro: ${t.numeroComprobante}`) : [])
    )
  }

  bytes.push(...blank(), ...center(), ...line('Gracias por su visita!'), ...blank(), ...blank(), ...cut())
  return bytes
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  const mode = body.mode as string ?? 'ingest'

  if (mode === 'generate') {
    const tipo = body.tipo as string
    let bytes: number[]
    try {
      if (tipo === 'cocina') {
        bytes = buildTicketCocina(body.data as TicketCocina)
      } else if (tipo === 'cliente') {
        bytes = buildTicketCliente(body.data as TicketCliente)
      } else {
        return NextResponse.json({ error: 'tipo debe ser "cocina" o "cliente"' }, { status: 400 })
      }
    } catch (e: unknown) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Error generando ticket' }, { status: 500 })
    }

    // Devolver como base64 para que el cliente pueda enviarlo a una impresora WebUSB o Bluetooth
    const base64 = Buffer.from(bytes).toString('base64')
    return NextResponse.json({ ok: true, tipo, bytes: base64, byteLength: bytes.length })
  }

  // mode: 'ingest' — parseo de texto POS legacy (stub mejorado)
  const raw = body.raw as string
  if (!raw) return NextResponse.json({ error: 'raw requerido' }, { status: 400 })

  // Intentar parsear si viene en formato simple "CANT x NOMBRE"
  const lineas = raw.split('\n').map(l => l.trim()).filter(Boolean)
  const items: { cantidad: number; nombre: string }[] = []
  for (const l of lineas) {
    const m = l.match(/^(\d+)\s*[xX]\s*(.+)$/)
    if (m) items.push({ cantidad: parseInt(m[1]), nombre: m[2].trim() })
  }

  return NextResponse.json({
    status: 'parsed',
    items,
    lineCount: lineas.length,
    raw: raw.slice(0, 200),
  })
}
