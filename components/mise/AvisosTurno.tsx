'use client'

// AvisosTurno — recuento del turno anterior, plegado en una fila de chips.
// Antes cada aviso era un recuadro que listaba todos sus ítems y comía ~250px
// antes del primer ítem real del mise (queja real: "hay que bajar para llegar
// a lo que importa"). Ahora es un chip de una línea que se despliega al
// tocarlo — uno abierto a la vez, arrancan plegados. Las Notas de plaza (en
// ClientView, arriba de esto) NO entran acá a propósito: esas sí se abren
// solas, son un mensaje escrito, no un recuento de lo que ya está listado
// abajo.

import type { MisePlaceItem } from '@/types'

const PRIO_CFG: Record<string, { label: string; color: string; bg: string }> = {
  sp:  { label: 'SP',  color: '#ef4444', bg: 'rgba(239,68,68,.13)' },
  p:   { label: 'P',   color: '#f97316', bg: 'rgba(249,115,22,.13)' },
  ref: { label: 'REF', color: '#3b82f6', bg: 'rgba(59,130,246,.13)' },
  chk: { label: 'OK',  color: '#22c55e', bg: 'rgba(34,197,94,.13)' },
}

const btnReset: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: 'inherit',
}

function AvisoChip({ activo, onClick, icon, color, bg, border, label }: {
  activo: boolean; onClick: () => void; icon: string; color: string; bg: string; border: string; label: string
}) {
  return (
    <button
      onClick={onClick}
      style={{
        ...btnReset, gap: 5, padding: '5px 10px', borderRadius: 999,
        background: bg, border: `1px solid ${border}`,
        fontSize: 11, fontWeight: 700, color,
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{icon}</span>
      {label}
      <span className="material-symbols-outlined" style={{
        fontSize: 14, marginLeft: 2,
        transform: activo ? 'rotate(180deg)' : 'none', transition: 'transform .15s',
      }}>
        expand_more
      </span>
    </button>
  )
}

interface AvisosTurnoProps {
  tab: 'apertura' | 'cierre' | 'rutina'
  recibidosEnProduccion: MisePlaceItem[]
  pendientesSinResolver: MisePlaceItem[]
  pendientesApertura: MisePlaceItem[]
  cierreAnteriorSinRastro: boolean
  avisoAbierto: string | null
  onToggle: (id: string) => void
  onComoLoCargo: () => void
}

export function AvisosTurno({
  tab, recibidosEnProduccion, pendientesSinResolver, pendientesApertura,
  cierreAnteriorSinRastro, avisoAbierto, onToggle, onComoLoCargo,
}: AvisosTurnoProps) {
  const hayAlgo = (tab === 'apertura' && (recibidosEnProduccion.length > 0 || pendientesSinResolver.length > 0)) ||
    (tab === 'cierre' && pendientesApertura.length > 0)
  if (!hayAlgo) return null

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {tab === 'apertura' && recibidosEnProduccion.length > 0 && (
          <AvisoChip
            activo={avisoAbierto === 'recibidos'}
            onClick={() => onToggle('recibidos')}
            icon="pending" color="#b45309" bg="rgba(245,158,11,0.14)" border="#f59e0b"
            label={`Te dejaron en producción · ${recibidosEnProduccion.length}`}
          />
        )}
        {tab === 'apertura' && pendientesSinResolver.length > 0 && (
          <AvisoChip
            activo={avisoAbierto === 'pendientes'}
            onClick={() => onToggle('pendientes')}
            icon={cierreAnteriorSinRastro ? 'report' : 'warning'}
            color={cierreAnteriorSinRastro ? '#dc2626' : '#ca8a04'}
            bg={cierreAnteriorSinRastro ? 'rgba(239,68,68,0.14)' : 'rgba(250,204,21,0.18)'}
            border={cierreAnteriorSinRastro ? '#ef4444' : '#facc15'}
            label={cierreAnteriorSinRastro ? 'Sin cierre del turno anterior' : `Turno anterior · ${pendientesSinResolver.length} sin cerrar`}
          />
        )}
        {tab === 'cierre' && pendientesApertura.length > 0 && (
          <AvisoChip
            activo={avisoAbierto === 'pendientesCierre'}
            onClick={() => onToggle('pendientesCierre')}
            icon="warning" color="#ca8a04" bg="rgba(250,204,21,0.18)" border="#facc15"
            label={`Pendiente del turno · ${pendientesApertura.length}`}
          />
        )}
      </div>

      {avisoAbierto === 'recibidos' && tab === 'apertura' && recibidosEnProduccion.length > 0 && (
        <div style={{
          background: 'rgba(245,158,11,0.10)', borderLeft: '3px solid #f59e0b',
          borderRadius: 12, marginTop: 6, padding: '8px 14px',
          display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          {recibidosEnProduccion.map(item => {
            const p = PRIO_CFG[item.prioridad] ?? PRIO_CFG.ref
            return (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                <span style={{
                  flexShrink: 0, minWidth: 30, textAlign: 'center', padding: '2px 6px', borderRadius: 6,
                  background: p.bg, border: `1px solid ${p.color}`,
                  fontSize: 10, fontWeight: 800, color: p.color,
                }}>{p.label}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: '#78350f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.nombre}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {avisoAbierto === 'pendientes' && tab === 'apertura' && pendientesSinResolver.length > 0 && (
        <div style={{
          background: cierreAnteriorSinRastro ? 'rgba(239, 68, 68, 0.12)' : 'rgba(250, 204, 21, 0.15)',
          borderLeft: `3px solid ${cierreAnteriorSinRastro ? '#ef4444' : '#facc15'}`,
          borderRadius: 12, marginTop: 6, padding: '10px 14px',
        }}>
          {cierreAnteriorSinRastro ? (
            <div style={{ fontSize: 12, color: '#7f1d1d', lineHeight: 1.4 }}>
              Nadie registró el cierre. Contá lo que veas al arrancar.{' '}
              <button
                onClick={onComoLoCargo}
                style={{
                  ...btnReset, display: 'inline', padding: 0, fontSize: 12, fontWeight: 700,
                  color: '#7f1d1d', textDecoration: 'underline',
                }}
              >
                ¿Cómo lo cargo?
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {pendientesSinResolver.map(item => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#ca8a04', flexShrink: 0 }}>radio_button_unchecked</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#78350f' }}>{item.nombre}</span>
                    {item.cantidad > 0 && (
                      <span style={{ marginLeft: 6, fontSize: 11, color: '#92400e' }}>
                        {item.cantidad} {item.unidad}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {avisoAbierto === 'pendientesCierre' && tab === 'cierre' && pendientesApertura.length > 0 && (
        <div style={{
          background: 'rgba(250, 204, 21, 0.15)', borderLeft: '3px solid #facc15',
          borderRadius: 12, marginTop: 6, padding: '8px 14px',
          display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          {pendientesApertura.map(item => (
            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: '1px solid rgba(250,204,21,0.2)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#ca8a04', flexShrink: 0 }}>radio_button_unchecked</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#78350f' }}>{item.nombre}</span>
                {item.cantidad > 0 && (
                  <span style={{ marginLeft: 6, fontSize: 11, color: '#92400e' }}>
                    {item.cantidad} {item.unidad}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
