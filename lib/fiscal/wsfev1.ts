/**
 * WSFEv1 — Web Service de Facturación Electrónica v1 (ARCA/AFIP)
 * Cobertura mínima: FECompUltimoAutorizado + FECAESolicitar
 */

const WSFE_URL = {
  homologacion: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
  produccion:   'https://servicios1.afip.gov.ar/wsfev1/service.asmx',
}

// ── Tipos internos ────────────────────────────────────────────────────────────

export interface Auth {
  token:  string
  sign:   string
  cuit:   string   // largo sin guiones, ej. "20111111112"
}

export interface SolicitudCAE {
  ptoVta:   number
  cbteTipo: number          // 11=FC-C, 6=FC-B, 1=FC-A
  numero:   number          // CbteDesde = CbteHasta
  fecha:    string          // YYYYMMDD en hora AR
  concepto: 1 | 2 | 3      // 1=Productos, 2=Servicios, 3=Ambos
  docTipo:  number          // 99=CF, 80=CUIT, 96=DNI
  docNro:   number
  impTotal: number
  impNeto:  number
  impIVA:   number
  impOtros: number
  // IVA discriminado (solo para RI / FC-A / FC-B)
  alicuotaIVA?: number      // 10.5 | 21
}

export interface ResultadoCAE {
  cae:        string
  caeFchVto:  string        // YYYYMMDD
  numero:     number
  resultado:  'A' | 'R'    // Aprobado / Rechazado
  observaciones?: string
  errores?:       string
}

// ── helpers ──────────────────────────────────────────────────────────────────

function tag(xml: string, name: string): string {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`))
  return m ? m[1].trim() : ''
}

async function soapCall(
  url:        string,
  action:     string,
  body:       string,
): Promise<string> {
  const envelope = `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/"><soap:Body>${body}</soap:Body></soap:Envelope>`

  const resp = await fetch(url, {
    method:  'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      SOAPAction:     `"http://ar.gov.afip.dif.FEV1/${action}"`,
    },
    body:   envelope,
    signal: AbortSignal.timeout(20_000),
  })

  if (!resp.ok) {
    const txt = await resp.text().catch(() => '')
    throw new Error(`WSFEv1 HTTP ${resp.status} [${action}]: ${txt.slice(0, 200)}`)
  }
  return resp.text()
}

function authXml(a: Auth): string {
  return `<ar:Auth><ar:Token>${a.token}</ar:Token><ar:Sign>${a.sign}</ar:Sign><ar:Cuit>${a.cuit}</ar:Cuit></ar:Auth>`
}

// ── Funciones públicas ───────────────────────────────────────────────────────

/** Devuelve el último número autorizado para un PtoVta+CbteTipo. */
export async function ultimoAutorizado(
  auth:      Auth,
  ptoVta:    number,
  cbteTipo:  number,
  ambiente:  'homologacion' | 'produccion',
): Promise<number> {
  const body = `<ar:FECompUltimoAutorizado>${authXml(auth)}<ar:PtoVta>${ptoVta}</ar:PtoVta><ar:CbteTipo>${cbteTipo}</ar:CbteTipo></ar:FECompUltimoAutorizado>`
  const xml  = await soapCall(WSFE_URL[ambiente], 'FECompUltimoAutorizado', body)
  const cbteNro = tag(xml, 'CbteNro')
  const err     = tag(xml, 'ErrMsg')
  if (err) throw new Error(`WSFEv1 ultimoAutorizado: ${err}`)
  return parseInt(cbteNro || '0', 10)
}

/** Solicita un CAE para un comprobante. */
export async function solicitarCAE(
  auth:     Auth,
  sol:      SolicitudCAE,
  ambiente: 'homologacion' | 'produccion',
): Promise<ResultadoCAE> {

  // IVA array: solo para FC-A y FC-B (RI)
  const needsIva = sol.cbteTipo === 1 || sol.cbteTipo === 6
  const ivaXml = needsIva && sol.impIVA > 0
    ? `<ar:Iva><ar:AlicIva><ar:Id>${sol.alicuotaIVA === 10.5 ? 4 : 5}</ar:Id><ar:BaseImp>${sol.impNeto.toFixed(2)}</ar:BaseImp><ar:Importe>${sol.impIVA.toFixed(2)}</ar:Importe></ar:AlicIva></ar:Iva>`
    : ''

  const detalle = `<ar:FECAEDetRequest>
    <ar:Concepto>${sol.concepto}</ar:Concepto>
    <ar:DocTipo>${sol.docTipo}</ar:DocTipo>
    <ar:DocNro>${sol.docNro}</ar:DocNro>
    <ar:CbteDesde>${sol.numero}</ar:CbteDesde>
    <ar:CbteHasta>${sol.numero}</ar:CbteHasta>
    <ar:CbteFch>${sol.fecha}</ar:CbteFch>
    <ar:ImpTotal>${sol.impTotal.toFixed(2)}</ar:ImpTotal>
    <ar:ImpTotConc>0.00</ar:ImpTotConc>
    <ar:ImpNeto>${sol.impNeto.toFixed(2)}</ar:ImpNeto>
    <ar:ImpOpEx>0.00</ar:ImpOpEx>
    <ar:ImpIVA>${sol.impIVA.toFixed(2)}</ar:ImpIVA>
    <ar:ImpTrib>${sol.impOtros.toFixed(2)}</ar:ImpTrib>
    <ar:MonId>PES</ar:MonId>
    <ar:MonCotiz>1</ar:MonCotiz>
    ${ivaXml}
  </ar:FECAEDetRequest>`

  const body = `<ar:FECAESolicitar>
    ${authXml(auth)}
    <ar:FeCAEReq>
      <ar:FeCabReq>
        <ar:CantReg>1</ar:CantReg>
        <ar:PtoVta>${sol.ptoVta}</ar:PtoVta>
        <ar:CbteTipo>${sol.cbteTipo}</ar:CbteTipo>
      </ar:FeCabReq>
      <ar:FeDetReq>${detalle}</ar:FeDetReq>
    </ar:FeCAEReq>
  </ar:FECAESolicitar>`

  const xml = await soapCall(WSFE_URL[ambiente], 'FECAESolicitar', body)

  const resultado   = tag(xml, 'Resultado')
  const cae         = tag(xml, 'CAE')
  const caeFchVto   = tag(xml, 'CAEFchVto')
  const cbteDesde   = tag(xml, 'CbteDesde')
  const obs         = tag(xml, 'Msg')
  const errores     = tag(xml, 'ErrMsg') || tag(xml, 'faultstring')

  if (resultado !== 'A') {
    throw new Error(`WSFEv1 rechazó el comprobante: ${errores || obs || xml.slice(0, 300)}`)
  }

  return {
    cae,
    caeFchVto,
    numero:       parseInt(cbteDesde || String(sol.numero), 10),
    resultado:    'A',
    observaciones: obs || undefined,
  }
}
