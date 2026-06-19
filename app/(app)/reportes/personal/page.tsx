'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth/context'
import { useRestauranteId } from '@/lib/hooks/useRestauranteId'

// ── Tipos locales ──────────────────────────────────────────────

interface PersonaStats {
  usuario_id: string
  nombre: string
  initials: string
  color: string
  horas_mes: number | null
  producciones: number
  tareas_rutina: number
  tareas_extra: number
  tasa_completitud: number
  merma_promedio: number | null
  desvio_produccion: number | null
  alertas: string[]
  score: number
  delta_producciones: number
  delta_completitud: number
}

interface TurnoRow {
  usuario_id: string | null
  horas_total: number | null
  fecha: string
}

interface TareaRow {
  asignado_a: string | null
  status: string | null
  tipo: string | null
  turno_fecha: string | null
  titulo?: string | null
}

interface ProduccionRow {
  usuario_asignado: string | null
  status: string | null
  fecha: string
}

interface EquipoMiembroRow {
  auth_user_id: string | null
  nombre: string
  apellido: string
  rol: string
  activo: boolean
}

// ── Helpers ────────────────────────────────────────────────────

const AVATAR_COLORS = [
  '#4361a0', '#2c5282', '#2563eb', '#0891b2',
  '#059669', '#d97706', '#dc2626', '#db2777',
]

function pickColor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash)
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function getInitials(nombre: string, apellido: string): string {
  const n = nombre?.trim()?.[0] ?? ''
  const a = apellido?.trim()?.[0] ?? ''
  return (n + a).toUpperCase() || '??'
}

function mesDesdeOffset(offset: number): { desde: string; hasta: string; nombre: string; anio: number } {
  const now = new Date()
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  const year = d.getFullYear()
  const month = d.getMonth()
  const desde = `${year}-${String(month + 1).padStart(2, '0')}-01`
  const lastDay = new Date(year, month + 1, 0).getDate()
  const hasta = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  const nombre = d.toLocaleString('es-AR', { month: 'long' })
  return { desde, hasta, nombre: nombre.charAt(0).toUpperCase() + nombre.slice(1), anio: year }
}

function calcStats(
  equipo: EquipoMiembroRow[],
  turnos: TurnoRow[],
  tareas: TareaRow[],
  producciones: ProduccionRow[],
  tareasAnt: TareaRow[],
  turnosAnt: TurnoRow[],
): PersonaStats[] {
  const results = equipo.map((miembro): PersonaStats | null => {
    const uid = miembro.auth_user_id
    if (!uid) return null

    // Horas del mes
    const misTurnos = turnos.filter(t => t.usuario_id === uid)
    const horas_mes = misTurnos.length > 0
      ? misTurnos.reduce((s, t) => s + (t.horas_total ?? 0), 0)
      : null

    // Tareas del mes
    const misTareas = tareas.filter(t => t.asignado_a === uid)
    const completadas = misTareas.filter(t => t.status === 'completada')
    const producciones_tareas = completadas.filter(t => t.tipo === 'produccion').length
    const tareas_rutina = completadas.filter(t => t.tipo === 'rutina' || !t.tipo).length
    const tareas_extra = completadas.filter(t => t.tipo === 'extra').length
    const tasa_completitud = misTareas.length > 0
      ? (completadas.length / misTareas.length) * 100
      : 0

    // Produccion_diaria del mes (por nombre/texto match en usuario_asignado)
    const nombreCompleto = `${miembro.nombre} ${miembro.apellido}`.trim()
    const misProducciones = producciones.filter(p =>
      p.usuario_asignado === uid ||
      p.usuario_asignado === miembro.nombre ||
      p.usuario_asignado === nombreCompleto
    )
    const merma_promedio = null // No hay columna multiplicador_real en produccion_diaria
    const desvio_produccion = null // Igual

    // Alertas
    const alertas: string[] = []
    if (tasa_completitud < 60 && misTareas.length >= 3) alertas.push('Completitud baja')
    if (horas_mes !== null && horas_mes < 20) alertas.push('Pocas horas')
    if (misProducciones.filter(p => p.status === 'listo').length === 0 && misProducciones.length > 3)
      alertas.push('Sin producciones completadas')

    // Score
    const score = producciones_tareas * 2 + tareas_rutina + tareas_extra * 1.5

    // Comparativas vs mes anterior
    const misTareasAnt = tareasAnt.filter(t => t.asignado_a === uid)
    const completadasAnt = misTareasAnt.filter(t => t.status === 'completada')
    const prod_anterior = completadasAnt.filter(t => t.tipo === 'produccion').length
    const completitud_anterior = misTareasAnt.length > 0
      ? (completadasAnt.length / misTareasAnt.length) * 100
      : 0

    const delta_producciones = producciones_tareas - prod_anterior
    const delta_completitud = tasa_completitud - completitud_anterior

    const _turnosAnt = turnosAnt // silenciar warning de no uso
    void _turnosAnt

    return {
      usuario_id: uid,
      nombre: `${miembro.nombre} ${miembro.apellido}`.trim(),
      initials: getInitials(miembro.nombre, miembro.apellido),
      color: pickColor(uid),
      horas_mes,
      producciones: producciones_tareas,
      tareas_rutina,
      tareas_extra,
      tasa_completitud,
      merma_promedio,
      desvio_produccion,
      alertas,
      score,
      delta_producciones,
      delta_completitud,
    } satisfies PersonaStats
  })
  return results.filter((s): s is PersonaStats => s !== null)
}

// ── Componentes auxiliares ─────────────────────────────────────

function Avatar({ initials, color, size = 36 }: { initials: string; color: string; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: color, display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontWeight: 700, fontSize: size * 0.38, flexShrink: 0,
    }}>
      {initials}
    </div>
  )
}

function Delta({ value, label }: { value: number; label: string }) {
  if (value === 0) return <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{label}: sin cambio</span>
  const color = value > 0 ? '#16a34a' : '#dc2626'
  const sign = value > 0 ? '+' : ''
  return (
    <span style={{ fontSize: 11, color }}>
      {label}: {sign}{value.toFixed(1)}
    </span>
  )
}

// ── Página principal ───────────────────────────────────────────

export default function PersonalReportePage() {
  const router = useRouter()
  const { perfil, user } = useAuth()
  const restauranteId = useRestauranteId()

  // Guard de rol — solo admin/owner
  useEffect(() => {
    if (!perfil) return
    if (perfil.rol !== 'admin') {
      router.replace('/reportes')
    }
  }, [perfil, router])

  // Navegacion de mes (0 = mes actual, -1 = anterior, etc.)
  const [mesOffset, setMesOffset] = useState(0)
  const mesInfo = mesDesdeOffset(mesOffset)
  const esHoy = mesOffset === 0

  const [stats, setStats] = useState<PersonaStats[]>([])
  const [loading, setLoading] = useState(true)
  const [personaDetalle, setPersonaDetalle] = useState<PersonaStats | null>(null)
  const [turnosDetalle, setTurnosDetalle] = useState<TurnoRow[]>([])
  const [tareasExtraDetalle, setTareasExtraDetalle] = useState<TareaRow[]>([])

  const fetchData = useCallback(async () => {
    if (!restauranteId || !perfil || perfil.rol !== 'admin') return
    setLoading(true)
    try {
      const supabase = createClient()
      // Compute date ranges inside the callback so the object refs don't trigger re-renders
      const { desde, hasta } = mesDesdeOffset(mesOffset)
      const { desde: desdeAnt, hasta: hastaAnt } = mesDesdeOffset(mesOffset - 1)

      const [
        equipoRes,
        turnosRes,
        tareasRes,
        produccionesRes,
        tareasAntRes,
        turnosAntRes,
      ] = await Promise.all([
        supabase
          .from('equipo_miembros')
          .select('auth_user_id, nombre, apellido, rol, activo')
          .eq('restaurante_id', restauranteId)
          .eq('activo', true),
        supabase
          .from('turnos_personal')
          .select('usuario_id, horas_total, fecha')
          .eq('restaurante_id', restauranteId)
          .gte('fecha', desde)
          .lte('fecha', hasta),
        supabase
          .from('tareas')
          .select('asignado_a, status, tipo, turno_fecha, titulo')
          .eq('restaurante_id', restauranteId)
          .gte('created_at', `${desde}T00:00:00`)
          .lte('created_at', `${hasta}T23:59:59`),
        supabase
          .from('produccion_diaria')
          .select('usuario_asignado, status, fecha')
          .eq('restaurante_id', restauranteId)
          .gte('fecha', desde)
          .lte('fecha', hasta),
        supabase
          .from('tareas')
          .select('asignado_a, status, tipo')
          .eq('restaurante_id', restauranteId)
          .gte('created_at', `${desdeAnt}T00:00:00`)
          .lte('created_at', `${hastaAnt}T23:59:59`),
        supabase
          .from('turnos_personal')
          .select('usuario_id, horas_total')
          .eq('restaurante_id', restauranteId)
          .gte('fecha', desdeAnt)
          .lte('fecha', hastaAnt),
      ])

      const equipo = (equipoRes.data ?? []) as EquipoMiembroRow[]
      const turnos = (turnosRes.data ?? []) as TurnoRow[]
      const tareas = (tareasRes.data ?? []) as TareaRow[]
      const producciones = (produccionesRes.data ?? []) as ProduccionRow[]
      const tareasAnt = (tareasAntRes.data ?? []) as TareaRow[]
      const turnosAnt = (turnosAntRes.data ?? []) as TurnoRow[]

      const computed = calcStats(equipo, turnos, tareas, producciones, tareasAnt, turnosAnt)
      setStats(computed.sort((a, b) => b.score - a.score))
    } catch (e) {
      console.error('[personal] fetchData error:', e)
    } finally {
      setLoading(false)
    }
  }, [restauranteId, perfil, mesOffset])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Fetch detalle para el drawer
  async function abrirDetalle(persona: PersonaStats) {
    setPersonaDetalle(persona)
    if (!restauranteId) return
    const supabase = createClient()
    const { desde, hasta } = mesDesdeOffset(mesOffset)

    const [turnosRes, tareasExtraRes] = await Promise.all([
      supabase
        .from('turnos_personal')
        .select('usuario_id, horas_total, fecha')
        .eq('restaurante_id', restauranteId)
        .eq('usuario_id', persona.usuario_id)
        .gte('fecha', desde)
        .lte('fecha', hasta)
        .order('fecha', { ascending: false })
        .limit(10),
      supabase
        .from('tareas')
        .select('asignado_a, status, tipo, turno_fecha, titulo')
        .eq('restaurante_id', restauranteId)
        .eq('asignado_a', persona.usuario_id)
        .eq('tipo', 'extra')
        .gte('created_at', `${desde}T00:00:00`)
        .lte('created_at', `${hasta}T23:59:59`)
        .limit(10),
    ])

    setTurnosDetalle((turnosRes.data ?? []) as TurnoRow[])
    setTareasExtraDetalle((tareasExtraRes.data ?? []) as TareaRow[])
  }

  function cerrarDetalle() {
    setPersonaDetalle(null)
    setTurnosDetalle([])
    setTareasExtraDetalle([])
  }

  // Guard visual — si no tiene perfil/rol correcto, spinner hasta redirect
  if (!perfil || perfil.rol !== 'admin') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh', background: 'var(--bg)' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--text-3)', animation: 'spin 1s linear infinite' }}>progress_activity</span>
        <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  // Podio top 3
  const top3 = stats.slice(0, 3)
  const podioColors = ['#fef3c7', '#f1f5f9', '#fef9ee']
  const podioLabels = ['1°', '2°', '3°']

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', paddingBottom: 120 }}>

      {/* Header */}
      <div style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => router.back()}
            style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 22 }}>arrow_back</span>
          </button>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 17, flex: 1 }}>Eficiencia de personal</span>
        </div>

        {/* Selector de mes */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 12 }}>
          <button
            onClick={() => setMesOffset(o => o - 1)}
            style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          >
            <span className="material-symbols-outlined">chevron_left</span>
          </button>
          <span style={{ color: '#fff', fontWeight: 600, fontSize: 14, minWidth: 110, textAlign: 'center' }}>
            {mesInfo.nombre} {mesInfo.anio}
          </span>
          <button
            onClick={() => setMesOffset(o => o + 1)}
            disabled={esHoy}
            style={{
              background: 'none', border: 'none',
              color: esHoy ? 'rgba(255,255,255,0.3)' : '#fff',
              cursor: esHoy ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center',
            }}
          >
            <span className="material-symbols-outlined">chevron_right</span>
          </button>
        </div>
      </div>

      {/* Contenido */}
      <div style={{ padding: 16 }}>

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '64px 16px', gap: 8 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--text-3)', animation: 'spin 1s linear infinite' }}>progress_activity</span>
            <span style={{ fontSize: 13, color: 'var(--text-3)' }}>Cargando datos del equipo...</span>
          </div>
        ) : stats.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 16px', gap: 8 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 40, color: 'var(--text-3)' }}>group_off</span>
            <span style={{ fontSize: 14, color: 'var(--text-3)' }}>Sin datos para este mes</span>
          </div>
        ) : (
          <>
            {/* Podio top 3 */}
            {top3.length >= 2 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, fontWeight: 600 }}>
                  Mejores del mes
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {top3.map((p, i) => (
                    <button
                      key={p.usuario_id}
                      onClick={() => abrirDetalle(p)}
                      style={{
                        flex: 1,
                        background: podioColors[i],
                        borderRadius: 12,
                        padding: '12px 10px',
                        border: 'none',
                        cursor: 'pointer',
                        textAlign: 'left',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>{podioLabels[i]}</div>
                      <Avatar initials={p.initials} color={p.color} size={32} />
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)', marginTop: 2, lineHeight: 1.3 }}>
                        {p.nombre.split(' ')[0]}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-2)' }}>
                        Score {p.score.toFixed(0)}
                      </div>
                      {p.alertas.length > 0 && (
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', marginTop: 2 }} />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Tabla completa */}
            <div style={{
              background: 'var(--surface)',
              borderRadius: 12,
              border: '1px solid var(--border)',
              overflow: 'hidden',
            }}>
              {/* Header de tabla */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 48px 48px 48px 48px 50px 28px',
                padding: '10px 12px',
                borderBottom: '1px solid var(--border)',
                fontSize: 10,
                color: 'var(--text-3)',
                textTransform: 'uppercase',
                fontWeight: 600,
                letterSpacing: 0.3,
              }}>
                <span>Persona</span>
                <span style={{ textAlign: 'right' }}>Hs</span>
                <span style={{ textAlign: 'right' }}>Prod</span>
                <span style={{ textAlign: 'right' }}>Rut</span>
                <span style={{ textAlign: 'right' }}>Extra</span>
                <span style={{ textAlign: 'right' }}>Comp%</span>
                <span style={{ textAlign: 'center' }}></span>
              </div>

              {stats.map((p, i) => (
                <button
                  key={p.usuario_id}
                  onClick={() => abrirDetalle(p)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 48px 48px 48px 48px 50px 28px',
                    padding: '11px 12px',
                    borderBottom: i < stats.length - 1 ? '1px solid var(--border)' : 'none',
                    background: p.alertas.length > 0 ? 'rgba(251,191,36,0.08)' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    alignItems: 'center',
                    width: '100%',
                    textAlign: 'left',
                  }}
                >
                  {/* Nombre con avatar */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <Avatar initials={p.initials} color={p.color} size={28} />
                    <span style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: 'var(--text-1)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {p.nombre.split(' ')[0]}
                    </span>
                  </div>

                  <span style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-2)' }}>
                    {p.horas_mes !== null ? p.horas_mes.toFixed(1) : '—'}
                  </span>
                  <span style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-2)' }}>
                    {p.producciones}
                  </span>
                  <span style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-2)' }}>
                    {p.tareas_rutina}
                  </span>
                  <span style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-2)' }}>
                    {p.tareas_extra}
                  </span>
                  <span style={{
                    textAlign: 'right', fontSize: 12, fontWeight: 600,
                    color: p.tasa_completitud >= 80 ? '#16a34a' : p.tasa_completitud >= 60 ? '#ca8a04' : '#dc2626',
                  }}>
                    {p.tasa_completitud.toFixed(0)}%
                  </span>
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    {p.alertas.length > 0 ? (
                      <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#f59e0b' }}>warning</span>
                    ) : (
                      <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-3)' }}>chevron_right</span>
                    )}
                  </div>
                </button>
              ))}
            </div>

            {/* Leyenda completitud */}
            <div style={{ display: 'flex', gap: 14, fontSize: 10, color: 'var(--text-3)', marginTop: 10, flexWrap: 'wrap' }}>
              <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#16a34a', marginRight: 4 }} />≥80% Bien</span>
              <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#ca8a04', marginRight: 4 }} />60-79% Alerta</span>
              <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#dc2626', marginRight: 4 }} />&lt;60% Critico</span>
              <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', marginRight: 4 }} />Tiene alertas</span>
            </div>
          </>
        )}
      </div>

      {/* Drawer detalle */}
      {personaDetalle && (
        <>
          {/* Overlay */}
          <div
            onClick={cerrarDetalle}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
              zIndex: 190,
            }}
          />

          {/* Bottom sheet */}
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0,
            background: 'var(--surface)',
            borderRadius: '20px 20px 0 0',
            zIndex: 200,
            maxHeight: '80dvh',
            overflowY: 'auto',
            paddingBottom: 40,
          }}>
            {/* Handle */}
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, paddingBottom: 4 }}>
              <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)' }} />
            </div>

            {/* Header drawer */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 16px 14px',
              borderBottom: '1px solid var(--border)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Avatar initials={personaDetalle.initials} color={personaDetalle.color} size={40} />
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>{personaDetalle.nombre}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Score: {personaDetalle.score.toFixed(0)} pts</div>
                </div>
              </div>
              <button
                onClick={cerrarDetalle}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--text-2)' }}>close</span>
              </button>
            </div>

            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* KPIs rápidos */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[
                  { label: 'Producciones', value: personaDetalle.producciones },
                  { label: 'Rutinas', value: personaDetalle.tareas_rutina },
                  { label: 'Extras', value: personaDetalle.tareas_extra },
                  { label: 'Complet.', value: `${personaDetalle.tasa_completitud.toFixed(0)}%` },
                ].map(kpi => (
                  <div key={kpi.label} style={{
                    background: 'var(--bg)', borderRadius: 10, padding: '10px 12px',
                    border: '1px solid var(--border)', flex: '1 1 80px', textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-1)' }}>{kpi.value}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>{kpi.label}</div>
                  </div>
                ))}
              </div>

              {/* Comparativa vs mes anterior */}
              <div style={{
                background: 'var(--bg)', borderRadius: 10, padding: '10px 14px',
                border: '1px solid var(--border)',
              }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>
                  vs mes anterior
                </div>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  <Delta value={personaDetalle.delta_producciones} label="Producciones" />
                  <Delta value={personaDetalle.delta_completitud} label="Completitud" />
                </div>
              </div>

              {/* Alertas */}
              {personaDetalle.alertas.length > 0 && (
                <div style={{
                  background: 'rgba(251,191,36,0.08)', borderRadius: 10, padding: '10px 14px',
                  border: '1px solid rgba(251,191,36,0.3)',
                }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#b45309', marginBottom: 6 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 4 }}>warning</span>
                    Alertas
                  </div>
                  {personaDetalle.alertas.map((a, i) => (
                    <div key={i} style={{ fontSize: 13, color: '#92400e', marginTop: 4 }}>• {a}</div>
                  ))}
                </div>
              )}

              {/* Turnos del mes */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 8 }}>
                  Turnos del mes
                </div>
                {turnosDetalle.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--text-3)' }}>Sin turnos registrados</div>
                ) : (
                  <div style={{
                    background: 'var(--bg)', borderRadius: 10,
                    border: '1px solid var(--border)', overflow: 'hidden',
                  }}>
                    {turnosDetalle.map((t, i) => (
                      <div key={i} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '9px 12px',
                        borderBottom: i < turnosDetalle.length - 1 ? '1px solid var(--border)' : 'none',
                      }}>
                        <span style={{ fontSize: 13, color: 'var(--text-1)' }}>{t.fecha}</span>
                        <span style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 600 }}>
                          {t.horas_total !== null ? `${t.horas_total.toFixed(1)}h` : '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Tareas extra */}
              {tareasExtraDetalle.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 8 }}>
                    Tareas extra del mes
                  </div>
                  <div style={{
                    background: 'var(--bg)', borderRadius: 10,
                    border: '1px solid var(--border)', overflow: 'hidden',
                  }}>
                    {tareasExtraDetalle.map((t, i) => (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '9px 12px',
                        borderBottom: i < tareasExtraDetalle.length - 1 ? '1px solid var(--border)' : 'none',
                      }}>
                        <span className="material-symbols-outlined" style={{
                          fontSize: 14,
                          color: t.status === 'completada' ? '#16a34a' : 'var(--text-3)',
                        }}>
                          {t.status === 'completada' ? 'check_circle' : 'radio_button_unchecked'}
                        </span>
                        <span style={{ fontSize: 13, color: 'var(--text-1)' }}>{t.titulo ?? 'Sin título'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
      `}</style>
    </div>
  )
}
