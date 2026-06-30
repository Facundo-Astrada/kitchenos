# UI / CSS — KitchenOS

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
