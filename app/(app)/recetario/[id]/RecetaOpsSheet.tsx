'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { SECCIONES_OPS, upsertMiseChecklistItem } from '@/lib/ops/mise'
import { useSheetOpen } from '@/lib/ui/chrome'
import OpsPanel, { type OpsInitial, type OpsResult } from '@/components/ops/OpsPanel'

// ════════════════════════════════════════════════════════════
// RECETA OPS SHEET — asignar una receta al mise (plaza / sección /
// recipiente / peso por porción). Chrome de bottom sheet alrededor
// del panel compartido `OpsPanel`. Escribe checklist_items keyed por
// (restaurante_id, receta_id, plaza) vía el helper compartido.
// ════════════════════════════════════════════════════════════
export default function RecetaOpsSheet({
  recetaId, recetaNombre, restauranteId, onClose, onSaved,
}: {
  recetaId: string
  recetaNombre: string
  restauranteId: string
  onClose: () => void
  onSaved?: () => void
}) {
  useSheetOpen()
  const [initial, setInitial] = useState<OpsInitial | null>(null)
  const [existingId, setExistingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Prefill desde el checklist_item existente (si ya tiene OPS asignado)
  useEffect(() => {
    let cancel = false
    createClient()
      .from('checklist_items')
      .select('id, plaza, seccion, seccion_id, cantidad, unidad, recipiente_nombre, recipiente_capacidad, peso_porcion, peso_porcion_unidad')
      .eq('restaurante_id', restauranteId)
      .eq('receta_id', recetaId)
      .limit(1)
      .then(({ data }) => {
        if (cancel) return
        const row = data?.[0] as {
          id: string; plaza: string; seccion: string | null; seccion_id: string | null; cantidad: number | null; unidad: string | null
          recipiente_nombre: string | null; recipiente_capacidad: number | null
          peso_porcion: number | null; peso_porcion_unidad: string | null
        } | undefined
        if (!row) { setInitial({}); return }
        setExistingId(row.id)
        // Preferir el UUID real (seccion_id) — funciona para secciones legacy
        // Y custom (Sesión 2, B2). Fallback al label legacy solo para filas
        // viejas guardadas antes de que seccion_id existiera.
        const secCfg = SECCIONES_OPS.find(s => s.label === row.seccion)
        setInitial({
          plaza: row.plaza ?? '',
          seccion: row.seccion_id ?? secCfg?.id ?? '',
          recipienteNombre: row.recipiente_nombre ?? '',
          cantidad: row.recipiente_capacidad ?? row.cantidad,
          unidad: row.unidad ?? 'porc',
          pesoPorcion: row.peso_porcion,
          pesoPorcionUnidad: row.peso_porcion_unidad ?? 'g',
        })
      })
    return () => { cancel = true }
  }, [recetaId, restauranteId])

  async function handleSave(result: OpsResult) {
    setSaving(true)
    try {
      await upsertMiseChecklistItem({
        supabase: createClient(),
        restauranteId,
        recetaId,
        nombre: recetaNombre,
        plaza: result.plaza,
        seccionMiseId: result.seccion,
        cantidad: result.cantidad,
        unidad: result.unidad,
        recipienteNombre: result.recipienteNombre,
        pesoPorcion: result.pesoPorcion,
        pesoPorcionUnidad: result.pesoPorcionUnidad,
      })
      onSaved?.()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove() {
    if (!existingId) { onClose(); return }
    setSaving(true)
    try {
      await createClient().from('checklist_items').delete().eq('id', existingId)
      onSaved?.()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-[200]" style={{ background: 'rgba(0,0,0,.45)' }} onClick={onClose} />
      <div
        className="fixed inset-x-0 bottom-0 z-[201]"
        style={{ background: 'var(--surface)', borderRadius: '20px 20px 0 0', maxHeight: '88dvh', display: 'flex', flexDirection: 'column', maxWidth: 520, margin: '0 auto' }}
      >
        {/* Título fijo */}
        <div style={{ padding: '18px 16px 10px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--border)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--accent)' }}>restaurant_menu</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>Asignar a OPS / Mise</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{recetaNombre}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-3)', display: 'flex' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22 }}>close</span>
          </button>
        </div>

        {/* Cuerpo scrolleable */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '14px 16px', paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}>
          {initial === null ? (
            <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 13, color: 'var(--text-3)' }}>Cargando…</div>
          ) : (
            <OpsPanel
              initial={initial}
              hasExisting={!!existingId}
              saving={saving}
              onSave={handleSave}
              onRemove={handleRemove}
            />
          )}
        </div>
      </div>
    </>
  )
}
