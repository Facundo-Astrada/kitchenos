/**
 * WsfeDirecto — implementación real de ProveedorFiscal que conecta
 * directo con ARCA (WSAA + WSFEv1).
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { obtenerTicket, type TicketAcceso } from './wsaa'
import { ultimoAutorizado, solicitarCAE } from './wsfev1'
import { buildQrPayload, buildQrUrl } from './qr'
import type { EmitirInput, EmitirResult, ProveedorFiscal, UltimoAutorizadoResult } from './index'

// Mapeo TipoComprobante → CbteTipo AFIP
const CBTE_TIPO: Record<string, number> = {
  'C': 11,  // Monotributo → CF
  'B': 6,   // RI → CF
  'A': 1,   // RI → RI
  'NC-C': 13, 'NC-B': 8, 'NC-A': 3,
  'ND-C': 12, 'ND-B': 7, 'ND-A': 2,
}

function cbteTipoFor(tipo: string, condicion: string): number {
  if (tipo === 'NC') return CBTE_TIPO[`NC-${condicion.toUpperCase()}`] ?? 13
  if (tipo === 'ND') return CBTE_TIPO[`ND-${condicion.toUpperCase()}`] ?? 12
  return CBTE_TIPO[tipo.toUpperCase()] ?? 11
}

function fechaAr(): string {
  const d = new Date()
  const local = new Date(d.getTime() - 3 * 60 * 60_000)
  return local.toISOString().slice(0, 10)
}

function fechaAfip(): string {
  return fechaAr().replace(/-/g, '')
}

function normalizeCuit(cuit: string): string {
  return cuit.replace(/-/g, '')
}

export class WsfeDirecto implements ProveedorFiscal {
  private restauranteId: string

  constructor(restauranteId: string) {
    this.restauranteId = restauranteId
  }

  private async getConfig() {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('fiscal_config')
      .select('*')
      .eq('restaurante_id', this.restauranteId)
      .eq('activo', true)
      .single()
    if (error || !data) throw new Error('No hay configuración fiscal activa')
    return data as {
      cuit: string; razon_social: string; condicion_iva: string
      punto_venta: number; cert_pem: string; key_pem: string
      ambiente: 'homologacion' | 'produccion'
    }
  }

  private async getTicket(
    config: Awaited<ReturnType<WsfeDirecto['getConfig']>>
  ): Promise<TicketAcceso> {
    const supabase = createAdminClient()

    // Intentar reusar ticket cacheado
    const { data: cached } = await supabase
      .from('fiscal_tickets')
      .select('*')
      .eq('restaurante_id', this.restauranteId)
      .eq('servicio', 'wsfe')
      .single()

    if (cached) {
      const exp = new Date(cached.expiracion)
      // Margen de 5 min para no usar un ticket a punto de expirar
      if (exp.getTime() - Date.now() > 5 * 60_000) {
        return { token: cached.token, sign: cached.sign, expiracion: exp }
      }
    }

    // Obtener nuevo ticket de WSAA
    const ta = await obtenerTicket(config.cert_pem, config.key_pem, config.ambiente)

    // Cachear (upsert)
    await supabase.from('fiscal_tickets').upsert({
      restaurante_id: this.restauranteId,
      servicio:       'wsfe',
      token:          ta.token,
      sign:           ta.sign,
      expiracion:     ta.expiracion.toISOString(),
    }, { onConflict: 'restaurante_id,servicio' })

    return ta
  }

  async ultimoAutorizado(puntoVenta: number, tipo: string): Promise<UltimoAutorizadoResult | null> {
    try {
      const config  = await this.getConfig()
      const ta      = await this.getTicket(config)
      const cbteTipo = CBTE_TIPO[tipo.toUpperCase()] ?? 11
      const cuit    = normalizeCuit(config.cuit)
      const auth    = { token: ta.token, sign: ta.sign, cuit }
      const num     = await ultimoAutorizado(auth, puntoVenta, cbteTipo, config.ambiente)
      return { numero: num, fecha: fechaAr() }
    } catch {
      return null
    }
  }

  async emitir(input: EmitirInput): Promise<EmitirResult> {
    const { comprobante } = input

    try {
      const config   = await this.getConfig()
      const ta       = await this.getTicket(config)
      const cuit     = normalizeCuit(config.cuit)
      const auth     = { token: ta.token, sign: ta.sign, cuit }
      const cbteTipo = cbteTipoFor(comprobante.tipo, comprobante.tipo)
      const ptoVta   = config.punto_venta

      // Siguiente número
      const ultimo = await ultimoAutorizado(auth, ptoVta, cbteTipo, config.ambiente)
      const numero = ultimo + 1

      // Importes
      const total   = Number(comprobante.total)
      const isRI    = config.condicion_iva === 'ri'
      // Gastronomía: 21% IVA. Para Monotributo (FC-C) no hay IVA discriminado.
      const alicuota = 21
      const impNeto  = isRI ? parseFloat((total / (1 + alicuota / 100)).toFixed(2)) : total
      const impIVA   = isRI ? parseFloat((total - impNeto).toFixed(2)) : 0

      const result = await solicitarCAE(auth, {
        ptoVta,
        cbteTipo,
        numero,
        fecha:      fechaAfip(),
        concepto:   3,            // Productos y Servicios
        docTipo:    99,
        docNro:     0,
        impTotal:   total,
        impNeto,
        impIVA,
        impOtros:   0,
        alicuotaIVA: isRI ? alicuota : undefined,
      }, config.ambiente)

      // Construir QR
      const fechaIso = `${fechaAr()}`
      const qrPayload = buildQrPayload({
        cuit:    cuit,
        ptoVta,
        tipoCmp: cbteTipo,
        nroCmp:  result.numero,
        importe: total,
        cae:     result.cae,
        fecha:   fechaIso,
      })
      const qrUrl = buildQrUrl(qrPayload)

      return {
        estado:         'emitido',
        cae:            result.cae,
        cae_vencimiento: result.caeFchVto,
        numero:         result.numero,
        qr_data:        qrUrl,
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message
        : (e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : 'Error fiscal desconocido')
      return { estado: 'rechazado', error: msg }
    }
  }
}
