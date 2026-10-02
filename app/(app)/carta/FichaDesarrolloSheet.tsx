'use client'

// Ficha de un plato en desarrollo (PLAN-DESARROLLO-PLATOS-2026-10 § 5).
// Calca el boceto del chef: nombre, descripción (la idea), componentes —cada
// producción por separado— con ingrediente | cantidad | procedimiento, y las
// preguntas abiertas. Lo que sugirió la IA se marca con la marca única de IA
// (`IAIcon` + tinte del acento, components/ui/IA.tsx) y se confirma con un
// toque; editarlo también lo confirma. Autosave: es un documento, no un form.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Modal, IAIcon, iaTinte, Num } from '@/components/ui'
import PhotoPicker from '@/components/ui/PhotoPicker'
import type {
  ComponenteDesarrollo, EstadoPlatoDesarrollo, FichaDesarrollo, IngredienteDesarrollo,
  PasoDesarrollo, PlatoDesarrollo,
} from '@/types'
import {
  componenteVacio, datosSinConfirmar, ingredienteVacio, nuevoId, preguntasAbiertas,
} from '@/lib/carta/desarrollo'
import type { CambiosPlatoDesarrollo } from '@/lib/hooks/usePlatosDesarrollo'

const ESTADO_LABEL: Record<EstadoPlatoDesarrollo, string> = {
  idea: 'Idea', prueba: 'En prueba', aprobado: 'Aprobado', descartado: 'Descartado',
}

const inputBase: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 10,
  border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)',
  fontSize: 14, fontFamily: 'inherit', outline: 'none',
}

// ── Piezas a nivel de módulo (hooks.md: nunca componentes dentro de componentes) ──

/** Envuelve un dato sugerido por la IA: tinte + marca, y un toque lo confirma. */
function MarcaIA({ activa, onConfirmar, children }: { activa: boolean; onConfirmar: () => void; children: React.ReactNode }) {
  if (!activa) return <>{children}</>
  return (
    <div style={{ position: 'relative', background: iaTinte(10), borderRadius: 10 }}>
      {children}
      <button
        type="button" onClick={onConfirmar} title="Sugerido por la IA — tocá para confirmar"
        style={{ position: 'absolute', top: -7, right: -7, width: 22, height: 22, borderRadius: 99, border: '1px solid var(--border)',
          background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}
      >
        <IAIcon size={13} />
      </button>
    </div>
  )
}

function Etiqueta({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>{children}</div>
}

function BotonTexto({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer',
      color: 'var(--navy-ink)', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', padding: '6px 2px', minHeight: 32,
    }}>
      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{icon}</span>{label}
    </button>
  )
}

function parseNumero(v: string): number | null {
  const n = parseFloat(v.replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

function FilaIngrediente({ ing, nombreReceta, onChange, onQuitar }: {
  ing: IngredienteDesarrollo
  nombreReceta: (id: string) => string | undefined
  onChange: (i: IngredienteDesarrollo) => void
  onQuitar: () => void
}) {
  const vinculo = ing.receta_id ? nombreReceta(ing.receta_id) : undefined
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 80px 52px 28px', gap: 6, alignItems: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
        {ing.receta_id && (
          <span className="material-symbols-outlined" title={vinculo ? `Receta existente: ${vinculo}` : 'Vinculado a una receta existente'}
            style={{ fontSize: 18, color: 'var(--green-fg)', flexShrink: 0 }}>menu_book</span>
        )}
        <input value={ing.nombre} placeholder="Ingrediente" onChange={e => onChange({ ...ing, nombre: e.target.value })} style={inputBase} />
      </div>
      <MarcaIA activa={ing.cantidad_origen === 'ia'} onConfirmar={() => onChange({ ...ing, cantidad_origen: 'chef' })}>
        <input
          inputMode="decimal" onFocus={e => e.currentTarget.select()}
          value={ing.cantidad ?? ''} placeholder={ing.texto_cantidad ?? 'Cant.'}
          onChange={e => {
            const n = parseNumero(e.target.value)
            onChange({ ...ing, cantidad: n, cantidad_origen: n === null ? null : 'chef', aprox: n === null && !!ing.texto_cantidad, unidad: n === null ? null : (ing.unidad ?? 'g') })
          }}
          style={{ ...inputBase, textAlign: 'right', fontStyle: ing.aprox && ing.cantidad === null ? 'italic' : 'normal' }}
        />
      </MarcaIA>
      <input value={ing.unidad ?? ''} placeholder="u." disabled={ing.cantidad === null}
        onChange={e => onChange({ ...ing, unidad: e.target.value.trim() || null })} style={{ ...inputBase, padding: '8px 6px' }} />
      <button type="button" onClick={onQuitar} title="Quitar ingrediente" aria-label="Quitar ingrediente"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 0, display: 'flex' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
      </button>
    </div>
  )
}

function FilaPaso({ paso, indice, onChange, onQuitar }: {
  paso: PasoDesarrollo; indice: number; onChange: (p: PasoDesarrollo) => void; onQuitar: () => void
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '18px minmax(0,1fr) 28px', gap: 6, alignItems: 'start' }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', paddingTop: 9 }}><Num>{indice + 1}</Num></span>
      <MarcaIA activa={paso.origen === 'ia'} onConfirmar={() => onChange({ ...paso, origen: 'chef' })}>
        <textarea
          value={paso.texto} rows={2}
          onChange={e => onChange({ texto: e.target.value, origen: 'chef' })}
          style={{ ...inputBase, resize: 'vertical', lineHeight: 1.4 }}
        />
      </MarcaIA>
      <button type="button" onClick={onQuitar} title="Quitar paso" aria-label="Quitar paso"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: '8px 0 0', display: 'flex' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
      </button>
    </div>
  )
}

function BloqueComponente({ comp, nombreReceta, onChange, onQuitar }: {
  comp: ComponenteDesarrollo
  nombreReceta: (id: string) => string | undefined
  onChange: (c: ComponenteDesarrollo) => void
  onQuitar: () => void
}) {
  const vinculo = comp.receta_id ? nombreReceta(comp.receta_id) : undefined
  return (
    <section style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', boxShadow: 'var(--shadow-1)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
        <MarcaIA activa={comp.origen === 'ia'} onConfirmar={() => onChange({ ...comp, origen: 'chef' })}>
          <input value={comp.nombre} placeholder="Nombre del componente"
            onChange={e => onChange({ ...comp, nombre: e.target.value, origen: 'chef' })}
            style={{ ...inputBase, fontWeight: 700, minWidth: 180 }} />
        </MarcaIA>
        {comp.receta_id && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: 'var(--green-bg)', color: 'var(--green-fg)', whiteSpace: 'nowrap' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>menu_book</span>
            {vinculo ? `Receta: ${vinculo}` : 'Receta existente'}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <button type="button" onClick={onQuitar} title="Quitar componente" aria-label="Quitar componente"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 0, display: 'flex' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>delete</span>
        </button>
      </div>

      {/* Ingredientes | cantidad  +  procedimiento — como el boceto. Se parte por ancho del contenedor (auto-fit), no por viewport. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 14, padding: 12 }}>
        <div>
          <Etiqueta>Ingredientes · cantidad</Etiqueta>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {comp.ingredientes.map((ing, i) => (
              <FilaIngrediente key={i} ing={ing} nombreReceta={nombreReceta}
                onChange={nuevo => onChange({ ...comp, ingredientes: comp.ingredientes.map((x, j) => j === i ? nuevo : x) })}
                onQuitar={() => onChange({ ...comp, ingredientes: comp.ingredientes.filter((_, j) => j !== i) })} />
            ))}
          </div>
          <BotonTexto icon="add" label="Ingrediente" onClick={() => onChange({ ...comp, ingredientes: [...comp.ingredientes, ingredienteVacio()] })} />
        </div>
        <div>
          <Etiqueta>Procedimiento</Etiqueta>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {comp.procedimiento.map((p, i) => (
              <FilaPaso key={i} paso={p} indice={i}
                onChange={nuevo => onChange({ ...comp, procedimiento: comp.procedimiento.map((x, j) => j === i ? nuevo : x) })}
                onQuitar={() => onChange({ ...comp, procedimiento: comp.procedimiento.filter((_, j) => j !== i) })} />
            ))}
          </div>
          <BotonTexto icon="add" label="Paso" onClick={() => onChange({ ...comp, procedimiento: [...comp.procedimiento, { texto: '', origen: 'chef' }] })} />
        </div>
      </div>

      <div style={{ padding: '0 12px 12px' }}>
        <Etiqueta>Despacho</Etiqueta>
        <input value={comp.nota_despacho ?? ''} placeholder="Cómo se termina o se sirve este componente (opcional)"
          onChange={e => onChange({ ...comp, nota_despacho: e.target.value || null })} style={inputBase} />
      </div>
    </section>
  )
}

// ── La ficha ─────────────────────────────────────────────────────────────

const AUTOSAVE_MS = 800

export default function FichaDesarrolloSheet({
  plato, nombreReceta, onClose, onGuardar, onEstado, onEliminar,
}: {
  plato: PlatoDesarrollo
  nombreReceta: (id: string) => string | undefined
  onClose: () => void
  onGuardar: (cambios: CambiosPlatoDesarrollo) => Promise<void>
  onEstado: (estado: EstadoPlatoDesarrollo) => void
  onEliminar: () => void
}) {
  const [nombre, setNombre] = useState(plato.nombre)
  const [descripcion, setDescripcion] = useState(plato.descripcion ?? '')
  const [ficha, setFicha] = useState<FichaDesarrollo>(plato.ficha)
  const [nuevaPregunta, setNuevaPregunta] = useState('')

  // Autosave con flush: un `reload()` o cerrar la hoja a los 300 ms no puede perder lo tipeado (hooks.md #25).
  const pendiente = useRef<CambiosPlatoDesarrollo | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const guardarRef = useRef(onGuardar)
  useEffect(() => { guardarRef.current = onGuardar }, [onGuardar])

  const flush = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    const cambios = pendiente.current
    pendiente.current = null
    if (cambios) void guardarRef.current(cambios)
  }, [])

  const programar = useCallback((cambios: CambiosPlatoDesarrollo) => {
    pendiente.current = { ...pendiente.current, ...cambios }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(flush, AUTOSAVE_MS)
  }, [flush])

  useEffect(() => {
    const alOcultar = () => { if (document.visibilityState === 'hidden') flush() }
    document.addEventListener('visibilitychange', alOcultar)
    window.addEventListener('beforeunload', flush)
    return () => {
      document.removeEventListener('visibilitychange', alOcultar)
      window.removeEventListener('beforeunload', flush)
      flush()
    }
  }, [flush])

  function cambiarFicha(f: FichaDesarrollo) { setFicha(f); programar({ ficha: f }) }
  function cambiarComponente(i: number, c: ComponenteDesarrollo) {
    cambiarFicha({ ...ficha, componentes: ficha.componentes.map((x, j) => j === i ? c : x) })
  }

  const abiertas = preguntasAbiertas(ficha)
  const sinConfirmar = datosSinConfirmar(ficha)

  return (
    <Modal open onClose={() => { flush(); onClose() }} maxWidth={920}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 16 }}>
        {/* Cabecera */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <PhotoPicker currentUrl={plato.foto_url} path={`desarrollo/${plato.id}`} size={72}
            onUploaded={url => { void onGuardar({ foto_url: url }) }} onRemoved={() => { void onGuardar({ foto_url: null }) }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <input value={nombre} placeholder="Nombre del plato"
              onChange={e => { setNombre(e.target.value); programar({ nombre: e.target.value }) }}
              style={{ ...inputBase, fontSize: 18, fontWeight: 700, border: 'none', padding: '4px 0', background: 'transparent' }} />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 99, background: 'var(--blue-bg)', color: 'var(--blue-fg)' }}>
                {ESTADO_LABEL[plato.estado]}
              </span>
              {abiertas > 0 && (
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: 'var(--bg)', color: 'var(--text-2)' }}>
                  {abiertas} {abiertas === 1 ? 'pregunta abierta' : 'preguntas abiertas'}
                </span>
              )}
              {sinConfirmar > 0 && (
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: iaTinte(12), color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <IAIcon size={12} /> {sinConfirmar} sin confirmar
                </span>
              )}
            </div>
          </div>
          <button type="button" onClick={() => { flush(); onClose() }} aria-label="Cerrar"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', padding: 4, display: 'flex' }}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* La idea */}
        <div>
          <Etiqueta>La idea del plato</Etiqueta>
          <textarea value={descripcion} rows={2} placeholder="De qué se trata este plato"
            onChange={e => { setDescripcion(e.target.value); programar({ descripcion: e.target.value || null }) }}
            style={{ ...inputBase, resize: 'vertical', lineHeight: 1.4 }} />
        </div>

        {/* Preguntas abiertas: la lista de trabajo de la prueba */}
        <div>
          <Etiqueta>Para definir en la prueba</Etiqueta>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {ficha.preguntas.map((q, i) => (
              <label key={q.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer', minHeight: 32, padding: '4px 0' }}>
                <input type="checkbox" checked={q.resuelta} style={{ marginTop: 3 }}
                  onChange={e => cambiarFicha({ ...ficha, preguntas: ficha.preguntas.map((x, j) => j === i ? { ...x, resuelta: e.target.checked } : x) })} />
                <span style={{ fontSize: 13, lineHeight: 1.4, color: q.resuelta ? 'var(--text-3)' : 'var(--text)', textDecoration: q.resuelta ? 'line-through' : 'none' }}>
                  {q.texto}
                  {q.componente_id && (() => {
                    const c = ficha.componentes.find(x => x.id === q.componente_id)
                    return c ? <span style={{ color: 'var(--text-3)' }}> · {c.nombre}</span> : null
                  })()}
                </span>
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <input value={nuevaPregunta} placeholder="Agregar una duda" style={inputBase}
              onChange={e => setNuevaPregunta(e.target.value)}
              onKeyDown={e => {
                if (e.key !== 'Enter' || !nuevaPregunta.trim()) return
                cambiarFicha({ ...ficha, preguntas: [...ficha.preguntas, { id: nuevoId('preg'), texto: nuevaPregunta.trim(), componente_id: null, resuelta: false }] })
                setNuevaPregunta('')
              }} />
          </div>
        </div>

        {/* Componentes */}
        <div>
          <Etiqueta>Componentes · cada producción por separado</Etiqueta>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {ficha.componentes.map((c, i) => (
              <BloqueComponente key={c.id} comp={c} nombreReceta={nombreReceta}
                onChange={nuevo => cambiarComponente(i, nuevo)}
                onQuitar={() => cambiarFicha({ ...ficha, componentes: ficha.componentes.filter((_, j) => j !== i) })} />
            ))}
          </div>
          <BotonTexto icon="add" label="Componente" onClick={() => cambiarFicha({ ...ficha, componentes: [...ficha.componentes, componenteVacio()] })} />
        </div>

        {/* Armado */}
        <div>
          <Etiqueta>Armado del plato</Etiqueta>
          <MarcaIA activa={ficha.armado?.origen === 'ia'} onConfirmar={() => cambiarFicha({ ...ficha, armado: ficha.armado && { ...ficha.armado, origen: 'chef' } })}>
            <textarea value={ficha.armado?.texto ?? ''} rows={2} placeholder="Cómo se arma y se sirve (opcional)"
              onChange={e => cambiarFicha({ ...ficha, armado: e.target.value ? { texto: e.target.value, origen: 'chef' } : null })}
              style={{ ...inputBase, resize: 'vertical', lineHeight: 1.4 }} />
          </MarcaIA>
        </div>

        {/* Lo que escribió el chef, literal */}
        {plato.texto_origen && (
          <details>
            <summary style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', cursor: 'pointer', padding: '6px 0' }}>Lo que escribiste</summary>
            <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 13, lineHeight: 1.5, color: 'var(--text-2)', background: 'var(--bg)', borderRadius: 10, padding: 12, margin: '6px 0 0' }}>
              {plato.texto_origen}
            </pre>
          </details>
        )}

        {/* Acciones */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <button type="button" onClick={onEliminar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', minHeight: 44 }}>
            Eliminar
          </button>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {plato.estado !== 'descartado' && (
              <button type="button" onClick={() => onEstado('descartado')} style={{ minHeight: 44, padding: '0 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
                Descartar
              </button>
            )}
            {plato.estado === 'idea' && (
              <button type="button" onClick={() => onEstado('prueba')} style={{ minHeight: 44, padding: '0 18px', borderRadius: 10, border: 'none', background: 'var(--navy)', color: '#fff', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
                Pasar a prueba
              </button>
            )}
            {(plato.estado === 'prueba' || plato.estado === 'descartado') && (
              <button type="button" onClick={() => onEstado('idea')} style={{ minHeight: 44, padding: '0 18px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
                Volver a idea
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}
