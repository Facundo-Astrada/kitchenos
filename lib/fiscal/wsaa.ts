/**
 * WSAA — Web Service de Autenticación y Autorización (ARCA/AFIP)
 *
 * Flujo: LoginTicketRequest XML → firma CMS/PKCS#7 con cert+key → SOAP → Token+Sign
 * El TA (Ticket de Acceso) dura ~12hs y se cachea en fiscal_tickets.
 */
import forge from 'node-forge'

const WSAA_URL = {
  homologacion: 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms',
  produccion:   'https://wsaa.afip.gov.ar/ws/services/LoginCms',
}

export interface TicketAcceso {
  token: string
  sign:  string
  expiracion: Date
}

// ── helpers ──────────────────────────────────────────────────────────────────

function isoAr(d: Date): string {
  // AFIP usa ISO 8601 con offset -03:00
  const off = -3 * 60
  const local = new Date(d.getTime() + off * 60_000)
  return local.toISOString().replace('Z', '-03:00')
}

function buildLtr(servicio: string): string {
  const now   = new Date()
  const gen   = new Date(now.getTime() - 10 * 60_000)
  const exp   = new Date(now.getTime() + 12 * 60 * 60_000)
  return `<?xml version="1.0" encoding="UTF-8"?>\n<loginTicketRequest version="1.0">\n  <header>\n    <uniqueId>${Math.floor(now.getTime() / 1000)}</uniqueId>\n    <generationTime>${isoAr(gen)}</generationTime>\n    <expirationTime>${isoAr(exp)}</expirationTime>\n  </header>\n  <service>${servicio}</service>\n</loginTicketRequest>`
}

function signCms(xml: string, certPem: string, keyPem: string): string {
  const p7 = forge.pkcs7.createSignedData()
  p7.content = forge.util.createBuffer(xml, 'utf8')
  p7.addCertificate(certPem)
  p7.addSigner({
    key: forge.pki.privateKeyFromPem(keyPem),
    certificate: forge.pki.certificateFromPem(certPem),
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType,    value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime,    value: new Date() as unknown as string },
    ],
  })
  p7.sign()
  const der = forge.asn1.toDer(p7.toAsn1())
  return forge.util.encode64(der.getBytes())
}

function soapLogin(cms: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><loginCms xmlns="http://ar.gov.afip.dif.FEV1/"><in0>${cms}</in0></loginCms></soap:Body></soap:Envelope>`
}

function tag(xml: string, name: string): string {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`))
  return m ? m[1].trim() : ''
}

// ── función pública ──────────────────────────────────────────────────────────

export async function obtenerTicket(
  certPem:  string,
  keyPem:   string,
  ambiente: 'homologacion' | 'produccion',
  servicio = 'wsfe',
): Promise<TicketAcceso> {
  const ltr  = buildLtr(servicio)
  const cms  = signCms(ltr, certPem, keyPem)
  const soap = soapLogin(cms)

  const resp = await fetch(WSAA_URL[ambiente], {
    method:  'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '""' },
    body:    soap,
    signal:  AbortSignal.timeout(15_000),
  })

  if (!resp.ok) {
    const txt = await resp.text().catch(() => '')
    throw new Error(`WSAA HTTP ${resp.status}: ${txt.slice(0, 200)}`)
  }

  const body  = await resp.text()
  const token = tag(body, 'token')
  const sign  = tag(body, 'sign')
  const expStr = tag(body, 'expirationTime')

  if (!token || !sign) {
    const err = tag(body, 'faultstring') || body.slice(0, 300)
    throw new Error(`WSAA: no devolvió token. ${err}`)
  }

  return { token, sign, expiracion: new Date(expStr) }
}
