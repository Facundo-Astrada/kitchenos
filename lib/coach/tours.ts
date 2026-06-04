export interface TourStep {
  targetId: string | null
  requireTab?: string
  title: string
  description: string
}

export const TOURS: Record<string, TourStep[]> = {
  operaciones: [
    {
      targetId: 'ops-tab-produccion',
      title: 'Producción',
      description: 'El tablero operativo del turno. Cargás todo lo que hay que cocinar, organizás por prioridad y seguís el avance del equipo en tiempo real. Funciona como una lista de producción viva que refleja el estado real de la cocina.',
    },
    {
      targetId: 'prod-seccion-sp',
      requireTab: 'produccion',
      title: 'Super Prioridad (SP)',
      description: 'Las preparaciones más críticas del turno, las que bloquean el servicio si no salen. Deben atacarse primero. Las secciones siguientes son Prioridad, Refuerzo y Check, en orden descendente de urgencia.',
    },
    {
      targetId: 'prod-seccion-sp',
      requireTab: 'produccion',
      title: 'Agregar preparación',
      description: 'Cada sección tiene un campo para agregar una preparación nueva. Podés tipear el nombre o vincularlo a una receta del recetario para que la información de porciones y plaza se complete automáticamente.',
    },
    {
      targetId: 'ops-tab-mise',
      title: 'Mise en Place',
      description: 'Tu mise en place digital, organizado por plaza y sección. Cada ítem muestra cuánto quedó del cierre anterior y cuánto hay que producir para el turno. Al marcar algo en Mise se refleja en Producción y viceversa.',
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
      description: 'Tareas recurrentes de la plaza: limpieza de heladera, descongelado semanal, control de fechas. Se configuran con frecuencia (diaria, semanal, mensual) y aparecen automáticamente en el día que corresponde.',
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
      targetId: 'recetario-lista',
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
      targetId: 'stock-importar',
      title: 'Importar desde Excel',
      description: 'Si tu proveedor te manda una lista en Excel o CSV, podés importarla directamente. El sistema mapea las columnas y actualiza los productos sin que tengas que cargar uno por uno.',
    },
    {
      targetId: 'stock-rebuild',
      title: 'Rebuild desde facturas',
      description: 'Si cargaste facturas pero el stock está vacío o con precios viejos, Rebuild reconstruye todo automáticamente: crea los productos que faltan, actualiza precios desde las facturas más recientes y los vincula a las recetas. Borra el stock anterior — usalo con cuidado.',
    },
    {
      targetId: null,
      title: '¡Ya conocés Inventario!',
      description: 'Abrí al Kitchen Coach en cualquier momento para consultar qué productos están en riesgo, pedir consejos de reposición o entender cómo el stock impacta el food cost de tus recetas.',
    },
  ],
}
