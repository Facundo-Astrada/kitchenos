'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { SheetChrome } from '@/lib/ui/chrome'
import { useRecetas, unitConversionFactor } from '@/lib/hooks/useRecetas'
import { useProduccionRegistros, type ProduccionRegistro } from '@/lib/hooks/useProduccionRegistros'
import { usePermisos } from '@/lib/hooks/usePermisos'
import { callRecetaImport } from '@/lib/recetas/iaImport'
import { IAButton, IAPanel } from '@/components/ui'

const UNIDADES = ['g', 'kg', 'ml', 'l', 'unidad']

interface Props {
  recetaId: string
  onClose: () => void
}

const btnReset: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit',
}
const inputStyle: React.CSSProperties = {
  border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)',
  color: 'var(--text-1)', fontFamily: 'inherit', outline: 'none', padding: '6px 8px', fontSize: 12,
}
const labelStyle: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase',
  letterSpacing: '.06em', marginBottom: 6,
}

function Seccion({ label, children, extra }: { label: string; children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={labelStyle}>{label}</div>
        {extra}
      </div>
      {children}
    </div>
  )
}

// ── Editor rápido de receta ──────────────────────────────────────────────────
// Se abre desde el chip de aviso del Mise (ProductoMiseCard) cuando la receta
// vinculada a un ítem no tiene rendimiento, gramaje calculable o procedimiento
// cargado, y desde el estado vacío de RecetaDrawer en Producción ("Sin receta
// cargada") — en los dos casos el cocinero completa ahí mismo, sin salir de
// OPS, y vuelve.
//
// A propósito usa useRecetas() completo (no useRecetasLite, que es lo que usa
// el resto de Mise): esto es una acción explícita y poco frecuente — abrir el
// editor de UNA receta — que necesita las mutaciones reales (actualizarReceta,
// agregarIngrediente...). Duplicar esa capa de escritura optimista para
// ahorrarse esta única descarga puntual no valía el riesgo.
export function RecetaQuickEditModal({ recetaId, onClose }: Props) {
  const { recetas, loading, actualizarReceta, agregarIngrediente, actualizarIngrediente, eliminarIngrediente } = useRecetas()
  const { verCostos } = usePermisos()
  const { getHistorial } = useProduccionRegistros()

  const receta = recetas.find(r => r.id === recetaId)

  const [porcionesInput, setPorcionesInput] = useState('')
  const [procedimientoInput, setProcedimientoInput] = useState('')
  const [nuevoIng, setNuevoIng] = useState({ nombre: '', cantidad: '', unidad: 'g', costo_unitario: '' })
  const [addingIng, setAddingIng] = useState(false)

  // Completar con IA: pegás cualquier texto (una lista suelta, una ficha, notas
  // de WhatsApp) y se escribe directo en los campos de acá abajo — sin una
  // pantalla de revisión intermedia como la del importador completo de
  // Recetario. El propio editor, ya abierto, ES la revisión: si algo quedó
  // mal, se corrige ahí mismo.
  const [iaOpen, setIaOpen] = useState(false)
  const [iaText, setIaText] = useState('')
  const [iaLoading, setIaLoading] = useState(false)
  const [iaError, setIaError] = useState<string | null>(null)

  const [historial, setHistorial] = useState<ProduccionRegistro[]>([])
  const [historialLoading, setHistorialLoading] = useState(true)

  useEffect(() => {
    getHistorial(recetaId).then(setHistorial).finally(() => setHistorialLoading(false))
  }, [recetaId, getHistorial])

  // Solo resincroniza cuando cambia DE receta, no en cada mutación optimista —
  // si no, cada tecleo (que dispara actualizarReceta en el blur siguiente)
  // pisaría lo que el usuario está tipeando ahora mismo.
  useEffect(() => {
    if (!receta) return
    setPorcionesInput(receta.porciones != null ? String(receta.porciones) : '')
    setProcedimientoInput(receta.procedimiento ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receta?.id])

  function commitPorciones() {
    if (!receta) return
    const v = porcionesInput.trim() === '' ? null : parseInt(porcionesInput, 10)
    if ((v ?? null) === (receta.porciones ?? null)) return
    actualizarReceta(receta.id, { porciones: v })
  }
  function commitProcedimiento() {
    if (!receta) return
    if (procedimientoInput === (receta.procedimiento ?? '')) return
    actualizarReceta(receta.id, { procedimiento: procedimientoInput })
  }

  async function handleAddIngrediente() {
    if (!receta || !nuevoIng.nombre.trim() || addingIng) return
    setAddingIng(true)
    try {
      await agregarIngrediente(receta.id, {
        nombre: nuevoIng.nombre.trim(),
        cantidad: parseFloat(nuevoIng.cantidad) || 0,
        unidad: nuevoIng.unidad,
        costo_unitario: nuevoIng.costo_unitario ? parseFloat(nuevoIng.costo_unitario) : 0,
        unidad_costo: nuevoIng.unidad,
      })
      setNuevoIng({ nombre: '', cantidad: '', unidad: nuevoIng.unidad, costo_unitario: '' })
    } finally {
      setAddingIng(false)
    }
  }

  async function handleIaImport() {
    if (!receta || !iaText.trim() || iaLoading) return
    setIaLoading(true)
    setIaError(null)
    try {
      // Categorías reales de este restaurante (ya están en memoria por
      // useRecetas) — sin esto el servidor cae en un fallback genérico.
      const categorias = Array.from(new Set(recetas.map(r => r.categoria).filter(Boolean))) as string[]
      const resultado = await callRecetaImport('text', { text: iaText, categorias })

      const patch: { porciones?: number | null; procedimiento?: string; peso_total_g?: number } = {}
      if (resultado.porciones != null) patch.porciones = resultado.porciones
      if (resultado.procedimiento?.length) patch.procedimiento = resultado.procedimiento.join('\n')
      // Rinde en peso ("Yield: 900g") y no en porciones: no tiene columna propia
      // (ver lib/recetas/iaImport.ts) — se guarda en peso_total_g en vez de
      // perderlo, que es lo más parecido que ya existe en `recetas`.
      if (resultado.porciones == null && resultado.rinde != null) {
        if (resultado.rinde_unidad === 'g') patch.peso_total_g = resultado.rinde
        else if (resultado.rinde_unidad === 'kg') patch.peso_total_g = resultado.rinde * 1000
      }
      if (Object.keys(patch).length > 0) {
        await actualizarReceta(receta.id, patch)
        if (patch.porciones !== undefined) setPorcionesInput(patch.porciones != null ? String(patch.porciones) : '')
        if (patch.procedimiento !== undefined) setProcedimientoInput(patch.procedimiento)
      }
      for (const ing of resultado.ingredientes ?? []) {
        const cantidad = parseFloat(String(ing.cantidad).replace(',', '.')) || 0
        await agregarIngrediente(receta.id, {
          nombre: ing.nombre, cantidad, unidad: ing.unidad,
          costo_unitario: 0, unidad_costo: ing.unidad,
        })
      }
      setIaText('')
      setIaOpen(false)
    } catch (e) {
      setIaError(e instanceof Error ? e.message : 'No se pudo leer el texto')
    } finally {
      setIaLoading(false)
    }
  }

  function fmtFecha(iso: string) {
    return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <SheetChrome>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 2000,
          background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}
      >
        <div
          onClick={e => e.stopPropagation()}
          className="toast-enter"
          style={{
            width: '100%', maxWidth: 460, maxHeight: '85vh', background: 'var(--surface)',
            borderRadius: 18, boxShadow: '0 20px 60px rgba(0,0,0,.35)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div style={{
            padding: '14px 16px 12px', borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {receta?.nombre ?? 'Cargando…'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>Completar receta</div>
            </div>
            <button onClick={onClose} style={btnReset}>
              <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--text-3)' }}>close</span>
            </button>
          </div>

          {/* Body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
            {loading && !receta && (
              <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-3)', fontSize: 13 }}>Cargando…</div>
            )}
            {!loading && !receta && (
              <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-3)', fontSize: 13 }}>
                No se encontró la receta (¿se borró?)
              </div>
            )}

            {receta && (
              <>
                {/* Completar con IA — colapsado por default, ya hay bastante
                    campo abajo. Sirve tanto para llenar una receta vacía de
                    un saque como para completar solo lo que falta. */}
                {!iaOpen ? (
                  <div style={{ marginBottom: 16 }}>
                    <IAButton label="Completar con IA" onClick={() => setIaOpen(true)} variant="soft" />
                  </div>
                ) : (
                  <IAPanel title="Completar con IA" style={{ marginBottom: 16 }}>
                    <textarea
                      autoFocus
                      value={iaText}
                      onChange={e => setIaText(e.target.value)}
                      placeholder="Pegá la receta en cualquier formato: una lista de ingredientes, una ficha técnica, notas sueltas…"
                      rows={4}
                      style={{ ...inputStyle, width: '100%', resize: 'vertical', lineHeight: 1.4, marginBottom: 8 }}
                    />
                    {iaError && <div style={{ fontSize: 11, color: '#ef4444', marginBottom: 8 }}>{iaError}</div>}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => { setIaOpen(false); setIaText(''); setIaError(null) }}
                        style={{ ...btnReset, padding: '10px 14px', borderRadius: 99, background: 'var(--bg)', color: 'var(--text-3)', fontSize: 12, fontWeight: 700 }}
                      >
                        Cancelar
                      </button>
                      <div style={{ flex: 1 }}>
                        <IAButton
                          label={iaLoading ? 'Leyendo…' : 'Completar receta'}
                          onClick={handleIaImport}
                          disabled={!iaText.trim() || iaLoading}
                          variant="solid"
                          full
                        />
                      </div>
                    </div>
                  </IAPanel>
                )}

                {/* Rendimiento */}
                <Seccion label="Rendimiento (porciones)">
                  <input
                    type="number" inputMode="numeric" value={porcionesInput}
                    onChange={e => setPorcionesInput(e.target.value)}
                    onBlur={commitPorciones}
                    placeholder="ej: 10"
                    style={{ ...inputStyle, width: 90 }}
                  />
                </Seccion>

                {/* Procedimiento */}
                <Seccion label="Procedimiento">
                  <textarea
                    value={procedimientoInput}
                    onChange={e => setProcedimientoInput(e.target.value)}
                    onBlur={commitProcedimiento}
                    placeholder="Pasos para elaborarla…"
                    rows={4}
                    style={{ ...inputStyle, width: '100%', resize: 'vertical', lineHeight: 1.4 }}
                  />
                </Seccion>

                {/* Ingredientes — el peso al lado del costo, no un % de food cost aislado */}
                <Seccion label={`Ingredientes (${receta.ingredientes?.length ?? 0})`}>
                  {(receta.ingredientes ?? []).map(ing => {
                    const factor = unitConversionFactor(ing.unidad ?? '', ing.unidad_costo ?? ing.unidad ?? '')
                    const costoLinea = (ing.cantidad ?? 0) * factor * (ing.costo_unitario ?? 0)
                    return (
                      <div key={ing.id} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                        <input
                          defaultValue={ing.nombre}
                          onBlur={e => { const v = e.target.value.trim(); if (v && v !== ing.nombre) actualizarIngrediente(ing.id, { nombre: v }) }}
                          style={{ ...inputStyle, flex: 1, minWidth: 0 }}
                        />
                        <input
                          type="number" defaultValue={ing.cantidad}
                          onBlur={e => { const v = parseFloat(e.target.value) || 0; if (v !== ing.cantidad) actualizarIngrediente(ing.id, { cantidad: v }) }}
                          style={{ ...inputStyle, width: 52, textAlign: 'center', fontFamily: "'DM Mono', monospace" }}
                        />
                        <select
                          defaultValue={ing.unidad}
                          onChange={e => actualizarIngrediente(ing.id, { unidad: e.target.value })}
                          style={{ ...inputStyle, width: 60, padding: '6px 2px' }}
                        >
                          {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                        {verCostos && (
                          <>
                            <input
                              type="number" defaultValue={ing.costo_unitario ?? 0}
                              title={`Costo por ${ing.unidad_costo ?? ing.unidad}`}
                              onBlur={e => { const v = parseFloat(e.target.value) || 0; if (v !== ing.costo_unitario) actualizarIngrediente(ing.id, { costo_unitario: v }) }}
                              style={{ ...inputStyle, width: 60, textAlign: 'center', fontFamily: "'DM Mono', monospace" }}
                            />
                            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', minWidth: 52, textAlign: 'right', fontFamily: "'DM Mono', monospace", flexShrink: 0 }}>
                              ${Math.round(costoLinea)}
                            </span>
                          </>
                        )}
                        <button onClick={() => eliminarIngrediente(ing.id)} style={{ ...btnReset, flexShrink: 0 }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 15, color: '#ef4444' }}>close</span>
                        </button>
                      </div>
                    )
                  })}

                  {/* Agregar ingrediente */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 0 0' }}>
                    <input
                      value={nuevoIng.nombre}
                      onChange={e => setNuevoIng(v => ({ ...v, nombre: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') handleAddIngrediente() }}
                      placeholder="Nuevo ingrediente…"
                      style={{ ...inputStyle, flex: 1, minWidth: 0, borderStyle: 'dashed' }}
                    />
                    <input
                      type="number" value={nuevoIng.cantidad}
                      onChange={e => setNuevoIng(v => ({ ...v, cantidad: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') handleAddIngrediente() }}
                      placeholder="0"
                      style={{ ...inputStyle, width: 52, textAlign: 'center' }}
                    />
                    <select
                      value={nuevoIng.unidad}
                      onChange={e => setNuevoIng(v => ({ ...v, unidad: e.target.value }))}
                      style={{ ...inputStyle, width: 60, padding: '6px 2px' }}
                    >
                      {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                    {verCostos && (
                      <input
                        type="number" value={nuevoIng.costo_unitario}
                        onChange={e => setNuevoIng(v => ({ ...v, costo_unitario: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') handleAddIngrediente() }}
                        placeholder="$"
                        style={{ ...inputStyle, width: 60, textAlign: 'center' }}
                      />
                    )}
                    <button
                      onClick={handleAddIngrediente}
                      disabled={!nuevoIng.nombre.trim() || addingIng}
                      style={{
                        ...btnReset, flexShrink: 0, width: 26, height: 26, borderRadius: 8,
                        background: nuevoIng.nombre.trim() ? 'var(--navy)' : 'var(--border)',
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 15, color: '#fff' }}>add</span>
                    </button>
                  </div>

                  {verCostos && (receta.ingredientes?.length ?? 0) > 0 && (
                    <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>
                      Costo total: <span style={{ color: 'var(--text-1)' }}>${Math.round(receta.food_cost.costo_total)}</span>
                      {' · '}Costo/porción: <span style={{ color: 'var(--text-1)' }}>${Math.round(receta.food_cost.costo_porcion)}</span>
                    </div>
                  )}
                </Seccion>

                {/* Historial de producción */}
                <Seccion label={`Historial de producción${historial.length > 0 ? ` (${historial.length})` : ''}`}>
                  {historialLoading ? (
                    <div style={{ fontSize: 12, color: 'var(--text-3)', padding: '6px 0' }}>Cargando…</div>
                  ) : historial.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--text-3)', padding: '6px 0' }}>Sin registros todavía</div>
                  ) : (
                    <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                      {historial.map((r, idx) => {
                        const pct = Math.round(((r.multiplicador_real ?? 1) - 1) * 100)
                        return (
                          <div key={r.id} style={{
                            display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                            borderBottom: idx < historial.length - 1 ? '1px solid var(--border)' : 'none',
                          }}>
                            <span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: "'DM Mono', monospace", flexShrink: 0 }}>
                              {fmtFecha(r.created_at)}
                            </span>
                            <span style={{ flex: 1, fontSize: 11, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {r.usuario_nombre ?? 'Sin usuario'}
                            </span>
                            <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: pct === 0 ? 'var(--text-3)' : pct > 0 ? '#22c55e' : '#f97316' }}>
                              {pct === 0 ? '—' : pct > 0 ? `+${pct}%` : `${pct}%`}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </Seccion>
              </>
            )}
          </div>

          {/* Footer */}
          <div style={{ padding: '10px 16px', paddingBottom: 'max(env(safe-area-inset-bottom), 10px)', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
            <button
              onClick={onClose}
              style={{
                width: '100%', padding: '11px 0', borderRadius: 12, border: 'none',
                background: 'linear-gradient(135deg, var(--navy), #4361a0)', color: '#fff',
                fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
              }}
            >
              Listo
            </button>
          </div>
        </div>
      </div>
    </SheetChrome>,
    document.body,
  )
}
