# RLS — Row Level Security — KitchenOS

## Estado actual (septiembre 2026)

90 tablas del dominio con aislamiento multi-tenant real, 344 policies, cero `USING(true)` en SELECT/UPDATE/DELETE. Todas usan `mi_restaurante_id()`.

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

## `user_restaurantes` NO se escribe desde el cliente

`mi_restaurante_id()` lee de esta tabla, y de esa función dependen las 344 policies.
Si el usuario puede escribirla, controla la variable que gobierna a todas las demás:
apunta su fila a otro `restaurante_id` y se queda con esa cuenta entera.

Pasó de verdad (01/09/2026): las policies eran `user_id = auth.uid()` para
INSERT/UPDATE/DELETE y estaban anotadas acá como "excepciones intencionales". Un
UPDATE bastaba. Hoy la tabla tiene **solo SELECT**; los grants de escritura están
revocados y el alta pasa por `POST /api/registro` con admin client (el servidor
genera el id y rechaza a quien ya tenga vínculo). Lo mismo con `restaurantes`
INSERT, que era `WITH CHECK (true)`.

Regla: **la membresía de un tenant la asigna el servidor, nunca el cliente.** El
ratchet #6 de `lib/ingenieria/ratchets.test.ts` falla si algo fuera de `app/api/**`
vuelve a escribir esa tabla.

## `REVOKE ... FROM anon, authenticated` no alcanza — hay que sacarle a `PUBLIC`

En Postgres una función nace con `EXECUTE` concedido a `PUBLIC`. Revocarle el
permiso a `anon`/`authenticated` no le saca lo que heredan de ahí, así que el
`REVOKE` parece aplicado y la función sigue siendo llamable por cualquiera. Pasó
con `reset_demo_restaurante()` (SECURITY DEFINER, borra y re-clona el demo), que
quedó abierta a anónimos un mes después de darse por cerrada.

```sql
REVOKE ALL ON FUNCTION public.la_funcion() FROM PUBLIC, anon, authenticated;
```

Comprobar el resultado, no asumirlo — el advisor y el grant real pueden discrepar:

```sql
SELECT proname, has_function_privilege('anon', oid, 'EXECUTE')
FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='la_funcion';
```

Las funciones de **trigger** no necesitan `EXECUTE` para nadie: las invoca el motor
de triggers, no el usuario. Revocarles todo es seguro (verificado con un INSERT real).

## Storage: el bucket se aísla por la primera carpeta del path

Una policy de storage no puede filtrar por `restaurante_id` si el path no lo lleva.
`PhotoPicker` prefija `${restauranteId}/...` y las policies exigen
`(storage.foldername(name))[1] = mi_restaurante_id()::text`. Sin ese prefijo, la
única condición posible es `bucket_id = 'fotos'`, que no aísla nada.

El bucket `fotos` es **público**: las lecturas por URL no pasan por RLS (los `<img>`
y la carta QR siguen andando). Las policies gobiernan solo la API autenticada —
listar, descargar, subir, borrar.

## Si todos los datos aparecen vacíos después de login

`mi_restaurante_id()` está devolviendo NULL porque `auth.uid()` no llega. Causas comunes:
1. Keys cruzadas en Vercel (`NEXT_PUBLIC_SUPABASE_ANON_KEY` tiene `sb_secret_...`)
1b. Key con espacios o `
` al final — REST lo tolera pero el realtime devuelve 401 en el handshake del WS (ver `hooks.md` § Realtime). `lib/supabase/env.ts` hace `.trim()`.
2. Sesión vieja en el browser → limpiar en DevTools → Application → Clear site data

## Verificar columnas antes de aplicar políticas

```bash
curl -X POST https://api.supabase.com/v1/projects/clipcxcbtlibswfzsgzk/database/query \
  -H "Authorization: Bearer $SUPABASE_MANAGEMENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"SELECT column_name,data_type FROM information_schema.columns WHERE table_name='\''tabla'\'' ORDER BY ordinal_position"}'
```
