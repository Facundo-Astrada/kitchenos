import type { SupabaseClient } from '@supabase/supabase-js'
import type { MenuTipo, PrepPrioridad, PrepTipo } from '@/lib/hooks/useMenus'
import { hoyOperativo, sumarDias } from '@/lib/ops/turnos'

// Subconjunto real de MenuConPreparaciones que esta función lee — permite
// activar un menú/evento recién creado (page.tsx, "activar producción" al
// guardar un evento con fecha) sin tener que armar el objeto completo con
// campos que no importan acá (restaurante_id, activo, enMise...).
interface PreparacionParaActivar {
  nombre: string
  prioridad: PrepPrioridad
  paso: string
  plaza: string | null
  usuario_asignado: string | null
  tipo: PrepTipo
  ref_id: string | null
  cantidad?: number | null
  nota?: string | null
  /** Anticipación en días respecto del día en que se sirve (ver fechaProduccion). */
  dias_antes?: number | null
}
interface MenuParaActivar {
  id: string
  tipo: MenuTipo
  nombre: string
  preparaciones: PreparacionParaActivar[]
}

export interface ActivarMenuResultado {
  totalTareas: number
  /** Días de PRODUCCIÓN que recibieron al menos una tarea nueva. */
  diasActivados: number
  /** Días servidos en los que no hubo nada nuevo que crear. */
  diasYaActivos: number
}

/**
 * En qué día se cocina una preparación que se sirve el `fechaServicio`.
 * `dias_antes` = 0 (el default) → el mismo día; 3 → tres días antes.
 * Negativos se ignoran: nadie produce DESPUÉS de servir.
 */
export function fechaProduccion(fechaServicio: string, diasAntes?: number | null): string {
  const d = Math.max(0, Math.trunc(diasAntes ?? 0))
  return d === 0 ? fechaServicio : sumarDias(fechaServicio, -d)
}

/**
 * Agrupa las preparaciones por el día en que hay que cocinarlas. Exportado
 * aparte de la activación para que la UI pueda mostrar el cronograma ("qué
 * cae cada día") sin tocar la base. Las claves salen ordenadas del más lejano
 * al día del servicio, que es el orden en que se trabaja.
 */
export function cronogramaDeEvento<T extends { dias_antes?: number | null }>(
  fechaServicio: string, preparaciones: readonly T[],
): { fecha: string; preparaciones: T[] }[] {
  const porFecha = new Map<string, T[]>()
  for (const p of preparaciones) {
    const f = fechaProduccion(fechaServicio, p.dias_antes)
    const lista = porFecha.get(f)
    if (lista) lista.push(p)
    else porFecha.set(f, [p])
  }
  return [...porFecha.entries()]
    .sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)
    .map(([fecha, preparaciones]) => ({ fecha, preparaciones }))
}

/**
 * Crea en `tareas` las preparaciones de un menú para cada fecha dada.
 *
 * `fechas` son los días en que el menú SE SIRVE, no los días de trabajo: cada
 * preparación cae en `fecha − dias_antes` (ver fechaProduccion). Un evento del
 * sábado con fondos a 3 días y terminación a 0 se activa pasando solo el
 * sábado, y siembra miércoles y sábado por separado. Con `dias_antes` en 0
 * —el default de la columna— servicio y producción son el mismo día y esto se
 * comporta igual que antes de existir el cronograma.
 *
 * Dedupe por título dentro de (menu_id, día de producción); si ninguna
 * preparación es nueva para un día servido, cuenta como "ya activo".
 *
 * Carryover: solo para MENÚ FIJO, y solo si el lote incluye el día real de hoy
 * —borra lo pendiente (no 'listo') de ayer para ese mismo menú, que se reactiva
 * todos los días y deja ruido. En un EVENTO nunca: lo que quedó pendiente el
 * miércoles es justo el trabajo que tiene que llegar vivo al sábado.
 *
 * Usado tanto desde Planificación (un día o varios sueltos) como desde el
 * Calendario (un rango contiguo) — misma lógica, mismo dedupe.
 */
export async function activarMenuParaFechas(
  supabase: SupabaseClient,
  restauranteId: string,
  menu: MenuParaActivar,
  fechas: string[],
): Promise<ActivarMenuResultado> {
  const modoDestino = menu.tipo === 'evento' ? 'evento' : 'menu'
  const hoyReal = hoyOperativo()
  let totalTareas = 0, diasYaActivos = 0
  // Un mismo día de producción puede recibir trabajo de dos fechas servidas
  // distintas (dos eventos seguidos, o un rango) — se cuenta una sola vez.
  const diasDeProduccionTocados = new Set<string>()

  for (const f of fechas) {
    if (modoDestino === 'menu' && f === hoyReal) {
      const prevDay = sumarDias(f, -1)
      const { data: previasAyer } = await supabase.from('tareas')
        .select('id, estado')
        .eq('restaurante_id', restauranteId).eq('menu_id', menu.id).eq('turno_fecha', prevDay)
      const idsAyerABorrar = (previasAyer ?? []).filter((t: { estado: string | null }) => t.estado !== 'listo').map((t: { id: string }) => t.id)
      if (idsAyerABorrar.length > 0) {
        await supabase.from('tareas').delete().in('id', idsAyerABorrar)
      }
    }

    // El orden original de la preparación dentro del menú se conserva como
    // `orden` de la tarea aunque el cronograma las reparta en días distintos.
    const porDia = cronogramaDeEvento(f, menu.preparaciones.map((p, orden) => ({ p, orden, dias_antes: p.dias_antes })))

    let algoNuevoEsteDia = false
    for (const { fecha: fProd, preparaciones: delDia } of porDia) {
      const { data: previasDelDia } = await supabase.from('tareas')
        .select('id, titulo')
        .eq('restaurante_id', restauranteId).eq('menu_id', menu.id).eq('turno_fecha', fProd)
      const existentes = new Set((previasDelDia ?? []).map((t: { titulo: string }) => t.titulo.trim().toLowerCase()))

      const nuevas = delDia.filter(({ p }) => !existentes.has(p.nombre.trim().toLowerCase()))
      if (nuevas.length === 0) continue

      const rows = nuevas.map(({ p, orden }) => ({
        titulo: p.nombre,
        descripcion: menu.nombre,
        status: 'pendiente',
        estado: 'pendiente',
        prioridad: p.prioridad,
        categoria: 'produccion',
        modo: modoDestino,
        seccion: p.paso || 'general',
        plaza: p.plaza,
        asignado_a: p.usuario_asignado,
        receta_id: p.tipo === 'receta' ? p.ref_id : null,
        cantidad: p.cantidad,
        nota: p.nota ?? null,
        turno_fecha: fProd,
        menu_id: menu.id,
        orden,
        restaurante_id: restauranteId,
      }))
      const { error } = await supabase.from('tareas').insert(rows)
      if (error) throw error
      totalTareas += rows.length
      diasDeProduccionTocados.add(fProd)
      algoNuevoEsteDia = true
    }

    if (!algoNuevoEsteDia) diasYaActivos++
  }

  return { totalTareas, diasActivados: diasDeProduccionTocados.size, diasYaActivos }
}

/**
 * Días que faltan para el día del evento, visto desde `hoy`. Negativo si ya
 * pasó (no debería mostrarse — ver etiquetaCuentaRegresiva — pero se calcula
 * igual para no romper contratos aguas arriba).
 */
export function diasParaEvento(fechaEvento: string, hoy: string = hoyOperativo()): number {
  const msPorDia = 24 * 60 * 60 * 1000
  const a = new Date(fechaEvento + 'T12:00:00').getTime()
  const b = new Date(hoy + 'T12:00:00').getTime()
  return Math.round((a - b) / msPorDia)
}

/**
 * Texto corto para el header de la banda EVENTO ("en 3 días", "mañana",
 * "hoy"). Un evento vencido no debería llegar acá (sin tareas visibles no
 * hay banda), pero por las dudas no dice "hace 2 días" — diría lo mismo
 * que "hoy", que es más útil en el peor caso.
 */
export function etiquetaCuentaRegresiva(dias: number): string {
  if (dias <= 0) return 'hoy'
  if (dias === 1) return 'mañana'
  return `en ${dias} días`
}

/**
 * Qué contar en el toast después de activar. Una sola frase para los tres
 * lugares que activan (Carta al guardar, Planificación y Calendario): con
 * cronograma, "activado para el sábado" ya no describe lo que pasó — el
 * trabajo quedó repartido en varios días y eso es lo que hay que decir.
 */
export function resumenActivacion(res: ActivarMenuResultado): string {
  const t = `${res.totalTareas} ${res.totalTareas === 1 ? 'tarea' : 'tareas'}`
  return res.diasActivados > 1
    ? `${t} repartidas en ${res.diasActivados} días de producción`
    : `${t} en Producción`
}

/** Fechas 'YYYY-MM-DD' entre desde y hasta, inclusive. */
export function rangoFechas(desde: string, hasta: string): string[] {
  const out: string[] = []
  let cur = desde
  let guard = 0
  while (cur <= hasta && guard < 400) {
    out.push(cur)
    cur = sumarDias(cur, 1)
    guard++
  }
  return out
}
