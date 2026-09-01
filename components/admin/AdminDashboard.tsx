'use client'

import { useEffect, useState } from 'react'
import { Num, EmptyState, Skeleton } from '@/components/ui'
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

interface Overview {
  restaurantes: RestauranteOverview[]
  iaCostoTotal30d: number
  serieDiariaIA: { fecha: string; costo: number }[]
}

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

export function AdminDashboard() {
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/overview')
      .then(async r => {
        if (!r.ok) throw new Error(r.status === 404 ? 'Sin acceso' : 'Error al cargar')
        return r.json() as Promise<Overview>
      })
      .then(setData)
      .catch(e => setError(e instanceof Error ? e.message : 'Error al cargar'))
  }, [])

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

  const maxDia = Math.max(...data.serieDiariaIA.map(d => d.costo), 0.01)

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <KPICard label="Restaurantes" valor={String(data.restaurantes.length)} />
        <KPICard
          label="Costo IA · 30 días"
          valor={`${formatCurrency(data.iaCostoTotal30d * USD_A_ARS)} (US$${data.iaCostoTotal30d.toFixed(2)})`}
        />
        <KPICard
          label="Activos ≤7 días"
          valor={String(data.restaurantes.filter(r => {
            const d = diasDesde(r.ultimaActividad)
            return d !== null && d <= 7
          }).length)}
        />
      </div>

      <div>
        <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 8, fontWeight: 500 }}>
          Costo de IA por día — últimos 14 días
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 80, background: 'var(--surface)', borderRadius: 12, padding: '8px 12px', boxShadow: 'var(--shadow-1)' }}>
          {data.serieDiariaIA.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--text-3)', alignSelf: 'center' }}>Sin consumo de IA todavía</div>
          )}
          {data.serieDiariaIA.map(d => (
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
      </div>

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
            {data.restaurantes.map(r => {
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
