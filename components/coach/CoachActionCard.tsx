'use client'

import { useState } from 'react'
import type { PendingAction, CampoUI } from '@/lib/coach/types'

interface Props {
  action: PendingAction
  onConfirm: (draftId: string, payload: Record<string, unknown>) => Promise<void>
  onCancel: (draftId: string) => Promise<void>
  busy?: boolean
}

const TOOL_ICON: Record<string, string> = {
  crear_tarea: 'add_task',
  marcar_86: 'block',
  registrar_merma: 'delete_sweep',
  cargar_producto: 'inventory_2',
  ajustar_stock: 'tune',
  registrar_venta: 'point_of_sale',
}

function valorInicial(campos: CampoUI[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const c of campos) out[c.key] = c.valor ?? (c.tipo === 'numero' ? '' : '')
  return out
}

export function CoachActionCard({ action, onConfirm, onCancel, busy }: Props) {
  const [valores, setValores] = useState<Record<string, unknown>>(() => valorInicial(action.campos))

  const setCampo = (key: string, val: unknown) => setValores(prev => ({ ...prev, [key]: val }))

  const faltaRequerido = action.campos.some(c => c.requerido && (valores[c.key] === '' || valores[c.key] == null))

  const handleConfirm = async () => {
    const payload: Record<string, unknown> = {}
    for (const c of action.campos) {
      const v = valores[c.key]
      if (v === '' || v == null) continue
      payload[c.key] = c.tipo === 'numero' ? Number(v) : v
    }
    await onConfirm(action.draft_id, payload)
  }

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
      padding: 12, margin: '8px 0', display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#f97316', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#fff' }}>
            {TOOL_ICON[action.tool_name] ?? 'auto_awesome'}
          </span>
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{action.titulo}</div>
          <div style={{ fontSize: 12, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{action.resumen}</div>
        </div>
      </div>

      {action.warnings.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {action.warnings.map((w, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', background: 'rgba(245,158,11,.1)', border: '1px solid rgba(245,158,11,.3)', borderRadius: 8, padding: '6px 8px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#f59e0b', flexShrink: 0, marginTop: 1 }}>warning</span>
              <span style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.4 }}>{w}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {action.campos.map(c => (
          <label key={c.key} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)' }}>
              {c.label}{c.requerido ? ' *' : ''}
            </span>
            {c.tipo === 'select' ? (
              <select
                value={String(valores[c.key] ?? '')}
                onChange={e => setCampo(c.key, e.target.value)}
                disabled={busy}
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 8px', fontSize: 13, color: 'var(--text-1)', fontFamily: 'inherit' }}
              >
                <option value="">—</option>
                {(c.opciones ?? []).map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : c.tipo === 'textarea' ? (
              <textarea
                value={String(valores[c.key] ?? '')}
                onChange={e => setCampo(c.key, e.target.value)}
                disabled={busy}
                rows={2}
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 8px', fontSize: 13, color: 'var(--text-1)', fontFamily: 'inherit', resize: 'none' }}
              />
            ) : (
              <input
                type={c.tipo === 'numero' ? 'number' : 'text'}
                value={String(valores[c.key] ?? '')}
                onChange={e => setCampo(c.key, e.target.value)}
                disabled={busy}
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 8px', fontSize: 13, color: 'var(--text-1)', fontFamily: 'inherit' }}
              />
            )}
          </label>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => onCancel(action.draft_id)}
          disabled={busy}
          style={{ flex: 1, padding: '9px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-2)', fontSize: 13, fontWeight: 600, cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit' }}
        >
          Cancelar
        </button>
        <button
          onClick={handleConfirm}
          disabled={busy || faltaRequerido}
          style={{
            flex: 1, padding: '9px', borderRadius: 10, border: 'none',
            background: busy || faltaRequerido ? 'var(--border)' : '#f97316',
            color: busy || faltaRequerido ? 'var(--text-3)' : '#fff',
            fontSize: 13, fontWeight: 700, cursor: busy || faltaRequerido ? 'default' : 'pointer', fontFamily: 'inherit',
          }}
        >
          {busy ? 'Confirmando…' : 'Confirmar'}
        </button>
      </div>
    </div>
  )
}
