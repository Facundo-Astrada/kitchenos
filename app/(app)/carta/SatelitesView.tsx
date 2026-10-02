'use client'

// Satélites — la carta vista como un sistema de platos que giran alrededor de
// otros porque comparten bases (PLAN-DESARROLLO-PLATOS-2026-10, Fase 3,
// versión derivada: todo sale de plato_recetas y de las fichas en desarrollo,
// sin tabla nueva). Registro Preparación. Gráfico en CSS puro, sin librerías
// (DESIGN.md §10), y sin animar posición de lo tappable (§6).
import { useMemo, useState } from 'react'
import { EmptyState } from '@/components/ui'
import type { CartaItemEnriquecido } from '@/lib/hooks/useCarta'
import { usePlatosDesarrollo } from '@/lib/hooks/usePlatosDesarrollo'
import {
  basesMasCompartidas, cantidadDeSatelites, centroSugerido, platosSueltos, posicionesOrbita, vinculosDe,
  type PlatoSatelite,
} from '@/lib/carta/satelites'

const MAX_EN_ORBITA = 10

function nombreDeBases(bases: { nombre: string }[]): string {
  return bases.map(b => b.nombre).join(', ')
}

function NodoSatelite({ plato, fuerza, x, y, onElegir }: {
  plato: PlatoSatelite; fuerza: number; x: number; y: number; onElegir: () => void
}) {
  return (
    <button type="button" onClick={onElegir} title={`${plato.nombre} · ${fuerza} ${fuerza === 1 ? 'base' : 'bases'} en común`} style={{
      position: 'absolute', left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)',
      width: 'clamp(68px, 20%, 104px)', minHeight: 44, padding: '6px 6px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit',
      background: 'var(--surface)', boxShadow: 'var(--shadow-1)', color: 'var(--text)',
      border: plato.enDesarrollo ? '1.5px dashed var(--accent)' : '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
    }}>
      <span style={{ fontSize: 11.5, fontWeight: 700, lineHeight: 1.2, textAlign: 'center', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {plato.nombre}
      </span>
      <span style={{ fontSize: 10, color: plato.enDesarrollo ? 'var(--accent)' : 'var(--text-3)', fontWeight: 600 }}>
        {plato.enDesarrollo ? 'idea' : plato.categoria}
      </span>
    </button>
  )
}

function Orbita({ centro, vinculos, onElegir }: {
  centro: PlatoSatelite
  vinculos: ReturnType<typeof vinculosDe>
  onElegir: (id: string) => void
}) {
  const visibles = vinculos.slice(0, MAX_EN_ORBITA)
  const pos = posicionesOrbita(visibles.map(v => v.compartidas.length), MAX_EN_ORBITA)
  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 560, aspectRatio: '1 / 1', margin: '0 auto' }}>
      {/* Anillo de referencia + líneas: más gruesa = más bases en común */}
      <div style={{ position: 'absolute', inset: '13%', borderRadius: '50%', border: '1px dashed var(--border)' }} />
      {pos.map((p, i) => (
        <div key={visibles[i].plato.id} aria-hidden style={{
          position: 'absolute', left: '50%', top: '50%', width: `${p.radio}%`,
          height: Math.min(1 + visibles[i].compartidas.length, 5), marginTop: -1,
          background: 'var(--border)', transformOrigin: '0 50%', transform: `rotate(${p.angulo}deg)`,
        }} />
      ))}
      {pos.map((p, i) => (
        <NodoSatelite key={visibles[i].plato.id} plato={visibles[i].plato} fuerza={visibles[i].compartidas.length}
          x={p.x} y={p.y} onElegir={() => onElegir(visibles[i].plato.id)} />
      ))}
      <div style={{
        position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 'clamp(92px, 25%, 120px)', height: 'clamp(92px, 25%, 120px)', borderRadius: '50%',
        background: 'var(--navy)', color: '#fff', boxShadow: 'var(--shadow-2)', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', padding: 10, textAlign: 'center', gap: 3,
      }}>
        <span style={{ fontSize: 12, fontWeight: 800, lineHeight: 1.2, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{centro.nombre}</span>
        <span style={{ fontSize: 10, opacity: 0.7, fontWeight: 600 }}>{centro.enDesarrollo ? 'idea' : centro.categoria}</span>
      </div>
    </div>
  )
}

export default function SatelitesView({
  items, nombreReceta, onBack, onOpenPlato,
}: {
  items: CartaItemEnriquecido[]
  nombreReceta: (id: string) => string | undefined
  onBack: () => void
  onOpenPlato: (id: string) => void
}) {
  const { platos: ideas } = usePlatosDesarrollo()
  const [centroId, setCentroId] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')

  // La carta + las ideas en desarrollo, todos con la misma forma.
  const { todos, sinBases } = useMemo(() => {
    const deCarta: PlatoSatelite[] = items.map(i => {
      const vistas = new Set<string>()
      const bases = i.plato_recetas.flatMap(pr => {
        if (!pr.receta_id || vistas.has(pr.receta_id)) return []
        vistas.add(pr.receta_id)
        return [{ id: pr.receta_id, nombre: pr.receta?.nombre ?? nombreReceta(pr.receta_id) ?? 'Receta' }]
      })
      return { id: i.id, nombre: i.nombre, categoria: i.categoria, bases }
    })
    const deIdeas: PlatoSatelite[] = (ideas ?? [])
      .filter(p => p.estado === 'idea' || p.estado === 'prueba')
      .map(p => {
        const vistas = new Set<string>()
        const bases: { id: string; nombre: string }[] = []
        for (const c of p.ficha.componentes) {
          for (const rid of [c.receta_id, ...c.ingredientes.map(x => x.receta_id)]) {
            if (!rid || vistas.has(rid)) continue
            vistas.add(rid)
            bases.push({ id: rid, nombre: nombreReceta(rid) ?? 'Receta' })
          }
        }
        return { id: `idea:${p.id}`, nombre: p.nombre, categoria: p.categoria ?? 'Idea', bases, enDesarrollo: true }
      })
    const todosLos = [...deCarta, ...deIdeas]
    return { todos: todosLos.filter(p => p.bases.length > 0), sinBases: todosLos.filter(p => p.bases.length === 0).length }
  }, [items, ideas, nombreReceta])

  const satelites = useMemo(() => cantidadDeSatelites(todos), [todos])
  const sugerido = useMemo(() => centroSugerido(todos, satelites), [todos, satelites])
  const centro = todos.find(p => p.id === centroId) ?? sugerido
  const vinculos = useMemo(() => centro ? vinculosDe(centro, todos) : [], [centro, todos])
  const compartidas = useMemo(() => basesMasCompartidas(todos).slice(0, 8), [todos])
  const sueltos = useMemo(() => platosSueltos(todos, satelites), [todos, satelites])

  const lista = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return [...todos]
      .filter(p => !q || p.nombre.toLowerCase().includes(q))
      .sort((a, b) => (satelites.get(b.id) ?? 0) - (satelites.get(a.id) ?? 0) || a.nombre.localeCompare(b.nombre, 'es'))
      .slice(0, 60)
  }, [todos, satelites, busqueda])

  return (
    <div className="scroll-body">
      <div style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={onBack} aria-label="Volver" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>
            <span className="material-symbols-outlined" style={{ color: '#fff', fontSize: 22 }}>arrow_back</span>
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>Satélites</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,.5)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>Platos que comparten bases</div>
          </div>
        </div>
      </div>

      <div style={{ padding: '14px 14px 100px', maxWidth: 1040, margin: '0 auto', width: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {!centro ? (
          <EmptyState icon="hub" title="Todavía no hay platos con componentes"
            subtitle="Cuando los platos tengan recetas vinculadas, acá ves cuáles comparten bases y cuáles giran solos." />
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 16, alignItems: 'start' }}>
              {/* Órbita */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow-1)', padding: 12 }}>
                <Orbita centro={centro} vinculos={vinculos} onElegir={setCentroId} />
                {!centro.enDesarrollo && (
                  <div style={{ textAlign: 'center', marginTop: 4 }}>
                    <button type="button" onClick={() => onOpenPlato(centro.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-ink)', fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', minHeight: 40 }}>
                      Abrir la ficha de {centro.nombre}
                    </button>
                  </div>
                )}
                <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-3)', marginTop: 8 }}>
                  {vinculos.length === 0
                    ? 'Este plato no comparte ninguna base con otro.'
                    : `${vinculos.length} ${vinculos.length === 1 ? 'plato comparte' : 'platos comparten'} bases · más cerca = más en común${vinculos.length > MAX_EN_ORBITA ? ` · se dibujan ${MAX_EN_ORBITA}, el resto está en la lista` : ''}`}
                </div>
              </div>

              {/* Elegir el plato del centro */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow-1)', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Plato en el centro</div>
                <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar un plato"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 14, fontFamily: 'inherit', outline: 'none' }} />
                <div style={{ maxHeight: 340, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                  {lista.map(p => {
                    const n = satelites.get(p.id) ?? 0
                    const activo = p.id === centro.id
                    return (
                      <button key={p.id} type="button" onClick={() => setCentroId(p.id)} style={{
                        display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', padding: '8px 10px', minHeight: 44, borderRadius: 10,
                        border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: activo ? 'var(--blue-bg)' : 'transparent', color: 'var(--text)',
                      }}>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nombre}</span>
                          <span style={{ fontSize: 11, color: p.enDesarrollo ? 'var(--accent)' : 'var(--text-3)' }}>{p.enDesarrollo ? 'idea en desarrollo' : p.categoria}</span>
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: n ? 'var(--navy-ink)' : 'var(--text-3)' }}>{n} {n === 1 ? 'satélite' : 'satélites'}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Qué comparte con cada uno — la lectura densa */}
            {vinculos.length > 0 && (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow-1)', padding: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>
                  Con {centro.nombre} comparten
                </div>
                {vinculos.map(v => (
                  <button key={v.plato.id} type="button" onClick={() => setCentroId(v.plato.id)} style={{
                    display: 'flex', gap: 10, alignItems: 'baseline', width: '100%', textAlign: 'left', padding: '8px 4px', minHeight: 40,
                    background: 'none', border: 'none', borderTop: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text)',
                  }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700, minWidth: 120, flexShrink: 0 }}>
                      {v.plato.nombre}{v.plato.enDesarrollo && <span style={{ color: 'var(--accent)', fontWeight: 600, fontSize: 11 }}> · idea</span>}
                    </span>
                    <span style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.4 }}>{nombreDeBases(v.compartidas)}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Lectura de toda la carta */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 16, alignItems: 'start' }}>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow-1)', padding: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Bases que más platos comparten</div>
                {compartidas.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--text-3)', padding: '6px 0' }}>Ninguna base se usa en más de un plato todavía.</div>
                ) : compartidas.map(c => (
                  <div key={c.base.id} style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '7px 0', borderTop: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700, minWidth: 110, flexShrink: 0 }}>{c.base.nombre}</span>
                    <span style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.4 }}>{c.platos.length} platos: {c.platos.map(p => p.nombre).join(', ')}</span>
                  </div>
                ))}
              </div>

              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow-1)', padding: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Platos que giran solos</div>
                {sueltos.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--text-3)', padding: '6px 0' }}>Todos los platos comparten al menos una base con otro.</div>
                ) : (
                  <>
                    <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6, lineHeight: 1.4 }}>
                      Tienen componentes, pero ninguno lo usa otro plato. ¿Es a propósito?
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {sueltos.map(p => (
                        <button key={p.id} type="button" onClick={() => setCentroId(p.id)} style={{
                          fontSize: 12, fontWeight: 600, padding: '5px 10px', borderRadius: 99, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                          background: 'var(--bg)', color: 'var(--text-2)',
                        }}>{p.nombre}</button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {sinBases > 0 && (
              <div style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center' }}>
                {sinBases} {sinBases === 1 ? 'plato no tiene' : 'platos no tienen'} componentes cargados y no entran al mapa.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
