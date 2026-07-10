// Genera el PDF "Instructivo de carga de datos" con el estilo editorial de KitchenOS.
// HTML con fuentes serif (Playfair Display) + Material Symbols, render con puppeteer page.pdf.
// Uso: node scripts/build-instructivo-pdf.mjs
import puppeteer from 'puppeteer-core'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL as toFileURL } from 'node:url'

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const HTML = resolve('docs/instructivo-carga-datos.html')
const PDF = resolve('docs/Instructivo-carga-datos.pdf')

// ── Grupos de color ──────────────────────────────────────────
const G = {
  orange: { c: '#e0913c', ink: '#b06a1f', soft: '#fbf1e2', name: 'Arranque' },
  green:  { c: '#2f9e6b', ink: '#1f7d51', soft: '#e7f4ee', name: 'Recetas y carta' },
  blue:   { c: '#3b6fd4', ink: '#2a52a0', soft: '#e8eefb', name: 'Ventas' },
  violet: { c: '#7c5cd4', ink: '#5b3fb0', soft: '#efeafb', name: 'Operación diaria' },
}

// ── Helpers de render ────────────────────────────────────────
let pageNo = 0
const ms = (n) => `<span class="ms">${n}</span>`

function footer() {
  pageNo++
  return `<div class="footer"><span>KitchenOS · Instructivo de carga de datos</span><span>${pageNo}</span></div>`
}

function pageHeader(icon, name, section) {
  return `<div class="phead">
    <div class="phead-l">${ms(icon)}<span>${name}</span></div>
    <div class="phead-r">${section}</div>
  </div>`
}

function phone(src, caption) {
  return `<figure class="phone-wrap">
    <div class="phone"><img src="${src}" alt=""></div>
    ${caption ? `<figcaption>${ms('photo_camera')} ${caption}</figcaption>` : ''}
  </figure>`
}

function methodCard(g, m) {
  return `<div class="card" style="--cc:${g.c};--ci:${g.ink};--cs:${g.soft}">
    <div class="card-ico">${ms(m.icon)}</div>
    <div class="card-label">${m.label}</div>
    <div class="card-title">${m.title}</div>
    <p class="card-body">${m.body}</p>
  </div>`
}

function callout(c) {
  return `<div class="callout">
    <div class="callout-ico">${ms('tips_and_updates')}</div>
    <div><strong>${c.title}</strong> ${c.body}</div>
  </div>`
}

function impactTable(rows) {
  return `<table class="impact">
    <thead><tr><th>Módulo</th><th>Qué pasa automáticamente</th></tr></thead>
    <tbody>${rows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('')}</tbody>
  </table>`
}

function solveCols(g, cols) {
  return `<div class="solve-row">${cols.map(col => `
    <div class="solve" style="--cc:${g.c}">
      <div class="solve-head">${ms(col.icon)} ${col.role}</div>
      <ul>${col.items.map(i => `<li>${i}</li>`).join('')}</ul>
    </div>`).join('')}</div>`
}

function extrasBlock(g, extras) {
  return `<div class="extras">
    <div class="extras-tag" style="--cc:${g.c};--cs:${g.soft};--ci:${g.ink}">${ms('star')} Valor adicional</div>
    <div class="extras-grid">${extras.map((e, i) => `
      <div class="extra"><span class="extra-n" style="--cc:${g.c}">${i + 1}</span>
      <div><strong>${e.title}.</strong> ${e.body}</div></div>`).join('')}</div>
  </div>`
}

// ── Contenido de los módulos ─────────────────────────────────
const MODS = [
  {
    g: G.orange, icon: 'receipt_long', name: 'Facturas', section: '01 · Etapa 1',
    eyebrow: 'El primer dato — todo nace acá',
    lead: 'Todo lo demás depende de las facturas: el stock, los precios, el food cost y los reportes. Sin facturas KitchenOS funciona; <strong>con facturas, se vuelve inteligente.</strong>',
    who: 'Administrador · encargado de compras',
    methods: [
      { icon: 'table_view', label: 'Método 1 · masivo', title: 'Excel de tu sistema', body: 'Exportá el cierre del mes de Fudo, Maxirest o Bistrosoft y subilo en <em>Facturas → Importar masivo</em>. Cargá mes a mes, en orden cronológico: la app usa siempre el precio más reciente.' },
      { icon: 'photo_camera', label: 'Método 2 · día a día', title: 'Foto o PDF (OCR)', body: 'Sacale una foto a la factura o subí el PDF con el botón <em>+</em>. La IA extrae proveedor, fecha, ítems, total y condición de pago. Siempre revisás antes de confirmar.' },
      { icon: 'edit_note', label: 'Método 3', title: 'Carga manual', body: 'Completás los campos a mano. Para compras chicas, remitos informales o sin documento digital.' },
    ],
    tip: { title: 'Filtro de privacidad (botón escudo).', body: 'Fudo mezcla sueldos y pagos a socios como “gastos”. Agregá esos nombres y la app los excluye solos de toda importación futura.' },
    shot: 'shots/facturas.png', caption: 'Compras reales: total, proveedores y estado de pago.',
    impact: [
      ['Stock', 'Cada producto se crea o actualiza con precio, unidad y categoría.'],
      ['Precios / Inflación', 'Guarda el precio por unidad; ves la evolución mes a mes.'],
      ['Proveedores', 'Si el proveedor no existía, se crea solo.'],
      ['Reportes', 'Las compras entran al CMV, rankings y presupuesto.'],
      ['Food cost', 'Si sube un insumo, toda receta que lo use se recalcula.'],
    ],
    solves: [
      { icon: 'admin_panel_settings', role: 'Administrador', items: ['Cuánto gastaste por proveedor y categoría, sin una sola planilla', 'Qué productos subieron y cuánto', 'Facturas impagas y cuentas por pagar'] },
      { icon: 'groups', role: 'Encargado / chef', items: ['No recargar el stock a mano tras cada entrega', 'Comparar precios semana a semana', 'Detectar faltantes cruzando factura y stock'] },
    ],
    extras: [
      { title: 'Alerta de variación de precio', body: 'Avisa si un producto subió más de lo esperado vs la compra anterior, antes de guardar.' },
      { title: 'Cuentas por pagar', body: 'Tab “Por pagar” + KPI: cuánto le debés a cada proveedor.' },
      { title: 'Reconciliación factura ↔ pedido', body: 'Vinculás la factura con el pedido para detectar diferencias.' },
    ],
  },
  {
    g: G.orange, icon: 'inventory_2', name: 'Stock / Inventario', section: '02 · Etapa 1',
    eyebrow: 'Qué tenés hoy y cuándo se acaba',
    lead: 'En buena parte <strong>se arma solo desde las facturas.</strong> Es la base del food cost, las alertas de reposición y los pedidos.',
    who: 'Administrador lo configura · el equipo lo cuenta',
    methods: [
      { icon: 'auto_awesome', label: 'Camino 1 · preferido', title: 'Automático desde facturas', body: 'Si ya cargaste facturas, el stock ya existe. Si quedó incompleto, usá <em>Rebuild</em>: reconstruye todo con el precio más reciente. Es seguro: sin facturas, no borra nada.' },
      { icon: 'upload_file', label: 'Camino 2', title: 'Importar tu Excel', body: 'Subís tu planilla de inventario y la IA reconoce las columnas aunque se llamen distinto. Revisás antes de confirmar.' },
      { icon: 'inventory', label: 'Camino 3 · stock-take', title: 'Modo rápido', body: 'Elegís el sector y la app te muestra producto por producto, en pantalla grande, para contar con el celular.' },
    ],
    tip: { title: 'Producciones internas.', body: 'Caldos, masas y fondos que se producen y nunca aparecen en factura: marcalos como “producción interna” y vinculá su receta — el costo se toma solo de ahí.' },
    shot: 'shots/stock.png', caption: 'Inventario real con crítico/bajo/inmóvil y precios.',
    impact: [
      ['Inicio', 'Lo crítico/bajo aparece en alertas y en la campana.'],
      ['Recetario', 'El precio del producto alimenta el costo del ingrediente.'],
      ['Carta', 'El food cost de cada plato sale de sus productos.'],
      ['Pedidos', 'Lo bajo/crítico es lo que sugiere pedir.'],
      ['Merma', 'Al registrar merma, se descuenta solo.'],
    ],
    solves: [
      { icon: 'admin_panel_settings', role: 'Administrador', items: ['Cuánta plata tenés parada en mercadería', 'Que nadie cargue inventario a mano', 'Food cost confiable: precios al día'] },
      { icon: 'groups', role: 'Encargado / chef', items: ['Qué se agota antes de que falte en servicio', 'Inventario físico con el celu', 'Detectar diferencias sistema vs heladera'] },
    ],
    extras: [
      { title: 'Mínimo y crítico sugeridos', body: 'La app propone umbrales según cuánto y cada cuánto comprás cada producto.' },
      { title: 'Stock inmóvil (capital dormido)', body: 'Detecta productos sin compras hace mucho que aún tienen stock.' },
      { title: 'Badge “Producción”', body: 'Distingue lo que se produce internamente de lo que se compra.' },
    ],
  },
  {
    g: G.green, icon: 'menu_book', name: 'Recetario', section: '03 · Etapa 1',
    eyebrow: 'Lo que convierte el stock en rentabilidad',
    lead: 'Con los productos costeados, el recetario calcula <strong>cuánto cuesta cada plato</strong> y, contra el precio de venta, su food cost. Sin recetas sabés qué comprás; con recetas, si ganás plata con cada plato.',
    who: 'Administrador · chef',
    methods: [
      { icon: 'document_scanner', label: 'Camino 1 · el más rápido', title: 'Importar fichas con IA', body: 'Foto, PDF o texto de la ficha técnica. La IA extrae nombre, ingredientes con cantidad, procedimiento y porciones. Después vincula cada ingrediente a un producto del stock para traer el costo real.' },
      { icon: 'edit_note', label: 'Camino 2', title: 'Carga manual', body: 'Nombre, porciones, precio, ingredientes (buscador del stock) y procedimiento. El food cost se calcula en vivo.' },
      { icon: 'lightbulb', label: 'Camino 3 · Ideas', title: 'Borrador → completar con IA', body: 'Anotás solo el nombre del plato; después dictás o pegás ingredientes y la IA completa la receta.' },
    ],
    tip: { title: 'Subrecetas que se reutilizan.', body: 'Una salsa base o un fondo se cargan una vez y se usan en muchos platos; si cambia un insumo, el costo se actualiza en todos.' },
    shot: 'shots/recetario.png', caption: 'Recetas reales con porciones, peso y tiempo.',
    impact: [
      ['Carta', 'El food cost del plato sale de sus recetas.'],
      ['Stock', 'Los ingredientes leen el precio del producto.'],
      ['OPS / Mise', 'Las recetas definen qué se produce y cuánto por plaza.'],
      ['Pase / Tareas', 'Una receta se manda a producir como tarea.'],
      ['Reportes', 'Food cost promedio y recetas más caras.'],
    ],
    solves: [
      { icon: 'admin_panel_settings', role: 'Administrador', items: ['Food cost real, no estimado', 'Qué recetas dejaron de ser rentables al subir insumos', 'Estandarizar: que el plato salga igual siempre'] },
      { icon: 'soup_kitchen', role: 'Chef / cocinero', items: ['Las fichas en el celular, no en una carpeta', 'Escalar una receta sin recalcular a mano', 'Cargar recetas con una foto'] },
    ],
    extras: [
      { title: 'Escalado de receta', body: 'Con “Producir N porciones”, las cantidades se recalculan al instante.' },
      { title: 'Salud del recetario', body: 'Agrupa recetas con costeo incompleto, food cost crítico o sin precio.' },
      { title: 'Sugerir precio de venta', body: 'Dado un food cost objetivo, sugiere a cuánto vender el plato.' },
    ],
  },
  {
    g: G.green, icon: 'restaurant_menu', name: 'Carta', section: '04 · Etapa 1',
    eyebrow: 'Donde el food cost se vuelve precio',
    lead: 'Si el recetario calcula cuánto cuesta un plato, la Carta define <strong>a cuánto lo vendés, cómo se agrupa y si está disponible.</strong> Es el puente entre la cocina y el salón.',
    who: 'Administrador define precios · el equipo marca 86',
    methods: [
      { icon: 'document_scanner', label: 'Camino 1 · el más rápido', title: 'Importar con IA', body: 'Foto de la carta impresa, PDF, Excel o texto. La IA extrae nombre, componentes, porciones, precio y tags dietarios (S/TACC, vegano, keto…). Cada componente se vincula solo a una receta o producto.' },
      { icon: 'add_circle', label: 'Camino 2', title: 'Crear plato a mano', body: 'Nombre, precio, categoría, tags y composición. El food cost se calcula en vivo.' },
      { icon: 'event', label: 'Camino 3', title: 'Menús y eventos', body: 'El mismo editor arma menús fijos o eventos por curso, con plaza y cantidad. Es lo que se “activa” en Planificación para producir.' },
    ],
    tip: { title: 'Jerarquía clara.', body: 'ingrediente → receta → plato → menú. Cada capa hereda el costo de la anterior, así un cambio de precio se refleja hasta el plato.' },
    shot: 'shots/carta.png', caption: 'Platos reales con precio, tags y disponibilidad (86).',
    impact: [
      ['Recetario', 'Cada plato lee el food cost de sus recetas.'],
      ['OPS / Mise', 'Asignar un componente a OPS crea el ítem de mise.'],
      ['Planificación', 'Activar un menú genera las tareas del día.'],
      ['Pase / Servicio', 'El 86 avisa al equipo qué plato no sale.'],
      ['Reportes', 'El precio es la base del CMV y el margen.'],
    ],
    solves: [
      { icon: 'admin_panel_settings', role: 'Administrador', items: ['Food cost y margen al lado del precio', 'Subir la carta entera con una foto', 'Qué platos rinden y cuáles repensar'] },
      { icon: 'soup_kitchen', role: 'Chef / encargado', items: ['Marcar 86 al instante y que todos lo vean', 'Carta sincronizada con lo que la cocina puede producir'] },
    ],
    extras: [
      { title: 'Ingeniería de menú', body: 'Cruza ventas × margen y clasifica cada plato: Estrella, Caballo, Puzzle o Perro.' },
      { title: 'Reprecio por inflación (en lote)', body: 'Lista los platos pasados de food cost y sugiere el nuevo precio.' },
      { title: 'Salud de la carta', body: 'Agrupa los platos sin receta, con margen negativo, en 86 o sin categoría.' },
    ],
  },
  {
    g: G.blue, icon: 'point_of_sale', name: 'Ventas', section: '05 · Etapa 1',
    eyebrow: 'El dato que cierra el círculo',
    lead: 'Lo anterior responde “cuánto cuesta y a cuánto vendo”; <strong>Ventas responde cuánto vendiste de verdad.</strong> Convierte el food cost teórico en rentabilidad real: CMV, ticket promedio y mix de platos.',
    who: 'Administrador · encargado (al cierre)',
    methods: [
      { icon: 'upload_file', label: 'Camino 1 · lo común', title: 'Importar desde tu POS', body: 'Subís el Excel del cierre. Lee el total y, si está, el detalle de platos vendidos. Usá el reporte de “productos vendidos” para desbloquear la ingeniería de menú.' },
      { icon: 'content_paste', label: 'Camino 2', title: 'Pegar texto / dictar', body: 'Pegás el texto del cierre o de un WhatsApp y la IA lo estructura: total, cubiertos y platos.' },
      { icon: 'bolt', label: 'Camino 3', title: 'Cierre rápido del día', body: 'Fecha + total + cubiertos en un toque. Para el cierre simple de cada noche.' },
    ],
    tip: { title: 'Cargá sin huecos.', body: 'Con días sin cargar, el CMV y el ticket promedio mienten. La app avisa cuántos días del mes quedaron vacíos.' },
    shot: 'shots/reportes.png', caption: 'Reportes reales: compras, facturas, stock y food cost.',
    impact: [
      ['Reportes → CMV', 'Ventas × compras → costo de mercadería y food cost real.'],
      ['Presupuesto vs Real', 'Ventas reales contra el objetivo.'],
      ['Ingeniería de menú', 'Los platos vendidos dan la popularidad.'],
      ['Rendimiento', 'Ticket promedio, cubiertos y evolución.'],
    ],
    solves: [
      { icon: 'admin_panel_settings', role: 'Administrador', items: ['Food cost real del mes (no el teórico)', 'Ticket promedio y su evolución', 'Qué platos sostienen la facturación'] },
      { icon: 'groups', role: 'Chef / encargado', items: ['Saber qué se vende para producir acorde', 'Justificar decisiones de carta con números'] },
    ],
    extras: [
      { title: 'Ranking de platos vendidos', body: 'Los más y menos vendidos con su % de participación sobre la facturación.' },
      { title: 'Food cost teórico del período', body: 'Platos vendidos × costo de receta: revela la fuga (merma, porciones, robo).' },
      { title: 'Alerta de días sin cargar', body: 'Avisa los huecos del mes que distorsionan tus números.' },
    ],
  },
  // ── ETAPA 2 ──
  {
    g: G.violet, icon: 'checklist', name: 'OPS · Producción y Mise', section: '06 · Etapa 2',
    eyebrow: 'El centro de la operación diaria',
    lead: 'Acá el equipo decide y sigue <strong>qué producir hoy, qué mise dejar listo y cómo repartir el trabajo por plaza.</strong> Una sola pantalla con tres pestañas.',
    who: 'Todo el equipo de cocina',
    methods: [
      { icon: 'task_alt', label: 'Pestaña 1', title: 'Producción', body: 'La lista de tareas del día con prioridad, plaza y responsable. Se tilda en verde al terminar. Lo que queda sin hacer se arrastra un día.' },
      { icon: 'playlist_add_check', label: 'Pestaña 2', title: 'Mise en place', body: 'El checklist por plaza. Calcula cuánto producir según el recipiente y la porción, y muestra el déficit (“faltan 20 porc, producí 1,5 kg”).' },
      { icon: 'factory', label: 'Pestaña 3', title: 'Planificación', body: 'Activás un menú o evento y se generan solas las tareas de producción, repartidas por plaza.' },
    ],
    tip: { title: 'De la carta a la cocina.', body: 'Activar un menú en Planificación convierte la carga de datos en tareas concretas: la producción sale sola, estandarizada.' },
    shot: 'shots/mise.png', caption: 'Checklist de mise por plaza, en vivo.',
    impact: [
      ['Carta', 'Activar un menú genera las tareas de producción.'],
      ['Recetario', 'Define qué se produce y en qué cantidad.'],
      ['Stock', 'El mise calcula cantidades con la medida del producto.'],
      ['Pase', 'Lo pendiente se comunica al turno siguiente.'],
    ],
    solves: [
      { icon: 'soup_kitchen', role: 'Chef / encargado', items: ['Repartir trabajo por plaza sin papelitos', 'Ver el avance del turno de un vistazo', 'Que el mise calcule cuánto producir solo'] },
      { icon: 'restaurant', role: 'Cocinero', items: ['Saber qué le toca hoy, en su plaza', 'Tildar lo que va terminando y que el equipo lo vea'] },
    ],
    extras: [
      { title: 'Carryover de 1 día', body: 'Lo no terminado ayer aparece hoy para que nada se pierda.' },
      { title: 'Rutinas', body: 'Limpieza y controles que se repiten aparecen el día que corresponde.' },
      { title: 'Cálculo de recipiente', body: 'Convierte porciones, peso y capacidad para decirte cuánto producir.' },
    ],
  },
  {
    g: G.violet, icon: 'forum', name: 'Pase / Servicio', section: '07 · Etapa 2',
    eyebrow: 'La “radio” de la cocina en tiempo real',
    lead: 'Reemplaza los gritos y los papelitos del servicio: un canal donde el equipo se comunica al instante qué pasa en cada plaza.',
    who: 'Toda la cocina y el pase',
    methods: [
      { icon: 'send', label: 'Cómo se usa', title: 'Mensajes al instante', body: 'Escribís y lo ve todo el equipo. Mencionás a alguien con @nombre o a una plaza con #parrilla, #fríos, #calientes.' },
      { icon: 'bolt', label: 'Atajos', title: 'Mensajes rápidos', body: 'De un toque: Falta stock, Producción pendiente, Equipo roto, Reserva especial, Limpieza, Todo OK.' },
      { icon: 'priority_high', label: 'Foco', title: 'Prioridad', body: 'Cada mensaje puede marcarse urgente para que resalte sobre el resto.' },
    ],
    tip: { title: 'Queda registro.', body: 'Lo que pasó en el turno no se pierde en el ruido: el historial del pase deja constancia de 86, faltantes y reservas.' },
    shot: 'shots/pase.png', caption: 'Chat de cocina real con menciones y mensajes rápidos.',
    impact: [
      ['Tareas', 'Un mensaje puede convertirse en tarea (“Crear tarea”).'],
      ['Carta', 'El 86 comunicado se ve reflejado en disponibilidad.'],
      ['OPS', 'Lo pendiente del turno pasa al siguiente.'],
    ],
    solves: [
      { icon: 'groups', role: 'Equipo de cocina', items: ['Comunicar un 86 o faltante sin frenar el servicio', 'Que quede registro de lo que pasó'] },
      { icon: 'soup_kitchen', role: 'Chef / encargado', items: ['Coordinar plazas sin estar en cada una', 'Avisar reservas y cambios a todos de una'] },
    ],
    extras: [
      { title: 'Menciones @ y #', body: 'Dirigís el mensaje a una persona o a una plaza puntual.' },
      { title: 'Crear tarea desde el chat', body: 'Un mensaje se transforma en tarea de producción al toque.' },
      { title: 'Historial por fecha', body: 'Revisás qué se dijo en cada turno.' },
    ],
  },
  {
    g: G.violet, icon: 'recycling', name: 'Merma', section: '08 · Etapa 2',
    eyebrow: 'Que el stock y el food cost no mientan',
    lead: 'Donde se registra lo que se desperdicia o descarta. Cada merma <strong>se descuenta sola del stock</strong> y suma a la estadística de pérdidas.',
    who: 'Cocina y encargados, al momento',
    methods: [
      { icon: 'add_circle', label: 'Cómo se carga', title: 'Producto + motivo', body: 'Elegís producto, cantidad, motivo (vencimiento, mal estado, error…) y turno. La app calcula el costo estimado con el precio del producto.' },
      { icon: 'date_range', label: 'Vistas', title: 'Hoy · Semana · Mes', body: 'Ves cuánta plata se fue en desperdicio por período, con el top de motivos.' },
      { icon: 'sync_alt', label: 'Automático', title: 'Descuenta del stock', body: 'Lo que se tiró deja de figurar en la heladera: el inventario refleja la realidad.' },
    ],
    tip: { title: 'La fuga, a la vista.', body: 'Cruzá la merma con el food cost teórico de Ventas para encontrar dónde se va la mercadería que no se vende.' },
    shot: 'shots/merma.png', caption: 'Registros reales con motivo, costo y responsable.',
    impact: [
      ['Stock', 'Descuenta la cantidad mermada automáticamente.'],
      ['Reportes', 'Suma a la pérdida del período por motivo.'],
      ['Food cost', 'Ayuda a explicar la diferencia entre teórico y real.'],
    ],
    solves: [
      { icon: 'admin_panel_settings', role: 'Administrador', items: ['Cuánto se pierde de verdad y por qué', 'Encontrar la fuga del food cost'] },
      { icon: 'soup_kitchen', role: 'Chef / cocinero', items: ['Que el stock refleje la realidad', 'Detectar productos que se desperdician siempre igual'] },
    ],
    extras: [
      { title: 'Costo estimado automático', body: 'Valoriza cada merma con el precio vigente del producto.' },
      { title: 'Top de motivos', body: 'Muestra la causa más frecuente del desperdicio.' },
      { title: 'Por turno', body: 'Distingue apertura, servicio y cierre.' },
    ],
  },
  {
    g: G.violet, icon: 'shopping_cart', name: 'Pedidos', section: '09 · Etapa 2',
    eyebrow: 'Comprar apoyado en lo que la app ya sabe',
    lead: 'Armás los pedidos a proveedores con sugerencias automáticas: qué está bajo en stock, qué le comprás siempre a cada proveedor y a qué precio.',
    who: 'Encargado de compras · chef',
    methods: [
      { icon: 'storefront', label: 'Paso 1', title: 'Elegís el proveedor', body: 'De los que ya se crearon solos con las facturas.' },
      { icon: 'auto_awesome', label: 'Paso 2', title: 'Sugerencias automáticas', body: 'La app propone lo que más le comprás y lo que está bajo o crítico, con un precio estimado. Ajustás cantidades.' },
      { icon: 'share', label: 'Paso 3', title: 'Enviás y seguís', body: 'Por WhatsApp o PDF. Cada pedido pasa por Borrador → Enviado → Parcial → Recibido.' },
    ],
    tip: { title: 'Pedido ↔ factura.', body: 'Cuando llega la mercadería y cargás la factura, vinculás ambas para detectar diferencias entre lo pedido y lo facturado.' },
    mockup: 'pedidos',
    impact: [
      ['Stock', 'Lo bajo/crítico alimenta las sugerencias.'],
      ['Facturas', 'Los proveedores y precios salen de las facturas.'],
      ['Reportes', 'El gasto estimado anticipa la compra.'],
    ],
    solves: [
      { icon: 'shopping_cart', role: 'Encargado de compras', items: ['Armar el pedido en minutos', 'Mandarlo por WhatsApp sin tipear la lista', 'No olvidar reponer lo que se agota'] },
      { icon: 'admin_panel_settings', role: 'Administrador', items: ['Saber cuánto vas a gastar antes de comprar', 'Control de lo pedido vs lo recibido'] },
    ],
    extras: [
      { title: 'Export a WhatsApp / PDF', body: 'El pedido sale listo para el proveedor en un toque.' },
      { title: 'Estados del pedido', body: 'Seguimiento de borrador a recibido.' },
      { title: 'Precio estimado', body: 'Anticipás el gasto con el último precio conocido.' },
    ],
  },
]

// Mockup CSS de Pedidos (la pantalla real crashea en la cuenta demo)
function pedidosMockup() {
  return `<figure class="phone-wrap">
    <div class="phone phone--mock">
      <div class="mk">
        <div class="mk-head"><span>Pedido nuevo</span>${ms('shopping_cart')}</div>
        <div class="mk-prov">${ms('storefront')} Carnes del Sur SRL</div>
        <div class="mk-row"><span>Bife de chorizo</span><b>12 kg</b></div>
        <div class="mk-row mk-low"><span>${ms('warning')} Asado de tira <i>bajo</i></span><b>8 kg</b></div>
        <div class="mk-row"><span>Vacío</span><b>6 kg</b></div>
        <div class="mk-total"><span>Total estimado</span><b>$ 286.400</b></div>
        <div class="mk-actions"><span class="mk-wa">${ms('share')} WhatsApp</span><span class="mk-pdf">${ms('picture_as_pdf')} PDF</span></div>
      </div>
    </div>
    <figcaption>${ms('draw')} Ejemplo de pedido con sugerencias y export.</figcaption>
  </figure>`
}

// ── Render de un módulo (2 páginas) ──────────────────────────
function renderModule(m) {
  const g = m.g
  const visual = m.shot ? phone(m.shot, m.caption) : pedidosMockup()
  // Página A — cómo se carga
  const pageA = `<section class="page">
    ${pageHeader(m.icon, m.name, m.section)}
    <div class="eyebrow" style="color:${g.ink}">${m.eyebrow}</div>
    <h2>${m.name}</h2>
    <p class="lead">${m.lead}</p>
    <div class="who" style="--cc:${g.c};--cs:${g.soft};--ci:${g.ink}">${ms('person')} ${m.who}</div>
    <div class="ab">
      <div class="cards">${m.methods.map(x => methodCard(g, x)).join('')}</div>
      ${visual}
    </div>
    ${callout(m.tip)}
    ${footer()}
  </section>`
  // Página B — qué hace y qué resuelve
  const pageB = `<section class="page">
    ${pageHeader(m.icon, m.name, m.section + ' · impacto')}
    <div class="eyebrow" style="color:${g.ink}">Cómo impacta y qué resuelve</div>
    ${impactTable(m.impact)}
    ${solveCols(g, m.solves)}
    ${extrasBlock(g, m.extras)}
    ${footer()}
  </section>`
  return pageA + pageB
}

// ── Páginas especiales ───────────────────────────────────────
const cover = `<section class="page cover">
  <div class="cover-logo"><span class="logo-sq">${ms('restaurant')}</span><span class="logo-tx">KitchenOS</span></div>
  <div class="cover-mid">
    <div class="cover-eyebrow">Instructivo para el equipo · 2026</div>
    <h1 class="cover-title">Guía de<br>carga de datos</h1>
    <div class="cover-sub">De las facturas a la rentabilidad, paso a paso.</div>
    <p class="cover-desc">Cómo cargar tu restaurante en KitchenOS y operarlo cada día, según el rol de cada persona del equipo.</p>
  </div>
  <div class="cover-foot">
    <span class="cover-pill">${ms('trending_up')} 9 módulos · Etapa 1 (gestión) + Etapa 2 (operación)</span>
    <span class="cover-ed">El Rescoldo · Edición equipo</span>
  </div>
</section>`

const flowSteps = [
  { n: '1', ic: 'receipt_long', t: 'Facturas', d: 'qué comprás y a cuánto' },
  { n: '2', ic: 'inventory_2', t: 'Stock', d: 'qué tenés y cuándo se acaba' },
  { n: '3', ic: 'menu_book', t: 'Recetario', d: 'cuánto cuesta producir' },
  { n: '4', ic: 'restaurant_menu', t: 'Carta', d: 'a cuánto lo vendés' },
  { n: '5', ic: 'point_of_sale', t: 'Ventas', d: 'cuánto vendiste de verdad' },
]
const intro = `<section class="page">
  ${pageHeader('menu_book', 'Cómo leer esta guía', '00 · Introducción')}
  <div class="eyebrow" style="color:#b06a1f">El orden importa</div>
  <h2>Primero la base, después el día a día</h2>
  <p class="lead">No tenés que cargar todo a mano. <strong>Las facturas construyen el stock, las recetas leen sus precios y la carta hereda el costo.</strong> Tu trabajo es cargar bien la base y revisar. Cada paso se apoya en el anterior:</p>
  <div class="flow">${flowSteps.map((s, i) => `
    <div class="flow-step"><div class="flow-ico">${ms(s.ic)}</div><div class="flow-n">${s.n}</div><div class="flow-t">${s.t}</div><div class="flow-d">${s.d}</div></div>
    ${i < flowSteps.length - 1 ? `<div class="flow-arrow">${ms('arrow_forward')}</div>` : ''}`).join('')}
  </div>
  <div class="two-etapas">
    <div class="etapa-card" style="--cc:#e0913c"><div class="etapa-h">${ms('admin_panel_settings')} Etapa 1 · Carga de gestión</div><p>La hace el <strong>administrador</strong>. Facturas, Stock, Recetario, Carta y Ventas. Una vez al inicio con el historial, y se mantiene semana a semana.</p></div>
    <div class="etapa-card" style="--cc:#7c5cd4"><div class="etapa-h">${ms('groups')} Etapa 2 · Operación diaria</div><p>La hace el <strong>equipo</strong>. OPS/Mise, Pase, Merma y Pedidos. Se usa en cada turno, en el celular, durante el servicio.</p></div>
  </div>
  ${callout({ title: 'No hace falta hacer todo de una.', body: 'Podés cargar de a poco; la app recuerda lo que ya hiciste y va marcando lo que falta.' })}
  ${footer()}
</section>`

function divider(num, kicker, title, sub, color) {
  return `<section class="page divider" style="--dc:${color}">
   <div class="div-center">
    <div class="div-ghost">${num}</div>
    <div class="div-kicker">${kicker}</div>
    <h2 class="div-title">${title}</h2>
    <div class="div-sub">${sub}</div>
   </div>
  </section>`
}

const closing = `<section class="page divider closing">
 <div class="div-center">
  <div class="div-kicker">En resumen</div>
  <h2 class="div-title">La rutina recomendada</h2>
  <div class="routine">
    <div class="r-col"><div class="r-h">${ms('rocket_launch')} Al arrancar</div><ul><li>Facturas mes a mes</li><li>Rebuild del stock</li><li>Recetario + vínculos</li><li>Carta con precios</li><li>Ventas con detalle</li></ul></div>
    <div class="r-col"><div class="r-h">${ms('calendar_month')} Cada semana</div><ul><li>Facturas nuevas</li><li>Alertas de precio y stock</li><li>Ventas del período</li></ul></div>
    <div class="r-col"><div class="r-h">${ms('restaurant')} Cada día (equipo)</div><ul><li>Producción y mise</li><li>Pase: 86 y faltantes</li><li>Merma y pedidos</li><li>Cierre del día</li></ul></div>
  </div>
  <div class="golden">${ms('trending_up')} <span>La regla de oro: cargá bien la base una vez = food cost real, CMV y rentabilidad por plato, <b>sin una sola planilla.</b></span></div>
 </div>
</section>`

// ── Ensamblado ───────────────────────────────────────────────
const body =
  cover +
  intro +
  divider('1', 'Etapa 1', 'Carga de gestión', 'La base de la app. La carga el administrador: facturas, stock, recetario, carta y ventas.', '#e0913c') +
  MODS.slice(0, 5).map(renderModule).join('') +
  divider('2', 'Etapa 2', 'Operación diaria', 'El día a día del equipo sobre esa base: producción, mise, pase, merma y pedidos.', '#7c5cd4') +
  MODS.slice(5).map(renderModule).join('') +
  closing

const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,600;0,700;0,800;0,900;1,500;1,600&display=swap" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0&display=block" rel="stylesheet">
<style>${CSS()}</style></head><body>${body}</body></html>`

writeFileSync(HTML, html, 'utf8')
console.log('HTML:', HTML, `(${pageNo} páginas numeradas)`)

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox', '--disable-gpu'] })
const page = await browser.newPage()
await page.goto(toFileURL(HTML).href, { waitUntil: 'networkidle0', timeout: 60000 })
await page.evaluateHandle('document.fonts.ready')
await new Promise(r => setTimeout(r, 800))
await page.pdf({ path: PDF, format: 'A4', printBackground: true, preferCSSPageSize: true, margin: 0 })
await browser.close()
console.log('PDF:', PDF)

// ── CSS ──────────────────────────────────────────────────────
function CSS() {
  return `
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  :root{
    --navy:#16243f; --navy2:#1c2d4a; --ink:#1f2937; --muted:#5b6677; --faint:#9aa3b2;
    --paper:#ffffff; --soft:#f4f5f8; --border:#e6e9f0;
    --serif:'Playfair Display', Georgia, 'Times New Roman', serif;
    --sans:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
  }
  body{ margin:0; font-family:var(--sans); color:var(--ink); font-size:10.6px; line-height:1.5; }
  .ms{ font-family:'Material Symbols Outlined'; font-weight:normal; font-style:normal; vertical-align:middle;
       font-variation-settings:'FILL' 0,'wght' 400,'GRAD' 0,'opsz' 24; line-height:1; }
  h1,h2{ font-family:var(--serif); font-weight:800; letter-spacing:-.01em; margin:0; }

  .page{ position:relative; width:210mm; height:296.7mm; padding:20mm 17mm 22mm; background:var(--paper); overflow:hidden; break-inside:avoid; }
  .page + .page{ break-before:page; }

  /* Header de página */
  .phead{ display:flex; justify-content:space-between; align-items:center; padding-bottom:9px; border-bottom:1px solid var(--border); margin-bottom:20px; }
  .phead-l{ display:flex; align-items:center; gap:8px; font-weight:700; font-size:12px; color:var(--navy2); }
  .phead-l .ms{ color:#e0913c; font-size:19px; }
  .phead-r{ font-size:10px; color:var(--faint); letter-spacing:.04em; }

  .eyebrow{ text-transform:uppercase; letter-spacing:.16em; font-size:9.5px; font-weight:700; margin-bottom:7px; }
  h2{ font-size:27px; color:var(--navy2); line-height:1.06; margin-bottom:11px; }
  .lead{ font-size:11.6px; color:#374151; max-width:62ch; margin:0 0 13px; }
  .who{ display:inline-flex; align-items:center; gap:6px; background:var(--cs); color:var(--ci); border:1px solid color-mix(in srgb,var(--cc) 35%,#fff);
        font-weight:700; font-size:9.6px; padding:5px 11px; border-radius:999px; margin-bottom:16px; }
  .who .ms{ font-size:15px; color:var(--cc); }

  /* Layout cards + phone */
  .ab{ display:grid; grid-template-columns:1fr 188px; gap:18px; align-items:start; }
  .cards{ display:flex; flex-direction:column; gap:10px; }
  .card{ background:var(--soft); border:1px solid var(--border); border-left:4px solid var(--cc); border-radius:11px; padding:11px 13px; }
  .card-ico{ width:27px; height:27px; border-radius:8px; background:var(--cs); color:var(--cc); display:inline-flex; align-items:center; justify-content:center; margin-bottom:6px; }
  .card-ico .ms{ font-size:17px; }
  .card-label{ text-transform:uppercase; letter-spacing:.1em; font-size:8.2px; font-weight:800; color:var(--ci); }
  .card-title{ font-weight:800; font-size:12.5px; color:var(--navy2); margin:1px 0 4px; }
  .card-body{ margin:0; font-size:10px; color:var(--muted); line-height:1.46; }
  .card-body em{ font-style:normal; font-weight:700; color:#374151; }

  /* Phone mockup */
  .phone-wrap{ margin:0; text-align:center; }
  .phone{ width:184px; border:7px solid var(--navy2); border-radius:26px; overflow:hidden; background:var(--navy2);
          box-shadow:0 16px 34px rgba(20,35,63,.22); }
  .phone img{ width:100%; display:block; }
  .phone-wrap figcaption{ font-size:8.8px; color:var(--faint); margin-top:8px; display:flex; gap:4px; align-items:center; justify-content:center; }
  .phone-wrap figcaption .ms{ font-size:13px; }

  /* Callout */
  .callout{ display:flex; gap:11px; align-items:flex-start; background:#fdf6e9; border:1px solid #f1dcb4; border-left:4px solid #e0913c;
            border-radius:11px; padding:12px 14px; margin-top:16px; font-size:10.4px; color:#4a3b22; }
  .callout-ico{ color:#e0913c; flex-shrink:0; } .callout-ico .ms{ font-size:19px; }
  .callout strong{ color:#7a4f12; }

  /* Tabla de impacto */
  table.impact{ width:100%; border-collapse:collapse; margin:4px 0 18px; font-size:10.2px; }
  table.impact th{ background:var(--navy2); color:#fff; text-align:left; padding:8px 11px; font-weight:700; font-size:9.8px; }
  table.impact th:first-child{ border-radius:8px 0 0 0; width:30%; } table.impact th:last-child{ border-radius:0 8px 0 0; }
  table.impact td{ border:1px solid var(--border); padding:7px 11px; vertical-align:top; }
  table.impact td:first-child{ font-weight:700; color:var(--navy2); }
  table.impact tbody tr:nth-child(even){ background:#f8f9fb; }

  /* Qué resuelve */
  .solve-row{ display:grid; grid-template-columns:1fr 1fr; gap:13px; margin-bottom:18px; }
  .solve{ border:1px solid var(--border); border-top:3px solid var(--cc); border-radius:11px; padding:11px 13px; background:#fff; }
  .solve-head{ display:flex; align-items:center; gap:6px; font-weight:800; font-size:11px; color:var(--navy2); margin-bottom:6px; }
  .solve-head .ms{ font-size:16px; color:var(--cc); }
  .solve ul{ margin:0; padding-left:15px; } .solve li{ font-size:9.8px; color:var(--muted); margin:3px 0; }

  /* Valor adicional */
  .extras-tag{ display:inline-flex; align-items:center; gap:6px; background:var(--cs); color:var(--ci); border:1px solid color-mix(in srgb,var(--cc) 35%,#fff);
               font-weight:800; font-size:9.5px; text-transform:uppercase; letter-spacing:.08em; padding:5px 11px; border-radius:999px; margin-bottom:11px; }
  .extras-tag .ms{ font-size:14px; color:var(--cc); }
  .extras-grid{ display:grid; grid-template-columns:1fr 1fr 1fr; gap:11px; }
  .extra{ display:flex; gap:8px; font-size:9.8px; color:var(--muted); }
  .extra strong{ color:var(--navy2); }
  .extra-n{ flex-shrink:0; width:18px; height:18px; border-radius:50%; background:var(--cc); color:#fff; font-weight:800; font-size:10px;
            display:inline-flex; align-items:center; justify-content:center; }

  /* Footer */
  .footer{ position:absolute; left:17mm; right:17mm; bottom:12mm; display:flex; justify-content:space-between;
           font-size:8.8px; color:var(--faint); border-top:1px solid var(--border); padding-top:7px; }

  /* ── Portada ── */
  .cover{ background:linear-gradient(160deg,#1a2a47,#101c33); color:#fff; padding:0; }
  .cover-logo{ position:absolute; top:22mm; left:20mm; display:flex; align-items:center; gap:11px; }
  .logo-sq{ width:38px; height:38px; border-radius:11px; background:linear-gradient(150deg,#e7a049,#d2832f);
            display:inline-flex; align-items:center; justify-content:center; }
  .logo-sq .ms{ font-size:23px; color:#1a2a47; font-variation-settings:'FILL' 1; }
  .logo-tx{ font-weight:800; font-size:18px; letter-spacing:-.01em; }
  .cover-mid{ position:absolute; left:20mm; right:20mm; top:50%; transform:translateY(-50%); }
  .cover-eyebrow{ text-transform:uppercase; letter-spacing:.22em; font-size:10px; font-weight:700; color:#e7a049; margin-bottom:18px; }
  .cover-title{ font-size:62px; line-height:.98; color:#fff; font-weight:800; }
  .cover-sub{ font-family:var(--serif); font-style:italic; font-weight:600; font-size:21px; color:#e7a049; margin:16px 0 14px; }
  .cover-desc{ font-size:12.5px; color:#aeb9cc; max-width:46ch; line-height:1.6; }
  .cover-foot{ position:absolute; left:20mm; right:20mm; bottom:22mm; display:flex; justify-content:space-between; align-items:center; border-top:1px solid rgba(255,255,255,.12); padding-top:16px; }
  .cover-pill{ display:inline-flex; align-items:center; gap:7px; border:1px solid rgba(231,160,73,.5); color:#e7a049; border-radius:999px; padding:7px 14px; font-size:10px; font-weight:700; }
  .cover-pill .ms{ font-size:15px; }
  .cover-ed{ font-size:10px; color:#8593aa; }

  /* ── Divisores ── */
  .divider{ background:linear-gradient(160deg,#1a2a47,#101c33); color:#fff; }
  .div-center{ position:absolute; inset:0; display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center; padding:30mm 24mm; }
  .div-ghost{ font-family:var(--serif); font-weight:800; font-size:180px; line-height:.8; color:rgba(255,255,255,.07); margin-bottom:-40px; }
  .div-kicker{ text-transform:uppercase; letter-spacing:.24em; font-size:11px; font-weight:700; color:var(--dc); margin-bottom:12px; }
  .div-title{ font-size:46px; color:#fff; }
  .div-sub{ font-size:12.5px; color:#aeb9cc; max-width:52ch; margin-top:14px; line-height:1.6; }

  /* Intro: flow + etapas */
  .flow{ display:flex; align-items:stretch; gap:5px; margin:6px 0 18px; }
  .flow-step{ flex:1; background:var(--soft); border:1px solid var(--border); border-radius:11px; padding:11px 7px; text-align:center; }
  .flow-ico{ color:#b06a1f; } .flow-ico .ms{ font-size:21px; }
  .flow-n{ width:17px; height:17px; margin:5px auto 4px; border-radius:50%; background:#e0913c; color:#fff; font-weight:800; font-size:9.5px; display:flex; align-items:center; justify-content:center; }
  .flow-t{ font-weight:800; font-size:10.5px; color:var(--navy2); } .flow-d{ font-size:8.4px; color:var(--muted); margin-top:2px; line-height:1.35; }
  .flow-arrow{ display:flex; align-items:center; color:#cdd3df; } .flow-arrow .ms{ font-size:17px; }
  .two-etapas{ display:grid; grid-template-columns:1fr 1fr; gap:13px; margin-bottom:4px; }
  .etapa-card{ border:1px solid var(--border); border-left:4px solid var(--cc); border-radius:12px; padding:13px 15px; background:#fff; }
  .etapa-h{ display:flex; align-items:center; gap:7px; font-weight:800; font-size:12px; color:var(--navy2); margin-bottom:6px; }
  .etapa-h .ms{ color:var(--cc); font-size:18px; }
  .etapa-card p{ margin:0; font-size:10px; color:var(--muted); }

  /* Mockup Pedidos */
  .phone--mock{ background:#0f1c33; } .mk{ background:#f4f5f8; padding:11px; font-size:9px; }
  .mk-head{ display:flex; justify-content:space-between; align-items:center; background:var(--navy2); color:#fff; margin:-11px -11px 9px; padding:11px; font-weight:800; font-size:11px; }
  .mk-head .ms{ color:#e7a049; font-size:16px; }
  .mk-prov{ display:flex; gap:5px; align-items:center; font-weight:700; color:var(--navy2); margin-bottom:8px; } .mk-prov .ms{ font-size:14px; color:#7c5cd4; }
  .mk-row{ display:flex; justify-content:space-between; background:#fff; border:1px solid var(--border); border-radius:7px; padding:6px 8px; margin-bottom:5px; }
  .mk-row b{ color:var(--navy2); } .mk-low{ border-color:#f0c98a; background:#fdf6e9; } .mk-low .ms{ color:#e0913c; font-size:12px; } .mk-low i{ font-style:normal; color:#b06a1f; font-weight:700; }
  .mk-total{ display:flex; justify-content:space-between; margin-top:7px; padding-top:7px; border-top:1px dashed #c9cfdb; font-weight:800; color:var(--navy2); font-size:11px; }
  .mk-actions{ display:flex; gap:6px; margin-top:9px; }
  .mk-wa{ flex:1; text-align:center; background:#25883b; color:#fff; border-radius:7px; padding:6px; font-weight:700; } .mk-wa .ms{ font-size:12px; }
  .mk-pdf{ flex:1; text-align:center; background:var(--navy2); color:#fff; border-radius:7px; padding:6px; font-weight:700; } .mk-pdf .ms{ font-size:12px; }

  /* Closing */
  .closing .div-center{ justify-content:flex-start; padding-top:30mm; }
  .routine{ display:grid; grid-template-columns:1fr 1fr 1fr; gap:14px; width:100%; margin:26px 0; }
  .r-col{ background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.12); border-radius:13px; padding:16px; text-align:left; }
  .r-h{ display:flex; align-items:center; gap:7px; font-weight:800; font-size:12px; color:#e7a049; margin-bottom:9px; } .r-h .ms{ font-size:17px; }
  .r-col ul{ margin:0; padding-left:15px; } .r-col li{ font-size:10px; color:#cdd6e4; margin:4px 0; }
  .golden{ display:flex; gap:10px; align-items:center; background:rgba(231,160,73,.12); border:1px solid rgba(231,160,73,.4); border-radius:13px; padding:15px 18px; color:#f0d8b4; font-size:11.5px; max-width:70ch; }
  .golden .ms{ color:#e7a049; font-size:22px; } .golden b{ color:#fff; }
  `
}
