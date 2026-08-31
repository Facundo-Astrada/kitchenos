'use client'

import { useState, useRef } from 'react'
import { useFacturas } from '@/lib/hooks/useFacturas'
import type { TipoFactura, CondicionPago } from '@/types'

type AIResult = {
  proveedor_nombre: string
  proveedor_cuit: string | null
  fecha_factura: string | null
  tipo_factura: TipoFactura
  numero_factura: string | null
  condicion_pago: CondicionPago
  items: Array<{
    producto_nombre: string
    cantidad: number
    unidad: string
    precio_unitario: number
    alicuota_iva: number
    subtotal: number
  }>
  subtotal: number
  iva_total: number
  total: number
  categoria_gasto_id?: string | null
}

type Status = 'pending' | 'processing' | 'parsed' | 'error' | 'saved'

type FileEntry = {
  file: File
  status: Status
  result: AIResult | null
  error: string | null
  include: boolean
}

interface BulkUploadDrawerProps {
  open: boolean
  onClose: () => void
  onSaved?: (count: number) => void
}

export default function BulkUploadDrawer({ open, onClose, onSaved }: BulkUploadDrawerProps) {
  const { crearFactura } = useFacturas()
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  if (!open) return null

  function getMode(file: File): 'image' | 'pdf' {
    if (file.type === 'application/pdf') return 'pdf'
    return 'image'
  }

  function addFiles(files: File[]) {
    const accepted = files.filter(f =>
      f.type.startsWith('image/') || f.type === 'application/pdf'
    )
    setEntries(prev => [
      ...prev,
      ...accepted.map(file => ({
        file,
        status: 'pending' as Status,
        result: null,
        error: null,
        include: true,
      })),
    ])
  }

  async function procesarTodos() {
    setProcessing(true)
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].status !== 'pending') continue

      setEntries(prev => prev.map((e, idx) =>
        idx === i ? { ...e, status: 'processing' } : e
      ))

      try {
        const fd = new FormData()
        fd.append('file', entries[i].file)
        fd.append('mode', getMode(entries[i].file))
        const res = await fetch('/api/facturas', { method: 'POST', body: fd })
        const data = await res.json()

        if (!res.ok || data.error) {
          setEntries(prev => prev.map((e, idx) =>
            idx === i ? { ...e, status: 'error', error: data.error || 'Error' } : e
          ))
        } else {
          setEntries(prev => prev.map((e, idx) =>
            idx === i ? { ...e, status: 'parsed', result: data as AIResult } : e
          ))
        }
      } catch (err) {
        setEntries(prev => prev.map((e, idx) =>
          idx === i ? { ...e, status: 'error', error: err instanceof Error ? err.message : 'Error' } : e
        ))
      }
    }
    setProcessing(false)
  }

  async function guardarTodos() {
    setSaving(true)
    let savedCount = 0
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i]
      if (!e.include || e.status !== 'parsed' || !e.result) continue

      try {
        await crearFactura({
          proveedor_nombre: e.result.proveedor_nombre || 'Sin proveedor',
          proveedor_cuit: e.result.proveedor_cuit,
          fecha_factura: e.result.fecha_factura,
          tipo_factura: e.result.tipo_factura || 'B',
          numero_factura: e.result.numero_factura,
          subtotal: e.result.subtotal || 0,
          iva_total: e.result.iva_total || 0,
          total: e.result.total || 0,
          condicion_pago: e.result.condicion_pago || 'contado',
          categoria_gasto_id: e.result.categoria_gasto_id ?? null,
          items: e.result.items.map(it => ({
            producto_nombre: it.producto_nombre,
            producto_id: null,
            cantidad: it.cantidad,
            unidad: it.unidad,
            precio_unitario: it.precio_unitario,
            alicuota_iva: it.alicuota_iva || 21,
            subtotal: it.subtotal,
            precio_anterior: null,
          })),
        })
        setEntries(prev => prev.map((x, idx) => idx === i ? { ...x, status: 'saved' } : x))
        savedCount++
      } catch (err) {
        setEntries(prev => prev.map((x, idx) =>
          idx === i ? { ...x, status: 'error', error: err instanceof Error ? err.message : 'Error guardando' } : x
        ))
      }
    }
    setSaving(false)
    if (onSaved && savedCount > 0) onSaved(savedCount)
  }

  const pendientes = entries.filter(e => e.status === 'pending').length
  const procesadas = entries.filter(e => e.status === 'parsed').length
  const errores = entries.filter(e => e.status === 'error').length
  const guardadas = entries.filter(e => e.status === 'saved').length
  const totalParaGuardar = entries.filter(e => e.status === 'parsed' && e.include).length

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--surface)', borderRadius: '20px 20px 0 0',
        width: '100%', maxWidth: 800, maxHeight: '90vh', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-1)' }}>
              Cargar facturas en lote
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-2)' }}>
              Subí múltiples PDFs o fotos. El sistema las procesa con IA.
            </p>
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', cursor: 'pointer', padding: 4,
            color: 'var(--text-2)',
          }}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div style={{ overflow: 'auto', flex: 1, padding: 20 }}>
          {/* Dropzone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => {
              e.preventDefault(); setDragOver(false)
              addFiles(Array.from(e.dataTransfer.files))
            }}
            onClick={() => inputRef.current?.click()}
            style={{
              border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 12, padding: 32, textAlign: 'center', cursor: 'pointer',
              background: dragOver ? 'rgba(67,97,160,0.06)' : 'transparent',
              marginBottom: 16,
            }}
          >
            <span className="material-symbols-outlined" style={{
              fontSize: 48, color: 'var(--accent)', marginBottom: 8,
            }}>upload_file</span>
            <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-1)' }}>
              Arrastrá archivos acá o hacé click
            </p>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-3)' }}>
              PDF o JPG/PNG · hasta 30 archivos
            </p>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept="image/*,application/pdf"
              style={{ display: 'none' }}
              onChange={e => {
                if (e.target.files) addFiles(Array.from(e.target.files))
                e.target.value = ''
              }}
            />
          </div>

          {entries.length > 0 && (
            <>
              <div style={{
                display: 'flex', gap: 8, fontSize: 13, marginBottom: 12,
                color: 'var(--text-2)', flexWrap: 'wrap',
              }}>
                <span><b>{entries.length}</b> total</span>
                {pendientes > 0 && <span>· {pendientes} pendientes</span>}
                {procesadas > 0 && <span style={{ color: '#166534' }}>· {procesadas} procesadas</span>}
                {errores > 0 && <span style={{ color: '#991b1b' }}>· {errores} con error</span>}
                {guardadas > 0 && <span style={{ color: 'var(--accent)' }}>· {guardadas} guardadas</span>}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {entries.map((e, i) => (
                  <FileRow key={i} entry={e} onToggle={() => {
                    setEntries(prev => prev.map((x, idx) =>
                      idx === i ? { ...x, include: !x.include } : x
                    ))
                  }} onRemove={() => {
                    setEntries(prev => prev.filter((_, idx) => idx !== i))
                  }} />
                ))}
              </div>
            </>
          )}
        </div>

        <div style={{
          padding: 16, borderTop: '1px solid var(--border)',
          display: 'flex', gap: 8, justifyContent: 'flex-end',
        }}>
          <button onClick={onClose} style={{
            padding: '10px 16px', borderRadius: 10, border: '1px solid var(--border)',
            background: 'transparent', color: 'var(--text-1)', cursor: 'pointer', fontWeight: 600,
          }}>Cerrar</button>

          {pendientes > 0 && (
            <button
              onClick={procesarTodos}
              disabled={processing}
              style={{
                padding: '10px 16px', borderRadius: 10, border: 'none',
                background: 'var(--accent)', color: 'white', cursor: processing ? 'wait' : 'pointer',
                fontWeight: 600, opacity: processing ? 0.6 : 1,
              }}
            >
              {processing ? 'Procesando…' : `Procesar ${pendientes} archivo${pendientes !== 1 ? 's' : ''}`}
            </button>
          )}

          {totalParaGuardar > 0 && pendientes === 0 && !processing && (
            <button
              onClick={guardarTodos}
              disabled={saving}
              style={{
                padding: '10px 16px', borderRadius: 10, border: 'none',
                background: '#166534', color: 'white', cursor: saving ? 'wait' : 'pointer',
                fontWeight: 600, opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? 'Guardando…' : `Guardar ${totalParaGuardar} factura${totalParaGuardar !== 1 ? 's' : ''}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function FileRow({ entry, onToggle, onRemove }: {
  entry: FileEntry
  onToggle: () => void
  onRemove: () => void
}) {
  const statusConfig: Record<Status, { icon: string; color: string; label: string }> = {
    pending: { icon: 'schedule', color: 'var(--text-3)', label: 'Pendiente' },
    processing: { icon: 'sync', color: 'var(--accent)', label: 'Procesando…' },
    parsed: { icon: 'check_circle', color: '#166534', label: 'Procesada' },
    error: { icon: 'error', color: '#991b1b', label: 'Error' },
    saved: { icon: 'cloud_done', color: 'var(--accent)', label: 'Guardada' },
  }
  const cfg = statusConfig[entry.status]

  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 10, padding: 12,
      display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg)',
    }}>
      {entry.status === 'parsed' && (
        <input
          type="checkbox"
          checked={entry.include}
          onChange={onToggle}
          style={{ width: 16, height: 16 }}
        />
      )}
      <span className="material-symbols-outlined" style={{ color: cfg.color }}>
        {cfg.icon}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14, fontWeight: 600, color: 'var(--text-1)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{entry.file.name}</div>
        <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>
          {cfg.label}
          {entry.result && (
            <span> · {entry.result.proveedor_nombre || 'Sin proveedor'} · ${entry.result.total?.toLocaleString('es-AR') ?? 0} · {entry.result.items?.length ?? 0} items</span>
          )}
          {entry.error && <span style={{ color: '#991b1b' }}> · {entry.error}</span>}
        </div>
      </div>
      {entry.status !== 'saved' && (
        <button onClick={onRemove} style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: 'var(--text-3)', padding: 4,
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
        </button>
      )}
    </div>
  )
}
