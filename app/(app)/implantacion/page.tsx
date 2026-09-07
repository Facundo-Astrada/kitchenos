'use client'
/**
 * La cordillera — el medidor de organización del restaurante.
 *
 * Reemplaza a la guía de inicio (`/onboarding`), que era una grilla de tarjetas
 * con un % que llegaba a 100 y se apagaba. Ver `PLAN-IMPLANTACION-2026-09.md`.
 *
 * Cuatro decisiones que no son estéticas:
 *
 * 1. **Un solo número grande, y lo mueve el uso, no la carga.** El % sale de
 *    los checkpoints de INSERCIÓN. Si contara la carga, un restaurante que
 *    cargó todo y no usa nada mostraría 100%.
 * 2. **Se dibujan 7 hitos, no 31 estaciones.** Cada bandera abre su lista.
 * 3. **Un solo CTA: la estación que sigue.** El orden son dependencias reales.
 * 4. **Mide al restaurante, nunca a una persona** (DECISIONES.md § 25). En esta
 *    pantalla no aparece un solo nombre propio, a propósito.
 */
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRutaImplantacion } from '@/lib/hooks/useRutaImplantacion'
import { estadoDeEstacion, hitoAtrasado, type ProgresoHito } from '@/lib/implantacion/progreso'
import { estacionesDeHito, type HitoId } from '@/lib/implantacion/ruta'
import { MODULO_CONFIG, areaDuenaDeModulo } from '@/lib/constants'
import PageHeader from '@/components/shell/PageHeader'
import { useEquipo } from '@/lib/hooks/useEquipo'
import { useRestauranteId } from '@/lib/hooks/useRestauranteId'
import { responsableDeModulo } from '@/lib/organigrama/responsable'
import { textoRecordatorio, puedeRecordar, TIPO_RECORDATORIO } from '@/lib/implantacion/avisos'
import { crearNotificacion } from '@/lib/notificaciones/crear'
import { createClient } from '@/lib/supabase/client'
import type { Estacion } from '@/lib/implantacion/ruta'

const COLOR = {
  completo: '#10b981',
  'en-curso': '#f59e0b',
  pendiente: 'var(--border)',
} as const

export default function ImplantacionPage() {
  const router = useRouter()
  const { progreso, metricas, manual, confirmar, loading, esAdmin } = useRutaImplantacion()
  const { miembros, cobertura } = useEquipo()
  const RESTAURANTE_ID = useRestauranteId()
  const [abierto, setAbierto] = useState<HitoId | null>(null)
  const [avisado, setAvisado] = useState<Record<string, string>>({})

  /**
   * Manda el recordatorio al responsable de la estación — a una persona con
   * nombre, nunca "a los admins" (DECISIONES.md § 25). El disparo es humano y
   * no automático a propósito: todavía no hay scheduler, y un aviso que sale
   * solo desde el render de una pantalla se dispara de más.
   */
  async function avisar(e: Estacion) {
    if (!RESTAURANTE_ID) return
    const r = responsableDeModulo(e.modulo, cobertura)
    const miembro = r?.miembroId ? miembros.find(m => m.id === r.miembroId) : null
    if (!miembro?.auth_user_id) {
      setAvisado(a => ({ ...a, [e.id]: 'Esa área todavía no tiene responsable con acceso a la app' }))
      return
    }

    // Regla de cadencia: como mucho un recordatorio por día por persona, de
    // cualquier estación. Se chequea contra lo que ya se mandó, no contra un
    // flag local, para que no dependa del dispositivo desde el que se avisa.
    const sb = createClient()
    const { data: ultimo } = await sb.from('notificaciones')
      .select('created_at')
      .eq('restaurante_id', RESTAURANTE_ID)
      .eq('usuario_id', miembro.auth_user_id)
      .eq('tipo', TIPO_RECORDATORIO)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!puedeRecordar(ultimo?.created_at)) {
      setAvisado(a => ({ ...a, [e.id]: `${miembro.nombre} ya recibió un aviso hoy` }))
      return
    }

    const texto = textoRecordatorio(e, MODULO_CONFIG[e.modulo]?.href ?? '/')
    await crearNotificacion(sb, {
      restauranteId: RESTAURANTE_ID,
      usuarioId: miembro.auth_user_id,
      tipo: TIPO_RECORDATORIO,
      titulo: texto.titulo,
      cuerpo: texto.cuerpo,
      link: texto.link,
    })
    setAvisado(a => ({ ...a, [e.id]: `Avisado a ${miembro.nombre}` }))
  }

  const siguiente = progreso.siguiente
  const hrefSiguiente = siguiente ? MODULO_CONFIG[siguiente.modulo]?.href ?? '/' : null

  // Altura de cada barra: sube con el hito, como una cordillera. No es adorno —
  // cada hito cuesta más que el anterior.
  const alturas = useMemo(
    () => progreso.hitos.map((_, i) => 56 + i * 23),
    [progreso.hitos],
  )

  return (
    <>
      <PageHeader
        title="Organización"
        icon="landscape"
        subtitle={progreso.dia !== null ? `Día ${progreso.dia} de la implantación` : undefined}
        onBack={() => router.push('/')}
      />

      <div style={{
        padding: 16, display: 'flex', flexDirection: 'column', gap: 16,
        maxWidth: 860, margin: '0 auto', width: '100%',
      }}>
        {/* ── El número, y lo que sigue ── */}
        <section style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 16, padding: '20px 20px 16px',
          display: 'flex', flexDirection: 'column', gap: 14,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18, flexWrap: 'wrap' }}>
            <div style={{
              fontSize: 58, fontWeight: 800, lineHeight: .85, letterSpacing: '-.04em',
              color: '#f59e0b', fontVariantNumeric: 'tabular-nums',
            }}>{loading ? '—' : `${progreso.pct}%`}</div>
            <div style={{ flex: 1, minWidth: 200, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 17, fontWeight: 700 }}>Organización</span>
              <span style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.45 }}>
                {progreso.insertadas} de {progreso.total} funciones se usan solas, sin que nadie las pida.
              </span>
            </div>
          </div>

          {siguiente && hrefSiguiente && (
            <Link href={hrefSiguiente} style={{
              display: 'flex', alignItems: 'center', gap: 11, padding: '12px 14px',
              background: 'var(--navy)', borderRadius: 12, textDecoration: 'none',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#fff', flexShrink: 0 }}>
                flag
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,.55)' }}>
                  Lo que sigue
                </span>
                <span style={{ display: 'block', fontSize: 14.5, fontWeight: 700, color: '#fff', marginTop: 1 }}>
                  {siguiente.titulo}
                </span>
              </span>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'rgba(255,255,255,.4)' }}>
                chevron_right
              </span>
            </Link>
          )}
        </section>

        {/* ── La cordillera ── */}
        <section style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 16, padding: '18px 12px 12px', overflowX: 'auto',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, minWidth: 460 }}>
            {progreso.hitos.map((h, i) => {
              const atrasado = hitoAtrasado(h, progreso.dia)
              const color = h.estado === 'completo' ? COLOR.completo
                : h.estado === 'en-curso' ? COLOR['en-curso'] : COLOR.pendiente
              return (
                <button
                  key={h.hito}
                  onClick={() => setAbierto(abierto === h.hito ? null : h.hito)}
                  style={{
                    flex: '1 1 0', minWidth: 62, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', gap: 6, background: 'none', border: 'none',
                    cursor: 'pointer', padding: 0, fontFamily: 'inherit',
                  }}
                  aria-label={`${h.nombre}: ${h.pct}%`}
                >
                  <span style={{
                    width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center',
                    fontSize: 12, fontWeight: 800, flexShrink: 0,
                    background: h.estado === 'pendiente' ? 'var(--surface)' : color,
                    border: `2px solid ${h.estado === 'pendiente' ? 'var(--border)' : color}`,
                    color: h.estado === 'pendiente' ? 'var(--text-3)' : '#fff',
                  }}>{h.estado === 'completo' ? '✓' : h.n}</span>
                  <div style={{
                    width: '100%', height: alturas[i],
                    borderRadius: '5px 5px 0 0',
                    background: h.estado === 'pendiente' ? 'var(--bg)' : `${color}22`,
                    border: `1px solid ${h.estado === 'pendiente' ? 'var(--border)' : color}`,
                    borderBottom: 'none',
                    display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
                    paddingTop: 7, position: 'relative',
                    outline: abierto === h.hito ? `2px solid ${color}` : undefined,
                    outlineOffset: 1,
                  }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                      color: h.estado === 'pendiente' ? 'var(--text-3)' : color,
                    }}>{h.pct}%</span>
                    {atrasado && (
                      <span className="material-symbols-outlined" style={{
                        position: 'absolute', bottom: 6, fontSize: 14, color: '#f97316',
                      }} title={`Objetivo: día ${h.diaObjetivo}`}>schedule</span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
          <div style={{ height: 3, background: 'var(--text-1)', margin: '0 0 10px' }} />
          <div style={{ display: 'flex', gap: 6, minWidth: 460 }}>
            {progreso.hitos.map(h => (
              <div key={h.hito} style={{ flex: '1 1 0', minWidth: 62, textAlign: 'center' }}>
                <span style={{ display: 'block', fontSize: 11.5, fontWeight: 600, lineHeight: 1.25 }}>{h.nombre}</span>
                <span style={{ display: 'block', fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>
                  {h.diaObjetivo ? `día ${h.diaObjetivo}` : 'opcional'}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* ── Las estaciones del hito abierto ── */}
        {abierto && (
          <ListaEstaciones
            hito={progreso.hitos.find(h => h.hito === abierto)!}
            metricas={metricas}
            manual={manual}
            esAdmin={esAdmin}
            onConfirmar={confirmar}
            onAvisar={avisar}
            avisado={avisado}
          />
        )}

        {!abierto && (
          <p style={{ fontSize: 12.5, color: 'var(--text-3)', textAlign: 'center', margin: 0, lineHeight: 1.5 }}>
            Tocá una bandera para ver sus estaciones. Esto mide al restaurante, no a las personas.
          </p>
        )}
      </div>
    </>
  )
}

function ListaEstaciones({
  hito, metricas, manual, esAdmin, onConfirmar, onAvisar, avisado,
}: {
  hito: ProgresoHito
  metricas: Parameters<typeof estadoDeEstacion>[1]
  manual: Parameters<typeof estadoDeEstacion>[2]
  esAdmin: boolean
  onConfirmar: (id: string, nivel: 'carga' | 'insercion') => void
  onAvisar: (e: Estacion) => void
  avisado: Record<string, string>
}) {
  const ests = estacionesDeHito(hito.hito)

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{hito.nombre}</h2>
        <span style={{ fontSize: 13, color: 'var(--text-3)' }}>{hito.pregunta}</span>
      </div>

      {ests.map(e => {
        const estado = estadoDeEstacion(e, metricas, manual)
        const area = areaDuenaDeModulo(e.modulo)
        const color = estado === 'insertada' ? '#10b981' : estado === 'cargada' ? '#f59e0b' : 'var(--border)'
        return (
          <div key={e.id} style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderLeft: `3px solid ${color}`, borderRadius: 12, padding: '13px 15px',
            display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <span style={{
                fontSize: 10.5, fontWeight: 700, color: 'var(--text-3)',
                fontVariantNumeric: 'tabular-nums', marginTop: 3, flexShrink: 0,
              }}>{e.id}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 600, lineHeight: 1.35 }}>
                  {e.clave && <span style={{ color: '#f59e0b', marginRight: 5 }}>★</span>}
                  {e.titulo}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 3 }}>
                  {MODULO_CONFIG[e.modulo]?.label}
                  {area && <> · responde <b style={{ color: 'var(--text-2)' }}>{area.nombre}</b></>}
                </div>
              </div>
              <Link
                href={MODULO_CONFIG[e.modulo]?.href ?? '/'}
                style={{ flexShrink: 0, display: 'flex', alignItems: 'center', textDecoration: 'none' }}
                aria-label={`Ir a ${MODULO_CONFIG[e.modulo]?.label}`}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 19, color: 'var(--text-3)' }}>
                  arrow_forward
                </span>
              </Link>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, paddingLeft: 26 }}>
              <Check
                label={e.cargaLabel} activo={estado !== 'pendiente'} tipo="carga"
                puedeConfirmar={esAdmin && !e.carga} onConfirmar={() => onConfirmar(e.id, 'carga')}
              />
              <Check
                label={e.insercionLabel} activo={estado === 'insertada'} tipo="insercion"
                puedeConfirmar={esAdmin && !e.insercion} onConfirmar={() => onConfirmar(e.id, 'insercion')}
              />
            </div>

            {e.apaga && (
              <div style={{
                paddingLeft: 26, fontSize: 11.5, color: 'var(--text-3)',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>do_not_disturb_on</span>
                <span>Apaga: <i>{e.apaga}</i></span>
              </div>
            )}

            {/* El aviso va a la persona que responde por el módulo, no "a los
                admins": un aviso que le llega a todos no lo atiende nadie. */}
            {esAdmin && estado !== 'insertada' && (
              <div style={{ paddingLeft: 26, display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  onClick={() => onAvisar(e)}
                  disabled={!!avisado[e.id]}
                  style={{
                    fontSize: 11.5, fontWeight: 600, padding: '4px 10px', borderRadius: 999,
                    border: '1px solid var(--border)', background: 'var(--bg)',
                    color: avisado[e.id] ? 'var(--text-3)' : 'var(--accent)',
                    cursor: avisado[e.id] ? 'default' : 'pointer', fontFamily: 'inherit',
                  }}
                >
                  {avisado[e.id] ? 'Enviado' : 'Avisarle al responsable'}
                </button>
                {avisado[e.id] && (
                  <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{avisado[e.id]}</span>
                )}
              </div>
            )}
          </div>
        )
      })}
    </section>
  )
}

function Check({
  label, activo, tipo, puedeConfirmar, onConfirmar,
}: {
  label: string; activo: boolean; tipo: 'carga' | 'insercion'
  puedeConfirmar: boolean; onConfirmar: () => void
}) {
  if (label === '—') return null
  const color = activo ? (tipo === 'insercion' ? '#10b981' : '#f59e0b') : 'var(--text-3)'
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7, fontSize: 12.5, lineHeight: 1.4 }}>
      <span className="material-symbols-outlined" style={{ fontSize: 15, color, marginTop: 1, flexShrink: 0 }}>
        {activo ? 'check_circle' : 'radio_button_unchecked'}
      </span>
      <span style={{ color: activo ? 'var(--text-1)' : 'var(--text-2)', flex: 1 }}>
        {tipo === 'insercion' && <b style={{ color: 'var(--text-3)', fontSize: 10.5, letterSpacing: '.06em' }}>SE USA · </b>}
        {label}
      </span>
      {puedeConfirmar && (
        <button
          onClick={onConfirmar}
          style={{
            fontSize: 11, fontWeight: 600, color: 'var(--accent)', background: 'none',
            border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0, fontFamily: 'inherit',
          }}
        >{activo ? 'Deshacer' : 'Ya está'}</button>
      )}
    </div>
  )
}
