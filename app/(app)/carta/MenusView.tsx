'use client'

import { useState, useMemo } from 'react'
import { useMenus, type MenuConPreparaciones, type MenuTipo } from '@/lib/hooks/useMenus'
import { HeaderAction, FilterChips, EmptyState, type FilterChip } from '@/components/ui'
import { hoyOperativo } from '@/lib/ops/turnos'
import { estadoMiseMenu } from '@/lib/ops/menuMise'

function fmtFechaCorta(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })
}

const TIPO_CHIPS: FilterChip<MenuTipo | 'todos'>[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'fijo', label: 'Fijos' },
  { value: 'evento', label: 'Eventos' },
]

// ════════════════════════════════════════════════════════════
// MENUS VIEW — lista de menús (el alta/edición vive en ComposicionEditor)
// ════════════════════════════════════════════════════════════
export default function MenusView({
  onBack, onNuevo, onEditar, onToast,
}: {
  onBack: () => void
  onNuevo: () => void
  onEditar: (menu: MenuConPreparaciones) => void
  onToast: (msg: string) => void
}) {
  const { menus, loading, eliminarMenu, activarEnMise, desactivarEnMise } = useMenus()
  const [tipoFilter, setTipoFilter] = useState<MenuTipo | 'todos'>('todos')

  const filtered = useMemo(
    () => tipoFilter === 'todos' ? menus : menus.filter(m => m.tipo === tipoFilter),
    [menus, tipoFilter],
  )

  return (
    <div className="scroll-body">
      {/* Header */}
      <div style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>
            <span className="material-symbols-outlined" style={{ color: '#fff', fontSize: 22 }}>arrow_back</span>
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>Menús</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,.5)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>Fijos y de evento</div>
          </div>
          <HeaderAction label="Nuevo" icon="add" onClick={onNuevo} />
        </div>
        {/* Tipo filter */}
        <FilterChips chips={TIPO_CHIPS} active={tipoFilter} onChange={setTipoFilter} context="onDark" />
      </div>

      {/* Lista */}
      <div style={{ padding: '12px 14px 100px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-3)', fontSize: 13 }}>Cargando menús…</div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="menu_book"
            title={menus.length === 0 ? 'Sin menús todavía' : 'Sin menús de este tipo'}
            subtitle="Armá uno por secciones (entradas, principal, postre)"
            cta={{ label: 'Nuevo menú', onClick: onNuevo }}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(menu => (
              <MenuCard key={menu.id} menu={menu}
                onEdit={() => onEditar(menu)}
                onDelete={async () => {
                  if (!confirm(`¿Eliminar el menú “${menu.nombre}”?`)) return
                  try { await eliminarMenu(menu.id); onToast('Menú eliminado') }
                  catch (e) { onToast('Error: ' + (e instanceof Error ? e.message : 'desconocido')) }
                }}
                onActivarMise={async () => {
                  try {
                    const res = await activarEnMise(menu)
                    if (!res) return
                    const sinOpsTxt = res.sinOps > 0 ? ` · ${res.sinOps} sin plaza (no van)` : ''
                    onToast(`${res.creados} preparaciones al mise${sinOpsTxt}`)
                  } catch (e) { onToast('Error: ' + (e instanceof Error ? e.message : 'desconocido')) }
                }}
                onSacarMise={async () => {
                  try { await desactivarEnMise(menu.id); onToast('Sacado del mise') }
                  catch (e) { onToast('Error: ' + (e instanceof Error ? e.message : 'desconocido')) }
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Card de menú en la lista ──
function MenuCard({ menu, onEdit, onDelete, onActivarMise, onSacarMise }: {
  menu: MenuConPreparaciones
  onEdit: () => void
  onDelete: () => void
  onActivarMise: () => Promise<void>
  onSacarMise: () => Promise<void>
}) {
  const [miseSaving, setMiseSaving] = useState(false)
  const porSeccion = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of menu.preparaciones) m.set(p.paso, (m.get(p.paso) ?? 0) + 1)
    return [...m.entries()]
  }, [menu.preparaciones])

  // ── Estado de vigencia en el mise (ver PLAN-MENUS-MISE-2026-08.md, Fase 4) ──
  const { sinVigencia, vigenciaVencida, vigenciaFutura, vigente } = estadoMiseMenu(menu, hoyOperativo())

  async function handleActivar() {
    setMiseSaving(true)
    try { await onActivarMise() } finally { setMiseSaving(false) }
  }
  async function handleSacar() {
    setMiseSaving(true)
    try { await onSacarMise() } finally { setMiseSaving(false) }
  }

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
      <div onClick={onEdit} style={{ padding: '12px 14px', cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 9, fontWeight: 800, padding: '2px 8px', borderRadius: 99, textTransform: 'uppercase', letterSpacing: '.04em',
            background: menu.tipo === 'evento' ? 'rgba(139,92,246,.14)' : 'rgba(7,89,133,.14)',
            color: menu.tipo === 'evento' ? '#7c3aed' : '#075985',
          }}>
            {menu.tipo === 'evento' ? 'Evento' : 'Fijo'}
          </span>
          {menu.tipo === 'evento' && menu.fecha_evento && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: 'rgba(139,92,246,.12)', color: '#7c3aed', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 12 }}>event</span>
              {new Date(menu.fecha_evento + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
            </span>
          )}
          <span style={{ flex: 1, fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>{menu.nombre}</span>
          <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>{menu.preparaciones.length} prep.</span>
        </div>
        {menu.descripcion && (
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>{menu.descripcion}</div>
        )}
        {porSeccion.length > 0 && (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 8 }}>
            {porSeccion.map(([sec, n]) => (
              <span key={sec} style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: 'var(--bg)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>
                {sec} · {n}
              </span>
            ))}
          </div>
        )}
        {/* Estado del mise — solo fijo (un evento se activa por fecha directo a
            Producción, no pasa por el mise: ver adenda 2026-08-20). Solo si
            ya se activó alguna vez (ver Fase 4). */}
        {menu.tipo !== 'evento' && menu.enMise && (
          <div style={{ marginTop: 8 }}>
            {vigente ? (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: 'rgba(34,197,94,.13)', color: '#16a34a', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 12 }}>playlist_add_check</span>
                En el mise · hasta {fmtFechaCorta(menu.vigencia_hasta!)}
              </span>
            ) : vigenciaFutura ? (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: 'var(--bg)', color: 'var(--text-3)', border: '1px solid var(--border)' }}>
                Entra el {fmtFechaCorta(menu.vigencia_desde!)}
              </span>
            ) : (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: 'var(--bg)', color: 'var(--text-3)', border: '1px solid var(--border)' }}>
                Venció el {fmtFechaCorta(menu.vigencia_hasta!)}
              </span>
            )}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', borderTop: '1px solid var(--border)' }}>
        <button onClick={onEdit} style={{ flex: 1, padding: '8px', background: 'none', border: 'none', borderRight: '1px solid var(--border)', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--accent)', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span> Editar
        </button>
        {/* Evento: sin toggle de mise — se activa por fecha desde Planificación
            (ver adenda 2026-08-20, "una sola puerta de activación"). */}
        {menu.tipo === 'evento' ? null : menu.enMise ? (
          <button onClick={handleSacar} disabled={miseSaving} title="Sacar del mise"
            style={{ flex: 1, padding: '8px', background: 'none', border: 'none', borderRight: '1px solid var(--border)', cursor: miseSaving ? 'default' : 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--text-3)', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, opacity: miseSaving ? .6 : 1 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>playlist_remove</span> Sacar
          </button>
        ) : (
          <button onClick={handleActivar} disabled={miseSaving || sinVigencia || vigenciaVencida}
            title={sinVigencia ? 'Cargá vigencia desde/hasta en Editar' : vigenciaVencida ? 'La vigencia ya venció — actualizala en Editar' : 'Activar en el mise'}
            style={{
              flex: 1, padding: '8px', background: 'none', border: 'none', borderRight: '1px solid var(--border)',
              cursor: (miseSaving || sinVigencia || vigenciaVencida) ? 'default' : 'pointer', fontSize: 12, fontWeight: 600,
              color: (sinVigencia || vigenciaVencida) ? 'var(--text-3)' : 'var(--accent)', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, opacity: miseSaving ? .6 : 1,
            }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>playlist_add_check</span> Activar en el mise
          </button>
        )}
        <button onClick={onDelete} style={{ padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#ef4444', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
        </button>
      </div>
    </div>
  )
}
