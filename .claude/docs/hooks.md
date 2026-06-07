# Patrón de hooks — KitchenOS

## Gotchas de Supabase (jun 2026)

1. **Tablas/columnas nuevas → recargar el schema cache de PostgREST.** Tras crear una tabla o columna por migración, el cliente browser (supabase-js, vía PostgREST con anon key) **no la ve** hasta recargar el cache → insert/select "no hacen nada" / no persisten / lista vacía. Pero el SQL directo (management API) la ve enseguida. Síntoma clásico: el INSERT simulando RLS funciona, pero desde la app no. **Fix:** `NOTIFY pgrst, 'reload schema';` (sumarlo al final de TODA migración que cree tablas/columnas) y verificar con un GET REST `…/rest/v1/<tabla>?select=id&limit=1` (debe dar 200). Pasó con `menus`/`menu_preparaciones`.

2. **Los errores de Supabase NO son instancias de `Error`.** Son objetos `{ message, code, details }`. Un `catch (e) { e instanceof Error ? e.message : 'desconocido' }` traga el mensaje real → siempre "desconocido". Extraer así: `const msg = e instanceof Error ? e.message : (e && typeof e === 'object' && 'message' in e) ? String(e.message) : 'desconocido'`.

3. **Insert directo no actualiza el SWR de otro hook.** Si insertás con `supabase.from(...).insert()` directo (no vía la función del hook), el cache SWR de `useTareas`/etc. solo se entera por el **realtime** (1-3 s). Para refresco inmediato, llamar `refetch()`/`mutate()` del hook justo después del insert. (Ver `activarMenu` en produccion/page.tsx.)

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

## API route que bypassea RLS

`/api/recetas/save` — único endpoint con `createAdminClient()`. Cuatro modos:
- `{ receta, ingredientes }` → inserta receta + ingredientes en batch
- `{ receta }` → solo receta  
- `{ addIngredientsOnly: true, ingredientes }` → suma ingredientes a receta existente
- `{ enrichRecetaId, receta: { procedimiento }, ingredientes }` → **enriquece receta existente**: borra ingredientes anteriores, inserta nuevos, actualiza procedimiento. Usado por el botón "Completar con IA" en la tab Ideas del recetario.

Llamar desde `useRecetas.agregarReceta`, no directamente desde el browser.

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
