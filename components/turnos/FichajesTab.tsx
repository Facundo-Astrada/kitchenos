'use client'

// Pestaña Fichajes de /turnos (M3): mis fichajes (todos los roles, sin costos)
// y, para quien administra, quién está adentro ahora + historial por persona
// con corrección manual. La lógica es la que ya vivía en la página; acá solo
// se separó del armado de la planilla.

import { useCallback, useEffect, useState } from 'react'
import { useFichaje, type FichajeDia } from '@/lib/hooks/useFichaje'
import { useAuth } from '@/lib/auth/context'
import { Modal, Avatar } from '@/components/ui'
import { DIAS_CORTO, dowLunes, parse, hoy as hoyStr, addDays } from '@/lib/calendario/fechas'
import { fieldStyle, labelStyle, tituloSeccion } from './shared'

interface MiembroFichaje { id: string; nombre: string; apellido: string; auth_user_id: string | null }

const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
const diaCorto = (f: string) => `${DIAS_CORTO[dowLunes(f)]} ${parse(f).getDate()}/${parse(f).getMonth() + 1}`

function toTimeInputValue(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const tarjeta: React.CSSProperties = {
  background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', boxShadow: 'var(--shadow-1)', overflow: 'hidden',
}

function FilaFichaje({ f, onClick }: { f: FichajeDia; onClick?: () => void }) {
  const contenido = (
    <>
      <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)', flex: 1 }}>{diaCorto(f.fecha)}</span>
      <span style={{ fontSize: 12.5, color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums' }}>
        {f.entrada ? hora(f.entrada) : '—'}{' → '}{f.salida ? hora(f.salida) : 'en curso'}
      </span>
      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy-ink)', minWidth: 48, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {f.horas_total !== null ? `${f.horas_total.toFixed(1)} h` : '—'}
      </span>
      <span className="material-symbols-outlined" title={f.editado_por ? 'Corregido a mano' : undefined} style={{ fontSize: 15, width: 15, color: 'var(--text-3)', visibility: f.editado_por ? 'visible' : 'hidden' }}>edit</span>
    </>
  )
  const estilo: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', width: '100%', textAlign: 'left' }
  return onClick
    ? <button type="button" onClick={onClick} className="turno-celda" style={{ ...estilo, border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}>{contenido}</button>
    : <div style={estilo}>{contenido}</div>
}

export function FichajesTab({ miembros, isAdmin, dosColumnas, onToast }: {
  miembros: MiembroFichaje[]
  isAdmin: boolean
  dosColumnas: boolean
  onToast: (msg: string, error?: boolean) => void
}) {
  const { user } = useAuth()
  const { fetchQuienEstaAdentro, fetchHistorial, guardarFichajeManual } = useFichaje()

  const [quienAdentro, setQuienAdentro] = useState<(FichajeDia & { nombre: string })[]>([])
  const [loadingAdentro, setLoadingAdentro] = useState(false)
  const [personaId, setPersonaId] = useState<string | null>(null)
  const [historial, setHistorial] = useState<FichajeDia[]>([])
  const [mios, setMios] = useState<FichajeDia[]>([])
  const [editando, setEditando] = useState<{ id?: string; usuarioId: string; fecha: string; entrada: string; salida: string } | null>(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (isAdmin) {
      setLoadingAdentro(true)
      fetchQuienEstaAdentro().then(setQuienAdentro).finally(() => setLoadingAdentro(false))
    }
    if (user?.id) fetchHistorial(user.id, addDays(hoyStr(), -14), hoyStr()).then(setMios)
  }, [isAdmin, user?.id, fetchQuienEstaAdentro, fetchHistorial])

  const cargarHistorial = useCallback((id: string) => {
    fetchHistorial(id, addDays(hoyStr(), -7), hoyStr()).then(setHistorial)
  }, [fetchHistorial])

  useEffect(() => {
    if (!personaId) { setHistorial([]); return }
    cargarHistorial(personaId)
  }, [personaId, cargarHistorial])

  function abrirEdicion(f?: FichajeDia) {
    const usuarioId = f?.usuario_id ?? personaId
    if (!usuarioId) return
    setEditando({
      id: f?.id, usuarioId,
      fecha: f?.fecha ?? hoyStr(),
      entrada: f?.entrada ? toTimeInputValue(f.entrada) : '',
      salida: f?.salida ? toTimeInputValue(f.salida) : '',
    })
  }

  async function guardarEdicion() {
    if (!editando) return
    setGuardando(true)
    try {
      const iso = (h: string) => (h ? new Date(`${editando.fecha}T${h}:00`).toISOString() : null)
      await guardarFichajeManual({
        id: editando.id, usuarioId: editando.usuarioId, fecha: editando.fecha,
        entrada: iso(editando.entrada), salida: iso(editando.salida),
      })
      onToast('Fichaje guardado')
      setEditando(null)
      if (personaId) cargarHistorial(personaId)
    } catch (e: unknown) {
      onToast(e instanceof Error ? e.message : 'Error al guardar el fichaje', true)
    } finally {
      setGuardando(false)
    }
  }

  const totalMias = mios.reduce((s, f) => s + (f.horas_total ?? 0), 0)
  const vacio = (txt: string) => (
    <div style={{ padding: '14px 12px', borderRadius: 12, border: '1px dashed var(--border)', fontSize: 13, color: 'var(--text-3)', textAlign: 'center' }}>{txt}</div>
  )

  const misFichajes = (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 22 }}>
        <span style={tituloSeccion}>Mis fichajes · 14 días</span>
        <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums' }}>{totalMias.toFixed(1)} h</span>
      </div>
      {mios.length === 0 ? vacio('Sin fichajes registrados todavía.') : (
        <div style={tarjeta}>
          {mios.map((f, i) => (
            <div key={f.id} style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}><FilaFichaje f={f} /></div>
          ))}
        </div>
      )}
    </section>
  )

  const admin = isAdmin && (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ ...tituloSeccion, minHeight: 22, display: 'flex', alignItems: 'center' }}>Quién está adentro ahora{quienAdentro.length > 0 ? ` · ${quienAdentro.length}` : ''}</span>
        {loadingAdentro ? <div className="skeleton-pulse" style={{ height: 48, borderRadius: 12, background: 'var(--border)' }} />
          : quienAdentro.length === 0 ? vacio('Nadie fichó entrada todavía hoy.')
          : (
            <div style={tarjeta}>
              {quienAdentro.map((f, i) => (
                <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                  <Avatar name={f.nombre} size={28} />
                  <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)' }}>{f.nombre}</span>
                  <span style={{ width: 8, height: 8, borderRadius: 4, background: 'var(--green)', flexShrink: 0 }} />
                  <span style={{ fontSize: 12.5, color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums' }}>desde {hora(f.entrada!)}</span>
                </div>
              ))}
            </div>
          )}
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={tituloSeccion}>Historial de 7 días por persona</span>
          {personaId && (
            <button type="button" onClick={() => abrirEdicion()} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 3, fontSize: 12.5, fontWeight: 700, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>Agregar fichaje
            </button>
          )}
        </div>
        <select value={personaId ?? ''} onChange={e => setPersonaId(e.target.value || null)} style={fieldStyle} aria-label="Persona">
          <option value="">Elegir persona…</option>
          {miembros.filter(m => m.auth_user_id).map(m => (
            <option key={m.id} value={m.auth_user_id!}>{m.nombre} {m.apellido}</option>
          ))}
        </select>
        {personaId && (historial.length === 0 ? vacio('Sin fichajes en los últimos 7 días.') : (
          <div style={tarjeta}>
            {historial.map((f, i) => (
              <div key={f.id} style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                <FilaFichaje f={f} onClick={() => abrirEdicion(f)} />
              </div>
            ))}
          </div>
        ))}
      </section>
    </div>
  )

  return (
    <div style={dosColumnas && isAdmin
      ? { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 28, alignItems: 'start', maxWidth: 1100 }
      : { display: 'flex', flexDirection: 'column', gap: 22, maxWidth: 560 }}>
      {misFichajes}
      {admin}

      <Modal open={!!editando} onClose={() => setEditando(null)} maxWidth={420}>
        {editando && (
          <div style={{ padding: 20, paddingBottom: 'max(env(safe-area-inset-bottom, 20px), 20px)' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', marginBottom: 14 }}>
              {editando.id ? 'Corregir fichaje' : 'Agregar fichaje'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={labelStyle}>Fecha</label>
                <input type="date" style={fieldStyle} value={editando.fecha}
                  onChange={e => setEditando(prev => prev && { ...prev, fecha: e.target.value })} />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Entrada</label>
                  <input type="time" style={fieldStyle} value={editando.entrada}
                    onChange={e => setEditando(prev => prev && { ...prev, entrada: e.target.value })} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Salida</label>
                  <input type="time" style={fieldStyle} value={editando.salida}
                    onChange={e => setEditando(prev => prev && { ...prev, salida: e.target.value })} />
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button type="button" onClick={() => setEditando(null)} style={{
                flex: 1, padding: 14, borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border)',
                fontSize: 14, fontWeight: 600, color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'inherit',
              }}>Cancelar</button>
              <button type="button" onClick={guardarEdicion} disabled={guardando} style={{
                flex: 1, padding: 14, borderRadius: 12, background: 'var(--navy)', border: 'none',
                fontSize: 14, fontWeight: 700, color: '#fff', cursor: 'pointer', opacity: guardando ? 0.6 : 1, fontFamily: 'inherit',
              }}>{guardando ? 'Guardando…' : 'Guardar'}</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
