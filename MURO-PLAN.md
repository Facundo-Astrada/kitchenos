# Muro de cocina — plan de implementación

> Idea de Facundo (2026-08-06) + hallazgos del código. Estado: **propuesta, sin implementar**.
>
> **Decisiones ya tomadas — no volver a abrirlas:**
> - El jefe **mira y también toca**. El muro no es de solo lectura.
> - **Una tablet para toda la cocina**, no una por plaza. (Una por plaza no requeriría pantalla nueva: es el modo foco que ya existe en `ProduccionBoard`, puesto a pantalla completa.)
>
> Ejecutar con Sonnet, fase por fase, en el orden de abajo. Cada fase es deployable sola.

---

## 1. Punto de partida real

Casi todo el andamio existe. Esto **no** es una feature desde cero.

| Pieza | Dónde | Qué aporta al muro |
|---|---|---|
| Route group de kiosco | `app/(servicio)/layout.tsx` | Full-screen fijo, fondo oscuro, banner de offline, sidebar solo en desktop. Tablet-first. Es el patrón exacto; hoy lo usa el KDS |
| Referencia visual | `app/(servicio)/kds/page.tsx` (511 líneas) | Cómo se ve una pantalla de cocina de verdad: alto contraste, tipografía grande, colores por umbral de tiempo |
| Board por plaza | `components/ops/ProduccionBoard.tsx` | Ya agrupa Carta por plaza y tiene modo foco (una columna a pantalla completa) |
| Estados del ítem | `components/ops/ItemOps.tsx:14` | Ciclo `pendiente → en_curso → listo`, y `duda` con toque largo. **Ya existen y hoy casi nadie los usa** — el muro es lo que les da sentido |
| Realtime de tareas | `lib/hooks/useTareas.ts:99` | Canal `tareas-rt-<restauranteId>`, con debounce y anti-eco. Una pantalla pasiva se actualiza sola |
| Realtime del mise | `lib/hooks/useChecklist.ts` | Agregado ago 2026 (`checklist_registros` con `restaurante_id` por trigger) |
| Autoría del mise | `checklist_registros.usuario_id` | Se puebla desde jul 2026 (`app/(app)/checklist/ClientView.tsx:765`) |
| Entregas de plaza | `cierres_turno` + `lib/hooks/useCierresTurno.ts` | Quién entregó qué plaza y a qué hora. Ya está, no hay que guardar nada nuevo |
| Nombres del equipo | `lib/hooks/useEquipo.ts` | `miembros` por SWR — traduce `miembro_id` → nombre |
| Plazas | `lib/constants.ts` (`todasLasPlazas`, `plazaLabel/Icon/Color`) + `usePlazasCustom` | Orden, color e ícono de cada columna |

---

## 2. El agujero que define el orden de las fases

**`tareas` no guarda quién completó una tarea.** Guarda `completed_at` y `asignado_a`, pero `asignado_a` llega en `null` en todas las rutas de alta manual (solo lo llena `activarMenu` desde un menú planificado). Sin eso, el muro puede mostrar *qué se movió*, nunca *quién lo movió* — que es literalmente el pedido.

Dos cosas que juegan a favor:

1. **Hay un solo punto de escritura.** `cambiarEstado` en `lib/hooks/useTareas.ts:169` es el único lugar donde una tarea pasa a `listo`. Todos los callers pasan por ahí (`tareas/ClientView`, `checklist/ClientView`, `TareasSimpleClientView`).
2. **El Mise ya lo resuelve bien** y sirve de modelo: `usuario_id` con el `miembro_id` del perfil autenticado.

Un detalle a corregir de paso: `syncMiseDesdeTarea` (`lib/ops/syncMise.ts`) escribe en `checklist_registros` **sin** `usuario_id`. Hoy, completar desde Producción deja el registro del mise sin autor. Si no se arregla acá, la atribución va a ser inconsistente según por dónde se tildó.

---

## 3. Fases

### F1 — `completado_por` en tareas · *chico, habilita todo lo demás*

**Qué se toca**

1. **Migración** (`supabase/migrations/2026MMDD_tareas_completado_por.sql`). Idempotente, mismo estilo que `20260806_cierres_turno.sql`:
   ```sql
   ALTER TABLE tareas ADD COLUMN IF NOT EXISTS completado_por TEXT;
   COMMENT ON COLUMN tareas.completado_por IS
     'equipo_miembros.id como texto (convención de usuario_id). Se llena al pasar a listo, se limpia al despasar.';
   ```
   Sin FK, igual que `cierres_turno.cerrado_por` y `checklist_registros.usuario_id` — es la convención del proyecto.
2. **`lib/hooks/useTareas.ts`** — importar `useAuth` y escribir la columna dentro de `cambiarEstado`, junto a `completed_at`:
   `const completado_por = estado === 'listo' ? (perfil?.miembro_id ?? null) : null`.
   Hacerlo **adentro del hook** y no como parámetro: así los tres callers lo heredan sin tocarlos, y no hay forma de olvidárselo en un caller nuevo.
3. **`lib/ops/syncMise.ts`** — `syncMiseDesdeTarea` recibe `usuarioId` en `ctx` y lo manda en el upsert de `checklist_registros`.
4. **`types/index.ts`** — `completado_por?: string | null` en `Tarea`.
5. **`.claude/docs/columnas.md`** — fila nueva para la columna.

**Criterio de aceptación:** tildar el mismo ítem desde Producción y desde el Mise deja el mismo autor en las dos tablas. Destildar lo limpia.

**Trampas**
- Verificar que la política RLS de `UPDATE` sobre `tareas` no liste columnas (si lo hiciera, habría que agregarla).
- El optimistic update de `cambiarEstado` tiene que incluir el campo nuevo, o la UI muestra el autor recién después del refetch.

---

### F2 — Densidad compacta en Producción · *chico, útil por sí sola*

Esto es la "vista minimalista". **No va como quinta pestaña del toggle**: el toggle responde a *qué mirás* (Menú/Carta/Evento/Todo) y la densidad a *cuánto detalle*. Mezclarlos obliga a elegir entre ver el evento o verlo simple.

**Qué se toca**

1. **`components/ops/ItemOps.tsx`** — prop `densidad?: 'comoda' | 'compacta'` (default `'comoda'`). En compacta la fila es **una sola línea**: tilde de estado, nombre, cantidad. Se ocultan los chips de prioridad y sección, la preview de subtareas y los botones secundarios. Tocar la fila abre el detalle de siempre — no se pierde nada, se esconde.
2. **`app/(app)/tareas/ClientView.tsx`** — botón de densidad en el header, al lado del `OpsToggle` (ícono `density_small` / `density_medium`, mismo estilo que el de Modo Control del Mise). Persistir en `localStorage` con `ops_densidad_<restauranteId>` — **por dispositivo, no por cuenta**: el celular del cocinero quiere compacto y el desktop del jefe cómodo, y son la misma persona.
3. Bajar la prop por `ProduccionBoard` → `ColumnaOps` → `ItemsPorPrioridad` → `ItemOps`.

**Criterio de aceptación:** con 15 tareas en una plaza, en compacta entran sin scroll en un celular chico. Cambiar de densidad no pierde el estado de nada.

**Por qué antes del muro:** el muro usa exactamente esta fila. Si se hace después, la fila compacta nace atada al muro y no se puede reusar.

---

### F3 — El muro · *el grueso del trabajo*

**Ruta:** `app/(servicio)/muro/page.tsx`, dentro del group de servicio (hereda full-screen, oscuro y offline banner). **No** es un flag de `/operaciones`: esa pantalla está hecha para operar (tabs, FAB del Coach, nav inferior, teclado) y el muro necesita lo contrario.

**Registro del módulo** — cuatro lugares, mismo patrón que `kds`:
- `lib/constants.ts`: `ModuloId` `'muro'`, entrada en `MODULO_CONFIG` (`{ label: 'Muro', icon: 'dashboard', href: '/muro' }`), sumarlo a `MODULOS_POR_ROL` **solo en `admin` y `chef`**, y a `RUTA_A_MODULO`.
- `components/shell/RouteGuard.tsx`: label para el mensaje de acceso denegado.
- `components/shell/SidebarNav.tsx`: al grupo Servicio, junto a KDS.

**Qué se ve** (una pantalla, sin scroll):

```
┌─ MURO · Jueves 6 · Almuerzo ───────────────── 14:32 ─┐
│ ⚠  PARRILLA — Juan tiene una duda  ·  hace 4 min     │  ← franja de alertas, solo si hay
├──────────────┬──────────────┬──────────────┬─────────┤
│ PARRILLA 3/11│ FRÍOS   8/14 │ PASTEL.  0/6 │ CALIENT.│
│ ● Chimichurri│ ● Vinagreta  │ ● Masa queb. │ ● Fondo │  ● = pendiente
│ ◐ Marinada   │ ○ Mayo ajo   │ ● Crema      │ ◐ Salsa │  ◐ = en curso + quién + hace cuánto
│   Nico · 6′  │   Sofi · 12′ │              │  Ana·2′ │  ○ = duda (ámbar)
│ + 8 listas   │ + 6 listas   │              │+5 listas│  ← lo terminado colapsa
├──────────────┴──────────────┴──────────────┴─────────┤
│ Entregas: Fríos 15:52 Sofi · Parrilla —              │  ← de cierres_turno
└──────────────────────────────────────────────────────┘
```

**Reglas de layout, no negociables** (son la diferencia entre un muro y un board grande):
- **Nunca scrollea.** Si no entra, se reduce lo que se muestra, no se agrega scroll.
- **Solo lo que falta.** Lo listo colapsa a `+N listas`. Tocar el contador expande esa columna (y solo esa).
- Tipografía pensada para leerse **a dos metros**: nombre de ítem ≥ 18px, encabezado de plaza ≥ 22px.
- Columnas = plazas del restaurante, en el orden de `todasLasPlazas(plazasCustom)`. Con más de 5 plazas, las que no tienen pendientes se encogen a una tira angosta con el contador.

**Datos**
- Producción del día: `useTareas` filtrado igual que `topLevel` de `tareas/ClientView` (hoy + carryover de ayer sin completar), **sin filtrar por modo** — el muro es el turno entero, como "Todo".
- Progreso del mise por plaza: `useChecklist` ya calcula algo equivalente (`gridProgress` en `checklist/ClientView`). Va como el `3/11` del encabezado — extraerlo a `lib/ops/` para no duplicarlo.
- Entregas: `useCierresTurno().entregados`.
- Nombres: `useEquipo().miembros`, cruzado contra `completado_por` (F1) y `asignado_a`.

**Interacción (el jefe toca)**
- Tap en un ítem: cicla `pendiente → en_curso → listo`, igual que `ItemOps`. Reusar `nextEstado` de ahí, no reimplementarlo.
- Toque largo: `duda` (y sube a la franja de alertas).
- Tap en el encabezado de una plaza: esa plaza a pantalla completa, con sus ítems listos incluidos. Es el modo foco que ya existe, adaptado.
- **No hay teclado en el muro.** Crear tareas se sigue haciendo desde el celular o el desktop. Si aparece la necesidad, es F4.

**Atribución en una tablet compartida — leer antes de implementar.** La tablet está logueada con una cuenta (la del jefe). Todo lo que se toque ahí va a quedar a nombre de esa cuenta, no del cocinero que pasó y lo marcó. Es correcto y es lo que queremos (*el jefe lo dio por listo*), pero hay que ser explícito en la UI: lo que viene de un celular muestra el nombre de la persona; lo que se marca en el muro se muestra como marcado desde el muro. No inventar un selector de "¿quién sos?" en esta fase — es fricción en la pantalla que menos fricción tolera.

**Trampas propias de una pantalla que queda prendida**
- **Rollover de jornada.** `hoyOperativo()` se calcula en render. Una pantalla que nadie toca no se vuelve a dibujar, así que a las 05:00 sigue mostrando la jornada de ayer. Hace falta un timer que revise el cambio de jornada (cada minuto alcanza) y fuerce el re-render. **Es el bug más probable de esta fase.**
- **Wake lock.** No hay ningún uso en el proyecto todavía. `navigator.wakeLock.request('screen')`, re-pedirlo en `visibilitychange` (el navegador lo suelta solo), y degradar en silencio donde no exista.
- **Sesión.** Diez horas sin interacción: verificar que el refresh de Supabase aguante y que un token vencido no deje la pantalla en blanco sin aviso. Si falla, mostrar un cartel legible a dos metros, no un spinner.
- **Realtime dormido.** Si la tablet se suspende, el canal se cae. Refetch al volver de `visibilitychange`, además del realtime.
- **Tablet a la vista de todos.** El muro no muestra costos, precios ni food cost. Nada de plata en esa pantalla.

---

### F4 — Solo después de usarlo una semana en servicio

No construir nada de esto antes de ver el muro funcionando. Cada ítem es una hipótesis, no un pendiente:
- Tomar/asignar una tarea desde el muro (`asignado_a`, que hoy no se usa desde ninguna UI manual).
- Sonido o parpadeo cuando entra una `duda`.
- Cronómetro por ítem en curso con umbral de color, como el KDS.
- Foto del turno al entregar (los contadores ya se guardan en `cierres_turno`).

---

## 4. Qué NO entra en este plan

- Restricción de permisos por plaza. Hoy OPS deja a cualquiera editar cualquier plaza (decisión vigente) y el muro no la cambia.
- Reemplazar el board de Producción. El muro es una pantalla más, no una migración: si nadie la abre, nada cambia.
- Modo offline propio. El muro vive en la cocina, con la misma red que el resto.

---

## 5. Orden de ejecución sugerido

1. **F1** completo y deployado (habilita el resto y es media sesión).
2. **F2** completo y deployado (útil solo, y deja la fila lista para F3).
3. **F3** en dos tandas: primero la pantalla de lectura con datos reales, verificada en la tablet; después la interacción.

Cada fase cierra con `npm run build`, tests y deploy, como siempre. F3 **exige verificación en la tablet real** antes de darla por hecha: es la única pantalla del proyecto que no se puede validar en un navegador de escritorio.
