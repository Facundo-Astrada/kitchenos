# PLAN — Menús y eventos en el Mise (SP/P/REF/OK + apertura/cierre)

**Objetivo:** que un menú ejecutivo planificado para salir una o dos semanas se comporte en OPS
igual que el mise: cada preparación con su prioridad SP/P/REF/OK, tildable en la apertura y en
el cierre, y que desaparezca solo cuando el menú deja de estar vigente.

**Estado hoy (verificado):**
- `ComposicionEditor.tsx:83` define `PRIORIDADES` con las etiquetas SP/P/REF/Check → **nunca se
  renderiza**. Todos los ítems de menú se guardan hardcodeados en `'media'` (líneas 673, 730, 738, 791).
- La rama Plato de `handleComposicionSave` (`carta/page.tsx:3218`) llama `upsertMiseChecklistItem`
  → el componente entra al Mise. La rama **Menú/Evento solo escribe `menu_preparaciones`** → nunca
  toca `checklist_items`, así que no hay apertura/cierre.
- `menus` tiene `fecha_evento` (una fecha), no un rango. `checklist_items` no tiene `menu_id` ni fecha.

---

## Decisiones de diseño (leer antes de tocar código)

**D1 — La escala de prioridad NO se migra.** `menu_preparaciones.prioridad` sigue siendo
`critica|alta|media|baja`. El mapeo a la escala del mise ya existe invertido en
`MISE_PRIO_TO_TAREA` (`ProductoMiseCard.tsx:45`) y coincide exactamente con `PRIORIDADES`:
`sp↔critica`, `p↔alta`, `ref↔media`, `chk↔baja`. Se agrega solo el mapa inverso.
*Por qué:* migrar los valores rompería el board de Producción, que lee esa misma columna como
prioridad de tarea.

**D2 — La vigencia vive en `menus`, no en el ítem.** Columnas nuevas `vigencia_desde` /
`vigencia_hasta`. `fecha_evento` queda intacta (un evento de un día es desde = hasta = fecha_evento).
*Por qué:* si la vigencia se copia a cada `checklist_item`, se desincroniza al editar el menú.

**D3 — El ítem de menú es una fila propia en `checklist_items`, con `menu_id`.** Nullable, FK a
`menus(id) ON DELETE CASCADE`. Clave del upsert:
- carta/plato → `(restaurante_id, receta_id, plaza)` con `menu_id IS NULL` (sin cambios)
- menú → `(restaurante_id, menu_id, plaza, nombre)`

*Por qué es crítico:* sin `menu_id`, activar un menú que usa una receta que la carta ya tiene en el
mise **pisa la cantidad** del ítem permanente, y desactivarlo lo **borra**. Además
`menu_preparaciones` admite `tipo='producto'|'plato'` sin `ref_id` de receta — la clave por
`receta_id` ni siquiera existe para todas las preparaciones.

**D4 — Activación explícita + vigencia que controla la visibilidad.** El chef aprieta "Activar en
el mise" (acto explícito: este menú entra a producción). Los ítems se crean ya, pero el mise solo
los muestra si hoy cae dentro de `[vigencia_desde, vigencia_hasta]`. Así se puede dejar armado un
menú que arranca el lunes que viene sin que ensucie la apertura de mañana.

**D5 — Desactivar NO borra: pone `vigencia_hasta = ayer`.** Los `checklist_registros` de apertura y
cierre apuntan a esos `checklist_item_id`; borrar las filas se llevaría puesto el historial. Solo
se borra de verdad al eliminar el menú (vía CASCADE).

**D6 — Apertura/cierre sale gratis.** `checklist_registros` referencia `checklist_item_id`, y
`fetchRegistros` filtra con los ids que ya tiene en memoria. Los ítems de menú entran solos: tilde,
badge de prioridad, envío a Producción y pase por tarea funcionan sin tocar el motor del mise.

---

## Fase 0 — Migración

`supabase/migrations/20260816_menus_vigencia_mise.sql`

```sql
alter table menus
  add column if not exists vigencia_desde date,
  add column if not exists vigencia_hasta date;

-- Backfill: los eventos existentes ya tienen su fecha
update menus set vigencia_desde = fecha_evento, vigencia_hasta = fecha_evento
where fecha_evento is not null and vigencia_desde is null;

alter table checklist_items
  add column if not exists menu_id uuid references menus(id) on delete cascade;

create index if not exists idx_checklist_items_menu
  on checklist_items(menu_id) where menu_id is not null;

notify pgrst, 'reload schema';
```

- El `notify` no es opcional: sin él el browser no ve las columnas nuevas.
- Verificar después con `/supabase-check menus` y `/supabase-check checklist_items`.
- **Chequear que `menus` tenga RLS por `mi_restaurante_id()`** — la Fase 5 hace un embed
  `checklist_items → menus`, y si `menus` estuviera abierta el embed filtraría de más o de menos.

## Fase 1 — Selector de prioridad en el editor

`app/(app)/carta/ComposicionEditor.tsx`

1. Renderizar el `PRIORIDADES` que ya está definido (línea 83) dentro de `ItemRowInline`, en el
   bloque expandido, arriba del OpsPanel. Cuatro chips con `label` + `sublabel`.
2. En la fila colapsada, badge con `PRIO_CFG[item.prioridad]` al lado del chip de plaza — que se
   lea la prioridad sin expandir.
3. Los tres `prioridad: 'media'` hardcodeados (730, 738, 791) quedan como default; ahora son
   editables. El de la línea 673 (import desde receta) también.
4. **Bonus barato:** que la rama Plato respete la prioridad elegida en vez del `'sp'` hardcodeado
   de `upsertMiseChecklistItem` — agregar un parámetro `prioridad` opcional al helper
   (`lib/ops/mise.ts:85`), default `'sp'` para no cambiar el comportamiento de los callers viejos.

## Fase 2 — Vigencia en el editor

`ComposicionEditor.tsx` · `lib/hooks/useMenus.ts` · `app/(app)/carta/page.tsx`

1. Dos inputs `date` "Vigente desde / hasta" en el header del editor, solo en modo `menu`/`evento`.
   En modo evento, al cargar `fechaEvento` autocompletar ambas con esa fecha.
2. Sumar `vigenciaDesde` / `vigenciaHasta` a `CompPayload`, a `MenuConPreparaciones`, a `crearMenu`
   y `actualizarMenu`.
3. `menuToInicial` (`carta/page.tsx:3287`) las mapea de vuelta al abrir para editar.
4. Validación mínima: `hasta >= desde`; ambas vacías = menú sin vigencia definida → no se puede
   activar en el mise (el botón de Fase 4 lo explica).

## Fase 3 — El activador

Archivo nuevo: `lib/ops/menuMise.ts`

```ts
sincronizarMiseDeMenu({ supabase, restauranteId, menu }): Promise<{ creados: number; sinOps: number }>
```

- Candidatas: preparaciones con `plaza` **y** `seccion_mise`. Las que no tienen se cuentan en
  `sinOps` para avisar en la UI, y se saltean.
- Resolver `seccion_id`: extraer el bloque que hoy vive dentro de `upsertMiseChecklistItem`
  (`lib/ops/mise.ts:105-129`) a un helper exportado `resolverSeccionMise(...)` y usarlo desde los
  dos lados. No duplicar esa lógica — maneja el caso id legacy de `SECCIONES_OPS` vs UUID real.
- Upsert por `(restaurante_id, menu_id, plaza, nombre)`:
  - `prioridad`: `TAREA_PRIO_TO_MISE[prep.prioridad]` (mapa nuevo en `lib/ops/mise.ts`)
  - `cantidad`: `prep.cantidad_ops ?? prep.cantidad ?? 1` · `unidad`: `prep.unidad_ops ?? 'u'`
  - `receta_id`: `prep.tipo === 'receta' ? prep.ref_id : null`
  - `recipiente_nombre` / `recipiente_capacidad` / `peso_porcion` / `peso_porcion_unidad`: igual
    que la rama plato (`recipiente_capacidad = cantidad` cuando hay recipiente)
  - `menu_id`: el del menú
- **Prune:** borrar los `checklist_items` de ese `menu_id` cuyo `(nombre, plaza)` ya no esté en las
  preparaciones actuales. Hace la función idempotente y sirve para re-sincronizar tras editar.
- `desactivarMiseDeMenu(menuId)` → `update menus set vigencia_hasta = <ayer>`. No borra filas (D5).

Además: en `handleComposicionSave`, si el menú que se está guardando ya tiene ítems en el mise,
re-correr `sincronizarMiseDeMenu` después de `actualizarMenu` — si no, editar un menú activo deja
el mise desfasado.

## Fase 4 — Botón en la lista de menús

`app/(app)/carta/MenusView.tsx` → `MenuCard`

- Estado derivado por card: `enMise` (hay `checklist_items` con ese `menu_id`) y `vigente`
  (hoy dentro del rango, con `hoyOperativo()` de `lib/ops/turnos`).
- Tercer botón en la barra inferior:
  - sin activar → **"Activar en el mise"**
  - activado y vigente → chip verde "En el mise · hasta 31 ago" + acción "Sacar"
  - activado y futuro → chip gris "Entra el 24 ago"
- Al activar, toast con el resultado: `"6 preparaciones al mise · 2 sin plaza (no van)"`.
- Si el menú no tiene vigencia cargada, el botón está deshabilitado con hint "Cargá vigencia desde/hasta".
- El `enMise` necesita un fetch de `checklist_items` por `menu_id`: agregar a `useMenus` un
  `menuIdsEnMise: Set<string>` con **una** query agregada, no una por card.

## Fase 5 — El mise filtra por vigencia y muestra de qué menú viene

`lib/hooks/useChecklist.ts` · `types/index.ts` · `components/mise/ProductoMiseCard.tsx`

1. `MisePlaceItem` (`types/index.ts:640`): sumar `menu_id?: string | null` y
   `menus?: { nombre: string; vigencia_desde: string | null; vigencia_hasta: string | null } | null`.
2. `useChecklist.ts:51`: cambiar el `select('*')` por
   `select('*, menus(nombre, vigencia_desde, vigencia_hasta)')`.
   ⚠️ **Filtrar la vigencia en JS, nunca con `.eq('menus.vigencia_hasta', …)`** — el filtro sobre
   columna de tabla embebida no filtra la fila padre (bug conocido de PostgREST, ver
   `feedback_postgrest_join`).
3. Helper puro `menuItemVisible(item, hoy): boolean` → `true` si `menu_id == null`, si no,
   hoy dentro del rango. Aplicarlo al armar la lista de ítems.
4. Badge en `ProductoMiseCard`: chip con el nombre del menú, para que el cocinero distinga
   "esto es del menú de la quincena" del mise fijo.
5. El realtime de `checklist_items` no se dispara por cambios en `menus` — activar/desactivar tiene
   que llamar `mutateConfig()` explícito.

## Fase 6 — Tests y docs

- Vitest sobre `lib/ops/menuMise.ts` (patrón de `lib/ops/mise.test.ts`): sincronización idempotente
  (correr dos veces ≠ duplicados), prune de una prep borrada, mapeo de prioridad en las 4
  direcciones, `menuItemVisible` en los bordes del rango (desde, hasta, día anterior, día posterior).
- `.claude/docs/columnas.md`: `menus.vigencia_desde/hasta`, `checklist_items.menu_id`.
- Probar en El Rescoldo con un menú de dos semanas antes de dar por cerrado.
- `/update-manual` y `/update-status` al cierre.

---

## Riesgos

1. **Tarjeta duplicada.** Si la carta ya tiene la receta en el mise y el menú la agrega, el
   cocinero ve dos tarjetas de lo mismo. Conceptualmente es correcto (son dos demandas distintas,
   y la del menú se va cuando el menú termina), pero hay que mirarlo en Rescoldo con ojos de
   cocinero. Si molesta: agrupar por receta en la card, fase posterior.
2. **El embed suma peso al camino crítico del mise**, que es la pantalla más caliente de la app.
   Es un join chico y `menus` tiene pocas filas; igual medir que la apertura no se ponga lenta.
3. **`recipiente_cantidad` no existe en `menu_preparaciones`** (sí en la rama plato, codificado como
   sufijo `×N` en el nombre). Fase 1 asume 1 recipiente por preparación de menú; si hace falta más,
   se codifica con el mismo `encodeRecipienteNombre` que ya está en `lib/ops/mise.ts:68`.

## Orden de ejecución

0 → 1 → 2 → 3 → 4 → 5 → 6. Estrictamente en ese orden: la 3 necesita las columnas de la 0 y los
campos de la 2, y la 4 necesita el activador de la 3.

`npm run build` antes de cada push. Commit por fase.
