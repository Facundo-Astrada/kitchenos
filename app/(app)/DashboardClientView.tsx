'use client'

import PageTransition from '@/components/PageTransition'
import { useState, useMemo, useEffect } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth/context'
import DashboardHeader from '@/components/dashboard/DashboardHeader'
import PasePreview from '@/components/dashboard/PasePreview'
import MiPlaza from '@/components/dashboard/MiPlaza'
import StockCriticoSection from '@/components/dashboard/StockCriticoSection'
import ModulosGrid from '@/components/dashboard/ModulosGrid'
import ModoServicio from '@/components/dashboard/ModoServicio'
import WelcomeDashboard from '@/components/dashboard/WelcomeDashboard'
import { useStock } from '@/lib/hooks/useStock'
import { useTareas } from '@/lib/hooks/useTareas'
import { useChecklist } from '@/lib/hooks/useChecklist'
import type { Perfil, Rol } from '@/types'

export default function DashboardPage() {
  const { perfil: authPerfil } = useAuth()
  const [modoServicio, setModoServicio] = useState(false)
  const [turnoActivo, setTurnoActivo] = useState<string | null>(null)
  const [showCierre, setShowCierre] = useState(false)
  const [showNotif, setShowNotif] = useState(false)

  // Persist shift state in localStorage
  useEffect(() => {
    const saved = localStorage.getItem('kitchenos_turno')
    if (saved) setTurnoActivo(saved)
  }, [])

  const iniciarTurno = () => {
    const now = new Date().toISOString()
    localStorage.setItem('kitchenos_turno', now)
    setTurnoActivo(now)
  }

  const cerrarTurno = () => {
    setShowCierre(true)
  }

  const confirmarCierre = () => {
    localStorage.removeItem('kitchenos_turno')
    setTurnoActivo(null)
    setShowCierre(false)
  }
  const { productos, loading: loadingStock } = useStock()
  const { tareas, loading: loadingTareas } = useTareas()
  const { items: checklistItems, registros } = useChecklist()

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
    const hoy = new Date().toISOString().slice(0, 10)
    // All pending/in_proceso tasks are "relevant today"; completed only if done today
    const tareasHoy = tareas.filter(t => {
      if (t.status !== 'completada') return true
      const completedDate = t.completed_at?.slice(0, 10) || t.created_at?.slice(0, 10) || ''
      return completedDate === hoy
    })
    const tareasCompletadas = tareasHoy.filter(t => t.status === 'completada').length
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

  return (
    <PageTransition>
    <div className="flex flex-col h-full">
      <DashboardHeader
        perfil={perfil}
        modoServicio={modoServicio}
        onToggleModoServicio={() => setModoServicio((v) => !v)}
        onOpenCoach={() => {}}
        onOpenNotifications={() => setShowNotif(true)}
        notifCount={productos.filter(p => p.estado === 'critico').length}
        miseCompletados={miseStats.completados}
        miseTotal={miseStats.total}
        tareasCompletadas={tareasStats.completadas}
        tareasTotal={tareasStats.total}
      />

      {modoServicio ? (
        <ModoServicio
          platos={[]}
          onSalir={() => setModoServicio(false)}
        />
      ) : isEmpty ? (
        <div className="scroll-body screen-enter" style={{ paddingTop: 0 }}>
          <WelcomeDashboard nombre={authPerfil?.nombre ?? 'Chef'} />
        </div>
      ) : (
        <div className="scroll-body screen-enter" style={{ paddingTop: 0 }}>
          {/* Turno card */}
          <div style={{ padding: '8px 16px 0' }}>
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
                  color: 'var(--navy)', background: 'rgba(67,97,160,.1)',
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

          <PasePreview puedeEscribir={puedeEscribir} />
          <MiPlaza rol={rol} completados={plazaStats.completados} total={plazaStats.total} />
          <StockCriticoSection productos={productos} />
          <ModulosGrid rol={rol} />

          {/* Card Registrar merma */}
          {puedeEscribir && (
            <div style={{ padding: '4px 16px 4px' }}>
              <Link
                href="/merma"
                className="flex items-center gap-3 rounded-[14px] p-[14px_16px] transition-transform active:scale-[.98]"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                }}
              >
                <div
                  className="w-10 h-10 rounded-[12px] flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(239,68,68,.1)' }}
                >
                  <span className="material-symbols-outlined text-[22px]" style={{ color: '#ef4444' }}>
                    delete_sweep
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-bold" style={{ color: 'var(--text-1)' }}>
                    Registrar merma
                  </div>
                  <div className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                    Descarte, vencimiento o producción
                  </div>
                </div>
                <span className="material-symbols-outlined text-[18px]" style={{ color: 'var(--text-3)' }}>
                  chevron_right
                </span>
              </Link>
            </div>
          )}
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
