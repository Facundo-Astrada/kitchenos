import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { COACH_HIGHLIGHT_IDS } from '@/lib/coach/highlights'
import type { SupabaseClient } from '@supabase/supabase-js'

// ── Rate limit en memoria (best-effort por instancia serverless) ──────────
const hits = new Map<string, number[]>()

// ── M1: snapshot de datos reales del restaurante ──────────────
async function buildSnapshot(supabase: SupabaseClient, screen?: string): Promise<string> {
  const hoy = new Date()
  const hoyStr = hoy.toISOString().split('T')[0]
  const en3dias = new Date(hoy.getTime() + 3 * 86_400_000).toISOString().split('T')[0]
  const hace30 = new Date(hoy.getTime() - 30 * 86_400_000).toISOString().split('T')[0]
  const fmt = (n: number) => Math.round(n).toLocaleString('es-AR')
  // Las secciones extra solo se incluyen donde son relevantes (ahorra tokens del
  // bloque dinámico, que NO se cachea). Sin screen → se incluyen todas.
  const wants = (screens: string[]) => !screen || screens.includes(screen)

  const [prodRes, vencRes, factRes] = await Promise.all([
    supabase.from('productos')
      .select('nombre, stock_actual, stock_critico, stock_minimo, unidad')
      .eq('activo', true)
      .order('stock_actual', { ascending: true })
      .limit(120),
    supabase.from('haccp_vencimientos')
      .select('nombre, fecha_vencimiento')
      .in('status', ['vigente', 'por_vencer'])
      .lte('fecha_vencimiento', en3dias)
      .order('fecha_vencimiento', { ascending: true })
      .limit(10),
    supabase.from('facturas')
      .select('proveedor_nombre, total')
      .eq('status', 'pendiente')
      .order('fecha_factura', { ascending: false })
      .limit(20),
  ])

  const lines: string[] = []

  const productos = (prodRes.data ?? []) as Array<{ nombre: string; stock_actual: number; stock_critico: number | null; stock_minimo: number | null; unidad: string | null }>
  const criticos = productos.filter(p => p.stock_actual <= (p.stock_critico ?? 0))
  const bajos = productos.filter(p => p.stock_actual > (p.stock_critico ?? 0) && p.stock_actual <= (p.stock_minimo ?? 0))
  if (criticos.length) {
    lines.push(`Stock CRÍTICO (${criticos.length}): ` + criticos.slice(0, 8)
      .map(p => `${p.nombre} (${p.stock_actual} ${p.unidad ?? ''}, umbral ${p.stock_critico})`).join('; '))
  }
  if (bajos.length) {
    lines.push(`Stock bajo (${bajos.length}): ` + bajos.slice(0, 6).map(p => p.nombre).join(', '))
  }

  const venc = (vencRes.data ?? []) as Array<{ nombre: string; fecha_vencimiento: string }>
  if (venc.length) {
    lines.push(`Vencen en ≤3 días (${venc.length}): ` + venc.map(v => `${v.nombre} (${v.fecha_vencimiento})`).join('; '))
  }

  const facts = (factRes.data ?? []) as Array<{ proveedor_nombre: string | null; total: number | null }>
  if (facts.length) {
    const totalPend = facts.reduce((s, f) => s + (Number(f.total) || 0), 0)
    lines.push(`Facturas pendientes de pago (${facts.length}, total $${fmt(totalPend)}): ` + facts.slice(0, 6)
      .map(f => `${f.proveedor_nombre ?? 'Proveedor'} $${fmt(Number(f.total) || 0)}`).join('; '))
  }

  // ── Extras según pantalla (datos que el cliente no manda en screenContext) ──
  // Ventas — relevante para planificar producción y analizar el negocio.
  if (wants(['ventas', 'reportes', 'dashboard', 'carta', 'operaciones'])) {
    try {
      const { data } = await supabase.from('ventas')
        .select('total_ventas, cantidad_cubiertos').gte('fecha', hace30)
      const v = (data ?? []) as Array<{ total_ventas: number | null; cantidad_cubiertos: number | null }>
      if (v.length) {
        const totalV = v.reduce((s, r) => s + (Number(r.total_ventas) || 0), 0)
        const cub = v.reduce((s, r) => s + (Number(r.cantidad_cubiertos) || 0), 0)
        lines.push(`Ventas últimos 30 días: $${fmt(totalV)} en ${v.length} días (promedio $${fmt(totalV / v.length)}/día${cub ? `, ${fmt(cub)} cubiertos` : ''}).`)
      }
    } catch { /* sin ventas */ }
  }

  // Merma — costo del desperdicio y su causa principal.
  if (wants(['merma', 'reportes', 'dashboard', 'stock'])) {
    try {
      const { data } = await supabase.from('merma')
        .select('costo_estimado, motivo').gte('fecha', hace30)
      const m = (data ?? []) as Array<{ costo_estimado: number | null; motivo: string | null }>
      if (m.length) {
        const costo = m.reduce((s, r) => s + (Number(r.costo_estimado) || 0), 0)
        const motivos = new Map<string, number>()
        for (const r of m) { const k = r.motivo ?? 'otro'; motivos.set(k, (motivos.get(k) ?? 0) + 1) }
        const top = [...motivos.entries()].sort((a, b) => b[1] - a[1])[0]
        lines.push(`Merma últimos 30 días: $${fmt(costo)} en ${m.length} registros${top ? ` (motivo más frecuente: ${top[0]})` : ''}.`)
      }
    } catch { /* sin merma */ }
  }

  // Platos en 86 (no disponibles ahora mismo).
  if (wants(['carta', 'pase', 'dashboard', 'operaciones'])) {
    try {
      const { data } = await supabase.from('carta_items')
        .select('nombre').eq('disponible', false).limit(12)
      const o = (data ?? []) as Array<{ nombre: string }>
      if (o.length) lines.push(`Platos en 86 (no disponibles, ${o.length}): ${o.map(x => x.nombre).join(', ')}.`)
    } catch { /* sin carta */ }
  }

  if (lines.length === 0) return ''
  return `\n\n## Datos reales del restaurante (consultados en vivo, ${hoyStr}) — son la verdad, usá estos números:\n`
    + lines.map(l => '- ' + l).join('\n')
}

// ── Prompt estático (~4k tokens) — se cachea en Anthropic (TTL 5 min) ──────
const COACH_STATIC_PROMPT = `Sos Kitchen Coach, un asistente especializado en gestión de cocinas profesionales.
Respondés en español rioplatense, de forma concisa y práctica.
Conocés de food cost, mise en place, HACCP, gestión de stock y operaciones gastronómicas.
IMPORTANTE: No usés asteriscos, markdown, negritas ni ningún símbolo de formato. Solo texto plano.

## La aplicación: KitchenOS
KitchenOS es el sistema con el que esta cocina se gestiona. El usuario puede estar recién aprendiendo a usarlo: explicáselo con claridad y, si pregunta dónde está algo, mostráselo con highlight. Sé breve y operativo, con jerga de cocina.

Qué hace cada módulo:
- Dashboard (inicio): turno propio, resumen de mi plaza, alertas de stock y accesos a los módulos.
- Operaciones (OPS): el workspace diario. Tres tabs: Producción (qué cocinar hoy, ordenado por prioridad SP/Prioridad/Refuerzo/Check), Mise (mise en place por plaza, con el stock del cierre vs el objetivo del turno) y Planificación (armar el menú del día y eventos, y activar menús del catálogo).
- Carta: los platos que se venden, con precio, food cost y disponibilidad (86 = agotado). Se puede importar con IA desde foto, PDF o Excel.
- Recetario: las fichas técnicas (ingredientes, pasos, costo y porciones). El food cost real sale de vincular cada ingrediente al stock.
- Stock (Inventario): productos con cantidad, precio y mínimos; estados crítico/bajo. Rebuild reconstruye el stock y los precios desde las facturas.
- Facturas: historial de compras (OCR de foto/PDF/texto o import de Excel del POS), listas de precios acordados y proveedores.
- Proveedores: directorio con contacto, días de entrega y condiciones de pago.
- Pedidos: órdenes a proveedores (borrador → enviado → recibido).
- Ventas: ventas diarias y cubiertos; alimentan el cálculo de food cost.
- Reportes: análisis del período (resumen, CMV, presupuesto vs real, food cost por receta, compras por proveedor, inflación de cocina, producción).
- Merma: registro de desperdicio con costo y motivo.
- HACCP: temperaturas de equipos, vencimientos y limpieza (expediente para bromatología).
- Pase: el chat de cocina del turno (mensajes por plaza, 86, urgencias).
- Equipo y Turnos: miembros, puestos (con sus módulos habilitados) y la planilla semanal.
- Calendario: los eventos del restaurante.

Cómo se encadenan los datos (la cadena del food cost):
Facturas traen precios → Stock (productos con precio) → se vinculan a los ingredientes del Recetario → la receta calcula su costo → la Carta usa esa receta y muestra el food cost del plato. Si falta un eslabón (producto sin precio, ingrediente sin vincular, plato sin receta), el food cost queda subvaluado.

Si el usuario recién arranca y pregunta "¿por dónde empiezo?", el orden recomendado es:
1) Cargar facturas (o importar el Excel del POS) para traer productos y precios.
2) Revisar el Stock (usar Rebuild desde facturas si está vacío).
3) Cargar el Recetario y vincular los ingredientes al stock.
4) Armar la Carta y vincular cada plato a su receta.
5) Cargar Ventas para ver el food cost real.
El uso diario después pasa por Operaciones (producción y mise), Pase y HACCP.

Cuando pregunten "¿para qué sirve X?" o "¿cómo hago Y?", respondé corto y concreto; si lo que necesita está en otra pantalla, decile a cuál ir.

## Formato de respuesta con highlight de UI

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
{"text":"Hay productos sin precio cargado. Eso subvalúa el food cost de las recetas que los usan, porque el sistema los cuenta como costo cero. Podés reconstruir el stock desde tus facturas para traer los precios reales automáticamente.","highlight":"stock-rebuild","overlay_text":"Reconstruye el stock y los precios desde facturas","options":["¿Cómo funciona el rebuild?","¿Qué recetas están mal calculadas?"]}

Usá el contexto para dar consejos relevantes cuando el usuario lo necesite.`

// ── M5: tool use agéntico ─────────────────────────────────────
const COACH_TOOLS = [
  {
    name: 'crear_tarea',
    description: 'Crea una tarea/producción pendiente para el día de hoy. Usar solo cuando el usuario pide explícitamente crear una tarea o anotar algo para hacer.',
    input_schema: {
      type: 'object' as const,
      properties: {
        titulo: { type: 'string', description: 'Qué hay que hacer. Ej: "Cortar mirepoix", "Preparar fondo oscuro".' },
        prioridad: { type: 'string', enum: ['critica', 'alta', 'media', 'baja'], description: 'Prioridad. Default media.' },
        plaza: { type: 'string', description: 'Plaza/estación opcional. Ej: parrilla, frios, pasteleria.' },
        descripcion: { type: 'string', description: 'Detalle opcional.' },
      },
      required: ['titulo'],
    },
  },
  {
    name: 'marcar_86',
    description: 'Marca un plato de la carta como NO disponible (86). Usar cuando el usuario dice que se acabó o no hay un plato.',
    input_schema: {
      type: 'object' as const,
      properties: {
        plato: { type: 'string', description: 'Nombre (o parte) del plato a marcar como no disponible.' },
      },
      required: ['plato'],
    },
  },
  {
    name: 'registrar_merma',
    description: 'Registra una merma (desperdicio) de un producto. Si el producto está en stock, descuenta la cantidad. Usar cuando el usuario reporta que se tiró/perdió/venció algo.',
    input_schema: {
      type: 'object' as const,
      properties: {
        producto: { type: 'string', description: 'Nombre del producto mermado.' },
        cantidad: { type: 'number', description: 'Cantidad mermada.' },
        unidad: { type: 'string', description: 'Unidad. Ej: kg, g, l, ml, u.' },
        motivo: { type: 'string', enum: ['vencimiento', 'error_coccion', 'mala_recepcion', 'sobro_servicio', 'deterioro', 'devolucion_cliente', 'mala_conservacion', 'otro'], description: 'Motivo de la merma.' },
        detalle: { type: 'string', description: 'Detalle opcional.' },
      },
      required: ['producto', 'cantidad', 'unidad', 'motivo'],
    },
  },
]

function turnoActual(): 'apertura' | 'servicio' | 'cierre' {
  const h = new Date().getHours()
  return h < 12 ? 'apertura' : h < 18 ? 'servicio' : 'cierre'
}

type ToolInput = Record<string, unknown>

async function executeTool(name: string, input: ToolInput, supabase: SupabaseClient, restauranteId: string | null): Promise<string> {
  if (!restauranteId) return 'Error: no pude identificar tu restaurante. No ejecuté la acción.'
  const hoy = new Date().toISOString().split('T')[0]

  try {
    if (name === 'crear_tarea') {
      const titulo = String(input.titulo ?? '').trim()
      if (!titulo) return 'Error: falta el título de la tarea.'
      const prioridad = ['critica', 'alta', 'media', 'baja'].includes(String(input.prioridad)) ? String(input.prioridad) : 'media'
      const { error } = await supabase.from('tareas').insert({
        titulo,
        descripcion: input.descripcion ? String(input.descripcion) : null,
        status: 'pendiente',
        estado: 'pendiente',
        prioridad,
        categoria: 'general',
        seccion: 'general',
        plaza: input.plaza ? String(input.plaza) : null,
        turno_fecha: hoy,
        checklist: '[]',
        restaurante_id: restauranteId,
      })
      if (error) return `Error al crear la tarea: ${error.message}`
      return `Tarea creada para hoy: "${titulo}" (prioridad ${prioridad}). Aparece en Producción.`
    }

    if (name === 'marcar_86') {
      const plato = String(input.plato ?? '').trim()
      if (!plato) return 'Error: falta el nombre del plato.'
      const { data, error } = await supabase.from('carta_items')
        .update({ disponible: false })
        .eq('restaurante_id', restauranteId)
        .ilike('nombre', `%${plato}%`)
        .select('nombre')
      if (error) return `Error al marcar 86: ${error.message}`
      if (!data || data.length === 0) return `No encontré ningún plato que coincida con "${plato}". No marqué nada.`
      return `Marcado como 86 (no disponible): ${data.map(d => d.nombre).join(', ')}.`
    }

    if (name === 'registrar_merma') {
      const producto = String(input.producto ?? '').trim()
      const cantidad = Number(input.cantidad)
      const unidad = String(input.unidad ?? '').trim()
      const motivo = String(input.motivo ?? 'otro')
      if (!producto || !cantidad || cantidad <= 0 || !unidad) return 'Error: faltan datos de la merma (producto, cantidad o unidad).'

      const { data: prod } = await supabase.from('productos')
        .select('id, precio_unitario, stock_actual')
        .eq('restaurante_id', restauranteId)
        .ilike('nombre', `%${producto}%`)
        .limit(1)
        .maybeSingle()

      const costo = prod?.precio_unitario ? Number(prod.precio_unitario) * cantidad : 0
      const { error } = await supabase.from('merma').insert({
        producto_nombre: producto,
        producto_id: prod?.id ?? null,
        cantidad,
        unidad,
        motivo,
        motivo_detalle: input.detalle ? String(input.detalle) : null,
        fecha: hoy,
        turno: turnoActual(),
        costo_estimado: costo,
        restaurante_id: restauranteId,
      })
      if (error) return `Error al registrar la merma: ${error.message}`

      let extra = ''
      if (prod?.id) {
        const nuevo = Math.max(0, (Number(prod.stock_actual) || 0) - cantidad)
        await supabase.from('productos').update({ stock_actual: nuevo }).eq('id', prod.id)
        extra = ` Stock actualizado a ${nuevo} ${unidad}.`
      }
      const costoTxt = costo > 0 ? ` Costo estimado $${Math.round(costo).toLocaleString('es-AR')}.` : ''
      return `Merma registrada: ${cantidad} ${unidad} de ${producto} (${motivo}).${costoTxt}${extra}`
    }

    return `Error: herramienta desconocida "${name}".`
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'desconocido'
    return `Error al ejecutar ${name}: ${msg}`
  }
}

interface ContentBlock { type: string; [k: string]: unknown }
interface AnthropicMsg { role: string; content: unknown }

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  // Rate limit: máx 15 requests/60s por usuario (best-effort)
  const now = Date.now()
  const userHits = (hits.get(user.id) ?? []).filter(t => now - t < 60_000)
  if (userHits.length >= 15) {
    return NextResponse.json({ error: 'Demasiadas solicitudes, esperá un momento' }, { status: 429 })
  }
  hits.set(user.id, [...userHits, now])

  // restaurante_id de la sesión (fuente confiable para writes; no del body).
  const { data: ur } = await supabase.from('user_restaurantes')
    .select('restaurante_id').eq('user_id', user.id).maybeSingle()
  const restauranteId = (ur?.restaurante_id as string | undefined) ?? null

  const { messages, screenContext, ctx } = await req.json()

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'API key no configurada' }, { status: 500 })
  }

  // Bloque dinámico: snapshot M1 + pantalla activa + contexto de stock/tareas del cliente + M5
  let dynamicBlock = ''
  try {
    const screen = (screenContext && typeof screenContext === 'object' && 'screen' in screenContext)
      ? String((screenContext as { screen?: unknown }).screen ?? '') : undefined
    const snapshot = await buildSnapshot(supabase, screen || undefined)
    if (snapshot) dynamicBlock += snapshot
  } catch { /* sin snapshot — seguimos */ }

  if (screenContext) {
    dynamicBlock += `\n\n## Pantalla activa: ${JSON.stringify(screenContext)}`
  }

  if (ctx?.stockCritico?.length) {
    dynamicBlock += `\n\n## Stock crítico (del cliente):`
    for (const item of ctx.stockCritico) {
      dynamicBlock += `\n- ${item.nombre}: ${item.cantidad} unidades (mínimo: ${item.minimo})`
    }
  }

  if (ctx?.tareasPendientes?.length) {
    dynamicBlock += `\n\n## Tareas pendientes del día:`
    for (const t of ctx.tareasPendientes) {
      dynamicBlock += `\n- [${t.prioridad.toUpperCase()}] ${t.plaza ? t.plaza + ' ' : ''}${t.titulo}`
    }
  }

  dynamicBlock += `\n\n## Acciones ejecutables
Tenés herramientas para EJECUTAR acciones reales: crear_tarea, marcar_86, registrar_merma.
- Usalas SOLO cuando el usuario pide explícitamente hacer la acción ("creá una tarea…", "se acabó el…", "se tiraron 2 kg de…").
- Después de ejecutar, confirmá en una frase breve en texto plano (sin JSON, sin markdown) lo que hiciste.
- Si faltan datos para ejecutar (ej. cantidad de la merma), preguntá antes de llamar la herramienta.`

  // Loop agéntico: hasta 4 vueltas (modelo → tool → resultado → modelo).
  const convo: AnthropicMsg[] = Array.isArray(messages) ? [...messages] : []
  let finalContent: unknown = [{ type: 'text', text: 'Sin respuesta' }]

  for (let i = 0; i < 4; i++) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: [
          { type: 'text', text: COACH_STATIC_PROMPT, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: dynamicBlock },
        ],
        tools: COACH_TOOLS,
        messages: convo,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      return NextResponse.json({ error }, { status: response.status })
    }

    const data = await response.json()
    // Log de caching para monitoreo en dev
    if (data.usage) {
      console.log('[coach] tokens:', JSON.stringify({
        input: data.usage.input_tokens,
        cache_read: data.usage.cache_read_input_tokens ?? 0,
        cache_write: data.usage.cache_creation_input_tokens ?? 0,
        output: data.usage.output_tokens,
      }))
    }

    finalContent = data.content
    const blocks = (data.content ?? []) as ContentBlock[]

    if (data.stop_reason === 'tool_use') {
      convo.push({ role: 'assistant', content: data.content })
      const toolResults = []
      for (const block of blocks) {
        if (block.type === 'tool_use') {
          const result = await executeTool(
            String(block.name),
            (block.input ?? {}) as ToolInput,
            supabase,
            restauranteId,
          )
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result })
        }
      }
      convo.push({ role: 'user', content: toolResults })
      continue
    }

    break // end_turn — respuesta final lista
  }

  return NextResponse.json({ content: finalContent })
}
