'use client'

import PageTransition from '@/components/PageTransition'
import { useState, useMemo, useEffect } from 'react'
import { useIsDesktop } from '@/lib/hooks/useIsDesktop'
import { useCarta, type CategoriaCartaItem, type CartaItemEnriquecido, type PlatoRecetaEnriquecido } from '@/lib/hooks/useCarta'
import type { OpsResult } from '@/components/ops/OpsPanel'
import { useRestauranteId } from '@/lib/hooks/useRestauranteId'
import { usePermisos } from '@/lib/hooks/usePermisos'
import { useRecetas, type RecetaConCosto, unitConversionFactor } from '@/lib/hooks/useRecetas'
import { useStock, type ProductoConEstado } from '@/lib/hooks/useStock'
import { useVentas } from '@/lib/hooks/useVentas'
import { usePackagingGrupos } from '@/lib/hooks/usePackagingGrupos'
import { exportarExcel, fechaArchivo } from '@/lib/exportar'
import { createClient } from '@/lib/supabase/client'
import { useMenus, type MenuConPreparaciones } from '@/lib/hooks/useMenus'
import { useChecklist } from '@/lib/hooks/useChecklist'
import MenusView from './MenusView'
import ComposicionEditor, { type CompPayload, type CompInicial } from './ComposicionEditor'
import {
  upsertMiseChecklistItem, parseRecipienteNombre, TAREA_PRIO_TO_MISE,
  PLAZAS_OPS, SECCIONES_OPS, sumPlatoRecetaCantidad, shrinkOrPruneMise, porcionesDesdeCapacidad,
} from '@/lib/ops/mise'
import { gramajeDesdeCantidadOps } from '@/lib/recetas/peso'
import { useTareas } from '@/lib/hooks/useTareas'
import { clasificarIngenieriaMenu, buildVentasMap, mapaCuadrantePorId, QUAD_META } from '@/lib/carta/ingenieriaMenu'
import { sincronizarMiseDeMenu } from '@/lib/ops/menuMise'
import { Toast, FlipCard } from '@/components/ui'
import { fmtMoney, fcBadge, marginBadge, PlatoCard, PlatoCardBack, PlatoCardSkeleton } from './cards'
import { exportCartaPDF, exportRentabilidadPDF } from './exportar'
import { PackagingGruposDrawer } from './PackagingGruposDrawer'
import { ImportCartaModal } from './ImportCartaModal'
import { DetailView } from './DetailView'
// ── Helpers ─────────────────────────────────────────────
const CATEGORIAS: CategoriaCartaItem[] = [
  'Entradas', 'Principales', 'Postres', 'Bebidas', 'Guarniciones', 'Brunch', 'Cafetería',
]

// ── Rentabilidad View ───────────────────────────────────
type RentTab = 'lista' | 'ingenieria' | 'reprecio' | 'salud'

function RentabilidadView({
  items,
  ventas,
  onBack,
  verCostos = false,
  actualizarItem,
  onOpenPlato,
  showToast,
}: {
  items: CartaItemEnriquecido[]
  ventas: { items?: { nombre_plato: string; cantidad: number }[] | null }[]
  onBack: () => void
  verCostos?: boolean
  actualizarItem: (id: string, datos: { precio_venta?: number }) => Promise<void>
  onOpenPlato: (id: string) => void
  showToast: (msg: string) => void
}) {
  const [tab, setTab] = useState<RentTab>('lista')

  const sorted = useMemo(() =>
    items.filter(i => i.food_cost_pct != null).sort((a, b) => (a.food_cost_pct ?? 0) - (b.food_cost_pct ?? 0))
  , [items])

  // Popularidad por plato desde ventas — matching compartido con Ventas y con
  // la detección de fuga (lib/reportes/consumoTeorico.ts, PLAN-4-CAPAS B5).
  const ventasMap = useMemo(() => buildVentasMap(items, ventas), [ventas, items])

  // ── Feature 1: Ingeniería de menú (método Kasavana-Smith) ──
  const ing = useMemo(() => {
    const base = items
      .filter(i => i.food_cost_pct != null && i.margen_bruto != null)
      .map(i => ({ item: i, pop: ventasMap.get(i.id) ?? 0, margin: i.margen_bruto ?? 0 }))
    return clasificarIngenieriaMenu(base)
  }, [items, ventasMap])

  // ── Feature 2: Reprecio por inflación ──
  const FC_SOSPECHOSO = 200 // por encima de esto es casi siempre un error de unidades, no un plato caro de verdad
  const [targetFC, setTargetFC] = useState('32')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [aplicando, setAplicando] = useState(false)
  const reprecio = useMemo(() => {
    const t = parseFloat(targetFC.replace(',', '.'))
    if (!(t > 0)) return []
    return items
      .filter(i => i.food_cost_pct != null && (i.food_cost_pct ?? 0) > t && (i.food_cost_pct ?? 0) <= FC_SOSPECHOSO && (i.costo_porcion ?? 0) > 0)
      .map(i => ({ item: i, sugerido: Math.round((i.costo_porcion ?? 0) / (t / 100)) }))
      .sort((a, b) => (b.item.food_cost_pct ?? 0) - (a.item.food_cost_pct ?? 0))
  }, [items, targetFC])
  const reprecioSospechosos = useMemo(
    () => items.filter(i => (i.food_cost_pct ?? 0) > FC_SOSPECHOSO),
    [items],
  )
  const reprecioKey = reprecio.map(r => r.item.id).join(',')
  useEffect(() => { setSel(new Set(reprecio.map(r => r.item.id))) }, [reprecioKey]) // eslint-disable-line react-hooks/exhaustive-deps
  async function aplicarReprecio() {
    const elegidos = reprecio.filter(r => sel.has(r.item.id))
    if (elegidos.length === 0) return
    setAplicando(true)
    try {
      for (const r of elegidos) await actualizarItem(r.item.id, { precio_venta: r.sugerido })
      showToast(`${elegidos.length} precio${elegidos.length !== 1 ? 's' : ''} actualizado${elegidos.length !== 1 ? 's' : ''}`)
    } catch { showToast('Error al aplicar precios') }
    setAplicando(false)
  }

  // ── Feature 3: Salud de la carta ──
  const salud = useMemo(() => {
    const sinReceta = items.filter(i => !i.receta_id && i.plato_recetas.length === 0)
    const margenNeg = items.filter(i => i.margen_bruto != null && (i.margen_bruto ?? 0) < 0)
    const en86 = items.filter(i => !i.disponible)
    const sinCategoria = items.filter(i => !i.categoria || !i.categoria.trim())
    return { sinReceta, margenNeg, en86, sinCategoria, total: sinReceta.length + margenNeg.length + en86.length + sinCategoria.length }
  }, [items])

  const QUAD = QUAD_META

  const TABS: { id: RentTab; label: string }[] = [
    { id: 'lista', label: 'Lista' },
    { id: 'ingenieria', label: 'Ingeniería' },
    { id: 'reprecio', label: 'Reprecio' },
    { id: 'salud', label: `Salud${salud.total > 0 ? ` (${salud.total})` : ''}` },
  ]

  return (
    <div>
      <div style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 12 }}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 17 }}>Rentabilidad</span>
          <div style={{ flex: 1 }} />
          {verCostos && tab === 'lista' && (
            <button onClick={() => exportRentabilidadPDF(items, verCostos)} style={{
              background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8,
              padding: '6px 12px', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>picture_as_pdf</span>
              PDF
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4, overflowX: 'auto', scrollbarWidth: 'none' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: '8px 12px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', whiteSpace: 'nowrap',
              color: tab === t.id ? '#fff' : 'rgba(255,255,255,.5)',
              borderBottom: tab === t.id ? '2px solid #fff' : '2px solid transparent',
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      {/* ── Tab: Lista ── */}
      {tab === 'lista' && (
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sorted.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)', fontSize: 13 }}>
              Vinculá recetas a los platos para ver rentabilidad
            </div>
          ) : sorted.map((item, i) => {
            const fc = fcBadge(item.food_cost_pct ?? 0)
            return (
              <div key={item.id} onClick={() => onOpenPlato(item.id)} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: fc.bg, color: fc.text, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{i + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-1)' }}>{item.nombre}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', display: 'flex', gap: 8 }}>
                    <span>Venta: {fmtMoney(item.precio_venta)}</span>
                    <span>Costo: {fmtMoney(item.costo_porcion ?? 0)}</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: fc.text }}>{(item.food_cost_pct ?? 0).toFixed(1)}%</div>
                  <div style={{ fontSize: 11, color: '#059669', fontWeight: 600 }}>{fmtMoney(item.margen_bruto ?? 0)}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Tab: Ingeniería de menú ── */}
      {tab === 'ingenieria' && (
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {!ing.hayDatos ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)', fontSize: 13 }}>
              Vinculá recetas (para el margen) y cargá ventas (para la popularidad) para clasificar tu carta.
            </div>
          ) : (
            <>
              {/* La popularidad usa TODO el historial de ventas cargado, sin importar
                  el período que esté seleccionado en la pantalla Ventas — por eso un
                  período corto ahí puede mostrar "0" mientras acá ya hay platos
                  clasificados por popularidad. */}
              <div style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.4 }}>
                Popularidad calculada sobre todo el historial de ventas cargado (no el período de Ventas).
              </div>
              {!ing.conVentas && (
                <div style={{ background: 'rgba(245,158,11,.1)', border: '1px solid rgba(245,158,11,.3)', borderRadius: 10, padding: '10px 12px', fontSize: 11.5, color: '#92400e', lineHeight: 1.5 }}>
                  Sin ventas cargadas: la clasificación es solo por rentabilidad. Cargá ventas para cruzar con popularidad.
                </div>
              )}
              {(['estrella', 'caballo', 'puzzle', 'perro'] as const).map(q => {
                const meta = QUAD[q]
                const lista = ing[q]
                if (lista.length === 0) return null
                return (
                  <div key={q} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 18, color: meta.color }}>{meta.icon}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{meta.label}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-3)' }}>({lista.length})</span>
                    </div>
                    <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text-3)', borderBottom: '1px solid var(--border)' }}>{meta.rec}</div>
                    {lista.sort((a, b) => b.pop - a.pop).map(x => (
                      <button key={x.item.id} onClick={() => onOpenPlato(x.item.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '9px 12px', background: 'none', border: 'none', borderTop: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'inherit' }}>
                        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.item.nombre}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{x.pop} vend.</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#059669', fontFamily: "'DM Mono', monospace" }}>{fmtMoney(x.margin)}</span>
                      </button>
                    ))}
                  </div>
                )
              })}
            </>
          )}
        </div>
      )}

      {/* ── Tab: Reprecio por inflación ── */}
      {tab === 'reprecio' && (
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>Food cost objetivo</span>
            <input type="text" inputMode="decimal" value={targetFC} onChange={e => setTargetFC(e.target.value.replace(/[^0-9.,]/g, ''))}
              style={{ width: 56, border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: 8, padding: '6px 8px', fontSize: 14, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: 'var(--text-1)', textAlign: 'center', outline: 'none' }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)' }}>%</span>
          </div>
          {reprecioSospechosos.length > 0 && (
            <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 10, padding: '10px 12px', fontSize: 11.5, color: '#991b1b', lineHeight: 1.5 }}>
              {reprecioSospechosos.length} plato{reprecioSospechosos.length !== 1 ? 's' : ''} con food cost por encima de {FC_SOSPECHOSO}% — casi siempre es un error de unidades en la receta (porciones o cantidad mal cargadas), no un plato caro de verdad. Se excluyeron del reprecio automático: revisalos en Recetario antes de tocar el precio.
            </div>
          )}
          {reprecio.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)', fontSize: 13 }}>
              Ningún plato supera el food cost objetivo. 👌
            </div>
          ) : (
            <>
              {reprecio.map(r => {
                const checked = sel.has(r.item.id)
                return (
                  <button key={r.item.id} onClick={() => setSel(p => { const n = new Set(p); if (n.has(r.item.id)) n.delete(r.item.id); else n.add(r.item.id); return n })}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', cursor: 'pointer', fontFamily: 'inherit' }}>
                    <input type="checkbox" checked={checked} readOnly style={{ width: 16, height: 16, accentColor: 'var(--navy)', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.item.nombre}</div>
                      <div style={{ fontSize: 11, color: '#ef4444', fontWeight: 600 }}>FC {(r.item.food_cost_pct ?? 0).toFixed(0)}%</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', fontFamily: "'DM Mono', monospace" }}>{fmtMoney(r.item.precio_venta)} → {fmtMoney(r.sugerido)}</div>
                    </div>
                  </button>
                )
              })}
              <button onClick={aplicarReprecio} disabled={aplicando || sel.size === 0}
                style={{ width: '100%', background: 'var(--navy)', border: 'none', borderRadius: 10, padding: '13px', fontSize: 14, fontWeight: 700, color: '#fff', cursor: 'pointer', opacity: (aplicando || sel.size === 0) ? 0.6 : 1, fontFamily: 'inherit' }}>
                {aplicando ? 'Aplicando…' : `Aplicar a ${sel.size} plato${sel.size !== 1 ? 's' : ''}`}
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Tab: Salud de la carta ── */}
      {tab === 'salud' && (
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {salud.total === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)', fontSize: 13 }}>
              Tu carta está sana. 🎉
            </div>
          ) : ([
            { key: 'sinReceta', label: 'Sin receta vinculada', hint: 'food cost desconocido — vinculá una receta', color: 'var(--text-3)', list: salud.sinReceta },
            { key: 'margenNeg', label: 'Margen negativo', hint: 'el costo supera al precio — perdés plata', color: '#ef4444', list: salud.margenNeg },
            { key: 'en86', label: 'En 86 (no disponible)', hint: 'revisá si vuelve a la carta o se saca', color: '#f59e0b', list: salud.en86 },
            { key: 'sinCategoria', label: 'Sin categoría', hint: 'asignale una para que aparezca agrupado', color: 'var(--text-3)', list: salud.sinCategoria },
          ] as const).filter(g => g.list.length > 0).map(g => (
            <div key={g.key} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: g.color, flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{g.label}</span>
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>({g.list.length})</span>
              </div>
              <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text-3)' }}>{g.hint}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 12px 12px' }}>
                {g.list.slice(0, 16).map(it => (
                  <button key={it.id} onClick={() => onOpenPlato(it.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 999, padding: '4px 10px', fontSize: 11, fontWeight: 600, color: 'var(--text-1)', cursor: 'pointer', fontFamily: 'inherit' }}>
                    {it.nombre}
                  </button>
                ))}
                {g.list.length > 16 && <span style={{ fontSize: 10, color: 'var(--text-3)', alignSelf: 'center' }}>+{g.list.length - 16} más</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── MAIN PAGE ───────────────────────────────────────────
type View = 'list' | 'detail' | 'rentabilidad' | 'menus'

export default function CartaPage() {
  const { items, loading, fetchItems, crearItem, actualizarItem, actualizarTags, toggleDisponible, eliminarItem, duplicarItem, agregarPlatoReceta, actualizarPlatoRecetaOpsCompleta, actualizarPlatoRecetaGramaje, eliminarPlatoReceta, agregarPlatoPackaging, eliminarPlatoPackaging, categorias } = useCarta()
  const { recetas, refetch: refetchRecetas } = useRecetas()
  const { productos } = useStock()
  const { ventas } = useVentas()
  const { grupos, crearGrupo, eliminarGrupo, aplicarGrupoAPlatos } = usePackagingGrupos()
  const { crearMenu, actualizarMenu } = useMenus()
  const { items: checklistItems, refetchConfig } = useChecklist()
  const supabase = useMemo(() => createClient(), [])

  // Nombres de recipiente ya usados en OPS, para autocompletar el campo del
  // OpsPanel dentro del editor de composición (mismo patrón que CartaBoard.tsx).
  const recipientesUsados = useMemo(() => {
    const nombres = checklistItems
      .map(ci => parseRecipienteNombre(ci.recipiente_nombre).nombre)
      .filter((n): n is string => !!n)
    return [...new Set(nombres)].sort((a, b) => a.localeCompare(b, 'es'))
  }, [checklistItems])

  const RESTAURANTE_ID = useRestauranteId()
  const { puedeEditar, isAdmin, verCostos } = usePermisos()
  // Editar la carta y ver su plata son permisos distintos: un sous chef puede
  // necesitar uno sin el otro. Todo lo que muestra precio, margen, food cost o
  // cuadrante de ingeniería va por `verCostos`; esto es solo edición.
  const canEdit = isAdmin || puedeEditar('carta')
  const isDesktop = useIsDesktop()

  const [view, setView] = useState<View>('list')
  // Segundo cerrojo de Rentabilidad: ocultar el CTA no alcanza si el estado
  // `view` puede llegar por otro lado (deep link, estado viejo, el tour del
  // Coach). Sin permiso de costos, vuelve a la lista.
  useEffect(() => {
    if (view === 'rentabilidad' && !verCostos) setView('list')
  }, [view, verCostos])
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>('Todas')
  const [toast, setToast] = useState('')
  const [showGrupos, setShowGrupos] = useState(false)
  const [showImport, setShowImport] = useState(false)
  // Editor unificado de composición (Plato / Menú / Evento)
  const [composing, setComposing] = useState<null | { inicial?: CompInicial; menuEditId?: string }>(null)
  // OPS del detalle de plato — mismo patrón que openOpsId/savingOpsId en
  // CartaBoard.tsx (Mesa de Trabajo): el panel es OpsPanel compartido, la
  // persistencia vive acá, DetailView solo lo muestra.
  const [openOpsIdDetalle, setOpenOpsIdDetalle] = useState<string | null>(null)
  const [savingOpsIdDetalle, setSavingOpsIdDetalle] = useState<string | null>(null)

  // Derive selectedItem from fresh items (stays current after plato_recetas changes)
  const selectedItem = useMemo(
    () => items.find(i => i.id === selectedItemId) ?? null,
    [items, selectedItemId]
  )

  const filtered = useMemo(() => {
    if (filter === 'Todas') return items
    return items.filter(i => i.categoria === filter)
  }, [items, filter])

  // Cuadrante de ingeniería de menú por plato (PLAN-SUPERFICIE S3.2) — badge
  // "rareza" en la carta. Mismo cálculo que Rentabilidad → Ingeniería, reusado
  // acá vía lib/carta/ingenieriaMenu.ts para no duplicar el método. Solo admin
  // ve el badge (Precio/FC ya es solo-admin en esta pantalla; el cuadrante
  // deriva de esos mismos números).
  const quadranteMap = useMemo(() => {
    if (!verCostos) return null
    return mapaCuadrantePorId(items, buildVentasMap(items, ventas))
  }, [items, ventas, verCostos])

  const stats = useMemo(() => ({
    total: items.length,
    disponibles: items.filter(i => i.disponible).length,
    conReceta: items.filter(i => i.receta_id || i.plato_recetas.length > 0).length,
    noDisponibles: items.filter(i => !i.disponible).length,
  }), [items])

  // Contexto para KitchenCoach
  useEffect(() => {
    if (!items.length) return
    const itemsConFC = items.filter(i => i.food_cost_pct != null)
    const fcPromedio = itemsConFC.length
      ? Math.round(itemsConFC.reduce((s, i) => s + (i.food_cost_pct ?? 0), 0) / itemsConFC.length)
      : null
    const sinReceta = items.filter(i => !i.receta_id && i.plato_recetas.length === 0)
    const fcAlto = items
      .filter(i => (i.food_cost_pct ?? 0) > 35)
      .map(i => ({ nombre: i.nombre, fc: Math.round(i.food_cost_pct ?? 0), precio: i.precio_venta }))
      .sort((a, b) => b.fc - a.fc)
      .slice(0, 5)
    const margenNeg = items
      .filter(i => (i.margen_pct_computed ?? 0) < 0)
      .map(i => ({ nombre: i.nombre, margen: Math.round(i.margen_pct_computed ?? 0) }))
      .slice(0, 5)

    localStorage.setItem('kc_screen_context', JSON.stringify({
      screen: 'carta',
      total: items.length,
      disponibles: stats.disponibles,
      marcados86: stats.noDisponibles,
      sinReceta: sinReceta.length,
      sinRecetaNombres: sinReceta.map(i => i.nombre).slice(0, 5),
      fcPromedio,
      fcAlto,
      margenNegativo: margenNeg,
      categorias: [...new Set(items.map(i => i.categoria))],
    }))
    return () => localStorage.removeItem('kc_screen_context')
  }, [items, stats])

  async function exportXLSX() {
    await exportarExcel(`carta_${fechaArchivo()}.xlsx`, [{
      nombre: 'Carta',
      filas: items.map(i => ({
        'Nombre': i.nombre,
        'Categoría': i.categoria,
        'Descripción': i.descripcion ?? '',
        'Precio venta': i.precio_venta,
        'Costo porción': i.costo_porcion ?? '',
        'Food cost %': i.food_cost_pct != null ? Number(i.food_cost_pct.toFixed(1)) : '',
        'Disponible': i.disponible ? 'Sí' : 'No',
      })),
    }])
  }

  const handleCardClick = (item: CartaItemEnriquecido) => {
    setSelectedItemId(item.id)
    if (!isDesktop) setView('detail')
  }

  // ── Editor unificado: guardar Plato / Menú / Evento ──
  const handleComposicionSave = async (payload: CompPayload) => {
    try {
      if (payload.tipo === 'plato') {
        const newId = await crearItem({
          nombre: payload.nombre,
          descripcion: payload.descripcion,
          precio_venta: payload.precio,
          categoria: payload.categoria as CategoriaCartaItem,
          receta_id: null,
        })
        if (payload.tags.length > 0) await actualizarTags(newId, payload.tags)
        const compItems = payload.secciones.flatMap(s => s.items)
        const supa = createClient()
        for (const it of compItems) {
          if ((it.tipo === 'receta' || it.tipo === 'producto') && it.ref_id) {
            if (it.tipo === 'receta') await agregarPlatoReceta(newId, it.ref_id, it.cantidad ?? 1)
            // Guardar plaza + OPS en plato_recetas. Cuando cantidad_ops está en
            // unidad de peso/volumen (sin recipiente) es también el gramaje real
            // de este componente — se espeja a gramaje/gramaje_unidad (columna
            // dedicada al costeo) para que el food cost de Carta no dependa de
            // una columna que en otros casos guarda la demanda al mise (pax/porc/u).
            if (it.plaza || it.cantidad_ops != null) {
              const { gramaje, gramaje_unidad } = gramajeDesdeCantidadOps(it.cantidad_ops ?? null, it.unidad_ops ?? null)
              await supa.from('plato_recetas')
                .update({ plaza: it.plaza ?? null, cantidad_ops: it.cantidad_ops ?? null, unidad_ops: it.unidad_ops ?? null, gramaje, gramaje_unidad })
                .eq('plato_id', newId).eq('receta_id', it.ref_id)
            }
            // Si tiene OPS configurado: upsert checklist_items (helper compartido)
            if (it.plaza && it.seccion_mise && it.ref_id && RESTAURANTE_ID) {
              await upsertMiseChecklistItem({
                supabase: supa,
                restauranteId: RESTAURANTE_ID,
                recetaId: it.ref_id,
                nombre: it.nombre,
                plaza: it.plaza,
                seccionMiseId: it.seccion_mise,
                cantidad: it.cantidad_ops ?? 1,
                unidad: it.unidad_ops ?? 'u',
                recipienteNombre: it.recipiente_nombre ?? null,
                recipienteCantidad: it.recipiente_cantidad ?? 1,
                pesoPorcion: it.peso_porcion ?? null,
                pesoPorcionUnidad: it.peso_porcion_unidad ?? null,
                prioridad: TAREA_PRIO_TO_MISE[it.prioridad] ?? 'sp',
              })
            }
          }
        }
        setToast('Plato creado')
        setComposing(null)
        setView('list')
        return
      }
      // Menú / Evento
      const preps = payload.secciones.flatMap(s => s.items.map(it => ({
        paso: s.nombre,
        tipo: it.tipo,
        ref_id: it.ref_id,
        nombre: it.nombre,
        prioridad: it.prioridad,
        plaza: it.plaza,
        seccion_mise: it.seccion_mise,
        usuario_asignado: it.usuario_asignado,
        cantidad: it.cantidad,
        unidad: it.unidad,
        variante: it.variante ?? null,
        cantidad_ops: it.cantidad_ops ?? null,
        unidad_ops: it.unidad_ops ?? null,
        recipiente_nombre: it.recipiente_nombre ?? null,
        peso_porcion: it.peso_porcion ?? null,
        peso_porcion_unidad: it.peso_porcion_unidad ?? null,
      })))
      const data = {
        nombre: payload.nombre,
        tipo: (payload.tipo === 'evento' ? 'evento' : 'fijo') as 'fijo' | 'evento',
        descripcion: payload.descripcion,
        fecha_evento: payload.fechaEvento,
        vigencia_desde: payload.vigenciaDesde,
        vigencia_hasta: payload.vigenciaHasta,
        plaza_control: payload.plazaControl,
        variantes: payload.variantes,
        precio: payload.precio,
      }
      if (composing?.menuEditId) {
        await actualizarMenu(composing.menuEditId, data, preps)
        // Si el menú ya estaba activo en el mise, re-sincronizar para que los
        // cambios de esta edición (cantidad, plaza, prioridad) no lo dejen
        // desfasado — el mise no se entera solo de un update en menu_preparaciones.
        const supaSync = createClient()
        const { count } = await supaSync.from('checklist_items')
          .select('id', { count: 'exact', head: true })
          .eq('menu_id', composing.menuEditId)
        if (count && count > 0 && RESTAURANTE_ID) {
          await sincronizarMiseDeMenu({ supabase: supaSync, restauranteId: RESTAURANTE_ID, menu: { id: composing.menuEditId, plazaControl: payload.plazaControl, preparaciones: preps } })
        }
      } else {
        const newId = await crearMenu(data, preps)
        if (!newId) throw new Error('No se pudo crear el menú (sin restaurante activo)')
      }
      setToast(payload.tipo === 'evento' ? 'Evento guardado' : 'Menú guardado')
      setComposing(null)
    } catch (e) {
      console.error('[Carta] handleComposicionSave error:', e)
      setToast('Error al guardar: ' + (e instanceof Error ? e.message : 'desconocido'))
    }
  }

  // Mapear un menú existente al formato del editor unificado
  const menuToInicial = (menu: MenuConPreparaciones): CompInicial => {
    const secOrden: string[] = []
    for (const p of menu.preparaciones) if (!secOrden.includes(p.paso)) secOrden.push(p.paso)
    return {
      modo: menu.tipo === 'evento' ? 'evento' : 'menu',
      nombre: menu.nombre,
      descripcion: menu.descripcion,
      fechaEvento: menu.fecha_evento,
      vigenciaDesde: menu.vigencia_desde,
      vigenciaHasta: menu.vigencia_hasta,
      plazaControl: menu.plaza_control,
      variantes: menu.variantes ?? [],
      precio: menu.precio ?? 0,
      categoria: '',
      tags: [],
      secciones: secOrden.map(sec => ({
        nombre: sec,
        items: menu.preparaciones.filter(p => p.paso === sec).map(p => ({
          tipo: p.tipo,
          ref_id: p.ref_id,
          nombre: p.nombre,
          prioridad: p.prioridad,
          plaza: p.plaza,
          seccion_mise: p.seccion_mise,
          usuario_asignado: p.usuario_asignado,
          cantidad: p.cantidad,
          unidad: p.unidad,
          variante: p.variante,
          cantidad_ops: p.cantidad_ops,
          unidad_ops: p.unidad_ops,
          recipiente_nombre: p.recipiente_nombre,
          peso_porcion: p.peso_porcion,
          peso_porcion_unidad: p.peso_porcion_unidad,
        })),
      })),
    }
  }

  // Nombre/precio/categoría/descripción/foto — editable inline en DetailView
  // (Fase 3: reemplaza la pantalla separada EditarPlato.tsx).
  const handleGuardarMeta = async (datos: { nombre: string; descripcion: string; precio_venta: number; categoria: string; foto_url: string }) => {
    if (!selectedItemId) return
    await actualizarItem(selectedItemId, {
      nombre: datos.nombre,
      descripcion: datos.descripcion || null,
      precio_venta: datos.precio_venta,
      categoria: datos.categoria,
      foto_url: datos.foto_url || null,
    })
    setToast('Plato actualizado')
  }

  const handleEliminar = async () => {
    if (!selectedItemId) return
    if (!confirm('Eliminar este plato de la carta?')) return
    await eliminarItem(selectedItemId)
    setToast('Plato eliminado')
    setView('list')
  }

  const handleAgregarReceta = async (recetaId: string, porciones: number) => {
    if (!selectedItemId) return
    await agregarPlatoReceta(selectedItemId, recetaId, porciones)
    setToast('Receta agregada al plato')
  }

  const handleEliminarReceta = async (pr: PlatoRecetaEnriquecido) => {
    await eliminarPlatoReceta(pr.id)
    // Si el componente ya aportaba a una plaza, recalcular esa plaza (puede
    // vaciarse) — antes esto no se hacía y el mise quedaba con un ítem
    // fantasma (mismo fix que Mesa de Trabajo ya tenía, ver CartaBoard.tsx).
    if (pr.plaza) {
      await shrinkOrPruneMise({ supabase, restauranteId: RESTAURANTE_ID, recetaId: pr.receta_id, plaza: pr.plaza })
      await refetchConfig()
    }
    setToast('Receta desvinculada')
  }

  // ── OPS del detalle de plato (mismo flujo que CartaBoard.tsx) ──
  const handleGuardarOpsDetalle = async (pr: PlatoRecetaEnriquecido, result: OpsResult) => {
    setSavingOpsIdDetalle(pr.id)
    try {
      const oldPlaza = pr.plaza ?? null
      const recetaNombre = pr.receta?.nombre ?? 'Preparación'
      await actualizarPlatoRecetaOpsCompleta(pr.id, { plaza: result.plaza, cantidad_ops: result.cantidad, unidad_ops: result.unidad })
      const { total } = await sumPlatoRecetaCantidad(supabase, pr.receta_id, result.plaza)
      await upsertMiseChecklistItem({
        supabase, restauranteId: RESTAURANTE_ID, recetaId: pr.receta_id, nombre: recetaNombre,
        plaza: result.plaza, seccionMiseId: result.seccion, cantidad: total, unidad: result.unidad,
        recipienteNombre: result.recipienteNombre, recipienteCantidad: result.recipienteCantidad,
        pesoPorcion: result.pesoPorcion, pesoPorcionUnidad: result.pesoPorcionUnidad,
      })
      if (oldPlaza && oldPlaza !== result.plaza) {
        await shrinkOrPruneMise({ supabase, restauranteId: RESTAURANTE_ID, recetaId: pr.receta_id, plaza: oldPlaza })
      }
      await refetchConfig()
      setOpenOpsIdDetalle(null)
    } catch (e) {
      console.error('[Carta] handleGuardarOpsDetalle error:', e)
      setToast('Error al guardar en el mise')
    } finally {
      setSavingOpsIdDetalle(null)
    }
  }

  const handleQuitarOpsDetalle = async (pr: PlatoRecetaEnriquecido) => {
    if (!pr.plaza) return
    setSavingOpsIdDetalle(pr.id)
    try {
      const oldPlaza = pr.plaza
      await actualizarPlatoRecetaOpsCompleta(pr.id, { plaza: null, cantidad_ops: null, unidad_ops: null })
      await shrinkOrPruneMise({ supabase, restauranteId: RESTAURANTE_ID, recetaId: pr.receta_id, plaza: oldPlaza })
      await refetchConfig()
      setOpenOpsIdDetalle(null)
    } catch (e) {
      console.error('[Carta] handleQuitarOpsDetalle error:', e)
      setToast('Error al quitar de OPS')
    } finally {
      setSavingOpsIdDetalle(null)
    }
  }

  // ── Gramaje del detalle de plato (mismo criterio que CartaBoardCard.tsx:
  // con recipiente en el mise, el gramaje real es compartido — peso_porcion
  // en checklist_items; sin recipiente, es la columna dedicada del componente) ──
  const handleEditarGramajeDetalle = async (pr: PlatoRecetaEnriquecido, nuevoValor: number) => {
    await actualizarPlatoRecetaGramaje(pr.id, { gramaje: nuevoValor, gramaje_unidad: 'g' })
  }

  const handleEditarPesoPorcionDetalle = async (pr: PlatoRecetaEnriquecido, nuevoValor: number) => {
    if (!pr.plaza) return
    const { error } = await supabase.from('checklist_items').update({ peso_porcion: nuevoValor })
      .eq('restaurante_id', RESTAURANTE_ID).eq('receta_id', pr.receta_id).eq('plaza', pr.plaza)
    if (error) { console.error('[Carta] handleEditarPesoPorcionDetalle error:', error.message); return }
    await refetchConfig()
    await fetchItems()
  }

  const handleAgregarPackaging = async (productoId: string, cantidad: number) => {
    if (!selectedItemId) return
    await agregarPlatoPackaging(selectedItemId, productoId, cantidad)
    setToast('Packaging agregado')
  }

  const handleEliminarPackaging = async (packagingId: string) => {
    await eliminarPlatoPackaging(packagingId)
    setToast('Packaging eliminado')
  }

  const handleDuplicarPlato = async () => {
    if (!selectedItemId) return
    const newId = await duplicarItem(selectedItemId)
    setSelectedItemId(newId)
    setToast('Plato duplicado')
  }

  const handleAplicarGrupo = async (grupoId: string, platoIds: string[]) => {
    await aplicarGrupoAPlatos(grupoId, platoIds)
  }

  // ── Rentabilidad ──
  if (view === 'rentabilidad' && verCostos) {
    return (
      <>
        <RentabilidadView
          items={items}
          ventas={ventas}
          onBack={() => setView('list')}
          verCostos={verCostos}
          actualizarItem={actualizarItem}
          onOpenPlato={(pid) => { setSelectedItemId(pid); setView('detail') }}
          showToast={setToast}
        />
        {toast && <Toast msg={toast} onDone={() => setToast('')} />}
      </>
    )
  }

  // ── Editor unificado (Plato / Menú / Evento) ──
  if (composing) {
    return (
      <>
        <ComposicionEditor
          inicial={composing.inicial}
          recetas={recetas.map(r => ({
            id: r.id, nombre: r.nombre, costo: r.food_cost.costo_porcion,
            // costoPorGramo ya viene calculado por useRecetas (peso_total_g si está
            // cargado, si no derivado de los ingredientes — lib/recetas/peso.ts).
            costoPorGramo: r.costoPorGramo,
            ingredientes: (r.ingredientes ?? []).map(i => ({ nombre: i.nombre, cantidad: i.cantidad, unidad: i.unidad })),
          }))}
          productos={productos.map(p => {
            const factor = unitConversionFactor('g', p.unidad)
            return {
              id: p.id, nombre: p.nombre, costo: p.precio_unitario, unidad: p.unidad,
              // factor 0 = unidad incompatible con gramos (ej: producto por 'u') — no calcular
              costoPorGramo: factor > 0 ? p.precio_unitario * factor : null,
            }
          })}
          cartaItems={items.map(i => ({ id: i.id, nombre: i.nombre, costo: i.costo_porcion ?? 0 }))}
          categoriasCarta={categorias.length > 0 ? categorias.map(c => c.nombre) : CATEGORIAS}
          draftRecetaIds={new Set(recetas.filter(r => r.status === 'draft').map(r => r.id))}
          recipientesUsados={recipientesUsados}
          onSave={handleComposicionSave}
          onCancel={() => setComposing(null)}
        />
        {toast && <Toast msg={toast} onDone={() => setToast('')} />}
      </>
    )
  }

  // ── Menús ──
  if (view === 'menus') {
    return (
      <>
        <MenusView
          onBack={() => setView('list')}
          onNuevo={() => setComposing({ inicial: { modo: 'menu', nombre: '', descripcion: null, precio: 0, categoria: '', tags: [], secciones: [] } })}
          onEditar={(menu) => setComposing({ inicial: menuToInicial(menu), menuEditId: menu.id })}
          onToast={setToast}
        />
        {toast && <Toast msg={toast} onDone={() => setToast('')} />}
      </>
    )
  }

  // ── Detail ──
  if (view === 'detail' && selectedItem) {
    return (
      <>
        <DetailView
          item={selectedItem}
          recetas={recetas}
          productos={productos}
          categorias={categorias}
          checklistItems={checklistItems}
          recipientesUsados={recipientesUsados}
          onBack={() => setView('list')}
          onGuardarMeta={handleGuardarMeta}
          onEliminarPlato={handleEliminar}
          onDuplicar={handleDuplicarPlato}
          onAgregarReceta={handleAgregarReceta}
          onEliminarReceta={handleEliminarReceta}
          onAgregarPackaging={handleAgregarPackaging}
          onEliminarPackaging={handleEliminarPackaging}
          onShowGrupos={() => setShowGrupos(true)}
          onActualizarTags={tags => actualizarTags(selectedItem.id, tags)}
          openOpsId={openOpsIdDetalle}
          savingOpsId={savingOpsIdDetalle}
          onToggleOps={id => setOpenOpsIdDetalle(prev => prev === id ? null : id)}
          onGuardarOps={handleGuardarOpsDetalle}
          onQuitarOps={handleQuitarOpsDetalle}
          onEditarGramaje={handleEditarGramajeDetalle}
          onEditarPesoPorcion={handleEditarPesoPorcionDetalle}
          onRecetaActualizada={async () => { await Promise.all([fetchItems(), refetchRecetas()]) }}
          restauranteId={RESTAURANTE_ID}
        />
        {showGrupos && (
          <PackagingGruposDrawer
            grupos={grupos}
            productos={productos}
            platoActual={selectedItem}
            todosLosPlatos={items}
            onCrearGrupo={crearGrupo}
            onEliminarGrupo={eliminarGrupo}
            onAplicarGrupo={handleAplicarGrupo}
            onClose={() => setShowGrupos(false)}
            onAfterApply={async () => { await fetchItems(); setShowGrupos(false); setToast('Grupo aplicado') }}
          />
        )}
        {toast && <Toast msg={toast} onDone={() => setToast('')} />}
      </>
    )
  }

  // ── List ──
  return (
    <PageTransition>
    <div className="scroll-body">
      {/* Header */}
      <div data-coach-target="carta-header" style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 20 }}>Carta</span>
          {canEdit && (
            <button data-coach-target="carta-nuevo" onClick={() => setComposing({})} style={{
              background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,.3)',
              borderRadius: 10, padding: '7px 14px', color: '#fff',
              fontWeight: 700, fontSize: 13, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
              Nuevo
            </button>
          )}
        </div>
        {/* Navegación primaria — Platos | Menús (segmentado, mismo peso visual) */}
        <div style={{
          display: 'flex', gap: 4, background: 'rgba(255,255,255,0.1)',
          borderRadius: 13, padding: 4,
        }}>
          <button onClick={() => setView('list')} style={{
            flex: 1, border: 'none', borderRadius: 10, padding: '9px 0', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
            background: '#fff', color: 'var(--navy)',
            boxShadow: '0 1px 3px rgba(0,0,0,.15)',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 17 }}>restaurant_menu</span>
            Platos
          </button>
          <button data-coach-target="carta-menus" onClick={() => setView('menus')} style={{
            flex: 1, border: 'none', borderRadius: 10, padding: '9px 0', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
            background: 'transparent', color: 'rgba(255,255,255,0.75)',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 17 }}>menu_book</span>
            Menús
          </button>
        </div>

        {/* Utilidades — secundarias, discretas */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none', marginTop: 8 }}>
          <button data-coach-target="carta-importar" onClick={() => setShowImport(true)} style={{
            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,.15)',
            borderRadius: 18, padding: '4px 11px', color: 'rgba(255,255,255,0.85)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>upload_file</span>
            Importar
          </button>
          <button onClick={() => exportCartaPDF(items)} style={{
            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,.15)',
            borderRadius: 18, padding: '4px 11px', color: 'rgba(255,255,255,0.85)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>picture_as_pdf</span>
            PDF
          </button>
          <button onClick={exportXLSX} style={{
            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,.15)',
            borderRadius: 18, padding: '4px 11px', color: 'rgba(255,255,255,0.85)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>table_view</span>
            Excel
          </button>
        </div>

        {/* Stats row */}
        {items.length > 0 && (
          <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>
              {stats.total} platos
            </span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>
              {stats.disponibles} disponibles
            </span>
            {stats.noDisponibles > 0 && (
              <span style={{ fontSize: 11, color: '#fca5a5' }}>
                {stats.noDisponibles} 86&apos;d
              </span>
            )}
          </div>
        )}

        {/* Filters */}
        <div data-coach-target="carta-filtros" style={{ display: 'flex', gap: 6, marginTop: 10, overflowX: 'auto', paddingBottom: 2 }}>
          {(['Todas', ...categorias.map(c => c.nombre)]).map(cat => {
            const catObj = categorias.find(c => c.nombre === cat)
            return (
              <button
                key={cat}
                onClick={() => setFilter(cat)}
                style={{
                  padding: '5px 12px', borderRadius: 20, border: 'none',
                  background: filter === cat ? '#fff' : 'rgba(255,255,255,0.12)',
                  color: filter === cat ? 'var(--navy)' : 'rgba(255,255,255,0.8)',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                {catObj && (
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                    {catObj.icono || 'restaurant'}
                  </span>
                )}
                {cat}
              </button>
            )
          })}
        </div>
      </div>

      {/* Rentabilidad shortcut — toda la pantalla es plata (food cost,
          ingenieria de menu, reprecio), asi que el gate va en la entrada y no
          tab por tab. El de Ingenieria era el que faltaba (PENDIENTES). */}
      {verCostos && items.some(i => i.food_cost_pct != null) && (
        <div style={{ padding: '12px 16px 0' }}>
          <button data-coach-target="carta-rentabilidad" onClick={() => setView('rentabilidad')} style={{
            width: '100%', padding: '10px 14px', borderRadius: 10,
            background: '#eef2ff', border: '1px solid var(--accent)',
            display: 'flex', alignItems: 'center', gap: 8,
            cursor: 'pointer', color: '#4338ca',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>analytics</span>
            <div style={{ flex: 1, textAlign: 'left' }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Ver rentabilidad</div>
              <div style={{ fontSize: 11, color: 'var(--accent)' }}>
                Platos ordenados por food cost %
              </div>
            </div>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>chevron_right</span>
          </button>
        </div>
      )}

      {/* Lista de platos — en desktop cada tarjeta es una carta de jugador
          (FlipCard): toca para dar vuelta y ver el resumen/gestión, "Editar
          completo" lleva a la pantalla dedicada (view='detail'). En mobile
          sigue siendo un tap directo a esa misma pantalla, sin flip — ya es
          un solo salto, no hace falta el paso intermedio. */}
      <div data-coach-target="carta-lista" style={{ padding: 16, display: 'grid', gridTemplateColumns: isDesktop ? 'repeat(auto-fill, minmax(220px, 1fr))' : '1fr', gap: 10 }}>
        {loading ? (
          Array.from({ length: 6 }, (_, i) => <PlatoCardSkeleton key={i} />)
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, gridColumn: '1/-1' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 40, color: 'var(--text-3)' }}>receipt_long</span>
            <p style={{ color: 'var(--text-3)', fontSize: 13 }}>
              {filter === 'Todas' ? 'No hay platos en la carta' : `No hay platos en ${filter}`}
            </p>
            <button onClick={() => setComposing({})} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--navy)', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', marginTop: 4 }}>
              Agregar primer plato
            </button>
          </div>
        ) : isDesktop ? (
          filtered.map(item => (
            <FlipCard
              key={item.id}
              height={252}
              front={
                <PlatoCard
                  item={item}
                  onClick={() => {}}
                  onToggle={() => toggleDisponible(item.id, !item.disponible)}
                  verCostos={verCostos}
                  quadrante={quadranteMap?.get(item.id) ?? null}
                />
              }
              back={
                <PlatoCardBack
                  item={item}
                  verCostos={verCostos}
                  onToggleDisponible={() => toggleDisponible(item.id, !item.disponible)}
                  onEditarCompleto={() => { setSelectedItemId(item.id); setView('detail') }}
                />
              }
            />
          ))
        ) : (
          filtered.map(item => (
            <PlatoCard
              key={item.id}
              item={item}
              onClick={() => handleCardClick(item)}
              onToggle={() => toggleDisponible(item.id, !item.disponible)}
              verCostos={verCostos}
              quadrante={quadranteMap?.get(item.id) ?? null}
            />
          ))
        )}
      </div>

      {toast && <Toast msg={toast} onDone={() => setToast('')} />}

      {showImport && RESTAURANTE_ID && (
        <ImportCartaModal
          categorias={categorias}
          restauranteId={RESTAURANTE_ID}
          recetas={recetas}
          productos={productos}
          onClose={() => setShowImport(false)}
          onDone={msg => { setToast(msg); fetchItems() }}
        />
      )}
    </div>
    </PageTransition>
  )
}
