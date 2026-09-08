// Contenido estático de las tarjetas "¿Cómo se lee esto?" (components/ui/
// Explicacion.tsx) — Reportes y Presupuesto. Una sola fuente: si el día de
// mañana el Coach necesita explicar lo mismo en el chat, lee de acá, no de
// una copia pegada en el tour (lib/coach/tours.ts sigue vivo para el
// recorrido guiado la primera vez; esto es la ayuda que queda siempre a
// mano, no solo una vez). El "ejemplo con números reales" NO vive acá a
// propósito — depende de datos que cada pantalla ya tiene cargados, se arma
// en el propio componente de la pantalla.

export interface ExplicacionContenido {
  queEs: string
  comoSeCalcula?: string
  queHacerSi?: string
}

export const EXPLICACIONES: Record<string, ExplicacionContenido> = {
  'reportes-cmv': {
    queEs: 'El costo de mercadería vendida: cuánto de lo que vendiste se te fue en comprar insumos. Es el número más resumido de rentabilidad del período — bajo es bueno, alto quiere decir que compraste caro, tiraste, o vendiste barato.',
    comoSeCalcula: 'CMV % = compras del período ÷ ventas del período × 100',
    queHacerSi: 'Si te da más alto de lo esperado, andá a Fuga primero (compraste algo que no se vendió) y después a Food Cost por plato (algo se está vendiendo a pérdida).',
  },
  'reportes-fuga': {
    queEs: 'Por cada producto, compara lo que deberías haber consumido según lo que vendiste (calculado desde la receta de cada plato) contra lo que efectivamente salió de stock. La diferencia que no explica la merma registrada es fuga: se perdió, se sirvió de más, o alguien se lo llevó.',
    comoSeCalcula: 'Fuga = consumo real de stock − consumo teórico (según ventas y recetas) − merma declarada',
    queHacerSi: 'Un producto en fuga no siempre es robo — primero revisá si la receta tiene el gramaje real cargado y si toda la merma real se está registrando en Merma.',
  },
  'reportes-rendimiento': {
    queEs: 'Cuánto se cumplió lo planificado en cada plaza durante el período: de las tareas que tenía que completar, cuántas completó, y cuánto costó en mermas lo que se hizo mal.',
    comoSeCalcula: 'Cumplimiento % = tareas completadas ÷ tareas totales de la plaza',
    queHacerSi: 'Una plaza con cumplimiento bajo pero merma también baja puede ser un problema de carga de tareas (se pide de más), no de desempeño.',
  },
  'reportes-foodcost': {
    queEs: 'Por cada plato de la carta con receta cargada: cuánto cuesta hacerlo contra a cuánto se vende. El % de food cost es la porción del precio que se va en el costo del insumo — el resto es lo que cubre el resto del negocio.',
    comoSeCalcula: 'Food cost % = costo de la porción ÷ precio de venta × 100',
    queHacerSi: 'Por encima de 33% conviene mirar el plato: ¿el gramaje de la receta es el real, o subió el precio del insumo y no se re-precioó el plato?',
  },
  'presupuesto-hero': {
    queEs: 'Cuánto declaraste que ibas a gastar este mes en cada sector (carnes, verduras, bebidas…), expresado como porcentaje de las ventas — no en pesos fijos, porque un mes de más ventas gasta más en insumos y eso es esperable, no un desvío.',
    queHacerSi: 'Si nunca cargaste un presupuesto, arrancá por los sectores que más pesan en tus compras — Reportes → Compras te muestra cuáles son.',
  },
  'presupuesto-sectores': {
    queEs: 'Cada sector tiene su objetivo en % de ventas. El desvío en puntos de cada fila suma exacto el desvío total del mes, así que ves rápido cuál sector es el responsable del número global en vez de tener que adivinar.',
    comoSeCalcula: 'Desvío (puntos) = % real gastado del sector − % objetivo del sector',
    queHacerSi: 'Un sector en rojo no siempre es sobregasto — puede ser que las ventas de ese período fueron más bajas de lo normal y el objetivo en % ya lo venía anticipando.',
  },
  'presupuesto-semanas': {
    queEs: 'El gasto de cada semana contra el presupuesto semanal, no contra las ventas de esa semana — las compras entran a saltos (una compra grande de bodega puede ser toda una semana) y las ventas salen parejas todos los días.',
    queHacerSi: 'Sirve para ver el ritmo de compra dentro del mes, no para sacar un "CMV semanal" — para eso está Reportes → CMV con el período en semana.',
  },
}
