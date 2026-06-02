# Patrón de hooks — KitchenOS

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

## API route que bypassea RLS

`/api/recetas/save` — único endpoint con `createAdminClient()`. Tres modos:
- `{ receta, ingredientes }` → inserta receta + ingredientes en batch
- `{ receta }` → solo receta  
- `{ addIngredientsOnly: true, ingredientes }` → suma ingredientes a receta existente

Llamar desde `useRecetas.agregarReceta`, no directamente desde el browser.
