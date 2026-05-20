'use client'

import { useState, useRef, useEffect } from 'react'
import * as XLSX from 'xlsx'

type Tipo = 'proveedores' | 'stock'
type Step = 'idle' | 'sheet' | 'mapping' | 'confirm' | 'done'

interface Props {
  tipo: Tipo
  restauranteId: string
  onImportCompleto: (cantidad: number) => void
  onClose: () => void
  initialHeaders?: string[]
  initialRows?: unknown[][]
  initialFileName?: string
  importConfig?: Record<string, unknown>
}

interface ResultadoImport {
  importados: number
  insertados: number
  actualizados: number
  omitidos: number
  inactivosOmitidos?: number
  categorias: number
  insertadosIds?: string[]
}

export interface UltimoImport {
  tipo: Tipo
  fecha: string
  cantidad: number
  archivo: string
  ids: string[]
}

export const UNDO_KEY = (tipo: Tipo) => `kitchenos_lastImport_${tipo}`

const CAMPOS: Record<Tipo, string[]> = {
  proveedores: ['nombre', 'telefono', 'rubro', 'activo', 'ignorar'],
  stock: ['nombre', 'categoria', 'unidad', 'stock_actual', 'stock_minimo', 'proveedor_nombre', 'precio_unitario', 'ignorar'],
}

const LABEL_CAMPO: Record<string, string> = {
  nombre: 'Nombre',
  categoria: 'Categoría',
  unidad: 'Unidad',
  stock_actual: 'Stock actual',
  stock_minimo: 'Stock mínimo',
  proveedor_nombre: 'Proveedor',
  precio_unitario: 'Precio unitario',
  telefono: 'Teléfono',
  rubro: 'Rubro',
  activo: 'Activo',
  ignorar: '— Ignorar —',
}

function mapeoHeuristico(hdrs: string[], tipo: Tipo): Record<string, string> {
  const result: Record<string, string> = {}
  const HINTS: Record<string, string[]> = {
    nombre: ['nombre', 'name', 'producto', 'ingrediente', 'artículo', 'articulo'],
    categoria: ['categoría', 'categoria', 'category'],
    unidad: ['unidad', 'unid', 'unit'],
    stock_actual: ['stock', 'cantidad', 'existencia'],
    stock_minimo: ['mínimo', 'minimo', 'min'],
    precio_unitario: ['costo', 'precio', 'cost', 'price'],
    proveedor_nombre: ['proveedor', 'supplier'],
    telefono: ['teléfono', 'telefono', 'tel', 'phone'],
    rubro: ['comentario', 'rubro', 'tipo', 'comment'],
    activo: ['activo', 'estado', 'active'],
  }
  hdrs.forEach(h => {
    const hl = h.toLowerCase()
    let matched = false
    for (const [campo, hints] of Object.entries(HINTS)) {
      if (CAMPOS[tipo].includes(campo) && hints.some(hint => hl.includes(hint))) {
        result[h] = campo
        matched = true
        break
      }
    }
    if (!matched) result[h] = 'ignorar'
  })
  return result
}

export default function ImportadorArchivo({ tipo, restauranteId, onImportCompleto, onClose, initialHeaders, initialRows, initialFileName, importConfig }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<Step>(initialHeaders ? 'mapping' : 'idle')
  const [fileName, setFileName] = useState(initialFileName ?? '')
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null)
  const [sheetNames, setSheetNames] = useState<string[]>([])
  const [selectedSheet, setSelectedSheet] = useState('')
  const [headers, setHeaders] = useState<string[]>(initialHeaders ?? [])
  const [rows, setRows] = useState<unknown[][]>(initialRows ?? [])
  const [mapeo, setMapeo] = useState<Record<string, string>>({})
  const [mapeoLoading, setMapeoLoading] = useState(!!initialHeaders)
  const [importInactivos, setImportInactivos] = useState(false)
  const [importing, setImporting] = useState(false)
  const [resultado, setResultado] = useState<ResultadoImport | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Si viene pre-cargado desde ImportadorUniversal, disparar mapeo inmediatamente
  useEffect(() => {
    if (initialHeaders && initialHeaders.length > 0) {
      mapearConIA(initialHeaders, initialRows?.slice(0, 8) ?? [])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── helpers ──────────────────────────────────────────────────────────────

  function getColIdx(campo: string): number {
    return headers.findIndex(h => mapeo[h] === campo)
  }

  function cellVal(row: unknown[], campo: string): string {
    const idx = getColIdx(campo)
    if (idx < 0) return ''
    const v = row[idx]
    return v == null ? '' : String(v).trim()
  }

  const rowsConNombre = rows.filter(r => cellVal(r, 'nombre') !== '')

  const nInactivos = tipo === 'proveedores'
    ? rows.filter(r => {
        const v = cellVal(r, 'activo').toLowerCase()
        return v === 'no' || v === 'false' || v === '0' || v === 'inactivo'
      }).length
    : 0

  // ── Step A: parse file ────────────────────────────────────────────────────

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setFileName(file.name)
    try {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
      setWorkbook(wb)
      if (wb.SheetNames.length === 1) {
        loadSheet(wb, wb.SheetNames[0])
      } else {
        setSheetNames(wb.SheetNames)
        setSelectedSheet(wb.SheetNames[0])
        setStep('sheet')
      }
    } catch {
      setError('No se pudo leer el archivo. Verificá que sea .xls, .xlsx o .csv válido.')
    }
  }

  function loadSheet(wb: XLSX.WorkBook, sheetName: string) {
    const ws = wb.Sheets[sheetName]
    const allRows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })
    if (allRows.length === 0) { setError('La hoja está vacía.'); return }
    const hdrs = (allRows[0] as unknown[]).map((h, i) => {
      const s = String(h ?? '').trim()
      return s || `(col. ${String.fromCharCode(65 + i)})`
    })
    const data = (allRows.slice(1) as unknown[][]).filter(r => r.some(c => c !== '' && c != null))
    if (data.length > 2000) {
      setError(`El archivo tiene ${data.length} filas. El máximo es 2000. Dividilo en partes.`)
      return
    }
    setHeaders(hdrs)
    setRows(data)
    setStep('mapping')
    mapearConIA(hdrs, data.slice(0, 8))
  }

  // ── Step B: AI mapping (Sonnet + sample rows) ─────────────────────────────

  async function mapearConIA(hdrs: string[], sampleRows: unknown[][]) {
    setMapeoLoading(true)
    try {
      const res = await fetch('/api/importador/mapeo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headers: hdrs, sampleRows, tipo, campos: CAMPOS[tipo], fileName }),
      })
      if (res.ok) {
        const json = await res.json() as { mapeo?: Record<string,string>; advertencias?: string[] }
        if (json.mapeo && Object.keys(json.mapeo).length > 0) {
          setMapeo(json.mapeo)
          return
        }
      }
      setMapeo(mapeoHeuristico(hdrs, tipo))
    } catch {
      setMapeo(mapeoHeuristico(hdrs, tipo))
    } finally {
      setMapeoLoading(false)
    }
  }

  // ── Step E: import ────────────────────────────────────────────────────────

  async function handleImport() {
    setImporting(true)
    setError(null)
    try {
      // Build mapped rows
      const mapped = rowsConNombre.map(row => {
        const obj: Record<string, unknown> = {}
        headers.forEach((h, i) => {
          if (h.startsWith('__') && h.endsWith('__')) {
            // Auto-map hidden columns: __proveedor_id__ → proveedor_id
            const campo = h.slice(2, -2)
            const val = (row as unknown[])[i]
            if (val !== '' && val != null) obj[campo] = val
            return
          }
          const campo = mapeo[h]
          if (campo && campo !== 'ignorar') obj[campo] = (row as unknown[])[i]
        })
        return obj
      })

      const res = await fetch('/api/importador/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo, restauranteId, rows: mapped, importInactivos, importConfig }),
      })
      const data = await res.json() as ResultadoImport
      if (!res.ok) throw new Error((data as { error?: string }).error || 'Error al importar')
      setResultado(data)
      // Guardar para undo
      if (data.insertadosIds?.length) {
        const entry: UltimoImport = {
          tipo,
          fecha: new Date().toISOString(),
          cantidad: data.insertados,
          archivo: fileName,
          ids: data.insertadosIds,
        }
        localStorage.setItem(UNDO_KEY(tipo), JSON.stringify(entry))
      }
      setStep('done')
      onImportCompleto(data.importados)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al importar')
    } finally {
      setImporting(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const titulo = tipo === 'stock' ? 'Importar stock' : 'Importar proveedores'

  return (
    <>
      <div className="fixed inset-0 z-[300]" style={{ background: 'rgba(0,0,0,.55)' }} onClick={onClose} />
      <div className="fixed inset-0 z-[301] flex flex-col" style={{ background: 'var(--bg)', maxWidth: 520, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ background: 'var(--navy)', padding: '46px 16px 14px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'rgba(255,255,255,.6)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22 }}>arrow_back</span>
          </button>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#fff' }}>{titulo}</div>
            {fileName && <div style={{ fontSize: 11, color: 'rgba(255,255,255,.5)', marginTop: 1 }}>{fileName}</div>}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>

          {error && (
            <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#ef4444' }}>
              {error}
            </div>
          )}

          {/* STEP: idle ─── upload zone */}
          {step === 'idle' && (
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{ border: '2px dashed var(--border)', borderRadius: 16, padding: '40px 24px', textAlign: 'center', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'var(--text-3)' }}>upload_file</span>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>Subir archivo</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>.xls · .xlsx · .csv · máx. 2000 filas</div>
              <input ref={fileInputRef} type="file" accept=".xls,.xlsx,.csv" style={{ display: 'none' }} onChange={handleFileChange} />
            </div>
          )}

          {/* STEP: sheet selector */}
          {step === 'sheet' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>El archivo tiene {sheetNames.length} hojas. Elegí cuál importar:</div>
              {sheetNames.map(name => (
                <button
                  key={name}
                  onClick={() => setSelectedSheet(name)}
                  style={{
                    padding: '12px 16px', borderRadius: 10, border: `2px solid ${selectedSheet === name ? 'var(--accent)' : 'var(--border)'}`,
                    background: selectedSheet === name ? 'rgba(67,97,160,.08)' : 'var(--surface)',
                    fontSize: 13, fontWeight: 600, color: 'var(--text-1)', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16, verticalAlign: 'middle', marginRight: 8, color: 'var(--text-3)' }}>table_chart</span>
                  {name}
                </button>
              ))}
              <button
                onClick={() => workbook && loadSheet(workbook, selectedSheet)}
                style={{ marginTop: 4, background: 'var(--navy)', border: 'none', borderRadius: 10, padding: '13px', fontSize: 14, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Continuar con &quot;{selectedSheet}&quot;
              </button>
            </div>
          )}

          {/* STEP: mapping */}
          {step === 'mapping' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>
                  {mapeoLoading ? 'Detectando columnas…' : `${rows.length} filas detectadas · Revisá el mapeo`}
                </div>
                {mapeoLoading && <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--accent)', animation: 'spin 1s linear infinite' }}>progress_activity</span>}
              </div>

              {/* Mapping table */}
              <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
                {/* Header row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', padding: '8px 12px', borderBottom: '1px solid var(--border)', background: 'rgba(0,0,0,.03)' }}>
                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-3)' }}>Columna Excel</span>
                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-3)' }}>Campo KitchenOS</span>
                </div>
                {headers.filter(h => !(h.startsWith('__') && h.endsWith('__'))).map(h => (
                  <div key={h} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', padding: '8px 12px', borderBottom: '1px solid var(--border)', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h}</span>
                    <select
                      value={mapeo[h] ?? 'ignorar'}
                      onChange={e => setMapeo(prev => ({ ...prev, [h]: e.target.value }))}
                      style={{ fontSize: 12, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: mapeo[h] && mapeo[h] !== 'ignorar' ? 'var(--accent)' : 'var(--text-3)', fontFamily: 'inherit', cursor: 'pointer' }}
                    >
                      {CAMPOS[tipo].map(c => (
                        <option key={c} value={c}>{LABEL_CAMPO[c] ?? c}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              {/* Preview rows */}
              {rows.slice(0, 3).length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-3)', marginBottom: 6 }}>Muestra (3 primeras filas)</div>
                  <div style={{ background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
                    {rows.slice(0, 3).map((row, i) => {
                      const nombre = cellVal(row, 'nombre')
                      const extra = tipo === 'stock'
                        ? `${cellVal(row, 'stock_actual') || '—'} ${cellVal(row, 'unidad') || ''}`.trim()
                        : cellVal(row, 'rubro') || cellVal(row, 'telefono') || ''
                      return (
                        <div key={i} style={{ padding: '8px 12px', borderBottom: i < 2 ? '1px solid var(--border)' : 'none', display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 12, color: 'var(--text-1)', fontWeight: 500 }}>{nombre || <em style={{ color: 'var(--text-3)' }}>sin nombre</em>}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{extra}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Inactivos toggle for proveedores */}
              {tipo === 'proveedores' && nInactivos > 0 && (
                <div
                  onClick={() => setImportInactivos(v => !v)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)', cursor: 'pointer' }}
                >
                  <div style={{ width: 36, height: 20, borderRadius: 10, background: importInactivos ? 'var(--accent)' : 'var(--border)', transition: 'background .2s', position: 'relative', flexShrink: 0 }}>
                    <div style={{ width: 16, height: 16, borderRadius: 8, background: '#fff', position: 'absolute', top: 2, left: importInactivos ? 18 : 2, transition: 'left .2s' }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>Importar inactivos ({nInactivos})</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Incluir proveedores marcados como inactivos</div>
                  </div>
                </div>
              )}

              {/* Confirm button */}
              <button
                onClick={handleImport}
                disabled={importing || !rowsConNombre.length || mapeoLoading}
                style={{
                  background: importing ? 'var(--border)' : 'var(--navy)',
                  border: 'none', borderRadius: 12, padding: '14px',
                  fontSize: 14, fontWeight: 700, color: '#fff', cursor: importing ? 'default' : 'pointer',
                  fontFamily: 'inherit', opacity: (!rowsConNombre.length || mapeoLoading) ? .5 : 1,
                }}
              >
                {importing
                  ? 'Importando…'
                  : `Importar ${rowsConNombre.length} ${tipo === 'stock' ? 'productos' : 'proveedores'}`
                }
              </button>
            </div>
          )}

          {/* STEP: done */}
          {step === 'done' && resultado && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ textAlign: 'center', padding: '24px 0 8px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 56, color: '#22c55e' }}>check_circle</span>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-1)', marginTop: 8 }}>Importación completada</div>
              </div>

              <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
                {[
                  { icon: 'check', color: '#22c55e', text: `${resultado.insertados} ${tipo === 'stock' ? 'productos' : 'proveedores'} nuevos creados` },
                  resultado.actualizados > 0 && { icon: 'update', color: 'var(--accent)', text: `${resultado.actualizados} existentes actualizados` },
                  resultado.categorias > 0 && { icon: 'folder', color: '#a78bfa', text: `${resultado.categorias} categorías creadas` },
                  resultado.omitidos > 0 && { icon: 'info', color: 'var(--text-3)', text: `${resultado.omitidos} filas omitidas (nombre vacío o inactivos)` },
                ].filter(Boolean).map((item, i, arr) => {
                  const { icon, color, text } = item as { icon: string; color: string; text: string }
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 20, color }}>{icon}</span>
                      <span style={{ fontSize: 13, color: 'var(--text-1)' }}>{text}</span>
                    </div>
                  )
                })}
              </div>

              <button
                onClick={onClose}
                style={{ background: 'var(--navy)', border: 'none', borderRadius: 12, padding: '14px', fontSize: 14, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Ver {tipo === 'stock' ? 'stock importado' : 'proveedores'}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ── UndoBanner ────────────────────────────────────────────────────────────────
// Mostrar en la página de Stock o Proveedores cuando hay un import reciente

interface UndoBannerProps {
  tipo: Tipo
  onUndo: () => void
}

export function UndoBanner({ tipo, onUndo }: UndoBannerProps) {
  const [entry, setEntry] = useState<UltimoImport | null>(null)
  const [loading, setLoading] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const raw = localStorage.getItem(UNDO_KEY(tipo))
    if (raw) setEntry(JSON.parse(raw) as UltimoImport)
  }, [tipo])

  if (!entry || dismissed) return null

  const fecha = new Date(entry.fecha).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

  async function handleUndo() {
    if (!entry) return
    setLoading(true)
    try {
      const res = await fetch('/api/importador/undo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo, ids: entry.ids }),
      })
      if (!res.ok) throw new Error('Error al deshacer')
      localStorage.removeItem(UNDO_KEY(tipo))
      setDismissed(true)
      onUndo()
    } catch {
      // silencioso — el usuario puede reintentar
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      margin: '12px 16px 0',
      background: 'rgba(99,102,241,.08)',
      border: '1px solid rgba(99,102,241,.25)',
      borderRadius: 12,
      padding: '10px 14px',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
    }}>
      <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#818cf8', flexShrink: 0 }}>undo</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>
          Último import: {entry.cantidad} {tipo === 'stock' ? 'productos' : 'proveedores'} · {fecha}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {entry.archivo}
        </div>
      </div>
      <button
        onClick={handleUndo}
        disabled={loading}
        style={{ background: '#6366f1', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, opacity: loading ? .6 : 1 }}
      >
        {loading ? 'Deshaciendo…' : 'Deshacer'}
      </button>
      <button
        onClick={() => { localStorage.removeItem(UNDO_KEY(tipo)); setDismissed(true) }}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, flexShrink: 0 }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
      </button>
    </div>
  )
}
