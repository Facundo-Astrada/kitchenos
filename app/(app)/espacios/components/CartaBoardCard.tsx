'use client'

import { useState } from 'react'
import type { PlatoRecetaEnriquecido } from '@/lib/hooks/useCarta'
import type { MisePlaceItem, PlazaCustom } from '@/types'
import { plazaLabel, plazaColor } from '@/lib/constants'
import { parseRecipienteNombre } from '@/lib/ops/mise'
import OpsPanel, { type OpsInitial, type OpsResult } from '@/components/ops/OpsPanel'

interface Props {
  pr: PlatoRecetaEnriquecido
  checklistItem: MisePlaceItem | null
  plazasCustom: PlazaCustom[]
  isOpen: boolean
  saving: boolean
  onToggle: () => void
  onGuardar: (pr: PlatoRecetaEnriquecido, result: OpsResult) => void
  onQuitar: (pr: PlatoRecetaEnriquecido) => void
  onEditarGramaje: (pr: PlatoRecetaEnriquecido, nuevaCantidad: number) => void
  onEditarPesoPorcion: (pr: PlatoRecetaEnriquecido, nuevoPeso: number) => void
  onEliminar: (pr: PlatoRecetaEnriquecido) => void
}

export default function CartaBoardCard({ pr, checklistItem, plazasCustom, isOpen, saving, onToggle, onGuardar, onQuitar, onEditarGramaje, onEditarPesoPorcion, onEliminar }: Props) {
  const color = pr.plaza ? plazaColor(pr.plaza, plazasCustom) : null
  const sinPlaza = !pr.plaza
  const [editandoGramaje, setEditandoGramaje] = useState(false)
  const [gramajeValor, setGramajeValor] = useState('')

  // Con recipiente configurado, cantidad_ops deja de ser "gramos por plato" y
  // pasa a ser "cuántas porciones entran en el recipiente lleno" (un dato de
  // mise/stock) — lo que importa ver acá es peso_porcion, el gramaje real del
  // componente. Sin recipiente, cantidad_ops sigue siendo el gramaje directo.
  const usaRecipiente = checklistItem?.peso_porcion != null
  const gramajeMostrado = usaRecipiente ? checklistItem!.peso_porcion : pr.cantidad_ops
  const unidadMostrada = usaRecipiente ? (checklistItem!.peso_porcion_unidad ?? 'g') : (pr.unidad_ops ?? 'u')

  function startEditGramaje(e: React.MouseEvent) {
    e.stopPropagation()
    if (saving) return
    setGramajeValor(gramajeMostrado != null ? String(gramajeMostrado) : '')
    setEditandoGramaje(true)
  }

  function commitGramaje() {
    setEditandoGramaje(false)
    const n = parseFloat(gramajeValor)
    if (isNaN(n) || n < 0 || n === gramajeMostrado) return
    if (usaRecipiente) onEditarPesoPorcion(pr, n)
    else onEditarGramaje(pr, n)
  }

  // "Tamaño por porción" es el mismo dato que el gramaje del componente
  // (cuánto de esta preparación va en una porción del plato) — si todavía no
  // hay un tamaño guardado en el mise (primera vez que se define recipiente),
  // lo prefileamos con cantidad_ops/unidad_ops en vez de pedirlo de nuevo.
  // recipiente_nombre trae el "×N" codificado (ver lib/ops/mise.ts) — se
  // separa acá para no mostrarlo embebido en el input del nombre.
  const { nombre: recipienteNombrePrefill, cantidad: recipienteCantidadPrefill } = parseRecipienteNombre(checklistItem?.recipiente_nombre)
  const initial: OpsInitial = {
    plaza: pr.plaza ?? null,
    seccion: checklistItem?.seccion_id ?? null,
    cantidad: pr.cantidad_ops ?? null,
    unidad: pr.unidad_ops ?? null,
    recipienteNombre: recipienteNombrePrefill,
    recipienteCantidad: recipienteCantidadPrefill,
    pesoPorcion: checklistItem?.peso_porcion ?? pr.cantidad_ops ?? null,
    pesoPorcionUnidad: checklistItem?.peso_porcion_unidad ?? pr.unidad_ops ?? null,
  }

  return (
    <div style={{
      borderRadius: 10,
      background: sinPlaza && !isOpen ? 'rgba(239,68,68,.05)' : 'var(--bg)',
      border: `1px solid ${isOpen ? 'var(--accent)' : sinPlaza ? 'rgba(239,68,68,.4)' : 'var(--border)'}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6, padding: '8px 10px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-1)', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {pr.receta?.nombre ?? 'Preparación'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {editandoGramaje ? (
              <input
                autoFocus
                type="number"
                inputMode="decimal"
                value={gramajeValor}
                onChange={e => setGramajeValor(e.target.value)}
                onBlur={commitGramaje}
                onKeyDown={e => { if (e.key === 'Enter') commitGramaje(); if (e.key === 'Escape') setEditandoGramaje(false) }}
                onClick={e => e.stopPropagation()}
                style={{
                  width: 56, padding: '2px 5px', borderRadius: 6, border: '1.5px solid var(--accent)',
                  fontSize: 11, fontWeight: 700, textAlign: 'center', fontFamily: 'inherit',
                  color: 'var(--text-1)', background: 'var(--surface)', outline: 'none',
                }}
              />
            ) : gramajeMostrado != null ? (
              <button
                onClick={startEditGramaje}
                title="Editar gramaje"
                style={{ background: 'none', border: 'none', padding: 0, cursor: saving ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 2 }}
              >
                <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>{gramajeMostrado} {unidadMostrada}</span>
                <span className="material-symbols-outlined" style={{ fontSize: 11, color: 'var(--text-3)' }}>edit</span>
              </button>
            ) : (
              <button
                onClick={startEditGramaje}
                style={{
                  fontSize: 10, fontWeight: 600, color: 'var(--accent)', background: 'none',
                  border: '1px dashed var(--accent)', borderRadius: 6, padding: '1px 6px',
                  cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit',
                }}
              >
                + gramaje
              </button>
            )}
            {pr.plaza ? (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 99, background: `${color}18`, color: color ?? 'var(--text-3)' }}>
                {plazaLabel(pr.plaza, plazasCustom)}
              </span>
            ) : (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 99, background: 'rgba(239,68,68,.12)', color: '#ef4444' }}>
                Sin plaza
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <button
            onClick={onToggle}
            title="Asignar a OPS"
            style={{
              display: 'flex', alignItems: 'center', gap: 3,
              padding: '3px 7px', borderRadius: 7, border: 'none', cursor: 'pointer',
              fontSize: 10, fontWeight: 700,
              background: isOpen ? 'rgba(67,97,160,.14)' : 'var(--surface)',
              color: isOpen ? 'var(--accent)' : 'var(--text-3)',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>store</span>
            OPS
          </button>
          <button
            onClick={e => { e.stopPropagation(); onEliminar(pr) }}
            title="Eliminar componente del plato"
            disabled={saving}
            style={{
              display: 'flex', alignItems: 'center', padding: '3px 5px', borderRadius: 7,
              border: 'none', cursor: saving ? 'default' : 'pointer', background: 'none', color: 'var(--text-3)',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>delete</span>
          </button>
        </div>
      </div>
      {isOpen && (
        <div style={{ padding: '10px 10px 12px', borderTop: '1px solid var(--border)', background: 'var(--surface)', borderBottomLeftRadius: 9, borderBottomRightRadius: 9 }}>
          <OpsPanel
            initial={initial}
            hasExisting={!!pr.plaza}
            saving={saving}
            onSave={result => onGuardar(pr, result)}
            onRemove={pr.plaza ? () => onQuitar(pr) : undefined}
            onCancel={onToggle}
          />
        </div>
      )}
    </div>
  )
}
