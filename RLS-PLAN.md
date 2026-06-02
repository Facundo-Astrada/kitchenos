# Plan: Endurecer RLS (multi-tenant) — ejecutar con Sonnet

> **Contexto para quien ejecute (Sonnet):** Plan autónomo. No necesitás la conversación previa. Leé este archivo + `CLAUDE.md` y ejecutá paso a paso. Usá las skills `/supabase-check` y `/deploy`.

## Por qué

Hoy **todas las tablas tienen RLS con política `USING(true)`** (permisivo total). Desde que el repo es público y la app usa la **publishable key** (`sb_publishable_...`, viaja en el browser, es pública por diseño), cualquiera con esa key podría leer/escribir TODA la base de todos los restaurantes. Hay que aislar por `restaurante_id`.

**Modelo de datos clave:**
- `user_restaurantes` mapea `user_id` (auth.uid) → `restaurante_id` (+ rol)
- Casi todas las tablas de negocio tienen columna `restaurante_id`
- API routes que usan `createAdminClient()` (secret key) **bypassean RLS** → siguen funcionando sin cambios
- Hooks del browser usan la publishable key → SÍ quedan sujetos a RLS

## Objetivo

Reemplazar `USING(true)` por aislamiento multi-tenant: un usuario autenticado solo accede a filas de SU `restaurante_id`.

---

## Patrón de política a aplicar

Para cada tabla **con** columna `restaurante_id`:

```sql
-- Borrar políticas permisivas viejas
DROP POLICY IF EXISTS "<nombre_viejo>" ON <tabla>;
-- (listar las existentes con: SELECT polname FROM pg_policy WHERE polrelid='<tabla>'::regclass)

-- Política de aislamiento por restaurante
CREATE POLICY "tenant_select" ON <tabla> FOR SELECT TO authenticated
  USING (restaurante_id IN (SELECT restaurante_id FROM user_restaurantes WHERE user_id = auth.uid()));
CREATE POLICY "tenant_insert" ON <tabla> FOR INSERT TO authenticated
  WITH CHECK (restaurante_id IN (SELECT restaurante_id FROM user_restaurantes WHERE user_id = auth.uid()));
CREATE POLICY "tenant_update" ON <tabla> FOR UPDATE TO authenticated
  USING (restaurante_id IN (SELECT restaurante_id FROM user_restaurantes WHERE user_id = auth.uid()))
  WITH CHECK (restaurante_id IN (SELECT restaurante_id FROM user_restaurantes WHERE user_id = auth.uid()));
CREATE POLICY "tenant_delete" ON <tabla> FOR DELETE TO authenticated
  USING (restaurante_id IN (SELECT restaurante_id FROM user_restaurantes WHERE user_id = auth.uid()));
```

**Tablas hijas SIN `restaurante_id`** (ej. `ingredientes` cuelga de `recetas`, `factura_items` de `facturas`): aislar via la FK al padre:

```sql
CREATE POLICY "tenant_select" ON ingredientes FOR SELECT TO authenticated
  USING (receta_id IN (
    SELECT id FROM recetas WHERE restaurante_id IN (
      SELECT restaurante_id FROM user_restaurantes WHERE user_id = auth.uid())));
-- (repetir para insert/update/delete con WITH CHECK)
```

**Tablas especiales:**
- `user_restaurantes`: política `USING (user_id = auth.uid())` — cada uno ve su propio mapeo.
- Tablas de config global sin tenant (si las hay): evaluar caso por caso.

---

## Pasos de ejecución (ORDEN IMPORTANTE)

1. **Inventariar** — correr y guardar el estado actual:
   ```sql
   SELECT c.relname tabla, c.relrowsecurity rls, count(p.polname) pols
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   LEFT JOIN pg_policy p ON p.polrelid=c.oid
   WHERE n.nspname='public' AND c.relkind='r' GROUP BY 1,2 ORDER BY 1;
   ```
   Para cada tabla, ver si tiene `restaurante_id`: `/supabase-check <tabla>`.

2. **Clasificar tablas** en 3 grupos: (a) con `restaurante_id`, (b) hijas via FK, (c) especiales.

3. **Aplicar políticas por lotes chicos** (3-4 tablas), via `mcp__supabase__apply_migration` (un migration por lote, nombre descriptivo). NO todo de una.

4. **Verificar después de CADA lote** — esto es lo crítico:
   - Con la **publishable key** (browser), un usuario logueado de Bros (`restaurante_id=e65cf95a-2c32-4244-b325-2379be5b3a6e`) debe ver SUS datos y NADA de otros restaurantes.
   - Test rápido: `fetch(URL/rest/v1/<tabla>?select=id` con la publishable key SIN auth → debe devolver `[]` (vacío) o 401, NO datos.
   - La app deployada debe seguir funcionando (login, stock, recetario).

5. **Probar las API routes con secret key** — deben seguir andando (bypassean RLS): cargar receta, importar factura, rebuild stock.

6. **Deploy** con `/deploy` solo si se tocó código (este plan es casi todo SQL, probablemente no haga falta).

---

## Rollback

Si un lote rompe la app, revertir ese lote:
```sql
DROP POLICY IF EXISTS "tenant_select" ON <tabla>;
-- ...resto
CREATE POLICY "temp_open" ON <tabla> FOR ALL USING (true);  -- volver a permisivo temporal
```

## Verificación final (definición de "terminado")

- [ ] Ninguna tabla de negocio con política `USING(true)`
- [ ] Publishable key sin sesión → 0 filas en todas las tablas
- [ ] Usuario Bros logueado → ve solo datos de Bros
- [ ] App live: login, stock, recetario, facturas, operaciones funcionan
- [ ] API routes (secret key): cargar receta, import factura, rebuild stock funcionan
- [ ] `get_advisors` de Supabase sin warnings de RLS

---

## Notas

- `createAdminClient()` (secret key) **bypassa RLS por diseño** — por eso las API routes no se rompen. NO migrar esas a publishable.
- La publishable key es segura de exponer **solo si RLS está bien configurado**. Hasta completar este plan, la base está abierta. Es la prioridad de seguridad #1.
- El repo es PÚBLICO (`Facundo-Astrada/kitchenos`). Considerar pasarlo a privado: GitHub repo → Settings → Danger Zone → Change visibility.
