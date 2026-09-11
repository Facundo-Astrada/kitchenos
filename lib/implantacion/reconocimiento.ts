/**
 * La resta que convierte fotos del progreso en "esta semana el equipo dejó N
 * funciones funcionando solas".
 *
 * El reconocimiento es semanal y no diario por una razón medida (ver la
 * cabecera de `avisos.ts`): quien lo recibe a diario puntúa 12% más bajo en
 * confianza en la dirección. Así que no alcanza con mirar el número de hoy —
 * hace falta el de hace una semana, y de ahí las fotos de
 * `implantacion_progreso`.
 */

export interface FotoProgreso {
  /** `YYYY-MM-DD`. */
  fecha: string
  insertadas: number
  total: number
  pct: number
}

export interface AvanceSemanal {
  insertadasEstaSemana: number
  pct: number
  /** La foto contra la que se comparó — para poder explicar el número. */
  desde: FotoProgreso
  hasta: FotoProgreso
}

const DIAS_VENTANA = 7

function restarDias(d: Date, dias: number): string {
  const x = new Date(d)
  x.setDate(x.getDate() - dias)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

/**
 * @param fotos en cualquier orden; se ordenan acá.
 * @returns `null` cuando no hay con qué comparar.
 *
 * Devolver `null` en la primera semana es la regla más importante de este
 * archivo: sin foto de referencia, TODO el progreso acumulado del restaurante
 * parecería haber pasado esta semana, y el primer aviso que recibe un equipo
 * sería "dejaron 24 funciones funcionando solas" el día que instalaron la app.
 * Un elogio que el equipo sabe falso quema el canal entero.
 */
export function avanceSemanal(fotos: FotoProgreso[], hoy = new Date()): AvanceSemanal | null {
  if (fotos.length < 2) return null

  const orden = [...fotos].sort((a, b) => b.fecha.localeCompare(a.fecha))
  const hasta = orden[0]

  // La referencia: la foto más reciente que ya tenga al menos una semana. Si el
  // equipo dejó de abrir la app y la única foto vieja es de hace un mes, se
  // compara contra esa — el reconocimiento sigue siendo honesto ("desde la
  // última vez que miramos"), solo que la ventana es más ancha.
  const corte = restarDias(hoy, DIAS_VENTANA)
  const desde = orden.find(f => f.fecha <= corte)
  if (!desde) return null

  // Clamp: el progreso puede BAJAR (se desconfirma un checkpoint manual, se
  // borran datos). Eso no es motivo de reconocimiento, pero tampoco de reproche
  // automático — se calla.
  const insertadasEstaSemana = Math.max(0, hasta.insertadas - desde.insertadas)

  return { insertadasEstaSemana, pct: hasta.pct, desde, hasta }
}
