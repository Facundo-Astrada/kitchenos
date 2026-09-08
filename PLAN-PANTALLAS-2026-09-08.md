# Plan de pantallas — 08/09/2026 (tarde)

Once observaciones de Facundo sobre Inicio, tema oscuro, Mesa de trabajo, Turnos, Carta,
Merma, Reportes, Presupuesto, Limpieza y Calendario/Bitácora.
**Investigado en Opus, se ejecuta en Sonnet.**

Dos hallazgos que no estaban en la lista y aparecieron investigando:

1. **Categorías de Carta duplicadas en Bros comedor** (cliente real). Es la barra que Facundo
   marcó en verde: no es solo la scrollbar, las categorías están dos veces. Bug de datos.
2. **`turnos` ya tiene `hora_entrada`, `hora_salida` y `notas` en la base** y la UI no los usa.
   El rediseño de Turnos no necesita migración: los datos que faltan ya tienen columna.

Orden de ejecución: Bloque 0 → 8. Cada bloque cierra con `npm run build` + commit + push.
El Bloque 8 va último **a propósito** (ver su nota).

---

## Bloque 0 — Los arreglos de un renglón (todo junto, un deploy)

Cuatro cosas chicas que no dependen de nada y sacan ruido de encima.

### 0.1 · Inicio: el calendario al panel grande, sin banners de plata

`app/(app)/DashboardClientView.tsx`.

**Desktop** (`isDesktop`, grid `320px 1fr`):
- Sacar `<ProximosDias />` de la columna izquierda (línea ~331).
- Sacar `{rol === 'admin' && <CuentasPorPagarCard ... />}` (línea ~356).
- Sacar `{rol === 'admin' && <IngresosBanner embedded />}` del panel derecho (línea ~366).
- El panel derecho abre con **Próximos días** en ancho completo y debajo Stock crítico.

**Mobile:**
- Sacar `<PendientesDelNegocio />` (línea ~476) — envuelve los mismos dos banners.
- `<ProximosDias />` se queda donde está: en 400px de ancho la franja de 5 chips funciona.

**Código muerto que queda:** `CuentasPorPagarCard` y `PendientesDelNegocio` quedan sin usar
en el archivo. **Borrarlos**, no dejarlos comentados (son ~100 líneas). `IngresosBanner` sigue
vivo: lo usa `/pedidos`.

**Mejora sobre lo pedido — la variante de panel.** La franja actual es un teaser de 5 chips de
~90px: estirada a 1000px de ancho queda ridícula, y ya hoy los títulos se cortan
("a 1994 –", "rlo #4"). En el panel grande no alcanza con mover el componente, hay que darle
una segunda densidad:

- `ProximosDias` recibe `variant?: 'strip' | 'panel'` (default `'strip'` = lo de hoy).
- `variant="panel"`: `useProximosDias(7)` (el hook ya toma la cantidad de días),
  7 columnas, cada una lista **todos** sus eventos como filas legibles — icono + título
  completo + hora si la tiene — con la columna de hoy en `var(--navy)`.
- Un solo componente con dos ramas de render. No duplicar archivo.

**Lo que se pierde y qué proponemos hacer.** Sacando los dos banners, nada en la app avisa que
una factura venció hasta que alguien abre Compras. Es una decisión de producto, no técnica, así
que **no lo hacemos por default**. Si Facundo quiere la señal sin el banner: badge con el conteo
de vencidas sobre "Compras" en `SidebarNav.tsx`. Queda ofrecido, no incluido.

### 0.2 · Carta: la scrollbar que se ve

`app/(app)/carta/page.tsx:926`. La fila de filtros es la única del header con
`overflowX: 'auto'` y **sin** `scrollbarWidth: 'none'` — las otras dos filas del mismo header
(utilidades, línea ~880) sí lo tienen. Ya existe la clase `.hide-scrollbar` en
`app/globals.css:202`.

```tsx
<div data-coach-target="carta-filtros" className="hide-scrollbar" style={{ ... }}>
```

Después: barrer `grep -rn "overflowX: 'auto'"` en `app/` + `components/` y ponerle la clase a
todas las filas de chips/tabs que no la tengan. Son fondos con scroll horizontal: ninguna
debería mostrar barra.

**Mejora:** con la barra oculta se pierde el aviso de que hay más a la derecha. Agregar la
máscara de degradado en los bordes (`mask-image: linear-gradient(...)`) — mismo recurso que ya
se usó en la tabla de Polivalencia, CSS puro, sin JS.

### 0.3 · Carta: las categorías duplicadas (bug de datos, cliente real)

Verificado contra producción:

```sql
select restaurante_id, nombre, count(*) from carta_categorias group by 1,2 having count(*)>1;
-- Bros comedor: Entradas, Principales, Postres, Bebidas, Guarniciones, Cafetería, Brunch — 2 c/u
```

**Causa.** `lib/hooks/useCarta.ts:109` `fetchCartaCategoriasData`: si la tabla viene vacía,
siembra las categorías por defecto. Sin candado. Dos montajes simultáneos (o una revalidación
de SWR que pisa a la carga inicial) siembran dos veces. Es la **misma clase de bug** que el de
`/api/invitar` de esta mañana: falta el índice único que haría imposible el duplicado.

**Qué se hace:**

a) Migración `supabase/migrations/20260908_carta_categorias_unicas.sql`:
   - Borrar duplicados dejando el `id` más viejo por `(restaurante_id, nombre)` — antes,
     repuntar `carta_items.categoria` no hace falta (guarda el **nombre**, no el id: verificado).
   - `create unique index if not exists carta_categorias_rest_nombre_uniq
     on public.carta_categorias (restaurante_id, nombre);`

b) `fetchCartaCategoriasData` siembra con `.upsert(inserts, { onConflict: 'restaurante_id,nombre',
   ignoreDuplicates: true })` y re-lee. Con el índice arriba, `onConflict` ya funciona.

c) Después de la migración: `NOTIFY pgrst, 'reload schema'`.

### 0.4 · El FAB del Coach tapa la última tarjeta de Stock crítico

Visible en las capturas de Inicio: el botón naranja se come "Cafe la virgina…". El grid de
Stock crítico del panel derecho necesita `paddingRight` suficiente para el FAB, o el FAB
necesita respetar el mismo colchón que respeta en mobile. Revisar `KitchenCoachFAB.tsx` y el
grid de `DashboardClientView.tsx:378`.

---

## Bloque 1 — Modo oscuro: el token que tiene dos trabajos

**Lo que se ve:** todo lo azul se vuelve gris claro con texto blanco encima. Header, sidebar,
botón "Iniciar turno", el chip del día de hoy.

**La causa, exacta.** `--navy` tiene **dos roles a la vez**, y `DESIGN.md §3` lo escribe así sin
darse cuenta: *"Autoridad: headers, texto fuerte, el chrome del sistema"*.

- Como **chrome**: `background: var(--navy)` con `color: '#fff'` encima. Tiene que ser oscuro
  en los dos temas. **200 usos.**
- Como **tinta**: `color: var(--navy)` para links y números fuertes. Tiene que invertirse en
  oscuro. **85 usos** (+2 en Tailwind `text-[var(--navy)]`).

En `globals.css:54`, `[data-theme="dark"]` pone `--navy: #c8d6e5`. Correcto para la tinta,
catastrófico para el chrome: los 200 fondos se vuelven celestes con letra blanca. Y
`html, body { background: var(--navy) }` (línea 89) pinta el fondo de toda la app de celeste.

**DESIGN.md dice "Dark mode ya resuelto en `[data-theme="dark"]`". No lo está.** Se corrige
la línea en el mismo commit.

### Etapa A — partir el token (esto es el arreglo)

En `app/globals.css`:

```css
:root {
  --navy: #1c2d4a;      /* CHROME: fondo oscuro. Siempre lleva #fff encima. */
  --navy-ink: #1c2d4a;  /* TINTA: texto/acento fuerte sobre fondo claro. */
}
[data-theme="dark"] {
  --navy: #12161f;      /* sigue siendo el fondo oscuro — no se invierte */
  --navy-ink: #c8d6e5;  /* la tinta sí se invierte */
  --accent: #7c9ede;    /* #4361a0 sobre #0a0a0a da ~3.4:1 — no llega para texto */
}
```

Migración mecánica, archivo por archivo (105 archivos tocan `--navy`):

| Patrón | Acción |
|---|---|
| `color: 'var(--navy)'` (85) | → `var(--navy-ink)` |
| `text-[var(--navy)]` (2) | → `text-[var(--navy-ink)]` |
| `background: 'var(--navy)'` (200) | **no se toca** |
| `linear-gradient(..., var(--navy), ...)` (23) | **no se toca** (son fondos) |
| `border: '1px solid var(--navy)'` | caso por caso: borde de una card clara → `--navy-ink` |
| ternarios `activo ? 'var(--navy)' : ...` (~85) | **manual**: mirar si la prop es `color` o `background` |

Cuidado con el patrón que aparece en todos los tabs sobre header navy:
`color: tab === t ? 'var(--navy)' : 'rgba(255,255,255,.7)'` sobre `background: '#fff'`.
Ese es **tinta sobre pastilla blanca** → `--navy-ink`. Es el caso que más se repite y el más
fácil de errarle.

**Verificación:** `/shot` en oscuro sobre Inicio, Mesa de trabajo, Turnos, Carta, Limpieza,
Reportes, Calendario y Compras. Buscar cualquier cosa clara con texto blanco.

### Etapa B — los pasteles de estado → Bloque 8

`#fef2f2`, `#fffbeb`, `#fee2e2`, `#dbeafe`, `#f0fdf4` con su texto oscuro (`#991b1b`,
`#92400e`, `#166534`) siguen claros en oscuro. Son ~1567 hexes literales en total en el repo, así
que no se migran a mano ni de golpe. Va aparte, y **al final** (ver Bloque 8).

---

## Bloque 2 — Merma en modal centrado (y el barrido de sheets)

**Ya existe el componente que Facundo pide:** `components/ui/Modal.tsx` — centrado con fondo
translúcido y blur en desktop, sheet desde abajo en mobile, cierre con Escape y click afuera,
`useSheetOpenWhen` adentro (esconde el FAB del Coach). Esto no es construir, es migrar.

### 2.1 · Merma

`components/merma/MermaBottomSheet.tsx:107` — reemplazar el backdrop + contenedor a mano por
`<Modal open={open} onClose={onClose} maxWidth={560}>`. Sacar el `useSheetOpenWhen` propio
(Modal ya lo llama). El contenido del formulario no se toca.

### 2.2 · El barrido

`grep` encuentra **47 sheets a mano en 30 archivos**. No todas son lo mismo:

**Migrar a `<Modal>` — son formularios/diálogos:**
`components/ops/CrearTareaSheet.tsx` · `components/ops/PaseSheet.tsx` ·
`components/ops/ProduccionSheet.tsx` · `components/rutina/RutinaItemSheet.tsx` ·
`components/mise/NotaItemSheet.tsx` · `components/pedidos/SugerenciaCompraSheet.tsx` ·
`components/produccion/SugerenciaProduccionSheet.tsx` ·
`app/(app)/espacios/components/LimpiezaPanel.tsx` ·
`app/(app)/recetario/[id]/IngredienteOpsSheet.tsx` + `RecetaOpsSheet.tsx` ·
`app/(app)/turnos/page.tsx` (editar fichaje) ·
`app/(app)/DashboardClientView.tsx` (notificaciones + cierre de turno) ·
las 3 copias viejas del patrón que ya estaban anotadas en `PENDIENTES.md`
(calendario, stock, checklist).

**Se quedan a pantalla completa — son editores, no diálogos:**
`carta/ComposicionEditor.tsx` · `carta/ImportCartaModal.tsx` ·
`components/facturas/BulkUploadDrawer.tsx` · `components/ops/RecetaDrawer.tsx` ·
`salon/*` y `kds/*` (registro Servicio: `DESIGN.md §2`, no se tocan).

Si son muchas para una tanda, cortar por la mitad: primero las que se abren desde pantallas de
uso diario (Merma, OPS, Rutina, Mise), el resto después.

**Mejora — que no vuelva a pasar.** Agregar al lint de diseño (`DESIGN.md §8`) un grep de
`borderRadius: '20px 20px 0 0'` / `'18px 18px 0 0'` / `'16px 16px 0 0'` fuera de
`components/ui/Modal.tsx`. Presupuesto: 0 fuera del componente (menos la lista de editores de
arriba, que se declara como excepción).

---

## Bloque 3 — Limpieza: diagramar la semana, ver el día, tildar

Es `/haccp` → tab **Limpieza** (`app/(app)/haccp/page.tsx:1102`). Hoy hay dos sub-tabs:
**Lista** (agrupada por área, con un tilde que marca la tarea entera) y **Calendario** (grilla
mensual, **de solo lectura**). Falta exactamente lo que Facundo pide: ver el día, diagramar la
semana, y tildar por día.

**El dato clave ya está.** `haccp_limpieza_registros` tiene `fecha` de tipo `date`,
`completado` y `observacion`, con RLS correcta (scope vía `limpieza_id`). `useHaccp` ya lo
**trae** (`limpiezaRegistros`, limit 200) y **la UI nunca lo usa**: solo mira
`haccp_limpieza.ultimo_registro`, que es un único timestamp global por tarea. Por eso hoy no
se puede tildar "el martes" — se puede tildar "la tarea", y punto.

### 3.1 · Bug a arreglar primero

`lib/hooks/useHaccp.ts:376` — `registrarLimpieza` inserta `new Date().toISOString()` en una
columna `date`. Postgres castea a la fecha **UTC**: después de las 21:00 de Argentina, una
limpieza queda registrada al día siguiente. Usar `hoyOperativo()` de `lib/ops/turnos.ts`,
que es lo que usa el resto de la app.

### 3.2 · Tres vistas en vez de dos

`Hoy` (default) · `Semana` · `Todas`.

**Hoy** — lo que hay que hacer y nada más. Filtra con `limpiezaTocaFecha(l, hoy)`
(`lib/haccp/recurrencia.ts`, ya existe y es la fuente única que comparten HACCP, Mise y OPS).
Agrupado por área, checkbox de ≥56px (`DESIGN.md §7`), tildado optimista con undo de 5s
(§7: undo antes que confirmación). Contador arriba: "6 de 9 hechas".

**Semana** — el diagrama. Grilla `área × 7 días`. Cada celda lista las tareas que tocan ese
día; cada tarea se tilda **para esa fecha** (`upsert` en `haccp_limpieza_registros` por
`(limpieza_id, fecha)`). Días pasados sin registro: en ámbar, no en rojo — `DESIGN.md §9`,
el desvío se pinta sobre la tarea, nunca sobre la persona. Hoy con la columna resaltada.
Navegación semana anterior/siguiente + botón "Esta semana".

**Todas** — el catálogo actual (la Lista de hoy), con editar además de borrar.

**El calendario mensual se saca.** Es de solo lectura y "Semana" lo reemplaza mejor. Si hace
falta la vista mensual, va en `/calendario`, que ya existe para eso.

### 3.3 · Agregar limpiezas

`NuevaTareaLimpiezaView` pasa de vista a pantalla completa → `<Modal>` (Bloque 2). Área con
autocompletado de las áreas ya cargadas en vez de texto libre — hoy cada tipeo distinto crea un
grupo nuevo.

**La única migración del bloque.** `haccp_limpieza.dia_semana` es un `integer`: una tarea
semanal toca **un solo día**. "Campana los lunes y jueves" hoy son dos tareas separadas. Para
diagramar de verdad una semana hace falta:

```sql
alter table public.haccp_limpieza add column if not exists dias_semana smallint[];
update public.haccp_limpieza set dias_semana = array[dia_semana]
  where dia_semana is not null and dias_semana is null;
```

`dia_semana` se deja donde está (lo lee OPS y el sync a `checklist_rutina`) y
`limpiezaTocaFecha` pasa a mirar `dias_semana ?? [dia_semana]`. Aditivo, sin romper nada.
Después: `NOTIFY pgrst, 'reload schema'`.

### 3.4 · Cargar los registros de la semana visible

`fetchHaccpData` trae los últimos 200 registros sin filtrar por fecha. Con la vista Semana hay
que traer los de la semana en pantalla: agregar `.gte('fecha', lunes).lte('fecha', domingo)`
en una consulta aparte, no ampliar el limit.

---

## Bloque 4 — Turnos: de tabla a planilla de verdad

Lo que hay hoy (`app/(app)/turnos/page.tsx:230`): un `<table>` con la fila etiquetada
`Fra.G`, celdas de 44px con una letra (`M`/`T`/`N`/`F`/`V`), y `+` punteados en todas las
vacías. En desktop se estira a todo el ancho y quedan 7 cajitas perdidas en 1200px. Sin
leyenda: nadie sabe qué es "N". Para poner "noche" hay que clickear ciclando la celda 3 veces
a ciegas.

**El hallazgo que cambia el diseño:** `turnos` ya tiene **`hora_entrada`, `hora_salida` y
`notas`** en la base, y la UI **no los escribe ni los lee**. Y las horas semanales están
hardcodeadas a 8h por turno (`HOURS` en la línea ~277). O sea: la planilla puede mostrar
rangos horarios reales y sumar horas reales **sin ninguna migración**. Eso es lo que separa
una grilla de letras de una planilla de turnos.

### Rediseño

**Fila = persona.** `<Avatar>` (ya existe en `components/ui/`) + nombre completo + chip del
puesto (sale de `useEquipo`, es el mismo dato que usa la carta de Organigrama). Se acabó el
`Fra.G`.

**Columna = día.** Día + fecha, hoy resaltado con sombreado suave (no un bloque pesado), y
debajo del encabezado la **cobertura**: "3 personas · 24h". Eso es lo que un jefe de cocina
mira primero y hoy no está en ningún lado.

**Celda = bloque de turno**, no una letra: fondo del color del tipo (`TURNO_CONFIG` ya trae
`color` + `bg`) y el rango horario adentro ("09–17"). Vacías: quietas, sin borde punteado —
el `+` aparece al hover/tap. Hoy los 63 cuadros punteados son puro ruido visual.

**Asignar = picker, no ciclo.** Tap en la celda → popover con los 5 tipos + campos de hora
(precargados con el horario por defecto del tipo). Long-press para limpiar se mantiene.

**Totales.** Columna derecha: horas de la semana calculadas de `hora_entrada`/`hora_salida`
con fallback a 8h si están vacías. Fila inferior: total por día.

**Copiar la semana anterior.** Un botón. Es la función que más se usa en cualquier planilla de
turnos real y es un `insert` de las filas de `weekOffset - 1` con las fechas corridas 7 días.
Alto valor, costo bajo.

**Leyenda** de los 5 tipos, fija arriba de la grilla.

**Desktop:** ancho máximo (~980px), primera columna y encabezado pegajosos, zebra en las filas.
**Mobile:** la tabla de 9 columnas no entra. Un día por pantalla con swipe entre días
(y chevrons visibles — `DESIGN.md §7`: el gesto nunca es la única vía), listando las personas
de ese día.

**Cuidado con el tono.** Hoy `total > 48` pinta el número en **rojo** en la fila de una
persona. `DESIGN.md §9` prohíbe rojo sobre personas. Pasa a **ámbar** sobre el número, con
tooltip "más de 48h semanales" — es un dato laboral, no una nota de conducta.

Referencias consultadas para las convenciones de arriba (fila por persona, color por tipo de
turno, resaltado suave de hoy, swipe en mobile, una vista por densidad):
[Eleken — Calendar UI examples + UX tips](https://www.eleken.co/blog-posts/calendar-ui) ·
[Everhour — shift scheduling best practices](https://everhour.com/blog/how-to-schedule-shifts/) ·
[myshyft — work roster](https://www.myshyft.com/glossary/work-roster/) ·
[Dribbble — shift scheduling](https://dribbble.com/tags/shift-scheduling).

---

## Bloque 5 — Mesa de trabajo: color y tarjetas

Hoy (`app/(app)/espacios/components/`) todo es `var(--surface)` sobre `var(--bg)` con iconos
en `var(--text-3)`. Cuatro columnas de acordeones anidados, todas iguales. Lo único con color
es el badge SP/P/REF/OK de `ProduccionRow`.

**El sistema de color ya existe y esta pantalla no lo usa.** `lib/constants.ts:15`:

```ts
export const PLAZA_COLORS: Record<Plaza, string> = {
  parrilla: '#ef4444', frios: '#0ea5e9', calientes: '#f97316',
  pase: '#8b5cf6', pasteleria: '#ec4899', panaderia: '#84cc16', general: '#2563eb',
}
export function plazaColor(key, custom) { ... }   // ya soporta plazas custom
```

`plazaColor()` está escrito, cubre las custom, y Mesa de trabajo no lo llama ni una vez. Ese es
el 80% del pedido de Facundo, gratis.

### Qué se hace

**Espacio (`EspacioCard.tsx`)** → tarjeta con banda de encabezado: icono grande, nombre, y una
fila de stats al estilo del `Stat` de `MiembroCard` — plazas, producciones, secciones.
`--shadow-2`, radio 16.

**Plaza (`PlazaRow.tsx`)** → columna con **identidad de color**: regla superior de 3px en
`plazaColor()`, icono y nombre en ese color, chip de conteo con el color al 12% de fondo.
De un vistazo se distingue Parrilla de Fríos sin leer.

**Sección (`SeccionRow.tsx`)** → tarjeta con encabezado teñido según `seccion.tipo`
(heladera / freezer / almacén / secos), que hoy solo cambia el icono. Mapa nuevo de tipo→color
en `lib/constants.ts`, junto a `PLAZA_COLORS` — no hexes sueltos en el componente
(`DESIGN.md §3`).

**Producción (`ProduccionRow.tsx`)** → el badge de prioridad ya está bien. Sumar `--shadow-1`
y elevación al hover, y sacar el `onMouseEnter`/`onMouseLeave` que manipula `style` a mano
(pasarlo a CSS).

**Reglas que hay que respetar mientras se pinta:**
- Radios solo `10/12/16/99`, sombras solo `--shadow-1/2/3` (`DESIGN.md §5`).
- **Máximo 3 elementos ámbar simultáneos por pantalla** (`§3`). Con 4 plazas × N secciones esto
  se viola fácil: el color de plaza es **identidad**, nunca estado. Si algo necesita gritar,
  se agrega en un contador, no se pinta otra tarjeta.
- Cero hexes nuevos en los componentes.

---

## Bloque 6 — Reportes y Presupuesto: explicar y ejemplificar

**Hallazgo que abarata el bloque: el contenido ya está escrito.** `lib/coach/tours.ts:363`
(reportes) y `:631` (presupuesto) tienen explicaciones buenas y en el idioma correcto. Ejemplo
literal del archivo:

> *"Esto compara el gasto de cada semana contra el presupuesto semanal, no contra las ventas —
> las compras entran a saltos (una compra grande de bodega puede ser toda una semana) y las
> ventas salen parejas todos los días. Sirve para ver el ritmo de compra, no para sacar un
> 'CMV semanal'."*

El problema no es que falte texto: es que **solo se ve dentro del tour**, que corre una vez y
después no vuelve. No hay ningún componente de ayuda en el repo (`InfoTip`, `Explicacion`,
nada).

### 6.1 · El componente

`components/ui/Explicacion.tsx`, exportado desde `components/ui/index.ts`
(`DESIGN.md §10`: nada de tabs/chips/empty states propios por pantalla).

Tarjeta colapsable, cerrada por default, encabezado "¿Cómo se lee esto?" con `help_outline`.
Cuatro campos:

| Campo | Qué va |
|---|---|
| `queEs` | Una línea. Sale del tour. |
| `comoSeCalcula` | La fórmula en castellano: *CMV = (stock inicial + compras − stock final) ÷ ventas* |
| `ejemplo` | **Con números.** Esto es lo que hoy no existe en ningún lado. |
| `queHacerSi` | La acción: *"Si te da arriba de 33%, mirá primero Fuga y después Food Cost por plato"* |

Estado colapsado/abierto en `localStorage` por tab: quien ya lo leyó no lo ve más, quien
recién entra sí.

**La mejora que hace la diferencia: el ejemplo con los números del propio restaurante.** No
*"si vendés $100 y comprás $35, tu CMV es 35%"* sino *"vendiste $2.480.000 y compraste
$871.000 → CMV 35,1%"*, armado con el dato que la pantalla ya tiene en pantalla. Un ejemplo
genérico se saltea; uno con la plata propia se lee.

### 6.2 · Dónde va

**Reportes** (`app/(app)/reportes/page.tsx`, 11 tabs): una `<Explicacion>` arriba del contenido
de cada tab. Prioridad por dificultad de lectura: **CMV, Fuga, Rendimiento, Food Cost** primero
— son las cuatro que nadie entiende sin que se las expliquen. Resumen, Ventas, Compras y Caja
después.

**Presupuesto** (`app/(app)/presupuesto/page.tsx`): una en el hero (qué es un presupuesto por
sector y por qué se expresa sobre ventas y no en pesos), una en la tabla de sectores (qué es un
desvío en puntos y por qué las filas suman el total) y una en la fila de semanas (el texto del
tour de arriba, tal cual).

**No duplicar el texto.** El contenido vive en un solo lugar —
`lib/coach/explicaciones.ts` — y de ahí lo leen la `<Explicacion>` y el tour del Coach. Si
mañana cambia el cálculo del CMV, se corrige en un archivo.

---

## Bloque 7 — Calendario y Bitácora: color, tarjetas, movimiento

Los dos tienen su mapa de colores **definido y sin usar**:
`TIPO_CONFIG` en `lib/hooks/useCalendario.ts:69` (8 tipos de evento con color e icono) y
`BITACORA_TIPO_CONFIG` en `components/bitacora/config.tsx` (reunión / nota / lista / idea).

### Calendario (`app/(app)/calendario/page.tsx`)

- Píldoras de evento con **regla lateral de 3px** en `TIPO_CONFIG[tipo].color` + icono, en vez
  de texto plano. Ahí está el "más colores".
- Celda de día: elevación al hover, hoy con chip navy relleno.
- Cambio de mes/semana con `motion/react`: *shared axis* horizontal — el mes que sale se va
  para el lado del que entra (`DESIGN.md §6`: el movimiento dice de dónde vino).
- Swipe izquierda/derecha en mobile para cambiar de mes, **con los chevrons visibles**
  (`§7`: gesto = acelerador, jamás única vía).
- Abrir un evento: *container transform* de la píldora al detalle.
- Leyenda de tipos, colapsable.

### Bitácora (`app/(app)/bitacora/page.tsx` + `components/bitacora/`)

- `EntradaListItem`: rail de color por tipo + chip con icono + fecha relativa. Hoy son filas
  grises indistinguibles.
- Tarjetas con `--shadow-1`, seleccionada con `--shadow-2`.
- Desktop (lista | documento): transición *container transform* al elegir una entrada.
- Archivar por swipe **con el botón visible al lado** (misma regla del §7).

### Presupuesto de movimiento (`DESIGN.md §6`) — no se excede

| Evento | Presupuesto |
|---|---|
| Tap en una píldora / entrada | 120 ms + `tap()` |
| Cambio de mes / selección de entrada | 260 ms, `EASE_OUT` |
| Todo | `useReducedMotion()` → duración 0, valor final igual |

Solo `transform` y `opacity`. Nada de animar la posición de algo tappable.

---

## Bloque 8 — Modo oscuro, etapa B: los pasteles de estado

**Va último a propósito.** Los bloques 3 a 7 reescriben Limpieza, Turnos, Mesa de trabajo,
Reportes y Calendario enteros. Migrar sus colores antes sería pintar dos veces.

Hay **1567 hexes literales** en `app/` + `components/`. La mayoría no molesta en oscuro (los
saturados: `#ef4444`, `#22c55e`, `#f59e0b` se leen bien sobre negro). Los que rompen son los
**pares pastel + texto oscuro**, que quedan como parches blancos:

| Fondo | Texto | Usos |
|---|---|---|
| `#fef2f2` / `#fee2e2` / `#fecaca` | `#991b1b` / `#dc2626` | ~49 |
| `#fffbeb` / `#fde68a` / `#fef9c3` | `#92400e` / `#b45309` / `#854d0e` | ~48 |
| `#f0fdf4` / `#d1fae5` | `#166534` / `#059669` | ~38 |
| `#dbeafe` / `#e0e7ff` / `#eef2ff` | `#1e40af` / `#4338ca` | ~30 |

**Qué se hace:** cuatro pares de tokens en `globals.css` — `--red-bg`/`--red-fg`,
`--amber-bg`/`--amber-fg`, `--green-bg`/`--green-fg`, `--blue-bg`/`--blue-fg` — con su variante
oscura, y un reemplazo asistido por script sobre esa lista cerrada de hexes. No es "migrar
1567 colores": es migrar ~165 usos de 16 hexes conocidos.

Cierra el presupuesto de `DESIGN.md §8` ("colores fuera de token: 0") para la parte que
realmente importa, y recién ahí la línea *"Dark mode ya resuelto"* pasa a ser cierta.

---

## Fuera de este plan

- **Salón.** Facundo ya dijo que va en sesión aparte. No se toca nada de `app/(servicio)/salon/`.
- **El resto de los 1567 hexes** que no son pares pastel. Ruido, no bug.
- **`PENDIENTES.md` pasó los 38KB** y sigue sin podarse (viene de la sesión anterior).

---

## Resumen ejecutable

| # | Bloque | Toca base | Tamaño | Deploy |
|---|---|---|---|---|
| 0 | Inicio + scrollbar + categorías duplicadas + FAB | sí (1 migración) | S | propio |
| 1 | Modo oscuro etapa A — partir `--navy` | no | M | propio |
| 2 | Merma → Modal + barrido de sheets | no | M | propio |
| 3 | Limpieza: Hoy / Semana / Todas | sí (1 migración) | L | propio |
| 4 | Turnos: planilla real | no | L | propio |
| 5 | Mesa de trabajo: color y tarjetas | no | M | propio |
| 6 | Reportes + Presupuesto: explicaciones | no | M | propio |
| 7 | Calendario + Bitácora: color y movimiento | no | M | propio |
| 8 | Modo oscuro etapa B — pasteles | no | M | propio |

Migraciones totales: **2** (`carta_categorias` único, `haccp_limpieza.dias_semana`).
Las dos aditivas, las dos con `NOTIFY pgrst, 'reload schema'` después.
