'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useRestauranteId } from '@/lib/hooks/useRestauranteId'
import { useMesas } from '@/lib/hooks/useMesas'
import { Sillas } from '@/components/salon/Sillas'
import { AVATAR_PALETTE } from '@/components/ui'
import type { Mesa, MesaForma } from '@/types'

type Tab = 'mesas' | 'medios' | 'estaciones'
type Tamano = 'chico' | 'mediano' | 'grande'

interface MedioPago  { id: string; nombre: string; activo: boolean }
interface Estacion   { id: string; nombre: string; pantalla_asignada: string }

const inputStyle: React.CSSProperties = {
  minHeight: 44, borderRadius: 10, background: '#111', color: '#fff',
  border: '1px solid #2a2a2a', padding: '0 12px', fontSize: 15, width: '100%',
}

// ── Editor de mesas — canvas drag (Sesión 3 C3, jul 2026) ────────────────────

const FORMAS: { id: MesaForma; label: string; icon: string }[] = [
  { id: 'cuadrada', label: 'Cuadrada', icon: 'crop_square' },
  { id: 'redonda', label: 'Redonda', icon: 'circle' },
  { id: 'rectangular', label: 'Rectangular', icon: 'crop_landscape' },
]

const TAMANOS: { id: Tamano; label: string; ancho: number; alto: number }[] = [
  { id: 'chico', label: 'Chica', ancho: 6, alto: 6 },
  { id: 'mediano', label: 'Mediana', ancho: 9, alto: 9 },
  { id: 'grande', label: 'Grande', ancho: 13, alto: 13 },
]

function tamanoDesde(mesa: Pick<Mesa, 'ancho' | 'alto' | 'forma'>): Tamano {
  const base = mesa.forma === 'rectangular' ? mesa.alto : mesa.ancho
  let mejor: Tamano = 'mediano'
  let mejorDist = Infinity
  for (const t of TAMANOS) {
    const d = Math.abs(t.ancho - base)
    if (d < mejorDist) { mejorDist = d; mejor = t.id }
  }
  return mejor
}

function dimsDesde(tamano: Tamano, forma: MesaForma): { ancho: number; alto: number } {
  const t = TAMANOS.find(x => x.id === tamano) ?? TAMANOS[1]
  return forma === 'rectangular' ? { ancho: t.ancho * 1.6, alto: t.alto } : { ancho: t.ancho, alto: t.alto }
}

function ROTACIONES(): number[] { return [0, 45, 90] }

// Paleta de identidad (Avatar) + 2 tonos madera/piedra útiles para mobiliario de salón
const MESA_COLORES = [...AVATAR_PALETTE, '#f59e0b', '#78716c']

function MesaCanvasItem({
  mesa, selected, dragPos, resizeDims, onSelect, onDragMove, onDragEnd, onResizeMove, onResizeEnd,
}: {
  mesa: Mesa
  selected: boolean
  dragPos: { x: number; y: number } | null
  resizeDims: { ancho: number; alto: number } | null
  onSelect: (mesa: Mesa) => void
  onDragMove: (id: string, x: number, y: number) => void
  onDragEnd: (id: string, x: number, y: number) => void
  onResizeMove: (id: string, ancho: number, alto: number) => void
  onResizeEnd: (id: string, ancho: number, alto: number) => void
}) {
  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number; moved: boolean; canvasW: number; canvasH: number } | null>(null)
  const resizeRef = useRef<{ startX: number; startY: number; startAncho: number; startAlto: number; canvasW: number; canvasH: number } | null>(null)

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    const canvas = e.currentTarget.closest('[data-canvas]') as HTMLElement | null
    const rect = canvas?.getBoundingClientRect()
    dragRef.current = {
      startX: e.clientX, startY: e.clientY,
      startPosX: mesa.pos_x, startPosY: mesa.pos_y,
      moved: false,
      canvasW: rect?.width ?? 1, canvasH: rect?.height ?? 1,
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const dr = dragRef.current
    if (!dr) return
    const dx = e.clientX - dr.startX
    const dy = e.clientY - dr.startY
    if (!dr.moved && Math.hypot(dx, dy) < 8) return
    dr.moved = true
    const x = Math.min(94, Math.max(0, dr.startPosX + (dx / dr.canvasW) * 100))
    const y = Math.min(94, Math.max(0, dr.startPosY + (dy / dr.canvasH) * 100))
    onDragMove(mesa.id, x, y)
  }

  function onPointerUp() {
    const dr = dragRef.current
    dragRef.current = null
    if (dr?.moved && dragPos) onDragEnd(mesa.id, dragPos.x, dragPos.y)
    else onSelect(mesa)
  }

  function onResizePointerDown(e: React.PointerEvent<HTMLSpanElement>) {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    const canvas = e.currentTarget.closest('[data-canvas]') as HTMLElement | null
    const rect = canvas?.getBoundingClientRect()
    resizeRef.current = {
      startX: e.clientX, startY: e.clientY,
      startAncho: mesa.ancho, startAlto: mesa.alto,
      canvasW: rect?.width ?? 1, canvasH: rect?.height ?? 1,
    }
  }

  function onResizePointerMove(e: React.PointerEvent<HTMLSpanElement>) {
    e.stopPropagation()
    const rr = resizeRef.current
    if (!rr) return
    const dx = e.clientX - rr.startX
    const dy = e.clientY - rr.startY
    const ancho = Math.min(70, Math.max(5, rr.startAncho + (dx / rr.canvasW) * 100))
    const alto = Math.min(70, Math.max(5, rr.startAlto + (dy / rr.canvasH) * 100))
    onResizeMove(mesa.id, ancho, alto)
  }

  function onResizePointerUp(e: React.PointerEvent<HTMLSpanElement>) {
    e.stopPropagation()
    const rr = resizeRef.current
    resizeRef.current = null
    if (rr && resizeDims) onResizeEnd(mesa.id, resizeDims.ancho, resizeDims.alto)
  }

  const x = dragPos?.x ?? mesa.pos_x
  const y = dragPos?.y ?? mesa.pos_y
  const anchoUi = Math.max(resizeDims?.ancho ?? mesa.ancho, 5)
  const altoUi = Math.max(resizeDims?.alto ?? mesa.alto, 5)
  const capacidad = mesa.capacidad ?? 4

  return (
    <button
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{
        position: 'absolute',
        left: `${x}%`,
        top: `${y}%`,
        width: `${anchoUi}%`,
        aspectRatio: `${anchoUi} / ${altoUi}`,
        borderRadius: mesa.forma === 'redonda' ? '50%' : 10,
        transform: `rotate(${mesa.rotacion}deg)`,
        background: mesa.color ?? (selected ? 'var(--accent)' : '#2a2a2a'),
        border: selected ? '2px solid #fff' : mesa.color ? '1px solid rgba(255,255,255,.3)' : '1px solid #444',
        color: '#fff',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        cursor: 'grab',
        minWidth: 64, minHeight: 64,
      }}
    >
      <Sillas forma={mesa.forma} capacidad={capacidad} ancho={anchoUi} alto={altoUi} tamano={9} />
      <span style={{ fontSize: 16, fontWeight: 700, transform: `rotate(${-mesa.rotacion}deg)` }}>{mesa.numero}</span>
      <span style={{ fontSize: 11, opacity: 0.75, transform: `rotate(${-mesa.rotacion}deg)` }}>{capacidad}p</span>
      {selected && (
        <span
          onPointerDown={onResizePointerDown}
          onPointerMove={onResizePointerMove}
          onPointerUp={onResizePointerUp}
          style={{
            position: 'absolute', right: -11, bottom: -11, width: 24, height: 24, borderRadius: '50%',
            background: '#fff', border: '2px solid var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            touchAction: 'none', cursor: 'nwse-resize',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--accent)', transform: `rotate(${-mesa.rotacion}deg)` }}>open_in_full</span>
        </span>
      )}
    </button>
  )
}

function MesaPanel({
  mesa, onChange, onDelete, onCerrar,
}: {
  mesa: Mesa
  onChange: (id: string, datos: Partial<Mesa>) => void
  onDelete: (id: string) => void
  onCerrar: () => void
}) {
  const tamano = tamanoDesde(mesa)

  return (
    <div style={{ background: '#1a1a1a', borderRadius: '16px 16px 0 0', padding: '16px 16px 24px', display: 'flex', flexDirection: 'column', gap: 14, borderTop: '1px solid #2a2a2a' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p style={{ fontWeight: 700, color: '#fff', fontSize: 16 }}>Mesa {mesa.numero}</p>
        <button onClick={onCerrar} style={{ background: 'none', border: 'none', color: '#aaa', fontSize: 14, minHeight: 44 }}>Listo</button>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 12, color: '#888' }}>Número / nombre</span>
          <input value={mesa.numero} onChange={e => onChange(mesa.id, { numero: e.target.value })} style={inputStyle} />
        </label>
        <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 12, color: '#888' }}>Sector</span>
          <input value={mesa.sector ?? ''} onChange={e => onChange(mesa.id, { sector: e.target.value })} placeholder="Salón, Terraza..." style={inputStyle} />
        </label>
        <label style={{ width: 76, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 12, color: '#888' }}>Cap.</span>
          <input type="number" min={1} value={mesa.capacidad ?? 4} onChange={e => onChange(mesa.id, { capacidad: parseInt(e.target.value) || 4 })} style={inputStyle} />
        </label>
      </div>

      <div>
        <p style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>Forma</p>
        <div style={{ display: 'flex', gap: 8 }}>
          {FORMAS.map(f => {
            const activo = mesa.forma === f.id
            const dims = dimsDesde(tamano, f.id)
            return (
              <button
                key={f.id}
                onClick={() => onChange(mesa.id, { forma: f.id, ...dims })}
                style={{
                  flex: 1, minHeight: 64, borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
                  background: activo ? 'var(--accent)' : '#111', border: activo ? '1px solid var(--accent)' : '1px solid #2a2a2a', color: '#fff',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 22 }}>{f.icon}</span>
                <span style={{ fontSize: 11 }}>{f.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <p style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>Tamaño</p>
        <div style={{ display: 'flex', gap: 8 }}>
          {TAMANOS.map(t => {
            const activo = tamano === t.id
            return (
              <button
                key={t.id}
                onClick={() => onChange(mesa.id, dimsDesde(t.id, mesa.forma))}
                style={{ flex: 1, minHeight: 64, borderRadius: 10, background: activo ? 'var(--accent)' : '#111', border: activo ? '1px solid var(--accent)' : '1px solid #2a2a2a', color: '#fff', fontSize: 13, fontWeight: 600 }}
              >
                {t.label}
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <p style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>Color</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={() => onChange(mesa.id, { color: null })}
            aria-label="Sin color"
            style={{
              width: 34, height: 34, borderRadius: '50%', background: '#111',
              border: !mesa.color ? '2px solid #fff' : '1px solid #2a2a2a',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#666' }}>block</span>
          </button>
          {MESA_COLORES.map(c => (
            <button
              key={c}
              onClick={() => onChange(mesa.id, { color: c })}
              aria-label={c}
              style={{
                width: 34, height: 34, borderRadius: '50%', background: c,
                border: mesa.color === c ? '2px solid #fff' : '1px solid rgba(255,255,255,.2)',
              }}
            />
          ))}
        </div>
      </div>

      <div>
        <p style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>Rotación</p>
        <div style={{ display: 'flex', gap: 8 }}>
          {ROTACIONES().map(r => {
            const activo = mesa.rotacion === r
            return (
              <button
                key={r}
                onClick={() => onChange(mesa.id, { rotacion: r })}
                style={{ flex: 1, minHeight: 64, borderRadius: 10, background: activo ? 'var(--accent)' : '#111', border: activo ? '1px solid var(--accent)' : '1px solid #2a2a2a', color: '#fff', fontSize: 13, fontWeight: 600 }}
              >
                {r}°
              </button>
            )
          })}
        </div>
      </div>

      <button
        onClick={() => onDelete(mesa.id)}
        style={{ minHeight: 48, borderRadius: 10, background: '#2a1a1a', border: '1px solid #4a2a2a', color: '#e57373', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span> Eliminar mesa
      </button>
    </div>
  )
}

function EditorMesas() {
  const RID = useRestauranteId()
  const { mesas, loading, crearMesa, actualizarMesa, eliminarMesa, guardarLayout } = useMesas()
  const [seleccionId, setSeleccionId] = useState<string | null>(null)
  const [dragPos, setDragPos] = useState<{ id: string; x: number; y: number } | null>(null)
  const [resizePos, setResizePos] = useState<{ id: string; ancho: number; alto: number } | null>(null)
  const [creando, setCreando] = useState(false)

  const seleccionada = mesas.find(m => m.id === seleccionId) ?? null

  async function onCrear() {
    if (!RID) return
    setCreando(true)
    try {
      const numero = String(mesas.length + 1)
      const id = await crearMesa({
        numero, sector: 'Salón', capacidad: 4, forma: 'cuadrada', ancho: 9, alto: 9, rotacion: 0,
        pos_x: 40, pos_y: 40,
      })
      setSeleccionId(id)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Error al crear la mesa')
    } finally {
      setCreando(false)
    }
  }

  function onChangeMesa(id: string, datos: Partial<Mesa>) {
    actualizarMesa(id, datos).catch((e: unknown) => alert(e instanceof Error ? e.message : 'Error al guardar'))
  }

  function onDragMove(id: string, x: number, y: number) {
    setDragPos({ id, x, y })
  }

  async function onDragEnd(id: string, x: number, y: number) {
    setDragPos(null)
    try {
      await guardarLayout([{ id, pos_x: x, pos_y: y }])
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Error al guardar la posición')
    }
  }

  function onResizeMove(id: string, ancho: number, alto: number) {
    setResizePos({ id, ancho, alto })
  }

  async function onResizeEnd(id: string, ancho: number, alto: number) {
    setResizePos(null)
    try {
      await actualizarMesa(id, { ancho, alto })
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Error al guardar el tamaño')
    }
  }

  async function onDelete(id: string) {
    if (!confirm('¿Eliminar esta mesa?')) return
    setSeleccionId(null)
    try { await eliminarMesa(id) } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error al eliminar') }
  }

  if (loading) return <p style={{ color: '#666', textAlign: 'center', padding: 32 }}>Cargando mesas...</p>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p style={{ fontSize: 13, color: '#888' }}>Arrastrá las mesas para armar el plano de tu salón</p>
        <button
          onClick={onCrear}
          disabled={creando}
          style={{ minHeight: 40, padding: '0 14px', borderRadius: 10, background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, opacity: creando ? 0.6 : 1 }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span> Mesa
        </button>
      </div>

      <div
        data-canvas
        style={{
          position: 'relative', flex: 1, minHeight: 420, background: '#161616',
          border: '1px solid #2a2a2a', borderRadius: 14, overflow: 'hidden',
          backgroundImage: 'radial-gradient(circle, #232323 1px, transparent 1px)', backgroundSize: '24px 24px',
        }}
      >
        {mesas.length === 0 && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#555' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 40 }}>table_restaurant</span>
            <p>Sin mesas todavía — tocá "+ Mesa" para agregar la primera</p>
          </div>
        )}
        {mesas.map(m => (
          <MesaCanvasItem
            key={m.id}
            mesa={m}
            selected={seleccionId === m.id}
            dragPos={dragPos?.id === m.id ? { x: dragPos.x, y: dragPos.y } : null}
            resizeDims={resizePos?.id === m.id ? { ancho: resizePos.ancho, alto: resizePos.alto } : null}
            onSelect={mesa => setSeleccionId(mesa.id)}
            onDragMove={onDragMove}
            onDragEnd={onDragEnd}
            onResizeMove={onResizeMove}
            onResizeEnd={onResizeEnd}
          />
        ))}
      </div>

      {seleccionada && (
        <MesaPanel
          mesa={seleccionada}
          onChange={onChangeMesa}
          onDelete={onDelete}
          onCerrar={() => setSeleccionId(null)}
        />
      )}
    </div>
  )
}

// ── Página ─────────────────────────────────────────────────────────────────

export default function SalonConfigPage() {
  const router  = useRouter()
  const RID     = useRestauranteId()
  const supabase = createClient()
  const [tab,    setTab]    = useState<Tab>('mesas')

  // Medios de pago
  const [medios,      setMedios]      = useState<MedioPago[]>([])
  const [nuevoMedio,  setNuevoMedio]  = useState('')
  const [guardandoMedio, setGuardandoMedio] = useState(false)

  // Estaciones KDS
  const [estaciones,    setEstaciones]    = useState<Estacion[]>([])
  const [nuevaEstacion, setNuevaEstacion] = useState('')
  const [guardandoEst,  setGuardandoEst]  = useState(false)

  const fetchMedios = useCallback(async () => {
    if (!RID) return
    const { data } = await supabase.from('medios_pago').select('*').eq('restaurante_id', RID).order('nombre')
    setMedios((data ?? []) as MedioPago[])
  }, [RID, supabase])

  const fetchEstaciones = useCallback(async () => {
    if (!RID) return
    const { data } = await supabase.from('estaciones').select('*').eq('restaurante_id', RID).order('nombre')
    setEstaciones((data ?? []) as Estacion[])
  }, [RID, supabase])

  useEffect(() => { fetchMedios(); fetchEstaciones() }, [fetchMedios, fetchEstaciones])

  // ── Medios de pago ───────────────────────────────────────────────────────────

  async function guardarMedio() {
    if (!RID || !nuevoMedio.trim()) return
    setGuardandoMedio(true)
    try {
      await supabase.from('medios_pago').insert({ restaurante_id: RID, nombre: nuevoMedio.trim(), activo: true })
      setNuevoMedio('')
      await fetchMedios()
    } finally { setGuardandoMedio(false) }
  }

  async function toggleMedio(id: string, activo: boolean) {
    await supabase.from('medios_pago').update({ activo: !activo }).eq('id', id)
    await fetchMedios()
  }

  async function eliminarMedio(id: string) {
    if (!confirm('¿Eliminar este medio de pago?')) return
    await supabase.from('medios_pago').delete().eq('id', id)
    await fetchMedios()
  }

  // ── Estaciones KDS ───────────────────────────────────────────────────────────

  async function guardarEstacion() {
    if (!RID || !nuevaEstacion.trim()) return
    setGuardandoEst(true)
    try {
      await supabase.from('estaciones').insert({ restaurante_id: RID, nombre: nuevaEstacion.trim(), pantalla_asignada: nuevaEstacion.trim().toLowerCase().replace(/\s+/g, '_') })
      setNuevaEstacion('')
      await fetchEstaciones()
    } finally { setGuardandoEst(false) }
  }

  async function eliminarEstacion(id: string) {
    if (!confirm('¿Eliminar esta estación?')) return
    await supabase.from('estaciones').delete().eq('id', id)
    await fetchEstaciones()
  }

  // ── UI ───────────────────────────────────────────────────────────────────────

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1, minHeight: 44, background: active ? '#1c2d4a' : 'transparent',
    color: active ? '#fff' : '#aaa', border: 'none', fontWeight: active ? 700 : 500, fontSize: 14,
  })

  return (
    <div style={{ background: '#111', minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ background: '#1c2d4a', padding: '46px 16px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: '#fff', minWidth: 44, minHeight: 44 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 28 }}>arrow_back</span>
        </button>
        <p style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>Configuración del salón</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', background: '#1a1a1a', borderBottom: '1px solid #2a2a2a' }}>
        {(['mesas', 'medios', 'estaciones'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={tabStyle(tab === t)}>
            {t === 'mesas' ? 'Mesas' : t === 'medios' ? 'Medios de pago' : 'Estaciones KDS'}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: tab === 'mesas' ? 'hidden' : 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0 }}>

        {/* ── MESAS ─────────────────────────────────────────────────────────── */}
        {tab === 'mesas' && <EditorMesas />}

        {/* ── MEDIOS DE PAGO ───────────────────────────────────────────────── */}
        {tab === 'medios' && (
          <>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={nuevoMedio} onChange={e => setNuevoMedio(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') guardarMedio() }}
                placeholder="Efectivo, Débito, MP, QR..."
                style={{ ...inputStyle, flex: 1 }} />
              <button onClick={guardarMedio} disabled={guardandoMedio || !nuevoMedio.trim()}
                style={{ minWidth: 52, minHeight: 44, borderRadius: 10, background: '#1c2d4a', color: '#fff', fontWeight: 700, opacity: guardandoMedio ? 0.6 : 1 }}>
                <span className="material-symbols-outlined">add</span>
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {medios.map(m => (
                <div key={m.id} style={{ background: '#1a1a1a', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: m.activo ? '#1e3320' : '#2a2a2a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20, color: m.activo ? '#4caf50' : '#555' }}>
                      {m.nombre.toLowerCase().includes('efectivo') ? 'payments' : m.nombre.toLowerCase().includes('débito') || m.nombre.toLowerCase().includes('credito') ? 'credit_card' : 'qr_code'}
                    </span>
                  </div>
                  <span style={{ color: '#fff', flex: 1, fontWeight: 600 }}>{m.nombre}</span>
                  <button onClick={() => toggleMedio(m.id, m.activo)} style={{ background: m.activo ? '#1e3320' : '#2a2a2a', border: 'none', borderRadius: 8, padding: '6px 12px', color: m.activo ? '#4caf50' : '#555', fontSize: 13 }}>
                    {m.activo ? 'Activo' : 'Inactivo'}
                  </button>
                  <button onClick={() => eliminarMedio(m.id)} style={{ background: 'none', border: 'none', color: '#e57373', padding: 4 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
                  </button>
                </div>
              ))}
              {medios.length === 0 && <p style={{ color: '#555', textAlign: 'center', padding: 24 }}>Sin medios de pago. Agregá al menos uno para poder cobrar.</p>}
            </div>
          </>
        )}

        {/* ── ESTACIONES KDS ──────────────────────────────────────────────── */}
        {tab === 'estaciones' && (
          <>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={nuevaEstacion} onChange={e => setNuevaEstacion(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') guardarEstacion() }}
                placeholder="Parrilla, Frío, Pastelería..."
                style={{ ...inputStyle, flex: 1 }} />
              <button onClick={guardarEstacion} disabled={guardandoEst || !nuevaEstacion.trim()}
                style={{ minWidth: 52, minHeight: 44, borderRadius: 10, background: '#1c2d4a', color: '#fff', fontWeight: 700, opacity: guardandoEst ? 0.6 : 1 }}>
                <span className="material-symbols-outlined">add</span>
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {estaciones.map(e => (
                <div key={e.id} style={{ background: '#1a1a1a', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span className="material-symbols-outlined" style={{ color: '#4361a0', fontSize: 22 }}>kitchen</span>
                  <div style={{ flex: 1 }}>
                    <p style={{ color: '#fff', fontWeight: 700 }}>{e.nombre}</p>
                    <p style={{ color: '#555', fontSize: 12 }}>pantalla: {e.pantalla_asignada}</p>
                  </div>
                  <button onClick={() => eliminarEstacion(e.id)} style={{ background: 'none', border: 'none', color: '#e57373', padding: 4 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
                  </button>
                </div>
              ))}
              {estaciones.length === 0 && (
                <div style={{ background: '#1a1010', borderRadius: 12, padding: '14px 16px' }}>
                  <p style={{ color: '#e57373', fontWeight: 600 }}>Sin estaciones KDS</p>
                  <p style={{ color: '#aaa', fontSize: 13, marginTop: 4 }}>Las estaciones definen a qué pantalla de KDS va cada ítem de la carta. Creá una y luego asignala en cada ítem de la carta.</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
