'use client'

import { useEffect } from 'react'

// Captura errores JS no atrapados y promesas rechazadas en toda la app, y los
// reporta a /api/log-error (visibles en Vercel). Dedup + tope por carga para no
// inundar el endpoint si algo entra en loop.
const seen = new Set<string>()
let count = 0
const MAX_PER_LOAD = 20

export function reportClientError(payload: {
  message: string
  stack?: string
  source?: string
}) {
  if (typeof window === 'undefined') return
  const sig = `${payload.message}|${payload.source ?? ''}`
  if (seen.has(sig) || count >= MAX_PER_LOAD) return
  seen.add(sig)
  count++
  setTimeout(() => seen.delete(sig), 10_000)

  try {
    const body = JSON.stringify({
      ...payload,
      url: location.href,
      userAgent: navigator.userAgent,
    })
    const blob = new Blob([body], { type: 'application/json' })
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/log-error', blob)
    } else {
      fetch('/api/log-error', { method: 'POST', body, keepalive: true }).catch(() => {})
    }
  } catch {
    // best-effort — nunca romper por el reporter
  }
}

export default function ErrorReporter() {
  useEffect(() => {
    function onError(e: ErrorEvent) {
      // Ignorar errores de carga de recursos (img/script) — ruidosos y sin stack útil
      if (!e.message && !e.error) return
      reportClientError({
        message: e.message || 'Error',
        stack: e.error?.stack,
        source: `${e.filename}:${e.lineno}:${e.colno}`,
      })
    }
    function onRejection(e: PromiseRejectionEvent) {
      const r = e.reason
      reportClientError({
        message: r?.message ?? String(r),
        stack: r?.stack,
        source: 'unhandledrejection',
      })
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])
  return null
}
