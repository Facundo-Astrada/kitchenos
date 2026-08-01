# Patrón de hooks — KitchenOS

## Gotchas de Supabase (jun 2026)

1. **Tablas/columnas nuevas → recargar el schema cache de PostgREST.** Tras crear una tabla o columna por migración, el cliente browser (supabase-js, vía PostgREST con anon key) **no la ve** hasta recargar el cache → insert/select "no hacen nada" / no persisten / lista vacía. Pero el SQL directo (management API) la ve enseguida. Síntoma clásico: el INSERT simulando RLS funciona, pero desde la app no. **Fix:** `NOTIFY pgrst, 'reload schema';` (sumarlo al final de TODA migración que cree tablas/columnas) y verificar con un GET REST `…/rest/v1/<tabla>?select=id&limit=1` (debe dar 200). Pasó con `menus`/`menu_preparaciones`.

2. **Los errores de Supabase NO son instancias de `Error`.** Son objetos `{ message, code, details }`. Un `catch (e) { e instanceof Error ? e.message : 'desconocido' }` traga el mensaje real → siempre "desconocido". Extraer así: `const msg = e instanceof Error ? e.message : (e && typeof e === 'object' && 'message' in e) ? String(e.message) : 'desconocido'`.

3. **`lib/supabase/admin.ts` exporta `createAdminClient`, NO `createClient`.** El admin client tiene un nombre de export distinto al browser/server client. Importar así: `import { createAdminClient } from '@/lib/supabase/admin'`. Importar `{ createClient }` del mismo módulo da error TS "declares 'createClient' locally, but it is not exported". Pasó en los 3 endpoints de Fase 7 salón (jul 2026).

4. **Insert directo no actualiza el SWR de otro hook.** Si insertás con `supabase.from(...).insert()` directo (no vía la función del hook), el cache SWR de `useTareas`/etc. solo se entera por el **realtime** (1-3 s). Para refresco inmediato, llamar `refetch()`/`mutate()` del hook justo después del insert. (Ver `activarMenu` en produccion/page.tsx.)

7. **Scripts `.mjs` no aceptan anotaciones TypeScript (jul 2026).** Node.js ejecuta `.mjs` como ES module puro — cualquier `: string`, `: number`, `Record<K, V>`, `as Type` causa `SyntaxError: Missing initializer`. Usar JS puro: `function f(param)` (sin tipos), `const MAP = { ... }` (sin `Record<string,string>`). Si el script necesita tipos, cambiar extensión a `.ts` y correr con `tsx` o `ts-node`. Pasó con `limpiar-datos-prueba-bros.mjs` (jul 2026).

5. **`new Blob([uint8Array])` falla en TypeScript 5.7+ (jul 2026).** `Uint8Array<ArrayBufferLike>` no es asignable a `BlobPart` desde TS 5.7. Fix: pasar el buffer subyacente: `new Blob([bytes.buffer as ArrayBuffer], { type: '...' })`. Pasó al implementar el cliente ESC/POS en `salon/page.tsx`.

6. **`navigator.usb` y `navigator.bluetooth` NO están en el DOM lib de TS por defecto (jul 2026).** Estos browser APIs (Web USB / Web Bluetooth) no tienen tipos en `lib.dom.d.ts` estándar. Patrón correcto: declarar interfaces mínimas locales y castear el navigator: `(navigator as Navigator & { usb?: UsbApi }).usb`. No instalar `@types/w3c-web-usb` (rompe el build Next.js). Pasó en `salon/page.tsx` al agregar impresión ESC/POS.

8. **Filtrar una tabla hija por columna del padre: embed con `!inner`, NO 2 queries — pero con paginación manual (jul 2026).** [[feedback_postgrest_join]] (memoria) documentaba que `.select('*, recetas(*)').eq('recetas.restaurante_id', X)` NO filtra la tabla principal — cierto para un embed normal (left join). Pero con `!inner` el embed se vuelve INNER JOIN y **sí filtra la tabla principal**, confirmado con `curl` directo contra PostgREST:
   ```ts
   // ✅ pagos/factura_items no tienen restaurante_id propio (tablas hijas) — esto SÍ filtra:
   supabase.from('pagos')
     .select('medio_id, monto, cuentas!inner(restaurante_id)')
     .eq('cuentas.restaurante_id', RESTAURANTE_ID)
   ```
   **Gotcha aparte:** PostgREST devuelve máx. **1000 filas por request pase lo que pase** (`Content-Range: 0-999/*`), incluso con `.limit(5000)` explícito — un restaurante con miles de renglones de factura en una ventana de 90 días (Bros: ~3000) trunca silenciosamente. Hay que paginar con `.range(from, from+999)` en loop hasta que la página devuelva menos de 1000 filas. Y si en cambio se arma el filtro con `.in('factura_id', ids)` sobre cientos de UUIDs, la query-string se pasa de largo → 400 de PostgREST (pasó con ~125 facturas ≈ 5000 caracteres en la URL); el embed `!inner` de arriba evita este problema de raíz. Encontrado implementando `usePreciosProveedores.ts` (Q5) y `useCajaTurno.ts` (M1) con datos reales de Bros. **Recurrió jul 2026** en `app/api/stock/sugerir-minimos/route.ts` y en el nuevo `lib/stock/syncPrecios.ts`: el select de `facturas` sin `.range()` traía solo las primeras 1000 de las 2800 de Bros, en orden no garantizado — "la factura más reciente" de un producto podía terminar siendo cualquiera (confirmado con "Menta": tomaba una factura de junio en vez de la de julio real). Usar `lib/supabase/paginate.ts` (`fetchAllRows`) para cualquier select nuevo sobre una tabla que pueda superar 1000 filas por restaurante — evita reintroducir este bug.

9. **Columna `GENERATED ALWAYS` → nunca mandarla en INSERT/UPDATE, y un `catch { /* no bloquea */ }` la puede esconder por completo (jul 2026).** Postgres rechaza con 400 (`code: '428C9'`, `"column X can only be updated to DEFAULT"`) cualquier INSERT/UPDATE que incluya un valor explícito para una columna `GENERATED ALWAYS AS (...)` — aunque el valor calculado en el cliente coincida exactamente con lo que la DB calcularía. `turnos_personal.horas_total` es `GENERATED ALWAYS AS (EXTRACT(epoch FROM (salida-entrada))/3600)`: mandar `horas_total` calculado a mano en el payload de `marcarSalida` rompía el UPDATE con 400 — pero como la función estaba envuelta en el patrón "no bloquea el flujo visual" (`try { await marcarSalida(...) } catch {}`), el error quedaba **completamente silenciado**: la UI mostraba el turno cerrado (localStorage limpio) pero `salida` nunca se guardaba en DB. Se detectó solo al cruzar contra la base con `curl`/SQL directo después de una verificación en browser que parecía exitosa. **Fix:** no incluir la columna generada en ningún payload — dejar que la DB la calcule sola. Antes de usar este patrón "no bloquea" en una escritura nueva, verificar una vez contra la DB (no solo contra la UI) que el efecto se persistió. Pasó implementando fichaje real (M3).

11. **Un bottom sheet sin `<SheetChrome>` no oculta el Coach FAB (jul 2026).** `useSheetOpen()`/`<SheetChrome>` (`lib/ui/chrome.tsx`) es lo único que le avisa al `UiChromeProvider` que hay un sheet abierto — sin eso, `sheetCount` queda en 0 y el FAB del Coach se sigue renderizando **por encima** del modal aunque tape toda la pantalla. No es automático por tener `position: absolute/fixed; inset: 0` — hay que envolver el JSX del sheet explícitamente. Pasó en el modal "Editar producto" de `stock/ClientView.tsx` (existía desde antes de que `SheetChrome` se adoptara como convención D0): los otros ~4 sheets del mismo archivo ya lo usaban, este quedó afuera. Al auditar/tocar un sheet existente, verificar que esté envuelto — es fácil de pasar por alto porque el bug no rompe nada, solo se ve mal (FAB flotando sobre el contenido).

10. **Función de hook usada dentro del array de deps de un `useCallback`/`useEffect` de OTRO componente → tiene que estar en `useCallback` en el hook, sin excepción (jul 2026).** La mayoría de las funciones CRUD de los hooks de KitchenOS (`agregarX`, `actualizarX`, etc.) son funciones async planas, no `useCallback` — está bien mientras solo se llamen desde `onClick` handlers. Pero si una pantalla las mete en el array de deps de su propio `useCallback` (patrón `loadTab` de `reportes/page.tsx`, que arma un dispatcher por tab y cada `fetchX` de cada hook va en sus deps), una función sin memoizar genera una referencia nueva en cada render → el `useCallback` que la usa se recrea → el `useEffect` que lo llama se re-dispara → nuevo render → loop infinito (`Maximum update depth exceeded` en consola, la pantalla se queda en "Cargando…" para siempre). Pasó con `fetchAuditorias` (nueva en `useChecklist.ts`, M4): al agregarla al `loadTab` de Reportes sin envolverla en `useCallback(..., [RESTAURANTE_ID, supabase])` (como sí tienen `fetchRegistros`/`fetchRutinaRegistros`/`fetchAll` en el mismo hook), la tab "Auditoría" nunca terminaba de cargar. **Regla:** toda función de un hook que se vaya a usar en Reportes (o en cualquier `loadTab`-style dispatcher) tiene que ser `useCallback` — revisar el patrón de `useReportes.ts`/`useCajaTurno.ts` (todas sus `fetchX` ya son `useCallback`) antes de sumar una función nueva a ese switch.

12. **Un mismo email en `auth.users` puede terminar vinculado a 2 restaurantes por error, y el síntoma es un login que se cuelga sin error visible (jul 2026).** Supabase Auth es un usuario **por email**, no por restaurante — `user_restaurantes` sí soporta múltiples filas por `user_id` a nivel de constraint (`UNIQUE(user_id, restaurante_id)`), pero `AuthProvider` (`lib/auth/context.tsx`) resuelve el perfil con `.maybeSingle()` sobre esa tabla: con 2 filas para el mismo `user_id`, PostgREST devuelve un caso ambiguo que el código interpreta como "perfil no resuelto todavía" — reintenta 3 veces y se rinde (`perfil=null`), sin loguear ningún error claro. Pasa fácil al invitar a alguien a un restaurante nuevo con un email que ya tenía cuenta en otro (`app/api/invitar/route.ts` lo permite a propósito, comentario "puede ya existir si el usuario ya está en otra cuenta"). **Antes de crear una cuenta con un email dado**, verificar con `supabase.auth.admin.listUsers()` + `user_restaurantes` que ese email no esté ya vinculado a otro restaurante — si lo está, usar un email distinto en vez de vincular uno de más. Pasó armando la cuenta piloto de VOGLIO Farina (dos emails distintos terminaron cruzados entre Bros y Voglio).

13. **`SUPABASE_MANAGEMENT_TOKEN` (`.env.local`) y el MCP de Supabase pueden estar **ambos** vencidos/no autorizados a la vez (jul 2026).** El fallback documentado más arriba en este archivo para cuando el MCP falla es la management API con ese token — pero en la sesión del 28 jul 2026 los dos devolvían 401/"Unauthorized" simultáneamente, sin ninguna vía para correr DDL (`CREATE TABLE`/`ALTER TABLE`) disponible. Igual, el service role key (`SUPABASE_SERVICE_ROLE_KEY`) + `@supabase/supabase-js` **sigue funcionando siempre** para DML (`select`/`insert`/`update`/`delete` sobre tablas ya existentes) — alcanza para diagnosticar datos, arreglar filas sueltas o cargar seeds, pero no para crear tablas/columnas nuevas. Si una feature necesita eso y ninguna de las dos vías DDL responde, la salida pragmática es diseñar la feature sin migración (reusar una columna existente, `localStorage`, etc.) y dejarlo documentado como deuda en `PENDIENTES.md`, no bloquearse.

14. **`npx vercel --prod` no tiene token válido en este entorno de desarrollo (jul 2026).** El deploy real de KitchenOS **no depende de esta CLI** — ocurre vía el webhook GitHub→Vercel disparado por `git push` a `main` (documentado en `CLAUDE.md`), completamente independiente del `VERCEL_TOKEN` local. Si `npx vercel --prod --yes` tira "Error: The token provided via VERCEL_TOKEN environment variable is not valid", no es un blocker: el push ya disparó (o va a disparar) el deploy real por la otra vía — no perder tiempo reintentando la CLI.

15. **Con DDL caído (MCP + management token, ver #13), dos patrones "sin migración" ya probados en producción (29-30 jul 2026) — no reinventar un tercero.** (a) **JSONB en `restaurantes.configuracion`** para datos a nivel restaurante (ej. `plazas_custom` en `usePlazasCustom.ts`): read-modify-write completo (leer `configuracion`, spread, escribir de vuelta) para no pisar otras claves — mismo patrón que `nombres_excluidos`. (b) **Sufijo codificado en un campo de texto existente** para un número asociado a una fila puntual (ej. `recipiente_cantidad` codificado como `" ×N"` al final de `checklist_items.recipiente_nombre`, `encodeRecipienteNombre`/`parseRecipienteNombre` en `lib/ops/mise.ts`) — funciona porque el campo ya se muestra como texto libre en varias pantallas, así que el sufijo se lee bien sin parsear. Elegir (a) para datos nuevos sin fila asociada todavía, (b) para "un dato más" sobre una fila que ya existe y ya tiene un campo de texto libre a mano. Documentar el workaround en `PENDIENTES.md` como deuda ("migrar a columna real cuando vuelva el DDL"), no como bug.

16. **Un `Record<Enum, Config>` copiado en dos archivos puede tener una key con el label/color de OTRA key, y el ciclo (`nextX(current)`) puede no incluir todos los valores del tipo — ninguno de los dos casos tira error de TS.** `ProductoMiseCard.tsx` tenía `PRIO_CFG.chk = { label: 'REF', color: azul }` (idéntico a `PRIO_CFG.ref`, debía ser `{ label: 'OK', color: verde }`) y `PRIO_CYCLE = ['sp','p','ref']` sin `'chk'` — como `MisePrioridad` es un union de 4 valores pero el `Record` y el array son estructuralmente válidos con solo 3, TypeScript no avisa. Tocar el badge de prioridad en Mise nunca llegaba a "OK" verde, ni por label ni por ciclo, aunque el dict casi idéntico en `checklist/ClientView.tsx` sí estaba bien. Al copiar un `Record<TipoUnion, ...>` o un array de ciclo a un segundo archivo, verificar contra el tipo real (`grep 'export type MisePrioridad'` o similar) que estén los mismos valores, no asumir que copiar-pegar alcanza.

17. **Un hook que consulta datos de todo el restaurante, montado dentro de cada ítem de una lista, multiplica el request por la cantidad de ítems en pantalla (jul 2026).** `ItemOps.tsx` (una tarjeta de tarea en OPS) llamaba `useProduccionRegistros()` — un hook con un `useEffect` que trae `produccion_registros` completo del restaurante — para tener `registrar()` disponible al completar una preparación. Con 40-70 tareas en pantalla (normal en el board de Producción), eran 40-70 requests idénticos y otros tantos `setState` en cada carga, y era buena parte de la demora percibida al tildar en servicio. **Fix:** extraer el hook a un componente wrapper que se monta recién cuando corresponde (acá, `ProduccionSheetConectada.tsx`, montado solo al abrir la sheet de confirmación) — no dentro del ítem de lista que se renderiza siempre. Antes de usar un hook "que trae todo X del restaurante" dentro de un componente que se repite N veces en una lista, verificar si puede resolverse con datos que ya bajan por props o si hay que aislarlo en un componente de montaje diferido.

18. **Canal de realtime sin filtrar por `restaurante_id` y sin ignorar el eco de la propia escritura → refetch de la tabla completa en cada tilde, percibido como demora (jul 2026).** El canal de `useTareas` escuchaba `postgres_changes` con `event: '*'` sin `filter`, y llamaba `mutate()` (refetch completo, `select('*')` de TODA la tabla) ante cualquier evento — incluido el que generaba la propia escritura optimista del usuario, que pisaba el optimistic con un round-trip completo apenas volvía. Con 654 filas en Bros, cada tilde disparaba ese refetch. **Fix:** `filter: 'restaurante_id=eq.' + RESTAURANTE_ID` en la subscripción; una `Map<id, timestamp>` de ids escritos por este cliente en los últimos 5s para ignorar el eco (`payload.new.id` o `payload.old.id` contra la ventana); `setTimeout` de 400ms antes de refetchear, para que un batch-insert (activar un menú) dispare un solo `mutate()` en vez de uno por fila. Patrón a copiar en cualquier hook nuevo que combine SWR + realtime sobre una tabla grande.

19. **`new Date().toISOString().split('T')[0]` para "hoy" da un resultado distinto de `hoyOperativo()` de noche en Argentina — no son intercambiables (jul 2026).** `hoyOperativo()` (`lib/ops/turnos.ts`) calcula la fecha operativa en huso Argentina con un corte configurable (antes de las ~6am cuenta como el día anterior) — es la fuente de verdad para `turno_fecha` en toda la app. `new Date().toISOString()` da la fecha **UTC**, que de noche (Argentina UTC-3) ya cayó en el día siguiente. Un badge en `ItemOps.tsx` comparaba `item.turno_fecha < new Date().toISOString().split('T')[0]` para mostrar "turno ant." — con esa comparación, una tarea creada HOY (turno_fecha correcto vía `hoyOperativo()`) podía marcarse como del turno anterior apenas pasada la medianoche UTC, bastante antes de la medianoche real local. **Regla:** cualquier comparación de fecha contra "hoy" en el dominio de turnos/producción tiene que usar `hoyOperativo()`, nunca `new Date().toISOString()` a mano.

## Anti-patrón: funciones internas usadas como JSX en React (jun 2026)

**Síntoma:** el teclado se cierra al escribir el primer carácter en un input; el focus se pierde; un formulario se "resetea" solo.

**Causa:** si definís una función DENTRO de un componente padre y la usás como `<InnerComp />` (no como `{InnerComp()}`), React trata cada nueva referencia de función como un tipo de componente distinto → unmount + remount en cada re-render del padre → se destruye el DOM incluyendo el foco activo.

```tsx
// ❌ MAL — InnerForm definido dentro de Page:
export default function Page() {
  function InnerForm() { return <input ... /> }  // nueva referencia en cada render
  return <InnerForm />                            // React la ve como componente nuevo → remount
}

// ✅ BIEN — InnerForm definido a nivel de módulo:
function InnerForm({ value, onChange }: Props) {  // referencia estable
  return <input value={value} onChange={onChange} ... />
}
export default function Page() {
  return <InnerForm value={...} onChange={...} />  // React reconoce el mismo tipo → no remonta
}

// ✅ También válido — invocar como función (inlined en el JSX del padre):
export default function Page() {
  function InnerSection() { return <div>...</div> }
  return <>{InnerSection()}</>  // no es un componente React, es JSX inlined — no hay fiber propio
}
```

**Regla:** cualquier función con inputs (focus, teclado) DEBE estar a nivel de módulo. Recibe `form` y `setForm` como props con `React.Dispatch<SetStateAction<T>>`. Pasó en `turnos/page.tsx` con `MiembroFormDatos` y `PuestoFormBody` (jun 2026).

---

## Estructura estándar

```ts
'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRestauranteId } from './useRestauranteId'

export function useXxx() {
  const RESTAURANTE_ID = useRestauranteId()   // '' mientras carga
  const supabase = createClient()             // browser client
  const [items, setItems] = useState<T[]>([])
  const [loading, setLoading] = useState(true)

  const fetchXxx = useCallback(async () => {
    if (!RESTAURANTE_ID) return              // guard OBLIGATORIO
    setLoading(true)
    const { data } = await supabase
      .from('tabla')
      .select('*')
      .eq('restaurante_id', RESTAURANTE_ID)
      .order('created_at', { ascending: false })
    setItems(data ?? [])
    setLoading(false)
  }, [RESTAURANTE_ID])                       // RESTAURANTE_ID en deps — evita stale closure

  useEffect(() => { fetchXxx() }, [fetchXxx])

  return { items, loading, refetch: fetchXxx }
  // ...CRUD functions
}
```

## Reglas inamovibles

1. **Guard al inicio de cada fetch:** `if (!RESTAURANTE_ID) return` — sin esto, los queries se disparan sin restaurante_id y devuelven datos vacíos o de otro tenant.
2. **RESTAURANTE_ID en deps de useCallback:** Omitirlo es un bug de stale closure. Si el usuario cambia de restaurante, el hook queda apuntando al viejo restaurante_id.
3. **`createClient()`** — siempre el browser client en hooks (`'use client'`). Nunca el admin client.
4. **Paginación: usar `useRef` para el número de página, NO `useState`.** Si `page` es state y está en las deps del `useCallback` del fetch, cada avance de página recrea la función → el `useEffect([fetch])` la re-dispara y resetea a página 0. El botón "cargar más" parece no funcionar. Fix aplicado en `useFacturas` (junio 2026): `const pageRef = useRef(0)`, `fetchFacturas` sin `page` en deps.

## AuthProvider — cómo funciona

`AuthProvider` (`lib/auth/context.tsx`) tiene dos `useEffect` separados para evitar deadlock:
1. Setea `user` via `onAuthStateChange` + `getSession()` fallback — sin queries DB.
2. Carga el perfil desde DB cuando `user` cambia: `user_restaurantes` (rol, restaurante_id) → `equipo_miembros` (nombre, plaza).

`useRestauranteId()` devuelve `''` mientras `loading=true` o sin perfil cargado.

**`proxy.ts` rebota `/register` (y `/login`) a `/` si ya hay sesión activa** (jul 2026) — un `<Link href="/register">` dentro de la app logueada (ej. un banner "crear tu cuenta" en la sesión demo de Q2) nunca llega a destino: el middleware ve `user` no-null y redirige a home antes de renderizar la página. **Fix:** cerrar sesión primero y recién ahí navegar. `signOut()` ahora acepta un `redirectTo` opcional (default `/login`) para estos casos: `signOut('/register')`. Pasó con `DemoBanner`.

## `kc_screen_context` — patrón para Kitchen Coach (junio 2026)

Cada pantalla escribe contexto en `localStorage` para que el Coach lo lea. Reglas:

```tsx
// SIEMPRE después de los useMemo que referencia — TypeScript lanza TS2448 si va antes
const fcPromedio = useMemo(...)   // declarar primero
const nAlertas = useMemo(...)     // declarar primero

useEffect(() => {
  localStorage.setItem('kc_screen_context', JSON.stringify({
    screen: 'nombre_pantalla',   // debe matchear la key en TOURS y SUGGESTIONS_BY_SCREEN
    // INSIGHTS accionables (no solo .length):
    topProblemas: items.filter(riesgo).slice(0, 5).map(i => ({ nombre: i.nombre, valor: i.val })),
    faltantes: items.filter(incompleto).map(i => i.nombre).slice(0, 5),
    kpis: { promedio: Math.round(fcPromedio), alertas: nAlertas },
  }))
  return () => localStorage.removeItem('kc_screen_context')
}, [/* deps reales — incluir todos los useMemo usados */])
```

**Trampas frecuentes:**
1. `useEffect` antes de `useMemo` que referencia → `TS2448: used before declaration`. Mover el useEffect después del último useMemo que usa.
2. `useEffect` no importado en el archivo (`useState` importado pero no `useEffect`) → agregar al import.
3. Propiedades de tipos incorrectas (ej. `ReporteResumen.comprasMes` no existe, es `totalCompras`) → verificar el tipo real antes de escribir el context.

## Cache SWR — patrón estándar para hooks "lista al montar" (junio 2026)

Los hooks que cargan una lista keyed por `restaurante_id` deben usar **SWR**, no `useState + useEffect`. Sin cache, cada navegación re-consulta todo desde cero → spinner + round-trip en cada entrada a la pantalla. 14 de ~24 hooks ya están migrados (`useStock`, `useRecetas`, `useTareas`, `useChecklist`, `useProveedores`, `useMenus`, `useCategoriasProducto`, `useMerma`, `useHaccp`, `useVentas`, `usePackagingGrupos`, `usePedidos`, `useEquipo`, `useCarta`).

Patrón (ver `useStock`/`useTareas` como referencia):
```ts
// Fetcher a NIVEL DE MÓDULO — la key embebe el restaurante_id
async function fetchXData(key: string): Promise<T[]> {
  const rid = key.slice('xx-'.length)
  const supabase = createClient()            // singleton @supabase/ssr 0.9 — no recrea
  const { data, error } = await supabase.from('tabla').select('*').eq('restaurante_id', rid)...
  if (error) throw error
  return data ?? []
}

export function useX() {
  const RESTAURANTE_ID = useRestauranteId()
  const supabase = useMemo(() => createClient(), [])
  const swrKey = RESTAURANTE_ID ? `xx-${RESTAURANTE_ID}` : null   // null = no fetch (guard)
  const { data: items = [], isLoading: loading, mutate } = useSWR(swrKey, fetchXData, {
    revalidateOnFocus: false, revalidateOnReconnect: true,
    dedupingInterval: 300_000, keepPreviousData: true,
  })
  // realtime → mutate(); CRUD → mutate() o mutate(optimistic, { revalidate: false })
}
```
Reglas:
1. **swrKey `null` mientras `RESTAURANTE_ID === ''`** — reemplaza el guard `if (!RID) return`.
2. **Múltiples datasets en un hook**: o un fetcher combinado que devuelve un objeto (`useHaccp`: 5 tablas → 1 fetch), o varias keys SWR (`useEquipo`: `miembros-` + `puestos-`).
3. **Fetchers parametrizados por fecha/mes NO encajan** (`useCalendario`, `useProduccion`, el filtro por rango de `useMerma`/`useVentas`): dejar la base en SWR y el filtro como `mutate(dataFiltrada, { revalidate: false })` imperativo, o no migrar.
4. Reemplazar caches manuales (`_cache`/`_cartaCache` Map) por SWR — son redundantes.

## Doble-tap / "hay que apretar dos veces" — causas reales (junio 2026)

1. **Página que es Server Component async** (`export default async function Page()` con `await getUser()` + queries) → la ruta sale `ƒ (Dynamic)` en el build → al tocar el `<Link>` Next hace un **round-trip al server antes de transicionar** → el primer tap "no hace nada" visible → el usuario toca de nuevo. Pasó con `/stock` (único item del nav así; los demás eran `○ static` y navegaban al instante). **Fix:** si el hook ya cachea con SWR, hacer la página client estática (`export default function Page() { return <ClientView/> }`, sin `await`) → ruta `○` → navega instantáneo. Verificar en el output del build qué rutas son `ƒ` vs `○`.
2. **Animación de entrada con translate por ítem** (framer-motion `staggerChildren` + `y: N` en `itemVariants`): con listas largas son >1s de elementos moviéndose y semi-transparentes; el primer tap cae sobre un target en movimiento (y el main thread queda ocupado componiendo, afectando inputs cercanos como un buscador). Pasó en `recetario`. Ver `ui.md` → "Animaciones de lista".

## API route que bypassea RLS

`/api/recetas/save` — único endpoint con `createAdminClient()`. Cuatro modos:
- `{ receta, ingredientes }` → inserta receta + ingredientes en batch
- `{ receta }` → solo receta  
- `{ addIngredientsOnly: true, ingredientes }` → suma ingredientes a receta existente
- `{ enrichRecetaId, receta: { procedimiento }, ingredientes }` → **enriquece receta existente**: borra ingredientes anteriores, inserta nuevos, actualiza procedimiento. Usado por el botón "Completar con IA" en la tab Ideas del recetario.

Llamar desde `useRecetas.agregarReceta`, no directamente desde el browser.

## AuthProvider — race de hard-navigation (junio 2026)

En F5 / URL directa el cookie de sesión está, pero el access token puede **no estar adjunto a la primera query** → RLS devuelve vacío → `user_restaurantes` da `null`. El código viejo seteaba `perfil=null` + `loading=false` **permanente** → el header mostraba `??`. **No había** "timer de 3s" (el doc lo afirmaba pero nunca existió).

Fix en `lib/auth/context.tsx`:
1. `loadPerfil(u, attempt)` **reintenta** con backoff (`PERFIL_RETRY_MS * (attempt+1)`, hasta `PERFIL_MAX_RETRIES=3`) cuando `ur` viene null o la query tira error. Durante los reintentos `loading` queda `true` → spinner, nunca `??`. En el 2º intento el token ya está adjunto.
2. **Safety timeout** (`PERFIL_SAFETY_MS=10000`): `useEffect` que fuerza `loading=false` si la resolución se cuelga (red muerta), para no spinear infinito.
3. `giveUp()` usa `setPerfil(prev => prev)` (no `setPerfil(null)`) para **no pisar** el perfil que `signUp` setea en paralelo durante el alta.

## Kitchen Coach — datos reales + acciones server-side (M1/M5, junio 2026)

`app/api/coach/route.ts` usa el **server client** (sesión del usuario → RLS por tenant automático), NO el admin client.
- **M1 (`buildSnapshot`)**: consulta en vivo stock crítico/bajo (`productos`, los 120 de menor stock), vencimientos ≤3 días (`haccp_vencimientos` status `vigente`/`por_vencer`), facturas pendientes (`facturas`). Se inyecta al system prompt. Acotado + `try/catch` por sección (falla seguro, no rompe el chat).
- **M5 (tool use)**: loop agéntico server-side (hasta 4 vueltas: modelo → `tool_use` → ejecutar → `tool_result` → modelo). 3 tools: `crear_tarea` (inserta `tareas` con `seccion='general'`, `turno_fecha=hoy`, `checklist='[]'`), `marcar_86` (`carta_items.disponible=false` con `.ilike('nombre', '%x%')`), `registrar_merma` (inserta `merma` + descuenta `stock_actual` si matchea producto). **`restaurante_id` se resuelve de la sesión (`user_restaurantes`), nunca del body** — RLS igual lo enforcea en el WITH CHECK. Cada tool devuelve un **string** (resultado o error) que vuelve al modelo. El cliente (`useKitchenCoach`) no cambió: sigue leyendo `data.content[0].text`.

## usePermisos — resolución de módulos efectivos (junio 2026)

Orden de prioridad para `puedeVer(modulo)`:
1. `isAdmin` → siempre true
2. Si el usuario tiene `equipo_miembros.puesto_id` vinculado: módulos del puesto (`puestos.permisos_app`) + `modulos_extra` − `modulos_restringidos`
3. Fallback: `rol_permisos.modulos_visibles` (sistema anterior)

El hook carga el puesto via `equipo_miembros WHERE auth_user_id = user.id`. Si el usuario no tiene fila en `equipo_miembros`, usa el fallback.

## OPS mise — suma acumulativa por receta+plaza

`plato_recetas.cantidad_ops` guarda la contribución individual de CADA plato. El `checklist_items.cantidad` es la suma de TODAS las contribuciones de la misma `receta_id+plaza`. Cada vez que se guarda el panel OPS en carta, se recalcula el total:

```ts
const { data } = await supabase
  .from('plato_recetas')
  .select('cantidad_ops')
  .eq('receta_id', pr.receta_id)
  .eq('plaza', opsPlaza)
  .not('cantidad_ops', 'is', null)
const total = data.reduce((s, r) => s + (r.cantidad_ops ?? 0), 0)
// RLS filtra por restaurante via plato_id → carta_items
```

No hacer UPDATE directamente con el valor ingresado — siempre recalcular la suma.

## OPS mise — helper compartido `lib/ops/mise.ts` (jul 2026)

Escribir un ítem del mise (`checklist_items` keyed por `restaurante_id + receta_id + plaza`) tiene una única fuente de verdad: `upsertMiseChecklistItem({ supabase, restauranteId, recetaId, nombre, plaza, seccionMiseId, cantidad, unidad, recipienteNombre?, pesoPorcion?, pesoPorcionUnidad? })`. Busca/crea la `checklist_secciones` de la plaza (por `SECCIONES_OPS`) y hace el upsert. Lo usan **Carta** (`handleComposicionSave`) y **Recetario** (`RecetaOpsSheet`, botón OPS de la ficha) — no duplicar esa lógica en un tercer lugar.

Las constantes `PLAZAS_OPS` / `SECCIONES_OPS` viven en `lib/ops/mise.ts` y se **re-exportan** desde `carta/ComposicionEditor` (`import { … } from '@/lib/ops/mise'; export { … }`) para no romper los `import … from './ComposicionEditor'` existentes. Importar desde `@/lib/ops/mise` en código nuevo (evita el import circular con el editor).
