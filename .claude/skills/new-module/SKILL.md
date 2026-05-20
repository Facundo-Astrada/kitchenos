---
name: new-module
description: Scaffoldea un módulo completo para KitchenOS (page + hook) siguiendo el patrón estándar del proyecto. Usar cuando se pide crear un módulo, sección o pantalla nueva.
argument-hint: "nombre del módulo en español (ej: inventario, caja, reservas)"
---

Crear un módulo nuevo llamado `$ARGUMENTS` para KitchenOS siguiendo estas reglas exactas:

## 1. Hook: `lib/hooks/use${PascalCase($ARGUMENTS)}.ts`

```ts
'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRestauranteId } from './useRestauranteId'

export function use${PascalCase} () {
  const RESTAURANTE_ID = useRestauranteId()
  const supabase = createClient()
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const fetchItems = useCallback(async () => {
    if (!RESTAURANTE_ID) return   // guard obligatorio
    setLoading(true)
    const { data } = await supabase
      .from('TABLA')  // ← REEMPLAZAR con la tabla real
      .select('*')
      .eq('restaurante_id', RESTAURANTE_ID)
      .order('created_at', { ascending: false })
    setItems(data ?? [])
    setLoading(false)
  }, [RESTAURANTE_ID])  // RESTAURANTE_ID en deps — evita stale closure

  useEffect(() => { fetchItems() }, [fetchItems])

  return { items, loading, refetch: fetchItems }
}
```

IMPORTANTE antes de escribir cualquier query: verificar columnas reales con /supabase-check.

## 2. Página: `app/(app)/$ARGUMENTS/page.tsx`

Estructura obligatoria:
- `'use client'` al tope
- Navy header: `background: 'var(--navy)', padding: '46px 16px 14px'`
- CSS vars para todo: `var(--bg)`, `var(--surface)`, `var(--border)`, `var(--text-1/2/3)`
- Iconos: `<span className="material-symbols-outlined">nombre_icono</span>` — NO emoji
- FAB (botón flotante): `position: 'fixed', bottom: 110, right: 16` — mínimo 110 para no tapar la navbar
- Idioma: español argentino
- Loading state: mostrar spinner mientras `loading === true`
- Estado vacío: mensaje claro cuando `items.length === 0`

## 3. Agregar a navegación si corresponde

Verificar `lib/constants.ts` — si el módulo debe aparecer en el menú, agregar una entrada en `MODULOS` con nombre, ícono (Material Symbol), ruta y roles que lo ven.

## 4. Tipos

Si el módulo tiene tipos de datos específicos, agregarlos al final de `types/index.ts` con un comentario `// ── NombreModulo ─────`.

Tras crear los archivos, correr `npm run build` para verificar que no haya errores de TypeScript.
