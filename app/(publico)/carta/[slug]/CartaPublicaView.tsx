'use client'

// Vista pública de la carta (sin sesión) — la vidriera de KitchenOS.
// Misma identidad que la app (header navy, FilterChips, EmptyState, Num) en un layout propio.
// Regla de oro (ui.md): ninguna pantalla introduce chips/empty states propios.

import { useMemo, useState } from 'react'
import { FilterChips, EmptyState, Num } from '@/components/ui'
import type { FilterChip } from '@/components/ui'

export interface PublicCartaCategoria {
  id: string
  nombre: string
  icono: string
  orden: number
}

export interface PublicCartaItem {
  id: string
  nombre: string
  descripcion: string | null
  precio_venta: number
  foto_url: string | null
  tags: string[] | null
  categoria: string
  disponible: boolean
  orden: number
}

const TAG_DEFS: Record<string, { label: string; bg: string; color: string }> = {
  's/tacc': { label: 'S/TACC', bg: '#fef3c7', color: '#92400e' },
  vegano: { label: 'Vegano', bg: '#d1fae5', color: '#065f46' },
  vegetariano: { label: 'Vegetariano', bg: '#dcfce7', color: '#166534' },
  keto: { label: 'Keto', bg: '#ede9fe', color: '#5b21b6' },
  picante: { label: 'Picante', bg: '#fee2e2', color: '#991b1b' },
  'sin lactosa': { label: 'Sin lactosa', bg: '#e0f2fe', color: '#075985' },
}

function fmtPrecio(n: number): string {
  return '$' + n.toLocaleString('es-AR', { maximumFractionDigits: 0 })
}

export function CartaPublicaView({
  restauranteNombre,
  categorias,
  items,
}: {
  restauranteNombre: string
  categorias: PublicCartaCategoria[]
  items: PublicCartaItem[]
}) {
  const [activeCategoria, setActiveCategoria] = useState('todas')

  const chips: FilterChip<string>[] = useMemo(() => {
    const orden = new Map(categorias.map(c => [c.nombre, c.orden]))
    const nombresConItems = Array.from(new Set(items.map(i => i.categoria)))
      .sort((a, b) => (orden.get(a) ?? 999) - (orden.get(b) ?? 999))
    return [{ value: 'todas', label: 'Todas' }, ...nombresConItems.map(n => ({ value: n, label: n }))]
  }, [categorias, items])

  const itemsFiltrados = activeCategoria === 'todas'
    ? items
    : items.filter(i => i.categoria === activeCategoria)

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header navy — identidad K-OS */}
      <div style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 16px', flexShrink: 0 }}>
        <p style={{ color: 'rgba(255,255,255,.6)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', margin: 0 }}>
          Carta
        </p>
        <h1 style={{ color: '#fff', fontSize: 24, fontWeight: 800, margin: '2px 0 0' }}>
          {restauranteNombre}
        </h1>
      </div>

      {/* Filtro por categoría */}
      {chips.length > 1 && (
        <div style={{ position: 'sticky', top: 0, zIndex: 5, background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
          <FilterChips chips={chips} active={activeCategoria} onChange={setActiveCategoria} style={{ padding: '12px 16px' }} />
        </div>
      )}

      {/* Lista de platos */}
      <div style={{ flex: 1, padding: '12px 16px 32px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.length === 0 ? (
          <EmptyState
            icon="restaurant_menu"
            title="Esta carta todavía no tiene platos cargados"
            subtitle="Volvé a intentarlo más tarde"
            cta={{ label: 'Actualizar', onClick: () => window.location.reload() }}
          />
        ) : itemsFiltrados.length === 0 ? (
          <EmptyState
            icon="filter_alt_off"
            title="No hay platos en esta categoría"
            cta={{ label: 'Ver todo el menú', onClick: () => setActiveCategoria('todas') }}
          />
        ) : (
          itemsFiltrados.map(item => <ItemCard key={item.id} item={item} />)
        )}
      </div>

      {/* Identidad — vidriera del producto */}
      <div style={{ textAlign: 'center', padding: '4px 16px 20px', flexShrink: 0 }}>
        <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0 }}>Menú digital hecho con KitchenOS</p>
      </div>
    </div>
  )
}

function ItemCard({ item }: { item: PublicCartaItem }) {
  const tags = (item.tags ?? []).filter(t => TAG_DEFS[t])

  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        padding: 12,
        borderRadius: 14,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        opacity: item.disponible ? 1 : 0.55,
      }}
    >
      {item.foto_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.foto_url}
          alt=""
          style={{ width: 72, height: 72, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }}
        />
      ) : (
        <div
          style={{
            width: 72, height: 72, borderRadius: 10, flexShrink: 0,
            background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--text-3)' }}>restaurant</span>
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', margin: 0, lineHeight: 1.3 }}>
            {item.nombre}
          </p>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)', flexShrink: 0 }}>
            <Num>{fmtPrecio(item.precio_venta)}</Num>
          </span>
        </div>

        {item.descripcion && (
          <p
            style={{
              fontSize: 12.5, color: 'var(--text-2)', margin: 0, lineHeight: 1.4,
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}
          >
            {item.descripcion}
          </p>
        )}

        {!item.disponible && (
          <p style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', margin: '2px 0 0' }}>
            No disponible hoy
          </p>
        )}

        {tags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
            {tags.map(t => (
              <span
                key={t}
                style={{
                  fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                  background: TAG_DEFS[t].bg, color: TAG_DEFS[t].color,
                }}
              >
                {TAG_DEFS[t].label}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
