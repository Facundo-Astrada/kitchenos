'use client'

import { useState, useMemo } from 'react'
import { useMenus, type MenuConPreparaciones, type MenuTipo } from '@/lib/hooks/useMenus'

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
  const { menus, loading, eliminarMenu } = useMenus()
  const [tipoFilter, setTipoFilter] = useState<MenuTipo | 'todos'>('todos')

  const filtered = useMemo(
    () => tipoFilter === 'todos' ? menus : menus.filter(m => m.tipo === tipoFilter),
    [menus, tipoFilter],
  )

  return (
    <div className="scroll-body">
      {/* Header */}
      <div style={{ background: 'var(--navy)', padding: '46px 16px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>
            <span className="material-symbols-outlined" style={{ color: '#fff', fontSize: 22 }}>arrow_back</span>
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>Menús</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,.5)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>Fijos y de evento</div>
          </div>
          <button
            onClick={onNuevo}
            style={{ background: 'rgba(255,255,255,.18)', border: '1px solid rgba(255,255,255,.3)', borderRadius: 10, padding: '7px 14px', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
            Nuevo
          </button>
        </div>
        {/* Tipo filter */}
        <div style={{ display: 'flex', gap: 6 }}>
          {([['todos', 'Todos'], ['fijo', 'Fijos'], ['evento', 'Eventos']] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTipoFilter(id)}
              style={{
                padding: '5px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                background: tipoFilter === id ? '#fff' : 'rgba(255,255,255,.12)',
                color: tipoFilter === id ? 'var(--navy)' : 'rgba(255,255,255,.8)',
                fontSize: 12, fontWeight: 600,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      <div style={{ padding: '12px 14px 100px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-3)', fontSize: 13 }}>Cargando menús…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '56px 24px', color: 'var(--text-3)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 44, opacity: .5 }}>menu_book</span>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-2)', marginTop: 8 }}>
              {menus.length === 0 ? 'Sin menús todavía' : 'Sin menús de este tipo'}
            </div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Tocá “Nuevo” para armar uno por secciones</div>
          </div>
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
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Card de menú en la lista ──
function MenuCard({ menu, onEdit, onDelete }: { menu: MenuConPreparaciones; onEdit: () => void; onDelete: () => void }) {
  const porSeccion = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of menu.preparaciones) m.set(p.paso, (m.get(p.paso) ?? 0) + 1)
    return [...m.entries()]
  }, [menu.preparaciones])

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
      <div onClick={onEdit} style={{ padding: '12px 14px', cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 9, fontWeight: 800, padding: '2px 8px', borderRadius: 99, textTransform: 'uppercase', letterSpacing: '.04em',
            background: menu.tipo === 'evento' ? '#ede9fe' : '#e0f2fe',
            color: menu.tipo === 'evento' ? '#6d28d9' : '#075985',
          }}>
            {menu.tipo === 'evento' ? 'Evento' : 'Fijo'}
          </span>
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
      </div>
      <div style={{ display: 'flex', borderTop: '1px solid var(--border)' }}>
        <button onClick={onEdit} style={{ flex: 1, padding: '8px', background: 'none', border: 'none', borderRight: '1px solid var(--border)', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--accent)', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span> Editar
        </button>
        <button onClick={onDelete} style={{ padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#ef4444', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
        </button>
      </div>
    </div>
  )
}
