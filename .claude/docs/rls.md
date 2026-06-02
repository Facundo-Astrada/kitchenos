# RLS — Row Level Security — KitchenOS

## Estado actual (mayo 2026)

44 tablas con aislamiento multi-tenant real. Todas usan `mi_restaurante_id()`.

## Función central

```sql
-- SECURITY DEFINER + search_path fijo para evitar search path injection
CREATE OR REPLACE FUNCTION public.mi_restaurante_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT restaurante_id FROM user_restaurantes WHERE user_id = auth.uid() LIMIT 1 $$;
```

## Patrón estándar para tablas con `restaurante_id`

```sql
ALTER TABLE tabla ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tabla_select" ON tabla FOR SELECT TO authenticated
  USING (restaurante_id = mi_restaurante_id());

CREATE POLICY "tabla_insert" ON tabla FOR INSERT TO authenticated
  WITH CHECK (restaurante_id = mi_restaurante_id());

CREATE POLICY "tabla_update" ON tabla FOR UPDATE TO authenticated
  USING (restaurante_id = mi_restaurante_id())
  WITH CHECK (restaurante_id = mi_restaurante_id());

CREATE POLICY "tabla_delete" ON tabla FOR DELETE TO authenticated
  USING (restaurante_id = mi_restaurante_id());

CREATE INDEX IF NOT EXISTS idx_tabla_restaurante ON tabla(restaurante_id);
```

## Tablas hijo sin `restaurante_id` (aislar via FK al padre)

```sql
-- Ejemplo: ingredientes (depende de recetas)
CREATE POLICY "ingredientes_select" ON ingredientes FOR SELECT TO authenticated
  USING (receta_id IN (
    SELECT id FROM recetas WHERE restaurante_id = mi_restaurante_id()
  ));
```

## Excepciones intencionales

- `restaurantes` INSERT: `WITH CHECK (true)` — cualquier usuario autenticado puede crear un restaurante (onboarding)
- `user_restaurantes` INSERT: `WITH CHECK (user_id = auth.uid())` — solo puede insertar su propio user_id

## Si todos los datos aparecen vacíos después de login

`mi_restaurante_id()` está devolviendo NULL porque `auth.uid()` no llega. Causas comunes:
1. Keys cruzadas en Vercel (`NEXT_PUBLIC_SUPABASE_ANON_KEY` tiene `sb_secret_...`)
2. Sesión vieja en el browser → limpiar en DevTools → Application → Clear site data

## Verificar columnas antes de aplicar políticas

```bash
curl -X POST https://api.supabase.com/v1/projects/clipcxcbtlibswfzsgzk/database/query \
  -H "Authorization: Bearer $SUPABASE_MANAGEMENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"SELECT column_name,data_type FROM information_schema.columns WHERE table_name='\''tabla'\'' ORDER BY ordinal_position"}'
```
