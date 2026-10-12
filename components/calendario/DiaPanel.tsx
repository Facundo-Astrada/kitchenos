'use client'

// Panel del día seleccionado: qué hay (eventos + reflejos, ordenados) y las
// notas del día (ítems sueltos enviables a Producción — el bloque vive en
// NotasDia, compartido con el panel del día de Turnos).

import { ordenarItemsDia, type ItemCalendario, type NotaItemCalendario } from '@/lib/hooks/useCalendario'
import { fechaLarga, fechaRelativa } from '@/lib/calendario/fechas'
import type { todasLasPlazas } from '@/lib/constants'
import type { Plaza } from '@/types'
import { ItemFila } from './shared'
import { NotasDia } from './NotasDia'

type PlazasCustom = Parameters<typeof todasLasPlazas>[0]

export function DiaPanel({
  fecha, items, notas, plazasCustom, puedePlanificar,
  onAbrir, onCrear, onPlanificar, onAgregarNota, onEliminarNota, onEnviarNota,
}: {
  fecha: string
  items: ItemCalendario[]
  notas: NotaItemCalendario[]
  plazasCustom: PlazasCustom
  puedePlanificar: boolean
  onAbrir: (it: ItemCalendario) => void
  onCrear: () => void
  onPlanificar: () => void
  onAgregarNota: (texto: string) => Promise<void>
  onEliminarNota: (id: string) => void
  onEnviarNota: (item: NotaItemCalendario, plaza: Plaza) => Promise<void>
}) {
  const rel = fechaRelativa(fecha)
  const ordenados = ordenarItemsDia(items)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {rel && <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{rel}</div>}
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text-1)' }}>{fechaLarga(fecha)}</h2>
        </div>
        {puedePlanificar && (
          <button type="button" onClick={onPlanificar} title="Planificar un evento del catálogo" aria-label="Planificar evento" style={{
            width: 40, height: 40, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)',
            color: 'var(--text-2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>celebration</span>
          </button>
        )}
        <button type="button" onClick={onCrear} style={{
          height: 40, padding: '0 14px', borderRadius: 10, border: 'none', background: 'var(--navy)', color: '#fff',
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
          Evento
        </button>
      </div>

      {ordenados.length === 0 ? (
        <div style={{ padding: '14px 12px', borderRadius: 12, border: '1px dashed var(--border)', fontSize: 13, color: 'var(--text-3)', textAlign: 'center' }}>
          Nada agendado este día.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {ordenados.map(it => <ItemFila key={it.id} it={it} onClick={onAbrir} />)}
        </div>
      )}

      <NotasDia
        notas={notas}
        plazasCustom={plazasCustom}
        onAgregar={onAgregarNota}
        onEliminar={onEliminarNota}
        onEnviar={onEnviarNota}
      />
    </div>
  )
}
