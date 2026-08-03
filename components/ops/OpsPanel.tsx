'use client'

import { useEffect, useId, useMemo, useState } from 'react'
import { PLAZAS_OPS, SECCIONES_OPS } from '@/lib/ops/mise'
import { useRestauranteId } from '@/lib/hooks/useRestauranteId'
import { usePlazasCustom } from '@/lib/hooks/usePlazasCustom'
import { createClient } from '@/lib/supabase/client'

// ════════════════════════════════════════════════════════════
// OPS PANEL — panel único de asignación a OPS / mise.
// Campos: plaza → sección del mise → recipiente → cantidad+unidad →
// tamaño por porción (con cálculo de porciones auto).
// Fuente única reutilizada por: RecetaOpsSheet (ficha del recetario),
// PlatoRecetasEditor (carta → plato) y — desde Tanda C — el ítem de
// composición de menú/evento. NO duplicar esta UI en ningún otro lado.
// ════════════════════════════════════════════════════════════

export const UNIDADES_OPS = ['u', 'kg', 'g', 'l', 'ml', 'pax', 'porc', 'bandeja']
export const UNIDADES_PORCION = ['g', 'kg', 'u', 'porc', 'ml', 'l']

const toG = (v: number, u: string) => (u === 'kg' ? v * 1000 : u === 'g' ? v : null)

// Valor inicial para prefill (el caller mapea desde su fuente: checklist_items,
// PlatoItem, CompItemOut, etc.). `seccion` es el id de SECCIONES_OPS.
export interface OpsInitial {
  plaza?: string | null
  seccion?: string | null
  recipienteNombre?: string | null
  recipienteCantidad?: number | null
  cantidad?: number | null
  unidad?: string | null
  pesoPorcion?: number | null
  pesoPorcionUnidad?: string | null
}

// Resultado normalizado que emite el panel al guardar.
export interface OpsResult {
  plaza: string
  seccion: string // id de SECCIONES_OPS
  cantidad: number // porciones finales — ya multiplicadas por recipienteCantidad si hay recipiente
  unidad: string
  recipienteNombre: string | null
  recipienteCantidad: number // cuántos recipientes iguales hay que mantener (1 si no hay recipiente)
  pesoPorcion: number | null
  pesoPorcionUnidad: string | null
}

const secTitle: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }
const secHint: React.CSSProperties = { fontSize: 11, color: 'var(--text-3)', marginTop: -4, marginBottom: 8 }

export default function OpsPanel({
  initial, hasExisting, saving, defaultUnidad = 'porc', recipienteSugerencias = [], onSave, onRemove, onCancel,
}: {
  initial?: OpsInitial
  hasExisting?: boolean
  saving?: boolean
  defaultUnidad?: string
  recipienteSugerencias?: string[]
  onSave: (result: OpsResult) => void
  onRemove?: () => void
  onCancel?: () => void
}) {
  const recipienteListId = useId()
  const [plaza, setPlaza] = useState(initial?.plaza ?? '')
  const [seccion, setSeccion] = useState(initial?.seccion ?? '')
  const [recipiente, setRecipiente] = useState(initial?.recipienteNombre ?? '')
  const [recipienteCantidad, setRecipienteCantidad] = useState(initial?.recipienteCantidad ?? 1)
  const [cantidad, setCantidad] = useState(initial?.cantidad != null ? String(initial.cantidad) : '')
  const [unidad, setUnidad] = useState(initial?.unidad ?? defaultUnidad)
  const [pesoPorcion, setPesoPorcion] = useState(initial?.pesoPorcion != null ? String(initial.pesoPorcion) : '')
  const [pesoPorcionUnidad, setPesoPorcionUnidad] = useState(initial?.pesoPorcionUnidad ?? 'g')

  // ── Secciones del mise de la plaza elegida (Sesión 2, B2) — checklist_secciones
  // reales de esa plaza + las 4 default (SECCIONES_OPS) como fallback "virtual"
  // cuando la plaza todavía no tiene ninguna sección propia con ese nombre.
  const RESTAURANTE_ID = useRestauranteId()
  const supabase = useMemo(() => createClient(), [])
  const { plazasCustom } = usePlazasCustom()
  const plazasDisponibles = useMemo(
    () => [...PLAZAS_OPS, ...plazasCustom.map(c => ({ id: c.key, label: c.nombre, color: c.color }))],
    [plazasCustom]
  )
  const [seccionesDb, setSeccionesDb] = useState<{ id: string; nombre: string; icono: string; orden: number; parent_id: string | null }[]>([])
  const [nuevaSeccionMode, setNuevaSeccionMode] = useState(false)
  const [nuevaSeccionNombre, setNuevaSeccionNombre] = useState('')
  const [creandoSeccion, setCreandoSeccion] = useState(false)
  // Sub-sección (jul 2026) — segundo nivel opcional, solo 1 de profundidad
  const [nuevaSubseccionMode, setNuevaSubseccionMode] = useState(false)
  const [nuevaSubseccionNombre, setNuevaSubseccionNombre] = useState('')
  const [creandoSubseccion, setCreandoSubseccion] = useState(false)

  useEffect(() => {
    if (!plaza || !RESTAURANTE_ID) { setSeccionesDb([]); return }
    let cancelled = false
    supabase.from('checklist_secciones').select('id, nombre, icono, orden, parent_id')
      .eq('restaurante_id', RESTAURANTE_ID).eq('plaza', plaza).order('orden', { ascending: true })
      .then(({ data }) => { if (!cancelled) setSeccionesDb(data ?? []) })
    return () => { cancelled = true }
  }, [plaza, RESTAURANTE_ID, supabase])

  const seccionesDisponibles = useMemo(() => {
    const raices = seccionesDb.filter(s => !s.parent_id)
    const dbNombres = new Set(raices.map(s => s.nombre.trim().toLowerCase()))
    const virtuales = SECCIONES_OPS.filter(s => !dbNombres.has(s.label.trim().toLowerCase()))
    return [
      ...raices.map(s => ({ id: s.id, label: s.nombre, icono: s.icono })),
      ...virtuales.map(s => ({ id: s.id, label: s.label, icono: s.icono })),
    ]
  }, [seccionesDb])

  // Si `seccion` ya es una subsección (el usuario la eligió), su raíz es su
  // parent_id; si `seccion` es en sí una raíz (real o virtual), es ella misma.
  const raizActualId = useMemo(() => {
    const row = seccionesDb.find(s => s.id === seccion)
    return row?.parent_id ?? seccion
  }, [seccionesDb, seccion])
  const raizActualLabel = useMemo(
    () => seccionesDisponibles.find(s => s.id === raizActualId)?.label ?? '',
    [seccionesDisponibles, raizActualId]
  )
  const subseccionesDisponibles = useMemo(
    () => seccionesDb.filter(s => s.parent_id === raizActualId),
    [seccionesDb, raizActualId]
  )

  async function handleCrearSeccion() {
    const nombre = nuevaSeccionNombre.trim()
    if (!nombre || !RESTAURANTE_ID || !plaza) return
    setCreandoSeccion(true)
    try {
      const orden = seccionesDb.filter(s => !s.parent_id).length
      const { data } = await supabase.from('checklist_secciones')
        .insert({ nombre, icono: 'inventory_2', plaza, orden, restaurante_id: RESTAURANTE_ID })
        .select('id, nombre, icono, orden, parent_id').single()
      if (data) {
        setSeccionesDb(prev => [...prev, data])
        setSeccion(data.id)
      }
      setNuevaSeccionMode(false)
      setNuevaSeccionNombre('')
    } finally {
      setCreandoSeccion(false)
    }
  }

  // Crea una sub-sección bajo la raíz elegida. Si la raíz elegida es todavía
  // una de las 4 virtuales de SECCIONES_OPS (sin fila real en DB), la
  // materializa primero para tener un parent_id real.
  async function handleCrearSubseccion() {
    const nombreHijo = nuevaSubseccionNombre.trim()
    if (!nombreHijo || !RESTAURANTE_ID || !plaza || !raizActualId) return
    setCreandoSubseccion(true)
    try {
      let parentId = raizActualId
      if (!seccionesDb.some(s => s.id === raizActualId)) {
        const virtual = SECCIONES_OPS.find(s => s.id === raizActualId)
        const orden = seccionesDb.filter(s => !s.parent_id).length
        const { data: rootData } = await supabase.from('checklist_secciones')
          .insert({ nombre: virtual?.label ?? raizActualId, icono: virtual?.icono ?? 'inventory_2', plaza, orden, restaurante_id: RESTAURANTE_ID })
          .select('id, nombre, icono, orden, parent_id').single()
        if (!rootData) return
        setSeccionesDb(prev => [...prev, rootData])
        parentId = rootData.id
        setSeccion(parentId)
      }
      const ordenHijo = seccionesDb.filter(s => s.parent_id === parentId).length
      const { data: hijoData } = await supabase.from('checklist_secciones')
        .insert({ nombre: nombreHijo, icono: 'inventory_2', plaza, orden: ordenHijo, parent_id: parentId, restaurante_id: RESTAURANTE_ID })
        .select('id, nombre, icono, orden, parent_id').single()
      if (hijoData) {
        setSeccionesDb(prev => [...prev, hijoData])
        setSeccion(hijoData.id)
      }
      setNuevaSubseccionMode(false)
      setNuevaSubseccionNombre('')
    } finally {
      setCreandoSubseccion(false)
    }
  }

  const capVal = parseFloat(cantidad) || 0
  const porVal = parseFloat(pesoPorcion) || 0
  const capG = toG(capVal, unidad)
  const porG = toG(porVal, pesoPorcionUnidad)
  const porcionesAuto = capG !== null && porG !== null && porG > 0 ? Math.round(capG / porG) : null

  function handleSave() {
    if (!plaza || !seccion) return
    const recipNombre = recipiente.trim() || null
    const pesoP = recipNombre && pesoPorcion ? parseFloat(pesoPorcion) || null : null
    const pesoPUnidad = pesoP ? pesoPorcionUnidad : null
    const recipCantidad = recipNombre ? Math.max(1, recipienteCantidad) : 1
    // Si la unidad es de porciones/unidades usamos el valor directo;
    // si es peso y hay tamaño de porción, guardamos las porciones calculadas.
    // "cantidad"/"cantidad" de acá es SIEMPRE por UN recipiente lleno — el
    // total a mantener multiplica por la cantidad de recipientes iguales.
    const cantidadPorRecipiente = ['porc', 'u', 'pax'].includes(unidad) ? capVal : (porcionesAuto ?? capVal)
    const cantidadFinal = cantidadPorRecipiente * recipCantidad
    onSave({ plaza, seccion, cantidad: cantidadFinal, unidad, recipienteNombre: recipNombre, recipienteCantidad: recipCantidad, pesoPorcion: pesoP, pesoPorcionUnidad: pesoPUnidad })
  }

  const valido = !!plaza && !!seccion

  return (
    <div>
      {/* Plaza */}
      <div style={secTitle}>Plaza de producción</div>
      <div style={secHint}>Elegí dónde se cocina esta receta.</div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 14 }}>
        {plazasDisponibles.map(p => (
          <button key={p.id} onClick={() => { setPlaza(plaza === p.id ? '' : p.id); setSeccion(''); setNuevaSeccionMode(false); setNuevaSeccionNombre(''); setNuevaSubseccionMode(false); setNuevaSubseccionNombre('') }}
            style={{ padding: '6px 12px', borderRadius: 99, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
              background: plaza === p.id ? `${p.color}18` : 'var(--bg)',
              color: plaza === p.id ? p.color : 'var(--text-3)',
              outline: plaza === p.id ? `1.5px solid ${p.color}50` : '1px solid var(--border)' }}>
            {p.label}
          </button>
        ))}
      </div>

      {plaza && (
        <>
          {/* Sección del mise */}
          <div style={secTitle}>Sección del mise</div>
          <div style={secHint}>¿En qué parte del mise se guarda? (heladera, secos, congelados…)</div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: nuevaSeccionMode ? 8 : 14, alignItems: 'center' }}>
            {seccionesDisponibles.map(s => (
              <button key={s.id} onClick={() => { setSeccion(seccion === s.id ? '' : s.id); setNuevaSubseccionMode(false); setNuevaSubseccionNombre('') }}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 99, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
                  background: seccion === s.id ? 'rgba(67,97,160,.12)' : 'var(--bg)',
                  color: seccion === s.id ? 'var(--accent)' : 'var(--text-3)',
                  outline: seccion === s.id ? '1.5px solid rgba(67,97,160,.3)' : '1px solid var(--border)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{s.icono}</span>
                {s.label}
              </button>
            ))}
            {!nuevaSeccionMode && (
              <button onClick={() => setNuevaSeccionMode(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 99, border: '1px dashed var(--border)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, background: 'none', color: 'var(--text-3)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span>
                Nueva sección
              </button>
            )}
          </div>
          {nuevaSeccionMode && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 14, alignItems: 'center' }}>
              <input
                autoFocus type="text" value={nuevaSeccionNombre}
                onChange={e => setNuevaSeccionNombre(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCrearSeccion(); if (e.key === 'Escape') { setNuevaSeccionMode(false); setNuevaSeccionNombre('') } }}
                placeholder="Nombre de la sección"
                style={{ flex: 1, padding: '8px 12px', borderRadius: 9, border: '1px solid var(--accent)', background: 'var(--bg)', fontSize: 13, fontFamily: 'inherit', outline: 'none', color: 'var(--text-1)' }}
              />
              <button onClick={handleCrearSeccion} disabled={creandoSeccion || !nuevaSeccionNombre.trim()}
                style={{ padding: '8px 12px', borderRadius: 9, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: nuevaSeccionNombre.trim() ? 1 : .5 }}>
                {creandoSeccion ? '…' : 'Crear'}
              </button>
              <button onClick={() => { setNuevaSeccionMode(false); setNuevaSeccionNombre('') }} aria-label="Cancelar"
                style={{ padding: '8px 10px', borderRadius: 9, border: '1px solid var(--border)', background: 'none', color: 'var(--text-3)', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
              </button>
            </div>
          )}

          {/* Sub-sección (opcional) — solo si hay una raíz elegida. Indentada +
              con borde izquierdo para que se lea como "hijo de la sección de
              arriba" y no como un segundo selector independiente. */}
          {seccion && (
            <div style={{ marginLeft: 10, paddingLeft: 10, borderLeft: '2px solid var(--border)', marginBottom: 14 }}>
              <div style={secTitle}>
                {raizActualLabel ? `Subsección de ${raizActualLabel} (opcional)` : 'Subsección (opcional)'}
              </div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: nuevaSubseccionMode ? 8 : 0, alignItems: 'center' }}>
                {subseccionesDisponibles.map(s => (
                  <button key={s.id} onClick={() => setSeccion(s.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 99, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
                      background: seccion === s.id ? 'rgba(67,97,160,.12)' : 'var(--bg)',
                      color: seccion === s.id ? 'var(--accent)' : 'var(--text-3)',
                      outline: seccion === s.id ? '1.5px solid rgba(67,97,160,.3)' : '1px solid var(--border)' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{s.icono}</span>
                    {s.nombre}
                  </button>
                ))}
                {!nuevaSubseccionMode && (
                  <button onClick={() => setNuevaSubseccionMode(true)}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 99, border: '1px dashed var(--border)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, background: 'none', color: 'var(--text-3)' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span>
                    Nueva subsección
                  </button>
                )}
              </div>
              {nuevaSubseccionMode && (
                <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' }}>
                  <input
                    autoFocus type="text" value={nuevaSubseccionNombre}
                    onChange={e => setNuevaSubseccionNombre(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleCrearSubseccion(); if (e.key === 'Escape') { setNuevaSubseccionMode(false); setNuevaSubseccionNombre('') } }}
                    placeholder="Nombre de la subsección"
                    style={{ flex: 1, padding: '8px 12px', borderRadius: 9, border: '1px solid var(--accent)', background: 'var(--bg)', fontSize: 13, fontFamily: 'inherit', outline: 'none', color: 'var(--text-1)' }}
                  />
                  <button onClick={handleCrearSubseccion} disabled={creandoSubseccion || !nuevaSubseccionNombre.trim()}
                    style={{ padding: '8px 12px', borderRadius: 9, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: nuevaSubseccionNombre.trim() ? 1 : .5 }}>
                    {creandoSubseccion ? '…' : 'Crear'}
                  </button>
                  <button onClick={() => { setNuevaSubseccionMode(false); setNuevaSubseccionNombre('') }} aria-label="Cancelar"
                    style={{ padding: '8px 10px', borderRadius: 9, border: '1px solid var(--border)', background: 'none', color: 'var(--text-3)', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Recipiente */}
          <div style={secTitle}>Recipiente (opcional)</div>
          <div style={secHint}>¿En qué se guarda? Si no usa uno fijo, dejalo en blanco.</div>
          <input type="text" value={recipiente} onChange={e => { setRecipiente(e.target.value); if (!e.target.value.trim()) { setPesoPorcion(''); setRecipienteCantidad(1) } }}
            list={recipienteSugerencias.length > 0 ? recipienteListId : undefined}
            placeholder="ej: tupper, cubeta GN, bandeja"
            style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, fontFamily: 'inherit', outline: 'none', color: 'var(--text-1)', boxSizing: 'border-box', marginBottom: recipiente.trim() ? 8 : 14 }} />
          {recipienteSugerencias.length > 0 && (
            <datalist id={recipienteListId}>
              {recipienteSugerencias.map(s => <option key={s} value={s} />)}
            </datalist>
          )}

          {/* Cuántos recipientes iguales hay que mantener — ej. 2 tuppers
              idénticos en heladeras distintas. Solo tiene sentido con
              recipiente definido; el total se multiplica por este número. */}
          {recipiente.trim() && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600 }}>¿Cuántos recipientes?</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button type="button" onClick={() => setRecipienteCantidad(n => Math.max(1, n - 1))}
                  style={{ width: 26, height: 26, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>remove</span>
                </button>
                <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-1)', minWidth: 16, textAlign: 'center' }}>{recipienteCantidad}</span>
                <button type="button" onClick={() => setRecipienteCantidad(n => n + 1)}
                  style={{ width: 26, height: 26, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
                </button>
              </div>
            </div>
          )}

          {/* Cantidad + unidad — SIEMPRE por UN recipiente lleno; el total
              que se guarda multiplica por "¿Cuántos recipientes?" de arriba. */}
          <div style={secTitle}>{recipiente.trim() ? 'Porciones/peso de UN recipiente lleno' : 'Cantidad en mise'}</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: recipienteCantidad > 1 && ['porc', 'u', 'pax'].includes(unidad) ? 4 : 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <input type="number" value={cantidad} onChange={e => setCantidad(e.target.value)} inputMode="decimal" placeholder="0"
              style={{ width: 74, padding: '9px 10px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 14, fontWeight: 700, textAlign: 'center', fontFamily: 'inherit', outline: 'none', color: 'var(--text-1)' }} />
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {UNIDADES_OPS.map(u => (
                <button key={u} onClick={() => setUnidad(u)}
                  style={{ padding: '7px 11px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
                    background: unidad === u ? 'var(--navy)' : 'var(--bg)', color: unidad === u ? '#fff' : 'var(--text-3)',
                    outline: unidad === u ? 'none' : '1px solid var(--border)' }}>
                  {u}
                </button>
              ))}
            </div>
          </div>
          {recipienteCantidad > 1 && ['porc', 'u', 'pax'].includes(unidad) && capVal > 0 && (
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', marginBottom: 14, paddingLeft: 2 }}>
              = {capVal * recipienteCantidad} {unidad} en total ({recipienteCantidad} recipientes)
            </div>
          )}

          {/* Tamaño por porción — solo con recipiente */}
          {recipiente.trim() && (
            <>
              <div style={secTitle}>Tamaño por porción</div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 4, flexWrap: 'wrap' }}>
                <input type="number" value={pesoPorcion} onChange={e => setPesoPorcion(e.target.value)} inputMode="decimal" placeholder="ej: 110"
                  style={{ width: 74, padding: '9px 10px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 14, fontWeight: 700, textAlign: 'center', fontFamily: 'inherit', outline: 'none', color: 'var(--text-1)' }} />
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {UNIDADES_PORCION.map(u => (
                    <button key={u} onClick={() => setPesoPorcionUnidad(u)}
                      style={{ padding: '7px 11px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
                        background: pesoPorcionUnidad === u ? 'var(--accent)' : 'var(--bg)', color: pesoPorcionUnidad === u ? '#fff' : 'var(--text-3)',
                        outline: pesoPorcionUnidad === u ? 'none' : '1px solid var(--border)' }}>
                      {u}
                    </button>
                  ))}
                </div>
              </div>
              {porcionesAuto !== null && cantidad && pesoPorcion ? (
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', marginBottom: 8, paddingLeft: 2 }}>
                  = {porcionesAuto} porciones por recipiente
                  {recipienteCantidad > 1 && ` · ${porcionesAuto * recipienteCantidad} porciones en total (${recipienteCantidad} recipientes)`}
                </div>
              ) : <div style={{ marginBottom: 8 }} />}
            </>
          )}
        </>
      )}

      {/* Acciones */}
      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        {hasExisting && onRemove && (
          <button onClick={onRemove} disabled={saving}
            style={{ padding: '12px 16px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg)', color: '#ef4444', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            Quitar
          </button>
        )}
        {onCancel && (
          <button onClick={onCancel} disabled={saving}
            style={{ padding: '12px 14px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-3)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Cancelar
          </button>
        )}
        <button onClick={handleSave} disabled={saving || !valido}
          style={{ flex: 1, padding: '12px', borderRadius: 12, border: 'none', background: valido ? 'var(--navy)' : 'var(--border)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: valido ? 'pointer' : 'default', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>
          {saving ? '…' : 'Guardar OPS'}
        </button>
      </div>
    </div>
  )
}
