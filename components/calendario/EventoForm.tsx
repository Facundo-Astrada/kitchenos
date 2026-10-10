'use client'

// Alta / edición de un evento. Cambios respecto de la versión anterior:
// - Plantillas rápidas para lo que una cocina agenda siempre (reunión,
//   inventario mensual, limpieza profunda...): un toque arma tipo + título +
//   repetición. Es el atajo hasta que exista el motor de rutinas (F2).
// - "Todo el día" y "varios días" (fecha_fin) — antes todo evento era de
//   un día con hora.
// - Repetición real (diaria/semanal/quincenal/mensual/anual + "hasta"),
//   con el texto en humano ("Todos los martes"). El checkbox anterior se
//   guardaba y nunca se mostraba repetido.
// - Validación visible (fin antes que inicio) y error del guardado en
//   pantalla, no solo en la consola.

import { useEffect, useRef, useState } from 'react'
import { Modal, SwitchRow } from '@/components/ui'
import { TIPO_CONFIG, TODO_EL_DIA, type TipoEvento, type EventoCalendario, type Proveedor } from '@/lib/hooks/useCalendario'
import { minutos, pad2, parse, dowLunes, parseFrecuencia, ordinalEnMes, describirRepeticion, DIAS_LARGO } from '@/lib/calendario/fechas'
import { fieldStyle, labelStyle, btnPrimario, btnSecundario } from './shared'

export interface EventoFormData {
  titulo: string
  tipo: TipoEvento
  fecha_inicio: string
  fecha_fin: string
  varios_dias: boolean
  todo_el_dia: boolean
  hora_inicio: string
  hora_fin: string
  descripcion: string
  proveedor_id: string
  frecuencia: '' | 'diaria' | 'semanal' | 'quincenal' | 'mensual' | 'anual'
  /** Semanal: días elegidos (0 = lunes … 6 = domingo). Vacío = el día del inicio. */
  dias_semana: number[]
  /** Mensual: el mismo número de día, el N-ésimo día de semana, o el último. */
  modo_mensual: 'dia' | 'semana' | 'ultimo'
  repetir_hasta: string
}

export function formVacio(fecha: string, hora?: string): EventoFormData {
  const ini = hora ?? '09:00'
  const fin = `${pad2(Math.min(23, Number(ini.slice(0, 2)) + 1))}:${ini.slice(3, 5)}`
  return {
    titulo: '', tipo: 'evento_equipo', fecha_inicio: fecha, fecha_fin: fecha, varios_dias: false,
    todo_el_dia: false, hora_inicio: ini, hora_fin: fin, descripcion: '', proveedor_id: '',
    frecuencia: '', dias_semana: [], modo_mensual: 'dia', repetir_hasta: '',
  }
}

export function formDesdeEvento(ev: EventoCalendario): EventoFormData {
  const todo = ev.hora_inicio?.startsWith('00:00') && ev.hora_fin?.startsWith('23:59')
  const varios = !ev.recurrente && !!ev.fecha_fin && ev.fecha_fin > ev.fecha_inicio
  return {
    titulo: ev.titulo, tipo: ev.tipo, fecha_inicio: ev.fecha_inicio,
    fecha_fin: varios ? ev.fecha_fin! : ev.fecha_inicio, varios_dias: varios,
    todo_el_dia: todo || varios,
    hora_inicio: todo ? '09:00' : ev.hora_inicio?.slice(0, 5) ?? '09:00',
    hora_fin: todo ? '10:00' : ev.hora_fin?.slice(0, 5) ?? '10:00',
    descripcion: ev.descripcion ?? '', proveedor_id: ev.proveedor_id ?? '',
    ...repeticionDesdeTexto(ev.recurrente ? ev.frecuencia ?? 'semanal' : null),
    repetir_hasta: ev.recurrente ? ev.fecha_fin ?? '' : '',
  }
}

/** 'semanal:1,4' / 'mensual:2' → campos del form (ver parseFrecuencia). */
function repeticionDesdeTexto(frecuencia: string | null): Pick<EventoFormData, 'frecuencia' | 'dias_semana' | 'modo_mensual'> {
  if (!frecuencia) return { frecuencia: '', dias_semana: [], modo_mensual: 'dia' }
  const { tipo, dias, ordinal } = parseFrecuencia(frecuencia)
  return {
    frecuencia: tipo,
    dias_semana: dias ?? [],
    modo_mensual: ordinal === -1 ? 'ultimo' : ordinal ? 'semana' : 'dia',
  }
}

/** Campos del form → texto de `eventos.frecuencia`. */
export function frecuenciaTexto(f: Pick<EventoFormData, 'frecuencia' | 'dias_semana' | 'modo_mensual' | 'fecha_inicio'>): string | null {
  if (!f.frecuencia) return null
  if (f.frecuencia === 'semanal') {
    const dias = [...new Set(f.dias_semana)].sort()
    // Un solo día igual al del inicio = el 'semanal' de siempre.
    if (dias.length === 0 || (dias.length === 1 && dias[0] === dowLunes(f.fecha_inicio))) return 'semanal'
    return 'semanal:' + dias.join(',')
  }
  if (f.frecuencia === 'mensual') {
    if (f.modo_mensual === 'ultimo') return 'mensual:-1'
    if (f.modo_mensual === 'semana') {
      // Un 5º <día> no existe todos los meses: se guarda como "el último".
      const { n, esUltimo } = ordinalEnMes(f.fecha_inicio)
      return n <= 4 ? 'mensual:' + n : esUltimo ? 'mensual:-1' : 'mensual'
    }
    return 'mensual'
  }
  return f.frecuencia
}

/** Lo que se guarda en `eventos` a partir del form. */
export function payloadDesdeForm(f: EventoFormData) {
  const recurrente = f.frecuencia !== ''
  const todo = f.todo_el_dia || f.varios_dias
  const frecuencia = frecuenciaTexto(f)
  return {
    titulo: f.titulo.trim(),
    tipo: f.tipo,
    fecha_inicio: f.fecha_inicio,
    // fecha_fin: último día si es de varios días; fin de la serie si se repite.
    fecha_fin: recurrente ? (f.repetir_hasta || null) : (f.varios_dias && f.fecha_fin > f.fecha_inicio ? f.fecha_fin : null),
    hora_inicio: todo ? TODO_EL_DIA.inicio : f.hora_inicio + ':00',
    hora_fin: todo ? TODO_EL_DIA.fin : f.hora_fin + ':00',
    descripcion: f.descripcion.trim() || null,
    recurrente,
    frecuencia: recurrente ? frecuencia : null,
    color: TIPO_CONFIG[f.tipo].color,
    proveedor_id: f.tipo === 'entrega_proveedor' && f.proveedor_id ? f.proveedor_id : null,
    usuario_id: null,
  }
}

const PLANTILLAS: { label: string; icon: string; aplicar: (f: EventoFormData) => Partial<EventoFormData> }[] = [
  { label: 'Reunión de equipo', icon: 'groups', aplicar: () => ({ titulo: 'Reunión de equipo', tipo: 'evento_equipo', todo_el_dia: false, hora_inicio: '16:00', hora_fin: '17:00', frecuencia: 'semanal' }) },
  { label: 'Inventario mensual', icon: 'inventory_2', aplicar: f => ({ titulo: 'Inventario mensual', tipo: 'otro', todo_el_dia: true, frecuencia: 'mensual', fecha_inicio: f.fecha_inicio.slice(0, 8) + '01' }) },
  { label: 'Limpieza profunda', icon: 'cleaning_services', aplicar: () => ({ titulo: 'Limpieza profunda', tipo: 'mantenimiento', todo_el_dia: false, hora_inicio: '10:00', hora_fin: '12:00', frecuencia: 'semanal' }) },
  { label: 'Capacitación', icon: 'school', aplicar: () => ({ titulo: 'Capacitación', tipo: 'capacitacion', todo_el_dia: false, hora_inicio: '15:00', hora_fin: '16:30', frecuencia: '' }) },
  { label: 'Control de costos', icon: 'calculate', aplicar: f => ({ titulo: 'Revisar costeo de recetas', tipo: 'otro', todo_el_dia: true, frecuencia: 'mensual', fecha_inicio: f.fecha_inicio.slice(0, 8) + '01' }) },
  { label: 'Service de equipos', icon: 'build', aplicar: () => ({ titulo: 'Service de equipos', tipo: 'mantenimiento', todo_el_dia: false, hora_inicio: '09:00', hora_fin: '11:00', frecuencia: '' }) },
]

export function EventoForm({ open, editando, inicial, proveedores, onClose, onGuardar }: {
  open: boolean
  editando: boolean
  inicial: EventoFormData
  proveedores: Proveedor[]
  onClose: () => void
  onGuardar: (f: EventoFormData) => Promise<void>
}) {
  const [f, setF] = useState(inicial)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const tituloRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (open) { setF(inicial); setError('') } }, [open, inicial])
  useEffect(() => { if (open && !editando) setTimeout(() => tituloRef.current?.focus(), 80) }, [open, editando])

  const set = (p: Partial<EventoFormData>) => setF(prev => ({ ...prev, ...p }))

  // Cambiar el inicio corre el fin con la misma duración (como Google).
  const cambiarInicio = (h: string) => {
    const dur = Math.max(30, minutos(f.hora_fin) - minutos(f.hora_inicio))
    const finMin = Math.min(23 * 60 + 59, minutos(h) + dur)
    set({ hora_inicio: h, hora_fin: `${pad2(Math.floor(finMin / 60))}:${pad2(finMin % 60)}` })
  }

  const errHora = !f.todo_el_dia && !f.varios_dias && minutos(f.hora_fin) <= minutos(f.hora_inicio)
    ? 'La hora de fin tiene que ser después del inicio.' : ''
  const errFin = f.varios_dias && f.fecha_fin < f.fecha_inicio ? 'El último día no puede ser antes del primero.' : ''
  const errHasta = f.frecuencia && f.repetir_hasta && f.repetir_hasta < f.fecha_inicio ? 'La repetición no puede terminar antes de empezar.' : ''
  const valido = f.titulo.trim() && !errHora && !errFin && !errHasta

  const guardar = async () => {
    if (!valido || guardando) return
    setGuardando(true); setError('')
    try { await onGuardar(f) }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar') }
    finally { setGuardando(false) }
  }

  // Repetición a la vista (chips), no escondida en un desplegable: "semanal"
  // existía pero no se encontraba. Semanal permite varios días; mensual,
  // "el día 11" o "el segundo domingo".
  const d = parse(f.fecha_inicio)
  const dowInicio = dowLunes(f.fecha_inicio)
  const diasSel = f.dias_semana.length ? f.dias_semana : [dowInicio]
  const { n: nSemana, esUltimo } = ordinalEnMes(f.fecha_inicio)
  const diaInicio = DIAS_LARGO[dowInicio].toLowerCase()
  const ORD = ['', 'primer', 'segundo', 'tercer', 'cuarto']
  const OPCIONES_REP: { v: EventoFormData['frecuencia']; l: string }[] = [
    { v: '', l: 'No se repite' },
    { v: 'diaria', l: 'Diaria' },
    { v: 'semanal', l: 'Semanal' },
    { v: 'quincenal', l: 'Cada 2 semanas' },
    { v: 'mensual', l: 'Mensual' },
    { v: 'anual', l: 'Anual' },
  ]
  const toggleDia = (i: number) => {
    const next = diasSel.includes(i) ? diasSel.filter(x => x !== i) : [...diasSel, i]
    if (next.length) set({ dias_semana: next.sort() })
  }
  const resumenRep = f.frecuencia ? describirRepeticion(f.fecha_inicio, frecuenciaTexto(f)) : ''

  return (
    <Modal open={open} onClose={onClose} maxWidth={560}>
      <form
        onSubmit={e => { e.preventDefault(); guardar() }}
        style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>{editando ? 'Editar evento' : 'Nuevo evento'}</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', padding: 4 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22 }}>close</span>
          </button>
        </div>

        {!editando && (
          <div>
            <span style={labelStyle}>Plantillas rápidas</span>
            <div className="hide-scrollbar" style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
              {PLANTILLAS.map(p => (
                <button key={p.label} type="button" onClick={() => set(p.aplicar(f))} style={{
                  display: 'flex', alignItems: 'center', gap: 5, padding: '7px 11px', borderRadius: 99, flexShrink: 0,
                  border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-2)',
                  fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{p.icon}</span>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <label htmlFor="ev-titulo" style={labelStyle}>Título</label>
          <input id="ev-titulo" ref={tituloRef} style={{ ...fieldStyle, fontSize: 16, fontWeight: 600 }} placeholder="Ej: Reunión con el equipo de salón"
            value={f.titulo} onChange={e => set({ titulo: e.target.value })} />
        </div>

        <div>
          <span style={labelStyle}>Tipo</span>
          <div className="hide-scrollbar" style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
            {(Object.keys(TIPO_CONFIG) as TipoEvento[]).filter(t => t !== 'reservas_dia').map(t => {
              const cfg = TIPO_CONFIG[t]
              const sel = f.tipo === t
              return (
                <button key={t} type="button" aria-pressed={sel} onClick={() => set({ tipo: t })} style={{
                  display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 99, flexShrink: 0,
                  border: sel ? `2px solid ${cfg.color}` : '1px solid var(--border)', background: sel ? cfg.color + '18' : 'var(--surface)',
                  color: sel ? 'var(--text-1)' : 'var(--text-2)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit',
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 17, color: cfg.color }}>{cfg.icon}</span>
                  {cfg.label}
                </button>
              )
            })}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label htmlFor="ev-fecha" style={labelStyle}>{f.varios_dias ? 'Desde' : 'Fecha'}</label>
            <input id="ev-fecha" type="date" style={fieldStyle} value={f.fecha_inicio}
              onChange={e => set({ fecha_inicio: e.target.value, fecha_fin: f.fecha_fin < e.target.value ? e.target.value : f.fecha_fin })} />
          </div>
          {f.varios_dias && (
            <div style={{ flex: 1 }}>
              <label htmlFor="ev-hasta" style={labelStyle}>Hasta</label>
              <input id="ev-hasta" type="date" style={fieldStyle} min={f.fecha_inicio} value={f.fecha_fin} onChange={e => set({ fecha_fin: e.target.value })} />
            </div>
          )}
        </div>
        {errFin && <Err>{errFin}</Err>}

        <div style={{ borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: '2px 0' }}>
          <SwitchRow icon="wb_sunny" label="Todo el día" sub="Sin hora: inventario, feriado interno, día de evento"
            checked={f.todo_el_dia || f.varios_dias} onChange={v => set({ todo_el_dia: v, ...(v ? {} : { varios_dias: false }) })} />
          {!f.frecuencia && (
            <SwitchRow icon="date_range" label="Varios días" sub="Una barra que cruza los días (feria, vacaciones, obra)"
              checked={f.varios_dias} onChange={v => set({ varios_dias: v, todo_el_dia: v || f.todo_el_dia })} />
          )}
        </div>

        {!f.todo_el_dia && !f.varios_dias && (
          <>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label htmlFor="ev-hi" style={labelStyle}>Empieza</label>
                <input id="ev-hi" type="time" style={fieldStyle} value={f.hora_inicio} onChange={e => cambiarInicio(e.target.value)} />
              </div>
              <div style={{ flex: 1 }}>
                <label htmlFor="ev-hf" style={labelStyle}>Termina</label>
                <input id="ev-hf" type="time" style={{ ...fieldStyle, borderColor: errHora ? 'var(--red)' : undefined }} value={f.hora_fin} onChange={e => set({ hora_fin: e.target.value })} />
              </div>
            </div>
            {errHora && <Err>{errHora}</Err>}
          </>
        )}

        {!f.varios_dias && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <span style={labelStyle}>Repetir</span>
              <div role="radiogroup" aria-label="Repetir" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {OPCIONES_REP.map(o => (
                  <Chip key={o.v} on={f.frecuencia === o.v} onClick={() => set({ frecuencia: o.v })} role="radio">{o.l}</Chip>
                ))}
              </div>
            </div>

            {f.frecuencia === 'semanal' && (
              <div>
                <span style={labelStyle}>Qué días</span>
                <div role="group" aria-label="Días de la semana" style={{ display: 'flex', gap: 6 }}>
                  {DIAS_LARGO.map((nombre, i) => {
                    const on = diasSel.includes(i)
                    return (
                      <button key={nombre} type="button" aria-pressed={on} aria-label={nombre} title={nombre} onClick={() => toggleDia(i)} style={{
                        flex: 1, maxWidth: 52, height: 40, borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
                        border: on ? 'none' : '1px solid var(--border)', background: on ? 'var(--navy)' : 'var(--surface)',
                        color: on ? '#fff' : 'var(--text-2)', fontSize: 13, fontWeight: 700,
                      }}>
                        {nombre.charAt(0)}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {f.frecuencia === 'mensual' && (
              <div role="radiogroup" aria-label="Qué día del mes" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <Chip on={f.modo_mensual === 'dia'} onClick={() => set({ modo_mensual: 'dia' })} role="radio">El día {d.getDate()}</Chip>
                {nSemana <= 4 && (
                  <Chip on={f.modo_mensual === 'semana'} onClick={() => set({ modo_mensual: 'semana' })} role="radio">El {ORD[nSemana]} {diaInicio}</Chip>
                )}
                {esUltimo && (
                  <Chip on={f.modo_mensual === 'ultimo'} onClick={() => set({ modo_mensual: 'ultimo' })} role="radio">El último {diaInicio}</Chip>
                )}
              </div>
            )}

            {f.frecuencia && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                <div style={{ flex: 1, fontSize: 13, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 12 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--accent)' }}>repeat</span>
                  {resumenRep}
                </div>
                <div style={{ flex: 1 }}>
                  <label htmlFor="ev-rh" style={labelStyle}>Hasta (opcional)</label>
                  <input id="ev-rh" type="date" style={fieldStyle} min={f.fecha_inicio} value={f.repetir_hasta} onChange={e => set({ repetir_hasta: e.target.value })} />
                </div>
              </div>
            )}
          </div>
        )}
        {errHasta && <Err>{errHasta}</Err>}

        {f.tipo === 'entrega_proveedor' && (
          <div>
            <label htmlFor="ev-prov" style={labelStyle}>Proveedor</label>
            <select id="ev-prov" style={fieldStyle} value={f.proveedor_id} onChange={e => set({ proveedor_id: e.target.value })}>
              <option value="">Seleccionar proveedor</option>
              {proveedores.map(pv => <option key={pv.id} value={pv.id}>{pv.nombre}</option>)}
            </select>
          </div>
        )}

        <div>
          <label htmlFor="ev-desc" style={labelStyle}>Notas</label>
          <textarea id="ev-desc" style={{ ...fieldStyle, minHeight: 72, resize: 'vertical' }} placeholder="Quién va, qué llevar, qué preparar…"
            value={f.descripcion} onChange={e => set({ descripcion: e.target.value })} />
        </div>

        {error && <Err>No se pudo guardar: {error}</Err>}

        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" onClick={onClose} style={btnSecundario}>Cancelar</button>
          <button type="submit" disabled={!valido || guardando} style={{ ...btnPrimario, opacity: valido && !guardando ? 1 : 0.5 }}>
            {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear evento'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function Chip({ on, onClick, children, role }: { on: boolean; onClick: () => void; children: React.ReactNode; role?: string }) {
  return (
    <button type="button" role={role} aria-checked={role === 'radio' ? on : undefined} onClick={onClick} style={{
      padding: '8px 13px', borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
      border: on ? 'none' : '1px solid var(--border)', background: on ? 'var(--navy)' : 'var(--surface)',
      color: on ? '#fff' : 'var(--text-2)',
    }}>
      {children}
    </button>
  )
}

function Err({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--red-fg)', background: 'var(--red-bg)', padding: '8px 10px', borderRadius: 10, marginTop: -6 }}>
      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>error</span>
      {children}
    </div>
  )
}
