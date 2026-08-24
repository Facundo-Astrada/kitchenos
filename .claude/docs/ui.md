# UI / CSS — KitchenOS

## Componentes canónicos

**Regla de oro: ninguna pantalla nueva introduce tabs, chips, empty states, botón de crear, avatares ni números propios. Todo sale de `components/ui/`.**

```typescript
import { SegmentedTabs, FilterChips, EmptyState, HeaderAction, Avatar, Num } from '@/components/ui'
import type { SegmentedTab, FilterChip } from '@/components/ui'
```

- **`SegmentedTabs`** — tabs pill. `variant="onDark"` (default, pill blanco sobre navy, usar dentro de `background: var(--navy)`) o `"onLight"` (pill card, sub-tabs). Props: `tabs: {id,label,icon?}[]`, `active`, `onChange`.
- **`FilterChips`** — chips con scroll horizontal + fade. `context="onLight"` (default, activo navy sólido) o `"onDark"` (activo pill **blanco** con texto navy, igual que `SegmentedTabs` onDark — navy sobre navy es invisible y deja al inactivo pareciendo el seleccionado). Props: `chips: {value,label}[]`, `active`, `onChange`.
- **`EmptyState`** — único estado vacío de la app. Props: `icon` (Material Symbol), `title`, `subtitle?`, `cta?: {label, onClick}`.
- **`HeaderAction`** — botón de acción primaria, siempre dentro del header navy. Props: `label` (default `'Nuevo'`), `icon` (default `'add'`), `onClick`, `disabled?`.
- **`Avatar`** — iniciales con color determinístico por hash del nombre. Paleta fija: navy `#4361a0`, verde `#10b981`, naranja `#f97316`, violeta `#8b5cf6`, rosa `#ec4899`, azul `#0ea5e9`. Props: `name`, `size?` (default 40).
- **`Num`** — número tabular (`font-variant-numeric: tabular-nums`), usar en precios/cantidades/KPIs: `<Num>{fmtPrecio(total)}</Num>`.
- **`UiChromeProvider` + `useSheetOpen()`** (`lib/ui/chrome.tsx`) — montado en `app/(app)/layout.tsx`; el Coach FAB se oculta cuando `sheetCount > 0`. Todo bottom sheet/modal/editor full-screen debe llamar `useSheetOpen()` al montarse.

---

## Tabla con header fijo: una sola `<table>` con `thead` sticky, no dos tablas separadas

Header y body en tablas distintas se desalinean si el body tiene scrollbar (~15px de desfase con anchos en %). Usar una `<table tableLayout: fixed>` con `<thead style={{position:'sticky', top:0, zIndex:5}}>`, fondo (`background: var(--navy)`) en cada `<th>` (no en un div padre), un solo `<colgroup>` compartido, y loading/error/vacío como filas `<tbody><tr><td colSpan={N}>`.

## Overlay full-screen debe superar el z-index del BottomNav

`BottomNav` es `z-[100]`. Un overlay `position:fixed;inset:0` con `zIndex:100` queda tapado por el nav — usar `zIndex:1000+` para overlays que deben cubrir toda la pantalla, nav incluido.

## Animaciones de lista — no romper el tap

`staggerChildren` + `y`-translate por ítem hace que las cards se muevan bajo el dedo → primer tap falla ("hay que apretar dos veces"), y bloquea el main thread. En listas interactivas (cards tappables): solo fade rápido en la posición final, sin stagger ni translate.
```tsx
const itemVariants = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.12 } } }
const containerVariants = { hidden: {}, show: { transition: { staggerChildren: 0 } } }
```

## Movimiento (S0, ago 2026)

Librería: **`motion/react`** (nombre nuevo del rebrand de Framer Motion — no instalar `framer-motion` aparte, es la misma librería duplicada). Tokens en `lib/ui/motion.ts`: `DURATION.instant` (120ms, feedback de tap), `DURATION.base` (200ms, cambio de estado), `DURATION.enter` (260ms, entrada de pantalla/sheet), `EASE_OUT`, `SPRING_SHEET` (el spring ya calibrado de `MoreMenu`), `useReducedMotion()`, `useDuration(base)` y `tap(ms?)` (háptico corto, `navigator.vibrate`, no-op si no hay soporte).

**Tres reglas que no se rompen:**
1. **Nada de rendimiento individual expuesto** — el "juego" es el turno y la plaza, nunca un ranking de personas ni un cronómetro comparativo entre cocineros (ver `MiembroCard.tsx`, doctrina del proyecto).
2. **KDS y Muro no se tocan** — fondo oscuro fijo, cero animaciones de entrada (`ui.md` § Vista de servicio ya lo dice, se repite acá porque S0 es el punto donde alguien va a venir a buscar "cómo animo algo").
3. **Nunca animar la posición de un target tappable** — ver "Animaciones de lista" arriba. `DURATION`/`EASE_OUT` son para chrome, entrada de pantalla y cambio de estado — no para mover una card bajo el dedo.

**Transición de pantalla — un solo punto, no dos.** Vive en `app/(app)/layout.tsx` (`AnimatePresence` keyeada por `pathname`, cubre el 100% de las rutas). `components/PageTransition.tsx` es un **pass-through deliberado** — 16 pantallas lo importan pero no anima nada: si animara de nuevo ahí encima, quedarían dos fades encimados sobre la misma navegación. No darle animación propia; si hace falta tocar la transición de pantalla, se toca en el layout.

**Reduced motion.** Todo lo que anima chrome/pantalla tiene que consultar `useReducedMotion()` y caer a duración 0 — no a "no aplicar el prop": el valor final se aplica igual, solo sin transición (ver el patrón en el layout). `tap()` (háptico) es independiente de reduced-motion — es táctil, no visual.

## Variables de color

```css
var(--navy) /* #1c2d4a header */  var(--accent) /* #4361a0 botones/énfasis */
var(--bg)   /* background */       var(--surface) /* cards, sheets */
var(--border) /* separadores */
var(--text-1/2/3) /* contraste máximo/medio/bajo */
```

## Selección de texto en mobile

`globals.css` ya tiene `user-select: none` global, re-habilitado en `input, textarea, [contenteditable]`. No agregar `user-select` inline.

## Bottom sheets scrolleables

Contenido variable (listas largas) siempre necesita `maxHeight` + scroll interno:
```tsx
<div style={{ background:'var(--surface)', borderRadius:'20px 20px 0 0', maxHeight:'80vh', display:'flex', flexDirection:'column' }}>
  <div style={{ padding:'20px 16px 0', flexShrink:0 }}>{/* título fijo */}</div>
  <div style={{ overflowY:'auto', flex:1, padding:'0 16px' }}>{/* lista scrolleable */}</div>
  <div style={{ padding:'8px 16px', paddingBottom:'max(env(safe-area-inset-bottom),16px)', flexShrink:0 }}>{/* acción fija */}</div>
</div>
```

## Navy header estándar

```tsx
<div style={{ background: 'var(--navy)', padding: '46px 16px 14px' }}> {/* 46px top para status bar iOS */}
```

## Header con título + control ancho (toggle/tabs) — se corta en mobile

`justify-content:space-between` con un toggle de 3-4 opciones no entra en mobile angosto. Inline styles no soportan media queries — usar clase global con el breakpoint estándar de la app (`1023px`, mismo que `#shell`):
```css
@media (max-width: 1023px) {
  .header-row-mobile-stack { flex-direction: column; align-items: stretch !important; }
  .header-control-mobile-full { width: 100%; }
}
```
Los botones del toggle llevan `flex:1, minWidth:0` siempre (en desktop es no-op sin espacio libre, pero evita duplicar el componente por breakpoint).

## Toggle de pills: `flex:1` fija `flex-basis:0` y desborda el activo

`flex: 1` en los botones de un toggle iguala anchos **ignorando el contenido**, así que el activo (el único que suele mostrar subtítulo) se derrama fuera del pill. Usar `flex: '1 1 auto'`: el ancho parte del contenido y recién después reparte el sobrante, que es lo que hace falta cuando el wrapper fuerza `width:100%` en mobile. Sumar `overflow:hidden` como red para pantallas muy angostas.

## Header de pantalla operativa — no apilar una fila por control

Cada fila del header navy le come ~12% de alto a un celular. Reglas: la **fecha solo si no es hoy** (si el módulo usa jornada operativa, comparar contra `fechaEnTz(new Date())`, no contra la jornada); los selectores que se cambian rara vez (turno) van como chips chicos junto al título, no en fila propia; la barra de progreso comparte fila con los tabs. Nunca repetir el mismo dato como título y como selector.

## Densidad de tarjeta operativa — un dato, un lugar

En pantallas que se usan de pie y con apuro, todo número que se pueda derivar de otros dos es ruido. No mostrar `N × peso` **y** el total; no mostrar un déficit calculado en una caja propia **y** dentro del CTA que lo resuelve. Los controles que se tocan poco (prioridad, borrar) van en un panel que se expande, no en la fila principal. Recalcular en `onChange`, no en `onBlur`, para que el CTA reaccione mientras se tipea; y si el dato cargado ya completa el ítem, tildarlo solo en vez de exigir el tap extra.

## Un control que colapsa su propia tarjeta va en la parte que no se mueve

Si tildar un ítem oculta medio contenido de la tarjeta (el mise esconde recipiente, stock y CTA detrás de `!checked`), el checkbox tiene que vivir arriba a la izquierda, no abajo: puesto abajo, al tocarlo la tarjeta se encoge, todo lo de abajo salta y **el control del ítem siguiente aterriza donde quedó el dedo** — mis-tap garantizado en una lista larga que se tapea rápido. Además, la columna de círculos alineados a la izquierda *es* el indicador de progreso de un checklist: anclados abajo quedan a alturas irregulares (tarjetas con CTA, colapsadas, con bloques extra) y se pierde el escaneo. Si el problema es que el trabajo pasa abajo y el "listo" está arriba, la cura es que el fondo de la tarjeta pueda completar el ítem, no mudar el control.

## Campo numérico precargado — `select()` al enfocar

Todo input de conteo que llega con un valor anterior (heredado del turno pasado o ya cargado) necesita `onFocus={e => e.currentTarget.select()}`: sin eso el cursor va al final y el primer dígito **se appendea** — contar 2 sobre un 10 heredado guarda 102. Se nota poco tocando el campo a mano y se multiplica apenas hay auto-foco encadenado.

## Recorrido encadenado de campos (auto-avance)

Para que una vuelta de conteo se corra sin bajar el teclado: disparar el salto **solo con acciones explícitas** (Enter, o el CTA que cierra el ítem), nunca en el `blur` — si avanza al perder foco, tocar cualquier parte de la pantalla teletransporta a otra tarjeta. El orden tiene que replicar el del render e ignorar lo colapsado (saltar a un campo que no está en pantalla manda al usuario a la nada), saltear los ítems ya resueltos que no tienen campo, y hacer `scrollIntoView({ block: 'center' })` — con el teclado abierto la mitad de abajo de la pantalla no existe, `nearest` no alcanza.

Los atajos de una vuelta (select-all, Enter→siguiente, auto-tilde al completar el dato, CTA que convierte el número en tarea) son **un paquete, no features sueltas**: si una fase los tiene todos y su gemela ninguna, la segunda se siente rota aunque funcione. Al agregar un atajo a la apertura de algo, revisar si el cierre lo necesita igual.

## El nombre de un ítem no comparte línea con datos accesorios

Nombre y chips (peso por porción, "receta", estado) en la misma fila flex significa que el chip se lleva su ancho y el nombre se trunca — el único dato que hay que leer queda en "Salsa criolla de la…" para que se vea un "88g/porc" que se puede leer abajo. El nombre se lleva la fila entera (dos líneas con `-webkit-line-clamp: 2`) y los chips bajan a una fila propia con `flexWrap`. Vale para celular y desktop por igual: el ancho de la tarjeta en una grilla de columnas es igual de escaso en los dos.

## Grilla CSS con `repeat(N,1fr)` no encoge por debajo del contenido — usar `minmax(0,1fr)`

Un pill/badge con `whiteSpace:'nowrap'` dentro de una celda de grilla (ej. título de evento largo en el calendario) no tiene punto de corte — la columna `1fr` crece para acomodar ese ancho mínimo en vez de truncar, y la grilla entera se desborda del layout (se superpone a un panel al lado si hay un `flex` padre). Fix: `gridTemplateColumns: 'repeat(N, minmax(0, 1fr))'` en vez de `repeat(N,1fr)` — dejar que la columna sí pueda encoger a 0 para que el `overflow:hidden`+`textOverflow:ellipsis` del contenido interno recién ahí trunque contra el ancho real.

## Modal centrado en desktop / full-screen en mobile — sin componente propio todavía

No existe un componente que combine `useIsDesktop()` + `useSheetOpenWhen()` para este patrón — se arma a mano por pantalla (ver `app/(app)/calendario/page.tsx`, forms de evento y de planificar menú; y el modal de alta/edición en `app/(app)/stock/ClientView.tsx`, con blur en el backdrop además del tinte). Estructura: en `isDesktop`, backdrop `position:fixed,inset:0,zIndex:2000,background:rgba(0,0,0,.55)` (opcional `backdropFilter:'blur(4px)'`) + card centrada (`borderRadius:18, maxWidth:560, maxHeight:'calc(100dvh - 48px)', overflowY:'auto'`, cierra al click en el backdrop vía `onClick` en el wrapper + `stopPropagation` en la card); si no, el form full-screen/sheet de siempre. **Cuarta copia** en `app/(app)/checklist/ClientView.tsx` (selector de plaza+turno, centrado en todos los anchos porque el contenido es corto) — ya se pagó dos veces el mismo bug al copiarlo mal (z-index bajo el nav, `useSheetOpen()` olvidado): extraer a `components/ui/` la próxima vez que se toque cualquiera de los cuatro.

## Todo sheet/modal debe envolverse en `SheetChrome` (o llamar `useSheetOpen()`)

Sin eso el FAB del Coach sigue flotando sobre el contenido del modal — se ve como un botón naranja tapando una fila de la lista. Para renders condicionales inline el wrapper es `{cond && <SheetChrome>…</SheetChrome>}` (`lib/ui/chrome.tsx`), que no se puede olvidar como sí se olvida el hook.

## Overlay dentro de un contenedor que se pliega — sale por portal, no por `position:absolute`

Un dropdown anclado a un botón que vive dentro de un contenedor con `overflow:hidden` (típico: un header que colapsa animando `maxHeight`) queda **recortado**: el `position:absolute` es clipeado por ese ancestro aunque se desborde visualmente hacia abajo. Fix: `createPortal(document.body)` + `position:fixed` con las coordenadas del botón medidas al abrir (`getBoundingClientRect()`), y cerrar el menú cuando el ancla desaparece (ej. cuando el header se pliega), o queda flotando apuntando a nada. Referencia: menú de tres puntos del Mise (`app/(app)/checklist/ClientView.tsx`).

## Input editable inline — nunca `button → autoFocus` tras montar

Un campo que se activa con `button onClick → setState → <input autoFocus>` no abre el teclado en iOS/Android: el input recién existe en el render siguiente, fuera del gesto de touch síncrono que el navegador exige para levantarlo. Mismo problema con `setTimeout(() => ref.current?.focus(), N)`. Fix: el input está **siempre montado** — `readOnly` + estilos transparentes en modo lectura (se sigue leyendo como texto plano), `onFocus` dispara el modo edición y hace `e.currentTarget.select()`, `onBlur` guarda. Fuente ≥16px en mobile o iOS hace zoom automático al enfocar. Referencia: celda de stock y editor de mínimo en `app/(app)/stock/ClientView.tsx`; el modo "Stockear" de la misma pantalla ya lo resolvía así desde antes (para eso sirve mirarlo como ejemplo).

## Columnas de tabla angostas en mobile — presupuestar contra el padding del `<td>`, no contra el `<col>`

Con `table-layout:fixed` y `box-sizing:border-box` (Tailwind preflight), el ancho del `<col>` es el ancho **total** de la celda — el contenido disponible real es `ancho del <col> - padding horizontal del <td>`. Un div/input hijo con `width` fijo mayor a ese resto se desborda del fondo de la celda sin que nada avise en el código (no hay clipping por default): visualmente el número queda descentrado o se sale del fondo resaltado. Recalcular el presupuesto real en el breakpoint angosto (`isNarrow`, <480px) cada vez que se fija un `width` en px dentro de una celda — y si hay un dato redundante con otra parte de la fila (ej. la unidad ya está en el subtítulo del producto), sacarlo del breakpoint apretado en vez de forzar que entre.

## Grillas multi-columna sobre listas con drag vertical

Un reordenar por long-press que compara `clientY` contra el centro de cada ítem (patrón del mise, `checklist/ClientView.tsx`) **se rompe** con dos tarjetas lado a lado: mismo centro vertical, el "más cercano" sale al azar. Si se agrega una grilla en desktop, condicionarla a `@media (min-width: 1024px) and (pointer: fine)` — no solo al ancho — para que una tablet táctil ancha (iPad landscape = 1024px) conserve columna única y drag funcionando.

## FABs

`BottomNav` ocupa ~76px. FABs en `bottom: 110` mínimo para no quedar tapados: `<button style={{position:'fixed', bottom:110, right:16}}>`.

## Botón "Guardar" en forms full-screen — NUNCA `position: fixed; bottom: 0`

Queda detrás del `BottomNav` (`z-[100]`). Usar botón **inline** al final del contenido, dentro del scroll de `main` — como `main` va antes del nav en el flex, su contenido ya queda por encima automáticamente:
```tsx
<div style={{ paddingBottom: 24 }}>
  {/* campos */}
  <div style={{ padding: '4px 16px 16px' }}>
    <button style={{ width:'100%', padding:14, borderRadius:12, background:'var(--navy)', color:'#fff' }}>Guardar</button>
  </div>
</div>
```

## Iconos

Solo `Material Symbols Outlined`, nunca emoji ni SVG custom: `<span className="material-symbols-outlined">inventory_2</span>`.

**Picker de ícono → nunca `<select>` nativo** (un `<option>` no renderiza la tipografía del symbol, se ve el nombre crudo cortado). Patrón: swatch redondo que despliega una grilla de botones, cada uno con su propio `<span className="material-symbols-outlined">` — ver `IconSwatch`/`IconPicker` en `components/checklist/SectionEditor.tsx`.

## Food cost — colores

`<30% verde (ok) · 30-35% amarillo (atención) · >35% rojo (crítico)`

## Panel OPS / mise — fuente única `components/ops/OpsPanel.tsx`

Único lugar para el flujo plaza → sección → recipiente → cantidad+unidad → peso por porción. Recibe `initial?: OpsInitial`, emite `onSave(result: OpsResult)`. Lo usan `RecetaOpsSheet`, `CartaBoardCard`, `PlatoRecetasEditor`, `ItemRowInline` — no duplicar (existen copias viejas sin migrar en `carta/page.tsx` y `espacios/components/ItemEditPanel.tsx`, deuda conocida, no tocar sin que lo pidan). Constantes `PLAZAS_OPS`/`SECCIONES_OPS` en `lib/ops/mise.ts`. Plazas custom se mezclan solas (`usePlazasCustom()` interno, no pasar por prop). Prop `recipienteSugerencias?: string[]` agrega datalist (usar `useId()` para el id, puede haber más de un panel en pantalla).

## Gramaje de un componente en pantalla — `peso_porcion` antes que `cantidad_ops`

Toda pantalla que muestre "cuánto de esta preparación va en el plato" tiene que resolverlo igual: si hay `checklist_items.peso_porcion` para esa `receta_id+plaza`, ese es el gramaje (con su `peso_porcion_unidad`); si no, `plato_recetas.cantidad_ops` en gramos. Mostrar `cantidad_ops` a secas es un bug cuando el componente tiene recipiente — ahí ese campo son porciones por recipiente (ver `columnas.md` → `plato_recetas`). Los totales por plato suman el valor resuelto, no `cantidad_ops`. Al editar, cada rama escribe en su tabla: `peso_porcion` es un UPDATE directo a `checklist_items` (no hay suma que recalcular, es compartido por receta+plaza); `cantidad_ops` va por el hook y sí requiere recalcular el mise. Referencia: `CartaBoardCard.tsx` y `PlatosView` en `recetario/page.tsx`.

## Toggle switch compacto

Para un booleano en un form, no usar `<input type="checkbox">` en caja grande con borde. Ya existe `SwitchRow` (ícono + label + descripción + pill deslizable) en `app/(app)/stock/ClientView.tsx` — revisar antes de escribir otro desde cero; candidato a extraer a `components/ui/` cuando se necesite en una segunda pantalla.

## Badges de estado — tinte alfa, no hex claro fijo (dark mode)

Fondo hex claro + texto hex oscuro fijos no adaptan a dark mode. Usar tinte alfa del color de texto sobre `var(--surface)`/`var(--bg)` (ej. `background:'rgba(67,97,160,.12)', color:'#4361a0'`, o `${color}18`). Colores **semánticos de estado** (food cost, prioridades, identidad de plaza) sí pueden ser hex fijos — son señales, no superficies.

## Idioma

Español argentino: "mise en place", "turno", "recetario", "pase", "merma", "stock", "plaza". No usar "ítem" ni inglés donde haya equivalente.

## Overlay con agujero (coach mark / spotlight)

SVG mask para oscurecer el fondo dejando visible un elemento:
```tsx
<svg width="100%" height="100%" style={{ position:'absolute', inset:0 }}>
  <defs><mask id="mi-mask">
    <rect width="100%" height="100%" fill="white" />
    <rect x={x} y={y} width={w} height={h} rx={16} fill="black" />
  </mask></defs>
  <rect width="100%" height="100%" fill="rgba(0,0,0,0.72)" mask="url(#mi-mask)" />
</svg>
```
`x,y,w,h` de `element.getBoundingClientRect()` + padding. `data-coach-target="id"` en el elemento a destacar. Esperar ≥80ms (220ms si hay cambio de tab) antes de medir. `width:0` (tab oculto) → auto-skip.

## FAB draggable (Pointer Events)

```tsx
function onPointerDown(e) { e.currentTarget.setPointerCapture(e.pointerId) /* guardar startX/Y */ }
function onPointerMove(e) { const d = Math.hypot(dx,dy); if (d < 8) return /* threshold tap vs drag */ }
function onPointerUp() { dr.moved ? localStorage.setItem('fab_pos', ...) : toggle() }
```
`touchAction:'none'` para evitar scroll accidental; `user-select:none` para evitar selección de texto.

## Boards Kanban desktop

- **Multi-select con Ctrl/Cmd+clic** (no checkboxes visibles): en `onPointerDown`, `e.ctrlKey||e.metaKey` togglea selección y corta el drag; drag normal deshabilitado mientras hay selección.
- **Columnas colapsables → fila de chips (`flexWrap:'wrap'`)**, NO tiras verticales altas (con muchas columnas cerradas se ven como "palitos" confusos). Expandir un chip restaura la columna. IDs colapsados en `localStorage`.
- **Auto-scroll en bordes durante drag**: loop `requestAnimationFrame` leyendo la posición del puntero desde un `ref` (no state) mueve `scrollLeft`/`scrollTop` cuando el puntero está a <70px de un borde.
- **Columnas que scrollean solas necesitan `height` explícito en toda la cadena, no `maxHeight` sobre un padre sin altura fija.** Si la fila contenedora tiene `alignItems:'flex-start'` en vez del `stretch` default, las columnas no se estiran y `maxHeight:'100%'` no tiene de qué ser el 100% — el contenido crece sin tope en vez de scrollear. Cadena correcta: wrapper `{flex:1,minHeight:0,overflowX:'auto',overflowY:'hidden'}` → fila `{height:'100%'}` (sin `alignItems` custom) → columna `{height:'100%'}` (no `maxHeight`) → body `{flex:1,minHeight:0,overflowY:'auto'}`.

## Loading y estado vacío — obligatorios en toda página

```tsx
if (loading) return <div>Cargando...</div>
if (items.length === 0) return <div>No hay datos todavía</div>
```

## Ancho del `#shell` — el cap de 420px no aplica en celular

`#shell` es full-width por default; la columna centrada de `max-width:420px` vive dentro de `@media (min-width:600px)` y se suelta de nuevo en `≥1024px` (ahí manda `DesktopShell`). El corte de 600px es `sw600dp` de Android: todo celular en vertical queda debajo.

No subir ese cap a un ancho de celular: hay Android que reporta **más de 420 CSS px** (Motorola 1080px @ DPR 2.25 → 480px; cualquier equipo con "Tamaño de pantalla" en chico → hasta 540px; iPhone Plus/Pro Max → 430px). Con el cap activo esos equipos mostraban bandas de `--navy` a los costados — la app se veía más angosta y estirada que la pantalla — y todo lo que es `position:fixed` (FABs, sheets) se anclaba al viewport real, o sea **fuera** de la columna. El iPhone 12/13/14 nunca lo mostró porque reporta 390px: probar solo ahí no alcanza para dar el layout por bueno.

## Vistas públicas (`app/(publico)/`) — escapar el `#shell` mobile

`#shell` tiene `height:100dvh; overflow:hidden` y, desde 600px, `max-width:420px` (pensado para la app logueada) — una vista pública con contenido más largo queda recortada si hereda ese overflow. Fix: layout del route group con `position:fixed; inset:0; overflowY:'auto'` (un `fixed` no es clippeado por `overflow:hidden` de un ancestro sin `transform`/`filter`/`contain`). Ver `app/(publico)/layout.tsx`; `app/(servicio)/layout.tsx` usa la misma técnica con `overflow:hidden` (scroll interno propio) en vez de `overflowY:auto`.

## Vista de servicio (Salón / KDS / Muro) — reglas UI inamovibles

Route group propio (`app/(servicio)/`), sin BottomNav, UX radicalmente distinta al dashboard de gestión.

- **Botones masivos** (≥64px alto) y **swipe amplio** para acciones principales — se toca con guantes y urgencia.
- **KDS y Muro**: fondo oscuro fijo (`#111`, texto blanco) por luz ambiental de cocina y pantallas grasientas — únicos lugares de tema oscuro fijo. **Salón sigue el tema de la app** (`var(--bg)`/`var(--surface)`/`var(--text-1)`).
- **Cero menús desplegables durante el despacho** — nada de `<select>`/dropdown/modal con opciones en KDS, Muro o mapa activo; todo 1 tap o 1 swipe.
- Fuente grande (≥18px labels, ≥24px nombres de plato/plaza). Sin animaciones de entrada costosas (KDS y Muro reciben updates realtime, bloquearían taps). Tablet-first (768-1024px horizontal), desktop funciona, celular secundario.
- **Español siempre**, incluso jerga POS en inglés: "EN HOLD"→"EN ESPERA", "All-day"→"Consolidado", "Recall"→"Recuperar", "Bumpeado"→"Despachado", "FIRE"→"MARCHAR". Excepción: "86" (agotado) no se traduce.
- **Tema por ruta**: `app/(servicio)/layout.tsx` decide con `usePathname()` (`esOscuro = pathname.startsWith('/kds') || pathname.startsWith('/muro')`). Mobile/tablet (<1024px): `position:fixed;inset:0;overflow:hidden`, scroll interno por sub-vista. Desktop (≥1024px): convive con `SidebarNav` (`dark` prop en KDS y Muro) vía `useIsDesktop()`.
- **Coach FAB: sí en Salón, no en KDS ni Muro.** Salón monta `<KitchenCoachFAB />` directo (vista `'mapa'`), contexto propio (`kc_screen_context`, screen `'salon'`) y tour en `lib/coach/tours.ts` (`TOURS.salon`). KDS y Muro nunca lo muestran — distrae del despacho/monitoreo.
- En KDS y Muro no usar tokens de tema (fondo fijo). En Salón sí usar tokens; únicos hex fijos permitidos: colores semánticos (verde listo `#2e7d32`, rojo cuenta `#a04343`, dorado propina `#c9a227`, madera mesa `#a9744f`) y `#fff` sobre botones de color.
- **Muro** (`app/(servicio)/muro/page.tsx`, MURO-PLAN.md F3): tablet única para toda la cocina, monitoreo + acción del jefe sobre Producción (no el Mise — estados `pendiente/en_curso/listo/duda` son de `tareas`, el Mise no los tiene). Vista general **nunca scrollea**: lo pendiente se lista, lo `listo` colapsa a `+N listas` (se ve completo solo en el foco de esa plaza). Con más de 5 plazas, las vacías se encogen a una tira angosta. Reusa `nextEstado` de `ItemOps.tsx` para el ciclo de tap, no lo reimplementa. Atribución de `en_curso`/`duda` vía `tareas.estado_por/estado_at` (un solo par para los dos estados — `listo` tiene el suyo propio, `completado_por/completed_at`).

## Editor del plano del salón — zoom/pan

`app/(servicio)/salon/config/page.tsx` (tab Mesas): editor 2D tipo Planner 5D; el mapa real (`salon/page.tsx`, vista `'mapa'`) comparte el mismo canvas.

- **`components/salon/PanZoomCanvas.tsx`** — mundo virtual fijo (`1200×800`) en viewport `overflow:hidden`, div interno con `transform: translate(x,y) scale(z)`. Zoom con rueda hacia el cursor (clamp 0.3-3) y pinch (Pointer Events); pan arrastrando el fondo. Los ítems draggean con `dx / canvasRect.width * 100` — sigue siendo correcto con cualquier zoom porque `canvasRect.width = 1200*scale`.
- Posiciones/tamaños en % del mundo (`pos_x/pos_y/ancho/alto`, 0-100).
- **Drag/resize con estado LOCAL al ítem** (`MesaCanvasItem`/`ElementoCanvasItem`, `React.memo`) — mover una mesa no re-renderiza el resto del plano. `stopPropagation` en `onPointerDown` para no disparar el pan. Commit a DB solo al soltar, vía callbacks estables (`useCallback`+refs, no rompen el memo).
- **Updates optimistas** en `useMesas`/`useSalonElementos` (`mutate(prev=>…, {revalidate:false})`) — sin snap-back al soltar; el overlay local se limpia cuando el dato real lo alcanza.
- **Deshacer** (Ctrl/⌘+Z + botón): pila de thunks inversos en `useRef` (máx 50), uno por commit.
- Mínimos en unidades de mundo (mesa 5%, elemento 3%), no px — el handle de resize escala con el zoom.
- **Elementos decorativos** (`salon_elementos`) comparten canvas/drag/resize, config en `lib/salon/elementos.ts`; no clickeables en servicio (`pointerEvents:'none'`).
- **Sillas** (`components/salon/Sillas.tsx`): glifos derivados de `forma+capacidad+ancho/alto`, sin estado propio.
- Mesa sin color propio = madera `#a9744f`.

## Listas largas: memo en la card + props estables

Una lista de 40+ cards (el mise de una plaza, el board de OPS) se re-renderiza entera con cada cambio de estado del padre. La card va en `memo(...)` con comparador propio, y las props que le bajan tienen que ser estables o el memo no sirve de nada:

- `[]` literal en el JSX → constante a nivel de módulo (`const SIN_PLAZAS: T[] = []`).
- Handler inline (`onX={async () => ...}`) → `useCallback`.
- Función que viene de un hook sin memoizar → `useCallback` local que la llama por `ref`, para no depender de su identidad.

Los objetos que sí cambian (el registro de la fila) se comparan por campo dentro del comparador, no por referencia.

## Guía de pantalla: texto y recorrido guiado

Una pantalla densa lleva su explicación al lado, en dos formas sobre el mismo contenido: una hoja de lectura (`MiseGuiaSheet` — réplica visual de cada control + qué hace + cómo repercute después) y un recorrido que la señala sobre la pantalla real (`MiseTourOverlay` — fondo oscurecido, control recortado con borde naranja, viñeta con puntita). Ambos van por `createPortal(document.body)`: montados en el árbol de la pantalla, el panel lateral del Coach queda por encima del backdrop en desktop y la pantalla se oscurece a medias.

El recorrido busca sus controles por `data-coach-target`, scrollea al centro antes de medir, cambia de tab si el paso lo necesita (y restaura el que tenía el usuario), y si un control no existe en esa cuenta saltea el paso solo.
