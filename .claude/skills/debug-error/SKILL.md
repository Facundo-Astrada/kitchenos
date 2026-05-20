---
name: debug-error
description: Flujo sistemático para debuggear errores en KitchenOS. Usar cuando algo falla en la app — errores de guardado, pantallas en blanco, datos que no cargan, errores 400/500.
argument-hint: "descripción del error o código de error (ej: 42501, 400, datos no cargan)"
---

Aplicar el siguiente flujo de diagnóstico para el error: `$ARGUMENTS`

## Árbol de decisión por tipo de error

### Error 42501 — RLS violation (permiso denegado en base de datos)
**Causa:** El código intenta escribir en Supabase con la clave `anon` pero la tabla no tiene política de INSERT.
**Solución:** La operación debe ir por una API route que use `createAdminClient()`.
- Verificar si existe `app/api/[modulo]/save/route.ts`
- Si no existe, crearlo usando como modelo `app/api/recetas/save/route.ts`
- El hook debe hacer `fetch('/api/[modulo]/save', { method: 'POST', body: JSON.stringify(...) })`

### Error 400 — Bad Request
**Causa más común:** `restaurante_id` está vacío (`''`) porque `useRestauranteId()` devuelve `''` mientras carga.
**Diagnóstico:**
1. Buscar `useRestauranteId()` en el hook que hace el llamado
2. Verificar que hay guard `if (!RESTAURANTE_ID) return` antes de cualquier fetch
3. Verificar que `RESTAURANTE_ID` está en los deps del `useCallback`
4. Si el error es en una API route: verificar que la query de fallback usa `user_restaurantes` (NO `perfiles` — esa tabla no existe)

### Error PGRST116 — No rows returned
**Causa:** `.single()` no encontró ninguna fila.
**Solución:** Cambiar a `.maybeSingle()` y manejar el caso `null`.

### Datos que no cargan / pantalla en blanco
**Diagnóstico en orden:**
1. ¿`loading` nunca pasa a `false`? → revisar si `fetchXxx` hace `setLoading(false)` en el `finally`
2. ¿`RESTAURANTE_ID` siempre es `''`? → problema de auth context, verificar `lib/auth/context.tsx`
3. ¿El `useCallback` tiene deps vacías `[]`? → agregar `RESTAURANTE_ID` a las deps
4. ¿El `useEffect` no se dispara? → verificar que `fetchXxx` está en deps del useEffect

### Error de TypeScript (TS2xxx)
1. Verificar si el campo existe en `types/index.ts`
2. Verificar si el campo existe en la tabla real con `/supabase-check [tabla]`
3. El nombre en el tipo puede estar desincronizado con el DB — ajustar el tipo

### Redirect que no ocurre después de guardar
**Causa:** La función `agregarXxx` lanzó un error antes de devolver el `id`.
**Diagnóstico:** Agregar `console.log` antes y después del `fetch` para ver si llega al `return json.id`.

## Proceso general de debugging
1. Leer el archivo donde ocurre el error
2. Identificar la línea exacta que falla
3. Trazar el flujo hacia atrás hasta encontrar el origen
4. Proponer fix mínimo (sin refactorizar lo que no está roto)
5. Verificar con `npm run build` que el fix no rompe TypeScript
