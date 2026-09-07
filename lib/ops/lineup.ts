/**
 * La ficha de line-up — lo que se lee en voz alta antes de abrir el servicio.
 *
 * Ver `PLAN-IMPLANTACION-2026-09.md` § 5.4. El fundamento no es de producto,
 * es de formación de hábito: las capacitaciones transfieren ~10% al puesto y
 * casi nada sobrevive seis meses; lo que sí pega es meter el uso dentro de un
 * ritual de equipo QUE YA EXISTE, con un par de minutos de salida visible.
 * En gastronomía ese ritual existe desde antes del software — el line-up
 * previo al servicio, 5-15 minutos, hora y lugar fijos, todo el turno presente.
 *
 * Por eso esto no es "otra pantalla": es el estímulo en el momento exacto de la
 * acción. Y alcanza también al que nunca abre la app, porque alguien la lee en
 * voz alta.
 *
 * Hermano de `textoPase.ts`, que hace lo mismo al CERRAR. Mismo principio
 * (DECISIONES.md § 24): capturar lo que el equipo ya se dice, en el origen.
 *
 * Este archivo es puro — no toca Supabase. Los datos los junta
 * `lib/hooks/useLineUp.ts`, así el orden y el criterio de qué entra se pueden
 * testear sin una base de datos.
 */

export interface ItemPendiente {
  /** Nombre visible de la plaza, ya resuelto con plazaLabel(). */
  plaza: string
  texto: string
  /** SP / P / REF / CHK — los códigos del mise, los que el cocinero usa. */
  codigo: string
}

export interface NotaLineUp {
  plaza: string
  texto: string
  autor?: string | null
}

export interface EventoLineUp {
  titulo: string
  hora?: string | null
  /** true si es hoy; false si es un aviso anticipado (mañana, el finde). */
  esHoy: boolean
}

export interface DatosLineUp {
  turnoNombre: string
  jornada: string            // YYYY-MM-DD
  /** Cuántos trabajan el turno y quién falta, si se sabe. */
  equipo?: { presentes: number; ausentes: string[] } | null
  /** Platos marcados no disponibles. Lo primero que el salón necesita saber. */
  ochentaySeis: string[]
  /** Lo que quedó del turno anterior, ya ordenado por prioridad. */
  pendientes: ItemPendiente[]
  /** Notas de plaza sin leer del turno anterior. */
  notas: NotaLineUp[]
  /** Eventos y reservas grandes de hoy (y avisos de mañana). */
  eventos: EventoLineUp[]
  /** Menú o evento vigente en el mise. */
  menuVigente?: string | null
  /** Productos por debajo del mínimo — lo que puede cortar el servicio. */
  faltantes: string[]
  /** El foco del día, escrito a mano por quien abre. Una sola cosa. */
  foco?: string | null
}

/** Un line-up de más de esto deja de ser un line-up y pasa a ser una reunión. */
export const MAX_ITEMS_POR_BLOQUE = 6

/**
 * Recorta cada bloque para que la ficha se lea en ~2 minutos.
 *
 * No es cosmética: la evidencia sobre el line-up dice 5-15 minutos para TODO el
 * briefing, del que la app es una parte. Una lista de 30 pendientes no se lee —
 * se saltea, y con ella se saltea la ficha entera. Lo que no entra sigue en su
 * pantalla, que es donde se trabaja.
 */
export function recortarLineUp(d: DatosLineUp): DatosLineUp {
  return {
    ...d,
    ochentaySeis: d.ochentaySeis.slice(0, MAX_ITEMS_POR_BLOQUE * 2), // el 86 se lee rápido
    pendientes: d.pendientes.slice(0, MAX_ITEMS_POR_BLOQUE),
    notas: d.notas.slice(0, MAX_ITEMS_POR_BLOQUE),
    eventos: d.eventos.slice(0, MAX_ITEMS_POR_BLOQUE),
    faltantes: d.faltantes.slice(0, MAX_ITEMS_POR_BLOQUE),
  }
}

/** true si hay algo que decir. Sin esto la ficha se ofrece vacía y se quema. */
export function lineUpTieneContenido(d: DatosLineUp): boolean {
  return (
    d.ochentaySeis.length > 0 || d.pendientes.length > 0 || d.notas.length > 0 ||
    d.eventos.length > 0 || d.faltantes.length > 0 ||
    !!d.menuVigente || !!(d.foco && d.foco.trim())
  )
}

function fmtFecha(jornada: string): string {
  const [y, m, dd] = jornada.split('-').map(Number)
  if (!y || !m || !dd) return jornada
  return new Date(y, m - 1, dd).toLocaleDateString('es-AR', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
}

/**
 * El mismo contenido como texto plano, para compartir por WhatsApp al que no
 * llegó al line-up. Espejo de `construirTextoPase()`: un solo lugar arma el
 * formato para que no se bifurque entre pantalla y mensaje.
 */
export function construirTextoLineUp(datos: DatosLineUp): string {
  const d = recortarLineUp(datos)
  const bloques: string[] = []

  bloques.push(`*Line-up ${d.turnoNombre}* — ${fmtFecha(d.jornada)}`)

  if (d.equipo) {
    const linea = [`Somos ${d.equipo.presentes}`]
    if (d.equipo.ausentes.length > 0) linea.push(`falta ${d.equipo.ausentes.join(', ')}`)
    bloques.push(linea.join(' · '))
  }

  if (d.ochentaySeis.length > 0) {
    bloques.push(`*86 — no ofrecer*\n${d.ochentaySeis.map(x => `· ${x}`).join('\n')}`)
  }

  if (d.menuVigente) bloques.push(`*En el mise:* ${d.menuVigente}`)

  if (d.pendientes.length > 0) {
    bloques.push(`*Del turno anterior*\n${
      d.pendientes.map(p => `· [${p.codigo}] ${p.texto} (${p.plaza})`).join('\n')
    }`)
  }

  if (d.notas.length > 0) {
    bloques.push(`*Notas de plaza*\n${
      d.notas.map(n => `· ${n.plaza}: ${n.texto}${n.autor ? ` — ${n.autor}` : ''}`).join('\n')
    }`)
  }

  if (d.eventos.length > 0) {
    bloques.push(`*Atención hoy*\n${
      d.eventos.map(e => `· ${e.hora ? `${e.hora} ` : ''}${e.titulo}${e.esHoy ? '' : ' (próximo)'}`).join('\n')
    }`)
  }

  if (d.faltantes.length > 0) {
    bloques.push(`*Bajo mínimo*\n${d.faltantes.map(f => `· ${f}`).join('\n')}`)
  }

  if (d.foco && d.foco.trim()) bloques.push(`*Foco del turno:* ${d.foco.trim()}`)

  return bloques.join('\n\n')
}
