'use client'
/**
 * Las métricas de la ruta de implantación (`lib/implantacion/ruta.ts`).
 *
 * Todo son `count: 'exact', head: true` — no baja una sola fila. Son ~20
 * consultas, pero cada una devuelve un número: es más barato que montar cinco
 * hooks completos, y esta pantalla se abre una vez por día como mucho.
 *
 * `Promise.allSettled` en vez de `all`: si una tabla falla, esa estación queda
 * en 0 y el resto de la ruta se sigue viendo. Un medidor incompleto sirve; una
 * pantalla en blanco no.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { useRestauranteId } from './useRestauranteId'
import { useAuth } from '@/lib/auth/context'
import { fetchCartaItemsData, type CartaItemEnriquecido } from './useCarta'
import { analizarCarta } from '@/lib/recetas/estandarizacion'
import {
  calcularProgreso, type ConfirmacionesManuales, SIN_CONFIRMACIONES,
} from '@/lib/implantacion/progreso'
import type { MetricasRuta } from '@/lib/implantacion/ruta'

const METRICAS_CERO: MetricasRuta = {
  tipoNegocioDefinido: false, facturasTotal: 0, facturasMesActual: 0,
  facturasSemanasSeguidas: 0, recetasConRendimiento: 0, platosConFoodCost: 0,
  areasActivas: 0, areasSinResponsable: 0, puestos: 0, miembros: 0,
  miembrosVinculados: 0, competenciasCargadas: 0, competenciasNivel4: 0,
  cartaItems: 0, cartaSinReceta: 0, cartaSinEstandarizar: 0, margenObjetivoCargado: false,
  proveedores: 0, productos: 0, ingredientesTotal: 0, ingredientesLinkeados: 0, pedidos: 0,
  plazasConMise: 0, turnosConfigurados: false, tareasDespachadas: 0,
  entregasPase: 0, paseDiasSeguidos: 0, registrosHaccp: 0,
  registrosMerma: 0, presupuestoCargado: false, entradasBitacora: 0, mesesConVentas: 0,
  mesas: 0, comandas: 0, clientes: 0, arqueos: 0,
}

interface RespuestaRuta {
  metricas: MetricasRuta
  /** Fecha de alta del restaurante — de ahí sale el día de la implantación. */
  altaISO: string | null
  /**
   * Días transcurridos desde el alta, calculados en el fetcher y no en el
   * render: `Date.now()` dentro de un `useMemo` es una función impura y
   * devuelve algo distinto en cada re-render (regla de pureza de React).
   */
  diasDesdeAlta: number | null
  /** Si el negocio tiene salón, para decidir si el hito 6 entra al denominador. */
  tieneSalon: boolean
}

const ISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * Semanas consecutivas hacia atrás con al menos una factura.
 *
 * Es el checkpoint más importante de la ruta (estación 3.2) y por eso se calcula
 * de verdad y no con un `count > N`: "cargó 40 facturas de golpe una vez" y
 * "carga todas las semanas" son situaciones opuestas que un total no distingue.
 */
export function semanasSeguidasConFactura(fechas: string[], hoy = new Date()): number {
  if (fechas.length === 0) return 0
  const set = new Set(fechas)
  let semanas = 0
  for (let s = 0; s < 52; s++) {
    const desde = new Date(hoy); desde.setDate(desde.getDate() - (s + 1) * 7)
    const hasta = new Date(hoy); hasta.setDate(hasta.getDate() - s * 7)
    const hayEnLaSemana = [...set].some(f => f > ISO(desde) && f <= ISO(hasta))
    if (!hayEnLaSemana) break
    semanas++
  }
  return semanas
}

async function fetchRuta(key: string): Promise<RespuestaRuta> {
  const rid = key.slice('ruta-'.length)
  const sb = createClient()
  const hoy = new Date()
  const inicioMes = ISO(new Date(hoy.getFullYear(), hoy.getMonth(), 1))
  const hace90 = new Date(hoy); hace90.setDate(hace90.getDate() - 90)

  const cuenta = (t: string) =>
    sb.from(t).select('*', { count: 'exact', head: true }).eq('restaurante_id', rid)

  // Estación 2.3 ("Estandarizar") necesita el árbol completo de la carta
  // (componentes + gramaje + costos) para saber de verdad qué platos llegan
  // a N3 — un count no alcanza, el nivel es un mínimo sobre varios ejes (ver
  // lib/recetas/estandarizacion.ts). Es la única consulta de este fetcher que
  // no es un count/select liviano; se corre en paralelo al resto y no rompe
  // la ruta si falla (misma lógica de degradación que el resto: 0 en esa
  // estación, no pantalla en blanco).
  const cartaTreePromise = fetchCartaItemsData(`carta-items-${rid}`).catch(() => [] as CartaItemEnriquecido[])

  const r = await Promise.allSettled([
    // Ojo: `restaurantes` NO tiene columna `tipo` (verificado contra el schema
    // el 11/09). Pedirla hacía que TODA esta fila devolviera 400, con lo cual
    // `rest` quedaba null para cualquier cuenta y se perdía `created_at` —
    // o sea, el contador "Día N de la implantación" nunca se mostró. El tipo de
    // negocio vive en `configuracion`, no en una columna propia.
    sb.from('restaurantes').select('created_at, configuracion').eq('id', rid).maybeSingle(),
    cuenta('facturas'),
    cuenta('facturas').gte('fecha_factura', inicioMes),
    sb.from('facturas').select('fecha_factura').eq('restaurante_id', rid).gte('fecha_factura', ISO(hace90)),
    cuenta('recetas').gt('porciones', 0).eq('activa', true),
    cuenta('carta_items'),
    cuenta('carta_items').is('receta_id', null),
    cuenta('areas').eq('activa', true),
    sb.from('area_capas').select('area_key, capa, responsables').eq('restaurante_id', rid),
    cuenta('puestos'),
    cuenta('equipo_miembros').eq('activo', true),
    cuenta('equipo_miembros').eq('activo', true).not('auth_user_id', 'is', null),
    cuenta('competencias'),
    cuenta('competencias').gte('nivel', 4),
    cuenta('proveedores').eq('activo', true),
    cuenta('productos').eq('activo', true),
    sb.from('ingredientes').select('*', { count: 'exact', head: true }),
    sb.from('ingredientes').select('*', { count: 'exact', head: true }).not('producto_id', 'is', null),
    cuenta('pedidos'),
    sb.from('checklist_items').select('plaza').eq('restaurante_id', rid),
    cuenta('tareas').eq('categoria', 'produccion'),
    cuenta('cierres_turno'),
    sb.from('cierres_turno').select('jornada').eq('restaurante_id', rid).order('jornada', { ascending: false }).limit(60),
    cuenta('haccp_temperaturas'),
    cuenta('merma'),
    cuenta('presupuesto_sector'),
    cuenta('bitacora_entradas'),
    cuenta('ventas'),
    cuenta('mesas'),
    cuenta('comandas'),
    cuenta('clientes'),
    cuenta('cajas_turnos').eq('estado', 'cerrada'),
  ])
  const cartaTree = await cartaTreePromise

  const c = (i: number): number => {
    const x = r[i]
    return x.status === 'fulfilled' ? ((x.value as { count: number | null }).count ?? 0) : 0
  }
  const rows = <T,>(i: number): T[] => {
    const x = r[i]
    return x.status === 'fulfilled' ? (((x.value as { data: T[] | null }).data) ?? []) : []
  }

  const rest = r[0].status === 'fulfilled'
    ? (r[0].value as { data: { created_at: string; configuracion: Record<string, unknown> | null } | null }).data
    : null
  const cfg = (rest?.configuracion ?? {}) as Record<string, unknown>

  const fechasFactura = rows<{ fecha_factura: string }>(3).map(f => f.fecha_factura)

  // Cobertura: un área activa cuenta como hueco si le falta responsable en
  // alguna capa que no sea 'ejecutar' (esa la hace el equipo del turno).
  const capas = rows<{ area_key: string; capa: string; responsables: string[] | null }>(8)
  const areasActivas = c(7)
  const cubiertas = new Set(
    capas.filter(x => (x.responsables ?? []).length > 0 && x.capa !== 'ejecutar').map(x => x.area_key),
  )
  const areasSinResponsable = Math.max(0, areasActivas - cubiertas.size)

  const plazasConMise = new Set(
    rows<{ plaza: string | null }>(19).map(x => x.plaza).filter(Boolean),
  ).size

  // Jornadas consecutivas con entrega de pase, hacia atrás desde la última.
  const jornadas = [...new Set(rows<{ jornada: string }>(22).map(x => x.jornada))].sort().reverse()
  let paseDiasSeguidos = 0
  for (let i = 0; i < jornadas.length; i++) {
    if (i === 0) { paseDiasSeguidos = 1; continue }
    const prev = new Date(jornadas[i - 1]); prev.setDate(prev.getDate() - 1)
    if (ISO(prev) === jornadas[i]) paseDiasSeguidos++
    else break
  }

  const analisisEstandarizacion = analizarCarta(cartaTree)

  const metricas: MetricasRuta = {
    // `tipo`/`perfil` salen de `configuracion` (ver arriba: no hay columna).
    tipoNegocioDefinido: typeof cfg.tipo === 'string' || typeof cfg.perfil === 'string'
      || Array.isArray(cfg.turnos_servicio),
    facturasTotal: c(1),
    facturasMesActual: c(2),
    facturasSemanasSeguidas: semanasSeguidasConFactura(fechasFactura, hoy),
    recetasConRendimiento: c(4),
    // Un plato con receta vinculada tiene food cost calculable; sin receta, no.
    platosConFoodCost: Math.max(0, c(5) - c(6)),
    areasActivas,
    areasSinResponsable,
    puestos: c(9),
    miembros: c(10),
    miembrosVinculados: c(11),
    competenciasCargadas: c(12),
    competenciasNivel4: c(13),
    cartaItems: c(5),
    cartaSinReceta: c(6),
    // Platos que NO llegan a N3 (peso pesado + costo de factura en todos sus
    // componentes) — antes reusaba cartaSinReceta como proxy y mentía: un
    // plato con receta vinculada pero sin gramaje/peso neto/costos contaba
    // como "estandarizado" sin estarlo. Ver lib/recetas/estandarizacion.ts.
    cartaSinEstandarizar: analisisEstandarizacion.totalPlatos - analisisEstandarizacion.platosPorNivel[3],
    margenObjetivoCargado: typeof cfg.food_cost_objetivo === 'number' || c(25) > 0,
    proveedores: c(14),
    productos: c(15),
    ingredientesTotal: c(16),
    ingredientesLinkeados: c(17),
    pedidos: c(18),
    plazasConMise,
    turnosConfigurados: Array.isArray(cfg.turnos_servicio),
    tareasDespachadas: c(20),
    entregasPase: c(21),
    paseDiasSeguidos,
    registrosHaccp: c(23),
    registrosMerma: c(24),
    presupuestoCargado: c(25) > 0,
    entradasBitacora: c(26),
    mesesConVentas: c(27) > 0 ? 1 : 0,
    mesas: c(28),
    comandas: c(29),
    clientes: c(30),
    arqueos: c(31),
  }

  return {
    metricas,
    altaISO: rest?.created_at ?? null,
    diasDesdeAlta: rest?.created_at
      ? Math.max(0, Math.floor((hoy.getTime() - new Date(rest.created_at).getTime()) / 86_400_000))
      : null,
    tieneSalon: metricas.mesas > 0 || metricas.comandas > 0,
  }
}

const MANUAL_KEY = (rid: string) => `kc_ruta_manual_${rid}`

function leerManual(rid: string): ConfirmacionesManuales {
  if (typeof window === 'undefined' || !rid) return SIN_CONFIRMACIONES
  try {
    const raw = window.localStorage.getItem(MANUAL_KEY(rid))
    if (!raw) return SIN_CONFIRMACIONES
    const p = JSON.parse(raw) as Partial<ConfirmacionesManuales>
    return { carga: p.carga ?? [], insercion: p.insercion ?? [] }
  } catch { return SIN_CONFIRMACIONES }
}

export function useRutaImplantacion() {
  const RESTAURANTE_ID = useRestauranteId()
  const { perfil } = useAuth()
  const swrKey = RESTAURANTE_ID ? `ruta-${RESTAURANTE_ID}` : null

  const { data, isLoading: loading, mutate } = useSWR(swrKey, fetchRuta, {
    revalidateOnFocus: false, revalidateOnReconnect: true,
    dedupingInterval: 300_000, keepPreviousData: true,
  })

  // Confirmaciones a mano en localStorage: son del restaurante pero no vale una
  // tabla todavía. Si el medidor se vuelve parte del producto vendido, migrar.
  const manual = useMemo(() => leerManual(RESTAURANTE_ID), [RESTAURANTE_ID])

  const confirmar = useCallback((estacionId: string, nivel: 'carga' | 'insercion') => {
    if (!RESTAURANTE_ID) return
    const actual = leerManual(RESTAURANTE_ID)
    const lista = actual[nivel]
    const siguiente = lista.includes(estacionId)
      ? { ...actual, [nivel]: lista.filter(x => x !== estacionId) }
      : { ...actual, [nivel]: [...lista, estacionId] }
    try { window.localStorage.setItem(MANUAL_KEY(RESTAURANTE_ID), JSON.stringify(siguiente)) } catch { /* privado */ }
    mutate()
  }, [RESTAURANTE_ID, mutate])

  const dias = data?.diasDesdeAlta ?? null

  const progreso = useMemo(() => calcularProgreso(
    data?.metricas ?? METRICAS_CERO,
    manual,
    { incluirSalon: data?.tieneSalon ?? false, diasDesdeAlta: dias },
  ), [data, manual, dias])

  // Foto diaria del progreso, para que el reconocimiento semanal tenga contra
  // qué comparar: "cuántas funciones quedaron funcionando solas esta semana" es
  // una resta, y sin foto anterior no hay resta (ver la migración
  // 20260911_implantacion_progreso.sql para por qué la escribe el cliente y no
  // el cron).
  //
  // Los dos guards importan:
  //  - `loading || !data` — sin él, el primer render escribe METRICAS_CERO y
  //    deja una foto de 0% que después aparece como un salto falso de progreso.
  //  - `yaFoto` — una vez por montaje; el upsert es idempotente por
  //    (restaurante_id, fecha), pero no hace falta pegarle en cada revalidación.
  const yaFoto = useRef(false)
  useEffect(() => {
    if (loading || !data || !RESTAURANTE_ID || yaFoto.current) return
    yaFoto.current = true
    const sb = createClient()
    sb.from('implantacion_progreso')
      .upsert({
        restaurante_id: RESTAURANTE_ID,
        fecha: ISO(new Date()),
        insertadas: progreso.insertadas,
        total: progreso.total,
        pct: progreso.pct,
      }, { onConflict: 'restaurante_id,fecha' })
      // Best-effort: la pantalla tiene que funcionar aunque la foto falle.
      .then(({ error }) => {
        if (error) console.warn('[useRutaImplantacion] foto de progreso no guardada:', error.message)
      })
  }, [loading, data, RESTAURANTE_ID, progreso.insertadas, progreso.total, progreso.pct])

  return {
    progreso,
    metricas: data?.metricas ?? METRICAS_CERO,
    manual,
    confirmar,
    loading,
    refetch: mutate,
    esAdmin: perfil?.rol === 'admin',
  }
}
