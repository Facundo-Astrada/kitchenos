# PLAN-STOCK — Auditoría + features de inventario (jul 2026)

> **Estado:** F1 ✅ · F2 ✅ (+ fix de coma decimal en 8 inputs, no estaba en el plan original) · F3 ✅ · F4 ✅ · F5 pendiente · F6 pendiente.

> Ejecutar por fases, en orden. Cada fase termina con `npm run build` verde antes de seguir.
> Skills: `/supabase-check` antes de cada query nueva · `/add-rls` para tablas nuevas · `/pr-review` al final · `/deploy` para cerrar.
> Gotchas obligatorios: `NOTIFY pgrst, 'reload schema';` al final de toda migración (hooks.md #1) · scripts `.mjs` sin tipos TS (hooks.md #7).

Archivos centrales: `app/(app)/stock/ClientView.tsx` (2625 líneas) · `lib/hooks/useStock.ts` · `lib/hooks/useFacturas.ts` · `app/api/stock/*` · `app/api/importador/facturas-universal/route.ts`.

---

## F1 — Fixes rápidos de código (30 min, sin DB)

1. **Editar producto borra el proveedor.** `ClientView.tsx` `handleSave` (~línea 787): `datos` incluye `proveedor_id: null` hardcodeado y se pasa también al UPDATE. Fix: sacar `proveedor_id` de `datos` cuando `editingProducto` existe (solo mandarlo en el INSERT de alta).
2. **Match parcial de facturas matchea substrings dentro de palabras.** `useFacturas.ts:217-220`: `nombreLower.includes(pn)` hace que "Lino" matchee "Cacao alca**lino**" (confirmado con datos reales de Bros: suma stock y pisa precio del producto equivocado). Fix: match por palabra completa —
   ```ts
   const words = nombreLower.split(/\s+/)
   // el nombre del producto debe aparecer como secuencia de palabras completas
   const re = new RegExp(`(^|\\s)${escapeRegex(pn)}(\\s|$)`)
   return pn.length >= 4 && re.test(nombreLower)
   ```
   (escapar regex; mantener el guard ≥4 y la dirección ítem⊇producto).
3. **Ingredientes actualizados con precio crudo.** `useFacturas.ts:270`: usa `item.precio_unitario` (por unidad de factura, ej. por gramo) en vez de `precio_stock` (normalizado a kg/l). Si la factura vino en g, el costo queda 1000× menor. Fix: usar `precio_stock` (ya calculado arriba en la misma iteración).
4. **Query de recetas dentro del loop.** `useFacturas.ts:263-267`: se piden los ids de recetas por CADA ítem de factura. Moverla antes del `for` (una sola vez).
5. **Filtro "Pendiente" con `=== 0` estricto.** `ClientView.tsx:624` y `:659`: `p.precio_unitario === 0` no cuenta `NULL`. Unificar con `!p.precio_unitario` (como ya hace `productosIncompletos`).
6. **Preview de Rebuild duplicado.** La misma lógica de fetch está en el botón del header (~línea 988, SIN manejo de `!res.ok`) y en el banner (~línea 1212, con manejo). Extraer a una función `abrirRebuildPreview()` y usar la versión robusta en ambos.
7. *(opcional, 2 min)* Canal realtime de `useStock.ts:56` sin filtro: agregar `filter: `restaurante_id=eq.${RESTAURANTE_ID}`` al objeto de `postgres_changes`.

---

## F2 — UX del modo Stockear (captura del cliente) (30 min, sin DB)

Contexto: quick mode en `ClientView.tsx` ~1937-2045. Ya existe botón "Corregir" abajo a la izquierda (~2026). El cliente quiere:

1. **Flecha "atrás" simétrica al lado del input** (como dibujó): agregar botón 64×64 con `arrow_back` a la IZQUIERDA del input (mismo estilo que el de avanzar de la línea 2015-2020, pero `background: var(--surface)`, borde `var(--border)`, deshabilitado con opacity .4 si `quickIdx === 0`). Reusar la lógica del botón "Corregir" actual (línea 2027). **Eliminar** el botón "Corregir" del footer (queda redundante) — el footer queda `Saltar | Guardar`.
2. **El teclado se cierra al tocar la flecha de continuar.** Causa: iOS Safari NO respeta `e.preventDefault()` en `onPointerDown` para prevenir el blur del input, y el refocus va en `setTimeout(..., 30)` fuera del gesto. Fix en TODOS los botones del quick mode (avanzar, atrás, saltar):
   - agregar `onMouseDown={e => e.preventDefault()}` (iOS dispara mousedown sintético después del touch y ahí sí respeta el preventDefault → el input nunca pierde el foco),
   - en `saveAndNext` y el handler de atrás: llamar `quickRef.current?.focus()` + `.select()` **sincrónico** dentro del handler (dentro del gesto del usuario), manteniendo el `setTimeout` solo como fallback.
   - El teclado solo debe cerrarse al tocar fuera (comportamiento nativo) o al salir del modo.
3. Probar en móvil real (iOS) antes de dar por cerrado — es exactamente el detalle que el cliente mira.

---

## F3 — Sectores físicos de stock (feature nueva, ~2-3 h)

Objetivo: el usuario agrupa productos por espacio físico (almacén, cámara frigorífica, heladera, centro de producción, cava de vinos) y al Stockear elige el espacio donde está parado.

**DB** (usar `/add-rls stock_sectores` para las policies; migración con `NOTIFY pgrst, 'reload schema';`):
```sql
CREATE TABLE stock_sectores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id UUID NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  icono TEXT NOT NULL DEFAULT 'shelves',   -- Material Symbol
  orden INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE productos ADD COLUMN sector_id UUID NULL REFERENCES stock_sectores(id) ON DELETE SET NULL;
CREATE INDEX idx_productos_sector ON productos(sector_id);
```
Nota: NO reusar `checklist_secciones` (tipo almacen/heladera) — ese es el dominio del Mise/Mesa de Trabajo; mezclar los dos confunde. Un producto pertenece a UN sector (v1).
Iconos sugeridos por defecto al crear: almacén `shelves`, cámara `ac_unit`, heladera `kitchen`, freezer `severe_cold`, producción `skillet`, cava `wine_bar`.

**Hook** `lib/hooks/useStockSectores.ts`: patrón SWR estándar (copiar de `useCategoriasProducto`), CRUD nombre/icono/orden. Agregar `sector_id` al tipo `Producto` en `types`.

**UI en `ClientView.tsx`:**
1. **Sheet "¿Qué sector vas a stockear?"** (~línea 1890): si hay sectores creados, mostrar PRIMERO los sectores físicos (con count + críticos, mismo formato que las categorías actuales) y abajo un separador "Por categoría" con lo actual. `quickSector` pasa a guardar el nombre del sector para el subtítulo. Botón "+ Crear sector" al final del sheet (inline: input nombre + selector de icono simple).
2. **Asignación masiva** — modo selección: botón "Asignar sector" (solo `canEdit`) dentro del sheet de sectores o en el footer. Al activarlo: la tabla muestra checkboxes por fila (columna extra o overlay en la col Producto), barra inferior fija "N seleccionados → [dropdown sector] Asignar" que hace un solo UPDATE batch (`.in('id', ids)`). Salir con ×. No usar overlay `position:fixed` con zIndex ≤100 (gotcha BottomNav — usar 1000).
3. **Modal de edición de producto**: dropdown "Sector" (opcional) junto a Categoría, mismo patrón que categoría (sin botón + acá; los sectores se crean desde el sheet).
4. **Filtro**: agregar `MultiSelectFiltro` "Sector" solo si hay sectores creados (al lado del de Proveedor); si genera apretujamiento en mobile, meterlo dentro del de Proveedor no — mejor scrolleable horizontal como ya está el header.

---

## F4 — Productos "fuera de uso" (~1 h)

**DB**: `ALTER TABLE productos ADD COLUMN fuera_de_uso BOOLEAN NOT NULL DEFAULT false;` + `NOTIFY pgrst, 'reload schema';`

**Comportamiento** (la regla: sigue existiendo y valiendo plata, pero no genera ruido operativo):
- `calcEstado`/conteos: un producto `fuera_de_uso` NUNCA es crítico/bajo/pendiente → en `useStock.ts` `calcEstado` devolver `'ok'` si `fuera_de_uso` (o mejor: excluirlo de `nCritico`/`nBajo`/`nPendiente` y del badge — decidir en implementación, lo simple es estado `'ok'` + badge propio).
- Excluido de: listas del modo Stockear (filtrar en el sheet de sectores/categorías), `sugerir-minimos` (agregar al filtro de candidatos en `app/api/stock/sugerir-minimos/route.ts:39-41`), sugerencia de carrito.
- Incluido en: valor total del stock (es capital), export Excel/PDF (con columna).
- **UI**: toggle "Fuera de uso" en el modal de edición (checkbox estilo del de Producción interna, gris). Fila en la tabla con opacity .55 + badge gris "Fuera de uso" en `estadoBadge`. Chip de filtro para verlos (default: se muestran al final o mezclados pero apagados — mantener simple: mezclados y apagados).

---

## F5 — Sincronizar precios de stock con facturas (el hallazgo #1 de la auditoría, ~2 h)

Diagnóstico (datos reales Bros): solo 1/480 productos tiene `precio_historial`; última factura 06-07 vs último historial 08-06. Causa: `facturas-universal` inserta facturas+items pero **nunca actualiza `productos` ni `precio_historial`** — los precios solo se refrescan con OCR individual o Rebuild (destructivo). Resultado: 79/152 productos matcheables tienen precio desfasado >5% vs su última compra.

1. **Endpoint nuevo `POST /api/stock/sync-precios-facturas`** (admin client + `requireRestauranteId`, patrón de `sugerir-minimos`):
   - Modo `preview`: por cada producto activo (no `es_produccion`, no `fuera_de_uso`), buscar el último `factura_items` que lo matchee (match por palabra completa de F1.2, misma dirección ítem⊇producto; normalizar unidad con la lógica de `normalizeForStock` — copiarla a un helper compartido `lib/stock/precios.ts` para no duplicar). Devolver lista `{ producto, precio_actual, precio_nuevo, fecha, delta_pct }` solo donde difieren >2%.
   - Modo `apply` con `items` seleccionados: UPDATE `productos.precio_unitario` + INSERT `precio_historial` (con `factura_id` y fecha de la factura) + propagar a `ingredientes` vía la misma lógica de `sync-precio`.
   - **No tocar stock_actual ni umbrales** — solo precios (a diferencia del Rebuild).
2. **UI**: banner/botón "Actualizar precios desde facturas" en Stock (visible si el preview devuelve >0 desfasados; puede ser un botón junto a Rebuild que abre un sheet con la lista, checkboxes, y CTA aplicar). Reusar el patrón visual del modal de Rebuild.
3. **Importador universal**: al final de `insertBatch` en `facturas-universal/route.ts`, disparar la misma lógica de sync (server-side, best-effort `try/catch`) solo para los productos afectados por las facturas recién insertadas → de acá en adelante los precios no se desfasan más y `precio_historial` se puebla (lo que además arregla el filtro "Inmóvil", que hoy da resultados falsos porque depende de esa tabla vacía).
4. **Cuidado con unidades**: si la unidad de la factura no es convertible a la del producto (familia distinta), EXCLUIR del preview (no adivinar) — es la misma protección factor-0 del food cost.

---

## F6 — Limpieza de duplicados (script + guardas, ~1.5 h)

Datos reales:
- **El Rescoldo**: duplicados exactos masivos precio=0/stock=0 (Sal ×15, Msg ×9, Leche en polvo ×9, Tomate en polvo ×8, Oregano ×6, +18 grupos más).
- **Bros**: 7 pares tilde/plural (`Aji molido`($7438/kg)↔`Ají molido`($0/g), `Azucar`↔`Azúcar`, `Huevos`↔`Huevo`, `Limon`↔`Limón`, `Fécula/Fecula de mandioca`, `Orégano`↔`Oregano`, `Semolín`↔`Semolin`) + pares dudosos base↔extendido (`Alcaparras`↔`Alcaparras en frasco` con precio idéntico, `Aceitunas`↔`Aceitunas descarozadas`).

1. **Script `scripts/fusionar-duplicados-productos.mjs`** (JS puro sin tipos, patrón `load-recetas-2026.mjs` con service role): agrupa por `unaccent(lower(trim(nombre)))` + variante singular/plural; dentro de cada grupo elige canónico (el que tiene precio>0, luego stock>0, luego más viejo); re-apunta `ingredientes.producto_id`, `precio_historial.producto_id`, `pedido_items.producto_id` al canónico; suma stocks; desactiva (`activo=false`) los demás. Dry-run por defecto, `--apply` para ejecutar, `--restaurante <id>`. Los pares base↔extendido NO se fusionan automáticamente (solo reporte para decidir a mano).
2. **Guardia en el alta manual**: en `handleSave` (alta), antes de insertar, buscar producto existente con nombre normalizado igual (sin tilde, case-insensitive) → si existe, mostrar error "Ya existe «X»" con opción de abrirlo. (La comparación en cliente sobre `productos` ya cargados alcanza.)
3. **Matching de facturas insensible a tildes**: en `useFacturas` (exacto y parcial), normalizar ambos lados con un helper `sinTildes(s)` (`s.normalize('NFD').replace(/\p{M}/gu,'')`) para que `Limon`≡`Limón` deje de crear gemelos.

---

## Verificación final

- `npm run build` + smoke test en móvil del flujo Stockear (teclado, flecha atrás, sector).
- Correr `scripts/fusionar-duplicados-productos.mjs` en dry-run sobre Bros y El Rescoldo, revisar salida, aplicar.
- Sync de precios: preview sobre Bros, validar 3-4 casos a mano contra facturas (ej. Alcaparras 18845→15489, Arroz basmati 4959→7530) antes de aplicar.
- `/update-status` al cerrar: documentar `stock_sectores`, `productos.sector_id`, `productos.fuera_de_uso` en `columnas.md` (y sumar `stock_sectores` a `reset_demo_restaurante()` o la demo la pierde en el próximo reset — gotcha documentado en columnas.md para `salon_elementos`).
