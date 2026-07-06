'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useKitchenCoach } from '@/lib/hooks/useKitchenCoach'
import { useMerma } from '@/lib/hooks/useMerma'
import MermaBottomSheet from '@/components/merma/MermaBottomSheet'
import { type TourStep, TOURS } from '@/lib/coach/tours'
import { useSheetCount } from '@/lib/ui/chrome'

interface KitchenCoachFABProps {
  stockCritico?: Array<{ nombre: string; cantidad: number; minimo: number }>
  tareasPendientes?: Array<{ titulo: string; prioridad: string; plaza?: string }>
}

function getActiveTour(): TourStep[] {
  try {
    const ctx = JSON.parse(localStorage.getItem('kc_screen_context') ?? 'null')
    if (ctx?.screen && TOURS[ctx.screen]) return TOURS[ctx.screen]
  } catch { /* ignore */ }
  return TOURS.operaciones ?? []
}

// ── Chat suggestions ──────────────────────────────────────────
interface Suggestion { label: string; action: 'tour' | 'send' }

const SUGGESTIONS_BY_SCREEN: Record<string, Suggestion[]> = {
  dashboard: [
    { label: 'Conocé KitchenOS', action: 'tour' },
    { label: '¿Por dónde empiezo a cargar mi restaurante?', action: 'send' },
    { label: '¿Qué tengo que hacer primero hoy?', action: 'send' },
    { label: '¿Cómo va el mise en place?', action: 'send' },
  ],
  tareas: [
    { label: 'Ver recorrido de Producción', action: 'tour' },
    { label: '¿Qué tareas son críticas para el servicio?', action: 'send' },
    { label: '¿Cómo organizo el turno de hoy?', action: 'send' },
  ],
  pase: [
    { label: 'Ver recorrido del Pase', action: 'tour' },
    { label: '¿Cómo mando un 86?', action: 'send' },
    { label: '¿Cómo filtro los mensajes por plaza?', action: 'send' },
  ],
  pedidos: [
    { label: 'Ver recorrido de Pedidos', action: 'tour' },
    { label: '¿Qué pedidos están esperando recepción?', action: 'send' },
    { label: '¿Cómo envío un pedido por WhatsApp?', action: 'send' },
  ],
  ventas: [
    { label: 'Ver recorrido de Ventas', action: 'tour' },
    { label: '¿Cuál es mi promedio de ventas diario?', action: 'send' },
    { label: '¿Cuál es el plato más vendido?', action: 'send' },
  ],
  proveedores: [
    { label: 'Ver recorrido de Proveedores', action: 'tour' },
    { label: '¿Cómo cargo una factura de un proveedor?', action: 'send' },
    { label: '¿Qué proveedores tienen días de entrega configurados?', action: 'send' },
  ],
  turnos: [
    { label: 'Ver recorrido de Equipo', action: 'tour' },
    { label: '¿Cómo cargo el turno de un miembro?', action: 'send' },
    { label: '¿Cómo invito a alguien al equipo?', action: 'send' },
  ],
  calendario: [
    { label: 'Ver recorrido del Calendario', action: 'tour' },
    { label: '¿Qué eventos hay esta semana?', action: 'send' },
    { label: '¿Cómo cargo un evento especial?', action: 'send' },
  ],
  carta: [
    { label: 'Ver recorrido de Carta', action: 'tour' },
    { label: '¿Qué platos tienen el peor food cost?', action: 'send' },
    { label: '¿Cuáles me falta vincular a recetas?', action: 'send' },
    { label: 'Ayudame a importar la carta', action: 'send' },
  ],
  operaciones: [
    { label: 'Ver recorrido de OPS', action: 'tour' },
    { label: '¿Cómo funciona la apertura y el cierre del mise?', action: 'send' },
    { label: '¿Cómo se vinculan las rutinas con Limpieza?', action: 'send' },
    { label: '¿Qué me conviene producir hoy?', action: 'send' },
  ],
  stock: [
    { label: 'Ver recorrido de Inventario', action: 'tour' },
    { label: '¿Qué productos están en crítico?', action: 'send' },
    { label: '¿Qué productos sin precio me bajan el food cost?', action: 'send' },
    { label: '¿Me conviene reconstruir el stock desde facturas?', action: 'send' },
  ],
  recetario: [
    { label: 'Ver recorrido del Recetario', action: 'tour' },
    { label: '¿Cuáles son mis recetas con mayor food cost?', action: 'send' },
    { label: '¿Qué recetas me falta vincular al stock?', action: 'send' },
    { label: '¿Cómo bajo el food cost sin bajar la calidad?', action: 'send' },
  ],
  facturas: [
    { label: 'Ver recorrido de Facturas', action: 'tour' },
    { label: '¿Qué proveedores me subieron más los precios?', action: 'send' },
    { label: '¿Tengo facturas pendientes de pago?', action: 'send' },
    { label: '¿Cuánto gasté este mes vs el anterior?', action: 'send' },
  ],
  reportes: [
    { label: 'Ver recorrido de Reportes', action: 'tour' },
    { label: 'Explicame el food cost del período', action: 'send' },
    { label: '¿Qué número debería mejorar primero?', action: 'send' },
    { label: '¿Cuánto subió la inflación de mis compras?', action: 'send' },
  ],
  merma: [
    { label: 'Ver recorrido de Merma', action: 'tour' },
    { label: '¿Cuál es mi principal causa de merma?', action: 'send' },
    { label: '¿Cuánto me cuesta la merma este mes?', action: 'send' },
    { label: '¿Cómo puedo reducir los desperdicios?', action: 'send' },
  ],
  haccp: [
    { label: 'Ver recorrido de HACCP', action: 'tour' },
    { label: '¿Qué productos están por vencer?', action: 'send' },
    { label: '¿Algún equipo está fuera de temperatura?', action: 'send' },
    { label: 'Ayudame a preparar una auditoría de bromatología', action: 'send' },
  ],
}

const DEFAULT_SUGGESTIONS: Suggestion[] = [
  { label: 'Ver recorrido de OPS', action: 'tour' },
  { label: 'Analizá mi food cost', action: 'send' },
  { label: '¿Qué me conviene producir hoy?', action: 'send' },
  { label: '¿Cómo optimizo el mise en place?', action: 'send' },
]

function getScreenSuggestions(): Suggestion[] {
  try {
    const ctx = JSON.parse(localStorage.getItem('kc_screen_context') ?? 'null')
    if (ctx?.screen && SUGGESTIONS_BY_SCREEN[ctx.screen]) return SUGGESTIONS_BY_SCREEN[ctx.screen]
  } catch { /* ignore */ }
  return DEFAULT_SUGGESTIONS
}

function formatTime(d: Date) {
  return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

// ── Tour Overlay ───────────────────────────────────────────────
function TourOverlay({
  step,
  steps,
  onNext,
  onSkip,
}: {
  step: number
  steps: TourStep[]
  onNext: () => void
  onSkip: () => void
}) {
  const stepData = steps[step]
  const [rect, setRect] = useState<DOMRect | null>(null)
  const onNextRef = useRef(onNext)
  useEffect(() => { onNextRef.current = onNext })

  useEffect(() => {
    if (!stepData?.targetId) { setRect(null); return }

    if (stepData.requireTab) {
      window.dispatchEvent(new CustomEvent('kc-set-tab', {
        detail: { tab: stepData.requireTab },
      }))
    }

    setRect(null)
    let cancelled = false
    let attempts = 0
    const MAX = 7

    function tryRect() {
      if (cancelled) return
      const el = document.querySelector(`[data-coach-target="${stepData.targetId}"]`)
      if (el) {
        const r = el.getBoundingClientRect()
        if (r.width > 0 && r.height > 0) { setRect(r); return }
      }
      attempts++
      if (attempts < MAX) {
        setTimeout(tryRect, 120)
      } else {
        onNextRef.current() // element not visible, auto-skip
      }
    }

    const delay = stepData.requireTab ? 220 : 80
    const timer = setTimeout(tryRect, delay)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [step, stepData?.targetId, stepData?.requireTab])

  if (!stepData) return null
  const isCenterCard = !stepData.targetId        // intro o cierre: tarjeta centrada
  const isLastStep = step === steps.length - 1   // la última siempre es el cierre

  // ── Tarjeta centrada (fondo translúcido, sin chat detrás) ──
  if (isCenterCard) {
    const advance = isLastStep ? onSkip : onNext
    return (
      <div
        onClick={advance}
        style={{
          position: 'fixed', inset: 0, zIndex: 1200,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '24px',
          background: 'rgba(0,0,0,0.65)',
        }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{
            background: 'var(--surface)', borderRadius: 22,
            padding: '32px 24px 24px',
            textAlign: 'center',
            maxWidth: 320, width: '100%',
            boxShadow: '0 24px 60px rgba(0,0,0,.45)',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 52, color: '#f97316' }}>
            {isLastStep ? 'celebration' : 'waving_hand'}
          </span>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-1)', margin: '12px 0 10px' }}>
            {stepData.title}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.7, marginBottom: 22 }}>
            {stepData.description}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {!isLastStep && (
              <button
                onClick={onSkip}
                style={{
                  flexShrink: 0, padding: '13px 16px', borderRadius: 12,
                  background: 'var(--bg)', border: '1px solid var(--border)',
                  fontSize: 14, fontWeight: 700, color: 'var(--text-3)',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                Saltar
              </button>
            )}
            <button
              onClick={advance}
              style={{
                flex: 1, padding: '13px', borderRadius: 12,
                background: '#f97316', border: 'none',
                fontSize: 14, fontWeight: 700, color: '#fff',
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {isLastStep ? 'Entendido' : 'Siguiente →'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!rect) return null

  const PAD = 12
  const x = rect.left - PAD
  const y = rect.top - PAD
  const w = rect.width + PAD * 2
  const h = rect.height + PAD * 2
  const R = 16

  const vw = typeof window !== 'undefined' ? window.innerWidth : 375
  const vh = typeof window !== 'undefined' ? window.innerHeight : 812

  // Card position: below element if space, above otherwise
  const CARD_H_EST = 200
  const spaceBelow = vh - (y + h) - 16
  const cardAbove = spaceBelow < CARD_H_EST
  const cardTop = cardAbove ? Math.max(8, y - 16 - CARD_H_EST) : y + h + 12
  const cardLeft = Math.max(16, Math.min(x, vw - 320 - 16))
  const cardWidth = Math.min(300, vw - 32)

  // Arrow offset toward element center
  const arrowOffset = Math.min(cardWidth - 28, Math.max(12, x + w / 2 - cardLeft - 8))

  // Progress: count only content steps (exclude final)
  const totalContentSteps = steps.filter(s => s.targetId !== null).length
  const contentStep = steps.slice(0, step).filter(s => s.targetId !== null).length + 1
  const isLast = step === steps.length - 2

  return (
    <div
      onClick={onNext}
      style={{ position: 'fixed', inset: 0, zIndex: 1200, cursor: 'pointer' }}
    >
      {/* SVG overlay with cutout */}
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, display: 'block' }}>
        <defs>
          <mask id="kc-tour-mask">
            <rect width="100%" height="100%" fill="white" />
            <rect x={x} y={y} width={w} height={h} rx={R} fill="black" />
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(0,0,0,0.72)" mask="url(#kc-tour-mask)" />
        <rect
          x={x} y={y} width={w} height={h} rx={R}
          fill="none" stroke="#f97316" strokeWidth="2.5"
          style={{ filter: 'drop-shadow(0 0 12px rgba(249,115,22,0.85))' }}
        />
      </svg>

      {/* Explanation card */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: cardTop,
          left: cardLeft,
          width: cardWidth,
          background: 'var(--surface)',
          borderRadius: 16,
          padding: '14px 16px 13px',
          boxShadow: '0 8px 36px rgba(0,0,0,.32)',
          border: '1px solid var(--border)',
        }}
      >
        {/* Arrow */}
        {!cardAbove && (
          <div style={{
            position: 'absolute', top: -8, left: arrowOffset,
            width: 0, height: 0,
            borderLeft: '8px solid transparent',
            borderRight: '8px solid transparent',
            borderBottom: '8px solid var(--surface)',
          }} />
        )}
        {cardAbove && (
          <div style={{
            position: 'absolute', bottom: -8, left: arrowOffset,
            width: 0, height: 0,
            borderLeft: '8px solid transparent',
            borderRight: '8px solid transparent',
            borderTop: '8px solid var(--surface)',
          }} />
        )}

        {/* Progress bar */}
        <div style={{ height: 3, borderRadius: 99, background: 'var(--border)', marginBottom: 10, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 99, background: '#f97316',
            width: `${(contentStep / totalContentSteps) * 100}%`,
            transition: 'width .35s ease',
          }} />
        </div>

        {/* Step counter */}
        <div style={{ fontSize: 10, fontWeight: 700, color: '#f97316', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 5 }}>
          {contentStep} de {totalContentSteps}
        </div>

        {/* Title */}
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-1)', marginBottom: 7, lineHeight: 1.2 }}>
          {stepData.title}
        </div>

        {/* Description */}
        <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.65, marginBottom: 13 }}>
          {stepData.description}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onSkip}
            style={{
              padding: '7px 14px', borderRadius: 8,
              border: '1px solid var(--border)', background: 'var(--bg)',
              fontSize: 12, fontWeight: 600, color: 'var(--text-3)',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Saltar
          </button>
          <button
            onClick={onNext}
            style={{
              padding: '7px 18px', borderRadius: 8,
              border: 'none', background: '#f97316',
              fontSize: 12, fontWeight: 700, color: '#fff',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {isLast ? 'Finalizar' : 'Siguiente →'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Coach Overlay — for AI-driven highlights in chat ──────────
function CoachOverlay({
  targetId,
  text,
  onDismiss,
}: {
  targetId: string | null
  text: string | null
  onDismiss: () => void
}) {
  const [rect, setRect] = useState<DOMRect | null>(null)

  useEffect(() => {
    if (!targetId) { setRect(null); return }
    const el = document.querySelector(`[data-coach-target="${targetId}"]`)
    if (!el) { setRect(null); return }
    const t = setTimeout(() => setRect(el.getBoundingClientRect()), 80)
    return () => clearTimeout(t)
  }, [targetId])

  if (!rect || !targetId) return null

  const PAD = 12
  const x = rect.left - PAD
  const y = rect.top - PAD
  const w = rect.width + PAD * 2
  const h = rect.height + PAD * 2
  const R = 16
  const vw = typeof window !== 'undefined' ? window.innerWidth : 375
  const vh = typeof window !== 'undefined' ? window.innerHeight : 812
  const spaceBelow = vh - (y + h)
  const tooltipAbove = spaceBelow < 120
  const tooltipTop = tooltipAbove ? Math.max(8, y - 16 - 80) : y + h + 12
  const tooltipLeft = Math.max(16, Math.min(x, vw - 300 - 16))
  const arrowOffset = Math.min(270, Math.max(12, x + w / 2 - tooltipLeft - 8))

  return (
    <div onClick={onDismiss} style={{ position: 'fixed', inset: 0, zIndex: 1200, cursor: 'pointer' }}>
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, display: 'block' }}>
        <defs>
          <mask id="kc-spotlight-mask">
            <rect width="100%" height="100%" fill="white" />
            <rect x={x} y={y} width={w} height={h} rx={R} fill="black" />
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(0,0,0,0.72)" mask="url(#kc-spotlight-mask)" />
        <rect x={x} y={y} width={w} height={h} rx={R}
          fill="none" stroke="#f97316" strokeWidth="2.5"
          style={{ filter: 'drop-shadow(0 0 10px rgba(249,115,22,0.8))' }}
        />
      </svg>
      {text && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'fixed', top: tooltipTop, left: tooltipLeft,
            maxWidth: Math.min(300, vw - 32),
            background: '#f97316', borderRadius: 14,
            padding: '11px 15px 9px',
            boxShadow: '0 6px 24px rgba(249,115,22,.45)',
            pointerEvents: 'none',
          }}
        >
          {!tooltipAbove && (
            <div style={{ position: 'absolute', top: -7, left: arrowOffset, width: 0, height: 0, borderLeft: '7px solid transparent', borderRight: '7px solid transparent', borderBottom: '7px solid #f97316' }} />
          )}
          {tooltipAbove && (
            <div style={{ position: 'absolute', bottom: -7, left: arrowOffset, width: 0, height: 0, borderLeft: '7px solid transparent', borderRight: '7px solid transparent', borderTop: '7px solid #f97316' }} />
          )}
          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', lineHeight: 1.45 }}>{text}</div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,.75)', marginTop: 5, fontWeight: 500 }}>Tocá para continuar</div>
        </div>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────
export default function KitchenCoachFAB({ stockCritico, tareasPendientes }: KitchenCoachFABProps) {
  const {
    messages, loading, error, isOpen, highlight, overlayText,
    toggle, open, close, sendMessage, clearMessages, clearHighlight, clearOverlayText,
  } = useKitchenCoach()
  const sheetCount = useSheetCount()

  const [input, setInput] = useState('')
  const [tourStep, setTourStep] = useState(-1)
  const [activeTourSteps, setActiveTourSteps] = useState<TourStep[]>([])
  const [mermaOpen, setMermaOpen] = useState(false)
  const { registrarMerma } = useMerma()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const hasUnread = messages.length > 0 && !isOpen

  // ── FAB drag state ──────────────────────────────────────────
  const [fabPos, setFabPos] = useState<{ bottom: number; right: number }>(() => {
    if (typeof window === 'undefined') return { bottom: 144, right: 16 }
    try {
      const s = JSON.parse(localStorage.getItem('kc_fab_pos') ?? 'null')
      if (s && typeof s.bottom === 'number' && typeof s.right === 'number') return s
    } catch { /* ignore */ }
    return { bottom: 144, right: 16 }
  })
  const fabDragRef = useRef<{
    startX: number; startY: number
    startBottom: number; startRight: number
    moved: boolean; lastBottom: number; lastRight: number
  } | null>(null)

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // ── Tour: arranque ──────────────────────────────────────────
  const startTour = useCallback(() => {
    const steps = getActiveTour()
    if (!steps.length) return
    setActiveTourSteps(steps)
    close()                                  // cierra el chat para que no tape la explicación
    setTimeout(() => setTourStep(0), 280)
  }, [close])

  // ── Welcome (primer login / primera visita a OPS) → recorrido visual ──
  // Lanza el tour con overlay translúcido y botón "Siguiente". NO abre el
  // chat: el texto explicativo se ve sobre la pantalla, sin el panel encima.
  useEffect(() => {
    function handleWelcome() { setTimeout(() => startTour(), 500) }
    window.addEventListener('kc-welcome-ops', handleWelcome)
    window.addEventListener('kc-welcome-app', handleWelcome)
    return () => {
      window.removeEventListener('kc-welcome-ops', handleWelcome)
      window.removeEventListener('kc-welcome-app', handleWelcome)
    }
  }, [startTour])

  // ── Prefill: abre el chat con texto precargado en el input ──
  // Lo usa el onboarding (paso "Dictarle al Coach"): dispatch de
  //   window.dispatchEvent(new CustomEvent('kc-prefill', { detail: { text } }))
  // No envía el mensaje solo — deja el texto listo para que el usuario edite/mande.
  useEffect(() => {
    function handlePrefill(e: Event) {
      const detail = (e as CustomEvent).detail as { text?: string } | undefined
      if (!detail?.text) return
      open()
      setInput(detail.text)
      setTimeout(() => {
        const ta = textareaRef.current
        if (ta) {
          ta.focus()
          ta.style.height = 'auto'
          ta.style.height = Math.min(ta.scrollHeight, 96) + 'px'
        }
      }, 320)
    }
    window.addEventListener('kc-prefill', handlePrefill)
    return () => window.removeEventListener('kc-prefill', handlePrefill)
  }, [open])

  // ── Tour controls ──────────────────────────────────────────
  function handleTourNext() {
    const next = tourStep + 1
    if (next >= activeTourSteps.length) {
      setTourStep(-1)
    } else {
      setTourStep(next)
    }
  }

  function handleTourSkip() {
    setTourStep(-1)
  }

  // ── Input handlers ─────────────────────────────────────────
  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 96) + 'px'
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend() }
  }

  async function doSend(text?: string) {
    const msg = (text ?? input).trim()
    if (!msg || loading) return
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    await sendMessage(msg, { stockCritico, tareasPendientes })
  }

  // ── FAB drag (Pointer Events) ──────────────────────────────
  function onFabPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    fabDragRef.current = {
      startX: e.clientX, startY: e.clientY,
      startBottom: fabPos.bottom, startRight: fabPos.right,
      moved: false, lastBottom: fabPos.bottom, lastRight: fabPos.right,
    }
  }

  function onFabPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const dr = fabDragRef.current
    if (!dr || !(e.buttons & 1)) return
    const dx = e.clientX - dr.startX
    const dy = e.clientY - dr.startY
    if (!dr.moved && Math.hypot(dx, dy) < 8) return
    dr.moved = true
    const BOTTOM_NAV = 84
    const newBottom = Math.max(BOTTOM_NAV, Math.min(window.innerHeight - 58, dr.startBottom - dy))
    const newRight = Math.max(8, Math.min(window.innerWidth - 58, dr.startRight - dx))
    dr.lastBottom = newBottom; dr.lastRight = newRight
    setFabPos({ bottom: newBottom, right: newRight })
  }

  function onFabPointerUp() {
    const dr = fabDragRef.current
    fabDragRef.current = null
    if (dr?.moved) {
      localStorage.setItem('kc_fab_pos', JSON.stringify({ bottom: dr.lastBottom, right: dr.lastRight }))
    } else {
      toggle()
    }
  }

  const panelBottomDesktop = fabPos.bottom + 60
  const panelRightDesktop = Math.min(fabPos.right, Math.max(8, (typeof window !== 'undefined' ? window.innerWidth : 400) - 396))

  const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant' && m.content && m.options?.length)

  return (
    <>
      {/* Tour overlay (independent of chat) */}
      {tourStep >= 0 && tourStep < activeTourSteps.length && (
        <TourOverlay
          step={tourStep}
          steps={activeTourSteps}
          onNext={handleTourNext}
          onSkip={handleTourSkip}
        />
      )}

      {/* AI chat highlight overlay */}
      <CoachOverlay
        targetId={highlight}
        text={overlayText}
        onDismiss={() => { clearHighlight(); clearOverlayText() }}
      />

      {/* Mobile dim */}
      {isOpen && <div className="kc-overlay" onClick={close} />}

      {/* Chat panel */}
      <div
        className={`kc-panel${isOpen ? ' kc-panel-open' : ''}`}
        style={{ '--kc-panel-bottom': `${panelBottomDesktop}px`, '--kc-panel-right': `${panelRightDesktop}px` } as React.CSSProperties}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 14px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#f97316', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#fff' }}>restaurant</span>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>Kitchen Coach</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Asistente IA de cocina</div>
          </div>
          {messages.length > 0 && (
            <button onClick={clearMessages} title="Limpiar" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--text-3)' }}>delete_sweep</span>
            </button>
          )}
          <button onClick={close} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--text-3)' }}>close</span>
          </button>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {messages.length === 0 && (
            <>
              <p style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', margin: '8px 0 12px' }}>
                Hola! Soy tu Kitchen Coach. ¿En qué te ayudo hoy?
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {getScreenSuggestions().map(s => (
                  <button
                    key={s.label}
                    onClick={() => s.action === 'tour' ? startTour() : doSend(s.label)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      background: s.action === 'tour' ? 'rgba(249,115,22,.08)' : 'var(--bg)',
                      border: `1px solid ${s.action === 'tour' ? 'rgba(249,115,22,.35)' : 'var(--border)'}`,
                      borderRadius: 10, padding: '9px 12px',
                      textAlign: 'left', fontSize: 12,
                      color: s.action === 'tour' ? '#f97316' : 'var(--text-2)',
                      cursor: 'pointer', fontFamily: 'inherit', fontWeight: s.action === 'tour' ? 700 : 400,
                    }}
                  >
                    {s.action === 'tour' && (
                      <span className="material-symbols-outlined" style={{ fontSize: 15, flexShrink: 0 }}>tour</span>
                    )}
                    {s.label}
                  </button>
                ))}
              </div>
            </>
          )}

          {messages.map(m => {
            const isLastAssistant = m.role === 'assistant' && m === lastAssistant
            return (
              <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start', gap: 2 }}>
                {m.role === 'assistant' && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
                      <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#f97316', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#fff' }}>restaurant</span>
                      </div>
                      <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '4px 12px 12px 12px', padding: '8px 12px', maxWidth: '85%', fontSize: 13, color: 'var(--text-1)', lineHeight: 1.55, whiteSpace: 'pre-wrap', userSelect: 'text', WebkitUserSelect: 'text' }}>
                        {m.content === '' ? <div className="kc-typing"><span /><span /><span /></div> : m.content}
                      </div>
                    </div>
                    {isLastAssistant && m.options && !loading && (
                      <div style={{ marginLeft: 30, marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {m.options.map((opt, oi) => (
                          <button key={oi} onClick={() => doSend(opt)} style={{ background: 'rgba(249,115,22,.1)', border: '1px solid rgba(249,115,22,.35)', borderRadius: 20, padding: '5px 11px', fontSize: 12, fontWeight: 600, color: '#f97316', cursor: 'pointer', fontFamily: 'inherit' }}>
                            {opt}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
                {m.role === 'user' && (
                  <div style={{ background: '#f97316', borderRadius: '12px 4px 12px 12px', padding: '8px 12px', maxWidth: '85%', fontSize: 13, color: '#fff', lineHeight: 1.5, userSelect: 'text', WebkitUserSelect: 'text' }}>
                    {m.content}
                  </div>
                )}
                <div style={{ fontSize: 10, color: 'var(--text-3)', paddingLeft: m.role === 'assistant' ? 30 : 0 }}>
                  {formatTime(m.timestamp)}
                </div>
              </div>
            )
          })}

          {error && <div style={{ fontSize: 12, color: '#ef4444', textAlign: 'center', padding: '4px 0' }}>{error}</div>}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick action — merma */}
        <div style={{ padding: '6px 12px 2px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <button
            onClick={() => setMermaOpen(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'rgba(67,97,160,0.08)', border: '1px solid rgba(67,97,160,0.25)',
              borderRadius: 20, padding: '5px 12px',
              fontSize: 12, fontWeight: 600, color: 'var(--accent)',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>delete_sweep</span>
            Registrar merma
          </button>
        </div>

        {/* Input */}
        <div style={{ display: 'flex', gap: 8, padding: '10px 12px', flexShrink: 0 }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Preguntale algo a tu Coach..."
            rows={1}
            style={{ flex: 1, resize: 'none', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', color: 'var(--text-1)', outline: 'none', lineHeight: 1.4, maxHeight: 96, overflowY: 'auto' }}
          />
          <button
            onClick={() => doSend()}
            disabled={!input.trim() || loading}
            style={{ background: input.trim() && !loading ? '#f97316' : 'var(--bg)', border: `1px solid ${input.trim() && !loading ? '#f97316' : 'var(--border)'}`, borderRadius: 10, width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: input.trim() && !loading ? 'pointer' : 'default', flexShrink: 0, alignSelf: 'flex-end', transition: 'all .15s' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: input.trim() && !loading ? '#fff' : 'var(--text-3)' }}>send</span>
          </button>
        </div>
      </div>

      <MermaBottomSheet
        open={mermaOpen}
        onClose={() => setMermaOpen(false)}
        onRegistrar={async (data) => { await registrarMerma(data); setMermaOpen(false) }}
      />

      {/* FAB — se oculta cuando hay sheets/modales abiertos (useSheetOpen en D1) */}
      <button
        className="kc-fab"
        title="Kitchen Coach"
        aria-label="Kitchen Coach"
        style={{ bottom: fabPos.bottom, right: fabPos.right, touchAction: 'none', opacity: sheetCount > 0 ? 0 : 1, pointerEvents: sheetCount > 0 ? 'none' : 'auto', transition: 'opacity .2s' }}
        onPointerDown={onFabPointerDown}
        onPointerMove={onFabPointerMove}
        onPointerUp={onFabPointerUp}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 22, color: '#fff', transition: 'transform .2s', transform: isOpen ? 'rotate(90deg)' : 'none', pointerEvents: 'none' }}>
          {isOpen ? 'close' : 'chef_hat'}
        </span>
        {hasUnread && <div className="kc-badge" />}
      </button>

      <style>{`
        .kc-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.4); z-index: 999; display: none; }
        .kc-fab {
          position: fixed; width: 3.25rem; height: 3.25rem; border-radius: 50%;
          background: #f97316; border: none; cursor: grab;
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 4px 16px rgba(249,115,22,.4); z-index: 1001;
          user-select: none; -webkit-user-select: none;
        }
        .kc-fab:active { cursor: grabbing; }
        .kc-badge { position: absolute; top: 6px; right: 6px; width: 10px; height: 10px; border-radius: 50%; background: #ef4444; border: 2px solid #f97316; }
        .kc-panel {
          position: fixed; bottom: var(--kc-panel-bottom, 5.5rem); right: var(--kc-panel-right, 1rem);
          width: 380px; height: 520px; background: var(--surface); border: 1px solid var(--border);
          border-radius: 16px; display: flex; flex-direction: column; z-index: 1000;
          box-shadow: 0 8px 40px rgba(0,0,0,.25); overflow: hidden;
          transform: translateY(20px); opacity: 0; pointer-events: none;
          transition: transform .25s ease, opacity .25s ease;
        }
        .kc-panel-open { transform: translateY(0); opacity: 1; pointer-events: all; }
        .kc-typing { display: flex; gap: 4px; align-items: center; padding: 2px 0; }
        .kc-typing span { width: 6px; height: 6px; border-radius: 50%; background: var(--text-3); animation: kc-pulse 1.2s ease-in-out infinite; }
        .kc-typing span:nth-child(2) { animation-delay: .2s; }
        .kc-typing span:nth-child(3) { animation-delay: .4s; }
        @keyframes kc-pulse { 0%, 80%, 100% { transform: scale(.7); opacity: .5; } 40% { transform: scale(1); opacity: 1; } }
        @media (max-width: 479px) {
          .kc-overlay { display: block; }
          .kc-panel { width: 100vw; height: 85vh; bottom: 0 !important; right: 0 !important; border-radius: 16px 16px 0 0; transform: translateY(100%); }
          .kc-panel-open { transform: translateY(0); }
        }
      `}</style>
    </>
  )
}
