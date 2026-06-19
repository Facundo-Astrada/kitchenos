'use client'

import { useState, useRef, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { useRestauranteId } from '@/lib/hooks/useRestauranteId'
import { createClient } from '@/lib/supabase/client'
import ImportadorArchivo from './ImportadorArchivo'

type WorkbookRef = {
  wb: XLSX.WorkBook
  fileName: string
  ext: string
}

type TipoDetectado = 'stock' | 'proveedores' | 'facturas' | 'recetas' | 'desconocido'
type Confianza = 'alta' | 'media' | 'baja'

interface AnalisisArchivo {
  tipo: TipoDetectado
  confianza: Confianza
  advertencias: string[]
  headers: string[]
  allRows: unknown[][]
  sampleRows: unknown[][]
  fileName: string
  extension: string
  sheetName: string
  rowSheets: string[] // paralelo a allRows: nombre de hoja de cada fila
}

interface ProveedorDB { id: string; nombre: string }

function matchProveedor(sheetName: string, proveedores: ProveedorDB[]): string {
  const sn = sheetName.toLowerCase().trim()
  const exact = proveedores.find(p => p.nombre.toLowerCase().trim() === sn)
  if (exact) return exact.id
  const partial = proveedores.find(p =>
    p.nombre.toLowerCase().includes(sn) || sn.includes(p.nombre.toLowerCase())
  )
  return partial?.id ?? ''
}

interface Pregunta {
  id: string
  icono: string
  texto: string
  detalle: string
  default: boolean
}

function generarPreguntas(_analisis: AnalisisArchivo): Pregunta[] {
  return []
}

const TIPO_LABEL: Record<TipoDetectado, string> = {
  stock: 'Stock / Inventario',
  proveedores: 'Proveedores',
  facturas: 'Facturas',
  recetas: 'Recetario',
  desconocido: 'No identificado',
}

const TIPO_ICON: Record<TipoDetectado, string> = {
  stock: 'inventory_2',
  proveedores: 'storefront',
  facturas: 'receipt_long',
  recetas: 'menu_book',
  desconocido: 'help',
}

const TIPO_DISPONIBLE: Record<TipoDetectado, boolean> = {
  stock: true,
  proveedores: true,
  facturas: false,
  recetas: false,
  desconocido: false,
}

const CONFIANZA_COLOR: Record<Confianza, string> = {
  alta: '#22c55e',
  media: '#f59e0b',
  baja: '#ef4444',
}

// Detecta el tipo de datos que tiene una hoja individual (sin combinar)
function detectarTipoHoja(wb: XLSX.WorkBook, sheetName: string): 'stock' | 'proveedores' | 'producciones' | 'desconocido' {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, defval: '' }) as unknown[][]
  // Buscar la primera fila no-vacía que sirva de encabezado
  const headerRow = (rows.find(r => (r as unknown[]).some(v => String(v ?? '').trim())) ?? []) as unknown[]
  const headerText = headerRow.map(v => String(v ?? '').toLowerCase()).join(' ')

  if (/telefon|proveedor|supplier|rubro|distribuidor|contacto/.test(headerText)) return 'proveedores'
  if (/producci[oó]n|elabora|receta|procedimiento/.test(headerText)) return 'producciones'
  if (/stock|actual|m[ií]nimo|pedir|cantidad|existencia/.test(headerText)) return 'stock'

  // Si el encabezado es ambiguo, ver si algún valor numérico en la posición de "stock actual"
  // parece un teléfono (> 999999 y sin decimales)
  const dataRow = rows.slice(1).find(r => (r as unknown[]).some(v => v !== '' && v != null)) as unknown[] | undefined
  if (dataRow) {
    const numVals = (dataRow as unknown[]).filter(v => typeof v === 'number').map(v => v as number)
    if (numVals.some(v => v > 999999 && Number.isInteger(v))) return 'proveedores'
  }

  return 'desconocido'
}

// Heurística local como fallback
function detectarTipoLocal(headers: string[], rows: unknown[][]): TipoDetectado {
  const texto = headers.join(' ').toLowerCase() +
    rows.slice(0, 3).flat().map(v => String(v ?? '')).join(' ').toLowerCase()

  const scores: Record<TipoDetectado, number> = { stock: 0, proveedores: 0, facturas: 0, recetas: 0, desconocido: 0 }
  if (/stock|cantidad|existencia|insumo|materia prima|inventario/.test(texto)) scores.stock += 3
  if (/precio|costo|precio unit/.test(texto)) scores.stock += 2
  if (/proveedor|supplier|rubro|distribuidor|contacto/.test(texto)) scores.proveedores += 3
  if (/telef|phone|cel/.test(texto)) scores.proveedores += 2
  if (/factura|iva|subtotal|remito|ticket/.test(texto)) scores.facturas += 3
  if (/receta|ficha|ingrediente|porcion|merma|elaboraci/.test(texto)) scores.recetas += 3

  const max = Math.max(...Object.values(scores))
  if (max === 0) return 'desconocido'
  return (Object.entries(scores).find(([, v]) => v === max)?.[0] ?? 'desconocido') as TipoDetectado
}

interface Props {
  onClose: () => void
}

interface FudoPreview { facturas: number; items: number; fileName: string }

export default function ImportadorUniversal({ onClose }: Props) {
  const RESTAURANTE_ID = useRestauranteId()
  const fileRef = useRef<HTMLInputElement>(null)
  const rawFileRef = useRef<File | null>(null)

  const [step, setStep] = useState<'idle' | 'analizando' | 'seleccionar_hoja' | 'confirmar' | 'asignar_proveedores' | 'importando' | 'fudo_preview' | 'stock_fudo_preview' | 'done'>('idle')
  const [fudoPreview, setFudoPreview] = useState<FudoPreview | null>(null)
  const [stockFudoPreview, setStockFudoPreview] = useState<{ fileName: string; total: number; conPrecio: number } | null>(null)
  const [stockFudoResult, setStockFudoResult] = useState<{ actualizados: number; sin_match: number; sin_match_nombres: string[] } | null>(null)
  const [analisis, setAnalisis] = useState<AnalisisArchivo | null>(null)
  const [tipoElegido, setTipoElegido] = useState<TipoDetectado>('desconocido')
  const [error, setError] = useState<string | null>(null)
  const [importCount, setImportCount] = useState(0)
  const [omitidas, setOmitidas] = useState(0)
  const wbRef = useRef<WorkbookRef | null>(null)
  const [hojasDisponibles, setHojasDisponibles] = useState<string[]>([])
  const [hojasSeleccionadas, setHojasSeleccionadas] = useState<string[]>([])
  const [hojaTipos, setHojaTipos] = useState<Record<string, ReturnType<typeof detectarTipoHoja>>>({})
  const [respuestas, setRespuestas] = useState<Record<string, boolean>>({})
  const [proveedoresDB, setProveedoresDB] = useState<ProveedorDB[]>([])
  const [sheetProveedorMap, setSheetProveedorMap] = useState<Record<string, string>>({})
  const [sheetCustomName, setSheetCustomName] = useState<Record<string, string>>({})
  const [creandoProveedor, setCreandoProveedor] = useState(false)

  // Cuando cambia el análisis a stock, cargar proveedores y hacer auto-match
  useEffect(() => {
    if (!analisis || analisis.tipo !== 'stock' || !RESTAURANTE_ID) return
    const supabase = createClient()
    supabase.from('proveedores').select('id, nombre').eq('restaurante_id', RESTAURANTE_ID).eq('activo', true)
      .then(({ data }) => {
        if (!data) return
        setProveedoresDB(data)
        const uniqueSheets = [...new Set(analisis.rowSheets)]
        const autoMap: Record<string, string> = {}
        for (const s of uniqueSheets) { const m = matchProveedor(s, data); if (m) autoMap[s] = m }
        setSheetProveedorMap(autoMap)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analisis?.tipo, RESTAURANTE_ID])

  function toggleHoja(hoja: string) {
    setHojasSeleccionadas(prev =>
      prev.includes(hoja) ? prev.filter(h => h !== hoja) : [...prev, hoja]
    )
  }

  async function analizarHojas(sheetNames: string[]) {
    if (!wbRef.current || sheetNames.length === 0) return
    const { wb, fileName, ext } = wbRef.current
    setStep('analizando')
    setError(null)
    try {
      // Usar la primera hoja seleccionada para detectar headers y estructura
      const primeraHoja = sheetNames[0]
      const parsedFirst = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[primeraHoja], { header: 1, defval: '' }) as unknown[][]
      const headers = (parsedFirst[0] ?? []).map((h, i) => {
        const s = String(h ?? '').trim()
        return s || `(col. ${String.fromCharCode(65 + i)})`
      })
      if (headers.length === 0) throw new Error('No se pudieron detectar columnas.')

      // Combinar filas de TODAS las hojas seleccionadas + trackear origen por fila
      // Cada hoja se normaliza independientemente para evitar contaminación de categorías entre hojas.
      const allRows: unknown[][] = []
      const rowSheetsList: string[] = []

      for (const sheetName of sheetNames) {
        const parsed = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, defval: '' }) as unknown[][]

        // Detectar Layout B: primera fila no-vacía tiene contenido en col 0 + "stock/actual" en col 1 o 2
        const primeraNoVacia = parsed.find(r => (r as unknown[]).some(v => String(v ?? '').trim())) as unknown[] | undefined
        const pnv0 = String(primeraNoVacia?.[0] ?? '').trim()
        const pnv1 = String(primeraNoVacia?.[1] ?? '').toLowerCase()
        const pnv2 = String(primeraNoVacia?.[2] ?? '').toLowerCase()
        const esLayoutB = pnv0.length > 0 && (/stock|actual/.test(pnv1) || /stock|actual/.test(pnv2))

        let seccionActual = ''  // nombre de sección actual → se inyecta como categoría
        const fuente = esLayoutB ? parsed : parsed.slice(1)  // Layout B: no hay fila header separada

        for (const r of fuente) {
          const row = r as unknown[]
          if (!row.some(v => String(v ?? '').trim())) continue  // saltar filas vacías

          const c0 = String(row[0] ?? '').trim()
          const c1 = String(row[1] ?? '').trim()
          const c2 = String(row[2] ?? '').toLowerCase()
          const c3 = String(row[3] ?? '').toLowerCase()

          if (esLayoutB) {
            // Detectar sub-encabezado de sección: col 0 = nombre, col 1 o 2 tiene "stock/actual/minimo"
            if (c0 && (/stock|actual|minimo/.test(c2) || /stock|actual|minimo/.test(String(row[1] ?? '').toLowerCase()))) {
              seccionActual = c0
              continue
            }
            // Fila de datos: prepend sección como categoría y vacío alineador
            allRows.push([seccionActual, ...row])
          } else {
            // Detectar sub-encabezado de sección Layout A:
            // col A vacío, col B = nombre, col C o D contiene "stock/actual/minimo/pedir"
            const esSub = !c0 && c1 && (/stock|actual|minimo|pedir/.test(c2) || /stock|actual|minimo|pedir/.test(c3))
            if (esSub) {
              seccionActual = c1
              continue
            }
            // Fila de datos: si col A está vacía y hay sección activa, inyectarla como categoría
            if (!c0 && seccionActual) {
              allRows.push([seccionActual, ...row.slice(1)])
            } else {
              allRows.push(row)
            }
          }
          rowSheetsList.push(sheetName)
        }
      }
      if (allRows.length > 2000) throw new Error(`Las ${sheetNames.length} hojas suman ${allRows.length} filas. El máximo es 2000.`)

      const sampleRows = allRows.slice(0, 8)
      let tipo: TipoDetectado = detectarTipoLocal(headers, sampleRows)
      let confianza: Confianza = 'baja'
      let advertencias: string[] = []

      try {
        const res = await fetch('/api/importador/mapeo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ headers, sampleRows, tipo: 'auto', fileName }),
        })
        if (res.ok) {
          const json = await res.json() as { tipo_detectado?: string; confianza?: string; advertencias?: string[] }
          if (json.tipo_detectado && json.tipo_detectado !== 'desconocido') tipo = json.tipo_detectado as TipoDetectado
          confianza = (json.confianza ?? 'media') as Confianza
          advertencias = json.advertencias ?? []
        }
      } catch { /* usa detección local */ }

      const sheetName = sheetNames.length === 1 ? sheetNames[0] : ''
      const nuevoAnalisis = { tipo, confianza, advertencias, headers, allRows, sampleRows, fileName, extension: ext, sheetName, rowSheets: rowSheetsList }
      setAnalisis(nuevoAnalisis)
      setTipoElegido(tipo)
      const defaults: Record<string, boolean> = {}
      for (const p of generarPreguntas(nuevoAnalisis)) defaults[p.id] = p.default
      setRespuestas(defaults)
      setStep('confirmar')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al analizar las hojas')
      setStep('seleccionar_hoja')
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setStep('analizando')

    try {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? ''

      if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
        const buffer = await file.arrayBuffer()
        const wb = XLSX.read(buffer, { type: 'array' })
        wbRef.current = { wb, fileName: file.name, ext }
        rawFileRef.current = file

        // Detectar formato Fudo Stock (tiene hojas Ingredientes o Productos con "Costo unitario")
        const stockSheets = wb.SheetNames.filter(s => s === 'Ingredientes' || s === 'Productos')
        if (stockSheets.length > 0) {
          let total = 0
          let conPrecio = 0
          for (const sheetName of stockSheets) {
            const raw = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, defval: '' }) as unknown[][]
            const hIdx = raw.findIndex(r => (r as unknown[]).some(c => String(c).trim() === 'Costo unitario'))
            if (hIdx < 0) continue
            const headers = raw[hIdx] as string[]
            const cNombre = headers.findIndex(h => String(h).trim().toLowerCase() === 'nombre')
            const cPrecio = headers.findIndex(h => String(h).trim() === 'Costo unitario')
            for (const r of raw.slice(hIdx + 1)) {
              const row = r as unknown[]
              if (!String(row[cNombre] ?? '').trim()) continue
              total++
              if ((parseFloat(String(row[cPrecio] ?? '')) || 0) > 0) conPrecio++
            }
          }
          setStockFudoPreview({ fileName: file.name, total, conPrecio })
          setStep('stock_fudo_preview')
          if (fileRef.current) fileRef.current.value = ''
          return
        }

        // Detectar formato Fudo (tiene hojas Gastos + Detalle)
        if (wb.SheetNames.includes('Gastos') && wb.SheetNames.includes('Detalle')) {
          const gastosRaw = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['Gastos'], { header: 1, defval: '' }) as unknown[][]
          const hIdx = gastosRaw.findIndex(r => String((r as unknown[])[0]).trim() === 'Id')
          const gastosData = hIdx >= 0 ? gastosRaw.slice(hIdx + 1) : []
          const gHeaders = hIdx >= 0 ? (gastosRaw[hIdx] as string[]) : []
          const gCancelado = Math.max(0, gHeaders.findIndex(h => String(h).trim().toLowerCase() === 'cancelado'))
          const facturaCount = gastosData.filter(r => {
            const row = r as unknown[]
            return row[0] && String(row[gCancelado] ?? '').trim() !== 'Sí'
          }).length

          const detalleRaw = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['Detalle'], { header: 1, defval: '' }) as unknown[][]
          const dHIdx = detalleRaw.findIndex(r => String((r as unknown[])[0]).trim() === 'IdGasto')
          const dStart = dHIdx >= 0 ? dHIdx + 1 : 1
          const dHeaders = dHIdx >= 0 ? (detalleRaw[dHIdx] as string[]) : []
          const dCancelado = Math.max(0, dHeaders.findIndex(h => String(h).trim().toLowerCase() === 'cancelado'))
          const dDescIdx = Math.max(0, dHeaders.findIndex(h => /descripci[oó]n/i.test(String(h).trim())))
          const itemCount = detalleRaw.slice(dStart).filter(r => {
            const row = r as unknown[]
            return row[0] && String(row[dCancelado] ?? '').trim() !== 'Sí' && String(row[dDescIdx] ?? '').trim().toLowerCase() !== 'iva'
          }).length
          setFudoPreview({ facturas: facturaCount, items: itemCount, fileName: file.name })
          setStep('fudo_preview')
          if (fileRef.current) fileRef.current.value = ''
          return
        }

        if (wb.SheetNames.length > 1) {
          // Detectar tipo de cada hoja y pre-seleccionar solo las de stock
          const tipos: Record<string, ReturnType<typeof detectarTipoHoja>> = {}
          for (const s of wb.SheetNames) tipos[s] = detectarTipoHoja(wb, s)
          setHojaTipos(tipos)
          setHojasDisponibles(wb.SheetNames)
          // Pre-seleccionar solo las que no son claramente proveedores/producciones
          const preSeleccionadas = wb.SheetNames.filter(s => tipos[s] !== 'proveedores' && tipos[s] !== 'producciones')
          setHojasSeleccionadas(preSeleccionadas.length > 0 ? preSeleccionadas : wb.SheetNames)
          setStep('seleccionar_hoja')
          if (fileRef.current) fileRef.current.value = ''
          return
        }
        // Una sola hoja: continuar directo
        await analizarHojas([wb.SheetNames[0]])
      } else if (ext === 'docx') {
        const mammoth = await import('mammoth')
        const buffer = await file.arrayBuffer()
        const result = await mammoth.extractRawText({ arrayBuffer: buffer })
        const lines = result.value.split('\n').map(l => l.trim()).filter(Boolean)
        const tableLine = lines.find(l => l.includes('\t') || l.split(/\s{2,}/).length >= 3)
        let headers: string[] = []
        let allRows: unknown[][] = []
        if (tableLine) {
          const sep = tableLine.includes('\t') ? '\t' : /\s{2,}/
          const startIdx = lines.indexOf(tableLine) + 1
          headers = tableLine.split(sep).map(s => s.trim()).filter(Boolean)
          allRows = lines.slice(startIdx).map(l => l.split(sep).map(s => s.trim()))
        } else {
          headers = lines.slice(0, 6)
          allRows = [lines.slice(6, 12)]
        }
        const sampleRows = allRows.slice(0, 8)
        if (headers.length === 0) throw new Error('No se pudieron detectar columnas en el archivo.')

        let tipo: TipoDetectado = detectarTipoLocal(headers, sampleRows)
        let confianza: Confianza = 'baja'
        let advertencias: string[] = []
        try {
          const res = await fetch('/api/importador/mapeo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ headers, sampleRows, tipo: 'auto', fileName: file.name }),
          })
          if (res.ok) {
            const json = await res.json() as { tipo_detectado?: string; confianza?: string; advertencias?: string[] }
            if (json.tipo_detectado && json.tipo_detectado !== 'desconocido') tipo = json.tipo_detectado as TipoDetectado
            confianza = (json.confianza ?? 'media') as Confianza
            advertencias = json.advertencias ?? []
          }
        } catch { /* usa detección local */ }

        const nuevoAnalisis = { tipo, confianza, advertencias, headers, allRows, sampleRows, fileName: file.name, extension: ext, sheetName: '', rowSheets: [] }
        setAnalisis(nuevoAnalisis)
        setTipoElegido(tipo)
        const defaults: Record<string, boolean> = {}
        for (const p of generarPreguntas(nuevoAnalisis)) defaults[p.id] = p.default
        setRespuestas(defaults)
        setStep('confirmar')
      } else {
        throw new Error('Formato no soportado. Usá .xlsx, .xls, .csv o .docx')
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al leer el archivo')
      setStep('idle')
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  function inyectarProveedores(map: Record<string, string>) {
    if (!analisis) return
    const newHeaders = [...analisis.headers, '__proveedor_id__']
    const newAllRows = analisis.allRows.map((row, idx) => {
      const sheet = analisis.rowSheets[idx] ?? ''
      return [...(row as unknown[]), map[sheet] ?? '']
    })
    setAnalisis({ ...analisis, headers: newHeaders, allRows: newAllRows })
    setCreandoProveedor(false)
    setStep('importando')
  }

  async function confirmarProveedores() {
    if (!analisis) return
    setCreandoProveedor(true)
    const supabase = createClient()
    const finalMap = { ...sheetProveedorMap }
    for (const [sheet, val] of Object.entries(finalMap)) {
      if (val === '__nuevo__') {
        const nombre = (sheetCustomName[sheet] ?? sheet).trim()
        if (!nombre) { finalMap[sheet] = ''; continue }
        const { data } = await supabase
          .from('proveedores')
          .insert({ nombre, restaurante_id: RESTAURANTE_ID, activo: true, rubro: '', telefono: '', dias_entrega: [] })
          .select('id')
          .single()
        finalMap[sheet] = data?.id ?? ''
      }
    }
    inyectarProveedores(finalMap)
  }

  async function importarFudo() {
    if (!rawFileRef.current || !RESTAURANTE_ID) return
    setStep('analizando')
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', rawFileRef.current)
      fd.append('restauranteId', RESTAURANTE_ID)
      const res = await fetch('/api/importador/facturas-fudo', { method: 'POST', body: fd })
      const data = await res.json() as { importadas?: number; items?: number; omitidas?: number; error?: string }
      if (data.error) { setError(data.error); setStep('fudo_preview'); return }
      setImportCount(data.importadas ?? 0)
      setOmitidas(data.omitidas ?? 0)
      setStep('done')
    } catch {
      setError('Error al importar. Intentá de nuevo.')
      setStep('fudo_preview')
    }
  }

  async function importarStockFudo() {
    if (!rawFileRef.current || !RESTAURANTE_ID) return
    setStep('analizando')
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', rawFileRef.current)
      fd.append('restauranteId', RESTAURANTE_ID)
      const res = await fetch('/api/importador/stock-fudo', { method: 'POST', body: fd })
      const data = await res.json() as { actualizados?: number; sin_match?: number; sin_match_nombres?: string[]; error?: string }
      if (data.error) { setError(data.error); setStep('stock_fudo_preview'); return }
      setStockFudoResult({ actualizados: data.actualizados ?? 0, sin_match: data.sin_match ?? 0, sin_match_nombres: data.sin_match_nombres ?? [] })
      setImportCount(data.actualizados ?? 0)
      setStep('done')
    } catch {
      setError('Error al importar. Intentá de nuevo.')
      setStep('stock_fudo_preview')
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const importConfig: Record<string, unknown> = {}

  // Si el usuario confirmó un tipo disponible, delegar al ImportadorArchivo existente
  if (step === 'importando' && analisis && (tipoElegido === 'stock' || tipoElegido === 'proveedores')) {
    return (
      <ImportadorArchivo
        tipo={tipoElegido}
        restauranteId={RESTAURANTE_ID}
        initialHeaders={analisis.headers}
        initialRows={analisis.allRows}
        initialFileName={analisis.fileName}
        importConfig={importConfig}
        onImportCompleto={(n) => { setImportCount(n); setStep('done') }}
        onClose={onClose}
      />
    )
  }

  if (step === 'done') {
    return (
      <>
        <div className="fixed inset-0 z-[300]" style={{ background: 'rgba(0,0,0,.55)' }} onClick={onClose} />
        <div className="fixed inset-0 z-[301] flex flex-col" style={{ background: 'var(--bg)', maxWidth: 520, margin: '0 auto' }}>
          <div style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 14px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'rgba(255,255,255,.6)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 22 }}>arrow_back</span>
            </button>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#fff' }}>Importación completada</div>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 64, color: '#22c55e' }}>check_circle</span>
            {stockFudoResult ? (
              <>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-1)' }}>{stockFudoResult.actualizados} precios actualizados</div>
                {stockFudoResult.sin_match > 0 && (
                  <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 12, color: '#f59e0b', fontWeight: 600 }}>
                      {stockFudoResult.sin_match} sin coincidencia en stock:
                    </div>
                    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', maxHeight: 160, overflowY: 'auto' }}>
                      {stockFudoResult.sin_match_nombres.map(n => (
                        <div key={n} style={{ fontSize: 11, color: 'var(--text-3)', padding: '2px 0', borderBottom: '1px solid var(--border)' }}>{n}</div>
                      ))}
                      {stockFudoResult.sin_match > 30 && (
                        <div style={{ fontSize: 11, color: 'var(--text-3)', padding: '4px 0', fontStyle: 'italic' }}>
                          …y {stockFudoResult.sin_match - 30} más
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-1)' }}>{importCount} facturas importadas</div>
                {omitidas > 0 && (
                  <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{omitidas} omitidas (canceladas en FUDO)</div>
                )}
              </>
            )}
            <button onClick={onClose} style={{ background: 'var(--navy)', border: 'none', borderRadius: 12, padding: '14px 32px', fontSize: 14, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
              Listo
            </button>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="fixed inset-0 z-[300]" style={{ background: 'rgba(0,0,0,.55)' }} onClick={onClose} />
      <div className="fixed inset-0 z-[301] flex flex-col" style={{ background: 'var(--bg)', maxWidth: 520, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ background: 'var(--navy)', padding: 'var(--header-top) 16px 14px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'rgba(255,255,255,.6)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22 }}>arrow_back</span>
          </button>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#fff' }}>Importar datos</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,.5)', marginTop: 1 }}>La IA detecta el tipo automáticamente</div>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>

          {error && (
            <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#ef4444' }}>
              {error}
            </div>
          )}

          {/* STEP: idle */}
          {step === 'idle' && (
            <>
              <div
                onClick={() => fileRef.current?.click()}
                style={{ border: '2px dashed var(--border)', borderRadius: 16, padding: '40px 24px', textAlign: 'center', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 52, color: 'var(--text-3)' }}>upload_file</span>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>Subir archivo</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>.xlsx · .xls · .csv · .docx</div>
                <input ref={fileRef} type="file" accept=".xls,.xlsx,.csv,.docx" style={{ display: 'none' }} onChange={handleFile} />
              </div>

              {/* Tipos soportados */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {(['stock', 'proveedores', 'facturas', 'recetas'] as TipoDetectado[]).map(t => (
                  <div key={t} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, opacity: TIPO_DISPONIBLE[t] ? 1 : 0.45 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--accent)' }}>{TIPO_ICON[t]}</span>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>{TIPO_LABEL[t]}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{TIPO_DISPONIBLE[t] ? 'Disponible' : 'Próximamente'}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* STEP: seleccionar hoja */}
          {step === 'seleccionar_hoja' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ background: 'rgba(67,97,160,.07)', border: '1px solid rgba(67,97,160,.2)', borderRadius: 12, padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--accent)', flexShrink: 0, marginTop: 1 }}>table_chart</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>El archivo tiene {hojasDisponibles.length} hojas</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>Seleccioná las que querés importar</div>
                </div>
              </div>

              {error && (
                <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#ef4444' }}>
                  {error}
                </div>
              )}

              {/* Seleccionar todas / ninguna */}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setHojasSeleccionadas(hojasDisponibles)}
                  style={{ flex: 1, padding: '7px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 12, fontWeight: 600, color: 'var(--accent)', cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  Todas
                </button>
                <button
                  onClick={() => setHojasSeleccionadas([])}
                  style={{ flex: 1, padding: '7px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 12, fontWeight: 600, color: 'var(--text-3)', cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  Ninguna
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {hojasDisponibles.map((hoja, i) => {
                  const seleccionada = hojasSeleccionadas.includes(hoja)
                  return (
                    <button
                      key={hoja}
                      onClick={() => toggleHoja(hoja)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px',
                        borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                        border: `2px solid ${seleccionada ? 'var(--accent)' : 'var(--border)'}`,
                        background: seleccionada ? 'rgba(67,97,160,.08)' : 'var(--surface)',
                      }}
                    >
                      {/* Checkbox visual */}
                      <div style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: seleccionada ? 'var(--accent)' : 'transparent', border: seleccionada ? 'none' : '2px solid var(--border)' }}>
                        {seleccionada && <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#fff' }}>check</span>}
                      </div>
                      <div style={{ width: 22, height: 22, borderRadius: 6, background: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)' }}>{i + 1}</span>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', flex: 1 }}>{hoja}</span>
                      {hojaTipos[hoja] === 'proveedores' && (
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 10, background: 'rgba(245,158,11,.15)', color: '#f59e0b' }}>PROVEEDORES</span>
                      )}
                      {hojaTipos[hoja] === 'producciones' && (
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 10, background: 'rgba(139,92,246,.15)', color: '#8b5cf6' }}>PRODUCCIÓN</span>
                      )}
                    </button>
                  )
                })}
              </div>

              <button
                onClick={() => analizarHojas(hojasSeleccionadas)}
                disabled={hojasSeleccionadas.length === 0}
                style={{ background: hojasSeleccionadas.length === 0 ? 'var(--border)' : 'var(--navy)', border: 'none', borderRadius: 12, padding: '14px', fontSize: 14, fontWeight: 700, color: '#fff', cursor: hojasSeleccionadas.length === 0 ? 'default' : 'pointer', fontFamily: 'inherit' }}
              >
                {hojasSeleccionadas.length === 0
                  ? 'Seleccioná al menos una hoja'
                  : hojasSeleccionadas.length === 1
                    ? `Analizar "${hojasSeleccionadas[0]}" →`
                    : `Analizar ${hojasSeleccionadas.length} hojas →`}
              </button>

              <button
                onClick={() => { setStep('idle'); wbRef.current = null; setHojasDisponibles([]); setHojasSeleccionadas([]) }}
                style={{ background: 'none', border: 'none', fontSize: 13, color: 'var(--text-3)', cursor: 'pointer', padding: '4px 0', fontFamily: 'inherit' }}
              >
                Cancelar y subir otro archivo
              </button>
            </div>
          )}

          {/* STEP: analizando */}
          {step === 'analizando' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 16, paddingTop: 60 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'var(--accent)', animation: 'spin 1s linear infinite' }}>progress_activity</span>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>Analizando archivo…</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>La IA está interpretando el contenido</div>
            </div>
          )}

          {/* STEP: fudo_preview */}
          {step === 'fudo_preview' && fudoPreview && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Archivo */}
              <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--text-3)' }}>description</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{fudoPreview.fileName}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Export de Fudo detectado</div>
                </div>
              </div>

              {/* Badge Fudo */}
              <div style={{ background: 'rgba(67,97,160,.07)', border: '1px solid rgba(67,97,160,.2)', borderRadius: 12, padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'center' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--accent)', flexShrink: 0 }}>receipt_long</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>Facturas listas para importar</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>
                    {fudoPreview.facturas.toLocaleString('es-AR')} facturas · {fudoPreview.items.toLocaleString('es-AR')} items de detalle
                  </div>
                </div>
              </div>

              {/* Qué se va a importar */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  { icon: 'storefront', text: 'Proveedor y fecha de cada factura' },
                  { icon: 'tag', text: 'Tipo y número de comprobante (A, C, Recibo, Remito)' },
                  { icon: 'inventory_2', text: 'Items con cantidad, unidad y precio unitario' },
                  { icon: 'payments', text: 'Estado de pago (pagada / pendiente)' },
                ].map(({ icon, text }) => (
                  <div key={icon} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 15, color: 'var(--accent)' }}>{icon}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{text}</span>
                  </div>
                ))}
              </div>

              <button
                onClick={() => void importarFudo()}
                style={{ background: 'var(--navy)', border: 'none', borderRadius: 12, padding: '14px', fontSize: 14, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Importar {fudoPreview.facturas.toLocaleString('es-AR')} facturas →
              </button>
              <button
                onClick={() => { setStep('idle'); rawFileRef.current = null; setFudoPreview(null) }}
                style={{ background: 'none', border: 'none', fontSize: 13, color: 'var(--text-3)', cursor: 'pointer', padding: '4px 0', fontFamily: 'inherit' }}
              >
                Cancelar
              </button>
            </div>
          )}

          {/* STEP: stock_fudo_preview */}
          {step === 'stock_fudo_preview' && stockFudoPreview && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--text-3)' }}>description</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{stockFudoPreview.fileName}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Export de stock Fudo detectado</div>
                </div>
              </div>

              <div style={{ background: 'rgba(34,197,94,.07)', border: '1px solid rgba(34,197,94,.2)', borderRadius: 12, padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'center' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 28, color: '#16a34a', flexShrink: 0 }}>price_change</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>Actualizar precios de stock</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>
                    {stockFudoPreview.conPrecio.toLocaleString('es-AR')} productos con precio · {(stockFudoPreview.total - stockFudoPreview.conPrecio).toLocaleString('es-AR')} sin precio
                  </div>
                </div>
              </div>

              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  { icon: 'match_word', text: 'Busca cada producto por nombre en tu stock de KitchenOS' },
                  { icon: 'price_check', text: 'Actualiza el precio unitario de los que coincidan' },
                  { icon: 'inventory_2', text: 'No modifica stock ni otros datos' },
                ].map(({ icon, text }) => (
                  <div key={icon} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 15, color: '#16a34a' }}>{icon}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{text}</span>
                  </div>
                ))}
              </div>

              {error && <div style={{ fontSize: 12, color: '#ef4444', padding: '8px 12px', background: 'rgba(239,68,68,.08)', borderRadius: 8 }}>{error}</div>}

              <button
                onClick={() => void importarStockFudo()}
                style={{ background: '#16a34a', border: 'none', borderRadius: 12, padding: '14px', fontSize: 14, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Actualizar {stockFudoPreview.conPrecio.toLocaleString('es-AR')} precios →
              </button>
              <button
                onClick={() => { setStep('idle'); rawFileRef.current = null; setStockFudoPreview(null); setError(null) }}
                style={{ background: 'none', border: 'none', fontSize: 13, color: 'var(--text-3)', cursor: 'pointer', padding: '4px 0', fontFamily: 'inherit' }}
              >
                Cancelar
              </button>
            </div>
          )}

          {/* STEP: confirmar tipo */}
          {step === 'confirmar' && analisis && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Archivo */}
              <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--text-3)' }}>description</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{analisis.fileName}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                    {hojasSeleccionadas.length === 1 && <span>Hoja: <strong>{hojasSeleccionadas[0]}</strong> · </span>}
                    {hojasSeleccionadas.length > 1 && <span>{hojasSeleccionadas.length} hojas combinadas · </span>}
                    {analisis.headers.length} columnas · {analisis.allRows.length} filas
                  </div>
                </div>
              </div>

              {/* Tipo detectado */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-3)', marginBottom: 8 }}>
                  Tipo detectado
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {(['stock', 'proveedores', 'facturas', 'recetas'] as TipoDetectado[]).map(t => {
                    const esDetectado = t === analisis.tipo
                    const seleccionado = t === tipoElegido
                    const disponible = TIPO_DISPONIBLE[t]
                    return (
                      <button
                        key={t}
                        onClick={() => disponible && setTipoElegido(t)}
                        disabled={!disponible}
                        style={{
                          padding: '12px 14px', borderRadius: 12, cursor: disponible ? 'pointer' : 'default',
                          border: `2px solid ${seleccionado ? 'var(--accent)' : 'var(--border)'}`,
                          background: seleccionado ? 'rgba(67,97,160,.08)' : 'var(--surface)',
                          display: 'flex', alignItems: 'center', gap: 10, opacity: disponible ? 1 : 0.4,
                          fontFamily: 'inherit', textAlign: 'left',
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 20, color: seleccionado ? 'var(--accent)' : 'var(--text-3)', flexShrink: 0 }}>{TIPO_ICON[t]}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>{TIPO_LABEL[t]}</div>
                          {esDetectado && (
                            <div style={{ fontSize: 10, color: CONFIANZA_COLOR[analisis.confianza], fontWeight: 600 }}>
                              IA: {analisis.confianza} confianza
                            </div>
                          )}
                          {!disponible && <div style={{ fontSize: 10, color: 'var(--text-3)' }}>Próximamente</div>}
                        </div>
                        {seleccionado && <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--accent)', flexShrink: 0 }}>check_circle</span>}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Advertencias */}
              {analisis.advertencias.length > 0 && (
                <div style={{ background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.25)', borderRadius: 10, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '.05em' }}>Advertencias</div>
                  {analisis.advertencias.map((a, i) => (
                    <div key={i} style={{ fontSize: 12, color: 'var(--text-2)', display: 'flex', gap: 6 }}>
                      <span>·</span><span>{a}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Preguntas contextuales */}
              {(() => {
                const preguntas = generarPreguntas(analisis)
                if (preguntas.length === 0) return null
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-3)' }}>
                      Confirmá antes de importar
                    </div>
                    {preguntas.map(p => {
                      const valor = respuestas[p.id] !== undefined ? respuestas[p.id] : p.default
                      return (
                        <div key={p.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--accent)', flexShrink: 0 }}>{p.icono}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>{p.texto}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{p.detalle}</div>
                          </div>
                          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                            {[false, true].map(v => (
                              <button
                                key={String(v)}
                                onClick={() => setRespuestas(prev => ({ ...prev, [p.id]: v }))}
                                style={{
                                  padding: '5px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                                  border: valor === v ? 'none' : '1px solid var(--border)',
                                  background: valor === v ? (v ? 'var(--accent)' : 'rgba(239,68,68,.15)') : 'var(--bg)',
                                  color: valor === v ? (v ? '#fff' : '#ef4444') : 'var(--text-3)',
                                }}
                              >
                                {v ? 'Sí' : 'No'}
                              </button>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}

              {/* Muestra de datos */}
              {analisis.sampleRows.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-3)', marginBottom: 6 }}>Muestra</div>
                  <div style={{ background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
                    {analisis.sampleRows.slice(0, 3).map((row, i) => (
                      <div key={i} style={{ padding: '7px 12px', borderBottom: i < 2 ? '1px solid var(--border)' : 'none', fontSize: 11, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {(row as unknown[]).slice(0, 4).map(v => String(v ?? '').trim()).filter(Boolean).join('  ·  ')}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Acción */}
              {TIPO_DISPONIBLE[tipoElegido] ? (
                <button
                  onClick={() => tipoElegido === 'stock' ? setStep('asignar_proveedores') : setStep('importando')}
                  style={{ background: 'var(--navy)', border: 'none', borderRadius: 12, padding: '14px', fontSize: 14, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  Continuar como {TIPO_LABEL[tipoElegido]} →
                </button>
              ) : (
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px', fontSize: 13, color: 'var(--text-3)', textAlign: 'center' }}>
                  La importación de {TIPO_LABEL[tipoElegido]} estará disponible próximamente
                </div>
              )}
            </div>
          )}

          {/* STEP: asignar proveedores */}
          {step === 'asignar_proveedores' && analisis && (() => {
            const uniqueSheets = [...new Set(analisis.rowSheets.length ? analisis.rowSheets : [analisis.sheetName].filter(Boolean))]
            const rowCountBySheet: Record<string, number> = {}
            for (const s of analisis.rowSheets) rowCountBySheet[s] = (rowCountBySheet[s] ?? 0) + 1

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ background: 'rgba(67,97,160,.07)', border: '1px solid rgba(67,97,160,.2)', borderRadius: 12, padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--accent)', flexShrink: 0, marginTop: 1 }}>storefront</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>¿Qué proveedor corresponde a cada hoja?</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                      {proveedoresDB.length > 0 ? 'La IA hizo una sugerencia automática. Confirmá o cambiá.' : 'Podés asignar un proveedor existente o saltear este paso.'}
                    </div>
                  </div>
                </div>

                {uniqueSheets.length === 0 && (
                  <div style={{ fontSize: 13, color: 'var(--text-3)', textAlign: 'center', padding: '16px 0' }}>
                    No hay hojas para asignar
                  </div>
                )}

                {uniqueSheets.map(sheet => {
                  const count = rowCountBySheet[sheet] ?? analisis.allRows.length
                  const selectedId = sheetProveedorMap[sheet] ?? ''
                  const esNuevo = selectedId === '__nuevo__'
                  const nombreNuevo = sheetCustomName[sheet] ?? sheet
                  const asignado = selectedId && !esNuevo
                  return (
                    <div key={sheet} style={{ background: 'var(--surface)', border: `1px solid ${asignado || esNuevo ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{sheet}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{count} artículos</div>
                        </div>
                        {(asignado || (esNuevo && nombreNuevo.trim())) && (
                          <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#22c55e' }}>check_circle</span>
                        )}
                      </div>

                      <select
                        value={selectedId}
                        onChange={e => {
                          const v = e.target.value
                          setSheetProveedorMap(prev => ({ ...prev, [sheet]: v }))
                          if (v === '__nuevo__' && !sheetCustomName[sheet]) {
                            setSheetCustomName(prev => ({ ...prev, [sheet]: sheet }))
                          }
                        }}
                        style={{ fontSize: 12, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: selectedId ? 'var(--text-1)' : 'var(--text-3)', fontFamily: 'inherit', cursor: 'pointer' }}
                      >
                        <option value=''>— Sin proveedor —</option>
                        {proveedoresDB.map(p => (
                          <option key={p.id} value={p.id}>{p.nombre}</option>
                        ))}
                        <option value='__nuevo__'>+ Crear nuevo proveedor…</option>
                      </select>

                      {/* Input nombre libre cuando "Crear nuevo" está seleccionado */}
                      {esNuevo && (
                        <input
                          type="text"
                          autoFocus
                          placeholder="Nombre del proveedor"
                          value={nombreNuevo}
                          onChange={e => setSheetCustomName(prev => ({ ...prev, [sheet]: e.target.value }))}
                          style={{ fontSize: 13, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--accent)', background: 'var(--bg)', color: 'var(--text-1)', fontFamily: 'inherit', outline: 'none' }}
                        />
                      )}

                      {/* Chip sugerencia cuando no hay proveedor asignado */}
                      {!selectedId && (
                        <button
                          onClick={() => {
                            setSheetProveedorMap(prev => ({ ...prev, [sheet]: '__nuevo__' }))
                            setSheetCustomName(prev => ({ ...prev, [sheet]: sheet }))
                          }}
                          style={{ alignSelf: 'flex-start', background: 'rgba(67,97,160,.08)', border: '1px solid rgba(67,97,160,.25)', borderRadius: 20, padding: '4px 10px', fontSize: 11, fontWeight: 600, color: 'var(--accent)', cursor: 'pointer', fontFamily: 'inherit' }}
                        >
                          ¿Crear &quot;{sheet}&quot; como proveedor?
                        </button>
                      )}
                    </div>
                  )
                })}

                <button
                  onClick={() => void confirmarProveedores()}
                  disabled={creandoProveedor}
                  style={{ background: creandoProveedor ? 'var(--border)' : 'var(--navy)', border: 'none', borderRadius: 12, padding: '14px', fontSize: 14, fontWeight: 700, color: '#fff', cursor: creandoProveedor ? 'default' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                >
                  {creandoProveedor
                    ? <><span className="material-symbols-outlined" style={{ fontSize: 18, animation: 'spin 1s linear infinite' }}>progress_activity</span> Creando proveedores…</>
                    : 'Confirmar y continuar →'}
                </button>
                <button
                  onClick={() => inyectarProveedores({})}
                  disabled={creandoProveedor}
                  style={{ background: 'none', border: 'none', fontSize: 13, color: 'var(--text-3)', cursor: 'pointer', padding: '4px 0', fontFamily: 'inherit' }}
                >
                  Continuar sin asignar proveedor
                </button>
              </div>
            )
          })()}
        </div>
      </div>
    </>
  )
}
