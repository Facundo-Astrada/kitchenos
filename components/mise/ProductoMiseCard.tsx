'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '@/lib/auth/context'
import { useImpresionConfig } from '@/lib/hooks/useImpresionConfig'
import { fetchEscPosBytes, printViaUSB, printViaBluetooth, downloadEscPosBytes, supportsWebUSB, supportsWebBluetooth } from '@/lib/print/escpos'
import { CrearTareaSheet, type CrearTareaSheetConfirmData } from '@/components/ops/CrearTareaSheet'
import type { MisePlaceItem, MisePrioridad, TareaPrioridad } from '@/types'

// ── Exported interfaces ───────────────────────────────────────
export interface PlatoPlaza {
  id: string
  plato_id: string
  plaza: string
  instruccion: string | null
  ingredientes: string[] | null
  orden: number
}

export interface CrearTareaParams {
  titulo: string
  seccion: string        // mapped ops section id (caliente, fria, pasteleria, salon, general)
  prioridad: TareaPrioridad
  dia: 'hoy' | 'manana'
  nota: string | null
  cantidad: number | null
  receta_id: string | null
  plaza: string          // raw plaza name → tarea.plaza field
  plazas: PlatoPlaza[]   // multi-plaza sub-tasks
  checklist_item_id: string | null  // FK al item del mise que origina la tarea
}

// Prioridad del ítem del mise (badge propio, sp/p/ref/chk) → dominio real
// TareaPrioridad. Usado como default al abrir el sheet de crear tarea, y
// para traducir la prioridad elegida al agregar un ítem nuevo al mise.
export const MISE_PRIO_TO_TAREA: Record<string, TareaPrioridad> = {
  sp: 'critica', p: 'alta', ref: 'media', chk: 'baja',
}

// ── Internal config ───────────────────────────────────────────
export const PLAZA_TO_SECCION: Record<string, string> = {
  parrilla: 'caliente', calientes: 'caliente', frios: 'fria',
  pasteleria: 'pasteleria', panaderia: 'pasteleria', pase: 'salon',
}

const PRIO_CFG: Record<string, { label: string; color: string; bg: string }> = {
  sp:  { label: 'SP',  color: '#ef4444', bg: 'rgba(239,68,68,.13)' },
  p:   { label: 'P',   color: '#f97316', bg: 'rgba(249,115,22,.13)' },
  ref: { label: 'REF', color: '#3b82f6', bg: 'rgba(59,130,246,.13)' },
  chk: { label: 'OK',  color: '#22c55e', bg: 'rgba(34,197,94,.13)' },
}
const PRIO_CYCLE: MisePrioridad[] = ['sp', 'p', 'ref', 'chk']

const btnReset: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: 'inherit',
}

function nextPrio(current: string): MisePrioridad {
  const idx = PRIO_CYCLE.indexOf(current as MisePrioridad)
  return PRIO_CYCLE[(idx + 1) % PRIO_CYCLE.length]
}

function capPlaza(p: string) { return p.charAt(0).toUpperCase() + p.slice(1) }

// Convierte a kg cuando el total en gramos es grande, para que "Producir" y
// el peso total de los recipientes se lean como "3.96kg" en vez de "3960g".
function fmtPeso(valor: number, unidad: string): string {
  if (unidad === 'g' && valor >= 1000) return `${(valor / 1000).toFixed(2)}kg`
  if (unidad === 'ml' && valor >= 1000) return `${(valor / 1000).toFixed(2)}l`
  return `${Math.round(valor * 100) / 100}${unidad}`
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  return d
}
function fmtFechaCorta(d: Date): string {
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function fmtFechaISO(d: Date): string {
  return d.toISOString().slice(0, 10)
}

const btnEtiqueta: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 8,
  fontSize: 11, fontWeight: 700, fontFamily: 'inherit', border: '1px solid rgba(67,97,160,.3)',
  background: 'rgba(67,97,160,.08)', color: '#4361a0', cursor: 'pointer',
}
const btnEtiquetaSecundario: React.CSSProperties = {
  ...btnEtiqueta, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-2)',
}

// ── Stock dots (5) — used in cierre ──────────────────────────
function StockDots({ cantActual, target }: { cantActual: number | null; target: number }) {
  if (cantActual === null || target <= 0) {
    return (
      <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--border)' }} />
        ))}
      </div>
    )
  }
  const ratio = Math.min(1, cantActual / target)
  const filled = Math.round(ratio * 5)
  const dotColor = ratio >= 0.6 ? '#22c55e' : ratio >= 0.3 ? '#f59e0b' : '#ef4444'
  return (
    <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
      {[0, 1, 2, 3, 4].map(i => (
        <div key={i} style={{
          width: 6, height: 6, borderRadius: '50%',
          background: i < filled ? dotColor : 'var(--border)',
        }} />
      ))}
    </div>
  )
}

// ── Stock box — apertura: muestra cierre anterior (read-only) ─
function StockBox({ stockCierre, target, unidad }: {
  stockCierre: number | null
  target: number
  unidad: string
}) {
  const ratio = stockCierre !== null && target > 0 ? stockCierre / target : null
  let color = '#94a3b8', bg = 'rgba(148,163,184,.08)', border = 'var(--border)'
  if (ratio !== null) {
    if (ratio >= 1)       { color = '#22c55e'; bg = 'rgba(34,197,94,.12)';   border = 'rgba(34,197,94,.3)' }
    else if (ratio >= 0.3){ color = '#f59e0b'; bg = 'rgba(245,158,11,.12)'; border = 'rgba(245,158,11,.3)' }
    else                  { color = '#ef4444'; bg = 'rgba(239,68,68,.12)';   border = 'rgba(239,68,68,.3)' }
  }
  return (
    <div data-coach-target="mise-stock-box" style={{ flex: 1, padding: '6px 10px', borderRadius: 10, background: bg, border: `1px solid ${border}` }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '.06em', marginBottom: 2 }}>
        stock
      </div>
      <div style={{ fontSize: 14, fontWeight: 800, color, fontFamily: "'DM Mono', monospace" }}>
        {stockCierre !== null ? stockCierre : '—'}
        {target > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)' }}> / {target}</span>}
        <span style={{ fontSize: 10, fontWeight: 600, marginLeft: 3 }}>{unidad}</span>
      </div>
      {ratio !== null && ratio >= 1 && (
        <div style={{ fontSize: 9, color: '#22c55e', fontWeight: 600, marginTop: 1 }}>suficiente</div>
      )}
    </div>
  )
}

// ── Producir box — apertura: muestra target fijo ──────────────
function ProducirBox({ cantidad, unidad }: { cantidad: number; unidad: string }) {
  return (
    <div data-coach-target="mise-producir-box" style={{ flex: 1, padding: '6px 10px', borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '.06em', marginBottom: 2 }}>
        a producir
      </div>
      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-1)', fontFamily: "'DM Mono', monospace" }}>
        {cantidad}
        <span style={{ fontSize: 10, fontWeight: 600, marginLeft: 3 }}>{unidad}</span>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────
interface ProductoMiseCardProps {
  item: MisePlaceItem
  reg: { completado: boolean; cantidad_actual: number | null } | undefined
  fecha: string
  turno: string
  recetaInfo?: { porciones?: number | null; pesoPorcion?: number | null; vidaUtilDias?: number | null }
  platoPlazo: PlatoPlaza[]
  hasTareaPendiente: boolean
  rendimientoPromedio?: number | null
  regCierreAnterior?: number | null
  restauranteNombre: string
  onUpsert: (id: string, fecha: string, turno: string, d: { completado?: boolean; cantidad_actual?: number | null }) => Promise<void>
  onCrearTarea: (params: CrearTareaParams) => Promise<void>
  onPrioChange: (item: MisePlaceItem, prio: MisePrioridad) => void
  onDelete: (id: string) => Promise<void>
  onCrearVencimiento: (params: { producto_nombre: string; fecha_vencimiento: string; fecha_apertura: string }) => Promise<void>
}

export function ProductoMiseCard({
  item, reg, fecha, turno, recetaInfo, platoPlazo, hasTareaPendiente,
  rendimientoPromedio, regCierreAnterior, restauranteNombre,
  onUpsert, onCrearTarea, onPrioChange, onDelete, onCrearVencimiento,
}: ProductoMiseCardProps) {
  const esCierre = turno === 'cierre'
  const [cantInput, setCantInput] = useState(reg?.cantidad_actual?.toString() ?? '')
  const [crearTareaSheetOpen, setCrearTareaSheetOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [showDelete, setShowDelete] = useState(false)

  const checked = reg?.completado ?? false
  const cantActual = reg?.cantidad_actual ?? null
  const isBajo = cantActual !== null && item.cantidad > 0 && cantActual < item.cantidad
  const prio = PRIO_CFG[item.prioridad] ?? PRIO_CFG.ref

  // Apertura: stock = apertura corregida por el usuario si existe, sino cierre anterior
  const stockDisplay = !esCierre ? (reg?.cantidad_actual ?? regCierreAnterior ?? null) : null
  const [editingStock, setEditingStock] = useState(false)
  const [stockInput, setStockInput] = useState('')

  const hasReceta = !!item.receta_id && (recetaInfo?.porciones ?? 0) > 0
  const porciones = recetaInfo?.porciones ?? null
  const primaryPlaza = platoPlazo.length > 0 ? platoPlazo[0].plaza : item.plaza

  // Demanda viva: porciones pedidas desde el salón en el turno actual (prep-list-update).
  // Se suma al target del recipiente para que "falta producir" contemple lo ya vendido.
  const demandaViva = item.demanda_viva ?? 0
  const tieneRecipiente = !!(item.recipiente_nombre && item.recipiente_capacidad != null)
  const deficit = tieneRecipiente && stockDisplay !== null
    ? Math.max(0, (item.recipiente_capacidad ?? 0) + demandaViva - stockDisplay)
    : null

  // Peso total que debería haber en TODOS los recipientes juntos, a partir de
  // lo que ya se carga por OPS: capacidad objetivo (en porciones) × peso de
  // una porción. Si el ítem no tiene peso_porcion cargado (recipiente sin
  // tamaño por porción definido), no se puede calcular.
  const pesoTotalRecipientes = tieneRecipiente && item.peso_porcion != null
    ? item.recipiente_capacidad! * item.peso_porcion
    : null

  // ── Etiqueta de producción (imprimible al marcar como lista) ──
  const { perfil } = useAuth()
  const { impresion, vencimientosHabilitados } = useImpresionConfig()
  const [diasOverride, setDiasOverride] = useState<number | null>(null)
  const [printingEtiqueta, setPrintingEtiqueta] = useState(false)
  const [etiquetaError, setEtiquetaError] = useState<string | null>(null)
  const [vencCreado, setVencCreado] = useState(false)
  const [creandoVenc, setCreandoVenc] = useState(false)

  const diasCaducidad = diasOverride ?? recetaInfo?.vidaUtilDias ?? 3
  const fechaCaducidad = addDays(new Date(), diasCaducidad)
  const responsable = perfil ? `${perfil.nombre} ${perfil.apellido}`.trim() : null

  async function buildEtiquetaBytes() {
    return fetchEscPosBytes({
      mode: 'etiqueta',
      data: {
        restaurante: restauranteNombre || 'KitchenOS',
        nombreProduccion: item.nombre,
        fechaElaboracion: fmtFechaCorta(new Date()),
        fechaCaducidad: fmtFechaCorta(fechaCaducidad),
        responsable,
      },
    })
  }

  async function handlePrintEtiqueta(method: 'usb' | 'bluetooth') {
    setPrintingEtiqueta(true)
    setEtiquetaError(null)
    try {
      const bytes = await buildEtiquetaBytes()
      if (method === 'usb') await printViaUSB(bytes)
      else await printViaBluetooth(bytes)
    } catch (e: unknown) {
      setEtiquetaError(e instanceof Error ? e.message : 'Error al imprimir')
    } finally {
      setPrintingEtiqueta(false)
    }
  }

  async function handleDownloadEtiqueta() {
    setPrintingEtiqueta(true)
    setEtiquetaError(null)
    try {
      const bytes = await buildEtiquetaBytes()
      downloadEscPosBytes(bytes, `etiqueta-${item.nombre.toLowerCase().replace(/\s+/g, '-')}.bin`)
    } catch (e: unknown) {
      setEtiquetaError(e instanceof Error ? e.message : 'Error al descargar')
    } finally {
      setPrintingEtiqueta(false)
    }
  }

  async function handleCrearVencDesdeEtiqueta() {
    if (creandoVenc || vencCreado) return
    setCreandoVenc(true)
    try {
      await onCrearVencimiento({
        producto_nombre: item.nombre,
        fecha_vencimiento: fmtFechaISO(fechaCaducidad),
        fecha_apertura: fmtFechaISO(new Date()),
      })
      setVencCreado(true)
    } finally {
      setCreandoVenc(false)
    }
  }

  async function crearTarea(cantidad: number | null, prioridad: TareaPrioridad, dia: 'hoy' | 'manana', nota: string | null) {
    if (creating) return
    setCreating(true)
    try {
      await onCrearTarea({
        titulo: item.nombre,
        seccion: PLAZA_TO_SECCION[primaryPlaza] ?? 'general',
        prioridad, dia, nota,
        cantidad,
        receta_id: item.receta_id ?? null,
        plaza: primaryPlaza,
        plazas: platoPlazo,
        checklist_item_id: item.id,
      })
      setCrearTareaSheetOpen(false)
      setSuccessMsg(capPlaza(primaryPlaza) + (platoPlazo.length > 1 ? ` +${platoPlazo.length - 1}` : ''))
      setTimeout(() => setSuccessMsg(null), 2200)
    } finally {
      setCreating(false)
    }
  }

  // Atajo de un tap desde el CTA de déficit — sin abrir el sheet, prioridad alta por defecto.
  function handleCrearTareaRapida(cantidad: number) {
    return crearTarea(cantidad, 'alta', 'hoy', null)
  }

  function handleConfirmCrearTarea(data: CrearTareaSheetConfirmData) {
    return crearTarea(data.cantidad, data.prioridad, data.dia, data.nota)
  }

  return (
    <div style={{
      background: checked ? 'rgba(34,197,94,.04)' : 'var(--surface)',
      border: `1px solid ${checked ? 'rgba(34,197,94,.22)' : isBajo ? 'rgba(249,115,22,.3)' : 'var(--border)'}`,
      borderRadius: 14, overflow: 'hidden',
      opacity: checked ? 0.72 : 1,
      transition: 'all .2s',
    }}>

      {/* ── Main row ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', paddingBottom: esCierre ? 10 : 6 }}>

        {/* Checkbox */}
        <button
          onClick={() => onUpsert(item.id, fecha, turno, { completado: !checked })}
          style={{ ...btnReset, flexShrink: 0 }}
        >
          <span className="material-symbols-outlined" style={{
            fontSize: 24, color: checked ? '#22c55e' : 'var(--border)', transition: 'color .15s',
          }}>{checked ? 'check_circle' : 'radio_button_unchecked'}</span>
        </button>

        {/* Name */}
        <div
          style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
          onClick={() => setShowDelete(v => !v)}
        >
          <span style={{
            fontSize: 13, fontWeight: 600,
            color: checked ? 'var(--text-3)' : 'var(--text-1)',
            textDecoration: checked ? 'line-through' : 'none',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block',
          }}>
            {item.nombre}
          </span>
          {item.receta_id && !checked && (
            <span style={{ fontSize: 9, color: '#4361a0', fontWeight: 600 }}>receta</span>
          )}
          {demandaViva > 0 && !checked && (
            <span style={{
              marginLeft: item.receta_id ? 6 : 0, fontSize: 9, fontWeight: 700,
              padding: '1px 6px', borderRadius: 99,
              background: 'rgba(249,115,22,.13)', color: '#f97316',
            }}>
              Pedidas hoy: {demandaViva}
            </span>
          )}
        </div>

        {/* En cierre: stock dots + input editable */}
        {esCierre && (
          <>
            <StockDots cantActual={cantActual} target={item.cantidad} />
            <input
              type="number"
              value={cantInput}
              onChange={e => setCantInput(e.target.value)}
              onBlur={() => {
                const v = cantInput === '' ? null : parseFloat(cantInput)
                onUpsert(item.id, fecha, turno, { cantidad_actual: isNaN(v as number) ? null : v })
              }}
              inputMode="decimal"
              placeholder="—"
              style={{
                width: 40, padding: '3px 4px', borderRadius: 7, flexShrink: 0,
                border: `1.5px solid ${isBajo ? '#f97316' : cantActual !== null ? '#22c55e' : 'var(--border)'}`,
                background: isBajo ? 'rgba(249,115,22,.07)' : cantActual !== null ? 'rgba(34,197,94,.07)' : 'var(--bg)',
                fontSize: 12, fontWeight: 700, fontFamily: "'DM Mono', monospace",
                color: 'var(--text-1)', textAlign: 'center', outline: 'none',
              }}
            />
            <span style={{ fontSize: 9, color: 'var(--text-3)', fontWeight: 700, flexShrink: 0 }}>
              / {item.cantidad} {item.unidad}
            </span>
          </>
        )}

        {/* Prio badge */}
        <button
          onClick={() => onPrioChange(item, nextPrio(item.prioridad))}
          style={{
            ...btnReset, flexShrink: 0,
            padding: '3px 7px', borderRadius: 7,
            background: prio.bg, border: `1px solid ${prio.color}40`,
            fontSize: 10, fontWeight: 800, color: prio.color, transition: 'all .15s',
          }}
        >
          {prio.label}
        </button>

        {/* Production toggle — abre el sheet unificado de crear tarea */}
        {!checked && (
          <button
            onClick={() => setCrearTareaSheetOpen(true)}
            style={{ ...btnReset, flexShrink: 0, position: 'relative', padding: 2 }}
          >
            <span className="material-symbols-outlined" style={{
              fontSize: 20,
              color: crearTareaSheetOpen ? '#4361a0' : hasTareaPendiente ? '#22c55e' : 'var(--text-3)',
              transition: 'color .15s',
            }}>
              {hasTareaPendiente ? 'task_alt' : 'add_task'}
            </span>
          </button>
        )}
      </div>

      {/* ── Etiqueta de producción — visible al marcar como lista (opcional por restaurante) ── */}
      {checked && vencimientosHabilitados && (
        <div style={{ padding: '0 12px 10px', paddingLeft: 44, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const }}>
            <span style={{ fontSize: 10, color: 'var(--text-3)' }}>Caduca en</span>
            <input
              type="number"
              min={1}
              value={diasCaducidad}
              onChange={e => setDiasOverride(e.target.value === '' ? null : parseInt(e.target.value))}
              style={{
                width: 40, padding: '3px 4px', borderRadius: 6, textAlign: 'center',
                border: '1px solid var(--border)', background: 'var(--bg)',
                fontSize: 11, fontWeight: 700, color: 'var(--text-1)', fontFamily: "'DM Mono', monospace",
              }}
            />
            <span style={{ fontSize: 10, color: 'var(--text-3)' }}>días ({fmtFechaCorta(fechaCaducidad)})</span>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
            {impresion.usb && supportsWebUSB() && (
              <button onClick={() => handlePrintEtiqueta('usb')} disabled={printingEtiqueta} style={btnEtiqueta}>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>print</span>
                {printingEtiqueta ? 'Imprimiendo...' : 'Imprimir etiqueta'}
              </button>
            )}
            {impresion.bluetooth && supportsWebBluetooth() && (
              <button onClick={() => handlePrintEtiqueta('bluetooth')} disabled={printingEtiqueta} style={btnEtiquetaSecundario}>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>bluetooth</span>
                Bluetooth
              </button>
            )}
            {impresion.bin && (
              <button onClick={handleDownloadEtiqueta} disabled={printingEtiqueta} style={btnEtiquetaSecundario}>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>download</span>
                Descargar .bin
              </button>
            )}
          </div>
          <button
            onClick={handleCrearVencDesdeEtiqueta}
            disabled={creandoVenc || vencCreado}
            style={{
              ...btnEtiquetaSecundario, justifyContent: 'center',
              color: vencCreado ? '#22c55e' : 'var(--text-2)',
              borderColor: vencCreado ? 'rgba(34,197,94,.3)' : 'var(--border)',
              background: vencCreado ? 'rgba(34,197,94,.08)' : 'var(--bg)',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
              {vencCreado ? 'check_circle' : 'event'}
            </span>
            {vencCreado ? 'Vencimiento creado en HACCP' : creandoVenc ? 'Creando...' : 'Crear vencimiento en HACCP'}
          </button>
          {etiquetaError && <span style={{ fontSize: 10, color: '#ef4444' }}>{etiquetaError}</span>}
        </div>
      )}

      {/* ── Info row — apertura estándar (sin recipiente) ── */}
      {!esCierre && !checked && !tieneRecipiente && (
        <div style={{ display: 'flex', gap: 6, padding: '0 12px 10px', paddingLeft: 44 }}>
          {editingStock ? (
            <div data-coach-target="mise-stock-box" style={{
              flex: 1, padding: '6px 10px', borderRadius: 10,
              background: 'rgba(59,130,246,.08)', border: '1.5px solid #3b82f6',
            }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '.06em', marginBottom: 2 }}>stock</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                <input
                  autoFocus
                  type="number"
                  inputMode="decimal"
                  value={stockInput}
                  onChange={e => setStockInput(e.target.value)}
                  onBlur={() => {
                    setEditingStock(false)
                    const v = stockInput === '' ? null : parseFloat(stockInput)
                    onUpsert(item.id, fecha, turno, { cantidad_actual: (!v && v !== 0) ? null : v })
                  }}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                  style={{
                    background: 'none', border: 'none', outline: 'none', padding: 0,
                    width: '100%', fontSize: 14, fontWeight: 800, color: '#3b82f6',
                    fontFamily: "'DM Mono', monospace",
                  }}
                />
                <span style={{ fontSize: 10, fontWeight: 600, color: '#3b82f6' }}>{item.unidad}</span>
              </div>
            </div>
          ) : (
            <div
              onClick={() => { setStockInput(stockDisplay?.toString() ?? ''); setEditingStock(true) }}
              style={{ flex: 1, cursor: 'text' }}
            >
              <StockBox stockCierre={stockDisplay} target={item.cantidad} unidad={item.unidad} />
            </div>
          )}
          <ProducirBox cantidad={item.cantidad} unidad={item.unidad} />
        </div>
      )}

      {/* ── Info row — apertura con recipiente ── */}
      {!esCierre && !checked && tieneRecipiente && (
        <div style={{ padding: '0 12px 10px', paddingLeft: 44 }}>
          {/* Recipiente chip */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8, flexWrap: 'wrap' as const }}>
            <span className="material-symbols-outlined" style={{ fontSize: 13, color: 'var(--text-3)' }}>inventory_2</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'capitalize' as const }}>
              {item.recipiente_nombre}
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-3)' }}>× {item.recipiente_capacidad} porc</span>
            {item.peso_porcion != null && (
              <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: 'rgba(67,97,160,.1)', color: 'var(--accent)' }}>
                {item.peso_porcion}{item.peso_porcion_unidad ?? 'g'} c/u
              </span>
            )}
            {pesoTotalRecipientes != null && (
              <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: 'rgba(16,185,129,.12)', color: '#059669' }}>
                = {fmtPeso(pesoTotalRecipientes, item.peso_porcion_unidad ?? 'g')} total
              </span>
            )}
          </div>
          {/* Hay ahora / falta */}
          <div style={{ display: 'flex', gap: 6 }}>
            {/* Editable "hay ahora" */}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '.06em', marginBottom: 3 }}>
                hay ahora
              </div>
              {editingStock ? (
                <input
                  autoFocus type="number" inputMode="decimal" value={stockInput}
                  onChange={e => setStockInput(e.target.value)}
                  onBlur={() => {
                    setEditingStock(false)
                    const v = stockInput === '' ? null : parseFloat(stockInput)
                    onUpsert(item.id, fecha, turno, { cantidad_actual: (!v && v !== 0) ? null : v })
                  }}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                  style={{
                    width: '100%', padding: '5px 9px', borderRadius: 8, boxSizing: 'border-box',
                    border: '1.5px solid #3b82f6', background: 'rgba(59,130,246,.08)',
                    fontSize: 14, fontWeight: 800, color: '#3b82f6',
                    fontFamily: "'DM Mono', monospace", outline: 'none',
                  }}
                />
              ) : (
                <div
                  onClick={() => { setStockInput(stockDisplay?.toString() ?? ''); setEditingStock(true) }}
                  style={{
                    padding: '5px 9px', borderRadius: 8, cursor: 'text',
                    background: stockDisplay === null ? 'var(--bg)' : 'rgba(148,163,184,.1)',
                    border: `1.5px dashed ${stockDisplay === null ? 'var(--border)' : 'transparent'}`,
                    fontSize: stockDisplay !== null ? 14 : 11, fontWeight: 800,
                    color: stockDisplay === null ? 'var(--text-3)' : 'var(--text-1)',
                    fontFamily: "'DM Mono', monospace", display: 'flex', alignItems: 'baseline', gap: 3,
                  }}
                >
                  {stockDisplay !== null
                    ? <>{stockDisplay}<span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)' }}> / {item.recipiente_capacidad}</span><span style={{ fontSize: 10, fontWeight: 600, marginLeft: 2 }}>{item.unidad}</span></>
                    : <span style={{ fontSize: 12, color: 'var(--text-3)' }}>— / {item.recipiente_capacidad}</span>}
                </div>
              )}
            </div>
            {/* Déficit */}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '.06em', marginBottom: 3 }}>
                falta producir
              </div>
              <div style={{
                padding: '5px 9px', borderRadius: 8,
                background: deficit === null ? 'var(--surface)' : deficit === 0 ? 'rgba(34,197,94,.12)' : 'rgba(239,68,68,.10)',
                border: `1px solid ${deficit === null ? 'var(--border)' : deficit === 0 ? 'rgba(34,197,94,.25)' : 'rgba(239,68,68,.28)'}`,
                fontSize: 14, fontWeight: 800,
                color: deficit === null ? 'var(--text-3)' : deficit === 0 ? '#22c55e' : '#ef4444',
                fontFamily: "'DM Mono', monospace", display: 'flex', alignItems: 'baseline', gap: 3,
              }}>
                {deficit === null
                  ? <span style={{ fontSize: 11, fontWeight: 600 }}>—</span>
                  : deficit === 0
                    ? <span style={{ fontSize: 11, fontWeight: 700 }}>stock ok</span>
                    : <>{deficit}<span style={{ fontSize: 10, fontWeight: 600, marginLeft: 2 }}>{item.unidad}</span></>}
              </div>
            </div>
          </div>
          {/* CTA rápido cuando hay déficit */}
          {deficit !== null && deficit > 0 && (
            <button
              onClick={() => handleCrearTareaRapida(deficit)}
              disabled={creating}
              style={{
                marginTop: 8, width: '100%', padding: '9px 0', borderRadius: 10, border: 'none',
                background: creating ? 'var(--border)' : 'linear-gradient(135deg, #ef4444, #f97316)',
                color: '#fff', fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
                cursor: creating ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add_task</span>
              {creating ? 'Creando...' : `Producir ${deficit} porc${item.peso_porcion ? ` (${fmtPeso(deficit * item.peso_porcion, item.peso_porcion_unidad ?? 'g')})` : ''}`}
            </button>
          )}
        </div>
      )}

      {/* ── Crear tarea (sheet unificado, hoy o mañana) ── */}
      {crearTareaSheetOpen && !checked && (
        <CrearTareaSheet
          nombreComponente={item.nombre}
          porciones={hasReceta ? porciones : undefined}
          cantidadSugerida={item.cantidad > 0 ? item.cantidad : null}
          unidad={item.unidad}
          plazas={platoPlazo}
          rendimientoPromedio={rendimientoPromedio}
          defaultPrioridad={MISE_PRIO_TO_TAREA[item.prioridad] ?? 'alta'}
          defaultDia="hoy"
          onConfirm={handleConfirmCrearTarea}
          onDismiss={() => setCrearTareaSheetOpen(false)}
        />
      )}

      {/* ── Success banner ── */}
      <AnimatePresence>
        {successMsg && (
          <motion.div
            key="success-banner"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{
              padding: '7px 12px',
              background: 'rgba(34,197,94,.1)', borderTop: '1px solid rgba(34,197,94,.2)',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#22c55e' }}>check_circle</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#22c55e' }}>
                Tarea creada en {successMsg}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Delete row (expand on name tap) ── */}
      <AnimatePresence>
        {showDelete && (
          <motion.div
            key="delete-row"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{
              padding: '6px 12px 10px', borderTop: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
            }}>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                Estándar: {item.cantidad} {item.unidad}
              </span>
              {recetaInfo?.pesoPorcion != null && (
                <span style={{ fontSize: 11, color: '#4361a0', fontWeight: 600 }}>
                  · Porción: {recetaInfo.pesoPorcion}g
                </span>
              )}
              {recetaInfo?.porciones != null && !recetaInfo?.pesoPorcion && (
                <span style={{ fontSize: 11, color: '#4361a0', fontWeight: 600 }}>
                  · {recetaInfo.porciones} porc.
                </span>
              )}
              {item.ubicacion && (
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>· {item.ubicacion}</span>
              )}
              <div style={{ flex: 1 }} />
              <button
                onClick={() => onDelete(item.id)}
                style={{
                  ...btnReset, padding: '4px 10px', borderRadius: 8,
                  fontSize: 11, fontWeight: 600, color: '#ef4444',
                  background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.2)',
                }}
              >
                Eliminar
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
