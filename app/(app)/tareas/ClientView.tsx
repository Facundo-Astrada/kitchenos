'use client'

import { useState, useMemo, useCallback } from 'react'
import { useAuth } from '@/lib/auth/context'
import { useTareas } from '@/lib/hooks/useTareas'
import { useRestauranteId } from '@/lib/hooks/useRestauranteId'
import { OpsToggle } from '@/components/ops/OpsToggle'
import { SeccionOps } from '@/components/ops/SeccionOps'
import { EventoBanner } from '@/components/ops/EventoBanner'
import type { Tarea, OpsModo, OpsEstado } from '@/types'

function getToday() { return new Date().toISOString().split('T')[0] }
function fmtFecha(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
}

// ── Secciones por modo ────────────────────────────────────────
const SECCIONES_MENU = [
  { id: 'apetizer',  label: 'Apetizer',  color: '#0ea5e9' },
  { id: 'entrada',   label: 'Entrada',   color: '#8b5cf6' },
  { id: 'proteina',  label: 'Proteína',  color: '#ef4444' },
  { id: 'pasta',     label: 'Pasta',     color: '#f97316' },
  { id: 'veggie',    label: 'Veggie',    color: '#22c55e' },
  { id: 'postre',    label: 'Postre',    color: '#ec4899' },
] as const

const SECCIONES_CARTA = [
  { id: 'caliente',    label: 'Cocina Caliente', color: '#ef4444' },
  { id: 'fria',        label: 'Cocina Fría',     color: '#0ea5e9' },
  { id: 'pasteleria',  label: 'Pastelería',      color: '#ec4899' },
  { id: 'salon',       label: 'Salón',           color: '#8b5cf6' },
  { id: 'general',     label: 'General',         color: '#64748b' },
] as const

const btnReset: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
  display: 'flex', alignItems: 'center', fontFamily: 'inherit',
}

// ── Main Page ─────────────────────────────────────────────────
export default function TareasPage({ embedded }: { embedded?: boolean } = {}) {
  const { perfil } = useAuth()
  const restauranteId = useRestauranteId()
  const { tareas, loading, agregarTarea, cambiarEstado } = useTareas()

  const today = getToday()

  // Modo — persiste en localStorage
  const [modo, setModo] = useState<OpsModo>(() => {
    if (typeof window === 'undefined') return 'carta'
    return (localStorage.getItem('ops_modo') as OpsModo) ?? 'carta'
  })
  const [seccionesExtra, setSeccionesExtra] = useState<string[]>([])
  const [addingSeccion, setAddingSeccion] = useState(false)
  const [nuevaSeccion, setNuevaSeccion] = useState('')

  function handleModoChange(m: OpsModo) {
    setModo(m)
    localStorage.setItem('ops_modo', m)
  }

  // ── Filtrar y agrupar tareas ──────────────────────────────────
  const { topLevel, subtareasByParent, statsHoy } = useMemo(() => {
    const hoyCandidates = tareas.filter((t) =>
      t.modo === modo && !t.parent_id &&
      (!t.turno_fecha || t.turno_fecha === today ||
        (t.turno_fecha < today && t.estado !== 'listo'))
    ).sort((a, b) => {
      const aHoy = !a.turno_fecha || a.turno_fecha === today
      const bHoy = !b.turno_fecha || b.turno_fecha === today
      if (aHoy && !bHoy) return -1
      if (!aHoy && bHoy) return 1
      return 0
    })
    const subs = tareas.filter((t) => t.parent_id != null)
    const subMap: Record<string, Tarea[]> = {}
    for (const s of subs) {
      const pid = s.parent_id!
      if (!subMap[pid]) subMap[pid] = []
      subMap[pid].push(s)
    }
    const totalHoy = tareas.filter((t) => t.turno_fecha === today && !t.parent_id)
    const listosHoy = totalHoy.filter((t) => t.estado === 'listo').length
    return {
      topLevel: hoyCandidates,
      subtareasByParent: subMap,
      statsHoy: { listos: listosHoy, total: totalHoy.length },
    }
  }, [tareas, modo, today])

  const secciones = modo === 'menu' ? [...SECCIONES_MENU] : [
    ...SECCIONES_CARTA,
    ...seccionesExtra.map((s) => ({ id: s, label: s, color: '#94a3b8' })),
  ]

  // ── Agregar item a sección ────────────────────────────────────
  const handleAddItem = useCallback(async (seccion: string, titulo: string) => {
    await agregarTarea({
      titulo,
      modo,
      seccion,
      turno_fecha: today,
      estado: 'pendiente',
      status: 'pendiente',
      prioridad: 'baja',
      categoria: 'produccion',
      asignado_a: null,
      creado_por: perfil?.miembro_id ?? null,
      descripcion: null,
      plaza: null,
      fecha_limite: null,
      tiempo_estimado_min: null,
      receta_id: null,
      checklist: [],
    })
  }, [agregarTarea, modo, today, perfil])

  // ── Agregar sub-tarea ─────────────────────────────────────────
  const handleAddSubtarea = useCallback(async (parentId: string, titulo: string) => {
    const parent = tareas.find((t) => t.id === parentId)
    if (!parent) return
    await agregarTarea({
      titulo,
      modo: parent.modo ?? modo,
      seccion: parent.seccion ?? 'general',
      parent_id: parentId,
      turno_fecha: today,
      estado: 'pendiente',
      status: 'pendiente',
      prioridad: 'baja',
      categoria: 'produccion',
      asignado_a: null,
      creado_por: perfil?.miembro_id ?? null,
      descripcion: null,
      plaza: null,
      fecha_limite: null,
      tiempo_estimado_min: null,
      receta_id: null,
      checklist: [],
    })
  }, [agregarTarea, tareas, modo, today, perfil])

  // ── Generar lista desde evento ────────────────────────────────
  const handleGenerarLista = useCallback(async (seccionIds: string[], eventoTitulo: string) => {
    for (const seccionId of seccionIds) {
      const secLabel = secciones.find(s => s.id === seccionId)?.label ?? seccionId
      await agregarTarea({
        titulo: `${secLabel} — ${eventoTitulo}`,
        modo,
        seccion: seccionId,
        turno_fecha: today,
        estado: 'pendiente',
        status: 'pendiente',
        prioridad: 'baja',
        categoria: 'produccion',
        asignado_a: null,
        creado_por: perfil?.miembro_id ?? null,
        descripcion: null,
        plaza: null,
        fecha_limite: null,
        tiempo_estimado_min: null,
        receta_id: null,
        checklist: [],
      })
    }
  }, [agregarTarea, modo, today, perfil, secciones])

  // ── Agregar sección custom (CARTA) ────────────────────────────
  function commitNuevaSeccion() {
    const name = nuevaSeccion.trim()
    if (!name) return
    setSeccionesExtra((prev) => prev.includes(name) ? prev : [...prev, name])
    setNuevaSeccion('')
    setAddingSeccion(false)
  }

  const isAdmin = perfil?.rol === 'admin' || perfil?.rol === 'chef'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ── Header ── */}
      <div style={{
        background: 'var(--navy)',
        padding: `${embedded ? 0 : 46}px 16px 12px`,
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#fff' }}>Producción</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', marginTop: 1 }}>
              {fmtFecha(today)}
            </div>
          </div>
          <OpsToggle value={modo} onChange={handleModoChange} />
        </div>

        {/* Stats turno */}
        {statsHoy.total > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'rgba(255,255,255,.08)', borderRadius: 10, padding: '6px 10px',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'rgba(255,255,255,.5)' }}>
              today
            </span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,.55)' }}>
              Hoy: <strong style={{ color: '#fff' }}>{statsHoy.listos}/{statsHoy.total}</strong> listos
            </span>
            <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,.15)', borderRadius: 99 }}>
              <div style={{
                width: `${statsHoy.total > 0 ? (statsHoy.listos / statsHoy.total) * 100 : 0}%`,
                height: '100%', background: '#22c55e', borderRadius: 99, transition: 'width .3s',
              }} />
            </div>
          </div>
        )}
      </div>

      {/* ── Secciones ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px 120px' }}>
        {restauranteId && (
          <EventoBanner
            restauranteId={restauranteId}
            modo={modo}
            onGenerarLista={handleGenerarLista}
          />
        )}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)', fontSize: 13 }}>
            Cargando...
          </div>
        ) : (
          secciones.map((sec) => (
            <SeccionOps
              key={sec.id}
              titulo={sec.label}
              color={sec.color}
              items={topLevel.filter((t) => t.seccion === sec.id)}
              subtareasByParent={subtareasByParent}
              onAddItem={(titulo) => handleAddItem(sec.id, titulo)}
              onEstadoChange={(id, estado) => cambiarEstado(id, estado as OpsEstado)}
              onAddSubtarea={handleAddSubtarea}
              modo={modo}
            />
          ))
        )}

        {/* Input nueva sección */}
        {addingSeccion && (
          <div style={{ display: 'flex', gap: 6, marginTop: 4, marginBottom: 8 }}>
            <input
              autoFocus
              value={nuevaSeccion}
              onChange={(e) => setNuevaSeccion(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') commitNuevaSeccion(); if (e.key === 'Escape') setAddingSeccion(false) }}
              placeholder="Nombre de la sección..."
              style={{
                flex: 1, background: 'var(--surface)', border: '1px solid var(--accent)',
                borderRadius: 12, padding: '9px 12px', fontSize: 13,
                color: 'var(--text-1)', fontFamily: 'inherit', outline: 'none',
              }}
            />
            <button onClick={commitNuevaSeccion} style={{
              ...btnReset, padding: '0 16px', background: 'var(--navy)', borderRadius: 12,
              color: '#fff', fontSize: 13, fontWeight: 700,
            }}>
              Agregar
            </button>
            <button onClick={() => setAddingSeccion(false)} style={{
              ...btnReset, padding: '0 12px', background: 'var(--surface)',
              border: '1px solid var(--border)', borderRadius: 12, color: 'var(--text-3)', fontSize: 13,
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
            </button>
          </div>
        )}
      </div>

      {/* ── FAB nueva sección (solo modo CARTA, admin/chef) ── */}
      {modo === 'carta' && isAdmin && !addingSeccion && (
        <button
          onClick={() => setAddingSeccion(true)}
          style={{
            position: 'absolute', bottom: 100, right: 16,
            width: 48, height: 48, borderRadius: '50%',
            background: 'var(--navy)', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(28,45,74,.35)',
            zIndex: 10,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 22, color: '#fff' }}>add</span>
        </button>
      )}
    </div>
  )
}
