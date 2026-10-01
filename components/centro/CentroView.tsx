'use client'

// PROTOTIPO — PLAN-ASISTENTE-2026-10.md §3. El asistente al centro: a la
// izquierda la conversación con el Coach real, a la derecha el lienzo donde se
// pinta como dato lo que consultaron las tools del turno (marker COACH_VISTAS,
// ver lib/coach/stream.ts). Vive en /centro para probarlo sin tocar el home.

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useKitchenCoach, type CoachMessage } from '@/lib/hooks/useKitchenCoach'
import { useRestauranteId } from '@/lib/hooks/useRestauranteId'
import { useAuth } from '@/lib/auth/context'
import { useNotificaciones } from '@/lib/hooks/useNotificaciones'
import { useIsDesktop } from '@/lib/hooks/useIsDesktop'
import { useDatosClave } from '@/lib/hooks/useDatosClave'
import { CoachActionCard } from '@/components/coach/CoachActionCard'
import { CoachLinks } from '@/components/coach/CoachLinks'
import { Num } from '@/components/ui/Num'
import type { CoachVista } from '@/lib/coach/types'
import type { Rol } from '@/types'

// ── Sugerencias por puesto ──────────────────────────────────────
// El chip tiene que ser lo que ESA persona pregunta a esta hora, no un menú genérico.
function sugerenciasPara(rol: Rol | undefined): string[] {
  if (rol === 'admin') return [
    '¿Cuánto vendí esta semana?',
    '¿Cuánto gasté en mercadería esta semana?',
    '¿Quién trabaja hoy?',
    '¿Qué vence en los próximos días?',
  ]
  if (rol === 'chef') return [
    '¿Qué me conviene producir mañana?',
    '¿Qué productos están bajo el mínimo?',
    '¿Quién trabaja hoy?',
    '¿Qué hay en la agenda esta semana?',
  ]
  return [
    '¿Quién trabaja hoy?',
    '¿Qué productos están bajo el mínimo?',
    '¿Qué hay en la agenda esta semana?',
  ]
}

function saludo(nombre: string | undefined) {
  const h = new Date().getHours()
  const base = h < 6 ? 'Buenas noches' : h < 13 ? 'Buen día' : h < 20 ? 'Buenas tardes' : 'Buenas noches'
  return nombre ? `${base}, ${nombre}` : base
}

// ── Lienzo: cómo se titula cada tool ────────────────────────────
const TOOL_META: Record<string, { label: string; icono: string }> = {
  consultar_stock: { label: 'Stock', icono: 'inventory_2' },
  ultimo_precio: { label: 'Último precio', icono: 'sell' },
  gasto_periodo: { label: 'Compras del período', icono: 'receipt_long' },
  consultar_ventas: { label: 'Ventas', icono: 'point_of_sale' },
  buscar_receta: { label: 'Receta', icono: 'menu_book' },
  composicion_plato: { label: 'Composición del plato', icono: 'restaurant' },
  consultar_agenda: { label: 'Agenda', icono: 'calendar_month' },
  consultar_haccp: { label: 'HACCP', icono: 'health_and_safety' },
  consultar_turnos: { label: 'Turnos', icono: 'schedule' },
  consultar_deudores: { label: 'Deudores', icono: 'account_balance_wallet' },
  sugerir_produccion: { label: 'Producción sugerida', icono: 'skillet' },
}

interface VistaParseada {
  titulo: string | null
  filas: { label: string; valor: string | null }[]
  notas: string[]
}

/**
 * Las tools devuelven texto para el modelo con una forma estable:
 * encabezado, luego "- nombre: valor" por fila, luego notas. Se aprovecha esa
 * forma en vez de reescribir 20 tools para que devuelvan JSON — si el lienzo
 * se queda, el paso siguiente es que cada tool devuelva `vista` estructurada.
 */
function parsearVista(texto: string): VistaParseada {
  const out: VistaParseada = { titulo: null, filas: [], notas: [] }
  for (const raw of texto.split('\n')) {
    const linea = raw.trim()
    if (!linea) continue
    const fila = linea.match(/^[-•]\s+(.+)$/)
    if (fila) {
      const cuerpo = fila[1]
      const sep = cuerpo.indexOf(': ')
      out.filas.push(sep > 0
        ? { label: cuerpo.slice(0, sep), valor: cuerpo.slice(sep + 2) }
        : { label: cuerpo, valor: null })
      continue
    }
    if (!out.titulo && out.filas.length === 0) out.titulo = linea.replace(/:$/, '')
    else out.notas.push(linea)
  }
  return out
}

export default function CentroView() {
  const RESTAURANTE_ID = useRestauranteId()
  const { perfil } = useAuth()
  const isDesktop = useIsDesktop()
  const {
    messages, loading, error, sendMessage,
    pendingAction, confirmingDraftId, confirmAction, cancelAction,
    startNewConversation,
  } = useKitchenCoach({ restauranteId: RESTAURANTE_ID || null, vistas: true })
  const datos = useDatosClave()
  const { notificaciones, noLeidas, marcarTodasLeidas } = useNotificaciones()

  const [input, setInput] = useState('')
  const [seleccion, setSeleccion] = useState<string | null>(null)
  const [verAvisos, setVerAvisos] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    localStorage.setItem('kc_screen_context', JSON.stringify({ screen: 'centro' }))
    return () => localStorage.removeItem('kc_screen_context')
  }, [])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // El lienzo sigue a la última respuesta con datos, salvo que el usuario haya
  // elegido otra a mano ("Ver en el lienzo").
  const conVistas = useMemo(() => messages.filter(m => m.role === 'assistant' && m.vistas?.length), [messages])
  const forzarNucleo = seleccion === '__nucleo__'
  const enLienzo: CoachMessage | undefined = forzarNucleo
    ? undefined
    : (seleccion && conVistas.find(m => m.id === seleccion)) || conVistas[conVistas.length - 1]

  const doSend = useCallback(async (text?: string) => {
    const msg = (text ?? input).trim()
    if (!msg || loading) return
    setInput('')
    setSeleccion(null)
    setVerAvisos(false)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    await sendMessage(msg)
  }, [input, loading, sendMessage])

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px'
  }

  function abrirAvisos() {
    setVerAvisos(true)
    void marcarTodasLeidas()
  }

  const hayConversacion = messages.length > 0
  const sugerencias = sugerenciasPara(perfil?.rol)

  // ── Columna del asistente ─────────────────────────────────────
  const asistente = (
    <section style={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%', borderRight: isDesktop ? '1px solid var(--border)' : 'none' }}>
      {/* Encabezado: el aviso solo existe si hay algo sin leer (PLAN §5) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: isDesktop ? '16px 20px' : 'calc(var(--header-top) + 4px) 64px 12px 16px', flexShrink: 0 }}>
        <div style={{ flex: 1, fontSize: 12, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-3)' }}>
          Asistente · prototipo
        </div>
        {noLeidas > 0 && (
          <button onClick={abrirAvisos} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--navy)', color: '#fff', border: 'none', borderRadius: 999, padding: '6px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>notifications</span>
            <Num>{noLeidas}</Num> aviso{noLeidas !== 1 ? 's' : ''} nuevo{noLeidas !== 1 ? 's' : ''}
          </button>
        )}
        {hayConversacion && (
          <button onClick={() => { void startNewConversation(); setSeleccion(null) }} title="Nueva conversación" style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 10, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-2)' }}>edit_square</span>
          </button>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 16px', display: 'flex', flexDirection: 'column' }}>
        {!hayConversacion ? (
          <div style={{ margin: 'auto 0', paddingBottom: '8vh', maxWidth: 560, width: '100%', alignSelf: 'center' }}>
            <div style={{ fontSize: isDesktop ? 32 : 26, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-.02em', lineHeight: 1.15 }}>
              {saludo(perfil?.nombre)}
            </div>
            <div style={{ fontSize: 15, color: 'var(--text-2)', marginTop: 6, marginBottom: 24 }}>
              ¿Qué necesitás saber o resolver?
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {sugerencias.map(s => (
                <button key={s} onClick={() => doSend(s)} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 999, padding: '8px 14px', fontSize: 13.5, color: 'var(--text-1)', cursor: 'pointer', fontFamily: 'inherit' }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 4 }}>
            {messages.map(m => m.role === 'user' ? (
              <div key={m.id} style={{ alignSelf: 'flex-end', maxWidth: '85%', background: 'var(--navy)', color: '#fff', borderRadius: '14px 4px 14px 14px', padding: '10px 14px', fontSize: 14, lineHeight: 1.5 }}>
                {m.content}
              </div>
            ) : (
              <div key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 14.5, color: 'var(--text-1)', lineHeight: 1.6, whiteSpace: 'pre-wrap', userSelect: 'text' }}>
                  {m.content === '' ? <span style={{ color: 'var(--text-3)' }}>Pensando…</span> : m.content}
                </div>
                {!loading && m.vistas?.length ? (
                  <button onClick={() => { setSeleccion(m.id); setVerAvisos(false) }} style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 4, background: enLienzo?.id === m.id && !verAvisos ? 'var(--blue-bg)' : 'none', color: 'var(--blue-fg)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 15 }}>{isDesktop ? 'arrow_forward' : 'arrow_downward'}</span>
                    {m.vistas.length} dato{m.vistas.length !== 1 ? 's' : ''} en el lienzo
                  </button>
                ) : null}
                {m.links && !loading && <CoachLinks links={m.links} />}
              </div>
            ))}
            {pendingAction && (
              <CoachActionCard action={pendingAction} onConfirm={confirmAction} onCancel={cancelAction} busy={confirmingDraftId === pendingAction.draft_id} />
            )}
            {error && <div style={{ fontSize: 13, color: 'var(--red-fg)' }}>{error}</div>}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {/* Prompt */}
      <div style={{ flexShrink: 0, padding: '10px 16px', paddingBottom: isDesktop ? 16 : 'calc(var(--fab-bottom) - 40px)' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 6, boxShadow: 'var(--shadow-1)' }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void doSend() } }}
            placeholder="Preguntale o pedile algo…"
            rows={1}
            style={{ flex: 1, resize: 'none', background: 'transparent', border: 'none', padding: '10px 10px', fontSize: 15, fontFamily: 'inherit', color: 'var(--text-1)', outline: 'none', lineHeight: 1.4, maxHeight: 140 }}
          />
          <button onClick={() => void doSend()} disabled={!input.trim() || loading} style={{ background: input.trim() && !loading ? 'var(--orange)' : 'var(--bg)', border: 'none', borderRadius: 12, width: 42, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: input.trim() && !loading ? 'pointer' : 'default', flexShrink: 0 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: input.trim() && !loading ? '#fff' : 'var(--text-3)' }}>{loading ? 'more_horiz' : 'arrow_upward'}</span>
          </button>
        </div>
      </div>
    </section>
  )

  // ── Lienzo ────────────────────────────────────────────────────
  let contenidoLienzo: React.ReactNode
  if (verAvisos) {
    contenidoLienzo = <LienzoAvisos notificaciones={notificaciones} />
  } else if (enLienzo?.vistas) {
    contenidoLienzo = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {enLienzo.vistas.map((v, i) => <VistaCard key={i} vista={v} />)}
      </div>
    )
  } else {
    contenidoLienzo = <Nucleo datos={datos} noLeidas={noLeidas} onPreguntar={doSend} onAvisos={abrirAvisos} compacto={!isDesktop} />
  }

  const lienzo = (
    <section style={{ minHeight: 0, height: isDesktop ? '100%' : 'auto', overflowY: isDesktop ? 'auto' : 'visible', background: 'var(--bg)', padding: isDesktop ? '20px 24px' : '8px 16px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <div style={{ flex: 1, fontSize: 12, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-3)' }}>
          {verAvisos ? 'Avisos' : enLienzo ? 'Lienzo' : 'Tu cocina ahora'}
        </div>
        {(verAvisos || enLienzo) && (
          <button onClick={() => { setVerAvisos(false); setSeleccion('__nucleo__') }} style={{ background: 'none', border: 'none', color: 'var(--text-2)', fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>radio_button_checked</span>
            Ver estado de la cocina
          </button>
        )}
      </div>
      {contenidoLienzo}
    </section>
  )

  if (isDesktop) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(380px, 44%) 1fr', height: '100%', background: 'var(--bg)' }}>
        <div style={{ background: 'var(--surface)', minHeight: 0 }}>{asistente}</div>
        {lienzo}
      </div>
    )
  }
  // Mobile: el lienzo va debajo de la conversación (en el plan final sube como sheet).
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', background: 'var(--bg)' }}>
      <div style={{ height: hayConversacion ? '62vh' : 'auto', minHeight: hayConversacion ? 0 : '70vh', display: 'flex', flexDirection: 'column', background: 'var(--surface)' }}>{asistente}</div>
      {lienzo}
    </div>
  )
}

// ── Sub-componentes (nivel módulo) ──────────────────────────────

function VistaCard({ vista }: { vista: CoachVista }) {
  const meta = TOOL_META[vista.tool] ?? { label: 'Consulta', icono: 'data_object' }
  const p = useMemo(() => parsearVista(vista.resultado), [vista.resultado])
  const [verCrudo, setVerCrudo] = useState(false)
  return (
    <article style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: 'var(--shadow-1)', overflow: 'hidden' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--accent)' }}>{meta.icono}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-3)' }}>{meta.label}</div>
          {p.titulo && <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)' }}>{p.titulo}</div>}
        </div>
        <button onClick={() => setVerCrudo(v => !v)} title="Ver texto original" style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-3)' }}>{verCrudo ? 'table_rows' : 'notes'}</span>
        </button>
      </header>
      {verCrudo ? (
        <pre style={{ margin: 0, padding: '12px 16px', fontSize: 12.5, whiteSpace: 'pre-wrap', color: 'var(--text-2)', fontFamily: 'inherit' }}>{vista.resultado}</pre>
      ) : (
        <>
          {p.filas.length > 0 && (
            <div>
              {p.filas.map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 12, padding: '9px 16px', borderTop: i ? '1px solid var(--border)' : 'none', fontSize: 14 }}>
                  <span style={{ flex: 1, minWidth: 0, color: 'var(--text-1)' }}>{f.label}</span>
                  {f.valor && <Num style={{ color: 'var(--text-2)', textAlign: 'right', maxWidth: '60%' }}>{f.valor}</Num>}
                </div>
              ))}
            </div>
          )}
          {p.notas.length > 0 && (
            <div style={{ padding: '10px 16px', background: 'var(--bg)', borderTop: '1px solid var(--border)', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
              {p.notas.map((n, i) => <div key={i}>{n}</div>)}
            </div>
          )}
        </>
      )}
    </article>
  )
}

/**
 * El lienzo vacío: el estado de la cocina ahora. Las fuentes a la izquierda
 * alimentan un núcleo con lo que está abierto (referencia XSIAM del usuario,
 * con los tokens de la casa). Tocar una fuente se lo pregunta al asistente.
 */
function Nucleo({ datos, noLeidas, onPreguntar, onAvisos, compacto }: {
  datos: ReturnType<typeof useDatosClave>
  noLeidas: number
  compacto: boolean
  onPreguntar: (q: string) => void
  onAvisos: () => void
}) {
  const fuentes = [
    { icono: 'inventory_2', label: 'Bajo mínimo', valor: datos?.bajoMinimo ?? null, q: '¿Qué productos están bajo el mínimo y qué me conviene reponer primero?' },
    { icono: 'health_and_safety', label: 'Vencen en 3 días', valor: datos?.vencen ?? null, q: '¿Qué productos vencen en los próximos días?' },
    { icono: 'receipt_long', label: 'Compras de hoy', valor: datos ? `$${Math.round(datos.gastoHoy).toLocaleString('es-AR')}` : null, q: '¿Cuánto gasté en mercadería hoy?' },
  ]
  const abiertos = (datos?.bajoMinimo ?? 0) + (datos?.vencen ?? 0) + noLeidas
  return (
    <div style={{ display: 'grid', gridTemplateColumns: compacto ? '1fr' : 'minmax(0, 1fr) auto', gap: 20, alignItems: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, order: compacto ? 2 : 0 }}>
        {fuentes.map(f => (
          <button key={f.label} onClick={() => onPreguntar(f.q)} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--accent)' }}>{f.icono}</span>
            <span style={{ flex: 1, fontSize: 14, color: 'var(--text-1)' }}>{f.label}</span>
            <Num style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-1)' }}>{f.valor ?? '—'}</Num>
            {/* Línea hacia el núcleo */}
            {!compacto && <span aria-hidden style={{ position: 'absolute', right: -21, top: '50%', width: 20, borderTop: '1px dashed var(--text-3)' }} />}
          </button>
        ))}
        <button onClick={onAvisos} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--accent)' }}>notifications</span>
          <span style={{ flex: 1, fontSize: 14, color: 'var(--text-1)' }}>Avisos sin leer</span>
          <Num style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-1)' }}>{noLeidas}</Num>
          {!compacto && <span aria-hidden style={{ position: 'absolute', right: -21, top: '50%', width: 20, borderTop: '1px dashed var(--text-3)' }} />}
        </button>
      </div>
      <div style={{ justifySelf: 'center', order: compacto ? 1 : 0, width: 150, height: 150, borderRadius: '50%', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface)', boxShadow: 'var(--shadow-2)' }}>
        <div style={{ width: 118, height: 118, borderRadius: '50%', border: `3px solid ${abiertos > 0 ? 'var(--orange)' : 'var(--green)'}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <Num style={{ fontSize: 34, fontWeight: 700, color: 'var(--text-1)', lineHeight: 1 }}>{datos ? abiertos : '—'}</Num>
          <span style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4, textAlign: 'center', lineHeight: 1.2 }}>
            {abiertos === 1 ? 'tema abierto' : 'temas abiertos'}
          </span>
        </div>
      </div>
    </div>
  )
}

function LienzoAvisos({ notificaciones }: { notificaciones: ReturnType<typeof useNotificaciones>['notificaciones'] }) {
  if (notificaciones.length === 0) {
    return <div style={{ fontSize: 14, color: 'var(--text-3)', padding: '24px 0' }}>No hay avisos.</div>
  }
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
      {notificaciones.map((n, i) => (
        <a key={n.id} href={n.link ?? undefined} style={{ display: 'block', padding: '12px 16px', borderTop: i ? '1px solid var(--border)' : 'none', textDecoration: 'none' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>{n.titulo}</div>
          {n.cuerpo && <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 2 }}>{n.cuerpo}</div>}
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>{new Date(n.created_at).toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
        </a>
      ))}
    </div>
  )
}
