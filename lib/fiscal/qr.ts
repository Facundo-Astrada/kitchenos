/**
 * QR fiscal AFIP/ARCA
 * Formato: https://www.afip.gob.ar/fe/qr/?p=BASE64URL(JSON)
 */

export interface QrPayload {
  ver:         number   // 1
  fecha:       string   // YYYY-MM-DD
  cuit:        number   // CUIT como entero
  ptoVta:      number
  tipoCmp:     number   // tipo comprobante AFIP
  nroCmp:      number
  importe:     number
  moneda:      string   // 'PES'
  ctz:         number   // 1 para pesos
  tipoDocRec:  number   // 99=CF
  nroDocRec:   number   // 0=CF
  tipoCodAut:  string   // 'E' para CAE
  codAut:      number   // CAE como entero
}

export function buildQrUrl(p: QrPayload): string {
  const json     = JSON.stringify(p)
  const b64      = Buffer.from(json).toString('base64url')
  return `https://www.afip.gob.ar/fe/qr/?p=${b64}`
}

export function buildQrPayload(opts: {
  cuit:    string    // con o sin guiones
  ptoVta:  number
  tipoCmp: number
  nroCmp:  number
  importe: number
  cae:     string
  fecha:   string    // YYYY-MM-DD
  docNro?: number
  docTipo?: number
}): QrPayload {
  return {
    ver:        1,
    fecha:      opts.fecha,
    cuit:       parseInt(opts.cuit.replace(/-/g, ''), 10),
    ptoVta:     opts.ptoVta,
    tipoCmp:    opts.tipoCmp,
    nroCmp:     opts.nroCmp,
    importe:    Math.round(opts.importe * 100) / 100,
    moneda:     'PES',
    ctz:        1,
    tipoDocRec: opts.docTipo ?? 99,
    nroDocRec:  opts.docNro ?? 0,
    tipoCodAut: 'E',
    codAut:     parseInt(opts.cae, 10),
  }
}
