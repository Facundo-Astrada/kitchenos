'use client'

import { useRef, useState, useCallback, useMemo, useEffect } from 'react'
import { useIsDesktop } from '@/lib/hooks/useIsDesktop'
import { useEspacios } from '@/lib/hooks/useEspacios'
import { useChecklist } from '@/lib/hooks/useChecklist'
import type { MisePlaceItem, ChecklistSeccionConfig, Plaza, RutinaFrecuencia } from '@/types'
import EspacioCard from './components/EspacioCard'
import LimpiezaPanel from './components/LimpiezaPanel'

const DEFAULT_SECCIONES_BOARD = [
  { nombre: 'Heladera',       icono: 'kitchen',     orden: 0 },
  { nombre: 'Secos / Tuppers', icono: 'inventory_2', orden: 1 },
  { nombre: 'Congelados',     icono: 'severe_cold',  orden: 2 },
  { nombre: 'Estación',       icono: 'countertops',  orden: 3 },
]

type LimpiezaScope = { type: 'espacio' | 'plaza' | 'seccion'; plazas: Plaza[]; nombre: string }

export default function EspaciosClientView() {
  const isDesktop = useIsDesktop()
  const { espacios, espacioPlazas, plazasUsadas, loading: loadingEsp, agregarEspacio, actualizarEspacio, eliminarEspacio, asignarPlaza, quitarPlaza } = useEspacios()
  const { secciones, items, rutinas, loading: loadingCk, agregarSeccion, eliminarSeccion, agregarItem, eliminarItem, actualizarItem, agregarRutina, eliminarRutina } = useChecklist()

  // ── Drag state ──
  const [draggingItem, setDraggingItem] = useState<MisePlaceItem | null>(null)
  const [ghostPos, setGhostPos] = useState<{ x: number; y: number } | null>(null)
  const [overSecId, setOverSecId] = useState<string | null>(null)
  const dropZonesRef = useRef<Map<string, { el: HTMLElement; plaza: Plaza }>>(new Map())

  // ── Limpieza panel ──
  const [limpiezaScope, setLimpiezaScope] = useState<LimpiezaScope | null>(null)

  // ── Agregar espacio ──
  const [showNuevoEspacio, setShowNuevoEspacio] = useState(false)
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [guardandoEsp, setGuardandoEsp] = useState(false)

  // ── Agregar producción ──
  const [addItemTarget, setAddItemTarget] = useState<ChecklistSeccionConfig | null>(null)
  const [newItemNombre, setNewItemNombre] = useState('')
  const [newItemCantidad, setNewItemCantidad] = useState('')
  const [newItemUnidad, setNewItemUnidad] = useState('u')
  const [guardandoItem, setGuardandoItem] = useState(false)

  const loading = loadingEsp || loadingCk

  // ── Drag helpers ──
  const registerDropZone = useCallback((secId: string, el: HTMLElement | null, plaza: Plaza) => {
    if (el) dropZonesRef.current.set(secId, { el, plaza })
    else dropZonesRef.current.delete(secId)
  }, [])

  const onDragStart = useCallback((item: MisePlaceItem) => {
    setDraggingItem(item)
  }, [])

  const onDragMove = useCallback((x: number, y: number) => {
    setGhostPos({ x, y })
    // Hit-test drop zones
    let found: string | null = null
    for (const [secId, { el }] of dropZonesRef.current.entries()) {
      const rect = el.getBoundingClientRect()
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        found = secId; break
      }
    }
    setOverSecId(found)
  }, [])

  const onDragEnd = useCallback(async () => {
    if (!draggingItem || !overSecId) { setDraggingItem(null); setGhostPos(null); setOverSecId(null); return }
    const zone = dropZonesRef.current.get(overSecId)
    if (!zone || (overSecId === draggingItem.seccion_id && zone.plaza === draggingItem.plaza)) {
      setDraggingItem(null); setGhostPos(null); setOverSecId(null); return
    }
    try {
      await actualizarItem(draggingItem.id, { seccion_id: overSecId, plaza: zone.plaza })
    } catch (e) {
      console.error('[Espacios] drag error', e)
    }
    setDraggingItem(null); setGhostPos(null); setOverSecId(null)
  }, [draggingItem, overSecId, actualizarItem])

  // ── Seed secciones base para una plaza ──
  const seedingRef = useRef<Set<Plaza>>(new Set())
  const onSeedSecciones = useCallback(async (plaza: Plaza) => {
    if (seedingRef.current.has(plaza)) return
    seedingRef.current.add(plaza)
    try {
      for (const def of DEFAULT_SECCIONES_BOARD) await agregarSeccion({ ...def, plaza })
    } finally {
      seedingRef.current.delete(plaza)
    }
  }, [agregarSeccion])

  // ── Agregar espacio ──
  async function handleAgregarEspacio() {
    if (!nuevoNombre.trim()) return
    setGuardandoEsp(true)
    try {
      await agregarEspacio({ nombre: nuevoNombre.trim() })
      setNuevoNombre(''); setShowNuevoEspacio(false)
    } finally { setGuardandoEsp(false) }
  }

  // ── Agregar producción ──
  async function handleAgregarItem() {
    if (!addItemTarget || !newItemNombre.trim()) return
    setGuardandoItem(true)
    try {
      await agregarItem({
        plaza: addItemTarget.plaza as Plaza,
        seccion_id: addItemTarget.id,
        nombre: newItemNombre.trim(),
        cantidad: Number(newItemCantidad) || 0,
        unidad: newItemUnidad || 'u',
        prioridad: 'chk',
      })
      setNewItemNombre(''); setNewItemCantidad(''); setAddItemTarget(null)
    } finally { setGuardandoItem(false) }
  }

  // ── Agregar seccion ──
  async function onAddSeccion(plaza: Plaza) {
    const nombre = window.prompt('Nombre de la nueva sección:')?.trim()
    if (!nombre) return
    await agregarSeccion({ nombre, icono: 'folder', orden: secciones.filter(s => s.plaza === plaza).length, plaza })
  }

  // Guard desktop
  if (!isDesktop) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'var(--text-3)' }}>desktop_windows</span>
        <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-2)', textAlign: 'center' }}>Esta vista es para la computadora</p>
        <p style={{ fontSize: 13, color: 'var(--text-3)', textAlign: 'center' }}>Abrila desde una pantalla más grande para organizar tus espacios.</p>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{ background: 'var(--navy)', padding: '28px 28px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="material-symbols-outlined" style={{ color: 'white', fontSize: 26 }}>dashboard</span>
          <div>
            <h1 style={{ color: 'white', fontWeight: 800, fontSize: 20, letterSpacing: '-0.02em', margin: 0 }}>Mesa de trabajo</h1>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 }}>Organizá espacios, plazas y producciones</p>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <button
              onClick={() => setShowNuevoEspacio(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)',
                color: 'white', borderRadius: 10, padding: '8px 14px',
                cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
              Nuevo espacio
            </button>
          </div>
        </div>
      </div>

      {/* Board */}
      <div style={{ padding: 24 }}>
        {loading && (
          <p style={{ color: 'var(--text-3)', fontSize: 14 }}>Cargando espacios…</p>
        )}

        {!loading && espacios.length === 0 && (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'var(--text-3)', display: 'block', marginBottom: 12 }}>dashboard</span>
            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>Sin espacios todavía</p>
            <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Creá el primer espacio con el botón de arriba.</p>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {espacios.map(espacio => {
            const plazasDelEspacio = espacioPlazas.filter(ep => ep.espacio_id === espacio.id)
            return (
              <EspacioCard
                key={espacio.id}
                espacio={espacio}
                plazasDelEspacio={plazasDelEspacio}
                plazasUsadas={plazasUsadas}
                secciones={secciones}
                items={items}
                overSecId={overSecId}
                registerDropZone={registerDropZone}
                draggingId={draggingItem?.id ?? null}
                onDragStart={onDragStart}
                onDragMove={onDragMove}
                onDragEnd={onDragEnd}
                onActualizar={actualizarEspacio}
                onEliminar={eliminarEspacio}
                onAsignarPlaza={asignarPlaza}
                onQuitarPlaza={quitarPlaza}
                onAddSeccion={onAddSeccion}
                onSeedSecciones={onSeedSecciones}
                onAddItem={(sec) => setAddItemTarget(sec)}
                onDeleteSeccion={eliminarSeccion}
                onDeleteItem={eliminarItem}
                onLimpieza={setLimpiezaScope}
              />
            )
          })}
        </div>
      </div>

      {/* Ghost drag */}
      {draggingItem && ghostPos && (
        <div style={{
          position: 'fixed',
          left: ghostPos.x + 12,
          top: ghostPos.y - 16,
          zIndex: 999,
          pointerEvents: 'none',
          background: 'var(--surface)',
          border: '2px solid var(--accent)',
          borderRadius: 10, padding: '6px 12px',
          fontSize: 13, fontWeight: 600, color: 'var(--text-1)',
          boxShadow: '0 8px 24px rgba(0,0,0,.18)',
          maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 15, verticalAlign: 'middle', marginRight: 6 }}>drag_indicator</span>
          {draggingItem.nombre}
          {overSecId && <span style={{ fontSize: 11, color: 'var(--accent)', marginLeft: 8 }}>↓ mover acá</span>}
        </div>
      )}

      {/* Modal nuevo espacio */}
      {showNuevoEspacio && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) setShowNuevoEspacio(false) }}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 24, width: 340 }}>
            <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', marginBottom: 16 }}>Nuevo espacio</p>
            <input
              autoFocus
              placeholder="Ej: Cocina, Salón, Almacén…"
              value={nuevoNombre}
              onChange={e => setNuevoNombre(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAgregarEspacio(); if (e.key === 'Escape') setShowNuevoEspacio(false) }}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)',
                background: 'var(--bg)', color: 'var(--text-1)', fontSize: 14, fontFamily: 'inherit',
                marginBottom: 16, boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowNuevoEspacio(false)} style={{ flex: 1, padding: 10, borderRadius: 10, border: '1px solid var(--border)', background: 'none', color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
              <button onClick={handleAgregarEspacio} disabled={!nuevoNombre.trim() || guardandoEsp}
                style={{ flex: 1, padding: 10, borderRadius: 10, border: 'none', background: 'var(--navy)', color: '#fff', cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit', opacity: !nuevoNombre.trim() ? 0.5 : 1 }}>
                {guardandoEsp ? 'Creando…' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal agregar producción */}
      {addItemTarget && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) setAddItemTarget(null) }}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 24, width: 360 }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', marginBottom: 4 }}>Agregar producción</p>
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 14 }}>
              Sección: <b>{addItemTarget.nombre}</b> · Plaza: {addItemTarget.plaza}
            </p>
            <input
              autoFocus
              placeholder="Nombre de la preparación"
              value={newItemNombre}
              onChange={e => setNewItemNombre(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAgregarItem(); if (e.key === 'Escape') setAddItemTarget(null) }}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-1)', fontSize: 13, fontFamily: 'inherit', marginBottom: 10, boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <input
                type="number" placeholder="Cantidad" value={newItemCantidad}
                onChange={e => setNewItemCantidad(e.target.value)}
                style={{ flex: 1, padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-1)', fontSize: 13, fontFamily: 'inherit' }}
              />
              <select value={newItemUnidad} onChange={e => setNewItemUnidad(e.target.value)}
                style={{ flex: 1, padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-1)', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer' }}>
                {['u', 'kg', 'g', 'l', 'ml', 'pax', 'porc', 'bandeja', 'gastro', 'tupper'].map(u => <option key={u}>{u}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setAddItemTarget(null)} style={{ flex: 1, padding: 10, borderRadius: 10, border: '1px solid var(--border)', background: 'none', color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
              <button onClick={handleAgregarItem} disabled={!newItemNombre.trim() || guardandoItem}
                style={{ flex: 1, padding: 10, borderRadius: 10, border: 'none', background: 'var(--navy)', color: '#fff', cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit', opacity: !newItemNombre.trim() ? 0.5 : 1 }}>
                {guardandoItem ? 'Guardando…' : 'Agregar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Panel limpieza */}
      {limpiezaScope && (
        <LimpiezaPanel
          scope={limpiezaScope}
          rutinas={rutinas}
          onClose={() => setLimpiezaScope(null)}
          onAgregarRutina={async (datos) => {
            await agregarRutina(datos)
          }}
          onEliminarRutina={eliminarRutina}
        />
      )}
    </div>
  )
}
