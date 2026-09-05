'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { SheetChrome } from '@/lib/ui/chrome'
import { useRecetas, unitConversionFactor } from '@/lib/hooks/useRecetas'
import { useProduccionRegistros, type ProduccionRegistro } from '@/lib/hooks/useProduccionRegistros'
import { useStock } from '@/lib/hooks/useStock'
import { usePermisos } from '@/lib/hooks/usePermisos'
import { callRecetaImport, fileToBase64, type RecetaIAResult } from '@/lib/recetas/iaImport'
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

type SugerenciaIng = {
  tipo: 'producto' | 'subreceta'
  nombre: string
  unidad: string
  costoUnitario: number
  productoId?: string
  subrecetaId?: string
  detalle: string
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
  const { recetas, loading, refetch, actualizarReceta, agregarIngrediente, actualizarIngrediente, eliminarIngrediente } = useRecetas()
  // Para el desplegable de "producto de stock o receta" al cargar un
  // ingrediente a mano — mismo criterio que CargaRapidaIngredientes.tsx
  // (Recetario), reescrito acá porque esa lógica es privada de esa fila y
  // este editor no comparte su modelo de datos (acá cada fila ya es un
  // registro persistido, no un array local a confirmar de una).
  const { productos: stockProductos } = useStock()
  const { verCostos } = usePermisos()
  const { getHistorial } = useProduccionRegistros()

  const receta = recetas.find(r => r.id === recetaId)

  const [porcionesInput, setPorcionesInput] = useState('')
  const [procedimientoInput, setProcedimientoInput] = useState('')
  const [nuevoIng, setNuevoIng] = useState<{
    nombre: string; cantidad: string; unidad: string; costo_unitario: string
    tipo: 'producto' | 'subreceta'; productoId?: string; subrecetaId?: string
  }>({ nombre: '', cantidad: '', unidad: 'g', costo_unitario: '', tipo: 'producto' })
  const [addingIng, setAddingIng] = useState(false)
  const [sugerenciasIng, setSugerenciasIng] = useState<SugerenciaIng[]>([])
  const [showSugIng, setShowSugIng] = useState(false)

  // Completar con IA: pegás cualquier texto (una lista suelta, una ficha, notas
  // de WhatsApp) y se escribe directo en los campos de acá abajo — sin una
  // pantalla de revisión intermedia como la del importador completo de
  // Recetario. El propio editor, ya abierto, ES la revisión: si algo quedó
  // mal, se corrige ahí mismo.
  const [iaOpen, setIaOpen] = useState(false)
  const [iaText, setIaText] = useState('')
  const [iaLoading, setIaLoading] = useState(false)
  const [iaError, setIaError] = useState<string | null>(null)
  const fotoInputRef = useRef<HTMLInputElement>(null)
  const galeriaInputRef = useRef<HTMLInputElement>(null)

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

  // Vincula por nombre los ingredientes sin producto_id contra el stock real
  // (mismo endpoint y mismo criterio — exacto/parcial, nunca fuzzy — que usa
  // agregarReceta() en useRecetas.ts al crear una receta desde Recetario).
  // Sin esto, un ingrediente cargado acá quedaba con costo_unitario en 0 y
  // nunca entraba al food cost aunque el producto ya existiera en Stock.
  // Best-effort: si falla, el ingrediente queda igual, solo sin vincular.
  async function autoLinkIngredientes() {
    try {
      const res = await fetch('/api/recetas/auto-link-ingredientes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
      })
      const { matches = [] } = await res.json() as { matches: { ingrediente_ids: string[]; producto_id: string; confianza: string }[] }
      const toApply = matches.filter(m => m.confianza === 'exacto' || m.confianza === 'parcial')
      if (toApply.length === 0) return
      await fetch('/api/recetas/auto-link-ingredientes', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          links: toApply.map(m => ({ ingrediente_ids: m.ingrediente_ids, producto_id: m.producto_id })),
        }),
      })
      refetch()
    } catch (e) {
      console.warn('[RecetaQuickEditModal] auto-link silencioso:', e)
    }
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
        tipo: nuevoIng.tipo,
        // Elegido del desplegable → el vínculo va directo, sin esperar al
        // auto-link por nombre de abajo (que sigue corriendo como red de
        // contención para lo que se tipeó a mano sin elegir sugerencia).
        producto_id: nuevoIng.tipo === 'producto' ? (nuevoIng.productoId ?? null) : null,
        subreceta_id: nuevoIng.tipo === 'subreceta' ? (nuevoIng.subrecetaId ?? null) : null,
      })
      setNuevoIng({ nombre: '', cantidad: '', unidad: nuevoIng.unidad, costo_unitario: '', tipo: 'producto' })
      setSugerenciasIng([])
      setShowSugIng(false)
      autoLinkIngredientes()
    } finally {
      setAddingIng(false)
    }
  }

  // Mismo criterio de match que CargaRapidaIngredientes.tsx: nombre de stock
  // y de recetas activas (excluida esta misma, para no poder autorreferenciarse).
  function buscarSugerenciasIng(q: string) {
    const query = q.toLowerCase().trim()
    if (!query) { setShowSugIng(false); return }
    const prods: SugerenciaIng[] = stockProductos
      .filter(p => p.nombre.toLowerCase().includes(query))
      .slice(0, 5)
      .map(p => ({
        tipo: 'producto', nombre: p.nombre, unidad: p.unidad, costoUnitario: p.precio_unitario || 0, productoId: p.id,
        detalle: p.precio_unitario > 0 ? `$${p.precio_unitario.toLocaleString('es-AR')}/${p.unidad}` : p.unidad,
      }))
    const recs: SugerenciaIng[] = recetas
      .filter(r => r.id !== recetaId && r.nombre.toLowerCase().includes(query))
      .slice(0, 5)
      .map(r => ({
        tipo: 'subreceta', nombre: r.nombre, unidad: 'unidad', costoUnitario: r.food_cost.costo_porcion, subrecetaId: r.id,
        detalle: `receta · $${r.food_cost.costo_porcion.toFixed(0)}/porc.`,
      }))
    const combinadas = [...prods, ...recs].slice(0, 8)
    setSugerenciasIng(combinadas)
    setShowSugIng(combinadas.length > 0)
  }

  function seleccionarSugerenciaIng(s: SugerenciaIng) {
    setNuevoIng(v => ({
      ...v,
      nombre: s.nombre, unidad: s.unidad, costo_unitario: String(s.costoUnitario || ''),
      tipo: s.tipo, productoId: s.productoId, subrecetaId: s.subrecetaId,
      cantidad: v.cantidad || (s.tipo === 'subreceta' ? '1' : ''),
    }))
    setShowSugIng(false)
  }

  async function aplicarResultadoIA(resultado: RecetaIAResult) {
    if (!receta) return
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
    // Una sola pasada al final (no por ingrediente): el matching es sobre TODO
    // el restaurante, repetirlo por cada alta sería N escaneos idénticos.
    if ((resultado.ingredientes ?? []).length > 0) autoLinkIngredientes()
  }

  async function handleIaImportTexto() {
    if (!receta || !iaText.trim() || iaLoading) return
    setIaLoading(true)
    setIaError(null)
    try {
      // Categorías reales de este restaurante (ya están en memoria por
      // useRecetas) — sin esto el servidor cae en un fallback genérico.
      const categorias = Array.from(new Set(recetas.map(r => r.categoria).filter(Boolean))) as string[]
      const resultado = await callRecetaImport('text', { text: iaText, categorias })
      await aplicarResultadoIA(resultado)
      setIaText('')
      setIaOpen(false)
    } catch (e) {
      setIaError(e instanceof Error ? e.message : 'No se pudo leer el texto')
    } finally {
      setIaLoading(false)
    }
  }

  async function handleIaImportFoto(file: File) {
    if (!receta || iaLoading) return
    setIaLoading(true)
    setIaError(null)
    try {
      const { base64, media_type } = await fileToBase64(file)
      const categorias = Array.from(new Set(recetas.map(r => r.categoria).filter(Boolean))) as string[]
      const resultado = await callRecetaImport('image', { image_base64: base64, media_type, categorias })
      await aplicarResultadoIA(resultado)
      setIaOpen(false)
    } catch (e) {
      setIaError(e instanceof Error ? e.message : 'No se pudo leer la foto')
    } finally {
      setIaLoading(false)
    }
  }

  function handleFotoSeleccionada(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // permite elegir la misma foto de nuevo si hace falta
    if (file) handleIaImportFoto(file)
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
                    {/* Foto — la mayoría de las recetas está escrita a mano en la
                        libretita de la cocina, no tipeada. Va primero por eso. */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                      <button
                        onClick={() => fotoInputRef.current?.click()}
                        disabled={iaLoading}
                        style={{ ...btnReset, flex: 1, gap: 6, padding: '10px 0', borderRadius: 10, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-2)', fontSize: 12, fontWeight: 700, opacity: iaLoading ? .5 : 1 }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>photo_camera</span>
                        Tomar foto
                      </button>
                      <button
                        onClick={() => galeriaInputRef.current?.click()}
                        disabled={iaLoading}
                        style={{ ...btnReset, flex: 1, gap: 6, padding: '10px 0', borderRadius: 10, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-2)', fontSize: 12, fontWeight: 700, opacity: iaLoading ? .5 : 1 }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>image</span>
                        Galería
                      </button>
                      {/* capture="environment" abre la cámara directo en el celular;
                          el segundo input, sin capture, deja elegir de la galería. */}
                      <input ref={fotoInputRef} type="file" accept="image/*" capture="environment" onChange={handleFotoSeleccionada} style={{ display: 'none' }} />
                      <input ref={galeriaInputRef} type="file" accept="image/*" onChange={handleFotoSeleccionada} style={{ display: 'none' }} />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                      <span style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700 }}>O ESCRIBÍ / PEGÁ TEXTO</span>
                      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                    </div>

                    <textarea
                      value={iaText}
                      onChange={e => setIaText(e.target.value)}
                      placeholder="Pegá la receta en cualquier formato: una lista de ingredientes, una ficha técnica, notas sueltas…"
                      rows={3}
                      style={{ ...inputStyle, width: '100%', resize: 'vertical', lineHeight: 1.4, marginBottom: 8 }}
                    />
                    {iaLoading && <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 8 }}>Leyendo…</div>}
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
                          onClick={handleIaImportTexto}
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
                      // La key incluye los campos editables (no solo el id): son inputs
                      // `defaultValue` (no controlados) para que tipear no dispare un
                      // request por tecla. Sin esto, un valor que cambia desde afuera
                      // (el auto-link de costo tras completar con IA, por ejemplo) no
                      // se veía reflejado — React no vuelve a leer `defaultValue` en
                      // un nodo que ya montó, así que forzar el remount es la señal.
                      <div key={`${ing.id}:${ing.nombre}:${ing.cantidad}:${ing.unidad}:${ing.costo_unitario}`} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
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

                  {/* Agregar ingrediente — el nombre busca en stock + recetas a medida
                      que se tipea, para vincular el food cost real desde el vamos en
                      vez de depender del auto-link por nombre exacto de después. */}
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 5, padding: '8px 0 0' }}>
                    <input
                      value={nuevoIng.nombre}
                      onChange={e => {
                        const nombre = e.target.value
                        // Tipear después de elegir una sugerencia desvincula esa
                        // elección — si no, se guardaría el producto/receta viejo
                        // con un nombre que ya no le corresponde.
                        setNuevoIng(v => ({ ...v, nombre, tipo: 'producto', productoId: undefined, subrecetaId: undefined }))
                        buscarSugerenciasIng(nombre)
                      }}
                      onFocus={() => { if (nuevoIng.nombre.trim()) buscarSugerenciasIng(nuevoIng.nombre) }}
                      onBlur={() => setTimeout(() => setShowSugIng(false), 150)}
                      onKeyDown={e => { if (e.key === 'Enter') { setShowSugIng(false); handleAddIngrediente() } }}
                      placeholder="Nuevo ingrediente o receta…"
                      style={{ ...inputStyle, flex: 1, minWidth: 0, borderStyle: 'dashed' }}
                    />
                    {showSugIng && sugerenciasIng.length > 0 && (
                      <div style={{
                        position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 5,
                        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
                        boxShadow: '0 4px 12px rgba(0,0,0,.12)', maxHeight: 160, overflowY: 'auto',
                      }}>
                        {sugerenciasIng.map((s, i) => (
                          <button
                            key={i}
                            onMouseDown={e => { e.preventDefault(); seleccionarSugerenciaIng(s) }}
                            onTouchStart={e => { e.preventDefault(); seleccionarSugerenciaIng(s) }}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '7px 10px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: 13, color: s.tipo === 'subreceta' ? 'var(--accent)' : 'var(--text-3)' }}>
                              {s.tipo === 'subreceta' ? 'menu_book' : 'inventory_2'}
                            </span>
                            <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--text-1)' }}>{s.nombre}</span>
                            <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{s.detalle}</span>
                          </button>
                        ))}
                      </div>
                    )}
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
