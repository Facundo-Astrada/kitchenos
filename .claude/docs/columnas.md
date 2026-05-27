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
| `plato_componentes` | `plaza`, `cantidad_diaria`, `unidad` (agregados mayo 2026) | (no existían antes de la migración) |
| `plato_plazas` | `plato_id` = `receta_id` (no es `plato_compuesto_id`), `ingredientes text[]` | `receta_id` (la columna se llama `plato_id`) |
| `checklist_items` | `seccion_id` (FK a `checklist_secciones`), `seccion` (texto legacy) | usar `seccion_id` para lookups |

## Cómo verificar columnas reales

```bash
curl -X POST https://api.supabase.com/v1/projects/clipcxcbtlibswfzsgzk/database/query \
  -H "Authorization: Bearer $SUPABASE_MANAGEMENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"SELECT column_name,data_type FROM information_schema.columns WHERE table_name='\''nombre_tabla'\'' ORDER BY ordinal_position"}'
```

O usar la skill `/supabase-check nombre_tabla`.
