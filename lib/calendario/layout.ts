// Layout de la grilla — puro, sin React, para poder testearlo.
import { diffDays, minutos } from './fechas'

interface ConRango { id: string; dia: string; diaFin: string }

export interface Segmento<T> {
  item: T
  colInicio: number   // 0..6 dentro de la semana
  colFin: number      // inclusive
  carril: number
  continuaAntes: boolean
  continuaDespues: boolean
}

/**
 * Barras de los ítems de varios días dentro de una semana (patrón Google
 * Calendar: un menú fijo del 10 al 18 es UNA barra, no nueve píldoras).
 * Carriles greedy: el primero libre desde arriba; los más largos primero
 * para que no queden partidos debajo de los cortos.
 */
export function segmentosSemana<T extends ConRango>(
  semana: string[],
  items: T[],
  { incluirUnDia = false }: { incluirUnDia?: boolean } = {},
): Segmento<T>[] {
  const d0 = semana[0], d6 = semana[semana.length - 1]
  const candidatos = items
    .filter(it => (incluirUnDia || it.diaFin > it.dia) && it.dia <= d6 && it.diaFin >= d0)
    .map(item => ({
      item,
      colInicio: Math.max(0, diffDays(d0, item.dia)),
      colFin: Math.min(semana.length - 1, diffDays(d0, item.diaFin)),
      continuaAntes: item.dia < d0,
      continuaDespues: item.diaFin > d6,
    }))
    .sort((a, b) => a.colInicio - b.colInicio || (b.colFin - b.colInicio) - (a.colFin - a.colInicio) || a.item.id.localeCompare(b.item.id))

  const finCarril: number[] = []
  return candidatos.map(c => {
    let carril = finCarril.findIndex(fin => fin < c.colInicio)
    if (carril === -1) { carril = finCarril.length; finCarril.push(c.colFin) }
    else finCarril[carril] = c.colFin
    return { ...c, carril }
  })
}

interface ConHora { id: string; hora_inicio: string; hora_fin: string }

export interface Bloque<T> {
  item: T
  inicioMin: number
  finMin: number
  col: number
  cols: number
}

/**
 * Bloques de hora de un día en la vista semana: cada evento ocupa de su hora
 * de inicio a la de fin (antes se pintaba solo en la fila de la hora de
 * inicio, con alto fijo de una hora). Los que se pisan se reparten el ancho
 * en columnas. Un fin <= inicio se toma como "cruza la medianoche" y se corta
 * a las 24:00; duración mínima visible 30 min.
 */
export function bloquesDia<T extends ConHora>(items: T[]): Bloque<T>[] {
  const base = items
    .map(item => {
      const ini = minutos(item.hora_inicio)
      let fin = minutos(item.hora_fin)
      if (fin <= ini) fin = 24 * 60
      return { item, inicioMin: ini, finMin: Math.max(fin, ini + 30) }
    })
    .sort((a, b) => a.inicioMin - b.inicioMin || b.finMin - a.finMin)

  const out: Bloque<T>[] = []
  let grupo: (typeof base[number] & { col: number })[] = []
  let finGrupo = -1
  const cerrar = () => {
    const cols = Math.max(1, ...grupo.map(g => g.col + 1))
    for (const g of grupo) out.push({ ...g, cols })
    grupo = []
  }
  for (const b of base) {
    if (grupo.length && b.inicioMin >= finGrupo) cerrar()
    const ocupadas = new Set(grupo.filter(g => g.finMin > b.inicioMin).map(g => g.col))
    let col = 0
    while (ocupadas.has(col)) col++
    grupo.push({ ...b, col })
    finGrupo = Math.max(finGrupo, b.finMin)
  }
  if (grupo.length) cerrar()
  return out
}
