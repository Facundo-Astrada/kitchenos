'use client'

import { useEffect, useMemo, useState } from 'react'
import type { SugerenciaResultado } from '@/lib/produccion/sugerencia'
import type { Tarea } from '@/types'

const PLAZA_LABELS: Record<string, string> = {
  parrilla: 'Parrilla', frios: 'Fríos', calientes: 'Calientes',
  pase: 'Pase', pasteleria: 'Pastelería', panaderia: 'Panadería', general: 'General',
}

interface Props {
  tareasExistentes: Tarea[]
  onConfirm: (
    items: { recetaId: string; nombre: string; plaza: string; cantidad: number; unidad: string }[],
    fecha: string,
    diaLabel: string,
  ) => Promise<void>
  onClose: () => void
}

export default function SugerenciaProduccionSheet({ tareasExistentes, onConfirm, onClose }: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<SugerenciaResultado | null>(null)
  const [seleccion, setSeleccion] = useState<Record<string, { checked: boolean; cantidad: number }>>({})
  const [confirmando, setConfirmando] = useState(false)
  const [explicaciones, setExplicaciones] = useState<Record<string, string>>({})
  const [explicando, setExplicando] = useState(false)

  useEffect(() => {
    let cancel = false
    setLoading(true)
    setError(null)
    fetch('/api/produccion/sugerencia')
      .then(r => r.json())
      .then((d: SugerenciaResultado & { error?: string }) => {
        if (cancel) return
        if (d.error) { setError(d.error); return }
        setData(d)
        const sel: Record<string, { checked: boolean; cantidad: number }> = {}
        for (const s of d.sugerencias) sel[s.recetaId] = { checked: s.sugerido > 0, cantidad: s.sugerido }
        setSeleccion(sel)
      })
      .catch((e: Error) => !cancel && setError(e.message))
      .finally(() => !cancel && setLoading(false))
    return () => { cancel = true }
  }, [])

  const yaExistentes = useMemo(() => {
    if (!data) return new Set<string>()
    const s = new Set<string>()
    for (const t of tareasExistentes) {
      if (t.turno_fecha === data.fechaObjetivo && t.estado !== 'listo') s.add(t.titulo.trim().toLowerCase())
    }
    return s
  }, [data, tareasExistentes])

  async function handleExplicar() {
    if (!data || data.sugerencias.length === 0) return
    setExplicando(true)
    try {
      const res = await fetch('/api/produccion/sugerencia/explicar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fechaObjetivo: data.fechaObjetivo, diaSemanaLabel: data.diaSemanaLabel, sugerencias: data.sugerencias }),
      })
      const d = await res.json()
      if (d.explicaciones) setExplicaciones(d.explicaciones)
    } catch { /* best-effort, no bloquea la sugerencia */ }
    finally { setExplicando(false) }
  }

  async function handleConfirm() {
    if (!data) return
    const items = data.sugerencias
      .filter(s => seleccion[s.recetaId]?.checked && seleccion[s.recetaId].cantidad > 0)
      .filter(s => !yaExistentes.has(s.nombre.trim().toLowerCase()))
      .map(s => ({ recetaId: s.recetaId, nombre: s.nombre, plaza: s.plaza ?? 'general', cantidad: seleccion[s.recetaId].cantidad, unidad: s.unidad }))
    if (items.length === 0) { onClose(); return }
    setConfirmando(true)
    try { await onConfirm(items, data.fechaObjetivo, data.diaSemanaLabel) }
    finally { setConfirmando(false) }
  }

  const totalSeleccionados = data
    ? data.sugerencias.filter(s => seleccion[s.recetaId]?.checked && !yaExistentes.has(s.nombre.trim().toLowerCase())).length
    : 0

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: 'var(--surface)', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 520, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '18px 16px 12px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#8b5cf6' }}>auto_awesome</span>
              Sugerir producción
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
              {data ? `Para ${data.diaSemanaLabel} ${data.fechaObjetivo} — según ventas de los últimos ${data.semanasAnalizadas} ${data.diaSemanaLabel}s` : 'Calculando…'}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 0 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--text-3)' }}>close</span>
          </button>
        </div>

        {data?.narracionFactor && (
          <div style={{
            margin: '10px 16px 0', padding: '10px 12px', borderRadius: 10,
            background: 'rgba(20,184,166,.1)', display: 'flex', alignItems: 'flex-start', gap: 8,
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#0d9488', flexShrink: 0, marginTop: 1 }}>event_seat</span>
            <span style={{ fontSize: 12, color: '#0d9488', fontWeight: 600, lineHeight: 1.4 }}>{data.narracionFactor}</span>
          </div>
        )}

        <div style={{ overflowY: 'auto', flex: 1, padding: '12px 16px' }}>
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, gap: 8 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--text-3)', animation: 'spin 1s linear infinite' }}>progress_activity</span>
              <span style={{ fontSize: 13, color: 'var(--text-3)' }}>Analizando ventas históricas…</span>
              <style>{'@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}'}</style>
            </div>
          )}
          {error && (
            <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: '#ef4444' }}>{error}</div>
          )}
          {!loading && !error && data && data.sugerencias.length === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 16px', gap: 8 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 40, color: 'var(--text-3)' }}>query_stats</span>
              <p style={{ fontSize: 13, color: 'var(--text-3)', textAlign: 'center', margin: 0, maxWidth: 300 }}>
                Todavía no hay suficiente historial de ventas de {data.diaSemanaLabel}s vinculado a recetas del mise para sugerir algo confiable (se necesitan al menos 2 fechas de venta con el mismo nombre que una receta activa).
              </p>
            </div>
          )}
          {!loading && !error && data && data.sugerencias.length > 0 && (
            <>
              <button
                onClick={handleExplicar}
                disabled={explicando}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, padding: '6px 10px',
                  background: 'rgba(139,92,246,.1)', border: 'none', borderRadius: 8, cursor: explicando ? 'default' : 'pointer',
                  fontFamily: 'inherit', fontSize: 11, fontWeight: 700, color: '#8b5cf6',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{explicando ? 'hourglass_top' : 'psychology'}</span>
                {explicando ? 'Pensando…' : 'Explicar con IA'}
              </button>
              {data.sugerencias.map(s => {
                const sel = seleccion[s.recetaId] ?? { checked: false, cantidad: s.sugerido }
                const duplicado = yaExistentes.has(s.nombre.trim().toLowerCase())
                return (
                  <div key={s.recetaId} style={{
                    display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 0',
                    borderBottom: '1px solid var(--border)', opacity: duplicado ? 0.5 : 1,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <button
                        disabled={duplicado}
                        onClick={() => setSeleccion(prev => ({ ...prev, [s.recetaId]: { ...sel, checked: !sel.checked } }))}
                        style={{ background: 'none', border: 'none', cursor: duplicado ? 'default' : 'pointer', padding: 0, flexShrink: 0 }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 22, color: sel.checked ? '#22c55e' : 'var(--border)' }}>
                          {sel.checked ? 'check_circle' : 'radio_button_unchecked'}
                        </span>
                      </button>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{s.nombre}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-3)' }}>
                          {s.plaza ? PLAZA_LABELS[s.plaza] ?? s.plaza : 'sin plaza en mise'} · vendés {s.promedioVenta} en promedio ({s.muestras} muestras) · stock {s.stockActual}
                          {duplicado && ' · ya hay una tarea creada'}
                        </div>
                      </div>
                      <input
                        type="number"
                        value={sel.cantidad}
                        disabled={duplicado}
                        onChange={e => setSeleccion(prev => ({ ...prev, [s.recetaId]: { ...sel, cantidad: parseFloat(e.target.value) || 0 } }))}
                        style={{
                          width: 56, padding: '6px 4px', textAlign: 'center', borderRadius: 8, border: '1px solid var(--border)',
                          background: 'var(--bg)', color: 'var(--text-1)', fontSize: 13, fontFamily: "'DM Mono', monospace",
                        }}
                      />
                      <span style={{ fontSize: 10, color: 'var(--text-3)', width: 28 }}>{s.unidad}</span>
                    </div>
                    {explicaciones[s.recetaId] && (
                      <div style={{ marginLeft: 32, fontSize: 11, color: '#8b5cf6', fontStyle: 'italic' }}>
                        {explicaciones[s.recetaId]}
                      </div>
                    )}
                  </div>
                )
              })}
              {data.itemsVendidosSinMatch > 0 && (
                <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 10 }}>
                  {data.itemsVendidosSinMatch} renglones de venta de ese día no matchearon el nombre de ninguna receta activa (no se incluyen).
                </div>
              )}
            </>
          )}
        </div>

        <div style={{ padding: '12px 16px', paddingBottom: 'max(env(safe-area-inset-bottom), 16px)', borderTop: '1px solid var(--border)' }}>
          <button
            onClick={handleConfirm}
            disabled={loading || confirmando || totalSeleccionados === 0}
            style={{
              width: '100%', padding: '13px 0', borderRadius: 12, border: 'none',
              background: totalSeleccionados > 0 ? 'linear-gradient(135deg, var(--navy), #4361a0)' : 'var(--border)',
              color: totalSeleccionados > 0 ? '#fff' : 'var(--text-3)',
              fontSize: 14, fontWeight: 700, cursor: totalSeleccionados > 0 ? 'pointer' : 'default', fontFamily: 'inherit',
              opacity: confirmando ? 0.6 : 1,
            }}
          >
            {confirmando ? 'Creando tareas…' : totalSeleccionados > 0 ? `Crear ${totalSeleccionados} ${totalSeleccionados === 1 ? 'tarea' : 'tareas'}` : 'Nada seleccionado'}
          </button>
        </div>
      </div>
    </div>
  )
}
