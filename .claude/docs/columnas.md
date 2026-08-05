# Columnas no intuitivas — verificar antes de queries

| Tabla | Columna correcta | NO usar |
|---|---|---|
| `productos` | `stock_actual`, `stock_minimo`, `stock_critico` (NOT NULL, DEFAULT 0 — resetear con `0`, nunca `null`) | `cantidad` |
| `productos` | `precio_unitario` | `precio` |
| `productos` | `es_produccion BOOLEAN` + `receta_id UUID NULL` — producción interna: costo sale de la receta vinculada, no de factura | — |
| `productos` | `sector_id UUID NULL` (FK `stock_sectores`) — sector físico. `fuera_de_uso BOOLEAN` — sigue en el valor del stock pero `calcEstado` lo fuerza a `'ok'` (sin alertas), excluido de sugerencias y del recorrido de Stockear | — |
| `stock_sectores` | `id, restaurante_id, nombre, icono, orden, ultimo_conteo_at` — sectores físicos; `icono` de preset fijo (`shelves`,`ac_unit`,`kitchen`,`severe_cold`,`skillet`,`wine_bar`); `ultimo_conteo_at` se pisa solo al completar un recorrido de Stockear scopeado a ese sector | — |
| `stock_estantes` | `id, restaurante_id, sector_id (FK CASCADE), nombre, orden` — sub-niveles dentro de un sector | — |
| `productos` | `estante_id UUID NULL` (FK stock_estantes, SET NULL) + `orden_sector INT` — posición manual, drag en el board de Stock, alimenta el recorrido de Stockear | — |
| `tareas` | `status` (`'pendiente'\|'en_proceso'\|'completada'`) | `completada` (bool) |
| `tareas` | `fecha_limite` | `fecha_vencimiento` |
| `recetas` | `activa` (soft-delete), `status` (`'published'\|'draft'`) | `deleted`, `activo` |
| `recetas` | `tiempo_min` (int) | `tiempo_minutos` |
| `ingredientes` | `producto_id` (FK), `costo_unitario`, `unidad_costo`, `grupo TEXT NULL` (etapa editable, agrupa visualmente, no afecta food cost). Columnas OPS (`plaza, seccion_mise, cantidad_ops, unidad_ops, recipiente_nombre, peso_porcion, peso_porcion_unidad`) — activas cuando la receta es `es_plato`; subrecetas alimentan el mise vía `upsertMiseChecklistItem` | — |
| `recetas` | `es_plato BOOLEAN` — flag explícito "trabajar como plato" (muestra OPS por ingrediente). Distinto del derivado `en_carta` de `useRecetas` (existe `carta_item.receta_id`) | — |
| `turnos` | UNIQUE(`miembro_id`,`fecha`) — hacer upsert | insert directo |
| `facturas` | `condicion_pago`, `status`. "Por pagar" = crédito ∧ status≠pagada (`esPorPagar`). `pedido_id UUID NULL` — reconciliación factura↔pedido | — |
| `factura_items` | `producto_nombre` (text, no FK), `precio_unitario` por unidad | — |
| `pedidos` | `status`, `fecha_pedido`, `total_estimado`, `entrega_desde/hasta DATE` (ventana de llegada; `fecha_entrega_esperada` es fallback viejo) | `fecha_entrega_esperada` sola |
| `pedido_items` | `producto_nombre`, `producto_id` (FK NULL), `cantidad`, `unidad`, `precio_estimado`, `recibido`, `cantidad_recibida` — al recibir suma a `productos.stock_actual` matcheando por nombre | — |
| `plato_componentes` | `plaza`, `cantidad_diaria`, `unidad`, `sync_ops BOOLEAN` — solo sincroniza al checklist si `true` | — |
| `plato_plazas` | `plato_id` = `receta_id`, `ingredientes text[]` | `receta_id` (se llama `plato_id`) |
| `plato_recetas` | Solo recetas — **no tiene `producto_id`**. Un producto de stock agregado al editor de composición de un plato (`ComposicionEditor › PlatoRecetasEditor`) no tiene dónde persistir; se sacó del buscador de ese modo (ago 2026) | agregar producto de stock directo a un plato sin pasar por una receta |
| `plato_recetas` | `plaza VARCHAR(50) NULL` — estación asignada | — |
| `plato_recetas` | `cantidad_ops` + `unidad_ops` — contribución de ESTE plato; `checklist_items.cantidad` = suma de todas con misma `receta_id+plaza` (siempre recalcular, no usar como absoluto). Sin recipiente = gramos por plato; con recipiente = porciones/peso del recipiente × cantidad (dato de mise, no gramaje) — el gramaje real en ese caso es `checklist_items.peso_porcion` | — |
| `puestos` | `nivel` → mapea a `rol_permisos.rol`. `plaza_default` → plaza OPS default. `permisos_app TEXT[]` → `ModuloId[]` reales | — |
| `equipo_miembros` | `modulos_extra`/`modulos_restringidos TEXT[]` — combinar con `puestos.permisos_app`. `costo_hora NUMERIC NULL` — solo admin (gate UI), une contra `turnos_personal.usuario_id` para costo laboral en Reportes | — |
| `turnos_personal` | `id, restaurante_id, usuario_id` (FK auth.users, NO equipo_miembros), `fecha, entrada, salida, horas_total, editado_por, editado_at`. **`horas_total` es `GENERATED ALWAYS` — nunca mandarla en INSERT/UPDATE** (400 `428C9`). Múltiples filas por persona/día válidas (turnos partidos) — tomar la más reciente con `salida IS NULL` | `completada`, mandar `horas_total` a mano |
| `checklist_items` | `seccion_id` (FK), `seccion` (texto legacy) | usar `seccion_id` |
| `checklist_items` | `orden INT` — posición real dentro de la sección; ordenar SIEMPRE por `orden`, no por `prioridad` (salta de lugar al cambiar badge). Escritores: long-press drag y `agregarItem`/`upsertMiseChecklistItem` (insertan con `orden:0`) | — |
| `checklist_secciones` | `tipo` ∈ `'produccion'\|'almacen'\|'heladera'\|'freezer'\|'estacion'` (default `'produccion'`). `producto_ids UUID[]` solo si `tipo='almacen'`. Heladera/Freezer linkean a HACCP por nombre (`ilike`, sin FK) | — |
| `checklist_secciones` | `parent_id UUID NULL` (ON DELETE CASCADE) — sub-secciones, `NULL`=raíz. **Solo 1 nivel de profundidad** (regla de UI, no CHECK en DB). Borrar sección con hijos borra en cascada | — |
| `checklist_items` | `plaza='general'` — aparece en TODAS las plazas | — |
| `checklist_items` | `recipiente_nombre`, `recipiente_capacidad` (siempre en porciones), `peso_porcion` + `peso_porcion_unidad`. Usados por `ProductoMiseCard` para déficit y CTA de producción. `recipiente_nombre` puede traer sufijo `" ×N"` (cantidad de recipientes iguales, no hay columna propia) — leer/escribir con `parseRecipienteNombre()`/`encodeRecipienteNombre()` de `lib/ops/mise.ts` | — |
| `produccion_diaria` | `menu_tag TEXT NULL` — null=menú base, string=evento/menú específico | — |
| `carta_items` | `tags TEXT[]` — dietarios: `s/tacc, vegano, vegetariano, keto, picante, sin lactosa` | — |
| `carta_items` | `estacion_default_id UUID NULL` (FK estaciones) — estación KDS default; usado por `useComandas.agregarItems` | — |
| `carta_categorias` | `id, nombre, icono, orden, restaurante_id` — categorías dinámicas | `CATEGORIAS` hardcodeado |
| `haccp_limpieza` | `dia_semana`, `dia_mes`, `sync_ops BOOLEAN` (default true), `checklist_item_id`. Con sync crea una `checklist_rutina` (no `checklist_items`) en plaza general | — |
| `checklist_rutina` | `dias_semana INT[]` (ISO 1-7, null=todos), `dia_mes INT`. Filtra por día en Rutina del Mise y `RutinasDia` de Planificación | — |
| `presupuestos` | `id, restaurante_id, periodo, monto` — UNIQUE(restaurante_id,periodo) → upsert | — |
| `restaurantes` | `configuracion JSONB` → `{ nombres_excluidos: string[], onboarding_step }` | columna plana |
| `restaurantes` | `slug TEXT UNIQUE NULL` (carta pública) + `carta_publica_activa BOOLEAN`. `...-000001`=El Rescoldo real, `...-000002`=Demo | — |
| `ventas` | `total_ventas`, `cantidad_cubiertos`, `fecha` | — |
| `ventas_items` | `nombre_plato` (no FK), `cantidad`, `precio_unitario`, `subtotal` | — |
| `menus` | `id, restaurante_id, nombre, tipo('fijo'\|'evento'), descripcion, activo`. `fecha_evento` (eventos), `precio` (compartido por variantes), `variantes TEXT[]` (nombres de composición alternativa) | — |
| `menu_preparaciones` | `menu_id` (CASCADE), `paso`, `tipo('plato'\|'receta'\|'producto'\|null)` + `ref_id` (polimórfico sin FK), `prioridad`, `plaza`, `seccion_mise`, `usuario_asignado`, `cantidad`, `unidad`, `orden`, columnas OPS iguales a `ingredientes`. `variante TEXT NULL` — null=común a todas las variantes, texto=exclusivo de esa variante | — |
| `tareas` | `seccion` NOT NULL (default `'general'`). `modo` ('carta'=agrupa por prioridad / 'menu'=por sección). `menu_id UUID NULL` — tarea de menú activado, filtrada por `menu_id+turno_fecha`. `estado` (pendiente/en_curso/listo/duda). `asignado_a` TEXT. **Carryover:** Producción muestra `turno_fecha=hoy` + ayer sin completar; **requiere `turno_fecha`** (NULL no se muestra). `plaza` es vestigio (OPS Producción agrupa por prioridad/sección, no plaza) — se manda `null` salvo `handleCrearTareaDesdeItem` (hereda la del componente origen). `categoria='pedido_nota'` → notas libres del recuadro Pedidos, `turno_fecha=null` a propósito. `categoria='pase_turno'` → sheet de pase con día "Mañana", `turno_fecha`=mañana, sin `menu_id` a propósito | `completada` (no existe) |
| `checklist_registros` | `turno` NO es la fase: viene codificado `'<turnoId>:<fase>'` (`'almuerzo:cierre'`) cuando el restaurante tiene turnos de servicio, y pelado (`'cierre'`) cuando no. **Leerlo siempre con `parseTurnoFase()`** (`lib/ops/turnos.ts`) — comparar el string crudo contra `'cierre'` da false en toda cuenta con turnos configurados. UNIQUE(`checklist_item_id`,`fecha`,`turno`) → upsert con ese `onConflict` | `turno === 'cierre'` |
| `checklist_items` | `demanda_viva INTEGER` — porciones pedidas desde salón en el turno; incrementa `POST /api/salon/prep-list-update` al enviar comanda; se reinicia manual al aperturar | — |
| `recetas` | `foto_url` (bucket `fotos`), `peso_total_g`, `peso_escurrido_g` (bruto vs neto tras cocción) | — |
| `carta_items` | `foto_url` (bucket `fotos`) | — |
| `carta_items` | `receta_id UUID NULL` — link 1:1 "la receta ES un plato" ("Convertir a plato" en recetario); costo/FC leídos en vivo de la receta. `recetas.es_plato` NO es columna — es derivado (query a carta_items) | — |
| `recetas` | `vida_util_dias INT NULL` — días hasta caducidad; `NULL`→default 3 días al imprimir etiqueta (fallback cliente) | — |
| `cajas_turnos` | `estado('abierta'\|'cerrada')`, `abierta_por/fecha_apertura/monto_inicial`, `cerrada_por/fecha_cierre`, `montos_esperados/declarados JSONB` (snapshot al cierre, no se recalculan), `diferencia_total`, `arqueo_ciego`. Índice único parcial `WHERE estado='abierta'` — una sola caja abierta por restaurante | — |
| `caja_movimientos` | `caja_turno_id, medio_id(FK NOT NULL), tipo('retiro'\|'ingreso'), monto, motivo, creado_por` — el medio de efectivo se infiere por regex de nombre (`medios_pago` no tiene campo "tipo") | — |
| `mesas` | `forma('cuadrada'\|'redonda'\|'rectangular')`, `ancho/alto NUMERIC` (% del canvas, editable con handle de resize), `rotacion INT`, `color TEXT NULL` (null=madera `#a9744f` o color de estado si ocupada) | — |
| `salon_elementos` | `tipo('barra'\|'caja'\|'parrilla'\|'planta'\|'pared'\|'otro')`, `label`, `pos_x/pos_y/ancho/alto` (% del mundo), `rotacion`, `color` — mobiliario decorativo, no clickeable en servicio. **No está en `reset_demo_restaurante()`** — sumarla si se toca esa función | — |
| `eventos` | `fecha_fin DATE NULL` — existe en la tabla pero el form de Calendario nunca la usa (siempre manda `null`); un evento multi-día requeriría cablearla. `recurrente`+`frecuencia` también existen pero el fetch no las procesa (filtra por rango de mes) — un evento "recurrente" hoy solo aparece el día que se creó | — |
| `calendario_nota_items` | `restaurante_id, fecha, texto, orden(no usado, ordena por created_at), plaza TEXT NULL, tarea_id UUID NULL` — un ítem = una línea de nota del calendario. `plaza`+`tarea_id` se llenan juntos al "Enviar a Producción" (crea la tarea real vía `agregarTarea` y linkea); sin FK a `tareas` (igual que el resto de los links polimórficos del proyecto) | — |

## Unidades de ingredientes — trampas de conversión

`ingredientes.unidad`/`unidad_costo` llegan con variantes no estándar desde importaciones: `gr/grs/gramo→g`, `lt/lts/litro→l`, `cc/mililitro→ml`, `unidad/unidades/un→u`. `canonUnit()` en `lib/hooks/useRecetas.ts` canoniza antes de calcular el factor; `supabase/migrations/normalizar_unidades_ingredientes.sql` corrige en DB.

**Combo imposible** `unidad` en peso/volumen vs `unidad_costo='u'` (o viceversa): factor = **0**, la línea se excluye del costo (no lo infla). Corregir a mano el peso real por unidad o la unidad del producto.

**Productos con `unidad='unidad'` pero precio real por kg/l** (mal ingresados desde facturas): subvalúan el food cost de las recetas que los usan; el código los protege con factor 0. Corregir la unidad en Stock.

**Categorías canónicas de `productos`** (16): `Carnes, Pescados, Verduras, Frutas, Lácteos, Panadería, Secos, Especias, Bebidas, Aceites, Vinagres, Conservas, Congelados, Limpieza, Descartables, Otros`. Re-categorizar en bulk: `scripts/recategorizar-productos.mjs --apply`.

## Supabase Storage — bucket `fotos`

Bucket público creado por SQL directo (la key `sb_secret_...` no funciona con la Storage REST API):
```sql
INSERT INTO storage.buckets (id, name, public) VALUES ('fotos', 'fotos', true) ON CONFLICT (id) DO NOTHING;
```
RLS en `storage.objects`: SELECT público (`bucket_id='fotos'`), INSERT solo `authenticated`. Paths: `recetas/{receta_id}.{ext}`, `carta/{item_id}.{ext}`.

## Demo pública — `demo_visitas` + `reset_demo_restaurante()`

`demo_visitas`: solo `id, created_at`, contador de clicks en "Ver demo", sin PII. RLS INSERT abierto a anon/authenticated.

`reset_demo_restaurante()` (plpgsql): borra el restaurante demo (`...-000002`) y lo re-clona desde El Rescoldo real (`...-000001`) — 59 tablas, ids regenerados, FKs remapeadas con tablas temp. Invocada por cron nocturno (`GET /api/cron/reset-demo`, `CRON_SECRET`). No clona `restaurantes`/`user_restaurantes`/`equipo_miembros`/`rol_permisos` (seed único) ni `perfiles`/`turnos` (`UNIQUE(miembro_id,fecha)` no scopeada por restaurante). **Toda tabla nueva con `restaurante_id` debe sumarse a esta función** o queda vacía en la demo tras el próximo reset.

## Verificar columnas reales

```bash
curl -X POST https://api.supabase.com/v1/projects/clipcxcbtlibswfzsgzk/database/query \
  -H "Authorization: Bearer $SUPABASE_MANAGEMENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"SELECT column_name,data_type FROM information_schema.columns WHERE table_name='\''nombre_tabla'\'' ORDER BY ordinal_position"}'
```
O usar la skill `/supabase-check nombre_tabla`.
