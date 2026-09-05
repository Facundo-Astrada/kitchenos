# PLAN — Gestos de Mise y Producción (sep 2026)

Tres cambios pedidos desde uso real, más lo que arrastran. Orden de ejecución: **1 → 3 → 2**
(el picker toca 3 archivos y es el de más riesgo; los avisos plegados son puro layout y dan
aire de pantalla enseguida; la nota es el único que toca DB).

Decisiones ya tomadas (Facundo, 05/09):
- La nota **vive pegada al ítem hasta que alguien la borre** (`checklist_items`), no por turno.
- El long-press de nota va **solo en Modo Control**. En Mise normal el long-press sigue siendo
  el drag de reordenar (`ClientView.tsx:1259`), que no se toca.

---

## 1 · Prioridad sin salto — press-and-hold picker

**Problema:** en Producción los ítems se agrupan por prioridad (`ItemsPorPrioridad`,
`ProduccionBoard.tsx:728`), y el chip cicla SP→P→REF→Baja con cada tap
(`ItemOps.tsx:295`). Cambiar de SP a REF son 2 taps y el ítem salta de grupo entre
tap y tap: la segunda vez ya no está donde estaba el dedo.

**Gesto nuevo:** mantener apretado el badge → se abre en vertical, pegado al badge, la
columna SP / P / REF / (Baja) → deslizando el dedo se resalta la opción → al soltar se
aplica y recién ahí se mueve el ítem.

**Tap también funciona** (DESIGN.md §10 prohíbe "gestos como única vía"): un tap sin
desplazamiento deja el menú abierto (modo sticky) y se elige tocando una opción. Un tap
solo **nunca** cambia la prioridad — ahí muere el salto.

### 1.1 `lib/ui/picker.ts` (nuevo, puro, testeable)

```ts
export interface RectV { top: number; bottom: number }
/** Índice de la opción bajo `y`, o null si el dedo está fuera de la columna. */
export function opcionDesdeY(y: number, rects: RectV[]): number | null
/** Posición del popover: lado (derecha/izquierda) y top clampeado al viewport. */
export function posicionPopover(anchor: DOMRectLike, alto: number, ancho: number, vw: number, vh: number): { left: number; top: number }
```
Test en `lib/ui/picker.test.ts` (vitest solo corre `lib/**/*.test.ts`, env node).

### 1.2 `components/ops/PrioridadPicker.tsx` (nuevo)

```tsx
interface PrioOpcion<T extends string> { value: T; label: string; color: string; bg: string }
interface Props<T extends string> {
  value: T; opciones: PrioOpcion<T>[]; onChange: (v: T) => void
  disabled?: boolean; variant: 'chip' | 'circle'; title?: string
}
```

- **Trigger:** `variant='chip'` replica el chip actual de `ItemOps` (label + `sync_alt`);
  `variant='circle'` replica el círculo de 30px del Modo Control. Mismos estilos que hoy —
  este cambio no re-diseña el badge, cambia cómo se toca.
- **Apertura:** `onPointerDown` abre el popover en el acto (`tap(10)`) y entra en modo
  arrastre. `pointermove` sobre `window` resuelve la opción con `opcionDesdeY`
  (`tap(10)` en cada cambio de resaltado). `pointerup`: si hubo desplazamiento > 8px y hay
  opción bajo el dedo → commit + `tap(30)` + cierra. Si no hubo desplazamiento → queda
  sticky; se elige con click y se cierra tocando el backdrop o Escape.
- **Portal a `document.body`** (`createPortal`) con `position: fixed` desde
  `getBoundingClientRect()` del trigger: adentro del board hay `overflow` en varios niveles
  y un popover absoluto quedaría recortado. Lado derecho por defecto; a la izquierda si no
  entra. Alto de opción **44px** (dedo), ancho 64, radio 12, `--shadow-3`, fondo `--surface`.
- **`touchAction: 'none'` en el trigger** — sin eso el scroll del board se lleva el gesto.
- **Trampa conocida:** en `ItemOps` el chip vive dentro del div del nombre, que tiene
  `onMouseDown/onTouchStart → startHold` (600ms → estado `duda`, `ItemOps.tsx:148`). El
  picker **debe** `stopPropagation()` en `pointerdown`, `mousedown` y `touchstart`, o
  mantener apretado el badge marca el ítem como duda de fondo.
- Teclado: Enter/Espacio abre, ↑/↓ mueven, Enter aplica, Escape cierra.
- `useReducedMotion()` → sin animación de entrada del popover.

### 1.3 Reemplazos (3 llamadas)

| Archivo | Línea aprox. | Qué se reemplaza |
|---|---|---|
| `components/ops/ItemOps.tsx` | 279-320 | chip que cicla → `<PrioridadPicker variant="chip">` (SP/P/REF/Baja). Borrar `nextPrioridad` y `PRIO_CYCLE` locales. |
| `app/(app)/checklist/ClientView.tsx` | 2073 | círculo del Modo Control → `<PrioridadPicker variant="circle">` con SP/P/REF (sin `chk`, ver `PRIO_CYCLE_CONTROL`). Mantener `disabled={resuelto}` y los `title` de hoy. |
| `components/mise/ProductoMiseCard.tsx` | 909 | badge del panel expandido → mismo picker (SP/P/REF/OK). Consistencia: es el mismo botón en la misma pantalla. |

Tras esto, `nextPrio`/`nextPrioControl` de `ClientView.tsx:75-86` y `nextPrio` de
`ProductoMiseCard.tsx:67` quedan sin caller → borrarlos (no dejarlos "por si acaso").

---

## 2 · Nota por ítem — comunicación diaria

**Storage:** columnas nuevas en `checklist_items`. Persiste hasta que alguien la borre.

### 2.1 Migración `supabase/migrations/20260905_checklist_items_nota.sql`

```sql
alter table checklist_items
  add column if not exists nota text,
  add column if not exists nota_por text,        -- nombre visible del autor, no id
  add column if not exists nota_at timestamptz;
notify pgrst, 'reload schema';
```
El `notify` no es opcional: sin él el browser no ve las columnas nuevas hasta que
PostgREST recicle su cache. RLS no cambia — son columnas de una tabla que ya tiene
policies y ya se actualiza desde el cliente (`actualizarItem`).

**Ojo:** `checklist_items.observacion` ya existe, está **muerta** (173 filas, 0 llenas,
ningún caller en el repo). No reusarla ni tocarla acá; queda anotada en `columnas.md` como
"no usar, usar `nota`". Si Facundo quiere, se dropea en otra migración.

`nota_por` guarda el **nombre** (`"Facundo A."`), no el `miembro_id`: lo que el que entra
necesita leer es quién lo escribió, y resolver ids pediría un fetch de `equipo_miembros`
que esta pantalla hoy no hace.

### 2.2 Tipos y hook

- `types/index.ts` → `MisePlaceItem`: `nota?: string | null; nota_por?: string | null; nota_at?: string | null`.
- `lib/hooks/useChecklist.ts:398` → sumar los tres campos al `Partial<>` de `actualizarItem`
  (ya es optimista + rollback, no hace falta nada más).

### 2.3 `components/mise/NotaItemSheet.tsx` (nuevo)

Bottom sheet chico — patrón calcado de `CrearTareaSheet.tsx` (fixed inset 0, z-index 300,
`justifyContent: flex-end`, swipe-down > 60px cierra, `SheetChrome` para que el FAB del
Coach se esconda).

- Alto: `maxHeight: min(340px, 40vh)` en el cuerpo — un tercio de pantalla, como se pidió.
- Contenido: nombre del ítem · textarea 3 líneas · si ya había nota, "por {nota_por} ·
  hace 2 h" · botones **Guardar** y **Borrar nota** (borrar es explícito, nunca por gesto).
- **Sin `autoFocus`** en el textarea: el sheet se monta después de un `setTimeout` de
  long-press, así que el foco caería fuera del call stack del touch y iOS no levantaría el
  teclado (ver memoria `feedback_mobile_keyboard_inline_edit`). El textarea se toca y
  abre el teclado al primer toque porque ya está montado. `fontSize: 15` (bajo 14px iOS
  hace zoom solo).

### 2.4 Entradas al sheet

| Dónde | Gesto |
|---|---|
| Fila de Modo Control (`ClientView.tsx:2020`) | **Mantener apretado la fila** (400ms, `tap(30)`) → abre el sheet. Requiere `stopPropagation` en el picker y en el botón "+" para que apretarlos no dispare la nota. |
| Fila de Modo Control, con nota cargada | Ícono `sticky_note_2` a la izquierda del nombre → tap abre el sheet. |
| `ProductoMiseCard` (Mise normal) | Ícono `sticky_note_2` en la fila principal cuando hay nota (tap abre) + botón "Nota" en el panel expandido, al lado de Eliminar. El long-press ahí sigue siendo el drag. |

**Color del indicador:** `--accent` (azul), no ámbar. DESIGN.md §3 pone techo de 3 elementos
ámbar simultáneos por pantalla y el ámbar ya está tomado por "en producción" — una nota no
es una alarma, es un mensaje.

---

## 3 · Avisos del turno anterior, plegados

**Problema:** `Te dejaron en producción` (`ClientView.tsx:1793`) y `Pendiente del turno
anterior` (`:1826`) listan **todos** sus ítems y comen ~250px antes del primer ítem real.
Mismo caso en el tab cierre con `Pendiente del turno` (`:1893`).

**Cambio:** los tres pasan a **una fila de chips** arriba de las secciones — ícono + label
corto + contador, ~32px en total. Tocar un chip despliega su lista debajo (la de hoy tal
cual, sin rediseño); solo uno abierto por vez; arrancan cerrados siempre.

- Componente local `AvisosTurno` en `ClientView.tsx` (no sale a `components/` hasta que lo
  use una segunda pantalla).
- Chips: `pending` ámbar "En producción · 9" · `warning` amarillo "Del turno anterior · 19"
  · `report` rojo "Sin cierre anterior" (esta última despliega el texto explicativo y el
  link "¿Cómo lo cargo?", que hoy vive suelto).
- El comentario de `:1745` ("el contexto del turno anterior no se esconde nunca detrás de
  un tap") se refiere a **Notas de plaza**, que no se toca: sigue abierta sola cuando hay
  notas. Estos avisos sí se pliegan — son un recuento de lo que igual está listado abajo.

---

## Copy que enseña el gesto viejo (obligatorio, no es cosmética)

Tres textos le explican al usuario "un tap lo cicla SP → P → REF" y quedan mintiendo:

- `components/mise/MiseGuiaSheet.tsx:236`
- `components/mise/MiseTourOverlay.tsx:66`
- `app/api/coach/route.ts:220` (contexto del Coach — si no se actualiza, el Coach explica
  el gesto viejo cuando alguien pregunta)

Redacción nueva: "mantené apretado el badge y deslizá para elegir SP / P / REF; con un tap
se abre la lista y elegís tocando".

---

## Verificación

1. `npm run build` (typecheck) y `npm test` (el nuevo `lib/ui/picker.test.ts`).
2. Dev server + celular por LAN (es todo gesto táctil, el mouse no prueba nada):
   - Producción: mantener apretado SP en un ítem de Parrilla → deslizar a REF → soltar.
     El ítem se mueve **una vez**, al soltar. Un tap solo no cambia nada.
   - Mismo gesto en Modo Control y en la tarjeta expandida del Mise normal.
   - `ItemOps`: mantener apretado el badge **no** deja el ítem en `duda`.
   - Modo Control: mantener apretado "Trucha curada" → sheet → escribir → Guardar →
     aparece el ícono de nota → cerrar y reabrir la pantalla, la nota sigue.
   - Mise normal: mantener apretado un ítem sigue arrastrando para reordenar.
   - Apertura con arrastre del turno anterior: los avisos entran en una línea y el primer
     ítem del mise se ve sin scrollear.
3. Deploy (`git push` → Vercel) al cerrar el bloque, no por iteración.

## Docs a tocar al cierre

`.claude/docs/columnas.md` (nota/nota_por/nota_at + la advertencia de `observacion`),
`ESTADO-ACTUAL.md` (Mise), `SESION.md` vía `/update-status`.

## Fuera de alcance (dicho a propósito)

- Llevar la nota del ítem a la tarea de Producción que salió de él (el mensaje viajaría
  entre módulos — es otra decisión, no un detalle).
- Dropear `checklist_items.observacion`.
- Flash de "acá quedó" sobre el ítem que se movió de grupo en Producción — se evalúa
  después de usar el picker unos días; puede no hacer falta.
