'use client'

// Vista Semana (7 días desktop / 3 días mobile, patrón Google Calendar: 7
// columnas de 46px en un teléfono no se leen). Fila "todo el día" arriba —
// menús, reservas, feriados y pagos son todo-el-día y antes NO aparecían acá
// (la grilla horaria arrancaba a las 7 y ellos estaban a las 00:00). Los
// eventos ocupan su duración real y los que se pisan se reparten el ancho.
// Cubre 0–24 h: el servicio de la noche y el cierre de la 1 también existen.

import { useEffect, useRef, useState } from 'react'
import type { ItemCalendario } from '@/lib/hooks/useCalendario'
import { segmentosSemana, bloquesDia } from '@/lib/calendario/layout'
import { DIAS_CORTO, dowLunes, hoy as hoyStr, pad2, fechaLarga } from '@/lib/calendario/fechas'
import { CAPA_POR_ID } from '@/lib/calendario/capas'
import { colorItem, iconoItem, horaCorta } from './shared'

const HORA_H = 44
const GUTTER = 44
const FILA_TD = 22

export function SemanaGrid({ dias, porDia, seleccionado, onSeleccionar, onCrear, onAbrir }: {
  dias: string[]
  porDia: Record<string, ItemCalendario[]>
  seleccionado: string
  onSeleccionar: (fecha: string) => void
  onCrear: (fecha: string, hora?: string) => void
  onAbrir: (it: ItemCalendario) => void
}) {
  const hoy = hoyStr()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [ahora, setAhora] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])

  const unicos = (lista: ItemCalendario[]) => lista.filter((v, i, a) => a.findIndex(x => x.id === v.id) === i)
  const todos = unicos(dias.flatMap(f => porDia[f] ?? []))
  const todoElDia = todos.filter(it => it.todoElDia)
  const segs = segmentosSemana(dias, todoElDia, { incluirUnDia: true })
  const carriles = segs.length ? Math.max(...segs.map(s => s.carril)) + 1 : 0
  const [tdAbierto, setTdAbierto] = useState(false)
  const carrilesVisibles = tdAbierto ? carriles : Math.min(carriles, 3)

  // Al entrar: scroll a la primera hora con algo (o 8:00), no a la medianoche.
  const primeraHora = Math.min(8, ...todos.filter(it => !it.todoElDia).map(it => Number(it.hora_inicio.slice(0, 2))))
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: Math.max(0, primeraHora - 1) * HORA_H })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dias[0]])

  const cols = `${GUTTER}px repeat(${dias.length}, minmax(0, 1fr))`
  const minAhora = ahora.getHours() * 60 + ahora.getMinutes()

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', overflow: 'hidden' }}>
      {/* Cabecera de días */}
      <div style={{ display: 'grid', gridTemplateColumns: cols, borderBottom: '1px solid var(--border)' }}>
        <div />
        {dias.map(f => {
          const esHoy = f === hoy
          const sel = f === seleccionado
          const feriado = (porDia[f] ?? []).some(it => it.capa === 'feriados')
          return (
            <button
              key={f}
              type="button"
              onClick={() => onSeleccionar(f)}
              aria-label={fechaLarga(f)}
              aria-pressed={sel}
              style={{
                background: 'none', border: 'none', borderLeft: '1px solid var(--border)', cursor: 'pointer',
                padding: '8px 0 6px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, fontFamily: 'inherit',
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 700, color: esHoy ? 'var(--accent)' : 'var(--text-3)' }}>{DIAS_CORTO[dowLunes(f)]}</span>
              <span style={{
                width: 30, height: 30, lineHeight: '30px', borderRadius: 15, textAlign: 'center',
                fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                background: esHoy ? 'var(--navy)' : 'transparent',
                outline: sel && !esHoy ? '2px solid var(--accent)' : 'none',
                color: esHoy ? '#fff' : feriado ? CAPA_POR_ID.feriados.color : 'var(--text-1)',
              }}>
                {Number(f.slice(8))}
              </span>
            </button>
          )
        })}
      </div>

      {/* Fila todo el día */}
      {carriles > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: cols, borderBottom: '1px solid var(--border)', position: 'relative' }}>
          <div style={{ fontSize: 10, color: 'var(--text-3)', textAlign: 'right', padding: '5px 6px 0 0', lineHeight: 1.1 }}>
            todo el día
            {carriles > 3 && (
              <button
                type="button"
                onClick={() => setTdAbierto(v => !v)}
                aria-label={tdAbierto ? 'Mostrar menos' : 'Mostrar todo'}
                style={{ display: 'block', marginLeft: 'auto', marginTop: 2, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', padding: 0 }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{tdAbierto ? 'expand_less' : 'expand_more'}</span>
              </button>
            )}
          </div>
          <div style={{
            gridColumn: `2 / span ${dias.length}`, display: 'grid',
            gridTemplateColumns: `repeat(${dias.length}, minmax(0, 1fr))`,
            gridAutoRows: FILA_TD, rowGap: 2, padding: '4px 0',
          }}>
            {segs.filter(s => s.carril < carrilesVisibles).map(s => {
              const color = colorItem(s.item)
              return (
                <button
                  key={s.item.id}
                  type="button"
                  onClick={() => onAbrir(s.item)}
                  title={s.item.titulo}
                  style={{
                    gridColumn: `${s.colInicio + 1} / span ${s.colFin - s.colInicio + 1}`, gridRow: s.carril + 1,
                    margin: '0 3px', display: 'flex', alignItems: 'center', gap: 4, padding: '0 6px', minWidth: 0,
                    border: 'none', borderLeft: `3px solid ${color}`, borderRadius: 5, background: color + '24',
                    fontSize: 11, fontWeight: 700, color: 'var(--text-1)', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 12, color, flexShrink: 0 }}>{iconoItem(s.item)}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.item.titulo}</span>
                </button>
              )
            })}
            {!tdAbierto && carriles > 3 && dias.map((f, i) => {
              const ocultos = segs.filter(s => s.carril >= 3 && s.colInicio <= i && s.colFin >= i).length
              return ocultos > 0 ? (
                <button key={f} type="button" onClick={() => setTdAbierto(true)} style={{
                  gridColumn: i + 1, gridRow: 4, background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textAlign: 'left', padding: '0 8px', fontFamily: 'inherit',
                }}>+{ocultos}</button>
              ) : null
            })}
          </div>
        </div>
      )}

      {/* Grilla horaria */}
      {/* paddingTop: la etiqueta de la primera hora visible no queda cortada contra el borde */}
      <div ref={scrollRef} style={{ overflowY: 'auto', maxHeight: 'calc(100dvh - 330px)', minHeight: 320, position: 'relative', paddingTop: 8 }}>
        <div style={{ display: 'grid', gridTemplateColumns: cols, position: 'relative', height: 24 * HORA_H }}>
          <div style={{ position: 'relative' }}>
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} style={{
                position: 'absolute', top: h * HORA_H - 7, right: 6, fontSize: 10.5, color: 'var(--text-3)',
                fontVariantNumeric: 'tabular-nums', display: h === 0 ? 'none' : undefined,
              }}>
                {pad2(h)}:00
              </div>
            ))}
          </div>
          {dias.map(f => {
            const bloques = bloquesDia((porDia[f] ?? []).filter(it => !it.todoElDia && it.dia === f))
            const esHoy = f === hoy
            return (
              <div
                key={f}
                onClick={e => {
                  const y = e.clientY - e.currentTarget.getBoundingClientRect().top
                  const h = Math.min(23, Math.max(0, Math.floor(y / HORA_H)))
                  onCrear(f, `${pad2(h)}:00`)
                }}
                style={{
                  position: 'relative', borderLeft: '1px solid var(--border)', cursor: 'copy',
                  background: `repeating-linear-gradient(to bottom, transparent 0, transparent ${HORA_H - 1}px, var(--border) ${HORA_H - 1}px, var(--border) ${HORA_H}px)`,
                }}
              >
                {bloques.map(b => {
                  const color = colorItem(b.item)
                  const alto = ((b.finMin - b.inicioMin) / 60) * HORA_H
                  return (
                    <button
                      key={b.item.id}
                      type="button"
                      onClick={e => { e.stopPropagation(); onAbrir(b.item) }}
                      title={`${b.item.titulo} · ${horaCorta(b.item.hora_inicio)}–${horaCorta(b.item.hora_fin)}`}
                      style={{
                        position: 'absolute', top: (b.inicioMin / 60) * HORA_H + 1, height: alto - 2,
                        left: `calc(${(b.col / b.cols) * 100}% + 2px)`, width: `calc(${100 / b.cols}% - 4px)`,
                        borderRadius: 6, border: 'none', borderLeft: `3px solid ${color}`, background: color + '26',
                        padding: '3px 5px', overflow: 'hidden', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                        display: 'flex', flexDirection: 'column', gap: 1,
                      }}
                    >
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-1)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: alto < 56 ? 'nowrap' : 'normal', width: '100%', flexShrink: 0 }}>
                        {b.item.titulo}
                      </span>
                      {alto >= 34 && (
                        <span style={{ fontSize: 10.5, color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums' }}>
                          {horaCorta(b.item.hora_inicio)}–{horaCorta(b.item.hora_fin)}
                        </span>
                      )}
                    </button>
                  )
                })}
                {esHoy && (
                  <div aria-hidden style={{ position: 'absolute', left: -4, right: 0, top: (minAhora / 60) * HORA_H, height: 2, background: 'var(--red)', pointerEvents: 'none' }}>
                    <div style={{ position: 'absolute', left: 0, top: -4, width: 10, height: 10, borderRadius: 5, background: 'var(--red)' }} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
