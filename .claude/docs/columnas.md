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
| `plato_recetas` | `cantidad_ops NUMERIC NULL` + `unidad_ops TEXT NULL` — contribución de ESTE plato al mise. `checklist_items.cantidad` = suma de todas las contribuciones con misma `receta_id+plaza`. NO usar como valor absoluto — siempre recalcular la suma. | (agregado junio 2026) |
| `puestos` | `nivel TEXT DEFAULT 'cocinero'` → mapea a `rol_permisos.rol` (admin/sous_chef/cocinero/bachero). `plaza_default TEXT` → plaza OPS por defecto del puesto. `permisos_app TEXT[]` → ahora guarda `ModuloId[]` reales (no texto libre). | (agregado junio 2026) |
| `equipo_miembros` | `modulos_extra TEXT[]` — módulos adicionales habilitados individualmente más allá del puesto. `modulos_restringidos TEXT[]` — módulos removidos individualmente. Combinar con `puestos.permisos_app` para obtener módulos efectivos. | (agregado junio 2026) |
| `turnos_personal` | **NO EXISTE** — el `layout.tsx` tenía un banner de clock-in que consultaba esta tabla. La tabla nunca se creó. Usar únicamente `localStorage('kitchenos_turno')` del dashboard para tracking de turno. | (detectado junio 2026) |
| `checklist_items` | `seccion_id` (FK a `checklist_secciones`), `seccion` (texto legacy) | usar `seccion_id` para lookups |
| `checklist_items` | `plaza = 'general'` — aparece en el checklist de TODAS las plazas, no solo la propia | (distinguir de plazas específicas) |
| `produccion_diaria` | `menu_tag TEXT NULL` — null = menú base del día, string = nombre de evento/menú específico | (no existía antes de mayo 2026) |
| `carta_items` | `tags TEXT[] DEFAULT '{}'` — dietarios: `'s/tacc'`, `'vegano'`, `'vegetariano'`, `'keto'`, `'picante'`, `'sin lactosa'` | (agregado mayo 2026) |
| `carta_categorias` | tabla nueva: `id, nombre, icono, orden, restaurante_id` — categorías dinámicas por restaurante | no usar `CATEGORIAS` hardcodeado en código |
| `haccp_limpieza` | `dia_semana INT` (0=Dom..6=Sáb, para frecuencia semanal), `dia_mes INT` (1-31, mensual), `sync_ops BOOLEAN DEFAULT true`, `checklist_item_id UUID` (link al item OPS) | (agregado junio 2026 para vista calendario + sync OPS) |
| `presupuestos` | tabla nueva: `id, restaurante_id, periodo, monto, created_at, updated_at` — `periodo` ∈ `'semanal'\|'mensual'\|'trimestral'\|'semestral'\|'anual'`, UNIQUE(restaurante_id, periodo) → upsert | (junio 2026, Reportes Presupuesto vs Real) |
| `restaurantes` | `configuracion JSONB` — guarda `{ nombres_excluidos: string[] }` (empleados/socios a excluir del OCR de facturas) y `onboarding_step` | (no es columna plana) |
| `ventas` | `total_ventas`, `cantidad_cubiertos`, `fecha` (date) | — |
| `ventas_items` | `nombre_plato` (no FK), `cantidad`, `precio_unitario`, `subtotal` | — |
| `menus` | tabla nueva (jun 2026): `id, restaurante_id, nombre, tipo ('fijo'\|'evento'), descripcion, activo, created_at, updated_at` — capa por encima del plato (Carta → Menú → Producción) | — |
| `menu_preparaciones` | tabla nueva (jun 2026): `menu_id` (FK CASCADE), `paso` (curso/Apetizer…), `tipo ('plato'\|'receta'\|'producto'\|null)` + `ref_id UUID` (polimórfico a carta_items/recetas/productos, sin FK dura), `nombre`, `prioridad ('critica'\|'alta'\|'media'\|'baja')`, `plaza`, `seccion_mise` (sección fina del checklist de mise), `usuario_asignado` (TEXT = equipo_miembros.id, igual que produccion_diaria), `cantidad`, `unidad`, `orden` | — |
| `tareas` | `seccion` es **NOT NULL** (default mandar `'general'` si no hay valor). `modo` ('carta' agrupa por prioridad / 'menu' agrupa por sección). `menu_id UUID NULL` (jun 2026) = tarea creada al activar un menú; la vista del menú activo en Planificación filtra por `menu_id + turno_fecha`. `estado` (OpsEstado: pendiente/en_curso/listo/duda) = el tildable en verde. `asignado_a` TEXT (equipo_miembros.id). **Carryover (jun 2026):** la vista de Producción muestra solo `turno_fecha === hoy` + las de **ayer** sin completar (carryover de 1 día) y **requiere `turno_fecha`** (las NULL ya no se muestran — antes se acumulaban para siempre). `activarMenu` deduplica por preparación contra el día y el arrastre de ayer; `actualizarMenu` propaga ediciones del menú a las tareas ya activadas (hoy en adelante). | `completada` (no existe) |

## Unidades de ingredientes — trampas de conversión

`ingredientes.unidad` y `ingredientes.unidad_costo` pueden llegar con variantes no estándar desde importaciones:

| Lo que viene | Lo correcto | Nota |
|---|---|---|
| `gr`, `grs`, `gramo` | `g` | muy frecuente en Bros |
| `lt`, `lts`, `litro` | `l` | |
| `cc`, `mililitro` | `ml` | |
| `unidad`, `unidades`, `un` | `u` | muy frecuente — venía de productos.unidad |

El código en `lib/hooks/useRecetas.ts` canoniza via `canonUnit()` antes de calcular el factor. La migración `supabase/migrations/normalizar_unidades_ingredientes.sql` los corrige en DB.

**Combo imposible `unidad='g/kg/ml/l'` vs `unidad_costo='u'` (o viceversa):** factor = **0** → la línea se excluye del costo en vez de inflarlo. Ej: "4 u de Laurel" a $18.595/kg daba $74.380. Son datos a corregir a mano (setear el peso real por unidad o cambiar la unidad del producto).

**Productos con `unidad='unidad'` y precio alto**: 182 productos en Bros tienen `unidad='unidad'` pero su precio es en realidad por kg/l (ingresados con unidad incorrecta desde facturas). Esto subvalúa 53 recetas. El código los protege con factor 0. Corregir manualmente en Stock editando la unidad del producto.

**Categorías de `productos`**: 16 categorías canónicas: `Carnes`, `Pescados`, `Verduras`, `Frutas`, `Lácteos`, `Panadería`, `Secos`, `Especias`, `Bebidas`, `Aceites`, `Vinagres`, `Conservas`, `Congelados`, `Limpieza`, `Descartables`, `Otros`. Usar siempre estas. Para re-categorizar en bulk: `scripts/recategorizar-productos.mjs --apply` (reglas + Haiku + guard).

## Cómo verificar columnas reales

```bash
curl -X POST https://api.supabase.com/v1/projects/clipcxcbtlibswfzsgzk/database/query \
  -H "Authorization: Bearer $SUPABASE_MANAGEMENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"SELECT column_name,data_type FROM information_schema.columns WHERE table_name='\''nombre_tabla'\'' ORDER BY ordinal_position"}'
```

O usar la skill `/supabase-check nombre_tabla`.
