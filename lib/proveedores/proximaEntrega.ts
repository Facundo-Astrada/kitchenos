// `proveedores.dias_entrega` es texto libre en español ('Lun' o 'Lunes' según
// la cuenta, inconsistente — no es ISO 1-7 pese a lo que decía el PLAN-4-CAPAS
// original, ver .claude/docs/columnas.md). Este parser tolera ambas formas.

const DIA_ALIAS: Record<string, number> = {
  domingo: 0, dom: 0,
  lunes: 1, lun: 1,
  martes: 2, mar: 2,
  miercoles: 3, mie: 3, mier: 3,
  jueves: 4, jue: 4,
  viernes: 5, vie: 5,
  sabado: 6, sab: 6,
}

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function normDia(s: string): number | null {
  const x = stripAccents(s.toLowerCase().trim())
  return DIA_ALIAS[x] ?? null
}

/**
 * Días hasta la próxima entrega (0 = hoy mismo es día de entrega), o null si
 * el proveedor no tiene días de entrega cargados o ninguno matchea un día
 * real (dato a corregir a mano en ese caso, no se adivina).
 */
export function diasHastaProximaEntrega(diasEntrega: string[] | null | undefined, desde: Date = new Date()): number | null {
  if (!diasEntrega || diasEntrega.length === 0) return null
  const hoy = desde.getDay()
  const dias = diasEntrega.map(normDia).filter((d): d is number => d !== null)
  if (dias.length === 0) return null
  let min = 7
  for (const d of dias) {
    const delta = (d - hoy + 7) % 7
    if (delta < min) min = delta
  }
  return min
}
