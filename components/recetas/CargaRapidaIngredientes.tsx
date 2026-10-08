'use client'

// Carga rápida de ingredientes + subrecetas, con food cost en vivo.
// Componente compartido: lo monta tanto RecetaEditSheet (editar una receta
// vinculada desde Carta, sin salir de la pantalla) como la pantalla de Carga
// rápida de Recetario. Es controlado — el padre es dueño del array de filas
// — para que ambos lugares puedan reusar la misma UI/lógica sin duplicarla.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Ingrediente } from '@/types'
import type { RecetaConCosto } from '@/lib/hooks/useRecetas'
import { FC_ALERT_HIGH, FC_ALERT_OK } from '@/lib/constants'
import { unitConversionFactor, parseNumero, parsePrecio } from '@/lib/unidades'
import { buscarProductoExacto } from '@/lib/recetas/vinculo'
import { buscarSugerenciasIngrediente } from '@/lib/recetas/sugerencias'

const UNIDADES_PRODUCTO = ['kg', 'g', 'l', 'ml', 'u']
// Una subreceta usada como ingrediente solo se costea por peso — nunca litros
// ni "unidad" (ver seleccionar()/buscar() más abajo, siempre $/g por debajo).
const UNIDADES_SUBRECETA = ['g', 'kg']

export interface FilaIngredienteRapido {
  id: number
  tipo: 'producto' | 'subreceta'
  nombre: string
  cantidad: string
  unidad: string
  costoUnitario: number
  subrecetaId?: string | null
  // Producto de Stock vinculado y la unidad en que está su precio
  // (costoUnitario). La unidad de la fila es la de la receta: 500 g de un
  // producto a $/kg → unidad 'g', unidadCosto 'kg'. Sin unidadCosto el costo
  // se interpreta en la unidad de la fila.
  productoId?: string | null
  unidadCosto?: string | null
  // Columnas del ingrediente que esta UI no edita (merma, etapa, OPS) — se
  // preservan al guardar, porque guardar reemplaza todos los ingredientes.
  extra?: Partial<Omit<Ingrediente, 'id' | 'receta_id'>>
}

let _filaId = 0
export function nuevaFilaRapida(): FilaIngredienteRapido {
  return { id: ++_filaId, tipo: 'producto', nombre: '', cantidad: '', unidad: 'kg', costoUnitario: 0 }
}

// Shape que espera `agregarReceta(datos, ingredientesData)` — filas vacías (sin nombre) se descartan.
// Con `stockProductos`, lo que no se eligió de la lista se vincula si el
// nombre coincide exacto (lib/recetas/vinculo.ts).
export function filasToIngredientesData(filas: FilaIngredienteRapido[], stockProductos?: { id: string; nombre: string }[]): Omit<Ingrediente, 'id' | 'receta_id'>[] {
  return filas
    .filter(f => f.nombre.trim())
    .map(f => {
      const productoId = f.tipo === 'producto'
        ? (f.productoId ?? (stockProductos ? buscarProductoExacto(f.nombre, stockProductos)?.id : null) ?? null)
        : null
      return {
        merma_pct: 0,
        ...f.extra,
        nombre: f.nombre.trim(),
        cantidad: parseNumero(f.cantidad),
        unidad: f.unidad,
        costo_unitario: f.costoUnitario,
        unidad_costo: f.unidadCosto || f.unidad,
        tipo: f.tipo,
        subreceta_id: f.tipo === 'subreceta' ? (f.subrecetaId ?? null) : null,
        producto_id: productoId,
      }
    })
}

function pesoEnGramos(cantidad: number, unidad: string): number {
  if (unidad === 'g') return cantidad
  if (unidad === 'kg') return cantidad * 1000
  return 0
}

export function formatPesoRapido(gramos: number): string {
  return gramos >= 1000 ? `${(gramos / 1000).toFixed(gramos % 1000 === 0 ? 0 : 2)}kg` : `${Math.round(gramos)}g`
}

export function fcColorRapido(pct: number): string {
  return pct < FC_ALERT_OK ? '#16a34a' : pct <= FC_ALERT_HIGH ? '#d97706' : 'var(--red-fg)'
}

export function calcularTotalesRapido(filas: FilaIngredienteRapido[], porciones: number, precioVenta?: number) {
  let costoTotal = 0
  let pesoBrutoG = 0
  for (const f of filas) {
    const cant = parseNumero(f.cantidad)
    // Convierte la unidad de la receta a la del precio (500 g × $/kg).
    costoTotal += cant * unitConversionFactor(f.unidad, f.unidadCosto || f.unidad) * f.costoUnitario
    // Antes solo contaba productos — una subreceta cargada por gramaje (ver
    // buscar()/seleccionar() más abajo) también es peso real del plato.
    pesoBrutoG += pesoEnGramos(cant, f.unidad)
  }
  const porcionesN = porciones > 0 ? porciones : 1
  const costoPorcion = costoTotal / porcionesN
  const fcPct = precioVenta && precioVenta > 0 ? (costoPorcion / precioVenta) * 100 : null
  const margen = precioVenta && precioVenta > 0 ? precioVenta - costoPorcion : null
  return { costoTotal, costoPorcion, fcPct, margen, pesoBrutoG }
}

// ── Barra de totales en vivo ──
export function TotalesRapidosBar({ filas, porciones, precioVenta }: {
  filas: FilaIngredienteRapido[]
  porciones: number
  precioVenta?: number
}) {
  const { costoTotal, costoPorcion, fcPct, margen, pesoBrutoG } = calcularTotalesRapido(filas, porciones, precioVenta)
  if (costoTotal <= 0) return null
  return (
    <div style={{
      display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center',
      padding: '8px 10px', background: 'rgba(67,97,160,.06)', border: '1px solid var(--border)',
      borderRadius: 10, marginBottom: 8, fontSize: 11,
    }}>
      <span style={{ color: 'var(--text-3)' }}>Costo <b style={{ color: 'var(--text-1)', fontFamily: "'DM Mono', monospace" }}>${costoTotal.toFixed(0)}</b></span>
      {porciones > 1 && (
        <span style={{ color: 'var(--text-3)' }}>Costo/porc <b style={{ color: 'var(--text-1)', fontFamily: "'DM Mono', monospace" }}>${costoPorcion.toFixed(0)}</b></span>
      )}
      {fcPct != null && (
        <span style={{ color: 'var(--text-3)' }}>FC <b style={{ color: fcColorRapido(fcPct), fontFamily: "'DM Mono', monospace" }}>{fcPct.toFixed(1)}%</b></span>
      )}
      {margen != null && (
        <span style={{ color: 'var(--text-3)' }}>Margen <b style={{ color: margen >= 0 ? '#16a34a' : 'var(--red-fg)', fontFamily: "'DM Mono', monospace" }}>${margen.toFixed(0)}</b></span>
      )}
      {pesoBrutoG > 0 && (
        <span style={{ color: 'var(--text-3)' }}>Peso <b style={{ color: 'var(--text-1)', fontFamily: "'DM Mono', monospace" }}>{formatPesoRapido(pesoBrutoG)}</b></span>
      )}
    </div>
  )
}

type StockItem = { id: string; nombre: string; unidad: string; precio_unitario: number }

type Sugerencia = {
  tipo: 'producto' | 'subreceta'
  nombre: string
  unidad: string
  costoUnitario: number
  subrecetaId?: string
  productoId?: string
  detalle: string
}

// ── Lista de filas + fila nueva ──
export function CargaRapidaIngredientes({ filas, onChange, stockProductos, recetasDisponibles, autoFocus }: {
  filas: FilaIngredienteRapido[]
  onChange: (filas: FilaIngredienteRapido[]) => void
  stockProductos: StockItem[]
  recetasDisponibles: RecetaConCosto[]
  autoFocus?: boolean
}) {
  const nombreRefs = useRef<Map<number, HTMLInputElement>>(new Map())
  const cantidadRefs = useRef<Map<number, HTMLInputElement>>(new Map())
  const pendingFocusRef = useRef<number | null>(null)

  useEffect(() => {
    if (pendingFocusRef.current != null) {
      const el = nombreRefs.current.get(pendingFocusRef.current)
      if (el) { el.focus(); pendingFocusRef.current = null }
    }
  }, [filas])

  const updateFila = useCallback((id: number, patch: Partial<FilaIngredienteRapido>) => {
    onChange(filas.map(f => f.id === id ? { ...f, ...patch } : f))
  }, [filas, onChange])

  const removeFila = useCallback((id: number) => {
    const next = filas.filter(f => f.id !== id)
    onChange(next.length ? next : [nuevaFilaRapida()])
  }, [filas, onChange])

  // Enter en cantidad: si hay una fila siguiente, foco ahí. Si es la última, crea una nueva.
  const confirmarYSiguiente = useCallback((id: number) => {
    const idx = filas.findIndex(f => f.id === id)
    if (idx === -1) return
    if (idx < filas.length - 1) {
      const el = nombreRefs.current.get(filas[idx + 1].id)
      if (el) el.focus()
      return
    }
    const nueva = nuevaFilaRapida()
    pendingFocusRef.current = nueva.id
    onChange([...filas, nueva])
  }, [filas, onChange])

  const agregarFila = useCallback(() => { onChange([...filas, nuevaFilaRapida()]) }, [filas, onChange])

  return (
    <div>
      {/* `overflow: visible` (no `hidden`) — el desplegable de sugerencias de
          cada fila se posiciona `absolute` debajo de ella; con `hidden` la
          última fila (la única, en una receta recién creada) lo recortaba
          por completo y la búsqueda quedaba invisible aunque sí encontraba
          coincidencias. */}
      <div style={{ background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'visible' }}>
        {filas.map((fila, idx) => (
          <FilaRapidaRow
            key={fila.id} fila={fila} idx={idx}
            stockProductos={stockProductos} recetasDisponibles={recetasDisponibles}
            autoFocus={!!autoFocus && idx === 0}
            isLast={idx === filas.length - 1}
            nombreRefs={nombreRefs} cantidadRefs={cantidadRefs}
            onUpdate={updateFila} onRemove={removeFila} onConfirm={confirmarYSiguiente}
          />
        ))}
      </div>
      <button onClick={agregarFila} style={{
        marginTop: 8, width: '100%', background: 'transparent', border: '1px dashed var(--border)',
        borderRadius: 10, padding: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 6, cursor: 'pointer',
      }}>
        <span className="material-symbols-outlined" style={{ fontSize: 15, color: 'var(--text-3)' }}>add</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'inherit' }}>Agregar fila</span>
      </button>
    </div>
  )
}

function FilaRapidaRow({ fila, idx, stockProductos, recetasDisponibles, autoFocus, isLast, nombreRefs, cantidadRefs, onUpdate, onRemove, onConfirm }: {
  fila: FilaIngredienteRapido
  idx: number
  stockProductos: StockItem[]
  recetasDisponibles: RecetaConCosto[]
  autoFocus: boolean
  // Ahora que el contenedor es `overflow: visible` (ver arriba), la última
  // fila ya no puede apoyarse en el recorte del padre para esconder este
  // borde — sin esta condición se veía una línea de más sobresaliendo por
  // debajo de la esquina redondeada del contenedor.
  isLast: boolean
  nombreRefs: React.MutableRefObject<Map<number, HTMLInputElement>>
  cantidadRefs: React.MutableRefObject<Map<number, HTMLInputElement>>
  onUpdate: (id: number, patch: Partial<FilaIngredienteRapido>) => void
  onRemove: (id: number) => void
  onConfirm: (id: number) => void
}) {
  const [showUnitPicker, setShowUnitPicker] = useState(false)
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([])
  const [showSug, setShowSug] = useState(false)

  const nomRef = useCallback((el: HTMLInputElement | null) => {
    if (el) nombreRefs.current.set(fila.id, el)
    else nombreRefs.current.delete(fila.id)
  }, [fila.id, nombreRefs])
  const cantRef = useCallback((el: HTMLInputElement | null) => {
    if (el) cantidadRefs.current.set(fila.id, el)
    else cantidadRefs.current.delete(fila.id)
  }, [fila.id, cantidadRefs])

  function buscar(q: string) {
    if (!q.trim()) { setShowSug(false); return }
    // Subreceta como ingrediente: siempre por gramaje, nunca por porción — el
    // costo_porcion asume "se usa una porción entera del batch", que rara vez
    // es el caso real (ver plato_recetas.gramaje). r.costoPorGramo ya prioriza
    // peso_escurrido_g (neto post-cocción) sobre peso_total_g (bruto) sobre
    // la suma cruda de ingredientes (lib/recetas/peso.ts). Búsqueda y orden
    // por relevancia: lib/recetas/sugerencias.ts.
    const combinadas: Sugerencia[] = buscarSugerenciasIngrediente(q, stockProductos, recetasDisponibles)
      .map(s => ({
        tipo: s.tipo, nombre: s.nombre, unidad: s.unidad, costoUnitario: s.costoUnitario, detalle: s.detalle,
        ...(s.tipo === 'producto' ? { productoId: s.id } : { subrecetaId: s.id }),
      }))
    setSugerencias(combinadas)
    setShowSug(combinadas.length > 0)
  }

  function seleccionar(s: Sugerencia) {
    const esProducto = s.tipo === 'producto'
    onUpdate(fila.id, {
      // Producto: el precio queda en la unidad del producto (unidadCosto) y la
      // unidad de la fila solo se sugiere si todavía no hay cantidad.
      nombre: s.nombre, tipo: s.tipo, costoUnitario: s.costoUnitario,
      unidad: esProducto && fila.cantidad ? fila.unidad : s.unidad,
      unidadCosto: esProducto ? s.unidad : null,
      productoId: esProducto ? s.productoId ?? null : null,
      subrecetaId: s.tipo === 'subreceta' ? s.subrecetaId : null,
      cantidad: fila.cantidad || (s.tipo === 'subreceta' ? '100' : ''),
    })
    setShowSug(false)
    setTimeout(() => cantidadRefs.current.get(fila.id)?.focus(), 50)
  }

  const esSubreceta = fila.tipo === 'subreceta'

  return (
    <div style={{ position: 'relative' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 0,
        borderBottom: isLast ? 'none' : '1px solid var(--border)',
      }}>
        <span className="material-symbols-outlined" style={{ fontSize: 14, color: esSubreceta ? 'var(--accent)' : 'var(--text-3)', flexShrink: 0, marginLeft: 8 }}>
          {esSubreceta ? 'menu_book' : 'inventory_2'}
        </span>
        <input
          ref={nomRef}
          autoFocus={autoFocus}
          value={fila.nombre}
          onChange={e => { onUpdate(fila.id, { nombre: e.target.value, productoId: null, unidadCosto: null }); buscar(e.target.value) }}
          onFocus={() => { if (fila.nombre.trim()) buscar(fila.nombre) }}
          onBlur={() => setTimeout(() => setShowSug(false), 150)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); setShowSug(false); cantidadRefs.current.get(fila.id)?.focus() } }}
          placeholder={idx === 0 ? 'Ingrediente o receta…' : ''}
          enterKeyHint="next"
          style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', padding: '9px 8px', fontSize: 12, fontFamily: 'inherit', color: 'var(--text-1)', minWidth: 0 }}
        />
        <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />
        <input
          ref={cantRef}
          type="text" inputMode="decimal"
          value={fila.cantidad}
          onChange={e => onUpdate(fila.id, { cantidad: e.target.value.replace(/[^0-9.,]/g, '') })}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onConfirm(fila.id) } }}
          placeholder="0"
          enterKeyHint="done"
          style={{ width: 44, border: 'none', background: 'transparent', outline: 'none', padding: '9px 2px 9px 6px', fontSize: 13, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: 'var(--text-1)', textAlign: 'right' }}
        />
        <button onClick={() => setShowUnitPicker(!showUnitPicker)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '9px 2px', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'inherit', minWidth: 22, textAlign: 'left' }}>
          {fila.unidad}
        </button>
        <input
          type="text" inputMode="decimal"
          value={fila.costoUnitario || ''}
          onChange={e => onUpdate(fila.id, { costoUnitario: parsePrecio(e.target.value) })}
          placeholder="$0"
          title={`Costo por ${fila.unidadCosto || fila.unidad}`}
          style={{ width: 44, border: 'none', background: 'transparent', outline: 'none', padding: '9px 2px', fontSize: 11, fontWeight: 600, fontFamily: "'DM Mono', monospace", color: 'var(--text-3)', textAlign: 'right' }}
        />
        <button onClick={() => onRemove(fila.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px 8px 8px 2px', opacity: .3, flexShrink: 0, display: 'flex' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#ef4444' }}>close</span>
        </button>
      </div>

      {showUnitPicker && (
        <div style={{ position: 'absolute', right: 0, top: '100%', zIndex: 30, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,.15)', display: 'flex', overflow: 'hidden' }}>
          {/* Subreceta: solo peso (g/kg) — costoUnitario siempre vive en $/g
              por debajo (ver seleccionar()/buscar()), así que al cambiar de
              unidad hay que reescalarlo o cantidad×costoUnitario queda mal
              por un factor de 1000. */}
          {(esSubreceta ? UNIDADES_SUBRECETA : UNIDADES_PRODUCTO).map(u => (
            <button key={u} onClick={() => {
              if (esSubreceta && u !== fila.unidad) {
                const factor = u === 'kg' && fila.unidad === 'g' ? 1000 : u === 'g' && fila.unidad === 'kg' ? 1 / 1000 : 1
                onUpdate(fila.id, { unidad: u, costoUnitario: fila.costoUnitario * factor })
              } else {
                onUpdate(fila.id, { unidad: u })
              }
              setShowUnitPicker(false)
            }}
              style={{ padding: '8px 12px', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: u === fila.unidad ? 700 : 500, background: u === fila.unidad ? 'var(--navy)' : 'transparent', color: u === fila.unidad ? '#fff' : 'var(--text-2)' }}
            >{u}</button>
          ))}
        </div>
      )}

      {showSug && sugerencias.length > 0 && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 25, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '0 0 8px 8px', boxShadow: '0 4px 12px rgba(0,0,0,.12)', maxHeight: 280, overflowY: 'auto' }}>
          {sugerencias.map((s, i) => (
            <button key={i} onMouseDown={e => { e.preventDefault(); seleccionar(s) }} onTouchStart={e => { e.preventDefault(); seleccionar(s) }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '7px 10px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 13, color: s.tipo === 'subreceta' ? 'var(--accent)' : 'var(--text-3)' }}>{s.tipo === 'subreceta' ? 'menu_book' : 'inventory_2'}</span>
              <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--text-1)' }}>{s.nombre}</span>
              <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{s.detalle}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
