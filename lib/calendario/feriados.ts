// Feriados nacionales de Argentina — lista estática, sin API. Un feriado
// cambia compras, personal y facturación de una cocina (¿abrimos? ¿con qué
// equipo? ¿llega el proveedor?), y verlo recién el día anterior llega tarde.
//
// 2026: fechas finales ya trasladadas (decreto + calendario oficial publicado,
// La Nación 30/04/2026). 2027: solo inamovibles + Carnaval/Viernes Santo
// (Pascua 28/03/2027); los trasladables 2027 se cargan cuando salga el decreto.
// `turistico` = día no laborable con fines turísticos (abre quien quiere).

export interface Feriado {
  fecha: string
  nombre: string
  turistico?: boolean
}

export const FERIADOS_AR: Feriado[] = [
  // 2026
  { fecha: '2026-01-01', nombre: 'Año Nuevo' },
  { fecha: '2026-02-16', nombre: 'Carnaval' },
  { fecha: '2026-02-17', nombre: 'Carnaval' },
  { fecha: '2026-03-24', nombre: 'Día de la Memoria' },
  { fecha: '2026-04-02', nombre: 'Malvinas' },
  { fecha: '2026-04-03', nombre: 'Viernes Santo' },
  { fecha: '2026-05-01', nombre: 'Día del Trabajador' },
  { fecha: '2026-05-25', nombre: 'Revolución de Mayo' },
  { fecha: '2026-06-15', nombre: 'Paso a la Inmortalidad de Güemes' },
  { fecha: '2026-06-20', nombre: 'Día de la Bandera' },
  { fecha: '2026-07-09', nombre: 'Día de la Independencia' },
  { fecha: '2026-07-10', nombre: 'No laborable (turístico)', turistico: true },
  { fecha: '2026-08-17', nombre: 'Paso a la Inmortalidad de San Martín' },
  { fecha: '2026-10-12', nombre: 'Día de la Diversidad Cultural' },
  { fecha: '2026-11-23', nombre: 'Día de la Soberanía Nacional' },
  { fecha: '2026-12-07', nombre: 'No laborable (turístico)', turistico: true },
  { fecha: '2026-12-08', nombre: 'Inmaculada Concepción' },
  { fecha: '2026-12-25', nombre: 'Navidad' },
  // 2027 — inamovibles + móviles por Pascua
  { fecha: '2027-01-01', nombre: 'Año Nuevo' },
  { fecha: '2027-02-08', nombre: 'Carnaval' },
  { fecha: '2027-02-09', nombre: 'Carnaval' },
  { fecha: '2027-03-24', nombre: 'Día de la Memoria' },
  { fecha: '2027-03-26', nombre: 'Viernes Santo' },
  { fecha: '2027-04-02', nombre: 'Malvinas' },
  { fecha: '2027-05-01', nombre: 'Día del Trabajador' },
  { fecha: '2027-05-25', nombre: 'Revolución de Mayo' },
  { fecha: '2027-06-20', nombre: 'Día de la Bandera' },
  { fecha: '2027-07-09', nombre: 'Día de la Independencia' },
  { fecha: '2027-12-08', nombre: 'Inmaculada Concepción' },
  { fecha: '2027-12-25', nombre: 'Navidad' },
]

export function feriadosEnRango(desde: string, hasta: string): Feriado[] {
  return FERIADOS_AR.filter(f => f.fecha >= desde && f.fecha <= hasta)
}
