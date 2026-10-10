'use client'

// Piezas compartidas por las vistas del Calendario (Mes / Semana / Agenda /
// panel del día). Un ítem se ve igual en las cuatro: rail de color de su capa
// + ícono + hora si tiene — el usuario aprende la forma una vez.

import type { CSSProperties } from 'react'
import type { ItemCalendario } from '@/lib/hooks/useCalendario'
import { TIPO_CONFIG } from '@/lib/hooks/useCalendario'
import { CAPAS, CAPA_POR_ID, type CapaId } from '@/lib/calendario/capas'
import { parse } from '@/lib/calendario/fechas'

const diaMes = (f: string) => { const d = parse(f); return `${d.getDate()}/${d.getMonth() + 1}` }

export const fieldStyle: CSSProperties = {
  width: '100%',
  padding: '11px 13px',
  borderRadius: 10,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--text-1)',
  fontSize: 14,
  outline: 'none',
  fontFamily: 'inherit',
}

export const labelStyle: CSSProperties = {
  fontSize: 12.5, fontWeight: 700, color: 'var(--text-2)', marginBottom: 6, display: 'block',
}

export const btnSecundario: CSSProperties = {
  flex: 1, padding: '12px 16px', borderRadius: 12, border: '1px solid var(--border)',
  background: 'var(--surface)', color: 'var(--text-2)', fontSize: 14, fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit',
}

export const btnPrimario: CSSProperties = {
  flex: 1, padding: '12px 16px', borderRadius: 12, border: 'none',
  background: 'var(--navy)', color: '#fff', fontSize: 14, fontWeight: 700,
  cursor: 'pointer', fontFamily: 'inherit',
}

export function iconoItem(it: ItemCalendario) {
  if (it.capa === 'eventos' || (it.capa === 'compras' && !it.soloLectura)) return TIPO_CONFIG[it.tipo]?.icon ?? 'event'
  if (it.capa === 'menus' && it.tipo === 'reserva_especial') return 'celebration'
  return CAPA_POR_ID[it.capa].icon
}

export function colorItem(it: ItemCalendario) {
  return it.color || CAPA_POR_ID[it.capa].color
}

export const horaCorta = (h: string) => h.slice(0, 5)

/** Píldora de un ítem dentro de una celda/columna. `compacta` = celda del mes. */
export function ItemPill({ it, onClick, compacta, draggable, onDragStart, style }: {
  it: ItemCalendario
  onClick: (it: ItemCalendario) => void
  compacta?: boolean
  draggable?: boolean
  onDragStart?: (e: React.DragEvent, it: ItemCalendario) => void
  style?: CSSProperties
}) {
  const color = colorItem(it)
  return (
    <button
      type="button"
      draggable={draggable}
      onDragStart={draggable ? e => onDragStart?.(e, it) : undefined}
      onClick={e => { e.stopPropagation(); onClick(it) }}
      title={it.titulo + (it.todoElDia ? '' : ` · ${horaCorta(it.hora_inicio)}`)}
      style={{
        display: 'flex', alignItems: 'center', gap: 4, width: '100%', minWidth: 0,
        padding: compacta ? '2px 5px' : '4px 7px', borderRadius: 5, border: 'none',
        borderLeft: `3px solid ${color}`, background: color + '1f',
        color: 'var(--text-1)', fontSize: compacta ? 11 : 12, fontWeight: 600, lineHeight: 1.3,
        cursor: draggable ? 'grab' : 'pointer', textAlign: 'left', fontFamily: 'inherit',
        ...style,
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: compacta ? 12 : 14, color, flexShrink: 0 }}>{iconoItem(it)}</span>
      {!it.todoElDia && (
        <span style={{ color: 'var(--text-2)', fontWeight: 600, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
          {horaCorta(it.hora_inicio)}
        </span>
      )}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.titulo}</span>
      {it.privado && <span className="material-symbols-outlined" aria-label="Privado" style={{ fontSize: compacta ? 11 : 13, color: 'var(--text-3)', flexShrink: 0, marginLeft: 'auto' }}>lock</span>}
    </button>
  )
}

/** Fila de un ítem en listas (panel del día, agenda). */
export function ItemFila({ it, onClick }: { it: ItemCalendario; onClick: (it: ItemCalendario) => void }) {
  const color = colorItem(it)
  const capa = CAPA_POR_ID[it.capa]
  return (
    <button
      type="button"
      onClick={() => onClick(it)}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
        padding: '10px 12px', borderRadius: 12, border: '1px solid var(--border)',
        background: 'var(--surface)', cursor: 'pointer', fontFamily: 'inherit', minHeight: 56,
      }}
    >
      <div style={{ width: 4, alignSelf: 'stretch', borderRadius: 4, background: color, flexShrink: 0 }} />
      <div style={{ width: 50, flexShrink: 0, fontSize: 12, fontWeight: 700, color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.3 }}>
        {it.diaFin !== it.dia ? (
          <>
            {diaMes(it.dia)}
            <div style={{ fontWeight: 500, color: 'var(--text-3)' }}>→ {diaMes(it.diaFin)}</div>
          </>
        ) : it.todoElDia ? <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Todo el día</span> : (
          <>
            {horaCorta(it.hora_inicio)}
            <div style={{ fontWeight: 500, color: 'var(--text-3)' }}>{horaCorta(it.hora_fin)}</div>
          </>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {it.titulo}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, fontSize: 11.5, color: 'var(--text-3)', minWidth: 0 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 14, color }}>{iconoItem(it)}</span>
          <span style={{ whiteSpace: 'nowrap' }}>{it.capa === 'eventos' ? TIPO_CONFIG[it.tipo]?.label : capa.label}</span>
          {it.recurrente && <span className="material-symbols-outlined" style={{ fontSize: 13 }} title="Se repite">repeat</span>}
          {it.privado && <span className="material-symbols-outlined" style={{ fontSize: 13 }} title="Privado: solo lo ves vos">lock</span>}
          {it.soloLectura && it.meta && (
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>· {it.meta}</span>
          )}
        </div>
      </div>
      {it.soloLectura && it.href && (
        <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-3)', flexShrink: 0 }}>chevron_right</span>
      )}
    </button>
  )
}

/**
 * Capas encendidas/apagadas — referencia de color y filtro en un solo
 * control (reemplaza la leyenda colapsable). Multi-selección: FilterChips es
 * de selección única; si otra pantalla necesita esto, se promueve a
 * components/ui como variante `multiple` de FilterChips.
 */
export function CapasChips({ activas, onToggle, disponibles, conteo }: {
  activas: CapaId[]
  onToggle: (id: CapaId) => void
  disponibles: CapaId[]
  conteo: Partial<Record<CapaId, number>>
}) {
  return (
    <div className="hide-scrollbar" role="group" aria-label="Capas visibles" style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
      {CAPAS.filter(c => disponibles.includes(c.id)).map(c => {
        const on = activas.includes(c.id)
        const n = conteo[c.id] ?? 0
        return (
          <button
            key={c.id}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(c.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
              padding: '6px 12px 6px 9px', borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit',
              border: on ? `1px solid ${c.color}55` : '1px dashed var(--border)',
              background: on ? c.color + '14' : 'transparent',
              color: on ? 'var(--text-1)' : 'var(--text-3)', fontSize: 12.5, fontWeight: 600,
            }}
          >
            <span style={{
              width: 9, height: 9, borderRadius: 3, flexShrink: 0,
              background: on ? c.color : 'transparent', border: `2px solid ${c.color}`,
            }} />
            {c.label}
            {n > 0 && <span style={{ fontSize: 11, color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>{n}</span>}
          </button>
        )
      })}
    </div>
  )
}
