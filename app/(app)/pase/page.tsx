'use client'

import PageTransition from '@/components/PageTransition'
import { useState, useEffect, useRef, useMemo } from 'react'
import { usePase } from '@/lib/hooks/usePase'
import { useTareas } from '@/lib/hooks/useTareas'
import { useEquipo } from '@/lib/hooks/useEquipo'
import { usePermisos } from '@/lib/hooks/usePermisos'
import { createClient } from '@/lib/supabase/client'
import type { PaseMensaje, PrioridadPase, Plaza } from '@/types'

// ── Helpers ──────────────────────────────────────────────────
function hoy() { return new Date().toISOString().slice(0, 10) }

function horaCorta(iso: string) {
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

function iniciales(nombre: string) {
  return nombre.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

const COLORES_AVATAR = ['#4361a0', '#0ea5e9', '#f97316', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#d97706']

function colorAvatar(nombre: string) {
  let h = 0
  for (let i = 0; i < nombre.length; i++) h = nombre.charCodeAt(i) + ((h << 5) - h)
  return COLORES_AVATAR[Math.abs(h) % COLORES_AVATAR.length]
}

function fechaLabel(dateStr: string) {
  const hoyStr = hoy()
  if (dateStr === hoyStr) return 'HOY'
  const ayer = new Date()
  ayer.setDate(ayer.getDate() - 1)
  if (dateStr === ayer.toISOString().slice(0, 10)) return 'AYER'
  return new Date(dateStr + 'T12:00').toLocaleDateString('es-AR', {
    weekday: 'short', day: 'numeric', month: 'short',
  }).toUpperCase()
}

const PLAZAS: { id: Plaza | 'todas'; label: string }[] = [
  { id: 'todas', label: 'Todos' },
  { id: 'parrilla', label: '#Parrilla' },
  { id: 'frios', label: '#Fríos' },
  { id: 'calientes', label: '#Calientes' },
  { id: 'pasteleria', label: '#Pastelería' },
  { id: 'panaderia', label: '#Panadería' },
  { id: 'pase', label: '#Pase' },
]

const PLAZA_LABELS: Record<string, string> = {
  parrilla: '#Parrilla', frios: '#Fríos', calientes: '#Calientes',
  pase: '#Pase', pasteleria: '#Pastelería', panaderia: '#Panadería',
}


const PLAZA_MENTION_LIST: { id: Plaza; label: string }[] = [
  { id: 'parrilla', label: 'Parrilla' },
  { id: 'frios', label: 'Fríos' },
  { id: 'calientes', label: 'Calientes' },
  { id: 'pase', label: 'Pase' },
  { id: 'pasteleria', label: 'Pastelería' },
  { id: 'panaderia', label: 'Panadería' },
]

const MENSAJES_RAPIDOS = [
  { texto: 'Falta stock', icon: 'inventory_2' },
  { texto: 'Producción pendiente', icon: 'pending_actions' },
  { texto: 'Equipo roto', icon: 'build' },
  { texto: 'Reserva especial', icon: 'bookmark' },
  { texto: 'Limpieza pendiente', icon: 'cleaning_services' },
  { texto: 'Todo OK', icon: 'check_circle' },
]

// ── Render texto con @menciones y #plazas ────────────────────
function RenderTexto({ texto }: { texto: string }) {
  const parts = texto.split(/(@\w[\w\s]*\.?|#\w+)/g)
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('@')) {
          return <span key={i} className="font-bold" style={{ color: 'var(--navy)' }}>{part}</span>
        }
        if (part.startsWith('#')) {
          return (
            <span key={i} className="inline-flex items-center px-[5px] py-[1px] rounded-[4px] text-[11px] font-bold mx-[2px]"
              style={{ background: 'rgba(30,58,110,0.1)', color: 'var(--navy)' }}>
              {part}
            </span>
          )
        }
        return <span key={i}>{part}</span>
      })}
    </>
  )
}

// ── Burbuja de mensaje ───────────────────────────────────────
function MensajeBurbuja({ msg, showHeader = true, onCrearTarea }: { msg: PaseMensaje; showHeader?: boolean; onCrearTarea?: (texto: string) => void }) {
  const esUrgente = msg.prioridad === 'urgente'
  const esImportante = msg.prioridad === 'importante'
  const es86 = msg.tipo === 'alerta' && msg.texto.includes('86')

  return (
    <div className="flex gap-[10px] items-start" style={{ padding: '0 16px', marginBottom: showHeader ? 10 : 4, paddingLeft: showHeader ? 16 : 60 }}>
      {/* Avatar — solo si showHeader */}
      {showHeader && (
        <div
          className="flex-shrink-0 w-[34px] h-[34px] rounded-full flex items-center justify-center text-white text-[12px] font-bold"
          style={{ background: es86 ? '#ef4444' : colorAvatar(msg.usuario_nombre ?? '') }}
        >
          {es86 ? '86' : iniciales(msg.usuario_nombre ?? '')}
        </div>
      )}

      {/* Contenido */}
      <div className="flex-1 min-w-0">
        {showHeader && (
          <div className="flex items-baseline gap-2 mb-[2px]">
            <span className="text-[12px] font-bold" style={{ color: 'var(--text)' }}>
              {msg.usuario_nombre}
            </span>
            <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>
              {horaCorta(msg.created_at)}
            </span>
            {esUrgente && !es86 && (
              <span className="text-[9px] font-bold px-[6px] py-[1px] rounded-[4px] text-white"
                style={{ background: '#ef4444' }}>URGENTE</span>
            )}
            {esImportante && (
              <span className="text-[9px] font-bold px-[6px] py-[1px] rounded-[4px] text-white"
                style={{ background: '#f59e0b' }}>IMPORTANTE</span>
            )}
          </div>
        )}
        <div
          className="rounded-[12px] rounded-tl-[4px] p-[10px_12px] leading-[1.45]"
          style={{
            background: es86 ? '#fef2f2' : esUrgente ? '#fef2f2' : esImportante ? '#fffbeb' : 'var(--surface)',
            border: `1px solid ${es86 ? '#fca5a5' : esUrgente ? '#fecaca' : esImportante ? '#fde68a' : 'var(--border)'}`,
            borderLeft: es86
              ? '4px solid #ef4444'
              : esUrgente ? '3px solid #ef4444'
              : esImportante ? '3px solid #f59e0b'
              : '1px solid var(--border)',
            color: 'var(--text)',
            fontSize: es86 ? 15 : 13,
            fontWeight: es86 ? 700 : 400,
          }}
        >
          <RenderTexto texto={msg.texto} />
          {msg.plaza && (
            <span className="inline-flex items-center px-[5px] py-[1px] rounded-[4px] text-[10px] font-bold ml-2"
              style={{ background: 'rgba(30,58,110,0.1)', color: 'var(--navy)' }}>
              {PLAZA_LABELS[msg.plaza] || `#${msg.plaza}`}
            </span>
          )}
        </div>
        {/* Crear tarea desde mensaje */}
        {onCrearTarea && (
          <button
            onClick={() => onCrearTarea(msg.texto)}
            className="flex items-center gap-1 mt-1"
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 13, color: 'var(--text-3)' }}>add_task</span>
            <span style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 600 }}>Crear tarea</span>
          </button>
        )}
      </div>
    </div>
  )
}

// ── 86 Sheet ─────────────────────────────────────────────────
function Sheet86({ onSelect, onClose }: { onSelect: (nombre: string, id: string) => void; onClose: () => void }) {
  const [platos, setPlatos] = useState<{ id: string; nombre: string; categoria: string }[]>([])
  const [busqueda, setBusqueda] = useState('')
  const supabase = createClient()

  useEffect(() => {
    supabase.from('recetas').select('id, nombre, categoria')
      .eq('restaurante_id', '00000000-0000-0000-0000-000000000001')
      .eq('activa', true)
      .order('nombre')
      .then(({ data }) => setPlatos((data ?? []) as { id: string; nombre: string; categoria: string }[]))
  }, [])

  const filtrados = platos.filter(p =>
    p.nombre.toLowerCase().includes(busqueda.toLowerCase())
  )

  return (
    <>
      <div className="fixed inset-0 z-[199]" style={{ background: 'rgba(0,0,0,.4)' }} onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-[200] rounded-t-[16px] max-h-[70vh] flex flex-col"
        style={{ background: 'var(--surface)', paddingBottom: 'max(env(safe-area-inset-bottom, 16px), 16px)' }}>
        <div className="p-4 pb-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[16px] font-bold m-0" style={{ color: 'var(--text)' }}>
              86 — Seleccionar plato
            </h3>
            <button onClick={onClose} className="border-none bg-transparent cursor-pointer">
              <span className="material-symbols-outlined text-[22px]" style={{ color: 'var(--text-3)' }}>close</span>
            </button>
          </div>
          <input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar plato..."
            className="w-full rounded-[10px] px-3 py-[10px] text-[13px] border-none outline-none"
            style={{ background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit' }}
            autoFocus
          />
        </div>
        <div className="flex-1 overflow-y-auto px-4">
          {filtrados.length === 0 ? (
            <p className="text-[13px] py-4 text-center" style={{ color: 'var(--text-3)' }}>
              {platos.length === 0 ? 'No hay platos cargados en recetas' : 'Sin resultados'}
            </p>
          ) : (
            filtrados.map(p => (
              <button
                key={p.id}
                onClick={() => onSelect(p.nombre, p.id)}
                className="flex items-center gap-3 w-full text-left px-3 py-[10px] rounded-[10px] border-none cursor-pointer mb-1"
                style={{ background: 'transparent', color: 'var(--text)' }}
              >
                <span className="material-symbols-outlined text-[20px]" style={{ color: '#ef4444' }}>
                  block
                </span>
                <div>
                  <div className="text-[13px] font-semibold">{p.nombre}</div>
                  <div className="text-[11px]" style={{ color: 'var(--text-3)' }}>{p.categoria}</div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </>
  )
}

// ── Mention dropdown ─────────────────────────────────────────
function MentionDropdown({ type, filter, onSelect, position, usuarios }: {
  type: '@' | '#'
  filter: string
  onSelect: (value: string) => void
  position: { bottom: number; left: number }
  usuarios: { id: string; nombre: string }[]
}) {
  const items = type === '@'
    ? usuarios
        .filter(u => u.nombre.toLowerCase().includes(filter.toLowerCase()))
        .map(u => ({ key: u.id, label: u.nombre, icon: 'person' }))
    : PLAZA_MENTION_LIST
        .filter(p => p.label.toLowerCase().includes(filter.toLowerCase()))
        .map(p => ({ key: p.id, label: p.label, icon: 'tag' }))

  if (items.length === 0) return null

  return (
    <div
      className="absolute rounded-[10px] overflow-hidden z-[210] max-h-[200px] overflow-y-auto"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        boxShadow: '0 8px 24px rgba(0,0,0,.15)',
        bottom: position.bottom,
        left: position.left,
        right: 16,
      }}
    >
      {items.map(item => (
        <button
          key={item.key}
          className="flex items-center gap-2 w-full text-left px-3 py-[9px] border-none cursor-pointer text-[13px]"
          style={{ background: 'transparent', color: 'var(--text)', fontFamily: 'inherit' }}
          onMouseDown={(e) => { e.preventDefault(); onSelect(item.label) }}
        >
          <span className="material-symbols-outlined text-[16px]" style={{ color: 'var(--navy)' }}>
            {item.icon}
          </span>
          <span className="font-medium">{type === '@' ? `@${item.label}` : `#${item.label}`}</span>
        </button>
      ))}
    </div>
  )
}

// ── Componente principal ─────────────────────────────────────
export default function PasePage() {
  const { mensajes, loading, fetchMensajes, enviarMensaje, marcarLeidos } = usePase()
  const { agregarTarea } = useTareas()
  const { miembros } = useEquipo()
  const { perfilRestaurante } = usePermisos()
  const esEmprendimiento = perfilRestaurante === 'emprendimiento'
  const usuariosMencion = useMemo(() => [
    ...miembros.map(m => ({ id: m.id, nombre: `${m.nombre} ${m.apellido?.[0] ?? ''}.`.trimEnd().replace(/\.$/, '.') })),
  ], [miembros])
  const [texto, setTexto] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [prioridad, setPrioridad] = useState<PrioridadPase>('normal')
  const [filtroPlaza, setFiltroPlaza] = useState<Plaza | 'todas'>('todas')
  const [enviando, setEnviando] = useState(false)
  const [show86, setShow86] = useState(false)
  const [mention, setMention] = useState<{ type: '@' | '#'; filter: string; startIdx: number } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    fetchMensajes()
    marcarLeidos()
  }, [fetchMensajes, marcarLeidos])

  useEffect(() => {
    const urgentes = mensajes.filter(m => m.prioridad === 'urgente').length
    const hoyStr = hoy()
    const hoyMensajes = mensajes.filter(m => m.created_at.startsWith(hoyStr))
    const plazasActivas = [...new Set(hoyMensajes.map(m => m.plaza).filter(Boolean))]
    localStorage.setItem('kc_screen_context', JSON.stringify({
      screen: 'pase',
      total: mensajes.length,
      hoy: hoyMensajes.length,
      urgentes,
      plazasActivas,
      filtroPlaza,
    }))
    return () => localStorage.removeItem('kc_screen_context')
  }, [mensajes, filtroPlaza])

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [mensajes])

  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t) } }, [toast])

  // Group messages by date for separators
  const mensajesFiltrados = useMemo(() => {
    if (filtroPlaza === 'todas') return mensajes
    return mensajes.filter(m => !m.plaza || m.plaza === filtroPlaza)
  }, [mensajes, filtroPlaza])

  const gruposPorFecha = useMemo(() => {
    const groups: { fecha: string; msgs: PaseMensaje[] }[] = []
    let currentDate = ''
    for (const msg of mensajesFiltrados) {
      const d = msg.created_at.slice(0, 10)
      if (d !== currentDate) {
        currentDate = d
        groups.push({ fecha: d, msgs: [] })
      }
      groups[groups.length - 1].msgs.push(msg)
    }
    return groups
  }, [mensajesFiltrados])

  async function handleSend() {
    if (!texto.trim() || enviando) return
    setEnviando(true)
    try {
      // Extract plaza from #mentions
      const plazaMatch = texto.match(/#(Parrilla|Fríos|Calientes|Pase|Pastelería|Panadería)/i)
      const plazaMap: Record<string, Plaza> = {
        parrilla: 'parrilla', fríos: 'frios', calientes: 'calientes',
        pase: 'pase', pastelería: 'pasteleria', panadería: 'panaderia',
      }
      const plaza = plazaMatch ? plazaMap[plazaMatch[1].toLowerCase()] || null : null

      await enviarMensaje({
        texto: texto.trim(),
        prioridad,
        plaza,
      })
      setTexto('')
      setPrioridad('normal')
      setMention(null)
      if (inputRef.current) inputRef.current.style.height = 'auto'
    } catch (e) {
      console.error(e)
    }
    setEnviando(false)
  }

  async function handle86(nombre: string, _id: string) {
    setShow86(false)
    setEnviando(true)
    try {
      await enviarMensaje({
        texto: `86 — ${nombre}`,
        prioridad: 'urgente',
        tipo: 'alerta',
      })
      // Also mark as unavailable in recetas + carta
      const supabase = createClient()
      await supabase.from('recetas').update({ activa: false }).eq('id', _id)
      // Mark carta_items with this receta as unavailable
      await supabase.from('carta_items').update({ disponible: false }).eq('receta_id', _id)
      // Also match by name in carta_items
      await supabase.from('carta_items').update({ disponible: false })
        .eq('restaurante_id', '00000000-0000-0000-0000-000000000001')
        .ilike('nombre', nombre)
    } catch (e) {
      console.error(e)
    }
    setEnviando(false)
  }

  function handleQuickMessage(msg: string) {
    setTexto(prev => prev ? `${prev} — ${msg}` : msg)
    inputRef.current?.focus()
  }

  function handleTextareaInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value
    setTexto(val)

    // Auto-resize
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'

    // Check for @/# mentions
    const cursorPos = el.selectionStart
    const textBefore = val.slice(0, cursorPos)
    const atMatch = textBefore.match(/@(\w*)$/)
    const hashMatch = textBefore.match(/#(\w*)$/)

    if (atMatch) {
      setMention({ type: '@', filter: atMatch[1], startIdx: cursorPos - atMatch[0].length })
    } else if (hashMatch) {
      setMention({ type: '#', filter: hashMatch[1], startIdx: cursorPos - hashMatch[0].length })
    } else {
      setMention(null)
    }
  }

  function handleMentionSelect(label: string) {
    if (!mention || !inputRef.current) return
    const before = texto.slice(0, mention.startIdx)
    const after = texto.slice(inputRef.current.selectionStart)
    const prefix = mention.type
    setTexto(`${before}${prefix}${label} ${after}`)
    setMention(null)
    inputRef.current.focus()
  }

  return (
    <PageTransition>
    <div className="flex flex-col h-full">
      {/* ── Header ── */}
      <div style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 0', flexShrink: 0 }}>
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-white text-[18px] font-bold m-0">{esEmprendimiento ? 'Avisos' : 'Pase de Turno'}</h1>
            <p className="text-white/60 text-[11px] m-0 mt-[2px]">
              {esEmprendimiento ? 'Mensajes y novedades del equipo' : 'Chat de cocina'}
            </p>
          </div>
          {/* Date jump */}
          <button
            className="flex items-center gap-1 px-3 py-[6px] rounded-full border-none cursor-pointer text-[12px] font-semibold"
            style={{ background: 'rgba(255,255,255,0.15)', color: 'white' }}
            onClick={() => {
              const input = document.createElement('input')
              input.type = 'date'
              input.value = hoy()
              input.style.position = 'fixed'
              input.style.top = '-100px'
              document.body.appendChild(input)
              input.onchange = () => {
                // Scroll to date — for now just refetch
                document.body.removeChild(input)
              }
              input.click()
            }}
          >
            <span className="material-symbols-outlined text-[16px]">calendar_today</span>
            Historial
          </button>
        </div>

        {/* Plaza filter */}
        <div
          data-coach-target="pase-filtros"
          className="flex gap-[6px] overflow-x-auto pb-[10px] -mx-4 px-4"
          style={{ scrollbarWidth: 'none' }}
        >
          {PLAZAS.map(p => (
            <button
              key={p.id}
              onClick={() => setFiltroPlaza(p.id)}
              className="px-[10px] py-[4px] rounded-full border-none cursor-pointer text-[11px] font-semibold whitespace-nowrap flex-shrink-0"
              style={{
                background: filtroPlaza === p.id ? 'white' : 'rgba(255,255,255,0.15)',
                color: filtroPlaza === p.id ? 'var(--navy)' : 'rgba(255,255,255,0.7)',
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Chat area ── */}
      <div
        data-coach-target="pase-mensajes"
        ref={scrollRef}
        className="flex-1 overflow-y-auto"
        style={{ paddingTop: 14, paddingBottom: 8 }}
      >
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <span className="text-[13px]" style={{ color: 'var(--text-3)' }}>Cargando...</span>
          </div>
        ) : mensajesFiltrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2">
            <span className="material-symbols-outlined text-[40px]" style={{ color: 'var(--text-3)' }}>
              swap_horiz
            </span>
            <p className="text-[13px] font-medium" style={{ color: 'var(--text-3)' }}>
              Sin novedades todavía
            </p>
            <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>
              Dejá un mensaje para el equipo
            </p>
          </div>
        ) : (
          gruposPorFecha.map(grupo => (
            <div key={grupo.fecha}>
              {/* Date separator */}
              <div className="flex items-center gap-3 px-4 mb-3 mt-2">
                <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
                  — {fechaLabel(grupo.fecha)} —
                </span>
                <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
              </div>
              {grupo.msgs.map((msg, idx) => {
                const prev = grupo.msgs[idx - 1]
                const showHeader = !prev || prev.usuario_nombre !== msg.usuario_nombre
                return (
                  <MensajeBurbuja
                    key={msg.id}
                    msg={msg}
                    showHeader={showHeader}
                    onCrearTarea={async (txt) => {
                      await agregarTarea({
                        titulo: txt.slice(0, 80),
                        descripcion: `Desde pase de turno: "${txt}"`,
                        status: 'pendiente',
                        prioridad: msg.prioridad === 'urgente' ? 'alta' : msg.prioridad === 'importante' ? 'media' : 'normal',
                        categoria: 'general',
                        plaza: msg.plaza ?? null,
                      })
                      setToast('Tarea creada desde mensaje')
                    }}
                  />
                )
              })}
            </div>
          ))
        )}
      </div>

      {/* ── Input area ── */}
      <div
        className="flex-shrink-0 relative"
        style={{
          borderTop: '1px solid var(--border)',
          background: 'var(--surface)',
          paddingBottom: 'max(env(safe-area-inset-bottom, 8px), 8px)',
        }}
      >
        {/* Quick messages */}
        <div style={{ position: 'relative' }}>
        <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 32, background: 'linear-gradient(to right, transparent, var(--surface))', pointerEvents: 'none', zIndex: 1 }} />
        <div data-coach-target="pase-rapidos" className="flex gap-[6px] overflow-x-auto px-3 py-[8px]" style={{ scrollbarWidth: 'none' }}>
          {/* 86 button — special */}
          <button
            data-coach-target="pase-86"
            onClick={() => setShow86(true)}
            className="flex items-center gap-[4px] px-[10px] py-[5px] rounded-full border-none cursor-pointer whitespace-nowrap text-[11px] font-bold flex-shrink-0"
            style={{ background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca' }}
          >
            <span className="material-symbols-outlined text-[14px]">block</span>
            86
          </button>
          {MENSAJES_RAPIDOS.map(mr => (
            <button
              key={mr.texto}
              onClick={() => handleQuickMessage(mr.texto)}
              className="flex items-center gap-[4px] px-[10px] py-[5px] rounded-full border-none cursor-pointer whitespace-nowrap text-[11px] font-semibold flex-shrink-0"
              style={{ background: 'var(--bg)', color: 'var(--text-2)', border: '1px solid var(--border)' }}
            >
              <span className="material-symbols-outlined text-[14px]">{mr.icon}</span>
              {mr.texto}
            </button>
          ))}
        </div>
        </div>

        {/* Mention dropdown */}
        {mention && (
          <MentionDropdown
            type={mention.type}
            filter={mention.filter}
            onSelect={handleMentionSelect}
            position={{ bottom: 90, left: 16 }}
            usuarios={usuariosMencion}
          />
        )}

        {/* Priority toggle + input + send */}
        <div className="flex items-end gap-2 px-3 pb-1">
          <button
            onClick={() => {
              const cycle: PrioridadPase[] = ['normal', 'importante', 'urgente']
              const idx = cycle.indexOf(prioridad)
              setPrioridad(cycle[(idx + 1) % cycle.length])
            }}
            className="flex-shrink-0 w-[36px] h-[36px] rounded-full flex items-center justify-center border-none cursor-pointer"
            style={{
              background: prioridad === 'urgente' ? '#fef2f2'
                : prioridad === 'importante' ? '#fffbeb' : 'var(--bg)',
              border: `1px solid ${prioridad === 'urgente' ? '#fecaca'
                : prioridad === 'importante' ? '#fde68a' : 'var(--border)'}`,
            }}
            title={`Prioridad: ${prioridad}`}
          >
            <span className="material-symbols-outlined text-[18px]" style={{
              color: prioridad === 'urgente' ? '#ef4444'
                : prioridad === 'importante' ? '#f59e0b' : 'var(--text-3)',
            }}>
              {prioridad === 'urgente' ? 'priority_high' : prioridad === 'importante' ? 'warning' : 'flag'}
            </span>
          </button>

          <div className="flex-1 rounded-[18px] flex items-end"
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', padding: '6px 12px' }}>
            <textarea
              ref={inputRef}
              value={texto}
              onChange={handleTextareaInput}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
                if (e.key === 'Escape') setMention(null)
              }}
              placeholder="Mensaje... usa @ para mencionar, # para plaza"
              rows={1}
              className="flex-1 border-none bg-transparent text-[13px] outline-none resize-none"
              style={{ fontFamily: 'inherit', color: 'var(--text)', lineHeight: '1.4', maxHeight: 120 }}
            />
          </div>

          <button
            onClick={handleSend}
            disabled={!texto.trim() || enviando}
            className="flex-shrink-0 w-[36px] h-[36px] rounded-full flex items-center justify-center border-none cursor-pointer transition-all"
            style={{ background: texto.trim() ? 'var(--navy)' : 'var(--bg)', opacity: texto.trim() ? 1 : 0.5 }}
          >
            <span className="material-symbols-outlined text-[18px]"
              style={{ color: texto.trim() ? 'white' : 'var(--text-3)' }}>send</span>
          </button>
        </div>
      </div>

      {/* 86 Sheet */}
      {show86 && <Sheet86 onSelect={handle86} onClose={() => setShow86(false)} />}

      {/* Toast */}
      {toast && <div style={{ position: 'fixed', bottom: 'var(--toast-bottom)', left: 16, right: 16, zIndex: 300, background: '#22c55e', color: '#fff', borderRadius: 12, padding: '12px 16px', fontSize: 13, fontWeight: 600, textAlign: 'center', boxShadow: '0 8px 24px rgba(34,197,94,.3)' }}>{toast}</div>}
    </div>
    </PageTransition>
  )
}
