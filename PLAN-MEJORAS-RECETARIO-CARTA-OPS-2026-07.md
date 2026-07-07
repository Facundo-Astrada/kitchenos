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

## Tanda B — Recetario (todo en `app/(app)/recetario/[id]/page.tsx`)

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

## Tanda C — Carta (`ComposicionEditor.tsx` + migración menús)

### C1 · Fecha de evento  *(obs. Carta #1)*
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
- **Variantes de menú (DECIDIDO):** un menú a **un precio** ofrece varias composiciones alternativas y **el comensal elige una** (ej. variante A: entrada+proteína+postre / variante B: entrada+pasta+postre). Modelo: agregar una capa de "variante" sobre la composición. Opciones a evaluar en C2: (a) columna `variante TEXT` en `menu_preparaciones` que agrupa preparaciones por variante, o (b) tabla `menu_variantes`. El precio vive en el menú, no en la variante.

### C3 · Crear receta inexistente (en rojo hasta realizarse)  *(obs. Carta #2 y #3)*
- **Ya existe a medias:** `crearIdeaReceta`/`agregarIdea` crea `recetas` con `status:'draft'`; el recetario ya las separa en la tab "Ideas" (`recetario/page.tsx` líneas 240-241).
- Falta:
  - (a) Habilitar "+ Crear receta" también en **modo menú/evento** (hoy solo en modo plato).
  - (b) Pintar en **rojo** el ítem vinculado mientras la receta esté `draft`, en el editor y donde aparezca.
  - (c) Confirmar que OPS se puede ejecutar sobre ese ítem draft (con Tanda A, gratis).

---

## Tanda D — Feature nueva: split de receta en N partes  *(obs. Recetario #4)*

Único cambio que no es refactor. Objetivo: al cargar una receta larga o con ingredientes compartidos, dividirla en partes (P1, P2, P3…) diferenciando qué ingredientes van a cada una. Opcional, activado por un botón en el editor de receta.

- **DB:** `supabase/migrations/20260707_ingredientes_parte.sql` — `ALTER TABLE ingredientes ADD COLUMN IF NOT EXISTS parte SMALLINT NULL;` (`NULL` = receta sin dividir) + `NOTIFY pgrst`. Verificar con `/supabase-check ingredientes`.
- **UI editor de receta:** botón "Dividir en partes" → agrupa ingredientes por `parte` (agregar/quitar partes, reasignar cada ingrediente). N partes, no fijo a 2.
- **Render de ficha:** cuando hay partes, mostrar ingredientes agrupados por P1/P2/… con su sub-total.
- **Ficha técnica / gramajes** (obs. Recetario #2): en gran parte ya cubierto (`recetas.peso_total_g`, `peso_escurrido_g`, gramaje por ingrediente). Confirmar con el cliente si falta algo o es solo presentación.

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
