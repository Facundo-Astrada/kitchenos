# PLAN — Mejoras OPS · Recetario · Salón/KDS · Mesa de Trabajo (jul 2026)

> **Cómo ejecutar este plan (para las sesiones con Sonnet):**
> - 3 sesiones de acción + verificación al FINAL de cada una (no por ítem). Accionar en batch, un solo `npm run build` por sesión.
> - Leer SOLO los archivos/líneas citados acá — el plan ya trae las decisiones tomadas, no re-explorar.
> - Antes de cada migración: `/supabase-check <tabla>`. SQL siempre vía agente `migrator` (idempotente + `NOTIFY pgrst, 'reload schema';` al final).
> - Al cierre de cada sesión: agente `ui-auditor` sobre las pantallas tocadas → `npm run build` → checklist de verificación manual (abajo) → `/deploy` → `/update-status`.
> - Dev server: ya suele estar corriendo en `http://localhost:3000` (si el puerto está tomado, es que ya corre — no levantar otro).

---

## SESIÓN 1 — OPS + Recetario (mayormente UI, 1 migración chica)

### A1. Producción: modo "Evento" además de Menú/Carta
El tab Producción (`app/(app)/tareas/ClientView.tsx`, embebido en `app/(app)/operaciones/page.tsx`) tiene toggle `modo: 'carta' | 'menu'`. Agregar tercer modo `'evento'` que renderiza **igual que `'menu'`** (agrupado por sección).

- `types/index.ts:397` → `export type OpsModo = 'menu' | 'carta' | 'evento'`
- `app/(app)/tareas/ClientView.tsx` → el `OpsToggle` suma pill "Evento"; la rama de render `modo === 'menu'` (línea ~278) pasa a `modo === 'menu' || modo === 'evento'`; `secciones` (línea ~196) usa `SECCIONES_MENU` también para evento.
- `app/(app)/produccion/page.tsx:163` (`activarMenu`) → `modo: menu.tipo === 'evento' ? 'evento' : 'menu'` (hoy hardcodea `'menu'`). Revisar que `MenuActivoView`/`menuTareasDelDia` no filtren por `modo === 'menu'`.
- DB: `tareas.modo` es TEXT sin CHECK (verificar con `/supabase-check tareas`) → probablemente **sin migración**.

### A2. Carryover: la tarea de ayer se borra si hoy existe la misma
Regla nueva: si una tarea quedó sin completar de ayer (carryover) y HOY existe una tarea con **mismo `titulo` (trim+lower) + mismo `modo`**, la de ayer se **elimina de DB** y queda solo la de hoy.

- `app/(app)/produccion/page.tsx:129` (`activarMenu`): hoy deduplica al revés (si existe el arrastre de ayer, NO crea la de hoy). **Invertir**: crear siempre la de hoy y borrar el duplicado de ayer.
- `app/(app)/tareas/ClientView.tsx` (~línea 106-112, filtro de carryover): red de seguridad — al computar la lista, si una tarea de ayer duplica una de hoy, ocultarla y disparar delete fire-and-forget (vía la función del hook `useTareas` + `mutate()`, no insert/delete directo — ver `.claude/docs/hooks.md` §4).
- No tocar subtareas (`parent_id`): el delete de la madre debe llevarse las hijas (verificar cascade o borrarlas explícito).

### A3. Mise: mostrar "stock actual / estándar" al cargar stock
En `components/mise/ProductoMiseCard.tsx` el estándar es `item.cantidad` (+ `item.unidad`) y en recipientes `item.recipiente_capacidad` (porc). Mostrar **solo números**, formato `40 / 150 g`:

- `StockBox` (línea 104): agregar sufijo ` / {target} {unidad}` (target ya llega como prop).
- Rama recipiente (líneas ~490-544): el valor cargado muestra `{stockDisplay} / {recipiente_capacidad}` (hoy muestra solo `stockDisplay`); el placeholder "cargar stock" puede mostrar `— / {capacidad}`.
- Rama cierre (`StockDots` + input, ~línea 334): mismo criterio en el input editable.
- Recordar: el usuario carga el stock **en la unidad estándar cargada** — no agregar conversiones.

### A4. Planificación: reorganizar botones de carga de menú
Header actual de `app/(app)/produccion/page.tsx` (líneas 346-370): tres botones al mismo nivel — "Días", "Activar", "+ Plato" — nombres crípticos. Reorganización (usar skill `impeccable` como guía de jerarquía):

1. **CTA primario único** (blanco): `menu_book` **"Cargar menú"** → abre el picker de menús del catálogo (lo que hoy hace "Activar").
2. Dentro del picker, paso opcional **"¿Un día o varios?"** → ahí vive el multi-select de días (lo que hoy es el botón "Días" + calendario). El botón "Días" del header **desaparece**.
3. "+ Plato" → renombrar **"Plato suelto"**, degradado a botón secundario (ghost) o link dentro del empty state ("Sin menú cargado para este día" ya tiene CTA de menú — sumarle "o cargar un plato suelto").
4. El botón verde "Activar menú en N días" (línea ~447) queda como confirmación del flujo multi-día.
- Cierre: correr agente `ui-auditor` sobre esta pantalla.

### B1. Recetario: ingredientes en etapas/secciones
Para recetas complejas, poder agrupar ingredientes en etapas con nombre editable (ej. "Etapa 1 — marinada", "Etapa 2 — cocción"). Sin límite de 2, NULL = sin etapa (compat total con recetas existentes).

- **Migración** (agente `migrator`): `ALTER TABLE ingredientes ADD COLUMN IF NOT EXISTS grupo TEXT NULL;` + `NOTIFY pgrst, 'reload schema';` → documentar en `.claude/docs/columnas.md`.
- Ficha `app/(app)/recetario/[id]/page.tsx` (bloque INGREDIENTES, ~línea 725): agrupar por `grupo` (los NULL primero o bajo "General"), header de grupo con nombre editable inline; al agregar/editar ingrediente, selector de grupo (existentes + "nueva etapa").
- Editor/creación de receta (donde se agregan ingredientes en `recetario/page.tsx`): mismo selector.
- `/api/recetas/save`: pass-through de `grupo` en los inserts de ingredientes (los 4 modos).
- El cálculo de food cost NO cambia (sigue sobre la lista plana).

**Verificación fin de sesión 1:** build + en browser: activar un menú tipo evento → aparece en Producción bajo pill Evento agrupado por sección; activar el mismo menú 2 días seguidos sin completar → no hay duplicado de ayer; en Mise cargar stock → se ve `X / Y unidad`; crear receta con 2 etapas → agrupa bien y el food cost no cambió.

---

## SESIÓN 2 — Mesa de Trabajo: secciones editables + secciones tipadas

Contexto: `checklist_secciones` **ya existe** (`nombre, icono, orden, plaza, restaurante_id`) y ya es la agrupación del mise. Lo que falta es hacerla **editable por el usuario** y **tipada**. `SECCIONES_OPS` (4 fijas en `lib/ops/mise.ts:17`) pasa a ser solo el **seed/default**, no el universo.

### B2. Subcategorías editables dentro de cada plaza
- **CRUD de secciones** en Mesa de Trabajo (`app/(app)/espacios/ClientView.tsx`): por plaza → agregar sección ("Estante 1"…), renombrar inline, reordenar (`orden`), borrar (solo si vacía o reasignando ítems a General).
- **`components/ops/OpsPanel.tsx`**: el paso "sección" deja de ofrecer solo las 4 fijas → carga las `checklist_secciones` de la plaza elegida (merge con las 4 default si no existen) + opción "crear sección nueva" inline. Esto propaga a TODOS los botones OPS (RecetaOpsSheet, PlatoRecetasEditor, ItemRowInline) porque el panel es fuente única — no tocar los consumidores.
- **`lib/ops/mise.ts` → `upsertMiseChecklistItem`**: aceptar `seccionMiseId` que sea un UUID real de `checklist_secciones` (usarlo directo) además de los ids legacy de `SECCIONES_OPS` (buscar/crear por label, como hoy).
- **Mise (`app/(app)/checklist/ClientView.tsx`)**: verificar que agrupa por `seccion_id` y ordena por `checklist_secciones.orden` → el nuevo orden de secciones se refleja solo. Permitir renombrar sección también desde acá (mismo update).
- ⚠️ RLS de `checklist_secciones` es `USING(true)` → aplicar `/add-rls checklist_secciones` en esta sesión.

### B3. Espacios: secciones tipadas (producción / almacén / heladera / freezer)
- **Migración** (agente `migrator`, previo `/supabase-check checklist_secciones`):
  ```sql
  ALTER TABLE checklist_secciones ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'produccion';
  -- tipo ∈ 'produccion' | 'almacen' | 'heladera' | 'freezer' | 'estacion'
  ALTER TABLE checklist_secciones ADD COLUMN IF NOT EXISTS producto_ids UUID[] NOT NULL DEFAULT '{}';
  NOTIFY pgrst, 'reload schema';
  ```
- **Tipo por sección** en el editor de secciones (B2): selector de tipo con icono (produccion=countertops, almacen=inventory_2, heladera=kitchen, freezer=severe_cold).
- **Almacén**: la sección tiene un picker de productos del stock (`producto_ids`). Botón **"Stockear sección"** → overlay de conteo SOLO con esos productos (reusar el patrón del modo "Stockear" de `/stock`, `zIndex: 1000`) que actualiza `productos.stock_actual`.
- **Heladera/Freezer**: vínculo liviano a HACCP — en la card de la sección mostrar última temperatura registrada (`haccp_temperaturas`, match por nombre de equipo ≈ nombre de sección) y próxima limpieza (`haccp_limpieza`), con deep-link a `/haccp`. NO duplicar los forms de HACCP acá.
- Documentar columnas nuevas en `.claude/docs/columnas.md`.

**Verificación fin de sesión 2:** build + crear sección "Estante 1" en una plaza → aparece en OpsPanel al asignar OPS desde recetario Y desde carta; asignar una producción ahí → el mise la agrupa bajo "Estante 1"; renombrar → se refleja en mise; sección almacén con 3 productos → "Stockear sección" solo muestra esos 3 y persiste en DB (verificar contra DB, no solo UI — gotcha §9 de hooks.md).

---

## SESIÓN 3 — Salón + KDS (la más grande)

### C1. Salón dentro del shell de KitchenOS (desktop)
Hoy `app/(servicio)/layout.tsx` es `position: fixed; inset: 0` → tapa el sidebar. En **desktop (≥1024px)** el salón/KDS deben convivir con la barra lateral:
- Extraer el `<aside>` del sidebar de `components/shell/DesktopShell.tsx` a un componente `SidebarNav` reusable.
- `(servicio)/layout.tsx`: en desktop renderiza `SidebarNav` + área de servicio oscura al lado (flex row); en tablet/mobile queda full-screen como hoy (el KDS en cocina sigue siendo tablet-first, ver `.claude/docs/ui.md` § servicio).

### C2. Estética KitchenOS en Salón/KDS
Alinear a la identidad sin romper las reglas de servicio (alto contraste, botones ≥64px, cero dropdowns en despacho):
- Tipografía, radios, spacing y Material Symbols consistentes con el resto de la app; acentos `var(--accent)`/paleta de plazas en vez de colores sueltos; textos en español argentino.
- Mantener fondo oscuro (#111) en KDS; en el mapa de salón se puede subir a un dark-navy más KitchenOS.
- Al terminar: actualizar `.claude/docs/ui.md` § "Vista de servicio" con las decisiones nuevas y correr `ui-auditor`.

### C3. Editor de mesas tipo canvas (juego de armar tu restaurante)
`mesas` ya tiene `pos_x/pos_y` (%). **Migración** (previo `/supabase-check mesas`):
```sql
ALTER TABLE mesas ADD COLUMN IF NOT EXISTS forma TEXT NOT NULL DEFAULT 'cuadrada';  -- 'cuadrada'|'redonda'|'rectangular'
ALTER TABLE mesas ADD COLUMN IF NOT EXISTS ancho NUMERIC NOT NULL DEFAULT 8;   -- % del canvas
ALTER TABLE mesas ADD COLUMN IF NOT EXISTS alto  NUMERIC NOT NULL DEFAULT 8;
ALTER TABLE mesas ADD COLUMN IF NOT EXISTS rotacion INT NOT NULL DEFAULT 0;    -- 0|45|90
NOTIFY pgrst, 'reload schema';
```
Rediseñar `app/(servicio)/salon/config/page.tsx` como editor visual:
- Canvas = plano del salón; mesas se arrastran con Pointer Events (patrón "FAB draggable" de ui.md: threshold 8px, `touchAction: none`, `setPointerCapture`).
- Panel al seleccionar una mesa: número, sector, capacidad, forma (3 chips con preview), tamaño (chico/mediano/grande → ancho/alto), rotación.
- El mapa del salón (`salon/page.tsx`, `MesaBoton` línea 64) renderiza forma/tamaño/rotación reales.
- Guardado batch al soltar (update de `pos_x/pos_y/...`), sin modal por drag.

### C4. Barra superior en Salón + Kitchen Coach
- Barra superior fija en el salón con: nombre de vista, acceso a **Configurar mesas** (hoy escondido, línea ~940 de salon/page.tsx), caja, toggle Salón↔KDS.
- `/coach-screen salon` → integrar Kitchen Coach completo en el mapa de salón (contexto: mesas ocupadas/libres, cuentas abiertas, total en curso). **NO** en KDS (regla de ui.md: sin Coach en despacho).

### C5. KDS en español + botones claros
En `app/(servicio)/kds/page.tsx`: `EN HOLD`→"EN ESPERA", `All-day`→"Consolidado", `Recall — últimos 30 min`→"Recuperar — últimos 30 min", "bumpeadas"→"despachadas". Revisar TODOS los labels/tooltips; cada botón de acción con icono + palabra en español (Listo / Recuperar / Espera). No cambiar la mecánica de swipe/bump.

**Verificación fin de sesión 3:** build + en desktop el salón se abre con sidebar visible; crear 3 mesas de formas distintas, moverlas, F5 → persisten; enviar comanda → KDS la muestra con labels en español; cobro sigue funcionando (VistaCuenta); `ui-auditor` sobre salon, config y kds.

---

## Skills y agentes por tarea (obligatorio usarlos)

| Momento | Skill/Agente |
|---|---|
| Antes de cada migración | `/supabase-check <tabla>` + agente `migrator` |
| RLS de checklist_secciones | `/add-rls checklist_secciones` |
| Rediseños de UI (A4, C2, C3) | skill `impeccable` (jerarquía/claridad) + agente `ui-auditor` al cierre |
| Coach en salón | `/coach-screen salon` |
| Bugs que aparezcan | `/debug-error` o agente `bug-fixer` |
| Cierre de cada sesión | `npm run build` → `/pr-review` → `/deploy` → `/update-status` |

**Regla de eficiencia de tokens:** no releer archivos completos (usar los offsets citados), no re-derivar decisiones ya tomadas acá, editar en batch y verificar UNA vez al final de la sesión. Si un supuesto del plan no matchea el código real (líneas corridas, columna distinta), ajustar y seguir — no re-planificar.

## Orden y dependencias
- Sesión 1 y 2 son independientes entre sí; la 3 no depende de nada.
- Dentro de la 2: B2 (OpsPanel dinámico) antes que B3 (tipos) — B3 extiende el editor de B2.
- Post-plan: sumar tablas/columnas nuevas a `reset_demo_restaurante()` si aplica (checklist_secciones ya se clona; verificar `mesas`).
