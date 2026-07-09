'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { OpsModo } from '@/types'

interface Evento {
  id: string
  titulo: string
  fecha_inicio: string
  descripcion: string | null
}

interface EventoBannerProps {
  restauranteId: string
  modo: OpsModo
  onGenerarLista: (seccionIds: string[], eventoTitulo: string) => Promise<void>
}

const SECCIONES_MENU = ['apetizer', 'entrada', 'proteina', 'pasta', 'veggie', 'postre']
const SECCIONES_CARTA = ['caliente', 'fria', 'pasteleria', 'salon', 'general']

export function EventoBanner({ restauranteId, modo, onGenerarLista }: EventoBannerProps) {
  const [evento, setEvento] = useState<Evento | null | undefined>(undefined)
  const [generando, setGenerando] = useState(false)
  const [generado, setGenerado] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!restauranteId) return
    const sb = createClient()
    const hoy = new Date().toISOString().split('T')[0]
    const manana = new Date(Date.now() + 86400000).toISOString().split('T')[0]
    sb.from('eventos')
      .select('id, titulo, fecha_inicio, descripcion')
      .eq('restaurante_id', restauranteId)
      .in('fecha_inicio', [hoy, manana])
      .order('fecha_inicio', { ascending: true })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setEvento(data as Evento | null))
  }, [restauranteId])

  // undefined = aún cargando, null = sin eventos
  if (evento === undefined || evento === null || dismissed) return null

  const hoy = new Date().toISOString().split('T')[0]
  const esManana = evento.fecha_inicio !== hoy
  const fechaLabel = esManana ? 'Mañana' : 'Hoy'

  async function handleGenerarLista() {
    if (generando) return
    setGenerando(true)
    try {
      const secciones = (modo === 'menu' || modo === 'evento') ? SECCIONES_MENU : SECCIONES_CARTA
      await onGenerarLista(secciones, evento!.titulo)
      setGenerado(true)
    } finally {
      setGenerando(false)
    }
  }

  return (
    <div style={{
      margin: '0 0 8px',
      padding: '10px 12px',
      background: 'rgba(245,158,11,.1)',
      border: '1px solid rgba(245,158,11,.3)',
      borderRadius: 12,
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#d97706', flexShrink: 0 }}>event</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {fechaLabel}: {evento.titulo}
        </div>
        {evento.descripcion && (
          <div style={{ fontSize: 11, color: '#b45309', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {evento.descripcion}
          </div>
        )}
      </div>
      {!generado ? (
        <button
          onClick={handleGenerarLista}
          disabled={generando}
          style={{
            flexShrink: 0, padding: '5px 10px', borderRadius: 8,
            background: generando ? 'var(--border)' : '#d97706',
            border: 'none', cursor: generando ? 'default' : 'pointer',
            fontSize: 11, fontWeight: 700, color: generando ? 'var(--text-3)' : '#fff',
            fontFamily: 'inherit', transition: 'all .15s',
          }}
        >
          {generando ? '…' : 'Generar lista'}
        </button>
      ) : (
        <span style={{ fontSize: 11, fontWeight: 700, color: '#22c55e', flexShrink: 0 }}>✓ Lista creada</span>
      )}
      <button
        onClick={() => setDismissed(true)}
        style={{ flexShrink: 0, padding: 2, background: 'none', border: 'none', cursor: 'pointer' }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#b45309' }}>close</span>
      </button>
    </div>
  )
}
