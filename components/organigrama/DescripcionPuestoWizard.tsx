'use client'

// Cuestionario de 6 tandas para armar la descripción de puesto — Fase 1
// (PLAN-DESCRIPCION-PUESTO-2026-09.md § 4). Cada tanda guarda sola
// (`guardarBorrador`, upsert parcial) y se puede abandonar a mitad de camino;
// "Dejar vigente" al final de la tanda 6 es lo único que publica.
//
// Simplificaciones deliberadas de v1 contra el mockup completo del plan:
// - El dictado + "Pulir con IA" es un botón explícito, no un flujo automático
//   de confirmar/editar/volver a dictar — mismo resultado, menos estados.
// - La tanda 5 no extrae automáticamente los límites del relato del
//   incidente: el relato es solo para entrar en tema, y la lista cerrada de
//   no negociables aparece siempre debajo, no como resultado de IA sobre el
//   relato. Ver DESIGN — el relato nunca se guarda, ningún nombre propio
//   entra a `puesto_descripciones`.
// - Responsabilidades queda en un solo bloque ("Tareas diarias"), no en los
//   8 bloques temáticos del ejemplo real — el plan mismo (§ 5.2) describe
//   esto como el punto de partida, no el resultado final.

import { useState, useCallback, useMemo } from 'react'
import { Modal } from '@/components/ui'
import { useAuth } from '@/lib/auth/context'
import { useEquipo, type Puesto } from '@/lib/hooks/useEquipo'
import { useCompetencias } from '@/lib/hooks/useCompetencias'
import { useChecklist } from '@/lib/hooks/useChecklist'
import { useCartaDeLaCasa } from '@/lib/hooks/useCartaDeLaCasa'
import {
  usePuestoDescripcion, type IndicadorItem, type PuestoDescripcion,
} from '@/lib/hooks/usePuestoDescripcion'
import { fieldStyle, labelStyle, btnPrimary, btnSecondary } from './equipoShared'

export type Tanda = 1 | 2 | 3 | 4 | 5 | 6

const NO_NEGOCIABLES_SUGERIDOS = [
  'Avisar el faltante antes de que se corte',
  'La estación se entrega limpia, aunque se salga tarde',
  'Llegar tarde sin avisar',
  'El celular durante el servicio',
  'Usar mal la mercadería cara',
  'Tratar mal a un compañero',
]

const INDICADORES_DISPONIBLES: { nombre: string; modulo: string; metaPlaceholder: string }[] = [
  { nombre: 'Merma de la plaza', modulo: 'merma', metaPlaceholder: '< 3%' },
  { nombre: 'Food cost de los platos de la plaza', modulo: 'carta', metaPlaceholder: '< 30%' },
  { nombre: 'Mise completo antes de abrir', modulo: 'checklist', metaPlaceholder: '100%' },
  { nombre: 'Sin vencidos en su heladera', modulo: 'haccp', metaPlaceholder: '0' },
]

const MOMENTOS_DIA: { key: string; pregunta: string }[] = [
  { key: 'Durante el servicio', pregunta: '¿Qué hace entre que arranca y el pico de gente?' },
  { key: 'Pico de servicio', pregunta: '¿Y a full, con el local lleno?' },
  { key: 'Al cerrar', pregunta: '¿Cómo tiene que dejar la plaza antes de irse?' },
]

// ── Web Speech API — no está tipada en lib.dom para Safari/Firefox. Se
// declara el subconjunto que se usa y se detecta en runtime; sin soporte el
// botón de mic no aparece y el textarea sigue andando a mano. ──
interface SpeechRecognitionResultLike { results: { length: number; [i: number]: { [j: number]: { transcript: string } } } }
interface SpeechRecognitionErrorLike { error: string }
interface SpeechRecognitionLike extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  onresult: ((ev: SpeechRecognitionResultLike) => void) | null
  onerror: ((ev: SpeechRecognitionErrorLike) => void) | null
  onend: (() => void) | null
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike

function crearReconocedor(): SpeechRecognitionLike | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor }
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition
  if (!Ctor) return null
  const r = new Ctor()
  r.lang = 'es-AR'
  r.continuous = false
  r.interimResults = false
  return r
}

async function redactarConIA(campo: 'mision' | 'dia', crudo: string, puestoNombre: string, momento?: string): Promise<string> {
  const res = await fetch('/api/organigrama/redactar-descripcion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ campo, crudo, puestoNombre, momento }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? 'No se pudo redactar')
  return json.texto as string
}

// ── Campo de texto con dictado + "Pulir con IA" ──
function CampoDictado({
  value, onChange, placeholder, onPulir, puliendo,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  onPulir: () => void
  puliendo: boolean
}) {
  const [grabando, setGrabando] = useState(false)
  const [soportado] = useState(() => !!crearReconocedor())

  const toggleGrabar = useCallback(() => {
    if (grabando) { setGrabando(false); return }
    const r = crearReconocedor()
    if (!r) return
    r.onresult = ev => {
      const partes: string[] = []
      for (let i = 0; i < ev.results.length; i++) partes.push(ev.results[i][0].transcript)
      const texto = partes.join(' ')
      onChange(value ? `${value} ${texto}` : texto)
    }
    r.onerror = () => setGrabando(false)
    r.onend = () => setGrabando(false)
    setGrabando(true)
    r.start()
  }, [grabando, value, onChange])

  return (
    <div>
      <textarea
        style={{ ...fieldStyle, minHeight: 76, resize: 'vertical' }}
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        {soportado && (
          <button type="button" onClick={toggleGrabar} style={btnMic(grabando)}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{grabando ? 'stop_circle' : 'mic'}</span>
            {grabando ? 'Grabando… tocá para terminar' : 'Dictar'}
          </button>
        )}
        <button type="button" onClick={onPulir} disabled={puliendo || value.trim().length < 3} style={btnPulir(puliendo)}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>auto_fix_high</span>
          {puliendo ? 'Puliendo…' : 'Pulir con IA'}
        </button>
      </div>
    </div>
  )
}

function btnMic(active: boolean): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 20,
    border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
    background: active ? 'rgba(239,68,68,.14)' : 'rgba(67,97,160,.1)',
    color: active ? '#ef4444' : 'var(--accent)',
  }
}
function btnPulir(loading: boolean): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 20,
    border: 'none', cursor: loading ? 'default' : 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
    background: 'rgba(16,185,129,.12)', color: '#0a8f5f', opacity: loading ? 0.6 : 1,
  }
}

// ── Chips editables (expectativas / beneficios) ──
function ListaDeFrases({ items, onChange, placeholder }: { items: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [nueva, setNueva] = useState('')
  function agregar() {
    if (!nueva.trim()) return
    onChange([...items, nueva.trim()])
    setNueva('')
  }
  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
        {items.map((t, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 10, background: 'var(--bg)' }}>
            <span style={{ flex: 1, fontSize: 13, color: 'var(--text-1)' }}>{t}</span>
            <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-3)' }}>close</span>
            </button>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          style={{ ...fieldStyle, flex: 1 }} value={nueva} placeholder={placeholder}
          onChange={e => setNueva(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregar() } }}
        />
        <button type="button" onClick={agregar} style={{ ...btnSecondary, width: 'auto', padding: '10px 16px' }}>+</button>
      </div>
    </div>
  )
}

const qLabel: React.CSSProperties = {
  fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-3)',
}

interface DescripcionPuestoWizardProps {
  puesto: Puesto
  open: boolean
  onClose: () => void
  onToast: (msg: string) => void
  /** Tanda con la que arranca el cuestionario — el lápiz de cada sección de
   *  la Ficha del puesto abre directo en la tanda que corresponde. Default 1. */
  tandaInicial?: Tanda
}

export function DescripcionPuestoWizard({ puesto, open, onClose, onToast, tandaInicial }: DescripcionPuestoWizardProps) {
  return (
    <Modal open={open} onClose={onClose} maxWidth={640}>
      {open && <WizardBody puesto={puesto} onClose={onClose} onToast={onToast} tandaInicial={tandaInicial} />}
    </Modal>
  )
}

// Cuerpo separado del wrapper para que se desmonte al cerrar — así cada
// apertura arranca de nuevo desde la tanda 1 con los valores guardados
// frescos, en vez de arrastrar el estado local de la vez anterior.
function WizardBody({ puesto, onClose, onToast, tandaInicial }: { puesto: Puesto; onClose: () => void; onToast: (msg: string) => void; tandaInicial?: Tanda }) {
  const { perfil } = useAuth()
  const { puestos, areas, miembros } = useEquipo()
  const { referentesDePlaza } = useCompetencias()
  const { items: checklistItems } = useChecklist()
  const { carta: cartaDeLaCasa } = useCartaDeLaCasa()
  const { descripciones, descripcionDe, guardarBorrador, publicar } = usePuestoDescripcion()

  const existente = descripcionDe(puesto.id)
  // Modo rápido (plan § 10.1 A): a partir del segundo puesto, beneficios y
  // crecimiento se copian de otro puesto en vez de volver a dictarlos, y la
  // tanda del incidente se puede saltear — lo único de verdad nuevo por
  // puesto es misión, el día, responsabilidades e indicadores.
  const otraDescripcion = useMemo(
    () => descripciones.find(d => d.puesto_id !== puesto.id && (
      d.condiciones?.beneficios?.length || d.condiciones?.capacitacion || d.condiciones?.carrera
    )),
    [descripciones, puesto.id],
  )
  const modoRapido = !existente && !!otraDescripcion

  const [tanda, setTanda] = useState<Tanda>(tandaInicial ?? 1)
  const [saving, setSaving] = useState(false)
  const [puliendo, setPuliendo] = useState<string | null>(null)
  const [generandoBorrador, setGenerandoBorrador] = useState(false)

  // ── Tanda 2 — el día ──
  const [diaRaw, setDiaRaw] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {}
    for (const m of MOMENTOS_DIA) out[m.key] = existente?.dia_tipo.find(d => d.momento === m.key)?.que_hace ?? ''
    return out
  })

  // ── Tanda 3 — misión ──
  const [mision, setMision] = useState(existente?.mision ?? '')

  // ── Tanda 4 — responsabilidades ──
  const [tareas, setTareas] = useState<string[]>(() => {
    const bloque = existente?.responsabilidades.find(b => b.titulo === 'Tareas diarias')
    return bloque?.items ?? [...puesto.tareas_funciones]
  })
  const [tareaNueva, setTareaNueva] = useState('')

  // ── Tanda 5 — expectativas y límites ──
  const [expectativas, setExpectativas] = useState<string[]>(existente?.expectativas ?? [])
  const [relatoIncidente, setRelatoIncidente] = useState('')
  const [noNegociables, setNoNegociables] = useState<Set<string>>(new Set(existente?.no_negociables ?? []))
  const [otroLimite, setOtroLimite] = useState('')

  // ── Tanda 6 — indicadores y condiciones ──
  const [indicadoresActivos, setIndicadoresActivos] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {}
    for (const i of existente?.indicadores ?? []) out[i.nombre] = i.meta
    return out
  })
  const [beneficios, setBeneficios] = useState<string[]>(existente?.condiciones?.beneficios ?? otraDescripcion?.condiciones?.beneficios ?? [])
  const [capacitacion, setCapacitacion] = useState(existente?.condiciones?.capacitacion ?? otraDescripcion?.condiciones?.capacitacion ?? '')
  const [carrera, setCarrera] = useState(existente?.condiciones?.carrera ?? otraDescripcion?.condiciones?.carrera ?? '')

  const otroPuestoNombre = useMemo(
    () => puestos.find(p => p.id === otraDescripcion?.puesto_id)?.nombre,
    [puestos, otraDescripcion],
  )
  const areaDelPuesto = useMemo(() => areas.find(a => a.key === puesto.area_key), [areas, puesto.area_key])
  const padre = useMemo(() => puestos.find(p => p.id === puesto.reporta_a_puesto_id), [puestos, puesto.reporta_a_puesto_id])
  const ocupantes = useMemo(() => miembros.filter(m => m.puesto_id === puesto.id), [miembros, puesto.id])
  const referentesNombres = useMemo(() => {
    if (!puesto.plaza_default) return []
    return referentesDePlaza(puesto.plaza_default)
      .map(id => miembros.find(m => m.id === id))
      .filter((m): m is NonNullable<typeof m> => !!m)
      .map(m => `${m.nombre} ${m.apellido}`)
  }, [puesto.plaza_default, referentesDePlaza, miembros])
  const itemsDeLaPlaza = useMemo(
    () => (puesto.plaza_default ? checklistItems.filter(i => i.plaza === puesto.plaza_default).map(i => i.nombre) : []),
    [checklistItems, puesto.plaza_default],
  )

  async function pulir(campo: 'mision' | 'dia', crudo: string, momento: string | undefined, aplicar: (texto: string) => void) {
    setPuliendo(momento ?? campo)
    try {
      const texto = await redactarConIA(campo, crudo, puesto.nombre, momento)
      aplicar(texto)
    } catch (e: unknown) {
      onToast(e instanceof Error ? e.message : 'No se pudo pulir el texto')
    } finally {
      setPuliendo(null)
    }
  }

  // Fase 4, punto 2: borrador de tareas para un puesto sin plantilla — la
  // única parte de la función donde la IA inventa en vez de redactar (plan
  // § 8). Solo tiene sentido ofrecerlo cuando no hay nada sembrado.
  async function generarBorradorTareas() {
    setGenerandoBorrador(true)
    try {
      const res = await fetch('/api/organigrama/borrador-tareas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ puestoNombre: puesto.nombre, areaNombre: areaDelPuesto?.nombre, plaza: puesto.plaza_default }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'No se pudo generar el borrador')
      setTareas(json.tareas as string[])
    } catch (e: unknown) {
      onToast(e instanceof Error ? e.message : 'No se pudo generar el borrador')
    } finally {
      setGenerandoBorrador(false)
    }
  }

  async function avanzar(patch: Partial<PuestoDescripcion> | null, siguiente: Tanda | null) {
    setSaving(true)
    try {
      if (patch) await guardarBorrador(puesto.id, patch)
      if (siguiente) setTanda(siguiente)
    } catch (e: unknown) {
      onToast(e instanceof Error ? e.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  async function dejarVigente() {
    setSaving(true)
    try {
      const indicadores: IndicadorItem[] = Object.entries(indicadoresActivos)
        .filter(([, meta]) => meta.trim() !== '')
        .map(([nombre, meta]) => ({ nombre, meta, modulo: INDICADORES_DISPONIBLES.find(i => i.nombre === nombre)?.modulo ?? null }))
      await guardarBorrador(puesto.id, {
        indicadores,
        condiciones: { beneficios, capacitacion: capacitacion || undefined, carrera: carrera || undefined },
      })
      await publicar(puesto.id, perfil?.miembro_id ?? null)
      onToast(`Descripción de "${puesto.nombre}" vigente`)
      onClose()
    } catch (e: unknown) {
      onToast(e instanceof Error ? e.message : 'No se pudo dejar vigente')
    } finally {
      setSaving(false)
    }
  }

  const progreso = `Tanda ${tanda} de 6`

  return (
    <div style={{ padding: '20px 20px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--text-1)' }}>Descripción de puesto</h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--text-3)' }}>close</span>
        </button>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 0 18px' }}>{puesto.nombre} · {progreso}</p>

      {/* ── Tanda 1 · Identidad ── */}
      {tanda === 1 && (
        <div>
          <label style={qLabel}>1 · ¿Esto está bien?</label>
          <div style={{ marginTop: 10, padding: 14, borderRadius: 12, background: 'var(--bg)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Renglon label="Puesto" valor={puesto.nombre} />
            <Renglon label="Área" valor={areaDelPuesto?.nombre ?? 'Sin área asignada'} />
            <Renglon label="Reporta a" valor={padre?.nombre ?? 'Nadie — raíz del organigrama'} />
            <Renglon label="Plaza" valor={puesto.plaza_default ?? 'Rota entre plazas'} />
            <Renglon label="Lo ocupan hoy" valor={ocupantes.length ? ocupantes.map(m => `${m.nombre} ${m.apellido}`).join(', ') : 'Vacante'} />
            <Renglon label="A quién le preguntan" valor={referentesNombres.length ? referentesNombres.join(', ') : 'Nadie es referente todavía (matriz de polivalencia)'} />
          </div>
          {modoRapido && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, padding: '9px 12px', borderRadius: 10, background: 'rgba(16,185,129,.1)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#0a8f5f' }}>bolt</span>
              <span style={{ fontSize: 11.5, color: 'var(--text-1)', lineHeight: 1.4 }}>
                Vas más rápido: los beneficios se copian de {otroPuestoNombre ?? 'otro puesto'} y podés saltear el incidente. Solo falta lo de este puesto.
              </span>
            </div>
          )}
          <button onClick={() => setTanda(2)} style={{ ...btnPrimary, marginTop: 18 }}>Está bien →</button>
        </div>
      )}

      {/* ── Tanda 2 · El día ── */}
      {tanda === 2 && (
        <div>
          <label style={qLabel}>2 · El día</label>
          {itemsDeLaPlaza.length > 0 && (
            <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '6px 0 14px', lineHeight: 1.5 }}>
              Ya sabemos: {itemsDeLaPlaza.slice(0, 6).join(' · ')}{itemsDeLaPlaza.length > 6 ? '…' : ''}
            </p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 10 }}>
            {MOMENTOS_DIA.map(m => (
              <div key={m.key}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', marginBottom: 6 }}>{m.pregunta}</div>
                <CampoDictado
                  value={diaRaw[m.key] ?? ''}
                  onChange={v => setDiaRaw(prev => ({ ...prev, [m.key]: v }))}
                  placeholder="Contá o dictá qué pasa acá"
                  puliendo={puliendo === m.key}
                  onPulir={() => pulir('dia', diaRaw[m.key] ?? '', m.key, texto => setDiaRaw(prev => ({ ...prev, [m.key]: texto })))}
                />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <button onClick={() => setTanda(1)} style={btnSecondary}>Atrás</button>
            <button
              disabled={saving}
              onClick={() => avanzar({
                dia_tipo: MOMENTOS_DIA.filter(m => (diaRaw[m.key] ?? '').trim()).map(m => ({ momento: m.key, hora: null, que_hace: diaRaw[m.key].trim() })),
              }, 3)}
              style={btnPrimary}
            >
              Siguiente →
            </button>
          </div>
        </div>
      )}

      {/* ── Tanda 3 · Misión ── */}
      {tanda === 3 && (
        <div>
          <label style={qLabel}>3 · Si mañana no hubiera {puesto.nombre.toLowerCase()}, ¿qué es lo primero que explota acá adentro?</label>
          <div style={{ marginTop: 10 }}>
            <CampoDictado
              value={mision}
              onChange={setMision}
              placeholder="Contá o dictá la misión del puesto"
              puliendo={puliendo === 'mision'}
              onPulir={() => pulir('mision', mision, undefined, setMision)}
            />
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <button onClick={() => setTanda(2)} style={btnSecondary}>Atrás</button>
            <button disabled={saving} onClick={() => avanzar({ mision: mision.trim() || null }, 4)} style={btnPrimary}>Siguiente →</button>
          </div>
        </div>
      )}

      {/* ── Tanda 4 · Responsabilidades ── */}
      {tanda === 4 && (
        <div>
          <label style={qLabel}>4 · Responsabilidades</label>
          <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '6px 0 12px' }}>Tocá para sacar. Escribí para agregar.</p>
          {tareas.length === 0 && (
            <button
              type="button" onClick={generarBorradorTareas} disabled={generandoBorrador}
              style={{ ...btnPulir(generandoBorrador), marginBottom: 12 }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>auto_awesome</span>
              {generandoBorrador ? 'Generando…' : 'Este puesto no tiene plantilla — generar un borrador'}
            </button>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
            {tareas.map((t, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 10, background: 'var(--bg)' }}>
                <span style={{ flex: 1, fontSize: 13, color: 'var(--text-1)' }}>{t}</span>
                <button type="button" onClick={() => setTareas(tareas.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-3)' }}>close</span>
                </button>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              style={{ ...fieldStyle, flex: 1 }} value={tareaNueva} placeholder="Agregar tarea"
              onChange={e => setTareaNueva(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && tareaNueva.trim()) { e.preventDefault(); setTareas([...tareas, tareaNueva.trim()]); setTareaNueva('') } }}
            />
            <button type="button" onClick={() => { if (tareaNueva.trim()) { setTareas([...tareas, tareaNueva.trim()]); setTareaNueva('') } }} style={{ ...btnSecondary, width: 'auto', padding: '10px 16px' }}>+</button>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <button onClick={() => setTanda(3)} style={btnSecondary}>Atrás</button>
            <button disabled={saving} onClick={() => avanzar({ responsabilidades: [{ titulo: 'Tareas diarias', items: tareas }] }, 5)} style={btnPrimary}>Siguiente →</button>
          </div>
        </div>
      )}

      {/* ── Tanda 5 · Expectativas y límites ── */}
      {tanda === 5 && (
        <div>
          {(cartaDeLaCasa.no_negociables?.length ?? 0) > 0 && (
            <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '0 0 14px', lineHeight: 1.5, padding: '8px 10px', borderRadius: 10, background: 'var(--bg)' }}>
              Ya valen para toda la casa (no hace falta repetirlas acá): {cartaDeLaCasa.no_negociables!.join(' · ')}
            </p>
          )}
          <label style={qLabel}>5 · ¿Cómo te das cuenta que hoy anduvo bien?</label>
          <div style={{ marginTop: 8, marginBottom: 18 }}>
            <ListaDeFrases items={expectativas} onChange={setExpectativas} placeholder="Ej: la carne sale igual siempre" />
          </div>

          <label style={qLabel}>Pensá en el peor error que se cometió acá en el último año. ¿Qué pasó?</label>
          <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '4px 0 8px', lineHeight: 1.4 }}>
            Esto es solo para pensarlo — no se guarda. Abajo tildá lo que aplique.
          </p>
          <textarea
            style={{ ...fieldStyle, minHeight: 60, resize: 'vertical', marginBottom: 14 }}
            value={relatoIncidente} onChange={e => setRelatoIncidente(e.target.value)}
            placeholder="Contá qué pasó (no se guarda)"
          />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {NO_NEGOCIABLES_SUGERIDOS.map(op => {
              const active = noNegociables.has(op)
              return (
                <button
                  key={op} type="button"
                  onClick={() => setNoNegociables(prev => {
                    const n = new Set(prev)
                    if (n.has(op)) n.delete(op)
                    else n.add(op)
                    return n
                  })}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 12, textAlign: 'left',
                    border: `2px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                    background: active ? 'rgba(67,97,160,.08)' : 'var(--surface)', cursor: 'pointer',
                  }}
                >
                  <div style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0, background: active ? 'var(--accent)' : 'transparent', border: active ? 'none' : '2px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {active && <span className="material-symbols-outlined" style={{ fontSize: 13, color: '#fff' }}>check</span>}
                  </div>
                  <span style={{ fontSize: 13, color: 'var(--text-1)' }}>{op}</span>
                </button>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <input
              style={{ ...fieldStyle, flex: 1 }} value={otroLimite} placeholder="Otro…"
              onChange={e => setOtroLimite(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && otroLimite.trim()) { e.preventDefault(); setNoNegociables(prev => new Set(prev).add(otroLimite.trim())); setOtroLimite('') } }}
            />
            <button type="button" onClick={() => { if (otroLimite.trim()) { setNoNegociables(prev => new Set(prev).add(otroLimite.trim())); setOtroLimite('') } }} style={{ ...btnSecondary, width: 'auto', padding: '10px 16px' }}>+</button>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <button onClick={() => setTanda(4)} style={btnSecondary}>Atrás</button>
            {modoRapido && (
              <button disabled={saving} onClick={() => avanzar(null, 6)} style={btnSecondary}>Saltar</button>
            )}
            <button disabled={saving} onClick={() => avanzar({ expectativas, no_negociables: [...noNegociables] }, 6)} style={btnPrimary}>Siguiente →</button>
          </div>
        </div>
      )}

      {/* ── Tanda 6 · Cómo se mide / qué ofrece ── */}
      {tanda === 6 && (
        <div>
          <label style={qLabel}>6 · Cómo se mide</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8, marginBottom: 18 }}>
            {INDICADORES_DISPONIBLES.map(ind => {
              const activo = ind.nombre in indicadoresActivos
              return (
                <div key={ind.nombre} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => setIndicadoresActivos(prev => {
                      const next = { ...prev }
                      if (activo) delete next[ind.nombre]
                      else next[ind.nombre] = ''
                      return next
                    })}
                    style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0, background: activo ? 'var(--accent)' : 'transparent', border: activo ? 'none' : '2px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                  >
                    {activo && <span className="material-symbols-outlined" style={{ fontSize: 13, color: '#fff' }}>check</span>}
                  </button>
                  <span style={{ fontSize: 13, color: 'var(--text-1)', flex: 1 }}>{ind.nombre}</span>
                  {activo && (
                    <input
                      style={{ ...fieldStyle, width: 100, padding: '6px 10px', fontSize: 12 }}
                      placeholder={ind.metaPlaceholder}
                      value={indicadoresActivos[ind.nombre]}
                      onChange={e => setIndicadoresActivos(prev => ({ ...prev, [ind.nombre]: e.target.value }))}
                    />
                  )}
                </div>
              )
            })}
          </div>

          <label style={qLabel}>Qué ofrece la casa</label>
          {modoRapido && (
            <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '4px 0 8px' }}>
              Copiado de {otroPuestoNombre ?? 'otro puesto'} — confirmá o ajustá.
            </p>
          )}
          <div style={{ marginTop: 8, marginBottom: 12 }}>
            <ListaDeFrases items={beneficios} onChange={setBeneficios} placeholder="Ej: propinas en blanco, comida incluida" />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>Capacitación</label>
            <input style={fieldStyle} value={capacitacion} onChange={e => setCapacitacion(e.target.value)} placeholder="Ej: curso de manipulación de alimentos pago por la casa" />
          </div>
          <div>
            <label style={labelStyle}>Crecimiento</label>
            <input style={fieldStyle} value={carrera} onChange={e => setCarrera(e.target.value)} placeholder="Ej: de ayudante a cocinero de partida en 6 meses" />
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <button onClick={() => setTanda(5)} style={btnSecondary}>Atrás</button>
            <button disabled={saving} onClick={dejarVigente} style={btnPrimary}>{saving ? 'Guardando…' : 'Dejar vigente'}</button>
          </div>
        </div>
      )}
    </div>
  )
}

function Renglon({ label, valor }: { label: string; valor: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{label}</span>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)', textAlign: 'right' }}>{valor}</span>
    </div>
  )
}
