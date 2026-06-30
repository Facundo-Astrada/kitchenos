'use client'

import { useState, useEffect, useMemo } from 'react'
import { useComandas } from '@/lib/hooks/useComandas'
import { useEstaciones, KDS_ESTACION_STORAGE_KEY } from '@/lib/hooks/useEstaciones'
import type { Comanda, ComandaItem, Estacion, EstadoComandaItem } from '@/types'

const ESTADO_ITEM_LABEL: Record<EstadoComandaItem, string> = {
  pendiente: 'Pendiente',
  en_prep: 'En prep',
  listo: 'Listo',
  bumpeado: 'Bumpeado',
}

const ESTADO_ITEM_COLOR: Record<EstadoComandaItem, string> = {
  pendiente: '#2a2a2a',
  en_prep: '#a07a20',
  listo: '#2e7d32',
  bumpeado: '#1a1a1a',
}

function umbralColor(segundos: number): string {
  if (segundos < 300) return '#2e7d32'   // verde — <5min
  if (segundos < 600) return '#c9a227'   // amarillo — 5-10min
  return '#c0392b'                        // rojo — >10min
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

function SelectorEstacion({ estaciones, onElegir }: { estaciones: Estacion[]; onElegir: (id: string) => void }) {
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
  item, onAvanzar, onBump,
}: {
  item: ComandaItem
  onAvanzar: (id: string) => void
  onBump: (id: string) => void
}) {
  function onTap() {
    if (item.estado === 'listo') onBump(item.id)
    else onAvanzar(item.id)
  }
  return (
    <button
      onClick={onTap}
      style={{
        width: '100%', minHeight: 64, padding: '10px 14px', borderRadius: 10,
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
      {item.notas && <span style={{ fontSize: 14, opacity: 0.8, fontStyle: 'italic' }}>“{item.notas}”</span>}
    </button>
  )
}

function ComandaCard({
  comanda, ahora, onAvanzarItem, onBumpItem, onBumpComanda,
}: {
  comanda: Comanda
  ahora: number
  onAvanzarItem: (id: string) => void
  onBumpItem: (id: string) => void
  onBumpComanda: (id: string) => void
}) {
  const firedMs = tiempoFiredMasViejo(comanda.items ?? [])
  const segundos = firedMs ? Math.floor((ahora - firedMs) / 1000) : 0
  const color = firedMs ? umbralColor(segundos) : '#444'

  return (
    <div style={{ background: '#161616', borderRadius: 16, border: `2px solid ${color}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: color }}>
        <div>
          <p style={{ fontSize: 22, fontWeight: 800, color: '#fff' }}>
            {comanda.mesa ? `Mesa ${comanda.mesa.numero}` : comanda.origen}
          </p>
          {comanda.mozo && <p style={{ fontSize: 14, color: '#fff', opacity: 0.85 }}>{comanda.mozo.nombre}</p>}
        </div>
        <p style={{ fontSize: 24, fontWeight: 800, color: '#fff' }}>{firedMs ? formatearTiempo(segundos) : '—'}</p>
      </div>
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {(comanda.items ?? []).map(item => (
          <ItemRow key={item.id} item={item} onAvanzar={onAvanzarItem} onBump={onBumpItem} />
        ))}
      </div>
      <div style={{ padding: 12, paddingTop: 0 }}>
        <button
          onClick={() => onBumpComanda(comanda.id)}
          style={{ width: '100%', minHeight: 56, borderRadius: 12, background: '#2a2a2a', color: '#fff', fontSize: 18, fontWeight: 700 }}
        >
          BUMP COMANDA
        </button>
      </div>
    </div>
  )
}

export default function KdsPage() {
  const { estaciones, loading: loadingEstaciones } = useEstaciones()
  const [estacionId, setEstacionId] = useState<string | null>(null)
  const [ahora, setAhora] = useState(() => Date.now())

  useEffect(() => {
    const saved = localStorage.getItem(KDS_ESTACION_STORAGE_KEY)
    if (saved) setEstacionId(saved)
  }, [])

  useEffect(() => {
    const tick = setInterval(() => setAhora(Date.now()), 1000)
    return () => clearInterval(tick)
  }, [])

  const { comandas, loading: loadingComandas, avanzarItem, bumpearItem, bumpearComanda } = useComandas(estacionId ?? undefined)

  const tarjetas = useMemo(() => {
    return comandas
      .map(c => ({ ...c, items: (c.items ?? []).filter(i => i.estado !== 'bumpeado') }))
      .filter(c => (c.items?.length ?? 0) > 0)
  }, [comandas])

  function elegirEstacion(id: string) {
    localStorage.setItem(KDS_ESTACION_STORAGE_KEY, id)
    setEstacionId(id)
  }

  function cambiarEstacion() {
    localStorage.removeItem(KDS_ESTACION_STORAGE_KEY)
    setEstacionId(null)
  }

  async function onAvanzarItem(id: string) {
    try { await avanzarItem(id) } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error') }
  }
  async function onBumpItem(id: string) {
    try { await bumpearItem(id) } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error') }
  }
  async function onBumpComanda(id: string) {
    try { await bumpearComanda(id) } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error') }
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
      <div style={{ padding: '46px 16px 14px', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p style={{ fontSize: 24, fontWeight: 700, color: '#fff' }}>{estacionActual?.nombre ?? 'KDS'}</p>
        <button onClick={cambiarEstacion} style={{ minHeight: 44, padding: '0 16px', borderRadius: 10, background: '#1a1a1a', color: '#fff', fontSize: 14 }}>
          Cambiar estación
        </button>
      </div>
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
              onBumpComanda={onBumpComanda}
            />
          ))}
        </div>
      )}
    </div>
  )
}
