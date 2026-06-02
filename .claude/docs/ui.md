# UI / CSS — KitchenOS

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
