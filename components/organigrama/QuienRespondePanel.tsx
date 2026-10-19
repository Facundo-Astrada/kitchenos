'use client'

// "Quién responde" — la pestaña de consulta del Organigrama. Está escrita para
// el que llega y no sabe a quién preguntarle: una tarjeta por área activa, con
// quién decide, quién lo lleva y quién revisa, en palabras de cocina. Las otras
// pestañas sirven para configurar; esta es la única pensada para leer.
// Si una etapa está vacía, el admin ve el hueco en rojo (puede resolverlo) y el
// resto ve a quién preguntarle — nunca un rojo que el cocinero no pueda cerrar.

import { useMemo, useState } from 'react'
import { EmptyState } from '@/components/ui'
import type { AreaEstado, Miembro, Puesto } from '@/lib/hooks/useEquipo'
import type { Capa } from '@/lib/constants'
import {
  armarTarjetas, filtrarTarjetas, titularDeDireccion, ETAPAS_CONSULTA,
  type Etapa,
} from '@/lib/organigrama/quienResponde'

interface QuienRespondePanelProps {
  areas: AreaEstado[]
  puestos: Puesto[]
  miembros: Miembro[]
  isAdmin: boolean
  capaResponsables: (areaKey: string, capa: Capa) => string[]
  capaSuplentes: (areaKey: string, capa: Capa) => string[]
}

const nombreDe = (m: Miembro) => `${m.nombre} ${m.apellido}`.trim()

export function QuienRespondePanel({ areas, puestos, miembros, isAdmin, capaResponsables, capaSuplentes }: QuienRespondePanelProps) {
  const [busqueda, setBusqueda] = useState('')

  const tarjetas = useMemo(
    () => armarTarjetas({ areas, puestos, miembros, capaResponsables, capaSuplentes }),
    [areas, puestos, miembros, capaResponsables, capaSuplentes],
  )
  const visibles = useMemo(() => filtrarTarjetas(tarjetas, busqueda), [tarjetas, busqueda])
  const direccion = useMemo(() => titularDeDireccion({
    miembros, capaResponsables,
    responsablesArea: areas.find(a => a.key === 'direccion')?.responsables ?? [],
  }), [miembros, capaResponsables, areas])

  function valorDeEtapa(etapa: Etapa<Miembro>) {
    if (etapa.titulares.length > 0) {
      return (
        <span style={{ fontSize: 13, color: 'var(--text-1)' }}>
          <strong style={{ fontWeight: 700 }}>{etapa.titulares.map(nombreDe).join(' y ')}</strong>
          {etapa.suplentes.length > 0 && (
            <span style={{ display: 'block', color: 'var(--text-3)', fontSize: 11.5, marginTop: 1 }}>
              Suplen: {etapa.suplentes.map(nombreDe).join(', ')}
            </span>
          )}
        </span>
      )
    }
    if (isAdmin) {
      return (
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 700, color: 'var(--red)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>error</span>
          Nadie todavía
        </span>
      )
    }
    return (
      <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
        {direccion ? `Preguntale a ${nombreDe(direccion)}` : 'Nadie todavía'}
      </span>
    )
  }

  if (tarjetas.length === 0) {
    return (
      <EmptyState
        icon="help_center"
        title="Todavía no hay áreas activas"
        subtitle={isAdmin
          ? 'Activá las áreas de tu negocio en Estructura (o corré el asistente de configuración) y acá se arma solo quién responde por cada cosa.'
          : 'Cuando el equipo de dirección active las áreas, vas a ver acá a quién preguntarle por cada cosa.'}
      />
    )
  }

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div data-coach-target="organigrama-quien-responde" style={{ position: 'relative' }}>
        <span
          className="material-symbols-outlined"
          style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 18, color: 'var(--text-3)' }}
        >
          search
        </span>
        <input
          type="search"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="¿Sobre qué? pagos, heladera, reservas…"
          aria-label="Buscar a quién preguntarle"
          style={{
            width: '100%', padding: '12px 14px 12px 38px', borderRadius: 12, boxSizing: 'border-box',
            border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-1)', fontSize: 14, outline: 'none',
          }}
        />
      </div>

      {visibles.length === 0 ? (
        <EmptyState
          icon="search_off"
          title="No encontramos eso"
          subtitle="Probá con otra palabra, por ejemplo el nombre de una tarea o de un sector."
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 12 }}>
          {visibles.map(({ area, etapas, puestos: puestosDelArea }) => (
            <div key={area.key} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 14 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                  background: area.color + '20', color: area.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{area.icon}</span>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-1)' }}>{area.nombre}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2, lineHeight: 1.4 }}>{area.ejemplos}</div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12, paddingTop: 10, borderTop: '1px dashed var(--border)' }}>
                {ETAPAS_CONSULTA.map(e => (
                  <div key={e.key}>
                    <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--text-3)' }}>
                      {e.label}
                    </div>
                    <div style={{ marginTop: 1 }}>{valorDeEtapa(etapas[e.key])}</div>
                  </div>
                ))}
              </div>

              {puestosDelArea.length > 0 && (
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed var(--border)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {puestosDelArea.map(({ puesto, principales, tambien }) => {
                    const gente = [
                      ...principales.map(nombreDe),
                      ...tambien.map(m => `${nombreDe(m)} (también)`),
                    ]
                    return (
                      <div key={puesto.id} style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.4 }}>
                        <span style={{ fontWeight: 600, color: 'var(--text-1)' }}>{puesto.nombre}</span>
                        {' — '}
                        {gente.length > 0 ? gente.join(', ') : 'vacante'}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
