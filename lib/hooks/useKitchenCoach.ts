'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useRestauranteId } from './useRestauranteId'

export interface CoachMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  options?: string[]
}

interface CoachContext {
  stockCritico?: Array<{ nombre: string; cantidad: number; minimo: number }>
  tareasPendientes?: Array<{ titulo: string; prioridad: string; plaza?: string }>
}

// IDs disponibles para el highlight en el módulo OPS
export const COACH_HIGHLIGHT_IDS = [
  // OPS
  'ops-tab-produccion', 'ops-tab-mise', 'ops-tab-planificacion',
  'prod-seccion-sp', 'prod-fab-add',
  'mise-stock-box', 'mise-producir-box', 'mise-fab-add',
  'plan-sub-menu', 'plan-sub-eventos',
  // Carta
  'carta-header', 'carta-importar', 'carta-nuevo',
  'carta-filtros', 'carta-lista', 'carta-rentabilidad',
  // Stock
  'stock-kpis', 'stock-importar', 'stock-rebuild', 'stock-stockear',
  'stock-tabs', 'stock-filtros', 'stock-lista',
  // Recetario
  'recetario-tabs', 'recetario-categorias', 'recetario-lista',
  'recetario-nueva', 'recetario-importar', 'recetario-vincular', 'recetario-acciones',
  // Facturas
  'facturas-tabs', 'facturas-filtros', 'facturas-lista', 'facturas-acciones', 'facturas-pos', 'facturas-lote',
  // Reportes
  'reportes-tabs', 'reportes-periodo', 'reportes-contenido',
  // Merma
  'merma-periodo', 'merma-stats', 'merma-fab',
  // HACCP
  'haccp-tabs', 'haccp-temperaturas', 'haccp-registrar', 'haccp-vencimientos', 'haccp-limpieza',
] as const

export function useKitchenCoach() {
  const [messages, setMessages] = useState<CoachMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [highlight, setHighlight] = useState<string | null>(null)
  const [overlayText, setOverlayText] = useState<string | null>(null)
  const restauranteId = useRestauranteId()
  const abortRef = useRef<AbortController | null>(null)

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => setIsOpen(v => !v), [])
  const clearMessages = useCallback(() => setMessages([]), [])
  const clearHighlight = useCallback(() => setHighlight(null), [])
  const clearOverlayText = useCallback(() => setOverlayText(null), [])

  // Auto-clear highlight + overlayText after 8s (user may need time to read)
  useEffect(() => {
    if (!highlight) return
    const t = setTimeout(() => { setHighlight(null); setOverlayText(null) }, 8000)
    return () => clearTimeout(t)
  }, [highlight])

  const cancelRequest = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setLoading(false)
  }, [])

  const sendMessage = useCallback(async (content: string, ctx?: CoachContext) => {
    const userMsg: CoachMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: new Date(),
    }
    const placeholderId = crypto.randomUUID()
    const placeholder: CoachMessage = {
      id: placeholderId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
    }

    setMessages(prev => [...prev, userMsg, placeholder])
    setLoading(true)
    setError(null)
    setHighlight(null)
    setOverlayText(null)

    // Build system prompt
    let systemPrompt = `Sos Kitchen Coach, un asistente especializado en gestión de cocinas profesionales.
Respondés en español rioplatense, de forma concisa y práctica.
Conocés de food cost, mise en place, HACCP, gestión de stock y operaciones gastronómicas.
IMPORTANTE: No usés asteriscos, markdown, negritas ni ningún símbolo de formato. Solo texto plano.`

    if (ctx?.stockCritico?.length) {
      systemPrompt += `\n\n## Stock crítico actual:`
      for (const item of ctx.stockCritico) {
        systemPrompt += `\n- ${item.nombre}: ${item.cantidad} unidades (mínimo: ${item.minimo})`
      }
    }

    if (ctx?.tareasPendientes?.length) {
      systemPrompt += `\n\n## Tareas pendientes del día:`
      for (const t of ctx.tareasPendientes) {
        systemPrompt += `\n- [${t.prioridad.toUpperCase()}] ${t.plaza ? t.plaza + ' ' : ''}${t.titulo}`
      }
    }

    // OPS screen context (written by each page via localStorage)
    try {
      const screenCtx = JSON.parse(localStorage.getItem('kc_screen_context') ?? 'null')
      if (screenCtx) {
        systemPrompt += `\n\n## Pantalla activa: ${JSON.stringify(screenCtx)}`
      }
    } catch { /* ignore */ }

    systemPrompt += `\n\n## Formato de respuesta con highlight de UI

Cuando tu respuesta menciona dónde está algo en la pantalla, respondé en JSON exacto (sin markdown):
{"text":"tu respuesta en el chat (texto plano sin asteriscos)","highlight":"id-del-elemento","overlay_text":"descripción muy breve del elemento (máx 12 palabras)","options":["Opción de seguimiento 1","Opción 2"]}

- overlay_text: texto corto que aparece sobre el elemento destacado en pantalla, muy conciso
- options: chips de respuesta rápida para guiar al usuario al siguiente paso (máx 3 opciones, omitir si no aplica)
- En conversaciones generales sin referencia a UI, respondé SOLO texto plano (sin JSON)

IDs disponibles: ${COACH_HIGHLIGHT_IDS.join(', ')}

Ejemplo para tour de OPS:
{"text":"La sección Producción es donde cargás todo lo que hay que cocinar hoy, ordenado por prioridad. El botón + agrega una preparación nueva.","highlight":"ops-tab-produccion","overlay_text":"Producción: tu lista de tareas por prioridad","options":["Contame sobre Mise","Contame sobre Planificación"]}

Ejemplo para análisis de carta:
{"text":"Encontré 3 platos con food cost mayor al 35%: Bife de chorizo (48%), Tabla de quesos (41%) y Croquetas (37%). Te recomiendo revisar los precios o ajustar las porciones. ¿Querés que analice las recetas de estos platos?","highlight":"carta-rentabilidad","overlay_text":"Acá ves todos los platos ordenados por food cost","options":["Ver los platos problema","¿Qué precio debería tener el Bife?","Analizá los que no tienen receta"]}

Ejemplo para ayuda de import:
{"text":"El botón Importar te permite cargar toda la carta desde una foto, PDF, Excel o texto. La IA extrae los platos, los componentes y detecta si son veganos, sin TACC, etc. Solo tocá el botón y elegí el archivo.","highlight":"carta-importar","overlay_text":"Botón para importar la carta con IA","options":["¿Qué formatos acepta?","¿Cómo vinculo las recetas después?"]}

Ejemplo para food cost alto en recetario:
{"text":"Tenés 3 recetas con food cost crítico: Bife de chorizo (48%), Tabla de quesos (41%) y Croquetas (37%). Te recomiendo revisar el precio de venta o ajustar las porciones. Tocá cualquiera para abrir la ficha técnica.","highlight":"recetario-lista","overlay_text":"Food cost: verde<25%, amarillo<33%, rojo>33%","options":["¿Qué precio debería tener el Bife?","¿Cómo bajo el food cost del queso?","Ver las que no tienen precio"]}

Ejemplo para vincular stock:
{"text":"Hay recetas con ingredientes sin vincular al inventario. Eso significa que el costo se calcula como cero para esos ingredientes — el food cost real puede ser más alto. Usá el botón Vincular para conectarlos.","highlight":"recetario-vincular","overlay_text":"Vinculá ingredientes al stock para costos reales","options":["¿Cuántas recetas están afectadas?","¿Cómo funciona la vinculación?"]}

Ejemplo para facturas pendientes de pago:
{"text":"Tenés 4 facturas en estado pendiente por un total de $180.000. Los proveedores con deuda en cuenta corriente son: El Gaucho ($95.000) y Lácteos del Sur ($85.000). Tocá cualquier factura para actualizar el estado de pago.","highlight":"facturas-lista","overlay_text":"Listado de facturas — tocá para ver detalle","options":["Mostrá solo las pendientes","¿Cuánto debo este mes en total?"]}

Ejemplo para inflación en reportes:
{"text":"La inflación de cocina del mes fue 8,3%. Los productos que más subieron: Crema de leche (+22%), Manteca (+18%), Harina (+15%). Te recomiendo revisar el costo de las recetas que más los usan.","highlight":"reportes-contenido","overlay_text":"Variación de precios vs período anterior","options":["¿Qué recetas usan Crema?","¿Cómo ajusto los precios de la carta?"]}

Ejemplo para vencimientos próximos en HACCP:
{"text":"Hay 3 productos que vencen en los próximos 3 días: Queso brie (mañana), Crema pastelera (pasado mañana) y Salmón ahumado (en 3 días). Conviene usarlos primero o descartarlos si ya no están aptos.","highlight":"haccp-vencimientos","overlay_text":"Alertas de vencimiento próximo","options":["¿Cómo registro el descarte?","¿Puedo agregar más productos?"]}

Ejemplo para costo de merma:
{"text":"El costo total de merma de la semana fue $12.400. El motivo más frecuente es vencimiento (5 registros) y el producto que más aparece es Albahaca fresca. Te recomiendo revisar la cantidad que se compra vs la que se usa.","highlight":"merma-stats","overlay_text":"Costo, motivo top y producto top del período","options":["¿Cómo reduzco la merma de verduras?","¿Cuánto es normal de merma?"]}

Ejemplo para riesgo de stock:
{"text":"Tenés 3 productos en crítico: Crema (2 l, umbral 5), Manteca (1 kg, umbral 4) y Levadura (0,2 kg, umbral 1). Conviene reponerlos antes del próximo servicio. Tocá el indicador para filtrar solo los críticos.","highlight":"stock-kpis","overlay_text":"Críticos, bajos y pendientes: tocá para filtrar","options":["¿Qué pido primero?","Mostrame los que no tienen precio"]}

Ejemplo para productos sin precio (subvalúan food cost):
{"text":"Hay productos sin precio cargado. Eso subvalúa el food cost de las recetas que los usan, porque el sistema los cuenta como costo cero. Podés reconstruir el stock desde tus facturas para traer los precios reales automáticamente.","highlight":"stock-rebuild","overlay_text":"Reconstruye el stock y los precios desde facturas","options":["¿Cómo funciona el rebuild?","¿Qué recetas están mal calculadas?"]}`

    systemPrompt += `\n\nUsá el contexto para dar consejos relevantes cuando el usuario lo necesite.`

    const apiMessages = [...messages, userMsg]
      .filter(m => m.content !== '')
      .map(m => ({ role: m.role, content: m.content }))

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages, systemPrompt, restauranteId }),
        signal: controller.signal,
      })

      if (res.status === 429) throw new Error('Demasiadas solicitudes, esperá un momento')
      if (res.status === 401) throw new Error('Error de configuración de IA')
      if (res.status === 402) throw new Error('Créditos de IA agotados')
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Error al procesar la solicitud')
      }

      const data = await res.json()
      const rawText = data.content?.[0]?.text ?? data.message ?? 'Sin respuesta'

      // Try to parse structured response { text, highlight, overlay_text, options }
      let text = rawText
      let hl: string | null = null
      let ovText: string | null = null
      let opts: string[] | null = null
      try {
        const trimmed = rawText.trim()
        if (trimmed.startsWith('{')) {
          const parsed = JSON.parse(trimmed)
          if (parsed && typeof parsed.text === 'string') {
            text = parsed.text
            hl = typeof parsed.highlight === 'string' ? parsed.highlight : null
            ovText = typeof parsed.overlay_text === 'string' ? parsed.overlay_text : null
            opts = Array.isArray(parsed.options)
              ? parsed.options.filter((o: unknown) => typeof o === 'string')
              : null
          }
        }
      } catch { /* plain text response */ }

      setHighlight(hl)
      setOverlayText(ovText)
      setMessages(prev =>
        prev.map(m => m.id === placeholderId ? {
          ...m,
          content: text,
          timestamp: new Date(),
          options: opts && opts.length > 0 ? opts : undefined,
        } : m)
      )
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') return
      const errMsg = e instanceof Error ? e.message : 'Error al conectar con el asistente'
      setError(errMsg)
      setMessages(prev => prev.filter(m => m.id !== placeholderId))
    } finally {
      setLoading(false)
      abortRef.current = null
    }
  }, [messages, restauranteId])

  return {
    messages, loading, error, isOpen, highlight, overlayText,
    open, close, toggle, sendMessage, clearMessages,
    clearHighlight, clearOverlayText, cancelRequest,
  }
}
