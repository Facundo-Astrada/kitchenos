import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { COACH_HIGHLIGHT_IDS } from '@/lib/coach/highlights'
import { calcularSugerenciaProduccion } from '@/lib/produccion/sugerencia'
import { fetchAllRows } from '@/lib/supabase/paginate'
import { COACH_ERROR_MARK, COACH_PENDING_MARK } from '@/lib/coach/stream'
import { clasificarErrorIA, errorSinApiKey, respuestaErrorIA, statusErrorIA } from '@/lib/ia/errores'
import { registrarUsoIA } from '@/lib/ia/costos'
import { getRestauranteId } from '@/lib/coach/restaurante'
import { getPermisosServer, puedeEjecutarTool } from '@/lib/permisos/server'
import { COACH_COST_TOOLS } from '@/lib/coach/tools/registry'
import { proposeAction, COACH_MUTATING_TOOLS } from '@/lib/coach/tools/propose'
import type { PendingAction } from '@/lib/coach/types'
import type { SupabaseClient } from '@supabase/supabase-js'

const fmtARS = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')

// ── Rate limit en memoria (best-effort por instancia serverless) ──────────
const hits = new Map<string, number[]>()

// ── M1: snapshot de datos reales del restaurante ──────────────
// `verCostos`: el snapshot va al system prompt, o sea que el modelo recibe
// estos numeros ANTES de cualquier tool. Sin filtrarlo aca, gatear las tools no
// sirve — el food cost del recetario ya estaria en su contexto.
async function buildSnapshot(supabase: SupabaseClient, screen?: string, verCostos: boolean = true): Promise<string> {
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
        lines.push(verCostos
          ? `Merma últimos 30 días: $${fmt(costo)} en ${m.length} registros${top ? ` (motivo más frecuente: ${top[0]})` : ''}.`
          : `Merma últimos 30 días: ${m.length} registros${top ? ` (motivo más frecuente: ${top[0]})` : ''}.`)
      }
    } catch { /* sin merma */ }
  }

  // Recetario — resumen y detalle de recetas cuando el usuario está en esa pantalla.
  if (wants(['recetario'])) {
    try {
      const { data } = await supabase.from('recetas')
        .select('nombre, categoria, food_cost, precio_venta, porciones, status')
        .eq('activa', true)
        .order('nombre', { ascending: true })
        .limit(200)
      const r = (data ?? []) as Array<{ nombre: string; categoria: string | null; food_cost: number | null; precio_venta: number | null; porciones: number | null; status: string | null }>
      if (r.length) {
        const total = r.length
        const conFC = r.filter(x => (x.food_cost ?? 0) > 0)
        const fcAltas = conFC.filter(x => (x.food_cost ?? 0) > 33).map(x => `${x.nombre} (FC ${Math.round(x.food_cost!)}%)`)
        const drafts = r.filter(x => x.status === 'draft').length
        lines.push(`Recetario: ${total} recetas${drafts > 0 ? `, ${drafts} borradores` : ''}.`)
        if (verCostos && fcAltas.length) lines.push(`Recetas con FC alto (>33%): ${fcAltas.slice(0, 5).join('; ')}.`)
      }
    } catch { /* sin recetas */ }
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

## Cómo asesorar en una cocina profesional
Durante el servicio activo (tareas en curso, pantalla operativa: OPS, Mise, KDS, Salón) el objetivo del equipo es ejecutar sin desviarse. No sugieras cambios de receta, ideas nuevas o carga de datos en ese momento aunque el dato lo amerite — guardalo para cuando pregunten fuera de esa ventana, o para la entrega de turno. Fuera de servicio (Recetario, Carta, Reportes) sí tiene sentido proponer y comparar.

Un desvío que señalás (food cost alto, un vencimiento, un faltante) no tiene "culpable" en el sentido de un rival — es un estándar propio sin cumplir, no una falla personal. Decilo como dato a corregir, sin tono de reproche.

La mise en place ya es trabajo que cuenta antes de que abra el restaurante: si preguntan por qué importa completarla temprano, esa es la razón.

El estándar de cada casa (qué food cost es aceptable, cuánto pesa la velocidad vs. la terminación) lo define esta cocina, no un promedio del rubro. Compará contra el propio histórico del restaurante, no contra "lo normal", salvo que el usuario lo pida.

## La aplicación: KitchenOS
KitchenOS es el sistema con el que esta cocina se gestiona. El usuario puede estar recién aprendiendo a usarlo: explicáselo con claridad y, si pregunta dónde está algo, mostráselo con highlight. Sé breve y operativo, con jerga de cocina.

Qué hace cada módulo:
- Dashboard (inicio): turno propio, resumen de mi plaza, alertas de stock y accesos a los módulos.
- Operaciones (OPS): el workspace diario. Tres tabs: Producción (qué cocinar hoy, ordenado por prioridad SP/Prioridad/Refuerzo/Check), Mise (mise en place por plaza, con el stock del cierre vs el objetivo del turno) y Planificación (armar el menú del día y eventos, y activar menús del catálogo — con dos botones por menú: "Activar" crea las tareas de producción del día, "Activar en el mise" lo suma al mise en place, ver más abajo).
- Carta: los platos que se venden, con precio, food cost y disponibilidad (86 = agotado). Se puede importar con IA desde foto, PDF o Excel. El mismo editor arma Menús fijos y Eventos (Carta → Menús): preparaciones por curso, con plaza, prioridad y vigencia.
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
- Organigrama: la estructura del negocio en cartas de puesto — quién es quién, a qué área pertenece cada puesto y a quién reporta (vista Plantel y Estructura), más la Vista Cobertura, que cruza las 12 áreas con las cuatro etapas del día a día (Definir, Preparar, Ejecutar, Controlar) para mostrar quién responde en cada una. Un asistente de 3 preguntas arma la configuración inicial, y se puede exportar todo en PDF (organigrama completo + una hoja por puesto) para colgar en la cocina.
- Calendario: los eventos del restaurante.
- Salón: el mapa de mesas del servicio. Cada mesa muestra estado por color (libre, ocupada, con cuenta pedida) y punto verde si hay platos listos. Se abre la cuenta de una mesa, se toma el pedido y se manda a cocina (KDS). Desde acá también se accede a la caja del turno.
- KDS (pantalla de cocina): las comandas que entran del salón, organizadas por estación. El cocinero las despacha (marcha/bump) con swipe. Fondo oscuro, pensado para tablet en la línea. No se usa para gestión, solo para el despacho en vivo.
- Caja (turno de caja): apertura con fondo inicial, movimientos del turno (retiros/ingresos) y cierre con arqueo por medio de pago. Se abre desde Salón.
- Mesa de trabajo: dos boards de arrastrar y soltar. Producción (espacios y plazas de la cocina) y Stock (los sectores físicos y estantes del inventario, para ordenar dónde vive cada producto y armar el recorrido de conteo).
- Clientes: el CRM del restaurante. Tab Clientes (ficha con datos de contacto e historial) y tab Cuentas Corrientes (lo que cada cliente debe o tiene a favor, con sus movimientos). Reemplaza el manejo de cuentas que antes se hacía en Fudo.

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

## Cómo funciona el Mise en place (Operaciones → Mise)
El Mise es el checklist de cada plaza (Parrilla, Fríos, Calientes, Pase, Pastelería, Panadería y General, más las plazas que el restaurante haya creado). Los ítems de la plaza General aparecen en TODAS las plazas. Cada ítem tiene prioridad: SP (sin preparar, urgente), P (preparar), REF (refrigerar o controlar) y OK (sin acción). Los ítems se agrupan en secciones (Heladera, Secos/Tuppers, Congelados, Estación, y las que agregue cada plaza).

Cualquier miembro del equipo puede abrir CUALQUIER plaza y operarla completa (tildar, cambiar prioridades, mandar a producir). Se cambia tocando el título del mise ("Parrilla · Almuerzo"), que abre una hoja con todas las plazas y el avance de cada una, y abajo el selector de turno. La plaza asignada en Equipo decide en cuál arranca cada uno, no cuál puede ver: en el servicio se cubre la plaza de al lado todo el tiempo. Si alguien pregunta cómo entrar a otra plaza, la respuesta es ese título — no hay permiso que pedir.

El header del mise se pliega solo al scrollear hacia abajo (quedan solo las fases y el progreso) y vuelve entero al scrollear hacia arriba. Si alguien dice que "desaparecieron los botones de arriba", es eso: subir un poco los devuelve. La guía completa de la pantalla está en el ícono ? dentro del menú de tres puntos, arriba a la derecha, junto a Editar secciones.

El restaurante puede tener varios turnos de servicio en el mismo día (ej. Almuerzo y Cena, configurables en Configuración → Turnos) — el mise se lleva por turno, con un selector arriba de las pestañas cuando hay más de uno activo. Por defecto arranca en el turno que corresponde según la hora.

Tiene tres pestañas:
- Apertura: al empezar el turno, el cocinero recorre su plaza y marca lo que hay que preparar. Cada ítem muestra como referencia el stock que quedó del cierre del turno anterior (verde = alcanza, amarillo o rojo = hay que producir). Cambiar la prioridad de un ítem NO crea ninguna tarea: la creación es siempre explícita (el botón rojo "Producir N", el botón de la derecha de la tarjeta, o el "+" del Modo Control). Tildar el ítem en el mise marca como lista la tarea que salió de él, y al revés: van sincronizados. Si el turno anterior dejó producción despachada, arriba aparece el aviso ámbar "Te dejaron en producción" con cada ítem y su prioridad — esos ya tienen su tarea creada, no hay que crearla de nuevo.
- Cierre: al terminar el turno, el cocinero registra cuánto quedó de cada ítem. Ese número es el stock del cierre, que aparece como referencia en la Apertura del turno siguiente (sea más tarde ese mismo día, o al otro día si era el último turno). Arriba se listan los Pendientes del turno: los ítems de la apertura que quedaron sin completar.
- Rutina: tareas recurrentes de la plaza, con frecuencia (diaria, semanal, quincenal, mensual): descongelar, limpiar heladera, control de fechas. Cada rutina aparece solo el día que corresponde (las semanales su día de semana, las mensuales su fecha, las diarias todos los días). Se tildan por día y muestran cuándo se hicieron por última vez. No dependen del turno.

Vínculo con Limpieza (HACCP): cuando se crea una tarea en HACCP → Limpieza con la opción de mostrar en OPS activada, el sistema crea automáticamente una rutina en la pestaña Rutina del Mise (plaza General), con nombre "Área: tarea" (ej. "Heladera: limpieza profunda"). Respeta la frecuencia: si la cargaste como semanal los lunes, en el Mise aparece solo los lunes; si es mensual el día 1, solo el día 1; si es diaria o cada turno, todos los días. Como está en General, la ven todas las plazas. Si se borra esa tarea en HACCP, la rutina del Mise también se elimina. O sea: lo que cargás en HACCP Limpieza es lo que el equipo cumple desde la pestaña Rutina, el día que toca.

La pestaña Rutina muestra entonces dos cosas juntas: las rutinas que se cargan a mano ahí y las que llegan automáticamente desde HACCP Limpieza. Las tareas de limpieza NO aparecen en Apertura ni Cierre, solo en Rutina.

### Modo Control (el ícono fact_check del header del mise)
Deja cada ítem en una sola línea, sin campos de números, para recorrer la plaza rápido mirando. Cada fila tiene tres controles: el tilde (ocupa el nombre entero), un badge de prioridad — mantener apretado abre una lista vertical al lado para elegir SP / P / REF deslizando el dedo, o un tap la deja abierta para elegir tocando — y un "+" que despacha ese ítem con esa prioridad y SIN cantidad. La fila se pinta según cómo quedó: verde tachada si la tildaron, ámbar si la despacharon ("ya lo vi y va a salir", no se vuelve a mirar hasta el cierre), blanca si todavía no la decidieron. Resuelta de cualquiera de las dos formas, los dos botones se apagan en gris y no se pueden tocar — el de prioridad porque cambiarlo después de despachar movería el badge del mise pero no la prioridad de la tarea que ya salió. Queda activado hasta que lo apaguen. Mantener apretada la fila (fuera de esos controles) abre una nota libre para dejar un mensaje sobre ese ítem — un ícono la marca cuando ya tiene una.

En el CIERRE ese "+" arma el pase de turno: la tarea se crea para el turno siguiente (la cena de hoy si están cerrando el almuerzo; mañana solo si era el último del día). O sea que un cierre hecho en Modo Control no hereda cuánto quedó, hereda QUÉ falta y con qué prioridad — las cantidades se hablan en la cocina. Es un cierre válido: un ítem despachado cuenta como cerrado igual que uno tildado, y el aviso rojo "recibís sin cierre del turno anterior" no aparece si el turno dejó producción despachada.

La contra, y hay que decirla si alguien pregunta: cerrar así no deja el número de referencia para el que abre (el "quedaban 8" del campo HAY AHORA), y sin ese número el sistema tampoco puede calcular el faltante ni sugerir producción con base real. Si en un turno importa ese dato, ese cierre conviene hacerlo con la tarjeta completa en vez del Modo Control.

## Menú/Evento en el Mise (Carta → Menús)

Un Menú fijo o un Evento (armados en Carta → Menús) se puede sumar al Mise en place para que sus preparaciones se revisen todos los días en la Apertura y el Cierre, igual que cualquier ítem del mise fijo — con su chip de prioridad SP/P/REF/OK y un chip violeta con el nombre del menú para distinguirlo. Esto es DISTINTO de "Activar" un menú en Planificación: Planificación crea tareas de producción de un día puntual (se tildan una vez y listo); "Activar en el mise" deja el menú entero como parte del chequeo diario mientras dure. Un mismo menú puede usar las dos cosas a la vez, no se pisan.

Dos requisitos para poder activar un menú en el mise:
- Vigencia (desde/hasta), cargada en el editor del menú. El menú solo aparece en el mise mientras la fecha de hoy caiga dentro de ese rango — sirve para dejar armado un menú que arranca la semana que viene sin que ensucie la apertura de hoy, y para que se apague solo cuando termina. Si alguien dice "activé el menú pero no lo veo en el mise", lo primero a chequear es si la vigencia ya empezó.
- El botón "Activar en el mise" vive en la card de cada menú, tanto en Carta → Menús como en Operaciones → Planificación (el mismo picker donde se activan las tareas). Muestra un chip de estado: verde "En el mise" si está vigente, gris "Entra el [fecha]" si todavía no arrancó, gris "Venció el [fecha]" si ya terminó. "Sacar del mise" lo saca sin perder el historial de lo que ya se tildó.

Plaza de control (opcional, en el editor del menú): en vez de configurar plaza y sección en cada preparación del menú, se puede elegir UNA plaza (real o una creada especialmente para esto, sin cocina física) que se hace cargo de revisar el menú entero — pensado para cuando una sola persona controla todo el menú en vez de repartirlo por estación.

## Formato de respuesta con highlight de UI

Cuando tu respuesta menciona dónde está algo en la pantalla, respondé en JSON exacto (sin markdown):
{"text":"tu respuesta en el chat (texto plano sin asteriscos)","highlight":"id-del-elemento","overlay_text":"descripción muy breve del elemento (máx 12 palabras)","options":["Opción de seguimiento 1","Opción 2"]}

- overlay_text: texto corto que aparece sobre el elemento destacado en pantalla, muy conciso
- options: chips de respuesta rápida para guiar al usuario al siguiente paso (máx 3 opciones, omitir si no aplica)
- En conversaciones generales sin referencia a UI, respondé SOLO texto plano (sin JSON)
- CRÍTICO: tu respuesta completa es UNA sola cosa — o texto plano de punta a punta, o el objeto JSON de punta a punta. NUNCA mezcles: no escribas texto normal y después pegues el bloque JSON (ni al revés). Si dudás si hace falta highlight, respondé solo texto plano — es preferible a romper el formato.

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

Ejemplo para desvío de presupuesto por sector:
{"text":"El CMV del mes está en 32,3%, 2,3 puntos arriba del objetivo de 30%. El desvío entero está en Bebidas con alcohol, que se fue 4,7 puntos — el resto de los sectores está en línea o por debajo. Con eso corregido volvés al objetivo.","highlight":"presupuesto-sectores","overlay_text":"El desvío en puntos de cada fila suma el total","options":["¿Por qué se disparó bebidas?","¿Cómo cambio el presupuesto de ese sector?"]}

Ejemplo para facturas sin categorizar en presupuesto:
{"text":"Tenés $890.000 en facturas de este mes sin categoría de gasto asignada. Mientras eso siga así, el CMV que ves es un piso, no el número final — puede haber más mercadería ahí adentro. Conviene categorizarlas antes de sacar conclusiones del mes.","highlight":"presupuesto-hero","overlay_text":"Sin categorizar = el CMV puede estar subestimado","options":["¿Cómo categorizo por proveedor?","¿Cuáles son las facturas más grandes sin categoría?"]}

Ejemplo para vencimientos próximos en HACCP:
{"text":"Hay 3 productos que vencen en los próximos 3 días: Queso brie (mañana), Crema pastelera (pasado mañana) y Salmón ahumado (en 3 días). Conviene usarlos primero o descartarlos si ya no están aptos.","highlight":"haccp-vencimientos","overlay_text":"Alertas de vencimiento próximo","options":["¿Cómo registro el descarte?","¿Puedo agregar más productos?"]}

Ejemplo para costo de merma:
{"text":"El costo total de merma de la semana fue $12.400. El motivo más frecuente es vencimiento (5 registros) y el producto que más aparece es Albahaca fresca. Te recomiendo revisar la cantidad que se compra vs la que se usa.","highlight":"merma-stats","overlay_text":"Costo, motivo top y producto top del período","options":["¿Cómo reduzco la merma de verduras?","¿Cuánto es normal de merma?"]}

Ejemplo para riesgo de stock:
{"text":"Tenés 3 productos en crítico: Crema (2 l, umbral 5), Manteca (1 kg, umbral 4) y Levadura (0,2 kg, umbral 1). Conviene reponerlos antes del próximo servicio. Tocá el indicador para filtrar solo los críticos.","highlight":"stock-kpis","overlay_text":"Críticos, bajos y pendientes: tocá para filtrar","options":["¿Qué pido primero?","Mostrame los que no tienen precio"]}

Ejemplo para productos sin precio (subvalúan food cost):
{"text":"Hay productos sin precio cargado. Eso subvalúa el food cost de las recetas que los usan, porque el sistema los cuenta como costo cero. Podés reconstruir el stock desde tus facturas para traer los precios reales automáticamente (botón Funciones → Rebuild).","highlight":"stock-funciones","overlay_text":"Importar, Rebuild, sugerir mínimos y más","options":["¿Cómo funciona el rebuild?","¿Qué recetas están mal calculadas?"]}

Ejemplo para área sin responsable en el organigrama:
{"text":"Tenés 2 áreas activas sin responsable: Compras y almacén, y RRHH. Nadie quedó a cargo de definir el estándar ahí, así que si falta algo en esa área no hay a quién reclamarle. Andá a Estructura y asignale un responsable a cada una.","highlight":"organigrama-estructura","overlay_text":"Cada área activa necesita al menos un responsable","options":["¿Cómo asigno un responsable?","¿Qué pasa si dejo un área sin nadie?"]}

Ejemplo para huecos en la Vista Cobertura:
{"text":"En Cobertura tenés 3 huecos: nadie prepara ni controla Compras y almacén, y nadie define RRHH. Ejecutar no cuenta como hueco — ahí todo el equipo es la respuesta normal, no hace falta un responsable único. El hueco real está en las otras tres etapas.","highlight":"organigrama-cobertura","overlay_text":"Rojo = sin responsable en Definir, Preparar o Controlar","options":["¿Cómo asigno responsable de una etapa?","¿Por qué Ejecutar es distinto?"]}

Usá el contexto para dar consejos relevantes cuando el usuario lo necesite.`

// TODO (coach-screen skill, presupuesto, ago 2026): todavía no hay tool de
// servidor para esta pantalla — hoy el Coach solo ve lo que manda
// kc_screen_context (client-side). Candidatos para M1/M5:
//   - `consultar_presupuesto(mes?)`: mismo cálculo que usePresupuestoCMV
//     (gasto por sector, desvío en puntos, ritmo semanal) pero con acceso a
//     más de un mes a la vez — "¿cómo vengo comparado con el mes pasado?"
//     hoy no se puede responder porque el cliente solo manda el mes activo.
//   - `guardar_presupuesto_sector(categoriaGastoId, mes, monto)`: cargar o
//     ajustar el presupuesto de un sector por chat ("subime el presupuesto
//     de carnes a 4 millones").
//   - `sembrar_presupuesto_mes(mes)`: aplicar el sugerido (mix histórico +
//     ventas estimadas) por chat, mismo botón "Usar sugerido" de la UI.
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
    name: 'buscar_receta',
    description: 'Busca recetas por nombre en el recetario del restaurante y devuelve sus ingredientes, porciones y procedimiento. Usar cuando el usuario pregunta sobre una receta específica, quiere ver una ficha técnica, o pregunta cómo se hace un plato. Si hay varias coincidencias y no es clara cuál quiere, devuelve las opciones para que el usuario elija.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Nombre o parte del nombre de la receta a buscar. Ej: "risotto", "brownie", "fondo oscuro".' },
      },
      required: ['query'],
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
  {
    name: 'sugerir_produccion',
    description: 'Calcula qué producir para un día futuro según el promedio de ventas históricas de ese mismo día de semana menos el stock actual de mise. Usar cuando el usuario pregunta algo tipo "¿qué produzco mañana?" o "¿qué conviene hacer para el viernes?". Es el mismo motor (misma fuente de datos) que el botón "Sugerir producción" de OPS → Planificación.',
    input_schema: {
      type: 'object' as const,
      properties: {
        fecha: { type: 'string', description: 'Fecha objetivo en formato YYYY-MM-DD. Si no se especifica, se usa mañana.' },
      },
      required: [],
    },
  },
  {
    name: 'consultar_stock',
    description: 'Consulta cuánto hay en stock de un producto (o de todos los que coincidan con un nombre). Devuelve cantidad, unidad y estado (crítico/bajo/ok). Usar cuando el usuario pregunta "¿cuánto tengo de X?", "¿me queda Y?", "¿cómo está el stock de Z?".',
    input_schema: {
      type: 'object' as const,
      properties: {
        producto: { type: 'string', description: 'Nombre o parte del nombre del producto. Ej: "carne", "tomate", "aceite de oliva".' },
      },
      required: ['producto'],
    },
  },
  {
    name: 'ultimo_precio',
    description: 'Devuelve el último precio pagado de un producto según las facturas cargadas, con proveedor, fecha y la variación contra la compra anterior. Usar cuando el usuario pregunta "¿a cuánto compré X?", "¿cuál fue el último precio de la carne?", "¿cuánto me sale el Y?".',
    input_schema: {
      type: 'object' as const,
      properties: {
        producto: { type: 'string', description: 'Nombre o parte del nombre del producto a buscar en las facturas. Ej: "carne", "queso", "harina".' },
      },
      required: ['producto'],
    },
  },
  {
    name: 'gasto_periodo',
    description: 'Calcula cuánto se gastó en mercadería (compras/facturas) en un rango de fechas. Opcionalmente filtra por proveedor. Usar cuando el usuario pregunta "¿cuánto gasté los últimos 2 días?", "¿cuánto compré este mes?", "¿cuánto le pagué a tal proveedor?". Interpretá expresiones como "ayer", "esta semana", "últimos 7 días" y pasá las fechas concretas.',
    input_schema: {
      type: 'object' as const,
      properties: {
        desde: { type: 'string', description: 'Fecha de inicio (inclusive) en formato YYYY-MM-DD.' },
        hasta: { type: 'string', description: 'Fecha de fin (inclusive) en formato YYYY-MM-DD. Si no se especifica, se usa hoy.' },
        proveedor: { type: 'string', description: 'Opcional. Nombre o parte del proveedor para filtrar el gasto.' },
      },
      required: ['desde'],
    },
  },
  {
    name: 'consultar_ventas',
    description: 'Devuelve las ventas y cubiertos en un rango de fechas (total facturado, cantidad de días, promedio por día y ticket promedio). Usar cuando el usuario pregunta "¿cuánto vendí esta semana?", "¿cómo venimos de ventas este mes?", "¿cuántos cubiertos hicimos ayer?".',
    input_schema: {
      type: 'object' as const,
      properties: {
        desde: { type: 'string', description: 'Fecha de inicio (inclusive) en formato YYYY-MM-DD.' },
        hasta: { type: 'string', description: 'Fecha de fin (inclusive) en formato YYYY-MM-DD. Si no se especifica, se usa hoy.' },
      },
      required: ['desde'],
    },
  },
  {
    name: 'cargar_producto',
    description: 'Da de alta un producto nuevo en el stock. Usar cuando el usuario quiere cargar/crear un producto que todavía no existe ("cargá un producto nuevo…", "agregá X al stock"). Si el producto ya podría existir, conviene primero consultar_stock. Preguntá los datos que falten (unidad, precio) antes de crear.',
    input_schema: {
      type: 'object' as const,
      properties: {
        nombre: { type: 'string', description: 'Nombre del producto. Ej: "Aceite de oliva", "Lomo".' },
        unidad: { type: 'string', description: 'Unidad de medida: kg, g, l, ml, u.' },
        precio_unitario: { type: 'number', description: 'Precio por unidad (opcional).' },
        stock_actual: { type: 'number', description: 'Cantidad inicial en stock (opcional, default 0).' },
        stock_minimo: { type: 'number', description: 'Stock mínimo deseado (opcional).' },
        categoria: { type: 'string', description: 'Categoría (opcional). Ej: Carnes, Verduras, Lácteos, Secos, Bebidas.' },
      },
      required: ['nombre', 'unidad'],
    },
  },
  {
    name: 'ajustar_stock',
    description: 'Ajusta la cantidad en stock de un producto existente. Usar cuando el usuario informa un conteo o un ingreso/egreso ("quedan 3 kg de X", "entraron 10 kg de Y", "sacá 2 de Z"). operacion "set" fija el valor exacto; "sumar" agrega; "restar" descuenta.',
    input_schema: {
      type: 'object' as const,
      properties: {
        producto: { type: 'string', description: 'Nombre (o parte) del producto a ajustar.' },
        cantidad: { type: 'number', description: 'Cantidad a fijar, sumar o restar según la operación.' },
        operacion: { type: 'string', enum: ['set', 'sumar', 'restar'], description: 'set = fijar el valor exacto (default); sumar = agregar; restar = descontar.' },
      },
      required: ['producto', 'cantidad'],
    },
  },
  {
    name: 'consultar_deudores',
    description: 'Consulta cuánto deben los clientes en cuenta corriente (fiado). Sin argumentos devuelve el saldo total y el top de deudores; con "cliente" devuelve el saldo de ese cliente puntual. Usar cuando el usuario pregunta "¿quién me debe plata?", "¿cuánto me debe X?", "¿cómo está la cuenta corriente?".',
    input_schema: {
      type: 'object' as const,
      properties: {
        cliente: { type: 'string', description: 'Opcional. Nombre o parte del nombre de un cliente puntual.' },
      },
      required: [],
    },
  },
  {
    name: 'registrar_venta',
    description: 'Registra las ventas de un día (total facturado y cubiertos). Usar cuando el usuario dicta el cierre de caja o las ventas del día ("hoy vendimos 450 mil con 60 cubiertos"). Si ya hay una venta cargada para esa fecha, la actualiza.',
    input_schema: {
      type: 'object' as const,
      properties: {
        total_ventas: { type: 'number', description: 'Total facturado del día.' },
        cantidad_cubiertos: { type: 'number', description: 'Cantidad de cubiertos/comensales (opcional).' },
        fecha: { type: 'string', description: 'Fecha de la venta en formato YYYY-MM-DD. Si no se especifica, se usa hoy.' },
      },
      required: ['total_ventas'],
    },
  },
  {
    name: 'crear_evento',
    description: 'Crea un evento con su menú de pasos (entrada, principal, prepostre, postre, etc). Usar cuando el usuario dicta un evento completo con su menú ("armá un evento para el sábado con...", "creá el evento de tal fecha, entrada X, principal Y..."). Cada paso del menú es un objeto {paso, nombre} — "paso" es la categoría (Entrada, Principal, Prepostre, Postre, o la que corresponda) y "nombre" es la preparación. Si falta la fecha o algún paso no queda claro, preguntá antes de llamar la herramienta — no inventes platos.',
    input_schema: {
      type: 'object' as const,
      properties: {
        nombre: { type: 'string', description: 'Nombre del evento. Si el usuario no da uno, usar algo descriptivo como "Evento del 25/07".' },
        fecha_evento: { type: 'string', description: 'Fecha del evento en formato YYYY-MM-DD.' },
        pasos: {
          type: 'array',
          description: 'Pasos del menú en orden.',
          items: {
            type: 'object',
            properties: {
              paso: { type: 'string', description: 'Categoría del paso: Entrada, Principal, Prepostre, Postre, etc.' },
              nombre: { type: 'string', description: 'Preparación de ese paso.' },
            },
            required: ['paso', 'nombre'],
          },
        },
      },
      required: ['nombre', 'fecha_evento', 'pasos'],
    },
  },
]

type ToolInput = Record<string, unknown>

async function executeTool(name: string, input: ToolInput, supabase: SupabaseClient, restauranteId: string | null, verCostos: boolean = true): Promise<string> {
  if (!restauranteId) return 'Error: no pude identificar tu restaurante. No ejecuté la acción.'
  const hoy = new Date().toISOString().split('T')[0]

  try {
    // Punto 2 del gate de plata: aunque el modelo no deberia ver estas tools,
    // no se ejecutan sin permiso. Es el boundary que importa.
    if (COACH_COST_TOOLS.includes(name) && !verCostos) {
      return 'Ese dato es de costos y tu puesto no los tiene habilitados. Pediselo al administrador.'
    }

    if (name === 'buscar_receta') {
      const query = String(input.query ?? '').trim()
      if (!query) return 'Error: falta el nombre de la receta a buscar.'

      const { data: coincidencias } = await supabase.from('recetas')
        .select('id, nombre, categoria, porciones, tiempo_min, food_cost, precio_venta, procedimiento')
        .eq('restaurante_id', restauranteId)
        .eq('activa', true)
        .ilike('nombre', `%${query}%`)
        .limit(4)

      if (!coincidencias || coincidencias.length === 0)
        return `No encontré ninguna receta que coincida con "${query}". Puede que todavía no esté cargada en el recetario.`

      if (coincidencias.length > 1) {
        const lista = coincidencias.map((r: Record<string, unknown>) => `- ${r.nombre} (${r.categoria ?? 'sin categoría'})`).join('\n')
        return `Encontré ${coincidencias.length} recetas que coinciden con "${query}":\n${lista}\n\nDecime cuál te interesa para ver la ficha completa.`
      }

      // Una sola coincidencia — devolver la ficha completa
      const r = coincidencias[0] as Record<string, unknown>
      const { data: ings } = await supabase.from('ingredientes')
        .select('nombre, cantidad, unidad, costo_unitario')
        .eq('receta_id', r.id)
        .limit(30)

      const fmtARS = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`
      const fc = Number(r.food_cost) || 0
      const precio = Number(r.precio_venta) || 0

      let result = `Ficha técnica: ${r.nombre}\n`
      if (r.categoria) result += `Categoría: ${r.categoria}\n`
      if (r.porciones) result += `Porciones: ${r.porciones}\n`
      if (r.tiempo_min) result += `Tiempo: ${r.tiempo_min} min\n`
      // Gate de plata (PLAN-ACCESO-Y-USO B3.4). El filtro va acá, en el server:
      // el modelo no puede decir un número que nunca recibió. Esconder un chip
      // en la UI no serviría de nada — la respuesta se arma de este lado.
      if (verCostos && precio > 0) result += `Precio venta: ${fmtARS(precio)}\n`
      if (verCostos && fc > 0) result += `Food cost: ${Math.round(fc)}%\n`

      if (ings && ings.length > 0) {
        result += `\nIngredientes:\n`
        for (const ing of ings as Array<{ nombre: string; cantidad: number; unidad: string; costo_unitario: number | null }>) {
          result += `- ${ing.nombre}: ${ing.cantidad} ${ing.unidad}\n`
        }
      }

      if (r.procedimiento) {
        const proc = String(r.procedimiento)
        result += `\nPreparación:\n${proc.length > 600 ? proc.slice(0, 600) + '...' : proc}`
      }

      return result
    }

    if (name === 'sugerir_produccion') {
      let fechaObjetivo = String(input.fecha ?? '').trim()
      if (!fechaObjetivo) {
        const d = new Date()
        d.setDate(d.getDate() + 1)
        fechaObjetivo = d.toISOString().slice(0, 10)
      }
      const resultado = await calcularSugerenciaProduccion({ supabase, restauranteId, fechaObjetivo, semanas: 8 })
      if (resultado.sugerencias.length === 0) {
        return `No encontré suficiente historial de ventas de ${resultado.diaSemanaLabel}s vinculado a recetas activas del mise para sugerir producción de ${fechaObjetivo}. Puede que falten ventas cargadas o que los platos vendidos no tengan una receta con el mismo nombre.`
      }
      const lineas = resultado.sugerencias.slice(0, 10).map(s =>
        `- ${s.nombre}: vendés en promedio ${s.promedioVenta} los ${resultado.diaSemanaLabel} (${s.muestras} muestras), tenés ${s.stockActual} en stock → sugerido producir ${s.sugerido} ${s.unidad}${s.plaza ? ` (${s.plaza})` : ''}`
      ).join('\n')
      return `Sugerencia de producción para ${resultado.diaSemanaLabel} ${fechaObjetivo}:\n${lineas}\n\n(Misma fuente que el botón "Sugerir producción" en OPS → Planificación — si el usuario quiere crear las tareas, decile que las convierta en tareas desde ahí.)`
    }

    if (name === 'consultar_stock') {
      const producto = String(input.producto ?? '').trim()
      if (!producto) return 'Error: falta el nombre del producto a consultar.'
      const { data } = await supabase.from('productos')
        .select('nombre, stock_actual, unidad, stock_minimo, stock_critico, categoria')
        .eq('restaurante_id', restauranteId)
        .eq('activo', true)
        .ilike('nombre', `%${producto}%`)
        .order('stock_actual', { ascending: true })
        .limit(15)
      const rows = (data ?? []) as Array<{ nombre: string; stock_actual: number; unidad: string | null; stock_minimo: number | null; stock_critico: number | null; categoria: string | null }>
      if (rows.length === 0) return `No encontré ningún producto que coincida con "${producto}" en el stock. Puede que no esté cargado o tenga otro nombre.`
      const estado = (p: typeof rows[number]) =>
        p.stock_actual <= (p.stock_critico ?? 0) ? 'CRÍTICO'
        : p.stock_actual <= (p.stock_minimo ?? 0) ? 'bajo' : 'ok'
      const lineas = rows.map(p =>
        `- ${p.nombre}: ${p.stock_actual} ${p.unidad ?? ''} (${estado(p)}${p.stock_minimo ? `, mínimo ${p.stock_minimo}` : ''})`
      ).join('\n')
      return `Stock de "${producto}":\n${lineas}`
    }

    if (name === 'ultimo_precio') {
      const producto = String(input.producto ?? '').trim()
      if (!producto) return 'Error: falta el nombre del producto.'
      const { data } = await supabase.from('factura_items')
        .select('producto_nombre, precio_unitario, unidad, facturas!inner(fecha_factura, created_at, proveedor_nombre, restaurante_id)')
        .eq('facturas.restaurante_id', restauranteId)
        .ilike('producto_nombre', `%${producto}%`)
        .gt('precio_unitario', 0)
        .limit(400)
      type FacRef = { fecha_factura: string | null; created_at: string | null; proveedor_nombre: string | null }
      type Row = { producto_nombre: string; precio_unitario: number | string; unidad: string | null; facturas: FacRef | FacRef[] }
      const raw = (data ?? []) as Row[]
      if (raw.length === 0) return `No encontré compras de "${producto}" en las facturas. Puede que todavía no se haya cargado ninguna factura con ese producto.`
      const items = raw.map(r => {
        const f = Array.isArray(r.facturas) ? r.facturas[0] : r.facturas
        const fecha = f?.fecha_factura || String(f?.created_at ?? '').slice(0, 10)
        return { nombre: r.producto_nombre, precio: Number(r.precio_unitario), unidad: r.unidad, proveedor: f?.proveedor_nombre ?? null, fecha }
      }).filter(r => r.fecha && r.precio > 0).sort((a, b) => b.fecha.localeCompare(a.fecha))
      if (items.length === 0) return `No encontré precios válidos de "${producto}" en las facturas.`
      const ultimo = items[0]
      let txt = `Último precio de ${ultimo.nombre}: ${fmtARS(ultimo.precio)} por ${ultimo.unidad ?? 'unidad'} (${ultimo.fecha}${ultimo.proveedor ? `, ${ultimo.proveedor}` : ''}).`
      const anterior = items.find(r => r.fecha < ultimo.fecha && r.precio !== ultimo.precio)
      if (anterior) {
        const varPct = ((ultimo.precio - anterior.precio) / anterior.precio) * 100
        txt += ` Antes lo pagabas ${fmtARS(anterior.precio)} (${anterior.fecha}) → ${varPct >= 0 ? 'subió' : 'bajó'} ${Math.abs(Math.round(varPct))}%.`
      }
      return txt
    }

    if (name === 'gasto_periodo') {
      const desde = String(input.desde ?? '').trim()
      if (!desde) return 'Error: falta la fecha de inicio del período.'
      const hasta = String(input.hasta ?? '').trim() || hoy
      const proveedor = String(input.proveedor ?? '').trim()
      const rows = await fetchAllRows<{ total: number | null; fecha_factura: string | null; proveedor_nombre: string | null }>(
        (from, to) => {
          let q = supabase.from('facturas')
            .select('total, fecha_factura, proveedor_nombre')
            .eq('restaurante_id', restauranteId)
            .gte('fecha_factura', desde)
            .lte('fecha_factura', hasta)
          if (proveedor) q = q.ilike('proveedor_nombre', `%${proveedor}%`)
          return q.order('fecha_factura', { ascending: false }).range(from, to)
        }
      )
      if (rows.length === 0) {
        return `No encontré compras entre ${desde} y ${hasta}${proveedor ? ` de "${proveedor}"` : ''}. Puede que no haya facturas cargadas en ese período.`
      }
      const total = rows.reduce((s, f) => s + (Number(f.total) || 0), 0)
      const porProv = new Map<string, number>()
      for (const f of rows) { const k = f.proveedor_nombre ?? 'Sin proveedor'; porProv.set(k, (porProv.get(k) ?? 0) + (Number(f.total) || 0)) }
      const top = [...porProv.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
      let txt = `Gasto en mercadería del ${desde} al ${hasta}${proveedor ? ` (${proveedor})` : ''}: ${fmtARS(total)} en ${rows.length} factura${rows.length !== 1 ? 's' : ''}.`
      if (!proveedor && top.length > 1) {
        txt += `\nPor proveedor: ` + top.map(([n, v]) => `${n} ${fmtARS(v)}`).join('; ') + '.'
      }
      return txt
    }

    if (name === 'consultar_ventas') {
      const desde = String(input.desde ?? '').trim()
      if (!desde) return 'Error: falta la fecha de inicio del período.'
      const hasta = String(input.hasta ?? '').trim() || hoy
      const { data } = await supabase.from('ventas')
        .select('total_ventas, cantidad_cubiertos, fecha')
        .eq('restaurante_id', restauranteId)
        .gte('fecha', desde)
        .lte('fecha', hasta)
      const rows = (data ?? []) as Array<{ total_ventas: number | null; cantidad_cubiertos: number | null; fecha: string }>
      if (rows.length === 0) return `No hay ventas cargadas entre ${desde} y ${hasta}.`
      const total = rows.reduce((s, r) => s + (Number(r.total_ventas) || 0), 0)
      const cubiertos = rows.reduce((s, r) => s + (Number(r.cantidad_cubiertos) || 0), 0)
      const dias = rows.length
      let txt = `Ventas del ${desde} al ${hasta}: ${fmtARS(total)} en ${dias} día${dias !== 1 ? 's' : ''} (promedio ${fmtARS(total / dias)}/día).`
      if (cubiertos > 0) txt += ` ${cubiertos} cubiertos, ticket promedio ${fmtARS(total / cubiertos)}.`
      return txt
    }

    if (name === 'consultar_deudores') {
      const filtroCliente = String(input.cliente ?? '').trim()
      let clienteIds: string[] | null = null
      if (filtroCliente) {
        const { data: clis } = await supabase.from('clientes')
          .select('id').eq('restaurante_id', restauranteId).ilike('nombre', `%${filtroCliente}%`).limit(10)
        if (!clis || clis.length === 0) return `No encontré ningún cliente que coincida con "${filtroCliente}".`
        clienteIds = clis.map(c => c.id as string)
      }
      type Row = { cliente_id: string; tipo: string; monto: number; cliente: { nombre: string } | { nombre: string }[] | null }
      const rows = await fetchAllRows<Row>((from, to) => {
        let q = supabase.from('cuenta_corriente_movimientos')
          .select('cliente_id, tipo, monto, cliente:clientes(nombre)')
          .eq('restaurante_id', restauranteId)
        if (clienteIds) q = q.in('cliente_id', clienteIds)
        return q.range(from, to)
      })
      if (rows.length === 0) return filtroCliente ? `"${filtroCliente}" no tiene movimientos de cuenta corriente.` : 'No hay movimientos de cuenta corriente todavía.'

      const saldoPorCliente = new Map<string, { nombre: string; saldo: number }>()
      for (const r of rows) {
        const nombre = Array.isArray(r.cliente) ? r.cliente[0]?.nombre : r.cliente?.nombre
        const signo = r.tipo === 'pago' ? Number(r.monto) : -Number(r.monto)
        const cur = saldoPorCliente.get(r.cliente_id) ?? { nombre: nombre ?? '—', saldo: 0 }
        cur.saldo += signo
        saldoPorCliente.set(r.cliente_id, cur)
      }

      if (filtroCliente) {
        const entries = [...saldoPorCliente.values()]
        const total = entries.reduce((s, e) => s + e.saldo, 0)
        const nombre = entries[0]?.nombre ?? filtroCliente
        if (total >= 0) return `${nombre} no tiene deuda${total > 0 ? ` (a favor ${fmtARS(total)})` : ''}.`
        return `${nombre} debe ${fmtARS(Math.abs(total))}.`
      }

      const saldoTotal = [...saldoPorCliente.values()].reduce((s, e) => s + e.saldo, 0)
      const deudores = [...saldoPorCliente.values()].filter(e => e.saldo < 0).sort((a, b) => a.saldo - b.saldo).slice(0, 8)
      if (deudores.length === 0) return `No hay clientes con deuda. Saldo de cuenta corriente: ${fmtARS(saldoTotal)}.`
      const lineas = deudores.map(d => `- ${d.nombre}: debe ${fmtARS(Math.abs(d.saldo))}`).join('\n')
      return `Saldo total de cuenta corriente: ${fmtARS(saldoTotal)} (negativo = te deben).\nPrincipales deudores:\n${lineas}`
    }

    return `Error: herramienta desconocida "${name}".`
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'desconocido'
    return `Error al ejecutar ${name}: ${msg}`
  }
}

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
  const restauranteId = await getRestauranteId(supabase, user.id)
  const permisos = restauranteId ? await getPermisosServer(supabase, user.id, restauranteId) : null

  const { messages, screenContext, ctx } = await req.json()

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    const err = errorSinApiKey()
    return NextResponse.json(respuestaErrorIA(err), { status: statusErrorIA(err) })
  }

  // Bloque dinámico: snapshot M1 + pantalla activa + contexto de stock/tareas del cliente + M5
  let dynamicBlock = ''
  const screen = (screenContext && typeof screenContext === 'object' && 'screen' in screenContext)
    ? String((screenContext as { screen?: unknown }).screen ?? '') : undefined
  try {
    const snapshot = await buildSnapshot(supabase, screen || undefined, permisos?.verCostos ?? false)
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

  const hoyISO = new Date().toISOString().split('T')[0]
  dynamicBlock += `\n\n## Herramientas (consulta y acciones)
Hoy es ${hoyISO}. Usá esta fecha para interpretar rangos como "ayer", "esta semana", "los últimos 2 días", "este mes" y convertirlos a fechas concretas YYYY-MM-DD antes de llamar una herramienta.

Consultas de solo lectura — usalas para responder con NÚMEROS REALES en vez de inventar:
- consultar_stock: cuánto hay de un producto ("¿cuánto me queda de X?").
- ultimo_precio: último precio pagado de un producto y su variación ("¿a cuánto compré la carne?").
- gasto_periodo: cuánto se gastó en mercadería en un rango ("¿cuánto gasté los últimos 2 días?", "¿cuánto le pagué a tal proveedor este mes?").
- consultar_ventas: ventas y cubiertos en un rango ("¿cuánto vendí esta semana?").
- consultar_deudores: saldo de cuenta corriente, general o de un cliente puntual ("¿quién me debe plata?", "¿cuánto me debe Juan?").
- buscar_receta: ficha técnica de una receta. sugerir_produccion: qué producir un día (solo lectura).

Acciones que MODIFICAN datos — usalas SOLO cuando el usuario lo pide explícitamente:
- crear_tarea ("creá una tarea…"), marcar_86 ("se acabó el…"), registrar_merma ("se tiraron 2 kg de…").
- cargar_producto ("cargá un producto nuevo…"), ajustar_stock ("quedan 3 kg de…", "entraron 10 de…"), registrar_venta ("hoy vendimos 450 mil con 60 cubiertos").
- crear_evento ("armá un evento para el sábado con menú de…", "creá el evento de tal fecha con entrada X, principal Y…") — pedile la fecha si no la dio, y confirmá cada paso del menú antes de llamar la herramienta si algo quedó ambiguo.
- IMPORTANTE: estas herramientas NO ejecutan el cambio al llamarlas — dejan la acción PROPUESTA. El usuario va a ver una tarjeta editable en el chat y tiene que confirmarla ahí. No digas "ya lo hice", "listo, cargado" ni nada que dé a entender que el cambio ya ocurrió — decí algo como "te dejo esto para que confirmes" y cerrá corto.

Reglas:
- Cuando el usuario pregunta por un dato (stock, precio, gasto, ventas), llamá la herramienta correspondiente en vez de responder de memoria o decir que no sabés.
- Si faltan datos para una acción (ej. la unidad al cargar un producto, la cantidad de la merma), preguntá antes de llamar la herramienta. No inventes precios ni cantidades.
- sugerir_produccion no crea nada — si el usuario quiere convertir la sugerencia en tareas, decile que use el botón "Sugerir producción" en OPS → Planificación.`

  // ── Streaming con loop agéntico de tools ──────────────────────
  // Cada ronda: el modelo streamea texto (que reenviamos al cliente token a token) y/o
  // pide tools. Si pide tools, las ejecutamos server-side y volvemos a llamar; el texto
  // final sigue streameándose sin cortes. Ver lib/coach/stream.ts para el marcador de error.
  const convo: AnthropicMsg[] = Array.isArray(messages) ? [...messages] : []

  // Gate de permisos, punto 1 de 2: el modelo ni ve las tools mutantes que el usuario no
  // puede ejecutar. El punto 2 (el que realmente importa) es la revalidación en /api/coach/confirm.
  const allowedTools = COACH_TOOLS.filter(t => {
    // Las de lectura que devuelven plata se filtran por verCostos: no estaban
    // gateadas por nada, asi que cualquiera podia preguntarle al Coach el gasto
    // del mes o quien debe. El punto 2 es la guarda dentro de executeTool.
    if (COACH_COST_TOOLS.includes(t.name) && !(permisos?.verCostos ?? false)) return false
    return !COACH_MUTATING_TOOLS.includes(t.name) || (permisos !== null && puedeEjecutarTool(permisos, t.name))
  })

  const callAnthropic = (msgs: AnthropicMsg[]) => fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      stream: true,
      system: [
        { type: 'text', text: COACH_STATIC_PROMPT, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: dynamicBlock },
      ],
      tools: allowedTools,
      messages: msgs,
    }),
  })

  // Primera llamada: si falla, respondemos con el status correcto ANTES de abrir el stream
  // (cubre 401/402/429/overload — el punto de falla más común).
  let anthropicRes = await callAnthropic(convo)
  if (!anthropicRes.ok) {
    const err = clasificarErrorIA(anthropicRes.status, await anthropicRes.text())
    console.error('[/api/coach] IA:', err.tipo, err.requestId ?? '')
    return NextResponse.json(respuestaErrorIA(err), { status: statusErrorIA(err) })
  }

  const encoder = new TextEncoder()
  const decoder = new TextDecoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (text: string) => controller.enqueue(encoder.encode(text))
      // Cap de 1 draft por request completo (puede abarcar varias rondas): si el modelo pide
      // una segunda tool mutante en el mismo mensaje, se le pide esperar a que se resuelva la primera.
      let pendingActionForResponse: PendingAction | null = null
      // Consumo acumulado de TODAS las rondas del loop agéntico: un turno del Coach
      // puede ser 3-4 llamadas a la API, y el costo del turno es la suma. Se asienta
      // una sola fila en `ia_uso` al cerrar el stream (ver finally).
      const consumo = { entrada: 0, salida: 0, cacheLectura: 0, cacheEscritura: 0 }
      try {
        for (let round = 0; round < 4; round++) {
          if (!anthropicRes.ok || !anthropicRes.body) {
            const mensaje = anthropicRes.ok
              ? 'Sin respuesta del asistente'
              : clasificarErrorIA(anthropicRes.status, await anthropicRes.text().catch(() => '')).mensaje
            send(`${COACH_ERROR_MARK}${mensaje}`)
            break
          }

          const reader = anthropicRes.body.getReader()
          let buf = ''
          let stopReason = ''
          const textBlocks: string[] = []
          const toolUses: { id: string; name: string; json: string }[] = []
          let curTool: { id: string; name: string; json: string } | null = null

          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            buf += decoder.decode(value, { stream: true })
            let nl: number
            while ((nl = buf.indexOf('\n')) >= 0) {
              const line = buf.slice(0, nl).trim()
              buf = buf.slice(nl + 1)
              if (!line.startsWith('data:')) continue
              const payload = line.slice(5).trim()
              if (!payload || payload === '[DONE]') continue
              let evt: {
                type?: string
                content_block?: { type?: string; id?: string; name?: string }
                delta?: { type?: string; text?: string; partial_json?: string; stop_reason?: string }
                // `message_start` trae los tokens de entrada y de cache; `message_delta`,
                // los de salida. Es la única vía de medir consumo en streaming.
                message?: {
                  usage?: {
                    input_tokens?: number
                    cache_read_input_tokens?: number
                    cache_creation_input_tokens?: number
                  }
                }
                usage?: { output_tokens?: number }
              }
              try { evt = JSON.parse(payload) } catch { continue }

              if (evt.type === 'message_start') {
                const u = evt.message?.usage
                consumo.entrada += u?.input_tokens ?? 0
                consumo.cacheLectura += u?.cache_read_input_tokens ?? 0
                consumo.cacheEscritura += u?.cache_creation_input_tokens ?? 0
              }

              if (evt.type === 'content_block_start') {
                if (evt.content_block?.type === 'tool_use') {
                  curTool = { id: String(evt.content_block.id), name: String(evt.content_block.name), json: '' }
                } else if (evt.content_block?.type === 'text') {
                  textBlocks.push('')
                }
              } else if (evt.type === 'content_block_delta') {
                if (evt.delta?.type === 'text_delta') {
                  const t = evt.delta.text ?? ''
                  if (textBlocks.length === 0) textBlocks.push('')
                  textBlocks[textBlocks.length - 1] += t
                  send(t)
                } else if (evt.delta?.type === 'input_json_delta' && curTool) {
                  curTool.json += evt.delta.partial_json ?? ''
                }
              } else if (evt.type === 'content_block_stop') {
                if (curTool) { toolUses.push(curTool); curTool = null }
              } else if (evt.type === 'message_delta') {
                if (evt.delta?.stop_reason) stopReason = evt.delta.stop_reason
                consumo.salida += evt.usage?.output_tokens ?? 0
              }
            }
          }

          if (stopReason === 'tool_use' && toolUses.length > 0) {
            const assistantBlocks: unknown[] = []
            const joinedText = textBlocks.join('')
            if (joinedText) assistantBlocks.push({ type: 'text', text: joinedText })
            const parsedInputs = toolUses.map(tu => {
              try { return tu.json ? JSON.parse(tu.json) as ToolInput : {} } catch { return {} }
            })
            toolUses.forEach((tu, i) => {
              assistantBlocks.push({ type: 'tool_use', id: tu.id, name: tu.name, input: parsedInputs[i] })
            })
            convo.push({ role: 'assistant', content: assistantBlocks })

            const toolResults = []
            for (let i = 0; i < toolUses.length; i++) {
              const name = toolUses[i].name
              if (COACH_MUTATING_TOOLS.includes(name)) {
                if (pendingActionForResponse) {
                  toolResults.push({
                    type: 'tool_result', tool_use_id: toolUses[i].id,
                    content: 'Ya hay una acción pendiente de confirmación en este mensaje. Pedile al usuario que la confirme o cancele antes de proponer otra.',
                  })
                  continue
                }
                if (!restauranteId || !permisos) {
                  toolResults.push({ type: 'tool_result', tool_use_id: toolUses[i].id, content: 'Error: no pude identificar tu restaurante. No se propuso nada.' })
                  continue
                }
                const { toolResultText, pendingAction } = await proposeAction(
                  supabase, restauranteId, user.id, screen, name, parsedInputs[i], permisos
                )
                toolResults.push({ type: 'tool_result', tool_use_id: toolUses[i].id, content: toolResultText })
                if (pendingAction) pendingActionForResponse = pendingAction
              } else {
                const result = await executeTool(name, parsedInputs[i], supabase, restauranteId, permisos?.verCostos ?? false)
                toolResults.push({ type: 'tool_result', tool_use_id: toolUses[i].id, content: result })
              }
            }
            convo.push({ role: 'user', content: toolResults })
            anthropicRes = await callAnthropic(convo)
            continue
          }
          break // end_turn — respuesta final completa
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'error'
        try { send(`${COACH_ERROR_MARK}${msg}`) } catch { /* stream ya cerrado */ }
      } finally {
        // Corre siempre que se haya creado un draft, incluso si el loop se cortó por el
        // límite de 4 rondas sin que el modelo cerrara con texto — la tarjeta igual llega.
        if (pendingActionForResponse) {
          try { send(COACH_PENDING_MARK + JSON.stringify(pendingActionForResponse)) } catch { /* stream ya cerrado */ }
        }
        // Un asiento por turno del Coach, aunque el turno haya fallado a mitad:
        // los tokens ya consumidos se pagan igual y tienen que contar para el tope.
        registrarUsoIA({
          tag: 'coach',
          modelo: 'claude-sonnet-4-6',
          restauranteId,
          usuarioId: user.id,
          tokensEntrada: consumo.entrada,
          tokensSalida: consumo.salida,
          tokensCacheLectura: consumo.cacheLectura,
          tokensCacheEscritura: consumo.cacheEscritura,
        })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  })
}
