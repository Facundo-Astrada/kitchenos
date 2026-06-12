import { NextRequest, NextResponse } from 'next/server'

// Recibe errores del cliente (window.onerror / unhandledrejection / error boundary)
// y los loguea — visibles en los logs de la función en Vercel. Sin auth (los errores
// pueden ocurrir antes del login) y con truncado para evitar abuso/floods.
const trunc = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : '')

export async function POST(req: NextRequest) {
  try {
    const b = await req.json()
    console.error('[client-error]', JSON.stringify({
      message: trunc(b.message, 500),
      source: trunc(b.source, 300),
      url: trunc(b.url, 300),
      stack: trunc(b.stack, 2000),
      ua: trunc(b.userAgent, 200),
      at: new Date().toISOString(),
    }))
  } catch {
    // body malformado — ignorar
  }
  return new NextResponse(null, { status: 204 })
}
