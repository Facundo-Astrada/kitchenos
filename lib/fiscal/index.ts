import type { Comprobante, ComprobanteItem } from '@/types'

// ──────────────────────────────────────────────────────────────
// Contrato — Fase 1 solo define la interfaz + stub.
// Implementaciones reales (WsfeDirecto, Terceros/TusFacturas)
// van en Fase 2+ cuando se integre ARCA.
// ──────────────────────────────────────────────────────────────

export interface EmitirInput {
  comprobante: Omit<Comprobante, 'id' | 'cae' | 'cae_vencimiento' | 'numero' | 'qr_data' | 'arca_raw' | 'emitido_at' | 'created_at'>
  items: Omit<ComprobanteItem, 'id' | 'comprobante_id' | 'created_at'>[]
}

export interface EmitirResult {
  estado: 'emitido' | 'pendiente' | 'rechazado'
  cae?: string
  cae_vencimiento?: string
  numero?: number
  qr_data?: string
  arca_raw?: Record<string, unknown>
  error?: string
}

export interface UltimoAutorizadoResult {
  numero: number
  fecha: string
}

export interface ProveedorFiscal {
  /** Emite un comprobante. Si ARCA no está disponible, devuelve estado='pendiente'. */
  emitir(input: EmitirInput): Promise<EmitirResult>
  /** Devuelve el último comprobante autorizado para un punto de venta + tipo. */
  ultimoAutorizado(puntoVenta: number, tipo: string): Promise<UltimoAutorizadoResult | null>
}

// ── Stub — devuelve 'pendiente de emisión' sin llamar a ARCA ──
// Reemplazar por WsfeDirecto o Terceros en Fase 2.
export class ProveedorFiscalStub implements ProveedorFiscal {
  async emitir(_input: EmitirInput): Promise<EmitirResult> {
    return { estado: 'pendiente' }
  }

  async ultimoAutorizado(_puntoVenta: number, _tipo: string): Promise<null> {
    return null
  }
}

export const proveedorFiscal: ProveedorFiscal = new ProveedorFiscalStub()
