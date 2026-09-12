/**
 * Acceso a los catálogos que las herramientas del Coach buscan por nombre.
 *
 * Existe para que `app/api/coach/route.ts` y `lib/coach/tools/registry.ts`
 * dejen de repetir `.ilike('nombre', '%'+q+'%')` cada uno por su lado (eran 8
 * copias, todas con el bug de tildes de `lib/coach/busqueda.ts`).
 *
 * El criterio de tamaño: productos y recetas se traen enteros y se filtran en
 * memoria (531 filas en la cuenta más grande, sep 2026). `factura_items` NO
 * — ahí hay 10.464 filas en Bros, así que el nombre se resuelve primero
 * contra `productos` y recién después se consulta la factura.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { buscar, ganadorClaro, type ResultadoBusqueda } from '@/lib/coach/busqueda'
import { normalizarBusqueda } from '@/lib/texto'

/** Techo de seguridad: si una cuenta crece más que esto, el filtro se vuelve parcial. */
const TECHO_CATALOGO = 2000

export interface ProductoCoach {
  id: string
  nombre: string
  categoria: string | null
  stock_actual: number
  unidad: string | null
  stock_minimo: number | null
  stock_critico: number | null
}

/**
 * OJO: `recetas` NO tiene columna `food_cost` — el costo se calcula desde los
 * ingredientes (ver `calcFoodCost`). El select de `buscar_receta` la pedía, y
 * como el error de PostgREST se descartaba con `const { data }`, la tool
 * contestaba "no encontré ninguna receta" a TODO. Verificado contra la base
 * el 12/09/2026: 42703 column recetas.food_cost does not exist.
 */
export interface RecetaCoach {
  id: string
  nombre: string
  categoria: string | null
  porciones: number | null
  tiempo_min: number | null
  precio_venta: number | null
  procedimiento: string | null
}

export async function buscarProductos(
  supabase: SupabaseClient,
  restauranteId: string,
  consulta: string,
  limite = 15,
): Promise<ResultadoBusqueda<ProductoCoach>[]> {
  const { data, error } = await supabase.from('productos')
    .select('id, nombre, categoria, stock_actual, unidad, stock_minimo, stock_critico')
    .eq('restaurante_id', restauranteId)
    .eq('activo', true)
    .limit(TECHO_CATALOGO)
  if (error) console.error('[coach/catalogo] buscarProductos:', error.message)
  return buscar((data ?? []) as ProductoCoach[], consulta, limite)
}

export async function buscarRecetas(
  supabase: SupabaseClient,
  restauranteId: string,
  consulta: string,
  limite = 15,
): Promise<ResultadoBusqueda<RecetaCoach>[]> {
  const { data, error } = await supabase.from('recetas')
    .select('id, nombre, categoria, porciones, tiempo_min, precio_venta, procedimiento')
    .eq('restaurante_id', restauranteId)
    .eq('activa', true)
    .limit(TECHO_CATALOGO)
  if (error) console.error('[coach/catalogo] buscarRecetas:', error.message)
  return buscar((data ?? []) as RecetaCoach[], consulta, limite)
}

export interface CartaItemCoach {
  id: string
  nombre: string
  categoria: string | null
}

export async function buscarCartaItems(
  supabase: SupabaseClient,
  restauranteId: string,
  consulta: string,
  limite = 15,
): Promise<ResultadoBusqueda<CartaItemCoach>[]> {
  const { data, error } = await supabase.from('carta_items')
    .select('id, nombre, categoria')
    .eq('restaurante_id', restauranteId)
    .limit(TECHO_CATALOGO)
  if (error) console.error('[coach/catalogo] buscarCartaItems:', error.message)
  return buscar((data ?? []) as CartaItemCoach[], consulta, limite)
}

/**
 * Entre recetas que se llaman IGUAL, la que tiene contenido.
 *
 * El caso real: Bros tiene dos "Mbeju" — una con 6 ingredientes, 18 porciones y
 * procedimiento, y una cáscara vacía sin nada. La búsqueda las puntúa idéntico
 * (mismo nombre) y devolvía la que viniera primero, que era la vacía: el
 * usuario preguntaba la ficha técnica y recibía una receta sin ingredientes.
 *
 * Cuenta ingredientes de todas las candidatas en UNA query y se queda con la
 * más completa. Solo se llama cuando hay empate de nombre.
 */
export async function recetaMasCompleta(
  supabase: SupabaseClient,
  candidatas: RecetaCoach[],
): Promise<RecetaCoach> {
  if (candidatas.length <= 1) return candidatas[0]
  const { data, error } = await supabase.from('ingredientes')
    .select('receta_id')
    .in('receta_id', candidatas.map(r => r.id))
    .limit(1000)
  if (error) console.error('[coach/catalogo] recetaMasCompleta:', error.message)

  const conteo = new Map<string, number>()
  for (const row of (data ?? []) as Array<{ receta_id: string }>) {
    conteo.set(row.receta_id, (conteo.get(row.receta_id) ?? 0) + 1)
  }
  // Ingredientes primero (es lo que se fue a buscar), después procedimiento.
  const puntajeDe = (r: RecetaCoach) =>
    (conteo.get(r.id) ?? 0) * 100 + (r.procedimiento ? 10 : 0) + (r.precio_venta ? 1 : 0)
  return [...candidatas].sort((a, b) => puntajeDe(b) - puntajeDe(a))[0]
}

/**
 * El producto que el usuario quiso decir, o null si no hay uno claro.
 * Para las tools que actúan sobre UN producto (ajustar stock, registrar merma).
 */
export async function resolverProducto(
  supabase: SupabaseClient,
  restauranteId: string,
  consulta: string,
): Promise<ProductoCoach | null> {
  return ganadorClaro(await buscarProductos(supabase, restauranteId, consulta, 5))
}

/**
 * Producto cuyo nombre es EL MISMO que el consultado, ignorando tildes y
 * mayúsculas. Para el guard anti-duplicado de `cargar_producto`, que necesita
 * igualdad — no parecido: "Aceite de coco" no puede bloquearse porque ya exista
 * "Aceite de oliva".
 */
export async function productoPorNombreExacto(
  supabase: SupabaseClient,
  restauranteId: string,
  nombre: string,
): Promise<ProductoCoach | null> {
  const { data, error } = await supabase.from('productos')
    .select('id, nombre, categoria, stock_actual, unidad, stock_minimo, stock_critico')
    .eq('restaurante_id', restauranteId)
    .eq('activo', true)
    .limit(TECHO_CATALOGO)
  if (error) console.error('[coach/catalogo] productoPorNombreExacto:', error.message)
  const objetivo = normalizarBusqueda(nombre)
  return ((data ?? []) as ProductoCoach[]).find(p => normalizarBusqueda(p.nombre) === objetivo) ?? null
}

/**
 * Nombres candidatos para buscar en tablas grandes (`factura_items`), donde no
 * se puede traer todo y filtrar en memoria. Devuelve el término del usuario
 * más los nombres canónicos del catálogo que le coinciden, para que el `ilike`
 * de PostgREST tenga contra qué pegar aunque el usuario haya escrito sin tilde.
 */
export async function nombresCandidatos(
  supabase: SupabaseClient,
  restauranteId: string,
  consulta: string,
  max = 5,
): Promise<string[]> {
  const res = await buscarProductos(supabase, restauranteId, consulta, max)
  const nombres = res.map(r => r.item.nombre)
  return [consulta, ...nombres.filter(n => n.toLowerCase() !== consulta.toLowerCase())].slice(0, max + 1)
}
