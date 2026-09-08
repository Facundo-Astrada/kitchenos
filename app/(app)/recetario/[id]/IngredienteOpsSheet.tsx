'use client'

import { Modal } from '@/components/ui'
import OpsPanel, { type OpsInitial, type OpsResult } from '@/components/ops/OpsPanel'
import type { Ingrediente } from '@/types'

// ════════════════════════════════════════════════════════════
// INGREDIENTE OPS SHEET — asignar un ingrediente/subreceta de una
// receta-plato a OPS/mise. Chrome de bottom sheet alrededor del
// panel compartido `OpsPanel`. La persistencia (fila del ingrediente
// + mise para subrecetas) la hace el padre en onSave/onRemove.
// ════════════════════════════════════════════════════════════
export default function IngredienteOpsSheet({
  ing, saving, onClose, onSave, onRemove,
}: {
  ing: Ingrediente
  saving?: boolean
  onClose: () => void
  onSave: (result: OpsResult) => void
  onRemove: () => void
}) {
  const initial: OpsInitial = {
    plaza: ing.plaza,
    // seccion_mise ya guarda el id tal cual lo emitió OpsPanel (legacy o UUID
    // real de checklist_secciones) — pasarlo directo, sin remapear.
    seccion: ing.seccion_mise ?? '',
    recipienteNombre: ing.recipiente_nombre,
    cantidad: ing.cantidad_ops,
    unidad: ing.unidad_ops,
    pesoPorcion: ing.peso_porcion,
    pesoPorcionUnidad: ing.peso_porcion_unidad,
  }

  return (
    <Modal open onClose={onClose} maxWidth={520}>
        {/* Título fijo */}
        <div style={{ padding: '18px 16px 10px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--border)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--accent)' }}>restaurant_menu</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>Asignar a OPS / Mise</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {ing.nombre}{ing.subreceta_id ? ' · subreceta' : ''}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-3)', display: 'flex' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22 }}>close</span>
          </button>
        </div>

        <div style={{ padding: '14px 16px', paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}>
          <OpsPanel
            initial={initial}
            hasExisting={!!ing.plaza}
            saving={saving}
            onSave={onSave}
            onRemove={onRemove}
          />
        </div>
    </Modal>
  )
}
