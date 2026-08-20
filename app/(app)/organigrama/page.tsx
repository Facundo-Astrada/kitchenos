'use client'

// Organigrama — Fase 1 (ago 2026). Dos vistas sobre la misma fuente de datos:
// "Plantel" (carta de jugador por persona) y "Estructura" (las 12 áreas del
// catálogo, siempre visibles con su explicación aunque estén inactivas — un
// negocio chico no tiene departamentos formales, pero la función existe
// igual y la cubre menos gente) con el árbol de puestos de cada área y
// quién responde por ella.

import PageTransition from '@/components/PageTransition'
import { useState, useMemo, useEffect } from 'react'
import {
  useEquipo, construirArbolPuestos, idsDescendientes,
  type Miembro, type Puesto, type PuestoNode, type AreaEstado,
} from '@/lib/hooks/useEquipo'
import { usePermisos } from '@/lib/hooks/usePermisos'
import { MODULO_CONFIG, CAPAS, type ModuloId, type AreaKey, type Capa } from '@/lib/constants'
import { SegmentedTabs, FilterChips, EmptyState, HeaderAction } from '@/components/ui'
import { MiembroCard } from '@/components/organigrama/MiembroCard'
import { CoberturaTable } from '@/components/organigrama/CoberturaTable'
import { OrganigramaWizardSheet } from '@/components/organigrama/OrganigramaWizardSheet'
import { ResponsablesPicker } from '@/components/organigrama/ResponsablesPicker'
import { exportOrganigramaPDF } from '@/lib/exportPDF'

type Tab = 'plantel' | 'estructura' | 'cobertura'
const TAB_IDS: Tab[] = ['plantel', 'estructura', 'cobertura']
function esTab(v: string | null): v is Tab {
  return v != null && (TAB_IDS as string[]).includes(v)
}

export default function OrganigramaPage() {
  const {
    miembros, puestos, loading,
    areas, toggleAreaActiva, setAreaActiva, toggleAreaResponsable, actualizarPuesto,
    capaResponsables, toggleCapaResponsable,
    crearMiembro, actualizarMiembro, crearPuesto,
  } = useEquipo()
  const { isAdmin } = usePermisos()

  const [tab, setTab] = useState<Tab>('plantel')
  const [areaFiltro, setAreaFiltro] = useState<string>('todas')
  const [wizardOpen, setWizardOpen] = useState(false)
  const [exportando, setExportando] = useState(false)

  const areasActivas = useMemo(() => areas.filter(a => a.activa), [areas])

  // Insights, no solo conteos: qué está mal y qué falta, para que el Coach
  // pueda señalarlo sin tener que recorrer toda la pantalla.
  useEffect(() => {
    const areasSinResponsable = areasActivas.filter(a => a.responsables.length === 0).map(a => a.nombre)
    const puestosVacantes = puestos.filter(p => !miembros.some(m => m.puesto_id === p.id)).map(p => p.nombre)
    const capasCriticas: Capa[] = ['definir', 'preparar', 'controlar']
    const huecosCobertura = areasActivas.reduce(
      (acc, a) => acc + capasCriticas.filter(c => capaResponsables(a.key, c).length === 0).length,
      0
    )
    localStorage.setItem('kc_screen_context', JSON.stringify({
      screen: 'organigrama',
      tab,
      totalMiembros: miembros.length,
      totalPuestos: puestos.length,
      totalAreasActivas: areasActivas.length,
      areasSinResponsable: areasSinResponsable.slice(0, 5),
      puestosVacantes: puestosVacantes.slice(0, 5),
      huecosCobertura,
    }))
    return () => localStorage.removeItem('kc_screen_context')
  }, [tab, miembros, puestos, areasActivas, capaResponsables])

  // El tour del Coach cambia de tab solo cuando un paso lo necesita.
  useEffect(() => {
    function handleSetTab(e: Event) {
      const { tab: newTab } = (e as CustomEvent<{ tab: string }>).detail
      if (esTab(newTab)) setTab(newTab)
    }
    window.addEventListener('kc-set-tab', handleSetTab)
    return () => window.removeEventListener('kc-set-tab', handleSetTab)
  }, [])

  async function handleExportarPDF() {
    setExportando(true)
    try {
      await exportOrganigramaPDF(areas, puestos, miembros)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Error al generar el PDF')
    } finally {
      setExportando(false)
    }
  }

  const miembrosFiltrados = useMemo(() => {
    if (areaFiltro === 'todas') return miembros
    return miembros.filter(m => puestos.find(p => p.id === m.puesto_id)?.area_key === areaFiltro)
  }, [miembros, puestos, areaFiltro])

  const filtroChips = useMemo(() => [
    { value: 'todas', label: 'Todas' },
    ...areasActivas.map(a => ({ value: a.key as string, label: a.nombre })),
  ], [areasActivas])

  async function reasignarReportaA(puestoId: string, reportaA: string | null) {
    try {
      await actualizarPuesto(puestoId, { reporta_a_puesto_id: reportaA })
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Error al reasignar')
    }
  }

  async function cambiarResponsable(areaKey: AreaKey, miembroId: string) {
    try {
      await toggleAreaResponsable(areaKey, miembroId)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Error al asignar responsable')
    }
  }

  async function cambiarResponsableCapa(areaKey: AreaKey, capa: Capa, miembroId: string) {
    try {
      await toggleCapaResponsable(areaKey, capa, miembroId)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Error al asignar responsable')
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100dvh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--text-3)' }}>progress_activity</span>
      </div>
    )
  }

  return (
    <PageTransition>
      <div style={{ minHeight: '100dvh', background: 'var(--bg)', paddingBottom: 100 }}>

        {/* Header */}
        <div style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h1 className="text-[22px] font-bold" style={{ color: '#fff' }}>Organigrama</h1>
              <p className="text-[13px] mt-0.5" style={{ color: 'rgba(255,255,255,0.65)' }}>
                {miembros.length} en el plantel · {areasActivas.length} áreas activas
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <button
                data-coach-target="organigrama-exportar"
                onClick={handleExportarPDF}
                disabled={exportando}
                title="Exportar PDF"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36,
                  background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,.25)', borderRadius: 10,
                  color: '#fff', cursor: exportando ? 'default' : 'pointer', opacity: exportando ? 0.6 : 1,
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                  {exportando ? 'progress_activity' : 'picture_as_pdf'}
                </span>
              </button>
              {isAdmin && (
                <div data-coach-target="organigrama-configurar">
                  <HeaderAction label="Configurar" icon="auto_fix_high" onClick={() => setWizardOpen(true)} />
                </div>
              )}
            </div>
          </div>

          <div style={{ marginTop: 14 }} data-coach-target="organigrama-tabs">
            <SegmentedTabs
              tabs={[
                { id: 'plantel', label: 'Plantel', icon: 'grid_view' },
                { id: 'estructura', label: 'Estructura', icon: 'account_tree' },
                { id: 'cobertura', label: 'Cobertura', icon: 'fact_check' },
              ]}
              active={tab}
              onChange={setTab}
            />
          </div>

          {tab === 'plantel' && (
            <div style={{ marginTop: 12 }} data-coach-target="organigrama-filtros">
              <FilterChips chips={filtroChips} active={areaFiltro} onChange={setAreaFiltro} context="onDark" />
            </div>
          )}
        </div>

        {/* ── Vista Plantel ── */}
        {tab === 'plantel' && (
          miembrosFiltrados.length === 0 ? (
            <EmptyState
              icon="groups"
              title="Sin gente en esta área"
              subtitle="Asigná un puesto de esta área a algún miembro del equipo en Equipo → Puestos."
            />
          ) : (
            <div
              data-coach-target="organigrama-plantel"
              style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                gap: 12, padding: 16,
              }}
            >
              {miembrosFiltrados.map(m => (
                <MiembroCard key={m.id} miembro={m} puestos={puestos} miembros={miembros} />
              ))}
            </div>
          )
        )}

        {/* ── Vista Estructura ── */}
        {tab === 'estructura' && (
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }} data-coach-target="organigrama-estructura">
            {areas.map(estado => (
              <AreaBlock
                key={estado.key}
                estado={estado}
                puestosDelArea={puestos.filter(p => p.area_key === estado.key)}
                todosPuestos={puestos}
                miembros={miembros}
                isAdmin={isAdmin}
                onToggleActiva={() => toggleAreaActiva(estado.key)}
                onToggleResponsable={(id) => cambiarResponsable(estado.key, id)}
                onReasignarReportaA={reasignarReportaA}
              />
            ))}
          </div>
        )}

        {/* ── Vista Cobertura ── */}
        {tab === 'cobertura' && (
          <div style={{ padding: 16 }}>
            {areasActivas.length === 0 ? (
              <EmptyState
                icon="fact_check"
                title="Sin áreas activas"
                subtitle="Activá al menos un área en Estructura (o corré el asistente de configuración) para ver la cobertura."
              />
            ) : (
              <>
                <p style={{ fontSize: 12.5, color: 'var(--text-2)', margin: '0 0 14px', lineHeight: 1.55 }}>
                  Un área no funciona en un solo momento — pasa por cuatro etapas distintas, y cada una puede tener a alguien distinto a cargo.
                  Esta vista muestra quién responde en cada etapa de cada área activa, para que un hueco se note acá y no en el día a día.
                </p>

                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginBottom: 16,
                }}>
                  {CAPAS.map(c => (
                    <div key={c.key} style={{
                      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 12px',
                      display: 'flex', gap: 9, alignItems: 'flex-start',
                    }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: 8, flexShrink: 0, background: 'rgba(67,97,160,.12)', color: 'var(--accent)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{c.icon}</span>
                      </div>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-1)' }}>{c.label}</div>
                        <div style={{ fontSize: 10.5, color: 'var(--text-2)', marginTop: 2, lineHeight: 1.4 }}>{c.explicacion}</div>
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 10, flexWrap: 'wrap' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--red)', fontWeight: 700 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>error</span>
                    Sin responsable — nadie a cargo todavía
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                    &quot;Todo el equipo&quot; en Ejecutar no es una alerta: el servicio se sostiene entre todos, no lo lleva una sola persona.
                  </span>
                </div>

                <CoberturaTable
                  areas={areasActivas}
                  miembros={miembros}
                  isAdmin={isAdmin}
                  capaResponsables={capaResponsables}
                  onToggleCapaResponsable={cambiarResponsableCapa}
                />
              </>
            )}
          </div>
        )}
      </div>

      <OrganigramaWizardSheet
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        areas={areas}
        miembros={miembros}
        puestos={puestos}
        onSetAreaActiva={setAreaActiva}
        onToggleAreaResponsable={toggleAreaResponsable}
        onCrearMiembro={crearMiembro}
        onActualizarMiembro={actualizarMiembro}
        onCrearPuesto={crearPuesto}
      />
    </PageTransition>
  )
}

// ══════════════════════════════════════════════════════════════
// Bloque de un área — header con explicación siempre visible +
// responsable + módulos que cubre + árbol de puestos.
// ══════════════════════════════════════════════════════════════

function AreaBlock({
  estado, puestosDelArea, todosPuestos, miembros, isAdmin,
  onToggleActiva, onToggleResponsable, onReasignarReportaA,
}: {
  estado: AreaEstado
  puestosDelArea: Puesto[]
  todosPuestos: Puesto[]
  miembros: Miembro[]
  isAdmin: boolean
  onToggleActiva: () => void
  onToggleResponsable: (id: string) => void
  onReasignarReportaA: (puestoId: string, reportaA: string | null) => void
}) {
  const arbol = construirArbolPuestos(puestosDelArea)

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
      padding: 14, opacity: estado.activa ? 1 : 0.68,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', minWidth: 0 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10, flexShrink: 0,
            background: estado.color + '20', color: estado.color,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{estado.icon}</span>
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-1)' }}>{estado.nombre}</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 2, lineHeight: 1.4 }}>{estado.explicacion}</div>
          </div>
        </div>
        {isAdmin ? (
          <button onClick={onToggleActiva} style={{
            fontSize: 9.5, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase',
            padding: '4px 10px', borderRadius: 20, border: 'none', cursor: 'pointer', flexShrink: 0,
            background: estado.activa ? 'rgba(16,185,129,.14)' : 'rgba(100,116,139,.14)',
            color: estado.activa ? '#0a8f5f' : 'var(--text-2)',
          }}>
            {estado.activa ? 'Activa' : 'Inactiva'}
          </button>
        ) : (
          <span style={{
            fontSize: 9.5, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase',
            padding: '4px 10px', borderRadius: 20, flexShrink: 0,
            background: estado.activa ? 'rgba(16,185,129,.14)' : 'rgba(100,116,139,.14)',
            color: estado.activa ? '#0a8f5f' : 'var(--text-2)',
          }}>
            {estado.activa ? 'Activa' : 'Inactiva'}
          </span>
        )}
      </div>

      {/* Responsable(s) — puede haber más de uno (socios, co-chefs) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, paddingTop: 10, borderTop: '1px dashed var(--border)' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 15, color: estado.responsables.length > 0 ? 'var(--accent)' : 'var(--red)', flexShrink: 0 }}>
          {estado.responsables.length > 0 ? 'verified_user' : 'error'}
        </span>
        <ResponsablesPicker
          miembros={miembros}
          isAdmin={isAdmin}
          selected={estado.responsables}
          onToggle={onToggleResponsable}
          emptyLabel="Sin responsable"
          alert
        />
      </div>

      {/* Módulos que cubre */}
      {estado.modulos.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
          {estado.modulos.map(m => (
            <span key={m} style={{
              fontSize: 9.5, fontWeight: 700, padding: '3px 7px', borderRadius: 20,
              background: 'rgba(67,97,160,.1)', color: 'var(--accent)',
            }}>
              {MODULO_CONFIG[m as ModuloId]?.label ?? m}
            </span>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 10.5, color: 'var(--text-3)', fontStyle: 'italic', marginTop: 8 }}>
          Sin módulo propio en K-OS todavía
        </div>
      )}

      {/* Árbol de puestos del área */}
      {arbol.length > 0 ? (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column' }}>
          {arbol.map(n => (
            <PuestoTreeRow
              key={n.id} node={n} depth={0}
              todosPuestos={todosPuestos} miembros={miembros} isAdmin={isAdmin}
              onReasignarReportaA={onReasignarReportaA}
            />
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 11, color: 'var(--text-3)', fontStyle: 'italic', marginTop: 10 }}>
          Sin puestos en esta área todavía — creá uno en Equipo → Puestos.
        </div>
      )}
    </div>
  )
}

function PuestoTreeRow({
  node, depth, todosPuestos, miembros, isAdmin, onReasignarReportaA,
}: {
  node: PuestoNode
  depth: number
  todosPuestos: Puesto[]
  miembros: Miembro[]
  isAdmin: boolean
  onReasignarReportaA: (puestoId: string, reportaA: string | null) => void
}) {
  const ocupantes = miembros.filter(m => m.puesto_id === node.id)
  const excluidos = useMemo(() => new Set([node.id, ...idsDescendientes(node.id, todosPuestos)]), [node.id, todosPuestos])

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: depth * 18, paddingTop: 6, paddingBottom: 6 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 15, color: 'var(--text-3)', flexShrink: 0 }}>
          {depth === 0 ? 'account_tree' : 'subdirectory_arrow_right'}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{node.nombre}</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
            {ocupantes.length === 0 ? 'Vacante' : ocupantes.map(o => `${o.nombre} ${o.apellido}`).join(', ')}
          </div>
        </div>
        {isAdmin && (
          <select
            value={node.reporta_a_puesto_id ?? ''}
            onChange={e => onReasignarReportaA(node.id, e.target.value || null)}
            title="Reasignar a quién reporta"
            style={{
              fontSize: 10.5, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)',
              color: 'var(--text-2)', padding: '3px 6px', maxWidth: 112, fontFamily: 'inherit', flexShrink: 0,
            }}
          >
            <option value="">Raíz</option>
            {todosPuestos.filter(p => !excluidos.has(p.id)).map(p => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </select>
        )}
      </div>
      {node.hijos.map(h => (
        <PuestoTreeRow
          key={h.id} node={h} depth={depth + 1}
          todosPuestos={todosPuestos} miembros={miembros} isAdmin={isAdmin}
          onReasignarReportaA={onReasignarReportaA}
        />
      ))}
    </div>
  )
}
