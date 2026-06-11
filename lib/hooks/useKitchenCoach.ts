'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { COACH_HIGHLIGHT_IDS as _COACH_HIGHLIGHT_IDS } from '@/lib/coach/highlights'

export { _COACH_HIGHLIGHT_IDS as COACH_HIGHLIGHT_IDS }

export interface CoachMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  options?: string[]
}

interface CoachContext {
  stockCritico?: Array<{ nombre: string; cantidad: number; minimo: number }>
  tareasPendientes?: Array<{ titulo: string; prioridad: string; plaza?: string }>
}


export function useKitchenCoach() {
  const [messages, setMessages] = useState<CoachMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [highlight, setHighlight] = useState<string | null>(null)
  const [overlayText, setOverlayText] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => setIsOpen(v => !v), [])
  const clearMessages = useCallback(() => setMessages([]), [])
  const clearHighlight = useCallback(() => setHighlight(null), [])
  const clearOverlayText = useCallback(() => setOverlayText(null), [])

  // Auto-clear highlight + overlayText after 8s (user may need time to read)
  useEffect(() => {
    if (!highlight) return
    const t = setTimeout(() => { setHighlight(null); setOverlayText(null) }, 8000)
    return () => clearTimeout(t)
  }, [highlight])

  const cancelRequest = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setLoading(false)
  }, [])

  const sendMessage = useCallback(async (content: string, ctx?: CoachContext) => {
    const userMsg: CoachMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: new Date(),
    }
    const placeholderId = crypto.randomUUID()
    const placeholder: CoachMessage = {
      id: placeholderId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
    }

    setMessages(prev => [...prev, userMsg, placeholder])
    setLoading(true)
    setError(null)
    setHighlight(null)
    setOverlayText(null)

    const apiMessages = [...messages, userMsg]
      .filter(m => m.content !== '')
      .map(m => ({ role: m.role, content: m.content }))

    let screenContext: unknown = null
    try {
      screenContext = JSON.parse(localStorage.getItem('kc_screen_context') ?? 'null')
    } catch { /* ignore */ }

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages, screenContext, ctx }),
        signal: controller.signal,
      })

      if (res.status === 429) throw new Error('Demasiadas solicitudes, esperá un momento')
      if (res.status === 401) throw new Error('Error de configuración de IA')
      if (res.status === 402) throw new Error('Créditos de IA agotados')
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Error al procesar la solicitud')
      }

      const data = await res.json()
      const rawText = data.content?.find((b: { type: string; text?: string }) => b.type === 'text')?.text ?? data.message ?? 'Sin respuesta'

      // Try to parse structured response { text, highlight, overlay_text, options }
      let text = rawText
      let hl: string | null = null
      let ovText: string | null = null
      let opts: string[] | null = null
      try {
        const trimmed = rawText.trim()
        if (trimmed.startsWith('{')) {
          const parsed = JSON.parse(trimmed)
          if (parsed && typeof parsed.text === 'string') {
            text = parsed.text
            hl = typeof parsed.highlight === 'string' ? parsed.highlight : null
            ovText = typeof parsed.overlay_text === 'string' ? parsed.overlay_text : null
            opts = Array.isArray(parsed.options)
              ? parsed.options.filter((o: unknown) => typeof o === 'string')
              : null
          }
        }
      } catch { /* plain text response */ }

      setHighlight(hl)
      setOverlayText(ovText)
      setMessages(prev =>
        prev.map(m => m.id === placeholderId ? {
          ...m,
          content: text,
          timestamp: new Date(),
          options: opts && opts.length > 0 ? opts : undefined,
        } : m)
      )
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') return
      const errMsg = e instanceof Error ? e.message : 'Error al conectar con el asistente'
      setError(errMsg)
      setMessages(prev => prev.filter(m => m.id !== placeholderId))
    } finally {
      setLoading(false)
      abortRef.current = null
    }
  }, [messages])

  return {
    messages, loading, error, isOpen, highlight, overlayText,
    open, close, toggle, sendMessage, clearMessages,
    clearHighlight, clearOverlayText, cancelRequest,
  }
}
