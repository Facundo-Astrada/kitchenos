'use client'

import PageTransition from '@/components/PageTransition'
import { useState, useMemo, useEffect } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth/context'
import DashboardHeader from '@/components/dashboard/DashboardHeader'
import AhoraCard from '@/components/dashboard/AhoraCard'
import LineUpStrip from '@/components/dashboard/LineUpStrip'
import ImplantacionStrip from '@/components/dashboard/ImplantacionStrip'
import ProximosDias from '@/components/dashboard/ProximosDias'
import PasePreview from '@/components/dashboard/PasePreview'
import MiPlaza from '@/components/dashboard/MiPlaza'
import StockCriticoSection from '@/components/dashboard/StockCriticoSection'
import ModulosGrid from '@/components/dashboard/ModulosGrid'
import WelcomeDashboard from '@/components/dashboard/WelcomeDashboard'
import { useStock } from '@/lib/hooks/useStock'
import { useTareas } from '@/lib/hooks/useTareas'
import { useChecklist } from '@/lib/hooks/useChecklist'
import { useIsDesktop } from '@/lib/hooks/useIsDesktop'
import { getEstadoStock } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useFichaje } from '@/lib/hooks/useFichaje'
import { hoyOperativo, sumarDias, fechaEnTz } from '@/lib/ops/turnos'
import { useReservas } from '@/lib/hooks/useReservas'
import { cubiertosVivos, tieneCarga } from '@/lib/reservas/helpers'
import { useMomentoDia } from '@/lib/dashboard/momento'
import type { Perfil, Rol } from '@/types'

// KPI "86 activos" del header — cuenta real, no el 0 fijo que mostraba antes.
// Query liviana (count exact, head:true — no baja filas) sobre carta_items,
// mismo criterio que toggleDisponible en useCarta.ts.
function useEn86Count(restauranteId: string): number | null {
  const [count, setCount] = useState<number | null>(null)
  useEffect(() => {
    if (!restauranteId) return
    let cancel = false
    ;(async () => {
      const supabase = createClient()
      const { count: n } = await supabase.from('carta_items')
        .select('*', { count: 'exact', head: true })
        .eq('restaurante_id', restauranteId)
        .eq('disponible', false)
      if (!cancel) setCount(n ?? 0)
    })()
    return () => { cancel = true }
  }, [restauranteId])
  return count
}

export default function DashboardPage() {
  const { perfil: authPerfil } = useAuth()
  const isDesktop = useIsDesktop()
  const [turnoActivo, setTurnoActivo] = useState<string | null>(null)
  const [showCierre, setShowCierre] = useState(false)
  const [showNotif, setShowNotif] = useState(false)
  const { fichajeAbierto, marcarEntrada, marcarSalida } = useFichaje()

  // Persist shift state in localStorage (cache local — la fuente de verdad es turnos_personal)
  useEffect(() => {
    const saved = localStorage.getItem('kitchenos_turno')
    if (saved) setTurnoActivo(saved)
  }, [])

  // Reconciliar con la DB: si hay un fichaje abierto (ej. se clockeó desde otro dispositivo
  // o se cerró el navegador sin marcar salida) y el localStorage quedó vacío, restaurarlo.
  useEffect(() => {
    if (fichajeAbierto?.entrada && !localStorage.getItem('kitchenos_turno')) {
      localStorage.setItem('kitchenos_turno', fichajeAbierto.entrada)
      setTurnoActivo(fichajeAbierto.entrada)
    }
  }, [fichajeAbierto])

  const iniciarTurno = async () => {
    const now = new Date().toISOString()
    localStorage.setItem('kitchenos_turno', now)
    setTurnoActivo(now)
    try {
      const fichaje = await marcarEntrada()
      // Usar el timestamp real que guardó el server, por si difiere unos ms del optimista
      localStorage.setItem('kitchenos_turno', fichaje.entrada!)
      setTurnoActivo(fichaje.entrada)
    } catch {
      // El fichaje en DB falló, pero no bloqueamos el flujo local — el turno sigue "activo"
      // para el usuario; se reintentará fichar la próxima vez que abra el dashboard.
    }
  }

  const cerrarTurno = () => {
    setShowCierre(true)
  }

  const confirmarCierre = async () => {
    if (fichajeAbierto) {
      try { await marcarSalida(fichajeAbierto) } catch { /* no bloquea el cierre local */ }
    }
    localStorage.removeItem('kitchenos_turno')
    setTurnoActivo(null)
    setShowCierre(false)
  }
  const { productos, loading: loadingStock } = useStock()
  const { tareas, loading: loadingTareas } = useTareas()
  const { items: checklistItems, registros, fetchRegistrosDelDia } = useChecklist()
  const en86 = useEn86Count(authPerfil?.restaurante_id ?? '')
  // Reservas de hoy (PLAN-4-CAPAS B9) — tile del status bar, oculto si no hay carga.
  const hoyReservas = useMemo(() => fechaEnTz(new Date()), [])
  const { reservas: reservasHoy } = useReservas(hoyReservas, hoyReservas)
  const reservasConCarga = useMemo(() => reservasHoy.filter(r => tieneCarga(r.estado)), [reservasHoy])
  const cubiertosReservados = useMemo(() => cubiertosVivos(reservasHoy), [reservasHoy])

  // Sin este fetch, `registros` se queda en [] toda la vida del componente
  // (no es SWR, es un useState que solo se llena adentro de fetchRegistros/
  // fetchAll — acá nadie los llamaba) y "Checklist X/Y" del header, MiPlaza y
  // AhoraCard mostraban siempre 0/N sin importar el avance real del mise
  // (encontrado ago 2026, PLAN-SUPERFICIE S4 — ver PENDIENTES.md).
  useEffect(() => { fetchRegistrosDelDia(hoyOperativo()) }, [fetchRegistrosDelDia])

  // Build Perfil from auth context
  const perfil: Perfil = {
    id: authPerfil?.miembro_id ?? '1',
    nombre: authPerfil ? `${authPerfil.nombre} ${authPerfil.apellido}`.trim() : 'Usuario',
    rol: authPerfil?.rol ?? 'admin',
    initials: authPerfil?.initials ?? '??',
    color: authPerfil?.color ?? '#4361a0',
    restaurante_id: authPerfil?.restaurante_id ?? '',
    created_at: new Date().toISOString(),
  }

  const rol: Rol = perfil.rol
  const puedeEscribir = rol !== 'ayudante'
  const isEmpty = !loadingStock && !loadingTareas && productos.length === 0 && tareas.length === 0

  // Stats separados para mise en place y tareas
  const { plazaStats, miseStats, tareasStats } = useMemo(() => {
    const hoy = hoyOperativo()
    const ayer = sumarDias(hoy, -1)
    // Solo tareas de hoy + carryover de ayer (mismo criterio que OPS Producción)
    const tareasHoy = tareas.filter(t => {
      if (!t.turno_fecha) return false
      if (t.turno_fecha === hoy) return true
      if (t.turno_fecha === ayer && t.estado !== 'listo') return true
      return false
    })
    const tareasCompletadas = tareasHoy.filter(t => t.estado === 'listo').length
    const registrosHoy = registros.filter(r => r.fecha === hoy && r.completado)
    const totalChecklist = checklistItems.length
    const completadosChecklist = registrosHoy.length

    const total = tareasHoy.length + totalChecklist
    const completados = tareasCompletadas + completadosChecklist
    return {
      plazaStats: { completados, total },
      miseStats: { completados: completadosChecklist, total: totalChecklist },
      tareasStats: { completadas: tareasCompletadas, total: tareasHoy.length },
    }
  }, [tareas, checklistItems, registros])

  const momento = useMomentoDia({ miseCompletados: miseStats.completados, miseTotal: miseStats.total, rol })

  // La bienvenida del Coach la dispara ahora useTourAutomatico desde el layout
  // (PLAN-ACCESO-Y-USO B4.2): un solo mecanismo para las ~20 pantallas, con el
  // "ya lo vi" en DB y no en localStorage. Acá vivía un disparador propio con
  // `kc_app_welcomed`, que se re-mostraba en cada dispositivo y solo cubria
  // esta pantalla.

  useEffect(() => {
    const nCritico = productos.filter(p => p.estado === 'critico').length
    const tareasCriticas = tareas.filter(t => t.prioridad === 'critica' && t.estado !== 'listo').map(t => t.titulo).slice(0, 3)
    localStorage.setItem('kc_screen_context', JSON.stringify({
      screen: 'dashboard',
      turnoActivo: !!turnoActivo,
      nCritico,
      tareasCriticas,
      miseCompletados: miseStats.completados,
      miseTotal: miseStats.total,
      tareasCompletadas: tareasStats.completadas,
      tareasTotal: tareasStats.total,
    }))
    return () => localStorage.removeItem('kc_screen_context')
  }, [productos, tareas, turnoActivo, miseStats, tareasStats])

  const turnoDisplay = turnoActivo ? (() => {
    const diff = Math.floor((Date.now() - new Date(turnoActivo).getTime()) / 60000)
    const h = Math.floor(diff / 60); const m = diff % 60
    return h > 0 ? `${h}h ${m}m` : `${m}m`
  })() : null

  const criticos = productos.filter(p => {
    const est = getEstadoStock(p.stock_actual, p.stock_minimo, p.stock_critico)
    return est === 'critico' || est === 'bajo'
  })

  return (
    <PageTransition>
    <div className="flex flex-col h-full">
      <DashboardHeader
        perfil={perfil}
        desktop={isDesktop}
        onOpenNotifications={() => setShowNotif(true)}
        notifCount={productos.filter(p => p.estado === 'critico').length}
        miseCompletados={miseStats.completados}
        miseTotal={miseStats.total}
        tareasCompletadas={tareasStats.completadas}
        tareasTotal={tareasStats.total}
        en86={en86}
        cantidadReservas={reservasConCarga.length}
        cubiertosReservados={cubiertosReservados}
      />

      {isEmpty ? (
        <div className="scroll-body screen-enter" style={{ paddingTop: 0 }}>
          <WelcomeDashboard nombre={authPerfil?.nombre ?? 'Chef'} />
        </div>
      ) : isDesktop ? (
        /* ── DESKTOP LAYOUT ─────────────────────────────── */
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', flex: 1, minHeight: 0, overflow: 'hidden' }}>

          {/* Panel izquierdo: el día + turno + pase + plaza */}
          <div style={{ borderRight: '1px solid var(--border)', overflowY: 'auto', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <AhoraCard momento={momento} />
            <LineUpStrip momento={momento} />
            <ImplantacionStrip />
            {/* Turno */}
            <div data-coach-target="dashboard-turno">
              {!turnoActivo ? (
                <button onClick={iniciarTurno} style={{ width: '100%', padding: '12px 14px', borderRadius: 12, background: 'linear-gradient(135deg, var(--navy), #4361a0)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, color: '#fff', fontFamily: 'inherit' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>play_circle</span>
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>Iniciar turno</div>
                    <div style={{ fontSize: 10, opacity: 0.7 }}>Registrá tu entrada</div>
                  </div>
                </button>
              ) : (
                <button onClick={cerrarTurno} style={{ width: '100%', padding: '12px 14px', borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'inherit' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#ef4444' }}>stop_circle</span>
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>Turno activo</div>
                    <div style={{ fontSize: 10, color: 'var(--text-3)' }}>desde {new Date(turnoActivo).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy-ink)', background: 'rgba(67,97,160,.1)', padding: '3px 8px', borderRadius: 7 }}>{turnoDisplay}</span>
                </button>
              )}
            </div>

            <div data-coach-target="dashboard-pase"><PasePreview puedeEscribir={puedeEscribir} /></div>
            <div data-coach-target="dashboard-plaza"><MiPlaza rol={rol} completados={plazaStats.completados} total={plazaStats.total} /></div>
          </div>

          {/* Panel derecho: el calendario en su densidad completa + stock —
              la navegación a módulos ya la resuelve el sidebar, no se
              duplica acá (S1.4). Los banners de plata (pedidos atrasados,
              cuentas por pagar) se sacaron del Inicio (S6, Bloque 0): viven
              en Compras/Facturas, que es donde se actúa sobre ellos. */}
          <div style={{ overflowY: 'auto', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 28 }}>
            <ProximosDias variant="panel" />

            {criticos.length > 0 && (
              <div data-coach-target="dashboard-stock">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text-3)' }}>
                    Stock crítico
                    {criticos.length > 12 && <span style={{ fontWeight: 400, marginLeft: 6, color: 'var(--text-3)' }}>· {criticos.length} productos</span>}
                  </p>
                  <Link href="/stock" style={{ fontSize: 11, fontWeight: 700, color: 'var(--navy-ink)', textDecoration: 'none' }}>Ver inventario →</Link>
                </div>
                {/* paddingRight reserva el rincón donde descansa el FAB del
                    Coach por default (52px + margen) — sin esto tapaba la
                    última tarjeta de la grilla (S6, Bloque 0). El FAB es
                    arrastrable y su posición queda en localStorage por
                    usuario, así que no hay forma exacta de esquivarlo: esto
                    es la reserva conservadora, no un cálculo pixel-perfect. */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8, paddingRight: 64 }}>
                  {criticos.slice(0, 12).map(p => {
                    const esCrit = getEstadoStock(p.stock_actual, p.stock_minimo, p.stock_critico) === 'critico'
                    return (
                      <Link key={p.id} href="/stock" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12, background: esCrit ? '#fef2f2' : '#fffbeb', border: `1px solid ${esCrit ? '#fecaca' : '#fde68a'}`, textDecoration: 'none' }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: esCrit ? '#ef4444' : '#f59e0b', flexShrink: 0 }} />
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontSize: 12, fontWeight: 700, color: esCrit ? '#991b1b' : '#92400e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nombre}</p>
                          <p style={{ fontSize: 11, color: esCrit ? '#ef4444' : '#f59e0b' }}>{p.stock_actual} / {p.stock_minimo} {p.unidad}</p>
                        </div>
                        <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 800, textTransform: 'uppercase', padding: '2px 6px', borderRadius: 5, background: esCrit ? '#ef4444' : '#f59e0b', color: '#fff', flexShrink: 0 }}>{esCrit ? 'CRIT' : 'BAJO'}</span>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ── MOBILE LAYOUT ──────────────────── */
        <div className="scroll-body screen-enter" style={{ paddingTop: 0 }}>
          {/* El momento del día va primero — antes la pantalla abría con
              alertas de negocio antes de decir qué hacer (S1.1). */}
          <div style={{ padding: '8px 16px 0', display: 'flex', flexDirection: 'column', gap: 10 }}><AhoraCard momento={momento} /><LineUpStrip momento={momento} /><ImplantacionStrip /></div>
          <div style={{ padding: '8px 16px 0' }}><ProximosDias /></div>
          {/* Turno card */}
          <div data-coach-target="dashboard-turno" style={{ padding: '8px 16px 0' }}>
            {!turnoActivo ? (
              <button
                onClick={iniciarTurno}
                style={{
                  width: '100%', padding: '14px 16px', borderRadius: 14,
                  background: 'linear-gradient(135deg, var(--navy), #4361a0)',
                  border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 10,
                  color: '#fff',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 22 }}>play_circle</span>
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>Iniciar turno</div>
                  <div style={{ fontSize: 11, opacity: 0.7 }}>Registrá tu entrada</div>
                </div>
              </button>
            ) : (
              <button
                onClick={cerrarTurno}
                style={{
                  width: '100%', padding: '14px 16px', borderRadius: 14,
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 10,
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 22, color: '#ef4444' }}>stop_circle</span>
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>Cerrar turno</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                    Desde {new Date(turnoActivo).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                <div style={{
                  fontSize: 12, fontWeight: 700, fontFamily: "'DM Mono', monospace",
                  color: 'var(--navy-ink)', background: 'rgba(67,97,160,.1)',
                  padding: '4px 10px', borderRadius: 8,
                }}>
                  {(() => {
                    const diff = Math.floor((Date.now() - new Date(turnoActivo).getTime()) / 60000)
                    const h = Math.floor(diff / 60)
                    const m = diff % 60
                    return h > 0 ? `${h}h ${m}m` : `${m}m`
                  })()}
                </div>
              </button>
            )}
          </div>

          <div data-coach-target="dashboard-pase"><PasePreview puedeEscribir={puedeEscribir} /></div>
          <div data-coach-target="dashboard-plaza"><MiPlaza rol={rol} completados={plazaStats.completados} total={plazaStats.total} /></div>
          <div data-coach-target="dashboard-stock"><StockCriticoSection productos={productos} /></div>
          <div data-coach-target="dashboard-modulos"><ModulosGrid rol={rol} /></div>

          <div className="h-4" />
        </div>
      )}
      {/* Notificaciones panel */}
      {showNotif && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,.5)' }} onClick={() => setShowNotif(false)} />
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 101, background: 'var(--surface)', borderRadius: '20px 20px 0 0', padding: '20px 16px', paddingBottom: 'max(env(safe-area-inset-bottom, 20px), 20px)', maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ width: 36, height: 4, background: 'var(--border)', borderRadius: 2, margin: '0 auto 16px' }} />
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', marginBottom: 12 }}>Alertas de stock</div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {productos.filter(p => p.estado === 'critico' || p.estado === 'bajo').length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 0' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 36, color: 'var(--text-3)', display: 'block', marginBottom: 8 }}>check_circle</span>
                  <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Todo el stock en orden</p>
                </div>
              ) : (
                productos.filter(p => p.estado === 'critico' || p.estado === 'bajo').map(p => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.estado === 'critico' ? '#ef4444' : '#f59e0b', flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{p.nombre}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{p.stock_actual} {p.unidad} · mín {p.stock_minimo}</div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: p.estado === 'critico' ? '#fef2f2' : '#fef9c3', color: p.estado === 'critico' ? '#991b1b' : '#854d0e' }}>
                      {p.estado === 'critico' ? 'CRÍTICO' : 'BAJO'}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {/* Cierre de turno modal */}
      {showCierre && turnoActivo && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,.5)' }} onClick={() => setShowCierre(false)} />
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 101,
            background: 'var(--surface)', borderRadius: '20px 20px 0 0',
            padding: '24px 20px', paddingBottom: 'max(env(safe-area-inset-bottom, 20px), 20px)',
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-1)', marginBottom: 16 }}>
              Resumen del turno
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--text-2)' }}>Inicio</span>
                <span style={{ fontWeight: 600, color: 'var(--text-1)' }}>
                  {new Date(turnoActivo).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--text-2)' }}>Duración</span>
                <span style={{ fontWeight: 600, color: 'var(--text-1)' }}>
                  {(() => {
                    const diff = Math.floor((Date.now() - new Date(turnoActivo).getTime()) / 60000)
                    const h = Math.floor(diff / 60)
                    const m = diff % 60
                    return h > 0 ? `${h}h ${m}min` : `${m}min`
                  })()}
                </span>
              </div>
              <div style={{ height: 1, background: 'var(--border)' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--text-2)' }}>Mise en place</span>
                <span style={{ fontWeight: 600, color: miseStats.completados === miseStats.total && miseStats.total > 0 ? '#22c55e' : 'var(--text-1)' }}>
                  {miseStats.completados}/{miseStats.total}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--text-2)' }}>Tareas completadas</span>
                <span style={{ fontWeight: 600, color: tareasStats.completadas === tareasStats.total && tareasStats.total > 0 ? '#22c55e' : 'var(--text-1)' }}>
                  {tareasStats.completadas}/{tareasStats.total}
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowCierre(false)} style={{
                flex: 1, padding: 14, borderRadius: 12, background: 'var(--bg)',
                border: '1px solid var(--border)', fontSize: 14, fontWeight: 600,
                color: 'var(--text-2)', cursor: 'pointer',
              }}>Cancelar</button>
              <button onClick={confirmarCierre} style={{
                flex: 1, padding: 14, borderRadius: 12, background: '#ef4444',
                border: 'none', fontSize: 14, fontWeight: 700,
                color: '#fff', cursor: 'pointer',
              }}>Cerrar turno</button>
            </div>
          </div>
        </>
      )}
    </div>
    </PageTransition>
  )
}
