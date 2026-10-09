'use client'

// Vista Agenda — lista cronológica de lo que viene (el "Schedule" de Google
// Calendar). En el celular es la forma más rápida de contestar "¿qué tengo
// esta semana?" sin abrir día por día. Los días vacíos no ocupan lugar; hoy
// siempre aparece, aunque esté vacío, como ancla.

import { ordenarItemsDia, type ItemCalendario } from '@/lib/hooks/useCalendario'
import { DIAS_CORTO, MESES, dowLunes, fechaRelativa, hoy as hoyStr, parse } from '@/lib/calendario/fechas'
import { EmptyState } from '@/components/ui'
import { ItemFila } from './shared'

export function AgendaLista({ dias, porDia, onAbrir, onSeleccionar, onCrear, onMesSiguiente }: {
  dias: string[]
  porDia: Record<string, ItemCalendario[]>
  onAbrir: (it: ItemCalendario) => void
  onSeleccionar: (fecha: string) => void
  onCrear: (fecha: string) => void
  onMesSiguiente: () => void
}) {
  const hoy = hoyStr()
  // Un ítem de varios días (menú vigente del 10 al 18) se lista UNA vez, en
  // su primer día visible, con el rango — no repetido en cada día.
  const primerDia = dias[0]
  const delDia = (f: string) => (porDia[f] ?? []).filter(it => it.dia === f || (f === primerDia && it.dia < f))
  const conAlgo = dias.filter(f => delDia(f).length > 0 || f === hoy)

  if (conAlgo.length === 0) {
    return (
      <EmptyState
        icon="event_upcoming"
        title="Nada en lo que queda del mes"
        subtitle="Los menús de Carta, las entregas, las reservas y los feriados aparecen solos acá."
        cta={{ label: 'Ver el mes siguiente', onClick: onMesSiguiente }}
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {conAlgo.map(f => {
        const items = ordenarItemsDia(delDia(f))
        const rel = fechaRelativa(f)
        const d = parse(f)
        const esHoy = f === hoy
        return (
          <section key={f} aria-label={f} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <button
              type="button"
              onClick={() => onSeleccionar(f)}
              style={{
                width: 52, flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0',
                display: 'flex', flexDirection: 'column', alignItems: 'center', fontFamily: 'inherit',
                position: 'sticky', top: 0,
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 700, color: esHoy ? 'var(--accent)' : 'var(--text-3)', textTransform: 'uppercase' }}>
                {DIAS_CORTO[dowLunes(f)]}
              </span>
              <span style={{
                width: 38, height: 38, lineHeight: '38px', borderRadius: 19, textAlign: 'center', marginTop: 2,
                fontSize: 19, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                background: esHoy ? 'var(--navy)' : 'transparent', color: esHoy ? '#fff' : 'var(--text-1)',
              }}>
                {d.getDate()}
              </span>
              <span style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 1 }}>{MESES[d.getMonth()].slice(0, 3).toLowerCase()}</span>
            </button>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {rel && <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', paddingTop: 2 }}>{rel}</div>}
              {items.length === 0 ? (
                <button
                  type="button"
                  onClick={() => onCrear(f)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '12px', borderRadius: 12, minHeight: 48,
                    border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text-3)',
                    fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
                  Nada para hoy — agregar un evento
                </button>
              ) : items.map(it => <ItemFila key={it.id} it={it} onClick={onAbrir} />)}
            </div>
          </section>
        )
      })}
      <button
        type="button"
        onClick={onMesSiguiente}
        style={{
          alignSelf: 'center', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px',
          borderRadius: 99, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer',
          fontSize: 13, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'inherit',
        }}
      >
        Seguir con el mes siguiente
        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_downward</span>
      </button>
    </div>
  )
}
