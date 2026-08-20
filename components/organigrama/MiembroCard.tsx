'use client'

// Carta de puesto del organigrama — estilo "carta de jugador". Frente:
// composición del puesto (plazas, módulos, tareas, antigüedad), nunca
// rendimiento (ver FUNDAMENTO-EL-JUEGO-CERCADO.md, cap. VI-VIII: exponer
// desempeño individual en una interfaz produce culpa, no mejora). Dorso:
// a quién reporta + tareas del puesto + módulos que habilita — el mini
// manual de puesto, armado solo con datos que ya están cargados.

import { useState } from 'react'
import { Avatar } from '@/components/ui'
import { NIVELES_ACCESO, type Miembro, type Puesto } from '@/lib/hooks/useEquipo'
import { MODULO_CONFIG, PLAZA_ICONS, areaCatalogoItem, type ModuloId } from '@/lib/constants'

const NIVEL_GRADIENTE: Record<string, [string, string]> = {
  admin: ['#5b7bc4', '#3a5488'],
  sous_chef: ['#2d4d92', '#16294f'],
  cocinero: ['#fbb454', '#dc8a12'],
  bachero: ['#8593a8', '#556577'],
}

function antiguedadLabel(fechaIngreso: string | null): string {
  if (!fechaIngreso) return '—'
  const inicio = new Date(fechaIngreso + 'T12:00:00')
  if (Number.isNaN(inicio.getTime())) return '—'
  const meses = Math.max(0, Math.floor((Date.now() - inicio.getTime()) / (1000 * 60 * 60 * 24 * 30.44)))
  if (meses < 1) return '<1m'
  if (meses < 12) return `${meses}m`
  const anios = Math.floor(meses / 12)
  const resto = meses % 12
  return resto === 0 ? `${anios}a` : `${anios}a ${resto}m`
}

interface MiembroCardProps {
  miembro: Miembro
  puestos: Puesto[]
  miembros: Miembro[]
}

export function MiembroCard({ miembro, puestos, miembros }: MiembroCardProps) {
  const [flipped, setFlipped] = useState(false)

  const puesto = puestos.find(p => p.id === miembro.puesto_id)
  const reportaAPuesto = puesto?.reporta_a_puesto_id ? puestos.find(p => p.id === puesto.reporta_a_puesto_id) : undefined
  const reportaAMiembro = reportaAPuesto ? miembros.find(m => m.puesto_id === reportaAPuesto.id) : undefined

  const nivel = puesto?.nivel ?? 'cocinero'
  const nivelInfo = NIVELES_ACCESO.find(n => n.value === nivel)
  const gradiente = NIVEL_GRADIENTE[nivel] ?? NIVEL_GRADIENTE.cocinero
  const area = puesto?.area_key ? areaCatalogoItem(puesto.area_key) : undefined
  const badgeIcon = (puesto?.plaza_default && PLAZA_ICONS[puesto.plaza_default]) || area?.icon || 'person'

  const nombreCompleto = `${miembro.nombre} ${miembro.apellido}`.trim()
  const plzStat = puesto?.plaza_default ? '1' : (nivel === 'admin' || nivel === 'sous_chef') ? 'Todas' : '—'
  const modStat = puesto?.permisos_app.length ?? 0
  const tarStat = puesto?.tareas_funciones.length ?? 0
  const antStat = antiguedadLabel(miembro.fecha_ingreso)

  const modulosLabels = (puesto?.permisos_app ?? []).map(m => MODULO_CONFIG[m as ModuloId]?.label ?? m)
  const modulosVisibles = modulosLabels.slice(0, 3)
  const modulosResto = modulosLabels.length - modulosVisibles.length

  return (
    <div
      onClick={() => setFlipped(f => !f)}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFlipped(f => !f) } }}
      style={{ perspective: 1400, height: 264, cursor: 'pointer' }}
    >
      <div
        style={{
          position: 'relative', width: '100%', height: '100%',
          transition: 'transform .5s cubic-bezier(.2,.8,.2,1)',
          transformStyle: 'preserve-3d',
          transform: flipped ? 'rotateY(180deg)' : 'none',
        }}
      >
        {/* ── Frente ── */}
        <div style={{
          position: 'absolute', inset: 0, backfaceVisibility: 'hidden', borderRadius: 16,
          boxShadow: '0 1px 2px rgba(28,45,74,.08), 0 10px 24px rgba(28,45,74,.14)',
          overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: '12px 12px 10px',
          color: '#fff',
          background: `radial-gradient(120% 90% at 50% -10%, rgba(255,255,255,.22), transparent 55%), linear-gradient(160deg, ${gradiente[0]}, ${gradiente[1]})`,
        }}>
          <span style={{
            alignSelf: 'flex-start', fontSize: 9.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase',
            background: 'rgba(0,0,0,.22)', padding: '3px 8px', borderRadius: 20,
          }}>
            {nivelInfo?.label ?? 'Cocinero'}
          </span>

          <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0 6px', position: 'relative' }}>
            <Avatar
              name={nombreCompleto || '?'}
              size={64}
              style={{ background: 'rgba(255,255,255,.16)', border: '2.5px solid rgba(255,255,255,.55)', fontSize: 20 }}
            />
            <div style={{
              position: 'absolute', bottom: -2, left: '50%', transform: 'translateX(18px)',
              width: 24, height: 24, borderRadius: '50%', background: 'var(--surface)', color: gradiente[1],
              display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px rgba(0,0,0,.25)',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{badgeIcon}</span>
            </div>
          </div>

          <div style={{ textAlign: 'center', fontSize: 14, fontWeight: 800, letterSpacing: '-0.01em', lineHeight: 1.2 }}>
            {nombreCompleto || 'Sin nombre'}
          </div>
          <div style={{
            textAlign: 'center', fontSize: 10.5, color: 'rgba(255,255,255,.78)', textTransform: 'uppercase',
            letterSpacing: '.04em', fontWeight: 700, marginTop: 2,
          }}>
            {puesto?.nombre ?? 'Sin puesto asignado'}
          </div>

          <div style={{ height: 1, background: 'rgba(255,255,255,.22)', margin: '8px 0' }} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px 8px' }}>
            <Stat k="PLZ" v={plzStat} />
            <Stat k="MOD" v={String(modStat)} />
            <Stat k="TAR" v={String(tarStat)} />
            <Stat k="ANT" v={antStat} />
          </div>

          <div style={{
            marginTop: 'auto', paddingTop: 6, display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 10, color: 'rgba(255,255,255,.75)',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>{area?.icon ?? 'category'}</span>
            {area?.nombre ?? 'Sin área'}
          </div>
        </div>

        {/* ── Dorso ── */}
        <div style={{
          position: 'absolute', inset: 0, backfaceVisibility: 'hidden', borderRadius: 16,
          transform: 'rotateY(180deg)', background: 'var(--surface)', border: '1px solid var(--border)',
          boxShadow: '0 1px 2px rgba(28,45,74,.08), 0 10px 24px rgba(28,45,74,.14)',
          padding: '12px 13px 10px', display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-3)' }}>
            Reporta a
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', marginBottom: 9, lineHeight: 1.3 }}>
            {reportaAPuesto
              ? <>{reportaAMiembro ? `${reportaAMiembro.nombre} ${reportaAMiembro.apellido}` : 'Vacante'} <span style={{ color: 'var(--text-3)', fontWeight: 500 }}>· {reportaAPuesto.nombre}</span></>
              : 'Nadie — raíz del organigrama'}
          </div>

          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 4 }}>
            Tareas y funciones
          </div>
          <ul style={{ margin: '0 0 8px', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto', flex: 1 }}>
            {(puesto?.tareas_funciones ?? []).length === 0 && (
              <li style={{ fontSize: 11, color: 'var(--text-3)', fontStyle: 'italic' }}>Sin tareas cargadas</li>
            )}
            {(puesto?.tareas_funciones ?? []).map((t, i) => (
              <li key={i} style={{ fontSize: 11, lineHeight: 1.35, display: 'flex', gap: 6, color: 'var(--text-1)' }}>
                <span style={{ width: 4, height: 4, borderRadius: '50%', background: gradiente[1], marginTop: 5, flexShrink: 0 }} />
                {t}
              </li>
            ))}
          </ul>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, paddingTop: 7, borderTop: '1px dashed var(--border)' }}>
            {modulosVisibles.map(l => <Chip key={l} label={l} />)}
            {modulosResto > 0 && <Chip label={`+${modulosResto}`} />}
            {modulosLabels.length === 0 && <span style={{ fontSize: 10, color: 'var(--text-3)', fontStyle: 'italic' }}>Sin módulos asignados</span>}
          </div>
        </div>
      </div>
    </div>
  )
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
      <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.06em', color: 'rgba(255,255,255,.62)' }}>{k}</span>
      <span style={{ fontSize: 12.5, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{v}</span>
    </div>
  )
}

function Chip({ label }: { label: string }) {
  return (
    <span style={{
      fontSize: 9.5, fontWeight: 700, padding: '3px 7px', borderRadius: 20,
      background: 'rgba(67,97,160,.1)', color: 'var(--accent)',
    }}>
      {label}
    </span>
  )
}
