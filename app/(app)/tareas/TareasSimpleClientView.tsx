'use client'

import { useState, useMemo, type CSSProperties } from 'react'
import Link from 'next/link'
import PageTransition from '@/components/PageTransition'
import { SheetChrome } from '@/lib/ui/chrome'
import { EmptyState, FilterChips, HeaderAction } from '@/components/ui'
import { AVATAR_PALETTE } from '@/components/ui/Avatar'
import type { FilterChip } from '@/components/ui'
import { useTareas } from '@/lib/hooks/useTareas'
import { useIsDesktop } from '@/lib/hooks/useIsDesktop'
import IngresosBanner from '@/components/pedidos/IngresosBanner'
import { usePedidos } from '@/lib/hooks/usePedidos'
import { usePase } from '@/lib/hooks/usePase'
import { useHaccp } from '@/lib/hooks/useHaccp'
import { limpiezaTocaFecha } from '@/lib/haccp/recurrencia'
import type { Tarea, TareaPrioridad } from '@/types'

// Lista de tareas simple para perfil 'emprendimiento' — ve/carga/edita lo que
// hay que hacer, sin conceptos de OPS (plaza, menú, turno). Reusa la misma
// tabla `tareas` que OPS (lib/hooks/useTareas.ts) pero con su propia UI.
//
// Agrupación por "área" (Proveedores, Producción, Ventas...): reusa la
// columna `categoria` (ya existía, nullable, sin uso en OPS para este
// perfil) — sin tabla nueva. Color e ícono por área son determinísticos
// (hash del nombre), mismo mecanismo que <Avatar> — no hay que elegirlos
// ni persistirlos aparte.

type FiltroEstado = 'pendientes' | 'completadas' | 'todas'
const SIN_AREA = '__sin_area__'

const FILTROS: FilterChip<FiltroEstado>[] = [
  { value: 'pendientes', label: 'Pendientes' },
  { value: 'completadas', label: 'Completadas' },
  { value: 'todas', label: 'Todas' },
]

const PRIORIDADES: { value: TareaPrioridad; label: string; color: string }[] = [
  { value: 'alta', label: 'Alta', color: '#dc2626' },
  { value: 'media', label: 'Media', color: '#d97706' },
  { value: 'baja', label: 'Baja', color: '#64748b' },
]

// Íconos rotativos para áreas — Material Symbols, sin picker manual.
const AREA_ICONOS = [
  'local_shipping', 'restaurant', 'storefront', 'receipt_long',
  'groups', 'campaign', 'build', 'inventory_2', 'payments', 'task_alt',
]

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}
function areaColor(nombre: string): string {
  return AVATAR_PALETTE[hashStr(nombre) % AVATAR_PALETTE.length]
}
function areaIcono(nombre: string): string {
  return AREA_ICONOS[hashStr(nombre) % AREA_ICONOS.length]
}

function estaCompletada(t: Tarea): boolean {
  return t.estado === 'listo' || t.status === 'completada'
}

function fmtFechaCorta(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })
}

function estaVencida(t: Tarea): boolean {
  if (!t.fecha_limite || estaCompletada(t)) return false
  return t.fecha_limite < new Date().toISOString().slice(0, 10)
}

const inputStyle: CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 10,
  border: '1px solid var(--border)', background: 'var(--surface)',
  fontSize: 14, color: 'var(--text-1)', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
}
const labelStyle: CSSProperties = {
  fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6, display: 'block',
}

function resumenChipStyle(color: string): CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 5,
    padding: '6px 12px', borderRadius: 99, fontSize: 12, fontWeight: 700,
    background: `${color}18`, color, textDecoration: 'none',
  }
}

export default function TareasSimpleClientView() {
  const { tareas, loading, agregarTarea, actualizarTarea, cambiarEstado, eliminarTarea } = useTareas()
  const { pedidos } = usePedidos()
  const { mensajes: avisos, usuarioId } = usePase()
  const { limpieza } = useHaccp()
  const [filtro, setFiltro] = useState<FiltroEstado>('pendientes')
  const [sheetTarea, setSheetTarea] = useState<Tarea | 'nueva' | null>(null)
  const [saving, setSaving] = useState(false)
  const [colapsadas, setColapsadas] = useState<Set<string>>(new Set())

  const pedidosPorConfirmar = useMemo(() => pedidos.filter(p => p.status === 'borrador').length, [pedidos])
  const avisosNoLeidos = useMemo(
    () => usuarioId ? avisos.filter(m => !(Array.isArray(m.leido_por) && m.leido_por.includes(usuarioId))).length : 0,
    [avisos, usuarioId]
  )
  const limpiezasHoy = useMemo(() => {
    const hoy = new Date()
    return limpieza.filter(l => limpiezaTocaFecha(l, hoy)).length
  }, [limpieza])

  const areasExistentes = useMemo(() => {
    const nombres = new Set<string>()
    for (const t of tareas) {
      const a = t.categoria?.trim()
      if (a) nombres.add(a)
    }
    return [...nombres].sort((a, b) => a.localeCompare(b))
  }, [tareas])

  const grupos = useMemo(() => {
    const filtradas = tareas.filter(t => {
      if (filtro === 'todas') return true
      const completada = estaCompletada(t)
      return filtro === 'completadas' ? completada : !completada
    })

    const byArea = new Map<string, Tarea[]>()
    for (const t of filtradas) {
      const key = t.categoria?.trim() || SIN_AREA
      if (!byArea.has(key)) byArea.set(key, [])
      byArea.get(key)!.push(t)
    }

    const ordenar = (arr: Tarea[]) => [...arr].sort((a, b) => {
      const fa = a.fecha_limite ?? '9999-99-99'
      const fb = b.fecha_limite ?? '9999-99-99'
      if (fa !== fb) return fa < fb ? -1 : 1
      return (b.created_at ?? '').localeCompare(a.created_at ?? '')
    })

    const areas = [...byArea.keys()].filter(k => k !== SIN_AREA).sort((a, b) => a.localeCompare(b))
    const resultado = areas.map(nombre => ({ nombre, tareas: ordenar(byArea.get(nombre)!) }))
    if (byArea.has(SIN_AREA)) resultado.push({ nombre: SIN_AREA, tareas: ordenar(byArea.get(SIN_AREA)!) })
    return resultado
  }, [tareas, filtro])

  const totalVisible = grupos.reduce((s, g) => s + g.tareas.length, 0)

  function toggleColapsada(nombre: string) {
    setColapsadas(prev => {
      const next = new Set(prev)
      if (next.has(nombre)) next.delete(nombre)
      else next.add(nombre)
      return next
    })
  }

  async function handleToggle(t: Tarea) {
    await cambiarEstado(t.id, estaCompletada(t) ? 'pendiente' : 'listo')
  }

  async function handleAgregarRapida(nombre: string | null, titulo: string) {
    const limpio = titulo.trim()
    if (!limpio) return
    await agregarTarea({
      titulo: limpio,
      descripcion: null,
      fecha_limite: null,
      prioridad: 'media',
      categoria: nombre,
      status: 'pendiente',
      estado: 'pendiente',
      seccion: 'general',
    })
  }

  async function handleGuardar(datos: { titulo: string; descripcion: string; fechaLimite: string; prioridad: TareaPrioridad; area: string }) {
    setSaving(true)
    try {
      const categoria = datos.area.trim() || null
      if (sheetTarea && sheetTarea !== 'nueva') {
        await actualizarTarea(sheetTarea.id, {
          titulo: datos.titulo,
          descripcion: datos.descripcion || null,
          fecha_limite: datos.fechaLimite || null,
          prioridad: datos.prioridad,
          categoria,
        })
      } else {
        await agregarTarea({
          titulo: datos.titulo,
          descripcion: datos.descripcion || null,
          fecha_limite: datos.fechaLimite || null,
          prioridad: datos.prioridad,
          categoria,
          status: 'pendiente',
          estado: 'pendiente',
          seccion: 'general',
        })
      }
      setSheetTarea(null)
    } finally {
      setSaving(false)
    }
  }

  async function handleEliminar() {
    if (!sheetTarea || sheetTarea === 'nueva') return
    await eliminarTarea(sheetTarea.id)
    setSheetTarea(null)
  }

  return (
    <PageTransition>
      <div className="flex flex-col h-full" style={{ overflow: 'hidden' }}>
        <div style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 12px', flexShrink: 0 }}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>Tareas</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,.45)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em' }}>
                Lo que hay que hacer
              </div>
            </div>
            <HeaderAction label="Nueva" onClick={() => setSheetTarea('nueva')} />
          </div>
          <FilterChips chips={FILTROS} active={filtro} onChange={setFiltro} context="onDark" />
        </div>

        <div className="flex-1 overflow-y-auto" style={{ padding: 16 }}>
          {/* Resumen del día — cada fuente se omite en silencio si está vacía (mismo patrón que IngresosBanner) */}
          <IngresosBanner embedded />
          {(pedidosPorConfirmar > 0 || avisosNoLeidos > 0 || limpiezasHoy > 0) && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '0 0 16px' }}>
              {pedidosPorConfirmar > 0 && (
                <Link href="/pedidos" style={resumenChipStyle('#0ea5e9')}>
                  <span className="material-symbols-outlined" style={{ fontSize: 15 }}>shopping_cart</span>
                  {pedidosPorConfirmar} pedido{pedidosPorConfirmar !== 1 ? 's' : ''} por confirmar
                </Link>
              )}
              {avisosNoLeidos > 0 && (
                <Link href="/pase" style={resumenChipStyle('#8b5cf6')}>
                  <span className="material-symbols-outlined" style={{ fontSize: 15 }}>campaign</span>
                  {avisosNoLeidos} aviso{avisosNoLeidos !== 1 ? 's' : ''} sin leer
                </Link>
              )}
              {limpiezasHoy > 0 && (
                <Link href="/haccp" style={resumenChipStyle('#10b981')}>
                  <span className="material-symbols-outlined" style={{ fontSize: 15 }}>cleaning_services</span>
                  {limpiezasHoy} limpieza{limpiezasHoy !== 1 ? 's' : ''} hoy
                </Link>
              )}
            </div>
          )}

          {loading && <p style={{ color: 'var(--text-3)', fontSize: 14 }}>Cargando…</p>}

          {!loading && totalVisible === 0 && (
            <EmptyState
              icon="checklist"
              title={filtro === 'completadas' ? 'Sin tareas completadas' : 'Sin tareas pendientes'}
              subtitle={
                filtro === 'completadas'
                  ? undefined
                  : 'Cargá lo que tengas que hacer — pedirle algo a un proveedor, preparar un lote, llamar a un cliente. Agrupalas por área (Proveedores, Producción, Ventas…) para ordenar tu día.'
              }
              cta={filtro !== 'completadas' ? { label: 'Nueva tarea', onClick: () => setSheetTarea('nueva') } : undefined}
            />
          )}

          {!loading && totalVisible > 0 && areasExistentes.length === 0 && (
            <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 2px 14px' }}>
              Tip: asignale un área a tus tareas (Proveedores, Producción, Ventas…) para agruparlas acá.
            </p>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18, alignItems: 'start' }}>
            {grupos.map(g => (
              <AreaGrupo
                key={g.nombre}
                nombre={g.nombre === SIN_AREA ? null : g.nombre}
                tareas={g.tareas}
                colapsada={colapsadas.has(g.nombre)}
                onToggleColapsar={() => toggleColapsada(g.nombre)}
                onToggleTarea={handleToggle}
                onEditarTarea={setSheetTarea}
                onAgregarRapida={handleAgregarRapida}
              />
            ))}
          </div>
        </div>
      </div>

      {sheetTarea && (
        <SheetChrome>
          <TareaSheet
            tarea={sheetTarea === 'nueva' ? null : sheetTarea}
            areasExistentes={areasExistentes}
            saving={saving}
            onClose={() => setSheetTarea(null)}
            onGuardar={handleGuardar}
            onEliminar={sheetTarea !== 'nueva' ? handleEliminar : undefined}
          />
        </SheetChrome>
      )}
    </PageTransition>
  )
}

// ── Grupo por área — header con ícono+color determinístico + lista colapsable ──
function AreaGrupo({
  nombre, tareas, colapsada, onToggleColapsar, onToggleTarea, onEditarTarea, onAgregarRapida,
}: {
  nombre: string | null
  tareas: Tarea[]
  colapsada: boolean
  onToggleColapsar: () => void
  onToggleTarea: (t: Tarea) => void
  onEditarTarea: (t: Tarea) => void
  onAgregarRapida: (nombre: string | null, titulo: string) => Promise<void>
}) {
  const color = nombre ? areaColor(nombre) : 'var(--text-3)'
  const icono = nombre ? areaIcono(nombre) : 'more_horiz'
  const label = nombre ?? 'Sin área'
  const [agregando, setAgregando] = useState(false)
  const [tituloRapido, setTituloRapido] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function confirmarRapida(seguirAgregando: boolean) {
    const limpio = tituloRapido.trim()
    if (!limpio) { setAgregando(false); return }
    setEnviando(true)
    try {
      await onAgregarRapida(nombre, limpio)
      setTituloRapido('')
      setAgregando(seguirAgregando)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div>
      <button
        onClick={onToggleColapsar}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          background: 'none', border: 'none', padding: '2px 2px 10px', cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        <span
          style={{
            width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
            background: nombre ? `${color}18` : 'var(--surface)',
            border: nombre ? 'none' : '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 15, color }}>{icono}</span>
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{label}</span>
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>· {tareas.length}</span>
        <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-3)', marginLeft: 'auto' }}>
          {colapsada ? 'expand_more' : 'expand_less'}
        </span>
      </button>

      {!colapsada && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {tareas.map(t => (
            <TareaRow key={t.id} tarea={t} onToggle={() => onToggleTarea(t)} onEdit={() => onEditarTarea(t)} />
          ))}

          {agregando ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <input
                value={tituloRapido}
                onChange={e => setTituloRapido(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') confirmarRapida(true)
                  if (e.key === 'Escape') { setAgregando(false); setTituloRapido('') }
                }}
                onBlur={() => { if (!tituloRapido.trim()) setAgregando(false) }}
                placeholder="Título de la tarea…"
                autoFocus
                disabled={enviando}
                style={{
                  width: '100%', padding: '9px 12px', borderRadius: 10,
                  border: '1px solid var(--navy)', background: 'var(--surface)',
                  fontSize: 13, color: 'var(--text-1)', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
                }}
              />
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() => confirmarRapida(true)}
                  disabled={enviando || !tituloRapido.trim()}
                  style={{
                    padding: '6px 12px', borderRadius: 8, border: 'none',
                    background: 'var(--navy)', color: '#fff', fontSize: 12, fontWeight: 700,
                    cursor: 'pointer', fontFamily: 'inherit', opacity: (enviando || !tituloRapido.trim()) ? 0.6 : 1,
                  }}
                >
                  Agregar
                </button>
                <button
                  onClick={() => { setAgregando(false); setTituloRapido('') }}
                  style={{
                    padding: '6px 12px', borderRadius: 8, border: 'none',
                    background: 'none', color: 'var(--text-3)', fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAgregando(true)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '10px 0', borderRadius: 12, border: '1px dashed var(--border)',
                background: 'none', color: 'var(--text-3)', fontSize: 13, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 17 }}>add</span>
              Tarea
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Fila de tarea — nivel de módulo (evita remount por foco, ver hooks.md) ──
function TareaRow({ tarea, onToggle, onEdit }: { tarea: Tarea; onToggle: () => void; onEdit: () => void }) {
  const completada = estaCompletada(tarea)
  const vencida = estaVencida(tarea)
  const prioridadCfg = PRIORIDADES.find(p => p.value === tarea.prioridad)

  return (
    <div
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        padding: '12px 14px', borderRadius: 12,
        background: 'var(--surface)', border: '1px solid var(--border)',
        opacity: completada ? 0.6 : 1,
      }}
    >
      <button
        onClick={onToggle}
        style={{
          width: 22, height: 22, borderRadius: '50%', flexShrink: 0, marginTop: 1,
          border: completada ? 'none' : '2px solid var(--border)',
          background: completada ? '#16a34a' : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', padding: 0,
        }}
      >
        {completada && <span className="material-symbols-outlined" style={{ fontSize: 15, color: '#fff' }}>check</span>}
      </button>

      <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={onEdit}>
        <p style={{
          fontSize: 14, fontWeight: 600, color: 'var(--text-1)', margin: 0,
          textDecoration: completada ? 'line-through' : 'none',
        }}>
          {tarea.titulo}
        </p>
        {tarea.descripcion && (
          <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {tarea.descripcion}
          </p>
        )}
        {(tarea.fecha_limite || prioridadCfg) && (
          <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
            {tarea.fecha_limite && (
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 6,
                background: vencida ? 'rgba(220,38,38,.12)' : 'rgba(100,116,139,.12)',
                color: vencida ? '#dc2626' : 'var(--text-3)',
              }}>
                {fmtFechaCorta(tarea.fecha_limite)}
              </span>
            )}
            {prioridadCfg && (
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 6,
                background: `${prioridadCfg.color}18`, color: prioridadCfg.color,
              }}>
                {prioridadCfg.label}
              </span>
            )}
          </div>
        )}
      </div>

      <button onClick={onEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', flexShrink: 0, padding: 4 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>chevron_right</span>
      </button>
    </div>
  )
}

// ── Sheet crear/editar — nivel de módulo (inputs con foco, ver hooks.md) ──
function TareaSheet({
  tarea, areasExistentes, saving, onClose, onGuardar, onEliminar,
}: {
  tarea: Tarea | null
  areasExistentes: string[]
  saving: boolean
  onClose: () => void
  onGuardar: (datos: { titulo: string; descripcion: string; fechaLimite: string; prioridad: TareaPrioridad; area: string }) => void
  onEliminar?: () => void
}) {
  const [titulo, setTitulo] = useState(tarea?.titulo ?? '')
  const [descripcion, setDescripcion] = useState(tarea?.descripcion ?? '')
  const [fechaLimite, setFechaLimite] = useState(tarea?.fecha_limite ?? '')
  const [prioridad, setPrioridad] = useState<TareaPrioridad>((tarea?.prioridad as TareaPrioridad) ?? 'media')
  const [area, setArea] = useState(tarea?.categoria ?? '')
  const [creandoArea, setCreandoArea] = useState(false)
  const [nuevaAreaTexto, setNuevaAreaTexto] = useState('')
  const isDesktop = useIsDesktop()

  function confirmarNuevaArea() {
    const nombre = nuevaAreaTexto.trim()
    if (nombre) setArea(nombre)
    setCreandoArea(false)
    setNuevaAreaTexto('')
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,.5)',
        display: 'flex', alignItems: isDesktop ? 'center' : 'flex-end', justifyContent: 'center',
        padding: isDesktop ? 24 : 0,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--surface)',
        borderRadius: isDesktop ? 20 : '20px 20px 0 0',
        width: '100%',
        maxWidth: isDesktop ? 440 : undefined,
        maxHeight: isDesktop ? 'min(85vh, 640px)' : '85vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: isDesktop ? '0 20px 60px rgba(0,0,0,.35)' : undefined,
      }}>
        <div style={{ padding: '20px 16px 12px', flexShrink: 0 }}>
          <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>
            {tarea ? 'Editar tarea' : 'Nueva tarea'}
          </p>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={labelStyle}>Título</label>
            <input
              value={titulo}
              onChange={e => setTitulo(e.target.value)}
              placeholder="Ej: Pedirle harina a La Mensola"
              style={inputStyle}
              autoFocus
            />
          </div>
          <div>
            <label style={labelStyle}>Descripción (opcional)</label>
            <textarea
              value={descripcion}
              onChange={e => setDescripcion(e.target.value)}
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>

          <div>
            <label style={labelStyle}>Área (opcional)</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {areasExistentes.map(a => {
                const activa = area === a
                const c = areaColor(a)
                return (
                  <button
                    key={a}
                    onClick={() => setArea(activa ? '' : a)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '6px 12px', borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                      border: activa ? `1px solid ${c}` : '1px solid var(--border)',
                      background: activa ? `${c}18` : 'var(--bg)',
                      color: activa ? c : 'var(--text-2)',
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{areaIcono(a)}</span>
                    {a}
                  </button>
                )
              })}
              {!creandoArea && (
                <button
                  onClick={() => setCreandoArea(true)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '6px 12px', borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                    border: '1px dashed var(--border)', background: 'none', color: 'var(--text-3)',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span>
                  Nueva área
                </button>
              )}
            </div>
            {creandoArea && (
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <input
                  value={nuevaAreaTexto}
                  onChange={e => setNuevaAreaTexto(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') confirmarNuevaArea(); if (e.key === 'Escape') setCreandoArea(false) }}
                  placeholder="Ej: Producción"
                  style={{ ...inputStyle, flex: 1 }}
                  autoFocus
                />
                <button
                  onClick={confirmarNuevaArea}
                  style={{ padding: '0 14px', borderRadius: 10, border: 'none', background: 'var(--navy)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  OK
                </button>
              </div>
            )}
          </div>

          <div>
            <label style={labelStyle}>Fecha límite (opcional)</label>
            <input type="date" value={fechaLimite} onChange={e => setFechaLimite(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Prioridad</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {PRIORIDADES.map(p => (
                <button
                  key={p.value}
                  onClick={() => setPrioridad(p.value)}
                  style={{
                    flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                    border: prioridad === p.value ? `1px solid ${p.color}` : '1px solid var(--border)',
                    background: prioridad === p.value ? `${p.color}18` : 'var(--bg)',
                    color: prioridad === p.value ? p.color : 'var(--text-2)',
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ padding: 16, paddingBottom: 'max(env(safe-area-inset-bottom), 16px)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            onClick={() => onGuardar({ titulo, descripcion, fechaLimite, prioridad, area })}
            disabled={saving || !titulo.trim()}
            style={{
              width: '100%', padding: 13, borderRadius: 12, border: 'none',
              background: 'var(--navy)', color: '#fff', fontSize: 14, fontWeight: 700,
              cursor: 'pointer', opacity: (saving || !titulo.trim()) ? 0.6 : 1, fontFamily: 'inherit',
            }}
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
          {onEliminar && (
            <button
              onClick={onEliminar}
              style={{
                width: '100%', padding: 12, borderRadius: 12,
                border: '1px solid rgba(220,38,38,.3)', background: 'none', color: '#dc2626',
                fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Eliminar tarea
            </button>
          )}
          <button
            onClick={onClose}
            style={{
              width: '100%', padding: 12, borderRadius: 12,
              background: 'transparent', border: '1px solid var(--border)',
              fontSize: 13, color: 'var(--text-3)', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
