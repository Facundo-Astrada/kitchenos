# UI / CSS — KitchenOS

## Componentes canónicos (D0, jul 2026)

**Regla de oro: ninguna pantalla nueva introduce tabs, chips, empty states, botón de crear, avatares ni números propios. Todo sale de `components/ui/`.**

```typescript
import { SegmentedTabs, FilterChips, EmptyState, HeaderAction, Avatar, Num } from '@/components/ui'
import type { SegmentedTab, FilterChip } from '@/components/ui'
```

### SegmentedTabs

Tabs pill con dos variantes. Reemplaza los ~5 estilos distintos de tabs que había en la app.

```tsx
// onDark (default) — pill blanco sobre navy. Patrón OPS / Equipo / Carta.
// Usar DENTRO de un contenedor con background: 'var(--navy)'.
<SegmentedTabs
  tabs={[{ id: 'a', label: 'Uno', icon: 'task_alt' }, { id: 'b', label: 'Dos' }]}
  active={tab}
  onChange={setTab}
/>

// onLight — pill card sobre fondo claro. Patrón HACCP sub-tabs.
<SegmentedTabs tabs={tabs} active={tab} onChange={setTab} variant="onLight" />
```

Props:
- `tabs: SegmentedTab<T>[]` — `{ id: T, label: string, icon?: string }`
- `active: T`
- `onChange: (id: T) => void`
- `variant?: 'onDark' | 'onLight'` (default: `'onDark'`)
- `style?: CSSProperties`

### FilterChips

Chips de filtro con scroll horizontal y fade de overflow. Reemplaza los 4 patrones de chips contradictorios.

```tsx
const PERIODOS: FilterChip<Periodo>[] = [
  { value: 'semana', label: 'Semana' },
  { value: 'mes', label: 'Mes' },
  { value: 'todo', label: 'Todo' },
]

// onLight (default) — activo navy sólido, inactivo var(--surface). Para body claro.
<FilterChips chips={PERIODOS} active={periodo} onChange={handlePeriodo} style={{ padding: '16px 16px 12px' }} />

// onDark — inactivo rgba(255,255,255,.08). Para dentro de headers oscuros.
<FilterChips chips={chips} active={active} onChange={onChange} context="onDark" />
```

Props:
- `chips: FilterChip<T>[]` — `{ value: T, label: string }`
- `active: T`
- `onChange: (value: T) => void`
- `context?: 'onLight' | 'onDark'` (default: `'onLight'`)
- `style?: CSSProperties`

### EmptyState

Estado vacío único de la app. Reemplaza los ~12 empty states ad hoc.

```tsx
<EmptyState
  icon="bar_chart"
  title="Sin datos de ventas"
  subtitle="Importá tus ventas desde la pestaña Importar"
  cta={{ label: 'Ir a Importar', onClick: () => setTab('importar') }}
/>
```

Props:
- `icon: string` — nombre de Material Symbol
- `title: string`
- `subtitle?: string`
- `cta?: { label: string; onClick: () => void }`
- `style?: CSSProperties`

### HeaderAction

Botón de acción primaria de pantalla. Va DENTRO del header navy. Reemplaza FABs de acción y barras flotantes por pantalla.

```tsx
// Siempre dentro de: <div style={{ background: 'var(--navy)', ... }}>
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
  <span style={{ color: '#fff', fontWeight: 700, fontSize: 20 }}>Mi pantalla</span>
  <HeaderAction label="Nuevo" icon="add" onClick={handleNuevo} />
</div>
```

Props:
- `label?: string` (default: `'Nuevo'`)
- `icon?: string` (default: `'add'`)
- `onClick: () => void`
- `disabled?: boolean`
- `style?: CSSProperties`

### Avatar

Iniciales con color determinístico por hash del nombre. Paleta fija de 6 colores de identidad. Reemplaza naranja-todos (Equipo) y multicolor-aleatorio (Proveedores).

```tsx
<Avatar name="Franco López" size={40} />
<Avatar name="Ana García" size={32} />
```

Props:
- `name: string` — nombre completo; hash determina el color
- `size?: number` (default: `40`)
- `style?: CSSProperties`
- `className?: string`

Paleta: accent navy `#4361a0`, verde `#10b981`, naranja `#f97316`, violeta `#8b5cf6`, rosa `#ec4899`, azul `#0ea5e9`.

### Num

Número tabular (`font-variant-numeric: tabular-nums`). Alinea cifras en columnas. Usar en: precios, cantidades de stock, KPIs, contadores.

```tsx
<Num>$328.500</Num>
<Num style={{ fontSize: 20, fontWeight: 700 }}>{stock_actual}</Num>
<p className="text-[16px] font-bold"><Num>{fmtPrecio(total)}</Num></p>
```

Props:
- `children: ReactNode`
- `className?: string`
- `style?: CSSProperties`

### UiChromeProvider + useSheetOpen

Provider montado en `app/(app)/layout.tsx`. El KitchenCoachFAB se oculta cuando `sheetCount > 0`.

```tsx
// En un bottom sheet, modal o editor full-screen:
import { useSheetOpen } from '@/lib/ui/chrome'

function MiSheet() {
  useSheetOpen()  // ← incrementa al montar, decrementa al desmontar
  return <div>...</div>
}
```

La integración masiva de sheets existentes ocurre en D1. En D0 solo el provider está montado y el FAB lo lee.

---

## Tabla con header fijo: usar UNA tabla con `thead` sticky, no dos tablas (jun 2026)

Patrón viejo (header en su `<table>` + body en otra `<table>` scrolleable): si el body tiene scrollbar, su `<table>` queda ~15px más angosta que la del header. Con anchos de columna en **%** ese desfase se reparte y las columnas del header **no caen sobre las del body** (se nota como líneas corridas, sobre todo en el resaltado de una columna). Pasó en `stock/ClientView.tsx`.

**Fix:** una sola `<table tableLayout: fixed>` dentro del contenedor scrolleable, con `<thead style={{ position: 'sticky', top: 0, zIndex: 5 }}>` y cada `<th>` con `background: var(--navy)` (el fondo va en cada th, no en un div padre, porque el thead flota sobre el contenido al scrollear). Loading/error/vacío van como `<tbody><tr><td colSpan={N}>…`. Un solo `<colgroup>` → header y body comparten anchos exactos. Calcular `colCount` para el `colSpan`.

## Overlay full-screen (`position: fixed; inset: 0`) debe ir por encima del BottomNav (jun 2026)

El `BottomNav` es `z-[100]`. Un overlay a pantalla completa con `zIndex: 100` (ej. el modo "Stockear" de stock) queda **al mismo nivel** → el nav le tapa la barra de botones de abajo. Usar `zIndex: 1000` (o cualquier valor > 100) para overlays que deben cubrir toda la pantalla, nav incluido. (Distinto del caso "botón Guardar inline" de más abajo, que es para forms que viven dentro del scroll de `main`.)

## Animaciones de lista — no romper el tap (junio 2026)

Animar la entrada de una lista con framer-motion `staggerChildren` + `y`-translate por ítem hace que las cards **se muevan bajo el dedo** durante toda la animación (con 20+ ítems y `staggerChildren: 0.05` son >1s). El primer tap cae sobre un target en movimiento → "hay que apretar dos veces" para abrir la card; un buscador en el mismo header también queda trabado mientras el main thread compone. Pasó en `recetario/page.tsx`.

```tsx
// ❌ target en movimiento + stagger largo
const itemVariants = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.2 } } }
const containerVariants = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } }

// ✅ fade rápido EN su posición final, sin stagger → tappable de inmediato
const itemVariants = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.12 } } }
const containerVariants = { hidden: {}, show: { transition: { staggerChildren: 0 } } }
```
Regla: si una lista es interactiva (cards tappables, navegan), no le pongas translate ni stagger en la animación de entrada. Solo opacity rápida, o nada.

## Variables de color

```css
var(--navy)      /* #1c2d4a — header primario */
var(--accent)    /* #4361a0 — botones, énfasis */
var(--bg)        /* background (light/dark) */
var(--surface)   /* cards, sheets */
var(--border)    /* separadores */
var(--text-1)    /* contraste máximo */
var(--text-2)    /* contraste medio */
var(--text-3)    /* contraste bajo (subtítulos) */
```

## Selección de texto en mobile

`globals.css` tiene `user-select: none` en `body` y `-webkit-user-select: none`. Re-habilitado en `input, textarea, [contenteditable]`. Esto previene que el browser seleccione texto durante long-press / drag en toda la app (comportamiento nativo). **No agregar `user-select` inline** — ya está cubierto globalmente.

## Bottom sheets scrolleables

Cuando un bottom sheet puede tener contenido variable (listas, categorías), siempre agregar `maxHeight` y scroll:

```tsx
<div style={{ background: 'var(--surface)', borderRadius: '20px 20px 0 0', width: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
  <div style={{ padding: '20px 16px 0', flexShrink: 0 }}>{/* título fijo */}</div>
  <div style={{ overflowY: 'auto', flex: 1, padding: '0 16px' }}>{/* lista scrolleable */}</div>
  <div style={{ padding: '8px 16px', paddingBottom: 'max(env(safe-area-inset-bottom), 16px)', flexShrink: 0 }}>{/* botón cancelar fijo */}</div>
</div>
```

## Navy header estándar

```tsx
<div style={{ background: 'var(--navy)', padding: '46px 16px 14px' }}>
  {/* 46px top para status bar iOS */}
</div>
```

## FABs (botones flotantes)

`BottomNav` ocupa ~76px desde abajo. Los FABs deben ir en `bottom: 110` mínimo para no quedar tapados.

```tsx
<button style={{ position: 'fixed', bottom: 110, right: 16 }}>
  <span className="material-symbols-outlined">add</span>
</button>
```

## Botón "Guardar" en forms full-screen — NO usar `position: fixed; bottom: 0`

El `BottomNav` es `z-[100]` y vive en el flujo del layout (`app/(app)/layout.tsx`: `<main flex-1 overflow-y-auto>` + `<BottomNav>` después). Una barra de guardar con `position: fixed; bottom: 0; zIndex: 50` se escapa al viewport y queda **detrás del nav** → el botón no se ve ni se puede tocar. Pasó en los 3 forms de HACCP (limpieza/vencimientos/temperaturas, jun 2026).

**Patrón correcto:** botón **inline** al final del contenido (dentro del scroll de `main`), nunca fixed. Como `main` está *antes* del nav en el flex, todo su contenido queda por encima del nav automáticamente:

```tsx
<div style={{ paddingBottom: 24 }}>
  {/* ...campos del form... */}
  <div style={{ padding: '4px 16px 16px' }}>
    <button style={{ width: '100%', padding: 14, borderRadius: 12, background: 'var(--navy)', color: '#fff' }}>Guardar</button>
  </div>
</div>
```

## Iconos

Solo `Material Symbols Outlined`. Nunca emoji ni SVG custom.

```tsx
<span className="material-symbols-outlined">inventory_2</span>
<span className="material-symbols-outlined">receipt_long</span>
<span className="material-symbols-outlined">restaurant_menu</span>
```

## Food cost — colores

```
< 30%  → verde  (ok)
30–35% → amarillo (atención)
> 35%  → rojo   (crítico)
```

## Panel OPS / mise — fuente única `components/ops/OpsPanel.tsx` (jul 2026)

El panel de asignación a OPS/mise (plaza → sección → recipiente → cantidad+unidad → tamaño por porción con porciones auto) vive **una sola vez** en `components/ops/OpsPanel.tsx`. Recibe `initial?: OpsInitial` (prefill) y emite `onSave(result: OpsResult)` normalizado; quién persiste depende del contexto. Lo usan `RecetaOpsSheet` (ficha del recetario, como bottom sheet), `PlatoRecetasEditor` (carta → plato, inline) y `ItemRowInline` (carta → menú/evento, inline). **No duplicar esa UI en ningún lado** — antes estaba triplicada y divergía. Las constantes `PLAZAS_OPS`/`SECCIONES_OPS` siguen viviendo en `lib/ops/mise.ts`.

## Badges / chips de estado — tinte alfa, no hex claro fijo (dark mode)

Un badge con **fondo hex claro fijo + texto hex oscuro fijo** (ej. `bg:'#eef2ff', color:'#4361a0'`) **no adapta a dark mode**: el fondo queda claro sobre el tema oscuro. Patrón correcto: fondo = **tinte alfa del color de texto** sobre `var(--surface)`/`var(--bg)` (ej. `background:'rgba(67,97,160,.12)', color:'#4361a0'`), o `${color}18` cuando el color viene de una constante. Así el badge hereda el fondo del tema y el texto sigue legible en claro y oscuro. Los colores **semánticos de estado** (food cost verde/amarillo/rojo, draft `#dc2626`, prioridades, identidad de plaza) sí pueden ser hex fijos porque son señales, no superficies. Pasó migrando `TIPO_CFG`/`TAG_CFG` de Carta y los badges de `MenusView` (ui-auditor, jul 2026).

## Idioma

Español argentino: "mise en place", "turno", "recetario", "pase", "merma", "stock", "plaza".  
No usar: "ítem" → "mise en place" | "elemento" | palabras en inglés donde haya equivalente.

## Overlay con agujero (coach mark / spotlight)

Técnica SVG con mask para oscurecer el fondo y dejar visible un elemento específico:

```tsx
<svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
  <defs>
    <mask id="mi-mask">
      <rect width="100%" height="100%" fill="white" />
      <rect x={x} y={y} width={w} height={h} rx={16} fill="black" />
    </mask>
  </defs>
  <rect width="100%" height="100%" fill="rgba(0,0,0,0.72)" mask="url(#mi-mask)" />
</svg>
```

- `x, y, w, h` vienen de `element.getBoundingClientRect()` más padding
- Agregar `data-coach-target="id"` al elemento a destacar
- Esperar mínimo 80ms (o 220ms si requiere cambio de tab) antes de llamar `getBoundingClientRect()`
- Si el elemento tiene `width: 0` (está en un tab oculto con `display: none`) → auto-skip

## FAB draggable (Pointer Events)

```tsx
function onPointerDown(e) {
  e.currentTarget.setPointerCapture(e.pointerId)  // captura touch + mouse
  // guardar startX, startY, startBottom, startRight
}
function onPointerMove(e) {
  const dx = e.clientX - dr.startX
  const dy = e.clientY - dr.startY
  if (Math.hypot(dx, dy) < 8) return  // threshold para distinguir tap de drag
  // actualizar posición
}
function onPointerUp() {
  if (dr.moved) localStorage.setItem('fab_pos', JSON.stringify({...}))
  else toggle()  // tap sin drag = abrir/cerrar
}
```

- `touchAction: 'none'` en el botón para evitar scroll accidental
- `user-select: none; -webkit-user-select: none` para evitar selección de texto

## Boards Kanban desktop — multi-select y columnas colapsables (jul 2026)

Patrones nuevos del board de Stock en Mesa de Trabajo (`espacios/components/StockBoard*.tsx`), reutilizables en cualquier board drag&drop futuro:

**Multi-select con Ctrl/Cmd+clic** — convención estándar de escritorio (Explorer/Finder/Gmail), no checkboxes visibles por default. En el `onPointerDown` de la card, si `e.ctrlKey || e.metaKey` se togglea la selección y se corta ahí (no se inicia drag); el drag normal de un solo ítem se deshabilita mientras hay selección activa, para no generar ambigüedad de gesto entre "arrastro 1" y "arrastro los N seleccionados".

**Columnas colapsables → fila de chips que envuelve, NO tiras verticales altas.** Una primera versión colapsaba cada columna a una tira vertical angosta pero de altura completa — con muchas columnas cerradas se veían como una hilera de "palitos" confusa (feedback real: "esto es confuso... arrastrar un producto... no se puede mover por fuera de la pantalla visible"). El fix correcto: las columnas colapsadas se sacan del row de scroll horizontal y se renderizan aparte, como una fila de chips (`flexWrap: 'wrap'`) que va ocupando el ancho disponible de arriba hacia abajo — expandir un chip lo saca de esa fila y restaura la columna completa en el board. IDs colapsados persistidos en `localStorage` (`..._collapsed_${RESTAURANTE_ID}`).

**Auto-scroll en los bordes durante drag** — necesario en cualquier board más ancho que la pantalla. Un loop `requestAnimationFrame` leyendo la posición del puntero desde un `ref` (no desde React state, para que siga corriendo aunque el puntero deje de moverse) mueve el `scrollLeft`/`scrollTop` del contenedor cuando el puntero está a menos de ~70px de un borde, con velocidad proporcional a la cercanía al borde.

## Loading y estado vacío — obligatorios en toda página

```tsx
if (loading) return <div>Cargando...</div>
if (items.length === 0) return <div>No hay datos todavía</div>
```

## Vistas públicas (`app/(publico)/`) — escapar el `#shell` mobile (Q1, jul 2026)

`#shell` (`globals.css`) tiene `max-width: 420px; height: 100dvh; overflow: hidden` — pensado para la app de gestión logueada. Una vista pública sin BottomNav/Coach (carta QR, y a futuro `/planes`, `/herramientas`) con contenido más largo que el viewport queda **recortada** si su layout es un `<div>` normal, porque hereda el `overflow: hidden` del ancestro.

**Fix:** el layout del route group usa `position: fixed; inset: 0; overflowY: 'auto'` — un `position: fixed` no es clippeado por el `overflow: hidden` de un ancestro (salvo que ese ancestro tenga `transform`/`filter`/`contain`, que `#shell` no tiene), así que la vista pública ocupa pantalla completa y scrollea sola, en cualquier tamaño. Ver `app/(publico)/layout.tsx`. Mismo truco que usa `app/(servicio)/layout.tsx`, pero ahí es `overflow: hidden` (scroll interno propio) en vez de `overflowY: 'auto'`.

## Vista de servicio (Salón / KDS) — reglas UI inamovibles (Fase 1, jun 2026 · actualizado Sesión 3, jul 2026)

La vista de servicio (`app/(servicio)/`) tiene UX radicalmente distinta al dashboard de gestión. Vive en su propio route group con layout sin BottomNav.

**Reglas:**
- **Botones masivos** — mínimo 64px de alto, área táctil generosa. El cocinero/mozo toca con guantes y con urgencia.
- **Swipe amplio** — las acciones principales (bump, recuperar, marchar) deben poder activarse con un swipe largo, no con un tap pequeño.
- **Alto contraste en KDS** — fondo gris muy oscuro (`#111`), texto blanco: en cocina hay mucha luz ambiental y pantallas grasientas. **Solo KDS es de fondo oscuro fijo.** **Salón sigue el tema de la app** (`var(--bg)`/`var(--surface)`/`var(--text-1)`) igual que las pantallas de gestión — se cambió en jul 2026 porque "entrar a Salón ponía toda la app en modo oscuro" (feedback del cliente). Ver "Tema por ruta" abajo.
- **CERO menús desplegables durante el despacho** — ningún `<select>`, dropdown ni modal con múltiples opciones en la pantalla de KDS o mapa de mesas activo. Todas las acciones deben ser de 1 tap o 1 swipe.
- **Fuente grande** — mínimo 18px en labels de ítem, 24px en nombres de plato.
- **Sin animaciones de entrada costosas** — el KDS recibe updates en tiempo real; las animaciones de lista bloquean taps (ver regla de "Animaciones de lista").
- **Tablet-first, no escritorio** — diseñar para pantalla 768-1024px horizontal. Desktop funciona, celular es secundario para KDS.
- **Español siempre** — labels y tooltips en español argentino, incluso los que originalmente vinieron de convenciones POS en inglés: "EN HOLD"→"EN ESPERA", "All-day"→"Consolidado", "Recall"→"Recuperar", "Bumpeado"→"Despachado", "BUMP COMANDA"→"DESPACHAR COMANDA", "FIRE"→"MARCHAR" (jul 2026, Sesión 3 C5). Excepción: "86" (marcar agotado) es jerga de cocina ya asentada en toda la app, no se traduce.

**Layout del route group + tema por ruta (jul 2026, Sesión 3 C1 · actualizado):**
- `app/(servicio)/layout.tsx` decide el tema **según la ruta** con `usePathname()`: `esKds = pathname.startsWith('/kds')`. KDS → `background: '#111'`, `color: '#fff'`, `SidebarNav dark`. **Salón** → `background: 'var(--bg)'`, `color: 'var(--text-1)'`, `SidebarNav` normal (sigue el tema de la app).
- Mobile/tablet (**<1024px**): `position: fixed; inset: 0; overflow: hidden` — ocupa toda la pantalla sin scroll global. Cada sub-vista maneja su propio scroll interno.
- **Desktop (≥1024px)**: convive con el sidebar de gestión (`SidebarNav`, en `components/shell/SidebarNav.tsx`, con `dark` prop solo para KDS). `useIsDesktop()` arma un flex-row `SidebarNav + contenido`; en mobile/tablet devuelve el `contenido` solo. El KDS/mapa sigue siendo tablet-first.

**Kitchen Coach — sí en Salón, no en KDS (jul 2026, Sesión 3 C4):**
- **Salón** (`salon/page.tsx`, vista `'mapa'` únicamente): `<KitchenCoachFAB />` montado directo (sin `UiChromeProvider` — `useSheetCount()` tiene default `0` sin provider, no hace falta envolver). Contexto (`kc_screen_context`, screen `'salon'`): mesas ocupadas/libres, cuentas con `cuenta_pedida`, total en curso (`calcularResumen(comandas).subtotal`, ya usado para el cobro). Tour propio en `lib/coach/tours.ts` (`TOURS.salon`) con targets `data-coach-target="salon-topbar"` y `"salon-mapa"`.
- **KDS**: sigue **sin** Coach FAB — distrae durante el despacho, regla inamovible sin cambios.

**Qué NO hacer:**
- No reusar el `BottomNav` de gestión en la vista de servicio.
- No mostrar el Coach FAB en pantallas de KDS (distrae durante el despacho).
- En **KDS** no usar tokens de tema — fondo oscuro fijo. En **Salón** sí usar tokens de tema (`var(--bg)`/`var(--surface)`/`var(--text-1)`/`var(--border)`); los únicos hex fijos permitidos son colores semánticos (verde listo `#2e7d32`, rojo cuenta `#a04343`, dorado propina `#c9a227`, madera mesa `#a9744f`) y el texto `#fff` **sobre botones de color** (accent/navy/rojo/verde). Texto sobre superficies siempre `var(--text-1/2/3)`.

## Editor del plano del salón — v2 con zoom/pan (Sesión 3 C3 jul 2026 · reescrito v2 jul 2026)

`app/(servicio)/salon/config/page.tsx` (tab "Mesas"): editor visual tipo Planner 5D (2D, sin 3D). El mapa real de servicio (`salon/page.tsx`, vista `'mapa'`) usa el mismo canvas.

- **`components/salon/PanZoomCanvas.tsx`** — espacio de trabajo con zoom/pan, reusado por editor y mapa real. Mundo virtual fijo (`MUNDO_W=1200 × MUNDO_H=800`) dentro de un viewport `overflow: hidden`; un div interno (`data-canvas`) con `transform: translate(x,y) scale(z)` + `transformOrigin: '0 0'`. Zoom con rueda hacia el cursor (clamp 0.3–3), pinch de 2 dedos (Pointer Events), botones flotantes `+`/`−`/`fit_screen`. Pan arrastrando el fondo vacío. `fit()` inicial en `useLayoutEffect`. Prop `toolbarExtra` para inyectar botones extra (el editor mete "Deshacer"). **Clave matemática**: los ítems draggean con `dx / canvasRect.width * 100`; como `data-canvas` es el mundo ESCALADO, `getBoundingClientRect().width = 1200*scale` → la conversión a % sigue siendo correcta con cualquier zoom, sin tocar la lógica de los ítems.
- **Las posiciones/tamaños siguen en % del mundo** (`pos_x/pos_y/ancho/alto`, 0–100) — sin migración de datos.
- **Drag/resize con estado LOCAL al ítem** (`MesaCanvasItem`/`ElementoCanvasItem`, ambos `React.memo`): el overlay de posición vive en `useState` DENTRO del ítem, no en el padre → mover una mesa **no re-renderiza el resto del plano** (arreglo del "se traba"). El ítem hace `stopPropagation` en su `onPointerDown` para no disparar el pan del canvas. Commit a DB solo al soltar (`onCommitMove`/`onCommitResize`), vía callbacks estables (`useCallback` + refs) para no romper el `memo`.
- **Updates optimistas** en `useMesas`/`useSalonElementos` (`mutate(prev => …, { revalidate: false })` antes del UPDATE) → sin "snap-back" al soltar. El overlay local se limpia con un `useEffect([mesa.pos_x, mesa.pos_y])` cuando el dato real alcanza al overlay.
- **Deshacer (Ctrl/⌘+Z + botón en la toolbar del canvas)**: pila de thunks inversos en `useRef` (máx. 50) en `EditorSalon`. Cada commit (mover, redimensionar, cambio de propiedad, crear→borrar, borrar→recrear) pushea su reverso. Arregla el "expandí algo y no puedo volver atrás".
- **Sin `minWidth`/`minHeight` px en los ítems del canvas** — el mínimo es en unidades de mundo (mesa 5%, elemento 3%); con `minWidth: 64` una mesa agrandada no se podía achicar. El handle de resize (esquina inf-der, visible al seleccionar) escala con el zoom.
- **Elementos decorativos** (`salon_elementos`: barra, caja, parrilla, planta, pared) — mismo canvas/drag/resize que las mesas, config de tipos en `lib/salon/elementos.ts` (`ELEMENTO_TIPOS`, `elementoCfg`), compartida entre editor y mapa real. No clickeables en servicio (`pointerEvents: 'none'`, solo referencia visual).
- **Sillas** (`components/salon/Sillas.tsx`): glifos top-down (asiento + respaldo) orientados hacia afuera de la mesa, derivados de `forma + capacidad + ancho/alto` (cero estado propio). Colores neutros que sirven en ambos temas.
- **Estética**: mesa sin color propio = madera `#a9744f`; header + tabs del editor usan el patrón gestión (`var(--navy)` + `SegmentedTabs onDark`).
- Columnas (`mesas.color`, tabla `salon_elementos`) documentadas en `columnas.md`.
