'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@/lib/auth/context'
import { useRutinaTurno } from '@/lib/hooks/useRutinaTurno'
import { useTurnosServicio } from '@/lib/hooks/useTurnosServicio'
import { useEquipo } from '@/lib/hooks/useEquipo'
import { turnoVigente, hoyOperativo } from '@/lib/ops/turnos'
import { SegmentedTabs, FilterChips, EmptyState, Avatar } from '@/components/ui'
import type { RutinaTurnoItem, RutinaTurnoFase } from '@/types'
import { RutinaItemSheet } from './RutinaItemSheet'

const FASES: { id: RutinaTurnoFase; label: string; icon: string }[] = [
  { id: 'apertura', label: 'Apertura', icon: 'wb_twilight' },
  { id: 'cierre',   label: 'Cierre',   icon: 'bedtime' },
]

const btnReset: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit',
}

/** "17:00" → 1020. Para ordenar y para comparar contra la hora real de ejecución. */
function aMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/** Hora real a la que se tildó, en HH:MM local — para contrastar con la hora pautada. */
function horaDe(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })
}

export function RutinaTurnoView({ embedded }: { embedded?: boolean } = {}) {
  const { perfil } = useAuth()
  const { items, registros, loading, fetchRegistros, marcar, agregarItem, actualizarItem, eliminarItem, reordenar } = useRutinaTurno()
  const { turnosActivos } = useTurnosServicio()
  const { miembros } = useEquipo()

  const [fase, setFase] = useState<RutinaTurnoFase>('apertura')
  const [editando, setEditando] = useState(false)
  const [sheetItem, setSheetItem] = useState<RutinaTurnoItem | 'nuevo' | null>(null)
  // Qué fila tiene abierto el selector de responsable (los slots del cierre).
  const [asignando, setAsignando] = useState<string | null>(null)

  // `turnoVigente` resuelve jornada Y turno juntos, y ese acople es el punto:
  // pedirlos por separado (hoyOperativo + turnoActivo) devuelve pares que nunca
  // existieron — entre el corte de jornada (05:00) y el primer turno (09:00) la
  // jornada ya rodó a hoy pero turnoActivo sigue arrastrando la cena de anoche,
  // así que el cocinero que llega 8:45 a abrir vería la rutina del turno tarde.
  // Sin plaza ni entregados degrada al reloj, que es lo que corresponde acá: la
  // rutina es de la cocina entera, no se entrega por plaza.
  const vigente = useMemo(() => turnoVigente({ turnos: turnosActivos }), [turnosActivos])
  // hoyOperativo(), NUNCA toISOString(): de noche UTC ya cayó en el día
  // siguiente y la jornada saldría corrida (hooks.md #19).
  const fecha = vigente?.jornada ?? hoyOperativo()

  // El chip permite moverse a otro turno (preparar el cierre de la noche desde
  // la tarde, o revisar el que ya pasó) sin dejar de seguir al resolutor mientras
  // no se toque nada.
  const [turnoManual, setTurnoManual] = useState<string | null>(null)
  const turno = turnoManual ?? vigente?.turnoId ?? null

  useEffect(() => {
    if (!turno) return
    fetchRegistros(fecha, turno)
  }, [fecha, turno, fetchRegistros])

  // ── Qué ítems aplican a este turno y este día ───────────────────────────
  // Tres filtros, todos del papel original: la fase que se está mirando, los
  // ítems exclusivos de un turno ("cenizas" solo cierra la noche) y los que
  // caen un día puntual ("campana (jueves)").
  const visibles = useMemo(() => {
    const dow = new Date(fecha + 'T12:00:00').getDay()
    const hoyIso = dow === 0 ? 7 : dow   // ISO 1=Lun..7=Dom
    return items
      .filter(i => i.fase === fase)
      .filter(i => !i.turnos?.length || (turno != null && i.turnos.includes(turno)))
      .filter(i => !i.dias_semana?.length || i.dias_semana.includes(hoyIso))
      .sort((a, b) => a.orden - b.orden)
  }, [items, fase, turno, fecha])

  const regMap = useMemo(() => {
    const m: Record<string, typeof registros[number]> = {}
    for (const r of registros) m[r.item_id] = r
    return m
  }, [registros])

  const miembroMap = useMemo(() => {
    const m: Record<string, { nombre: string; apellido: string }> = {}
    for (const x of miembros) m[x.id] = { nombre: x.nombre, apellido: x.apellido }
    return m
  }, [miembros])

  const hechos = visibles.filter(i => regMap[i.id]?.completado).length
  const total = visibles.length
  const pct = total > 0 ? Math.round((hechos / total) * 100) : 0

  // ── La hora que manda ──────────────────────────────────────────────────
  // El papel tiene la misma línea a las 11 en el turno mañana y a las 19 en el
  // tarde: la hora sale del mapa por turno, no del ítem.
  const horaDelItem = useCallback(
    (i: RutinaTurnoItem) => (turno ? i.horas?.[turno] ?? null : null),
    [turno],
  )

  // Próximo ítem con hora sin hacer — el ancla del "vas atrasado".
  const proximoConHora = useMemo(() => {
    const pend = visibles.filter(i => !regMap[i.id]?.completado && horaDelItem(i))
    return pend.length > 0 ? pend[0] : null
  }, [visibles, regMap, horaDelItem])

  const ahoraMin = useMemo(() => {
    const d = new Date()
    return d.getHours() * 60 + d.getMinutes()
  }, [])

  const atrasado = useMemo(() => {
    if (!proximoConHora) return false
    const h = horaDelItem(proximoConHora)
    return h != null && ahoraMin > aMinutos(h) + 10   // 10' de gracia
  }, [proximoConHora, horaDelItem, ahoraMin])

  const handleToggle = useCallback((item: RutinaTurnoItem) => {
    if (!turno) return
    const done = !!regMap[item.id]?.completado
    marcar(item.id, fecha, turno, { completado: !done }, perfil?.miembro_id ?? null)
  }, [turno, fecha, regMap, marcar, perfil])

  const handleResponsable = useCallback((item: RutinaTurnoItem, miembroId: string | null) => {
    if (!turno) return
    marcar(item.id, fecha, turno, { responsable_id: miembroId }, perfil?.miembro_id ?? null)
    setAsignando(null)
  }, [turno, fecha, marcar, perfil])

  // ── Reordenar en modo edición ───────────────────────────────────────────
  const mover = useCallback((idx: number, dir: -1 | 1) => {
    const destino = idx + dir
    if (destino < 0 || destino >= visibles.length) return
    const ids = visibles.map(i => i.id)
    ;[ids[idx], ids[destino]] = [ids[destino], ids[idx]]
    reordenar(fase, ids)
  }, [visibles, fase, reordenar])

  // Chrome plegable al scrollear, mismo gesto que el mise: en una tablet las
  // franjas fijas se comen un tercio de la pantalla.
  const scrollRef = useRef<HTMLDivElement>(null)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* ── Cabecera: fase + turno + progreso ── */}
      <div style={{
        padding: embedded ? '10px 16px 12px' : 'var(--header-top) 16px 12px',
        background: embedded ? 'var(--bg)' : 'var(--navy)',
        flexShrink: 0, borderBottom: '1px solid var(--border)',
      }}>
        <SegmentedTabs
          variant={embedded ? 'onLight' : 'onDark'}
          tabs={FASES}
          active={fase}
          onChange={id => setFase(id as RutinaTurnoFase)}
        />

        {turnosActivos.length > 1 && (
          <div style={{ marginTop: 10 }}>
            <FilterChips
              context="onLight"
              chips={turnosActivos.map(t => ({ value: t.id, label: t.nombre }))}
              active={turno ?? ''}
              onChange={v => setTurnoManual(v)}
            />
          </div>
        )}

        {/* Progreso — el mismo contador que el papel lleva a mano */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
          <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{
              width: `${pct}%`, height: '100%', borderRadius: 99,
              background: pct === 100 ? '#22c55e' : 'var(--accent)',
              transition: 'width .3s ease',
            }} />
          </div>
          <span style={{
            fontSize: 12, fontWeight: 800, fontFamily: "'DM Mono', monospace",
            color: pct === 100 ? '#22c55e' : 'var(--text-2)', flexShrink: 0,
          }}>
            {hechos}/{total}
          </span>
          <button
            onClick={() => setEditando(e => !e)}
            style={{ ...btnReset, flexShrink: 0 }}
            aria-label={editando ? 'Terminar de editar' : 'Editar la rutina'}
          >
            <span className="material-symbols-outlined" style={{
              fontSize: 19, color: editando ? 'var(--accent)' : 'var(--text-3)',
            }}>{editando ? 'check_circle' : 'edit_note'}</span>
          </button>
        </div>

        {/* Aviso de atraso — el único dato que el papel no puede dar */}
        {atrasado && proximoConHora && !editando && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginTop: 10,
            padding: '7px 10px', borderRadius: 10,
            background: 'rgba(249,115,22,.1)', border: '1px solid rgba(249,115,22,.25)',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#f97316' }}>schedule</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#f97316', lineHeight: 1.3 }}>
              «{proximoConHora.texto}» era {horaDelItem(proximoConHora)}
            </span>
          </div>
        )}
      </div>

      {/* ── La lista ── */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '10px 16px 24px' }}>
        {loading && (
          <div style={{ padding: '40px 12px', textAlign: 'center', fontSize: 13, color: 'var(--text-3)' }}>
            Cargando…
          </div>
        )}

        {!loading && total === 0 && (
          <EmptyState
            icon={fase === 'apertura' ? 'wb_twilight' : 'bedtime'}
            title={`Sin rutina de ${fase}`}
            subtitle="Cargá los pasos que la cocina hace siempre — el orden y la hora los ponés vos."
            cta={{ label: 'Agregar el primero', onClick: () => setSheetItem('nuevo') }}
          />
        )}

        {!loading && total > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {visibles.map((item, idx) => {
              const reg = regMap[item.id]
              const done = !!reg?.completado
              const hora = horaDelItem(item)
              const hechoA = horaDe(reg?.completado_at)
              // Tarde de verdad = se tildó más de 10' después de la hora pautada.
              const tarde = !!(hora && hechoA && aMinutos(hechoA) > aMinutos(hora) + 10)
              const resp = reg?.responsable_id ? miembroMap[reg.responsable_id] : null

              return (
                <div key={item.id}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px',
                    background: done ? 'rgba(34,197,94,.05)' : 'var(--surface)',
                    border: `1px solid ${done ? 'rgba(34,197,94,.22)' : 'var(--border)'}`,
                    borderRadius: 12, transition: 'background .2s, border-color .2s',
                  }}>
                    {editando ? (
                      <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                        <button onClick={() => mover(idx, -1)} disabled={idx === 0} style={{ ...btnReset, opacity: idx === 0 ? 0.25 : 1 }} aria-label="Subir">
                          <span className="material-symbols-outlined" style={{ fontSize: 17, color: 'var(--text-3)' }}>keyboard_arrow_up</span>
                        </button>
                        <button onClick={() => mover(idx, 1)} disabled={idx === visibles.length - 1} style={{ ...btnReset, opacity: idx === visibles.length - 1 ? 0.25 : 1 }} aria-label="Bajar">
                          <span className="material-symbols-outlined" style={{ fontSize: 17, color: 'var(--text-3)' }}>keyboard_arrow_down</span>
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => handleToggle(item)} style={{ ...btnReset, flexShrink: 0 }} aria-label={done ? `Desmarcar ${item.texto}` : `Marcar ${item.texto}`}>
                        <span className="material-symbols-outlined" style={{
                          fontSize: 25, color: done ? '#22c55e' : 'var(--border)', transition: 'color .15s',
                        }}>{done ? 'check_circle' : 'radio_button_unchecked'}</span>
                      </button>
                    )}

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 14, fontWeight: 600, color: done ? 'var(--text-3)' : 'var(--text-1)',
                        textDecoration: done ? 'line-through' : 'none',
                      }}>
                        {item.texto}
                      </div>
                      {/* Segunda línea: solo aparece si hay algo real que decir */}
                      {(hechoA || resp || (item.requiere_responsable && !done)) && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                          {resp && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <Avatar name={`${resp.nombre} ${resp.apellido}`} size={16} />
                              <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-2)' }}>{resp.nombre}</span>
                            </span>
                          )}
                          {item.requiere_responsable && !resp && !editando && (
                            <button onClick={() => setAsignando(asignando === item.id ? null : item.id)} style={{ ...btnReset, gap: 3 }}>
                              <span className="material-symbols-outlined" style={{ fontSize: 13, color: 'var(--accent)' }}>person_add</span>
                              <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--accent)' }}>Asignar</span>
                            </button>
                          )}
                          {hechoA && (
                            <span style={{ fontSize: 10, color: tarde ? '#f97316' : 'var(--text-3)', fontWeight: tarde ? 700 : 500 }}>
                              {hora ? `${hora} → ${hechoA}` : hechoA}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Chip de hora: solo los ítems que la tienen la muestran —
                        la mayoría del papel va por posición, no por reloj. */}
                    {hora && !done && (
                      <span style={{
                        fontSize: 11, fontWeight: 700, fontFamily: "'DM Mono', monospace",
                        padding: '3px 7px', borderRadius: 7, flexShrink: 0,
                        background: 'rgba(67,97,160,.1)', color: 'var(--accent)',
                      }}>{hora}</span>
                    )}

                    {editando && (
                      <>
                        <button onClick={() => setSheetItem(item)} style={{ ...btnReset, flexShrink: 0 }} aria-label={`Editar ${item.texto}`}>
                          <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-3)' }}>tune</span>
                        </button>
                        <button
                          onClick={() => { if (confirm(`¿Sacar «${item.texto}» de la rutina?`)) eliminarItem(item.id) }}
                          style={{ ...btnReset, flexShrink: 0 }}
                          aria-label={`Eliminar ${item.texto}`}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-3)', opacity: 0.5 }}>close</span>
                        </button>
                      </>
                    )}
                  </div>

                  {/* Selector de responsable — inline, debajo de su fila */}
                  {asignando === item.id && (
                    <div style={{
                      display: 'flex', gap: 6, flexWrap: 'wrap', padding: '8px 12px 10px 44px',
                    }}>
                      {miembros.filter(m => m.activo).map(m => (
                        <button
                          key={m.id}
                          onClick={() => handleResponsable(item, m.id)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 5, padding: '5px 9px 5px 5px',
                            borderRadius: 99, border: '1px solid var(--border)', background: 'var(--surface)',
                            cursor: 'pointer', fontFamily: 'inherit',
                          }}
                        >
                          <Avatar name={`${m.nombre} ${m.apellido}`} size={20} />
                          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-1)' }}>{m.nombre}</span>
                        </button>
                      ))}
                      {reg?.responsable_id && (
                        <button
                          onClick={() => handleResponsable(item, null)}
                          style={{
                            padding: '5px 10px', borderRadius: 99, border: '1px solid var(--border)',
                            background: 'none', cursor: 'pointer', fontFamily: 'inherit',
                            fontSize: 11, fontWeight: 600, color: 'var(--text-3)',
                          }}
                        >Quitar</button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}

            {editando && (
              <button onClick={() => setSheetItem('nuevo')} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '10px 4px',
                background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', marginTop: 2,
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 17, color: 'var(--accent)' }}>add</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>
                  Agregar paso a {fase === 'apertura' ? 'la apertura' : 'el cierre'}
                </span>
              </button>
            )}
          </div>
        )}
      </div>

      {sheetItem && (
        <RutinaItemSheet
          item={sheetItem === 'nuevo' ? null : sheetItem}
          fase={fase}
          turnos={turnosActivos}
          onSave={async d => {
            if (sheetItem === 'nuevo') await agregarItem({ ...d, fase })
            else await actualizarItem(sheetItem.id, d)
            setSheetItem(null)
          }}
          onClose={() => setSheetItem(null)}
        />
      )}
    </div>
  )
}

export default RutinaTurnoView
