# Patrón de hooks — KitchenOS

## Gotchas de Supabase

1. **Tabla/columna nueva → recargar el schema cache de PostgREST.** El browser no la ve hasta `NOTIFY pgrst, 'reload schema';` (sumarlo al final de toda migración que cree tablas/columnas) — verificar con GET REST `…/rest/v1/<tabla>?select=id&limit=1` (200 esperado).

2. **Los errores de Supabase NO son `Error`** — son `{message, code, details}`. `catch(e){ e instanceof Error ? e.message : 'desconocido' }` traga el mensaje real. Extraer: `const msg = e instanceof Error ? e.message : (e && typeof e === 'object' && 'message' in e) ? String(e.message) : 'desconocido'`.

3. **`lib/supabase/admin.ts` exporta `createAdminClient`, NO `createClient`.**

4. **Insert directo (no vía la función del hook) no actualiza el SWR de otro hook** — solo se entera por realtime (1-3s). Llamar `refetch()`/`mutate()` después para refresco inmediato.

5. **`new Blob([uint8Array])` puede fallar en TS** (`Uint8Array<ArrayBufferLike>` no asignable a `BlobPart`) — pasar `new Blob([bytes.buffer as ArrayBuffer], {type:'...'})`.

6. **`navigator.usb`/`navigator.bluetooth` no están en el DOM lib de TS.** Declarar interfaces mínimas locales y castear (`navigator as Navigator & {usb?: UsbApi}`). No instalar `@types/w3c-web-usb` (rompe el build).

7. **Scripts `.mjs` no aceptan anotaciones TypeScript** — Node los ejecuta como ES module puro. JS sin tipos, o `.ts` con `tsx`.

8. **Filtrar tabla hija por columna del padre: embed con `!inner`, no left join ni 2 queries.** `.select('*, recetas(*)').eq('recetas.restaurante_id', X)` NO filtra la principal. `!inner` sí:
   ```ts
   supabase.from('pagos').select('medio_id, monto, cuentas!inner(restaurante_id)').eq('cuentas.restaurante_id', RESTAURANTE_ID)
   ```
   **PostgREST tope 1000 filas por request** pase lo que pase, aun con `.limit()` mayor — paginar con `.range(from, from+999)` en loop o usar `fetchAllRows` de `lib/supabase/paginate.ts` en cualquier select sobre tabla que pueda superar 1000 filas/restaurante. `.in('col', ids)` con cientos de UUIDs puede además pasarse de la query-string (400) — el embed `!inner` evita el problema de raíz.

9. **Columna `GENERATED ALWAYS` → nunca en INSERT/UPDATE** (Postgres 400 `428C9` aunque el valor coincida con el calculado). Un `catch {/* no bloquea */}` alrededor puede esconder el error del todo (UI ok, DB sin persistir) — verificar contra la DB, no solo la UI, antes de usar ese patrón en una escritura nueva.

10. **Función de hook usada en deps de `useCallback`/`useEffect` de OTRO componente debe ser `useCallback` en el hook, sin excepción.** Funciones CRUD planas están bien si solo se llaman desde `onClick`; en un dispatcher tipo `loadTab` una referencia nueva por render recrea el callback → re-dispara el effect → loop infinito.

11. **Bottom sheet sin `<SheetChrome>`/`useSheetOpen()` no oculta el Coach FAB** — es lo único que avisa al `UiChromeProvider` que hay un sheet abierto.

12. **Mismo email en `auth.users` vinculado a 2 restaurantes → login se cuelga sin error visible.** `AuthProvider` resuelve con `.maybeSingle()` sobre `user_restaurantes`; 2 filas para el mismo `user_id` da un caso ambiguo interpretado como "perfil no resuelto" (reintenta y se rinde, sin loguear error). Verificar con `listUsers()` + `user_restaurantes` que un email no esté ya vinculado a otro restaurante antes de crear cuenta.

13. **Si `SUPABASE_MANAGEMENT_TOKEN` y el MCP fallan a la vez, no hay vía para DDL.** El service role key + `supabase-js` sigue sirviendo para DML (select/insert/update/delete) siempre — alcanza para diagnosticar/arreglar datos, no para crear tablas/columnas. Sin DDL disponible, diseñar sin migración (#15) y documentar como deuda.

14. **`npx vercel --prod` puede no tener token válido en dev — no es blocker.** El deploy real va por webhook GitHub→Vercel en `git push` a `main`, independiente de esa CLI.

15. **Con DDL caído, dos patrones "sin migración" — no reinventar un tercero:** (a) **JSONB en `restaurantes.configuracion`** para datos nuevos a nivel restaurante: read-modify-write completo para no pisar otras claves. (b) **Sufijo codificado en un campo de texto existente** (ej. `" ×N"`) para un dato extra sobre una fila que ya tiene un campo libre visible en pantalla. Documentar como deuda ("migrar a columna real cuando vuelva el DDL"), no como bug.

16. **Un `Record<Enum, Config>` copiado en dos archivos puede desincronizarse silenciosamente** (key con label/color de otra key) y un array de ciclo puede no incluir todos los valores del union — TS no avisa en ninguno de los dos casos. Al copiar, verificar contra el tipo real (`grep 'export type X'`) que estén todos los valores.

17. **Un hook "trae todo X del restaurante" montado dentro de cada ítem de una lista multiplica el request por la cantidad de ítems.** Extraer a un componente wrapper de montaje diferido (ej. al abrir una sheet), no dentro del ítem que se renderiza siempre. Si además el hook abre un canal de realtime, multiplica también las suscripciones: montarlo una vez en el contenedor y bajar los datos por props (`useNotasPlaza` se llama una vez en `ProduccionBoard` y expone `notasDe(plaza)`, en vez de una vez por columna).

18. **Canal de realtime sin filtrar por `restaurante_id` y sin ignorar el eco de la propia escritura dispara un refetch completo en cada evento**, incluido el de la propia escritura optimista. Patrón: `filter: 'restaurante_id=eq.'+RESTAURANTE_ID`; `Map<id,timestamp>` de ids propios recientes para ignorar el eco; debounce (~400ms) antes de refetchear para que un batch dispare un solo `mutate()`.

19. **`new Date().toISOString().split('T')[0]` nunca es "hoy" en Argentina — pero el reemplazo correcto depende del dominio.** `toISOString()` da UTC, que de noche (UTC-3) ya cayó en el día siguiente. Dos helpers de `lib/ops/turnos.ts`, no intercambiables: `hoyOperativo()` (fecha operativa con corte configurable, antes de ~6am = día anterior — turnos/producción, fuente de verdad para `turno_fecha`) vs `fechaEnTz(new Date(), TZ_DEFAULT)` (fecha calendario real en ART, sin corte — para todo lo que no es turno: HACCP, timestamps de exports/PDF, cualquier "fecha de hoy" que un humano espera ver como la fecha real, no la del turno). Bug real encontrado dos veces con `toISOString()` a mano: en `turnos.ts` original, y en HACCP (`haccp/page.tsx`, ago 2026) — mostraba la fecha del día siguiente en pantalla y en el PDF a Bromatología a partir de las ~21h.

20. **`const supabase = createClient()` sin `useMemo` en un hook rompe cualquier `useCallback`/`useEffect` que dependa de una función del hook.** `createClient()` (`lib/supabase/client.ts`) NO es singleton — crea un `SupabaseClient` nuevo en cada llamada. Si el hook lo asigna directo (sin memoizar) y alguno de sus `useCallback` lo tiene en deps, esa función cambia de referencia en cada render del hook → un `useEffect` de la pantalla que la usa como dep se re-dispara sin parar → loop de fetches que deja la pantalla trabada en "Cargando..." de forma intermitente (no siempre visible, pero pega igual en costo de red). Fix: `const supabase = useMemo(() => createClient(), [])` — patrón ya usado en `useTareas.ts`/`useMenus.ts`.

21. **Dos pantallas que se sincronizan entre sí tienen que compartir la cache, o avisarse a mano.** Si una guarda su lista en una key SWR compartida y la otra en un `useState` propio, el sync anda para un lado y para el otro no — y se percibe como "tarda varios segundos", no como "no funciona", porque el dato aparece cuando algún efecto no relacionado dispara un refetch. Agrava el diagnóstico que **las tabs de OPS no se desmontan** (`display:none` en `operaciones/page.tsx`): volver a una tab NO la remonta ni refetchea nada. Opciones: mover la lista a SWR con key compartida, o un emitter a nivel de módulo que parchee el estado (patrón de `lib/ops/miseBus.ts`, instantáneo y sin red, pero solo dentro de la misma pestaña).

22. **Para suscribir a realtime una tabla que no tiene `restaurante_id`, agregar la columna con un TRIGGER, no desde el cliente.** El `filter` obligatorio (#18) necesita la columna en la fila replicada. Llenarla con un `BEFORE INSERT OR UPDATE` que la derive de la tabla padre gana dos cosas: ningún writer cambia (ni las API routes, ni el celular que quedó con el bundle viejo abierto en pleno servicio) y el valor es autoritativo — se ignora lo que mande el cliente, así que no se puede escribir una fila con el tenant de otro. Ejemplo: `checklist_registros` (migración `20260806b`).

23. **Al parchear estado desde realtime, descartar el eco de la escritura propia.** Cada write vuelve por el canal 1-3s después; aplicarlo tarde puede pisar un cambio posterior (tildar y destildar rápido deja ganando al tilde viejo). `Map<clave, timestamp>` de escrituras propias + ventana de ~3s, con poda cuando el Map crece. Distinto de #18, que es sobre no *refetchear* por el eco: acá el problema es el orden, no el costo.

24. **Crear una fila y esperar el `await` del insert antes de limpiar el input de captura es una carrera real, no cosmética.** Un editor tipo "Enter crea la siguiente línea" que hace `await agregarFila(...)` antes de vaciar el campo deja el input con el texto viejo durante el round-trip; si el usuario ya empezó a tipear la línea siguiente, el nuevo texto se concatena al anterior en vez de crear una fila propia (bug real en Bitácora, ago 2026: tipear rápido Enter→Tab→seguir escribiendo pegaba dos líneas en una). Fix: generar el `id` en el cliente (`crypto.randomUUID()`), actualizar el estado local (y limpiar el input) *antes* del `await`, mandar el insert con ese id explícito — la escritura corre en segundo plano, nunca bloquea el próximo tap. Mismo principio que "Escrituras del camino crítico" arriba, aplicado a creación, no solo a edición.

25. **Un input que solo vive en memoria hasta un commit explícito (Enter/blur) se pierde en un refresh o al cerrar la pestaña si el usuario no llegó a disparar ese commit.** No alcanza con guardar al montar/desmontar el componente — un `reload()` mata el JS sin correr el cleanup normal a tiempo para completar un `await` de red. Flush en `visibilitychange` (tab a segundo plano — confiable) + intento best-effort en `beforeunload` (no garantizado: el navegador puede cortar el fetch a mitad de camino) + flush en el cleanup del `useEffect` al desmontar/cambiar de entidad (100% confiable, es navegación dentro de la SPA). Usar una `ref` actualizada en cada render para leer el valor más reciente dentro del handler, no la clausura del `useEffect` (que solo se reinstala si sus deps cambian).

26. **Cuando la visibilidad de la fila A depende de una columna de la fila embebida B (ej. `checklist_items` filtrado por `menus.vigencia_hasta`), el canal de realtime necesita un `.on(...)` propio sobre la tabla B además del de A.** Un UPDATE en B no toca ninguna fila de A, así que el listener de A nunca dispara y el cliente queda con el embed viejo hasta el próximo refetch manual. Agregar `.on('postgres_changes', {event:'UPDATE', table:'B', filter}, () => mutateConfig())` al mismo canal (`useChecklist.ts`, suscripción a `menus` adjunta a la de `checklist_items`, ago 2026).

## Anti-patrón: funciones internas usadas como JSX en React

**Síntoma:** el teclado se cierra al primer carácter, se pierde el focus, un form "se resetea" solo.

**Causa:** función definida DENTRO de un componente padre, usada como `<InnerComp />` → React la ve como tipo de componente distinto en cada render → unmount+remount → se destruye el DOM incluido el foco.

```tsx
// ❌ MAL
export default function Page() {
  function InnerForm() { return <input ... /> }  // nueva referencia cada render
  return <InnerForm />                            // React la trata como componente nuevo → remount
}
// ✅ BIEN — a nivel de módulo, con props
function InnerForm({ value, onChange }: Props) { return <input value={value} onChange={onChange} ... /> }
export default function Page() { return <InnerForm value={...} onChange={...} /> }
// ✅ También válido — invocar como función (JSX inlined, sin fiber propio)
export default function Page() {
  function InnerSection() { return <div>...</div> }
  return <>{InnerSection()}</>
}
```
**Regla:** cualquier función con inputs (focus, teclado) va a nivel de módulo, recibiendo `form`/`setForm` como props.

---

## Estructura estándar

```ts
'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRestauranteId } from './useRestauranteId'

export function useXxx() {
  const RESTAURANTE_ID = useRestauranteId()   // '' mientras carga
  const supabase = useMemo(() => createClient(), [])  // createClient() NO es singleton — ver gotcha #20
  const [items, setItems] = useState<T[]>([])
  const [loading, setLoading] = useState(true)

  const fetchXxx = useCallback(async () => {
    if (!RESTAURANTE_ID) return              // guard OBLIGATORIO
    setLoading(true)
    const { data } = await supabase.from('tabla').select('*')
      .eq('restaurante_id', RESTAURANTE_ID).order('created_at', { ascending: false })
    setItems(data ?? [])
    setLoading(false)
  }, [RESTAURANTE_ID])                       // RESTAURANTE_ID en deps — evita stale closure

  useEffect(() => { fetchXxx() }, [fetchXxx])
  return { items, loading, refetch: fetchXxx }
  // ...CRUD functions
}
```

## Reglas inamovibles

1. **Guard al inicio de cada fetch:** `if (!RESTAURANTE_ID) return` — sin esto los queries devuelven datos vacíos o de otro tenant.
2. **RESTAURANTE_ID en deps de useCallback** — omitirlo es stale closure; el hook queda apuntando al restaurante viejo si el usuario cambia de cuenta.
3. **`createClient()`** — browser client siempre en hooks, envuelto en `useMemo(() => createClient(), [])` (no es singleton, ver gotcha #20). Nunca el admin client.
4. **Paginación con `useRef`, NO `useState`** — `page` como state en deps del `useCallback` del fetch recrea la función en cada avance → el `useEffect([fetch])` se re-dispara y resetea a página 0.

## Cache SWR — patrón estándar para hooks "lista al montar"

Hooks que cargan una lista keyed por `restaurante_id` usan **SWR**, no `useState+useEffect` (sin cache, cada navegación re-consulta todo).

```ts
async function fetchXData(key: string): Promise<T[]> {         // fetcher a NIVEL DE MÓDULO
  const rid = key.slice('xx-'.length)
  const supabase = createClient()                               // singleton @supabase/ssr
  const { data, error } = await supabase.from('tabla').select('*').eq('restaurante_id', rid)
  if (error) throw error
  return data ?? []
}
export function useX() {
  const RESTAURANTE_ID = useRestauranteId()
  const swrKey = RESTAURANTE_ID ? `xx-${RESTAURANTE_ID}` : null   // null = guard, no fetch
  const { data: items = [], isLoading: loading, mutate } = useSWR(swrKey, fetchXData, {
    revalidateOnFocus: false, revalidateOnReconnect: true, dedupingInterval: 300_000, keepPreviousData: true,
  })
  // realtime → mutate(); CRUD → mutate() o mutate(optimistic, { revalidate: false })
}
```
1. `swrKey` null mientras `RESTAURANTE_ID===''` reemplaza el guard.
2. Múltiples datasets: fetcher combinado (objeto) o varias keys SWR.
3. Fetchers parametrizados por fecha/mes/rango no encajan bien — base en SWR + filtro imperativo (`mutate(dataFiltrada, {revalidate:false})`), o no migrar ese hook.
4. Reemplazar caches manuales (Map ad hoc) por SWR.
5. **El `= []`/`?? []` de arriba es una trampa si ese array alimenta el `deps` de OTRO efecto** (propio o de quien consume el hook): mientras `data` no resuelve, cada render produce un array nuevo, ese efecto se re-dispara solo, y si el efecto llama a `setState` es un loop — "Maximum update depth exceeded" (visto en `useChecklist`, ago 2026). Ahí no alcanza con inline: usar una constante a nivel de módulo (`const SIN_X: X[] = []`) como fallback, para que la identidad sea estable entre renders.

## Doble-tap / "hay que apretar dos veces" — causas reales

1. **Server Component async** (`export default async function Page()` con `await`) sale `ƒ (Dynamic)` en el build → round-trip al server antes de transicionar en cada tap. Si el hook ya cachea con SWR, hacer la página client estática (sin `await`) → ruta `○` → navega instantáneo.
2. **Animación de entrada con translate/stagger** — ver "Animaciones de lista" en `ui.md`.

## API route que bypassea RLS

`/api/recetas/save` — único endpoint con `createAdminClient()`. Modos: `{receta, ingredientes}` insert batch · `{receta}` solo receta · `{addIngredientsOnly:true, ingredientes}` suma a receta existente · `{enrichRecetaId, receta:{procedimiento}, ingredientes}` enriquece (borra ingredientes viejos, inserta nuevos, actualiza procedimiento — botón "Completar con IA"). Llamar desde `useRecetas.agregarReceta`, no directo desde el browser.

## AuthProvider — cómo funciona

`lib/auth/context.tsx`, dos `useEffect` separados (evita deadlock): (1) setea `user` via `onAuthStateChange`+`getSession()`, sin queries DB; (2) carga perfil cuando `user` cambia: `user_restaurantes`→`equipo_miembros`. `useRestauranteId()` devuelve `''` mientras `loading` o sin perfil.

**`proxy.ts` rebota `/register`/`/login` a `/` si ya hay sesión** — un link a `/register` logueado nunca llega a destino. `signOut(redirectTo?)` (default `/login`) permite `signOut('/register')` para cerrar sesión y recién ahí navegar.

**Race de hard-navigation:** en F5/URL directa el access token puede no estar adjunto a la primera query → RLS vacío → perfil `null`. `loadPerfil(u, attempt)` reintenta con backoff (máx 3, `loading` se mantiene `true` = spinner, no `??`). Safety timeout (10s) fuerza `loading=false` si se cuelga. `giveUp()` usa `setPerfil(prev=>prev)` (no `null`) para no pisar el perfil que `signUp` setea en paralelo durante el alta.

## `kc_screen_context` — patrón para Kitchen Coach

```tsx
// SIEMPRE después de los useMemo que referencia — TS2448 si va antes
const fcPromedio = useMemo(...)
const nAlertas = useMemo(...)
useEffect(() => {
  localStorage.setItem('kc_screen_context', JSON.stringify({
    screen: 'nombre_pantalla',   // debe matchear TOURS y SUGGESTIONS_BY_SCREEN
    topProblemas: items.filter(riesgo).slice(0,5).map(i => ({ nombre: i.nombre, valor: i.val })),  // insights accionables, no solo .length
    faltantes: items.filter(incompleto).map(i => i.nombre).slice(0,5),
    kpis: { promedio: Math.round(fcPromedio), alertas: nAlertas },
  }))
  return () => localStorage.removeItem('kc_screen_context')
}, [/* deps reales — todos los useMemo usados */])
```
Trampas: `useEffect` antes de un `useMemo` que referencia (TS2448); `useEffect` no importado; propiedades de tipo incorrectas (verificar el tipo real).

## Kitchen Coach — datos reales + acciones server-side

`app/api/coach/route.ts` usa el **server client** (RLS por sesión), no el admin client. **Snapshot**: stock crítico/bajo, vencimientos próximos, facturas pendientes en vivo, inyectado al prompt, `try/catch` por sección (falla seguro). **Tool use**: loop agéntico (modelo→tool_use→ejecutar→tool_result→modelo, tope de vueltas). Tools: `crear_tarea`, `marcar_86`, `registrar_merma`. `restaurante_id` siempre de la sesión (`user_restaurantes`), nunca del body — RLS lo enforcea igual en el WITH CHECK.

## usePermisos — resolución de módulos efectivos

Prioridad de `puedeVer(modulo)`: (1) `isAdmin` → true siempre. (2) con `equipo_miembros.puesto_id`: módulos de `puestos.permisos_app` + `modulos_extra` − `modulos_restringidos`. (3) fallback `rol_permisos.modulos_visibles`. El hook carga el puesto via `equipo_miembros WHERE auth_user_id = user.id`; sin fila ahí, usa el fallback.

## OPS mise — suma acumulativa por receta+plaza

`plato_recetas.cantidad_ops` = contribución individual de CADA plato. `checklist_items.cantidad` = suma de TODAS las contribuciones con misma `receta_id+plaza` — recalcular siempre al guardar, nunca hacer UPDATE con el valor ingresado directo:
```ts
const { data } = await supabase.from('plato_recetas').select('cantidad_ops')
  .eq('receta_id', pr.receta_id).eq('plaza', opsPlaza).not('cantidad_ops', 'is', null)
const total = data.reduce((s, r) => s + (r.cantidad_ops ?? 0), 0)
```

## Activar menú (Planificación/Calendario) — helper compartido `lib/menus/activarMenu.ts`

`activarMenuParaFechas(supabase, restauranteId, menu, fechas: string[])` — crea en `tareas` las preparaciones de un menú para cada fecha dada: dedupe por título dentro de `(menu_id, turno_fecha)`, carryover (borra lo pendiente de ayer) solo si el lote incluye el día real de `hoyOperativo()`. Usado por `app/(app)/produccion/page.tsx` (un día o varios sueltos, vía `multiSelectMode`) y por `app/(app)/calendario/page.tsx` ("Planificar menú", rango contiguo con `rangoFechas(desde, hasta)`). No reimplementar el loop de activación en un tercer lugar — extender este helper.

## OPS mise — helper compartido `lib/ops/mise.ts`

Única fuente de verdad para escribir un ítem del mise: `upsertMiseChecklistItem({supabase, restauranteId, recetaId, nombre, plaza, seccionMiseId, cantidad, unidad, recipienteNombre?, pesoPorcion?, pesoPorcionUnidad?, prioridad?})` — busca/crea la `checklist_secciones` de la plaza y hace el upsert, keyed por `(restaurante_id, receta_id, plaza)`. Usado por Carta (`handleComposicionSave`, rama Plato) y Recetario (`RecetaOpsSheet`) — no duplicar. `PLAZAS_OPS`/`SECCIONES_OPS` viven ahí y se re-exportan desde `carta/ComposicionEditor`; importar desde `@/lib/ops/mise` en código nuevo. `resolverSeccionMise(supabase, restauranteId, plaza, seccionMiseId)` (misma resolución legacy-id-vs-UUID) está extraído para reusar sin duplicar la lógica — **es plaza-safe**: si `seccionMiseId` es un UUID real pero pertenece a OTRA plaza que la pedida (pasa cuando algo mueve el ítem de plaza después de configurado — ver `plaza_control` abajo), resuelve por nombre bajo la plaza nueva en vez de dejar el `checklist_item` con un `seccion_id` de una plaza distinta — eso lo vuelve invisible, porque el mise agrupa filtrando `checklist_secciones` por la plaza que se está mirando.

## Menú/Evento en el mise — NO confundir con "Activar menú" — `lib/ops/menuMise.ts`

Dos sistemas distintos que parten del mismo `menu_preparaciones`, escriben a tablas distintas y no se enteran uno del otro:
- **`activarMenuParaFechas`** (arriba) → `tareas`, una fila por preparación por día, checkbox único (pendiente/listo). Para "producí esto hoy/estos días".
- **`sincronizarMiseDeMenu`** (`lib/ops/menuMise.ts`) → `checklist_items` con `menu_id`, keyed por `(restaurante_id, menu_id, plaza, nombre)` — **no** por `receta_id`, porque pisaría el ítem permanente del mise fijo si el menú reusa una receta que la carta ya tiene ahí. Persistente y re-chequeado en cada apertura/cierre mientras `menus.vigencia_desde/hasta` cubra el día (`menuItemVisible()`). Para "esto tiene que estar siempre stockeado mientras dure el menú" (ej. un ejecutivo de 1-2 semanas). Idempotente + prune: correr de nuevo tras editar el menú, no acumula ni deja huérfanos.
- **`menus.plaza_control`** (ago 2026): si está cargada, `sincronizarMiseDeMenu` pisa la `plaza` de CADA preparación con esta — todo el menú lo controla una sola plaza (real o custom, pensada para una que no existe físicamente) en vez de repartirse por estación. En el editor, `OpsPanel` recibe `forcedPlaza` y directamente no deja elegir plaza por ítem (arranca en "Sección", ya scopeado). Dos preparaciones con el mismo nombre que caen en la misma plaza de control colisionan en la misma clave — `sincronizarMiseDeMenu` las deduplica dentro de una misma corrida, no inserta la segunda.

`TAREA_PRIO_TO_MISE`/`MISE_PRIO_TO_TAREA` (`lib/ops/mise.ts` y `components/mise/ProductoMiseCard.tsx`) son inversos entre sí — si se toca uno, tocar el otro.

## Peso de la pantalla — el hook completo no siempre es el que va

Antes de montar un hook en una pantalla, mirar qué baja realmente. Reglas:

1. **Variante lite cuando solo se necesitan nombres.** `useRecetas` trae cada receta con todos sus ingredientes y le calcula el food cost (medio mega en una cuenta real). Para autocompletar o mostrar porciones va `useRecetasLite` (key SWR propia, compartida entre pantallas). Mismo criterio para cualquier hook "pesado" que se use solo por un campo.
2. **`{ soloEscritura: true }`** en hooks que la pantalla usa únicamente para escribir (`useTareas`, `useHaccp`): pone la `swrKey` en `null` y no descarga nada; al escribir invalida la key real con `useSWRConfig().mutate(key)` para que las pantallas que sí muestran la lista se enteren.
3. **Ventana de historia en tablas que crecen todos los días.** `tareas` suma ~40 filas diarias: el fetcher acota a 60 días (`turno_fecha.is.null,turno_fecha.gte.X` vía `.or`). El histórico largo lo consulta Reportes por su cuenta.
4. **Realtime SIEMPRE con `filter: restaurante_id=eq.X`.** Sin el filter llegan las escrituras de todas las cuentas y disparan refetch en todos los dispositivos.
5. **`restaurantes.configuracion` se lee por `useRestauranteConfig()`** (una sola key SWR compartida). Nunca una query propia: hay hooks que viven dentro de cada fila de una lista y terminan pidiendo la misma fila una vez por ítem.

Medirlo, no estimarlo: `node scripts/shot.mjs --ruta /x --net` imprime kB y requests por tabla de una pantalla.

## Escrituras del camino crítico — optimista primero, sin refetch

Todo lo que el usuario tapea esperando feedback inmediato (tildar un ítem, cambiar un estado) actualiza el estado local en el mismo frame y **después** manda la escritura; si falla, se refetchea contra el servidor como rollback. Nunca `await escritura → await refetch` antes de pintar: son round-trips en serie y en la cocina, con 4G, se sienten como un segundo de nada por tap. Si el tap dispara varias escrituras (registro del mise + tareas vinculadas), van en `Promise.all`, no encadenadas.

Corolario: `loading` es de la **primera** carga. Un flag que se prende en cada refetch deja la lista en blanco al cambiar de tab o de fecha, que es lo que se percibe como "navegar lento".
