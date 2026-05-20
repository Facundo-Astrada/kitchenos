'use client'

import { useState, useRef } from 'react'

interface Ingrediente {
  nombre: string
  cantidad: number
  unidad: string
  notas?: string | null
}

interface RecetaIA {
  nombre: string
  categoria?: string
  porciones?: number
  rinde_cantidad?: number
  rinde_unidad?: string
  procedimiento?: string
  ingredientes: Ingrediente[]
  _existing?: boolean   // ya existe en la DB para este restaurante
  _duplicate?: boolean  // duplicada dentro del mismo batch
}

interface Props {
  restauranteId: string
  onImportCompleto: (cantidad: number) => void
  onClose: () => void
}

type Step = 'idle' | 'analizando' | 'preview' | 'importando' | 'done'

export default function ImportadorFichasTecnicas({ restauranteId, onImportCompleto, onClose }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<Step>('idle')
  const [recetas, setRecetas] = useState<RecetaIA[]>([])
  const [seleccionadas, setSeleccionadas] = useState<Set<number>>(new Set())
  const [expandidas, setExpandidas] = useState<Set<number>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [importados, setImportados] = useState(0)
  const [fallidos, setFallidos] = useState(0)
  const [fileName, setFileName] = useState('')

  async function handleFile(file: File) {
    setFileName(file.name)
    setError(null)
    setStep('analizando')

    const fd = new FormData()
    fd.append('file', file)
    fd.append('restaurante_id', restauranteId)

    try {
      const res = await fetch('/api/importador/fichas-tecnicas', { method: 'POST', body: fd })
      const data = await res.json() as {
        ok: boolean
        recetas?: RecetaIA[]
        error?: string
        raw?: string
        diag?: {
          ext: string
          fileSize: number
          pagesOrSheets: number
          blocksDetected: number
          recipesExtracted: number
          usedFallback: boolean
          elapsedMs: number
          sampleBlockNames: string[]
        }
      }

      if (!data.ok || !data.recetas?.length) {
        const msg = data.error ?? 'No se detectaron recetas en el archivo'
        const d = data.diag
        const diagStr = d
          ? `\n\nDiagnóstico:\n• Formato: ${d.ext}\n• Tamaño: ${(d.fileSize / 1024).toFixed(0)}KB\n• Páginas/Hojas: ${d.pagesOrSheets}\n• Bloques detectados: ${d.blocksDetected}\n• Recetas extraídas: ${d.recipesExtracted}\n• Tiempo: ${(d.elapsedMs / 1000).toFixed(1)}s${d.usedFallback ? '\n• (Usó fallback document API)' : ''}${d.sampleBlockNames.length ? '\n• Ejemplos: ' + d.sampleBlockNames.join(', ') : ''}`
          : ''
        const raw = data.raw ? `\n\nRespuesta Claude:\n${data.raw.slice(0, 300)}` : ''
        setError(msg + diagStr + raw)
        setStep('idle')
        return
      }

      const lista = data.recetas
      setRecetas(lista)
      // Default: deselect duplicates (existing in DB or repeated within batch)
      const initialSelection = new Set(
        lista.map((r, i) => ({ r, i }))
          .filter(({ r }) => !r._existing && !r._duplicate)
          .map(({ i }) => i)
      )
      setSeleccionadas(initialSelection)
      setStep('preview')
    } catch (e) {
      setError(`Error al procesar el archivo: ${e instanceof Error ? e.message : String(e)}`)
      setStep('idle')
    }
  }

  function toggleSeleccion(idx: number) {
    setSeleccionadas(prev => {
      const next = new Set(prev)
      if (next.has(idx)) { next.delete(idx) } else { next.add(idx) }
      return next
    })
  }

  function toggleExpandida(idx: number) {
    setExpandidas(prev => {
      const next = new Set(prev)
      if (next.has(idx)) { next.delete(idx) } else { next.add(idx) }
      return next
    })
  }

  async function importar() {
    if (!restauranteId) {
      setError('No se pudo identificar el restaurante. Recargá la página.')
      return
    }
    const lista = recetas.filter((_, i) => seleccionadas.has(i))
    setStep('importando')

    const resultados = await Promise.allSettled(
      lista.map(async receta => {
        // Append yield info to procedimiento since rinde_cantidad/unidad don't exist as columns
        const rindeStr = receta.rinde_cantidad
          ? `Rinde: ${receta.rinde_cantidad}${receta.rinde_unidad ?? ''}\n\n`
          : ''
        const res = await fetch('/api/recetas/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            receta: {
              nombre: receta.nombre,
              categoria: receta.categoria ?? 'Otros',
              porciones: receta.porciones ?? 1,
              procedimiento: rindeStr + (receta.procedimiento ?? ''),
              status: 'published',
              activa: true,
              restaurante_id: restauranteId,
            },
            ingredientes: (receta.ingredientes ?? [])
              .filter(ing => ing.nombre && ing.nombre.trim())
              .map(ing => ({
                nombre: ing.nombre,
                cantidad: typeof ing.cantidad === 'number' ? ing.cantidad : 0,
                unidad: ing.unidad ?? 'gr',
                merma_pct: 0,
                costo_unitario: 0,
                unidad_costo: ing.unidad ?? 'gr',
              })),
          }),
        })
        if (!res.ok) {
          const errBody = await res.text().catch(() => '')
          throw new Error(`HTTP ${res.status}: ${errBody.slice(0, 200)}`)
        }
        return res
      })
    )

    const ok = resultados.filter(r => r.status === 'fulfilled').length
    const fail = resultados.filter(r => r.status === 'rejected').length

    // Capture first error message for display
    const firstError = resultados.find(r => r.status === 'rejected') as PromiseRejectedResult | undefined
    if (firstError && ok === 0) {
      const msg = firstError.reason instanceof Error ? firstError.reason.message : String(firstError.reason)
      setError(`Ningún guardado funcionó. Primer error: ${msg}`)
    }

    setImportados(ok)
    setFallidos(fail)
    setStep('done')
    onImportCompleto(ok)
  }

  // ── IDLE ──
  if (step === 'idle') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '8px 0' }}>
        <div style={{ background: 'rgba(67,97,160,.06)', border: '1.5px dashed rgba(67,97,160,.3)', borderRadius: 14, padding: '28px 20px', textAlign: 'center', cursor: 'pointer' }}
          onClick={() => fileRef.current?.click()}>
          <span className="material-symbols-outlined" style={{ fontSize: 36, color: 'var(--accent)', display: 'block', marginBottom: 8 }}>upload_file</span>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', marginBottom: 4 }}>Subir fichas técnicas</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Excel (.xlsx), Word (.docx) o PDF</div>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.docx,.pdf" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
        </div>

        {error && (
          <div style={{ fontSize: 12, color: '#ef4444', background: 'rgba(239,68,68,.08)', borderRadius: 8, padding: '8px 12px' }}>{error}</div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            { icon: 'table_chart', text: 'Excel con subrecetas por hoja' },
            { icon: 'description', text: 'Word con tabla de ingredientes y procedimiento' },
            { icon: 'picture_as_pdf', text: 'PDF de fichas técnicas profesionales' },
          ].map(({ icon, text }) => (
            <div key={icon} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 15, color: 'var(--accent)' }}>{icon}</span>
              <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{text}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── ANALIZANDO ──
  if (step === 'analizando') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '40px 0' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'var(--accent)', animation: 'spin 1s linear infinite' }}>progress_activity</span>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>Analizando fichas…</div>
        <div style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center' }}>Claude está extrayendo recetas e ingredientes de {fileName}</div>
      </div>
    )
  }

  // ── IMPORTANDO ──
  if (step === 'importando') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '40px 0' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'var(--accent)', animation: 'spin 1s linear infinite' }}>progress_activity</span>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>Importando recetas…</div>
      </div>
    )
  }

  // ── DONE ──
  if (step === 'done') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '40px 0' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 56, color: '#22c55e' }}>check_circle</span>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-1)' }}>{importados} recetas importadas</div>
        {fallidos > 0 && (
          <div style={{ fontSize: 12, color: '#f59e0b' }}>{fallidos} recetas con error — revisalas en el Recetario</div>
        )}
        <div style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', maxWidth: 280 }}>
          Los costos unitarios quedan en $0. Se actualizan automáticamente al cargar facturas del proveedor.
        </div>
        <button onClick={onClose}
          style={{ marginTop: 8, background: 'var(--navy)', border: 'none', borderRadius: 12, padding: '14px 32px', fontSize: 14, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
          Ver Recetario
        </button>
      </div>
    )
  }

  // ── PREVIEW ──
  const conIngredientes = recetas.filter(r => r.ingredientes?.length > 0).length
  const sinIngredientes = recetas.length - conIngredientes
  const existentes = recetas.filter(r => r._existing).length
  const duplicadas = recetas.filter(r => r._duplicate).length
  const countSeleccionadas = seleccionadas.size

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Resumen */}
      <div style={{ background: 'rgba(67,97,160,.07)', border: '1px solid rgba(67,97,160,.2)', borderRadius: 12, padding: '12px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 26, color: 'var(--accent)' }}>menu_book</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>
              {recetas.length} recetas detectadas en {fileName}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
              {conIngredientes} con ingredientes
              {sinIngredientes > 0 && ` · ${sinIngredientes} sin ingredientes`}
              {existentes > 0 && ` · ${existentes} ya en recetario`}
              {duplicadas > 0 && ` · ${duplicadas} duplicadas`}
            </div>
          </div>
        </div>
      </div>

      {/* Seleccionar todas / ninguna */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={() => setSeleccionadas(new Set(recetas.map((_, i) => i)))}
          style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
          Todas
        </button>
        <button onClick={() => setSeleccionadas(new Set())}
          style={{ fontSize: 11, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
          Ninguna
        </button>
      </div>

      {/* Lista de recetas */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 360, overflowY: 'auto' }}>
        {recetas.map((r, idx) => {
          const isSelected = seleccionadas.has(idx)
          const isExpanded = expandidas.has(idx)
          return (
            <div key={idx} style={{
              background: isSelected ? 'rgba(67,97,160,.06)' : 'rgba(0,0,0,.03)',
              borderRadius: 10,
              border: `1.5px solid ${isSelected ? 'rgba(67,97,160,.35)' : 'rgba(0,0,0,.08)'}`,
              overflow: 'hidden', opacity: isSelected ? 1 : 0.6,
            }}>
              {/* Header fila */}
              <div style={{ display: 'flex', alignItems: 'center', padding: '9px 12px', gap: 10 }}>
                <input type="checkbox" checked={isSelected} onChange={() => toggleSeleccion(idx)}
                  style={{ width: 16, height: 16, cursor: 'pointer', flexShrink: 0, accentColor: 'var(--accent)' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', overflow: 'hidden' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.nombre}</span>
                    {r._existing && (
                      <span style={{ flexShrink: 0, fontSize: 9, fontWeight: 600, background: 'rgba(245,158,11,.15)', color: '#b45309', padding: '2px 6px', borderRadius: 4 }}>ya existe</span>
                    )}
                    {r._duplicate && !r._existing && (
                      <span style={{ flexShrink: 0, fontSize: 9, fontWeight: 600, background: 'rgba(100,116,139,.15)', color: '#475569', padding: '2px 6px', borderRadius: 4 }}>duplicada</span>
                    )}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>
                    {r.categoria ?? 'Sin categoría'} · {r.ingredientes?.length ?? 0} ingredientes
                    {r.rinde_cantidad ? ` · Rinde ${r.rinde_cantidad}${r.rinde_unidad ?? ''}` : ''}
                  </div>
                </div>
                <button onClick={() => toggleExpandida(idx)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--text-3)', flexShrink: 0 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                    {isExpanded ? 'expand_less' : 'expand_more'}
                  </span>
                </button>
              </div>

              {/* Ingredientes expandidos */}
              {isExpanded && r.ingredientes?.length > 0 && (
                <div style={{ borderTop: '1px solid var(--border)', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {r.ingredientes.map((ing, ii) => (
                    <div key={ii} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-2)' }}>
                      <span>{ing.nombre}</span>
                      <span style={{ fontFamily: "'DM Mono', monospace", color: 'var(--text-3)' }}>
                        {ing.cantidad} {ing.unidad}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Botón importar */}
      <button
        onClick={importar}
        disabled={countSeleccionadas === 0}
        style={{
          background: countSeleccionadas === 0 ? '#cbd5e1' : 'var(--navy)',
          border: 'none', borderRadius: 12, padding: '14px', fontSize: 14, fontWeight: 700,
          color: '#fff', cursor: countSeleccionadas === 0 ? 'default' : 'pointer', fontFamily: 'inherit',
        }}
      >
        Importar {countSeleccionadas} receta{countSeleccionadas !== 1 ? 's' : ''} →
      </button>
      <button onClick={() => { setStep('idle'); setRecetas([]); setSeleccionadas(new Set()) }}
        style={{ background: 'none', border: 'none', fontSize: 13, color: 'var(--text-3)', cursor: 'pointer', padding: '4px 0', fontFamily: 'inherit' }}>
        Cancelar y subir otro archivo
      </button>
    </div>
  )
}
