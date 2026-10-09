'use client'

// Nombres a excluir de Compras (empleados / socios): el import y el OCR los
// descartan para que sueldos y retiros no aparezcan como gasto de mercadería.

import { useState } from 'react'
import { SheetChrome } from '@/lib/ui/chrome'

export default function PrivacidadSheet({ nombres, onGuardar, onClose }: {
  nombres: string[]
  onGuardar: (lista: string[]) => void
  onClose: () => void
}) {
  const [nuevo, setNuevo] = useState('')
  function agregar() {
    if (!nuevo.trim()) return
    onGuardar([...nombres, nuevo.trim()])
    setNuevo('')
  }

  return (
    <SheetChrome>
      <div className="fixed inset-0 z-[310]" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-[311] rounded-t-[20px] flex flex-col" style={{ background: 'var(--surface)', maxHeight: '80vh', paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}>
        <div className="p-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined" style={{ color: 'var(--accent)' }}>shield_person</span>
              <h3 className="text-[16px] font-bold m-0" style={{ color: 'var(--text-1)' }}>Nombres a excluir</h3>
            </div>
            <button onClick={onClose} className="bg-transparent border-none cursor-pointer">
              <span className="material-symbols-outlined" style={{ color: 'var(--text-3)' }}>close</span>
            </button>
          </div>
          <p className="text-[12px] mt-2 mb-0" style={{ color: 'var(--text-2)' }}>
            Empleados y socios cuyos nombres aparecen en facturas. El OCR y el import los detectan y los excluyen automáticamente de las compras.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex gap-2 mb-3">
            <input
              value={nuevo}
              onChange={e => setNuevo(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') agregar() }}
              placeholder="Ej: Juan Pérez"
              className="flex-1 rounded-[10px] px-3 py-2 text-[16px] outline-none"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
            />
            <button onClick={agregar} disabled={!nuevo.trim()}
              className="px-4 rounded-[10px] border-none cursor-pointer text-[14px] font-bold text-white"
              style={{ background: nuevo.trim() ? 'var(--navy)' : '#ccc' }}>
              Agregar
            </button>
          </div>

          {nombres.length === 0 ? (
            <div className="text-center py-8 text-[13px]" style={{ color: 'var(--text-3)' }}>Sin nombres configurados todavía</div>
          ) : (
            <div className="flex flex-col gap-2">
              {nombres.map((n, i) => (
                <div key={i} className="flex items-center justify-between rounded-[10px] px-3 py-2" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                  <span className="text-[14px]" style={{ color: 'var(--text-1)' }}>{n}</span>
                  <button onClick={() => onGuardar(nombres.filter((_, j) => j !== i))} className="bg-transparent border-none cursor-pointer">
                    <span className="material-symbols-outlined text-[18px]" style={{ color: 'var(--text-3)' }}>delete</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </SheetChrome>
  )
}
