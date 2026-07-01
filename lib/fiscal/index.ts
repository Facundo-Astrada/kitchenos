import type { Comprobante, ComprobanteItem } from '@/types'

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
  emitir(input: EmitirInput): Promise<EmitirResult>
  ultimoAutorizado(puntoVenta: number, tipo: string): Promise<UltimoAutorizadoResult | null>
}

// Stub para cuando no hay config fiscal activa
export class ProveedorFiscalStub implements ProveedorFiscal {
  async emitir(_input: EmitirInput): Promise<EmitirResult> {
    return { estado: 'pendiente', error: 'Fiscal no configurado' }
  }
  async ultimoAutorizado(_puntoVenta: number, _tipo: string): Promise<null> {
    return null
  }
}

// Factory — la API route construye WsfeDirecto con el restauranteId real
export { WsfeDirecto } from './wsfe-directo'
export { ProveedorFiscalStub as default }
