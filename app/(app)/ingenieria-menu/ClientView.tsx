'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useRestauranteId } from '@/lib/hooks/useRestauranteId'
import { useRecetas } from '@/lib/hooks/useRecetas'
import { CATEGORIAS_PLATO } from '@/types'
import type { CategoriaPlato, PlatoComponente } from '@/types'

// ── Constants ─────────────────────────────────────────────────
const PLAZAS = [
  { id: 'parrilla',   label: 'Parrilla',    color: '#ef4444' },
  { id: 'frios',      label: 'Fríos',       color: '#0ea5e9' },
  { id: 'calientes',  label: 'Calientes',   color: '#f97316' },
  { id: 'pase',       label: 'Pase',        color: '#8b5cf6' },
  { id: 'pasteleria', label: 'Pastelería',  color: '#ec4899' },
  { id: 'panaderia',  label: 'Panadería',   color: '#84cc16' },
]
const PLAZAS_MAP = Object.fromEntries(PLAZAS.map(p => [p.id, p]))

const UNIDADES = ['u', 'kg', 'g', 'l', 'ml', 'pax', 'porc', 'bandeja', 'gastro', 'tupper']

const CAT_COLORS: Record<string, string> = {
  Tapa: '#0ea5e9', Appetizer: '#0ea5e9',
  Entrada: '#8b5cf6',
  Principal: '#ef4444', 'Proteína': '#ef4444',
  Pasta: '#f97316',
  'Guarnición': '#22c55e',
  Postre: '#ec4899',
}

// ── Types ──────────────────────────────────────────────────────
interface IngredientePlazaConfig {
  nombre: string
  plaza_produccion: string
}

interface Plato {
  id: string
  nombre: string
  categoria: string
  descripcion?: string | null
  componentes: ComponenteConfig[]
}

interface ComponenteConfig {
  id?: string
  nombre: string
  receta_id: string | null
  notas_produccion: string
  plaza: string
  cantidad_diaria: number | null
  unidad: string
  orden: number
  ingrediente_plazas: IngredientePlazaConfig[]
}

type RecetaMinima = {
  id: string
  nombre: string
  porciones?: number | null
  ingredientes?: { nombre: string }[]
}

// ── Main ──────────────────────────────────────────────────────
export default function IngenieriaMenuView({ embedded }: { embedded?: boolean } = {}) {
  const RESTAURANTE_ID = useRestauranteId()
  const { recetas } = useRecetas()
  const [platos, setPlatos] = useState<Plato[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [toast, setToast] = useState('')

  const supabase = useMemo(() => createClient(), [])

  // ── Carga platos + componentes ─────────────────────────────
  const fetchPlatos = useCallback(async () => {
    if (!RESTAURANTE_ID) return
    setLoading(true)
    try {
      const { data: platosData } = await supabase
        .from('platos_compuestos')
        .select('id, nombre, categoria, descripcion')
        .eq('restaurante_id', RESTAURANTE_ID)
        .eq('activo', true)
        .order('categoria').order('nombre')

      if (!platosData || platosData.length === 0) { setPlatos([]); return }

      const ids = platosData.map(p => p.id)
      const { data: compsData } = await supabase
        .from('plato_componentes')
        .select('id, plato_compuesto_id, nombre, receta_id, notas_produccion, plaza, cantidad_diaria, unidad, orden')
        .in('plato_compuesto_id', ids)
        .order('orden')

      // Load ingredient-plaza assignments from plato_plazas
      const recetaIds = (compsData ?? []).map(c => (c as PlatoComponente).receta_id).filter(Boolean) as string[]
      const ppMap: Record<string, IngredientePlazaConfig[]> = {}
      if (recetaIds.length > 0) {
        const { data: ppData } = await supabase
          .from('plato_plazas')
          .select('plato_id, plaza, ingredientes')
          .in('plato_id', recetaIds)
        for (const pp of (ppData ?? [])) {
          if (!ppMap[pp.plato_id]) ppMap[pp.plato_id] = []
          for (const ingNombre of (pp.ingredientes ?? [])) {
            ppMap[pp.plato_id].push({ nombre: ingNombre, plaza_produccion: pp.plaza })
          }
        }
      }

      const compsMap: Record<string, ComponenteConfig[]> = {}
      for (const c of (compsData ?? []) as PlatoComponente[]) {
        if (!compsMap[c.plato_compuesto_id]) compsMap[c.plato_compuesto_id] = []
        compsMap[c.plato_compuesto_id].push({
          id: c.id,
          nombre: c.nombre,
          receta_id: c.receta_id ?? null,
          notas_produccion: c.notas_produccion ?? '',
          plaza: c.plaza ?? '',
          cantidad_diaria: c.cantidad_diaria ?? null,
          unidad: c.unidad ?? 'u',
          orden: c.orden,
          ingrediente_plazas: c.receta_id ? (ppMap[c.receta_id] ?? []) : [],
        })
      }

      setPlatos(platosData.map(p => ({
        ...p,
        componentes: compsMap[p.id] ?? [],
      })))
    } finally {
      setLoading(false)
    }
  }, [RESTAURANTE_ID, supabase])

  useEffect(() => { fetchPlatos() }, [fetchPlatos])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  const editingPlato = editingId === 'new'
    ? null
    : platos.find(p => p.id === editingId) ?? null

  if (editingId !== null) {
    return (
      <PlatoWizard
        plato={editingPlato}
        recetas={recetas as RecetaMinima[]}
        restauranteId={RESTAURANTE_ID}
        supabase={supabase}
        onSave={async () => {
          await fetchPlatos()
          setEditingId(null)
          showToast('Guardado y sincronizado con el checklist')
        }}
        onCancel={() => setEditingId(null)}
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ background: 'var(--navy)', padding: `${embedded ? 0 : 46}px 16px 14px`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#fff' }}>Ingeniería de Menú</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', marginTop: 1 }}>
              Platos · Componentes · Plazas · Stock diario
            </div>
          </div>
          <button
            onClick={() => setEditingId('new')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'rgba(255,255,255,.15)', border: 'none', borderRadius: 10,
              padding: '7px 12px', cursor: 'pointer', color: '#fff',
              fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
            Nuevo plato
          </button>
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px 120px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)', fontSize: 13 }}>Cargando...</div>
        ) : platos.length === 0 ? (
          <EmptyState onNew={() => setEditingId('new')} />
        ) : (
          (() => {
            const grouped = new Map<string, Plato[]>()
            for (const p of platos) {
              const cat = p.categoria
              if (!grouped.has(cat)) grouped.set(cat, [])
              grouped.get(cat)!.push(p)
            }
            return [...grouped.entries()].map(([cat, items]) => (
              <div key={cat} style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, padding: '0 2px' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: CAT_COLORS[cat] ?? '#94a3b8', flexShrink: 0 }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.07em' }}>{cat}</span>
                </div>
                {items.map(plato => (
                  <PlatoCard
                    key={plato.id}
                    plato={plato}
                    onEdit={() => setEditingId(plato.id)}
                  />
                ))}
              </div>
            ))
          })()
        )}
      </div>

      {toast && (
        <div style={{
          position: 'fixed', bottom: 90, left: 16, right: 16, zIndex: 300,
          background: '#22c55e', color: '#fff', borderRadius: 12,
          padding: '12px 16px', fontSize: 13, fontWeight: 600, textAlign: 'center',
        }}>{toast}</div>
      )}
    </div>
  )
}

// ── Plato Card ────────────────────────────────────────────────
function PlatoCard({ plato, onEdit }: { plato: Plato; onEdit: () => void }) {
  const [open, setOpen] = useState(false)
  const withPlaza = plato.componentes.filter(c => c.plaza)
  const total = plato.componentes.length

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 14, overflow: 'hidden', marginBottom: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px' }}>
        <button
          onClick={() => setOpen(v => !v)}
          style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{plato.nombre}</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
              {total} componente{total !== 1 ? 's' : ''}
              {withPlaza.length > 0 && (
                <span style={{ marginLeft: 6, color: '#22c55e', fontWeight: 600 }}>
                  · {withPlaza.length} con plaza
                </span>
              )}
              {total > 0 && withPlaza.length < total && (
                <span style={{ marginLeft: 6, color: '#f97316', fontWeight: 600 }}>
                  · {total - withPlaza.length} sin plaza
                </span>
              )}
            </div>
          </div>
          <span className="material-symbols-outlined" style={{
            fontSize: 18, color: 'var(--text-3)',
            transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s',
          }}>expand_more</span>
        </button>
        <button
          onClick={onEdit}
          style={{ flexShrink: 0, background: 'rgba(67,97,160,.08)', border: 'none', borderRadius: 8, padding: '6px 10px', cursor: 'pointer' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--accent)' }}>edit</span>
        </button>
      </div>

      {open && plato.componentes.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          {plato.componentes.map((comp, i) => {
            const plazaCfg = PLAZAS_MAP[comp.plaza]
            const prodPlazas = [...new Set(comp.ingrediente_plazas.map(ip => ip.plaza_produccion).filter(Boolean))]
            return (
              <div key={i} style={{
                padding: '9px 14px',
                borderBottom: i < plato.componentes.length - 1 ? '1px solid var(--border)' : 'none',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="material-symbols-outlined" style={{
                    fontSize: 14, color: comp.receta_id ? 'var(--accent)' : 'var(--text-3)', flexShrink: 0,
                  }}>
                    {comp.receta_id ? 'menu_book' : 'inventory_2'}
                  </span>
                  <span style={{ flex: 1, fontSize: 13, color: 'var(--text-1)', fontWeight: 500 }}>{comp.nombre}</span>
                  {comp.cantidad_diaria != null && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', fontFamily: "'DM Mono', monospace" }}>
                      {comp.cantidad_diaria} {comp.unidad}
                    </span>
                  )}
                  {plazaCfg ? (
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 6,
                      background: `${plazaCfg.color}18`, color: plazaCfg.color, flexShrink: 0,
                    }}>
                      {plazaCfg.label}
                    </span>
                  ) : (
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 6,
                      background: 'rgba(245,158,11,.12)', color: '#d97706', flexShrink: 0,
                    }}>
                      sin plaza
                    </span>
                  )}
                </div>
                {/* Production plazas per ingredient */}
                {prodPlazas.length > 0 && (
                  <div style={{ marginTop: 5, marginLeft: 24, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {prodPlazas.map(pz => {
                      const pc = PLAZAS_MAP[pz]
                      const ings = comp.ingrediente_plazas.filter(ip => ip.plaza_produccion === pz).map(ip => ip.nombre)
                      return pc ? (
                        <span key={pz} style={{
                          fontSize: 9, padding: '2px 6px', borderRadius: 5,
                          background: `${pc.color}10`, color: pc.color, fontWeight: 600,
                        }}>
                          {pc.label}: {ings.join(', ')}
                        </span>
                      ) : null
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      {open && plato.componentes.length === 0 && (
        <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text-3)', borderTop: '1px solid var(--border)' }}>
          Sin componentes — tocá editar para configurar
        </div>
      )}
    </div>
  )
}

// ── Empty State ───────────────────────────────────────────────
function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 24px', gap: 12 }}>
      <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'var(--text-3)' }}>restaurant_menu</span>
      <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-2)', margin: 0 }}>Sin platos configurados</p>
      <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0, textAlign: 'center' }}>
        Cargá tu menú una vez y se sincroniza con planificación y checklist.
      </p>
      <button
        onClick={onNew}
        style={{
          marginTop: 8, padding: '12px 24px', borderRadius: 12, border: 'none',
          background: 'var(--navy)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
        }}
      >
        Crear primer plato
      </button>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// WIZARD — Crear / Editar plato
// ══════════════════════════════════════════════════════════════
interface WizardProps {
  plato: Plato | null
  recetas: RecetaMinima[]
  restauranteId: string
  supabase: ReturnType<typeof createClient>
  onSave: () => Promise<void>
  onCancel: () => void
}

function PlatoWizard({ plato, recetas, restauranteId, supabase, onSave, onCancel }: WizardProps) {
  const [step, setStep] = useState(0)
  const [nombre, setNombre] = useState(plato?.nombre ?? '')
  const [categoria, setCategoria] = useState<CategoriaPlato>((plato?.categoria as CategoriaPlato) ?? 'Principal')
  const [descripcion, setDescripcion] = useState(plato?.descripcion ?? '')
  const [componentes, setComponentes] = useState<ComponenteConfig[]>(
    plato?.componentes.length
      ? plato.componentes
      : [emptyComp(0)]
  )
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  function emptyComp(orden: number): ComponenteConfig {
    return { nombre: '', receta_id: null, notas_produccion: '', plaza: '', cantidad_diaria: null, unidad: 'u', orden, ingrediente_plazas: [] }
  }

  function addComp() {
    setComponentes(prev => [...prev, emptyComp(prev.length)])
  }

  function removeComp(idx: number) {
    setComponentes(prev => prev.filter((_, i) => i !== idx).map((c, i) => ({ ...c, orden: i })))
  }

  function updateComp(idx: number, field: keyof ComponenteConfig, value: string | number | null) {
    setComponentes(prev => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c))
  }

  function updateIngredientePlaza(compIdx: number, ingNombre: string, plaza: string) {
    setComponentes(prev => prev.map((c, i) => i !== compIdx ? c : {
      ...c,
      ingrediente_plazas: c.ingrediente_plazas.map(ip =>
        ip.nombre === ingNombre ? { ...ip, plaza_produccion: plaza } : ip
      ),
    }))
  }

  function selectReceta(idx: number, receta: RecetaMinima) {
    setComponentes(prev => prev.map((c, i) => {
      if (i !== idx) return c
      return {
        ...c,
        nombre: receta.nombre,
        receta_id: receta.id,
        cantidad_diaria: receta.porciones ?? c.cantidad_diaria,
        ingrediente_plazas: (receta.ingredientes ?? []).map(ing => ({
          nombre: ing.nombre,
          plaza_produccion: c.plaza,
        })),
      }
    }))
  }

  // ── Save + sync ──────────────────────────────────────────
  async function handleSave() {
    if (!nombre.trim() || !restauranteId) return
    setSaving(true)
    setSaveError('')
    try {
      const validComps = componentes.filter(c => c.nombre.trim())

      // 1. Upsert platos_compuestos
      let platoId = plato?.id ?? ''
      if (platoId) {
        await supabase.from('platos_compuestos')
          .update({ nombre: nombre.trim(), categoria, descripcion: descripcion || null, updated_at: new Date().toISOString() })
          .eq('id', platoId)
      } else {
        const { data, error } = await supabase.from('platos_compuestos')
          .insert({ nombre: nombre.trim(), categoria, descripcion: descripcion || null, restaurante_id: restauranteId, orden: 0, activo: true })
          .select('id').single()
        if (error) throw error
        platoId = data.id
      }

      // 2. Reemplazar plato_componentes
      await supabase.from('plato_componentes').delete().eq('plato_compuesto_id', platoId)
      if (validComps.length > 0) {
        const rows = validComps.map((c, i) => ({
          plato_compuesto_id: platoId,
          nombre: c.nombre,
          receta_id: c.receta_id ?? null,
          notas_produccion: c.notas_produccion || null,
          plaza: c.plaza || null,
          cantidad_diaria: c.cantidad_diaria ?? null,
          unidad: c.unidad || 'u',
          orden: i,
        }))
        const { error } = await supabase.from('plato_componentes').insert(rows)
        if (error) throw error
      }

      // 3. Sync checklist_items + plato_plazas
      const compsConPlaza = validComps.filter(c => c.plaza)
      if (compsConPlaza.length > 0) {
        // Collect all plazas needed (component + ingredient production plazas)
        const allPlazas = [...new Set([
          ...compsConPlaza.map(c => c.plaza).filter(Boolean),
          ...compsConPlaza.flatMap(c => c.ingrediente_plazas.map(ip => ip.plaza_produccion)).filter(Boolean),
        ])]

        const { data: secData } = await supabase
          .from('checklist_secciones')
          .select('id, plaza, orden')
          .eq('restaurante_id', restauranteId)
          .in('plaza', allPlazas)
          .order('orden', { ascending: true })

        const plazaSeccionMap: Record<string, string> = {}
        for (const sec of (secData ?? [])) {
          if (!plazaSeccionMap[sec.plaza]) plazaSeccionMap[sec.plaza] = sec.id
        }

        for (const comp of compsConPlaza) {
          const seccionId = plazaSeccionMap[comp.plaza] ?? null
          const hasIngPlazas = comp.receta_id && comp.ingrediente_plazas.some(ip => ip.plaza_produccion)

          // Component-level checklist item (the finished component at the service plaza)
          let existingId: string | null = null
          if (comp.receta_id) {
            const { data } = await supabase.from('checklist_items')
              .select('id').eq('restaurante_id', restauranteId)
              .eq('receta_id', comp.receta_id).maybeSingle()
            existingId = data?.id ?? null
          }
          if (!existingId) {
            const { data } = await supabase.from('checklist_items')
              .select('id').eq('restaurante_id', restauranteId)
              .eq('plaza', comp.plaza).eq('nombre', comp.nombre).maybeSingle()
            existingId = data?.id ?? null
          }

          if (existingId) {
            const upd: Record<string, unknown> = { cantidad: comp.cantidad_diaria ?? 0, unidad: comp.unidad }
            if (seccionId) upd.seccion_id = seccionId
            await supabase.from('checklist_items').update(upd).eq('id', existingId)
          } else {
            await supabase.from('checklist_items').insert({
              restaurante_id: restauranteId,
              plaza: comp.plaza,
              seccion_id: seccionId,
              seccion: comp.plaza,
              nombre: comp.nombre,
              cantidad: comp.cantidad_diaria ?? 0,
              unidad: comp.unidad,
              prioridad: 'p',
              receta_id: comp.receta_id ?? null,
              orden: 0,
            })
          }

          // 4. plato_plazas + ingredient-level checklist items
          if (comp.receta_id) {
            // Delete and rebuild all plato_plazas entries for this recipe
            await supabase.from('plato_plazas').delete().eq('plato_id', comp.receta_id)

            if (hasIngPlazas) {
              // Group ingredients by production plaza
              const byPlaza = new Map<string, string[]>()
              for (const ip of comp.ingrediente_plazas) {
                if (!ip.plaza_produccion) continue
                if (!byPlaza.has(ip.plaza_produccion)) byPlaza.set(ip.plaza_produccion, [])
                byPlaza.get(ip.plaza_produccion)!.push(ip.nombre)
              }

              for (const [plazaProd, ingNombres] of byPlaza.entries()) {
                // Insert plato_plazas row for this production plaza
                await supabase.from('plato_plazas').insert({
                  plato_id: comp.receta_id,
                  plaza: plazaProd,
                  ingredientes: ingNombres,
                  instruccion: comp.notas_produccion || null,
                  orden: 0,
                })

                const prodSeccionId = plazaSeccionMap[plazaProd] ?? null

                // Create/update one checklist item per ingredient at the production plaza
                for (const ingNombre of ingNombres) {
                  const { data: existIng } = await supabase.from('checklist_items')
                    .select('id').eq('restaurante_id', restauranteId)
                    .eq('plaza', plazaProd).eq('nombre', ingNombre).maybeSingle()

                  if (existIng) {
                    await supabase.from('checklist_items').update({
                      cantidad: comp.cantidad_diaria ?? 0,
                      unidad: comp.unidad,
                      ...(prodSeccionId ? { seccion_id: prodSeccionId } : {}),
                    }).eq('id', existIng.id)
                  } else {
                    await supabase.from('checklist_items').insert({
                      restaurante_id: restauranteId,
                      plaza: plazaProd,
                      seccion_id: prodSeccionId,
                      seccion: plazaProd,
                      nombre: ingNombre,
                      cantidad: comp.cantidad_diaria ?? 0,
                      unidad: comp.unidad,
                      prioridad: 'p',
                      receta_id: comp.receta_id,
                      orden: 0,
                    })
                  }
                }
              }
            } else {
              // No ingredient-level plazas — just record component plaza
              await supabase.from('plato_plazas').insert({
                plato_id: comp.receta_id,
                plaza: comp.plaza,
                instruccion: comp.notas_produccion || null,
                orden: 0,
              })
            }
          }
        }
      }

      await onSave()
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const STEPS = ['Plato', 'Componentes', 'Revisar']
  const canNext = step === 0 ? nombre.trim().length > 0 : true

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Wizard header */}
      <div style={{ background: 'var(--navy)', padding: '16px 16px 14px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <span className="material-symbols-outlined" style={{ color: 'rgba(255,255,255,.7)', fontSize: 22 }}>arrow_back</span>
          </button>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>
            {plato ? 'Editar plato' : 'Nuevo plato'}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          {STEPS.map((s, i) => (
            <div
              key={s}
              onClick={() => i < step && setStep(i)}
              style={{
                flex: 1, padding: '6px 0', borderRadius: 8, textAlign: 'center',
                background: i === step ? '#fff' : i < step ? 'rgba(255,255,255,.25)' : 'rgba(255,255,255,.08)',
                cursor: i < step ? 'pointer' : 'default',
                transition: 'all .15s',
              }}
            >
              <span style={{
                fontSize: 10, fontWeight: 700,
                color: i === step ? 'var(--navy)' : 'rgba(255,255,255,.6)',
              }}>{s}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Step body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 20px' }}>

        {/* ── Step 0: Plato ── */}
        {step === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Nombre del plato">
              <input
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                placeholder="Ej: Ceviche clásico"
                autoFocus
                style={inp}
              />
            </Field>

            <Field label="Categoría">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                {CATEGORIAS_PLATO.map(c => (
                  <button
                    key={c}
                    onClick={() => setCategoria(c)}
                    style={{
                      padding: '6px 12px', borderRadius: 99, border: 'none', cursor: 'pointer',
                      fontSize: 11, fontWeight: 700, fontFamily: 'inherit',
                      background: categoria === c ? 'var(--navy)' : 'var(--surface)',
                      color: categoria === c ? '#fff' : 'var(--text-2)',
                      outline: `1px solid ${categoria === c ? 'var(--navy)' : 'var(--border)'}`,
                    }}
                  >{c}</button>
                ))}
              </div>
            </Field>

            <Field label="Descripción (opcional)">
              <input
                value={descripcion}
                onChange={e => setDescripcion(e.target.value)}
                placeholder="Breve descripción del plato"
                style={inp}
              />
            </Field>
          </div>
        )}

        {/* ── Step 1: Componentes ── */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 0 6px' }}>
              Indicá la plaza que recibe cada componente y la cantidad diaria. Si tiene receta vinculada, podés asignar la producción de cada ingrediente a la plaza correspondiente.
            </p>
            {componentes.map((comp, idx) => (
              <ComponenteRow
                key={idx}
                comp={comp}
                idx={idx}
                recetas={recetas}
                onUpdate={(field, val) => updateComp(idx, field, val)}
                onSelectReceta={(r) => selectReceta(idx, r)}
                onUpdateIngredientePlaza={(ingNombre, plaza) => updateIngredientePlaza(idx, ingNombre, plaza)}
                onRemove={() => removeComp(idx)}
              />
            ))}
            <button
              onClick={addComp}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px',
                background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: 12,
                cursor: 'pointer', fontFamily: 'inherit', marginTop: 4,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--accent)' }}>add</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>Agregar componente</span>
            </button>
          </div>
        )}

        {/* ── Step 2: Revisar ── */}
        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <ReviewCard label="Plato" value={`${nombre} — ${categoria}`} />

            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 6 }}>
                Componentes ({componentes.filter(c => c.nombre.trim()).length})
              </div>
              {componentes.filter(c => c.nombre.trim()).map((comp, i) => {
                const plazaCfg = PLAZAS_MAP[comp.plaza]
                const prodPlazas = [...new Set(comp.ingrediente_plazas.map(ip => ip.plaza_produccion).filter(Boolean))]
                return (
                  <div key={i} style={{
                    padding: '9px 12px', background: 'var(--surface)', border: '1px solid var(--border)',
                    borderRadius: 10, marginBottom: 6,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 14, color: comp.receta_id ? 'var(--accent)' : 'var(--text-3)' }}>
                        {comp.receta_id ? 'menu_book' : 'inventory_2'}
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{comp.nombre}</div>
                        {comp.cantidad_diaria != null && (
                          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>
                            Stock diario: {comp.cantidad_diaria} {comp.unidad}
                          </div>
                        )}
                      </div>
                      {plazaCfg ? (
                        <span style={{
                          fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 6,
                          background: `${plazaCfg.color}18`, color: plazaCfg.color,
                        }}>
                          {plazaCfg.label}
                        </span>
                      ) : (
                        <span style={{
                          fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 6,
                          background: 'rgba(245,158,11,.12)', color: '#d97706',
                        }}>sin plaza</span>
                      )}
                    </div>
                    {/* Production plazas summary */}
                    {prodPlazas.length > 0 && (
                      <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        <span style={{ fontSize: 10, color: 'var(--text-3)', alignSelf: 'center', marginRight: 2 }}>Produce:</span>
                        {prodPlazas.map(pz => {
                          const pc = PLAZAS_MAP[pz]
                          const ings = comp.ingrediente_plazas.filter(ip => ip.plaza_produccion === pz).map(ip => ip.nombre)
                          return pc ? (
                            <span key={pz} style={{
                              fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 5,
                              background: `${pc.color}15`, color: pc.color,
                            }}>
                              {pc.label}: {ings.join(', ')}
                            </span>
                          ) : null
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
              {componentes.filter(c => c.plaza).length > 0 && (
                <div style={{
                  marginTop: 8, padding: '10px 12px', borderRadius: 10,
                  background: 'rgba(34,197,94,.06)', border: '1px solid rgba(34,197,94,.2)',
                }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#16a34a' }}>
                    ✓ Se sincronizarán checklist items por componente y por ingrediente según la plaza asignada
                  </div>
                </div>
              )}
            </div>

            {saveError && (
              <div style={{ padding: '10px 12px', background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 10, fontSize: 12, color: '#ef4444' }}>
                {saveError}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Nav buttons */}
      <div style={{
        padding: '12px 16px', paddingBottom: 'max(20px, env(safe-area-inset-bottom, 20px))',
        borderTop: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0,
        display: 'flex', gap: 8,
      }}>
        {step > 0 && (
          <button
            onClick={() => setStep(s => s - 1)}
            style={{
              flex: 1, padding: '13px 0', borderRadius: 12, border: '1px solid var(--border)',
              background: 'var(--bg)', color: 'var(--text-2)', fontSize: 13, fontWeight: 700,
              fontFamily: 'inherit', cursor: 'pointer',
            }}
          >
            Anterior
          </button>
        )}
        {step < 2 ? (
          <button
            onClick={() => canNext && setStep(s => s + 1)}
            disabled={!canNext}
            style={{
              flex: 2, padding: '13px 0', borderRadius: 12, border: 'none',
              background: canNext ? 'linear-gradient(135deg, var(--navy), #4361a0)' : 'var(--border)',
              color: canNext ? '#fff' : 'var(--text-3)', fontSize: 13, fontWeight: 700,
              fontFamily: 'inherit', cursor: canNext ? 'pointer' : 'default',
            }}
          >
            Siguiente
          </button>
        ) : (
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              flex: 2, padding: '13px 0', borderRadius: 12, border: 'none',
              background: saving ? 'var(--border)' : 'linear-gradient(135deg, var(--navy), #4361a0)',
              color: saving ? 'var(--text-3)' : '#fff', fontSize: 13, fontWeight: 700,
              fontFamily: 'inherit', cursor: saving ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              {saving ? 'more_horiz' : 'check_circle'}
            </span>
            {saving ? 'Guardando...' : 'Guardar y sincronizar'}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Componente Row ────────────────────────────────────────────
function ComponenteRow({
  comp, idx, recetas, onUpdate, onSelectReceta, onUpdateIngredientePlaza, onRemove,
}: {
  comp: ComponenteConfig
  idx: number
  recetas: RecetaMinima[]
  onUpdate: (field: keyof ComponenteConfig, val: string | number | null) => void
  onSelectReceta: (r: RecetaMinima) => void
  onUpdateIngredientePlaza: (ingNombre: string, plaza: string) => void
  onRemove: () => void
}) {
  const router = useRouter()
  const [expanded, setExpanded] = useState(idx === 0 || !comp.nombre)
  const [showSug, setShowSug] = useState(false)

  const sugs = useMemo(() => {
    if (!comp.nombre || comp.nombre.length < 2 || comp.receta_id) return []
    const q = comp.nombre.toLowerCase()
    return recetas.filter(r => r.nombre.toLowerCase().includes(q)).slice(0, 5)
  }, [comp.nombre, comp.receta_id, recetas])

  const recetaIngredientes = useMemo(() => {
    if (!comp.receta_id) return []
    const r = recetas.find(r => r.id === comp.receta_id)
    return r?.ingredientes ?? []
  }, [comp.receta_id, recetas])

  const plazaCfg = PLAZAS_MAP[comp.plaza]

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 12, overflow: 'hidden',
    }}>
      {/* Row header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px' }}>
        <span style={{
          width: 20, height: 20, borderRadius: '50%', background: 'var(--bg)',
          border: '1px solid var(--border)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', flexShrink: 0, fontSize: 10, fontWeight: 700, color: 'var(--text-3)',
        }}>{idx + 1}</span>

        <div style={{ flex: 1, minWidth: 0 }}>
          {comp.nombre ? (
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {comp.nombre}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Sin nombre</div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
            {plazaCfg && (
              <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: `${plazaCfg.color}18`, color: plazaCfg.color }}>
                {plazaCfg.label}
              </span>
            )}
            {comp.cantidad_diaria != null && (
              <span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: "'DM Mono', monospace" }}>
                {comp.cantidad_diaria} {comp.unidad}/día
              </span>
            )}
            {!comp.plaza && (
              <span style={{ fontSize: 10, color: '#d97706' }}>sin plaza</span>
            )}
            {recetaIngredientes.length > 0 && comp.ingrediente_plazas.some(ip => ip.plaza_produccion) && (
              <span style={{ fontSize: 9, color: '#22c55e', fontWeight: 600 }}>· ing. asignados</span>
            )}
          </div>
        </div>

        <button onClick={() => setExpanded(v => !v)} style={btnReset}>
          <span className="material-symbols-outlined" style={{
            fontSize: 18, color: 'var(--text-3)',
            transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform .15s',
          }}>expand_more</span>
        </button>
        <button onClick={onRemove} style={btnReset}>
          <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#ef4444' }}>close</span>
        </button>
      </div>

      {/* Expanded form */}
      {expanded && (
        <div style={{ padding: '0 12px 12px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Nombre con autocomplete de recetas */}
          <div style={{ marginTop: 10 }}>
            <LabelSmall>Nombre del componente</LabelSmall>
            {comp.receta_id ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5, background: 'rgba(67,97,160,.07)', border: '1px solid rgba(67,97,160,.2)', borderRadius: 10, padding: '8px 12px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#4361a0' }}>menu_book</span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{comp.nombre}</span>
                <button onClick={() => { onUpdate('receta_id', null); onUpdate('nombre', '') }} style={btnReset}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-3)' }}>close</span>
                </button>
              </div>
            ) : (
              <div style={{ position: 'relative', marginTop: 5 }}>
                <input
                  value={comp.nombre}
                  onChange={e => { onUpdate('nombre', e.target.value); setShowSug(true) }}
                  onFocus={() => setShowSug(true)}
                  placeholder="Ej: Salsa criolla, Costilla..."
                  style={inp}
                />
                {showSug && sugs.length > 0 && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    borderRadius: 10, marginTop: 2, boxShadow: '0 8px 24px rgba(0,0,0,.1)',
                  }}>
                    {sugs.map(r => (
                      <button
                        key={r.id}
                        onMouseDown={e => { e.preventDefault(); onSelectReceta(r); setShowSug(false) }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                          padding: '9px 12px', background: 'none', border: 'none',
                          borderBottom: '1px solid var(--border)', cursor: 'pointer',
                          fontFamily: 'inherit', textAlign: 'left',
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--accent)' }}>menu_book</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)' }}>{r.nombre}</span>
                      </button>
                    ))}
                  </div>
                )}
                {/* Crear receta button */}
                {!comp.receta_id && comp.nombre.trim().length > 2 && (
                  <button
                    onClick={() => router.push(`/recetario`)}
                    style={{
                      marginTop: 6, display: 'flex', alignItems: 'center', gap: 6,
                      width: '100%', padding: '8px 12px', borderRadius: 9,
                      background: 'rgba(67,97,160,.06)', border: '1px solid rgba(67,97,160,.18)',
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--accent)' }}>add_circle</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)' }}>
                      Crear receta para este componente
                    </span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Plaza de servicio (quien recibe el componente terminado) */}
          <div>
            <LabelSmall>Plaza que recibe el componente</LabelSmall>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6 }}>
              {PLAZAS.map(p => (
                <button
                  key={p.id}
                  onClick={() => onUpdate('plaza', comp.plaza === p.id ? '' : p.id)}
                  style={{
                    padding: '5px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
                    fontSize: 11, fontWeight: 700, fontFamily: 'inherit', transition: 'all .15s',
                    background: comp.plaza === p.id ? `${p.color}18` : 'var(--bg)',
                    color: comp.plaza === p.id ? p.color : 'var(--text-3)',
                    outline: comp.plaza === p.id ? `1.5px solid ${p.color}50` : 'none',
                  }}
                >{p.label}</button>
              ))}
            </div>
          </div>

          {/* Cantidad + unidad */}
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 2 }}>
              <LabelSmall>Cantidad diaria</LabelSmall>
              <input
                type="number"
                inputMode="decimal"
                value={comp.cantidad_diaria ?? ''}
                onChange={e => onUpdate('cantidad_diaria', e.target.value ? parseFloat(e.target.value) : null)}
                placeholder="0"
                style={{ ...inp, marginTop: 5, fontFamily: "'DM Mono', monospace" }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <LabelSmall>Unidad</LabelSmall>
              <select
                value={comp.unidad}
                onChange={e => onUpdate('unidad', e.target.value)}
                style={{ ...inp, marginTop: 5 }}
              >
                {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>

          {/* Notas producción */}
          <div>
            <LabelSmall>Notas (opcional)</LabelSmall>
            <input
              value={comp.notas_produccion}
              onChange={e => onUpdate('notas_produccion', e.target.value)}
              placeholder="Ej: Asar y desmenuzar antes del servicio"
              style={{ ...inp, marginTop: 5 }}
            />
          </div>

          {/* ── Ingredient-level production plaza assignment ── */}
          {recetaIngredientes.length > 0 && (
            <div style={{
              marginTop: 4, padding: '10px 12px', borderRadius: 10,
              background: 'var(--bg)', border: '1px solid var(--border)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--accent)' }}>grain</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '.07em' }}>
                  Plaza de producción por ingrediente
                </span>
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '0 0 10px' }}>
                ¿Qué plaza produce cada ingrediente? (puede diferir de la plaza que lo recibe)
              </p>
              {recetaIngredientes.map(ing => {
                const currentPlaza = comp.ingrediente_plazas.find(ip => ip.nombre === ing.nombre)?.plaza_produccion ?? ''
                const pc = PLAZAS_MAP[currentPlaza]
                return (
                  <div key={ing.nombre} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)', flex: 1 }}>{ing.nombre}</span>
                      {pc && (
                        <span style={{
                          fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                          background: `${pc.color}18`, color: pc.color,
                        }}>{pc.label}</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {PLAZAS.map(p => (
                        <button
                          key={p.id}
                          onClick={() => onUpdateIngredientePlaza(ing.nombre, currentPlaza === p.id ? '' : p.id)}
                          style={{
                            padding: '4px 9px', borderRadius: 7, border: 'none', cursor: 'pointer',
                            fontSize: 10, fontWeight: 700, fontFamily: 'inherit', transition: 'all .1s',
                            background: currentPlaza === p.id ? `${p.color}18` : 'var(--surface)',
                            color: currentPlaza === p.id ? p.color : 'var(--text-3)',
                            outline: currentPlaza === p.id ? `1.5px solid ${p.color}50` : 'none',
                          }}
                        >{p.label}</button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Review Card ───────────────────────────────────────────────
function ReviewCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: '10px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{value}</div>
    </div>
  )
}

// ── Small helpers ─────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <LabelSmall>{label}</LabelSmall>
      {children}
    </div>
  )
}
function LabelSmall({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.07em' }}>{children}</div>
}

const inp: React.CSSProperties = {
  background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10,
  padding: '9px 12px', fontSize: 13, fontFamily: 'inherit', color: 'var(--text-1)',
  outline: 'none', width: '100%', boxSizing: 'border-box',
}
const btnReset: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', padding: 4,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}
