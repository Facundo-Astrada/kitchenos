# Patrón de hooks — KitchenOS

## Gotchas de Supabase (jun 2026)

1. **Tablas/columnas nuevas → recargar el schema cache de PostgREST.** Tras crear una tabla o columna por migración, el cliente browser (supabase-js, vía PostgREST con anon key) **no la ve** hasta recargar el cache → insert/select "no hacen nada" / no persisten / lista vacía. Pero el SQL directo (management API) la ve enseguida. Síntoma clásico: el INSERT simulando RLS funciona, pero desde la app no. **Fix:** `NOTIFY pgrst, 'reload schema';` (sumarlo al final de TODA migración que cree tablas/columnas) y verificar con un GET REST `…/rest/v1/<tabla>?select=id&limit=1` (debe dar 200). Pasó con `menus`/`menu_preparaciones`.

2. **Los errores de Supabase NO son instancias de `Error`.** Son objetos `{ message, code, details }`. Un `catch (e) { e instanceof Error ? e.message : 'desconocido' }` traga el mensaje real → siempre "desconocido". Extraer así: `const msg = e instanceof Error ? e.message : (e && typeof e === 'object' && 'message' in e) ? String(e.message) : 'desconocido'`.

3. **Insert directo no actualiza el SWR de otro hook.** Si insertás con `supabase.from(...).insert()` directo (no vía la función del hook), el cache SWR de `useTareas`/etc. solo se entera por el **realtime** (1-3 s). Para refresco inmediato, llamar `refetch()`/`mutate()` del hook justo después del insert. (Ver `activarMenu` en produccion/page.tsx.)

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
