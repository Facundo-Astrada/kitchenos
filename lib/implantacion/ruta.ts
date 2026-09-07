/**
 * La ruta de implantación — 7 hitos, 31 estaciones.
 *
 * Fuente: `PLAN-IMPLANTACION-2026-09.md`. Este archivo es la ruta como DATO:
 * ninguna pantalla decide qué va, en qué orden ni cuándo algo está hecho.
 *
 * Tres cosas que distinguen esto del onboarding viejo
 * (`app/(app)/onboarding/page.tsx`, 8/4/2 pasos por rol):
 *
 * 1. **Dos checkpoints por estación, no uno.** `carga` = hay datos.
 *    `insercion` = se usa sin que nadie lo pida. Solo la segunda suma al
 *    porcentaje. Sin esa separación la app dice "listo" porque el admin cargó
 *    las recetas mientras en la cocina nadie abrió el mise.
 * 2. **`apaga`**: la costumbre vieja que muere. La falla de rollout más común
 *    es correr lo viejo y lo nuevo en paralelo — mientras el pizarrón siga
 *    disponible, el que se resiste vuelve a él. K-OS no compite contra otra
 *    app: compite contra el cuaderno y el audio de WhatsApp.
 * 3. **No termina.** Al llegar arriba queda como medidor de organización.
 *
 * Un checkpoint sin predicado NO es un bug: es una estación que hoy no se puede
 * medir sola y se confirma a mano. Es preferible a inventar una métrica que
 * mienta. Ver `progreso.ts`.
 */
import type { ModuloId } from '@/lib/constants'

export type HitoId = 'base' | 'equipo' | 'carta' | 'compra' | 'dia' | 'control' | 'salon'

export interface Hito {
  id: HitoId
  n: number
  nombre: string
  pregunta: string
  /** Día objetivo desde la instalación. El reloj sale de la investigación de
   *  retención: la mayoría de las bajas ocurre en los primeros 90 días. */
  diaObjetivo: number | null
  /** El salón no aplica a todos los negocios. */
  opcional?: boolean
}

export const HITOS: Hito[] = [
  { id: 'base',    n: 0, nombre: 'Campamento base', pregunta: 'Tu primer número', diaObjetivo: 1 },
  { id: 'equipo',  n: 1, nombre: 'El equipo',       pregunta: '¿Quién hace qué?', diaObjetivo: 7 },
  { id: 'carta',   n: 2, nombre: 'La carta',        pregunta: '¿Qué vendemos y a cuánto?', diaObjetivo: 30 },
  { id: 'compra',  n: 3, nombre: 'La compra',       pregunta: '¿Qué entra y a qué precio?', diaObjetivo: 30 },
  { id: 'dia',     n: 4, nombre: 'El día',          pregunta: '¿Cómo se trabaja un turno?', diaObjetivo: 60 },
  { id: 'control', n: 5, nombre: 'El control',      pregunta: '¿Qué pasó, y qué cambio por eso?', diaObjetivo: 90 },
  { id: 'salon',   n: 6, nombre: 'El salón',        pregunta: 'Según el tipo de negocio', diaObjetivo: null, opcional: true },
]

/**
 * Las métricas con las que se evalúan los checkpoints.
 *
 * Todas se llenan con counts livianos en `useRutaImplantacion`. Lo que no está
 * acá es lo que hoy no sabemos medir — y se confirma a mano en vez de fingirse.
 */
export interface MetricasRuta {
  // Hito 0
  tipoNegocioDefinido: boolean
  facturasTotal: number
  facturasMesActual: number
  /** Semanas consecutivas (hacia atrás desde hoy) con al menos una factura. */
  facturasSemanasSeguidas: number
  recetasConRendimiento: number
  platosConFoodCost: number

  // Hito 1
  areasActivas: number
  areasSinResponsable: number
  puestos: number
  miembros: number
  miembrosVinculados: number
  competenciasCargadas: number
  competenciasNivel4: number

  // Hito 2
  cartaItems: number
  cartaSinReceta: number
  cartaSinEstandarizar: number
  margenObjetivoCargado: boolean

  // Hito 3
  proveedores: number
  productos: number
  /** Ingredientes de receta, contados directo: su RLS ya filtra por las recetas
   *  del restaurante, así que no hace falta el join que en PostgREST no filtra
   *  (ver `.claude/docs/hooks.md` — el bug del `.eq('rel.col', X)`). */
  ingredientesTotal: number
  /** …de los cuales tienen `producto_id`, o sea que su costo se mueve solo. */
  ingredientesLinkeados: number
  pedidos: number

  // Hito 4
  plazasConMise: number
  turnosConfigurados: boolean
  tareasDespachadas: number
  entregasPase: number
  /** Jornadas consecutivas con entrega de pase en todas las plazas activas. */
  paseDiasSeguidos: number
  registrosHaccp: number

  // Hito 5
  registrosMerma: number
  presupuestoCargado: boolean
  entradasBitacora: number
  mesesConVentas: number

  // Hito 6
  mesas: number
  comandas: number
  clientes: number
  arqueos: number
}

export interface Estacion {
  id: string
  hito: HitoId
  titulo: string
  /** Módulo dueño — de acá sale el responsable vía `responsableDeModulo()`. */
  modulo: ModuloId
  /** La costumbre vieja que muere cuando esta estación queda insertada. */
  apaga: string | null
  /** Qué se ve cuando está hecha, en el idioma de la cocina. */
  cargaLabel: string
  insercionLabel: string
  /** Sin predicado = se confirma a mano (no sabemos medirlo todavía). */
  carga?: (m: MetricasRuta) => boolean
  insercion?: (m: MetricasRuta) => boolean
  /** Las que, si no pasan, hunden todo lo demás. */
  clave?: boolean
}

export const ESTACIONES: Estacion[] = [
  // ── Hito 0 · Campamento base ──────────────────────────────
  {
    id: '0.1', hito: 'base', modulo: 'configuracion',
    titulo: 'Crear la cuenta y decir qué tipo de negocio es',
    apaga: null,
    cargaLabel: 'El restaurante existe con tipo y turnos',
    insercionLabel: '—',
    carga: m => m.tipoNegocioDefinido,
    insercion: m => m.tipoNegocioDefinido,
  },
  {
    id: '0.2', hito: 'base', modulo: 'facturas', clave: true,
    titulo: 'Importar las facturas del último mes',
    apaga: 'El Excel de gastos y la carpeta de facturas',
    cargaLabel: 'Al menos un lote importado',
    insercionLabel: 'El precio de un insumo se actualiza solo',
    carga: m => m.facturasTotal > 0,
    insercion: m => m.facturasSemanasSeguidas >= 2,
  },
  {
    id: '0.3', hito: 'base', modulo: 'recetario', clave: true,
    titulo: 'Cargar las 10 recetas que más facturan',
    apaga: 'El cuaderno de recetas del chef',
    cargaLabel: '10 recetas con rendimiento e ingredientes',
    insercionLabel: 'Alguien la abrió en pleno turno',
    carga: m => m.recetasConRendimiento >= 10,
  },
  {
    id: '0.4', hito: 'base', modulo: 'carta',
    titulo: 'Mirar el food cost real de esos 10 platos',
    apaga: 'La calculadora y el "me parece que da"',
    cargaLabel: '10 platos con food cost sobre gramaje real',
    insercionLabel: 'Se volvió a mirar a la semana siguiente',
    carga: m => m.platosConFoodCost >= 10,
  },

  // ── Hito 1 · El equipo ────────────────────────────────────
  {
    id: '1.1', hito: 'equipo', modulo: 'organigrama',
    titulo: 'Activar las áreas del negocio',
    apaga: 'El organigrama que solo vive en la cabeza del dueño',
    cargaLabel: 'Al menos 4 áreas activas de las 12',
    insercionLabel: '30 días sin retocarlo: la estructura se sostuvo',
    carga: m => m.areasActivas >= 4,
  },
  {
    id: '1.2', hito: 'equipo', modulo: 'organigrama',
    titulo: 'Crear los puestos reales del local',
    apaga: '"Acá todos hacemos de todo"',
    cargaLabel: '3 o más puestos con permisos definidos',
    insercionLabel: 'Se editó uno al cambiar alguien de función',
    carga: m => m.puestos >= 3,
  },
  {
    id: '1.3', hito: 'equipo', modulo: 'equipo',
    titulo: 'Cargar el plantel e invitar a cada uno',
    apaga: 'El grupo de WhatsApp como lista de personal',
    cargaLabel: 'Todas las personas activas con puesto',
    insercionLabel: '6 de cada 10 aceptaron la invitación y entraron',
    carga: m => m.miembros >= 2,
    insercion: m => m.miembros > 0 && m.miembrosVinculados / m.miembros >= 0.6,
  },
  {
    id: '1.4', hito: 'equipo', modulo: 'organigrama', clave: true,
    titulo: 'Cobertura: un responsable por área y etapa',
    apaga: '"¿De quién era esto?"',
    cargaLabel: 'Cero huecos rojos en la grilla de cobertura',
    insercionLabel: 'Se reasignó un responsable sin que nadie lo pidiera',
    carga: m => m.areasActivas > 0 && m.areasSinResponsable === 0,
  },
  {
    id: '1.5', hito: 'equipo', modulo: 'organigrama', clave: true,
    titulo: 'Cargar la matriz de polivalencia',
    apaga: '"Hoy no puede faltar Sofi" dicho de memoria',
    cargaLabel: 'Cada persona con su nivel en cada plaza',
    insercionLabel: 'Hay al menos un referente que puede enseñar',
    carga: m => m.competenciasCargadas > 0,
    insercion: m => m.competenciasNivel4 > 0,
  },

  // ── Hito 2 · La carta ─────────────────────────────────────
  {
    id: '2.1', hito: 'carta', modulo: 'carta',
    titulo: 'Cargar la carta completa',
    apaga: 'La carta impresa como fuente de verdad del precio',
    cargaLabel: 'Todos los platos con precio y categoría',
    insercionLabel: 'Se dio de alta o de baja un plato desde la app',
    carga: m => m.cartaItems >= 10,
  },
  {
    id: '2.2', hito: 'carta', modulo: 'recetario',
    titulo: 'Completar el recetario más allá de las 10',
    apaga: '"Preguntale a Juan cómo se hace"',
    cargaLabel: 'Ningún plato sin receta vinculada',
    insercionLabel: 'Se editó al menos una receta por semana',
    carga: m => m.cartaItems > 0 && m.cartaSinReceta === 0,
  },
  {
    id: '2.3', hito: 'carta', modulo: 'carta', clave: true,
    titulo: 'Estandarizar: gramaje real por plato',
    apaga: 'El ojo como unidad de medida',
    cargaLabel: 'Ningún plato marcado "sin estandarizar"',
    insercionLabel: 'El food cost cambió por gramaje, no por precio',
    carga: m => m.cartaItems > 0 && m.cartaSinEstandarizar === 0,
  },
  {
    id: '2.4', hito: 'carta', modulo: 'presupuesto',
    titulo: 'Fijar precio y margen objetivo',
    apaga: 'El precio del de al lado como único criterio',
    cargaLabel: 'Margen objetivo cargado',
    insercionLabel: 'Se repreció al menos un plato desde Reprecio',
    carga: m => m.margenObjetivoCargado,
  },

  // ── Hito 3 · La compra ────────────────────────────────────
  {
    id: '3.1', hito: 'compra', modulo: 'proveedores',
    titulo: 'Cargar proveedores',
    apaga: 'La agenda del celular del dueño',
    cargaLabel: '5 o más proveedores con contacto',
    insercionLabel: 'Se le pidió a uno desde la app',
    carga: m => m.proveedores >= 5,
    insercion: m => m.pedidos > 0,
  },
  {
    id: '3.2', hito: 'compra', modulo: 'facturas', clave: true,
    titulo: 'Facturas al día',
    apaga: 'La caja de zapatos con los remitos',
    cargaLabel: 'Las facturas del mes en curso, cargadas',
    insercionLabel: '3 semanas seguidas sin un hueco',
    carga: m => m.facturasMesActual > 0,
    insercion: m => m.facturasSemanasSeguidas >= 3,
  },
  {
    id: '3.3', hito: 'compra', modulo: 'stock',
    titulo: 'Productos de stock y auto-link a las recetas',
    apaga: 'La lista de compras escrita a mano',
    cargaLabel: '8 de cada 10 ingredientes linkeados',
    insercionLabel: 'Una receta nueva se linkeó sola al crearse',
    carga: m => m.ingredientesTotal > 0 && m.ingredientesLinkeados / m.ingredientesTotal >= 0.8,
  },
  {
    id: '3.4', hito: 'compra', modulo: 'stock',
    titulo: 'Conteo inicial de depósito y heladeras',
    apaga: 'El inventario en papel del domingo',
    cargaLabel: 'Conteo completo cargado una vez',
    insercionLabel: 'Dos conteos en el mismo mes',
    carga: m => m.productos >= 20,
  },
  {
    id: '3.5', hito: 'compra', modulo: 'pedidos',
    titulo: 'Pedir al proveedor desde la app',
    apaga: 'El audio de WhatsApp al proveedor',
    cargaLabel: 'Al menos un pedido creado',
    insercionLabel: 'Un pedido se recibió y se convirtió en factura',
    carga: m => m.pedidos > 0,
  },

  // ── Hito 4 · El día ───────────────────────────────────────
  {
    id: '4.1', hito: 'dia', modulo: 'checklist',
    titulo: 'Definir plazas y secciones',
    apaga: 'El pizarrón de la cocina',
    cargaLabel: 'Plazas activas con sus secciones',
    insercionLabel: 'Alguien creó una sección nueva sin pedir ayuda',
    carga: m => m.plazasConMise >= 2,
  },
  {
    id: '4.2', hito: 'dia', modulo: 'turnos',
    titulo: 'Definir los turnos de servicio y la grilla',
    apaga: 'La grilla en papel pegada en la oficina',
    cargaLabel: 'Turnos cargados',
    insercionLabel: 'La grilla se completó 2 semanas seguidas',
    carga: m => m.turnosConfigurados,
  },
  {
    id: '4.3', hito: 'dia', modulo: 'checklist', clave: true,
    titulo: 'Armar el mise en place de cada plaza',
    apaga: 'La lista de mise escrita a mano cada mañana',
    cargaLabel: 'Cada plaza activa con 5 ítems o más',
    insercionLabel: 'Los ítems los edita la plaza, no el chef',
    carga: m => m.plazasConMise >= 2,
  },
  {
    id: '4.4', hito: 'dia', modulo: 'operaciones', clave: true,
    titulo: 'Leer la ficha de line-up antes del servicio',
    apaga: 'El "¿alguna novedad?" que nadie contesta',
    cargaLabel: 'La ficha se genera sola',
    insercionLabel: 'Se lee en voz alta 5 servicios seguidos',
    carga: m => m.plazasConMise > 0,
  },
  {
    id: '4.5', hito: 'dia', modulo: 'produccion',
    titulo: 'Despachar producción desde el mise',
    apaga: '"Acordate de hacer más salsa"',
    cargaLabel: 'Al menos una tarea despachada',
    insercionLabel: 'Se despacha todos los días de servicio',
    carga: m => m.tareasDespachadas > 0,
    insercion: m => m.tareasDespachadas >= 20,
  },
  {
    id: '4.6', hito: 'dia', modulo: 'pase', clave: true,
    titulo: 'Entregar el pase de turno',
    apaga: 'El mensaje de WhatsApp al que entra',
    cargaLabel: 'Una entrega registrada',
    insercionLabel: '5 días seguidos con apertura y cierre en todas las plazas',
    carga: m => m.entregasPase > 0,
    insercion: m => m.paseDiasSeguidos >= 5,
  },
  {
    id: '4.7', hito: 'dia', modulo: 'haccp',
    titulo: 'Limpieza y controles de temperatura',
    apaga: 'Las planillas de temperatura de la carpeta',
    cargaLabel: 'Los registros obligatorios configurados',
    insercionLabel: 'Registros completos 2 semanas seguidas',
    carga: m => m.registrosHaccp > 0,
    insercion: m => m.registrosHaccp >= 14,
  },

  // ── Hito 5 · El control ───────────────────────────────────
  {
    id: '5.1', hito: 'control', modulo: 'merma',
    titulo: 'Registrar la merma',
    apaga: 'El "se tiró y listo"',
    cargaLabel: '10 registros o más',
    insercionLabel: 'Se registra sin que nadie lo pida',
    carga: m => m.registrosMerma >= 10,
    insercion: m => m.registrosMerma >= 30,
  },
  {
    id: '5.2', hito: 'control', modulo: 'presupuesto',
    titulo: 'Cargar el presupuesto y el CMV objetivo',
    apaga: 'El Excel del contador',
    cargaLabel: 'Presupuesto del mes por sector',
    insercionLabel: 'Se comparó real contra objetivo al cierre del mes',
    carga: m => m.presupuestoCargado,
  },
  {
    id: '5.3', hito: 'control', modulo: 'bitacora',
    titulo: 'Bitácora del servicio',
    apaga: 'La memoria',
    cargaLabel: 'Al menos una entrada',
    insercionLabel: 'Entradas en la mitad de los servicios',
    carga: m => m.entradasBitacora > 0,
    insercion: m => m.entradasBitacora >= 15,
  },
  {
    id: '5.4', hito: 'control', modulo: 'reportes',
    titulo: 'Leer el mes en Reportes',
    apaga: 'El resumen del contador a fin de mes',
    cargaLabel: 'Un mes completo con datos reales',
    insercionLabel: 'Se entró 4 semanas seguidas',
    carga: m => m.mesesConVentas >= 1,
  },
  {
    id: '5.5', hito: 'control', modulo: 'carta', clave: true,
    titulo: 'Cerrar el círculo: ajustar el estándar',
    apaga: 'La reunión anual que no cambia nada',
    cargaLabel: '—',
    insercionLabel: 'Un desvío visto en Reportes cambió una receta, un precio o un mise',
  },

  // ── Hito 6 · El salón ─────────────────────────────────────
  {
    id: '6.1', hito: 'salon', modulo: 'salon',
    titulo: 'Dibujar el mapa de mesas',
    apaga: 'El plano en la cabeza del encargado',
    cargaLabel: 'Mapa con las mesas reales',
    insercionLabel: 'Se movió una mesa por un cambio real del local',
    carga: m => m.mesas > 0,
  },
  {
    id: '6.2', hito: 'salon', modulo: 'kds',
    titulo: 'Comandas y KDS',
    apaga: 'La comanda en papel',
    cargaLabel: 'Al menos un servicio completo comandado',
    insercionLabel: 'Un servicio entero sin volver al papel',
    carga: m => m.comandas > 0,
    insercion: m => m.comandas >= 50,
  },
  {
    id: '6.3', hito: 'salon', modulo: 'clientes',
    titulo: 'Clientes y reservas',
    apaga: 'La libreta de reservas',
    cargaLabel: 'Cartera inicial cargada',
    insercionLabel: 'Una reserva se tomó desde la app',
    carga: m => m.clientes > 0,
  },
  {
    // El arqueo vive en Salón → Caja, no en Ventas: `ventas` es un mirador (se
    // llena solo con lo que pasa en el servicio) y un mirador no se carga.
    id: '6.4', hito: 'salon', modulo: 'salon',
    titulo: 'Arqueo de caja al cierre',
    apaga: 'El papelito con la cuenta de caja',
    cargaLabel: 'Al menos un arqueo',
    insercionLabel: 'Arqueo en todos los cierres de una semana',
    carga: m => m.arqueos > 0,
    insercion: m => m.arqueos >= 7,
  },
]

/**
 * Módulos que NO son estaciones: se llenan solos con lo que hacen los demás.
 * No piden nada y no cuentan para el progreso — son la recompensa de subir.
 */
export const MIRADORES: ModuloId[] = [
  'home', 'reportes', 'ventas', 'coach', 'muro', 'espacios', 'calendario',
]

export function estacionesDeHito(hito: HitoId): Estacion[] {
  return ESTACIONES.filter(e => e.hito === hito)
}
