'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { COACH_HIGHLIGHT_IDS as _COACH_HIGHLIGHT_IDS } from '@/lib/coach/highlights'
import { COACH_ERROR_MARK, COACH_PENDING_MARK } from '@/lib/coach/stream'
import type { PendingAction } from '@/lib/coach/types'

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

interface CoachOptions {
  // Si se define, la conversación activa se persiste en localStorage bajo esta key
  // (sobrevive recargas). El historial de conversaciones se maneja aparte (lib/coach/history).
  storageKey?: string | null
}

export function useKitchenCoach(opts?: CoachOptions) {
  const storageKey = opts?.storageKey ?? null
  const [messages, setMessages] = useState<CoachMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [highlight, setHighlight] = useState<string | null>(null)
  const [overlayText, setOverlayText] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [confirmingDraftId, setConfirmingDraftId] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const messagesRef = useRef<CoachMessage[]>([])
  messagesRef.current = messages

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => setIsOpen(v => !v), [])
  const clearMessages = useCallback(() => setMessages([]), [])
  const clearHighlight = useCallback(() => setHighlight(null), [])
  const clearOverlayText = useCallback(() => setOverlayText(null), [])
  const replaceMessages = useCallback((msgs: CoachMessage[]) => setMessages(msgs), [])

  // ── Persistencia de la conversación activa ────────────────────
  const loadedKeyRef = useRef<string | null>(null)
  useEffect(() => {
    if (!storageKey) return
    if (loadedKeyRef.current === storageKey) return
    loadedKeyRef.current = storageKey
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) {
        const parsed = JSON.parse(raw) as Array<{ id: string; role: 'user' | 'assistant'; content: string; timestamp: string; options?: string[] }>
        setMessages(parsed.map(m => ({ ...m, timestamp: new Date(m.timestamp) })))
      }
    } catch { /* ignore */ }
  }, [storageKey])

  // Guarda al terminar cada respuesta (no en cada token para no thrashear localStorage).
  useEffect(() => {
    if (!storageKey || loading) return
    if (loadedKeyRef.current !== storageKey) return
    try {
      const toSave = messages.filter(m => m.content !== '')
      if (toSave.length) localStorage.setItem(storageKey, JSON.stringify(toSave))
      else localStorage.removeItem(storageKey)
    } catch { /* ignore */ }
  }, [messages, storageKey, loading])

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

    const apiMessages = [...messagesRef.current, userMsg]
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

      // ── Lectura del stream de texto ─────────────────────────────
      const reader = res.body?.getReader()
      if (!reader) throw new Error('No se pudo leer la respuesta')
      const decoder = new TextDecoder()
      let buffer = ''
      let streamErr: string | null = null

      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const markIdx = buffer.indexOf(COACH_ERROR_MARK)
        if (markIdx >= 0) {
          streamErr = buffer.slice(markIdx + COACH_ERROR_MARK.length) || 'Error del asistente'
          break
        }

        // El marker de acción pendiente (si lo hay) va SIEMPRE al final del stream —
        // no mostrar el marker+JSON como texto visible mientras se recibe.
        const pendIdx = buffer.indexOf(COACH_PENDING_MARK)
        const visibleBuffer = pendIdx >= 0 ? buffer.slice(0, pendIdx) : buffer

        // Respuestas estructuradas (JSON con highlight/options) no se muestran en vivo:
        // se dejan los puntos suspensivos hasta parsear al final. El resto se streamea.
        if (!visibleBuffer.trimStart().startsWith('{')) {
          setMessages(prev => prev.map(m => m.id === placeholderId ? { ...m, content: visibleBuffer } : m))
        }
      }

      if (streamErr) throw new Error(streamErr)

      // ── Stream completo — extraer acción pendiente (si la hay) antes de parsear el texto ──
      let pendingActionParsed: PendingAction | null = null
      const pendIdxFinal = buffer.indexOf(COACH_PENDING_MARK)
      const rawText = pendIdxFinal >= 0 ? buffer.slice(0, pendIdxFinal) : buffer
      if (pendIdxFinal >= 0) {
        try { pendingActionParsed = JSON.parse(buffer.slice(pendIdxFinal + COACH_PENDING_MARK.length)) } catch { /* ignore */ }
      }

      // ── Parsear respuesta estructurada si la hay ──
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
      setPendingAction(pendingActionParsed)
      setMessages(prev =>
        prev.map(m => m.id === placeholderId ? {
          ...m,
          content: text || 'Sin respuesta',
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
  }, [])

  const confirmAction = useCallback(async (draftId: string, payload: Record<string, unknown>) => {
    setConfirmingDraftId(draftId)
    try {
      const res = await fetch('/api/coach/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft_id: draftId, action: 'confirm', payload }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo confirmar')
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(), role: 'assistant', content: `✓ ${data.message}`, timestamp: new Date(),
      }])
      setPendingAction(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al confirmar')
    } finally {
      setConfirmingDraftId(null)
    }
  }, [])

  const cancelAction = useCallback(async (draftId: string) => {
    setConfirmingDraftId(draftId)
    try {
      await fetch('/api/coach/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft_id: draftId, action: 'cancel' }),
      })
      setPendingAction(null)
    } finally {
      setConfirmingDraftId(null)
    }
  }, [])

  return {
    messages, loading, error, isOpen, highlight, overlayText,
    pendingAction, confirmingDraftId,
    open, close, toggle, sendMessage, clearMessages, replaceMessages,
    clearHighlight, clearOverlayText, cancelRequest, confirmAction, cancelAction,
  }
}
