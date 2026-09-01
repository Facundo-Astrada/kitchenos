'use client'

import { useEffect, useMemo, useState } from 'react'
import { Num, EmptyState, Skeleton, FilterChips } from '@/components/ui'
import type { FilterChip } from '@/components/ui'
import { PLAN_LABEL, type Plan } from '@/lib/planes'
import { formatCurrency } from '@/lib/utils'

interface RestauranteOverview {
  id: string
  nombre: string
  plan: Plan | null
  creado: string
  usuarios: number
  ultimaActividad: string | null
  iaCosto30d: number
  iaLlamadas30d: number
}

interface ActividadFuncion {
  funcion: string
  porTenant: Record<string, number>
}

interface DiaIA {
  fecha: string
  porTenant: Record<string, number>
}

interface CommitReciente {
  sha: string
  titulo: string
  cuerpo: string | null
  fecha: string
  url: string
}

interface Overview {
  restaurantes: RestauranteOverview[]
  serieDiariaIA: DiaIA[]
  actividadPorFuncion: ActividadFuncion[]
  changelog: CommitReciente[]
}

const TODOS = 'todos'
const USD_A_ARS = 1_480 // dólar oficial, ver decisión de negocio 010 — actualizar si se vuelve a mirar seguido

function diasDesde(iso: string | null): number | null {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24))
}

function colorActividad(dias: number | null): string {
  if (dias === null) return 'var(--text-3)'
  if (dias <= 2) return 'var(--green)'
  if (dias <= 7) return 'var(--yellow)'
  return 'var(--red)'
}

/** Suma un Record<tenantId, number> respetando el filtro: todos los tenants, o solo uno. */
function sumaFiltrada(porTenant: Record<string, number>, filtro: string): number {
  if (filtro === TODOS) return Object.values(porTenant).reduce((a, b) => a + b, 0)
  return porTenant[filtro] ?? 0
}

export function AdminDashboard() {
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<string>(TODOS)

  useEffect(() => {
    fetch('/api/admin/overview')
      .then(async r => {
        if (!r.ok) throw new Error(r.status === 404 ? 'Sin acceso' : 'Error al cargar')
        return r.json() as Promise<Overview>
      })
      .then(setData)
      .catch(e => setError(e instanceof Error ? e.message : 'Error al cargar'))
  }, [])

  const chips: FilterChip<string>[] = useMemo(() => {
    if (!data) return [{ value: TODOS, label: 'Todos' }]
    return [{ value: TODOS, label: 'Todos' }, ...data.restaurantes.map(r => ({ value: r.id, label: r.nombre }))]
  }, [data])

  const restaurantesFiltrados = useMemo(() => {
    if (!data) return []
    return filtro === TODOS ? data.restaurantes : data.restaurantes.filter(r => r.id === filtro)
  }, [data, filtro])

  const funcionesFiltradas = useMemo(() => {
    if (!data) return []
    return data.actividadPorFuncion
      .map(f => ({ funcion: f.funcion, total: sumaFiltrada(f.porTenant, filtro) }))
      .filter(f => f.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 8)
  }, [data, filtro])

  const serieFiltrada = useMemo(() => {
    if (!data) return []
    return data.serieDiariaIA.map(d => ({ fecha: d.fecha, costo: sumaFiltrada(d.porTenant, filtro) }))
  }, [data, filtro])

  if (error) {
    return <EmptyState icon="lock" title="Sin acceso" subtitle={error} />
  }

  if (!data) {
    return (
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Skeleton height={80} />
        <Skeleton height={280} />
      </div>
    )
  }

  const costoIAFiltrado = restaurantesFiltrados.reduce((acc, r) => acc + r.iaCosto30d, 0)
  const activosFiltrados = restaurantesFiltrados.filter(r => {
    const d = diasDesde(r.ultimaActividad)
    return d !== null && d <= 7
  }).length
  const maxDia = Math.max(...serieFiltrada.map(d => d.costo), 0.01)
  const maxFuncion = Math.max(...funcionesFiltradas.map(f => f.total), 1)

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1000, margin: '0 auto' }}>
      <FilterChips chips={chips} active={filtro} onChange={setFiltro} />

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <KPICard label={filtro === TODOS ? 'Restaurantes' : 'Restaurante'} valor={String(restaurantesFiltrados.length)} />
        <KPICard
          label="Costo IA · 30 días"
          valor={`${formatCurrency(costoIAFiltrado * USD_A_ARS)} (US$${costoIAFiltrado.toFixed(2)})`}
        />
        <KPICard label="Activos ≤7 días" valor={String(activosFiltrados)} />
      </div>

      <Seccion titulo="Costo de IA por día — últimos 14 días">
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 80, background: 'var(--surface)', borderRadius: 12, padding: '8px 12px', boxShadow: 'var(--shadow-1)' }}>
          {serieFiltrada.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--text-3)', alignSelf: 'center' }}>Sin consumo de IA todavía</div>
          )}
          {serieFiltrada.map(d => (
            <div key={d.fecha} title={`${d.fecha}: US$${d.costo.toFixed(3)}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}>
              <div style={{
                width: '100%',
                height: `${Math.max(4, (d.costo / maxDia) * 100)}%`,
                background: 'var(--accent)',
                borderRadius: 3,
              }} />
            </div>
          ))}
        </div>
      </Seccion>

      <Seccion titulo="Top funciones — registros creados en los últimos 30 días" subtitulo="Mide escritura (altas), no clicks ni vistas: es lo único que queda registrado hoy.">
        <div style={{ background: 'var(--surface)', borderRadius: 12, padding: 16, boxShadow: 'var(--shadow-1)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {funcionesFiltradas.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--text-3)' }}>Sin actividad en este recorte</div>
          )}
          {funcionesFiltradas.map(f => (
            <div key={f.funcion} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 150, fontSize: 13, color: 'var(--text)', flexShrink: 0 }}>{f.funcion}</div>
              <div style={{ flex: 1, height: 10, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ width: `${(f.total / maxFuncion) * 100}%`, height: '100%', background: 'var(--accent)', borderRadius: 99 }} />
              </div>
              <div style={{ width: 44, textAlign: 'right', fontSize: 13, color: 'var(--text-2)', flexShrink: 0 }}><Num>{f.total}</Num></div>
            </div>
          ))}
        </div>
      </Seccion>

      <Seccion titulo="Por restaurante">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '22%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: '17%' }} />
              <col style={{ width: '18%' }} />
            </colgroup>
            <thead style={{ position: 'sticky', top: 0, zIndex: 5 }}>
              <tr>
                {['Restaurante', 'Plan', 'Usuarios', 'Última actividad', 'Costo IA 30d', 'Llamadas IA 30d'].map(h => (
                  <th key={h} style={{ background: 'var(--navy)', color: '#fff', textAlign: 'left', padding: '10px 12px', fontSize: 13, fontWeight: 500 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {restaurantesFiltrados.map(r => {
                const dias = diasDesde(r.ultimaActividad)
                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 12px', fontSize: 14 }}>{r.nombre}</td>
                    <td style={{ padding: '10px 12px', fontSize: 14, color: r.plan ? 'var(--text)' : 'var(--text-3)' }}>
                      {r.plan ? PLAN_LABEL[r.plan] : 'sin asignar'}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 14 }}><Num>{r.usuarios}</Num></td>
                    <td style={{ padding: '10px 12px', fontSize: 14, color: colorActividad(dias) }}>
                      {dias === null ? 'nunca' : dias === 0 ? 'hoy' : `hace ${dias} día${dias === 1 ? '' : 's'}`}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 14 }}>
                      <Num>{formatCurrency(r.iaCosto30d * USD_A_ARS)}</Num>
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 14 }}><Num>{r.iaLlamadas30d}</Num></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Seccion>

      <Seccion titulo="Últimos cambios" subtitulo="main → deploy automático a Vercel. Fuente: historial de commits.">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {data.changelog.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--text-3)', background: 'var(--surface)', borderRadius: 12, padding: 16, boxShadow: 'var(--shadow-1)' }}>
              No se pudo cargar el historial de commits.
            </div>
          )}
          {data.changelog.map(c => (
            <a
              key={c.sha}
              href={c.url}
              target="_blank"
              rel="noreferrer"
              style={{ display: 'block', background: 'var(--surface)', borderRadius: 12, padding: '12px 16px', boxShadow: 'var(--shadow-1)', textDecoration: 'none', color: 'inherit' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>{c.titulo}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', flexShrink: 0 }}>
                  {new Date(c.fecha).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })} · {c.sha}
                </div>
              </div>
              {c.cuerpo && (
                <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4, whiteSpace: 'pre-wrap' }}>{c.cuerpo}</div>
              )}
            </a>
          ))}
        </div>
      </Seccion>
    </div>
  )
}

function Seccion({ titulo, subtitulo, children }: { titulo: string; subtitulo?: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: subtitulo ? 2 : 8, fontWeight: 500 }}>{titulo}</div>
      {subtitulo && <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 8 }}>{subtitulo}</div>}
      {children}
    </div>
  )
}

function KPICard({ label, valor }: { label: string; valor: string }) {
  return (
    <div style={{ flex: '1 1 200px', background: 'var(--surface)', borderRadius: 12, padding: 16, boxShadow: 'var(--shadow-1)' }}>
      <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--text)' }}><Num>{valor}</Num></div>
    </div>
  )
}
