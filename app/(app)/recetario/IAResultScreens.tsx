'use client'

// Pantallas de revisión de la importación por IA — extraídas de page.tsx
// (día del ratchet de líneas, sep 2026) para no volver a cruzar el techo de
// 3810 líneas de esa pantalla. Nada de lógica cambió en el move; es texto
// cortado y pegado más los imports que hacían falta.

import { useState, useRef, useEffect } from 'react'
import { IAApiResult, IAResult, apiToForm, parseNum, calcPesoPorcion, formatPeso } from './shared'

// callRecetaAdjust vive acá y no en shared.ts porque solo lo usa
// IAResultScreen (el chat de "Pedí ajustes…") — page.tsx no lo llama.
async function callRecetaAdjust(currentRecipe: IAApiResult, userMessage: string): Promise<IAApiResult> {
  const res = await fetch('/api/recetas/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'adjust', currentRecipe, userMessage }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    throw new Error(err.error || `Error ${res.status}`)
  }
  return res.json()
}

// Mismo motivo: solo lo usan los inputs de IAResultScreen.
const iaFieldStyle: React.CSSProperties = { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', fontSize: 12, fontFamily: 'inherit', color: 'var(--text-1)', outline: 'none', width: '100%', boxSizing: 'border-box' as const }

// ════════════════════════════════════════════════════════════════════
// PANTALLA DE RESULTADO IA — tipo chat
// Muestra la imagen enviada + respuesta de Claude con formato legible
// Botones: "Cargar al formulario" y "Pedir ajustes"
// ════════════════════════════════════════════════════════════════════

interface IAResultScreenProps {
  result: IAApiResult
  previewUrl: string | null  // data URL of uploaded image
  inputText: string | null   // text that was sent
  onAccept: (r: IAResult) => void
  onClose: () => void
  // Fix 1: direct save
  agregarReceta?: (d: any, ingredientes?: any[]) => Promise<string>
  agregarProducto?: (datos: any) => Promise<void>
  stockProductos?: { nombre: string; unidad: string }[]
  restauranteId?: string
  onSaved?: (id: string) => void
  catSugeridas?: string[]
}

export function IAResultScreen({ result, previewUrl, inputText, onAccept, onClose, agregarReceta, agregarProducto, stockProductos, onSaved, catSugeridas = [] }: IAResultScreenProps) {
  const [adjustText, setAdjustText] = useState('')
  const [adjusting, setAdjusting] = useState(false)
  const [current, setCurrent] = useState<IAApiResult>(result)
  const [chatHistory, setChatHistory] = useState<{ role: 'ia' | 'user'; text: string }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Editable follow-up fields
  const [editPorciones, setEditPorciones] = useState(String(result.porciones || ''))
  const [editTiempo, setEditTiempo] = useState(String(result.tiempo_minutos || ''))
  const [editCategoria, setEditCategoria] = useState(result.categoria_sugerida || '')
  const [extraNotes, setExtraNotes] = useState('')

  // Sync when current changes
  useEffect(() => {
    setEditPorciones(String(current.porciones || ''))
    setEditTiempo(String(current.tiempo_minutos || ''))
    setEditCategoria(current.categoria_sugerida || '')
  }, [current])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [chatHistory, current])

  async function handleAdjust() {
    if (!adjustText.trim()) return
    const msg = adjustText.trim()
    setAdjustText('')
    setChatHistory(prev => [...prev, { role: 'user', text: msg }])
    setAdjusting(true)
    setError(null)
    try {
      const updated = await callRecetaAdjust(current, msg)
      setCurrent(updated)
      setChatHistory(prev => [...prev, { role: 'ia', text: 'Receta actualizada con tus cambios.' }])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al ajustar')
    } finally {
      setAdjusting(false)
    }
  }

  const ing = current.ingredientes || []
  const pasos = current.procedimiento || []

  // Fix 1: Guardar directamente desde la pantalla de resultado IA
  async function handleGuardarDirecto() {
    if (!agregarReceta) { onAccept(apiToForm(current)); return }
    setSaving(true)
    setError(null)
    try {
      const procedimiento = (current.procedimiento || []).map((p, i) => `${i + 1}. ${p}`).join('\n') || ''
      const ingredientesData = (current.ingredientes || []).map(ing => ({
        nombre: String(ing.nombre || 'Ingrediente'),
        cantidad: parseNum(ing.cantidad),
        unidad: ing.unidad || 'u',
        costo_unitario: 0,
        unidad_costo: ing.unidad || 'u',
      }))
      const id = await agregarReceta({
        nombre: current.nombre_sugerido || 'Receta importada',
        categoria: editCategoria || current.categoria_sugerida || 'Otros',
        porciones: Math.max(1, parseNum(editPorciones) || parseNum(current.porciones) || 1),
        tiempo_min: Math.max(0, parseNum(editTiempo) || parseNum(current.tiempo_minutos) || 0),
        precio_venta: 0,
        procedimiento,
        activa: true,
        status: 'published' as const,
      }, ingredientesData)
      // Fix 2: Sync ingredientes faltantes al stock
      if (agregarProducto && stockProductos) {
        const stockNombres = new Set(stockProductos.map(p => p.nombre.toLowerCase().trim()))
        for (const ing of ingredientesData) {
          if (!stockNombres.has(ing.nombre.toLowerCase().trim())) {
            try {
              await agregarProducto({
                nombre: ing.nombre,
                categoria: 'Sin categoría',
                unidad: ing.unidad,
                stock_actual: 0,
                stock_minimo: 0,
                stock_critico: 0,
                precio_unitario: 0,
                activo: true,
                proveedor_id: null,
              })
            } catch { /* ignorar errores individuales */ }
          }
        }
      }
      if (onSaved) onSaved(id)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar receta')
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{ background: 'var(--navy)', padding: '44px 12px 10px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 0 }}>
              <span className="material-symbols-outlined" style={{ color: 'rgba(255,255,255,.7)', fontSize: 20 }}>arrow_back</span>
            </button>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>Resultado de IA</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => {
                const form = apiToForm(current)
                form.porciones = parseInt(editPorciones) || form.porciones
                form.tiempo_min = parseInt(editTiempo) || form.tiempo_min
                form.categoria = editCategoria || form.categoria
                onAccept(form)
              }}
              style={{ background: 'rgba(255,255,255,.15)', border: '1px solid rgba(255,255,255,.2)', borderRadius: 8, padding: '6px 10px', fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.8)', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Editar
            </button>
            <button
              onClick={handleGuardarDirecto}
              disabled={saving}
              style={{ background: saving ? 'rgba(74,222,128,.4)' : '#4ade80', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 700, color: '#0a2a0a', cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              {saving ? '…' : <><span className="material-symbols-outlined" style={{ fontSize: 14 }}>check</span> Guardar</>}
            </button>
          </div>
        </div>
      </div>

      {/* Chat body */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '12px 10px 12px' }}>

        {/* User message bubble (image or text) */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <div style={{
            maxWidth: '80%', background: 'var(--navy)', borderRadius: '16px 16px 4px 16px',
            padding: previewUrl ? 6 : 12, color: '#fff', fontSize: 13,
          }}>
            {previewUrl ? (
              <img src={previewUrl} alt="Enviado" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 12, display: 'block' }} />
            ) : inputText ? (
              <p style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{inputText.length > 200 ? inputText.substring(0, 200) + '…' : inputText}</p>
            ) : (
              <p style={{ margin: 0, opacity: .7 }}>Archivo enviado</p>
            )}
          </div>
        </div>

        {/* IA response bubble */}
        <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}>
          <div style={{
            maxWidth: '90%', background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: '16px 16px 16px 4px', padding: '14px 16px',
          }}>
            {/* Sparkle icon */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--accent)' }}>auto_awesome</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Claude</span>
            </div>

            <p style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: 'var(--text-1)', lineHeight: 1.4 }}>
              Encontré esta receta: <em>{current.nombre_sugerido || 'Sin nombre'}</em>
            </p>

            {/* Ingredientes */}
            <div style={{ marginBottom: 12 }}>
              <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 700, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>restaurant</span>Ingredientes:
              </p>
              {ing.map((item, i) => (
                <p key={i} style={{ margin: '2px 0 2px 8px', fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>
                  • {item.cantidad} {item.unidad} — {item.nombre}
                </p>
              ))}
            </div>

            {/* Procedimiento */}
            <div style={{ marginBottom: 12 }}>
              <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 700, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>format_list_numbered</span>Procedimiento:
              </p>
              {pasos.map((paso, i) => (
                <p key={i} style={{ margin: '2px 0 2px 8px', fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>
                  {i + 1}. {paso}
                </p>
              ))}
            </div>

            {/* Meta */}
            <div style={{
              display: 'flex', gap: 12, padding: '8px 0 0', borderTop: '1px solid var(--border)',
              fontSize: 12, color: 'var(--text-3)',
            }}>
              {current.porciones && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>scale</span>
                  {current.porciones} porc.{(() => { const p = calcPesoPorcion(ing, parseNum(current.porciones)); return p ? ` · ${formatPeso(p)}` : '' })()}
                </span>
              )}
              {current.tiempo_minutos && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>schedule</span>{current.tiempo_minutos} min
                </span>
              )}
              {current.categoria_sugerida && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>category</span>{current.categoria_sugerida}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── Preguntas de seguimiento ── */}
        <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}>
          <div style={{
            maxWidth: '90%', background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: '16px 16px 16px 4px', padding: '14px 16px',
          }}>
            <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--text-1)', lineHeight: 1.5 }}>
              Confirmá estos datos antes de cargar:
            </p>
            {/* El rinde de la ficha original ("Yield: 900g"). No tiene columna
                propia en `recetas`, pero se muestra para que el cocinero pueda
                calcular las porciones — antes se colaba dentro de porciones. */}
            {current.rinde != null && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10,
                padding: '6px 10px', borderRadius: 8,
                background: 'var(--bg)', border: '1px solid var(--border)',
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--text-3)' }}>scale</span>
                <span style={{ fontSize: 11, color: 'var(--text-2)' }}>
                  La ficha original rinde{' '}
                  <b style={{ color: 'var(--text-1)', fontFamily: "'DM Mono', monospace" }}>
                    {String(current.rinde).replace('.', ',')}{current.rinde_unidad ?? ''}
                  </b>
                </span>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 3 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 13 }}>scale</span>Porciones
                </span>
                <input
                  type="number" inputMode="numeric" min="1"
                  value={editPorciones}
                  onChange={e => setEditPorciones(e.target.value)}
                  placeholder="4"
                  style={iaFieldStyle}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 3 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 13 }}>schedule</span>Tiempo (min)
                </span>
                <input
                  type="number" inputMode="numeric" min="0"
                  value={editTiempo}
                  onChange={e => setEditTiempo(e.target.value)}
                  placeholder="30"
                  style={iaFieldStyle}
                />
              </label>
            </div>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 10 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 3 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 13 }}>category</span>Categoría
              </span>
              <select
                value={editCategoria}
                onChange={e => setEditCategoria(e.target.value)}
                style={{ ...iaFieldStyle, WebkitAppearance: 'none', appearance: 'auto' } as unknown as React.CSSProperties}
              >
                <option value="">Elegir…</option>
                {catSugeridas.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 3 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 13 }}>edit_note</span>Notas adicionales
              </span>
              <input
                value={extraNotes}
                onChange={e => setExtraNotes(e.target.value)}
                placeholder="Agregar ingrediente, cambiar algo…"
                onKeyDown={e => { if (e.key === 'Enter' && extraNotes.trim()) { e.preventDefault(); setAdjustText(extraNotes); setExtraNotes(''); handleAdjust() } }}
                style={iaFieldStyle}
              />
            </label>
          </div>
        </div>

        {/* Chat history (adjustments) */}
        {chatHistory.map((msg, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
            <div style={{
              maxWidth: '80%', padding: '10px 14px', fontSize: 13, lineHeight: 1.4,
              borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
              background: msg.role === 'user' ? 'var(--navy)' : 'var(--surface)',
              border: msg.role === 'user' ? 'none' : '1px solid var(--border)',
              color: msg.role === 'user' ? '#fff' : 'var(--text-1)',
            }}>
              {msg.text}
            </div>
          </div>
        ))}

        {adjusting && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 8 }}>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px 14px 14px 4px', padding: '10px 14px' }}>
              <div style={{ display: 'flex', gap: 4 }}>
                <span className="animate-pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-3)' }} />
                <span className="animate-pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-3)', animationDelay: '.2s' }} />
                <span className="animate-pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-3)', animationDelay: '.4s' }} />
              </div>
            </div>
          </div>
        )}

        {error && <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 8, padding: '6px 10px', marginBottom: 8, fontSize: 11, color: '#ef4444' }}>{error}</div>}
      </div>

      {/* Bottom action bar */}
      <div style={{
        flexShrink: 0, borderTop: '1px solid var(--border)', background: 'var(--surface)',
        padding: '8px 10px calc(env(safe-area-inset-bottom, 0px) + 8px)',
      }}>
        {/* Adjust input */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <input
            value={adjustText}
            onChange={e => setAdjustText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAdjust() } }}
            placeholder="Pedí ajustes… ej: sacá la sal, poné 6 porciones"
            disabled={adjusting}
            style={{
              flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10,
              padding: '10px 12px', fontSize: 13, fontFamily: 'inherit', color: 'var(--text-1)',
              outline: 'none',
            }}
          />
          <button
            onClick={handleAdjust}
            disabled={!adjustText.trim() || adjusting}
            style={{
              background: adjustText.trim() ? 'var(--navy)' : 'var(--border)',
              border: 'none', borderRadius: 10, width: 42, display: 'flex', alignItems: 'center',
              justifyContent: 'center', cursor: 'pointer', transition: 'background .15s',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#fff' }}>send</span>
          </button>
        </div>

        {/* Main action buttons */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => {
              const form = apiToForm(current)
              form.porciones = parseInt(editPorciones) || form.porciones
              form.tiempo_min = parseInt(editTiempo) || form.tiempo_min
              form.categoria = editCategoria || form.categoria
              onAccept(form)
            }}
            style={{
              flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
              padding: '12px 8px', fontSize: 13, fontWeight: 600, color: 'var(--text-2)', cursor: 'pointer',
              fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span>
            Editar más
          </button>
          <button
            onClick={handleGuardarDirecto}
            disabled={saving}
            style={{
              flex: 2, background: saving ? 'rgba(74,222,128,.5)' : '#22c55e', border: 'none', borderRadius: 10,
              padding: '12px', fontSize: 14, fontWeight: 700, color: '#fff', cursor: saving ? 'default' : 'pointer',
              fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              opacity: saving ? 0.8 : 1,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{saving ? 'hourglass_empty' : 'check_circle'}</span>
            {saving ? 'Guardando…' : 'Guardar receta'}
          </button>
        </div>
      </div>
    </div>
  )
}


// ════════════════════════════════════════════════════════════════════
// PANTALLA MULTI-RESULTADO IA — checkboxes + importar seleccionadas
// ════════════════════════════════════════════════════════════════════

interface IAMultiResultScreenProps {
  results: IAApiResult[]
  previewUrl: string | null
  inputText: string | null
  agregarReceta: (d: any, ingredientes?: any[]) => Promise<string>
  agregarIngrediente: (recetaId: string, d: any) => Promise<void>
  agregarProducto?: (datos: any) => Promise<void>
  stockProductos?: { nombre: string; unidad: string }[]
  onDone: (count: number) => void
  onClose: () => void
}

export function IAMultiResultScreen({ results, previewUrl, inputText, agregarReceta, agregarIngrediente, agregarProducto, stockProductos, onDone, onClose }: IAMultiResultScreenProps) {
  const [selected, setSelected] = useState<Set<number>>(() => new Set(results.map((_, i) => i)))
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  function toggleSelect(idx: number) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  function toggleSelectAll() {
    if (selected.size === results.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(results.map((_, i) => i)))
    }
  }

  function toggleExpand(idx: number) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  async function handleImportSelected() {
    const indices = Array.from(selected).sort((a, b) => a - b)
    if (indices.length === 0) return
    setImporting(true)
    setImportProgress(0)
    setError(null)

    // Fix 2: preparar set de nombres en stock para sync
    const stockNombres = new Set(
      (stockProductos || []).map(p => p.nombre.toLowerCase().trim())
    )

    let imported = 0
    for (const idx of indices) {
      const r = results[idx]
      try {
        const procedimiento = (r.procedimiento || []).map((p, i) => `${i + 1}. ${p}`).join('\n') || ''
        const ingredientesData = (r.ingredientes || []).map(ing => ({
          nombre: String(ing.nombre || 'Ingrediente'),
          cantidad: parseNum(ing.cantidad),
          unidad: ing.unidad || 'u',
          costo_unitario: 0,
          unidad_costo: ing.unidad || 'u',
        }))
        await agregarReceta({
          nombre: r.nombre_sugerido || `Receta importada ${idx + 1}`,
          categoria: r.categoria_sugerida || 'Otros',
          porciones: Math.max(1, parseNum(r.porciones) || 1),
          tiempo_min: Math.max(0, parseNum(r.tiempo_minutos) || 0),
          precio_venta: 0,
          procedimiento,
          activa: true,
          status: 'published' as const,
        }, ingredientesData)
        // Fix 2: sync ingredientes faltantes al stock
        if (agregarProducto) {
          for (const ing of ingredientesData) {
            if (!stockNombres.has(ing.nombre.toLowerCase().trim())) {
              try {
                await agregarProducto({
                  nombre: ing.nombre,
                  categoria: 'Sin categoría',
                  unidad: ing.unidad,
                  stock_actual: 0,
                  stock_minimo: 0,
                  stock_critico: 0,
                  precio_unitario: 0,
                  activo: true,
                  proveedor_id: null,
                })
                stockNombres.add(ing.nombre.toLowerCase().trim()) // evitar duplicados
              } catch { /* ignorar */ }
            }
          }
        }
        imported++
      } catch (e) {
        const msg = e instanceof Error ? e.message : `Error en receta ${idx + 1}`
        console.error(`Error importing recipe ${idx}:`, e)
        setError(`Error al guardar: ${msg}`)
      }
      setImportProgress(imported)
    }
    setImporting(false)
    if (imported > 0) onDone(imported)
  }

  const selectedCount = selected.size
  const categoryCounts: Record<string, number> = {}
  results.forEach(r => {
    const cat = r.categoria_sugerida || 'Otros'
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--bg)', position: 'relative' }}>
      {/* Header */}
      <div style={{ background: 'var(--navy)', padding: '44px 12px 12px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 0 }}>
              <span className="material-symbols-outlined" style={{ color: 'rgba(255,255,255,.7)', fontSize: 20 }}>arrow_back</span>
            </button>
            <div>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>Recetas encontradas</span>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', marginLeft: 8 }}>{results.length} recetas</span>
            </div>
          </div>
        </div>

        {/* Summary strip */}
        <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
          {Object.entries(categoryCounts).map(([cat, count]) => (
            <span key={cat} style={{
              fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 99,
              background: 'rgba(255,255,255,.1)', color: 'rgba(255,255,255,.7)',
            }}>
              {cat} ({count})
            </span>
          ))}
        </div>
      </div>

      {/* Select all bar */}
      <div style={{
        background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
      }}>
        <button onClick={toggleSelectAll} style={{
          background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
          display: 'flex', alignItems: 'center', gap: 8, padding: 0,
        }}>
          <div style={{
            width: 20, height: 20, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: selected.size === results.length ? 'var(--navy)' : 'transparent',
            border: selected.size === results.length ? '2px solid var(--navy)' : '2px solid var(--border)',
            transition: 'all .15s',
          }}>
            {selected.size === results.length && (
              <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#fff' }}>check</span>
            )}
            {selected.size > 0 && selected.size < results.length && (
              <span style={{ width: 10, height: 2, background: 'var(--text-3)', borderRadius: 1 }} />
            )}
          </div>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>
            {selected.size === results.length ? 'Deseleccionar todas' : 'Seleccionar todas'}
          </span>
        </button>
        <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>
          {selectedCount} de {results.length}
        </span>
      </div>

      {/* Body — recipe cards with checkboxes */}
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '10px 14px 120px' }}>
        {/* Source info */}
        {(previewUrl || inputText) && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: '8px 10px',
            background: 'rgba(28,45,74,.06)', border: '1px solid rgba(28,45,74,.15)', borderRadius: 10,
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--accent)' }}>auto_awesome</span>
            <span style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.4 }}>
              Claude encontró <b>{results.length} recetas</b> en {previewUrl ? 'la imagen' : 'el archivo'}.
              Seleccioná las que querés importar.
            </span>
          </div>
        )}

        {error && (
          <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 8, padding: '8px 12px', marginBottom: 10, fontSize: 12, color: '#ef4444' }}>
            {error}
          </div>
        )}

        {results.map((r, idx) => {
          const isSelected = selected.has(idx)
          const isExpanded = expanded.has(idx)
          const ingCount = (r.ingredientes || []).length
          const pasosCount = (r.procedimiento || []).length

          return (
            <div key={idx} style={{
              marginBottom: 8, borderRadius: 12, overflow: 'hidden',
              border: isSelected ? '1.5px solid rgba(28,45,74,.5)' : '1px solid var(--border)',
              background: isSelected ? 'rgba(28,45,74,.03)' : 'var(--surface)',
              transition: 'all .15s',
            }}>
              {/* Row: checkbox + name + category + expand */}
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: 0, padding: '10px 10px', cursor: 'pointer',
                }}
                onClick={() => toggleSelect(idx)}
              >
                {/* Checkbox */}
                <div style={{
                  width: 22, height: 22, borderRadius: 6, marginRight: 10, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: isSelected ? 'var(--navy)' : 'transparent',
                  border: isSelected ? '2px solid var(--navy)' : '2px solid var(--border)',
                  transition: 'all .15s',
                }}>
                  {isSelected && <span className="material-symbols-outlined" style={{ fontSize: 15, color: '#fff' }}>check</span>}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.nombre_sugerido || `Receta ${idx + 1}`}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                    <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{r.categoria_sugerida || '—'}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{ingCount} ing.</span>
                    {r.porciones && <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{r.porciones} porc.{(() => { const p = calcPesoPorcion(r.ingredientes || [], parseNum(r.porciones)); return p ? ` · ${formatPeso(p)}` : '' })()}</span>}
                    {r.tiempo_minutos && <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{r.tiempo_minutos} min</span>}
                  </div>
                </div>

                {/* Expand toggle */}
                <button
                  onClick={e => { e.stopPropagation(); toggleExpand(idx) }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex' }}
                >
                  <span className="material-symbols-outlined" style={{
                    fontSize: 18, color: 'var(--text-3)',
                    transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform .2s',
                  }}>expand_more</span>
                </button>
              </div>

              {/* Expanded details */}
              {isExpanded && (
                <div style={{ padding: '0 12px 12px 44px', borderTop: '1px solid var(--border)' }}>
                  {/* Ingredientes */}
                  {ingCount > 0 && (
                    <div style={{ marginTop: 10 }}>
                      <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>Ingredientes</p>
                      {(r.ingredientes || []).map((ing, i) => (
                        <p key={i} style={{ margin: '1px 0', fontSize: 11, color: 'var(--text-2)', lineHeight: 1.4 }}>
                          • {ing.nombre} — {ing.cantidad} {ing.unidad}
                        </p>
                      ))}
                    </div>
                  )}

                  {/* Procedimiento */}
                  {pasosCount > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>Procedimiento</p>
                      {(r.procedimiento || []).map((paso, i) => (
                        <p key={i} style={{ margin: '1px 0', fontSize: 11, color: 'var(--text-2)', lineHeight: 1.4 }}>
                          {i + 1}. {paso}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Bottom import bar — always visible at bottom */}
      <div style={{
        flexShrink: 0,
        background: 'var(--surface)', borderTop: '1px solid var(--border)',
        padding: '12px 14px calc(env(safe-area-inset-bottom, 16px) + 12px)',
      }}>
        {importing ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', marginBottom: 8 }}>
              Guardando… {importProgress}/{selectedCount}
            </div>
            <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                height: '100%', background: 'var(--navy)', borderRadius: 2,
                width: `${selectedCount > 0 ? (importProgress / selectedCount) * 100 : 0}%`,
                transition: 'width .3s',
              }} />
            </div>
          </div>
        ) : (
          <button
            onClick={handleImportSelected}
            disabled={selectedCount === 0}
            style={{
              width: '100%', background: selectedCount > 0 ? 'linear-gradient(135deg, var(--navy), #4361a0)' : 'var(--border)',
              border: 'none', borderRadius: 12, padding: '14px 20px',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              cursor: selectedCount > 0 ? 'pointer' : 'default',
              boxShadow: selectedCount > 0 ? '0 4px 16px rgba(28,45,74,.35)' : 'none',
              transition: 'all .2s',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#fff' }}>check_circle</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#fff', fontFamily: 'inherit' }}>
              {selectedCount > 0
                ? `Confirmar receta${selectedCount > 1 ? 's' : ''} (${selectedCount})`
                : 'Seleccioná al menos una receta'}
            </span>
          </button>
        )}
      </div>
    </div>
  )
}
