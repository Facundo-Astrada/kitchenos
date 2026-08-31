'use client'

import { useState, useRef, useEffect } from 'react'
import { useRestauranteId } from '@/lib/hooks/useRestauranteId'
import { invalidarPresupuesto } from '@/lib/hooks/invalidarPresupuesto'
import { useSheetOpenWhen } from '@/lib/ui/chrome'

type HojaInfo = {
  name: string
  filas: number
  columnas: string[]
  rol: string
  usada: boolean
}

type DetectResult = {
  formato: 'fudo' | 'generico'
  total_facturas: number
  total_items: number
  omitidas: number
  preview: Array<{ proveedor: string; fecha: string | null; numero: string | null; total: number; items: number }>
  mapeo?: Record<string, string>
  headers?: string[]
  sample_rows?: unknown[][]
  hoja_seleccionada?: string
  hojas_analizadas?: HojaInfo[]
}

interface Props {
  open: boolean
  onClose: () => void
  onImported?: (count: number) => void
  initialFile?: File
}

export default function ExcelPOSImportModal({ open, onClose, onImported, initialFile }: Props) {
  useSheetOpenWhen(open)
  const RESTAURANTE_ID = useRestauranteId()
  const [file, setFile] = useState<File | null>(null)
  const [detecting, setDetecting] = useState(false)
  const [detected, setDetected] = useState<DetectResult | null>(null)
  const [applying, setApplying] = useState(false)
  const [result, setResult] = useState<{ importadas: number; items: number; omitidas: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hojaSeleccionada, setHojaSeleccionada] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const autoStarted = useRef(false)

  // Auto-trigger analysis when file is provided as prop (from ImportadorUniversal)
  useEffect(() => {
    if (!initialFile || !RESTAURANTE_ID || autoStarted.current) return
    autoStarted.current = true
    void handleFile(initialFile)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [RESTAURANTE_ID])

  if (!open) return null

  function reset() {
    setFile(null); setDetected(null); setApplying(false); setResult(null); setError(null); setHojaSeleccionada(null)
  }

  async function handleFile(f: File, hoja?: string) {
    setFile(f)
    setDetecting(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', f)
      fd.append('restauranteId', RESTAURANTE_ID)
      fd.append('mode', 'detect')
      if (hoja) fd.append('hoja', hoja)
      const res = await fetch('/api/importador/facturas-universal', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error analizando archivo')
      setDetected(data)
      setHojaSeleccionada(hoja ?? data.hoja_seleccionada ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    }
    setDetecting(false)
  }

  // Re-analiza el mismo archivo forzando otra hoja — para cuando el score
  // automático no eligió la que el usuario quería.
  function elegirHoja(nombre: string) {
    if (!file || detecting || nombre === hojaSeleccionada) return
    void handleFile(file, nombre)
  }

  async function aplicar() {
    if (!file) return
    setApplying(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('restauranteId', RESTAURANTE_ID)
      fd.append('mode', 'apply')
      if (hojaSeleccionada) fd.append('hoja', hojaSeleccionada)
      if (detected?.formato === 'generico' && detected.mapeo) {
        fd.append('mapeo', JSON.stringify(detected.mapeo))
      }
      const res = await fetch('/api/importador/facturas-universal', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error importando')
      setResult(data)
      invalidarPresupuesto()
      if (onImported) onImported(data.importadas)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    }
    setApplying(false)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }} onClick={() => !applying && !detecting && onClose()}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--surface)', borderRadius: 16, width: '100%', maxWidth: 640,
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text-1)' }}>
              Importar desde POS
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-2)' }}>
              Excel/CSV de Fudo, Maxirest, Bistrosoft u otros sistemas
            </p>
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-2)',
          }}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div style={{ overflow: 'auto', flex: 1, padding: 20 }}>
          {/* Dropzone */}
          {!file && !result && (
            <button
              onClick={() => inputRef.current?.click()}
              style={{
                width: '100%', padding: 32, borderRadius: 12, border: '2px dashed var(--accent)',
                background: 'rgba(67,97,160,.06)', color: 'var(--accent)', fontWeight: 700,
                cursor: 'pointer', fontSize: 14,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 42, display: 'block', margin: '0 auto 8px' }}>upload_file</span>
              Seleccionar archivo Excel/CSV
            </button>
          )}
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            style={{ display: 'none' }}
            onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); e.target.value = '' }}
          />

          {/* Detecting state */}
          {detecting && (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-2)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 32, animation: 'spin 1s linear infinite', display: 'block', margin: '0 auto 8px', color: 'var(--accent)' }}>progress_activity</span>
              Analizando archivo… (puede tardar si requiere IA para mapear)
              <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{
              background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.3)',
              borderRadius: 10, padding: 14, color: '#991b1b', fontSize: 13, marginBottom: 12,
            }}>
              {error}
            </div>
          )}

          {/* Detected */}
          {detected && !result && (
            <div>
              <div style={{
                background: detected.formato === 'fudo' ? 'rgba(22,101,52,.08)' : 'rgba(67,97,160,.08)',
                border: `1px solid ${detected.formato === 'fudo' ? 'rgba(22,101,52,.3)' : 'rgba(67,97,160,.3)'}`,
                borderRadius: 10, padding: 14, marginBottom: 16,
              }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', marginBottom: 4 }}>
                  {detected.formato === 'fudo' ? '✓ Formato Fudo detectado' : '✓ Formato genérico detectado (mapeado con IA)'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
                  {detected.total_facturas} facturas · {detected.total_items} items · {detected.omitidas} omitidas
                </div>
              </div>

              {/* Hojas analizadas — siempre que estén disponibles */}
              {detected.hojas_analizadas && detected.hojas_analizadas.length > 0 && (
                <details open style={{ marginBottom: 16 }}>
                  <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--text-2)', marginBottom: 8 }}>
                    Hojas del archivo ({detected.hojas_analizadas.length})
                  </summary>
                  {detected.formato === 'generico' && detected.hojas_analizadas.length > 1 && (
                    <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '0 0 8px' }}>
                      Elegimos la hoja automáticamente — si no es la correcta, tocá otra para usarla.
                    </p>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                    {detected.hojas_analizadas.map((h, i) => {
                      const elegible = detected.formato === 'generico' && h.filas > 0 && !h.usada
                      const Tag = elegible ? 'button' : 'div'
                      return (
                        <Tag key={i}
                          {...(elegible ? { onClick: () => elegirHoja(h.name), disabled: detecting } : {})}
                          style={{
                            padding: '10px 12px', textAlign: 'left', width: '100%',
                            background: h.usada ? 'rgba(22,101,52,.06)' : 'var(--bg)',
                            border: `1px solid ${h.usada ? 'rgba(22,101,52,.2)' : 'var(--border)'}`,
                            borderRadius: 8, fontSize: 12, fontFamily: 'inherit',
                            cursor: elegible ? 'pointer' : 'default',
                          }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                            <div style={{ fontWeight: 700, color: 'var(--text-1)' }}>
                              {h.usada ? '✓ ' : '✗ '}{h.name}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
                              {h.filas.toLocaleString('es-AR')} filas
                            </div>
                          </div>
                          <div style={{ fontSize: 11, color: h.usada ? '#166534' : 'var(--text-3)', marginTop: 2 }}>
                            {h.rol}
                          </div>
                          {h.columnas.length > 0 && (
                            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4, fontFamily: "'DM Mono', monospace" }}>
                              {h.columnas.join(' · ')}
                              {h.columnas.length === 8 && '…'}
                            </div>
                          )}
                          {elegible && (
                            <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 4, fontWeight: 700 }}>
                              Usar esta hoja
                            </div>
                          )}
                        </Tag>
                      )
                    })}
                  </div>
                </details>
              )}

              {detected.formato === 'generico' && detected.mapeo && (
                <details style={{ marginBottom: 16 }}>
                  <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--text-2)', marginBottom: 8 }}>
                    Mapeo de columnas detectado por IA
                  </summary>
                  <div style={{ fontSize: 12, background: 'var(--bg)', borderRadius: 8, padding: 12, marginTop: 8 }}>
                    {Object.entries(detected.mapeo).filter(([, v]) => v).map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                        <span style={{ color: 'var(--text-3)' }}>{k}</span>
                        <span style={{ color: 'var(--text-1)', fontWeight: 600 }}>{v}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}

              <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 8, fontWeight: 600 }}>
                Vista previa (primeras 5 facturas):
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                {detected.preview.map((p, i) => (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between', padding: '8px 12px',
                    background: 'var(--bg)', borderRadius: 8, fontSize: 12,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.proveedor || '(sin proveedor)'}
                      </div>
                      <div style={{ color: 'var(--text-3)', fontSize: 11 }}>
                        {p.fecha || 'sin fecha'} · {p.numero || 's/n'} · {p.items} items
                      </div>
                    </div>
                    <div style={{ fontWeight: 700, color: 'var(--text-1)' }}>
                      ${p.total.toLocaleString('es-AR')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Result */}
          {result && (
            <div style={{
              background: 'rgba(22,101,52,.1)', border: '1px solid rgba(22,101,52,.3)',
              borderRadius: 12, padding: 16,
            }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#166534', marginBottom: 12 }}>
                ✓ Importación completada
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-1)', fontSize: 14, lineHeight: 1.8 }}>
                <li>{result.importadas} facturas importadas</li>
                <li>{result.items} items importados</li>
                {result.omitidas > 0 && <li>{result.omitidas} omitidas (canceladas o vacías)</li>}
              </ul>
            </div>
          )}
        </div>

        <div style={{
          padding: 16, borderTop: '1px solid var(--border)',
          display: 'flex', gap: 8, justifyContent: 'flex-end',
        }}>
          {!result && (
            <button onClick={onClose} disabled={applying || detecting}
              style={{
                padding: '10px 16px', borderRadius: 10, border: '1px solid var(--border)',
                background: 'transparent', color: 'var(--text-1)', cursor: 'pointer', fontWeight: 600,
              }}>
              Cancelar
            </button>
          )}
          {detected && !result && (
            <>
              <button onClick={reset} disabled={applying}
                style={{
                  padding: '10px 16px', borderRadius: 10, border: '1px solid var(--border)',
                  background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontWeight: 600,
                }}>
                Otro archivo
              </button>
              <button onClick={aplicar} disabled={applying || detected.total_facturas === 0}
                style={{
                  padding: '10px 16px', borderRadius: 10, border: 'none',
                  background: 'var(--navy)', color: 'white', cursor: applying ? 'wait' : 'pointer',
                  fontWeight: 700, opacity: applying ? 0.6 : 1,
                }}>
                {applying ? 'Importando…' : `Importar ${detected.total_facturas} facturas`}
              </button>
            </>
          )}
          {result && (
            <button onClick={onClose}
              style={{
                padding: '10px 16px', borderRadius: 10, border: 'none',
                background: 'var(--navy)', color: 'white', cursor: 'pointer', fontWeight: 700,
              }}>
              Cerrar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
