import type { SupabaseClient } from '@supabase/supabase-js'
import type { MenuConPreparaciones } from '@/lib/hooks/useMenus'
import { hoyOperativo, sumarDias } from '@/lib/ops/turnos'

export interface ActivarMenuResultado {
  totalTareas: number
  diasActivados: number
  diasYaActivos: number
}

/**
 * Crea en `tareas` las preparaciones de un menú para cada fecha dada.
 * Dedupe por título dentro de (menu_id, turno_fecha); si ninguna preparación
 * es nueva ese día, cuenta como "ya activo" y no inserta nada.
 * Carryover: solo si el lote incluye el día real de hoy, borra lo pendiente
 * (no 'listo') de ayer para ese mismo menú — evita duplicados en el mise.
 * Usado tanto desde Planificación (un día o varios sueltos) como desde el
 * Calendario (un rango contiguo) — misma lógica, mismo dedupe.
 */
export async function activarMenuParaFechas(
  supabase: SupabaseClient,
  restauranteId: string,
  menu: MenuConPreparaciones,
  fechas: string[],
): Promise<ActivarMenuResultado> {
  const modoDestino = menu.tipo === 'evento' ? 'evento' : 'menu'
  const hoyReal = hoyOperativo()
  let totalTareas = 0, diasActivados = 0, diasYaActivos = 0

  for (const f of fechas) {
    const { data: previasDelDia } = await supabase.from('tareas')
      .select('id, titulo')
      .eq('restaurante_id', restauranteId).eq('menu_id', menu.id).eq('turno_fecha', f)
    const existentesHoy = new Set((previasDelDia ?? []).map((t: { titulo: string }) => t.titulo.trim().toLowerCase()))

    if (f === hoyReal) {
      const prevDay = sumarDias(f, -1)
      const { data: previasAyer } = await supabase.from('tareas')
        .select('id, estado')
        .eq('restaurante_id', restauranteId).eq('menu_id', menu.id).eq('turno_fecha', prevDay)
      const idsAyerABorrar = (previasAyer ?? []).filter((t: { estado: string | null }) => t.estado !== 'listo').map((t: { id: string }) => t.id)
      if (idsAyerABorrar.length > 0) {
        await supabase.from('tareas').delete().in('id', idsAyerABorrar)
      }
    }

    const preparacionesNuevas = menu.preparaciones
      .map((p, i) => ({ p, orden: i }))
      .filter(({ p }) => !existentesHoy.has(p.nombre.trim().toLowerCase()))
    if (preparacionesNuevas.length === 0) { diasYaActivos++; continue }

    const rows = preparacionesNuevas.map(({ p, orden: i }) => ({
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
      turno_fecha: f,
      menu_id: menu.id,
      orden: i,
      restaurante_id: restauranteId,
    }))
    const { error } = await supabase.from('tareas').insert(rows)
    if (error) throw error
    totalTareas += rows.length
    diasActivados++
  }

  return { totalTareas, diasActivados, diasYaActivos }
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
