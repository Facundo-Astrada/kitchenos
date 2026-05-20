---
name: supabase-check
description: Verifica las columnas reales de una tabla de Supabase antes de escribir queries. Usar siempre que se vaya a escribir código que consulte o modifique una tabla.
argument-hint: "nombre de la tabla (ej: productos, tareas, recetas)"
allowed-tools: Bash, Read
---

Verificar las columnas reales de la tabla `$ARGUMENTS` en Supabase antes de escribir ningún código.

## Paso 1 — Leer el token del .env.local

```bash
grep SUPABASE_MANAGEMENT_TOKEN c:/Users/Equipo/Documents/kitchenos/.env.local
```

## Paso 2 — Consultar columnas de la tabla

```bash
curl -s -X POST https://api.supabase.com/v1/projects/clipcxcbtlibswfzsgzk/database/query \
  -H "Authorization: Bearer TOKEN_DEL_PASO_ANTERIOR" \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name='$ARGUMENTS' ORDER BY ordinal_position\"}"
```

## Paso 3 — Mostrar resultado de forma clara

Mostrar una tabla con:
- Nombre de columna exacto (el que hay que usar en el código)
- Tipo de dato
- Si puede ser nulo
- Si tiene valor por defecto

## Paso 4 — Señalar trampas conocidas

Verificar si la tabla tiene alguna de estas trampas documentadas en CLAUDE.md:
- `productos` → usar `stock_actual` no `cantidad`, `precio_unitario` no `precio`
- `tareas` → usar `status` no `completada`, `fecha_limite` no `fecha_vencimiento`
- `recetas` → soft-delete via `activa` bool, `status` = 'published'|'draft'
- `turnos` → UNIQUE (miembro_id, fecha) — hacer upsert, no insert

Si la tabla no tiene trampas conocidas, indicarlo también.
