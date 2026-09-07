'use client'
/**
 * La ficha de line-up — lo que se lee en voz alta antes de abrir el servicio.
 *
 * Ver `PLAN-IMPLANTACION-2026-09.md` § 5.4 y `lib/ops/lineup.ts`.
 *
 * Tres decisiones de diseño que no son estéticas:
 *
 * 1. **Se lee, no se opera.** Casi no hay controles: quien la abre la está
 *    leyendo en voz alta a seis personas paradas. Un botón de más es un tap que
 *    corta el briefing. Lo único que se toca es el foco del turno y compartir.
 * 2. **Tipografía grande.** Se lee a un brazo de distancia, con el celular
 *    apoyado, no a 30 cm como el resto de la app.
 * 3. **El 86 va primero.** Es lo que el salón necesita saber sí o sí, y lo
 *    único de la ficha que cuesta plata si no se dice.
 *
 * La ruta no agrega un `ModuloId` nuevo a propósito: cae bajo `operaciones`
 * (es la apertura del turno) y así ningún puesto ya creado necesita backfill
 * de permisos para verla.
 */
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLineUp } from '@/lib/hooks/useLineUp'
import {
  construirTextoLineUp, lineUpTieneContenido, recortarLineUp,
} from '@/lib/ops/lineup'
import PageHeader from '@/components/shell/PageHeader'
import ActionButton from '@/components/shell/ActionButton'
import { EmptyState } from '@/components/ui/EmptyState'

const FOCO_KEY = 'kc_lineup_foco'

function Bloque({
  titulo, icon, color, children, vacio,
}: {
  titulo: string; icon: string; color: string; children: React.ReactNode; vacio?: boolean
}) {
  if (vacio) return null
  return (
    <section style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderLeft: `3px solid ${color}`, borderRadius: 14, padding: '14px 16px',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 18, color }}>{icon}</span>
        <h2 style={{
          margin: 0, fontSize: 11.5, fontWeight: 800, letterSpacing: '.09em',
          textTransform: 'uppercase', color: 'var(--text-3)',
        }}>{titulo}</h2>
      </div>
      {children}
    </section>
  )
}

export default function LineUpPage() {
  const router = useRouter()
  const { datos, loading, refetch } = useLineUp()
  const [foco, setFoco] = useState(() =>
    typeof window === 'undefined' ? '' : (sessionStorage.getItem(FOCO_KEY) ?? ''))
  const [copiado, setCopiado] = useState(false)

  const ficha = useMemo(() => recortarLineUp({ ...datos, foco }), [datos, foco])
  const hayContenido = lineUpTieneContenido(ficha)

  async function compartir() {
    const texto = construirTextoLineUp(ficha)
    try {
      // Igual que "Copiar pase": compartir nativo si existe (es un celular en la
      // cocina), portapapeles si no (desktop).
      if (navigator.share) await navigator.share({ text: texto })
      else await navigator.clipboard.writeText(texto)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2200)
    } catch { /* el usuario canceló el share nativo — no es un error */ }
  }

  function cambiarFoco(v: string) {
    setFoco(v)
    try { sessionStorage.setItem(FOCO_KEY, v) } catch { /* modo privado */ }
  }

  const fechaLarga = useMemo(() => {
    const [y, m, d] = ficha.jornada.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('es-AR', {
      weekday: 'long', day: 'numeric', month: 'long',
    })
  }, [ficha.jornada])

  return (
    <>
      <PageHeader
        title={`Line-up · ${ficha.turnoNombre}`}
        icon="campaign"
        subtitle={fechaLarga}
        onBack={() => router.push('/operaciones')}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <ActionButton icon="refresh" label="Actualizar" onClick={() => refetch()} />
            <ActionButton
              icon={copiado ? 'check' : 'ios_share'}
              label={copiado ? 'Listo' : 'Compartir'}
              onClick={compartir}
            />
          </div>
        }
      />

      <div style={{
        padding: 16, display: 'flex', flexDirection: 'column', gap: 12,
        maxWidth: 760, margin: '0 auto', width: '100%',
      }}>
        {!loading && !hayContenido ? (
          <EmptyState
            icon="campaign"
            title="Hoy no hay nada que avisar"
            subtitle="Cuando haya un 86, algo pendiente del turno anterior, una nota de plaza o un evento, aparece acá para leerlo antes de abrir."
          />
        ) : (
          <>
            {/* 86 primero: es lo único de la ficha que cuesta plata si no se dice. */}
            <Bloque titulo="86 — no ofrecer" icon="block" color="#ef4444" vacio={ficha.ochentaySeis.length === 0}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {ficha.ochentaySeis.map(x => (
                  <span key={x} style={{
                    fontSize: 16, fontWeight: 700, padding: '5px 12px', borderRadius: 8,
                    background: 'rgba(239,68,68,.12)', color: '#ef4444',
                  }}>{x}</span>
                ))}
              </div>
            </Bloque>

            <Bloque titulo="En el mise" icon="restaurant_menu" color="#f59e0b" vacio={!ficha.menuVigente}>
              <p style={{ margin: 0, fontSize: 16 }}>{ficha.menuVigente}</p>
            </Bloque>

            <Bloque titulo="Del turno anterior" icon="swap_horiz" color="#8b5cf6" vacio={ficha.pendientes.length === 0}>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 7 }}>
                {ficha.pendientes.map((p, i) => (
                  <li key={`${p.texto}-${i}`} style={{ display: 'flex', alignItems: 'baseline', gap: 9, fontSize: 16, lineHeight: 1.4 }}>
                    <span style={{
                      fontSize: 10.5, fontWeight: 800, padding: '2px 6px', borderRadius: 5,
                      background: 'var(--surface-2, rgba(0,0,0,.05))', color: 'var(--text-2)', flexShrink: 0,
                    }}>{p.codigo}</span>
                    <span>{p.texto} <span style={{ color: 'var(--text-3)', fontSize: 13.5 }}>· {p.plaza}</span></span>
                  </li>
                ))}
              </ul>
            </Bloque>

            <Bloque titulo="Notas de plaza" icon="sticky_note_2" color="#0ea5e9" vacio={ficha.notas.length === 0}>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 7 }}>
                {ficha.notas.map((n, i) => (
                  <li key={`${n.texto}-${i}`} style={{ fontSize: 15.5, lineHeight: 1.45 }}>
                    <b style={{ color: 'var(--text-2)' }}>{n.plaza}:</b> {n.texto}
                    {n.autor && <span style={{ color: 'var(--text-3)', fontSize: 13 }}> — {n.autor}</span>}
                  </li>
                ))}
              </ul>
            </Bloque>

            <Bloque titulo="Atención hoy" icon="event" color="#ec4899" vacio={ficha.eventos.length === 0}>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 7 }}>
                {ficha.eventos.map((e, i) => (
                  <li key={`${e.titulo}-${i}`} style={{ fontSize: 16, lineHeight: 1.4 }}>
                    {e.hora && <b style={{ marginRight: 7 }}>{e.hora}</b>}
                    {e.titulo}
                    {!e.esHoy && <span style={{ color: 'var(--text-3)', fontSize: 13 }}> · próximo</span>}
                  </li>
                ))}
              </ul>
            </Bloque>

            <Bloque titulo="Bajo mínimo" icon="inventory_2" color="#f97316" vacio={ficha.faltantes.length === 0}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {ficha.faltantes.map(f => (
                  <span key={f} style={{
                    fontSize: 14.5, padding: '4px 10px', borderRadius: 8,
                    background: 'rgba(249,115,22,.1)', color: '#f97316',
                  }}>{f}</span>
                ))}
              </div>
            </Bloque>
          </>
        )}

        {/* El foco del turno: una sola cosa, escrita por quien abre. Vive en la
            sesión y no en la base a propósito — es de este servicio, no del
            historial, y guardarlo invitaría a escribir para el registro. */}
        <section style={{
          background: 'var(--surface)', border: '1px dashed var(--border)',
          borderRadius: 14, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <label htmlFor="foco" style={{
            fontSize: 11.5, fontWeight: 800, letterSpacing: '.09em',
            textTransform: 'uppercase', color: 'var(--text-3)',
          }}>Foco del turno — una sola cosa</label>
          <input
            id="foco"
            value={foco}
            onChange={e => cambiarFoco(e.target.value)}
            placeholder="Ej: ayer salieron 3 platos sin control de pase"
            style={{
              width: '100%', border: 'none', outline: 'none', background: 'transparent',
              fontSize: 16, color: 'var(--text-1)', padding: 0,
            }}
          />
        </section>

        <p style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', margin: '4px 0 0', lineHeight: 1.5 }}>
          Se arma sola con lo que ya está cargado. Leela en voz alta antes de abrir — dos minutos.
        </p>
      </div>
    </>
  )
}
