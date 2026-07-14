# Plan OPS — Consolidación (Producción · Mise · Planificación)

**Objetivo:** el módulo que el usuario abre primero y último en el turno tiene que ser ágil, rápido e intuitivo. Hoy conviven 3 generaciones de soluciones sin retirar la anterior → demasiadas interacciones entre pantallas. Este plan consolida.

**Ejecución:** con Sonnet, en orden P0 → P1 → P2. Cada FASE es un commit deployable independiente (`npm run build` verde antes de `git push`). No romper: verificar contra DB real cuando se toca persistencia (ver `.claude/docs/hooks.md §9`).

**Fuentes de verdad ya mapeadas:**
- Ejecutable del día = tabla `tareas` (tab Producción, `tareas/ClientView.tsx`).
- Estado físico del mise = `checklist_items` + `checklist_registros` (tab Mise, `checklist/ClientView.tsx`).
- Planilla legacy = `platos_compuestos`/`plato_componentes`/`produccion_diaria` (tab Planificación, `produccion/page.tsx`) → **se retira**.
- Menús = `menus`/`menu_preparaciones` → se materializan en `tareas` (ya funciona).

---

## P0 — Simplificar el modelo (ataca la raíz)

### FASE 0.1 — FK Mise ↔ Tarea (reemplazar matching por string)

Hoy Mise↔Producción se sincroniza por título con prefijo `"Producción: "` en 3 lugares por `ilike`/comparación de strings, sin plaza ni turno correctos. Reemplazar por FK.

**Migración** (`supabase/migrations/20260714_ops_fk_mise_tarea.sql`):
```sql
ALTER TABLE tareas ADD COLUMN IF NOT EXISTS checklist_item_id UUID
  REFERENCES checklist_items(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tareas_checklist_item ON tareas(checklist_item_id);
NOTIFY pgrst, 'reload schema';
```
Verificar con GET REST `…/rest/v1/tareas?select=checklist_item_id&limit=1` (debe dar 200) antes de tocar el cliente.

**Cambios de código:**
1. `types/index.ts` Tarea: agregar `checklist_item_id?: string | null`.
2. `components/mise/ProductoMiseCard.tsx` `CrearTareaParams`: agregar `checklist_item_id: string | null`. En `handleCrearTarea` pasar `item.id`.
3. `checklist/ClientView.tsx` `handleCrearTarea`: guardar `checklist_item_id: params.checklist_item_id`. Quitar el prefijo `"Producción: "` del título (ya no hace falta como discriminador). Todos los `onCrearTarea`/`onPrioChange`/`AddItemSheet.onSave` pasan `checklist_item_id: <item.id>`.
4. `checklist/ClientView.tsx` `handleMiseUpsert`: buscar la tarea por `t.checklist_item_id === itemId` (NO por título). `tareasHoySet` / `hasTareaPendiente`: derivar de `checklist_item_id` en vez de nombre.
5. `tareas/ClientView.tsx`: `handleEstadoChange` → borrar `syncMiseCompletado` (el string-match). En su lugar: si `tarea.checklist_item_id`, upsert en `checklist_registros` de **ese** item, con `turno` = turno actual real (no fijo 'apertura') y respetando plaza. Mover esa lógica a `useTareas.cambiarEstado` o a un helper `lib/ops/syncMise.ts` para no duplicar.
6. Borrar `syncMiseCompletado` y el prefijo-parsing (`replace(/^Producción:\s*/…)`) de todos los archivos.

**Migración de datos existentes** (mismo SQL, al final): backfill por nombre+restaurante para no perder los vínculos actuales:
```sql
UPDATE tareas t SET checklist_item_id = ci.id
FROM checklist_items ci
WHERE t.checklist_item_id IS NULL AND ci.restaurante_id = t.restaurante_id
  AND lower(regexp_replace(t.titulo, '^Producción:\s*', '')) = lower(ci.nombre);
```

**Verificar:** crear tarea desde mise → aparece en Producción; tildar en Producción → item del mise queda check en el turno correcto; tildar en mise → tarea listo. Los 3 sentidos por id.

### FASE 0.2 — Retirar la planilla legacy de Planificación

`platos_compuestos`/`produccion_diaria` duplican lo que hoy hacen menús→tareas, con un enum de estados propio (`en_proceso`) que no repercute en nada. Es la mayor fuente de "¿dónde tildo?".

**Cambios en `produccion/page.tsx` (`ProduccionView`):**
- Eliminar del render: `PlanillaView`, `PlatoForm`, `IngredientesConsolidados`, `DuplicarView` (sobre produccion_diaria), toda la `View = 'crear'|'editar'|'ingredientes'|'duplicar'`, `cycleStatus`, `initProduccion`, `statusMap`, `grouped`, `platosActivos`, `stats`, `componentNameCount`.
- Planificación queda = header + selector de fecha + calendario + **3 acciones**: `Cargar menú` (activarMenu, ya existe), `Sugerir producción` (E1, ya existe), y `MenuActivoView` (ya existe) como vista del día.
- "Copiar a otro día" y "Ver ingredientes": reimplementar sobre `tareas` **solo si el usuario los pide** — por ahora quitarlos (no atan a nada útil). Anotar en PENDIENTES.
- "Cargar plato suelto" → reemplazar por "Agregar tarea suelta" que llama `useTareas.agregarTarea` con TODOS los campos NOT NULL (`turno_fecha: fecha`, `modo: 'carta'`, `estado: 'pendiente'`, `seccion: 'general'`, `status: 'pendiente'`). Ver bug FASE 1.1.
- `useProduccion` hook: dejar solo lo que use el resto (si nada lo usa, borrar el hook y el archivo). Verificar imports con grep antes de borrar.
- Empty state cuando no hay menú activo ni tareas del día: CTA "Activar menú del catálogo".

**Verificar:** Planificación no muestra planilla; activar menú sigue creando tareas; no quedan imports rotos (`npm run build`).

---

## P1 — Agilizar apertura/cierre (ágil, rápido, intuitivo)

### FASE 1.1 — Fix: tareas fantasma / inválidas (bugs bloqueantes)

1. **Plato/tarea suelta sin campos NOT NULL** (`produccion/page.tsx:565`): el `agregarTarea` no manda `turno_fecha`/`modo`/`estado`/`seccion` → o falla o crea tarea que Producción nunca muestra. Completar el payload (resuelto de fondo en FASE 0.2, pero dejar el fix aunque 0.2 no llegue).
2. **Badge de prioridad crea tareas al ciclar** (`checklist/ClientView.tsx:874-889`): `onPrioChange` auto-crea tarea al pasar por SP/P. El badge es un botón de ciclo → un tap de más = producción fantasma. **Quitar la auto-creación de `onPrioChange`**; la creación explícita queda solo en el panel de producción (`prodOpen`) y en `AddItemSheet`.

### FASE 1.2 — Cerrar el loop `demanda_viva` (feature latente ya casi hecha)

La columna `checklist_items.demanda_viva`, el endpoint `/api/salon/prep-list-update` y el doc ya existen — nadie la lee.
- `ProductoMiseCard`: si `item.demanda_viva > 0`, mostrar chip "Pedidas hoy: N" y sumarla al déficit (`falta producir`).
- Reset: al completar apertura de la plaza (o botón "reiniciar demanda"), `update demanda_viva = 0` de los items de la plaza. Mínimo viable: mostrarla; el reset puede ir en PENDIENTES si complica.
- `types` MisePlaceItem: agregar `demanda_viva?: number | null`.

### FASE 1.3 — Confirmación persistente al crear tarea desde mise

Hoy la única señal de que se creó la tarea es un banner verde de 2s. Con la FK de FASE 0.1, `hasTareaPendiente` ya es confiable por id → el ícono `task_alt` verde persiste. Sumar: contador en el tab Producción de OPS (`operaciones/page.tsx`) con las tareas de hoy pendientes, para que el usuario vea el efecto sin cambiar de tab. Badge sobre `ops-tab-produccion`.

---

## P2 — Consistencia

### FASE 2.1 — Vocabulario y enums únicos
- **"SP"**: significa *Super Prioridad* en Producción y *"Sin Preparar"* en el sheet del mise (`checklist/ClientView.tsx:1328`). Unificar el texto de ayuda a una sola semántica (recomendado: SP = Super Prioridad en todo OPS; corregir el copy del sheet).
- **Plazas**: `PlatoForm` legacy usa `'fríos'`/`'pastelería'` con tilde, que NO matchean los ids de `lib/ops/mise.ts` (`frios`/`pasteleria`). Muere con FASE 0.2; si algo más quedara con esos strings, migrar a `PLAZAS_OPS`.
- **Estados**: `en_curso` (tareas) vs `en_proceso` (produccion_diaria). El segundo muere con FASE 0.2. Confirmar que no queda `en_proceso` fuera de la planilla retirada.
- Loading de Planificación dice "Producción" en el header (`produccion/page.tsx:372`) → "Planificación".

### FASE 2.2 — `RutinasDia` duplica el tab Rutina del Mise
`produccion/page.tsx:845` (`RutinasDia`) hace queries directas propias a `checklist_rutina` — mismo dato que el tab Rutina del Mise, montado en paralelo, sin refrescarse entre sí. Opciones: (a) que `RutinasDia` consuma `useChecklist` (cache SWR compartido) o (b) quitar `RutinasDia` de Planificación (las rutinas viven en Mise→Rutina). **Recomendado (b)** por simplicidad; confirmar con el usuario si quiere verlas también en Planificación.

### FASE 2.3 — Sugerencia por ventas incoherente en `ItemOps`
`useProduccionSugerida` compara cubiertos totales del restaurante contra la cantidad de UNA preparación → número sin sentido. El motor bueno es E1 (`SugerenciaProduccionSheet`, botón "Sugerir producción" en Planificación). **Quitar** `useProduccionSugerida` de `components/ops/ItemOps.tsx` (feature 2 del lazy-load). Dejar solo las stock-alerts (feature 1).

### FASE 2.4 — Auto-seed de secciones default
Visitar cualquier plaza vacía auto-crea 4 secciones (`checklist/ClientView.tsx:285` `DEFAULT_SECCIONES`) → 7 plazas × 4 = 28 secciones potencialmente vacías. Cambiar a: seedear solo al agregar el primer item a la plaza, o solo para la plaza del usuario. Bajo impacto — último.

---

## Orden de commits (deployables)

1. **FASE 1.1** (bugs, sin migración, riesgo nulo) — primer deploy rápido.
2. **FASE 0.1** (migración FK + sync por id) — deploy tras verificar contra DB.
3. **FASE 0.2** (retiro planilla legacy) — deploy.
4. **FASE 1.2 + 1.3** (demanda_viva + contador) — deploy.
5. **FASE 2.1–2.4** (consistencia) — deploy final.

Cada uno: `npm run build` → si verde, `git push` (Vercel auto). Usar skill `/deploy` para el build+validación de cada fase.

## Notas de eficiencia para la ejecución (Sonnet)
- No re-leer archivos ya mapeados acá; ir directo a los `file:line` citados.
- `checklist/ClientView.tsx` (1.600 líneas) y `produccion/page.tsx` (1.900): leer solo los rangos a editar por `offset`/`limit`.
- Verificar columnas reales solo si se duda (skill `/supabase-check`), no por default.
- Al final de todo: skill `/update-status` para cerrar sesión (PENDIENTES + ESTADO-ACTUAL + docs).
