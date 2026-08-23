'use client'

import { useMemo, useState } from 'react'
import PageTransition from '@/components/PageTransition'
import PageHeader from '@/components/shell/PageHeader'
import ActionButton from '@/components/shell/ActionButton'
import { SegmentedTabs, EmptyState, Num } from '@/components/ui'
import type { SegmentedTab } from '@/components/ui'
import { useReservas } from '@/lib/hooks/useReservas'
import { semanaDeFecha, cubiertosVivos } from '@/lib/reservas/helpers'
import { sumarDias, fechaEnTz } from '@/lib/ops/turnos'
import { ESTADO_RESERVA_CONFIG } from '@/components/reservas/config'
import ReservaSheet from '@/components/reservas/ReservaSheet'
import type { Reserva } from '@/types'

type Vista = 'dia' | 'semana'
const TABS: SegmentedTab<Vista>[] = [
  { id: 'dia', label: 'Día' },
  { id: 'semana', label: 'Semana' },
]

const DIA_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

function fmtDia(fecha: string): string {
  return new Date(fecha + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month: 'long' })
}

function fmtHora(hora: string): string {
  return hora.slice(0, 5)
}

export default function ReservasPage() {
  const hoy = useMemo(() => fechaEnTz(new Date()), [])
  const [vista, setVista] = useState<Vista>('dia')
  const [fecha, setFecha] = useState(hoy)
  const [sheetAbierto, setSheetAbierto] = useState(false)
  const [reservaEditando, setReservaEditando] = useState<Reserva | null>(null)

  const semana = useMemo(() => semanaDeFecha(fecha), [fecha])
  const desde = semana[0]
  const hasta = semana[6]

  const { reservas, loading, crearReserva, actualizarReserva, eliminarReserva } = useReservas(desde, hasta)

  const reservasDelDia = useMemo(
    () => reservas.filter(r => r.fecha === fecha).sort((a, b) => a.hora.localeCompare(b.hora)),
    [reservas, fecha]
  )

  const porDia = useMemo(() => {
    const m = new Map<string, Reserva[]>()
    for (const f of semana) m.set(f, [])
    for (const r of reservas) m.get(r.fecha)?.push(r)
    return m
  }, [reservas, semana])

  function irADia(f: string) {
    setFecha(f)
    setVista('dia')
  }

  function abrirNueva() {
    setReservaEditando(null)
    setSheetAbierto(true)
  }

  function abrirEditar(r: Reserva) {
    setReservaEditando(r)
    setSheetAbierto(true)
  }

  return (
    <PageTransition>
      <div className="flex flex-col h-full" style={{ overflow: 'hidden' }}>
        <PageHeader
          title="Reservas"
          icon="event_seat"
          actions={<ActionButton icon="add" label="Nueva" onClick={abrirNueva} />}
          below={
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <SegmentedTabs tabs={TABS} active={vista} onChange={setVista} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={() => setFecha(f => sumarDias(f, vista === 'dia' ? -1 : -7))}
                  style={{ background: 'rgba(255,255,255,.1)', border: 'none', borderRadius: 8, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#fff' }}>chevron_left</span>
                </button>
                <div style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', textTransform: 'capitalize', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {vista === 'dia' ? fmtDia(fecha) : `${fmtDia(desde)} — ${fmtDia(hasta)}`}
                  </div>
                  {fecha !== hoy && (
                    <button
                      onClick={() => setFecha(hoy)}
                      style={{ background: 'none', border: 'none', padding: 0, marginTop: 2, cursor: 'pointer', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.55)', fontFamily: 'inherit' }}
                    >
                      Volver a hoy
                    </button>
                  )}
                </div>
                <button
                  onClick={() => setFecha(f => sumarDias(f, vista === 'dia' ? 1 : 7))}
                  style={{ background: 'rgba(255,255,255,.1)', border: 'none', borderRadius: 8, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#fff' }}>chevron_right</span>
                </button>
              </div>
            </div>
          }
        />

        <div className="flex-1 overflow-y-auto" style={{ paddingBottom: 100 }}>
          {loading ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Cargando…</div>
          ) : vista === 'dia' ? (
            reservasDelDia.length === 0 ? (
              <EmptyState
                icon="event_seat"
                title="Sin reservas para este día"
                subtitle="Tocá «Nueva» para cargar una."
                cta={{ label: 'Nueva reserva', onClick: abrirNueva }}
              />
            ) : (
              <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 700, padding: '0 2px' }}>
                  {reservasDelDia.length} reserva{reservasDelDia.length === 1 ? '' : 's'} · {cubiertosVivos(reservasDelDia)} cubiertos
                </div>
                {reservasDelDia.map(r => {
                  const cfg = ESTADO_RESERVA_CONFIG[r.estado]
                  return (
                    <button
                      key={r.id}
                      onClick={() => abrirEditar(r)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', textAlign: 'left',
                        background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)',
                        cursor: 'pointer', fontFamily: 'inherit', width: '100%',
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 44, flexShrink: 0 }}>
                        <Num style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>{fmtHora(r.hora)}</Num>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.nombre}
                        </p>
                        <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '2px 0 0' }}>
                          {r.pax} pax{r.telefono ? ` · ${r.telefono}` : ''}
                        </p>
                      </div>
                      <span style={{
                        display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
                        fontSize: 11, fontWeight: 700, padding: '4px 9px', borderRadius: 99,
                        background: `${cfg.color}1f`, color: cfg.color,
                      }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{cfg.icon}</span>
                        {cfg.label}
                      </span>
                    </button>
                  )
                })}
              </div>
            )
          ) : (
            <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {semana.map((f, i) => {
                const del = porDia.get(f) ?? []
                const esHoy = f === hoy
                return (
                  <button
                    key={f}
                    onClick={() => irADia(f)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', textAlign: 'left',
                      background: 'var(--surface)', borderRadius: 14,
                      border: esHoy ? '1.5px solid var(--accent)' : '1px solid var(--border)',
                      cursor: 'pointer', fontFamily: 'inherit', width: '100%',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 44, flexShrink: 0 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>{DIA_LABELS[i]}</span>
                      <span style={{ fontSize: 17, fontWeight: 700, color: esHoy ? 'var(--accent)' : 'var(--text-1)' }}>{f.slice(8, 10)}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {del.length === 0 ? (
                        <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>Sin reservas</p>
                      ) : (
                        <p style={{ fontSize: 13, color: 'var(--text-1)', margin: 0, fontWeight: 600 }}>
                          {del.length} reserva{del.length === 1 ? '' : 's'} · {cubiertosVivos(del)} cubiertos
                        </p>
                      )}
                    </div>
                    <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--text-3)', flexShrink: 0 }}>chevron_right</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {sheetAbierto && (
          <ReservaSheet
            reserva={reservaEditando}
            fechaInicial={fecha}
            onClose={() => setSheetAbierto(false)}
            onCreate={crearReserva}
            onUpdate={actualizarReserva}
            onDelete={eliminarReserva}
          />
        )}
      </div>
    </PageTransition>
  )
}
