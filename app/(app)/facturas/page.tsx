'use client'

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useIsDesktop } from '@/lib/hooks/useIsDesktop'
import { useFacturas } from '@/lib/hooks/useFacturas'
import { useStock } from '@/lib/hooks/useStock'
import { useProveedores } from '@/lib/hooks/useProveedores'
import { usePedidos } from '@/lib/hooks/usePedidos'
import { useCategoriasGasto, CATEGORIA_FINANCIERA_LABELS } from '@/lib/hooks/useCategoriasGasto'
import { useMediosPago } from '@/lib/hooks/useMediosPago'
import { useRestauranteId } from '@/lib/hooks/useRestauranteId'
import ProveedoresPage from '@/app/(app)/proveedores/page'
import ImageCropModal from '@/components/ui/ImageCropModal'
import BulkUploadDrawer from '@/components/facturas/BulkUploadDrawer'
import ExcelPOSImportModal from '@/components/facturas/ExcelPOSImportModal'
import { exportarExcel, fechaArchivo } from '@/lib/exportar'
import { createClient } from '@/lib/supabase/client'
import { calcularVencimientoFactura, type VencimientoFactura } from '@/lib/utils'
import type {
  Factura, FacturaItem, FacturaStatus, TipoFactura, CondicionPago,
  Pedido, PedidoItem, CategoriaGasto, CategoriaFinanciera, MedioPago,
} from '@/types'

// ── Weight unit helpers ──────────────────────────────────────
const WEIGHT_UNITS_KG = new Set(['kg', 'kilo', 'kilos', 'kilogramo', 'kilogramos'])
const WEIGHT_UNITS_G = new Set(['g', 'gr', 'gramo', 'gramos', 'mg'])
const LIQUID_UNITS_L = new Set(['l', 'lt', 'lts', 'litro', 'litros'])
const LIQUID_UNITS_ML = new Set(['ml', 'cc', 'cm3'])

function isWeightUnit(u: string): boolean {
  const n = u.toLowerCase().trim()
  return WEIGHT_UNITS_KG.has(n) || WEIGHT_UNITS_G.has(n) || LIQUID_UNITS_L.has(n) || LIQUID_UNITS_ML.has(n)
}

function calcPrecioBase(precioUnitario: number, unidad: string, pesoKg?: number): number | null {
  const n = unidad.toLowerCase().trim()
  if (WEIGHT_UNITS_KG.has(n)) return precioUnitario
  if (WEIGHT_UNITS_G.has(n)) return precioUnitario * 1000
  if (LIQUID_UNITS_L.has(n)) return precioUnitario
  if (LIQUID_UNITS_ML.has(n)) return precioUnitario * 1000
  if (pesoKg && pesoKg > 0) return precioUnitario / pesoKg
  return null
}

function getBaseUnitLabel(unidad: string): string {
  const n = unidad.toLowerCase().trim()
  if (LIQUID_UNITS_L.has(n) || LIQUID_UNITS_ML.has(n)) return 'l'
  return 'kg'
}

const UNIDADES_COMUNES = ['kg', 'g', 'l', 'ml', 'unidad', 'caja', 'cajón', 'bolsa', 'docena', 'pack', 'horma', 'bandeja']
const CATEGORIAS_COMUNES = ['carnes', 'verduras', 'lácteos', 'bebidas', 'secos', 'congelados', 'limpieza', 'descartables', 'otros']

// ── Helpers ──────────────────────────────────────────────────
function fmt(n: number) {
  return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
}

function fmtFecha(d: string | null) {
  if (!d) return '—'
  return new Date(d + 'T12:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function hoy() { return new Date().toISOString().slice(0, 10) }

function inicioSemana() {
  const d = new Date(); d.setDate(d.getDate() - d.getDay())
  return d.toISOString().slice(0, 10)
}

function inicioMes() {
  const d = new Date(); d.setDate(1)
  return d.toISOString().slice(0, 10)
}

function normalizeName(s: string) {
  return s.toLowerCase().trim().replace(/\s+/g, ' ')
}

const STATUS_CONFIG: Record<FacturaStatus, { bg: string; color: string; label: string }> = {
  confirmada: { bg: '#dcfce7', color: '#166534', label: 'Confirmada' },
  pendiente: { bg: '#fef9c3', color: '#854d0e', label: 'Pendiente' },
  observada: { bg: '#fef2f2', color: '#991b1b', label: 'Observada' },
  pagada: { bg: '#dbeafe', color: '#1e40af', label: 'Pagada' },
}

// Una factura está "por pagar" si es a crédito y todavía no se marcó pagada.
const COND_A_CREDITO = new Set(['cuenta_corriente', '30dias', '60dias'])
function esPorPagar(f: Factura): boolean {
  return COND_A_CREDITO.has(String(f.condicion_pago ?? '')) && f.status !== 'pagada'
}

const TIPO_LABELS: Record<TipoFactura, string> = {
  A: 'Factura A', B: 'Factura B', C: 'Factura C', X: 'Factura X',
  remito: 'Remito', ticket: 'Ticket',
}

// ── Import mode selector ─────────────────────────────────────
type ImportMode = 'camera' | 'image' | 'pdf' | 'text' | 'manual' | null
type View = 'list' | 'import' | 'confirm' | 'detail'

interface AIResult {
  proveedor_nombre: string
  proveedor_cuit: string | null
  fecha_factura: string | null
  tipo_factura: TipoFactura
  numero_factura: string | null
  condicion_pago: CondicionPago
  items: {
    producto_nombre: string
    producto_id: string | null
    cantidad: number
    unidad: string
    precio_unitario: number
    alicuota_iva: number
    subtotal: number
    precio_anterior: number | null
    match_confianza: 'alta' | 'media' | 'nueva'
    peso_kg?: number
    categoria?: string
  }[]
  subtotal: number
  iva_total: number
  total: number
  notas: string | null
  categoria_gasto_id?: string | null
  medio_pago_id?: string | null
  fecha_vencimiento?: string | null
  proveedor_es_persona?: boolean
  items_excluidos?: { concepto: string; motivo: string }[]
  alerta_privacidad?: string | null
  _demo?: boolean
}

// ── Listas de precios types ──────────────────────────────────
type ListaImportMode = 'excel' | 'image' | 'pdf' | 'text' | 'url' | null
type ListaView = 'empty' | 'import' | 'confirm'

interface ListaAIItem {
  producto_nombre: string
  precio_unitario: number
  unidad: string
  cantidad_envase: number
  observaciones: string | null
}

interface ListaAIResult {
  items: ListaAIItem[]
  moneda: string
  fecha_detectada: string | null
  notas: string | null
  _demo?: boolean
}

type MainTab = 'facturas' | 'recepcion' | 'categorias' | 'listas' | 'proveedores'
const MAIN_TABS = ['facturas', 'recepcion', 'categorias', 'listas', 'proveedores'] as const
const TAB_LABELS: Record<MainTab, string> = { facturas: 'Gastos', recepcion: 'Recepción', categorias: 'Cat. de Gastos', listas: 'Listas', proveedores: 'Proveedores' }

// ── Vencimiento badge (cuentas por pagar) ─────────────────────
const VENC_CONFIG: Record<VencimientoFactura['urgencia'], { bg: string; color: string }> = {
  vencida: { bg: '#fee2e2', color: '#991b1b' },
  esta_semana: { bg: '#fef3c7', color: '#92400e' },
  proximamente: { bg: '#e0f2fe', color: '#075985' },
  sin_fecha: { bg: '#f1f5f9', color: '#64748b' },
}
function labelVencimiento(v: VencimientoFactura): string {
  if (v.urgencia === 'sin_fecha') return 'Cuenta corriente'
  if (v.diasRestantes === null) return ''
  if (v.diasRestantes < 0) return `Venció hace ${Math.abs(v.diasRestantes)}d`
  if (v.diasRestantes === 0) return 'Vence hoy'
  return `Vence en ${v.diasRestantes}d`
}

// ── Factura Card ─────────────────────────────────────────────
function FacturaCard({ f, onClick, vencimiento, onMarcarPagada }: {
  f: Factura
  onClick: () => void
  vencimiento?: VencimientoFactura
  onMarcarPagada?: () => void
}) {
  const st = STATUS_CONFIG[f.status as FacturaStatus] || STATUS_CONFIG.pendiente
  const vc = vencimiento ? VENC_CONFIG[vencimiento.urgencia] : null
  return (
    <div
      className="w-full rounded-[14px] p-[14px] mb-[8px]"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'stretch', gap: 10 }}
    >
      <button
        onClick={onClick}
        className="flex-1 min-w-0 text-left border-none cursor-pointer bg-transparent p-0"
      >
        <div className="flex items-start justify-between mb-[4px]">
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-bold truncate" style={{ color: 'var(--text)' }}>
              {f.proveedor_nombre}
            </div>
            <div className="text-[11px] mt-[2px]" style={{ color: 'var(--text-3)' }}>
              {fmtFecha(f.fecha_factura)} · {TIPO_LABELS[f.tipo_factura as TipoFactura] || f.tipo_factura}
            </div>
          </div>
          <div className="text-right flex-shrink-0 ml-3">
            <div className="text-[15px] font-bold" style={{ color: 'var(--text)' }}>{fmt(f.total)}</div>
            <span
              className="text-[9px] font-bold px-[6px] py-[2px] rounded-[4px] inline-block mt-[2px]"
              style={{ background: st.bg, color: st.color }}
            >
              {st.label}
            </span>
          </div>
        </div>
        {vc && (
          <span
            className="text-[9px] font-bold px-[6px] py-[2px] rounded-[4px] inline-block mt-[2px]"
            style={{ background: vc.bg, color: vc.color }}
          >
            {labelVencimiento(vencimiento!)}
          </span>
        )}
      </button>
      {onMarcarPagada && (
        <button
          onClick={(e) => { e.stopPropagation(); onMarcarPagada() }}
          title="Marcar pagada"
          className="flex-shrink-0 border-none cursor-pointer flex items-center justify-center"
          style={{ width: 40, borderRadius: 10, background: 'rgba(16,185,129,.1)', color: '#10b981' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 22 }}>check_circle</span>
        </button>
      )}
    </div>
  )
}

// ── Import Selector ──────────────────────────────────────────
// Usa <label htmlFor> para camera/image/pdf — el tap va directo al
// input nativo sin pasar por JS, lo que garantiza que la cámara
// se abra en iOS/Android (las políticas del browser bloquean
// input.click() programático tras cambios de estado).
function ImportSelector({ onSelect, onFile }: {
  onSelect: (mode: 'text' | 'manual') => void
  onFile: (file: File, mode: 'camera' | 'image' | 'pdf') => void
}) {
  return (
    <div className="p-4">
      <h2 className="text-[16px] font-bold mb-1" style={{ color: 'var(--text)' }}>Cargar factura</h2>
      <p className="text-[12px] mb-4" style={{ color: 'var(--text-3)' }}>
        La IA extrae los datos automaticamente
      </p>
      <div className="grid grid-cols-2 gap-3">

        {/* Sacar foto — input con capture="environment" embebido en label */}
        <label
          htmlFor="factura-camera-input"
          className="flex flex-col items-center gap-2 p-4 rounded-[14px] cursor-pointer"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <input
            id="factura-camera-input"
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f, 'camera'); e.target.value = '' }}
          />
          <span className="material-symbols-outlined text-[28px]" style={{ color: 'var(--navy)' }}>camera_alt</span>
          <span className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>Sacar foto</span>
          <span className="text-[10px] text-center" style={{ color: 'var(--text-3)' }}>Ticket, factura en papel</span>
        </label>

        {/* Subir imagen */}
        <label
          htmlFor="factura-image-input"
          className="flex flex-col items-center gap-2 p-4 rounded-[14px] cursor-pointer"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <input
            id="factura-image-input"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f, 'image'); e.target.value = '' }}
          />
          <span className="material-symbols-outlined text-[28px]" style={{ color: 'var(--navy)' }}>image</span>
          <span className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>Subir imagen</span>
          <span className="text-[10px] text-center" style={{ color: 'var(--text-3)' }}>Captura de pantalla, foto guardada</span>
        </label>

        {/* Subir PDF */}
        <label
          htmlFor="factura-pdf-input"
          className="flex flex-col items-center gap-2 p-4 rounded-[14px] cursor-pointer"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <input
            id="factura-pdf-input"
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f, 'pdf'); e.target.value = '' }}
          />
          <span className="material-symbols-outlined text-[28px]" style={{ color: 'var(--navy)' }}>picture_as_pdf</span>
          <span className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>Subir PDF</span>
          <span className="text-[10px] text-center" style={{ color: 'var(--text-3)' }}>Factura digital</span>
        </label>

        {/* Pegar texto — único que usa onClick */}
        <button
          onClick={() => onSelect('text')}
          className="flex flex-col items-center gap-2 p-4 rounded-[14px] border-none cursor-pointer"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <span className="material-symbols-outlined text-[28px]" style={{ color: 'var(--navy)' }}>text_snippet</span>
          <span className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>Pegar texto</span>
          <span className="text-[10px] text-center" style={{ color: 'var(--text-3)' }}>Email, datos copiados</span>
        </button>

        {/* Carga manual tabla */}
        <button
          onClick={() => onSelect('manual')}
          className="flex flex-col items-center gap-2 p-4 rounded-[14px] border-none cursor-pointer col-span-2"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <span className="material-symbols-outlined text-[28px]" style={{ color: 'var(--navy)' }}>table</span>
          <span className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>Carga manual</span>
          <span className="text-[10px] text-center" style={{ color: 'var(--text-3)' }}>Ingresá productos en tabla</span>
        </button>

      </div>
    </div>
  )
}

// ── Confirm View ─────────────────────────────────────────────
function ConfirmView({ result, productos, proveedores, categoriasGasto = [], mediosPago = [], onConfirm, onCancel, saving }: {
  result: AIResult
  productos: { id: string; nombre: string; precio_unitario?: number; unidad: string }[]
  proveedores: { id: string; nombre: string; cuit?: string | null }[]
  categoriasGasto?: CategoriaGasto[]
  mediosPago?: MedioPago[]
  onConfirm: (data: AIResult) => void
  onCancel: () => void
  saving: boolean
}) {
  const [data, setData] = useState<AIResult>(result)
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [provSearch, setProvSearch] = useState('')
  const [showProvDD, setShowProvDD] = useState(false)
  const [stockSearch, setStockSearch] = useState<Record<number, string>>({})
  const [dismissedLinks, setDismissedLinks] = useState<Set<number>>(new Set())
  const [rawInputs, setRawInputs] = useState<Record<string, string>>({})

  function setRaw(key: string, val: string) { setRawInputs(p => ({ ...p, [key]: val })) }
  function clearRaw(key: string) { setRawInputs(p => { const n = { ...p }; delete n[key]; return n }) }
  function rawVal(key: string, num: number | undefined | null): string {
    if (key in rawInputs) return rawInputs[key]
    if (num == null || num === 0) return ''
    return String(num)
  }

  const provMatches = useMemo(() => {
    const q = (provSearch || data.proveedor_nombre).toLowerCase().trim()
    if (!q) return []
    return proveedores.filter(p => p.nombre.toLowerCase().includes(q)).slice(0, 6)
  }, [provSearch, data.proveedor_nombre, proveedores])

  // Resumen de alzas de precio significativas (>15% vs compra anterior)
  const ALERTA_VARIACION = 15
  const alzas = useMemo(() => {
    return data.items
      .map(it => {
        const va = it.precio_anterior && it.precio_anterior > 0
          ? ((it.precio_unitario - it.precio_anterior) / it.precio_anterior) * 100
          : null
        return va !== null && va >= ALERTA_VARIACION
          ? { nombre: it.producto_nombre, va, antes: it.precio_anterior!, ahora: it.precio_unitario }
          : null
      })
      .filter((x): x is { nombre: string; va: number; antes: number; ahora: number } => x !== null)
      .sort((a, b) => b.va - a.va)
  }, [data.items])

  function updateItem(idx: number, field: string, value: unknown) {
    setData(prev => ({
      ...prev,
      items: prev.items.map((it, i) => i === idx ? { ...it, [field]: value } : it),
    }))
  }

  function vincularProducto(idx: number, prodId: string) {
    const prod = productos.find(p => p.id === prodId)
    if (!prod) return
    setData(prev => ({
      ...prev,
      items: prev.items.map((it, i) => i === idx ? {
        ...it, producto_id: prodId,
        precio_anterior: (prod as Record<string, unknown>).precio_unitario as number || null,
        match_confianza: 'alta' as const,
      } : it),
    }))
  }

  function filteredStock(idx: number) {
    const q = (stockSearch[idx] || '').toLowerCase().trim()
    if (!q) return productos.slice(0, 8)
    return productos.filter(p => p.nombre.toLowerCase().includes(q)).slice(0, 8)
  }

  // Auto-match products on mount
  useEffect(() => {
    setData(prev => ({
      ...prev,
      items: prev.items.map(item => {
        if (item.producto_id) return item
        const norm = (s: string) => s.toLowerCase().replace(/[^a-záéíóúñ0-9 ]/g, '').trim()
        const nItem = norm(item.producto_nombre)
        const match = productos.find(p => {
          const nProd = norm(p.nombre)
          return nProd === nItem || nProd.includes(nItem) || nItem.includes(nProd)
        })
        if (match) {
          return {
            ...item,
            producto_id: match.id,
            precio_anterior: (match as Record<string, unknown>).precio_unitario as number || null,
            match_confianza: 'media' as const,
          }
        }
        return { ...item, match_confianza: 'nueva' as const }
      }),
    }))
  }, [productos])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 14px', flexShrink: 0 }}>
        <div className="flex items-center gap-3">
          <button onClick={onCancel} className="border-none bg-transparent cursor-pointer">
            <span className="material-symbols-outlined text-[22px] text-white">arrow_back</span>
          </button>
          <div>
            <h1 className="text-white text-[18px] font-bold m-0">Confirmar factura</h1>
            <p className="text-white/60 text-[11px] m-0 mt-[2px]">
              {data._demo && 'DEMO — '} Verifica los datos detectados
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Alerta de privacidad */}
        {(data.alerta_privacidad || (data.items_excluidos && data.items_excluidos.length > 0)) && (
          <div className="mx-4 mt-4 rounded-[12px] p-3" style={{ background: '#fef3c7', border: '1px solid #fcd34d' }}>
            <div className="flex items-start gap-2">
              <span className="material-symbols-outlined text-[18px]" style={{ color: '#92400e' }}>shield_person</span>
              <div className="flex-1">
                <div className="text-[12px] font-bold" style={{ color: '#92400e' }}>Datos de personas detectados</div>
                {data.alerta_privacidad && (
                  <div className="text-[11px] mt-1" style={{ color: '#92400e' }}>{data.alerta_privacidad}</div>
                )}
                {data.items_excluidos && data.items_excluidos.length > 0 && (
                  <div className="mt-2 flex flex-col gap-1">
                    {data.items_excluidos.map((ex, i) => (
                      <div key={i} className="text-[11px]" style={{ color: '#92400e' }}>
                        <span className="line-through opacity-70">{ex.concepto}</span>
                        <span className="opacity-60"> — {ex.motivo}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="text-[10px] mt-2 opacity-70" style={{ color: '#92400e' }}>
                  Estos conceptos no se cargarán como compras. Configurá los nombres internos desde el botón de privacidad en Facturas.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Alerta de variación de precio — alzas significativas */}
        {alzas.length > 0 && (
          <div className="mx-4 mt-4 rounded-[12px] p-3" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
            <div className="flex items-start gap-2">
              <span className="material-symbols-outlined text-[18px]" style={{ color: '#b91c1c' }}>trending_up</span>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-bold" style={{ color: '#b91c1c' }}>
                  {alzas.length === 1 ? '1 producto subió' : `${alzas.length} productos subieron`} de precio
                </div>
                <div className="mt-1 flex flex-col gap-1">
                  {alzas.slice(0, 5).map((a, i) => (
                    <div key={i} className="text-[11px] flex items-center justify-between gap-2" style={{ color: '#991b1b' }}>
                      <span className="truncate">{a.nombre}</span>
                      <span className="font-bold whitespace-nowrap">
                        {fmt(a.antes)} → {fmt(a.ahora)} <span style={{ color: '#dc2626' }}>+{a.va.toFixed(0)}%</span>
                      </span>
                    </div>
                  ))}
                  {alzas.length > 5 && (
                    <div className="text-[10px]" style={{ color: '#b91c1c', opacity: 0.7 }}>+{alzas.length - 5} más</div>
                  )}
                </div>
                <div className="text-[10px] mt-2 opacity-70" style={{ color: '#991b1b' }}>
                  Revisá que los precios sean correctos antes de confirmar. Podés ajustarlos tocando el lápiz en cada producto.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Datos detectados */}
        <div className="p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-3)' }}>
            Datos detectados
          </div>
          <div className="rounded-[12px] p-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            {/* Proveedor con autocomplete */}
            <div className="mb-2" style={{ position: 'relative' }}>
              <div className="text-[10px] font-bold mb-1" style={{ color: 'var(--text-3)' }}>Proveedor</div>
              <input
                value={data.proveedor_nombre}
                onChange={e => { setData(p => ({ ...p, proveedor_nombre: e.target.value })); setProvSearch(e.target.value); setShowProvDD(true) }}
                onFocus={() => setShowProvDD(true)}
                onBlur={() => setTimeout(() => setShowProvDD(false), 150)}
                className="w-full rounded-[8px] px-2 py-[6px] text-[13px] border-none outline-none"
                style={{ background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit' }}
              />
              {showProvDD && provMatches.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,.15)' }}>
                  {provMatches.map(p => (
                    <button key={p.id} onMouseDown={() => { setData(d => ({ ...d, proveedor_nombre: p.nombre, proveedor_cuit: p.cuit || d.proveedor_cuit })); setShowProvDD(false) }}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-1)', borderBottom: '1px solid var(--border)', fontFamily: 'inherit' }}>
                      {p.nombre}{p.cuit ? <span style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 6 }}>{p.cuit}</span> : null}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Field label="CUIT" value={data.proveedor_cuit || ''}
              onChange={v => setData(p => ({ ...p, proveedor_cuit: v || null }))} />
            <Field label="Fecha" value={data.fecha_factura || ''} type="date"
              onChange={v => setData(p => ({ ...p, fecha_factura: v || null }))} />
            <div className="flex gap-3">
              <div className="flex-1">
                <div className="text-[10px] font-bold mb-1" style={{ color: 'var(--text-3)' }}>Tipo</div>
                <select
                  value={data.tipo_factura}
                  onChange={e => setData(p => ({ ...p, tipo_factura: e.target.value as TipoFactura }))}
                  className="w-full rounded-[8px] px-2 py-[6px] text-[13px] border-none outline-none"
                  style={{ background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit' }}
                >
                  {(['A', 'B', 'C', 'X', 'remito', 'ticket'] as TipoFactura[]).map(t => (
                    <option key={t} value={t}>{TIPO_LABELS[t]}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <div className="text-[10px] font-bold mb-1" style={{ color: 'var(--text-3)' }}>Condicion</div>
                <select
                  value={data.condicion_pago}
                  onChange={e => setData(p => ({ ...p, condicion_pago: e.target.value as CondicionPago }))}
                  className="w-full rounded-[8px] px-2 py-[6px] text-[13px] border-none outline-none"
                  style={{ background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit' }}
                >
                  <option value="contado">Contado</option>
                  <option value="30dias">30 dias</option>
                  <option value="60dias">60 dias</option>
                  <option value="cuenta_corriente">Cta. corriente</option>
                </select>
              </div>
            </div>
            {COND_A_CREDITO.has(data.condicion_pago) && (
              <Field label="Fecha de vencimiento" value={data.fecha_vencimiento || ''} type="date"
                onChange={v => setData(p => ({ ...p, fecha_vencimiento: v || null }))} />
            )}
            <div className="flex gap-3">
              <div className="flex-1">
                <div className="text-[10px] font-bold mb-1" style={{ color: 'var(--text-3)' }}>Categoría de gasto</div>
                <select
                  value={data.categoria_gasto_id ?? ''}
                  onChange={e => setData(p => ({ ...p, categoria_gasto_id: e.target.value || null }))}
                  className="w-full rounded-[8px] px-2 py-[6px] text-[13px] border-none outline-none"
                  style={{ background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit' }}
                >
                  <option value="">Sin categorizar</option>
                  {categoriasGasto.filter(c => c.activa).map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <div className="flex-1">
                <div className="text-[10px] font-bold mb-1" style={{ color: 'var(--text-3)' }}>Medio de pago</div>
                <select
                  value={data.medio_pago_id ?? ''}
                  onChange={e => setData(p => ({ ...p, medio_pago_id: e.target.value || null }))}
                  className="w-full rounded-[8px] px-2 py-[6px] text-[13px] border-none outline-none"
                  style={{ background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit' }}
                >
                  <option value="">Sin especificar</option>
                  {mediosPago.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Productos */}
        <div className="px-4 pb-2">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
              Productos ({data.items.length})
            </div>
            <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
              Antes → Ahora
            </div>
          </div>

          {data.items.map((item, idx) => {
            const variacion = item.precio_anterior && item.precio_anterior > 0
              ? ((item.precio_unitario - item.precio_anterior) / item.precio_anterior) * 100
              : null
            const subio = variacion !== null && variacion > 5
            const alerta = variacion !== null && variacion > 15
            const isEditing = editingIdx === idx

            return (
              <div
                key={idx}
                className="rounded-[10px] p-3 mb-2"
                style={{
                  background: item.match_confianza === 'nueva' ? '#eff6ff'
                    : item.match_confianza === 'media' ? '#fffbeb' : 'var(--surface)',
                  border: `1px solid ${item.match_confianza === 'nueva' ? '#bfdbfe'
                    : item.match_confianza === 'media' ? '#fde68a' : 'var(--border)'}`,
                }}
              >
                <div className="flex items-start justify-between mb-1">
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-bold truncate" style={{ color: 'var(--text)' }}>
                      {item.producto_nombre}
                    </div>
                    <div className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                      {item.cantidad} {item.unidad} × {fmt(item.precio_unitario)}/{item.unidad}
                    </div>
                    {(() => {
                      const pBase = calcPrecioBase(item.precio_unitario, item.unidad, item.peso_kg)
                      if (pBase !== null && pBase > 0) return (
                        <div className="text-[10px] font-bold" style={{ color: '#10b981' }}>
                          {fmt(pBase)}/{getBaseUnitLabel(item.unidad)}
                        </div>
                      )
                      if (!isWeightUnit(item.unidad)) return (
                        <div className="text-[10px] font-semibold" style={{ color: '#9ca3af' }}>
                          + kg opcional
                        </div>
                      )
                      return null
                    })()}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    <div className="text-right">
                      <div className="text-[12px] font-bold" style={{ color: 'var(--text)' }}>
                        {fmt(item.subtotal ?? 0)}
                      </div>
                      {item.precio_anterior ? (
                        <div className="text-[10px] font-bold" style={{ color: alerta ? '#ef4444' : subio ? '#f59e0b' : '#10b981' }}>
                          {fmt(item.precio_anterior)} → {fmt(item.precio_unitario)}
                          {variacion !== null && ` ${variacion > 0 ? '+' : ''}${variacion.toFixed(0)}%`}
                        </div>
                      ) : (
                        <div className="text-[10px] font-semibold" style={{ color: '#3b82f6' }}>(nuevo)</div>
                      )}
                    </div>
                    {/* Edit toggle */}
                    <button onClick={() => setEditingIdx(isEditing ? null : idx)}
                      style={{ background: isEditing ? 'var(--navy)' : 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 5px', cursor: 'pointer', display: 'flex' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 14, color: isEditing ? '#fff' : 'var(--text-3)' }}>
                        {isEditing ? 'check' : 'edit'}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Inline edit fields */}
                {isEditing && (
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 6 }}>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>Nombre</span>
                        <input value={item.producto_nombre} onChange={e => updateItem(idx, 'producto_nombre', e.target.value)}
                          style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 7px', fontSize: 12, fontFamily: 'inherit', color: 'var(--text-1)', outline: 'none' }} />
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>Cant.</span>
                        <input type="text" inputMode="decimal"
                          value={rawVal(`${idx}-c`, item.cantidad)}
                          onChange={e => { const raw = e.target.value.replace(',', '.'); setRaw(`${idx}-c`, raw); const c = parseFloat(raw) || 0; updateItem(idx, 'cantidad', c); updateItem(idx, 'subtotal', c * item.precio_unitario) }}
                          onBlur={() => clearRaw(`${idx}-c`)}
                          style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 7px', fontSize: 12, fontFamily: 'inherit', color: 'var(--text-1)', outline: 'none' }} />
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>Precio u.</span>
                        <input type="text" inputMode="decimal"
                          value={rawVal(`${idx}-p`, item.precio_unitario)}
                          onChange={e => { const raw = e.target.value.replace(',', '.'); setRaw(`${idx}-p`, raw); const p = parseFloat(raw) || 0; updateItem(idx, 'precio_unitario', p); updateItem(idx, 'subtotal', item.cantidad * p) }}
                          onBlur={() => clearRaw(`${idx}-p`)}
                          style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 7px', fontSize: 12, fontFamily: 'inherit', color: 'var(--text-1)', outline: 'none' }} />
                      </label>
                    </div>
                    {/* Categoría — solo visible para productos nuevos */}
                    {item.match_confianza === 'nueva' && (
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' }}>Categoría</span>
                        <select
                          value={item.categoria ?? ''}
                          onChange={e => updateItem(idx, 'categoria', e.target.value || null)}
                          style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 7px', fontSize: 12, fontFamily: 'inherit', color: 'var(--text-1)', outline: 'none', width: '100%' }}
                        >
                          <option value="">Auto-detectar</option>
                          {CATEGORIAS_COMUNES.map(c => (
                            <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
                )}

                {/* Smart stock link */}
                {item.match_confianza === 'media' && !isEditing && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                    <span style={{ fontSize: 10, color: '#92400e', flex: 1 }}>
                      ¿Es <b>{productos.find(p => p.id === item.producto_id)?.nombre}</b>?
                    </span>
                    <button onClick={() => vincularProducto(idx, item.producto_id!)}
                      style={{ padding: '3px 10px', borderRadius: 6, border: 'none', background: '#22c55e', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                      Sí
                    </button>
                    <button onClick={() => { setDismissedLinks(s => { const ns = new Set(s); ns.add(idx); return ns }); updateItem(idx, 'producto_id', null); updateItem(idx, 'match_confianza', 'nueva') }}
                      style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-2)', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                      No
                    </button>
                  </div>
                )}
                {item.match_confianza === 'nueva' && !isEditing && !dismissedLinks.has(idx) && (
                  <div style={{ marginTop: 6 }}>
                    <input
                      placeholder="Buscar en stock…"
                      value={stockSearch[idx] || ''}
                      onChange={e => setStockSearch(s => ({ ...s, [idx]: e.target.value }))}
                      style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 8px', fontSize: 11, fontFamily: 'inherit', color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box' as const }}
                    />
                    {(stockSearch[idx] || '').trim() && (
                      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', marginTop: 2 }}>
                        {filteredStock(idx).map(p => (
                          <button key={p.id} onClick={() => { vincularProducto(idx, p.id); setStockSearch(s => ({ ...s, [idx]: '' })) }}
                            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: 12, color: 'var(--text-1)', fontFamily: 'inherit' }}>
                            {p.nombre} <span style={{ fontSize: 10, color: 'var(--text-3)' }}>({p.unidad})</span>
                          </button>
                        ))}
                        {filteredStock(idx).length === 0 && (
                          <div style={{ padding: '8px 10px', fontSize: 11, color: 'var(--text-3)' }}>Sin resultados — se creará como nuevo</div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Equivalencia kg para unidades no métricas */}
                {!isWeightUnit(item.unidad) && !isEditing && (
                  <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, background: '#fffbeb', borderRadius: 8, padding: '6px 10px' }}>
                    <span style={{ fontSize: 11, color: '#92400e', flex: 1 }}>1 {item.unidad} =</span>
                    <input
                      type="text" inputMode="decimal"
                      value={rawVal(`${idx}-kg`, item.peso_kg)}
                      onChange={e => { const raw = e.target.value.replace(',', '.'); setRaw(`${idx}-kg`, raw); updateItem(idx, 'peso_kg', parseFloat(raw) || undefined) }}
                      onBlur={() => clearRaw(`${idx}-kg`)}
                      placeholder="0.000"
                      style={{ width: 70, background: 'white', border: '1px solid #fcd34d', borderRadius: 6, padding: '4px 7px', fontSize: 12, fontFamily: 'inherit', color: '#92400e', outline: 'none' }}
                    />
                    <span style={{ fontSize: 11, color: '#92400e' }}>kg</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Totals */}
        <div className="px-4 pb-4">
          <div className="rounded-[12px] p-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex justify-between text-[12px] mb-1">
              <span style={{ color: 'var(--text-3)' }}>Subtotal</span>
              <span className="font-semibold" style={{ color: 'var(--text)' }}>{fmt(data.subtotal)}</span>
            </div>
            <div className="flex justify-between text-[12px] mb-1">
              <span style={{ color: 'var(--text-3)' }}>IVA</span>
              <span className="font-semibold" style={{ color: 'var(--text)' }}>{fmt(data.iva_total)}</span>
            </div>
            <div className="h-px my-1" style={{ background: 'var(--border)' }} />
            <div className="flex justify-between text-[14px]">
              <span className="font-bold" style={{ color: 'var(--text)' }}>TOTAL</span>
              <span className="font-bold" style={{ color: 'var(--navy)' }}>{fmt(data.total)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Confirm button */}
      {(() => {
        const sinEquivalencia = data.items.some(it => !isWeightUnit(it.unidad) && !(it.peso_kg && it.peso_kg > 0))
        return (
          <div className="flex-shrink-0 p-4" style={{
            borderTop: '1px solid var(--border)',
            background: 'var(--surface)',
            paddingBottom: 'max(env(safe-area-inset-bottom, 16px), 16px)',
          }}>
            {sinEquivalencia && (
              <div style={{ marginBottom: 8, padding: '6px 12px', background: '#fffbeb', borderRadius: 8, fontSize: 11, color: '#92400e', fontWeight: 600 }}>
                💡 Podés ingresar la equivalencia en kg para mejor seguimiento — opcional
              </div>
            )}
            <button
              onClick={() => onConfirm(data)}
              disabled={saving}
              className="w-full py-[14px] rounded-[12px] border-none cursor-pointer text-[15px] font-bold text-white"
              style={{ background: 'var(--navy)', opacity: saving ? 0.6 : 1 }}
            >
              {saving ? 'Guardando...' : 'Confirmar factura'}
            </button>
          </div>
        )
      })()}
    </div>
  )
}

// Editable field helper
function Field({ label, value, onChange, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; type?: string
}) {
  return (
    <div className="mb-2">
      <div className="text-[10px] font-bold mb-1" style={{ color: 'var(--text-3)' }}>{label}</div>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full rounded-[8px] px-2 py-[6px] text-[13px] border-none outline-none"
        style={{ background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit' }}
      />
    </div>
  )
}

// ── Reconciliación factura ↔ pedido ──────────────────────────
function ReconciliacionPedido({ factura, facturaItems, onVincular }: {
  factura: Factura
  facturaItems: FacturaItem[]
  onVincular: (pedidoId: string | null) => Promise<void>
}) {
  const { pedidos, fetchItems: fetchPedidoItems } = usePedidos()
  const [picking, setPicking] = useState(false)
  const [pedidoItems, setPedidoItems] = useState<PedidoItem[]>([])
  const [busy, setBusy] = useState(false)

  const pedidoVinculado = useMemo(
    () => pedidos.find(p => p.id === factura.pedido_id) ?? null,
    [pedidos, factura.pedido_id]
  )

  // Pedidos del mismo proveedor, más recientes primero
  const pedidosProveedor = useMemo(() => {
    const prov = normalizeName(factura.proveedor_nombre)
    return pedidos
      .filter(p => normalizeName(p.proveedor_nombre ?? '') === prov || !prov)
      .slice(0, 12)
  }, [pedidos, factura.proveedor_nombre])

  useEffect(() => {
    if (!factura.pedido_id) { setPedidoItems([]); return }
    let cancel = false
    fetchPedidoItems(factura.pedido_id).then(items => { if (!cancel) setPedidoItems(items) })
    return () => { cancel = true }
  }, [factura.pedido_id, fetchPedidoItems])

  // Comparar items facturados vs pedidos (match por nombre normalizado)
  const comparacion = useMemo(() => {
    if (!factura.pedido_id) return null
    const pedMap = new Map(pedidoItems.map(p => [normalizeName(p.producto_nombre), p]))
    const usados = new Set<string>()
    const filas = facturaItems.map(fi => {
      const key = normalizeName(fi.producto_nombre)
      const pi = pedMap.get(key)
      if (pi) usados.add(key)
      const precioPed = pi?.precio_estimado ?? 0
      const difPrecio = precioPed > 0
        ? ((fi.precio_unitario - precioPed) / precioPed) * 100 : null
      const difCant = pi ? fi.cantidad - pi.cantidad : null
      return { nombre: fi.producto_nombre, pi, fi, difPrecio, difCant }
    })
    const faltantes = pedidoItems.filter(p => !usados.has(normalizeName(p.producto_nombre)))
    return { filas, faltantes }
  }, [factura.pedido_id, pedidoItems, facturaItems])

  async function vincular(pedidoId: string | null) {
    setBusy(true)
    try { await onVincular(pedidoId); setPicking(false) }
    catch { /* error manejado en el padre */ }
    setBusy(false)
  }

  return (
    <div className="mt-4">
      <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-3)' }}>
        Pedido vinculado
      </div>

      {!pedidoVinculado && !picking && (
        <button onClick={() => setPicking(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', justifyContent: 'center', background: 'none', border: '1px dashed var(--border)', borderRadius: 10, padding: '10px 12px', cursor: 'pointer', fontSize: 12, color: 'var(--text-2)', fontFamily: 'inherit' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>link</span>
          Vincular a un pedido
        </button>
      )}

      {picking && (
        <div className="rounded-[10px] p-2" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          {pedidosProveedor.length === 0 ? (
            <div className="text-[12px] p-2" style={{ color: 'var(--text-3)' }}>No hay pedidos de este proveedor.</div>
          ) : pedidosProveedor.map(p => (
            <button key={p.id} disabled={busy} onClick={() => vincular(p.id)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', textAlign: 'left', padding: '8px 10px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'inherit' }}>
              <span className="text-[12px]" style={{ color: 'var(--text-1)' }}>
                {p.proveedor_nombre} · {fmtFecha(p.fecha_pedido ?? null)}
              </span>
              <span className="text-[12px] font-bold" style={{ color: 'var(--navy)' }}>{fmt(p.total_estimado ?? 0)}</span>
            </button>
          ))}
          <button onClick={() => setPicking(false)} className="text-[11px] mt-1" style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontFamily: 'inherit', padding: '6px 4px' }}>
            Cancelar
          </button>
        </div>
      )}

      {pedidoVinculado && (
        <div className="rounded-[12px] p-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="material-symbols-outlined text-[18px]" style={{ color: '#10b981' }}>receipt_long</span>
              <div className="min-w-0">
                <div className="text-[12px] font-bold truncate" style={{ color: 'var(--text-1)' }}>
                  Pedido del {fmtFecha(pedidoVinculado.fecha_pedido ?? null)}
                </div>
                <div className="text-[10px]" style={{ color: 'var(--text-3)' }}>
                  Estimado {fmt(pedidoVinculado.total_estimado ?? 0)} → Facturado {fmt(factura.total)}
                </div>
              </div>
            </div>
            <button onClick={() => vincular(null)} disabled={busy} className="bg-transparent border-none cursor-pointer" title="Desvincular">
              <span className="material-symbols-outlined text-[18px]" style={{ color: 'var(--text-3)' }}>link_off</span>
            </button>
          </div>

          {comparacion && (
            <div className="mt-1">
              {comparacion.filas.map((row, i) => (
                <div key={i} className="flex items-center justify-between py-[6px]" style={{ borderTop: '1px solid var(--border)' }}>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-medium truncate" style={{ color: 'var(--text-1)' }}>{row.nombre}</div>
                    {!row.pi ? (
                      <div className="text-[10px] font-semibold" style={{ color: '#3b82f6' }}>No estaba en el pedido</div>
                    ) : (
                      <div className="text-[10px]" style={{ color: 'var(--text-3)' }}>
                        Pedido: {row.pi.cantidad} {row.pi.unidad ?? ''} × {fmt(row.pi.precio_estimado ?? 0)}
                      </div>
                    )}
                  </div>
                  {row.pi && (
                    <div className="text-right ml-2">
                      {row.difCant !== null && row.difCant !== 0 && (
                        <div className="text-[10px] font-bold" style={{ color: '#f59e0b' }}>
                          {row.difCant > 0 ? '+' : ''}{row.difCant} {row.fi.unidad}
                        </div>
                      )}
                      {row.difPrecio !== null && Math.abs(row.difPrecio) >= 1 && (
                        <div className="text-[10px] font-bold" style={{ color: row.difPrecio > 5 ? '#ef4444' : row.difPrecio < -1 ? '#10b981' : 'var(--text-3)' }}>
                          {row.difPrecio > 0 ? '+' : ''}{row.difPrecio.toFixed(0)}% precio
                        </div>
                      )}
                      {(row.difCant === null || row.difCant === 0) && (row.difPrecio === null || Math.abs(row.difPrecio) < 1) && (
                        <span className="material-symbols-outlined text-[16px]" style={{ color: '#10b981' }}>check</span>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {comparacion.faltantes.length > 0 && (
                <div className="mt-2 rounded-[8px] p-2" style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
                  <div className="text-[10px] font-bold mb-1" style={{ color: '#92400e' }}>
                    Pedido pero no facturado ({comparacion.faltantes.length})
                  </div>
                  {comparacion.faltantes.map(p => (
                    <div key={p.id} className="text-[11px]" style={{ color: '#92400e' }}>
                      {p.producto_nombre} — {p.cantidad} {p.unidad}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Detail View ──────────────────────────────────────────────
function DetailView({ factura, onBack, onStatusChange, onDelete, onUpdate, onVincularPedido, categoriasGasto = [], mediosPago = [] }: {
  factura: Factura
  onBack: () => void
  onStatusChange: (status: FacturaStatus) => void
  onDelete: () => void
  onUpdate?: (data: Partial<Factura>, items?: { producto_nombre: string; producto_id?: string | null; cantidad: number; unidad: string; precio_unitario: number; alicuota_iva: number; subtotal: number; precio_anterior?: number | null }[]) => Promise<void>
  onVincularPedido?: (pedidoId: string | null) => Promise<void>
  categoriasGasto?: CategoriaGasto[]
  mediosPago?: MedioPago[]
}) {
  const { fetchItems } = useFacturas()
  const [items, setItems] = useState<FacturaItem[]>([])
  const [editing, setEditing] = useState(false)
  const [editData, setEditData] = useState<Partial<Factura>>({})
  const [editItems, setEditItems] = useState<FacturaItem[]>([])
  const [savingEdit, setSavingEdit] = useState(false)

  useEffect(() => {
    fetchItems(factura.id).then(setItems)
  }, [factura.id, fetchItems])

  function startEdit() {
    setEditData({
      proveedor_nombre: factura.proveedor_nombre,
      proveedor_cuit: factura.proveedor_cuit || '',
      fecha_factura: factura.fecha_factura,
      tipo_factura: factura.tipo_factura || 'ticket',
      numero_factura: factura.numero_factura || '',
      condicion_pago: factura.condicion_pago || 'contado',
      notas: factura.notas || '',
      categoria_gasto_id: factura.categoria_gasto_id ?? null,
      medio_pago_id: factura.medio_pago_id ?? null,
      fecha_vencimiento: factura.fecha_vencimiento ?? null,
    })
    setEditItems(items.map(it => ({ ...it })))
    setEditing(true)
  }

  // Asignación rápida de categoría sin entrar a "Editar" — cierra el loop de
  // las facturas sin categorizar directamente desde el detalle.
  const [quickCatId, setQuickCatId] = useState('')
  const [quickCatSaving, setQuickCatSaving] = useState(false)
  async function asignarCategoriaRapido() {
    if (!quickCatId || !onUpdate) return
    setQuickCatSaving(true)
    try { await onUpdate({ categoria_gasto_id: quickCatId }) }
    finally { setQuickCatSaving(false) }
  }

  function cancelEdit() {
    setEditing(false)
    setEditData({})
    setEditItems([])
  }

  function updateEditItem(id: string, field: keyof FacturaItem, value: unknown) {
    setEditItems(prev => prev.map(it => {
      if (it.id !== id) return it
      const updated = { ...it, [field]: value }
      if (field === 'cantidad' || field === 'precio_unitario') {
        updated.subtotal = (field === 'cantidad' ? (value as number) : it.cantidad) * (field === 'precio_unitario' ? (value as number) : it.precio_unitario)
      }
      return updated
    }))
  }

  function removeEditItem(id: string) {
    setEditItems(prev => prev.filter(it => it.id !== id))
  }

  function addEditItem() {
    setEditItems(prev => [...prev, {
      id: Math.random().toString(36).slice(2),
      factura_id: factura.id,
      producto_nombre: '',
      cantidad: 1,
      unidad: 'kg',
      precio_unitario: 0,
      alicuota_iva: 0,
      subtotal: 0,
      created_at: new Date().toISOString(),
    }])
  }

  async function saveEdit() {
    if (!onUpdate) return
    setSavingEdit(true)
    try {
      const subtotal = editItems.reduce((s, it) => s + (it.subtotal ?? 0), 0)
      await onUpdate(
        { ...editData, subtotal, total: subtotal + (factura.iva_total ?? 0) },
        editItems.filter(it => it.producto_nombre.trim()).map(it => ({
          producto_nombre: it.producto_nombre,
          producto_id: it.producto_id,
          cantidad: it.cantidad,
          unidad: it.unidad ?? 'kg',
          precio_unitario: it.precio_unitario,
          alicuota_iva: it.alicuota_iva ?? 0,
          subtotal: it.subtotal ?? it.cantidad * it.precio_unitario,
          precio_anterior: it.precio_anterior,
        }))
      )
      const refreshed = await fetchItems(factura.id)
      setItems(refreshed)
      setEditing(false)
    } catch {
      // error handled in parent
    }
    setSavingEdit(false)
  }

  const st = STATUS_CONFIG[factura.status as FacturaStatus] || STATUS_CONFIG.pendiente
  const inStyle = { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 7px', fontSize: 12, fontFamily: 'inherit', color: 'var(--text-1)', outline: 'none', width: '100%' }

  if (editing) {
    return (
      <div className="flex flex-col h-full">
        <div style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 14px', flexShrink: 0 }}>
          <div className="flex items-center gap-3">
            <button onClick={cancelEdit} className="border-none bg-transparent cursor-pointer">
              <span className="material-symbols-outlined text-[22px] text-white">close</span>
            </button>
            <div className="flex-1">
              <h1 className="text-white text-[18px] font-bold m-0">Editar factura</h1>
            </div>
            <button onClick={saveEdit} disabled={savingEdit}
              className="border-none cursor-pointer text-[13px] font-bold text-white px-4 py-[6px] rounded-[8px]"
              style={{ background: savingEdit ? 'rgba(255,255,255,0.3)' : '#10b981' }}>
              {savingEdit ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {/* Header fields */}
          <div className="rounded-[12px] p-3 mb-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="mb-2">
              <div className="text-[10px] font-bold mb-1" style={{ color: 'var(--text-3)' }}>PROVEEDOR</div>
              <input value={editData.proveedor_nombre ?? ''} onChange={e => setEditData(d => ({ ...d, proveedor_nombre: e.target.value }))} style={inStyle} />
            </div>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div>
                <div className="text-[10px] font-bold mb-1" style={{ color: 'var(--text-3)' }}>CUIT</div>
                <input value={editData.proveedor_cuit ?? ''} onChange={e => setEditData(d => ({ ...d, proveedor_cuit: e.target.value || null }))} style={inStyle} />
              </div>
              <div>
                <div className="text-[10px] font-bold mb-1" style={{ color: 'var(--text-3)' }}>N° FACTURA</div>
                <input value={editData.numero_factura ?? ''} onChange={e => setEditData(d => ({ ...d, numero_factura: e.target.value || null }))} style={inStyle} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div>
                <div className="text-[10px] font-bold mb-1" style={{ color: 'var(--text-3)' }}>FECHA</div>
                <input type="date" value={editData.fecha_factura ?? ''} onChange={e => setEditData(d => ({ ...d, fecha_factura: e.target.value }))} style={inStyle} />
              </div>
              <div>
                <div className="text-[10px] font-bold mb-1" style={{ color: 'var(--text-3)' }}>TIPO</div>
                <select value={editData.tipo_factura ?? 'ticket'} onChange={e => setEditData(d => ({ ...d, tipo_factura: e.target.value as TipoFactura }))} style={inStyle}>
                  {(['A', 'B', 'C', 'X', 'remito', 'ticket'] as TipoFactura[]).map(t => <option key={t} value={t}>{TIPO_LABELS[t]}</option>)}
                </select>
              </div>
            </div>
            <div className="mb-2">
              <div className="text-[10px] font-bold mb-1" style={{ color: 'var(--text-3)' }}>CONDICIÓN DE PAGO</div>
              <select value={editData.condicion_pago ?? 'contado'} onChange={e => setEditData(d => ({ ...d, condicion_pago: e.target.value as CondicionPago }))} style={inStyle}>
                <option value="contado">Contado</option>
                <option value="30dias">30 días</option>
                <option value="60dias">60 días</option>
                <option value="cuenta_corriente">Cuenta corriente</option>
              </select>
            </div>
            {COND_A_CREDITO.has(String(editData.condicion_pago ?? '')) && (
              <div className="mb-2">
                <div className="text-[10px] font-bold mb-1" style={{ color: 'var(--text-3)' }}>FECHA DE VENCIMIENTO</div>
                <input type="date" value={editData.fecha_vencimiento ?? ''} onChange={e => setEditData(d => ({ ...d, fecha_vencimiento: e.target.value || null }))} style={inStyle} />
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div>
                <div className="text-[10px] font-bold mb-1" style={{ color: 'var(--text-3)' }}>CATEGORÍA DE GASTO</div>
                <select value={editData.categoria_gasto_id ?? ''} onChange={e => setEditData(d => ({ ...d, categoria_gasto_id: e.target.value || null }))} style={inStyle}>
                  <option value="">Sin categorizar</option>
                  {categoriasGasto.filter(c => c.activa).map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <div>
                <div className="text-[10px] font-bold mb-1" style={{ color: 'var(--text-3)' }}>MEDIO DE PAGO</div>
                <select value={editData.medio_pago_id ?? ''} onChange={e => setEditData(d => ({ ...d, medio_pago_id: e.target.value || null }))} style={inStyle}>
                  <option value="">Sin especificar</option>
                  {mediosPago.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Items */}
          <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-3)' }}>
            Productos
          </div>
          {editItems.map(it => (
            <div key={it.id} className="rounded-[10px] p-3 mb-2" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2 mb-2">
                <input value={it.producto_nombre} onChange={e => updateEditItem(it.id, 'producto_nombre', e.target.value)}
                  placeholder="Nombre del producto" style={{ ...inStyle, flex: 1 }} />
                <button onClick={() => removeEditItem(it.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-3)' }}>close</span>
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '60px 80px 1fr 1fr', gap: 6 }}>
                <div>
                  <div className="text-[9px] font-bold mb-1" style={{ color: 'var(--text-3)' }}>CANT.</div>
                  <input type="text" inputMode="decimal" value={it.cantidad}
                    onChange={e => updateEditItem(it.id, 'cantidad', parseFloat(e.target.value.replace(',', '.')) || 0)}
                    style={inStyle} />
                </div>
                <div>
                  <div className="text-[9px] font-bold mb-1" style={{ color: 'var(--text-3)' }}>UNIDAD</div>
                  <select value={it.unidad ?? 'kg'} onChange={e => updateEditItem(it.id, 'unidad', e.target.value)} style={inStyle}>
                    {UNIDADES_COMUNES.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <div className="text-[9px] font-bold mb-1" style={{ color: 'var(--text-3)' }}>PRECIO UNIT.</div>
                  <input type="text" inputMode="decimal" value={it.precio_unitario}
                    onChange={e => updateEditItem(it.id, 'precio_unitario', parseFloat(e.target.value.replace(',', '.')) || 0)}
                    style={inStyle} />
                </div>
                <div>
                  <div className="text-[9px] font-bold mb-1" style={{ color: 'var(--text-3)' }}>SUBTOTAL</div>
                  <div style={{ ...inStyle, display: 'flex', alignItems: 'center', height: 29, color: 'var(--text-2)' }}>
                    {fmt(it.subtotal ?? 0)}
                  </div>
                </div>
              </div>
            </div>
          ))}
          <button onClick={addEditItem}
            style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: '1px dashed var(--border)', borderRadius: 10, padding: '8px 12px', cursor: 'pointer', fontSize: 12, color: 'var(--text-3)', fontFamily: 'inherit', width: '100%', justifyContent: 'center', marginBottom: 16 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span>
            Agregar producto
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 14px', flexShrink: 0 }}>
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="border-none bg-transparent cursor-pointer">
            <span className="material-symbols-outlined text-[22px] text-white">arrow_back</span>
          </button>
          <div className="flex-1">
            <h1 className="text-white text-[18px] font-bold m-0">{factura.proveedor_nombre}</h1>
            <p className="text-white/60 text-[11px] m-0 mt-[2px]">
              {fmtFecha(factura.fecha_factura)} · {TIPO_LABELS[factura.tipo_factura as TipoFactura] || factura.tipo_factura}
            </p>
          </div>
          <span className="text-[10px] font-bold px-[8px] py-[3px] rounded-[6px]"
            style={{ background: st.bg, color: st.color }}>{st.label}</span>
          {onUpdate && (
            <button onClick={startEdit} className="border-none bg-transparent cursor-pointer ml-1">
              <span className="material-symbols-outlined text-[20px] text-white/80">edit</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {/* Info card */}
        <div className="rounded-[12px] p-3 mb-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="grid grid-cols-2 gap-2 text-[12px]">
            <div><span style={{ color: 'var(--text-3)' }}>CUIT:</span> <span className="font-medium" style={{ color: 'var(--text)' }}>{factura.proveedor_cuit || '—'}</span></div>
            <div><span style={{ color: 'var(--text-3)' }}>N:</span> <span className="font-medium" style={{ color: 'var(--text)' }}>{factura.numero_factura || '—'}</span></div>
            <div><span style={{ color: 'var(--text-3)' }}>Pago:</span> <span className="font-medium" style={{ color: 'var(--text)' }}>{factura.condicion_pago}</span></div>
            <div><span style={{ color: 'var(--text-3)' }}>Total:</span> <span className="font-bold" style={{ color: 'var(--navy)' }}>{fmt(factura.total)}</span></div>
            {factura.fecha_vencimiento && (
              <div><span style={{ color: 'var(--text-3)' }}>Vence:</span> <span className="font-medium" style={{ color: 'var(--text)' }}>{fmtFecha(factura.fecha_vencimiento)}</span></div>
            )}
          </div>
        </div>

        {/* Categoría de gasto */}
        <div className="rounded-[12px] p-3 mb-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="text-[10px] font-bold mb-2" style={{ color: 'var(--text-3)' }}>CATEGORÍA DE GASTO</div>
          {(() => {
            const cat = factura.categoria_gasto_id ? categoriasGasto.find(c => c.id === factura.categoria_gasto_id) : null
            if (cat) {
              return (
                <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 99, background: `${FINANCIERA_COLOR[cat.categoria_financiera]}18`, color: FINANCIERA_COLOR[cat.categoria_financiera] }}>
                  {cat.nombre}
                </span>
              )
            }
            if (!onUpdate) return <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Sin categorizar</span>
            return (
              <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                <select value={quickCatId} onChange={e => setQuickCatId(e.target.value)}
                  style={{ ...inStyle, flex: 1, minWidth: 140, padding: '7px 9px' }}>
                  <option value="">Elegir categoría…</option>
                  {categoriasGasto.filter(c => c.activa).map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
                <button onClick={asignarCategoriaRapido} disabled={!quickCatId || quickCatSaving}
                  style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: quickCatId ? 'var(--navy)' : 'var(--border)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: quickCatId ? 'pointer' : 'default', fontFamily: 'inherit', opacity: quickCatSaving ? .6 : 1 }}>
                  {quickCatSaving ? '…' : 'Asignar'}
                </button>
              </div>
            )
          })()}
        </div>

        {/* Items */}
        <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-3)' }}>
          Productos ({items.length})
        </div>
        {items.map(item => {
          const variacion = item.precio_anterior && item.precio_anterior > 0
            ? ((item.precio_unitario - item.precio_anterior) / item.precio_anterior) * 100
            : null
          return (
            <div key={item.id} className="flex justify-between items-center py-[8px]"
              style={{ borderBottom: '1px solid var(--border)' }}>
              <div>
                <div className="text-[13px] font-medium" style={{ color: 'var(--text)' }}>{item.producto_nombre}</div>
                <div className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                  {item.cantidad} {item.unidad} x {fmt(item.precio_unitario)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>{fmt(item.subtotal ?? 0)}</div>
                {variacion !== null && (
                  <div className="text-[10px] font-bold" style={{
                    color: variacion > 15 ? '#ef4444' : variacion > 5 ? '#f59e0b' : '#10b981',
                  }}>
                    {variacion > 0 ? '+' : ''}{variacion.toFixed(0)}%
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {/* Reconciliación con pedido */}
        {onVincularPedido && (
          <ReconciliacionPedido factura={factura} facturaItems={items} onVincular={onVincularPedido} />
        )}

        {/* Notas */}
        {factura.notas && (
          <div className="mt-3 rounded-[10px] p-3" style={{ background: 'var(--bg)' }}>
            <div className="text-[10px] font-bold mb-1" style={{ color: 'var(--text-3)' }}>NOTAS</div>
            <div className="text-[12px]" style={{ color: 'var(--text)' }}>{factura.notas}</div>
          </div>
        )}

        {/* Cuenta por pagar — marcar pagada */}
        {COND_A_CREDITO.has(String(factura.condicion_pago ?? '')) && (
          <div className="mt-4 rounded-[12px] p-3 flex items-center gap-3" style={{
            background: factura.status === 'pagada' ? '#eff6ff' : '#fffbeb',
            border: `1px solid ${factura.status === 'pagada' ? '#bfdbfe' : '#fde68a'}`,
          }}>
            <span className="material-symbols-outlined text-[20px]" style={{ color: factura.status === 'pagada' ? '#1e40af' : '#92400e' }}>
              {factura.status === 'pagada' ? 'check_circle' : 'schedule'}
            </span>
            <div className="flex-1">
              <div className="text-[12px] font-bold" style={{ color: factura.status === 'pagada' ? '#1e40af' : '#92400e' }}>
                {factura.status === 'pagada' ? 'Pagada' : `Por pagar — ${fmt(factura.total)}`}
              </div>
              <div className="text-[10px]" style={{ color: factura.status === 'pagada' ? '#1e40af' : '#92400e', opacity: 0.7 }}>
                {factura.condicion_pago === 'cuenta_corriente' ? 'Cuenta corriente' : factura.condicion_pago}
              </div>
            </div>
            <button onClick={() => onStatusChange(factura.status === 'pagada' ? 'confirmada' : 'pagada')}
              className="py-[8px] px-3 rounded-[8px] border-none cursor-pointer text-[12px] font-bold"
              style={factura.status === 'pagada'
                ? { background: 'var(--bg)', color: 'var(--text-2)', border: '1px solid var(--border)' }
                : { background: '#1e40af', color: '#fff' }}>
              {factura.status === 'pagada' ? 'Marcar pendiente' : 'Marcar pagada'}
            </button>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 mt-4">
          {factura.status !== 'confirmada' && factura.status !== 'pagada' && (
            <button onClick={() => onStatusChange('confirmada')}
              className="flex-1 py-[10px] rounded-[10px] border-none cursor-pointer text-[12px] font-bold text-white"
              style={{ background: '#10b981' }}>
              Confirmar
            </button>
          )}
          {factura.status !== 'observada' && (
            <button onClick={() => onStatusChange('observada')}
              className="flex-1 py-[10px] rounded-[10px] border-none cursor-pointer text-[12px] font-bold"
              style={{ background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca' }}>
              Observar
            </button>
          )}
          <button onClick={onDelete}
            className="py-[10px] px-4 rounded-[10px] border-none cursor-pointer text-[12px] font-bold"
            style={{ background: 'var(--bg)', color: 'var(--text-3)' }}>
            <span className="material-symbols-outlined text-[16px]">delete</span>
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Listas de Precios View ──────────────────────────────────
function ListasPreciosView({ showToast: toast }: { showToast: (msg: string) => void }) {
  const { productos, actualizarProducto, agregarProducto } = useStock()
  const { proveedores, agregarProveedor } = useProveedores()
  const [listaView, setListaView] = useState<ListaView>('empty')
  const [listaImportMode, setListaImportMode] = useState<ListaImportMode>(null)
  const [listaResult, setListaResult] = useState<ListaAIResult | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [textoInput, setTextoInput] = useState('')
  const [urlInput, setUrlInput] = useState('')
  const [selectedProveedor, setSelectedProveedor] = useState<string | null>(null)
  const [proveedorSearch, setProveedorSearch] = useState('')
  const [nuevoProveedorNombre, setNuevoProveedorNombre] = useState('')
  const [checkedItems, setCheckedItems] = useState<Set<number>>(new Set())
  const [showProveedorDropdown, setShowProveedorDropdown] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const imageRef = useRef<HTMLInputElement>(null)
  const pdfRef = useRef<HTMLInputElement>(null)

  // Match items against stock
  const matchedItems = useMemo(() => {
    if (!listaResult) return []
    return listaResult.items.map(item => {
      const normalizedName = normalizeName(item.producto_nombre)
      const match = productos.find(p =>
        normalizeName(p.nombre) === normalizedName ||
        normalizeName(p.nombre).includes(normalizedName) ||
        normalizedName.includes(normalizeName(p.nombre))
      )
      if (match) {
        const priceDiff = match.precio_unitario > 0
          ? ((item.precio_unitario - match.precio_unitario) / match.precio_unitario) * 100
          : null
        return {
          ...item,
          matchedProduct: match,
          status: priceDiff !== null && Math.abs(priceDiff) < 1 ? 'sin_cambio' as const
            : 'actualiza' as const,
          priceDiff,
        }
      }
      return { ...item, matchedProduct: null, status: 'nuevo' as const, priceDiff: null }
    })
  }, [listaResult, productos])

  // Init checked items when result changes
  useEffect(() => {
    if (listaResult) {
      setCheckedItems(new Set(listaResult.items.map((_, i) => i)))
    }
  }, [listaResult])

  const filteredProveedores = useMemo(() => {
    if (!proveedorSearch.trim()) return proveedores
    const q = proveedorSearch.toLowerCase()
    return proveedores.filter(p => p.nombre.toLowerCase().includes(q))
  }, [proveedores, proveedorSearch])

  const selectedProveedorObj = proveedores.find(p => p.id === selectedProveedor)
  const checkedCount = checkedItems.size

  async function handleListaFile(file: File, mode: 'image' | 'pdf' | 'excel') {
    setAnalyzing(true)
    setListaView('confirm')
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('mode', mode)
      const res = await fetch('/api/listas-precios', { method: 'POST', body: fd })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setListaResult(data)
    } catch {
      toast('Error al analizar archivo')
      setListaView('import')
    }
    setAnalyzing(false)
  }

  async function handleListaText() {
    if (!textoInput.trim()) return
    setAnalyzing(true)
    setListaView('confirm')
    try {
      const fd = new FormData()
      fd.append('text', textoInput)
      fd.append('mode', 'text')
      const res = await fetch('/api/listas-precios', { method: 'POST', body: fd })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setListaResult(data)
    } catch {
      toast('Error al analizar texto')
      setListaView('import')
    }
    setAnalyzing(false)
  }

  async function handleListaUrl() {
    if (!urlInput.trim()) return
    setAnalyzing(true)
    setListaView('confirm')
    try {
      const fd = new FormData()
      fd.append('url', urlInput)
      fd.append('mode', 'url')
      const res = await fetch('/api/listas-precios', { method: 'POST', body: fd })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setListaResult(data)
    } catch {
      toast('No se pudo acceder al documento. Verifica los permisos de compartir.')
      setListaView('import')
    }
    setAnalyzing(false)
  }

  async function handleConfirmImport() {
    if (!selectedProveedor && !nuevoProveedorNombre.trim()) {
      toast('Selecciona o crea un proveedor')
      return
    }
    setSaving(true)
    try {
      let provId = selectedProveedor

      // Create new provider if needed
      if (!provId && nuevoProveedorNombre.trim()) {
        await agregarProveedor({
          nombre: nuevoProveedorNombre.trim(),
          rubro: '',
          telefono: '',
          dias_entrega: [],
          created_at: new Date().toISOString(),
        })
        // Find the newly created provider
        // Small delay to let realtime update
        await new Promise(r => setTimeout(r, 500))
      }

      let preciosActualizados = 0
      let productosCreados = 0

      for (const [idx, matched] of matchedItems.entries()) {
        if (!checkedItems.has(idx)) continue

        if (matched.matchedProduct) {
          // Update existing product price
          await actualizarProducto(matched.matchedProduct.id, {
            precio_unitario: matched.precio_unitario,
          })
          preciosActualizados++
        } else {
          // Create new product
          await agregarProducto({
            nombre: matched.producto_nombre,
            unidad: matched.unidad,
            precio_unitario: matched.precio_unitario,
            stock_actual: 0,
            stock_minimo: 0,
            stock_critico: 0,
            categoria: 'otros' as never,
            proveedor_id: provId || null,
            activo: true,
          })
          productosCreados++
        }
      }

      const parts = []
      if (preciosActualizados > 0) parts.push(`${preciosActualizados} precios actualizados`)
      if (productosCreados > 0) parts.push(`${productosCreados} productos creados`)
      toast(`\u2713 Lista importada${parts.length > 0 ? ' — ' + parts.join(', ') : ''}`)

      // Reset
      setListaView('empty')
      setListaResult(null)
      setSelectedProveedor(null)
      setProveedorSearch('')
      setNuevoProveedorNombre('')
      setTextoInput('')
      setUrlInput('')
    } catch {
      toast('Error al importar lista')
    }
    setSaving(false)
  }

  // ── Confirm view ──
  if (listaView === 'confirm') {
    if (analyzing) {
      return (
        <div className="flex flex-col h-full">
          <div style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 14px', flexShrink: 0 }}>
            <div className="flex items-center gap-3">
              <button onClick={() => setListaView('import')} className="border-none bg-transparent cursor-pointer">
                <span className="material-symbols-outlined text-[22px] text-white">arrow_back</span>
              </button>
              <h1 className="text-white text-[18px] font-bold m-0">Analizando...</h1>
            </div>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <div className="w-12 h-12 rounded-full border-[3px] border-t-transparent animate-spin"
              style={{ borderColor: 'var(--navy)', borderTopColor: 'transparent' }} />
            <p className="text-[14px] font-semibold" style={{ color: 'var(--text-2)' }}>
              Analizando lista de precios con IA...
            </p>
            <p className="text-[12px]" style={{ color: 'var(--text-3)' }}>
              Extrayendo productos y precios
            </p>
          </div>
        </div>
      )
    }

    if (listaResult) {
      return (
        <div className="flex flex-col h-full">
          <div style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 14px', flexShrink: 0 }}>
            <div className="flex items-center gap-3">
              <button onClick={() => { setListaView('import'); setListaResult(null) }} className="border-none bg-transparent cursor-pointer">
                <span className="material-symbols-outlined text-[22px] text-white">arrow_back</span>
              </button>
              <div>
                <h1 className="text-white text-[18px] font-bold m-0">Confirmar lista</h1>
                <p className="text-white/60 text-[11px] m-0 mt-[2px]">
                  {listaResult._demo && 'DEMO — '}Encontre {listaResult.items.length} productos
                </p>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* Provider selector */}
            <div className="p-4 pb-2">
              <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-3)' }}>
                De que proveedor es esta lista?
              </div>
              <div className="relative">
                <input
                  type="text"
                  value={selectedProveedorObj ? selectedProveedorObj.nombre : proveedorSearch}
                  onChange={e => {
                    setProveedorSearch(e.target.value)
                    setSelectedProveedor(null)
                    setNuevoProveedorNombre('')
                    setShowProveedorDropdown(true)
                  }}
                  onFocus={() => setShowProveedorDropdown(true)}
                  placeholder="Buscar proveedor..."
                  className="w-full rounded-[10px] px-3 py-[10px] text-[13px] border-none outline-none"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'inherit' }}
                />
                {selectedProveedorObj && (
                  <button
                    onClick={() => { setSelectedProveedor(null); setProveedorSearch(''); setShowProveedorDropdown(true) }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 border-none bg-transparent cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[18px]" style={{ color: 'var(--text-3)' }}>close</span>
                  </button>
                )}
                {showProveedorDropdown && !selectedProveedorObj && (
                  <div className="absolute left-0 right-0 top-full mt-1 rounded-[10px] max-h-[200px] overflow-y-auto z-[200]"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                    {filteredProveedores.map(p => (
                      <button
                        key={p.id}
                        onClick={() => {
                          setSelectedProveedor(p.id)
                          setProveedorSearch('')
                          setNuevoProveedorNombre('')
                          setShowProveedorDropdown(false)
                        }}
                        className="w-full text-left px-3 py-[8px] border-none cursor-pointer text-[13px]"
                        style={{ background: 'transparent', color: 'var(--text)', fontFamily: 'inherit', borderBottom: '1px solid var(--border)' }}
                      >
                        {p.nombre}
                      </button>
                    ))}
                    {proveedorSearch.trim() && (
                      <button
                        onClick={() => {
                          setNuevoProveedorNombre(proveedorSearch.trim())
                          setSelectedProveedor(null)
                          setShowProveedorDropdown(false)
                        }}
                        className="w-full text-left px-3 py-[8px] border-none cursor-pointer text-[13px] font-semibold"
                        style={{ background: 'transparent', color: 'var(--navy)', fontFamily: 'inherit' }}
                      >
                        <span className="material-symbols-outlined text-[16px] align-middle mr-1">add</span>
                        Crear &quot;{proveedorSearch.trim()}&quot;
                      </button>
                    )}
                    {filteredProveedores.length === 0 && !proveedorSearch.trim() && (
                      <div className="px-3 py-[8px] text-[12px]" style={{ color: 'var(--text-3)' }}>
                        Sin proveedores. Escribe para crear uno.
                      </div>
                    )}
                  </div>
                )}
              </div>
              {nuevoProveedorNombre && (
                <div className="mt-2 px-3 py-[6px] rounded-[8px] text-[12px] font-semibold"
                  style={{ background: '#dcfce7', color: '#166534' }}>
                  Se creará: &quot;{nuevoProveedorNombre}&quot;
                </div>
              )}
            </div>

            {/* Summary */}
            {(selectedProveedorObj || nuevoProveedorNombre) && (
              <div className="px-4 pb-2">
                <div className="rounded-[10px] p-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>
                    Encontre {listaResult.items.length} productos de{' '}
                    <span style={{ color: 'var(--navy)' }}>{selectedProveedorObj?.nombre || nuevoProveedorNombre}</span>
                  </div>
                  {listaResult.fecha_detectada && (
                    <div className="text-[11px] mt-1" style={{ color: 'var(--text-3)' }}>
                      Fecha detectada: {fmtFecha(listaResult.fecha_detectada)}
                    </div>
                  )}
                  {listaResult.notas && (
                    <div className="text-[11px] mt-1" style={{ color: 'var(--text-3)' }}>
                      {listaResult.notas}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Select all / Deselect all */}
            <div className="px-4 pb-2 flex gap-2">
              <button
                onClick={() => setCheckedItems(new Set(listaResult.items.map((_, i) => i)))}
                className="px-3 py-[5px] rounded-[8px] border-none cursor-pointer text-[11px] font-semibold"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'inherit' }}
              >
                Seleccionar todos
              </button>
              <button
                onClick={() => setCheckedItems(new Set())}
                className="px-3 py-[5px] rounded-[8px] border-none cursor-pointer text-[11px] font-semibold"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-3)', fontFamily: 'inherit' }}
              >
                Deseleccionar todos
              </button>
            </div>

            {/* Product list */}
            <div className="px-4 pb-4">
              {matchedItems.map((item, idx) => {
                const checked = checkedItems.has(idx)
                const statusBadge = item.status === 'actualiza'
                  ? { bg: '#dbeafe', color: '#1e40af', label: `ya existe → actualiza${item.priceDiff !== null ? ` (${item.priceDiff > 0 ? '+' : ''}${item.priceDiff.toFixed(0)}%)` : ''}` }
                  : item.status === 'nuevo'
                  ? { bg: '#dcfce7', color: '#166534', label: 'nuevo → se crea' }
                  : { bg: '#f3f4f6', color: '#6b7280', label: 'sin cambio' }

                return (
                  <div
                    key={idx}
                    className="rounded-[10px] p-3 mb-2 flex items-start gap-3"
                    style={{
                      background: 'var(--surface)',
                      border: `1px solid ${checked ? 'var(--navy)' : 'var(--border)'}`,
                      opacity: checked ? 1 : 0.5,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setCheckedItems(prev => {
                          const next = new Set(prev)
                          if (next.has(idx)) next.delete(idx)
                          else next.add(idx)
                          return next
                        })
                      }}
                      className="mt-[2px] flex-shrink-0"
                      style={{ accentColor: 'var(--navy)' }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-bold truncate" style={{ color: 'var(--text)' }}>
                            {item.producto_nombre}
                          </div>
                          <div className="text-[12px] font-semibold mt-[2px]" style={{ color: 'var(--navy)' }}>
                            {fmt(item.precio_unitario)}/{item.unidad}
                          </div>
                          {item.observaciones && (
                            <div className="text-[10px] mt-[2px]" style={{ color: 'var(--text-3)' }}>
                              {item.observaciones}
                            </div>
                          )}
                        </div>
                        <span
                          className="text-[9px] font-bold px-[6px] py-[2px] rounded-[4px] flex-shrink-0 ml-2 whitespace-nowrap"
                          style={{ background: statusBadge.bg, color: statusBadge.color }}
                        >
                          {statusBadge.label}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Confirm button */}
          <div className="flex-shrink-0 p-4" style={{
            borderTop: '1px solid var(--border)',
            background: 'var(--surface)',
            paddingBottom: 'max(env(safe-area-inset-bottom, 16px), 16px)',
          }}>
            <button
              onClick={handleConfirmImport}
              disabled={saving || checkedCount === 0 || (!selectedProveedor && !nuevoProveedorNombre.trim())}
              className="w-full py-[14px] rounded-[12px] border-none cursor-pointer text-[15px] font-bold text-white"
              style={{
                background: 'var(--navy)',
                opacity: (saving || checkedCount === 0 || (!selectedProveedor && !nuevoProveedorNombre.trim())) ? 0.5 : 1,
              }}
            >
              {saving ? 'Importando...' : `Importar ${checkedCount} productos`}
            </button>
          </div>
        </div>
      )
    }
  }

  // ── Import view ──
  if (listaView === 'import') {
    return (
      <div className="flex flex-col h-full">
        <div style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 14px', flexShrink: 0 }}>
          <div className="flex items-center gap-3">
            <button onClick={() => { setListaView('empty'); setListaImportMode(null); setTextoInput(''); setUrlInput('') }}
              className="border-none bg-transparent cursor-pointer">
              <span className="material-symbols-outlined text-[22px] text-white">arrow_back</span>
            </button>
            <h1 className="text-white text-[18px] font-bold m-0">Cargar lista de precios</h1>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {listaImportMode === 'text' ? (
            <div className="p-4">
              <p className="text-[12px] mb-3" style={{ color: 'var(--text-3)' }}>
                Pega el texto de la lista de precios (WhatsApp, email, etc.)
              </p>
              <textarea
                value={textoInput}
                onChange={e => setTextoInput(e.target.value)}
                placeholder="Pegar lista de precios aqui..."
                rows={10}
                className="w-full rounded-[12px] p-3 text-[13px] border-none outline-none resize-none"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'inherit' }}
                autoFocus
              />
              <button
                onClick={handleListaText}
                disabled={!textoInput.trim()}
                className="w-full mt-3 py-[14px] rounded-[12px] border-none cursor-pointer text-[15px] font-bold text-white"
                style={{ background: 'var(--navy)', opacity: textoInput.trim() ? 1 : 0.5 }}
              >
                Analizar con IA
              </button>
            </div>
          ) : listaImportMode === 'url' ? (
            <div className="p-4">
              <p className="text-[12px] mb-3" style={{ color: 'var(--text-3)' }}>
                Pega el link de Google Sheets (debe estar compartido como publico)
              </p>
              <input
                type="url"
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/..."
                className="w-full rounded-[12px] px-3 py-[10px] text-[13px] border-none outline-none"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'inherit' }}
                autoFocus
              />
              <button
                onClick={handleListaUrl}
                disabled={!urlInput.trim()}
                className="w-full mt-3 py-[14px] rounded-[12px] border-none cursor-pointer text-[15px] font-bold text-white"
                style={{ background: 'var(--navy)', opacity: urlInput.trim() ? 1 : 0.5 }}
              >
                Importar desde Google Sheets
              </button>
            </div>
          ) : (
            <div className="p-4">
              <h2 className="text-[16px] font-bold mb-1" style={{ color: 'var(--text)' }}>Cargar lista de precios</h2>
              <p className="text-[12px] mb-4" style={{ color: 'var(--text-3)' }}>
                La IA extrae productos y precios automaticamente
              </p>
              <div className="grid grid-cols-2 gap-3">
                {([
                  { mode: 'excel' as ListaImportMode, icon: 'table_view', label: 'Subir archivo', desc: 'Excel, CSV' },
                  { mode: 'image' as ListaImportMode, icon: 'image', label: 'Subir imagen/foto', desc: 'Foto de lista impresa' },
                  { mode: 'pdf' as ListaImportMode, icon: 'picture_as_pdf', label: 'Subir PDF', desc: 'Lista en PDF' },
                  { mode: 'text' as ListaImportMode, icon: 'text_snippet', label: 'Pegar texto', desc: 'WhatsApp, email, etc.' },
                  { mode: 'url' as ListaImportMode, icon: 'link', label: 'Google Sheets', desc: 'Link a planilla' },
                ]).map(o => (
                  <button
                    key={o.mode}
                    onClick={() => {
                      setListaImportMode(o.mode)
                      if (o.mode === 'excel') fileRef.current?.click()
                      else if (o.mode === 'image') imageRef.current?.click()
                      else if (o.mode === 'pdf') pdfRef.current?.click()
                    }}
                    className="flex flex-col items-center gap-2 p-4 rounded-[14px] border-none cursor-pointer"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                  >
                    <span className="material-symbols-outlined text-[28px]" style={{ color: 'var(--navy)' }}>
                      {o.icon}
                    </span>
                    <span className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>{o.label}</span>
                    <span className="text-[10px] text-center" style={{ color: 'var(--text-3)' }}>{o.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Hidden file inputs */}
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.tsv" className="hidden"
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) handleListaFile(f, 'excel')
          }} />
        <input ref={imageRef} type="file" accept="image/*" className="hidden"
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) handleListaFile(f, 'image')
          }} />
        <input ref={pdfRef} type="file" accept=".pdf" className="hidden"
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) handleListaFile(f, 'pdf')
          }} />
      </div>
    )
  }

  // ── Empty state ──
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex flex-col items-center justify-center h-40 gap-2">
          <span className="material-symbols-outlined text-[40px]" style={{ color: 'var(--text-3)' }}>
            list_alt
          </span>
          <p className="text-[13px] font-medium" style={{ color: 'var(--text-3)' }}>Sin listas de precios</p>
          <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>
            Carga una lista de precios de tus proveedores
          </p>
        </div>
      </div>

      <div className="flex-shrink-0 p-4" style={{
        paddingBottom: 'max(env(safe-area-inset-bottom, 16px), 16px)',
      }}>
        <button
          onClick={() => { setListaView('import'); setListaImportMode(null) }}
          className="w-full py-[14px] rounded-[14px] border-none cursor-pointer text-[15px] font-bold text-white flex items-center justify-center gap-2"
          style={{ background: 'var(--navy)' }}
        >
          <span className="material-symbols-outlined text-[20px]">add</span>
          Cargar lista de precios
        </button>
      </div>
    </div>
  )
}

// ── Manual Entry View ────────────────────────────────────────
interface ManualRow {
  id: string
  producto_nombre: string
  cantidad: number
  unidad: string
  categoria: string
  precio_unitario: number
  peso_kg?: number
}

function emptyRow(): ManualRow {
  return { id: Math.random().toString(36).slice(2), producto_nombre: '', cantidad: 1, unidad: 'kg', categoria: 'otros', precio_unitario: 0 }
}

function ManualEntryView({ onSubmit, onBack, proveedores }: {
  onSubmit: (result: AIResult) => void
  onBack: () => void
  proveedores: { id: string; nombre: string }[]
}) {
  const [proveedorNombre, setProveedorNombre] = useState('')
  const [showProvDD, setShowProvDD] = useState(false)
  const [fechaFactura, setFechaFactura] = useState(hoy())
  const [rows, setRows] = useState<ManualRow[]>([emptyRow()])
  const [rawInputs, setRawInputs] = useState<Record<string, string>>({})

  const provMatches = useMemo(() => {
    const q = proveedorNombre.toLowerCase().trim()
    if (!q) return []
    return proveedores.filter(p => p.nombre.toLowerCase().includes(q)).slice(0, 6)
  }, [proveedorNombre, proveedores])

  function setRaw(key: string, val: string) { setRawInputs(p => ({ ...p, [key]: val })) }
  function clearRaw(key: string) { setRawInputs(p => { const n = { ...p }; delete n[key]; return n }) }
  function rawVal(key: string, num: number | undefined | null): string {
    if (key in rawInputs) return rawInputs[key]
    if (num == null || num === 0) return ''
    return String(num)
  }

  function addRow() { setRows(r => [...r, emptyRow()]) }
  function removeRow(id: string) { setRows(r => r.filter(x => x.id !== id)) }
  function updateRow(id: string, field: keyof ManualRow, value: unknown) {
    setRows(r => r.map(x => x.id === id ? { ...x, [field]: value } : x))
  }

  function handleSubmit() {
    const valid = rows.filter(r => r.producto_nombre.trim() && r.cantidad > 0)
    if (!valid.length) return
    const total = valid.reduce((s, r) => s + r.precio_unitario * r.cantidad, 0)
    const result: AIResult = {
      proveedor_nombre: proveedorNombre.trim() || 'Sin proveedor',
      proveedor_cuit: null,
      fecha_factura: fechaFactura,
      tipo_factura: 'ticket',
      numero_factura: null,
      condicion_pago: 'contado',
      items: valid.map(r => ({
        producto_nombre: r.producto_nombre.trim(),
        producto_id: null,
        cantidad: r.cantidad,
        unidad: r.unidad,
        precio_unitario: r.precio_unitario,
        alicuota_iva: 0,
        subtotal: r.precio_unitario * r.cantidad,
        precio_anterior: null,
        match_confianza: 'nueva' as const,
        peso_kg: r.peso_kg,
        categoria: r.categoria,
      })),
      subtotal: total,
      iva_total: 0,
      total,
      notas: null,
    }
    onSubmit(result)
  }

  const total = rows.reduce((s, r) => s + (r.precio_unitario || 0) * r.cantidad, 0)
  const canSubmit = rows.some(r => r.producto_nombre.trim() && r.cantidad > 0)

  const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 7px', fontSize: 12, fontFamily: 'inherit', color: 'var(--text-1)', outline: 'none' }

  return (
    <div className="flex flex-col h-full">
      <div style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 14px', flexShrink: 0 }}>
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="border-none bg-transparent cursor-pointer">
            <span className="material-symbols-outlined text-[22px] text-white">arrow_back</span>
          </button>
          <div>
            <h1 className="text-white text-[18px] font-bold m-0">Carga manual</h1>
            <p className="text-white/60 text-[11px] m-0 mt-[2px]">Ingresá los productos de la factura</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Proveedor + fecha */}
        <div className="p-4 pb-2">
          <div className="rounded-[12px] p-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="mb-2" style={{ position: 'relative' }}>
              <div className="text-[10px] font-bold mb-1" style={{ color: 'var(--text-3)' }}>PROVEEDOR</div>
              <input value={proveedorNombre}
                onChange={e => { setProveedorNombre(e.target.value); setShowProvDD(true) }}
                onFocus={() => setShowProvDD(true)}
                onBlur={() => setTimeout(() => setShowProvDD(false), 150)}
                placeholder="Nombre del proveedor"
                className="w-full rounded-[8px] px-2 py-[6px] text-[13px] border-none outline-none"
                style={{ background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit' }} />
              {showProvDD && provMatches.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,.15)' }}>
                  {provMatches.map(p => (
                    <button key={p.id} onMouseDown={() => { setProveedorNombre(p.nombre); setShowProvDD(false) }}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-1)', borderBottom: '1px solid var(--border)', fontFamily: 'inherit' }}>
                      {p.nombre}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <div className="text-[10px] font-bold mb-1" style={{ color: 'var(--text-3)' }}>FECHA</div>
              <input type="date" value={fechaFactura} onChange={e => setFechaFactura(e.target.value)}
                className="w-full rounded-[8px] px-2 py-[6px] text-[13px] border-none outline-none"
                style={{ background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit' }} />
            </div>
          </div>
        </div>

        {/* Cards de productos */}
        <div className="px-4 pb-2">
          <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-3)' }}>
            Productos
          </div>

          {rows.map(row => {
            const subtotal = row.precio_unitario * row.cantidad
            const precioBase = calcPrecioBase(row.precio_unitario, row.unidad, row.peso_kg)
            const needsEquiv = !isWeightUnit(row.unidad)
            const labelStyle = { fontSize: 9, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase' as const, marginBottom: 3 }
            const readonlyStyle = { ...inputStyle, background: 'var(--bg)', display: 'flex', alignItems: 'center', height: 29 }

            return (
              <div key={row.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 12px', marginBottom: 8, position: 'relative' as const }}>
                {/* Delete */}
                {rows.length > 1 && (
                  <button onClick={() => removeRow(row.id)}
                    style={{ position: 'absolute', top: 8, right: 8, background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--text-3)' }}>close</span>
                  </button>
                )}

                {/* Fila 1: Producto | Cant. | Categoría | Unidad */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 52px 88px 68px', gap: 6, marginBottom: 8, paddingRight: rows.length > 1 ? 22 : 0 }}>
                  <div>
                    <div style={labelStyle}>Producto</div>
                    <input value={row.producto_nombre} onChange={e => updateRow(row.id, 'producto_nombre', e.target.value)}
                      placeholder="Nombre del producto"
                      style={{ ...inputStyle, width: '100%' }} />
                  </div>
                  <div>
                    <div style={labelStyle}>Cant.</div>
                    <input type="text" inputMode="decimal"
                      value={rawVal(`${row.id}-c`, row.cantidad)}
                      onChange={e => { const raw = e.target.value.replace(',', '.'); setRaw(`${row.id}-c`, raw); updateRow(row.id, 'cantidad', parseFloat(raw) || 0) }}
                      onBlur={() => clearRaw(`${row.id}-c`)}
                      style={{ ...inputStyle, width: '100%' }} />
                  </div>
                  <div>
                    <div style={labelStyle}>Categoría</div>
                    <select value={row.categoria} onChange={e => updateRow(row.id, 'categoria', e.target.value)}
                      style={{ ...inputStyle, width: '100%' }}>
                      {CATEGORIAS_COMUNES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={labelStyle}>Unidad</div>
                    <select value={row.unidad} onChange={e => updateRow(row.id, 'unidad', e.target.value)}
                      style={{ ...inputStyle, width: '100%' }}>
                      {UNIDADES_COMUNES.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                </div>

                {/* Separador */}
                <div style={{ height: 1, background: 'var(--border)', margin: '0 -12px 8px' }} />

                {/* Fila 2: Precio | Subtotal | $/kg */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                  <div>
                    <div style={labelStyle}>Precio</div>
                    <input type="text" inputMode="decimal"
                      value={rawVal(`${row.id}-p`, row.precio_unitario)}
                      onChange={e => { const raw = e.target.value.replace(',', '.'); setRaw(`${row.id}-p`, raw); updateRow(row.id, 'precio_unitario', parseFloat(raw) || 0) }}
                      onBlur={() => clearRaw(`${row.id}-p`)}
                      placeholder="$0"
                      style={{ ...inputStyle, width: '100%' }} />
                  </div>
                  <div>
                    <div style={labelStyle}>Subtotal</div>
                    <div style={readonlyStyle}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: subtotal > 0 ? 'var(--text)' : 'var(--text-3)' }}>
                        {subtotal > 0 ? fmt(subtotal) : '—'}
                      </span>
                    </div>
                  </div>
                  <div>
                    <div style={labelStyle}>$/kg</div>
                    <div style={readonlyStyle}>
                      {precioBase !== null && precioBase > 0 ? (
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#10b981' }}>{fmt(precioBase)}</span>
                      ) : needsEquiv ? (
                        <span style={{ fontSize: 11, color: '#f59e0b' }}>⚠ kg?</span>
                      ) : (
                        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>—</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Equivalencia kg para unidades no métricas */}
                {needsEquiv && (
                  <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, background: '#fffbeb', borderRadius: 8, padding: '6px 10px', border: '1px solid #fcd34d' }}>
                    <span style={{ fontSize: 11, color: '#92400e', flex: 1 }}>1 {row.unidad} =</span>
                    <input type="text" inputMode="decimal"
                      value={rawVal(`${row.id}-kg`, row.peso_kg)}
                      onChange={e => { const raw = e.target.value.replace(',', '.'); setRaw(`${row.id}-kg`, raw); updateRow(row.id, 'peso_kg', parseFloat(raw) || undefined) }}
                      onBlur={() => clearRaw(`${row.id}-kg`)}
                      placeholder="0.000"
                      style={{ width: 72, background: 'white', border: '1px solid #fcd34d', borderRadius: 8, padding: '6px 8px', fontSize: 13, fontFamily: 'inherit', color: '#92400e', outline: 'none', textAlign: 'right' as const }} />
                    <span style={{ fontSize: 11, color: '#92400e' }}>kg</span>
                  </div>
                )}
              </div>
            )
          })}

          <button onClick={addRow}
            style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: '1px dashed var(--border)', borderRadius: 10, padding: '8px 12px', cursor: 'pointer', fontSize: 12, color: 'var(--text-3)', fontFamily: 'inherit', width: '100%', justifyContent: 'center' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span>
            Agregar producto
          </button>
        </div>

        {total > 0 && (
          <div className="px-4 pb-4">
            <div className="flex justify-between text-[13px] font-bold py-2" style={{ borderTop: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text-3)' }}>Total</span>
              <span style={{ color: 'var(--navy)' }}>{fmt(total)}</span>
            </div>
          </div>
        )}
      </div>

      <div className="flex-shrink-0 p-4" style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)', paddingBottom: 'max(env(safe-area-inset-bottom, 16px), 16px)' }}>
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full py-[14px] rounded-[12px] border-none cursor-pointer text-[15px] font-bold text-white"
          style={{ background: 'var(--navy)', opacity: canSubmit ? 1 : 0.5 }}>
          Revisar y confirmar
        </button>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// CAT. DE GASTOS — ABM de categorías + asignación masiva por proveedor
// ════════════════════════════════════════════════════════════
const FINANCIERA_COLOR: Record<CategoriaFinanciera, string> = {
  mercaderia: '#059669', rrhh: '#7c3aed', alquiler: '#0891b2', operacional: '#4361a0', administrativo: '#d97706',
}

function CategoriasGastoView({ showToast }: { showToast: (msg: string) => void }) {
  const { categorias, loading, proveedoresSinCategoria, loadingSinCat, crearCategoria, actualizarCategoria, desactivarCategoria, asignarCategoriaAProveedor } = useCategoriasGasto()
  const [search, setSearch] = useState('')
  const [estado, setEstado] = useState<'activas' | 'todas'>('activas')
  const [creando, setCreando] = useState(false)
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevaFinanciera, setNuevaFinanciera] = useState<CategoriaFinanciera>('mercaderia')
  const [editId, setEditId] = useState<string | null>(null)
  const [editNombre, setEditNombre] = useState('')
  const [editFinanciera, setEditFinanciera] = useState<CategoriaFinanciera>('mercaderia')
  const [saving, setSaving] = useState(false)
  const [sinCatOpen, setSinCatOpen] = useState(true)
  const [asignando, setAsignando] = useState<Record<string, string>>({}) // proveedor -> categoriaId elegida
  const [asignandoBusy, setAsignandoBusy] = useState<string | null>(null)
  const [provSearch, setProvSearch] = useState('')

  const filtered = useMemo(() => {
    let list = categorias
    if (estado === 'activas') list = list.filter(c => c.activa)
    if (search.trim()) { const q = search.trim().toLowerCase(); list = list.filter(c => c.nombre.toLowerCase().includes(q)) }
    return list
  }, [categorias, estado, search])

  const provFiltered = useMemo(() => {
    if (!provSearch.trim()) return proveedoresSinCategoria
    const q = provSearch.trim().toLowerCase()
    return proveedoresSinCategoria.filter(p => p.proveedor_nombre.toLowerCase().includes(q))
  }, [proveedoresSinCategoria, provSearch])

  async function handleCrear() {
    if (!nuevoNombre.trim() || saving) return
    setSaving(true)
    try {
      await crearCategoria(nuevoNombre, nuevaFinanciera)
      setNuevoNombre(''); setCreando(false)
      showToast('✓ Categoría creada')
    } catch (e) { showToast('Error: ' + (e instanceof Error ? e.message : 'desconocido')) }
    finally { setSaving(false) }
  }

  async function handleGuardarEdit(id: string) {
    if (!editNombre.trim() || saving) return
    setSaving(true)
    try {
      await actualizarCategoria(id, { nombre: editNombre.trim(), categoria_financiera: editFinanciera })
      setEditId(null)
      showToast('✓ Categoría actualizada')
    } catch (e) { showToast('Error: ' + (e instanceof Error ? e.message : 'desconocido')) }
    finally { setSaving(false) }
  }

  async function handleAsignar(proveedor: string) {
    const catId = asignando[proveedor]
    if (!catId) return
    setAsignandoBusy(proveedor)
    try {
      await asignarCategoriaAProveedor(proveedor, catId)
      showToast(`✓ "${proveedor}" categorizado`)
    } catch (e) { showToast('Error: ' + (e instanceof Error ? e.message : 'desconocido')) }
    finally { setAsignandoBusy(null) }
  }

  const selStyle: React.CSSProperties = { padding: '7px 9px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 12, color: 'var(--text-1)', fontFamily: 'inherit', outline: 'none' }

  return (
    <div className="flex-1 overflow-y-auto" style={{ padding: 16 }}>
      {/* Sin categorizar */}
      {(loadingSinCat || proveedoresSinCategoria.length > 0) && (
        <div style={{ marginBottom: 18, background: 'var(--surface)', border: '1px solid rgba(217,119,6,.35)', borderRadius: 14, overflow: 'hidden' }}>
          <button onClick={() => setSinCatOpen(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '11px 12px', background: 'rgba(217,119,6,.06)', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#d97706' }}>label_off</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>Proveedores sin categorizar</span>
            {!loadingSinCat && <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: '#d97706', borderRadius: 99, padding: '1px 7px' }}>{proveedoresSinCategoria.length}</span>}
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-3)', marginLeft: 'auto', transform: sinCatOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>expand_more</span>
          </button>
          {sinCatOpen && (
            <div style={{ borderTop: '1px solid var(--border)' }}>
              <div style={{ padding: '8px 12px' }}>
                <input value={provSearch} onChange={e => setProvSearch(e.target.value)} placeholder="Buscar proveedor…"
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 12, color: 'var(--text-1)', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              {loadingSinCat ? (
                <div style={{ padding: '12px', fontSize: 12, color: 'var(--text-3)' }}>Cargando…</div>
              ) : provFiltered.length === 0 ? (
                <div style={{ padding: '12px', fontSize: 12, color: 'var(--text-3)' }}>Sin resultados</div>
              ) : (
                <div style={{ maxHeight: 420, overflowY: 'auto' }}>
                  {provFiltered.map((p, i) => (
                    <div key={p.proveedor_nombre} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderTop: i > 0 ? '1px solid var(--border)' : 'none', flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 140 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{p.proveedor_nombre}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{p.n} factura{p.n !== 1 ? 's' : ''} · {fmt(p.total)}</div>
                      </div>
                      <select value={asignando[p.proveedor_nombre] ?? ''} onChange={e => setAsignando(prev => ({ ...prev, [p.proveedor_nombre]: e.target.value }))} style={selStyle}>
                        <option value="">Categoría…</option>
                        {categorias.filter(c => c.activa).map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                      </select>
                      <button onClick={() => handleAsignar(p.proveedor_nombre)} disabled={!asignando[p.proveedor_nombre] || asignandoBusy === p.proveedor_nombre}
                        style={{ padding: '7px 12px', borderRadius: 8, border: 'none', background: asignando[p.proveedor_nombre] ? 'var(--navy)' : 'var(--border)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: asignando[p.proveedor_nombre] ? 'pointer' : 'default', fontFamily: 'inherit', opacity: asignandoBusy === p.proveedor_nombre ? .6 : 1 }}>
                        {asignandoBusy === p.proveedor_nombre ? '…' : 'Asignar'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Buscador + estado + nueva */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar categoría…"
          style={{ flex: 1, minWidth: 160, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 13, color: 'var(--text-1)', fontFamily: 'inherit', outline: 'none' }} />
        <select value={estado} onChange={e => setEstado(e.target.value as 'activas' | 'todas')} style={{ ...selStyle, padding: '9px 10px' }}>
          <option value="activas">Activas</option>
          <option value="todas">Todas</option>
        </select>
        <button onClick={() => setCreando(v => !v)}
          style={{ padding: '9px 14px', borderRadius: 10, border: 'none', background: '#dc580c', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>Nueva categoría
        </button>
      </div>

      {creando && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 12, marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input autoFocus value={nuevoNombre} onChange={e => setNuevoNombre(e.target.value)} placeholder="Nombre de la categoría"
            style={{ flex: 1, minWidth: 160, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, color: 'var(--text-1)', fontFamily: 'inherit', outline: 'none' }} />
          <select value={nuevaFinanciera} onChange={e => setNuevaFinanciera(e.target.value as CategoriaFinanciera)} style={selStyle}>
            {(Object.keys(CATEGORIA_FINANCIERA_LABELS) as CategoriaFinanciera[]).map(k => <option key={k} value={k}>{CATEGORIA_FINANCIERA_LABELS[k]}</option>)}
          </select>
          <button onClick={handleCrear} disabled={!nuevoNombre.trim() || saving}
            style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? .6 : 1 }}>Crear</button>
          <button onClick={() => { setCreando(false); setNuevoNombre('') }} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-2)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
        </div>
      )}

      {/* Lista de categorías */}
      {loading ? (
        <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: 'var(--text-3)' }}>Cargando…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: 'var(--text-3)' }}>Sin categorías</div>
      ) : (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          {filtered.map((c, i) => {
            const isEdit = editId === c.id
            return (
              <div key={c.id} style={{ padding: '10px 12px', borderTop: i > 0 ? '1px solid var(--border)' : 'none', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', opacity: c.activa ? 1 : .5 }}>
                {isEdit ? (
                  <>
                    <input autoFocus value={editNombre} onChange={e => setEditNombre(e.target.value)} style={{ flex: 1, minWidth: 140, padding: '7px 9px', borderRadius: 8, border: '1px solid var(--accent)', background: 'var(--bg)', fontSize: 13, color: 'var(--text-1)', fontFamily: 'inherit', outline: 'none' }} />
                    <select value={editFinanciera} onChange={e => setEditFinanciera(e.target.value as CategoriaFinanciera)} style={selStyle}>
                      {(Object.keys(CATEGORIA_FINANCIERA_LABELS) as CategoriaFinanciera[]).map(k => <option key={k} value={k}>{CATEGORIA_FINANCIERA_LABELS[k]}</option>)}
                    </select>
                    <button onClick={() => handleGuardarEdit(c.id)} disabled={saving} style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Guardar</button>
                    <button onClick={() => setEditId(null)} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-2)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>×</button>
                  </>
                ) : (
                  <>
                    <span style={{ flex: 1, minWidth: 140, fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{c.nombre}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 99, background: `${FINANCIERA_COLOR[c.categoria_financiera]}18`, color: FINANCIERA_COLOR[c.categoria_financiera] }}>
                      {CATEGORIA_FINANCIERA_LABELS[c.categoria_financiera]}
                    </span>
                    <button onClick={() => { setEditId(c.id); setEditNombre(c.nombre); setEditFinanciera(c.categoria_financiera) }} title="Editar"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-3)', display: 'flex' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span>
                    </button>
                    <button onClick={() => desactivarCategoria(c.id).then(() => showToast(c.activa ? 'Categoría desactivada' : ''))} title={c.activa ? 'Desactivar' : 'Inactiva'}
                      disabled={!c.activa}
                      style={{ background: 'none', border: 'none', cursor: c.activa ? 'pointer' : 'default', padding: 4, color: 'var(--text-3)', display: 'flex' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{c.activa ? 'visibility' : 'visibility_off'}</span>
                    </button>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// RECEPCIÓN — log de documentos cargados: origen (imagen/manual/import)
// + estado de conciliación de stock. Período mensual (mismo patrón que Fudo).
// ════════════════════════════════════════════════════════════
interface DocRecepcion {
  id: string
  proveedor_nombre: string
  fecha_factura: string
  fecha_carga: string
  numero_factura: string | null
  total: number
  imagen_url: string | null
  nItems: number
  nItemsVinculados: number
}

function RecepcionView() {
  const RESTAURANTE_ID_LOCAL = useRestauranteId()
  const supabase = useMemo(() => createClient(), [])
  const now = new Date()
  const [mes, setMes] = useState(now.getMonth() + 1)
  const [anio, setAnio] = useState(now.getFullYear())
  const [search, setSearch] = useState('')
  const [docs, setDocs] = useState<DocRecepcion[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!RESTAURANTE_ID_LOCAL) return
    let cancel = false
    setLoading(true)
    ;(async () => {
      const desde = `${anio}-${String(mes).padStart(2, '0')}-01`
      const hastaDate = new Date(anio, mes, 0)
      const hasta = hastaDate.toISOString().slice(0, 10)
      const { data: facs } = await supabase.from('facturas')
        .select('id, proveedor_nombre, fecha_factura, fecha_carga, numero_factura, total, imagen_url')
        .eq('restaurante_id', RESTAURANTE_ID_LOCAL)
        .gte('fecha_factura', desde).lte('fecha_factura', hasta)
        .order('fecha_factura', { ascending: false })
        .limit(1000)
      const rows = (facs ?? []) as { id: string; proveedor_nombre: string; fecha_factura: string; fecha_carga: string; numero_factura: string | null; total: number; imagen_url: string | null }[]
      if (rows.length === 0) { if (!cancel) { setDocs([]); setLoading(false) } return }
      const ids = rows.map(r => r.id)
      const itemsMap = new Map<string, { n: number; vinculados: number }>()
      for (let i = 0; i < ids.length; i += 200) {
        const chunk = ids.slice(i, i + 200)
        const { data: items } = await supabase.from('factura_items').select('factura_id, producto_id').in('factura_id', chunk)
        for (const it of (items ?? []) as { factura_id: string; producto_id: string | null }[]) {
          const g = itemsMap.get(it.factura_id) ?? { n: 0, vinculados: 0 }
          g.n++
          if (it.producto_id) g.vinculados++
          itemsMap.set(it.factura_id, g)
        }
      }
      if (!cancel) {
        setDocs(rows.map(r => ({ ...r, nItems: itemsMap.get(r.id)?.n ?? 0, nItemsVinculados: itemsMap.get(r.id)?.vinculados ?? 0 })))
        setLoading(false)
      }
    })()
    return () => { cancel = true }
  }, [RESTAURANTE_ID_LOCAL, mes, anio, supabase])

  const filtered = useMemo(() => {
    if (!search.trim()) return docs
    const q = search.trim().toLowerCase()
    return docs.filter(d => d.proveedor_nombre.toLowerCase().includes(q))
  }, [docs, search])

  const kpis = useMemo(() => {
    const total = docs.length
    const conImagen = docs.filter(d => !!d.imagen_url).length
    const stockConciliado = docs.filter(d => d.nItems > 0 && d.nItemsVinculados === d.nItems).length
    const totalPeriodo = docs.reduce((s, d) => s + (d.total ?? 0), 0)
    return { total, conImagen, stockConciliado, totalPeriodo }
  }, [docs])

  const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
  const selStyle: React.CSSProperties = { padding: '7px 9px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 12, color: 'var(--text-1)', fontFamily: 'inherit', outline: 'none' }

  return (
    <div className="flex-1 overflow-y-auto" style={{ padding: 16 }}>
      {/* Selector de período */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <select value={mes} onChange={e => setMes(Number(e.target.value))} style={selStyle}>
          {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
        <select value={anio} onChange={e => setAnio(Number(e.target.value))} style={selStyle}>
          {[anio - 1, anio, anio + 1].map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por proveedor…"
          style={{ flex: 1, minWidth: 160, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 12, color: 'var(--text-1)', fontFamily: 'inherit', outline: 'none' }} />
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 8, marginBottom: 14 }}>
        {[
          { label: 'Total documentos', value: String(kpis.total), icon: 'description', color: 'var(--text-1)' },
          { label: 'Con imagen/PDF', value: String(kpis.conImagen), icon: 'photo_camera', color: '#4361a0' },
          { label: 'Stock conciliado', value: String(kpis.stockConciliado), icon: 'inventory_2', color: '#16a34a' },
          { label: 'Total del período', value: fmt(kpis.totalPeriodo), icon: 'payments', color: 'var(--navy)' },
        ].map(k => (
          <div key={k.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14, color: k.color }}>{k.icon}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{k.label}</span>
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, color: k.color, fontFamily: "'DM Mono', monospace" }}>{k.value}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: 'var(--text-3)' }}>Cargando…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: 'var(--text-3)' }}>Sin documentos en este período</div>
      ) : (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          {filtered.map((d, i) => (
            <div key={d.id} style={{ padding: '10px 12px', borderTop: i > 0 ? '1px solid var(--border)' : 'none', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{d.proveedor_nombre}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{fmtFecha(d.fecha_factura)}{d.numero_factura ? ` · N° ${d.numero_factura}` : ''}</div>
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: d.imagen_url ? 'rgba(67,97,160,.12)' : 'rgba(100,116,139,.12)', color: d.imagen_url ? '#4361a0' : '#64748b' }}>
                {d.imagen_url ? 'Con imagen' : 'Import/manual'}
              </span>
              {d.nItems > 0 && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: d.nItemsVinculados === d.nItems ? 'rgba(22,163,74,.12)' : 'rgba(217,119,6,.12)', color: d.nItemsVinculados === d.nItems ? '#16a34a' : '#d97706' }}>
                  Stock {d.nItemsVinculados}/{d.nItems}
                </span>
              )}
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)', fontFamily: "'DM Mono', monospace", marginLeft: 'auto' }}>{fmt(d.total)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────
export default function FacturasPage() {
  const { facturas, loading, crearFactura, actualizarFactura, actualizarStatus, eliminarFactura, fetchItems, fetchFacturas, hasMore, fetchMore, totalCount, fetchPorPagar, vincularPedido } = useFacturas()
  const { productos, refetch: refetchStock } = useStock()
  const { proveedores } = useProveedores()
  const { categorias: categoriasGasto } = useCategoriasGasto()
  const { medios: mediosPago } = useMediosPago()
  const isDesktop = useIsDesktop()
  const [mainTab, setMainTab] = useState<MainTab>('facturas')
  const [view, setView] = useState<View>('list')

  useEffect(() => {
    function handleSetTab(e: Event) {
      const { tab: t } = (e as CustomEvent<{ tab: string }>).detail
      if (t === 'facturas' || t === 'listas' || t === 'proveedores' || t === 'recepcion' || t === 'categorias') setMainTab(t as MainTab)
    }
    window.addEventListener('kc-set-tab', handleSetTab)
    return () => window.removeEventListener('kc-set-tab', handleSetTab)
  }, [])

  const [importMode, setImportMode] = useState<ImportMode>(null)
  const [aiResult, setAiResult] = useState<AIResult | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<'todas' | 'semana' | 'mes' | 'por_pagar'>('todas')
  const [catFiltroId, setCatFiltroId] = useState('')
  const [estadoFiltro, setEstadoFiltro] = useState('')
  const [proveedorFiltro, setProveedorFiltro] = useState('')
  const [porPagar, setPorPagar] = useState<Factura[]>([])
  const [porPagarLoading, setPorPagarLoading] = useState(false)
  const [selectedFactura, setSelectedFactura] = useState<Factura | null>(null)
  const [textoInput, setTextoInput] = useState('')
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [showBulkUpload, setShowBulkUpload] = useState(false)
  const [showExcelPOS, setShowExcelPOS] = useState(false)
  const [cropPendingFile, setCropPendingFile] = useState<File | null>(null)

  // ── Privacidad: nombres internos a excluir ──
  const [showPrivacidad, setShowPrivacidad] = useState(false)
  const [nombresExcluidos, setNombresExcluidos] = useState<string[]>([])
  const [nuevoNombre, setNuevoNombre] = useState('')
  const supabasePriv = useMemo(() => createClient(), [])

  useEffect(() => {
    let cancel = false
    ;(async () => {
      const { data: { user } } = await supabasePriv.auth.getUser()
      if (!user || cancel) return
      const { data: ur } = await supabasePriv.from('user_restaurantes').select('restaurante_id').eq('user_id', user.id).single()
      if (!ur?.restaurante_id || cancel) return
      const { data: rest } = await supabasePriv.from('restaurantes').select('configuracion').eq('id', ur.restaurante_id).single()
      const cfg = rest?.configuracion as { nombres_excluidos?: string[] } | null
      if (!cancel && Array.isArray(cfg?.nombres_excluidos)) setNombresExcluidos(cfg.nombres_excluidos)
    })()
    return () => { cancel = true }
  }, [supabasePriv])

  async function guardarNombresExcluidos(lista: string[]) {
    setNombresExcluidos(lista)
    const { data: { user } } = await supabasePriv.auth.getUser()
    if (!user) return
    const { data: ur } = await supabasePriv.from('user_restaurantes').select('restaurante_id').eq('user_id', user.id).single()
    if (!ur?.restaurante_id) return
    const { data: rest } = await supabasePriv.from('restaurantes').select('configuracion').eq('id', ur.restaurante_id).single()
    const cfg = (rest?.configuracion as Record<string, unknown> | null) ?? {}
    await supabasePriv.from('restaurantes').update({ configuracion: { ...cfg, nombres_excluidos: lista } }).eq('id', ur.restaurante_id)
  }

  // Filter facturas
  const facturasFiltradas = useMemo(() => {
    let list = facturas
    if (filtro !== 'todas' && filtro !== 'por_pagar') {
      const desde = filtro === 'semana' ? inicioSemana() : inicioMes()
      list = list.filter(f => (f.fecha_factura || f.created_at.slice(0, 10)) >= desde)
    }
    if (catFiltroId) list = list.filter(f => f.categoria_gasto_id === catFiltroId)
    if (estadoFiltro) list = list.filter(f => (f.status ?? 'pendiente') === estadoFiltro)
    if (proveedorFiltro) list = list.filter(f => f.proveedor_nombre === proveedorFiltro)
    return list
  }, [facturas, filtro, catFiltroId, estadoFiltro, proveedorFiltro])

  const categoriasGastoMap = useMemo(() => Object.fromEntries(categoriasGasto.map(c => [c.id, c])), [categoriasGasto])

  // Summary
  const resumen = useMemo(() => {
    const ff = facturasFiltradas
    const total = ff.reduce((s, f) => s + f.total, 0)
    const proveedores = new Set(ff.map(f => f.proveedor_nombre)).size
    return { total, count: ff.length, proveedores }
  }, [facturasFiltradas])

  // Cargar cuentas por pagar: siempre en la tab Gastos (alimenta los KPIs A vencer/
  // Vencidos/A pagar, no solo el chip "Por pagar") y al cambiar facturas (marcar pagada, nueva factura).
  const recargarPorPagar = useCallback(async () => {
    setPorPagarLoading(true)
    setPorPagar(await fetchPorPagar())
    setPorPagarLoading(false)
  }, [fetchPorPagar])

  useEffect(() => {
    if (mainTab === 'facturas') recargarPorPagar()
  }, [mainTab, facturas, recargarPorPagar])

  // Vencimiento por factura (30/60 días desde fecha_factura; cuenta_corriente = sin_fecha)
  const vencimientos = useMemo(() => {
    const map = new Map<string, VencimientoFactura>()
    for (const f of porPagar) map.set(f.id, calcularVencimientoFactura(f))
    return map
  }, [porPagar])

  // Agrupar cuentas por pagar por proveedor — dentro de cada grupo, lo más urgente primero
  const porPagarGrupos = useMemo(() => {
    const map = new Map<string, { proveedor: string; total: number; facturas: Factura[] }>()
    for (const f of porPagar) {
      const key = f.proveedor_nombre || 'Sin proveedor'
      const g = map.get(key) ?? { proveedor: key, total: 0, facturas: [] }
      g.total += f.total
      g.facturas.push(f)
      map.set(key, g)
    }
    const orden = { vencida: 0, esta_semana: 1, proximamente: 2, sin_fecha: 3 }
    for (const g of map.values()) {
      g.facturas.sort((a, b) => {
        const va = vencimientos.get(a.id), vb = vencimientos.get(b.id)
        const oa = va ? orden[va.urgencia] : 4, ob = vb ? orden[vb.urgencia] : 4
        if (oa !== ob) return oa - ob
        return (va?.diasRestantes ?? 0) - (vb?.diasRestantes ?? 0)
      })
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total)
  }, [porPagar, vencimientos])

  const totalPorPagar = useMemo(() => porPagar.reduce((s, f) => s + f.total, 0), [porPagar])

  // Resumen de urgencia para el callout — mismo criterio que el dashboard (D7: no divergir)
  const resumenVencimientos = useMemo(() => {
    let vencidas = 0, vencidasTotal = 0, estaSemana = 0, estaSemanaTotal = 0
    for (const f of porPagar) {
      const v = vencimientos.get(f.id)
      if (v?.urgencia === 'vencida') { vencidas++; vencidasTotal += f.total }
      else if (v?.urgencia === 'esta_semana') { estaSemana++; estaSemanaTotal += f.total }
    }
    return { vencidas, vencidasTotal, estaSemana, estaSemanaTotal }
  }, [porPagar, vencimientos])

  // KPIs estilo Fudo: A vencer / Vencidos / A pagar / Total pagado. "A vencer" y
  // "Vencidos" salen de porPagar (todas las facturas a crédito, no paginado); "Total
  // pagado" sobre el conjunto filtrado actual (mismo alcance/caveat que "resumen").
  const kpisGasto = useMemo(() => {
    let totalPagado = 0
    for (const f of facturasFiltradas) if (f.status === 'pagada') totalPagado += f.total
    const vencidas = porPagar.filter(f => vencimientos.get(f.id)?.urgencia === 'vencida')
    const aVencer = porPagar.filter(f => vencimientos.get(f.id)?.urgencia !== 'vencida')
    return {
      aVencerN: aVencer.length, aVencerTotal: aVencer.reduce((s, f) => s + f.total, 0),
      vencidasN: vencidas.length, vencidasTotal: vencidas.reduce((s, f) => s + f.total, 0),
      totalPagado,
    }
  }, [facturasFiltradas, porPagar, vencimientos])

  async function marcarPagadaRapido(f: Factura) {
    try {
      await actualizarStatus(f.id, 'pagada')
      setToast(`${f.proveedor_nombre} marcada como pagada`)
      recargarPorPagar()
    } catch (e: unknown) {
      setToast(e instanceof Error ? e.message : 'Error al marcar como pagada')
    }
  }

  useEffect(() => {
    const pendientes = facturas.filter(f => f.status === 'pendiente')
      .map(f => ({ proveedor: f.proveedor_nombre, total: f.total }))
      .slice(0, 5)
    const cuentaCorriente = facturas.filter(f => f.condicion_pago === 'cuenta_corriente' && f.status !== 'pagada')
      .reduce((s, f) => s + f.total, 0)
    localStorage.setItem('kc_screen_context', JSON.stringify({
      screen: 'facturas',
      tab: mainTab,
      filtro,
      totalCount,
      montoFiltrado: Math.round(resumen.total),
      pendientes,
      cuentaCorriente: Math.round(cuentaCorriente),
      proveedoresActivos: resumen.proveedores,
      totalPorPagar: Math.round(totalPorPagar),
      vencidas: resumenVencimientos.vencidas,
      vencenEstaSemana: resumenVencimientos.estaSemana,
    }))
    return () => localStorage.removeItem('kc_screen_context')
  }, [facturas, facturasFiltradas, mainTab, filtro, totalCount, resumen, totalPorPagar, resumenVencimientos])

  async function exportXLSX() {
    const facturasRows = facturasFiltradas.map(f => ({
      'Proveedor': f.proveedor_nombre,
      'Fecha': f.fecha_factura,
      'N° Factura': f.numero_factura ?? '',
      'Tipo': f.tipo_factura ?? '',
      'Estado': f.status ?? '',
      'Condición pago': f.condicion_pago ?? '',
      'Subtotal': f.subtotal ?? 0,
      'IVA': f.iva_total ?? 0,
      'Total': f.total,
    }))

    const allItems = await Promise.all(
      facturasFiltradas.map(f => fetchItems(f.id).then(items =>
        items.map(i => ({
          'Proveedor': f.proveedor_nombre,
          'Fecha': f.fecha_factura,
          'N° Factura': f.numero_factura ?? '',
          'Producto': i.producto_nombre,
          'Cantidad': i.cantidad,
          'Unidad': i.unidad ?? '',
          'Precio unitario': i.precio_unitario,
          'IVA %': i.alicuota_iva ?? 0,
          'Subtotal': i.subtotal ?? i.cantidad * i.precio_unitario,
        }))
      ))
    )

    await exportarExcel(`facturas_${fechaArchivo()}.xlsx`, [
      { nombre: 'Facturas', filas: facturasRows },
      { nombre: 'Líneas', filas: allItems.flat() },
    ])
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  function handleFileWithCrop(file: File, mode: 'image' | 'pdf' | 'camera') {
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file)
      setCropSrc(url)
      setCropPendingFile(Object.assign(file, { _mode: mode }))
    } else {
      handleFile(file, mode)
    }
  }

  async function handleFile(file: File, mode: 'image' | 'pdf' | 'camera') {
    setAnalyzing(true)
    setView('confirm')
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('mode', mode)
      const res = await fetch('/api/facturas', { method: 'POST', body: fd })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setAiResult({
        ...data,
        items: (data.items || []).map((it: Record<string, unknown>) => ({
          ...it,
          producto_id: null,
          precio_anterior: null,
          match_confianza: 'nueva',
        })),
      })
    } catch (e) {
      showToast('Error al analizar factura')
      setView('import')
    }
    setAnalyzing(false)
  }

  async function handleText() {
    if (!textoInput.trim()) return
    setAnalyzing(true)
    setView('confirm')
    try {
      const fd = new FormData()
      fd.append('text', textoInput)
      fd.append('mode', 'text')
      const res = await fetch('/api/facturas', { method: 'POST', body: fd })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setAiResult({
        ...data,
        items: (data.items || []).map((it: Record<string, unknown>) => ({
          ...it,
          producto_id: null,
          precio_anterior: null,
          match_confianza: 'nueva',
        })),
      })
    } catch (e) {
      showToast('Error al analizar texto')
      setView('import')
    }
    setAnalyzing(false)
  }

  function handleImportSelect(mode: 'text' | 'manual') {
    setImportMode(mode)
  }

  async function handleConfirm(data: AIResult) {
    setSaving(true)
    try {
      const result = await crearFactura({
        proveedor_nombre: data.proveedor_nombre,
        proveedor_cuit: data.proveedor_cuit,
        fecha_factura: data.fecha_factura,
        tipo_factura: data.tipo_factura,
        numero_factura: data.numero_factura,
        subtotal: data.subtotal,
        iva_total: data.iva_total,
        total: data.total,
        condicion_pago: data.condicion_pago,
        notas: data.notas,
        categoria_gasto_id: data.categoria_gasto_id,
        medio_pago_id: data.medio_pago_id,
        fecha_vencimiento: data.fecha_vencimiento,
        items: data.items.map(it => ({
          producto_nombre: it.producto_nombre,
          producto_id: it.producto_id,
          cantidad: it.cantidad,
          unidad: it.unidad,
          precio_unitario: it.precio_unitario,
          alicuota_iva: it.alicuota_iva,
          subtotal: it.subtotal,
          precio_anterior: it.precio_anterior,
          peso_kg: it.peso_kg,
          categoria: it.categoria,
        })),
      })
      const parts = []
      if (result.preciosActualizados > 0) parts.push(`${result.preciosActualizados} precios actualizados`)
      if (result.productosCreados > 0) parts.push(`${result.productosCreados} productos creados`)
      showToast(`\u2713 Factura cargada${parts.length > 0 ? ' — ' + parts.join(', ') : ''}`)
      refetchStock()
      setView('list')
      setAiResult(null)
      setTextoInput('')
    } catch (e) {
      showToast('Error al guardar factura')
    }
    setSaving(false)
  }

  // ── Detail view ──
  if (view === 'detail' && selectedFactura) {
    return (
      <DetailView
        factura={selectedFactura}
        categoriasGasto={categoriasGasto}
        mediosPago={mediosPago}
        onBack={() => { setView('list'); setSelectedFactura(null) }}
        onStatusChange={async (status) => {
          await actualizarStatus(selectedFactura.id, status)
          setSelectedFactura({ ...selectedFactura, status })
        }}
        onDelete={async () => {
          await eliminarFactura(selectedFactura.id)
          setView('list')
          setSelectedFactura(null)
          showToast('Factura eliminada')
        }}
        onUpdate={async (data, items) => {
          await actualizarFactura(selectedFactura.id, data, items)
          setSelectedFactura({ ...selectedFactura, ...data })
          showToast('Factura actualizada')
        }}
        onVincularPedido={async (pedidoId) => {
          try {
            await vincularPedido(selectedFactura.id, pedidoId)
            setSelectedFactura({ ...selectedFactura, pedido_id: pedidoId })
            showToast(pedidoId ? '✓ Pedido vinculado' : 'Pedido desvinculado')
          } catch {
            showToast('Error al vincular — ¿aplicaste la migración pedido_id?')
          }
        }}
      />
    )
  }

  // ── Confirm view ──
  if (view === 'confirm') {
    if (analyzing) {
      return (
        <div className="flex flex-col h-full">
          <div style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 14px', flexShrink: 0 }}>
            <div className="flex items-center gap-3">
              <button onClick={() => setView('import')} className="border-none bg-transparent cursor-pointer">
                <span className="material-symbols-outlined text-[22px] text-white">arrow_back</span>
              </button>
              <h1 className="text-white text-[18px] font-bold m-0">Analizando...</h1>
            </div>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <div className="w-12 h-12 rounded-full border-[3px] border-t-transparent animate-spin"
              style={{ borderColor: 'var(--navy)', borderTopColor: 'transparent' }} />
            <p className="text-[14px] font-semibold" style={{ color: 'var(--text-2)' }}>
              Analizando factura con IA...
            </p>
            <p className="text-[12px]" style={{ color: 'var(--text-3)' }}>
              Extrayendo productos, precios y totales
            </p>
          </div>
        </div>
      )
    }

    if (aiResult) {
      return (
        <ConfirmView
          result={aiResult}
          productos={productos.map(p => ({
            id: p.id, nombre: p.nombre, unidad: p.unidad,
            precio_unitario: p.precio_unitario ?? 0,
          }))}
          proveedores={proveedores.map(p => ({ id: p.id, nombre: p.nombre, cuit: null }))}
          categoriasGasto={categoriasGasto}
          mediosPago={mediosPago}
          onConfirm={handleConfirm}
          onCancel={() => { setView('import'); setAiResult(null) }}
          saving={saving}
        />
      )
    }
  }

  // ── Import view ──
  if (view === 'import') {
    if (importMode === 'manual') {
      return (
        <ManualEntryView
          onSubmit={(result) => { setAiResult(result); setView('confirm') }}
          onBack={() => setImportMode(null)}
          proveedores={proveedores.map(p => ({ id: p.id, nombre: p.nombre }))}
        />
      )
    }

    return (
      <>
      <div className="flex flex-col h-full">
        <div style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 14px', flexShrink: 0 }}>
          <div className="flex items-center gap-3">
            <button onClick={() => { setView('list'); setImportMode(null); setTextoInput('') }}
              className="border-none bg-transparent cursor-pointer">
              <span className="material-symbols-outlined text-[22px] text-white">arrow_back</span>
            </button>
            <h1 className="text-white text-[18px] font-bold m-0">Cargar factura</h1>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {importMode === 'text' ? (
            <div className="p-4">
              <p className="text-[12px] mb-3" style={{ color: 'var(--text-3)' }}>
                Pega el texto de la factura (email, datos copiados, etc.)
              </p>
              <textarea
                value={textoInput}
                onChange={e => setTextoInput(e.target.value)}
                placeholder="Pegar datos de factura aqui..."
                rows={10}
                className="w-full rounded-[12px] p-3 text-[13px] border-none outline-none resize-none"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'inherit' }}
                autoFocus
              />
              <button
                onClick={handleText}
                disabled={!textoInput.trim()}
                className="w-full mt-3 py-[14px] rounded-[12px] border-none cursor-pointer text-[15px] font-bold text-white"
                style={{ background: 'var(--navy)', opacity: textoInput.trim() ? 1 : 0.5 }}
              >
                Analizar con IA
              </button>
            </div>
          ) : (
            <>
              <ImportSelector
                onSelect={handleImportSelect}
                onFile={(file, mode) => {
                  setImportMode(mode)
                  handleFileWithCrop(file, mode)
                }}
              />
              {/* Barra de texto manual */}
              <div style={{
                padding: '8px 12px',
                borderTop: '1px solid var(--border)',
                background: 'var(--bg)',
              }}>
                <div style={{
                  display: 'flex', alignItems: 'flex-end', gap: 8,
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 20, padding: '8px 8px 8px 14px',
                }}>
                  <textarea
                    value={textoInput}
                    onChange={e => setTextoInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && textoInput.trim()) { e.preventDefault(); handleText() } }}
                    placeholder="Escribí los datos de la factura..."
                    rows={1}
                    style={{
                      flex: 1, background: 'none', border: 'none', outline: 'none',
                      fontSize: 13, color: 'var(--text-1)', fontFamily: 'inherit',
                      resize: 'none', lineHeight: 1.4, maxHeight: 100, overflowY: 'auto',
                    }}
                  />
                  <button
                    onClick={handleText}
                    disabled={!textoInput.trim()}
                    style={{
                      width: 34, height: 34, borderRadius: '50%', border: 'none',
                      background: textoInput.trim() ? 'var(--navy)' : 'var(--border)',
                      cursor: textoInput.trim() ? 'pointer' : 'default',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0, transition: 'background .2s',
                    }}
                  >
                    <span className="material-symbols-outlined text-[18px] text-white">send</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      {cropSrc && cropPendingFile && (
        <ImageCropModal
          src={cropSrc}
          onConfirm={blob => {
            const mode = (cropPendingFile as File & { _mode?: string })._mode as 'image' | 'camera' | 'pdf' ?? 'image'
            const croppedFile = new File([blob], cropPendingFile.name, { type: 'image/jpeg' })
            setCropSrc(null); setCropPendingFile(null)
            handleFile(croppedFile, mode)
          }}
          onCancel={() => { if (cropSrc) URL.revokeObjectURL(cropSrc); setCropSrc(null); setCropPendingFile(null) }}
        />
      )}
      </>
    )
  }

  // ── Proveedores tab ──
  if (mainTab === 'proveedores') {
    return (
      <div className="flex flex-col h-full">
        <div style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 0', flexShrink: 0 }}>
          <h1 className="text-white text-[18px] font-bold m-0 mb-3">Compras</h1>
          <div className="flex gap-[6px] pb-[10px]" style={{ flexWrap: 'wrap' }}>
            {MAIN_TABS.map(t => (
              <button key={t} onClick={() => setMainTab(t)}
                className="px-[12px] py-[5px] rounded-full border-none cursor-pointer text-[12px] font-semibold"
                style={{ background: mainTab === t ? 'white' : 'rgba(255,255,255,0.15)', color: mainTab === t ? 'var(--navy)' : 'rgba(255,255,255,0.7)' }}>
                {TAB_LABELS[t]}
              </button>
            ))}
          </div>
        </div>
        <ProveedoresPage embedded />
        {toast && (
          <div className="fixed top-[60px] left-4 right-4 z-[300] rounded-[12px] p-[12px_16px] text-[13px] font-semibold text-white text-center"
            style={{ background: toast.startsWith('✓') ? '#10b981' : '#ef4444' }}>{toast}</div>
        )}
      </div>
    )
  }

  // ── Listas de precios tab ──
  if (mainTab === 'listas') {
    return (
      <div className="flex flex-col h-full">
        {/* Header with tabs */}
        <div style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 0', flexShrink: 0 }}>
          <h1 className="text-white text-[18px] font-bold m-0 mb-3">Compras</h1>

          {/* Tab pills */}
          <div className="flex gap-[6px] pb-[10px]" style={{ flexWrap: 'wrap' }}>
            {MAIN_TABS.map(t => (
              <button key={t} onClick={() => setMainTab(t)}
                className="px-[12px] py-[5px] rounded-full border-none cursor-pointer text-[12px] font-semibold"
                style={{ background: mainTab === t ? 'white' : 'rgba(255,255,255,0.15)', color: mainTab === t ? 'var(--navy)' : 'rgba(255,255,255,0.7)' }}>
                {TAB_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        <ListasPreciosView showToast={showToast} />

        {/* Toast */}
        {toast && (
          <div className="fixed top-[60px] left-4 right-4 z-[300] rounded-[12px] p-[12px_16px] text-[13px] font-semibold text-white text-center animate-[slideDown_.3s_ease]"
            style={{ background: toast.startsWith('\u2713') ? '#10b981' : '#ef4444' }}>
            {toast}
          </div>
        )}
      </div>
    )
  }

  // ── Cat. de Gastos tab ──
  if (mainTab === 'categorias') {
    return (
      <div className="flex flex-col h-full">
        <div style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 0', flexShrink: 0 }}>
          <h1 className="text-white text-[18px] font-bold m-0 mb-3">Compras</h1>
          <div className="flex gap-[6px] pb-[10px]" style={{ flexWrap: 'wrap' }}>
            {MAIN_TABS.map(t => (
              <button key={t} onClick={() => setMainTab(t)}
                className="px-[12px] py-[5px] rounded-full border-none cursor-pointer text-[12px] font-semibold"
                style={{ background: mainTab === t ? 'white' : 'rgba(255,255,255,0.15)', color: mainTab === t ? 'var(--navy)' : 'rgba(255,255,255,0.7)' }}>
                {TAB_LABELS[t]}
              </button>
            ))}
          </div>
        </div>
        <CategoriasGastoView showToast={showToast} />
        {toast && (
          <div className="fixed top-[60px] left-4 right-4 z-[300] rounded-[12px] p-[12px_16px] text-[13px] font-semibold text-white text-center"
            style={{ background: toast.startsWith('✓') ? '#10b981' : '#ef4444' }}>{toast}</div>
        )}
      </div>
    )
  }

  // ── Recepción tab ──
  if (mainTab === 'recepcion') {
    return (
      <div className="flex flex-col h-full">
        <div style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 0', flexShrink: 0 }}>
          <h1 className="text-white text-[18px] font-bold m-0 mb-3">Compras</h1>
          <div className="flex gap-[6px] pb-[10px]" style={{ flexWrap: 'wrap' }}>
            {MAIN_TABS.map(t => (
              <button key={t} onClick={() => setMainTab(t)}
                className="px-[12px] py-[5px] rounded-full border-none cursor-pointer text-[12px] font-semibold"
                style={{ background: mainTab === t ? 'white' : 'rgba(255,255,255,0.15)', color: mainTab === t ? 'var(--navy)' : 'rgba(255,255,255,0.7)' }}>
                {TAB_LABELS[t]}
              </button>
            ))}
          </div>
        </div>
        <RecepcionView />
        {toast && (
          <div className="fixed top-[60px] left-4 right-4 z-[300] rounded-[12px] p-[12px_16px] text-[13px] font-semibold text-white text-center"
            style={{ background: toast.startsWith('✓') ? '#10b981' : '#ef4444' }}>{toast}</div>
        )}
      </div>
    )
  }

  // ── List view (default) ──
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 0', flexShrink: 0 }}>
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-white text-[18px] font-bold m-0">Compras</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPrivacidad(true)}
              title="Nombres a excluir (privacidad)"
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 8, background: 'rgba(255,255,255,.15)', color: '#fff', border: '1px solid rgba(255,255,255,.25)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>shield_person</span>
              {nombresExcluidos.length > 0 && <span>{nombresExcluidos.length}</span>}
            </button>
            <button
              onClick={exportXLSX}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, background: 'rgba(255,255,255,.15)', color: '#fff', border: '1px solid rgba(255,255,255,.25)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>table_view</span>
              Exportar
            </button>
          </div>
        </div>

        {/* Tab pills */}
        <div data-coach-target="facturas-tabs" className="flex gap-[6px] mb-3" style={{ flexWrap: 'wrap' }}>
          {MAIN_TABS.map(t => (
            <button key={t} onClick={() => setMainTab(t)}
              className="px-[12px] py-[5px] rounded-full border-none cursor-pointer text-[12px] font-semibold"
              style={{ background: mainTab === t ? 'white' : 'rgba(255,255,255,0.15)', color: mainTab === t ? 'var(--navy)' : 'rgba(255,255,255,0.7)' }}>
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        {/* Period summary */}
        {filtro === 'por_pagar' ? (
          <p className="text-white/70 text-[11px] m-0 mb-3">
            Adeudado: {fmt(totalPorPagar)} en {porPagar.length} factura{porPagar.length !== 1 ? 's' : ''} a crédito · {porPagarGrupos.length} proveedor{porPagarGrupos.length !== 1 ? 'es' : ''}
          </p>
        ) : (
          <p className="text-white/70 text-[11px] m-0 mb-3">
            {filtro === 'semana' ? 'Esta semana' : filtro === 'mes' ? 'Este mes' : 'Total'}:
            {' '}{fmt(resumen.total)} en {filtro === 'todas' && totalCount > resumen.count ? `${totalCount} facturas (${resumen.count} cargadas)` : `${resumen.count} facturas de ${resumen.proveedores} proveedores`}
          </p>
        )}

        {/* Filter pills */}
        <div data-coach-target="facturas-filtros" className="flex gap-[6px] pb-[10px]">
          {([['todas', 'Todas'], ['semana', 'Esta semana'], ['mes', 'Este mes'], ['por_pagar', 'Por pagar']] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setFiltro(id)}
              className="px-[10px] py-[4px] rounded-full border-none cursor-pointer text-[11px] font-semibold"
              style={{
                background: filtro === id ? 'white' : 'rgba(255,255,255,0.15)',
                color: filtro === id ? 'var(--navy)' : 'rgba(255,255,255,0.7)',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Filtros: categoría / estado / proveedor */}
        <div className="flex gap-[6px] pb-[12px]" style={{ flexWrap: 'wrap' }}>
          {(() => {
            const selSt: React.CSSProperties = { padding: '5px 9px', borderRadius: 8, border: '1px solid rgba(255,255,255,.25)', background: 'rgba(255,255,255,.12)', color: '#fff', fontSize: 11, fontWeight: 600, fontFamily: 'inherit', outline: 'none' }
            return (
              <>
                <select value={catFiltroId} onChange={e => setCatFiltroId(e.target.value)} style={selSt}>
                  <option value="" style={{ color: '#000' }}>Categoría: todas</option>
                  {categoriasGasto.map(c => <option key={c.id} value={c.id} style={{ color: '#000' }}>{c.nombre}</option>)}
                </select>
                <select value={estadoFiltro} onChange={e => setEstadoFiltro(e.target.value)} style={selSt}>
                  <option value="" style={{ color: '#000' }}>Estado: todos</option>
                  {(['pendiente', 'confirmada', 'pagada', 'observada'] as FacturaStatus[]).map(s => (
                    <option key={s} value={s} style={{ color: '#000' }}>{STATUS_CONFIG[s].label}</option>
                  ))}
                </select>
                <select value={proveedorFiltro} onChange={e => setProveedorFiltro(e.target.value)} style={{ ...selSt, maxWidth: 180 }}>
                  <option value="" style={{ color: '#000' }}>Proveedor: todos</option>
                  {proveedores.map(p => <option key={p.id} value={p.nombre} style={{ color: '#000' }}>{p.nombre}</option>)}
                </select>
                {(catFiltroId || estadoFiltro || proveedorFiltro) && (
                  <button onClick={() => { setCatFiltroId(''); setEstadoFiltro(''); setProveedorFiltro('') }}
                    style={{ ...selSt, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 13 }}>close</span>Limpiar
                  </button>
                )}
              </>
            )
          })()}
        </div>
      </div>

      {/* KPIs estilo Fudo: A vencer / Vencidos / A pagar / Total pagado */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 8, padding: '12px 16px 0' }}>
        {[
          { label: 'A vencer', value: `${kpisGasto.aVencerN} · ${fmt(kpisGasto.aVencerTotal)}`, icon: 'schedule', color: '#4361a0' },
          { label: 'Vencidos', value: `${kpisGasto.vencidasN} · ${fmt(kpisGasto.vencidasTotal)}`, icon: 'error', color: kpisGasto.vencidasN > 0 ? '#dc2626' : 'var(--text-3)' },
          { label: 'A pagar', value: fmt(totalPorPagar), icon: 'account_balance_wallet', color: '#d97706' },
          { label: 'Total pagado', value: fmt(kpisGasto.totalPagado), icon: 'task_alt', color: '#16a34a' },
        ].map(k => (
          <div key={k.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14, color: k.color }}>{k.icon}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{k.label}</span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 800, color: k.color, fontFamily: "'DM Mono', monospace" }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* List */}
      <div data-coach-target="facturas-lista" className="flex-1 overflow-y-auto" style={{ padding: isDesktop ? '0 0 8px' : '16px' }}>
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <span className="text-[13px]" style={{ color: 'var(--text-3)' }}>Cargando...</span>
          </div>
        ) : filtro === 'por_pagar' ? (
          porPagarLoading ? (
            <div className="flex items-center justify-center h-32">
              <span className="text-[13px]" style={{ color: 'var(--text-3)' }}>Cargando...</span>
            </div>
          ) : porPagar.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2" style={{ padding: 16 }}>
              <span className="material-symbols-outlined text-[40px]" style={{ color: '#10b981' }}>task_alt</span>
              <p className="text-[13px] font-medium" style={{ color: 'var(--text-2)' }}>No hay facturas por pagar</p>
              <p className="text-[11px] text-center" style={{ color: 'var(--text-3)' }}>Las compras a crédito (cuenta corriente, 30/60 días) sin pagar aparecen acá</p>
            </div>
          ) : (
            <div style={{ padding: isDesktop ? '12px 16px' : 0 }}>
              {/* Total adeudado */}
              <div className="rounded-[14px] p-4 mb-3" style={{ background: 'var(--navy)', color: '#fff' }}>
                <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ opacity: 0.7 }}>Total adeudado</div>
                <div className="text-[26px] font-bold mt-1">{fmt(totalPorPagar)}</div>
                <div className="text-[11px] mt-1" style={{ opacity: 0.7 }}>
                  {porPagar.length} factura{porPagar.length !== 1 ? 's' : ''} a crédito · {porPagarGrupos.length} proveedor{porPagarGrupos.length !== 1 ? 'es' : ''}
                </div>
                {(resumenVencimientos.vencidas > 0 || resumenVencimientos.estaSemana > 0) && (
                  <div className="flex gap-[8px] mt-3">
                    {resumenVencimientos.vencidas > 0 && (
                      <span className="text-[11px] font-bold px-[8px] py-[4px] rounded-[8px]" style={{ background: 'rgba(239,68,68,.2)', color: '#fecaca' }}>
                        {resumenVencimientos.vencidas} vencida{resumenVencimientos.vencidas !== 1 ? 's' : ''} · {fmt(resumenVencimientos.vencidasTotal)}
                      </span>
                    )}
                    {resumenVencimientos.estaSemana > 0 && (
                      <span className="text-[11px] font-bold px-[8px] py-[4px] rounded-[8px]" style={{ background: 'rgba(245,158,11,.2)', color: '#fde68a' }}>
                        Vencen esta semana: {fmt(resumenVencimientos.estaSemanaTotal)}
                      </span>
                    )}
                  </div>
                )}
              </div>
              {/* Grupos por proveedor */}
              {porPagarGrupos.map(g => (
                <div key={g.proveedor} className="mb-3">
                  <div className="flex items-center justify-between px-1 mb-1">
                    <div className="text-[13px] font-bold truncate" style={{ color: 'var(--text-1)' }}>{g.proveedor}</div>
                    <div className="text-[13px] font-bold whitespace-nowrap ml-2" style={{ color: 'var(--navy)' }}>{fmt(g.total)}</div>
                  </div>
                  {g.facturas.map(f => (
                    <FacturaCard
                      key={f.id}
                      f={f}
                      onClick={() => { setSelectedFactura(f); setView('detail') }}
                      vencimiento={vencimientos.get(f.id)}
                      onMarcarPagada={() => marcarPagadaRapido(f)}
                    />
                  ))}
                </div>
              ))}
            </div>
          )
        ) : facturasFiltradas.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2">
            <span className="material-symbols-outlined text-[40px]" style={{ color: 'var(--text-3)' }}>description</span>
            <p className="text-[13px] font-medium" style={{ color: 'var(--text-3)' }}>Sin facturas</p>
            <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>Carga tu primera factura con IA</p>
          </div>
        ) : isDesktop ? (
          /* ── Desktop: tabla horizontal ── */
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Proveedor</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Fecha</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>N° Factura</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Tipo</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Pago</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Categoría</th>
                <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Total</th>
                <th style={{ padding: '10px 16px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {facturasFiltradas.map((f, i) => {
                const st = STATUS_CONFIG[f.status as FacturaStatus] || STATUS_CONFIG.pendiente
                const cat = f.categoria_gasto_id ? categoriasGastoMap[f.categoria_gasto_id] : null
                return (
                  <tr
                    key={f.id}
                    onClick={() => { setSelectedFactura(f); setView('detail') }}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      background: i % 2 === 0 ? 'var(--surface)' : 'var(--bg)',
                      cursor: 'pointer',
                      transition: 'background .1s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(67,97,160,.07)')}
                    onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? 'var(--surface)' : 'var(--bg)')}
                  >
                    <td style={{ padding: '11px 16px', fontSize: 13, fontWeight: 600, color: 'var(--text-1)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.proveedor_nombre}</td>
                    <td style={{ padding: '11px 12px', fontSize: 12, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{fmtFecha(f.fecha_factura)}</td>
                    <td style={{ padding: '11px 12px', fontSize: 12, color: 'var(--text-3)', fontFamily: "'DM Mono', monospace' " }}>{f.numero_factura ?? '—'}</td>
                    <td style={{ padding: '11px 12px', fontSize: 12, color: 'var(--text-2)' }}>{TIPO_LABELS[f.tipo_factura as TipoFactura] || f.tipo_factura}</td>
                    <td style={{ padding: '11px 12px', fontSize: 12, color: 'var(--text-2)' }}>{f.condicion_pago === 'cuenta_corriente' ? 'Cta. cte.' : 'Contado'}</td>
                    <td style={{ padding: '11px 12px' }}>
                      {cat ? (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: `${FINANCIERA_COLOR[cat.categoria_financiera]}18`, color: FINANCIERA_COLOR[cat.categoria_financiera], whiteSpace: 'nowrap' }}>{cat.nombre}</span>
                      ) : (
                        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '11px 16px', fontSize: 14, fontWeight: 700, color: 'var(--navy)', textAlign: 'right', whiteSpace: 'nowrap' }}>{fmt(f.total)}</td>
                    <td style={{ padding: '11px 16px', textAlign: 'center' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 5, background: st.bg, color: st.color, whiteSpace: 'nowrap' }}>{st.label}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          /* ── Mobile: cards ── */
          <>
            {facturasFiltradas.map(f => (
              <FacturaCard key={f.id} f={f} onClick={() => { setSelectedFactura(f); setView('detail') }} />
            ))}
          </>
        )}
        {hasMore && filtro === 'todas' && (
          <button
            onClick={fetchMore}
            className="w-full py-3 mt-2 rounded-[10px] border-none cursor-pointer text-[13px] font-semibold"
            style={{ background: 'var(--bg)', color: 'var(--accent)', border: '1px solid var(--border)', margin: isDesktop ? '8px 0 0' : undefined }}
          >
            Cargar más facturas ({totalCount - facturas.length} restantes)
          </button>
        )}
      </div>

      {/* FABs */}
      <div data-coach-target="facturas-acciones" className="flex-shrink-0 p-4 flex gap-2" style={{
        paddingBottom: 'max(env(safe-area-inset-bottom, 16px), 16px)',
      }}>
        <button
          data-coach-target="facturas-pos"
          onClick={() => setShowExcelPOS(true)}
          className="py-[14px] px-3 rounded-[14px] border-none cursor-pointer text-[13px] font-bold flex items-center justify-center gap-1"
          style={{ background: '#166534', color: 'white' }}
          title="Importar Excel/CSV de Fudo, Maxirest, Bistrosoft u otro POS"
        >
          <span className="material-symbols-outlined text-[18px]">table_view</span>
          POS
        </button>
        <button
          data-coach-target="facturas-lote"
          onClick={() => setShowBulkUpload(true)}
          className="py-[14px] px-3 rounded-[14px] border-none cursor-pointer text-[13px] font-bold flex items-center justify-center gap-1"
          style={{ background: 'var(--accent)', color: 'white' }}
          title="Cargar varias facturas PDF/imagen con OCR"
        >
          <span className="material-symbols-outlined text-[18px]">upload</span>
          Lote
        </button>
        <button
          onClick={() => { setView('import'); setImportMode(null) }}
          className="flex-1 py-[14px] rounded-[14px] border-none cursor-pointer text-[15px] font-bold text-white flex items-center justify-center gap-2"
          style={{ background: 'var(--navy)' }}
        >
          <span className="material-symbols-outlined text-[20px]">add</span>
          Cargar factura
        </button>
      </div>

      <BulkUploadDrawer
        open={showBulkUpload}
        onClose={() => setShowBulkUpload(false)}
        onSaved={(count) => {
          setShowBulkUpload(false)
          showToast(`✓ ${count} factura${count !== 1 ? 's' : ''} guardada${count !== 1 ? 's' : ''}`)
          fetchFacturas()
        }}
      />

      <ExcelPOSImportModal
        open={showExcelPOS}
        onClose={() => setShowExcelPOS(false)}
        onImported={(count) => {
          showToast(`✓ ${count} factura${count !== 1 ? 's' : ''} importada${count !== 1 ? 's' : ''} desde POS`)
          fetchFacturas()
        }}
      />

      {/* Modal privacidad \u2014 nombres a excluir */}
      {showPrivacidad && (
        <>
          <div className="fixed inset-0 z-[310]" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={() => setShowPrivacidad(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-[311] rounded-t-[20px] flex flex-col" style={{ background: 'var(--surface)', maxHeight: '80vh', paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}>
            <div className="p-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined" style={{ color: 'var(--accent)' }}>shield_person</span>
                  <h3 className="text-[16px] font-bold m-0" style={{ color: 'var(--text-1)' }}>Nombres a excluir</h3>
                </div>
                <button onClick={() => setShowPrivacidad(false)} className="bg-transparent border-none cursor-pointer">
                  <span className="material-symbols-outlined" style={{ color: 'var(--text-3)' }}>close</span>
                </button>
              </div>
              <p className="text-[12px] mt-2 mb-0" style={{ color: 'var(--text-2)' }}>
                Empleados y socios cuyos nombres aparecen en facturas. El OCR los detecta y excluye autom\u00e1ticamente de las compras.
              </p>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <div className="flex gap-2 mb-3">
                <input
                  value={nuevoNombre}
                  onChange={e => setNuevoNombre(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && nuevoNombre.trim()) { guardarNombresExcluidos([...nombresExcluidos, nuevoNombre.trim()]); setNuevoNombre('') } }}
                  placeholder="Ej: Juan P\u00e9rez"
                  className="flex-1 rounded-[10px] px-3 py-2 text-[14px] outline-none"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
                />
                <button
                  onClick={() => { if (nuevoNombre.trim()) { guardarNombresExcluidos([...nombresExcluidos, nuevoNombre.trim()]); setNuevoNombre('') } }}
                  disabled={!nuevoNombre.trim()}
                  className="px-4 rounded-[10px] border-none cursor-pointer text-[14px] font-bold text-white"
                  style={{ background: nuevoNombre.trim() ? 'var(--navy)' : '#ccc' }}
                >
                  Agregar
                </button>
              </div>

              {nombresExcluidos.length === 0 ? (
                <div className="text-center py-8 text-[13px]" style={{ color: 'var(--text-3)' }}>
                  Sin nombres configurados todav\u00eda
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {nombresExcluidos.map((n, i) => (
                    <div key={i} className="flex items-center justify-between rounded-[10px] px-3 py-2" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                      <span className="text-[14px]" style={{ color: 'var(--text-1)' }}>{n}</span>
                      <button onClick={() => guardarNombresExcluidos(nombresExcluidos.filter((_, j) => j !== i))} className="bg-transparent border-none cursor-pointer">
                        <span className="material-symbols-outlined text-[18px]" style={{ color: 'var(--text-3)' }}>delete</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed top-[60px] left-4 right-4 z-[300] rounded-[12px] p-[12px_16px] text-[13px] font-semibold text-white text-center animate-[slideDown_.3s_ease]"
          style={{ background: toast.startsWith('\u2713') ? '#10b981' : '#ef4444' }}>
          {toast}
        </div>
      )}
    </div>
  )
}
