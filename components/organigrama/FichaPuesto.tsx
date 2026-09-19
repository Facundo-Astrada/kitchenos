'use client'

// Ficha del puesto — pantalla única con aspecto de CV mezclado con tablero.
// Dos modos sobre el mismo layout: 'edicion' (dueño/chef, Organigrama → Puestos
// → detalle, con lápices que abren la tanda correspondiente del cuestionario)
// y 'lectura' (el cocinero, desde Perfil → "Mi puesto"). Mockup aprobado y
// plan: PLAN-DESCRIPCION-PUESTO-2026-09.md (19/09/2026).
//
// Reglas que gobiernan todo el componente (no se negocian por sección):
// - Todo se mide sobre la PLAZA, nunca sobre la persona (DESIGN.md §9): sin
//   ranking, sin % por persona, nada rojo sobre un avatar/nombre.
// - Secciones vacías: invitación punteada en edición (nunca en rojo), ocultas
//   en lectura.
// - `puesto.plaza_default` puede ser null (5 de 6 puestos en la cuenta real
//   de Bros lo son) — todo lo que dependa de la plaza tiene un camino digno
//   para ese caso.

import { useMemo, useLayoutEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { useRestauranteId } from '@/lib/hooks/useRestauranteId'
import { Avatar, Num } from '@/components/ui'
import { useEquipo, NIVELES_ACCESO, type Puesto, type Miembro } from '@/lib/hooks/useEquipo'
import { iconoDePuesto } from './equipoShared'
import { usePuestoDescripcion } from '@/lib/hooks/usePuestoDescripcion'
import { useCompetencias } from '@/lib/hooks/useCompetencias'
import { useCartaDeLaCasa } from '@/lib/hooks/useCartaDeLaCasa'
import { usePlazasCustom } from '@/lib/hooks/usePlazasCustom'
import type { Tanda } from './DescripcionPuestoWizard'
import {
  MODULO_CONFIG, NIVEL_AUTONOMO, ESTADO_RIESGO_PLAZA,
  NORMA_PISO_NACIONAL, nivelCompetencia, plazaLabel, plazaIcon, type ModuloId,
} from '@/lib/constants'

// ── Checklist de la plaza — fetch propio y liviano ──────────────────────────
// useChecklist() trae TODO el mise del restaurante y abre 2 canales realtime:
// de más para esta ficha, que solo necesita los nombres de la plaza del
// puesto (hasta 6, para el tramo "Al llegar" de "El día").
interface ChecklistItemLite { nombre: string; orden: number }
const SIN_ITEMS_CHECKLIST: ChecklistItemLite[] = []

async function fetchChecklistItemsLite(key: string): Promise<ChecklistItemLite[]> {
  const [, rid, plaza] = key.split('::')
  const supabase = createClient()
  const { data, error } = await supabase
    .from('checklist_items')
    .select('nombre, orden')
    .eq('restaurante_id', rid)
    .eq('plaza', plaza)
    .order('orden', { ascending: true })
  if (error) throw error
  return (data ?? []) as ChecklistItemLite[]
}

function useChecklistItemsDePlaza(plaza: string | null): ChecklistItemLite[] {
  const restauranteId = useRestauranteId()
  const swrKey = restauranteId && plaza ? `ficha-puesto-checklist::${restauranteId}::${plaza}` : null
  const { data = SIN_ITEMS_CHECKLIST } = useSWR(swrKey, fetchChecklistItemsLite, {
    revalidateOnFocus: false, revalidateOnReconnect: true, dedupingInterval: 300_000, keepPreviousData: true,
  })
  return data
}

// ── Ancho del contenedor, no del viewport ───────────────────────────────────
// En desktop la ficha convive con el sidebar y, a veces, con el panel del
// Coach: a 1280 px de ventana le quedan ~580 px. Decidir las columnas con
// useIsDesktop() la partía en dos columnas angostas (el nombre del puesto en
// tres renglones); se decide con el ancho real que le toca.
function useAnchoContenedor<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [ancho, setAncho] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setAncho(el.clientWidth)
    const ro = new ResizeObserver(entries => setAncho(entries[0].contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return { ref, ancho }
}

// ── Helpers ──────────────────────────────────────────────────────────────

function fmtDDMM(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

function nombreCompleto(m: Miembro): string {
  return `${m.nombre} ${m.apellido}`.trim()
}

// ── Piezas visuales chicas y reusadas dentro del componente ─────────────────

const editBtnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, border: '1px solid var(--border)',
  background: 'var(--surface)', color: 'var(--accent)', fontSize: 12, fontWeight: 600,
  padding: '7px 11px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
}

const labelCapsStyle: React.CSSProperties = {
  fontSize: 11.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--text-2)',
}

function SeccionCard({
  icon, titulo, accesorio, onEditar, editarLabel = 'Editar', children, raised,
}: {
  icon: string
  titulo: string
  accesorio?: React.ReactNode
  onEditar?: () => void
  editarLabel?: string
  children: React.ReactNode
  raised?: boolean
}) {
  return (
    <section style={{
      background: 'var(--surface)', borderRadius: raised ? 16 : 12,
      boxShadow: raised ? 'var(--shadow-2)' : 'var(--shadow-1)', padding: 18, minWidth: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-3)' }}>{icon}</span>
        <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, flex: 1, color: 'var(--text-1)', letterSpacing: '-.005em' }}>{titulo}</h2>
        {accesorio}
        {onEditar && (
          <button onClick={onEditar} className="hit-slop" style={editBtnStyle}>
            <span className="material-symbols-outlined" style={{ fontSize: 15, color: 'var(--accent)' }}>edit</span>
            {editarLabel}
          </button>
        )}
      </div>
      {children}
    </section>
  )
}

function InvitacionVacia({
  icon, titulo, subtitulo, cta, onClick,
}: {
  icon: string
  titulo: string
  subtitulo?: string
  cta: string
  onClick?: () => void
}) {
  return (
    <div style={{
      border: '1.5px dashed var(--border)', borderRadius: 12, padding: 14,
      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
    }}>
      <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--accent)', flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: '1 1 140px', minWidth: 140 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-1)' }}>{titulo}</div>
        {subtitulo && <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{subtitulo}</div>}
      </div>
      <button onClick={onClick} style={{ ...editBtnStyle, flexShrink: 0, minHeight: 44 }}>
        {cta}
      </button>
    </div>
  )
}

function FuenteChip({ variant, icon, label }: { variant: 'app' | 'dictado'; icon: string; label: string }) {
  if (variant === 'app') {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5, fontWeight: 600,
        color: 'var(--blue-fg)', background: 'var(--blue-bg)', padding: '2px 8px', borderRadius: 99, whiteSpace: 'nowrap',
      }}>
        <span className="material-symbols-outlined" style={{ fontSize: 12 }}>{icon}</span>
        {label}
      </span>
    )
  }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5, fontWeight: 600,
      color: 'var(--text-2)', background: 'var(--bg)', border: '1px solid var(--border)',
      padding: '2px 8px', borderRadius: 99, whiteSpace: 'nowrap',
    }}>
      <span className="material-symbols-outlined" style={{ fontSize: 12 }}>{icon}</span>
      {label}
    </span>
  )
}

function KpiCard({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--surface)', borderRadius: 12, boxShadow: 'var(--shadow-1)',
      padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0,
    }}>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-3)' }}>{icon}</span>
        {label}
      </div>
      {children}
    </div>
  )
}

const kpiValStyle: React.CSSProperties = { fontSize: 24, fontWeight: 700, color: 'var(--text-1)', display: 'flex', alignItems: 'baseline', gap: 6, lineHeight: 1 }
const kpiValSmallStyle: React.CSSProperties = { fontSize: 12, color: 'var(--text-2)', fontWeight: 500 }
const kpiSubStyle: React.CSSProperties = { fontSize: 12, color: 'var(--text-2)' }

function HeroChip({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 500,
      padding: '4px 10px', borderRadius: 99, background: 'rgba(255,255,255,.14)', color: '#fff', whiteSpace: 'nowrap',
    }}>
      <span className="material-symbols-outlined" style={{ fontSize: 15 }}>{icon}</span>
      {children}
    </span>
  )
}

function heroEstadoStyle(vigente: boolean): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600,
    padding: '5px 11px', borderRadius: 99, background: 'rgba(255,255,255,.16)',
    color: vigente ? 'var(--green)' : '#fff', whiteSpace: 'nowrap',
  }
}

const heroBtnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid rgba(255,255,255,.3)',
  background: 'rgba(255,255,255,.1)', color: '#fff', fontSize: 13, fontWeight: 600,
  padding: '0 14px', minHeight: 44, borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
}
const heroBtnPrimaryStyle: React.CSSProperties = { ...heroBtnStyle, background: '#fff', color: 'var(--navy)', border: 'none' }
const heroBtnDangerStyle: React.CSSProperties = { ...heroBtnStyle, color: 'var(--red)', padding: '0 12px' }

const misionQuoteStyle: React.CSSProperties = {
  gridColumn: '1 / -1', fontSize: 17, lineHeight: 1.5, fontWeight: 400, maxWidth: '70ch',
  margin: '2px 0 0', color: '#fff', borderLeft: '3px solid rgba(255,255,255,.35)', paddingLeft: 14,
}
const misionLabelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase',
  color: 'rgba(255,255,255,.66)', marginBottom: 4, fontWeight: 600,
}
const misionInviteStyle: React.CSSProperties = {
  gridColumn: '1 / -1', display: 'flex', gap: 12, alignItems: 'center', textAlign: 'left',
  background: 'rgba(255,255,255,.08)', border: '1.5px dashed rgba(255,255,255,.35)', borderRadius: 12,
  padding: '12px 14px', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', minHeight: 44, width: 'fit-content', maxWidth: '100%',
}

// ══════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════════════════════

export interface FichaPuestoProps {
  puesto: Puesto
  modo: 'edicion' | 'lectura'
  /** En modo lectura: el miembro que está mirando su propio puesto (para "Tu formación"). */
  miembroPropioId?: string | null
  onEditarPuesto?: () => void
  onEditarTanda?: (t: Tanda) => void
  onEliminar?: () => void
}

export function FichaPuesto({
  puesto, modo, miembroPropioId, onEditarPuesto, onEditarTanda, onEliminar,
}: FichaPuestoProps) {
  const edicion = modo === 'edicion'
  const { ref: raizRef, ancho } = useAnchoContenedor<HTMLDivElement>()
  // Cabecera partida + cuerpo en dos columnas solo cuando entran de verdad.
  const isDesktop = ancho >= 860
  const kpisEnFila = ancho >= 640

  const { puestos, areas, miembros } = useEquipo()
  const { descripcionDe } = usePuestoDescripcion()
  const {
    nivelDe, riesgo, referentesDePlaza, quienEnsena, setEnsena, competenciasDe, plazasQueCubre,
  } = useCompetencias()
  const { carta: cartaDeLaCasa } = useCartaDeLaCasa()
  const { plazasCustom } = usePlazasCustom()
  const plaza = puesto.plaza_default
  const itemsDeLaPlaza = useChecklistItemsDePlaza(plaza)

  const desc = descripcionDe(puesto.id)
  const mision = desc?.mision ?? null

  const ocupantes = useMemo(() => miembros.filter(m => m.puesto_id === puesto.id), [miembros, puesto.id])
  const area = useMemo(() => areas.find(a => a.key === puesto.area_key), [areas, puesto.area_key])
  const padre = useMemo(() => puestos.find(p => p.id === puesto.reporta_a_puesto_id), [puestos, puesto.reporta_a_puesto_id])
  const nivelAccesoLabel = NIVELES_ACCESO.find(n => n.value === puesto.nivel)?.label ?? puesto.nivel

  const icono = iconoDePuesto(puesto)

  const riesgoPlaza = useMemo(() => (plaza ? riesgo([plaza])[0] : null), [riesgo, plaza])

  const responsabilidadesBloques = useMemo(
    () => (desc?.responsabilidades ?? []).filter(b => b.items.length > 0),
    [desc],
  )
  const totalTareas = responsabilidadesBloques.length > 0
    ? responsabilidadesBloques.reduce((s, b) => s + b.items.length, 0)
    : puesto.tareas_funciones.length

  const enFormacionCount = plaza ? ocupantes.filter(m => nivelDe(m.id, plaza) < NIVEL_AUTONOMO).length : null

  const seccionesCompletas = [
    !!mision,
    (desc?.dia_tipo.length ?? 0) > 0,
    responsabilidadesBloques.length > 0,
    (desc?.expectativas.length ?? 0) > 0,
    (desc?.no_negociables.length ?? 0) > 0,
    (desc?.indicadores.length ?? 0) > 0,
    !!(desc?.condiciones?.beneficios?.length || desc?.condiciones?.capacitacion || desc?.condiciones?.carrera),
  ].filter(Boolean).length

  const estadoDocLabel = desc?.estado === 'vigente'
    ? `Vigente · v${desc.version}${desc.revisado_at ? ` · ${fmtDDMM(desc.revisado_at)}` : ''}`
    : desc ? 'Borrador sin terminar' : 'Sin empezar'

  // ── "El día" — renglones de la línea de tiempo ──
  interface RenglonDia { key: string; label: string; texto: string; fuente: 'app' | 'dictado'; destacado?: boolean }
  const renglonesDia: RenglonDia[] = []
  if (itemsDeLaPlaza.length > 0) {
    const nombres = itemsDeLaPlaza.slice(0, 6).map(i => i.nombre)
    const extra = itemsDeLaPlaza.length > 6 ? ` +${itemsDeLaPlaza.length - 6} más` : ''
    renglonesDia.push({ key: 'al-llegar', label: 'Al llegar', texto: nombres.join(' · ') + extra, fuente: 'app' })
  }
  for (const d of desc?.dia_tipo ?? []) {
    renglonesDia.push({
      key: d.momento, label: d.momento, texto: d.que_hace, fuente: 'dictado',
      destacado: d.momento === 'Pico de servicio',
    })
  }

  // ── "Qué hace" — bloques de responsabilidades (o fallback a tareas_funciones) ──
  const usaTareasFallback = responsabilidadesBloques.length === 0 && puesto.tareas_funciones.length > 0
  const bloquesQueHace = responsabilidadesBloques.length > 0
    ? responsabilidadesBloques
    : usaTareasFallback ? [{ titulo: 'Tareas diarias', items: puesto.tareas_funciones }] : []

  // ── "Qué esperamos y reglas de la casa" ──
  const expectativas = desc?.expectativas ?? []
  const noNegociables = desc?.no_negociables ?? []
  const casaNoNegociables = cartaDeLaCasa.no_negociables ?? []
  const tieneEsperamos = expectativas.length > 0 || noNegociables.length > 0
  const mostrarNorma = puesto.nivel !== 'admin'
  const mostrarSeccionEsperamos = tieneEsperamos || mostrarNorma || edicion

  // ── "Cómo se mide" ──
  const indicadores = desc?.indicadores ?? []
  const objetivos = puesto.objetivos ?? {}
  const tieneObjetivos = objetivos.pct_comandas_con_postre != null || objetivos.pct_comandas_con_cafe != null || objetivos.ticket_promedio != null
  const hayIndicadores = indicadores.length > 0 || tieneObjetivos

  // ── "Qué ofrece la casa" ──
  const condiciones = desc?.condiciones ?? null
  const hayCondiciones = !!(condiciones?.beneficios?.length || condiciones?.capacitacion || condiciones?.carrera)

  // ── Formación (edición) — fila de un ocupante ──
  function labelAutomatico(plazaPuesto: string): string {
    const ids = referentesDePlaza(plazaPuesto)
    if (ids.length === 0) return 'Referente de la plaza (automático)'
    const nombres = ids.map(id => miembros.find(m => m.id === id)).filter((m): m is Miembro => !!m).map(nombreCompleto)
    return `Referente de la plaza (automático: ${nombres.join(', ')})`
  }

  function renderFilaEdicion(m: Miembro) {
    const nombre = nombreCompleto(m)
    if (!plaza) {
      const propias = competenciasDe(m.id).filter(c => c.nivel > 0)
      return (
        <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 4px' }}>
          <Avatar name={nombre} size={34} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>{nombre}</div>
            {propias.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Sin niveles cargados</div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                {propias.map(c => {
                  const cfg = nivelCompetencia(c.nivel)
                  return (
                    <span key={c.plaza} style={{
                      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
                      background: cfg.color + '22', color: cfg.color,
                    }}>
                      {plazaLabel(c.plaza, plazasCustom)}
                    </span>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )
    }
    const nivel = nivelDe(m.id, plaza)
    const cfg = nivelCompetencia(nivel)
    const filaCompetencia = competenciasDe(m.id).find(c => c.plaza === plaza)
    const ensenaActual = filaCompetencia?.ensena_miembro_id ?? ''
    // El padrino ya asignado queda en la lista aunque haya bajado de nivel —
    // si no, el <select> controlado mostraría "automático" mintiendo.
    const candidatos = miembros.filter(mm => mm.id !== m.id && (nivelDe(mm.id, plaza) >= NIVEL_AUTONOMO || mm.id === ensenaActual))
    return (
      <div key={m.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 4px' }}>
        <Avatar name={nombre} size={34} style={{ marginTop: 1 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>{nombre}</span>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 99, background: cfg.color + '22', color: cfg.color }}>
              {cfg.label}
            </span>
          </div>
          {nivel < NIVEL_AUTONOMO && (
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11.5, color: 'var(--text-2)' }}>Le enseña:</span>
              <select
                value={ensenaActual}
                onChange={e => setEnsena(m.id, plaza, e.target.value || null)}
                style={{
                  fontSize: 12, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)',
                  background: 'var(--surface)', color: 'var(--text-1)', fontFamily: 'inherit', maxWidth: 260,
                }}
              >
                <option value="">{labelAutomatico(plaza)}</option>
                {candidatos.map(c => (
                  <option key={c.id} value={c.id}>{nombreCompleto(c)}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Formación (lectura) — filas de la persona propia ──
  function renderFormacionLectura() {
    if (!miembroPropioId) {
      return <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>El chef todavía no cargó tus niveles.</p>
    }
    const propias = competenciasDe(miembroPropioId)
    const conNivel = [...new Set(propias.filter(c => c.nivel > 0).map(c => c.plaza))]
    let lista: string[]
    if (plaza) {
      const resto = conNivel.filter(p => p !== plaza).sort((a, b) => plazaLabel(a, plazasCustom).localeCompare(plazaLabel(b, plazasCustom)))
      lista = [plaza, ...resto]
    } else {
      lista = conNivel.sort((a, b) => plazaLabel(a, plazasCustom).localeCompare(plazaLabel(b, plazasCustom)))
    }
    if (lista.length === 0) {
      return <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>El chef todavía no cargó tus niveles.</p>
    }
    return (
      <>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {lista.map((p, i) => {
            const nivel = nivelDe(miembroPropioId, p)
            const cfg = nivelCompetencia(nivel)
            const profesores = nivel < NIVEL_AUTONOMO ? quienEnsena(miembroPropioId, p) : []
            const nombresProfesores = profesores
              .map(id => miembros.find(m => m.id === id)).filter((m): m is Miembro => !!m).map(nombreCompleto)
            return (
              <div key={p} style={{ padding: '10px 0', borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-2)' }}>{plazaIcon(p, plazasCustom)}</span>
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>{plazaLabel(p, plazasCustom)}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 99, background: cfg.color + '22', color: cfg.color }}>
                    {cfg.label}
                  </span>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 3 }}>{cfg.ayuda}</div>
                {nivel < NIVEL_AUTONOMO && (
                  <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>
                    {nombresProfesores.length > 0
                      ? `Te enseña ${nombresProfesores.join(', ')}`
                      : 'Todavía no hay referente en esta plaza. Preguntale al chef.'}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--text-3)', margin: '12px 0 0' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 15 }}>lock</span>
          Esto lo ven vos y el chef. Nadie más.
        </p>
      </>
    )
  }

  return (
    <div ref={raizRef} style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1180, margin: '0 auto', width: '100%' }}>

      {/* ══ Cabecera — la parte "CV" ══ */}
      <section style={{
        background: 'linear-gradient(135deg, var(--navy), var(--accent))',
        borderRadius: 16, boxShadow: 'var(--shadow-2)', padding: isDesktop ? 22 : 18,
        display: 'grid', gridTemplateColumns: isDesktop ? 'minmax(0,1fr) auto' : 'minmax(0,1fr)',
        gap: isDesktop ? '18px 28px' : 14, color: '#fff',
      }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', minWidth: 0 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 12, background: 'rgba(255,255,255,.14)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 30, color: '#fff' }}>{icono}</span>
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,.66)' }}>
              {edicion ? (area ? `Puesto · ${area.nombre}` : 'Puesto') : 'Tu puesto'}
            </div>
            <h1 style={{ margin: '2px 0 8px', fontSize: isDesktop ? 28 : 22, lineHeight: 1.1, fontWeight: 700, letterSpacing: '-.01em', color: '#fff' }}>
              {puesto.nombre}
            </h1>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {area && <HeroChip icon={area.icon}>{area.nombre}</HeroChip>}
              <HeroChip icon={plaza ? plazaIcon(plaza, plazasCustom) : 'sync_alt'}>
                {plaza ? plazaLabel(plaza, plazasCustom) : 'Rota entre plazas'}
              </HeroChip>
              {padre && <HeroChip icon="north">Reporta a {padre.nombre}</HeroChip>}
              <HeroChip icon="verified_user">{nivelAccesoLabel}</HeroChip>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: isDesktop ? 'flex-end' : 'flex-start', gap: 12, minWidth: 0 }}>
          {edicion ? (
            <span style={heroEstadoStyle(desc?.estado === 'vigente')}>
              <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
                {desc?.estado === 'vigente' ? 'task_alt' : desc ? 'edit_note' : 'auto_stories'}
              </span>
              {estadoDocLabel}
            </span>
          ) : desc?.estado === 'vigente' ? (
            <span style={heroEstadoStyle(true)}>
              <span className="material-symbols-outlined" style={{ fontSize: 15 }}>task_alt</span>
              Vigente desde el {fmtDDMM(desc.revisado_at ?? desc.created_at)}
            </span>
          ) : null}

          {ocupantes.length > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'rgba(255,255,255,.66)' }}>
              <div style={{ display: 'flex' }}>
                {ocupantes.slice(0, 4).map((m, i) => (
                  <div key={m.id} style={{ marginLeft: i === 0 ? 0 : -8, border: '2px solid var(--accent)', borderRadius: '50%' }}>
                    <Avatar name={nombreCompleto(m)} size={30} />
                  </div>
                ))}
              </div>
              <span>{ocupantes.length} {ocupantes.length === 1 ? 'persona en este puesto' : 'personas en este puesto'}</span>
            </div>
          ) : (
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,.66)' }}>Vacante</span>
          )}

          {edicion && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'rgba(255,255,255,.66)' }}>
              <div style={{ width: 110, height: 6, borderRadius: 99, background: 'rgba(255,255,255,.15)', overflow: 'hidden', flexShrink: 0 }}>
                <div style={{ width: `${Math.round((seccionesCompletas / 7) * 100)}%`, height: '100%', background: '#fff', borderRadius: 99 }} />
              </div>
              <span><Num>{seccionesCompletas}</Num> de <Num>7</Num> secciones</span>
            </div>
          )}

          {edicion && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: isDesktop ? 'flex-end' : 'flex-start' }}>
              {onEditarPuesto && (
                <button onClick={onEditarPuesto} style={heroBtnStyle}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span>
                  Editar puesto
                </button>
              )}
              <button onClick={() => onEditarTanda?.(1)} style={heroBtnPrimaryStyle}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{desc ? 'edit_note' : 'auto_stories'}</span>
                {desc ? 'Editar descripción' : 'Completar descripción'}
              </button>
              {ocupantes.length === 0 && onEliminar && (
                <button onClick={onEliminar} title="Eliminar puesto" className="hit-slop" style={heroBtnDangerStyle}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                </button>
              )}
            </div>
          )}
        </div>

        {mision ? (
          <blockquote style={misionQuoteStyle}>
            <span style={misionLabelStyle}>Para qué está este puesto</span>
            {mision}
          </blockquote>
        ) : edicion ? (
          <button onClick={() => onEditarTanda?.(3)} style={misionInviteStyle}>
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>help</span>
            <span>
              <span style={{ display: 'block', fontWeight: 700, fontSize: 13.5 }}>Para qué está este puesto</span>
              <span style={{ display: 'block', fontSize: 12, opacity: .8 }}>1 pregunta</span>
            </span>
          </button>
        ) : puesto.descripcion ? (
          <blockquote style={misionQuoteStyle}>
            <span style={misionLabelStyle}>Para qué está este puesto</span>
            {puesto.descripcion}
          </blockquote>
        ) : null}
      </section>

      {/* ══ Tira de indicadores — la parte "tablero" ══ */}
      <section style={{ display: 'grid', gridTemplateColumns: kpisEnFila ? 'repeat(4, minmax(0,1fr))' : 'repeat(2, minmax(0,1fr))', gap: 12 }}>
        <KpiCard icon="groups" label={plaza ? `Cobertura de ${plazaLabel(plaza, plazasCustom)}` : 'Plaza'}>
          {plaza && riesgoPlaza ? (
            <>
              <div style={kpiValStyle}>
                <Num>{riesgoPlaza.autonomos}</Num>
                <span style={kpiValSmallStyle}>{riesgoPlaza.autonomos === 1 ? 'la cubre solo' : 'la cubren solos'}</span>
              </div>
              <div style={kpiSubStyle}>
                <span style={{ color: ESTADO_RIESGO_PLAZA[riesgoPlaza.estado].color }}>●</span> {ESTADO_RIESGO_PLAZA[riesgoPlaza.estado].label}
                {' · '}{riesgoPlaza.referentes} {riesgoPlaza.referentes === 1 ? 'la enseña' : 'la enseñan'}
              </div>
            </>
          ) : (
            <div style={kpiSubStyle}>Rota entre plazas</div>
          )}
        </KpiCard>

        <KpiCard icon="checklist" label="Tareas">
          <div style={kpiValStyle}><Num>{totalTareas}</Num></div>
          <div style={kpiSubStyle}>{responsabilidadesBloques.length > 0 ? 'de la descripción' : 'del puesto'}</div>
        </KpiCard>

        <KpiCard icon="badge" label="Personas en el puesto">
          <div style={kpiValStyle}><Num>{ocupantes.length}</Num></div>
        </KpiCard>

        {edicion ? (
          <KpiCard icon="school" label="En formación">
            {plaza ? (
              <div style={kpiValStyle}>
                <Num>{enFormacionCount}</Num>
                <span style={kpiValSmallStyle}>{enFormacionCount === 1 ? 'persona' : 'personas'}</span>
              </div>
            ) : (
              <>
                <div style={kpiValStyle}>—</div>
                <div style={kpiSubStyle}>sin plaza fija</div>
              </>
            )}
          </KpiCard>
        ) : (
          <KpiCard icon="school" label={plaza ? `Tu nivel en ${plazaLabel(plaza, plazasCustom)}` : 'Tus plazas'}>
            {plaza && miembroPropioId ? (
              <div style={kpiValStyle}>{nivelCompetencia(nivelDe(miembroPropioId, plaza)).label}</div>
            ) : miembroPropioId && competenciasDe(miembroPropioId).some(c => c.nivel > 0) ? (
              // Nunca un "0" suelto sobre la persona (DESIGN §9): el número
              // grande son las plazas en las que se está formando; cuántas
              // cubre solo va de subtítulo.
              <>
                <div style={kpiValStyle}>
                  <Num>{competenciasDe(miembroPropioId).filter(c => c.nivel > 0).length}</Num>
                  <span style={kpiValSmallStyle}>plazas</span>
                </div>
                <div style={kpiSubStyle}>{plazasQueCubre(miembroPropioId).length} las cubrís solo</div>
              </>
            ) : miembroPropioId ? (
              <>
                <div style={kpiValStyle}>—</div>
                <div style={kpiSubStyle}>sin niveles cargados</div>
              </>
            ) : (
              <div style={kpiValStyle}>—</div>
            )}
          </KpiCard>
        )}
      </section>

      {/* ══ Cuerpo — columna principal + columna lateral ══ */}
      <div style={{
        display: 'grid', gridTemplateColumns: isDesktop ? 'minmax(0,1.55fr) minmax(0,1fr)' : 'minmax(0,1fr)',
        gap: 14, alignItems: 'start',
      }}>

        {/* ── Columna principal ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>

          {(renglonesDia.length > 0 || edicion) && (
            <SeccionCard icon="wb_twilight" titulo="El día" onEditar={edicion && renglonesDia.length > 0 ? () => onEditarTanda?.(2) : undefined}>
              {renglonesDia.length > 0 ? (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {renglonesDia.map((r, idx) => (
                      <div key={r.key} style={{ display: 'flex', gap: 10 }}>
                        <div style={{ width: 96, flexShrink: 0, textAlign: 'right', fontSize: 12, color: 'var(--text-2)', fontWeight: r.destacado ? 700 : 400, paddingTop: 2 }}>
                          {r.label}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                          <span style={{
                            width: 10, height: 10, borderRadius: '50%', marginTop: 4, flexShrink: 0,
                            background: r.destacado ? 'var(--accent)' : 'var(--surface)', border: '2px solid var(--accent)',
                          }} />
                          {idx < renglonesDia.length - 1 && <span style={{ width: 2, flex: 1, background: 'var(--border)', marginTop: 2 }} />}
                        </div>
                        <div style={{ flex: 1, minWidth: 0, paddingBottom: 14, display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '4px 8px' }}>
                          <span style={{ fontWeight: r.destacado ? 700 : 500, fontSize: 13.5, color: 'var(--text-1)' }}>{r.texto}</span>
                          {edicion && (r.fuente === 'app'
                            ? <FuenteChip variant="app" icon="checklist" label="de la app · checklist" />
                            : <FuenteChip variant="dictado" icon="mic" label="dictado" />)}
                        </div>
                      </div>
                    ))}
                  </div>
                  {edicion && (
                    <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: 0 }}>
                      Los renglones en azul salen solos de la app. Solo los dictados los escribiste vos.
                    </p>
                  )}
                </>
              ) : (
                <InvitacionVacia icon="wb_twilight" titulo="El día" subtitulo="3 preguntas" cta="Completar" onClick={() => onEditarTanda?.(2)} />
              )}
            </SeccionCard>
          )}

          {(bloquesQueHace.length > 0 || edicion) && (
            <SeccionCard
              icon="format_list_bulleted" titulo="Qué hace"
              accesorio={<span style={{ fontSize: 12, color: 'var(--text-3)' }}>{totalTareas} tareas</span>}
              onEditar={edicion && bloquesQueHace.length > 0 ? () => onEditarTanda?.(4) : undefined}
            >
              {bloquesQueHace.length > 0 ? (
                <>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: isDesktop && bloquesQueHace.length > 1 ? 'repeat(2, minmax(0,1fr))' : 'minmax(0,1fr)',
                    gap: 12,
                  }}>
                    {bloquesQueHace.map(b => (
                      <div key={b.titulo} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', minWidth: 0 }}>
                        <div style={labelCapsStyle}>{b.titulo}</div>
                        <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
                          {b.items.map((it, i) => (
                            <li key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13.5, color: 'var(--text-1)' }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-3)', marginTop: 7, flexShrink: 0 }} />
                              <span>{it}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                  {edicion && usaTareasFallback && (
                    <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '10px 0 0' }}>Salen del puesto. Revisalas en la tanda 4.</p>
                  )}
                </>
              ) : (
                <InvitacionVacia icon="format_list_bulleted" titulo="Qué hace" subtitulo="Responsabilidades del puesto" cta="Completar" onClick={() => onEditarTanda?.(4)} />
              )}
            </SeccionCard>
          )}

          {mostrarSeccionEsperamos && (
            <SeccionCard icon="handshake" titulo="Qué esperamos y reglas de la casa" onEditar={edicion && tieneEsperamos ? () => onEditarTanda?.(5) : undefined}>
              {tieneEsperamos ? (
                <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? 'repeat(2, minmax(0,1fr))' : 'minmax(0,1fr)', gap: 16 }}>
                  <div>
                    <div style={labelCapsStyle}>Un servicio excelente es cuando…</div>
                    <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {expectativas.map((t, i) => (
                        <li key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 13.5, color: 'var(--text-1)' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--accent)', flexShrink: 0 }}>star</span>
                          <span>{t}</span>
                        </li>
                      ))}
                      {expectativas.length === 0 && <li style={{ fontSize: 12.5, color: 'var(--text-3)' }}>—</li>}
                    </ul>
                  </div>
                  <div>
                    <div style={labelCapsStyle}>Reglas de la casa</div>
                    <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {noNegociables.map((t, i) => (
                        <li key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 13.5, color: 'var(--text-1)' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--accent)', flexShrink: 0 }}>rule</span>
                          <span>{t}</span>
                        </li>
                      ))}
                      {noNegociables.length === 0 && <li style={{ fontSize: 12.5, color: 'var(--text-3)' }}>—</li>}
                    </ul>
                    {casaNoNegociables.length > 0 && (
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed var(--border)' }}>
                        <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginBottom: 6 }}>De la casa, para todos los puestos</div>
                        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {casaNoNegociables.map((t, i) => (
                            <li key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 12.5, color: 'var(--text-3)' }}>
                              <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-3)', flexShrink: 0 }}>rule</span>
                              <span>{t}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              ) : edicion ? (
                <InvitacionVacia icon="handshake" titulo="Qué esperamos y reglas de la casa" subtitulo="2 preguntas" cta="Completar" onClick={() => onEditarTanda?.(5)} />
              ) : null}

              {mostrarNorma && (
                <div style={{ marginTop: tieneEsperamos || edicion ? 12 : 0, background: 'var(--bg)', border: '1px dashed var(--border)', borderRadius: 12, padding: '12px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 8 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>gavel</span>
                    Esto lo pide la norma, no la casa
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {NORMA_PISO_NACIONAL.map(item => (
                      <span key={item} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 99, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
                        {item}
                      </span>
                    ))}
                  </div>
                  <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '8px 0 0' }}>Piso nacional (Código Alimentario). Tu municipio puede pedir más.</p>
                </div>
              )}
            </SeccionCard>
          )}

          {edicion && desc?.estado !== 'vigente' && (
            <InvitacionVacia icon="task_alt" titulo="Dejar vigente la descripción" cta="Revisar y publicar" onClick={() => onEditarTanda?.(6)} />
          )}
        </div>

        {/* ── Columna lateral ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>

          <SeccionCard
            icon="school"
            titulo={modo === 'lectura' ? 'Tu formación' : 'Formación en este puesto'}
            raised
            accesorio={edicion ? <span style={{ fontSize: 11, color: 'var(--text-3)' }}>A–Z</span> : undefined}
          >
            {modo === 'lectura' ? renderFormacionLectura() : ocupantes.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>Nadie ocupa este puesto todavía.</p>
            ) : (
              <>
                {!plaza && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, padding: '10px 12px', background: 'var(--bg)', border: '1px dashed var(--border)', borderRadius: 10 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-2)', flexShrink: 0 }}>info</span>
                    <span style={{ flex: 1, fontSize: 12.5, color: 'var(--text-2)' }}>Asigná una plaza al puesto para seguir quién la aprende y quién le enseña</span>
                    {onEditarPuesto && (
                      <button onClick={onEditarPuesto} className="hit-slop" style={{ ...editBtnStyle, flexShrink: 0 }}>Editar puesto</button>
                    )}
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {[...ocupantes].sort((a, b) => a.nombre.localeCompare(b.nombre)).map(m => renderFilaEdicion(m))}
                </div>
                <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '12px 0 0', lineHeight: 1.5 }}>
                  Alfabético y sin porcentajes: muestra qué falta enseñar, no quién va mejor. El nivel se carga en Polivalencia.
                </p>
              </>
            )}
          </SeccionCard>

          {plaza && (() => {
            const referentes = referentesDePlaza(plaza)
              .map(id => miembros.find(m => m.id === id)).filter((m): m is Miembro => !!m)
            return (
              <SeccionCard
                icon="support_agent" titulo="A quién le preguntan"
                accesorio={edicion ? <FuenteChip variant="app" icon="auto_awesome" label="de Polivalencia" /> : undefined}
              >
                {referentes.length === 0 ? (
                  <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0 }}>Nadie enseña esta plaza todavía</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {referentes.map(m => (
                      <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <Avatar name={nombreCompleto(m)} size={42} />
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>{nombreCompleto(m)}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
                            {referentes.length === 1 ? `Único referente de ${plazaLabel(plaza, plazasCustom)}` : `Referente de ${plazaLabel(plaza, plazasCustom)}`}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SeccionCard>
            )
          })()}

          {(hayIndicadores || edicion) && (
            <SeccionCard icon="monitoring" titulo="Cómo se mide" onEditar={edicion && hayIndicadores ? () => onEditarTanda?.(6) : undefined}>
              {hayIndicadores ? (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {indicadores.map((ind, i) => (
                      <div key={i}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                          <span style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text-1)' }}>{ind.nombre}</span>
                          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>{ind.meta}</span>
                        </div>
                        {ind.modulo && MODULO_CONFIG[ind.modulo as ModuloId] && (
                          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>lo mide {MODULO_CONFIG[ind.modulo as ModuloId].label}</div>
                        )}
                      </div>
                    ))}
                    {objetivos.pct_comandas_con_postre != null && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 13.5, color: 'var(--text-1)' }}>% de comandas con postre</span>
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}><Num>{objetivos.pct_comandas_con_postre}%</Num></span>
                      </div>
                    )}
                    {objetivos.pct_comandas_con_cafe != null && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 13.5, color: 'var(--text-1)' }}>% de comandas con café</span>
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}><Num>{objetivos.pct_comandas_con_cafe}%</Num></span>
                      </div>
                    )}
                    {objetivos.ticket_promedio != null && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 13.5, color: 'var(--text-1)' }}>Ticket promedio</span>
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}><Num>${objetivos.ticket_promedio.toLocaleString('es-AR')}</Num></span>
                      </div>
                    )}
                  </div>
                  <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '12px 0 0' }}>Se mide sobre la plaza, nunca sobre la persona.</p>
                </>
              ) : (
                <InvitacionVacia icon="monitoring" titulo="Cómo se mide" subtitulo="Indicadores de la plaza" cta="Completar" onClick={() => onEditarTanda?.(6)} />
              )}
            </SeccionCard>
          )}

          {(hayCondiciones || edicion) && (
            <SeccionCard icon="redeem" titulo="Qué ofrece la casa" onEditar={edicion && hayCondiciones ? () => onEditarTanda?.(6) : undefined}>
              {hayCondiciones ? (
                <>
                  {(condiciones?.beneficios?.length ?? 0) > 0 && (
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {condiciones!.beneficios!.map((b, i) => (
                        <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13.5, color: 'var(--text-1)' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-3)', flexShrink: 0 }}>check_circle</span>
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {condiciones?.capacitacion && (
                    <div style={{ marginTop: 12 }}>
                      <div style={labelCapsStyle}>Capacitación</div>
                      <p style={{ fontSize: 13.5, color: 'var(--text-1)', margin: '4px 0 0' }}>{condiciones.capacitacion}</p>
                    </div>
                  )}
                  {condiciones?.carrera && (
                    <div style={{ marginTop: 12 }}>
                      <div style={labelCapsStyle}>Hacia dónde crece</div>
                      <p style={{ fontSize: 13.5, color: 'var(--text-1)', margin: '4px 0 0' }}>{condiciones.carrera}</p>
                    </div>
                  )}
                </>
              ) : (
                <InvitacionVacia icon="redeem" titulo="Qué ofrece la casa" subtitulo="Beneficios y crecimiento" cta="Completar" onClick={() => onEditarTanda?.(6)} />
              )}
            </SeccionCard>
          )}

          {puesto.permisos_app.length > 0 && (
            <SeccionCard icon="apps" titulo="Lo que usa en la app">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {puesto.permisos_app.map(mod => {
                  const cfg = MODULO_CONFIG[mod as ModuloId]
                  return (
                    <span key={mod} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 500,
                      padding: '5px 10px', borderRadius: 10, background: 'var(--blue-bg)', color: 'var(--blue-fg)',
                    }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 15 }}>{cfg?.icon ?? 'widgets'}</span>
                      {cfg?.label ?? mod}
                    </span>
                  )
                })}
              </div>
            </SeccionCard>
          )}
        </div>
      </div>
    </div>
  )
}
