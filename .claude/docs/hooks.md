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

18. **Canal de realtime sin filtrar por `restaurante_id` y sin ignorar el eco de la propia escritura dispara un refetch completo en cada evento**, incluido el de la propia escritura optimista. Patrón: `filter: 'restaurante_id=eq.'+RESTAURANTE_ID`; `Map<id,timestamp>` de ids propios recientes para ignorar el eco; debounce (~400ms) antes de refetchear para que un batch dispare un solo `mutate()`. La parte del `filter` la verifica `lib/ingenieria/ratchets.test.ts` (ago 2026) para toda tabla con `restaurante_id` propio — el eco/debounce sigue siendo manual, no está en el ratchet.

19. **`new Date().toISOString().split('T')[0]` nunca es "hoy" en Argentina — pero el reemplazo correcto depende del dominio.** `toISOString()` da UTC, que de noche (UTC-3) ya cayó en el día siguiente. Dos helpers de `lib/ops/turnos.ts`, no intercambiables: `hoyOperativo()` (fecha operativa con corte configurable, antes de ~6am = día anterior — turnos/producción, fuente de verdad para `turno_fecha`) vs `fechaEnTz(new Date(), TZ_DEFAULT)` (fecha calendario real en ART, sin corte — para todo lo que no es turno: HACCP, timestamps de exports/PDF, cualquier "fecha de hoy" que un humano espera ver como la fecha real, no la del turno). Bug real encontrado dos veces con `toISOString()` a mano: en `turnos.ts` original, y en HACCP (`haccp/page.tsx`, ago 2026) — mostraba la fecha del día siguiente en pantalla y en el PDF a Bromatología a partir de las ~21h.

   **Y si además necesitás el turno, pedilos juntos: `turnoVigente({turnos})`, nunca `hoyOperativo()` + `turnoActivo()` por separado.** Esos dos miran en direcciones opuestas y combinados devuelven pares (jornada, turno) que nunca existieron: entre el corte de jornada (05:00) y el arranque del primer turno (09:00), `hoyOperativo` ya rodó a hoy mientras `turnoActivo` sigue arrastrando el último turno de ayer — la pantalla abre en el turno equivocado justo cuando llega el que abre la cocina. `turnoActivo` mira hacia atrás **a propósito** (para que un tilde a las 02:00 se atribuya a la cena que se está cerrando, no quede huérfano); es correcto para atribuir un registro y equivocado para elegir qué mostrar. `turnoVigente` resuelve los dos valores acoplados y además respeta el pase de turno si le pasás `plaza`+`entregados`. Bug real encontrado ago 2026 al construir la rutina de turno, donde el helper se eligió por nombre.

20. **`const supabase = createClient()` sin `useMemo` en un hook rompe cualquier `useCallback`/`useEffect` que dependa de una función del hook.** `createClient()` (`lib/supabase/client.ts`) NO es singleton — crea un `SupabaseClient` nuevo en cada llamada. Si el hook lo asigna directo (sin memoizar) y alguno de sus `useCallback` lo tiene en deps, esa función cambia de referencia en cada render del hook → un `useEffect` de la pantalla que la usa como dep se re-dispara sin parar → loop de fetches que deja la pantalla trabada en "Cargando..." de forma intermitente (no siempre visible, pero pega igual en costo de red). Fix: `const supabase = useMemo(() => createClient(), [])` — patrón ya usado en `useTareas.ts`/`useMenus.ts`. Verificado por `lib/ingenieria/ratchets.test.ts` (ago 2026).

21. **Dos pantallas que se sincronizan entre sí tienen que compartir la cache, o avisarse a mano.** Si una guarda su lista en una key SWR compartida y la otra en un `useState` propio, el sync anda para un lado y para el otro no — y se percibe como "tarda varios segundos", no como "no funciona", porque el dato aparece cuando algún efecto no relacionado dispara un refetch. Agrava el diagnóstico que **las tabs de OPS no se desmontan** (`display:none` en `operaciones/page.tsx`): volver a una tab NO la remonta ni refetchea nada. Opciones: mover la lista a SWR con key compartida, o un emitter a nivel de módulo que parchee el estado (patrón de `lib/ops/miseBus.ts`, instantáneo y sin red, pero solo dentro de la misma pestaña).

22. **Para suscribir a realtime una tabla que no tiene `restaurante_id`, agregar la columna con un TRIGGER, no desde el cliente.** El `filter` obligatorio (#18) necesita la columna en la fila replicada. Llenarla con un `BEFORE INSERT OR UPDATE` que la derive de la tabla padre gana dos cosas: ningún writer cambia (ni las API routes, ni el celular que quedó con el bundle viejo abierto en pleno servicio) y el valor es autoritativo — se ignora lo que mande el cliente, así que no se puede escribir una fila con el tenant de otro. Ejemplo: `checklist_registros` (migración `20260806b`).

23. **Al parchear estado desde realtime, descartar el eco de la escritura propia.** Cada write vuelve por el canal 1-3s después; aplicarlo tarde puede pisar un cambio posterior (tildar y destildar rápido deja ganando al tilde viejo). `Map<clave, timestamp>` de escrituras propias + ventana de ~3s, con poda cuando el Map crece. Distinto de #18, que es sobre no *refetchear* por el eco: acá el problema es el orden, no el costo.

24. **Crear una fila y esperar el `await` del insert antes de limpiar el input de captura es una carrera real, no cosmética.** Un editor tipo "Enter crea la siguiente línea" que hace `await agregarFila(...)` antes de vaciar el campo deja el input con el texto viejo durante el round-trip; si el usuario ya empezó a tipear la línea siguiente, el nuevo texto se concatena al anterior en vez de crear una fila propia (bug real en Bitácora, ago 2026: tipear rápido Enter→Tab→seguir escribiendo pegaba dos líneas en una). Fix: generar el `id` en el cliente (`crypto.randomUUID()`), actualizar el estado local (y limpiar el input) *antes* del `await`, mandar el insert con ese id explícito — la escritura corre en segundo plano, nunca bloquea el próximo tap. Mismo principio que "Escrituras del camino crítico" arriba, aplicado a creación, no solo a edición.

25. **Un input que solo vive en memoria hasta un commit explícito (Enter/blur) se pierde en un refresh o al cerrar la pestaña si el usuario no llegó a disparar ese commit.** No alcanza con guardar al montar/desmontar el componente — un `reload()` mata el JS sin correr el cleanup normal a tiempo para completar un `await` de red. Flush en `visibilitychange` (tab a segundo plano — confiable) + intento best-effort en `beforeunload` (no garantizado: el navegador puede cortar el fetch a mitad de camino) + flush en el cleanup del `useEffect` al desmontar/cambiar de entidad (100% confiable, es navegación dentro de la SPA). Usar una `ref` actualizada en cada render para leer el valor más reciente dentro del handler, no la clausura del `useEffect` (que solo se reinstala si sus deps cambian).

26. **Cuando la visibilidad de la fila A depende de una columna de la fila embebida B (ej. `checklist_items` filtrado por `menus.vigencia_hasta`), el canal de realtime necesita un `.on(...)` propio sobre la tabla B además del de A.** Un UPDATE en B no toca ninguna fila de A, así que el listener de A nunca dispara y el cliente queda con el embed viejo hasta el próximo refetch manual. Agregar `.on('postgres_changes', {event:'UPDATE', table:'B', filter}, () => mutateConfig())` al mismo canal (`useChecklist.ts`, suscripción a `menus` adjunta a la de `checklist_items`, ago 2026).

27. **Un `delete` + `insert` (o cualquier secuencia de writes que deban ganar o perder juntos) hecho como 2+ llamadas separadas desde el browser no es atómico** — un corte de red entre medio deja el estado a mitad de camino, no revertido. Empaquetar en una función Postgres (`SECURITY INVOKER` — corre con el RLS de quien llama, no hace falta bypass) y llamarla con `.rpc(nombre, params)`: el cuerpo de la función es una transacción implícita. Ejemplo: `reemplazar_menu_preparaciones` (migración `20260831`, reemplaza el `update+delete+insert` que tenía `useMenus.actualizarMenu`). Para el otro caso típico de carrera — un `SELECT` (¿ya existe?) seguido de `INSERT` si no — el fix no es una transacción sino un `UNIQUE INDEX` (parcial si aplica, `WHERE estado='...'`) más atrapar el `23505` en el catch y releer la fila ganadora en vez de tratarlo como error (ejemplo: `useMesas.abrirCuenta` + `cuentas_mesa_abierta_unica`, misma migración).

28. **Un invariante agregado ("¿están todas las filas hijas en estado X?" → actualizar la fila padre) recalculado en el cliente sobre su propia copia local (SWR/cache) es una carrera real entre dos dispositivos, no solo entre dos llamadas del mismo cliente.** Cada dispositivo ve su propio snapshot stale de las filas hermanas; si dos escriben ítems distintos del mismo padre casi a la vez, ninguno concluye "están todas" y el padre queda sin transicionar aunque en DB ya estén todas listas. Fix: mover el chequeo a un trigger `AFTER UPDATE FOR EACH ROW` sobre la tabla hija, que lea el estado real (no una copia) dentro de la misma transacción del UPDATE, con `SELECT ... FOR UPDATE` sobre la fila padre para serializar transacciones concurrentes en vez de dejarlas leer datos viejos en paralelo. El cliente deja de escribir la fila padre por su cuenta — solo el camino offline-optimista (si existe) sigue calculándolo en memoria, porque ahí todavía no hay nada que el trigger pueda ver hasta reconectar. Ejemplo: `trg_comanda_items_bump_actualiza_comanda` (migración `20260831d`, dispara solo al pasar a `'bumpeado'`) reemplazando el cálculo de "todos los ítems bumpeados ⇒ comanda lista" que tenía `useComandas.ts`.

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

## Convención — dónde va una operación compartida

Día 10 de `plan-consolidado.md` §2 (arquitectura-kos.md acción 🟡-6): la
firma ya es la convención de facto del proyecto — se escribe acá para que la
próxima extracción no se invente otra forma.

**Una operación (lectura o escritura) que la necesitan ≥2 pantallas, o
cliente Y servidor, va como función a nivel de módulo en `lib/<dominio>/`
con esta firma:**

```ts
function operacion(
  supabase: SupabaseClient,     // el caller decide qué cliente (browser/server/admin)
  restauranteId: string,        // el tenant viaja explícito, nunca implícito
  input: {...}                  // datos de la operación
): Promise<Resultado>
```

Modelo: `upsertMiseChecklistItem` (`lib/ops/mise.ts`). Misma firma en
`activarMenuParaFechas` (`lib/menus/activarMenu.ts`), `sincronizarMiseDeMenu`
(`lib/ops/menuMise.ts`) y cada `execute` del registry del Coach. Al recibir
el cliente por parámetro, la misma función corre desde un hook del browser
(RLS por sesión), desde un endpoint (server client) o desde una tool del
Coach — sin copias, sin `'use client'`, testeable pasando un mock. Detalle y
motivación completa: `.claude/docs/ingenieria/arquitectura-marco.md` §2.2.

**Tabla de decisión — ¿dónde va el código que estás por escribir?**

| El código… | Va en | Por qué |
|---|---|---|
| Cálculo puro (costos, conversiones, clasificación, máquina de estados) | `lib/<dominio>/` sin `'use client'`, **con test** | Es el único lugar desde donde lo importan cliente Y servidor |
| Query de lectura para una pantalla | Fetcher a nivel de módulo dentro del hook (patrón SWR de arriba) | Ya está fuera del cuerpo del hook; si mañana lo necesita el server, se muda a `lib/` sin reescribirse |
| Escritura simple (1 tabla, sin invariantes) | Función CRUD del hook | El costo de indirection no se justifica |
| Escritura que comparten ≥2 pantallas o cliente+servidor | Función con la firma de arriba en `lib/<dominio>/` | Es esta convención |
| Escritura de ≥2 tablas que tiene que salir todo-o-nada | Función de Postgres (`supabase.rpc(...)`) o endpoint | El browser no puede abrir transacciones |
| Operación con secreto (API key, certificado) | Endpoint, siempre | `NEXT_PUBLIC_*` va al bundle; lo demás solo existe en el server |
| Operación que necesita saltear RLS | Endpoint con `requireRestauranteId()` primero y `createAdminClient()` después | El admin client sin identidad verificada es la llave maestra tirada en la puerta |
| Llamada a servicio externo (IA, AFIP, impresora) | A través de su puerto en `lib/<servicio>/` | Mismo criterio que `lib/ia/errores.ts` |

**Cuándo NO separar:** un hook CRUD chico (fetcher de 10 líneas + insert/
update/delete de 10 líneas cada uno) no gana nada con la extracción — se paga
cuando la lógica se comparte o se testea, no antes.

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

**La cascada es una sola función, en `lib/permisos/resolver.ts`** — la importan el hook cliente y la réplica server-side del Coach (`lib/permisos/server.ts`). Estuvieron duplicadas y sincronizadas a mano con un comentario que pedía acordarse; no alcanzó, y en ago 2026 las dos tenían los mismos dos bugs. Cualquier cambio de semántica va ahí, no en los consumidores.

**`permisos_app = []` es truthy.** La columna es `NOT NULL DEFAULT '{}'`, así que un puesto recién creado y sin módulos cargados llega como array vacío. Tratarlo como lista válida deja al usuario con CERO módulos visibles; `resolverModulosEfectivos()` devuelve `null` en ese caso — "no configurado", que cae al fallback por rol. Los admin nunca lo notaron porque `puedeVer` corta antes.

**`'inicio'` es alias legacy de `'home'`.** El seed viejo de `rol_permisos` escribía `'inicio'` mientras `RUTA_A_MODULO['/']` siempre pidió `'home'`: todo no-admin quedaba con "Sin acceso a home" en el dashboard. Los datos se migraron y el seed vive tipado en `lib/constants.ts` (`MODULOS_SEED_POR_ROL_DB`, `ModuloId[]`), pero el resolver sigue aceptando el alias al **leer** por si vuelve a entrar a mano. Regla derivada: `RouteGuard` **nunca** bloquea `'/'` — un candado en la home es indistinguible de una app rota, el usuario no tiene ni adónde volver.

**`verCostos` es un permiso aparte de los módulos.** Precios de compra, costo de receta, food cost, margen y stock valorizado se gatean con `usePermisos().verCostos`, no con `isAdmin`. Cascada propia: admin → `equipo_miembros.ver_costos` (null = hereda) → `puestos.ver_costos` → `rol_permisos.puede_ver_costos`. Default `false` en todo: equivocarse ocultando un costo es barato, al revés no. En el server (Coach) se resuelve con `getPermisosServer().verCostos` y se filtra **antes** de armar la respuesta — el modelo no puede decir un número que nunca recibió.

**SWR con key compartida** (`restaurante_id+user_id+dbRol`) entre `RouteGuard` y cualquier pantalla que llame `usePermisos()` por su cuenta — dedupe automático, no dispara un fetch por cada uno. `fetchPermisos()`/`updatePermisos()`/`upsertPermisos()` llaman `mutate()`, que revalida esa key para TODOS los componentes montados que la comparten, no solo el que escribió — un cambio de permisos en Configuración se refleja solo en el sidebar/RouteGuard de otra pantalla ya abierta, sin remount. `restaurantes.configuracion` (para `perfilRestaurante`) sale de `useRestauranteConfig()`, nunca de una query propia.

**`MODULOS_ASIGNABLES`** (`app/(app)/turnos/page.tsx`) es la lista de módulos que el dueño puede tildar para un puesto/miembro desde la UI — tiene que cubrir todo `ModuloId` gateado en `SidebarNav.SECCIONES` o no hay forma de asignarlo (bug real, ago 2026: cubría 16 de 27). `'coach'` queda afuera a propósito: nunca está en `RUTA_A_MODULO`, el acceso es siempre libre. Ojo: `RUTA_A_MODULO` colapsa `/tareas`, `/checklist` y `/produccion` al permiso `'operaciones'` — restringir esos tres módulos individuales solo oculta el link del sidebar, la ruta directa sigue abierta si el puesto tiene `'operaciones'`.

**`RUTA_A_TOUR` es un mapa separado de `RUTA_A_MODULO`**, ambos en `lib/constants.ts`. Un módulo nuevo con permiso y sidebar bien cableados igual nunca dispara el tour automático (`useTourAutomatico`) si falta su entrada en `RUTA_A_TOUR` — el `TourStep[]` puede existir completo en `lib/coach/tours.ts` y nunca arrancar solo, solo por el chip "Ver recorrido" del Coach. Cablear los dos mapas siempre juntos al agregar una pantalla.

**Ni `RUTA_A_TOUR` ni `TOURS` alcanzan solos**: `useTourAutomatico` dispara el evento `kc-welcome-app`, pero es `KitchenCoachFAB` el que decide QUÉ tour mostrar leyendo `kc_screen_context.screen` de `localStorage` — si la pantalla no lo escribe (patrón de arriba), el tour queda registrado pero nunca aparece, sin error visible (encontrado 27/08: `configuracion`, `kds`, `muro`, `bitacora` tenían tour completo en los dos mapas y ninguno disparaba). Además, la pantalla tiene que vivir bajo un layout que monte `KitchenCoachFAB` — `app/(servicio)/layout.tsx` (KDS/Muro) deliberadamente no lo hace (doctrina "Registro Servicio", `DESIGN.md` §2), así que un tour ahí no tiene mecanismo para mostrarse aunque los tres pasos anteriores estén bien hechos.

**Agregar un `ModuloId` nuevo no lo habilita para puestos ya creados.** `permisos_app` es un array que queda congelado en el momento en que se crea el puesto desde la UI — sumar el módulo a `MODULOS_POR_ROL`/`MODULOS_ASIGNABLES` en código no lo retroactiva. Un usuario logueado con un puesto (no admin) sigue sin ver el módulo nuevo hasta que alguien lo tilda a mano en Turnos → Puestos → editar, o se hace un backfill puntual por SQL (`array_append(permisos_app, 'modulo')`). Si alguien reporta "no veo el módulo X" después de un deploy con un módulo nuevo, preguntar primero con qué cuenta/puesto está logueado y chequear su `permisos_app` antes de asumir que es un bug — con la cuenta admin nunca pasa (bypassea todo).

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

**Una sola puerta de activación por tipo de menú** (ago 2026, decisión de producto): un menú **fijo** se activa SOLO por vigencia en el mise — `ComposicionEditor`, `MenusView` y el picker de Planificación no ofrecen `activarMenuParaFechas` para fijo. Un **evento** se activa por default SOLO por fecha directa a Producción (`activarMenuParaFechas`) — `MenusView` no le ofrece el botón "Activar en el mise" (evita que dispacharlo desde el mise duplique la tarea que ya creó la activación por fecha). **Matizado 22/08 (ver `DECISIONES.md` §21): un evento SÍ puede terminar con presencia en el mise** (activado antes de esta convención, o porque `carta/page.tsx` vuelve a sincronizar con `sincronizarMiseDeMenu` cualquier menú/evento que YA tenga `checklist_items`, sin mirar `tipo`, cada vez que se edita — a propósito, no es un bug). Cuando eso pasa, **siempre** tiene que ir a la plaza dedicada `'menu'`, nunca repartido por plaza real ni en `'general'` — por eso el editor sí muestra vigencia/plaza de control para `modo === 'evento'` igual que para `'menu'`.

Dos sistemas distintos que parten del mismo `menu_preparaciones`, escriben a tablas distintas y no se enteran uno del otro:
- **`activarMenuParaFechas`** (arriba) → `tareas`, una fila por preparación por día, checkbox único (pendiente/listo). Para "producí este evento tal día/rango".
- **`sincronizarMiseDeMenu`** (`lib/ops/menuMise.ts`) → `checklist_items` con `menu_id`, keyed por `(restaurante_id, menu_id, plaza, nombre)` — **no** por `receta_id`, porque pisaría el ítem permanente del mise fijo si el menú reusa una receta que la carta ya tiene ahí. Persistente y re-chequeado en cada apertura/cierre mientras `menus.vigencia_desde/hasta` cubra el día (`menuItemVisible()`). Para "esto tiene que estar siempre stockeado mientras dure el menú fijo" (ej. un ejecutivo de 1-2 semanas). Idempotente + prune: correr de nuevo tras editar el menú, no acumula ni deja huérfanos. **El botón "Activar en el mise" vive en dos pantallas** (Carta → Menús y Operaciones → Planificación) — las dos llaman este mismo `sincronizarMiseDeMenu`, no hay una segunda implementación.
- **`menus.plaza_control`**: si está cargada, `sincronizarMiseDeMenu` pisa la `plaza` de CADA preparación con esta — todo el menú lo controla una sola plaza en vez de repartirse por estación. Plaza sugerida y default para menús fijos nuevos: **`'menu'`**, una plaza dedicada del mise (ámbar en `PLAZA_COLORS`, NO física — nunca entra a `PLAZAS_FIJAS`/`todasLasPlazas`, solo aparece en el selector del mise cuando hay ítems ahí). **Nunca usar `'general'` como plaza de control**: `'general'` es la plaza que se inyecta en TODAS las demás plazas del mise (ver el filtro de `checklist/ClientView.tsx`), así que cada preparación de un menú con `plaza_control='general'` aparecía duplicada en Parrilla/Fríos/Calientes/Pastelería/Panadería a la vez — y la sección "Estación" que crea quedaba como card vacía en toda plaza real (bug real, Bros, fix ago 2026 — migración `20260820_menu_plaza_dedicada.sql` reasignó lo existente de `'general'` a `'menu'`). En el editor, `OpsPanel` recibe `forcedPlaza` y directamente no deja elegir plaza por ítem (arranca en "Sección", ya scopeado). Dos preparaciones con el mismo nombre que caen en la misma plaza de control colisionan en la misma clave — `sincronizarMiseDeMenu` las deduplica dentro de una misma corrida, no inserta la segunda. Con `plaza_control` activo, la **sección también deja de ser obligatoria** por ítem — el objetivo es activar el menú entero sin tocar OPS ítem por ítem, así que cae en `SECCION_CONTROL_DEFAULT` ('estacion') si el ítem no eligió una propia. Sin `plaza_control`, plaza Y sección siguen siendo obligatorias por preparación, igual que siempre.
- **`checklist_items.menu_paso`** guarda el paso real del menú (Apetizer/Proteína/Pasta/...), copiado de `menu_preparaciones.paso` al sincronizar. Sin esto, despachar un déficit desde el mise forzaba `seccion:'general'` y abría una columna "General" DENTRO de la banda Menú de `ProduccionBoard`, al lado de las columnas reales que ya había creado `activarMenuParaFechas` para la misma preparación — misma receta, dos columnas distintas.
- **`estadoMiseMenu(menu, hoy)`** (`lib/ops/menuMise.ts`) — deriva `{sinVigencia, vigenciaVencida, vigenciaFutura, vigente}` a partir de `vigencia_desde/hasta`. Fuente única para el chip/botón "Activar en el mise", compartida entre `MenusView` (Carta) y el picker de Planificación — no reimplementar la comparación de fechas en un tercer lugar.
- **Despachar una tarea desde el mise (`handleCrearTarea`, `checklist/ClientView.tsx`) debe mirar `checklist_item.menu_id` Y el tipo del menú.** Si el ítem viene de un menú, la tarea va sin `plaza`, con `seccion: menu_paso ?? 'general'` y `modo: 'evento'` o `'menu'` según `checklist_items.menus.tipo` — nunca `modo: 'carta'`, ni `'menu'` forzado para un evento (lo dibujaba en la banda MENÚ mientras su gemela del lote vivía en EVENTO), ni un `seccion` hardcodeado. El `select` de `useChecklist` trae `menus(nombre, tipo, vigencia_desde, vigencia_hasta)` justamente para eso.

`TAREA_PRIO_TO_MISE`/`MISE_PRIO_TO_TAREA` (`lib/ops/mise.ts` y `components/mise/ProductoMiseCard.tsx`) son inversos entre sí — si se toca uno, tocar el otro.

## Una preparación, una fila — `lib/ops/dedupeTareas.ts`

Producción recibe el mismo trabajo por cuatro caminos que no se ven entre sí: el tilde del mise (deja `checklist_item_id`), el cierre que lo pasa al turno siguiente (`categoria: 'pase_turno'`), la activación de un menú por fecha (inserta en lote, **sin** `checklist_item_id`) y el QuickAdd del board. La identidad de una tarea de producción es `turno_fecha + columna del board + menu_id + título normalizado` (`claveTarea()`), y **no** incluye la categoría ni el `checklist_item_id` — ésas eran justamente las dos cosas que partían el mismo trabajo en dos filas.

- **`categoria` fuera de la clave**: `produccion` y `pase_turno` son dos formas de pedir el mismo trabajo, y con dos turnos por día el pase cae sobre la MISMA `turno_fecha` (cerrando el almuerzo, "el turno siguiente" es hoy). Ése era el duplicado más visible: lo que dejaba un turno al lado de lo que marcaba el que entraba.
- **`checklist_item_id` fuera de la clave**: la fila del lote de un menú no lo tiene y la despachada desde el mise sí. Al despachar se **adopta** la del lote (se le escribe el FK) en vez de poner una segunda al lado.
- **`columna del board`** = `plaza` para `modo: 'carta'`, `seccion` (el paso del menú) para `menu`/`evento`. Tiene que coincidir con el eje de columnas de `ProduccionBoard`: si divergen, la clave fusiona filas que el board dibuja separadas, o al revés.

Dónde se aplica:
- **Al escribir**: `useTareas.agregarTarea` es el único lugar. Cubre Mise, board, Pase, Control de Carta y Calendario de una sola vez — no agregar un guard propio en una pantalla nueva. Si ya hay fila para ese trabajo devuelve **esa** en vez de crear otra. `esProduccionDelDia()` define el borde: las anotaciones libres (`categoria: 'general'`), las notas de pedido y las subtareas quedan afuera y pueden repetir texto a propósito.
- **Al leer**: `fusionarDuplicados()` en `tareas/ClientView.tsx` colapsa las gemelas en una fila. `gemelosPorId` baja por ref hasta los handlers: tildar o repriorizar tiene que mover a **todo** el grupo, si no la gemela revive en el próximo fetch. Los contadores del día y el badge de OPS cuentan filas fusionadas, no inserts.
- Los inserts en lote que no pasan por el hook (`activarMenuParaFechas`, `useMenus`, sugerencia de producción) deduplican por su cuenta antes de insertar — la sugerencia con `tareaExistentePara()` contra las tareas del día.

El candado contra el doble tap es un `Map<clave, Promise>` **de módulo** (no un ref por componente: el Mise y el board son componentes distintos que pueden despachar lo mismo a la vez). Guarda la promesa, no un booleano, así el segundo tap se cuelga del primero y recibe la misma tarea. **Falta**: dos dispositivos distintos en el mismo segundo siguen pudiendo crear una gemela — invisible en pantalla (el board fusiona), pero queda en la base. Se cierra con una restricción en Postgres, ver `PENDIENTES.md`.

## Peso de la pantalla — el hook completo no siempre es el que va

Antes de montar un hook en una pantalla, mirar qué baja realmente. Reglas:

1. **Variante lite cuando solo se necesitan nombres.** `useRecetas` trae cada receta con todos sus ingredientes y le calcula el food cost (medio mega en una cuenta real). Para autocompletar o mostrar porciones va `useRecetasLite` (key SWR propia, compartida entre pantallas). Mismo criterio para cualquier hook "pesado" que se use solo por un campo.
2. **`{ soloEscritura: true }`** en hooks que la pantalla usa únicamente para escribir (`useTareas`, `useHaccp`): pone la `swrKey` en `null` y no descarga nada; al escribir invalida la key real con `useSWRConfig().mutate(key)` para que las pantallas que sí muestran la lista se enteren.
3. **Ventana de historia en tablas que crecen todos los días.** `tareas` suma ~40 filas diarias: el fetcher acota a 60 días (`turno_fecha.is.null,turno_fecha.gte.X` vía `.or`). El histórico largo lo consulta Reportes por su cuenta.
4. **Realtime SIEMPRE con `filter: restaurante_id=eq.X`.** Sin el filter llegan las escrituras de todas las cuentas y disparan refetch en todos los dispositivos.
5. **Si el realtime no conecta en ningún lado, revisá la clave por caracteres invisibles antes que el código.** REST tolera un `\n` o un espacio al final de `NEXT_PUBLIC_SUPABASE_ANON_KEY`; realtime manda la clave en el query string del WebSocket y el handshake devuelve **401** (en la consola del browser se ve como `apikey=sb_publishable_...%0A`). Falla del lado del cliente, sin error de servidor: estuvo caído en prod sin que nada avisara. Las claves se leen siempre por `lib/supabase/env.ts`, que hace `.trim()` — recibe el **valor** y no el nombre, porque Next.js inlinea las `NEXT_PUBLIC_*` por reemplazo estático del texto y un `process.env[nombre]` dinámico llega `undefined` al browser.
6. **`restaurantes.configuracion` se lee por `useRestauranteConfig()`** (una sola key SWR compartida). Nunca una query propia: hay hooks que viven dentro de cada fila de una lista y terminan pidiendo la misma fila una vez por ítem.

Medirlo, no estimarlo: `node scripts/shot.mjs --ruta /x --net` imprime kB y requests por tabla de una pantalla.

## Escrituras del camino crítico — optimista primero, sin refetch

Todo lo que el usuario tapea esperando feedback inmediato (tildar un ítem, cambiar un estado) actualiza el estado local en el mismo frame y **después** manda la escritura; si falla, se refetchea contra el servidor como rollback. Nunca `await escritura → await refetch` antes de pintar: son round-trips en serie y en la cocina, con 4G, se sienten como un segundo de nada por tap. Si el tap dispara varias escrituras (registro del mise + tareas vinculadas), van en `Promise.all`, no encadenadas.

Corolario: `loading` es de la **primera** carga. Un flag que se prende en cada refetch deja la lista en blanco al cambiar de tab o de fecha, que es lo que se percibe como "navegar lento".
