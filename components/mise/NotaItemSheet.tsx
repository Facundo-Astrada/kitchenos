'use client'

// NotaItemSheet — anotación libre pegada a un ítem del mise ("la trucha está
// lista pero falta porcionarla, no llegamos"). Un tercio de pantalla o menos:
// es una nota rápida, no un formulario. Vive hasta que alguien la borra
// (checklist_items.nota), no expira con el turno — el que entra la lee igual
// en apertura, cierre y Modo Control.
//
// Sin autoFocus en el textarea: el sheet se monta después de un setTimeout de
// long-press, fuera del call-stack síncrono del toque que lo abrió — con
// autoFocus, iOS/Android no levantan el teclado (ver memoria
// feedback_mobile_keyboard_inline_edit). El textarea ya está montado cuando
// se ve, así que tocarlo sí abre el teclado al primer toque.

import { useState } from 'react'
import { Modal } from '@/components/ui'

function formatDesde(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (mins < 1) return 'recién'
  if (mins < 60) return `hace ${mins} min`
  const horas = Math.floor(mins / 60)
  if (horas < 24) return `hace ${horas} h`
  return `hace ${Math.floor(horas / 24)} d`
}

interface NotaItemSheetProps {
  nombreItem: string
  nota: string | null
  notaPor: string | null
  notaAt: string | null
  onGuardar: (texto: string) => Promise<void>
  onBorrar: () => Promise<void>
  onDismiss: () => void
}

export function NotaItemSheet({ nombreItem, nota, notaPor, notaAt, onGuardar, onBorrar, onDismiss }: NotaItemSheetProps) {
  const [texto, setTexto] = useState(nota ?? '')
  const [saving, setSaving] = useState(false)
  const [borrando, setBorrando] = useState(false)

  async function handleGuardar() {
    if (saving || !texto.trim()) return
    setSaving(true)
    try {
      await onGuardar(texto.trim())
      onDismiss()
    } finally {
      setSaving(false)
    }
  }

  async function handleBorrar() {
    if (borrando) return
    setBorrando(true)
    try {
      await onBorrar()
      onDismiss()
    } finally {
      setBorrando(false)
    }
  }

  return (
    <Modal open onClose={onDismiss} maxWidth={420}>
          <div style={{ padding: '20px 16px', paddingBottom: 'max(20px, env(safe-area-inset-bottom, 20px))' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--accent)' }}>sticky_note_2</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>{nombreItem}</span>
              </div>
              <button onClick={onDismiss} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, flexShrink: 0 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--text-3)' }}>close</span>
              </button>
            </div>

            <textarea
              value={texto}
              onChange={e => setTexto(e.target.value)}
              placeholder="Ej: está lista pero falta porcionarla, no llegamos"
              rows={3}
              style={{
                width: '100%', padding: '10px', borderRadius: 10, boxSizing: 'border-box',
                border: '1px solid var(--border)', background: 'var(--bg)',
                fontSize: 15, fontFamily: 'inherit', color: 'var(--text-1)', outline: 'none', resize: 'none',
              }}
            />

            {notaPor && notaAt && (
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>
                Anotó {notaPor} · {formatDesde(notaAt)}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                onClick={handleGuardar}
                disabled={saving || !texto.trim()}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 10, border: 'none',
                  background: !texto.trim() ? 'var(--border)' : saving ? 'var(--border)' : 'linear-gradient(135deg, var(--navy), #4361a0)',
                  color: !texto.trim() || saving ? 'var(--text-3)' : '#fff',
                  fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
                  cursor: saving || !texto.trim() ? 'default' : 'pointer',
                }}
              >
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
              {nota && (
                <button
                  onClick={handleBorrar}
                  disabled={borrando}
                  style={{
                    padding: '10px 14px', borderRadius: 10,
                    background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.2)',
                    color: '#ef4444', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
                    cursor: borrando ? 'default' : 'pointer',
                  }}
                >
                  {borrando ? 'Borrando…' : 'Borrar nota'}
                </button>
              )}
            </div>
          </div>
    </Modal>
  )
}
