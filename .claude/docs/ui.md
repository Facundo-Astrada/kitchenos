# UI / CSS — KitchenOS

## Componentes canónicos

**Regla de oro: ninguna pantalla nueva introduce tabs, chips, empty states, botón de crear, avatares ni números propios. Todo sale de `components/ui/`.**

```typescript
import { SegmentedTabs, FilterChips, EmptyState, HeaderAction, Avatar, Num } from '@/components/ui'
import type { SegmentedTab, FilterChip } from '@/components/ui'
```

- **`SegmentedTabs`** — tabs pill. `variant="onDark"` (default, pill blanco sobre navy, usar dentro de `background: var(--navy)`) o `"onLight"` (pill card, sub-tabs). Props: `tabs: {id,label,icon?}[]`, `active`, `onChange`.
- **`FilterChips`** — chips con scroll horizontal + fade. `context="onLight"` (default, activo navy sólido) o `"onDark"` (fondo rgba blanco). Props: `chips: {value,label}[]`, `active`, `onChange`.
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

## Vistas públicas (`app/(publico)/`) — escapar el `#shell` mobile

`#shell` tiene `max-width:420px; height:100dvh; overflow:hidden` (pensado para la app logueada) — una vista pública con contenido más largo queda recortada si hereda ese overflow. Fix: layout del route group con `position:fixed; inset:0; overflowY:'auto'` (un `fixed` no es clippeado por `overflow:hidden` de un ancestro sin `transform`/`filter`/`contain`). Ver `app/(publico)/layout.tsx`; `app/(servicio)/layout.tsx` usa la misma técnica con `overflow:hidden` (scroll interno propio) en vez de `overflowY:auto`.

## Vista de servicio (Salón / KDS) — reglas UI inamovibles

Route group propio (`app/(servicio)/`), sin BottomNav, UX radicalmente distinta al dashboard de gestión.

- **Botones masivos** (≥64px alto) y **swipe amplio** para acciones principales — se toca con guantes y urgencia.
- **KDS**: fondo oscuro fijo (`#111`, texto blanco) por luz ambiental de cocina y pantallas grasientas — único lugar de tema oscuro fijo. **Salón sigue el tema de la app** (`var(--bg)`/`var(--surface)`/`var(--text-1)`).
- **Cero menús desplegables durante el despacho** — nada de `<select>`/dropdown/modal con opciones en KDS o mapa activo; todo 1 tap o 1 swipe.
- Fuente grande (≥18px labels, ≥24px nombres de plato). Sin animaciones de entrada costosas (KDS recibe updates realtime, bloquearían taps). Tablet-first (768-1024px horizontal), desktop funciona, celular secundario para KDS.
- **Español siempre**, incluso jerga POS en inglés: "EN HOLD"→"EN ESPERA", "All-day"→"Consolidado", "Recall"→"Recuperar", "Bumpeado"→"Despachado", "FIRE"→"MARCHAR". Excepción: "86" (agotado) no se traduce.
- **Tema por ruta**: `app/(servicio)/layout.tsx` decide con `usePathname()` (`esKds = pathname.startsWith('/kds')`). Mobile/tablet (<1024px): `position:fixed;inset:0;overflow:hidden`, scroll interno por sub-vista. Desktop (≥1024px): convive con `SidebarNav` (`dark` prop solo en KDS) vía `useIsDesktop()`.
- **Coach FAB: sí en Salón, no en KDS.** Salón monta `<KitchenCoachFAB />` directo (vista `'mapa'`), contexto propio (`kc_screen_context`, screen `'salon'`) y tour en `lib/coach/tours.ts` (`TOURS.salon`). KDS nunca lo muestra — distrae durante el despacho.
- En KDS no usar tokens de tema (fondo fijo). En Salón sí usar tokens; únicos hex fijos permitidos: colores semánticos (verde listo `#2e7d32`, rojo cuenta `#a04343`, dorado propina `#c9a227`, madera mesa `#a9744f`) y `#fff` sobre botones de color.

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
