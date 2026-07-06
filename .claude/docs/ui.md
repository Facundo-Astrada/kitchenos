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

## Loading y estado vacío — obligatorios en toda página

```tsx
if (loading) return <div>Cargando...</div>
if (items.length === 0) return <div>No hay datos todavía</div>
```

## Vista de servicio (Salón / KDS) — reglas UI inamovibles (Fase 1, jun 2026)

La vista de servicio (`app/(servicio)/`) tiene UX radicalmente distinta al dashboard de gestión. Vive en su propio route group con layout sin BottomNav ni Coach FAB.

**Reglas:**
- **Botones masivos** — mínimo 64px de alto, área táctil generosa. El cocinero/mozo toca con guantes y con urgencia.
- **Swipe amplio** — las acciones principales (bump, recall, fire) deben poder activarse con un swipe largo, no con un tap pequeño.
- **Alto contraste** — fondo negro (`#000`) o gris muy oscuro (`#111`), texto blanco. En cocina hay mucha luz ambiental y pantallas grasientas.
- **CERO menús desplegables durante el despacho** — ningún `<select>`, dropdown ni modal con múltiples opciones en la pantalla de KDS o mapa de mesas activo. Todas las acciones deben ser de 1 tap o 1 swipe.
- **Fuente grande** — mínimo 18px en labels de ítem, 24px en nombres de plato.
- **Sin animaciones de entrada costosas** — el KDS recibe updates en tiempo real; las animaciones de lista bloquean taps (ver regla de "Animaciones de lista").
- **Tablet-first, no escritorio** — diseñar para pantalla 768-1024px horizontal. Desktop funciona, celular es secundario para KDS.
- **Layout del route group:** `app/(servicio)/layout.tsx` es `position: fixed; inset: 0; background: #111; overflow: hidden` — ocupa toda la pantalla sin scroll global. Cada sub-vista maneja su propio scroll interno.

**Qué NO hacer:**
- No reusar el `BottomNav` de gestión en la vista de servicio.
- No mostrar el Coach FAB en pantallas de KDS (distrae durante el despacho).
- No usar `var(--navy)` como fondo — es para gestión. En servicio usar negro/gris oscuro.
