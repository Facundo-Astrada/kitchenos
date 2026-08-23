'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import PageTransition from '@/components/PageTransition'
import { EmptyState, FilterChips } from '@/components/ui'
import { useControlCarta, SIN_PLAZA, type ControlCartaItem } from '@/lib/hooks/useControlCarta'
import { useTareas } from '@/lib/hooks/useTareas'
import { useTurnosServicio } from '@/lib/hooks/useTurnosServicio'
import { usePlazasCustom } from '@/lib/hooks/usePlazasCustom'
import { useAuth } from '@/lib/auth/context'
import { hoyOperativo, proximoTurnoEnVentana } from '@/lib/ops/turnos'
import { plazaLabel, plazaIcon, todasLasPlazas } from '@/lib/constants'
import { PLAZA_TO_SECCION } from '@/components/mise/ProductoMiseCard'
import type { ControlCartaEstado } from '@/types'

// Misma ventana que el CTA de OPS (ver operaciones/page.tsx) — si alguien
// entra sin turno preseleccionado (bookmark, refresh), cae en el mismo criterio.
const VENTANA_PRE_APERTURA_MIN = 120

const ESTADO_CFG: Record<ControlCartaEstado, { icon: string; label: string; color: string }> = {
  ok:       { icon: 'check_circle', label: 'Está bien',  color: '#22c55e' },
  ajustar:  { icon: 'build',        label: 'Ajustar',    color: '#f59e0b' },
  no_sale:  { icon: 'block',        label: 'No sale',    color: '#ef4444' },
}
const ORDEN_BOTONES: ControlCartaEstado[] = ['ok', 'ajustar', 'no_sale']

export default function ControlCartaPage() {
  const router = useRouter()
  const { perfil } = useAuth()
  const { turnosActivos } = useTurnosServicio()
  const { plazasCustom } = usePlazasCustom()
  const { agregarTarea } = useTareas()

  const fecha = useMemo(() => hoyOperativo(), [])
  const [turno, setTurno] = useState<string | null>(null)

  // Turno inicial: el de la URL (llegando desde el CTA de OPS), si no el que
  // esté en su ventana de apertura ahora mismo, si no el primero configurado.
  useEffect(() => {
    if (turno || turnosActivos.length === 0) return
    const deUrl = new URLSearchParams(window.location.search).get('turno')
    if (deUrl && turnosActivos.some(t => t.id === deUrl)) { setTurno(deUrl); return }
    const proximo = proximoTurnoEnVentana(new Date(), turnosActivos, VENTANA_PRE_APERTURA_MIN)
    setTurno(proximo?.id ?? turnosActivos[0].id)
  }, [turno, turnosActivos])

  const { items, registroMap, loading, setEstado } = useControlCarta(fecha, turno ?? '')

  const [toast, setToast] = useState('')
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 2400)
    return () => clearTimeout(t)
  }, [toast])

  const [pendientes, setPendientes] = useState<Set<string>>(new Set())

  const turnoActual = turnosActivos.find(t => t.id === turno)

  const handleEstado = useCallback(async (item: ControlCartaItem, estado: ControlCartaEstado) => {
    if (pendientes.has(item.id)) return
    setPendientes(prev => new Set(prev).add(item.id))
    try {
      await setEstado(item.id, estado, perfil?.miembro_id ?? null)
      if (estado === 'no_sale') {
        setToast(`86 automático: ${item.nombre}`)
      } else if (estado === 'ajustar') {
        const plaza = item.plaza === SIN_PLAZA ? 'general' : item.plaza
        await agregarTarea({
          titulo: item.nombre,
          descripcion: 'Ajuste desde Control de carta',
          status: 'pendiente',
          prioridad: 'alta',
          categoria: 'produccion',
          plaza,
          receta_id: item.receta_id,
          seccion: PLAZA_TO_SECCION[plaza] ?? 'general',
          modo: 'carta',
          menu_id: null,
          turno_fecha: fecha,
          estado: 'pendiente',
          cantidad: null,
          checklist_item_id: null,
          asignado_a: null,
          creado_por: perfil?.miembro_id ?? null,
          fecha_limite: null,
          tiempo_estimado_min: null,
          checklist: [],
        })
        setToast(`A producción (${plazaLabel(plaza, plazasCustom)}): ${item.nombre}`)
      }
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setPendientes(prev => { const next = new Set(prev); next.delete(item.id); return next })
    }
  }, [pendientes, setEstado, agregarTarea, perfil, fecha, plazasCustom])

  // Agrupado por plaza — mismo criterio que el mise: la plaza resuelta vía
  // plato_plazas (ver useControlCarta), SIN_PLAZA al final.
  const grupos = useMemo(() => {
    const orden = [...todasLasPlazas(plazasCustom), SIN_PLAZA]
    const porPlaza = new Map<string, ControlCartaItem[]>()
    for (const it of items) {
      if (!porPlaza.has(it.plaza)) porPlaza.set(it.plaza, [])
      porPlaza.get(it.plaza)!.push(it)
    }
    return orden
      .filter(p => porPlaza.has(p))
      .map(p => ({ plaza: p, items: porPlaza.get(p)! }))
  }, [items, plazasCustom])

  return (
    <PageTransition>
      <div style={{ minHeight: '100dvh', background: 'var(--bg)', paddingBottom: 100 }}>
        <div style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => router.back()} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}>
              <span className="material-symbols-outlined" style={{ color: 'rgba(255,255,255,.7)', fontSize: 22 }}>arrow_back</span>
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 className="text-[19px] font-bold" style={{ color: '#fff', margin: 0 }}>Control de carta</h1>
              <p className="text-[12px] mt-0.5" style={{ color: 'rgba(255,255,255,.6)', margin: 0 }}>
                ¿Está bueno para vender?{turnoActual ? ` · ${turnoActual.nombre}` : ''}
              </p>
            </div>
            <span className="material-symbols-outlined" style={{ fontSize: 26, color: 'rgba(255,255,255,.3)' }}>fact_check</span>
          </div>

          {turnosActivos.length > 1 && turno && (
            <FilterChips
              style={{ marginTop: 12 }}
              context="onDark"
              chips={turnosActivos.map(t => ({ value: t.id, label: t.nombre }))}
              active={turno}
              onChange={setTurno}
            />
          )}
        </div>

        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Cargando…</div>
        ) : items.length === 0 ? (
          <EmptyState icon="restaurant_menu" title="No hay platos en la carta" subtitle="Cargá platos en Carta para poder controlarlos acá." />
        ) : (
          <div style={{ padding: '12px 16px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
            {grupos.map(g => {
              const esSinPlaza = g.plaza === SIN_PLAZA
              const hechos = g.items.filter(it => registroMap.has(it.id)).length
              return (
                <div key={g.plaza}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, padding: '0 2px' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-3)' }}>
                      {esSinPlaza ? 'help_outline' : plazaIcon(g.plaza, plazasCustom)}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)' }}>
                      {esSinPlaza ? 'Sin estación asignada' : plazaLabel(g.plaza, plazasCustom)}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 'auto' }}>{hechos}/{g.items.length}</span>
                  </div>

                  <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden' }}>
                    {g.items.map((item, i) => {
                      const registro = registroMap.get(item.id)
                      const pendiente = pendientes.has(item.id)
                      return (
                        <div key={item.id} style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                          borderTop: i > 0 ? '1px solid var(--border)' : 'none',
                          opacity: pendiente ? 0.6 : 1,
                        }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {item.nombre}
                            </p>
                            {!item.disponible && (
                              <span style={{
                                display: 'inline-block', marginTop: 3, fontSize: 10, fontWeight: 700,
                                padding: '1px 6px', borderRadius: 99, background: 'rgba(239,68,68,.13)', color: '#ef4444',
                              }}>86</span>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                            {ORDEN_BOTONES.map(estado => {
                              const cfg = ESTADO_CFG[estado]
                              const activo = registro?.estado === estado
                              return (
                                <button
                                  key={estado}
                                  disabled={pendiente}
                                  onClick={() => handleEstado(item, estado)}
                                  title={cfg.label}
                                  style={{
                                    width: 34, height: 34, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    border: `1.5px solid ${activo ? cfg.color : 'var(--border)'}`,
                                    background: activo ? `${cfg.color}1f` : 'transparent',
                                    cursor: pendiente ? 'default' : 'pointer',
                                    WebkitTapHighlightColor: 'transparent',
                                  }}
                                >
                                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: activo ? cfg.color : 'var(--text-3)' }}>
                                    {cfg.icon}
                                  </span>
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {toast && (
          <div style={{
            position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
            background: 'var(--navy)', color: '#fff', padding: '10px 18px', borderRadius: 99,
            fontSize: 13, fontWeight: 600, boxShadow: '0 4px 16px rgba(0,0,0,.25)', zIndex: 200,
            maxWidth: '90vw', textAlign: 'center',
          }}>
            {toast}
          </div>
        )}
      </div>
    </PageTransition>
  )
}
