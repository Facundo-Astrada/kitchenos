'use client'

import PageTransition from '@/components/PageTransition'
import { useState, useMemo, useCallback, useEffect } from 'react'
import { useMerma } from '@/lib/hooks/useMerma'
import { MOTIVOS_MERMA } from '@/types'
import type { Merma, MotivoMerma } from '@/types'
import MermaBottomSheet from '@/components/merma/MermaBottomSheet'

// ── Helpers ─────────────────────────────────────────────────
type Periodo = 'hoy' | 'semana' | 'mes' | 'todo'

function fmtDate(d: Date) {
  return d.toISOString().split('T')[0]
}

function getRango(periodo: Periodo): { desde?: string; hasta?: string } {
  const hoy = new Date()
  switch (periodo) {
    case 'hoy':
      return { desde: fmtDate(hoy), hasta: fmtDate(hoy) }
    case 'semana': {
      const inicio = new Date(hoy)
      inicio.setDate(hoy.getDate() - hoy.getDay())
      return { desde: fmtDate(inicio), hasta: fmtDate(hoy) }
    }
    case 'mes': {
      const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
      return { desde: fmtDate(inicio), hasta: fmtDate(hoy) }
    }
    case 'todo':
      return {}
  }
}

function fmtFechaGrupo(fecha: string): string {
  const hoy = fmtDate(new Date())
  if (fecha === hoy) return 'Hoy'
  const ayer = new Date()
  ayer.setDate(ayer.getDate() - 1)
  if (fecha === fmtDate(ayer)) return 'Ayer'
  const d = new Date(fecha + 'T12:00:00')
  return d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
}

function fmtPrecio(n: number | null | undefined): string {
  if (!n || n === 0) return '—'
  return '$' + n.toLocaleString('es-AR', { maximumFractionDigits: 0 })
}

function motivoInfo(motivo: MotivoMerma) {
  return MOTIVOS_MERMA.find(m => m.value === motivo) ?? { label: motivo, icon: 'help', color: '#6b7280' }
}

const TURNO_LABELS: Record<string, string> = {
  apertura: 'Apertura',
  servicio: 'Servicio',
  cierre: 'Cierre',
}

const PERIODOS: { value: Periodo; label: string }[] = [
  { value: 'hoy', label: 'Hoy' },
  { value: 'semana', label: 'Semana' },
  { value: 'mes', label: 'Mes' },
  { value: 'todo', label: 'Todo' },
]

// ── Component ───────────────────────────────────────────────
export default function MermaPage() {
  const { registros, loading, fetchMerma, registrarMerma, eliminarMerma } = useMerma()
  const [periodo, setPeriodo] = useState<Periodo>('hoy')

  useEffect(() => {
    localStorage.setItem('kc_screen_context', JSON.stringify({ screen: 'merma', total: registros.length }))
    return () => localStorage.removeItem('kc_screen_context')
  }, [registros.length])
  const [sheetOpen, setSheetOpen] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [toast, setToast] = useState('')

  // ── Fetch on period change ────────────────────────────────
  const handlePeriodo = useCallback((p: Periodo) => {
    setPeriodo(p)
    const { desde, hasta } = getRango(p)
    fetchMerma(desde, hasta)
  }, [fetchMerma])

  // ── Stats ─────────────────────────────────────────────────
  const stats = useMemo(() => {
    const totalCosto = registros.reduce((s, m) => s + (m.costo_estimado ?? 0), 0)
    const totalRegistros = registros.length

    // Top motivo
    const motivoCount: Record<string, number> = {}
    registros.forEach(m => { motivoCount[m.motivo] = (motivoCount[m.motivo] ?? 0) + 1 })
    const topMotivoKey = Object.entries(motivoCount).sort((a, b) => b[1] - a[1])[0]?.[0] as MotivoMerma | undefined
    const topMotivo = topMotivoKey ? motivoInfo(topMotivoKey) : null

    // Top producto
    const prodCount: Record<string, number> = {}
    registros.forEach(m => { prodCount[m.producto_nombre] = (prodCount[m.producto_nombre] ?? 0) + 1 })
    const topProducto = Object.entries(prodCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

    return { totalCosto, totalRegistros, topMotivo, topMotivoKey, topProducto }
  }, [registros])

  // ── Group by date ─────────────────────────────────────────
  const grouped = useMemo(() => {
    const map = new Map<string, Merma[]>()
    registros.forEach(m => {
      const key = m.fecha ?? m.created_at?.split('T')[0] ?? 'sin-fecha'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(m)
    })
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  }, [registros])

  // ── Actions ───────────────────────────────────────────────
  async function handleRegistrar(data: Parameters<typeof registrarMerma>[0]) {
    try {
      await registrarMerma(data)
      setSheetOpen(false)
      showToast('Merma registrada')
      const { desde, hasta } = getRango(periodo)
      fetchMerma(desde, hasta)
    } catch (e: unknown) {
      showToast('Error al registrar: ' + (e instanceof Error ? e.message : 'desconocido'))
    }
  }

  async function handleEliminar(id: string) {
    setDeletingId(id)
    try {
      await eliminarMerma(id)
      showToast('Registro eliminado')
      const { desde, hasta } = getRango(periodo)
      fetchMerma(desde, hasta)
    } catch (e: unknown) {
      showToast('Error al eliminar: ' + (e instanceof Error ? e.message : 'desconocido'))
    } finally {
      setDeletingId(null)
    }
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  // ── Render ────────────────────────────────────────────────
  return (
    <PageTransition>
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', paddingBottom: 100 }}>

      {/* Header */}
      <div style={{ background: 'var(--navy)', padding: '46px 16px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 className="text-[22px] font-bold" style={{ color: '#fff' }}>Merma</h1>
            <p className="text-[13px] mt-0.5" style={{ color: 'rgba(255,255,255,0.65)' }}>Control de desperdicios</p>
          </div>
          <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>delete_sweep</span>
        </div>

        {/* Period pills in header */}
        <div className="flex gap-2 pb-3 pt-3 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {PERIODOS.map(p => (
            <button
              key={p.value}
              onClick={() => handlePeriodo(p.value)}
              className="text-[13px] font-medium px-3.5 py-1.5 rounded-full transition-colors shrink-0"
              style={{
                background: periodo === p.value ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.08)',
                color: '#fff',
                border: `1px solid ${periodo === p.value ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.15)'}`,
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stats cards */}
      <div className="flex gap-3 px-4 pb-4 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        <StatCard icon="payments" label="Total costo" value={fmtPrecio(stats.totalCosto)} color="var(--accent)" />
        <StatCard icon="inventory_2" label="Registros" value={String(stats.totalRegistros)} color="var(--navy)" />
        <StatCard
          icon={stats.topMotivo?.icon ?? 'help'}
          label="Top motivo"
          value={stats.topMotivo?.label ?? '—'}
          color={stats.topMotivo?.color ?? '#6b7280'}
        />
        <StatCard icon="restaurant" label="Top producto" value={stats.topProducto ?? '—'} color="var(--accent)" />
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <span className="material-symbols-outlined animate-spin text-[28px]" style={{ color: 'var(--text-2)' }}>progress_activity</span>
        </div>
      )}

      {/* Empty state */}
      {!loading && registros.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
          <span className="material-symbols-outlined text-[48px] mb-3" style={{ color: 'var(--border)' }}>delete_sweep</span>
          <p className="text-[15px] font-medium" style={{ color: 'var(--text-1)' }}>Sin registros de merma</p>
          <p className="text-[13px] mt-1" style={{ color: 'var(--text-2)' }}>
            Registra el desperdicio para llevar control de costos
          </p>
        </div>
      )}

      {/* Grouped list */}
      {!loading && grouped.map(([fecha, items]) => (
        <div key={fecha} className="mb-2">
          {/* Date header */}
          <div className="px-4 py-2">
            <p className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-2)' }}>
              {fmtFechaGrupo(fecha)}
            </p>
          </div>

          {/* Items */}
          {items.map(m => {
            const mi = motivoInfo(m.motivo as MotivoMerma)
            return (
              <div
                key={m.id}
                className="mx-4 mb-2 rounded-xl p-3 flex items-start gap-3"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
              >
                {/* Motivo icon */}
                <div
                  className="flex items-center justify-center rounded-lg shrink-0"
                  style={{ width: 40, height: 40, background: mi.color + '18' }}
                >
                  <span className="material-symbols-outlined text-[20px]" style={{ color: mi.color }}>
                    {mi.icon}
                  </span>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold truncate" style={{ color: 'var(--text-1)' }}>
                    {m.producto_nombre}
                  </p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-[12px] font-medium" style={{ color: 'var(--text-2)' }}>
                      {m.cantidad} {m.unidad}
                    </span>
                    {/* Motivo badge */}
                    <span
                      className="text-[11px] font-medium px-2 py-0.5 rounded-full inline-flex items-center gap-1"
                      style={{ background: mi.color + '18', color: mi.color }}
                    >
                      <span className="material-symbols-outlined text-[12px]">{mi.icon}</span>
                      {mi.label}
                    </span>
                    {/* Turno badge */}
                    {m.turno && (
                      <span
                        className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                        style={{ background: 'var(--bg)', color: 'var(--text-2)', border: '1px solid var(--border)' }}
                      >
                        {TURNO_LABELS[m.turno] ?? m.turno}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1.5">
                    {(m.costo_estimado ?? 0) > 0 && (
                      <span className="text-[12px] font-semibold" style={{ color: '#ef4444' }}>
                        {fmtPrecio(m.costo_estimado ?? 0)}
                      </span>
                    )}
                    {m.usuario_nombre && (
                      <span className="text-[11px]" style={{ color: 'var(--text-2)' }}>
                        {m.usuario_nombre}
                      </span>
                    )}
                  </div>
                </div>

                {/* Delete button */}
                <button
                  onClick={() => handleEliminar(m.id)}
                  disabled={deletingId === m.id}
                  className="shrink-0 flex items-center justify-center rounded-lg transition-colors"
                  style={{ width: 36, height: 36, background: deletingId === m.id ? '#fee2e2' : 'transparent' }}
                  aria-label="Eliminar registro"
                >
                  <span
                    className="material-symbols-outlined text-[20px]"
                    style={{ color: deletingId === m.id ? '#dc2626' : 'var(--text-2)' }}
                  >
                    {deletingId === m.id ? 'progress_activity' : 'delete'}
                  </span>
                </button>
              </div>
            )
          })}
        </div>
      ))}

      {/* FAB */}
      <button
        onClick={() => setSheetOpen(true)}
        className="fixed right-5 z-40 flex items-center justify-center rounded-full shadow-lg active:scale-95 transition-transform"
        style={{ width: 56, height: 56, background: 'var(--navy)', bottom: 110 }}
        aria-label="Registrar merma"
      >
        <span className="material-symbols-outlined text-[28px] text-white">add</span>
      </button>

      {/* Bottom Sheet */}
      <MermaBottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onRegistrar={handleRegistrar}
      />

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-28 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl text-[13px] font-medium shadow-lg"
          style={{ background: 'var(--navy)', color: '#fff' }}
        >
          {toast}
        </div>
      )}
    </div>
    </PageTransition>
  )
}

// ── Stat Card ───────────────────────────────────────────────
function StatCard({ icon, label, value, color }: { icon: string; label: string; value: string; color: string }) {
  return (
    <div
      className="shrink-0 rounded-xl p-3 flex flex-col gap-1"
      style={{ minWidth: 130, background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-center gap-1.5">
        <span className="material-symbols-outlined text-[16px]" style={{ color }}>{icon}</span>
        <span className="text-[11px] font-medium" style={{ color: 'var(--text-2)' }}>{label}</span>
      </div>
      <p className="text-[16px] font-bold truncate" style={{ color: 'var(--text-1)' }}>{value}</p>
    </div>
  )
}
