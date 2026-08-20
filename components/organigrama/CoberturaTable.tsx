'use client'

// Vista Cobertura — área × las 4 capas del ciclo (Definir/Preparar/Ejecutar/
// Controlar, framework propio — ver PLAN-4-CAPAS.md). El valor de la vista es
// la alerta: una celda sin responsable en Definir/Preparar/Controlar es un
// hueco real — puede haber más de un responsable, pero nunca ninguno.
// "Ejecutar" es la excepción — sin asignar se lee "todo el equipo", no un
// hueco, porque el servicio se hace en conjunto.

import { CAPAS, type Capa, type AreaKey } from '@/lib/constants'
import type { AreaEstado, Miembro } from '@/lib/hooks/useEquipo'
import { ResponsablesPicker } from './ResponsablesPicker'

interface CoberturaTableProps {
  areas: AreaEstado[]
  miembros: Miembro[]
  isAdmin: boolean
  capaResponsables: (areaKey: string, capa: Capa) => string[]
  onToggleCapaResponsable: (areaKey: AreaKey, capa: Capa, miembroId: string) => void
}

const th: React.CSSProperties = {
  padding: '10px 12px', textAlign: 'left', fontSize: 10, fontWeight: 800,
  textTransform: 'uppercase', letterSpacing: '.05em', color: '#fff',
  background: 'var(--navy)', position: 'sticky', top: 0,
}
const td: React.CSSProperties = {
  padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: 12.5, verticalAlign: 'middle',
}

export function CoberturaTable({ areas, miembros, isAdmin, capaResponsables, onToggleCapaResponsable }: CoberturaTableProps) {
  return (
    <div data-coach-target="organigrama-cobertura" style={{ overflowX: 'auto', borderRadius: 14, border: '1px solid var(--border)' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 580, background: 'var(--surface)' }}>
        <thead>
          <tr>
            <th style={th}>Área</th>
            {CAPAS.map(c => (
              <th key={c.key} style={th} title={c.explicacion}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{c.icon}</span>
                  {c.label}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {areas.map(area => (
            <tr key={area.key}>
              <td style={{ ...td, fontWeight: 800, color: 'var(--text-1)' }}>{area.nombre}</td>
              {CAPAS.map(c => (
                <td key={c.key} style={td}>
                  <ResponsablesPicker
                    miembros={miembros}
                    isAdmin={isAdmin}
                    selected={capaResponsables(area.key, c.key)}
                    onToggle={id => onToggleCapaResponsable(area.key, c.key, id)}
                    emptyLabel={c.key === 'ejecutar' ? 'Todo el equipo' : 'Sin responsable'}
                    alert={c.key !== 'ejecutar'}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
