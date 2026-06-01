# Columnas no intuitivas — verificar antes de queries

| Tabla | Columna correcta | NO usar |
|---|---|---|
| `productos` | `stock_actual`, `stock_minimo`, `stock_critico` | `cantidad` |
| `productos` | `precio_unitario` | `precio` |
| `tareas` | `status` (`'pendiente'|'en_proceso'|'completada'`) | `completada` (bool) |
| `tareas` | `fecha_limite` | `fecha_vencimiento` |
| `recetas` | `activa` (bool, soft-delete), `status` (`'published'|'draft'`) | `deleted`, `activo` |
| `recetas` | `tiempo_min` (int) | `tiempo_minutos` |
| `ingredientes` | `producto_id` (FK), `costo_unitario`, `unidad_costo` | (sin FK = no link) |
| `turnos` | UNIQUE (`miembro_id`, `fecha`) — hacer upsert | insert directo |
| `facturas` | `condicion_pago` (`'contado'|'cuenta_corriente'`), `status` (`'pagada'|'pendiente'|'confirmada'|'observada'`) | — |
| `factura_items` | `producto_nombre` (text, no FK), `precio_unitario` por unidad | (sin link directo a productos) |
| `plato_componentes` | `plaza`, `cantidad_diaria`, `unidad`, `sync_ops BOOLEAN DEFAULT false` — solo sincroniza al checklist si es `true` | (sync_ops agregado mayo 2026) |
| `plato_plazas` | `plato_id` = `receta_id` (no es `plato_compuesto_id`), `ingredientes text[]` | `receta_id` (la columna se llama `plato_id`) |
| `plato_recetas` | `plaza VARCHAR(50) NULL` — estación de producción asignada al vincular receta a plato | (agregado mayo 2026) |
| `checklist_items` | `seccion_id` (FK a `checklist_secciones`), `seccion` (texto legacy) | usar `seccion_id` para lookups |
| `checklist_items` | `plaza = 'general'` — aparece en el checklist de TODAS las plazas, no solo la propia | (distinguir de plazas específicas) |
| `produccion_diaria` | `menu_tag TEXT NULL` — null = menú base del día, string = nombre de evento/menú específico | (no existía antes de mayo 2026) |
| `carta_items` | `tags TEXT[] DEFAULT '{}'` — dietarios: `'s/tacc'`, `'vegano'`, `'vegetariano'`, `'keto'`, `'picante'`, `'sin lactosa'` | (agregado mayo 2026) |
| `carta_categorias` | tabla nueva: `id, nombre, icono, orden, restaurante_id` — categorías dinámicas por restaurante | no usar `CATEGORIAS` hardcodeado en código |

## Cómo verificar columnas reales

```bash
curl -X POST https://api.supabase.com/v1/projects/clipcxcbtlibswfzsgzk/database/query \
  -H "Authorization: Bearer $SUPABASE_MANAGEMENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"SELECT column_name,data_type FROM information_schema.columns WHERE table_name='\''nombre_tabla'\'' ORDER BY ordinal_position"}'
```

O usar la skill `/supabase-check nombre_tabla`.
