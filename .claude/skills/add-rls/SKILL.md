---
name: add-rls
description: Aplica las políticas RLS multi-tenant correctas a una tabla de KitchenOS. Reemplaza USING(true) por filtrado real con mi_restaurante_id(). Usar cuando se agrega una tabla nueva o cuando se quiere asegurar una tabla específica.
argument-hint: "nombre de la tabla (ej: ventas, eventos, checklist_items)"
---

Aplicar RLS multi-tenant correcto a la tabla `$ARGUMENTS` en KitchenOS.

## Paso 1 — Verificar columnas reales

```bash
curl -X POST https://api.supabase.com/v1/projects/clipcxcbtlibswfzsgzk/database/query \
  -H "Authorization: Bearer $SUPABASE_MANAGEMENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"SELECT column_name,data_type FROM information_schema.columns WHERE table_name='\''$ARGUMENTS'\'' ORDER BY ordinal_position"}'
```

## Paso 2 — Verificar políticas actuales

```bash
curl -X POST https://api.supabase.com/v1/projects/clipcxcbtlibswfzsgzk/database/query \
  -H "Authorization: Bearer $SUPABASE_MANAGEMENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"SELECT policyname,cmd,qual,with_check FROM pg_policies WHERE tablename='\''$ARGUMENTS'\'' AND schemaname='\''public'\''"}'
```

## Paso 3 — Determinar el tipo de tabla

**Si tiene `restaurante_id` directo** → usar patrón estándar (4 políticas).

**Si NO tiene `restaurante_id`** → aislar via FK al padre. Identificar qué columna FK tiene y a qué tabla apunta.

## Paso 4 — Generar SQL

**Para tabla con `restaurante_id`:**

```sql
-- Primero verificar que mi_restaurante_id() existe
-- Luego borrar políticas permisivas anteriores
DROP POLICY IF EXISTS "Enable all for authenticated" ON $ARGUMENTS;
DROP POLICY IF EXISTS "Acceso permisivo (dev)" ON $ARGUMENTS;

-- Crear políticas restrictivas
CREATE POLICY "$ARGUMENTS_select" ON $ARGUMENTS FOR SELECT TO authenticated
  USING (restaurante_id = mi_restaurante_id());

CREATE POLICY "$ARGUMENTS_insert" ON $ARGUMENTS FOR INSERT TO authenticated
  WITH CHECK (restaurante_id = mi_restaurante_id());

CREATE POLICY "$ARGUMENTS_update" ON $ARGUMENTS FOR UPDATE TO authenticated
  USING (restaurante_id = mi_restaurante_id())
  WITH CHECK (restaurante_id = mi_restaurante_id());

CREATE POLICY "$ARGUMENTS_delete" ON $ARGUMENTS FOR DELETE TO authenticated
  USING (restaurante_id = mi_restaurante_id());

-- Índice para performance (si no existe)
CREATE INDEX IF NOT EXISTS idx_$ARGUMENTS_restaurante ON $ARGUMENTS(restaurante_id);
```

Presentar el SQL al usuario antes de ejecutar. Luego ejecutar con la management API.

## Paso 5 — Verificar

Confirmar que los datos de El Rescoldo siguen visibles. Si los datos desaparecen, hay un problema con `mi_restaurante_id()` — ver `.claude/docs/rls.md`.
