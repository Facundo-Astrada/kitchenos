// Helpers de fecha del Calendario — todo en 'YYYY-MM-DD' local, sin Date en
// el estado (un Date a medianoche UTC se corre un día en Argentina). Se
// construye siempre al mediodía ('T12:00:00') para esquivar DST y husos.

export const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]
export const DIAS_CORTO = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
export const DIAS_LARGO = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

/** "lunes" … "domingo" — para frases ("Todos los martes"). */
export const diaNombre = (fecha: string) => DIAS_LARGO[dowLunes(fecha)].toLowerCase()

export function pad2(n: number) { return String(n).padStart(2, '0') }

export function toDateStr(y: number, m: number, d: number) {
  return `${y}-${pad2(m)}-${pad2(d)}`
}

export function parse(fecha: string) { return new Date(fecha + 'T12:00:00') }

export function fromDate(d: Date) { return toDateStr(d.getFullYear(), d.getMonth() + 1, d.getDate()) }

export function hoy() { return fromDate(new Date()) }

export function addDays(fecha: string, n: number) {
  const d = parse(fecha)
  d.setDate(d.getDate() + n)
  return fromDate(d)
}

/** Días entre a y b (b - a), ambos inclusive no; 0 si son el mismo día. */
export function diffDays(a: string, b: string) {
  return Math.round((parse(b).getTime() - parse(a).getTime()) / 86_400_000)
}

/** 0 = lunes … 6 = domingo (la semana de la cocina arranca el lunes). */
export function dowLunes(fecha: string) {
  const dow = parse(fecha).getDay()
  return dow === 0 ? 6 : dow - 1
}

export function lunesDe(fecha: string) { return addDays(fecha, -dowLunes(fecha)) }

/** Las 42 fechas (6 semanas) que pinta la grilla del mes, arrancando en lunes. */
export function grillaMes(mes: number, anio: number): string[] {
  const inicio = lunesDe(toDateStr(anio, mes, 1))
  return Array.from({ length: 42 }, (_, i) => addDays(inicio, i))
}

export function rango(desde: string, hasta: string): string[] {
  const out: string[] = []
  for (let f = desde; f <= hasta; f = addDays(f, 1)) out.push(f)
  return out
}

/** "Viernes 9 de octubre" — toLocaleDateString + textTransform:capitalize
 *  escribía "Viernes, 9 De Octubre"; acá solo va mayúscula la primera. */
export function fechaLarga(fecha: string, conAnio = false) {
  const d = parse(fecha)
  const base = `${DIAS_LARGO[dowLunes(fecha)]} ${d.getDate()} de ${MESES[d.getMonth()].toLowerCase()}`
  return conAnio ? `${base} de ${d.getFullYear()}` : base
}

/** "Hoy", "Mañana", "Ayer" o null. */
export function fechaRelativa(fecha: string, ref = hoy()) {
  const d = diffDays(ref, fecha)
  if (d === 0) return 'Hoy'
  if (d === 1) return 'Mañana'
  if (d === -1) return 'Ayer'
  return null
}

/** Etiqueta del rango de una semana/tira de días: "5 – 11 oct" o "28 sep – 4 oct". */
export function etiquetaRango(desde: string, hasta: string) {
  const a = parse(desde), b = parse(hasta)
  const mc = (d: Date) => MESES[d.getMonth()].slice(0, 3).toLowerCase()
  if (a.getMonth() === b.getMonth()) return `${a.getDate()} – ${b.getDate()} ${mc(b)}`
  return `${a.getDate()} ${mc(a)} – ${b.getDate()} ${mc(b)}`
}

/** 'HH:MM:SS' | 'HH:MM' → minutos desde 00:00. */
export function minutos(hora: string | null | undefined) {
  if (!hora) return 0
  const [h, m] = hora.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

export type Frecuencia = 'diaria' | 'semanal' | 'quincenal' | 'mensual' | 'anual'

/**
 * `eventos.frecuencia` es texto libre; las variantes se codifican ahí para no
 * necesitar columnas nuevas (nadie más lee esa columna de `eventos`):
 *   'semanal'          → el mismo día de la semana del inicio
 *   'semanal:1,4'      → esos días (0 = lunes … 6 = domingo), ej. martes y viernes
 *   'mensual'          → el mismo número de día (el 11)
 *   'mensual:2'        → el 2º <día de semana del inicio> de cada mes
 *   'mensual:-1'       → el último <día de semana del inicio> de cada mes
 */
export function parseFrecuencia(frecuencia: string | null) {
  const [base, arg] = (frecuencia ?? 'semanal').split(':')
  const tipo = (base || 'semanal') as Frecuencia
  const dias = tipo === 'semanal' && arg
    ? [...new Set(arg.split(',').map(Number).filter(n => n >= 0 && n <= 6))].sort()
    : null
  const ordinal = tipo === 'mensual' && arg ? Number(arg) : null
  return { tipo, dias: dias && dias.length ? dias : null, ordinal: ordinal && (ordinal === -1 || (ordinal >= 1 && ordinal <= 4)) ? ordinal : null }
}

const ORDINALES = ['', 'primer', 'segundo', 'tercer', 'cuarto']
const plural = (dia: string) => dia.endsWith('s') ? dia : dia + 's'
const unirY = (l: string[]) => l.length <= 1 ? l.join('') : l.slice(0, -1).join(', ') + ' y ' + l[l.length - 1]

/** "Todos los martes y viernes", "El segundo domingo de cada mes"... */
export function describirRepeticion(inicio: string, frecuencia: string | null) {
  const { tipo, dias, ordinal } = parseFrecuencia(frecuencia)
  const dia = diaNombre(inicio)
  const d = parse(inicio)
  switch (tipo) {
    case 'diaria': return 'Todos los días'
    case 'semanal': {
      const ds = dias ?? [dowLunes(inicio)]
      if (ds.length === 7) return 'Todos los días'
      if (ds.length === 5 && ds.every(x => x < 5)) return 'De lunes a viernes'
      return 'Todos los ' + unirY(ds.map(i => plural(DIAS_LARGO[i].toLowerCase())))
    }
    case 'quincenal': return `Cada 2 semanas, los ${plural(dia)}`
    case 'mensual':
      if (ordinal === -1) return `El último ${dia} de cada mes`
      if (ordinal) return `El ${ORDINALES[ordinal]} ${dia} de cada mes`
      return `Todos los meses, el día ${d.getDate()}`
    case 'anual': return `Todos los años, el ${d.getDate()}/${d.getMonth() + 1}`
    default: return 'Se repite'
  }
}

/** En qué semana del mes cae la fecha (1–5) y si es el último de ese día de semana. */
export function ordinalEnMes(fecha: string) {
  const d = parse(fecha)
  const n = Math.ceil(d.getDate() / 7)
  const ultimo = d.getDate() + 7 > new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  return { n, esUltimo: ultimo }
}

/** El `ordinal`-ésimo `dow` (0 = lunes) del mes; ordinal -1 = el último. */
function enesimoDiaSemana(anio: number, mes: number, dow: number, ordinal: number): string | null {
  if (ordinal === -1) {
    const ult = toDateStr(anio, mes, new Date(anio, mes, 0).getDate())
    return addDays(ult, -((dowLunes(ult) - dow + 7) % 7))
  }
  const primero = toDateStr(anio, mes, 1)
  const f = addDays(primero, (dow - dowLunes(primero) + 7) % 7 + (ordinal - 1) * 7)
  return Number(f.slice(5, 7)) === mes ? f : null
}

/**
 * Fechas en que cae un evento recurrente dentro de [desde, hasta].
 * Antes `recurrente`/`frecuencia` se guardaban y nadie los procesaba: un
 * evento "semanal" aparecía una sola vez, el día que se creó (CALENDARIO-PLAN
 * §1 bug 1). Se expande en el cliente sobre el rango pedido — no se
 * pre-generan filas. `hastaRecurrencia` (fecha_fin del evento) corta la serie.
 * Mensual: mismo número de día; si el mes no lo tiene (31 en abril), ese mes
 * se saltea, igual que Google Calendar.
 */
export function ocurrencias(
  inicio: string,
  frecuencia: string | null,
  desde: string,
  hasta: string,
  hastaRecurrencia?: string | null,
): string[] {
  const fin = hastaRecurrencia && hastaRecurrencia < hasta ? hastaRecurrencia : hasta
  if (fin < inicio) return []
  const out: string[] = []
  const { tipo: f, dias, ordinal } = parseFrecuencia(frecuencia)
  if (f === 'semanal' && dias) {
    // Varios días por semana: se recorre el rango y se toman esos días.
    const desdeReal = desde > inicio ? desde : inicio
    for (let fecha = desdeReal; fecha <= fin; fecha = addDays(fecha, 1)) {
      if (dias.includes(dowLunes(fecha))) out.push(fecha)
    }
    return out
  }
  if (f === 'mensual' && ordinal) {
    const dow = dowLunes(inicio)
    const dd = parse(desde > inicio ? desde : inicio)
    let y = dd.getFullYear(), m = dd.getMonth() + 1
    for (let guard = 0; guard < 400; guard++) {
      if (toDateStr(y, m, 1) > fin) break
      const fecha = enesimoDiaSemana(y, m, dow, ordinal)
      if (fecha && fecha >= desde && fecha >= inicio && fecha <= fin) out.push(fecha)
      m++; if (m > 12) { m = 1; y++ }
    }
    return out
  }
  if (f === 'diaria' || f === 'semanal' || f === 'quincenal') {
    const paso = f === 'diaria' ? 1 : f === 'semanal' ? 7 : 14
    // Saltar directo a la primera ocurrencia >= desde
    let k = Math.max(0, Math.ceil(diffDays(inicio, desde) / paso))
    for (let fecha = addDays(inicio, k * paso); fecha <= fin; k++, fecha = addDays(inicio, k * paso)) {
      if (fecha >= desde) out.push(fecha)
    }
    return out
  }
  const d0 = parse(inicio)
  const dia = d0.getDate()
  if (f === 'mensual') {
    const dd = parse(desde)
    let y = dd.getFullYear(), m = dd.getMonth() + 1
    if (toDateStr(y, m, 1) < toDateStr(d0.getFullYear(), d0.getMonth() + 1, 1)) {
      y = d0.getFullYear(); m = d0.getMonth() + 1
    }
    for (let guard = 0; guard < 400; guard++) {
      const diasMes = new Date(y, m, 0).getDate()
      if (dia <= diasMes) {
        const fecha = toDateStr(y, m, dia)
        if (fecha > fin) break
        if (fecha >= desde && fecha >= inicio) out.push(fecha)
      } else if (toDateStr(y, m, 1) > fin) break
      m++; if (m > 12) { m = 1; y++ }
    }
    return out
  }
  if (f === 'anual') {
    const mes = d0.getMonth() + 1
    for (let y = Math.max(d0.getFullYear(), parse(desde).getFullYear()); y <= parse(fin).getFullYear(); y++) {
      if (dia > new Date(y, mes, 0).getDate()) continue
      const fecha = toDateStr(y, mes, dia)
      if (fecha >= desde && fecha <= fin && fecha >= inicio) out.push(fecha)
    }
    return out
  }
  return inicio >= desde && inicio <= fin ? [inicio] : []
}
