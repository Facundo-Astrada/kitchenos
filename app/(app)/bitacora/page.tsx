'use client'

import { useEffect, useMemo, useState } from 'react'
import { useIsDesktop } from '@/lib/hooks/useIsDesktop'
import { useBitacora } from '@/lib/hooks/useBitacora'
import PageHeader from '@/components/shell/PageHeader'
import ActionButton from '@/components/shell/ActionButton'
import { EmptyState } from '@/components/ui/EmptyState'
import { FilterChips } from '@/components/ui/FilterChips'
import type { FilterChip } from '@/components/ui/FilterChips'
import EntradaListItem from '@/components/bitacora/EntradaListItem'
import EntradaDoc from '@/components/bitacora/EntradaDoc'
import NuevaEntradaSheet from '@/components/bitacora/NuevaEntradaSheet'
import { BITACORA_TIPO_CONFIG } from '@/components/bitacora/config'
import type { BitacoraTipo } from '@/types'

type FiltroTipo = 'todas' | BitacoraTipo

const FILTROS: FilterChip<FiltroTipo>[] = [
  { value: 'todas', label: 'Todas' },
  ...(['reunion', 'nota', 'lista', 'idea'] as BitacoraTipo[]).map(t => ({ value: t, label: BITACORA_TIPO_CONFIG[t].label })),
]

export default function BitacoraPage() {
  const isDesktop = useIsDesktop()
  const {
    entradas, loadingEntradas,
    crearEntrada, actualizarEntrada, eliminarEntrada,
    itemsPorEntrada, loadingItems, fetchItems,
    agregarItem, agregarItemsBatch, actualizarItem, eliminarItem,
    setItemTextoLocal, renumerarItems,
  } = useBitacora()

  const [filtro, setFiltro] = useState<FiltroTipo>('todas')
  const [busqueda, setBusqueda] = useState('')
  const [verArchivadas, setVerArchivadas] = useState(false)
  // Persistida en sessionStorage (mismo patrón que kc_dock_collapsed en
  // DesktopShell) — un refresh a mitad de una reunión no debe devolver a la
  // lista y perder el documento que se estaba escribiendo.
  const [selectedId, setSelectedIdState] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    return sessionStorage.getItem('kc_bitacora_entrada_id')
  })
  const [nuevaOpen, setNuevaOpen] = useState(false)
  const [autoFocusId, setAutoFocusId] = useState<string | null>(null)

  function setSelectedId(id: string | null) {
    setSelectedIdState(id)
    if (id) sessionStorage.setItem('kc_bitacora_entrada_id', id)
    else sessionStorage.removeItem('kc_bitacora_entrada_id')
  }

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return entradas.filter(e => {
      if (e.archivada !== verArchivadas) return false
      if (filtro !== 'todas' && e.tipo !== filtro) return false
      if (q && !e.titulo.toLowerCase().includes(q)) return false
      return true
    })
  }, [entradas, filtro, busqueda, verArchivadas])

  const selected = useMemo(() => entradas.find(e => e.id === selectedId) ?? null, [entradas, selectedId])

  // En desktop, si no hay nada seleccionado, arranca en la primera de la lista.
  useEffect(() => {
    if (isDesktop && !selectedId && visibles.length > 0) setSelectedId(visibles[0].id)
  }, [isDesktop, selectedId, visibles])

  async function handleCrear(datos: Parameters<typeof crearEntrada>[0]) {
    const id = await crearEntrada(datos)
    setNuevaOpen(false)
    setSelectedId(id)
    setAutoFocusId(id)
  }

  const docProps = selected ? {
    entrada: selected,
    items: itemsPorEntrada[selected.id],
    loadingItems: !!loadingItems[selected.id],
    autoFocusDraft: autoFocusId === selected.id,
    fetchItems,
    actualizarEntrada,
    eliminarEntrada: async (id: string) => { await eliminarEntrada(id); setSelectedId(null) },
    agregarItem, agregarItemsBatch, actualizarItem, eliminarItem,
    setItemTextoLocal, renumerarItems,
  } : null

  const listaPanel = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ flexShrink: 0, padding: '12px 12px 8px' }}>
        <div style={{ position: 'relative', marginBottom: 10 }}>
          <span className="material-symbols-outlined" style={{ position: 'absolute', left: 10, top: 8, fontSize: 17, color: 'var(--text-3)' }}>search</span>
          <input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar…"
            style={{ width: '100%', padding: '7px 10px 7px 32px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, fontFamily: 'inherit', color: 'var(--text-1)' }}
          />
        </div>
        <FilterChips chips={FILTROS} active={filtro} onChange={setFiltro} context="onLight" />
        <button
          onClick={() => setVerArchivadas(v => !v)}
          style={{ marginTop: 8, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 700, color: verArchivadas ? 'var(--accent)' : 'var(--text-3)', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{verArchivadas ? 'unarchive' : 'archive'}</span>
          {verArchivadas ? 'Viendo archivadas' : 'Ver archivadas'}
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 8px 16px' }}>
        {loadingEntradas ? (
          <div style={{ fontSize: 12, color: 'var(--text-3)', padding: '12px' }}>Cargando…</div>
        ) : visibles.length === 0 ? (
          <EmptyState
            icon="history_edu"
            title={verArchivadas ? 'Sin entradas archivadas' : 'Sin entradas todavía'}
            subtitle={verArchivadas ? undefined : 'Reuniones, notas, listas e ideas del equipo — todo en un mismo lugar.'}
          />
        ) : (
          visibles.map(e => (
            <EntradaListItem key={e.id} entrada={e} active={e.id === selectedId} onClick={() => setSelectedId(e.id)} />
          ))
        )}
      </div>
    </div>
  )

  if (!isDesktop) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
        {selected && docProps ? (
          <EntradaDoc {...docProps} onBack={() => setSelectedId(null)} />
        ) : (
          <>
            <PageHeader
              title="Bitácora"
              icon="history_edu"
              actions={<ActionButton icon="add" label="Nueva" onClick={() => setNuevaOpen(true)} />}
            />
            <div style={{ flex: 1, minHeight: 0 }}>{listaPanel}</div>
          </>
        )}
        {nuevaOpen && <NuevaEntradaSheet onClose={() => setNuevaOpen(false)} onCreate={handleCrear} />}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <PageHeader
        title="Bitácora"
        icon="history_edu"
        actions={<ActionButton icon="add" label="Nueva" onClick={() => setNuevaOpen(true)} />}
      />
      <div style={{ flex: 1, minHeight: 0, display: 'flex', border: '1px solid var(--border)', borderRadius: 14, margin: '0 16px 16px', overflow: 'hidden', background: 'var(--surface)' }}>
        <div style={{ width: 300, flexShrink: 0, borderRight: '1px solid var(--border)', overflow: 'hidden' }}>
          {listaPanel}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {selected && docProps ? (
            <EntradaDoc {...docProps} />
          ) : (
            <EmptyState icon="history_edu" title="Elegí una entrada" subtitle="O creá una nueva reunión, nota, lista o idea." style={{ height: '100%', justifyContent: 'center' }} />
          )}
        </div>
      </div>
      {nuevaOpen && <NuevaEntradaSheet onClose={() => setNuevaOpen(false)} onCreate={handleCrear} />}
    </div>
  )
}
