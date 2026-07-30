'use client'

import type { PlatoRecetaEnriquecido } from '@/lib/hooks/useCarta'
import type { MisePlaceItem, PlazaCustom } from '@/types'
import { plazaLabel, plazaColor } from '@/lib/constants'
import OpsPanel, { type OpsInitial, type OpsResult } from '@/components/ops/OpsPanel'

interface Props {
  pr: PlatoRecetaEnriquecido
  checklistItem: MisePlaceItem | null
  plazasCustom: PlazaCustom[]
  isOpen: boolean
  saving: boolean
  onToggle: () => void
  onGuardar: (pr: PlatoRecetaEnriquecido, result: OpsResult) => void
  onQuitar: (pr: PlatoRecetaEnriquecido) => void
}

export default function CartaBoardCard({ pr, checklistItem, plazasCustom, isOpen, saving, onToggle, onGuardar, onQuitar }: Props) {
  const color = pr.plaza ? plazaColor(pr.plaza, plazasCustom) : null

  const initial: OpsInitial = {
    plaza: pr.plaza ?? null,
    seccion: checklistItem?.seccion_id ?? null,
    cantidad: pr.cantidad_ops ?? null,
    unidad: pr.unidad_ops ?? null,
    recipienteNombre: checklistItem?.recipiente_nombre ?? null,
    pesoPorcion: checklistItem?.peso_porcion ?? null,
    pesoPorcionUnidad: checklistItem?.peso_porcion_unidad ?? null,
  }

  return (
    <div style={{ borderRadius: 10, background: 'var(--bg)', border: `1px solid ${isOpen ? 'var(--accent)' : 'var(--border)'}`, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6, padding: '8px 10px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-1)', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {pr.receta?.nombre ?? 'Preparación'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {pr.cantidad_ops != null && (
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{pr.cantidad_ops} {pr.unidad_ops ?? 'u'}</span>
            )}
            {pr.plaza ? (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 99, background: `${color}18`, color: color ?? 'var(--text-3)' }}>
                {plazaLabel(pr.plaza, plazasCustom)}
              </span>
            ) : (
              <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 99, background: 'var(--border)', color: 'var(--text-3)' }}>
                Sin plaza
              </span>
            )}
          </div>
        </div>
        <button
          onClick={onToggle}
          title="Asignar a OPS"
          style={{
            display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0,
            padding: '3px 7px', borderRadius: 7, border: 'none', cursor: 'pointer',
            fontSize: 10, fontWeight: 700,
            background: isOpen ? 'rgba(67,97,160,.14)' : 'var(--surface)',
            color: isOpen ? 'var(--accent)' : 'var(--text-3)',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 13 }}>store</span>
          OPS
        </button>
      </div>
      {isOpen && (
        <div style={{ padding: '10px 10px 12px', borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
          <OpsPanel
            initial={initial}
            hasExisting={!!pr.plaza}
            saving={saving}
            onSave={result => onGuardar(pr, result)}
            onRemove={pr.plaza ? () => onQuitar(pr) : undefined}
            onCancel={onToggle}
          />
        </div>
      )}
    </div>
  )
}
