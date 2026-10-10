'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRestauranteId } from './useRestauranteId'
import { tieneCarga } from '@/lib/reservas/helpers'
import { ocurrencias, rango as rangoFechas, addDays, hoy as hoyFecha } from '@/lib/calendario/fechas'
import { feriadosEnRango } from '@/lib/calendario/feriados'
import { CAPA_POR_ID, type CapaId } from '@/lib/calendario/capas'
import { TIPO_CONFIG, TODO_EL_DIA, type TipoEvento } from '@/lib/calendario/tipos'

// Re-export: la pantalla y el Dashboard los importan desde acá.
export { TIPO_CONFIG, TODO_EL_DIA, type TipoEvento }

/* ─── Types ─── */

export interface EventoCalendario {
  id: string
  titulo: string
  descripcion: string | null
  tipo: TipoEvento
  fecha_inicio: string          // 'YYYY-MM-DD'
  /** Evento de un solo día: null. Varios días: último día. Recurrente: fin de la serie. */
  fecha_fin: string | null
  hora_inicio: string           // 'HH:MM:SS'
  hora_fin: string              // 'HH:MM:SS'
  recurrente: boolean
  frecuencia: string | null
  color: string | null
  proveedor_id: string | null
  usuario_id: string | null
  restaurante_id: string
  created_at: string
  /** auth.uid() de quien lo creó (lo pone la base). NULL en eventos viejos. */
  creado_por?: string | null
  /** Solo lo ve quien lo creó (RLS). */
  privado?: boolean
  /* flag for auto-generated pedido events */
  _fromPedido?: boolean
  /* flag for auto-generated menú-activado events */
  _fromMenu?: boolean
  /* flag for auto-generated reservas-del-día events (PLAN-4-CAPAS B9) */
  _fromReserva?: boolean
}

/**
 * Lo que pinta la pantalla: un evento propio (o una ocurrencia de uno
 * recurrente) o un reflejo de solo lectura de otro módulo.
 */
export interface ItemCalendario extends EventoCalendario {
  capa: CapaId
  /** Primer y último día que ocupa en la grilla (multi-día = barra). */
  dia: string
  diaFin: string
  todoElDia: boolean
  /** Reflejo de otro módulo — no se edita acá. */
  soloLectura: boolean
  /** Destino dentro de la app para ver/editar el dato de origen. */
  href?: string
  hrefLabel?: string
  /** Id de la fila en `eventos` (las ocurrencias de una serie comparten este id). */
  serieId?: string
  /** Detalle extra de un reflejo (monto, pax...). */
  meta?: string
}

export interface Proveedor {
  id: string
  nombre: string
  restaurante_id: string
}

export interface NotaItemCalendario {
  id: string
  restaurante_id: string
  fecha: string          // 'YYYY-MM-DD'
  texto: string
  orden: number
  plaza: string | null
  tarea_id: string | null
  created_at: string
}

interface PedidoRow {
  id: string
  proveedor_nombre: string
  fecha_entrega_esperada: string
  status: string
  restaurante_id: string
}

export function esTodoElDia(ev: Pick<EventoCalendario, 'hora_inicio' | 'hora_fin'>) {
  return (ev.hora_inicio ?? '').startsWith('00:00') && (ev.hora_fin ?? '').startsWith('23:59')
}

const PESO = '$'
/** "$786 mil", "$1,3 M" — el monto tiene que entrar en una píldora de celda. */
const fmtPesosCorto = (n: number) =>
  n >= 1e6 ? PESO + (n / 1e6).toLocaleString('es-AR', { maximumFractionDigits: 1 }) + ' M'
  : n >= 1e3 ? PESO + Math.round(n / 1e3) + ' mil'
  : PESO + Math.round(n)
const fmtPesos = (n: number) => PESO + Math.round(n).toLocaleString('es-AR')

/** Base común de un reflejo de solo lectura (todo el día). */
function reflejo(
  restauranteId: string,
  p: Pick<ItemCalendario, 'id' | 'titulo' | 'capa' | 'dia'> & Partial<ItemCalendario>,
): ItemCalendario {
  return {
    descripcion: null,
    tipo: 'otro',
    fecha_inicio: p.dia,
    fecha_fin: null,
    hora_inicio: TODO_EL_DIA.inicio,
    hora_fin: TODO_EL_DIA.fin,
    recurrente: false,
    frecuencia: null,
    color: CAPA_POR_ID[p.capa].color,
    proveedor_id: null,
    usuario_id: null,
    restaurante_id: restauranteId,
    created_at: '',
    diaFin: p.dia,
    todoElDia: true,
    soloLectura: true,
    ...p,
  }
}

/* ─── Hook ─── */

export function useCalendario({ verPagos = false }: { verPagos?: boolean } = {}) {
  const RESTAURANTE_ID = useRestauranteId()
  const restIdRef = useRef(RESTAURANTE_ID)
  restIdRef.current = RESTAURANTE_ID
  const verPagosRef = useRef(verPagos)
  verPagosRef.current = verPagos
  const [items, setItems] = useState<ItemCalendario[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  // auth uid → nombre, para el "Creado por" del detalle (equipo_miembros:
  // en cuentas reales `perfiles` puede estar vacía).
  const [autores, setAutores] = useState<Record<string, string>>({})
  const [notaItems, setNotaItems] = useState<Record<string, NotaItemCalendario[]>>({})
  // loading = primera carga (skeleton); refreshing = cambio de rango con datos
  // ya en pantalla (no se reemplaza la grilla por "Cargando...").
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = useMemo(() => createClient(), [])
  const cargadoRef = useRef(false)
  // Descarta respuestas viejas si se navega rápido (mes → mes → mes).
  const reqRef = useRef(0)

  /* Fetch de todo lo que cae en [desde, hasta] — el rango visible real (la
     grilla del mes incluye días del mes anterior/siguiente, y la semana
     puede cruzar de mes: antes esos días salían vacíos). */
  const fetchRango = useCallback(async (desde: string, hasta: string) => {
    const rid = restIdRef.current
    if (!rid) { setLoading(false); return }
    const req = ++reqRef.current
    if (cargadoRef.current) setRefreshing(true)
    else setLoading(true)
    setError(null)

    try {
      const [evtsRes, pedRes, prodRes, tareasRes, menusRes, resRes, notasRes, facRes] = await Promise.all([
        // 1. Eventos propios: los que empiezan en el rango, los de varios días
        //    que empezaron antes y siguen, y las series recurrentes vivas.
        supabase.from('eventos').select('*').eq('restaurante_id', rid)
          .or(`and(fecha_inicio.gte.${desde},fecha_inicio.lte.${hasta}),and(recurrente.eq.true,fecha_inicio.lte.${hasta}),and(fecha_inicio.lt.${desde},fecha_fin.gte.${desde})`)
          .order('fecha_inicio', { ascending: true }),
        // 2. Entregas de pedidos
        supabase.from('pedidos').select('id, proveedor_nombre, fecha_entrega_esperada, status, restaurante_id')
          .eq('restaurante_id', rid).gte('fecha_entrega_esperada', desde).lte('fecha_entrega_esperada', hasta),
        // 3. produccion_diaria (OPS Planificación/Menú, legado)
        supabase.from('produccion_diaria').select('fecha, menu_tag')
          .eq('restaurante_id', rid).gte('fecha', desde).lte('fecha', hasta),
        // 4. Tareas de menús activados (los días de preparación reales)
        supabase.from('tareas').select('turno_fecha, menu_id')
          .eq('restaurante_id', rid).not('menu_id', 'is', null).gte('turno_fecha', desde).lte('turno_fecha', hasta),
        // 5. Menús con fecha: vigencia de los fijos (barra de varios días) y
        //    fecha del evento — antes solo se veían si ya tenían tareas.
        supabase.from('menus').select('id, nombre, tipo, activo, fecha_evento, vigencia_desde, vigencia_hasta, pax')
          .eq('restaurante_id', rid).eq('activo', true)
          .or(`and(fecha_evento.gte.${desde},fecha_evento.lte.${hasta}),and(vigencia_desde.lte.${hasta},vigencia_hasta.gte.${desde})`),
        // 6. Reservas (PLAN-4-CAPAS B9)
        supabase.from('reservas').select('fecha, pax, estado')
          .eq('restaurante_id', rid).gte('fecha', desde).lte('fecha', hasta),
        // 7. Notas por día
        supabase.from('calendario_nota_items').select('*')
          .eq('restaurante_id', rid).gte('fecha', desde).lte('fecha', hasta)
          .order('created_at', { ascending: true }),
        // 8. Vencimientos de facturas impagas — solo quien ve plata.
        verPagosRef.current
          ? supabase.from('facturas').select('fecha_vencimiento, total, proveedor_nombre')
              .eq('restaurante_id', rid).neq('status', 'pagada')
              .gte('fecha_vencimiento', desde).lte('fecha_vencimiento', hasta)
          : Promise.resolve({ data: [], error: null }),
      ])
      if (req !== reqRef.current) return
      if (evtsRes.error) throw evtsRes.error
      if (pedRes.error) throw pedRes.error
      if (notasRes.error) throw notasRes.error

      const out: ItemCalendario[] = []

      // 1. Eventos propios (+ ocurrencias de series)
      for (const ev of (evtsRes.data ?? []) as EventoCalendario[]) {
        const todoElDia = esTodoElDia(ev)
        const base = {
          ...ev,
          capa: (ev.tipo === 'entrega_proveedor' ? 'compras' : 'eventos') as CapaId,
          color: ev.color || TIPO_CONFIG[ev.tipo]?.color || TIPO_CONFIG.otro.color,
          todoElDia,
          soloLectura: false,
          serieId: ev.id,
        }
        if (ev.recurrente) {
          for (const f of ocurrencias(ev.fecha_inicio, ev.frecuencia, desde, hasta, ev.fecha_fin)) {
            out.push({ ...base, id: `${ev.id}::${f}`, dia: f, diaFin: f })
          }
        } else {
          const fin = ev.fecha_fin && ev.fecha_fin > ev.fecha_inicio ? ev.fecha_fin : ev.fecha_inicio
          out.push({ ...base, dia: ev.fecha_inicio, diaFin: fin, todoElDia: todoElDia || fin !== ev.fecha_inicio })
        }
      }

      // 2. Entregas de pedidos
      for (const p of (pedRes.data ?? []) as PedidoRow[]) {
        out.push(reflejo(rid, {
          id: `pedido-${p.id}`, capa: 'compras', dia: p.fecha_entrega_esperada,
          titulo: `Entrega de ${p.proveedor_nombre}`, meta: `Pedido ${p.status}`,
          tipo: 'entrega_proveedor', _fromPedido: true,
          href: '/facturas?tab=pedidos', hrefLabel: 'Ver pedido',
        }))
      }

      // 3. produccion_diaria (dedupe fecha+menu_tag)
      const seenProd = new Set<string>()
      for (const row of (prodRes.data ?? [])) {
        const key = `${row.fecha}_${row.menu_tag ?? ''}`
        if (seenProd.has(key)) continue
        seenProd.add(key)
        out.push(reflejo(rid, {
          id: `ops-${key}`, capa: 'menus', dia: row.fecha,
          titulo: row.menu_tag ? `OPS: ${row.menu_tag}` : 'OPS: Menú del día',
          href: '/operaciones?tab=planificacion', hrefLabel: 'Abrir Planificación',
        }))
      }

      // 5. Menús con fecha (un color por capa: fijo vs evento se distinguen por ícono)
      type MenuRow = { id: string; nombre: string; tipo: string; fecha_evento: string | null; vigencia_desde: string | null; vigencia_hasta: string | null; pax: number | null }
      const menusRango = (menusRes.data ?? []) as MenuRow[]
      const menuConVigencia = new Set<string>()
      const fechaEventoDe = new Map<string, string>()
      for (const m of menusRango) {
        if (m.tipo === 'evento' && m.fecha_evento) {
          fechaEventoDe.set(m.id, m.fecha_evento)
          if (m.fecha_evento >= desde && m.fecha_evento <= hasta) {
            out.push(reflejo(rid, {
              id: `menu-evento-${m.id}`, capa: 'menus', dia: m.fecha_evento,
              titulo: m.nombre, meta: m.pax ? `Evento · ${m.pax} pax` : 'Evento',
              tipo: 'reserva_especial', _fromMenu: true,
              href: '/operaciones?tab=planificacion', hrefLabel: 'Abrir Planificación',
            }))
          }
        } else if (m.tipo !== 'evento' && m.vigencia_desde && m.vigencia_hasta) {
          menuConVigencia.add(m.id)
          out.push(reflejo(rid, {
            id: `menu-vig-${m.id}`, capa: 'menus', dia: m.vigencia_desde, diaFin: m.vigencia_hasta,
            fecha_inicio: m.vigencia_desde, fecha_fin: m.vigencia_hasta,
            titulo: m.nombre, meta: 'Menú fijo vigente', _fromMenu: true,
            href: '/carta', hrefLabel: 'Ver en Carta',
          }))
        }
      }

      // 4. Días de preparación de menús activados (tareas.menu_id). Un menú
      //    fijo con vigencia ya se ve como barra; un evento ya tiene su día:
      //    acá solo quedan los días de PREP, rotulados como tales.
      const tareasMenu = (tareasRes.data ?? []) as { turno_fecha: string; menu_id: string }[]
      const idsTareas = [...new Set(tareasMenu.map(t => t.menu_id))]
      const menusPorId = new Map(menusRango.map(m => [m.id, m]))
      const faltan = idsTareas.filter(id => !menusPorId.has(id))
      if (faltan.length > 0) {
        const { data: extra } = await supabase.from('menus').select('id, nombre, tipo, fecha_evento, vigencia_desde, vigencia_hasta, pax').in('id', faltan)
        for (const m of (extra ?? []) as MenuRow[]) {
          menusPorId.set(m.id, m)
          if (m.fecha_evento) fechaEventoDe.set(m.id, m.fecha_evento)
        }
      }
      if (req !== reqRef.current) return
      const seenMenuDia = new Set<string>()
      for (const t of tareasMenu) {
        const key = `${t.menu_id}_${t.turno_fecha}`
        if (seenMenuDia.has(key)) continue
        seenMenuDia.add(key)
        const m = menusPorId.get(t.menu_id)
        if (!m || menuConVigencia.has(m.id)) continue
        if (fechaEventoDe.get(m.id) === t.turno_fecha) continue
        const esEvento = m.tipo === 'evento'
        out.push(reflejo(rid, {
          id: `menu-${m.id}-${t.turno_fecha}`, capa: 'menus', dia: t.turno_fecha,
          titulo: esEvento ? `Prep: ${m.nombre}` : `Menú: ${m.nombre}`,
          meta: esEvento ? 'Día de preparación del evento' : 'Activado en Producción',
          _fromMenu: true,
          href: '/operaciones?tab=planificacion', hrefLabel: 'Abrir Planificación',
        }))
      }

      // 6. Reservas: un resumen por día (no una por reserva)
      const porFecha = new Map<string, { count: number; pax: number }>()
      for (const row of (resRes.data ?? [])) {
        if (!tieneCarga(row.estado)) continue
        const acc = porFecha.get(row.fecha) ?? { count: 0, pax: 0 }
        acc.count += 1
        acc.pax += row.pax as number
        porFecha.set(row.fecha, acc)
      }
      for (const [fecha, { count, pax }] of porFecha) {
        out.push(reflejo(rid, {
          id: `reservas-${fecha}`, capa: 'reservas', dia: fecha, tipo: 'reservas_dia',
          titulo: `${count} reserva${count > 1 ? 's' : ''} · ${pax} cubiertos`,
          _fromReserva: true, href: '/reservas', hrefLabel: 'Ver reservas',
        }))
      }

      // 8. Pagos: un resumen por día de vencimiento. El monto va primero (es
      //    lo que tiene que entrar en la píldora); lo impago de días pasados
      //    se marca "Vencido".
      const hoyStr = hoyFecha()
      const pagos = new Map<string, { n: number; total: number; provs: Set<string> }>()
      for (const f of (facRes.data ?? []) as { fecha_vencimiento: string; total: number | null; proveedor_nombre: string | null }[]) {
        const acc = pagos.get(f.fecha_vencimiento) ?? { n: 0, total: 0, provs: new Set<string>() }
        acc.n += 1
        acc.total += Number(f.total ?? 0)
        if (f.proveedor_nombre) acc.provs.add(f.proveedor_nombre)
        pagos.set(f.fecha_vencimiento, acc)
      }
      for (const [fecha, { n, total, provs }] of pagos) {
        const lista = [...provs]
        out.push(reflejo(rid, {
          id: `pagos-${fecha}`, capa: 'pagos', dia: fecha,
          titulo: `${fecha < hoyStr ? 'Vencido' : 'Pagar'} ${fmtPesosCorto(total)}`,
          meta: `${n} factura${n > 1 ? 's' : ''} · ${fmtPesos(total)} · `
            + lista.slice(0, 4).join(', ') + (lista.length > 4 ? ` y ${lista.length - 4} más` : ''),
          href: '/facturas?tab=facturas', hrefLabel: 'Ver facturas',
        }))
      }

      // 9. Feriados
      for (const f of feriadosEnRango(desde, hasta)) {
        out.push(reflejo(rid, {
          id: `feriado-${f.fecha}`, capa: 'feriados', dia: f.fecha,
          titulo: f.nombre, meta: f.turistico ? 'Día no laborable con fines turísticos' : 'Feriado nacional',
        }))
      }

      setItems(out)

      // Notas: se re-inicializan TODOS los días del rango (no solo los que
      // trajeron filas) para que un día que quedó vacío no arrastre lo viejo.
      const notas: Record<string, NotaItemCalendario[]> = {}
      for (const f of rangoFechas(desde, hasta)) notas[f] = []
      for (const it of (notasRes.data ?? []) as NotaItemCalendario[]) {
        if (!notas[it.fecha]) notas[it.fecha] = []
        notas[it.fecha].push(it)
      }
      setNotaItems(prev => ({ ...prev, ...notas }))
      cargadoRef.current = true
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al cargar el calendario'
      console.error('[useCalendario] fetchRango Error:', msg)
      if (req === reqRef.current) setError(msg)
    } finally {
      if (req === reqRef.current) { setLoading(false); setRefreshing(false) }
    }
  }, [supabase])

  /* Agrega un ítem de nota (una línea) al final del día */
  const agregarNotaItem = useCallback(async (fecha: string, texto: string) => {
    if (!restIdRef.current || !texto.trim()) return
    try {
      // El orden de la lista lo da created_at (server-side, sin ambigüedad),
      // no un contador calculado en el cliente — dos ítems agregados en
      // rápida sucesión podían pisarse el mismo índice.
      const { data, error } = await supabase
        .from('calendario_nota_items')
        .insert({ restaurante_id: restIdRef.current, fecha, texto: texto.trim() })
        .select('*')
        .single()
      if (error) throw error
      setNotaItems(prev => ({ ...prev, [fecha]: [...(prev[fecha] ?? []), data as NotaItemCalendario] }))
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al agregar el ítem'
      console.error('[useCalendario] agregarNotaItem Error:', msg)
      throw new Error(msg)
    }
  }, [supabase])

  const eliminarNotaItem = useCallback(async (id: string, fecha: string) => {
    try {
      setNotaItems(prev => ({ ...prev, [fecha]: (prev[fecha] ?? []).filter(it => it.id !== id) }))
      const { error } = await supabase.from('calendario_nota_items').delete().eq('id', id)
      if (error) throw error
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al eliminar el ítem'
      console.error('[useCalendario] eliminarNotaItem Error:', msg)
    }
  }, [supabase])

  /* Marca el ítem con la plaza elegida + la tarea de Producción que se creó a partir de él */
  const asignarPlazaNotaItem = useCallback(async (id: string, fecha: string, plaza: string, tareaId: string) => {
    try {
      setNotaItems(prev => ({
        ...prev,
        [fecha]: (prev[fecha] ?? []).map(it => it.id === id ? { ...it, plaza, tarea_id: tareaId } : it),
      }))
      const { error } = await supabase.from('calendario_nota_items').update({ plaza, tarea_id: tareaId }).eq('id', id)
      if (error) throw error
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al enviar el ítem a Producción'
      console.error('[useCalendario] asignarPlazaNotaItem Error:', msg)
      throw new Error(msg)
    }
  }, [supabase])

  /* CRUD — devuelven el id para poder deshacer. creado_por no se manda: lo pone la base. */
  type EventoInput = Omit<EventoCalendario, 'id' | 'created_at' | 'restaurante_id' | 'creado_por' | '_fromPedido' | '_fromMenu' | '_fromReserva'>

  const crearEvento = useCallback(async (datos: EventoInput): Promise<string> => {
    const { data, error } = await supabase.from('eventos')
      .insert({ ...datos, restaurante_id: restIdRef.current })
      .select('id').single()
    if (error) {
      console.error('[useCalendario] crearEvento Error:', error.message)
      throw new Error(error.message)
    }
    return data.id as string
  }, [supabase])

  const actualizarEvento = useCallback(async (id: string, datos: Partial<EventoInput>) => {
    // Optimista: mover/editar se ve al instante; si falla, el refetch corrige.
    setItems(prev => prev.map(it => {
      if (it.serieId !== id || it.recurrente) return it
      const next = { ...it, ...datos } as ItemCalendario
      if (datos.fecha_inicio) {
        next.dia = datos.fecha_inicio
        next.diaFin = datos.fecha_fin && datos.fecha_fin > datos.fecha_inicio ? datos.fecha_fin : datos.fecha_inicio
      }
      return next
    }))
    const { error } = await supabase.from('eventos').update(datos).eq('id', id)
    if (error) {
      console.error('[useCalendario] actualizarEvento Error:', error.message)
      throw new Error(error.message)
    }
  }, [supabase])

  const eliminarEvento = useCallback(async (id: string) => {
    setItems(prev => prev.filter(it => it.serieId !== id))
    const { error } = await supabase.from('eventos').delete().eq('id', id)
    if (error) {
      console.error('[useCalendario] eliminarEvento Error:', error.message)
      throw new Error(error.message)
    }
  }, [supabase])

  const fetchAutores = useCallback(async () => {
    if (!restIdRef.current) return
    const { data } = await supabase.from('equipo_miembros')
      .select('auth_user_id, nombre, apellido')
      .eq('restaurante_id', restIdRef.current)
      .not('auth_user_id', 'is', null)
    const map: Record<string, string> = {}
    for (const m of (data ?? []) as { auth_user_id: string; nombre: string | null; apellido: string | null }[]) {
      const n = [m.nombre, m.apellido].filter(Boolean).join(' ').trim()
      if (n) map[m.auth_user_id] = n
    }
    setAutores(map)
  }, [supabase])

  /* Proveedores */
  const fetchProveedores = useCallback(async () => {
    if (!restIdRef.current) return
    try {
      const { data, error } = await supabase
        .from('proveedores')
        .select('id, nombre, restaurante_id')
        .eq('restaurante_id', restIdRef.current)
        .order('nombre')
      if (error) throw error
      setProveedores((data ?? []) as Proveedor[])
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al cargar proveedores'
      console.error('[useCalendario] fetchProveedores Error:', msg)
    }
  }, [supabase])

  /* Rango actualmente pedido por la pantalla — el realtime refetchea ESE
     rango, no "hoy". */
  const rangoRef = useRef<{ desde: string; hasta: string } | null>(null)
  const fetchRangoTracked = useCallback(async (desde: string, hasta: string) => {
    rangoRef.current = { desde, hasta }
    await fetchRango(desde, hasta)
  }, [fetchRango])

  const refetch = useCallback(() => {
    const r = rangoRef.current
    if (r) return fetchRango(r.desde, r.hasta)
  }, [fetchRango])

  /* Proveedores + Realtime. El primer fetch de items lo dispara la pantalla
     (es la que sabe qué rango mira) — antes el hook pedía "el mes de hoy" al
     montar y la pantalla lo volvía a pedir: dos fetch iguales por visita. */
  useEffect(() => {
    if (!RESTAURANTE_ID) return
    fetchProveedores()
    fetchAutores()

    const ch = supabase
      .channel('eventos-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'eventos', filter: `restaurante_id=eq.${RESTAURANTE_ID}` }, () => {
        const r = rangoRef.current
        if (r) fetchRango(r.desde, r.hasta)
      })
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [RESTAURANTE_ID, supabase, fetchProveedores, fetchAutores, fetchRango])

  return {
    items,
    proveedores,
    autores,
    notaItems,
    loading,
    refreshing,
    error,
    fetchRango: fetchRangoTracked,
    refetch,
    crearEvento,
    actualizarEvento,
    eliminarEvento,
    agregarNotaItem,
    eliminarNotaItem,
    asignarPlazaNotaItem,
  }
}

/** Ítems ordenados para mostrar en un día: todo-el-día primero (feriado arriba), después por hora. */
export function ordenarItemsDia(lista: ItemCalendario[]) {
  const peso = (it: ItemCalendario) => it.capa === 'feriados' ? 0 : it.todoElDia ? 1 : 2
  return [...lista].sort((a, b) =>
    peso(a) - peso(b) || a.hora_inicio.localeCompare(b.hora_inicio) || a.titulo.localeCompare(b.titulo))
}

/** Índice fecha → ítems que tocan ese día (un multi-día aparece en cada uno). */
export function indexarPorDia(lista: ItemCalendario[]) {
  const map: Record<string, ItemCalendario[]> = {}
  for (const it of lista) {
    for (let f = it.dia; f <= it.diaFin; f = addDays(f, 1)) {
      ;(map[f] ??= []).push(it)
    }
  }
  return map
}
