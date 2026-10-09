'use client'

// Detalle de un ítem antes de editar (patrón "peek" de Google/Notion
// Calendar): tocar un evento ya no abre el formulario de una — se ve qué es,
// cuándo, si se repite, y las acciones. Para un reflejo de otro módulo dice
// de dónde viene y lleva ahí (antes una entrega de pedido no hacía nada al
// tocarla, y un menú navegaba sin aviso).

import { Modal } from '@/components/ui'
import type { ItemCalendario } from '@/lib/hooks/useCalendario'
import { TIPO_CONFIG } from '@/lib/hooks/useCalendario'
import { CAPA_POR_ID } from '@/lib/calendario/capas'
import { fechaLarga, parse, diaNombre } from '@/lib/calendario/fechas'
import { colorItem, iconoItem, horaCorta, btnPrimario, btnSecundario } from './shared'

export function textoRecurrencia(it: Pick<ItemCalendario, 'recurrente' | 'frecuencia' | 'fecha_inicio' | 'fecha_fin'>) {
  if (!it.recurrente) return null
  const d = parse(it.fecha_inicio)
  const dia = diaNombre(it.fecha_inicio)
  const plural = dia.endsWith('s') ? dia : dia + 's'
  const base = {
    diaria: 'Todos los días',
    semanal: `Todos los ${plural}`,
    quincenal: `Cada 2 semanas, los ${plural}`,
    mensual: `Todos los meses, el día ${d.getDate()}`,
    anual: `Todos los años, el ${d.getDate()}/${d.getMonth() + 1}`,
  }[it.frecuencia ?? 'semanal'] ?? 'Se repite'
  return it.fecha_fin ? `${base}, hasta el ${fechaLarga(it.fecha_fin).toLowerCase()}` : base
}

export function EventoDetalle({ item, onClose, onEditar, onDuplicar, onEliminar, onIr }: {
  item: ItemCalendario | null
  onClose: () => void
  onEditar: (it: ItemCalendario) => void
  onDuplicar: (it: ItemCalendario) => void
  onEliminar: (it: ItemCalendario) => void
  onIr: (href: string) => void
}) {
  if (!item) return null
  const color = colorItem(item)
  const capa = CAPA_POR_ID[item.capa]
  const rep = textoRecurrencia(item)
  const cuando = item.diaFin !== item.dia
    ? `${fechaLarga(item.dia)} → ${fechaLarga(item.diaFin)}`
    : fechaLarga(item.dia, parse(item.dia).getFullYear() !== new Date().getFullYear())

  return (
    <Modal open onClose={onClose} maxWidth={460}>
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: color + '1f', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22, color }}>{iconoItem(item)}</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-1)', lineHeight: 1.25 }}>{item.titulo}</h2>
            <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 3 }}>
              {item.capa === 'eventos' || !item.soloLectura ? TIPO_CONFIG[item.tipo]?.label : capa.label}
              {item.meta && ` · ${item.meta}`}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', padding: 4 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22 }}>close</span>
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13.5, color: 'var(--text-1)' }}>
          <Linea icon="calendar_today">{cuando}</Linea>
          <Linea icon="schedule">{item.todoElDia ? 'Todo el día' : `${horaCorta(item.hora_inicio)} – ${horaCorta(item.hora_fin)}`}</Linea>
          {rep && <Linea icon="repeat">{rep}</Linea>}
          {item.descripcion && <Linea icon="notes"><span style={{ whiteSpace: 'pre-wrap' }}>{item.descripcion}</span></Linea>}
          {item.soloLectura && capa.origen && (
            <Linea icon="link">
              <span style={{ color: 'var(--text-2)' }}>Viene de <b>{capa.origen}</b>. Se edita allá; acá se refleja solo.</span>
            </Linea>
          )}
        </div>

        {item.soloLectura ? (
          item.href ? (
            <button type="button" onClick={() => onIr(item.href!)} style={{ ...btnPrimario, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              {item.hrefLabel ?? 'Abrir'}
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_forward</span>
            </button>
          ) : null
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => onEliminar(item)} aria-label="Eliminar" title="Eliminar" style={{ ...btnSecundario, flex: '0 0 48px', padding: 0, color: 'var(--red)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>delete</span>
            </button>
            <button type="button" onClick={() => onDuplicar(item)} style={{ ...btnSecundario, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>content_copy</span>
              Duplicar
            </button>
            <button type="button" onClick={() => onEditar(item)} style={{ ...btnPrimario, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>edit</span>
              Editar
            </button>
          </div>
        )}
        {!item.soloLectura && item.recurrente && (
          <p style={{ margin: 0, fontSize: 11.5, color: 'var(--text-3)', textAlign: 'center' }}>
            Editar o eliminar cambia toda la serie.
          </p>
        )}
      </div>
    </Modal>
  )
}

function Linea({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-3)', marginTop: 1 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  )
}
