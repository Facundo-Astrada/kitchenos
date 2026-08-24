'use client'

// Skeleton — placeholder de carga (PLAN-SUPERFICIE S5.3).
//
// SkeletonHeader/SkeletonRow ya estaban en uso real: 11 pantallas tienen su
// app/(app)/*/loading.tsx (convención nativa de Next.js — Suspense boundary
// que se muestra en la transición de ruta, antes de que el componente
// cliente llegue a montarse) importándolos de acá. Este archivo YA EXISTÍA
// commiteado y funcionando (desde a3bf3e7) — una escritura de esta misma
// sesión lo pisó sin leerlo primero. Se reconstruyó apenas se notó (el error
// de tsc que lo delató), con la misma forma (header navy, barra de
// título/subtítulo, franja de búsqueda opcional) y los mismos exports;
// `SkeletonCard` se restauró por las dudas aunque no tiene callers hoy.
//
// `Skeleton` es el primitivo suelto para skeletons armados a medida DENTRO
// de un componente cliente ya montado (ej. la lista de Carta mientras su
// propio hook todavía está `loading`) — un momento distinto y complementario
// al que cubre loading.tsx (ese es anterior al montaje).

export function Skeleton({ width, height, radius = 8, background = 'var(--border)', style }: {
  width?: number | string
  height?: number | string
  radius?: number
  background?: string
  style?: React.CSSProperties
}) {
  return (
    <div
      className="skeleton-pulse"
      style={{ width, height, borderRadius: radius, background, flexShrink: 0, ...style }}
    />
  )
}

export function SkeletonHeader({ hasSearch = false }: { hasSearch?: boolean }) {
  return (
    <div style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 14px', flexShrink: 0 }}>
      <Skeleton
        height={22} width="40%" radius={8} background="rgba(255,255,255,.2)"
        style={{ marginBottom: hasSearch ? 10 : 6 }}
      />
      {hasSearch
        ? <Skeleton height={36} width="100%" radius={10} background="rgba(255,255,255,.12)" />
        : <Skeleton height={11} width="30%" radius={6} background="rgba(255,255,255,.12)" />}
    </div>
  )
}

export function SkeletonRow() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' }}>
      <Skeleton width={20} height={20} radius={99} />
      <Skeleton height={12} width="60%" />
    </div>
  )
}

export function SkeletonCard({ height = 72 }: { height?: number }) {
  return <Skeleton height={height} radius={14} background="var(--surface)" style={{ width: '100%', border: '1px solid var(--border)' }} />
}
