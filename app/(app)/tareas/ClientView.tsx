'use client'

import { useState, useMemo, useCallback } from 'react'
import { useAuth } from '@/lib/auth/context'
import { useTareas } from '@/lib/hooks/useTareas'
import { useRecetas } from '@/lib/hooks/useRecetas'
import { useRestauranteId } from '@/lib/hooks/useRestauranteId'
import { createClient } from '@/lib/supabase/client'
import { OpsToggle } from '@/components/ops/OpsToggle'
import { SeccionOps } from '@/components/ops/SeccionOps'
import { EventoBanner } from '@/components/ops/EventoBanner'
import type { Tarea, OpsModo, OpsEstado, TareaPrioridad } from '@/types'

// Cuando una tarea de producción cambia de estado, refleja en checklist_registros
// Solo aplica a tareas con prefijo "Producción: " (creadas desde Mise)
async function syncMiseCompletado(nombreMise: string, fecha: string, completado: boolean) {
  const supabase = createClient()
  const { data: miseItems } = await supabase
    .from('checklist_items')
    .select('id')
    .ilike('nombre', nombreMise)
  for (const mi of miseItems ?? []) {
    await supabase.from('checklist_registros').upsert(
      { checklist_item_id: mi.id, fecha, turno: 'apertura', completado },
      { onConflict: 'checklist_item_id,fecha,turno' }
    )
  }
}

const PRIO_SORT: Record<string, number> = { critica: 0, alta: 1, media: 2, baja: 3 }

function getToday() { return new Date().toISOString().split('T')[0] }
function fmtFecha(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
}

// ── Prioridades (orden de display) ───────────────────────────
const PRIORIDADES = [
  { id: 'critica',  label: 'SP',  sublabel: 'Super Prioridad', color: '#ef4444' },
  { id: 'alta',     label: 'P',   sublabel: 'Prioridad',       color: '#f97316' },
  { id: 'media',    label: 'REF', sublabel: 'Refuerzo',        color: '#3b82f6' },
  { id: 'baja',     label: 'Check',sublabel: 'Check',           color: '#64748b' },
] as const

// Secciones usadas solo para EventoBanner y handleGenerarLista
const SECCIONES_CARTA = [
  { id: 'caliente', label: 'Cocina Caliente', color: '#ef4444' },
  { id: 'fria',     label: 'Cocina Fría',     color: '#0ea5e9' },
  { id: 'pasteleria', label: 'Pastelería',    color: '#ec4899' },
  { id: 'salon',    label: 'Salón',           color: '#8b5cf6' },
  { id: 'general',  label: 'General',         color: '#64748b' },
] as const
const SECCIONES_MENU = [
  { id: 'apetizer', label: 'Apetizer', color: '#0ea5e9' },
  { id: 'entrada',  label: 'Entrada',  color: '#8b5cf6' },
  { id: 'proteina', label: 'Proteína', color: '#ef4444' },
  { id: 'pasta',    label: 'Pasta',    color: '#f97316' },
  { id: 'veggie',   label: 'Veggie',   color: '#22c55e' },
  { id: 'postre',   label: 'Postre',   color: '#ec4899' },
] as const

// ── Main Page ─────────────────────────────────────────────────
export default function TareasPage({ embedded }: { embedded?: boolean } = {}) {
  const { perfil } = useAuth()
  const restauranteId = useRestauranteId()
  const { tareas, loading, agregarTarea, cambiarEstado } = useTareas()
  const { recetas } = useRecetas()
  const recetasSimple = useMemo(() => recetas.map(r => ({ id: r.id, nombre: r.nombre })), [recetas])

  const today = getToday()

  // Modo — persiste en localStorage
  const [modo, setModo] = useState<OpsModo>(() => {
    if (typeof window === 'undefined') return 'carta'
    return (localStorage.getItem('ops_modo') as OpsModo) ?? 'carta'
  })

  function handleModoChange(m: OpsModo) {
    setModo(m)
    localStorage.setItem('ops_modo', m)
  }

  // ── Filtrar tareas del turno ──────────────────────────────────
  const { topLevel, subtareasByParent, statsHoy } = useMemo(() => {
    const hoyCandidates = tareas.filter((t) =>
      t.modo === modo && !t.parent_id &&
      (!t.turno_fecha || t.turno_fecha === today ||
        (t.turno_fecha < today && t.estado !== 'listo'))
    ).sort((a, b) => {
      // Turno actual primero
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

  // ── Agregar item a sección de prioridad ───────────────────────
  const handleAddItem = useCallback(async (prioridad: string, titulo: string, recetaId?: string) => {
    await agregarTarea({
      titulo,
      modo,
      seccion: 'general',
      turno_fecha: today,
      estado: 'pendiente',
      status: 'pendiente',
      prioridad: prioridad as TareaPrioridad,
      categoria: 'produccion',
      asignado_a: null,
      creado_por: perfil?.miembro_id ?? null,
      descripcion: null,
      plaza: null,
      fecha_limite: null,
      tiempo_estimado_min: null,
      receta_id: recetaId ?? null,
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

  // ── Sync bidireccional con Mise ───────────────────────────────
  // Al cambiar estado de tarea, refleja en checklist_registros si tiene prefijo "Producción: "
  const handleEstadoChange = useCallback(async (id: string, estado: OpsEstado) => {
    await cambiarEstado(id, estado)
    const tarea = tareas.find(t => t.id === id)
    if (!tarea) return
    const nombreMise = tarea.titulo.replace(/^Producción:\s*/, '')
    if (nombreMise === tarea.titulo) return // sin prefijo → no es de mise
    await syncMiseCompletado(nombreMise, today, estado === 'listo')
  }, [cambiarEstado, tareas, today])

  // ── Generar lista desde evento ────────────────────────────────
  const secciones = modo === 'menu' ? [...SECCIONES_MENU] : [...SECCIONES_CARTA]

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ── Header ── */}
      <div style={{
        background: 'var(--navy)',
        padding: `${embedded ? 0 : 46}px 16px 12px`,
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#fff' }}>Producción</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', marginTop: 1 }}>
              {fmtFecha(today)}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <OpsToggle value={modo} onChange={handleModoChange} />
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,.35)', textAlign: 'right', lineHeight: 1.3 }}>
              {modo === 'carta' ? 'Por prioridad' : 'Por categoría de plato'}
            </span>
          </div>
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

      {/* ── Lista agrupada por prioridad ── */}
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
        ) : modo === 'menu' ? (
          // Modo menú: agrupar por sección de plato, ordenar por prioridad dentro de cada una
          SECCIONES_MENU.map((sec) => {
            const items = topLevel
              .filter((t) => t.seccion === sec.id)
              .sort((a, b) => (PRIO_SORT[a.prioridad ?? 'baja'] ?? 3) - (PRIO_SORT[b.prioridad ?? 'baja'] ?? 3))
            return (
              <SeccionOps
                key={sec.id}
                titulo={sec.label}
                color={sec.color}
                items={items}
                subtareasByParent={subtareasByParent}
                onAddItem={(titulo, recetaId) => handleAddItem('media', titulo, recetaId)}
                onEstadoChange={(id, estado) => handleEstadoChange(id, estado as OpsEstado)}
                onAddSubtarea={handleAddSubtarea}
                modo={modo}
                showPrioChip
                recetas={recetasSimple}
              />
            )
          })
        ) : (
          // Modo carta: agrupar por prioridad
          PRIORIDADES.map((prio) => {
            const items = topLevel.filter((t) => (t.prioridad ?? 'baja') === prio.id)
            return (
              <SeccionOps
                key={prio.id}
                titulo={prio.label}
                sublabel={prio.sublabel}
                color={prio.color}
                items={items}
                subtareasByParent={subtareasByParent}
                onAddItem={(titulo, recetaId) => handleAddItem(prio.id, titulo, recetaId)}
                onEstadoChange={(id, estado) => handleEstadoChange(id, estado as OpsEstado)}
                onAddSubtarea={handleAddSubtarea}
                modo={modo}
                showSeccionChip
                recetas={recetasSimple}
              />
            )
          })
        )}
      </div>
    </div>
  )
}
