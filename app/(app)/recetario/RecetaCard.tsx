'use client'

// Tarjeta de una receta en la lista del Recetario (y su esqueleto de carga).
// Separada de page.tsx por el ratchet de líneas y porque va memoizada: la
// cuenta más grande tiene 600+ recetas y, sin memo, cada tecla del buscador
// volvía a renderizar todas (ui.md § Listas largas).

import { memo, useMemo } from 'react'
import Link from 'next/link'
import type { RecetaConCosto } from '@/lib/hooks/useRecetas'
import { nivelDeReceta } from '@/lib/recetas/estandarizacion'
import { NivelBadge } from '@/app/(app)/carta/EstandarizacionView'
import { Skeleton } from '@/components/ui'
import { calcPesoPorcion, formatPeso, fcColor, normalizeCategoria } from './shared'

const mono = "'DM Mono', monospace"

interface RecetaCardProps {
  receta: RecetaConCosto
  isDraft?: boolean
  /** Costo, venta, margen y food cost: solo para quien tiene `verCostos`. */
  verCostos?: boolean
  recetasPorId?: Map<string, RecetaConCosto>
  /** Clic en la tarjeta. Si llama a `e.preventDefault()` el link no navega (la lista abre el visor). */
  onAbrir?: (id: string, e: React.MouseEvent) => void
  onPublish?: (r: RecetaConCosto) => void
  onCompleteIA?: (r: RecetaConCosto) => void
}

export const RecetaCard = memo(function RecetaCard({ receta: r, isDraft, verCostos, recetasPorId, onAbrir, onPublish, onCompleteIA }: RecetaCardProps) {
  const fc = r.food_cost
  const sinIngredientes = (r.ingredientes?.length ?? 0) === 0
  // Escala N0-N3 (lib/recetas/estandarizacion.ts) — reemplaza el binario
  // "SIN PESO NETO" (sep 2026): una receta puede tener peso_total_g cargado
  // y aun así no estar verificada si le faltan costos de ingredientes.
  // No se muestra en drafts (ya tienen su propio badge BORRADOR, y siempre
  // topean en N1 — mostrar N1 ahí sería redundante).
  const diagReceta = useMemo(() => isDraft ? null : nivelDeReceta(r, recetasPorId), [r, recetasPorId, isDraft])
  const pesoPorcion = useMemo(
    () => (r.porciones ?? 0) > 1 ? calcPesoPorcion(r.ingredientes || [], r.porciones ?? 0) : null,
    [r.ingredientes, r.porciones],
  )
  const conPrecio = !!verCostos && (r.precio_venta ?? 0) > 0 && !isDraft
  const esPlato = !!r.es_plato && !isDraft
  const meta = [
    normalizeCategoria(r.categoria),
    (r.porciones ?? 0) > 1 ? `${r.porciones} porc.${pesoPorcion ? ` · ${formatPeso(pesoPorcion)}` : ''}` : null,
    (r.tiempo_min ?? 0) > 0 ? `${r.tiempo_min} min` : null,
  ].filter(Boolean).join(' · ')

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <Link
        href={`/recetario/${r.id}`}
        onClick={e => onAbrir?.(r.id, e)}
        style={{
          textDecoration: 'none', display: 'block', height: '100%', cursor: 'pointer',
          background: esPlato ? 'rgba(67,97,160,.035)' : 'var(--surface)',
          border: isDraft ? '1px solid rgba(245,158,11,.3)' : esPlato ? '1px solid rgba(67,97,160,.35)' : '1px solid var(--border)',
          borderRadius: 12, boxShadow: 'var(--shadow-1)',
          padding: isDraft && (onCompleteIA || onPublish) ? '12px 14px 46px' : '12px 14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* El nombre no comparte línea con los badges (ui.md): se lleva la
                fila entera y hasta dos renglones. */}
            <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text-1)', lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
              {r.nombre}
            </div>
            {/* Datos y badges en una sola fila que envuelve: una tarjeta
                baja deja ver más recetas por pantalla. */}
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px 7px', marginTop: 4 }}>
            {meta && <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{meta}</span>}
            {isDraft && (
              <span style={{
                fontSize: 9, fontWeight: 700, color: 'var(--amber-fg)', background: 'rgba(245,158,11,.15)',
                border: '1px solid rgba(245,158,11,.3)', borderRadius: 4, padding: '1px 6px',
              }}>BORRADOR</span>
            )}
            {esPlato && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                fontSize: 9, fontWeight: 700, color: 'var(--accent)', background: 'rgba(67,97,160,.1)',
                border: '1px solid rgba(67,97,160,.28)', borderRadius: 4, padding: '1px 6px',
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 11 }}>restaurant</span>
                PLATO
              </span>
            )}
            {diagReceta && (
              <NivelBadge nivel={diagReceta.nivel} title={diagReceta.faltantes.join(' · ') || 'Peso pesado y costo de factura verificados'} />
            )}
            {sinIngredientes && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5, color: '#f59e0b', fontWeight: 600 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 13 }}>warning</span>Sin ingredientes cargados
              </span>
            )}
            </div>
          </div>
          {conPrecio && (
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: fcColor(fc.food_cost_pct), fontFamily: mono, lineHeight: 1.15 }}>{fc.food_cost_pct.toFixed(1)}%</div>
              <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Food cost</div>
            </div>
          )}
        </div>

        {conPrecio && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 14px', fontSize: 11.5, marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--text-3)' }}>Costo <b style={{ color: 'var(--text-2)', fontFamily: mono }}>${fc.costo_porcion.toFixed(0)}</b></span>
            <span style={{ color: 'var(--text-3)' }}>Venta <b style={{ color: 'var(--text-2)', fontFamily: mono }}>${(r.precio_venta ?? 0).toLocaleString('es-AR')}</b></span>
            <span style={{ color: 'var(--text-3)' }}>Margen <b style={{ color: fc.margen_bruto > 0 ? '#4ade80' : '#ef4444', fontFamily: mono }}>${fc.margen_bruto.toFixed(0)}</b></span>
          </div>
        )}
      </Link>

      {/* Botones de acción para borradores */}
      {isDraft && (onCompleteIA || onPublish) && (
        <div style={{ position: 'absolute', bottom: 9, left: 10, right: 10, display: 'flex', gap: 6 }}>
          {onCompleteIA && (
            <button
              onClick={e => { e.stopPropagation(); e.preventDefault(); onCompleteIA(r) }}
              style={{
                flex: 1, background: 'rgba(245,158,11,.12)', border: '1px solid rgba(245,158,11,.3)',
                borderRadius: 8, padding: '6px 10px', fontSize: 11, fontWeight: 700,
                color: 'var(--amber-fg)', cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>auto_awesome</span>
              {sinIngredientes ? 'Cargar con IA' : 'Actualizar con IA'}
            </button>
          )}
          {onPublish && (
            <button
              onClick={e => { e.stopPropagation(); e.preventDefault(); onPublish(r) }}
              style={{
                background: 'var(--navy)', border: 'none', borderRadius: 8,
                padding: '6px 10px', fontSize: 11, fontWeight: 700, color: '#fff',
                cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>publish</span>
              Publicar
            </button>
          )}
        </div>
      )}
    </div>
  )
})

// Forma de RecetaCard sin datos (S5.3) — reemplaza el "Cargando recetas…"
// centrado, que saltaba a la lista completa de golpe.
export function RecetaCardSkeleton() {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px' }}>
      <Skeleton width="55%" height={15} style={{ marginBottom: 8 }} />
      <Skeleton width="35%" height={11} style={{ marginBottom: 12 }} />
      <div style={{ display: 'flex', gap: 12 }}>
        <Skeleton width={50} height={11} />
        <Skeleton width={50} height={11} />
        <Skeleton width={50} height={11} />
      </div>
    </div>
  )
}

/**
 * Tile de KPI de la lista — misma forma que los de Turnos (label, valor
 * grande, detalle). `compacto` lo vuelve una píldora de una línea: en el
 * celular los KPIs comparten fila con las acciones en vez de apilar otra.
 */
export function KpiTile({ label, valor, sub, color, atencion, grande, compacto, onClick, abierto }: {
  label: string
  valor: string
  sub?: string
  color?: string
  atencion?: boolean
  grande?: boolean
  compacto?: boolean
  onClick?: () => void
  abierto?: boolean
}) {
  if (compacto) {
    const pildora: React.CSSProperties = {
      display: 'flex', alignItems: 'center', gap: 6, minHeight: 40, padding: '0 13px', borderRadius: 10, flexShrink: 0, whiteSpace: 'nowrap',
      border: '1px solid var(--border)', background: atencion ? 'var(--amber-bg)' : 'var(--surface)',
      color: atencion ? 'var(--amber-fg)' : 'var(--text-2)', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit',
    }
    const dentro = (
      <>
        {label}
        <b style={{ color: atencion ? 'inherit' : (color ?? 'var(--text-1)'), fontVariantNumeric: 'tabular-nums' }}>{valor}</b>
        {onClick && <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 16, transform: abierto ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>expand_more</span>}
      </>
    )
    return onClick
      ? <button type="button" onClick={onClick} aria-expanded={abierto} style={{ ...pildora, cursor: 'pointer' }}>{dentro}</button>
      : <div style={pildora}>{dentro}</div>
  }
  const estilo: React.CSSProperties = {
    flex: '1 1 0', minWidth: grande ? 150 : 132, maxWidth: 260, padding: grande ? '11px 14px' : '9px 12px', borderRadius: 12,
    background: atencion ? 'var(--amber-bg)' : 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-1)',
    textAlign: 'left', fontFamily: 'inherit',
  }
  const tinta = atencion ? 'var(--amber-fg)' : 'var(--text-3)'
  const contenido = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: tinta, textTransform: 'uppercase', letterSpacing: '.05em', whiteSpace: 'nowrap' }}>
        {label}
        {onClick && (
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 16, marginLeft: 'auto', transform: abierto ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>expand_more</span>
        )}
      </div>
      <div style={{ fontSize: grande ? 25 : 20, fontWeight: 700, color: atencion ? 'var(--amber-fg)' : (color ?? 'var(--text-1)'), fontVariantNumeric: 'tabular-nums', lineHeight: 1.25, whiteSpace: 'nowrap' }}>{valor}</div>
      {sub && <div style={{ fontSize: 11.5, color: tinta, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>}
    </>
  )
  return onClick
    ? <button type="button" onClick={onClick} aria-expanded={abierto} style={{ ...estilo, cursor: 'pointer' }}>{contenido}</button>
    : <div style={estilo}>{contenido}</div>
}
