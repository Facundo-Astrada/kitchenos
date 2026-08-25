# PLAN — Presupuesto CMV por sector (ago 2026)

**Origen:** planilla de Excel de Facundo (PRESUPUESTO - CMV MENSUAL) + `AUDITORIA-4-CAPAS.md` §3 hueco #5 ("presupuesto por familias de gasto → el salto de resultado a desvío").
**Propuesta visual aprobada:** artifact `Presupuesto CMV` — https://claude.ai/code/artifact/2268f993-06ec-400f-a520-f06074ad5ca7
**Cuenta de referencia:** Bros comedor (`e65cf95a-2c32-4244-b325-2379be5b3a6e`), junio 2026.

---

## 0. Qué es

La pantalla que le pone **estándar declarado** al costo de mercadería. Hoy Reportes contesta "cuánto gastaste"; esta contesta "¿está bien o mal, y por dónde te fuiste".

Tres niveles del mismo número, de arriba hacia abajo:
- **A · El mes** — CMV acumulado contra objetivo, avance, proyección a fin de mes.
- **B · Sectores** — presupuesto vs. real por categoría de mercadería, con desvío en puntos porcentuales.
- **C · Semanas** — ritmo de compra: gasto contra presupuesto semanal (NO % sobre ventas — ver §6.2).
- **D · Fuera del CMV** — Desperdicio (merma) y Arreglos (mejoras: equipamiento, mantenimiento).

---

## 1. Las 8 decisiones cerradas

| # | Decisión | Resuelto |
|---|---|---|
| 1 | Qué facturas cuentan como gasto | **Todo salvo `observada`** (devengado por `fecha_factura`) |
| 2 | Descartables en el CMV | **Flag `cuenta_en_cmv` por categoría**, no recategorizar |
| 3 | Qué es un "arreglo" | **Mejoras**: arreglos estructurales y compras para mejorar proceso, tiempo, producción y ambiente laboral — NO devoluciones |
| 4 | Fuente de los arreglos | **Flag `es_mejora` por categoría** (mismo patrón que `cuenta_en_cmv`) |
| 5 | Corte de semanas | **Bloques de días del mes**: 1‑7, 8‑14, 15‑21, 22‑28, 29‑fin |
| 6 | Ventas estimadas | **Se siembra con el promedio de 3 meses cerrados y queda editable**, con el sugerido visible |
| 7 | Bodega vs. comida | **Juntas, con subtotal de Comida y Bebidas** — el gasto se parte, la venta todavía no |
| 8 | Alcance Fase 1 | **Todo de una**: fix + migración + 4 bloques + seed + módulo |

**Decisión de arquitectura (no preguntada, la tomo yo):** el presupuesto por sector va a **tablas nuevas**, no a columnas nuevas en `presupuestos`. Razón en §3.1.

**Permisos (no preguntado, default obvio):** la pantalla entera detrás de `usePermisos().verCostos`. Es exactamente para lo que existe ese flag, y ya tiene resolver de 3 capas (puesto → override de miembro → fallback por rol).

---

## 2. Bloque 0 — El fix que va primero y solo — ✅ HECHO (26/08)

### 2.1 Bug 1 — el filtro de status

`.eq('status','confirmada')` aparecía en **6 lugares**, no 3: `fetchResumen` (×2), `fetchCompras`, `fetchCMV` (×2), `fetchPresupuestoFamilias` — todos en `lib/hooks/useReportes.ts`. Una séptima ocurrencia en `lib/reportes/fuga.ts` (tab Fuga de inventario), mismo bug exacto.

En Bros hay **1 factura `confirmada` de 2.800** (2.519 `pagada`, 280 `pendiente`). Las 7 ocurrencias afectaban Resumen, Compras, CMV, Presupuesto y Fuga por igual.

```ts
// antes
.eq('status', 'confirmada')
// después
.neq('status', 'observada')
```

Las 7 se corrigieron en el mismo commit — es el mismo bug, mismo criterio de aceptación.

### 2.2 Bug 2 (encontrado al verificar) — `fetchCMV` nunca filtraba por categoría

Con el fix del status nada más, Bros dio **149,2 %** de CMV en junio — no el ~28 % esperado. Causa: `fetchCMV` sumaba **todas** las facturas del período (alquiler, marketing, impuestos, todo), no solo mercadería. El bug 1 lo tapaba: con casi ninguna factura pasando el filtro viejo, el número daba artificialmente bajo (0,7 %) en vez de artificialmente alto.

Fix: `compras`/`comprasAnterior` en `fetchCMV` ahora suman solo filas con `categorias_gasto.categoria_financiera = 'mercaderia'`, embebiendo `categorias_gasto(categoria_financiera)` en el select y filtrando **del lado del cliente** — no con `.eq('categorias_gasto.col', X)`, que no filtra la fila padre en PostgREST (`feedback_postgrest_join`). Mismo patrón que ya usaba `fetchPresupuestoFamilias`.

De paso: el texto explicativo del tab CMV en `reportes/page.tsx` decía "compras confirmadas" — se actualizó a "compras de mercadería" para que describa la fórmula real.

### 2.3 Verificación final

```
Bros, junio 2026: compras mercadería $15.894.681 / ventas $56.439.601 = CMV 28,2 %
```

Cae en el rango sano del material (28–35 %). `npx tsc --noEmit` limpio, `npx vitest run` → 173/173 verdes.

---

## 3. Bloque 1 — Migración

### 3.1 Por qué tablas nuevas y no columnas en `presupuestos`

`presupuestos` tiene `UNIQUE (restaurante_id, periodo, familia)` y `savePresupuestoFamilia` hace upsert con `onConflict: 'restaurante_id,periodo,familia'`.

Agregar `categoria_gasto_id` + `mes` nullable obligaría a un **índice único parcial** (`WHERE categoria_gasto_id IS NULL`) — y el `onConflict` de PostgREST solo acepta columnas, no el predicado del índice. El upsert de familias se rompería. Además `columnas.md` ya deja el aviso explícito sobre el patrón de NULLs en esta tabla: *"no reusar ese patrón"*.

Las dos grillas además son distintas: el presupuesto de familia es una **plantilla vigente** (un monto que no cambia mes a mes); el de sector es **por mes**. Meterlas en la misma tabla es forzar dos cosas distintas en una fila.

`presupuestos` **no se toca**. Riesgo de regresión: cero.

### 3.2 SQL

```sql
-- ── Presupuesto mensual: el número raíz del que cuelga todo ──
create table if not exists presupuesto_mes (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references restaurantes(id) on delete cascade,
  mes date not null,                          -- SIEMPRE el día 1 del mes
  ventas_estimadas numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurante_id, mes)
);
create index if not exists idx_presupuesto_mes_rest on presupuesto_mes (restaurante_id, mes desc);

-- ── Presupuesto por sector y mes ──
create table if not exists presupuesto_sector (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references restaurantes(id) on delete cascade,
  categoria_gasto_id uuid not null references categorias_gasto(id) on delete cascade,
  mes date not null,                          -- SIEMPRE el día 1 del mes
  monto numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurante_id, categoria_gasto_id, mes)
);
create index if not exists idx_presupuesto_sector_rest on presupuesto_sector (restaurante_id, mes desc);

-- ── Los dos flags ──
alter table categorias_gasto
  add column if not exists cuenta_en_cmv boolean not null default false,
  add column if not exists es_mejora     boolean not null default false;

-- Default sensato: todo lo que ya es mercadería entra al CMV.
update categorias_gasto set cuenta_en_cmv = true where categoria_financiera = 'mercaderia';

-- RLS multi-tenant, igual que el resto (44 tablas con mi_restaurante_id())
alter table presupuesto_mes    enable row level security;
alter table presupuesto_sector enable row level security;
create policy p_presupuesto_mes on presupuesto_mes
  for all using (restaurante_id = mi_restaurante_id()) with check (restaurante_id = mi_restaurante_id());
create policy p_presupuesto_sector on presupuesto_sector
  for all using (restaurante_id = mi_restaurante_id()) with check (restaurante_id = mi_restaurante_id());

notify pgrst, 'reload schema';
```

**El `notify` no es opcional** — sin él el browser no ve las tablas nuevas (gotcha ya documentado).

### 3.3 Lo que NO hace la migración

- No prende `cuenta_en_cmv` en Descartables. Es una decisión de cada restaurante y se hace desde la UI de Categorías de Gasto. En Bros no cambiaría ningún número igual: **la categoría Descartables existe pero tiene 0 facturas en 2026.**
- No prende `es_mejora` en nada. Se marca a mano. En Bros aplicaría a *Equipamiento* (también vacía) y *Mantenimiento e Infraestructura* ($1.287.600 al 21/06, $6M en el año).

---

## 4. Bloque 2 — El hook

`lib/hooks/usePresupuestoCMV.ts`. Patrón SWR con `useRestauranteId()`, saltando el fetch cuando devuelve `''`.

### 4.1 Fórmulas exactas

```
mesInicio      = primer día del mes seleccionado
corte          = min(hoy, último día del mes)
diasDelMes     = días del mes
diasCorridos   = día del mes de `corte`
ritmoMes       = diasCorridos / diasDelMes

ventasReales   = Σ ventas.total_ventas          en [mesInicio, corte]
gastoSector[s] = Σ facturas.total               en [mesInicio, corte]
                 donde categoria_gasto_id = s y status <> 'observada'
gastoTotal     = Σ gastoSector[s] para s con cuenta_en_cmv = true

── objetivo ──
ventasEstimadas   = presupuesto_mes.ventas_estimadas
                    ?? promedio(total_ventas de los 3 meses calendario cerrados anteriores)
OBJETIVO_PCT      = FAMILIA_GASTO_OBJETIVO_PCT.materia_prima   // 30
presupuestoTotal  = ventasEstimadas × OBJETIVO_PCT / 100

mix[s]            = share histórico de s sobre el gasto de mercadería de los 3 meses previos
presupuesto[s]    = presupuesto_sector.monto ?? presupuestoTotal × mix[s]

── el desvío (esto es lo que se paga) ──
cmvPct            = gastoTotal / ventasReales × 100
objSobreVentas[s] = mix[s] × OBJETIVO_PCT          // suma OBJETIVO_PCT exacto
pctSobreVentas[s] = gastoSector[s] / ventasReales × 100
desvioPuntos[s]   = pctSobreVentas[s] − objSobreVentas[s]     // suma el desvío total, exacto
desvioPlata       = gastoTotal − ventasReales × OBJETIVO_PCT / 100

── avance y proyección ──
proyVentas        = ventasReales / ritmoMes
proyGasto         = proyVentas × cmvPct / 100
sobrecostoProy    = proyGasto − proyVentas × OBJETIVO_PCT / 100
saldo             = presupuestoTotal − gastoTotal
ejecutadoPct[s]   = gastoSector[s] / presupuesto[s] × 100

── semanas ──
semana(fecha)        = min(floor((día − 1) / 7) + 1, 5)
diasSemana(w)        = w < 5 ? 7 : diasDelMes − 28
presuSemana[s][w]    = presupuesto[s] × diasSemana(w) / diasDelMes
desvioSemana[s][w]   = gastoSemana[s][w] / presuSemana[s][w] − 1
```

**La propiedad que hace útil el bloque B:** `Σ objSobreVentas[s] = 30,0` y `Σ desvioPuntos[s] = desvío total`. Por eso el objetivo por sector se expresa **sobre ventas** y no como share de la torta — el share no es comparable con nada de la fila.

### 4.2 Subtotales de Comida y Bebidas

`esBebida(categoria)` = el nombre matchea `/bebida|vino|bodega|cerveza|licor|cafeter/i`. Heurística de nombre, no columna nueva — con 7 categorías por restaurante no vale una migración. **Documentar que es heurística** y que se corrige a mano si un restaurante nombra distinto.

Los dos subtotales se muestran como filas de resumen sobre el total. **No** se calcula "% de bodega sobre venta de bebida": la venta no se puede partir todavía (13 de 272 nombres de `ventas_items` matchean contra `carta_items`).

### 4.3 Escrituras

- `guardarVentasEstimadas(mes, monto)` → upsert en `presupuesto_mes` con `onConflict: 'restaurante_id,mes'`
- `guardarPresupuestoSector(mes, categoriaId, monto)` → upsert en `presupuesto_sector` con `onConflict: 'restaurante_id,categoria_gasto_id,mes'`
- `sembrarMes(mes)` → escribe de una todos los `presupuesto_sector` del mes usando el mix histórico, más el `presupuesto_mes`. Es el botón "Usar sugerido" — mismo rol que `aplicarEstructuraEstandar` en el tab de familias.

### 4.4 Paginación

`facturas` de un mes en Bros son ~570 filas: entra en un request. Pero el cálculo del **mix histórico** barre 3 meses (~1.400 filas) y PostgREST corta en 1.000. **Paginar con `.range()`**, mismo patrón que `fetchProveedoresSinCategoria` en `useCategoriasGasto.ts`.

---

## 5. Bloque 3 — El módulo nuevo

`ModuloId` nuevo: `'presupuesto'`. Ruta `/presupuesto`. Icono `account_balance_wallet`.

### 5.1 Los 5 puntos de cableado (si falta uno, el módulo nace invisible)

| # | Archivo | Qué |
|---|---|---|
| 1 | `lib/constants.ts` | `ModuloId` · `MODULO_CONFIG` · `MODULOS_POR_ROL` (admin + chef) · `TODOS_LOS_MODULOS` · `MODULOS_EMPRENDIMIENTO` · `RUTA_A_MODULO['/presupuesto']` · `MODULO_DESCRIPCION` |
| 2 | `components/shell/SidebarNav.tsx` | `SECCIONES` → sección **Gestión**, al lado de `reportes`. Es una lista hardcodeada que NO deriva de `MODULOS_POR_ROL` — el gotcha que dejó Organigrama invisible en escritorio (`f32d6c7`) |
| 3 | SQL de backfill | Los puestos **ya creados** en DB no reciben el módulo nuevo. `update puestos set permisos_app = array_append(permisos_app,'presupuesto') where nivel='admin' and not ('presupuesto' = any(permisos_app));` — ídem `rol_permisos.modulos_visibles` para admin |
| 4 | `app/(app)/presupuesto/page.tsx` | La pantalla. `PageTransition` como pass-through (no animar ahí) |
| 5 | `app/(app)/presupuesto/loading.tsx` | Skeleton, como el resto |

### 5.2 La mudanza del tab de familias

Reportes tiene 12 tabs. Con esto queda en 11 y gana coherencia: pasa a ser **solo lectura del resultado**, sin el único tab que además escribía.

- `renderPresupuesto()` (`reportes/page.tsx:1053`) se mueve a `/presupuesto` como tab **Familias**.
- Se saca `'presupuesto'` del type `Tab`, de `TABS` y de `TABS_EXPORTABLES`.
- `fetchPresupuestoFamilias` / `savePresupuestoFamilia` / `aplicarEstructuraEstandar` se quedan en `useReportes` — no vale la pena moverlas de hook.
- El export a Excel del tab se lleva a la pantalla nueva.

### 5.3 Gate de permisos

```tsx
const { verCostos } = usePermisos()
if (!verCostos) return <EmptyState icon="lock" title="Sin acceso a los costos" ... />
```

---

## 6. Bloque 4 — La pantalla

Registro **Preparación** (dial 7). Componentes canónicos de `components/ui/` — `SegmentedTabs`, `EmptyState`, `Num`, `HeaderAction`. Cero tabs/chips/números propios.

### 6.1 Estructura

```
/presupuesto
├── tab Familias        ← lo que hoy es Reportes → Presupuesto, tal cual
└── tab CMV por sector  ← lo nuevo
    ├── A · El mes            hero + avance + proyección
    ├── aviso sin categorizar (solo si hay facturas sin categoría en el mes)
    ├── B · Sectores          tabla editable + subtotales Comida/Bebidas
    ├── C · Ritmo de compra   matriz sector × semana
    └── D · Fuera del CMV     Desperdicio + Arreglos
```

Selector de mes en el header (no el `Periodo` de Reportes: acá la cadencia es **siempre mensual**, como en `fetchPresupuestoFamilias`).

### 6.2 Reglas de la pantalla que NO se negocian

1. **La semana se mide contra presupuesto, no contra ventas.** Un CMV semanal en Bros junio da 54 % / 19 % / 21 % sin que pase nada anormal — las compras entran a saltos y las ventas salen parejas. El bloque C se titula **"Ritmo de compra — cuándo sale la plata"**, no "CMV semanal".
2. **El saldo nominal va chico y el desvío va grande.** En Bros al 21/06: saldo $9,8 M sin gastar (parece bárbaro) contra +$887.513 de sobrecosto real (la verdad). El segundo es el que contesta la pregunta.
3. **El aviso de "sin categorizar" va arriba de la tabla, no abajo.** $22,5 M en 214 facturas en Bros — la pantalla tiene que declarar su propio margen de error antes de mostrar el número. CTA al panel de asignación masiva que ya existe (`asignarCategoriaAProveedor`).
4. **Presupuesto de ámbar ≤ 3 elementos simultáneos** (DESIGN.md §3). En el mockup son 3: el CMV del hero, el aviso de sin categorizar y el total de la tabla. Si un mes malo enciende más, agrupar — no agregar ámbar.

### 6.3 Mobile

Los 4 bloques se apilan. El bloque C usa el **scroll‑snap nativo** del patrón de tabs de OPS (`ui.md` § "Tabs con swipe"), no un gesto a mano. La tabla del bloque B pasa a cards de una fila por sector.

**Cadena de altura:** raíz `flex-column`, contenido en un hijo `flex:1` con su propio `overflowY:auto`, `minHeight:0` en los contenedores de scroll. Es el bug que ya apareció tres veces (Boards Kanban, Planificación, sidebar de escritorio).

### 6.4 Estados vacíos

| Situación | Qué muestra |
|---|---|
| Sin `categorias_gasto` de mercadería | `EmptyState` con CTA a Configuración → Categorías de Gasto |
| Sin ventas cargadas en el mes | Los bloques B y C funcionan igual (presupuesto vs. gasto). El hero muestra "—" en el % y explica que falta importar ventas |
| Sin presupuesto cargado | Botón "Usar sugerido" con el mix de 3 meses, mismo patrón que "Usar estructura estándar" |
| Menos de 3 meses de historia | El mix cae a repartir en partes iguales, y se avisa |
| Sin `cantidad_cubiertos` | El bloque de Q (cubiertos / ticket promedio) **se oculta entero**. En Bros es 0 de 169 filas |

---

## 7. Bloque 5 — Seed de El Rescoldo

El Rescoldo tiene **0 filas en `categorias_gasto`**. La cuenta de demo y marketing vería la pantalla vacía.

- Sembrar las categorías de mercadería (mismos sectores que Bros) + Descartables con `cuenta_en_cmv = true` + Mantenimiento con `es_mejora = true`.
- Asignar `categoria_gasto_id` a las 17 facturas existentes.
- Sembrar `presupuesto_mes` y `presupuesto_sector` de mayo y junio 2026 (el rango donde El Rescoldo tiene ventas: 14/05 – 13/06).
- **Sumar `categorias_gasto`, `presupuesto_mes` y `presupuesto_sector` a `reset_demo_restaurante()`** — la primera ya era un hueco conocido de `columnas.md`, las otras dos son nuevas.

---

## 8. Bloque 6 — Coach y documentación

- **Coach:** `/coach-screen presupuesto` — screen context con insights (desvío del mes, sector que lo explica, ritmo de gasto vs. ritmo del mes), `data-coach-target` en los 4 bloques, tour, y las funciones explicadas. Ojo con la regla de `feedback_coach_context_owner`: un solo dueño del `kc_screen_context` por pantalla.
- **Docs:** `columnas.md` (las 2 tablas nuevas + los 2 flags + la trampa de por qué NO se tocó `presupuestos`) · `ESTADO-ACTUAL.md` (módulo nuevo) · `AUDITORIA-4-CAPAS.md` §3 (marcar el hueco #5 como cerrado) · `ui.md` si aparece algún patrón nuevo.
- **Manual:** `/update-manual` al final — es una pantalla visible para el usuario.

---

## 9. Orden de ejecución

| Paso | Qué | Verificación |
|---|---|---|
| 1 | Fix del status en `useReportes` | Reportes → CMV de Bros pasa de 0,7 % a ~28 % en junio. **Commit y deploy solo** |
| 2 | Migración + `notify pgrst` | `select` desde el browser a `presupuesto_mes` no da 404 |
| 3 | Hook `usePresupuestoCMV` | Los números de junio de Bros dan lo del mockup: 32,3 % / +2,3 pts / Bebidas con Alcohol +4,7 pts |
| 4 | Módulo + los 5 puntos de cableado | Aparece en sidebar de escritorio Y en el menú MÁS de mobile |
| 5 | Bloques A y B | Captura con Playwright contra dev server |
| 6 | Bloques C y D | Ídem |
| 7 | Mudanza del tab Familias | Reportes queda con 11 tabs y sin escrituras |
| 8 | Seed de El Rescoldo + `reset_demo_restaurante()` | La pantalla se ve llena en la cuenta de demo |
| 9 | Coach + docs + `/update-manual` | — |
| 10 | `/update-status` | — |

**El paso 3 es el checkpoint real.** Si los números no reproducen el mockup contra Bros, hay un error de fórmula y no tiene sentido seguir con la UI.

---

## 10. Trampas conocidas

| Trampa | Dónde |
|---|---|
| `notify pgrst, 'reload schema'` después de crear tablas, o el browser no las ve | `feedback_postgrest_schema_cache` |
| Agregar un `ModuloId` no lo habilita para los puestos ya creados en DB — hay que backfillear | `feedback_modulo_nuevo_backfill` |
| `SidebarNav.tsx` usa lista hardcodeada, no deriva de `MODULOS_POR_ROL` | `feedback_sidebar_hardcoded_seccion` |
| PostgREST corta en 1.000 filas — paginar el barrido de 3 meses | `useCategoriasGasto.ts` |
| No filtrar tabla embebida con `.eq('rel.col', X)` — no filtra la fila padre | `feedback_postgrest_join` |
| Cadena de altura: `minHeight:0` en todo contenedor de scroll anidado | `ui.md` |
| `useRestauranteId()` devuelve `''` mientras carga — saltear el fetch | `CLAUDE.md` |
| No reusar el patrón de NULLs de `presupuestos` para unicidad | `columnas.md` |

---

## 11. Fuera de alcance (Fase 2)

- **Partir la venta en comida vs. bebida.** Requiere mapear los 272 nombres de `ventas_items` contra `carta_items` (hoy matchean 13). Es un sub-proyecto propio. Sin eso no hay "% de bodega sobre venta de bebida" ni el guardarraíl de 40 % del material.
- **Merma con costo real.** Los 3 registros de junio de Bros están en $0 porque Merma no encuentra precio del producto. El bloque D lo declara, no lo arregla.
- **Comparación mes contra mes** (`% VAR mes a mes` de la planilla). El dato sale del mismo hook, pero la columna se agrega después de ver la pantalla funcionando con un mes.
- **Cubiertos / Q estimados vs. Q real.** Bros no carga `cantidad_cubiertos` (0 de 169). El bloque se oculta hasta que haya datos.
- **Presupuesto de personal, alquiler y gastos generales por sub-categoría.** Este plan abre solo materia prima. El mismo patrón sirve para las otras 3 familias cuando se pida.
