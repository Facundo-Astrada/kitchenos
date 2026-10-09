'use client'

// "Planificar evento": elige un evento del catálogo de Carta + rango de
// fechas y activa su producción. Solo eventos — un menú fijo se activa por
// vigencia en el mise, no por fecha (adenda 2026-08-20, "una sola puerta de
// activación", PLAN-MENUS-MISE-2026-08.md). Lógica compartida con "Cargar
// menú" de Planificación vía lib/menus/activarMenu.ts. Sin cambios de
// comportamiento: se movió desde calendario/page.tsx.

import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui'
import type { MenuConPreparaciones } from '@/lib/hooks/useMenus'
import { rangoFechas } from '@/lib/menus/activarMenu'
import { fieldStyle, labelStyle, btnPrimario, btnSecundario } from './shared'

export function PlanificarEventoModal({ open, fecha, catalogo, onClose, onActivar }: {
  open: boolean
  fecha: string
  catalogo: MenuConPreparaciones[]
  onClose: () => void
  onActivar: (menu: MenuConPreparaciones, desde: string, hasta: string) => Promise<void>
}) {
  const [menuId, setMenuId] = useState('')
  const [desde, setDesde] = useState(fecha)
  const [hasta, setHasta] = useState(fecha)
  const [activando, setActivando] = useState(false)
  useEffect(() => { if (open) { setMenuId(''); setDesde(fecha); setHasta(fecha) } }, [open, fecha])

  const menu = catalogo.find(m => m.id === menuId) ?? null
  const dias = desde && hasta && hasta >= desde ? rangoFechas(desde, hasta).length : 0

  const activar = async () => {
    if (!menu || dias === 0) return
    setActivando(true)
    try { await onActivar(menu, desde, hasta) } finally { setActivando(false) }
  }

  return (
    <Modal open={open} onClose={onClose} maxWidth={560}>
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Planificar evento</h2>
            <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '3px 0 0' }}>Activa la producción de un evento del catálogo para uno o varios días</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', padding: 4, flexShrink: 0 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22 }}>close</span>
          </button>
        </div>

        <div>
          <span style={labelStyle}>Evento</span>
          {catalogo.length === 0 ? (
            <div style={{ border: '1px dashed var(--border)', borderRadius: 12, padding: 18, textAlign: 'center', fontSize: 12.5, color: 'var(--text-3)' }}>
              No hay eventos en el catálogo. Armá uno en Carta → Menús.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {catalogo.map(m => {
                const sel = menuId === m.id
                return (
                  <button key={m.id} type="button" aria-pressed={sel} onClick={() => setMenuId(m.id)} style={{
                    textAlign: 'left', background: sel ? 'rgba(67,97,160,0.08)' : 'var(--surface)',
                    border: sel ? '2px solid var(--accent)' : '1px solid var(--border)',
                    borderRadius: 12, padding: '10px 14px', cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#8b5cf6' }}>celebration</span>
                      <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{m.nombre}</span>
                      <span style={{ fontSize: 11.5, color: 'var(--text-3)', fontWeight: 600 }}>{m.preparaciones.length} prep.</span>
                    </div>
                    {m.descripcion && <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 3, paddingLeft: 26 }}>{m.descripcion}</div>}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label htmlFor="pl-desde" style={labelStyle}>Desde</label>
            <input id="pl-desde" type="date" style={fieldStyle} value={desde} onChange={e => { setDesde(e.target.value); if (hasta < e.target.value) setHasta(e.target.value) }} />
          </div>
          <div style={{ flex: 1 }}>
            <label htmlFor="pl-hasta" style={labelStyle}>Hasta</label>
            <input id="pl-hasta" type="date" style={fieldStyle} min={desde} value={hasta} onChange={e => setHasta(e.target.value)} />
          </div>
        </div>
        {dias > 0 && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: -8 }}>{dias === 1 ? 'Se activa 1 día' : `Se activa en ${dias} días`}</div>}

        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" onClick={onClose} style={btnSecundario}>Cancelar</button>
          <button type="button" onClick={activar} disabled={!menu || activando || dias === 0}
            style={{ ...btnPrimario, opacity: (!menu || activando || dias === 0) ? 0.5 : 1 }}>
            {activando ? 'Activando…' : 'Activar'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
