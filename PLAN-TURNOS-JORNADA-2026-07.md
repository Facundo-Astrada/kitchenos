# PLAN — Jornada operativa + turnos de servicio (jul 2026)

Origen: el mise tiene que actualizarse entre turno y turno (1er turno recibe lo que dejó el anterior, lo revisa, carga su cierre; 2do turno igual). Se descartó gatear OPS con el fichaje (`turnos_personal`): es por persona y por tramo, no da el límite entre turnos, y bloquear la lectura del mise expulsa a la cocina al papel.

Diseño elegido: **jornada operativa** (la fecha real del restaurante) → **turno de servicio** (bloque horario configurable, resuelto al escribir) → **apertura/cierre** (lo que ya existe).

> **Sin acceso DDL** (ver `.claude/docs/hooks.md` #13): todo se resuelve con JSONB en `restaurantes.configuracion` + texto codificado en `checklist_registros.turno`. Nada de tablas ni columnas nuevas. Deuda declarada al final.

---

## Ojo con la palabra "turno" — ya significa 3 cosas distintas

Antes de escribir código, tener claro que en este repo `turno` ya está tomado:

| Qué | Dónde | Es |
|---|---|---|
| `turnos` (tabla) | `useEquipo` | **Grilla/rota**: quién trabaja qué día. `UNIQUE(miembro_id, fecha)` |
| `turnos_personal` (tabla) | `useFichaje` | **Fichaje**: entrada/salida real de una persona |
| `cajas_turnos` (tabla) | `useCajaTurno` | **Turno de caja**: apertura/cierre de caja con arqueo |
| `checklist_registros.turno` | `useChecklist` | **Fase del mise**: `'apertura'` \| `'cierre'` |

Lo que agrega este plan es un quinto concepto: el **turno de servicio** (almuerzo / cena). Nombrarlo siempre `turnoServicio` / `TurnoServicio` / `turnos_servicio`. No reusar el identificador `turno` pelado para esto.

---

## FASE 1 — Jornada operativa (arregla corrupción de datos que ya está pasando)

### El bug

`getToday()` = `new Date().toISOString().split('T')[0]` devuelve **la fecha de mañana desde las 21:00 ART** (UTC−3):

```
Local 29/07 22:00 ART  ->  2026-07-30
Local 30/07 00:30 ART  ->  2026-07-30
```

Consecuencias verificadas:

1. **Mise**: todo lo que se tilda/carga en el cierre de cena después de las 21:00 se guarda con `fecha` de mañana. Al día siguiente, la query de "cierre anterior" ([`checklist/ClientView.tsx:202-222`](app/(app)/checklist/ClientView.tsx#L202-L222), `fecha = ayer AND turno='cierre'`) no lo encuentra. Silencioso, todas las noches.
2. **Fichaje**: `hoyISO()` en [`useFichaje.ts:27`](lib/hooks/useFichaje.ts#L27) tiene el mismo patrón, y `fetchFichajeAbierto` filtra `.eq('fecha', hoyISO())`. Alguien que fiche entrada a las 20:00 **no puede cerrar el turno a las 21:30**: la app busca su fichaje en otra fecha y no lo encuentra.
3. **Coach (server-side)**: `lib/coach/tools/registry.ts` corre en API route, donde Vercel es UTC. Ahí `new Date().getHours()` está 3h adelantado siempre → `turnoActual()` ([:8-10](lib/coach/tools/registry.ts#L8-L10)) devuelve la fase equivocada casi todo el día.

### 1.1 — `lib/ops/turnos.ts` (nuevo)

```ts
export const TZ_DEFAULT = 'America/Argentina/Buenos_Aires'
export const CORTE_JORNADA_DEFAULT = 5   // la jornada rueda a las 05:00, no a medianoche

/** 'YYYY-MM-DD' de la fecha de pared en la TZ dada. Funciona igual en browser y en API route. */
export function fechaEnTz(d: Date, tz = TZ_DEFAULT): string

/** Hora de pared 0-23 en la TZ dada. */
export function horaEnTz(d: Date, tz = TZ_DEFAULT): number

/** Fecha operativa: si la hora local es < corte, devuelve el día anterior. */
export function hoyOperativo(now = new Date(), corte = CORTE_JORNADA_DEFAULT, tz = TZ_DEFAULT): string

/** Suma/resta días a una fecha 'YYYY-MM-DD' sin pasar por Date-UTC. */
export function sumarDias(fecha: string, n: number): string
```

Implementar con `Intl.DateTimeFormat(..., { timeZone })` + `formatToParts` — **no** con `getFullYear()/getMonth()` (rompe en el server, donde la TZ del proceso es UTC) y **no** restando 3h a mano.

> **Antipatrón a no copiar:** [`lib/fiscal/wsfe-directo.ts:27-31`](lib/fiscal/wsfe-directo.ts#L27-L31) (`fechaAr()`) resta `3 * 60 * 60_000` fijo. Anda hoy porque Argentina no tiene DST, pero rompe con cualquier otra TZ. Dejarlo como está en esta fase (es fiscal, riesgo alto, alcance distinto); anotarlo como deuda.

Test unitario (`vitest`) obligatorio, con fechas fijas: 20:59 → hoy · 21:00 → hoy (no mañana) · 00:30 → día anterior · 04:59 → día anterior · 05:00 → día nuevo.

### 1.2 — Reemplazos quirúrgicos

Solo donde la fecha significa "la jornada del restaurante". Sustituir por `hoyOperativo()` (y `sumarDias` donde se calcula ayer):

| Archivo | Líneas |
|---|---|
| `app/(app)/checklist/ClientView.tsx` | 42 (`getToday`), 210 (`ayer`), 426, 581, 603 |
| `lib/hooks/useFichaje.ts` | 27 (`hoyISO`) — **arregla el bug de no poder cerrar turno** |
| `app/(app)/tareas/ClientView.tsx` | 30 (`getToday`) — `turno_fecha` + carryover de ayer |
| `app/(app)/operaciones/page.tsx` | 26, 50 |
| `app/(app)/DashboardClientView.tsx` | 153-155 |
| `app/(app)/pase/page.tsx` | 13, 36 |
| `app/(app)/produccion/page.tsx` | 18 |
| `app/(app)/merma/page.tsx` | 16 |
| `lib/hooks/useMerma.ts` | 83 (`fecha`) y 71 (la inferencia de turno por hora, ver Fase 2) |
| `app/(app)/layout.tsx` | 38 |
| `lib/coach/tools/registry.ts` | 90, 150, 260 + `turnoActual()` en 8-10 (**server-side: pasar TZ explícita**) |
| `app/(app)/stock/ClientView.tsx` | 168-169 (lee `checklist_registros` en 232) |

Borrar los dos `getToday()` duplicados (`checklist/ClientView.tsx:42`, `tareas/ClientView.tsx:30`) y que ambos importen de `lib/ops/turnos.ts`.

### 1.3 — Explícitamente FUERA de alcance

El patrón `toISOString().slice(0,10)` aparece en ~60 lugares. Los siguientes son **fechas de calendario, no jornadas operativas** — no tocarlos, y anotar el por qué en el commit para que nadie los "arregle" después: `useReportes.ts` (rangos de reporte), `reportes/page.tsx`, `facturas/page.tsx`, `pedidos/page.tsx`, `haccp/page.tsx`, `useMenus.ts`, `useReporteVentas.ts`, `usePreciosProveedores.ts`, `lib/exportar.ts` (nombre de archivo), `lib/utils.ts`, `lib/fiscal/*`.

**Criterio:** si un cambio de 1 día desplaza el dato a otro turno de cocina → va a `hoyOperativo()`. Si solo mueve el borde de un rango de análisis → se deja.

### 1.4 — Verificación

No alcanza con probar en el browser. Verificar contra la DB (`curl` / management API o service role) que un registro creado a las 22:00 ART queda con la fecha de **hoy**. Precedente de por qué: `.claude/docs/hooks.md` #9 (un `catch {}` silencioso escondió por completo que `salida` no se guardaba, mientras la UI mostraba éxito).

---

## FASE 2 — Turnos de servicio configurables

### 2.1 — Tipo + hook

`types/index.ts`:

```ts
export interface TurnoServicio {
  id: string        // slug estable: 'almuerzo', 'cena'. NUNCA un uuid, NUNCA el nombre
  nombre: string    // 'Almuerzo'
  desde: string     // 'HH:MM'
  hasta: string     // 'HH:MM' — si hasta < desde, cruza medianoche (derivado, no un campo más)
  orden: number
  activo: boolean
}
```

`lib/hooks/useTurnosServicio.ts` — **clonar [`usePlazasCustom.ts`](lib/hooks/usePlazasCustom.ts) tal cual**: SWR + read-modify-write de `restaurantes.configuracion`, clave `turnos_servicio`. Releer la `configuracion` completa antes de escribir (`.claude/docs/hooks.md` #15a) para no pisar `plazas_custom` / `nombres_excluidos` / `slug` / `onboarding_step`.

Defaults cuando la clave no existe (**no escribirlos en el read**, solo devolverlos):

```ts
[{ id: 'almuerzo', nombre: 'Almuerzo', desde: '09:00', hasta: '17:00', orden: 1, activo: true },
 { id: 'cena',     nombre: 'Cena',     desde: '17:00', hasta: '01:30', orden: 2, activo: true }]
```

Reglas de negocio del hook:
- **Nunca borrar un turno, desactivarlo** (`activo: false`). Un turno borrado deja registros históricos apuntando a un id inexistente y vuelve ilegibles los reportes viejos.
- `id` se deriva del nombre con `slugify` (ya está en `usePlazasCustom.ts`, extraerlo a `lib/utils.ts` si se reusa) y **es inmutable**: renombrar cambia `nombre`, jamás `id`.

### 2.2 — Resolución del turno activo

En `lib/ops/turnos.ts`:

```ts
/** Turno de servicio vigente. Regla: el último turno que arrancó sigue siendo el turno
 *  hasta que arranca el siguiente — así ningún registro queda huérfano en los huecos
 *  (ej. 01:30-09:00, cocina cerrada pero alguien tildando mientras cierra la caja). */
export function turnoActivo(now: Date, turnos: TurnoServicio[], tz?: string): TurnoServicio

/** El turno inmediatamente anterior en la secuencia, con su jornada.
 *  Cruzar el primer turno del día retrocede la jornada. */
export function turnoAnterior(jornada: string, turnoId: string, turnos: TurnoServicio[]): { jornada: string; turnoId: string }
```

`hasta` se usa para mostrar y para decir "este turno ya debería haber cerrado" — **no** para la atribución.

### 2.3 — Persistencia: turno resuelto al escribir, no re-derivado al leer

**Decisión crítica.** Si el turno se deriva de la hora al momento de leer, el día que el restaurante mueva la cena de 17:00 a 18:00 se **reescribe el pasado**: registros de hace meses cambian de turno solos. Se resuelve al escribir y se guarda.

`checklist_registros.turno` es TEXT libre y hoy guarda `'apertura'`/`'cierre'`. Pasa a guardar **turno + fase** codificados:

```ts
// lib/ops/turnos.ts — mismo estilo que encodeRecipienteNombre en lib/ops/mise.ts
export function encodeTurnoFase(turnoId: string, fase: 'apertura' | 'cierre'): string  // 'cena:apertura'
export function parseTurnoFase(v: string): { turnoId: string | null; fase: 'apertura' | 'cierre' }
```

**Back-compat obligatoria:** las filas existentes tienen `'apertura'` / `'cierre'` pelados. `parseTurnoFase('apertura')` debe devolver `{ turnoId: null, fase: 'apertura' }` y la UI tratar `turnoId: null` como "turno único (histórico)". Sin migración de datos, sin borrar nada.

El `onConflict: 'checklist_item_id,fecha,turno'` de [`useChecklist.ts:241-243`](lib/hooks/useChecklist.ts#L241-L243) y [`syncMise.ts:14-17`](lib/ops/syncMise.ts#L14-L17) **sigue funcionando sin cambios** — `turno` sigue siendo una sola columna de texto. No hace falta tocar constraints (que además no se podría, sin DDL).

### 2.4 — Lectores y escritores a actualizar

- `lib/hooks/useChecklist.ts` — `fetchRegistros` / `fetchAll` / `upsertRegistro` reciben el `turno` ya codificado. La firma no cambia (sigue siendo `string`).
- `lib/ops/syncMise.ts:13` — sacar `getHours() < 16 ? 'apertura' : 'cierre'`, usar `turnoActivo()` + `encodeTurnoFase`. Necesita los turnos del restaurante: pasarlos por parámetro (la función ya recibe el `supabase`, no inventar un fetch adentro).
- `app/(app)/checklist/ClientView.tsx:212-216` — "cierre anterior" deja de ser `fecha = ayer AND turno = 'cierre'` y pasa a ser **el último cierre existente hacia atrás**: `turnoAnterior()` para saber qué par (jornada, turno) buscar, con fallback a una query `.order('fecha', desc).limit(1)` si ese par no tiene registros.
- `app/(app)/checklist/ClientView.tsx:236-239` — los pendientes de apertura pasan a Fase 3.
- `lib/hooks/useMerma.ts:71` — su `TurnoMerma` (`apertura`/`servicio`/`cierre`) es un enum **propio y distinto**. No unificarlo en este plan; solo arreglarle la fecha (Fase 1). Anotar como deuda.
- `lib/coach/tools/registry.ts:8-10` (`turnoActual`) y el prompt de [`app/api/coach/route.ts:188`](app/api/coach/route.ts#L188) ("...ese número es el stock del cierre, que **mañana** aparece en la Apertura...") — actualizar el texto: ahora aparece en la apertura del **turno siguiente**.

**Ambigüedad nueva a resolver acá:** `stock/ClientView.tsx:231-236` y `lib/produccion/sugerencia.ts:107-113` toman "el registro más reciente" con `.order('fecha', desc)` y se quedan con el primero. Con dos turnos por jornada hay dos filas con la misma `fecha` y el orden entre ellas queda indefinido. Ordenar también por turno (o filtrar a la fase `cierre`) para que sea determinístico.

### 2.5 — UI

- **Selector de turno en el mise**, al lado de las tabs Apertura/Cierre de `checklist/ClientView.tsx:749-759`. Usar `FilterChips` de `components/ui` (regla D0: no inventar chips nuevos). Default = `turnoActivo()`, **editable** — el cocinero que carga el cierre a las 01:45 tiene que poder decir "esto es de la cena".
- **Config**: sección "Turnos de servicio" en `/configuracion` tab `restaurante` (donde ya viven las plazas). Crear / renombrar / cambiar horarios / desactivar.
- **Onboarding**: paso nuevo en `PASOS_ADMIN` de `app/(app)/onboarding/page.tsx` (grupo `'green'`, icono `schedule`, deeplink `/configuracion`), con los dos turnos default ya cargados y un botón **"así está bien"** que los persiste. `isDone` = existe `configuracion.turnos_servicio`. Sumar el flag a `useOnboardingProgress.ts` con el mismo patrón que `s.plazas`.
  > Si para usar el mise hay que diseñar primero la grilla de turnos, la mayoría no llega al mise. Los defaults no son un detalle, son el punto.

---

## FASE 3 — Arrastre y pase de turno incumplido

Un servicio que se estiró es **exactamente** cuando nadie carga el cierre. Si el sistema depende de que el pase se cumpla, se rompe los días que más importa. Diseño: degrada solo, nunca bloquea.

### 3.1 — El cierre se cierra solo y el hueco NO se persiste

Cuando arranca el turno siguiente, el anterior queda cerrado con lo que tenga. **No agregar ninguna columna, flag ni fila** para marcar "acá no hubo pase": es derivable de la ausencia de registros con `turno = encodeTurnoFase(turnoPrev, 'cierre')`. Cero storage, cero migración, imposible que se desincronice.

```ts
// derivado, en lib/ops/turnos.ts o en el ClientView
function cierreIncompleto(registros, turnoPrevId): boolean
```

### 3.2 — Arrastre: generalizar lo que ya existe

[`checklist/ClientView.tsx:226-252`](app/(app)/checklist/ClientView.tsx#L226-L252) ya calcula `pendientesApertura` (ítems sin registro o con `completado=false`). Es la primitiva exacta del arrastre; hoy mira "apertura del mismo día". Generalizar a `pendientesTurnoAnterior` usando `turnoAnterior()`.

**Un solo salto** — igual que el carryover de 1 día que ya usa OPS Producción para `tareas` (ver `.claude/docs/columnas.md`, fila `tareas`). Sin esto los pendientes se acumulan para siempre; ese bug ya pasó con las tareas de `turno_fecha` null.

### 3.3 — Al que entra no se le pide el papeleo del que se fue

Banner en la apertura cuando `cierreIncompleto`: **"Recibís sin cierre del turno anterior"** + CTA a contar. Nada bloqueado, ninguna escritura impedida.

**No** rellenar el casillero de cierre del turno anterior ni pedirle al entrante que lo complete: el cocinero de las 9:00 no sabe cuánto quedó de fondo anoche, y obligado **pone un número inventado**. Un dato inventado es peor que no tener dato, porque quema la confianza en la pantalla y ahí se pierde el módulo entero. Lo que sí se le pide es contar lo que va a mirar igual en la heladera al arrancar — dato real, cero trabajo extra, y de paso reconstruye el estado.

### 3.4 — Visibilidad para el chef

Contador de "turnos cerrados sin pase" por plaza y por persona, en Reportes tab `auditoria` (`app/(app)/reportes/page.tsx`, `Tab = ... | 'auditoria'`).

> ⚠️ **Trampa conocida** (`.claude/docs/hooks.md` #10): toda función de hook que entre al array de deps del `loadTab` de Reportes **tiene que ser `useCallback`**. Una función async plana ahí genera referencia nueva por render → `loadTab` se recrea → el `useEffect` se re-dispara → loop infinito y la tab queda en "Cargando…" para siempre. Es exactamente el bug que tuvo `fetchAuditorias`.

Un pase que no se hace tres veces por semana es un problema de manejo de cocina y se arregla hablando con la gente. La app reporta; el chef decide. Trabar la pantalla solo devuelve a todos al papel.

---

## Orden, tamaño y criterio de corte

| Fase | Qué desbloquea | Tamaño | Independiente? |
|---|---|---|---|
| **1** | Deja de corromper datos cada noche + arregla el fichaje que no se puede cerrar | ~1 sesión | Sí — deployable sola, sin tocar UI |
| **2** | Dos turnos por jornada sin pisarse; el 2do recibe lo del 1ro | ~1-2 sesiones | Requiere Fase 1 |
| **3** | El pase incumplido degrada solo | ~1 sesión | Requiere Fase 2 |

**Fase 1 va sola y primero**: es la única que arregla un bug activo, no toca UI, y no depende de ninguna decisión de producto pendiente. Se puede deployar el mismo día.

## Checklist previo a cada commit

- [ ] `npm run build` (typecheck) y `npm test`
- [ ] Fase 1: verificado **contra la DB**, no solo en el browser (ver 1.4)
- [ ] `configuracion` releída completa antes de cada escritura (no pisar `plazas_custom`)
- [ ] Ninguna función nueva de hook usada en `loadTab` sin `useCallback`
- [ ] Nada mandando `horas_total` a `turnos_personal` (columna `GENERATED ALWAYS`)
- [ ] Filas viejas con `turno` = `'apertura'`/`'cierre'` pelado siguen leyéndose bien

## Deuda que deja este plan (a `PENDIENTES.md`)

1. `turnos_servicio` en JSONB → tabla real cuando vuelva el DDL. Ídem `checklist_registros.turno` codificado `'cena:apertura'` → dos columnas (`turno_servicio_id`, `fase`).
2. `lib/fiscal/wsfe-directo.ts:29` (`fechaAr()`) resta 3h fijas — migrar a `fechaEnTz()` con verificación fiscal aparte.
3. `useMerma.TurnoMerma` (`apertura`/`servicio`/`cierre`) sigue siendo un enum propio, desalineado del turno de servicio.
4. Reset de `demanda_viva` al arrancar turno: ahora que existe un límite de turno real, el reset pendiente (ya anotado en `PENDIENTES.md`) tiene por fin dónde colgarse.
