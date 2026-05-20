'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Ing { nombre: string; cantidad: number | null; unidad: string }
interface UltimaProduccion { fecha: string; cantidad_planificada: number | null; usuario_nombre: string | null }

interface RecetaDrawerProps {
  recetaId: string
  recetaNombre: string
  onClose: () => void
}

export function RecetaDrawer({ recetaId, recetaNombre, onClose }: RecetaDrawerProps) {
  const [ings, setIngs] = useState<Ing[]>([])
  const [loading, setLoading] = useState(true)
  const [ultimaProd, setUltimaProd] = useState<UltimaProduccion | null>(null)
  const touchY0 = useRef(0)
  const sheetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const sb = createClient()
    Promise.all([
      sb.from('ingredientes').select('nombre, cantidad, unidad').eq('receta_id', recetaId),
      sb.from('produccion_registros')
        .select('fecha, cantidad_planificada, usuario_nombre')
        .eq('receta_id', recetaId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]).then(([{ data: ingsData }, { data: prodData }]) => {
      setIngs((ingsData ?? []) as Ing[])
      setUltimaProd(prodData as UltimaProduccion | null)
      setLoading(false)
    })
  }, [recetaId])

  function onTouchStart(e: React.TouchEvent) {
    touchY0.current = e.touches[0].clientY
  }
  function onTouchMove(e: React.TouchEvent) {
    const dy = e.touches[0].clientY - touchY0.current
    if (dy > 0 && sheetRef.current) {
      sheetRef.current.style.transform = `translateY(${dy}px)`
    }
  }
  function onTouchEnd(e: React.TouchEvent) {
    const dy = e.changedTouches[0].clientY - touchY0.current
    if (sheetRef.current) sheetRef.current.style.transform = ''
    if (dy > 90) onClose()
  }

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 300 }}
      />
      <div
        ref={sheetRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 301,
          background: 'var(--surface)',
          borderRadius: '20px 20px 0 0',
          maxHeight: '65vh',
          display: 'flex', flexDirection: 'column',
          paddingBottom: 'max(env(safe-area-inset-bottom), 16px)',
          transition: 'transform .15s',
        }}
      >
        <div
          style={{ width: 40, height: 4, background: 'var(--border)', borderRadius: 99, margin: '10px auto 0', flexShrink: 0 }}
        />
        <div style={{ padding: '12px 16px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>{recetaNombre}</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '.06em' }}>
            Ingredientes
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 16px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 28, color: 'var(--text-3)', fontSize: 13 }}>Cargando...</div>
          ) : ings.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 28, color: 'var(--text-3)', fontSize: 13 }}>Sin receta cargada</div>
          ) : ings.map((ing, i) => (
            <div
              key={i}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '9px 0', borderBottom: '1px solid var(--border)',
              }}
            >
              <span style={{ fontSize: 13, color: 'var(--text-1)' }}>{ing.nombre}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', fontFamily: "'DM Mono', monospace" }}>
                {ing.cantidad ?? ''} {ing.unidad}
              </span>
            </div>
          ))}
        </div>
        {ultimaProd && (
          <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 3 }}>
              Última producción
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
              {new Date(ultimaProd.fecha + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
              {ultimaProd.cantidad_planificada != null && ` · ${ultimaProd.cantidad_planificada} pax`}
              {ultimaProd.usuario_nombre && ` · por ${ultimaProd.usuario_nombre}`}
            </div>
          </div>
        )}
        <button
          onClick={onClose}
          style={{
            margin: '8px 16px 0', padding: 12, borderRadius: 12,
            border: 'none', cursor: 'pointer', background: 'var(--bg)',
            color: 'var(--text-2)', fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
          }}
        >
          Cerrar
        </button>
      </div>
    </>
  )
}
