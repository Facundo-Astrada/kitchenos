# PLAN-STOCK-UX — 5 mejoras de UX de inventario (ago 2026)

> **Ejecutar con Sonnet.** Fases en orden. Cada fase termina con `npm run build` verde y commit propio.
> Archivo único de trabajo: `app/(app)/stock/ClientView.tsx` (3319 líneas).
> **No tocar** `lib/hooks/useStock.ts` ni `lib/utils.ts` — `calcEstado()` y `getEstadoStock()` los consumen el Dashboard, `components/dashboard/StockCriticoSection.tsx` y el Coach. Si se cambian, se rompen esas tres pantallas.

**Decisiones tomadas con el usuario (10-ago-2026):**
- "Crítico" se saca de **toda la pantalla Stock** (columna + chip + badge + modal + sugerencias + exports). La columna `stock_critico` **queda en la DB** y se sigue escribiendo en `0` — es lo que ya hacen todos los otros caminos de alta (facturas, recetario, importadores).
- El modal de edición va **centrado en desktop, sheet desde abajo en móvil** (el pulgar manda). Fondo translúcido + blur en ambos.

**Referencia de estado actual (para orientarse):**
- `estado` viene calculado desde `useStock` como `'ok' | 'bajo' | 'critico'` — no se toca, solo se colapsa `critico → bajo` **en la vista**.
- El botón Eliminar hoy existe **solo dentro del modal** (`~1877`), o sea que hay que hacer doble clic primero. El modal de confirmación (`~2826`) y `handleDelete()` (`~1112`) ya funcionan.
- `eliminarProducto()` es soft-delete (`activo: false`). Correcto, no cambia.

---

## F1 — Botón eliminar en la fila (30 min)

**Problema:** para borrar un producto hay que hacer doble clic → abrir el modal → buscar el botón arriba a la derecha. Tres pasos para algo que debería estar a mano.

1. **Columna Acciones** (`{isAdmin && (<td …>` con los botones de carrito y merma, `~1793-1819`). Agregar un tercer botón después del de merma:

   ```tsx
   {puedeEliminar && (
     <button
       onClick={(e) => { e.stopPropagation(); setDeleteId(p.id) }}
       aria-label="Eliminar producto"
       title="Eliminar producto"
       style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}
     >
       <span className="material-symbols-outlined" style={{ fontSize: 17, color: 'var(--text-3)' }}>delete</span>
     </button>
   )}
   ```

   `puedeEliminar` ya está desestructurado de `usePermisos()` en `~203` y **es un boolean**, no una función (verificado en `lib/hooks/usePermisos.ts:17`) — se usa directo.

2. **Bajar el `gap` del contenedor de acciones** de `8` a `6` (`~1795`) — entran tres iconos.

3. **Ensanchar la columna de acciones** en el `<colgroup>` (`~1609`):
   ```tsx
   {isAdmin && <col style={{ width: isDesktop ? '10%' : 92 }} />}
   ```
   (el ancho que se le saca a la columna Stock en F5 lo compensa).

4. **Nombrar el producto en la confirmación.** En el modal de delete (`~2826-2837`), reemplazar el texto genérico por el nombre real:
   ```tsx
   const prodAEliminar = productos.find(p => p.id === deleteId)   // arriba del return, o inline
   …
   <p style={{ … }}>
     <strong>{prodAEliminar?.nombre}</strong> se desactiva y deja de aparecer en el inventario. ¿Confirmás?
   </p>
   ```

**Verificar:** desde una cuenta sin `puede_eliminar` el icono no aparece; el clic en el tacho no dispara el `onDoubleClick` de la fila (`stopPropagation` puesto); borrar desde la fila y desde el modal dan el mismo resultado.

---

## F2 — Modal de edición centrado + fondo translúcido (30 min)

**Problema:** el modal sube desde abajo tapando la pantalla entera y con backdrop opaco al 50% — se pierde la referencia de dónde estabas.

Todo en el bloque `{/* ── Add/Edit modal ── */}` (`~1858-1876`). **Mantener el `<SheetChrome>`** que lo envuelve — es lo que oculta el FAB del Coach.

1. **Contenedor** (`~1861-1863`):
   ```tsx
   style={{
     position: 'absolute', inset: 0, zIndex: 50, display: 'flex', flexDirection: 'column',
     justifyContent: isDesktop ? 'center' : 'flex-end',
     alignItems: 'center',
     padding: isDesktop ? 24 : 0,
   }}
   ```

2. **Backdrop** (`~1865`) — translúcido de verdad, deja ver el stock detrás:
   ```tsx
   style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,.32)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
   ```

3. **Panel** (`~1866-1868`):
   ```tsx
   style={{
     position: 'relative', background: 'var(--surface)',
     borderRadius: isDesktop ? 16 : '16px 16px 0 0',
     width: isDesktop ? 'min(560px, 92vw)' : '100%',
     maxHeight: isDesktop ? '86vh' : '92%',
     display: 'flex', flexDirection: 'column',
     boxShadow: isDesktop ? '0 20px 60px rgba(0,0,0,.35)' : '0 -8px 40px rgba(0,0,0,.3)',
     border: isDesktop ? '1px solid var(--border)' : 'none',
   }}
   ```

4. **Handle de arrastre** (la barrita gris, `~1872`): envolverla en `{!isDesktop && (…)}` — en desktop no significa nada.

`isDesktop` ya está en scope (`useIsDesktop()`, `~205`).

**Fuera de alcance (no tocar en esta sesión):** los sheets de Funciones, Sugerir mínimos y Sync de precios siguen subiendo desde abajo en las dos plataformas. Si al usarlo molesta la inconsistencia, se hace después con el mismo patrón.

---

## F3 — Ordenar por la barra de Nivel (30 min)

**Problema:** la columna Nivel (desktop) muestra el % de stock contra el mínimo pero no ordena.

1. **Tipo `SortMode`** (`~102`):
   ```ts
   type SortMode = 'default' | 'valor_desc' | 'nombre_asc' | 'nombre_desc' | 'nivel_desc' | 'nivel_asc'
   ```

2. **Helper a nivel de módulo** (al lado de `valorStock`, `~152`):
   ```ts
   /** % de stock contra el mínimo. null = sin mínimo definido (no es comparable). */
   function nivelPct(p: { stock_actual: number; stock_minimo: number | null }): number | null {
     const min = p.stock_minimo ?? 0
     if (min <= 0) return null
     return p.stock_actual / min
   }
   ```

3. **Sorting en el `useMemo` de `filtered`** (`~901-907`), agregar ramas. Los productos sin mínimo van **siempre al final**, en las dos direcciones — su nivel es "—", no es ni alto ni bajo:
   ```ts
   } else if (sortMode === 'nivel_desc' || sortMode === 'nivel_asc') {
     const dir = sortMode === 'nivel_desc' ? -1 : 1
     list = [...list].sort((a, b) => {
       const na = nivelPct(a), nb = nivelPct(b)
       if (na === null && nb === null) return a.nombre.localeCompare(b.nombre, 'es')
       if (na === null) return 1
       if (nb === null) return -1
       return (na - nb) * dir
     })
   }
   ```

4. **Header clickeable** — el `<th>` "Nivel" (`~1624`), mismo patrón que el de "Producto". Primer clic = **mayor a menor**, como pidió el usuario:
   ```tsx
   {isDesktop && (
     <th
       onClick={() => setSortMode(s => s === 'nivel_desc' ? 'nivel_asc' : s === 'nivel_asc' ? 'default' : 'nivel_desc')}
       title="Ordenar por nivel de stock"
       style={{ ...thStyle, background: 'var(--navy)', textAlign: 'left', paddingLeft: 8, color: 'rgba(255,255,255,.7)', cursor: 'pointer', userSelect: 'none' }}
     >
       Nivel
       <span className="material-symbols-outlined" style={{ fontSize: 14, verticalAlign: 'middle', marginLeft: 2, color: sortMode === 'nivel_desc' || sortMode === 'nivel_asc' ? '#fff' : 'rgba(255,255,255,.35)' }}>
         {sortMode === 'nivel_asc' ? 'arrow_upward' : 'arrow_downward'}
       </span>
     </th>
   )}
   ```

**Nota:** la columna Nivel solo existe en desktop, así que este orden es desktop-only. En móvil sigue estando el botón de orden por valor en el header. No agregar nada al móvil en esta fase.

**Verificar:** los productos sin mínimo quedan al fondo en `nivel_desc` y `nivel_asc`; el tercer clic vuelve al orden por categoría+nombre; ordenar por Nivel apaga la flecha de Producto (es el mismo `sortMode`, sale gratis).

---

## F4 — Teclado que no abre en móvil (45 min) ⚠️ el más delicado

**Diagnóstico:** el número de stock hoy es un `<button>` (`~1740-1747`). Al tocarlo, `startEdit()` (`~1017`) hace `setEditingId(...)` y después `setTimeout(() => inputRef.current?.select(), 30)`. El `<input>` recién existe en el render siguiente, así que el foco se pide **fuera del call stack del gesto del usuario** — iOS Safari y Chrome Android ignoran eso y no levantan el teclado. Por eso el usuario termina yendo por el doble clic al modal.

**Fix estructural:** que el elemento que se toca **ya sea** un `<input>`. Tocar un input real abre el teclado nativo, sin trucos.

1. **`startEdit`** (`~1017-1021`) — sin `setTimeout`, ya no hace falta:
   ```ts
   function startEdit(p: ProductoConEstado) {
     setEditingId(p.id)
     setEditValue(String(p.stock_actual))
   }
   ```
   El `inputRef` (`~284`) queda sin uso: borrarlo.

2. **Celda de stock** (`~1721-1749`) — reemplazar el ternario `editingId === p.id ? <input> : <button>` por **un solo input siempre montado**:
   ```tsx
   <div style={{ width: 78, display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: 3, flexShrink: 0 }}>
     <input
       type="text"
       inputMode="decimal"
       readOnly={!canEdit}
       value={editingId === p.id ? editValue : String(p.stock_actual)}
       onFocus={e => { if (canEdit) { startEdit(p); e.currentTarget.select() } }}
       onChange={e => setEditValue(e.target.value)}
       onBlur={() => { if (editingId === p.id) commitEdit(p.id) }}
       onKeyDown={e => {
         if (e.key === 'Enter') e.currentTarget.blur()
         if (e.key === 'Escape') { cancelEdit(); e.currentTarget.blur() }
       }}
       onClick={e => e.stopPropagation()}
       title="Tocá para editar stock"
       style={{
         width: 54, textAlign: 'right', padding: '3px 4px',
         // 16px en móvil: por debajo de eso iOS hace zoom automático al enfocar
         fontSize: isDesktop ? 14 : 16,
         fontWeight: 800, fontFamily: "'DM Mono', monospace", lineHeight: 1.1,
         color: editingId === p.id ? '#fff' : (p.estado !== 'ok' ? '#d97706' : 'var(--text-1)'),
         background: editingId === p.id ? 'var(--navy)' : 'transparent',
         border: editingId === p.id ? '1px solid rgba(255,255,255,.3)' : '1px solid transparent',
         borderRadius: 6, outline: 'none',
         cursor: canEdit ? 'pointer' : 'default',
       }}
     />
     <span style={{ fontSize: 9, color: 'var(--text-3)', flexShrink: 0 }}>{p.unidad_uso ?? p.unidad}</span>
   </div>
   ```
   Detalles que importan:
   - La unidad (`kg`, `L`) **no puede vivir dentro del input** → pasa a ser un `<span>` hermano.
   - Sin borde ni fondo cuando no está en edición: sigue leyéndose como texto, no como formulario.
   - `onKeyDown` Enter dispara `blur()` en vez de llamar a `commitEdit` directo — así no se guarda dos veces (blur ya commitea).
   - El color `#d97706` (ámbar) reemplaza al rojo de crítico, coherente con F5.

3. **Mismo tratamiento al editor de mínimo.** El editor de umbrales (`~1755-1785`) usa `autoFocus` sobre un input que se monta después del clic → mismo problema. Con F5 queda **un solo campo (mín)**, así que se resuelve igual: input siempre montado, `onFocus` abre la edición, `onBlur` guarda. Ver F5 punto 5 — conviene hacer las dos cosas en la misma pasada.

4. **No tocar el modo Stockear** (`~2552-2565): ya lo resuelve bien con `autoFocus` + `onPointerDown` con `preventDefault()` en los botones de navegación, que mantiene el foco en el input y el teclado abierto. Es la referencia de cómo se hace bien en este proyecto.

**Verificar en el celular contra el dev server por LAN** (no en prod): un toque en el número abre el teclado numérico; el valor queda seleccionado; tocar afuera guarda; el doble tap en el resto de la fila sigue abriendo el modal; en desktop no cambió nada.

---

## F5 — Sacar "crítico" de toda la pantalla Stock (1 h)

**Regla que gobierna toda la fase:** el umbral crítico desaparece de la interfaz; el mínimo es el único umbral. Todo lo que hoy renderiza `estado === 'critico'` pasa a leerse como **BAJO** (ámbar `#d97706` / `#f59e0b`). En la DB `stock_critico` sigue existiendo y se escribe en `0`.

### 5.1 — Filtros y contadores

1. **`FiltroEstado`** (`~86`): sacar `'critico'` →
   `type FiltroEstado = 'all' | 'bajo' | 'pendiente' | 'inmovil' | 'unidad'`
2. **Chip "Crítico" del header** (`~1221-1228`): **borrar el botón entero**. ⚠️ Antes de borrarlo, **mover `data-coach-target="stock-kpis"` al chip de "Bajo"** — si se pierde, el tour del Coach queda apuntando a la nada.
3. **Chip "Bajo"** (`~1229-1235`): el contador pasa a ser `nAlerta` (críticos + bajos), que es lo que el usuario entiende por "bajo el mínimo".
4. **Filtro en `filtered`** (`~891-893`): `'bajo'` tiene que matchear los dos estados internos:
   ```ts
   } else if (estadoFilter === 'bajo') {
     list = list.filter(p => p.estado !== 'ok')
   } else if (estadoFilter !== 'all') {
     list = list.filter(p => p.estado === estadoFilter)
   }
   ```
5. **Contadores** (`~924-927`): borrar `nCritico`. `nAlerta` (`~1207`) pasa a ser `productos.filter(p => p.estado !== 'ok').length` — mismo número que antes, calculado en un solo lugar. Revisar que `nCritico` no quede en el array de dependencias del `useEffect` del Coach (`~958`).

### 5.2 — Contexto del Coach (`~929-958`)

Nadie lee la clave `criticos` del `kc_screen_context` desde código (verificado: `app/api/coach/route.ts` calcula lo suyo contra la DB, y `CoachPanelContent.tsx` también) — solo la lee el LLM como JSON. Se puede renombrar sin romper nada:
```ts
const bajoMinimo = productos
  .filter(p => p.estado !== 'ok')
  .map(p => ({ nombre: p.nombre, stock: p.stock_actual, minimo: p.stock_minimo, unidad: p.unidad }))
  .slice(0, 8)
```
En el `localStorage.setItem`: reemplazar `criticos` y `bajos` por `bajoMinimo` + `nBajoMinimo: nAlerta`. Y en `categoriasEnRiesgo` (`~938-941`), el filtro pasa a `p.estado !== 'ok'`.

### 5.3 — Tabla

6. **Badge de estado** (`estadoBadge`, `~1171-1187`): borrar la rama de `'critico'` (`~1178-1180`). La de `'bajo'` pasa a ser `if (p.estado !== 'ok')`. Quedan cuatro badges: Fuera de uso · Pendiente · Bajo · OK.
7. **Color de la barra de Nivel** (`~1700`): `const barColor = p.estado !== 'ok' ? '#d97706' : '#10b981'`.
8. **Color del número de stock**: ya resuelto en F4 punto 2.
9. **Icono del carrito** (`~1804`): `p.estado !== 'ok' ? 'var(--accent)' : 'var(--text-3)'`.
10. **Línea de umbrales en pantalla angosta** (`~1679-1684`): dejar solo `mín`, borrar el `<span>` de `crít`.

### 5.4 — Editor inline de umbrales (junto con F4 punto 3)

11. **Estado `editThr`** (`~287`): `useState<{ id: string; min: string } | null>(null)` — se va `crit`.
12. **`guardarUmbrales`** (`~288-297`): `await actualizarProducto(editThr.id, { stock_minimo: min })` — se va el `stock_critico`.
13. **Bloque mín/crít** (`~1755-1785`): un solo input, siempre montado (mismo patrón que F4):
    ```tsx
    {!isNarrow && (
      <div style={{ width: 52, textAlign: 'left', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
        <span style={{ fontSize: 9.5, color: 'var(--text-3)', fontFamily: "'DM Mono', monospace" }}>mín </span>
        <input
          type="text"
          inputMode="decimal"
          readOnly={!canEdit}
          value={editThr?.id === p.id ? editThr.min : String(p.stock_minimo ?? 0)}
          onFocus={e => { if (canEdit) { setEditThr({ id: p.id, min: String(p.stock_minimo ?? 0) }); e.currentTarget.select() } }}
          onChange={e => setEditThr(t => t && { ...t, min: e.target.value })}
          onBlur={() => { if (editThr?.id === p.id) guardarUmbrales() }}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setEditThr(null); e.currentTarget.blur() } }}
          title="Tocá para editar el mínimo"
          style={{
            width: 32, textAlign: 'left', padding: '1px 2px',
            fontSize: isDesktop ? 10 : 16,   // 16 en móvil: evita el zoom de iOS
            fontWeight: 700, fontFamily: "'DM Mono', monospace", color: '#d97706',
            background: editThr?.id === p.id ? 'var(--bg)' : 'transparent',
            border: `1px solid ${editThr?.id === p.id ? 'var(--border)' : 'transparent'}`,
            borderRadius: 5, outline: 'none', cursor: canEdit ? 'pointer' : 'default',
          }}
        />
      </div>
    )}
    ```
    Se va el botón de check verde: el blur guarda. Con el input de 16px en móvil, revisar que la fila no crezca de alto — si crece, bajar el `padding` vertical de la celda antes que el `fontSize`.

14. **Anchos del `<colgroup>`** (`~1607-1609`): la sub-columna de umbrales pasa de 84px a ~52px. Ajustar la columna Stock a `isDesktop ? '14%' : isNarrow ? 64 : 84` y darle el resto a Acciones (F1 punto 3).

### 5.5 — Modal de alta/edición

15. **`FormData`** (`~110`) y **`FORM_EMPTY`** (`~130`): sacar `stock_critico`.
16. **`openEdit`** (`~1051`): sacar la línea `stock_critico: String(p.stock_critico)`.
17. **Input "Stock crítico"** (`~2017`): borrar el `<label>` entero. El grid de dos columnas que lo contiene queda con un solo campo (Stock mínimo) — pasar ese contenedor a una sola columna o dejar el mínimo junto al stock actual.
18. **`handleSave`** (`~1087`): `stock_critico: 0` fijo.

### 5.6 — Sugerir mínimos

19. **Línea "crít" de cada sugerencia** (`~2737`): borrarla.
20. **`aplicarSugerencias`** (`~741`): `await actualizarProducto(s.id, { stock_minimo: s.sugerido_minimo, stock_critico: 0 })`.
21. El tipo local `Sugerencia` (`~659`) puede conservar `sugerido_critico` (viene en la respuesta de la API) o quitarlo — si se quita, quitarlo también del destructuring donde se arma. La API `app/api/stock/sugerir-minimos/route.ts` **no se toca**: su filtro de candidatos (`stock_minimo === 0 && stock_critico === 0`) sigue siendo correcto.

### 5.7 — Exports y modo Stockear

22. **PDF** (`~1153-1154`): `p.estado === 'critico' ? 'CRÍTICO' : …` → `p.estado !== 'ok' ? 'BAJO' : 'OK'`.
23. **XLSX** (`~1198`): borrar la fila `'Stock crítico': p.stock_critico`.
24. **Tarjeta del modo Stockear** (`~2534-2535`): borrar el badge CRÍTICO; el de BAJO pasa a `p.estado !== 'ok'`.
25. **Preview de import de planilla** (`~3266-3267`): borrar el `<p>` de "Crít".
26. **`sortByEstado`** (`~961-965`): dejar como está. El mapa `{critico:0, bajo:1, ok:2}` sigue funcionando y pone lo más urgente primero en el recorrido de Stockear.

### Fuera de alcance de F5 (dejar como está, anotar en SESION.md)

- `app/api/stock/import-planilla/route.ts` sigue leyendo una columna "Crítico" del Excel y escribiendo `stock_critico`. Es inofensivo — llena un campo que ya no se muestra — y sacarlo implica tocar el prompt de la IA de importación. Se evalúa en otra sesión.
- El **Dashboard** sigue mostrando "CRÍTICO" contra `stock_critico`. Como todos los productos nuevos y editados quedan en `stock_critico = 0`, con el tiempo ese contador va a tender a 0 y solo marcará productos en stock cero. **Es el efecto esperado de la decisión**, pero conviene mirarlo después de unos días de uso y decidir si el Dashboard también se colapsa a un solo umbral.

---

## Cierre

```bash
npm run build     # typecheck + compilación, verde obligatorio
npm run lint
```

Probar en el celular por LAN antes de deployar (F4 no se puede validar en desktop). Después `/pr-review` y `/deploy`, y `/update-status` para cerrar la sesión.

**Checklist de aceptación:**
- [ ] Tacho de eliminar visible en cada fila (solo con permiso), confirmación con el nombre del producto
- [ ] Modal de edición centrado en desktop con el stock visible detrás; sheet desde abajo en móvil
- [ ] Clic en el header "Nivel" ordena de mayor a menor; segundo clic invierte; tercero vuelve al orden por defecto
- [ ] Un toque en el número de stock desde el celular abre el teclado numérico, sin pasar por el modal
- [ ] No queda ninguna mención a "crítico" en la pantalla Stock: ni chip, ni badge, ni columna, ni modal, ni sugerencias, ni exports
- [ ] Dashboard, `StockCriticoSection` y el Coach siguen compilando y funcionando (no se tocó `useStock.ts` ni `lib/utils.ts`)
