'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useRestauranteId } from './useRestauranteId'

export interface CoachMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

interface CoachContext {
  stockCritico?: Array<{ nombre: string; cantidad: number; minimo: number }>
  tareasPendientes?: Array<{ titulo: string; prioridad: string; plaza?: string }>
}

// IDs disponibles para el highlight en el módulo OPS
export const COACH_HIGHLIGHT_IDS = [
  'ops-tab-produccion', 'ops-tab-mise', 'ops-tab-planificacion',
  'prod-seccion-sp', 'prod-fab-add',
  'mise-stock-box', 'mise-producir-box', 'mise-fab-add',
  'plan-sub-menu', 'plan-sub-eventos',
] as const

export function useKitchenCoach() {
  const [messages, setMessages] = useState<CoachMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [highlight, setHighlight] = useState<string | null>(null)
  const restauranteId = useRestauranteId()
  const abortRef = useRef<AbortController | null>(null)

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => setIsOpen(v => !v), [])
  const clearMessages = useCallback(() => setMessages([]), [])
  const clearHighlight = useCallback(() => setHighlight(null), [])

  // Auto-clear highlight after 3.5s
  useEffect(() => {
    if (!highlight) return
    const t = setTimeout(() => setHighlight(null), 3500)
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

    // Build system prompt
    let systemPrompt = `Sos Kitchen Coach, un asistente especializado en gestión de cocinas profesionales.
Respondés en español rioplatense, de forma concisa y práctica.
Conocés de food cost, mise en place, HACCP, gestión de stock y operaciones gastronómicas.`

    if (ctx?.stockCritico?.length) {
      systemPrompt += `\n\n## Stock crítico actual:`
      for (const item of ctx.stockCritico) {
        systemPrompt += `\n- ${item.nombre}: ${item.cantidad} unidades (mínimo: ${item.minimo})`
      }
    }

    if (ctx?.tareasPendientes?.length) {
      systemPrompt += `\n\n## Tareas pendientes del día:`
      for (const t of ctx.tareasPendientes) {
        systemPrompt += `\n- [${t.prioridad.toUpperCase()}] ${t.plaza ? t.plaza + ' ' : ''}${t.titulo}`
      }
    }

    // OPS screen context (written by each page via localStorage)
    try {
      const screenCtx = JSON.parse(localStorage.getItem('kc_screen_context') ?? 'null')
      if (screenCtx) {
        systemPrompt += `\n\n## Pantalla activa: ${JSON.stringify(screenCtx)}`
      }
    } catch { /* ignore */ }

    systemPrompt += `\n\n## UI highlight (módulo Operaciones)
Cuando tu respuesta menciona dónde está algo en la pantalla, podés incluir un highlight para iluminar ese elemento. Respondé en JSON exacto:
{"text":"tu respuesta aquí","highlight":"id-del-elemento"}
IDs disponibles: ${COACH_HIGHLIGHT_IDS.join(', ')}
En conversaciones generales sin referencia a UI, respondé SOLO texto plano (sin JSON).`

    systemPrompt += `\n\nUsá el contexto para dar consejos relevantes cuando el usuario lo necesite.`

    const apiMessages = [...messages, userMsg]
      .filter(m => m.content !== '')
      .map(m => ({ role: m.role, content: m.content }))

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages, systemPrompt, restauranteId }),
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
      const rawText = data.content?.[0]?.text ?? data.message ?? 'Sin respuesta'

      // Try to parse structured response { text, highlight }
      let text = rawText
      let hl: string | null = null
      try {
        const trimmed = rawText.trim()
        if (trimmed.startsWith('{')) {
          const parsed = JSON.parse(trimmed)
          if (parsed && typeof parsed.text === 'string') {
            text = parsed.text
            hl = typeof parsed.highlight === 'string' ? parsed.highlight : null
          }
        }
      } catch { /* plain text response */ }

      setHighlight(hl)
      setMessages(prev =>
        prev.map(m => m.id === placeholderId ? { ...m, content: text, timestamp: new Date() } : m)
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
  }, [messages, restauranteId])

  return {
    messages, loading, error, isOpen, highlight,
    open, close, toggle, sendMessage, clearMessages, clearHighlight, cancelRequest,
  }
}
