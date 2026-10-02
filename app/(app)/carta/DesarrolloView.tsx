'use client'

// "En desarrollo" — de notas sueltas a fichas de platos nuevos
// (PLAN-DESARROLLO-PLATOS-2026-10, decisión 016). Registro Preparación.
//
// Flujo: el chef pega todo junto → /separar corta en platos (Haiku, ~3 s) y la
// pantalla dibuja una tarjeta por plato → /ordenar arma cada ficha (Sonnet, de
// a 4 en paralelo) y cada una aparece apenas vuelve. Lo que ya llegó queda
// guardado aunque se corte la conexión en el plato 7.
import { useMemo, useRef, useState } from 'react'
import { EmptyState, FilterChips, IAButton, IAIcon, iaTinte, type FilterChip } from '@/components/ui'
import { usePlatosDesarrollo } from '@/lib/hooks/usePlatosDesarrollo'
import type { EstadoPlatoDesarrollo, PlatoDesarrollo } from '@/types'
import {
  MAX_CARACTERES_PEGADO, correrConLimite, datosSinConfirmar, preguntasAbiertas, resumenTanda,
  type PlatoRecortado,
} from '@/lib/carta/desarrollo'
import FichaDesarrolloSheet from './FichaDesarrolloSheet'

type Filtro = 'idea' | 'prueba' | 'aprobado' | 'descartado'

const PLACEHOLDER = `Pegá acá tus ideas tal como las tenés: una nota del celular, un Google Doc, un WhatsApp…

Pasta rellena de carne
Hacer con roast beef cortado a cuchillo, braseado con mirepoix…

Papines confitados
En aceite con pimentón a baja temperatura…`

interface Pendiente {
  key: string
  nombre: string
  texto: string
  estado: 'ordenando' | 'error'
  error?: string
}

interface ResumenDeTanda {
  platos: number
  preguntasAbiertas: number
  bases: string[]
  fallaron: number
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error ?? 'No se pudo completar. Probá de nuevo.')
  return data as T
}

function TarjetaPlato({ plato, onAbrir }: { plato: PlatoDesarrollo; onAbrir: () => void }) {
  const abiertas = preguntasAbiertas(plato.ficha)
  const sinConfirmar = datosSinConfirmar(plato.ficha)
  return (
    <button type="button" onClick={onAbrir} style={{
      textAlign: 'left', width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
      padding: '12px 14px', cursor: 'pointer', boxShadow: 'var(--shadow-1)', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{plato.nombre}</div>
      {plato.descripcion && (
        <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {plato.descripcion}
        </div>
      )}
      {plato.ficha.componentes.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {plato.ficha.componentes.map(c => (
            <span key={c.id} style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: c.receta_id ? 'var(--green-bg)' : 'var(--bg)', color: c.receta_id ? 'var(--green-fg)' : 'var(--text-2)' }}>
              {c.nombre || 'Componente'}
            </span>
          ))}
        </div>
      )}
      {(abiertas > 0 || sinConfirmar > 0) && (
        <div style={{ display: 'flex', gap: 10, fontSize: 11.5, fontWeight: 600, color: 'var(--text-3)' }}>
          {abiertas > 0 && <span>{abiertas} {abiertas === 1 ? 'pregunta abierta' : 'preguntas abiertas'}</span>}
          {sinConfirmar > 0 && <span style={{ color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: 3 }}><IAIcon size={12} />{sinConfirmar} sin confirmar</span>}
        </div>
      )}
    </button>
  )
}

function TarjetaPendiente({ p, onReintentar, onQuitar }: { p: Pendiente; onReintentar: () => void; onQuitar: () => void }) {
  return (
    <div className={p.estado === 'ordenando' ? 'skeleton-pulse' : undefined} style={{
      background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: 12, padding: '12px 14px',
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <IAIcon size={18} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{p.nombre || 'Plato sin nombre'}</div>
        <div style={{ fontSize: 12, color: p.estado === 'error' ? 'var(--text-2)' : 'var(--text-3)' }}>
          {p.estado === 'ordenando' ? 'Ordenando la ficha…' : p.error}
        </div>
      </div>
      {p.estado === 'error' && (
        <>
          <button type="button" onClick={onReintentar} style={{ minHeight: 40, padding: '0 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--navy-ink)', fontWeight: 700, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer' }}>Reintentar</button>
          <button type="button" onClick={onQuitar} aria-label="Quitar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 4 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
          </button>
        </>
      )}
    </div>
  )
}

export default function DesarrolloView({
  onBack, onToast, nombreReceta,
}: {
  onBack: () => void
  onToast: (msg: string) => void
  nombreReceta: (id: string) => string | undefined
}) {
  const { platos, loading, agregarLocal, actualizar, eliminar } = usePlatosDesarrollo()
  const [texto, setTexto] = useState('')
  const [separando, setSeparando] = useState(false)
  const [pendientes, setPendientes] = useState<Pendiente[]>([])
  const [resumen, setResumen] = useState<ResumenDeTanda | null>(null)
  const [filtro, setFiltro] = useState<Filtro>('idea')
  const [abiertoId, setAbiertoId] = useState<string | null>(null)
  const tandaRef = useRef<string | null>(null)

  const lista = useMemo(() => platos ?? [], [platos])
  const conteo = useMemo(() => {
    const c: Record<Filtro, number> = { idea: 0, prueba: 0, aprobado: 0, descartado: 0 }
    for (const p of lista) c[p.estado] += 1
    return c
  }, [lista])

  const chips: FilterChip<Filtro>[] = [
    { value: 'idea', label: `Ideas${conteo.idea ? ` · ${conteo.idea}` : ''}` },
    { value: 'prueba', label: `En prueba${conteo.prueba ? ` · ${conteo.prueba}` : ''}` },
    ...(conteo.aprobado ? [{ value: 'aprobado' as Filtro, label: `Aprobados · ${conteo.aprobado}` }] : []),
    ...(conteo.descartado ? [{ value: 'descartado' as Filtro, label: `Descartados · ${conteo.descartado}` }] : []),
  ]

  const visibles = lista.filter(p => p.estado === filtro)
  const abierto = abiertoId ? lista.find(p => p.id === abiertoId) ?? null : null

  /** Un plato: pide la ficha, la suma a la lista y devuelve las bases que reutilizó. */
  async function ordenarUno(key: string, recorte: PlatoRecortado, tandaId: string): Promise<{ ok: boolean; bases: string[]; preguntas: number; plato?: PlatoDesarrollo }> {
    try {
      const r = await postJson<{ plato: PlatoDesarrollo; bases_reutilizadas: string[] }>('/api/carta/desarrollo/ordenar', {
        texto: recorte.texto, nombre_tentativo: recorte.nombre_tentativo, tanda_id: tandaId,
      })
      await agregarLocal(r.plato)
      setPendientes(prev => prev.filter(p => p.key !== key))
      return { ok: true, bases: r.bases_reutilizadas, preguntas: preguntasAbiertas(r.plato.ficha), plato: r.plato }
    } catch (e) {
      setPendientes(prev => prev.map(p => p.key === key ? { ...p, estado: 'error', error: e instanceof Error ? e.message : 'No se pudo ordenar.' } : p))
      return { ok: false, bases: [], preguntas: 0 }
    }
  }

  async function ordenar() {
    const t = texto.trim()
    if (!t || separando) return
    setSeparando(true)
    setResumen(null)
    try {
      const sep = await postJson<{ tanda_id: string; platos: PlatoRecortado[] }>('/api/carta/desarrollo/separar', { texto: t })
      tandaRef.current = sep.tanda_id
      const nuevos: Pendiente[] = sep.platos.map((p, i) => ({
        key: `${sep.tanda_id}-${i}`, nombre: p.nombre_tentativo, texto: p.texto, estado: 'ordenando',
      }))
      setPendientes(nuevos)
      setTexto('')
      setFiltro('idea')

      const resultados = await correrConLimite(sep.platos, 4, (p, i) => ordenarUno(nuevos[i].key, p, sep.tanda_id))
      const hechos = resultados.filter(r => r.ok)
      const base = resumenTanda(
        hechos.map(r => ({ ficha: r.plato!.ficha })),
        hechos.flatMap(r => r.bases),
      )
      setResumen({ ...base, fallaron: resultados.length - hechos.length })
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'No se pudieron ordenar las notas.')
    } finally {
      setSeparando(false)
    }
  }

  async function reintentar(p: Pendiente) {
    setPendientes(prev => prev.map(x => x.key === p.key ? { ...x, estado: 'ordenando', error: undefined } : x))
    await ordenarUno(p.key, { nombre_tentativo: p.nombre, texto: p.texto }, tandaRef.current ?? crypto.randomUUID())
  }

  async function cambiarEstado(p: PlatoDesarrollo, estado: EstadoPlatoDesarrollo) {
    try {
      await actualizar(p.id, { estado })
      setAbiertoId(null)
      setFiltro(estado)
      onToast(estado === 'prueba' ? 'Pasó a prueba' : estado === 'descartado' ? 'Descartado' : 'Volvió a ideas')
    } catch { onToast('No se pudo cambiar el estado.') }
  }

  return (
    <div className="scroll-body">
      <div style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <button onClick={onBack} aria-label="Volver" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>
            <span className="material-symbols-outlined" style={{ color: '#fff', fontSize: 22 }}>arrow_back</span>
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>En desarrollo</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,.5)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>Platos nuevos, antes de la carta</div>
          </div>
        </div>
        {chips.length > 1 && <FilterChips chips={chips} active={filtro} onChange={setFiltro} context="onDark" />}
      </div>

      <div style={{ padding: '14px 14px 100px', display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 980, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        {/* Pegá tus ideas */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 12, boxShadow: 'var(--shadow-1)' }}>
          <textarea
            value={texto} onChange={e => setTexto(e.target.value)} placeholder={PLACEHOLDER} rows={6}
            disabled={separando} maxLength={MAX_CARACTERES_PEGADO}
            style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 14, lineHeight: 1.5, fontFamily: 'inherit', resize: 'vertical', outline: 'none' }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 180, fontSize: 12, color: 'var(--text-3)', lineHeight: 1.4 }}>
              No hace falta ordenarlas ni ponerles cantidades. Lo que falta queda como pregunta para la prueba.
            </div>
            <IAButton variant="solid" label={separando ? 'Ordenando…' : 'Ordenar mis ideas'} onClick={ordenar} disabled={!texto.trim() || separando} />
          </div>
        </div>

        {/* Resumen de la tanda */}
        {resumen && !separando && (
          <div style={{ background: iaTinte(8), border: `1px solid ${iaTinte(22)}`, borderRadius: 12, padding: '10px 14px', fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>
            <b>{resumen.platos} {resumen.platos === 1 ? 'plato ordenado' : 'platos ordenados'}</b>
            {resumen.preguntasAbiertas > 0 && <> · {resumen.preguntasAbiertas} {resumen.preguntasAbiertas === 1 ? 'pregunta abierta' : 'preguntas abiertas'} para la prueba</>}
            {resumen.bases.length > 0 && <> · reutilizan bases que ya tenés ({resumen.bases.join(', ')})</>}
            {resumen.fallaron > 0 && <> · <span style={{ color: 'var(--text-2)' }}>{resumen.fallaron} no se pudieron ordenar, podés reintentarlos abajo</span></>}
          </div>
        )}

        {/* Tarjetas en proceso */}
        {pendientes.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pendientes.map(p => (
              <TarjetaPendiente key={p.key} p={p} onReintentar={() => reintentar(p)} onQuitar={() => setPendientes(prev => prev.filter(x => x.key !== p.key))} />
            ))}
          </div>
        )}

        {/* Fichas */}
        {loading && lista.length === 0 ? (
          <div className="skeleton-pulse" style={{ height: 90, borderRadius: 12, background: 'var(--border)' }} />
        ) : lista.length === 0 && pendientes.length === 0 ? (
          <EmptyState icon="edit_note" title="Todavía no hay platos en desarrollo" subtitle="Pegá tus ideas arriba y en segundos ves cada plato ordenado como ficha." />
        ) : visibles.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: 10 }}>
            {visibles.map(p => <TarjetaPlato key={p.id} plato={p} onAbrir={() => setAbiertoId(p.id)} />)}
          </div>
        ) : lista.length > 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 13, padding: 20 }}>No hay platos en este estado.</div>
        ) : null}
      </div>

      {abierto && (
        <FichaDesarrolloSheet
          key={abierto.id}
          plato={abierto}
          nombreReceta={nombreReceta}
          onClose={() => setAbiertoId(null)}
          onGuardar={async cambios => {
            try { await actualizar(abierto.id, cambios) } catch { onToast('No se pudo guardar el último cambio.') }
          }}
          onEstado={estado => cambiarEstado(abierto, estado)}
          onEliminar={async () => {
            if (!confirm(`¿Eliminar "${abierto.nombre}"? No se puede deshacer.`)) return
            try { await eliminar(abierto.id); setAbiertoId(null); onToast('Plato eliminado') } catch { onToast('No se pudo eliminar.') }
          }}
        />
      )}
    </div>
  )
}
