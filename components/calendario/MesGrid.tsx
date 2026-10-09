'use client'

// Vista Mes. Desktop: celdas altas con píldoras, los ítems de varios días
// como UNA barra que cruza la semana, arrastrar un evento propio a otro día
// lo mueve. Mobile: grilla compacta con puntos por capa (una píldora de 10px
// en una celda de 50px no se lee) y el detalle del día va debajo.

import { useState } from 'react'
import type { ItemCalendario, NotaItemCalendario } from '@/lib/hooks/useCalendario'
import { ordenarItemsDia } from '@/lib/hooks/useCalendario'
import { segmentosSemana } from '@/lib/calendario/layout'
import { DIAS_CORTO, MESES, hoy as hoyStr, fechaLarga } from '@/lib/calendario/fechas'
import { CAPA_POR_ID } from '@/lib/calendario/capas'
import { ItemPill, colorItem, iconoItem } from './shared'

const BARRA_H = 20
const CAB_H = 28
const FILAS_DESKTOP = 4

export function MesGrid({
  grilla, mes, porDia, notaItems, seleccionado, compacto,
  onSeleccionar, onCrear, onAbrir, onMover,
}: {
  grilla: string[]
  mes: number
  porDia: Record<string, ItemCalendario[]>
  notaItems: Record<string, NotaItemCalendario[]>
  seleccionado: string
  compacto: boolean
  onSeleccionar: (fecha: string) => void
  onCrear: (fecha: string) => void
  onAbrir: (it: ItemCalendario) => void
  onMover: (it: ItemCalendario, fecha: string) => void
}) {
  const hoy = hoyStr()
  const [arrastrando, setArrastrando] = useState<ItemCalendario | null>(null)
  const [destino, setDestino] = useState<string | null>(null)
  const semanas = Array.from({ length: 6 }, (_, i) => grilla.slice(i * 7, i * 7 + 7))
  const enMes = (f: string) => Number(f.slice(5, 7)) === mes

  const etiquetaCelda = (f: string) => {
    const n = porDia[f]?.length ?? 0
    return `${fechaLarga(f)}${f === hoy ? ', hoy' : ''}. ${n === 0 ? 'Sin nada' : `${n} ${n === 1 ? 'ítem' : 'ítems'}`}`
  }

  return (
    <div role="grid" aria-label="Mes">
      <div role="row" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', marginBottom: 4 }}>
        {DIAS_CORTO.map((d, i) => (
          <div key={d} role="columnheader" style={{
            textAlign: compacto ? 'center' : 'left', padding: compacto ? '4px 0' : '4px 8px',
            fontSize: 11.5, fontWeight: 700, color: i >= 5 ? 'var(--text-2)' : 'var(--text-3)', letterSpacing: '.02em',
          }}>
            {compacto ? d.charAt(0) : d}
          </div>
        ))}
      </div>

      <div style={{
        display: 'flex', flexDirection: 'column', gap: compacto ? 2 : 0,
        border: compacto ? 'none' : '1px solid var(--border)', borderRadius: compacto ? 0 : 12,
        overflow: 'hidden', background: compacto ? 'transparent' : 'var(--surface)',
      }}>
        {semanas.map((semana, w) => {
          const segs = compacto ? [] : segmentosSemana(semana, semana.flatMap(f => porDia[f] ?? []).filter((v, i, a) => a.findIndex(x => x.id === v.id) === i))
          const carriles = segs.length ? Math.max(...segs.map(s => s.carril)) + 1 : 0
          const carrilesVisibles = Math.min(carriles, FILAS_DESKTOP - 1)
          return (
            <div key={w} role="row" style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: compacto ? 2 : 0 }}>
              {semana.map((f, d) => {
                const items = ordenarItemsDia(porDia[f] ?? [])
                const sueltos = items.filter(it => it.dia === it.diaFin)
                const tapadosPorBarra = items.length - sueltos.length - segs.filter(s => s.carril < carrilesVisibles && s.colInicio <= d && s.colFin >= d).length
                const caben = Math.max(0, FILAS_DESKTOP - carrilesVisibles)
                const mostrar = sueltos.slice(0, sueltos.length > caben ? caben - 1 : caben)
                const ocultos = sueltos.length - mostrar.length + tapadosPorBarra
                const esHoy = f === hoy
                const sel = f === seleccionado
                const feriado = items.find(it => it.capa === 'feriados')
                const nota = (notaItems[f]?.length ?? 0) > 0
                const esDestino = destino === f && arrastrando

                if (compacto) {
                  const capas = [...new Set(items.map(it => colorItem(it)))].slice(0, 4)
                  return (
                    <button
                      key={f}
                      role="gridcell"
                      aria-selected={sel}
                      aria-label={etiquetaCelda(f)}
                      onClick={() => onSeleccionar(f)}
                      style={{
                        height: 52, border: 'none', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
                        background: sel ? 'var(--surface)' : 'transparent',
                        boxShadow: sel ? 'var(--shadow-1)' : 'none',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', gap: 4, paddingTop: 5,
                        opacity: enMes(f) ? 1 : 0.4,
                      }}
                    >
                      <span style={{
                        width: 28, height: 28, lineHeight: '28px', borderRadius: 14, textAlign: 'center',
                        fontSize: 14, fontWeight: esHoy || sel ? 700 : 500, fontVariantNumeric: 'tabular-nums',
                        background: esHoy ? 'var(--navy)' : 'transparent',
                        color: esHoy ? '#fff' : feriado ? CAPA_POR_ID.feriados.color : 'var(--text-1)',
                      }}>
                        {Number(f.slice(8))}
                      </span>
                      <span style={{ display: 'flex', gap: 3, height: 6, alignItems: 'center' }}>
                        {capas.map(c => <span key={c} style={{ width: 6, height: 6, borderRadius: 3, background: c }} />)}
                        {nota && capas.length < 4 && <span style={{ width: 6, height: 6, borderRadius: 3, border: '1.5px solid var(--text-3)' }} />}
                      </span>
                    </button>
                  )
                }

                return (
                  <div
                    key={f}
                    role="gridcell"
                    aria-selected={sel}
                    aria-label={etiquetaCelda(f)}
                    tabIndex={sel ? 0 : -1}
                    className="cal-cell"
                    data-selected={sel || undefined}
                    onClick={() => onSeleccionar(f)}
                    onDoubleClick={() => onCrear(f)}
                    onKeyDown={e => { if (e.key === 'Enter') onCrear(f) }}
                    onDragOver={e => { if (arrastrando) { e.preventDefault(); setDestino(f) } }}
                    onDragLeave={() => setDestino(d2 => d2 === f ? null : d2)}
                    onDrop={e => {
                      e.preventDefault()
                      if (arrastrando && arrastrando.dia !== f) onMover(arrastrando, f)
                      setArrastrando(null); setDestino(null)
                    }}
                    style={{
                      position: 'relative', minHeight: 118, padding: `4px 4px 6px`, cursor: 'pointer',
                      borderRight: d < 6 ? '1px solid var(--border)' : 'none',
                      borderTop: w > 0 ? '1px solid var(--border)' : 'none',
                      background: esDestino ? 'var(--blue-bg)' : sel ? 'rgba(67,97,160,0.07)' : feriado ? CAPA_POR_ID.feriados.color + '08' : d >= 5 ? 'var(--bg)' : 'transparent',
                      outline: sel ? '2px solid var(--accent)' : 'none', outlineOffset: -2,
                      opacity: enMes(f) ? 1 : 0.55,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, height: CAB_H - 4 }}>
                      <span style={{
                        minWidth: 24, height: 24, lineHeight: '24px', borderRadius: 12, textAlign: 'center', padding: '0 4px',
                        fontSize: 12.5, fontWeight: esHoy ? 700 : 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
                        background: esHoy ? 'var(--navy)' : 'transparent',
                        color: esHoy ? '#fff' : feriado ? CAPA_POR_ID.feriados.color : 'var(--text-1)',
                      }}>
                        {Number(f.slice(8))}
                      </span>
                      {Number(f.slice(8)) === 1 && (
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                          {MESES[Number(f.slice(5, 7)) - 1].slice(0, 3)}
                        </span>
                      )}
                      {nota && <span className="material-symbols-outlined" title="Tiene notas" style={{ fontSize: 14, color: 'var(--text-3)' }}>sticky_note_2</span>}
                      <span style={{ flex: 1 }} />
                      <button
                        type="button"
                        className="cal-add"
                        aria-label={`Nuevo evento el ${fechaLarga(f)}`}
                        onClick={e => { e.stopPropagation(); onCrear(f) }}
                        style={{
                          width: 22, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
                          background: 'var(--navy)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
                      </button>
                    </div>
                    <div style={{ height: carrilesVisibles * BARRA_H }} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {mostrar.map(it => (
                        <ItemPill
                          key={it.id}
                          it={it}
                          compacta
                          onClick={onAbrir}
                          draggable={!it.soloLectura && !it.recurrente}
                          onDragStart={(e, x) => { e.dataTransfer.effectAllowed = 'move'; setArrastrando(x) }}
                        />
                      ))}
                      {ocultos > 0 && (
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); onSeleccionar(f) }}
                          style={{
                            background: 'none', border: 'none', textAlign: 'left', padding: '1px 6px', cursor: 'pointer',
                            fontSize: 11, fontWeight: 700, color: 'var(--text-2)', fontFamily: 'inherit',
                          }}
                        >
                          +{ocultos} más
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}

              {/* Barras de ítems de varios días — encima de las celdas */}
              {segs.filter(s => s.carril < carrilesVisibles).map(s => {
                const color = colorItem(s.item)
                return (
                  <button
                    key={s.item.id + '-' + w}
                    type="button"
                    onClick={() => onAbrir(s.item)}
                    title={s.item.titulo}
                    style={{
                      position: 'absolute',
                      top: CAB_H + s.carril * BARRA_H,
                      left: `calc(${(s.colInicio / 7) * 100}% + ${s.continuaAntes ? 0 : 4}px)`,
                      width: `calc(${((s.colFin - s.colInicio + 1) / 7) * 100}% - ${(s.continuaAntes ? 0 : 4) + (s.continuaDespues ? 0 : 4)}px)`,
                      height: BARRA_H - 3, display: 'flex', alignItems: 'center', gap: 4, padding: '0 6px',
                      border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                      borderRadius: `${s.continuaAntes ? 0 : 5}px ${s.continuaDespues ? 0 : 5}px ${s.continuaDespues ? 0 : 5}px ${s.continuaAntes ? 0 : 5}px`,
                      background: color + '2e', color: 'var(--text-1)', fontSize: 11, fontWeight: 700, textAlign: 'left',
                      borderLeft: s.continuaAntes ? 'none' : `3px solid ${color}`,
                    }}
                  >
                    {s.continuaAntes && <span className="material-symbols-outlined" style={{ fontSize: 12, color }}>arrow_back</span>}
                    <span className="material-symbols-outlined" style={{ fontSize: 12, color }}>{iconoItem(s.item)}</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.item.titulo}</span>
                    {s.continuaDespues && <span className="material-symbols-outlined" style={{ fontSize: 12, color, marginLeft: 'auto' }}>arrow_forward</span>}
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
