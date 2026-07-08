# Plan — Mejoras Recetario · Carta · OPS (jul 2026)

> Fuente: observaciones del cliente (sesión 7 jul 2026).
> Decisiones tomadas: precio de venta **oculto en la ficha salvo dentro del food cost** · split de receta **a N partes** (no fijo a 2) · ejecutar **por tandas** tras aprobar este plan.

Estado: **PLANIFICADO** — nada implementado todavía.

---

## Keystone — Unificar el panel de OPS

Hoy el mismo panel de OPS/mise está **triplicado** con UIs divergentes, todos escribiendo `checklist_items` vía `lib/ops/mise.ts › upsertMiseChecklistItem`:

| Ubicación | Componente | Forma actual |
|---|---|---|
| Recetario (ficha) | `app/(app)/recetario/[id]/RecetaOpsSheet.tsx` | bottom sheet (el más completo) |
| Carta → Plato | `app/(app)/carta/ComposicionEditor.tsx › PlatoRecetasEditor` | panel inline expandible |
| Carta → Menú/Evento | `app/(app)/carta/ComposicionEditor.tsx › ItemRowInline` | otra variante inline |

**Objetivo:** un único `components/ops/OpsPanel.tsx` (campos: plaza → sección mise → recipiente → cantidad+unidad → tamaño/porción con cálculo de porciones auto), usado en todos lados y **siempre a nivel de componente/ítem**, nunca del plato entero.

**Hallazgo (7 jul):** `RecetaOpsSheet` y el panel de `PlatoRecetasEditor` son el **mismo panel rico** (duplicado real). `ItemRowInline` (menú/evento) es **otro editor** (plaza/sección libres + cantidad, sin recipiente/porciones). Por eso:
- **Tanda A (refactor puro):** extraer `OpsPanel` y deduplicar los dos consumidores idénticos (`RecetaOpsSheet` + `PlatoRecetasEditor`). Sin cambio de comportamiento.
- **Adopción en menú/evento** (`ItemRowInline` → botón OPS con `OpsPanel`) se hace en **Tanda C**, junto con el rediseño del ítem de menú (cambia modelo + UX, no es solo dedupe).

Resuelve: Recetario #1 (OPS por componente) y la base de Carta #4 (el componente compartido); menú/evento cierra Carta #4 en C.

---

## Tanda A — `OpsPanel` compartido  *(keystone)* — ✅ HECHA (7 jul)

**Implementado:**
- `components/ops/OpsPanel.tsx` (nuevo) — panel único, emite `OpsResult`, exporta `OpsInitial`/`OpsResult`/`UNIDADES_OPS`/`UNIDADES_PORCION`.
- `RecetaOpsSheet.tsx` → chrome de sheet + prefill; delega campos/acciones a `OpsPanel`.
- `ComposicionEditor.tsx › PlatoRecetasEditor` → borrado el panel duplicado (~125 líneas) + estado local OPS; ahora usa `OpsPanel` (`saveOps`/`clearOps`). Removida const `UNIDADES_OPS` local.
- `npm run build` ✅ sin errores.
- Pendiente: adopción en menú/evento (`ItemRowInline`) → Tanda C. Correr `ui-auditor` sobre los 2 usos.

---

### (referencia) diseño original

**Archivos**
- **Nuevo** `components/ops/OpsPanel.tsx` — extraído de `RecetaOpsSheet` (tiene recipiente + peso/porción + porciones auto). Modo `presentacion?: 'sheet' | 'inline'` para servir ambos usos.
- `RecetaOpsSheet.tsx` → wrapper fino sobre `OpsPanel` (mantiene su firma pública, sin romper `recetario/[id]`).
- `ComposicionEditor.tsx` → `PlatoRecetasEditor` e `ItemRowInline` consumen `OpsPanel` en vez de su UI propia.
- Reusa `PLAZAS_OPS`, `SECCIONES_OPS`, `upsertMiseChecklistItem` de `lib/ops/mise.ts` (sin duplicar constantes).

**Notas**
- El panel devuelve el objeto OPS (`{ plaza, seccion, cantidad, unidad, recipienteNombre, pesoPorcion, pesoPorcionUnidad }`); quién persiste depende del contexto: ficha → `upsertMiseChecklistItem` directo; plato/menú → se guarda en el estado del editor y persiste en `handleSave`.
- Respetar `useSheetOpen()` cuando se monte como sheet (oculta el Coach FAB — ver `ui.md`).

**Cierre:** correr agente `ui-auditor` sobre los 3 puntos de uso.

---

## Tanda B — Recetario (todo en `app/(app)/recetario/[id]/page.tsx`) — ✅ HECHA (7 jul)

**Implementado:**
- **B1** — banner de sync de precio receta↔plato movido del cuerpo a la sección Food Cost; el precio de venta ahora solo aparece dentro de Food Cost o del modal Editar.
- **B2** — botón "Convertir a plato" envuelto en `{isAdmin && …}` (el botón OPS sigue para `canEdit`).
- **B3** — `handleDelete`: si la receta es plato (`linkedPlato`), llama `eliminarItem(linkedPlato.id)` antes del soft-delete → ya no queda plato huérfano. Diálogo de confirmación avisa el caso. `eliminarItem` agregado al destructure de `useCarta`.
- `npm run build` ✅ Compiled successfully.

---

### (referencia) diseño original

### B1 · Precio de venta oculto salvo en food cost  *(obs. Recetario #5)*
- Quitar el bloque de precio de la vista principal de la ficha (≈ líneas 893, 951).
- **Conservar** el input en el form "Editar" (línea 1398) y el uso interno para `calcFoodCost`.
- El precio solo se muestra **dentro de la sección de food cost** (contexto de rentabilidad), no como dato propio de la receta.

### B2 · "Convertir a plato" solo admin  *(obs. Recetario #6)*
- Envolver el botón (≈ líneas 589-604) con `isAdmin` de `usePermisos`.
- Si no es admin: ocultar el botón (no solo deshabilitar).

### B3 · Desactivar recetas que son "plato"  *(obs. Recetario #3)*
- Hoy `es_plato` (derivado en `useRecetas` desde `carta_items.receta_id`) bloquea el soft-delete.
- Permitir desactivar (`recetas.activa = false`); al hacerlo, **desvincular/eliminar** el `carta_item` con ese `receta_id` (o avisar y confirmar). Verificar el flujo con `carta_items` (FK `receta_id`, ON DELETE SET NULL).
- Confirmar UX: ¿desactivar receta = quitar plato de la carta? (recomendado: sí, con confirmación).

---

## Tanda C — Carta — ✅ HECHA COMPLETA (7 jul)

**Resumen de lo implementado (todo compila):**
- **C1 fecha de evento** ✓ (migración `menus.fecha_evento`, input date en modo evento, chip en card).
- **Variantes de menú** ✓ (esquema columna, `menu_preparaciones.variante` + `menus.variantes`; UI definir + selector por ítem + chip).
- **OPS por ítem en menú/evento** ✓ — `ItemRowInline` ahora usa el `OpsPanel` compartido (botón OPS + resumen); se quitaron los campos libres de plaza/sección. Migración `20260707_menu_precio_ops.sql`: `menu_preparaciones` gana `cantidad_ops/unidad_ops/recipiente_nombre/peso_porcion/peso_porcion_unidad`. Cierra Carta #4.
- **Crear receta inexistente en rojo** ✓ — botón "Crear … como receta" en el buscador de secciones de menú/evento (además del ya existente en plato); ítems con receta `draft` se pintan en rojo + badge "a realizar" (en plato y en menú/evento). Set `allDraftIds` = drafts de useRecetas + creados en la sesión.
- **Precio del menú/evento** ✓ — nuevo `menus.precio`; input de precio en modo menú/evento; food cost del resumen ahora también aplica a menú.
- **Reorden de forms** ✓ — orden resultante plato: nombre → precio/categoría → especificaciones → descripción → composición; menú/evento: nombre → precio → (fecha) → descripción → variantes → composición.
- 3 migraciones aplicadas a la DB (verificadas) + guardadas en `supabase/migrations/`.
- `npm run build` ✅.
- Pendiente futuro (no bloqueante): consumo de variantes en `activarMenu` (producción/salón).

---

### (referencia) diseño original — Tanda C

### C1 · Fecha de evento — ✅ HECHA (7 jul)
- Migración `20260707_menus_fecha_evento.sql` aplicada (columna `menus.fecha_evento DATE NULL`, verificada).
- `useMenus`: tipo + `crearMenu`/`actualizarMenu` escriben `fecha_evento`.
- `ComposicionEditor`: `CompPayload.fechaEvento` + input `type=date` visible solo en modo evento; descripción de evento pasa a "Lugar, comensales…".
- `carta/page.tsx`: `handleComposicionSave` pasa `fecha_evento`; `menuToInicial` lo lee para editar.
- `MenusView`: chip con la fecha en la card de eventos.
- `npm run build` ✅.

### C1 · Fecha de evento (diseño)  *(obs. Carta #1)*
- **Migración** `supabase/migrations/20260707_menus_fecha_evento.sql`:
  `ALTER TABLE menus ADD COLUMN IF NOT EXISTS fecha_evento DATE NULL;` + `NOTIFY pgrst, 'reload schema';`
  (verificar columnas reales antes con `/supabase-check menus`; hereda RLS de `menus`, no requiere policy nueva).
- UI: `<input type="date">` visible **solo en modo evento**. Hoy esa info se mete a mano en "descripción".
- Persistir en `useMenus`/payload de guardado.
- Usar agente `migrator` para el script.

### C2 · Reordenar campos de creación  *(obs. Carta #2 y #3)*
Orden objetivo **Plato**: nombre → precio → sección (categoría) → especificaciones (tags) → descripción → recetas/productos + buscador.
- El orden actual ya es casi ese; es mayormente cosmético (separar precio/categoría, mover labels). Bajo esfuerzo.

Orden objetivo **Menú/Evento**: nombre → precio del menú (con **variantes** de composición a ese mismo precio) → descripción → composición (Entradas / Principal / Postre). Cada ítem de composición muestra: buscador (receta/producto/plato/crear) + especificaciones alimentarias + botón OPS (`OpsPanel` de Tanda A).
- **Variantes de menú — ✅ HECHA (7 jul, esquema "columna en preparaciones"):**
  - Migración `20260707_menu_variantes.sql` aplicada: `menu_preparaciones.variante TEXT NULL` (NULL = común a todas) + `menus.variantes TEXT[] NULL` (lista de nombres).
  - `useMenus`: tipos + persistencia de `variante` por prep y `variantes` del menú.
  - `ComposicionEditor`: sección "Variantes" en Datos (chips add/remove) + selector Común/variante por ítem en `ItemRowInline` + chip en la fila colapsada. `CompPayload.variantes` + `CompItemOut.variante`.
  - `carta/page.tsx`: guardado + `menuToInicial` leen/escriben variante(s).
  - Pendiente futuro: consumo en `activarMenu` (hoy activa todas las preps; la selección del comensal es tema aparte).
  - `npm run build` ✅.

- **Variantes de menú (diseño DECIDIDO):** un menú a **un precio** ofrece varias composiciones alternativas y **el comensal elige una** (ej. variante A: entrada+proteína+postre / variante B: entrada+pasta+postre). Modelo: agregar una capa de "variante" sobre la composición. Opciones a evaluar en C2: (a) columna `variante TEXT` en `menu_preparaciones` que agrupa preparaciones por variante, o (b) tabla `menu_variantes`. El precio vive en el menú, no en la variante.

### C3 · Crear receta inexistente (en rojo hasta realizarse)  *(obs. Carta #2 y #3)*
- **Ya existe a medias:** `crearIdeaReceta`/`agregarIdea` crea `recetas` con `status:'draft'`; el recetario ya las separa en la tab "Ideas" (`recetario/page.tsx` líneas 240-241).
- Falta:
  - (a) Habilitar "+ Crear receta" también en **modo menú/evento** (hoy solo en modo plato).
  - (b) Pintar en **rojo** el ítem vinculado mientras la receta esté `draft`, en el editor y donde aparezca.
  - (c) Confirmar que OPS se puede ejecutar sobre ese ítem draft (con Tanda A, gratis).

---

## Tanda D — Receta como plato: OPS por ingrediente/subreceta — ✅ HECHA (7 jul)

**Implementado:**
- Migración `20260707_receta_es_plato_ingredientes_ops.sql` aplicada: `recetas.es_plato BOOLEAN DEFAULT false` + columnas OPS en `ingredientes` (`plaza, seccion_mise, cantidad_ops, unidad_ops, recipiente_nombre, peso_porcion, peso_porcion_unidad`).
- `types/index.ts`: `Receta.es_plato` + campos OPS en `Ingrediente`.
- `useRecetas`: `es_plato` como columna real; el derivado (link a carta) renombrado a **`en_carta`** para no colisionar. CRUD pasa los campos por spread (ya servía).
- **`components/... IngredienteOpsSheet.tsx`** (nuevo): bottom sheet que envuelve `OpsPanel` para un ingrediente.
- **`recetario/[id]/page.tsx`**: toggle "Trabajar como plato" en el modal Editar; cuando `es_plato`, cada fila de ingrediente/subreceta suma botón OPS (label = plaza) → abre `IngredienteOpsSheet` → guarda en la fila (`actualizarIngrediente`) y, si es subreceta, alimenta el mise (`upsertMiseChecklistItem` keyed por `subreceta_id`).
- **`recetario/page.tsx`** (`NuevaFichaScreen`): mismo toggle "Trabajar como plato" al crear (persiste vía `agregarReceta`/`/api/recetas/save` que hace `...receta`).
- `npm run build` ✅.
- **Ojo:** el badge PLATO de la lista ahora refleja `es_plato` (el modo), no `en_carta` (link a carta) — cambio de significado intencional.
- **Pendiente futuro:** propagar al mise vivo los ingredientes-**producto** (sin `receta_id`); hoy guardan el ruteo en la línea pero no crean checklist_item.

---

### (referencia) diseño original — Tanda D

> **Reemplaza** el split P1/P2 original (subsumido: en vez de partes arbitrarias, cada ingrediente/subreceta se rutea a su plaza real — más granular).
> **Decisiones (7 jul):** "trabajar como plato" = **flag propio** `recetas.es_plato`, separado de la carta · los componentes ruteables son los **ingredientes/subrecetas de la propia receta**.

**Concepto:** una receta puede marcarse "trabajar como plato" (elegido al crear/editar). Cuando lo está, cada ingrediente/subreceta de su ficha técnica muestra un botón OPS (el `OpsPanel` compartido) → cada componente se rutea a su plaza/sección/recipiente. La ficha del recetario se comporta como el editor de composición de Carta/Menú, pero los componentes son los ingredientes de la receta.

**La sintonía = extender a `ingredientes` el mismo trío que ya usan `plato_recetas` y `menu_preparaciones`:** `OpsPanel` (UI única, hecho) + columnas OPS en la fila de composición + `upsertMiseChecklistItem` (escritor único del mise).

- **DB:**
  - `recetas.es_plato BOOLEAN DEFAULT false` — flag explícito (modo), elegido al cargar. **Ojo naming:** hoy `es_plato` es *derivado* en `useRecetas` (link a `carta_items`); pasa a ser columna real. El derivado "está en la carta" se renombra a `en_carta` (mantiene el badge sin colisión).
  - `ingredientes` gana las columnas OPS: `plaza TEXT, seccion_mise TEXT, cantidad_ops NUMERIC, unidad_ops TEXT, recipiente_nombre TEXT, peso_porcion NUMERIC, peso_porcion_unidad TEXT` (mismo set que `menu_preparaciones`). `NOTIFY pgrst`.
- **`useRecetas`:** `es_plato` como columna real en el tipo + CRUD; renombrar el derivado a `en_carta`; tipo + CRUD de `ingredientes` con las columnas OPS.
- **Recetario — form crear/editar:** toggle "Trabajar como plato" → setea `recetas.es_plato`.
- **Recetario ficha (`recetario/[id]/page.tsx`):** cuando `es_plato`, cada fila de ingrediente/subreceta suma un botón OPS → abre `OpsPanel` (sheet, reusa `RecetaOpsSheet` o inline) → guarda en la fila del ingrediente + chip resumen (plaza/sección).
- **Mise (mismo criterio que Carta):** subrecetas (tienen `receta_id` propio) → `upsertMiseChecklistItem` keyed por ese receta_id. Ingredientes-producto (sin receta_id) → por ahora se guarda el ruteo en la línea (definición); la propagación al mise vivo del producto queda como paso siguiente (o vía ítem por nombre).
- **Ficha técnica / gramajes** (obs. Recetario #2): ya cubierto (`recetas.peso_total_g`, `peso_escurrido_g`, gramaje por ingrediente) — sin trabajo extra salvo presentación.

---

## Orden de ejecución sugerido

1. **Tanda A** (keystone — desbloquea C y parte de B).
2. **Tanda B** (cambios chicos, alto impacto visible, 1 archivo).
3. **Tanda C** (usa el `OpsPanel` de A).
4. **Tanda D** (feature nueva, aislada).

Cada tanda: implementar → `npm run build` → `ui-auditor` si toca UI → deploy con `/deploy`.

---

## Decisiones pendientes antes de C2

- **Clasificación de composición del menú** ("entrada+proteína+postre" vs "entrada+pasta+postre"): ¿son **variantes** del mismo menú a un precio (el comensal elige una), o **secciones con opciones** dentro de la composición? Esto define el modelo de datos (¿nueva tabla de variantes o se resuelve con las secciones actuales de `menu_preparaciones`?). Definir antes de tocar C2.

## Riesgos / cuidados

- `checklist_items` keyed por `(restaurante_id, receta_id, plaza)`: al unificar OPS mantener esa clave (no romper el mise existente).
- Migraciones: **siempre** cerrar con `NOTIFY pgrst, 'reload schema';` (gotcha conocido — `hooks.md`).
- `ComposicionEditor` es grande (~1082 líneas): extraer `OpsPanel` sin cambiar la firma pública de `ItemRowInline`/`PlatoRecetasEditor` para no romper `carta/page.tsx`.
