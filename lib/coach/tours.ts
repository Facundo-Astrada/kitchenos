export interface TourStep {
  targetId: string | null
  requireTab?: string
  title: string
  description: string
}

export const TOURS: Record<string, TourStep[]> = {
  carta: [
    {
      targetId: 'carta-header',
      title: 'Tu carta digital',
      description: 'Todos los platos del menú con precio de venta, food cost calculado y disponibilidad. Desde acá gestionás qué se vende, a qué precio y qué está 86 (agotado).',
    },
    {
      targetId: 'carta-filtros',
      title: 'Filtrar por categoría',
      description: 'Filtrá por entrada, principal, postre, bebida o cualquier categoría que hayas creado. Útil para revisar el food cost de una familia de platos antes de actualizar precios.',
    },
    {
      targetId: 'carta-lista',
      title: 'Los platos',
      description: 'Cada card muestra el food cost en porcentaje. Verde: bajo control. Amarillo: atención. Rojo: crítico. Los que no tienen receta vinculada muestran costo cero — hay que vincularlos para que el cálculo sea real.',
    },
    {
      targetId: 'carta-rentabilidad',
      title: 'Análisis de rentabilidad',
      description: 'Una vista ordenada por food cost de mayor a menor. De un vistazo ves cuáles platos te cuestan más, cuáles tienen margen negativo y cuáles son tus mejores opciones. Fundamental para tomar decisiones de precio.',
    },
    {
      targetId: 'carta-importar',
      title: 'Importar la carta con IA',
      description: 'Subí una foto, PDF, Excel o texto de tu carta. La IA extrae nombre, precio, componentes y detecta tags dietarios (vegano, sin TACC, keto). Después vinculás cada componente a las recetas del recetario.',
    },
    {
      targetId: 'carta-nuevo',
      title: 'Nuevo plato',
      description: 'Agregás un plato manualmente: nombre, categoría, precio y los componentes que lo forman. Podés vincularlo directamente a recetas del recetario para que el food cost se calcule en tiempo real.',
    },
    {
      targetId: null,
      title: '¡Ya conocés la Carta!',
      description: 'Abrí al Kitchen Coach en cualquier momento para analizar el food cost de tu carta, detectar los platos más costosos o pedir consejos de precio y porciones.',
    },
  ],

  operaciones: [
    {
      targetId: null,
      title: 'Operaciones, tu workspace diario',
      description: 'Acá vivís el turno: qué cocinar, el mise en place y la planificación del menú. Tocá Siguiente y te muestro las tres secciones.',
    },
    {
      targetId: 'ops-tab-produccion',
      title: 'Producción',
      description: 'El tablero operativo del turno. Cargás todo lo que hay que cocinar, organizado por plaza, y seguís el avance del equipo en tiempo real. Funciona como una lista de producción viva que refleja el estado real de la cocina.',
    },
    {
      targetId: 'prod-columna-plaza',
      requireTab: 'produccion',
      title: 'Una columna por plaza',
      description: 'Cada columna es una plaza: parrilla, fríos, pastelería… El cocinero mira una sola y ahí está todo lo suyo. Tocá el nombre de la plaza para verla sola a pantalla completa. La prioridad no desapareció: ordena los ítems dentro de la columna (SP y P arriba, refuerzos y checks plegados abajo) y se cambia tocando el chip del ítem.',
    },
    {
      targetId: 'prod-columna-plaza',
      requireTab: 'produccion',
      title: 'Agregar preparación',
      description: 'Cada columna tiene un campo para agregar una preparación nueva, que nace ya con esa plaza asignada. Podés tipear el nombre o vincularlo a una receta del recetario para que la información de porciones y plaza se complete automáticamente.',
    },
    {
      targetId: 'ops-tab-mise',
      title: 'Mise en Place',
      description: 'Tu mise en place por plaza, con tres momentos: Apertura (qué preparar al empezar, con el stock que quedó de ayer como referencia), Cierre (registrás cuánto quedó, que será la referencia de mañana) y Rutina (tareas recurrentes de la plaza). Al marcar algo en Apertura se refleja en Producción y viceversa.',
    },
    {
      targetId: 'mise-stock-box',
      requireTab: 'mise',
      title: 'Stock del cierre',
      description: 'Lo que quedó disponible cuando cerró la cocina ayer. Verde: hay suficiente, no hace falta producir más. Amarillo o rojo: stock bajo, producción urgente antes del servicio.',
    },
    {
      targetId: 'mise-producir-box',
      requireTab: 'mise',
      title: 'Objetivo del turno',
      description: 'La cantidad estándar definida para ese ítem en el turno. Si el stock ya cubre esa cantidad, el cocinero puede saltearlo. Si no, produce hasta cubrir el objetivo y marca el ítem como listo.',
    },
    {
      targetId: 'mise-fab-add',
      requireTab: 'mise',
      title: 'Agregar a mise',
      description: 'El botón Agregar de cada sección incorpora ítems nuevos al mise. Podés vincularlo a una receta del recetario para que la info de porciones, unidades y plaza se llene automáticamente.',
    },
    {
      targetId: 'mise-tab-rutina',
      requireTab: 'mise',
      title: 'Rutinas',
      description: 'Tareas recurrentes de la plaza: descongelado, control de fechas, y toda la limpieza. Cada una aparece solo el día que corresponde (las semanales su día, las mensuales su fecha, las diarias siempre). Acá se juntan las que cargás a mano y las que llegan automáticamente desde HACCP → Limpieza cuando activás "Mostrar en OPS".',
    },
    {
      targetId: 'ops-tab-planificacion',
      title: 'Planificación',
      description: 'Preparás con tiempo el menú del día y los eventos especiales. Organizás la demanda antes del turno para que la producción sea más eficiente y el equipo sepa exactamente qué viene.',
    },
    {
      targetId: 'plan-sub-menu',
      requireTab: 'planificacion',
      title: 'Menú del día',
      description: 'Armás la planilla de producción por categorías de plato: entradas, proteínas, pastas, postres. Podés copiar el menú de días anteriores o crear uno nuevo y asignar responsables por plaza.',
    },
    {
      targetId: 'plan-sub-eventos',
      requireTab: 'planificacion',
      title: 'Eventos especiales',
      description: 'Cargás eventos (bodas, corporativos, degustaciones) con sus platos, cantidad de personas y necesidades particulares. Cada evento tiene su lista de ítems con estado de producción y plaza asignada.',
    },
    {
      targetId: null,
      title: '¡Ya conocés OPS!',
      description: 'Abrí al Kitchen Coach en cualquier momento para preguntar sobre cualquier función, pedir consejos de producción para el turno o analizar tu mise en place.',
    },
  ],

  recetario: [
    {
      targetId: 'recetario-tabs',
      title: 'Recetas e Ideas',
      description: 'La pestaña Recetas tiene tus fichas técnicas publicadas con food cost calculado. Ideas guarda los borradores en desarrollo — recetas a las que todavía les falta completar ingredientes, pasos o precio.',
    },
    {
      targetId: 'recetario-lista',
      requireTab: 'recetas',
      title: 'La ficha técnica',
      description: 'Cada card muestra el food cost en porcentaje y el costo por porción. Verde: bajo control. Amarillo: atención. Rojo: food cost crítico, revisar ingredientes o precio de venta. Tocá la receta para ver la ficha completa.',
    },
    {
      targetId: 'recetario-categorias',
      requireTab: 'recetas',
      title: 'Filtrar por categoría',
      description: 'Filtrá la lista por tipo de preparación para enfocarte en una sección: entradas, proteínas, salsas, postres. Útil para revisar el costo de toda una familia de platos antes de actualizar la carta.',
    },
    {
      targetId: 'recetario-nueva',
      title: 'Nueva receta',
      description: 'Crea la ficha técnica completa: ingredientes con cantidad y unidad, pasos del procedimiento, porciones y precio de venta. El sistema calcula el food cost automáticamente a medida que cargás los ingredientes.',
    },
    {
      targetId: 'recetario-importar',
      title: 'Importar fichas',
      description: 'Subí una foto, PDF o archivo de tus fichas técnicas existentes. La IA extrae los ingredientes, cantidades y pasos automáticamente. Después podés editarlos y vincularlos al stock.',
    },
    {
      targetId: 'recetario-vincular',
      title: 'Vincular al stock',
      description: 'Conecta los ingredientes de tus recetas con los productos del inventario. Cuando el stock tiene precio, el food cost de la receta se calcula con datos reales. Sin la vinculación, el costo es aproximado.',
    },
    {
      targetId: 'recetario-lista-ideas',
      requireTab: 'ideas',
      title: 'Ideas y borradores',
      description: 'Los borradores son recetas en desarrollo. Podés completarlas manualmente o usar "Completar con IA": pegás la receta en texto libre y la IA estructura los ingredientes y pasos automáticamente.',
    },
    {
      targetId: null,
      title: '¡Ya conocés el Recetario!',
      description: 'Abrí al Kitchen Coach en cualquier momento para analizar el food cost de tus recetas, detectar las más costosas y pedir consejos para mejorar los márgenes sin bajar la calidad.',
    },
  ],

  dashboard: [
    {
      targetId: null,
      title: 'Soy tu Kitchen Coach',
      description: 'Te muestro KitchenOS en un minuto. Tocá Siguiente para recorrer el inicio. Cuando quieras, abrime con el botón naranja para preguntarme lo que sea.',
    },
    {
      targetId: 'dashboard-turno',
      title: 'Tu turno',
      description: 'Iniciá el turno al entrar a la cocina. El sistema registra la hora de entrada y calcula el tiempo trabajado. Al cerrar el turno aparece el resumen del día: tareas completadas y estado del mise.',
    },
    {
      targetId: 'dashboard-pase',
      title: 'Último pase',
      description: 'Un preview de los últimos mensajes del canal de cocina. Si hay novedades urgentes del turno anterior, aparecen acá. Tocá para abrir el Pase completo.',
    },
    {
      targetId: 'dashboard-plaza',
      title: 'Mi plaza',
      description: 'El avance de tu checklist y tareas del turno: cuántos ítems completaste del total del día. Verde: todo bajo control. La barra muestra el progreso en tiempo real a medida que vas marcando.',
    },
    {
      targetId: 'dashboard-stock',
      title: 'Alertas de stock',
      description: 'Los productos que llegaron a nivel crítico o bajo. Si algo está en crítico, hay que reponerlo antes del próximo servicio o informar al encargado.',
    },
    {
      targetId: 'dashboard-modulos',
      title: 'Los módulos',
      description: 'Acceso rápido a todos los módulos del sistema. Solo ves los que tu rol o puesto tiene habilitados. Tocá cualquiera para ir directamente.',
    },
    {
      targetId: null,
      title: '¡Ya conocés el Dashboard!',
      description: 'Abrí al Kitchen Coach en cualquier momento para preguntar qué tenés que hacer hoy, revisar el estado del turno o pedir consejos para organizar la cocina.',
    },
  ],

  tareas: [
    {
      targetId: 'tareas-header',
      title: 'Modo Carta y Menú',
      description: 'Carta: la producción del servicio normal, organizada por plaza. Menú: organizada por sección del menú del día (Entrada, Proteína, Pasta...). Evento: lo mismo pero aparte, para no mezclarlo con el servicio. Todo: los tres juntos en un solo tablero.',
    },
    {
      targetId: 'prod-columna-plaza',
      title: 'Una columna por plaza',
      description: 'Cada columna es una plaza y ahí está todo lo que le toca cocinar. Tocá el nombre para verla sola a pantalla completa. Dentro de la columna manda la prioridad: SP y P arriba, refuerzos y checks plegados detrás de un "+N". Podés vincular una tarea a una receta para que arrastre automáticamente porciones y plaza.',
    },
    {
      targetId: 'tareas-lista',
      title: 'La lista de producción',
      description: 'Cada ítem tiene estado (pendiente, en proceso, listo) y se puede marcar desde acá. Las tareas vinculadas a mise se reflejan automáticamente en el checklist de plaza. Las que quedan sin hacer arrastran al turno siguiente.',
    },
    {
      targetId: null,
      title: '¡Ya conocés Producción!',
      description: 'Abrí al Kitchen Coach en cualquier momento para organizar el turno, priorizar tareas o entender qué está bloqueando el servicio.',
    },
  ],

  pase: [
    {
      targetId: 'pase-filtros',
      title: 'Filtrar por plaza',
      description: 'Filtrá los mensajes por plaza: Parrilla, Fríos, Calientes, Pase, Pastelería, Panadería. Cada mensaje puede llevar una mención de plaza con #NombrePlaza para que solo vean los que corresponde.',
    },
    {
      targetId: 'pase-mensajes',
      title: 'El chat de cocina',
      description: 'El historial de comunicación del turno. Los mensajes urgentes aparecen en rojo. Podés revisar lo que pasó en turnos anteriores bajando en el historial. Las menciones @usuario y #plaza dirigen el mensaje al destinatario correcto.',
    },
    {
      targetId: 'pase-86',
      title: '86 — plato agotado',
      description: 'Cuando un ingrediente o plato se agota, mandás un 86. Aparece como alerta urgente en el pase para que el salón deje de venderlo inmediatamente. Es el aviso más importante del servicio.',
    },
    {
      targetId: 'pase-rapidos',
      title: 'Mensajes rápidos',
      description: 'Chips de respuesta rápida para las situaciones más comunes: Falta stock, Producción pendiente, Equipo roto, Todo OK. Un tap manda el mensaje sin necesidad de escribirlo.',
    },
    {
      targetId: null,
      title: '¡Ya conocés el Pase!',
      description: 'Abrí al Kitchen Coach para ayudarte a comunicar novedades del turno, entender el historial de mensajes o saber cómo manejar situaciones de urgencia.',
    },
  ],

  pedidos: [
    {
      targetId: 'pedidos-filtros',
      title: 'Estados del pedido',
      description: 'Borrador: en preparación. Enviado: el proveedor ya lo recibió. Parcial: llegó parte de lo pedido. Recibido: completo y en stock. El flujo normal es Borrador → Enviado → Recibido.',
    },
    {
      targetId: 'pedidos-lista',
      title: 'Lista de pedidos',
      description: 'Cada pedido muestra proveedor, fecha, total estimado y estado. Tocá para ver el detalle, actualizar el estado, confirmar la recepción ítem por ítem o exportar como PDF o WhatsApp.',
    },
    {
      targetId: null,
      title: '¡Ya conocés Pedidos!',
      description: 'Abrí al Kitchen Coach en cualquier momento para preguntar qué pedidos están pendientes, cómo preparar una orden o gestionar la recepción de mercadería.',
    },
  ],

  ventas: [
    {
      targetId: 'ventas-stats',
      title: 'Las 4 métricas de ventas',
      description: 'Total ventas del período, cubiertos, promedio diario y el plato más vendido. El promedio diario es clave para planificar la producción: si vendes 80 cubiertos por día en promedio, el mise tiene que estar listo para eso.',
    },
    {
      targetId: 'ventas-lista',
      title: 'Historial de ventas',
      description: 'Cada registro muestra fecha, total, cubiertos y el origen de los datos (Excel, manual, POS). Tocá para ver el detalle de platos vendidos ese día. Los datos alimentan el tab Food Cost de Reportes.',
    },
    {
      targetId: null,
      title: '¡Ya conocés Ventas!',
      description: 'Abrí al Kitchen Coach para analizar tendencias de ventas, identificar el plato más rentable o entender cómo los cubiertos impactan en el food cost.',
    },
  ],

  proveedores: [
    {
      targetId: 'proveedores-lista',
      title: 'Directorio de proveedores',
      description: 'Cada proveedor muestra rubro, teléfono y días de entrega configurados. Tocá uno para expandirlo, ver sus facturas, escanear una nueva factura directamente o enviarlo por WhatsApp.',
    },
    {
      targetId: null,
      title: '¡Ya conocés Proveedores!',
      description: 'Abrí al Kitchen Coach para preguntar sobre un proveedor, analizar el historial de compras o saber cómo gestionar días de entrega y condiciones de pago.',
    },
  ],

  turnos: [
    {
      targetId: null,
      title: 'Equipo y Turnos',
      description: 'Equipo: los miembros del restaurante con su puesto y rol. Turnos: la planilla semanal de quién trabaja cada día. Puestos: los roles definidos con sus módulos habilitados. Todo desde acá.',
    },
  ],

  calendario: [
    {
      targetId: null,
      title: 'El Calendario',
      description: 'Vista mensual con todos los eventos del restaurante: menús especiales, eventos privados, feriados, cierres. Los puntos en los días indican eventos OPS sincronizados. Tocá un día para ver el detalle.',
    },
  ],

  facturas: [
    {
      targetId: 'facturas-tabs',
      title: 'Tres vistas de compras',
      description: 'Facturas: el historial completo de todas tus compras. Listas: precios acordados con proveedores para comparar con lo que te facturan. Proveedores: el directorio con datos de contacto y condiciones de pago.',
    },
    {
      targetId: 'facturas-filtros',
      requireTab: 'facturas',
      title: 'Filtros de período',
      description: 'Filtrá por esta semana o este mes para ver el gasto del período. Útil para comparar el costo de las compras entre períodos y detectar aumentos de proveedores.',
    },
    {
      targetId: 'facturas-lista',
      requireTab: 'facturas',
      title: 'El historial de facturas',
      description: 'Cada factura muestra proveedor, fecha, total y estado (pendiente, confirmada, pagada, observada). Tocá una para ver el detalle de los ítems y actualizar el estado de pago.',
    },
    {
      targetId: 'facturas-acciones',
      title: 'Cómo cargar facturas',
      description: 'Tres formas: Cargar factura (foto, PDF o texto con OCR), Lote (varias facturas PDF de una vez), o POS (Excel de Fudo, Maxirest, Bistrosoft). La IA extrae todos los datos automáticamente.',
    },
    {
      targetId: 'facturas-lote',
      title: 'Carga masiva en lote',
      description: 'Arrastrá varios archivos PDF o imágenes de una vez. El sistema los procesa en serie con OCR — ideal para cargar el batch semanal de facturas de todos los proveedores en un solo paso.',
    },
    {
      targetId: 'facturas-pos',
      title: 'Importar desde el POS',
      description: 'Si usás Fudo, Maxirest, Bistrosoft u otro sistema, exportá el Excel de gastos y cargalo acá. El sistema detecta las columnas automáticamente y mapea los proveedores y productos.',
    },
    {
      targetId: null,
      title: '¡Ya conocés Facturas!',
      description: 'Abrí al Kitchen Coach en cualquier momento para analizar la inflación de tus compras, detectar los proveedores que más subieron o entender cómo las facturas impactan tu food cost.',
    },
  ],

  reportes: [
    {
      targetId: 'reportes-tabs',
      title: 'Las 8 vistas de análisis',
      description: 'Resumen (KPIs del período), CMV (costo de mercadería vendida), Fuga (compras vs. consumo teórico por producto), Rendimiento (por plaza), Food Cost (por receta), Compras (por proveedor), Precios (inflación de compras), Producción (lo más producido). El presupuesto por familia y por sector se mudó a su propio módulo, Presupuesto.',
    },
    {
      targetId: 'reportes-periodo',
      title: 'Seleccionar período',
      description: 'Filtrá por esta semana, este mes o el mes anterior. Todos los gráficos y números se recalculan al cambiar el período — útil para comparar y detectar tendencias.',
    },
    {
      targetId: 'reportes-contenido',
      requireTab: 'resumen',
      title: 'Resumen ejecutivo',
      description: 'Los KPIs más importantes del período: compras totales, ventas, food cost promedio y CMV. Los cambios porcentuales muestran si el número mejoró o empeoró respecto al período anterior.',
    },
    {
      targetId: 'reportes-contenido',
      requireTab: 'compras',
      title: 'Compras por proveedor',
      description: 'El gasto del período desglosado por proveedor, ordenado de mayor a menor. Identifica qué proveedores concentran más presupuesto y si hubo variaciones respecto a períodos anteriores.',
    },
    {
      targetId: 'reportes-contenido',
      requireTab: 'precios',
      title: 'Inflación de cocina',
      description: 'La variación de precios de cada producto en el tiempo, calculada desde las facturas cargadas. El índice de inflación de cocina te muestra cuánto subieron tus insumos en el período.',
    },
    {
      targetId: null,
      title: '¡Ya conocés Reportes!',
      description: 'Abrí al Kitchen Coach en cualquier momento para analizar cualquier número, entender qué está impactando el food cost o pedir recomendaciones para mejorar los márgenes.',
    },
  ],

  merma: [
    {
      targetId: 'merma-periodo',
      title: 'Filtrar por período',
      description: 'Hoy, esta semana, este mes o todo el historial. El costo total de merma cambia según el período seleccionado. Mirá la semana para el operativo, el mes para el análisis de gestión.',
    },
    {
      targetId: 'merma-stats',
      title: 'Las 4 métricas clave',
      description: 'Costo total del desperdicio, cantidad de registros, el motivo más frecuente (vencimiento, caída, exceso de producción...) y el producto que más aparece. Con estos 4 datos vas directo al problema.',
    },
    {
      targetId: 'merma-fab',
      title: 'Registrar merma',
      description: 'El botón + abre el formulario de registro: producto, cantidad, motivo y turno. Cuanto más seguido se registra (en el momento, no al cierre), más preciso es el análisis. Puede registrarse desde el Coach también.',
    },
    {
      targetId: null,
      title: '¡Ya conocés Merma!',
      description: 'Abrí al Kitchen Coach en cualquier momento para analizar las causas del desperdicio, calcular el costo real de la merma o pedir estrategias para reducirla.',
    },
  ],

  haccp: [
    {
      targetId: 'haccp-tabs',
      title: 'Los 3 controles HACCP',
      description: 'Temperaturas: registros de heladeras, cámaras y hornos para control de cadena de frío. Vencimientos: fechas de productos con alerta de proximidad. Limpieza: tareas programadas por área con historial de cumplimiento.',
    },
    {
      targetId: 'haccp-registrar',
      requireTab: 'temperaturas',
      title: 'Registrar temperaturas',
      description: 'Ingresás la temperatura actual de cada equipo. El sistema la compara con el rango aceptado y marca los que están fuera de límite para tomar acción correctiva. Este registro es parte del expediente HACCP para bromatología.',
    },
    {
      targetId: 'haccp-vencimientos',
      requireTab: 'vencimientos',
      title: 'Control de vencimientos',
      description: 'Agregás los productos con fecha de vencimiento y el sistema te alerta cuando se acerca el límite (≤3 días). Los vencidos se marcan en rojo. Al descartar un producto podés registrar la merma directamente.',
    },
    {
      targetId: 'haccp-limpieza',
      requireTab: 'limpieza',
      title: 'Tareas de limpieza',
      description: 'Cada tarea tiene área, descripción y frecuencia (diaria, semanal, mensual). Al registrar el cumplimiento queda el historial. Las tareas con sync_ops aparecen en el checklist OPS del día que corresponde.',
    },
    {
      targetId: null,
      title: '¡Ya conocés HACCP!',
      description: 'Abrí al Kitchen Coach para consultar qué controles son obligatorios por bromatología, preparar una auditoría o analizar el historial de incidencias de temperatura.',
    },
  ],

  stock: [
    {
      targetId: 'stock-tabs',
      title: 'Dos vistas del inventario',
      description: 'Insumos es tu inventario general: todos los ingredientes y materiales con cantidades, precios y estados. Producciones te muestra el stock registrado desde los checklists de plaza, con la última actualización de cada ítem por turno.',
    },
    {
      targetId: 'stock-kpis',
      title: 'Alertas de stock',
      description: 'Los tres indicadores del encabezado: Crítico (por debajo del mínimo absoluto, hay que reponer ya), Bajo (por debajo del mínimo operativo) y Pendiente (sin precio ni cantidad, a completar). Tocá cualquiera para filtrar la lista al instante.',
    },
    {
      targetId: 'stock-filtros',
      requireTab: 'insumos',
      title: 'Filtros y búsqueda',
      description: 'Buscá por nombre, filtrá por categoría (Carnes, Verduras, Lácteos...) u ordená por valor del stock. El orden por valor te muestra qué productos concentran más plata inmovilizada, ideal para priorizar pedidos.',
    },
    {
      targetId: 'stock-lista',
      requireTab: 'insumos',
      title: 'Tabla de inventario',
      description: 'El stock actual se edita directo en la tabla, al toque. Tocá el número para modificarlo. Si querés editar precio, categoría o unidades, tocá el nombre del producto para abrir el formulario completo.',
    },
    {
      targetId: 'stock-stockear',
      title: 'Stockear rápido',
      description: 'El modo rápido para hacer el inventario físico por sector. Elegís una categoría (Carnes, Verduras...) y recorrés la lista uno por uno actualizando cantidades sin abrir el formulario completo. Ideal para el recuento de cierre o inicio de turno.',
    },
    {
      targetId: 'stock-funciones',
      title: 'Funciones de inventario',
      description: 'Acá está todo lo demás: importar desde Excel/factura, exportar, sugerir mínimos, actualizar precios desde la última factura de cada producto, asignar sector físico y Rebuild (reconstruye el stock completo desde las facturas cargadas — borra lo anterior, usalo con cuidado).',
    },
    {
      targetId: null,
      title: '¡Ya conocés Inventario!',
      description: 'Abrí al Kitchen Coach en cualquier momento para consultar qué productos están en riesgo, pedir consejos de reposición o entender cómo el stock impacta el food cost de tus recetas.',
    },
  ],
  salon: [
    {
      targetId: 'salon-topbar',
      title: 'El salón de un vistazo',
      description: 'Acá ves el total en curso de todas las cuentas abiertas. Los íconos de la derecha te llevan al KDS de cocina, a la caja del turno y a la configuración de mesas.',
    },
    {
      targetId: 'salon-mapa',
      title: 'Mapa de mesas',
      description: 'Cada mesa muestra su número, capacidad y estado por color: gris libre, azul ocupada, rojo con cuenta pedida. El punto verde avisa que hay platos listos esperando para servir. Tocá una mesa para abrir su cuenta y tomar el pedido.',
    },
    {
      targetId: null,
      title: '¡Ya conocés el Salón!',
      description: 'Preguntame por el estado de una mesa, cuánto lleva una cuenta abierta o pedime ideas para acomodar un evento grande.',
    },
  ],

  clientes: [
    {
      targetId: 'clientes-tabs',
      title: 'Clientes y Cuentas Corrientes',
      description: 'Clientes es la base con historial de compras y segmentos automáticos (nuevo, dormido, sin compras). Cuentas Corrientes es el libro de fiado: quién debe y quién pagó. Reemplaza el manejo de cuentas que antes se hacía en Fudo.',
    },
    {
      targetId: 'clientes-nuevo',
      title: 'Nuevo cliente',
      description: 'Cargá nombre y teléfono para empezar. Los clientes también se crean automáticamente al vincular una venta en el Salón, así que no hace falta cargar todo a mano.',
    },
    {
      targetId: 'clientes-filtros',
      title: 'Segmentos y filtros',
      description: 'Filtrá por cantidad de compras, última compra o grupo. Dormido: no compra hace más de 45 días. Nuevo: su primera compra fue hace 30 días o menos. Útil para detectar a quién contactar.',
    },
    {
      targetId: 'clientes-lista',
      title: 'La ficha del cliente',
      description: 'Tocá cualquier cliente para ver sus métricas (compras, total gastado, última visita) y el historial completo. Desde ahí también se edita el contacto y las notas (alergias, preferencias).',
    },
    {
      targetId: 'cc-saldo',
      requireTab: 'cc',
      title: 'El saldo de cuenta corriente',
      description: 'Saldo negativo (rojo) significa que los clientes te deben plata en conjunto. Un cargo aumenta la deuda (fía), un pago la reduce. El saldo por cliente se ve filtrando arriba.',
    },
    {
      targetId: 'cc-nueva',
      requireTab: 'cc',
      title: 'Registrar un pago o un fiado',
      description: 'Nueva transacción: elegís el cliente, si es Pago (cobra deuda) o Cargo (fía), el monto y opcionalmente el medio de pago. Los cobros con Cuenta corriente hechos desde el Salón aparecen acá automáticamente.',
    },
    {
      targetId: 'cc-lista',
      requireTab: 'cc',
      title: 'El historial de movimientos',
      description: 'Cada línea es un cargo o un pago, con su fecha y cliente. Tocá cualquiera para ver el detalle completo o eliminarlo si fue un error de carga.',
    },
    {
      targetId: null,
      title: '¡Ya conocés Clientes!',
      description: 'Preguntame qué clientes están dormidos, quién te debe plata o pedime ideas para reactivar a los que no vuelven hace tiempo.',
    },
  ],

  espacios: [
    {
      targetId: 'espacios-tabs',
      title: 'Mesa de trabajo',
      description: 'Producción: organizás los espacios físicos de la cocina (ej. Cocina, Barra) y qué plazas trabajan en cada uno. Stock: ordenás dónde vive físicamente cada producto del inventario, por sector y estante.',
    },
    {
      targetId: 'espacios-nuevo',
      title: 'Crear un espacio',
      description: 'Un espacio es un área física (Cocina, Panadería, Barra). Después le asignás las plazas que trabajan ahí y armás sus secciones de mise en place, igual que en Operaciones → Mise.',
    },
    {
      targetId: 'espacios-board',
      title: 'Arrastrar y soltar',
      description: 'Cada espacio muestra sus plazas con las secciones y producciones del mise. Arrastrá un ítem entre secciones para reorganizarlo — el cambio se guarda solo, sin abrir ningún formulario.',
    },
    {
      targetId: null,
      title: '¡Ya conocés Mesa de trabajo!',
      description: 'Preguntame qué plazas todavía no tienen espacio asignado o cuántos productos del stock te faltan ubicar en un sector.',
    },
  ],

  organigrama: [
    {
      targetId: null,
      title: 'El organigrama de tu negocio',
      description: 'Quién es quién, a qué área pertenece cada puesto y quién responde por cada etapa del día a día. Tocá Siguiente y te muestro las tres vistas.',
    },
    {
      targetId: 'organigrama-tabs',
      title: 'Plantel, Estructura y Cobertura',
      description: 'Plantel muestra a la gente. Estructura muestra las áreas del negocio y los puestos de cada una. Cobertura cruza esas áreas con las etapas del día a día para detectar huecos.',
    },
    {
      targetId: 'organigrama-plantel',
      requireTab: 'plantel',
      title: 'Las cartas del equipo',
      description: 'Cada persona tiene su carta: puesto, plazas que cubre, módulos habilitados y antigüedad. Tocá una carta para darla vuelta y ver a quién reporta y sus tareas.',
    },
    {
      targetId: 'organigrama-filtros',
      requireTab: 'plantel',
      title: 'Filtrar por área',
      description: 'Mostrás solo la gente de un área puntual — útil cuando el equipo es grande y querés enfocarte en Cocina, Salón o RRHH.',
    },
    {
      targetId: 'organigrama-estructura',
      requireTab: 'estructura',
      title: 'Las 12 áreas del negocio',
      description: 'Dirección, Cocina, Salón, Compras, Calidad, Administración, Comercial, RRHH, Desarrollo de producto, Sistemas, Marketing e Infraestructura. Existen todas siempre, aunque estén inactivas: un negocio chico no tiene departamentos formales, pero la función existe igual y la cubre menos gente. Tocá Activa/Inactiva para prenderlas o apagarlas, elegí el responsable, y mirá el árbol de puestos de cada una.',
    },
    {
      targetId: 'organigrama-cobertura',
      requireTab: 'cobertura',
      title: 'Quién responde en cada etapa',
      description: 'Cada área pasa por cuatro etapas: Definir el estándar, Preparar antes de abrir, Ejecutar durante el servicio y Controlar el resultado. En rojo, lo que no tiene nadie a cargo en Definir, Preparar o Controlar — Ejecutar es distinto, ahí "todo el equipo" es la respuesta normal, no una alerta.',
    },
    {
      targetId: 'organigrama-configurar',
      title: 'Asistente de configuración',
      description: 'Tres preguntas rápidas (tamaño del equipo, qué hacen además de cocina, quién sos vos) arman el organigrama inicial solas: activan las áreas que corresponden y te dejan como responsable de Dirección.',
    },
    {
      targetId: 'organigrama-exportar',
      title: 'Exportar en PDF',
      description: 'Genera el organigrama completo para colgar en la cocina, más una hoja por puesto con sus tareas, a quién reporta y los módulos que tiene habilitados — el manual de puesto, armado solo con lo que ya cargaste.',
    },
    {
      targetId: null,
      title: '¡Ya conocés el Organigrama!',
      description: 'Preguntame qué áreas están sin responsable, si hay puestos vacantes, o pedime ayuda para decidir qué activar según el tamaño de tu equipo.',
    },
  ],

  presupuesto: [
    {
      targetId: 'presupuesto-tabs',
      title: 'Dos niveles del mismo número',
      description: 'CMV por sector: el costo de mercadería (comida y bebida) desglosado por categoría, contra el objetivo de 30%. Familias: las 4 grandes familias de gasto del negocio (materia prima, personal, alquiler, gastos generales) contra la estructura estándar y el EBITDA del mes.',
    },
    {
      targetId: 'presupuesto-mes',
      title: 'Navegá mes a mes',
      description: 'Las flechitas mueven el mes que estás mirando. Un mes ya cerrado muestra el 100% de avance; el mes en curso te muestra cuánto llevás gastado contra cuánto debería llevar según los días corridos.',
    },
    {
      targetId: 'presupuesto-hero',
      title: 'El desvío, no solo el gasto',
      description: 'El número grande es el CMV real del mes. Lo que importa es la línea de abajo: cuántos puntos te fuiste del objetivo y cuánta plata es eso — no "cuánto gastaste" sino "¿está bien o mal?". Más abajo, la proyección te dice a dónde vas a llegar si seguís al mismo ritmo, y podés cargar las ventas estimadas del mes (o usar el sugerido, calculado solo con el promedio de los últimos 3 meses).',
    },
    {
      targetId: 'presupuesto-sectores',
      title: 'Quién explica el desvío',
      description: 'Cada sector (carnes, verduras, bebidas...) tiene su propio objetivo expresado sobre las ventas, así se puede comparar directo contra el gasto real. El desvío en puntos de cada fila suma exacto el desvío total del mes — así encontrás rápido cuál sector es el responsable, en vez de mirar un solo número global. El presupuesto de cada sector es editable, tocá el campo para cambiarlo.',
    },
    {
      targetId: 'presupuesto-semanas',
      title: 'Cuándo sale la plata',
      description: 'Esto compara el gasto de cada semana contra el presupuesto semanal, no contra las ventas — las compras entran a saltos (una compra grande de bodega puede ser toda una semana) y las ventas salen parejas todos los días. Sirve para ver el ritmo de compra, no para sacar un "CMV semanal".',
    },
    {
      targetId: 'presupuesto-fuera-cmv',
      title: 'Lo que no es costo de mercadería',
      description: 'Desperdicio suma el costo de la merma del mes (si algún registro no tiene costo, te avisa — sin precio del producto no entra al cálculo). Arreglos y mejoras son gastos en mantenimiento o equipamiento para mejorar el proceso, el tiempo o el ambiente de trabajo — no son costo de mercadería, pero compiten por la misma plata del mes.',
    },
    {
      targetId: null,
      title: '¡Ya conocés Presupuesto!',
      description: 'Preguntame por qué sector te fuiste del objetivo, cómo viene el mes proyectado, o pedime ayuda para decidir el presupuesto de un sector que todavía no cargaste.',
    },
  ],

  kds: [
    {
      targetId: null,
      title: 'El KDS de cocina',
      description: 'Las comandas que salen del salón aparecen acá en el momento, organizadas por estación. Cada tarjeta muestra los ítems pendientes de esa mesa — tocá un ítem para pasarlo de pendiente a en preparación y a listo.',
    },
    {
      targetId: null,
      title: '86 y métricas',
      description: 'Si un ítem se agota, marcalo 86 desde acá: deja de aparecer disponible en el salón al instante. El panel de métricas te muestra el tiempo promedio de bump y cuánto hay pendiente o en preparación en este momento.',
    },
  ],

  coach: [
    {
      targetId: null,
      title: 'El Kitchen Coach',
      description: 'Preguntale lo que necesites de tu cocina en lenguaje natural: gastos, precios, ventas, stock crítico, o qué te conviene producir hoy. Consulta tus datos reales y puede ejecutar acciones (crear una tarea, registrar una merma) si se lo pedís.',
    },
    {
      targetId: null,
      title: 'Historial de conversaciones',
      description: 'El ícono de reloj arriba a la derecha guarda tus charlas anteriores para retomarlas cuando quieras — no se pierden al cerrar la pantalla.',
    },
  ],

  muro: [
    {
      targetId: null,
      title: 'El Muro',
      description: 'La tablet colgada en la cocina, para todo el equipo a la vez — no una plaza sola. Una columna por plaza, con lo pendiente de producir; tocá un ítem para pasarlo de pendiente a en curso, listo o duda.',
    },
    {
      targetId: null,
      title: 'Pensado para leerse de lejos',
      description: 'Tipografía grande, sin scroll: si no entra todo, los ítems listos se colapsan a un contador en vez de agregar scroll. También muestra las notas que dejó el turno anterior para cada plaza.',
    },
  ],

  bitacora: [
    {
      targetId: null,
      title: 'La Bitácora',
      description: 'El registro del día a día del equipo: reuniones, notas, listas e ideas. Cada entrada se edita como un documento — Enter parte una línea nueva, Tab la indenta, y podés pegar texto de varias líneas de una vez.',
    },
    {
      targetId: null,
      title: 'Participantes y filtros',
      description: 'Cada reunión lleva sus participantes desde que se crea. Filtrá por tipo de entrada arriba, o buscá por título — las archivadas quedan aparte, no se mezclan con lo activo.',
    },
  ],

  configuracion: [
    {
      targetId: null,
      title: 'Configuración',
      description: 'Los ajustes generales del restaurante. Equipo y Permisos por rol son la versión anterior de lo que hoy vive en Turnos → Equipo/Puestos — quedan acá de referencia, el link "Equipo →" te lleva a la versión actual.',
    },
    {
      targetId: null,
      title: 'Restaurante',
      description: 'El nombre del local y la carta pública: activá el link para que cualquiera vea tu carta sin loguearse, en la URL con tu slug propio.',
    },
  ],
}
