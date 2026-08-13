'use client'

import { useEffect, useRef, useState } from 'react'
import type { BitacoraEntrada, BitacoraItem, BitacoraParticipante, BitacoraTipo } from '@/types'
import { BITACORA_TIPOS, BITACORA_TIPO_CONFIG, BITACORA_ORDEN_STEP } from './config'
import ItemLinea from './ItemLinea'
import ParticipantesPicker from './ParticipantesPicker'

interface Props {
  entrada: BitacoraEntrada
  items: BitacoraItem[] | undefined
  loadingItems: boolean
  onBack?: () => void
  autoFocusDraft?: boolean
  fetchItems: (entradaId: string) => Promise<void>
  actualizarEntrada: (id: string, datos: Partial<Pick<BitacoraEntrada, 'titulo' | 'tipo' | 'fecha' | 'participantes' | 'fijada' | 'archivada'>>) => Promise<void>
  eliminarEntrada: (id: string) => Promise<void>
  agregarItem: (entradaId: string, datos: { id?: string; texto?: string; nivel?: number; orden: number }) => Promise<BitacoraItem>
  agregarItemsBatch: (entradaId: string, filas: { texto: string; nivel: number; orden: number }[]) => Promise<void>
  actualizarItem: (entradaId: string, id: string, datos: Partial<Pick<BitacoraItem, 'texto' | 'nivel' | 'orden' | 'completado'>>) => Promise<void>
  eliminarItem: (entradaId: string, id: string) => Promise<void>
  setItemTextoLocal: (entradaId: string, id: string, texto: string) => void
  renumerarItems: (entradaId: string, lista: BitacoraItem[]) => Promise<void>
}

function parseLineaPegada(linea: string): { texto: string; nivel: number } {
  const l = linea.replace(/\s+$/, '')
  const m = l.match(/^(\s*)([-•*]\s+)?(.*)$/)
  const indent = m ? m[1].length : 0
  const bullet = !!(m && m[2])
  const nivel = bullet || indent >= 2 ? 1 : 0
  return { texto: (m ? m[3] : l).trim(), nivel }
}

export default function EntradaDoc({
  entrada, items, loadingItems, onBack, autoFocusDraft,
  fetchItems, actualizarEntrada, eliminarEntrada,
  agregarItem, agregarItemsBatch, actualizarItem, eliminarItem,
  setItemTextoLocal, renumerarItems,
}: Props) {
  const lista = items ?? []
  const itemRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const draftRef = useRef<HTMLInputElement | null>(null)
  const tituloRef = useRef<HTMLInputElement | null>(null)
  const debounceRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const debounceTitulo = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const [tituloLocal, setTituloLocal] = useState(entrada.titulo)
  const [draft, setDraft] = useState<{ texto: string; nivel: number }>({ texto: '', nivel: 0 })
  const [editandoParticipantes, setEditandoParticipantes] = useState(false)
  const [confirmarEliminar, setConfirmarEliminar] = useState(false)

  useEffect(() => {
    setTituloLocal(entrada.titulo)
    setDraft({ texto: '', nivel: 0 })
    setConfirmarEliminar(false)
    if (items === undefined) fetchItems(entrada.id)
  }, [entrada.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (autoFocusDraft) requestAnimationFrame(() => draftRef.current?.focus())
  }, [autoFocusDraft, entrada.id])

  function commitTituloDebounced(v: string) {
    clearTimeout(debounceTitulo.current)
    debounceTitulo.current = setTimeout(() => actualizarEntrada(entrada.id, { titulo: v.trim() || 'Sin título' }), 500)
  }
  function flushTitulo() {
    clearTimeout(debounceTitulo.current)
    actualizarEntrada(entrada.id, { titulo: tituloLocal.trim() || 'Sin título' })
  }

  function scheduleCommitTexto(id: string, texto: string) {
    clearTimeout(debounceRefs.current[id])
    debounceRefs.current[id] = setTimeout(() => actualizarItem(entrada.id, id, { texto }), 500)
  }
  function flushTexto(id: string) {
    clearTimeout(debounceRefs.current[id])
    const it = lista.find(i => i.id === id)
    if (it) actualizarItem(entrada.id, id, { texto: it.texto })
  }

  function focusItem(id: string, cursorAlFinal = true) {
    requestAnimationFrame(() => {
      const el = itemRefs.current[id]
      if (!el) return
      el.focus()
      if (cursorAlFinal) el.setSelectionRange(el.value.length, el.value.length)
    })
  }

  // Calcula el `orden` para insertar después de `despuesDeId` (null = al
  // final). Si no queda un entero libre en el medio, renumera en bloque —
  // ver BITACORA_ORDEN_STEP en config.ts.
  function insertarDespues(despuesDeId: string | null): { orden: number; renumerada?: BitacoraItem[] } {
    if (despuesDeId === null) {
      const ultimo = lista[lista.length - 1]
      return { orden: (ultimo?.orden ?? 0) + BITACORA_ORDEN_STEP }
    }
    const idx = lista.findIndex(it => it.id === despuesDeId)
    const actual = lista[idx]
    const siguiente = lista[idx + 1]
    if (!siguiente) return { orden: actual.orden + BITACORA_ORDEN_STEP }
    const mid = Math.floor((actual.orden + siguiente.orden) / 2)
    if (mid > actual.orden && mid < siguiente.orden) return { orden: mid }
    const renumerada = lista.map((it, i) => ({ ...it, orden: (i + 1) * BITACORA_ORDEN_STEP }))
    const a = renumerada[idx]
    const b = renumerada[idx + 1]
    return { orden: Math.floor((a.orden + b.orden) / 2), renumerada }
  }

  // Optimista de punta a punta: trunca/crea en estado local YA (setItemTextoLocal
  // + id generado acá mismo) y enfoca la línea nueva en el mismo frame — el
  // insert/renumerado corren en segundo plano, sin bloquear el próximo tap.
  function handleEnterPersisted(it: BitacoraItem, antes: string, despues: string) {
    clearTimeout(debounceRefs.current[it.id])
    if (antes !== it.texto) {
      setItemTextoLocal(entrada.id, it.id, antes)
      actualizarItem(entrada.id, it.id, { texto: antes })
    }
    const { orden, renumerada } = insertarDespues(it.id)
    if (renumerada) renumerarItems(entrada.id, renumerada)
    const nuevoId = crypto.randomUUID()
    agregarItem(entrada.id, { id: nuevoId, texto: despues, nivel: it.nivel, orden })
    focusItem(nuevoId, false)
  }

  function handleEnterDraft(antes: string, despues: string) {
    setDraft({ texto: despues, nivel: draft.nivel })
    requestAnimationFrame(() => draftRef.current?.focus())
    const { orden, renumerada } = insertarDespues(null)
    if (renumerada) renumerarItems(entrada.id, renumerada)
    agregarItem(entrada.id, { texto: antes, nivel: draft.nivel, orden })
  }

  async function handleBackspaceEmpty(it: BitacoraItem, idx: number) {
    const anterior = lista[idx - 1]
    await eliminarItem(entrada.id, it.id)
    if (anterior) focusItem(anterior.id)
    else tituloRef.current?.focus()
  }

  function handleBackspaceEmptyDraft() {
    if (draft.nivel > 0) { setDraft(d => ({ ...d, nivel: d.nivel - 1 })); return }
    const ultimo = lista[lista.length - 1]
    if (ultimo) focusItem(ultimo.id)
  }

  function handlePasteMultiline(lineas: string[]): boolean {
    const parsed = lineas.map(parseLineaPegada).filter(r => r.texto !== '')
    if (parsed.length === 0) return true
    const base = lista[lista.length - 1]?.orden ?? 0
    agregarItemsBatch(
      entrada.id,
      parsed.map((r, i) => ({ texto: r.texto, nivel: r.nivel, orden: base + (i + 1) * BITACORA_ORDEN_STEP })),
    )
    return true
  }

  // La línea draft solo vive en memoria hasta Enter/blur (ver ItemLinea) — sin
  // esto, escribir una línea y cerrar la pestaña o cambiar de app sin apretar
  // Enter la perdía (encontrado en pruebas: reload inmediato después de tipear
  // no dejaba nada guardado). `draftParaFlush` referencia el draft actual sin
  // forzar a este efecto a reinstalar los listeners en cada tecla.
  const draftParaFlush = useRef(draft)
  useEffect(() => { draftParaFlush.current = draft }, [draft])
  // Ref propia (no useCallback) porque este efecto solo se reinstala al
  // cambiar de entrada — sin esto, `lista` quedaría congelada en cómo estaba
  // apenas se abrió el documento, y un flush tardío podría chocar de orden
  // con líneas agregadas después.
  const listaParaFlush = useRef(lista)
  useEffect(() => { listaParaFlush.current = lista })
  useEffect(() => {
    function flush() {
      const d = draftParaFlush.current
      if (d.texto.trim() === '') return
      const ultimo = listaParaFlush.current[listaParaFlush.current.length - 1]
      const orden = (ultimo?.orden ?? 0) + BITACORA_ORDEN_STEP
      agregarItem(entrada.id, { texto: d.texto, nivel: d.nivel, orden })
    }
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush() }
    window.addEventListener('beforeunload', flush)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('beforeunload', flush)
      document.removeEventListener('visibilitychange', onVisibility)
      flush() // cambiar de entrada o desmontar (navegar afuera de /bitacora) también cuenta
    }
  }, [entrada.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const tipoCfg = BITACORA_TIPO_CONFIG[entrada.tipo]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Header */}
      <div style={{ flexShrink: 0, padding: '16px 20px 12px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          {onBack && (
            <button onClick={onBack} aria-label="Volver" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px 4px 0 0', flexShrink: 0 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--text-2)' }}>arrow_back</span>
            </button>
          )}
          <input
            ref={tituloRef}
            value={tituloLocal}
            onChange={e => { setTituloLocal(e.target.value); commitTituloDebounced(e.target.value) }}
            onBlur={flushTitulo}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); flushTitulo(); draftRef.current?.focus() } }}
            placeholder="Sin título"
            style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontSize: 19, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'inherit', padding: '4px 0' }}
          />
          <button
            onClick={() => actualizarEntrada(entrada.id, { fijada: !entrada.fijada })}
            aria-label={entrada.fijada ? 'Desfijar' : 'Fijar arriba'}
            title={entrada.fijada ? 'Desfijar' : 'Fijar arriba'}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, flexShrink: 0 }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 19, color: entrada.fijada ? '#f59e0b' : 'var(--text-3)' }}>
              push_pin
            </span>
          </button>
        </div>

        {/* Meta row */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 10 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {BITACORA_TIPOS.map(t => {
              const cfg = BITACORA_TIPO_CONFIG[t]
              const activo = t === entrada.tipo
              return (
                <button
                  key={t}
                  onClick={() => actualizarEntrada(entrada.id, { tipo: t })}
                  title={cfg.label}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 8,
                    fontSize: 11, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
                    background: activo ? `${cfg.color}1f` : 'transparent',
                    color: activo ? cfg.color : 'var(--text-3)',
                    border: activo ? `1px solid ${cfg.color}55` : '1px solid transparent',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{cfg.icon}</span>
                  {activo && cfg.label}
                </button>
              )
            })}
          </div>

          <input
            type="date"
            value={entrada.fecha}
            onChange={e => actualizarEntrada(entrada.id, { fecha: e.target.value })}
            style={{ border: 'none', background: 'transparent', fontSize: 12, color: 'var(--text-2)', fontFamily: 'inherit', cursor: 'pointer' }}
          />

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
            <button
              onClick={() => actualizarEntrada(entrada.id, { archivada: !entrada.archivada })}
              title={entrada.archivada ? 'Desarchivar' : 'Archivar'}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, display: 'flex' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 17, color: 'var(--text-3)' }}>
                {entrada.archivada ? 'unarchive' : 'archive'}
              </span>
            </button>
            {confirmarEliminar ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                <span style={{ color: 'var(--text-2)' }}>¿Eliminar?</span>
                <button onClick={() => eliminarEntrada(entrada.id)} style={{ color: '#ef4444', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Sí</button>
                <button onClick={() => setConfirmarEliminar(false)} style={{ color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>No</button>
              </div>
            ) : (
              <button onClick={() => setConfirmarEliminar(true)} title="Eliminar" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, display: 'flex' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 17, color: 'var(--text-3)' }}>delete</span>
              </button>
            )}
          </div>
        </div>

        {/* Participantes */}
        <div style={{ marginTop: 10 }}>
          {editandoParticipantes ? (
            <ParticipantesPicker
              participantes={entrada.participantes}
              onChange={p => actualizarEntrada(entrada.id, { participantes: p })}
            />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 15, color: 'var(--text-3)' }}>group</span>
              {entrada.participantes.length === 0 ? (
                <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Sin participantes</span>
              ) : (
                <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
                  {entrada.participantes.map((p: BitacoraParticipante) => p.nombre).join(', ')}
                </span>
              )}
            </div>
          )}
          <button
            onClick={() => setEditandoParticipantes(v => !v)}
            style={{ marginTop: 4, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 700, color: 'var(--accent)', padding: 0 }}
          >
            {editandoParticipantes ? 'Listo' : 'Editar participantes'}
          </button>
        </div>
      </div>

      {/* Cuerpo — ítems tipo doc */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 20px 40px' }}>
        {loadingItems && lista.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-3)', padding: '8px 0' }}>Cargando…</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {lista.map((it, idx) => (
              <ItemLinea
                key={it.id}
                texto={it.texto}
                nivel={it.nivel}
                completado={it.completado}
                inputRef={el => { itemRefs.current[it.id] = el }}
                onChangeTexto={v => { setItemTextoLocal(entrada.id, it.id, v); scheduleCommitTexto(it.id, v) }}
                onToggleCompletado={() => actualizarItem(entrada.id, it.id, { completado: !it.completado })}
                onEnter={(antes, despues) => handleEnterPersisted(it, antes, despues)}
                onIndent={() => actualizarItem(entrada.id, it.id, { nivel: Math.min(1, it.nivel + 1) })}
                onOutdent={() => actualizarItem(entrada.id, it.id, { nivel: Math.max(0, it.nivel - 1) })}
                onBackspaceEmpty={() => handleBackspaceEmpty(it, idx)}
                onDelete={() => eliminarItem(entrada.id, it.id)}
                onBlurCommit={() => flushTexto(it.id)}
              />
            ))}
            <ItemLinea
              texto={draft.texto}
              nivel={draft.nivel}
              placeholder="Escribí un tema… (Enter para el siguiente, Tab indenta)"
              inputRef={draftRef}
              onChangeTexto={v => setDraft(d => ({ ...d, texto: v }))}
              onEnter={handleEnterDraft}
              onIndent={() => setDraft(d => ({ ...d, nivel: Math.min(1, d.nivel + 1) }))}
              onOutdent={() => setDraft(d => ({ ...d, nivel: Math.max(0, d.nivel - 1) }))}
              onBackspaceEmpty={handleBackspaceEmptyDraft}
              onPasteMultiline={handlePasteMultiline}
              onBlurCommit={() => {
                if (draft.texto.trim() === '') return
                const texto = draft.texto
                const { orden, renumerada } = insertarDespues(null)
                if (renumerada) renumerarItems(entrada.id, renumerada)
                agregarItem(entrada.id, { texto, nivel: draft.nivel, orden })
                setDraft({ texto: '', nivel: draft.nivel })
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
