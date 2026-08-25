'use client'

import { useState, useEffect, useMemo } from 'react'
import { useComandas } from '@/lib/hooks/useComandas'
import { useEstaciones, KDS_ESTACION_STORAGE_KEY } from '@/lib/hooks/useEstaciones'
import { useAlertasSonoras } from '@/lib/servicio/useAlertasSonoras'
import type { Comanda, ComandaItem, Estacion, EstadoComandaItem } from '@/types'

// ─── helpers ────────────────────────────────────────────────────────────────

const ESTADO_ITEM_LABEL: Record<EstadoComandaItem, string> = {
  pendiente: 'Pendiente',
  en_prep: 'En prep',
  listo: 'Listo',
  bumpeado: 'Despachado',
}

const ESTADO_ITEM_COLOR: Record<EstadoComandaItem, string> = {
  pendiente: '#2a2a2a',
  en_prep: '#a07a20',
  listo: '#2e7d32',
  bumpeado: '#1a1a1a',
}

function umbralColor(segundos: number): string {
  if (segundos < 300) return '#2e7d32'
  if (segundos < 600) return '#c9a227'
  return '#c0392b'
}

function formatearTiempo(segundos: number): string {
  const m = Math.floor(segundos / 60)
  const s = segundos % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function tiempoFiredMasViejo(items: ComandaItem[]): number | null {
  const fired = items.map(i => i.fired_at).filter((f): f is string => !!f)
  if (fired.length === 0) return null
  return Math.min(...fired.map(f => new Date(f).getTime()))
}

// ─── sub-componentes (nivel módulo — evita remount) ──────────────────────────

function SelectorEstacion({ estaciones, onElegir }: { estaciones: Estacion[]; onElegir: (id: string) => void }) {
  if (estaciones.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, textAlign: 'center' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 56, color: '#444' }}>kitchen</span>
        <p style={{ fontSize: 22, fontWeight: 700, color: '#fff', margin: 0 }}>No hay estaciones configuradas</p>
        <p style={{ fontSize: 16, color: '#888', margin: 0, maxWidth: 340 }}>
          Creá al menos una estación en<br /><strong style={{ color: '#ccc' }}>Configuración → Salón</strong>
        </p>
        <button
          onClick={() => { window.location.href = '/configuracion' }}
          style={{ marginTop: 8, minHeight: 64, padding: '0 32px', borderRadius: 14, border: 'none', background: '#1a1a1a', color: '#fff', fontSize: 18, fontWeight: 700, cursor: 'pointer' }}
        >
          Ir a Configuración
        </button>
      </div>
    )
  }
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 }}>
      <p style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>¿Qué estación es esta pantalla?</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 420 }}>
        {estaciones.map(e => (
          <button
            key={e.id}
            onClick={() => onElegir(e.id)}
            style={{ minHeight: 72, borderRadius: 14, background: '#1a1a1a', border: '1px solid #2a2a2a', color: '#fff', fontSize: 22, fontWeight: 700 }}
          >
            {e.nombre}
          </button>
        ))}
      </div>
    </div>
  )
}

function ItemRow({
  item, onAvanzar, onBump, on86,
}: {
  item: ComandaItem
  onAvanzar: (id: string) => void
  onBump: (id: string) => void
  on86: (cartaItemId: string, nombre: string) => void
}) {
  function onTap() {
    if (item.estado === 'listo') onBump(item.id)
    else onAvanzar(item.id)
  }
  const cartaItemId = item.carta_item_id
  return (
    <div style={{ display: 'flex', gap: 6, width: '100%' }}>
      <button
        onClick={onTap}
        style={{
          flex: 1, minHeight: 64, padding: '10px 14px', borderRadius: 10,
          background: ESTADO_ITEM_COLOR[item.estado], color: '#fff',
          display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
          <span style={{ fontSize: 18, fontWeight: 700 }}>{item.cantidad}× {item.carta_item?.nombre ?? 'Ítem'}</span>
          <span style={{ fontSize: 14, opacity: 0.85 }}>{ESTADO_ITEM_LABEL[item.estado]}</span>
        </div>
        {item.modificadores?.map(m => (
          <span key={m.id} style={{ fontSize: 14, opacity: 0.8 }}>{m.tipo} {m.texto}</span>
        ))}
        {item.notas && <span style={{ fontSize: 14, opacity: 0.8, fontStyle: 'italic' }}>"{item.notas}"</span>}
      </button>
      {cartaItemId && (
        <button
          onClick={() => on86(cartaItemId, item.carta_item?.nombre ?? 'este ítem')}
          title="Marcar agotado (86)"
          style={{ minWidth: 48, borderRadius: 10, background: '#2a1a1a', color: '#e57373', fontWeight: 900, fontSize: 15, border: '1px solid #4a2a2a', flexShrink: 0 }}
        >
          86
        </button>
      )}
    </div>
  )
}

function ComandaCard({
  comanda, ahora, onAvanzarItem, onBumpItem, onBumpComanda, onHold, on86,
}: {
  comanda: Comanda
  ahora: number
  onAvanzarItem: (id: string) => void
  onBumpItem: (id: string) => void
  onBumpComanda: (id: string) => void
  onHold: (id: string) => void
  on86: (cartaItemId: string, nombre: string) => void
}) {
  const firedMs = tiempoFiredMasViejo(comanda.items ?? [])
  const segundos = firedMs ? Math.floor((ahora - firedMs) / 1000) : 0
  const color = comanda.held ? '#333' : (firedMs ? umbralColor(segundos) : '#444')

  return (
    <div style={{ background: '#161616', borderRadius: 16, border: `2px solid ${color}`, display: 'flex', flexDirection: 'column', overflow: 'hidden', opacity: comanda.held ? 0.65 : 1 }}>
      {/* Header */}
      <button
        onClick={() => onHold(comanda.id)}
        style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: color, width: '100%', textAlign: 'left' }}
      >
        <div>
          <p style={{ fontSize: 22, fontWeight: 800, color: '#fff' }}>
            {comanda.mesa ? `Mesa ${comanda.mesa.numero}` : comanda.origen}
          </p>
          {comanda.mozo && <p style={{ fontSize: 14, color: '#fff', opacity: 0.85 }}>{comanda.mozo.nombre}</p>}
        </div>
        <div style={{ textAlign: 'right' }}>
          {comanda.held
            ? <span style={{ fontSize: 16, fontWeight: 800, color: '#fff', letterSpacing: 1 }}>EN ESPERA</span>
            : <p style={{ fontSize: 24, fontWeight: 800, color: '#fff' }}>{firedMs ? formatearTiempo(segundos) : '—'}</p>
          }
        </div>
      </button>
      {/* Ítems */}
      {!comanda.held && (
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(comanda.items ?? []).map(item => (
            <ItemRow key={item.id} item={item} onAvanzar={onAvanzarItem} onBump={onBumpItem} on86={on86} />
          ))}
        </div>
      )}
      {/* Acción */}
      <div style={{ padding: 12, paddingTop: comanda.held ? 12 : 0 }}>
        {comanda.held
          ? (
            <button
              onClick={() => onBumpComanda(comanda.id)}  // reuse handler — Marchar = misma fn con held=false
              style={{ width: '100%', minHeight: 64, borderRadius: 12, background: '#4361a0', color: '#fff', fontSize: 20, fontWeight: 800, letterSpacing: 1 }}
            >
              MARCHAR
            </button>
          )
          : (
            <button
              onClick={() => onBumpComanda(comanda.id)}
              style={{ width: '100%', minHeight: 56, borderRadius: 12, background: '#2a2a2a', color: '#fff', fontSize: 18, fontWeight: 700 }}
            >
              DESPACHAR COMANDA
            </button>
          )
        }
      </div>
    </div>
  )
}

// Panel All-day — nivel módulo
function AllDayPanel({ tarjetas, onCerrar }: { tarjetas: Comanda[]; onCerrar: () => void }) {
  const totales = useMemo(() => {
    const map: Record<string, number> = {}
    for (const c of tarjetas) {
      for (const item of c.items ?? []) {
        if (item.estado === 'bumpeado') continue
        const nombre = item.carta_item?.nombre ?? 'Ítem sin nombre'
        map[nombre] = (map[nombre] ?? 0) + item.cantidad
      }
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [tarjetas])

  return (
    <div
      onClick={onCerrar}
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: '100%', background: '#1a1a1a', borderRadius: '16px 16px 0 0', maxHeight: '60vh', display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #2a2a2a', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>Consolidado</span>
          <button onClick={onCerrar} style={{ background: 'none', color: '#aaa', fontSize: 14 }}>Cerrar</button>
        </div>
        <div style={{ overflowY: 'auto', flex: 1, padding: '8px 20px 24px' }}>
          {totales.length === 0
            ? <p style={{ color: '#666', textAlign: 'center', marginTop: 24 }}>Sin ítems activos</p>
            : totales.map(([nombre, cant]) => (
              <div key={nombre} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid #222' }}>
                <span style={{ fontSize: 18, color: '#fff' }}>{nombre}</span>
                <span style={{ fontSize: 28, fontWeight: 800, color: '#fff', minWidth: 40, textAlign: 'right' }}>{cant}</span>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  )
}

// Panel Recall — nivel módulo
function RecallPanel({
  comandasRecientes, onRestaurar, onCerrar,
}: {
  comandasRecientes: Comanda[]
  onRestaurar: (id: string) => Promise<void>
  onCerrar: () => void
}) {
  const [restaurando, setRestaurando] = useState<string | null>(null)

  async function handleRestaurar(id: string) {
    setRestaurando(id)
    try { await onRestaurar(id) } finally { setRestaurando(null) }
    onCerrar()
  }

  return (
    <div
      onClick={onCerrar}
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: '100%', background: '#1a1a1a', borderRadius: '16px 16px 0 0', maxHeight: '65vh', display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #2a2a2a', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>Recuperar — últimos 30 min</span>
          <button onClick={onCerrar} style={{ background: 'none', color: '#aaa', fontSize: 14 }}>Cerrar</button>
        </div>
        <div style={{ overflowY: 'auto', flex: 1, padding: '8px 20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {comandasRecientes.length === 0
            ? <p style={{ color: '#666', textAlign: 'center', marginTop: 24 }}>Sin comandas despachadas recientes</p>
            : comandasRecientes.map(c => {
              const nombreMesa = c.mesa ? `Mesa ${c.mesa.numero}` : c.origen
              const items = (c.items ?? []).map(i => `${i.cantidad}× ${i.carta_item?.nombre ?? '?'}`).join(', ')
              return (
                <div key={c.id} style={{ background: '#222', borderRadius: 12, padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>{nombreMesa}</p>
                    <p style={{ fontSize: 14, color: '#aaa', marginTop: 4 }}>{items}</p>
                  </div>
                  <button
                    onClick={() => handleRestaurar(c.id)}
                    disabled={restaurando === c.id}
                    style={{ minHeight: 52, minWidth: 100, borderRadius: 10, background: '#4361a0', color: '#fff', fontSize: 15, fontWeight: 700 }}
                  >
                    {restaurando === c.id ? '...' : 'Restaurar'}
                  </button>
                </div>
              )
            })
          }
        </div>
      </div>
    </div>
  )
}

// Sheet de confirmación de 86 — nivel módulo. Mismo lenguaje visual que los
// paneles de arriba (fondo #1a1a1a, sube desde abajo), no el ConfirmSheet
// claro del Mise: acá el fondo fijo oscuro es la regla de la vista de
// servicio (DESIGN.md §2 — Registro Servicio), no algo que se pueda tomar
// prestado de otro registro. Reemplaza el window.confirm() nativo que había
// acá — mismo motivo que en Mise (DESIGN.md §10): nunca un diálogo del SO en
// flujo de servicio. La confirmación en sí se mantiene (no es una acción de
// las 40x/turno, y marcar agotado afecta lo que ve todo el salón).
function Confirmar86Sheet({ nombre, onConfirmar, onCerrar }: { nombre: string; onConfirmar: () => void; onCerrar: () => void }) {
  return (
    <div
      onClick={onCerrar}
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: '100%', background: '#1a1a1a', borderRadius: '16px 16px 0 0', padding: '22px 20px max(20px, env(safe-area-inset-bottom, 20px))' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 26, color: '#e57373' }}>block</span>
          <div>
            <p style={{ fontSize: 17, fontWeight: 800, color: '#fff', margin: 0 }}>¿Marcar agotado?</p>
            <p style={{ fontSize: 13, color: '#999', margin: '2px 0 0' }}>{nombre} no va a aparecer disponible en el salón.</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onCerrar}
            style={{ flex: 1, minHeight: 56, borderRadius: 12, background: '#222', border: 'none', color: '#ccc', fontSize: 14, fontWeight: 700 }}
          >
            Cancelar
          </button>
          <button
            onClick={onConfirmar}
            style={{ flex: 1.3, minHeight: 56, borderRadius: 12, background: '#a04343', border: 'none', color: '#fff', fontSize: 14, fontWeight: 700 }}
          >
            Marcar 86
          </button>
        </div>
      </div>
    </div>
  )
}

// Panel Métricas — nivel módulo
function MetricasPanel({ tarjetas, comandasRecientes, onCerrar }: { tarjetas: Comanda[]; comandasRecientes: Comanda[]; onCerrar: () => void }) {
  const stats = useMemo(() => {
    const bumpeados = comandasRecientes.flatMap(c => c.items ?? []).filter(i => i.estado === 'bumpeado' && i.fired_at && i.bumped_at)
    const tiempos = bumpeados.map(i => (new Date(i.bumped_at!).getTime() - new Date(i.fired_at!).getTime()) / 1000)
    const promedio = tiempos.length > 0 ? Math.round(tiempos.reduce((a, b) => a + b, 0) / tiempos.length) : null
    const pendientes = tarjetas.reduce((s, c) => s + (c.items?.filter(i => i.estado === 'pendiente').length ?? 0), 0)
    const enPrep = tarjetas.reduce((s, c) => s + (c.items?.filter(i => i.estado === 'en_prep').length ?? 0), 0)
    return { bumpeados: bumpeados.length, promedio, pendientes, enPrep }
  }, [tarjetas, comandasRecientes])

  function fmtSeg(s: number | null): string {
    if (s === null) return '—'
    return `${Math.floor(s / 60)}m ${s % 60}s`
  }

  return (
    <div onClick={onCerrar} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', background: '#1a1a1a', borderRadius: '16px 16px 0 0', padding: '20px 20px 40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <span style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>Métricas de cocina</span>
          <button onClick={onCerrar} style={{ background: 'none', color: '#aaa', fontSize: 14 }}>Cerrar</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {[
            { label: 'Tiempo promedio', value: fmtSeg(stats.promedio), icon: 'timer', color: '#c9a227' },
            { label: 'Platos despachados', value: String(stats.bumpeados), icon: 'done_all', color: '#4caf50' },
            { label: 'Pendientes', value: String(stats.pendientes), icon: 'hourglass_empty', color: '#e57373' },
            { label: 'En preparación', value: String(stats.enPrep), icon: 'local_fire_department', color: '#ff9800' },
          ].map(s => (
            <div key={s.label} style={{ background: '#222', borderRadius: 14, padding: '16px 18px' }}>
              <span className="material-symbols-outlined" style={{ color: s.color, fontSize: 24 }}>{s.icon}</span>
              <p style={{ fontSize: 32, fontWeight: 900, color: '#fff', margin: '8px 0 4px' }}>{s.value}</p>
              <p style={{ fontSize: 13, color: '#777' }}>{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── página principal ─────────────────────────────────────────────────────────

export default function KdsPage() {
  const { estaciones, loading: loadingEstaciones } = useEstaciones()
  const [estacionId, setEstacionId] = useState<string | null>(null)
  const [ahora, setAhora] = useState(() => Date.now())
  const [allDayOpen, setAllDayOpen] = useState(false)
  const [recallOpen, setRecallOpen] = useState(false)
  const [metricasOpen, setMetricasOpen] = useState(false)
  const [confirmar86, setConfirmar86] = useState<{ id: string; nombre: string } | null>(null)

  useEffect(() => {
    const saved = localStorage.getItem(KDS_ESTACION_STORAGE_KEY)
    if (saved) setEstacionId(saved)
  }, [])

  useEffect(() => {
    const tick = setInterval(() => setAhora(Date.now()), 1000)
    return () => clearInterval(tick)
  }, [])

  const { comandas, loading: loadingComandas, avanzarItem, bumpearItem, bumpearComanda, restaurarComanda, comandasRecientes, holdComanda, fireComanda } = useComandas(estacionId ?? undefined)

  const tarjetas = useMemo(() => {
    return comandas
      .map(c => ({ ...c, items: (c.items ?? []).filter(i => i.estado !== 'bumpeado') }))
      .filter(c => (c.items?.length ?? 0) > 0 || c.held)
  }, [comandas])

  const { silenciado, toggleSilencio } = useAlertasSonoras(tarjetas, ahora)

  function elegirEstacion(id: string) {
    localStorage.setItem(KDS_ESTACION_STORAGE_KEY, id)
    setEstacionId(id)
  }

  function cambiarEstacion() {
    localStorage.removeItem(KDS_ESTACION_STORAGE_KEY)
    setEstacionId(null)
  }

  async function onToggleHold(id: string) {
    const comanda = comandas.find(c => c.id === id)
    if (!comanda) return
    try {
      if (comanda.held) await fireComanda(id)
      else await holdComanda(id)
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error') }
  }

  async function onAvanzarItem(id: string) {
    try { await avanzarItem(id) } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error') }
  }

  async function onBumpItem(id: string) {
    try { await bumpearItem(id) } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error') }
  }

  async function onBumpOFireComanda(id: string) {
    const comanda = comandas.find(c => c.id === id)
    if (comanda?.held) {
      try { await fireComanda(id) } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error') }
      return
    }
    try { await bumpearComanda(id) } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error') }
  }

  async function onRestaurarComanda(id: string) {
    try { await restaurarComanda(id) } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error') }
  }

  function on86(cartaItemId: string, nombre: string) {
    setConfirmar86({ id: cartaItemId, nombre })
  }

  async function doMarcar86() {
    if (!confirmar86) return
    const { id } = confirmar86
    setConfirmar86(null)
    try {
      await fetch('/api/carta/86', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ carta_item_id: id, disponible: false }),
      })
    } catch { /* fire-and-forget */ }
  }

  if (loadingEstaciones) {
    return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>Cargando...</div>
  }

  if (!estacionId) {
    return <SelectorEstacion estaciones={estaciones} onElegir={elegirEstacion} />
  }

  const estacionActual = estaciones.find(e => e.id === estacionId)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Header */}
      <div style={{ padding: '46px 16px 14px', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <p style={{ fontSize: 22, fontWeight: 700, color: '#fff', flex: 1 }}>{estacionActual?.nombre ?? 'KDS'}</p>
        {/* Consolidado (ex All-day) */}
        <button
          onClick={() => setAllDayOpen(true)}
          style={{ minHeight: 64, padding: '0 14px', borderRadius: 10, background: '#1a1a1a', color: '#fff', fontSize: 14, fontWeight: 600 }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 20, verticalAlign: 'middle', marginRight: 4 }}>table_rows</span>
          Consolidado
        </button>
        {/* Recuperar (ex Recall) */}
        <button
          onClick={() => setRecallOpen(true)}
          style={{ minHeight: 64, padding: '0 14px', borderRadius: 10, background: '#1a1a1a', color: '#fff', fontSize: 14, fontWeight: 600 }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 20, verticalAlign: 'middle', marginRight: 4 }}>history</span>
          Recuperar
        </button>
        {/* Mute */}
        <button
          onClick={toggleSilencio}
          style={{ minHeight: 64, width: 64, borderRadius: 10, background: silenciado ? '#3a1a1a' : '#1a1a1a', color: silenciado ? '#e57373' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          title={silenciado ? 'Activar sonido' : 'Silenciar'}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 22 }}>{silenciado ? 'volume_off' : 'volume_up'}</span>
        </button>
        {/* Métricas */}
        <button
          onClick={() => setMetricasOpen(true)}
          style={{ minHeight: 64, width: 64, borderRadius: 10, background: '#1a1a1a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          title="Métricas"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 22 }}>bar_chart</span>
        </button>
        {/* Cambiar estación */}
        <button onClick={cambiarEstacion} style={{ minHeight: 64, padding: '0 12px', borderRadius: 10, background: '#1a1a1a', color: '#aaa', fontSize: 13 }}>
          Cambiar
        </button>
      </div>

      {/* Grilla de comandas */}
      {loadingComandas ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>Cargando comandas...</div>
      ) : tarjetas.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', fontSize: 18 }}>Sin comandas pendientes</div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16, alignContent: 'start' }}>
          {tarjetas.map(c => (
            <ComandaCard
              key={c.id}
              comanda={c}
              ahora={ahora}
              onAvanzarItem={onAvanzarItem}
              onBumpItem={onBumpItem}
              onBumpComanda={onBumpOFireComanda}
              onHold={onToggleHold}
              on86={on86}
            />
          ))}
        </div>
      )}

      {/* Paneles */}
      {allDayOpen && <AllDayPanel tarjetas={tarjetas} onCerrar={() => setAllDayOpen(false)} />}
      {recallOpen && (
        <RecallPanel
          comandasRecientes={comandasRecientes}
          onRestaurar={onRestaurarComanda}
          onCerrar={() => setRecallOpen(false)}
        />
      )}
      {metricasOpen && (
        <MetricasPanel
          tarjetas={tarjetas}
          comandasRecientes={comandasRecientes}
          onCerrar={() => setMetricasOpen(false)}
        />
      )}
      {confirmar86 && (
        <Confirmar86Sheet
          nombre={confirmar86.nombre}
          onConfirmar={doMarcar86}
          onCerrar={() => setConfirmar86(null)}
        />
      )}
    </div>
  )
}
