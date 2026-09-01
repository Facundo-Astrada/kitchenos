# Plan de ejecución — cerrar el ciclo de las 4 capas

**Creado:** 18/08/2026 · **Estado:** `ABIERTO`
**Origen:** `AUDITORIA-4-CAPAS.md` · **Base de conocimiento:** `SINTESIS-ORGANIZACION-GASTRONOMICA.md` (en `~/Desktop/START UP KOS/06-contexto-gastronomia/`)
**Alcance decidido:** todo, incluido Reservas. **Validación:** en paralelo, no bloqueante.

---

## Cómo se ejecuta

Cada bloque de abajo es **una sesión de trabajo**, en el sentido del método del proyecto: se abre, se cierra el mismo día, termina con `/update-status`.

**Ritual de cada sesión:**
1. Abrir con: *"Leé SESION.md. Seguimos con PLAN-4-CAPAS bloque N"*
2. `/model sonnet` antes de tocar código. Este plan ya es el diseño; ejecutar en Opus/Fable es desperdicio.
3. Leer los docs condicionales que el bloque indique (`hooks.md`, `columnas.md`, `rls.md` según toque).
4. `npm run build` es hoy el **único gate real** — `npm run lint` está roto (deuda #6). No confiar en lint.
5. Commit + push al verificar cada cambio funcional. Deploy a Vercel es automático.
6. `/update-status` al cerrar, sin excepción.

**Marcar acá el avance.** Cada bloque tiene checkbox. Es el estado compartido entre sesiones.

---

## Reglas transversales — aplican a todos los bloques

Estas se repiten en casi todo el plan. No repetirlas en cada bloque; asumirlas siempre.

| # | Regla | Por qué |
|---|---|---|
| R1 | **Toda tabla nueva con `restaurante_id` se suma a `reset_demo_restaurante()`** | Si no, queda vacía en la demo tras el próximo reset nocturno. Está en `columnas.md` §Demo. |
| R2 | **Toda tabla nueva lleva RLS con `mi_restaurante_id()`** | Ver `.claude/docs/rls.md`. No dejar `USING(true)`. |
| R3 | **Ningún campo nuevo de la capa Definir puede bloquear a Ejecutar** | Un producto sin merma esperada se recibe igual; un plato sin estándar se costea igual. Definir enriquece a Controlar, no es prerrequisito de nada. |
| R4 | **Todo campo nuevo arranca con default sensato** | Nadie debería tener que inventar el primer valor. El stock de seguridad se calcula, la merma se precarga, el presupuesto arranca con la estructura 33/5/30/17. |
| R5 | **No persistir lo que se puede calcular** | Stock de seguridad = `stock_minimo × 1,25`. Es derivado, no columna. |
| R6 | **`useRestauranteId()` devuelve `''` mientras carga** — todo hook nuevo saltea el fetch con `''` | Regla crítica del proyecto, `CLAUDE.md`. |
| R7 | **Al crear tablas nuevas: `NOTIFY pgrst, 'reload schema'`** | Si no, el browser no las ve. Ver memoria `feedback_postgrest_schema_cache`. |

---

## Track paralelo — validación con clientes

**No bloquea la ejecución.** Corre mientras se hacen los bloques 1 a 3, y su resultado **reordena los bloques 4 en adelante**.

**Instrumento:** recorrer las 8 filas de la matriz con Franco (Bros) y con el Rescoldo. Por cada función, tres preguntas y nada más:

1. ¿Esto te duele hoy? (sí / no / a veces)
2. ¿Cómo lo resolvés ahora? (nombrar la planilla, el cuaderno o la persona)
3. Si lo resolviera solo, ¿cuánto te ahorra por semana? (en horas o en plata)

**Qué hacer con el resultado:** las celdas donde los dos clientes digan "duele" y no puedan nombrar cómo lo resuelven suben al tope. Las que nadie mencione bajan, **incluido Reservas** si resulta que ninguno toma reservas formalmente.

> Registrar el resultado en `DECISIONES.md`, no acá. Este plan describe qué construir; el porqué del orden va allá.

---

## Bloque 1 — La corrección de ingeniería de menú

- [x] **B1** · Media sesión · Sin migración · Sin dependencias

**Qué está mal.** `app/(app)/carta/page.tsx:2304-2320` clasifica con dos promedios simples. El método (Kasavana-Smith) usa un umbral fijo para popularidad y un promedio ponderado para rentabilidad.

**El cambio:**

```ts
const N = base.length
const totalVendido = base.reduce((s, x) => s + x.pop, 0)

// Popularidad: umbral fijo, no promedio
const mixIdeal = 100 / N
const indicePopularidad = mixIdeal * 0.7   // el 70 % es del método, no arbitrario

// Rentabilidad: promedio PONDERADO por unidades vendidas
const gbTotal = base.reduce((s, x) => s + x.margin * x.pop, 0)
const gbPromedio = totalVendido > 0
  ? gbTotal / totalVendido
  : base.reduce((s, x) => s + x.margin, 0) / N   // fallback sin ventas

for (const x of base) {
  const mixReal = totalVendido > 0 ? (x.pop / totalVendido) * 100 : 0
  const ph = totalVendido > 0 ? mixReal >= indicePopularidad : false
  const mh = x.margin >= gbPromedio
  // …misma asignación de cuadrantes
}
```

**Cuidados:**
- **Preservar el comportamiento sin ventas.** Hoy cuando `conVentas === false` clasifica solo por rentabilidad y lo avisa en pantalla (`carta/page.tsx:2447`). Con `totalVendido === 0`, `gbPromedio` se dividiría por cero — de ahí el fallback.
- `N` puede ser 0 o 1. Con `N === 0` no entrar al cálculo; con `N === 1` el mix ideal es 100 % y el índice 70 %, que funciona.

**Verificación:** test Vitest con distribución sesgada — 5 platos, uno se lleva el 40 % de las ventas. Debe demostrar que con el método viejo caían 3 en "poco popular" y con el nuevo caen menos. Es el caso que motivó el hallazgo.

**Qué mirar después del deploy:** entrar a Carta → Rentabilidad → Ingeniería con datos de El Rescoldo y chequear que la nueva clasificación tenga sentido para alguien que conoce la carta. Si de golpe todo es Estrella, el umbral quedó demasiado laxo y hay que revisar el cálculo de `margin`.

---

## Bloque 2 — Los campos de la capa Definir en Stock

- [x] **B2** · Una sesión · Migración + script de precarga · Sin dependencias

**Migración** (`productos`):
```sql
ALTER TABLE productos
  ADD COLUMN IF NOT EXISTS stock_maximo NUMERIC NULL,
  ADD COLUMN IF NOT EXISTS merma_esperada_pct NUMERIC NULL,
  ADD COLUMN IF NOT EXISTS nota_recepcion TEXT NULL;
```

Tres campos, ninguno NOT NULL, ninguno bloqueante (R3).

**Stock de seguridad: no es columna** (R5). Es `stock_minimo × 1.25`, calculado en `useStock`. El material lo define como "el mínimo más un 25 % de protección contra incertidumbre de demanda o retrasos de proveedores".

**`calcEstado` pasa de 2 estados a 3.** Hoy es `ok | bajo`. Agregar `alto` cuando `stock_actual > stock_maximo`. Cuidado: `fuera_de_uso` fuerza `'ok'` y eso no cambia (`columnas.md` línea 8). El sentido del estado `alto` es sobre-stock de perecedero, que es plata inmovilizada y merma futura.

**Precarga de `merma_esperada_pct`.** Script `scripts/precargar-mermas.mjs --apply`, con la tabla de la síntesis §5.5, matcheando por nombre de producto normalizado y cayendo a la categoría cuando no hay match exacto:

| Merma | Productos |
|---|---|
| 8 % | uvas, melones, duraznos, cerezas, mandarinas, arándanos, coco, lechuga |
| 10 % | manzanas, naranjas, piñas, sandías, mangos, peras, limones, granadas, guayaba, zanahorias, brócoli, pepinos, pimientos, espárragos |
| 12 % | fresas, kiwis, frambuesas, cebollas, calabazas, apios, berenjenas |
| 15 % | tomates, papas, remolachas, calabacines, acelgas, espinacas |
| 18 % | res |
| 20 % | pollo, cordero |
| 22 % | cerdo |

**Qué NO hacer con `merma_esperada_pct`:** no meterlo al costeo. `ingredientes.merma_pct` ya existe, ya se aplica al **peso** (`recetario/[id]/page.tsx:32-48`) y deliberadamente **no** al costo, porque la convención es que `ingredientes.cantidad` se carga en bruto (`useRecetas.ts:56`). Aplicar merma al costo duplicaría el descuento e inflaría todos los food cost históricos. Este campo es de **Stock**, no de recetas, y su único consumidor es el bloque 5.

**UI:**
- Modal de alta/edición de Stock: campo Máximo al lado de Mínimo, con hint "Techo de compra — sobre todo para perecedero".
- Fila de la tabla: badge `alto` en el mismo lugar donde hoy aparece `bajo`.
- `nota_recepcion` no va en el modal principal: es un campo secundario, va en un desplegable "Estándar de recepción" junto a la merma esperada.

**Verificación:** cargar un producto con máximo bajo, subir el stock por encima, ver el badge. Y correr el script en la demo antes que en producción.

---

## Bloque 3 — Proveedores: días de entrega e incidencias

- [x] **B3** · Una sesión · Migración + tabla nueva · Depende de B2 (comparte la sesión de recepción)

**Parte A — días de entrega.** `proveedores.dias_entrega` **ya existía** en prod (no era parte del plan original de otro bloque, quedó fuera del radar de la auditoría) como `text[]` de etiquetas de día ("Lun"/"Lunes", inconsistente entre cuentas) con datos reales cargados en Rescoldo y Bros. El plan pedía crearla como `INT[]` ISO 1-7 — se decidió **no migrarla**: convertir una columna en uso con datos reales es trabajo de limpieza fuera del alcance de la sesión, y no había ningún consumidor todavía (B10 no está construido) que se beneficiara hoy de forzar la convención. Se sumó `horario_entrega TEXT NULL` (libre: "8 a 11 hs"), que sí era 100% nuevo.

**Importante para B10:** cuando se llegue a "ordenar por próximo día de entrega", `dias_entrega` va a haber que leerlo como texto de días (con las dos variantes de formato conviviendo), no como ISO 1-7. Revisar el dato real en ese momento, no asumir el criterio de este plan.

**Parte B — incidencias.** Tabla nueva:
```sql
CREATE TABLE proveedor_incidencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id UUID NOT NULL REFERENCES restaurantes(id),
  proveedor_id UUID REFERENCES proveedores(id) ON DELETE SET NULL,
  pedido_id UUID NULL,              -- link polimórfico, sin FK (convención del proyecto)
  producto_nombre TEXT NOT NULL,
  tipo TEXT NOT NULL,               -- faltante | calidad | fuera_de_horario | precio | devolucion
  cantidad_esperada NUMERIC NULL,
  cantidad_recibida NUMERIC NULL,
  importe NUMERIC NULL,
  nota TEXT NULL,
  foto_url TEXT NULL,               -- bucket `fotos`, path incidencias/{id}.{ext}
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  creado_por TEXT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Se crea sola.** En `usePedidos.marcarItemRecibido` (`usePedidos.ts:164`), cuando `cantidadRecibida < cantidad`, generar la incidencia tipo `faltante` con el delta y el importe. **Sin fricción, sin modal** — el usuario ya está haciendo la tarea. Los otros tipos se cargan a mano desde el pedido o desde el proveedor.

**Vista:** en `/proveedores`, por cada proveedor, incidencias de los últimos 90 días agrupadas por tipo, y un indicador de cumplimiento. **No inventar un score numérico** — mostrar los hechos: "3 faltantes, 1 fuera de horario, $18.400 en diferencias". Un score compuesto invita a discutir la fórmula en vez del proveedor.

**No olvidar:** R1 (reset_demo), R2 (RLS), R7 (reload schema).

---

## Bloque 4 — Presupuesto por familias de gasto

- [x] **B4** · Una sesión · Migración con cuidado de datos · Sin dependencias

**Decisión de ejecución:** la pantalla nueva trabaja siempre en cadencia mensual (no se agregó selector de período para el desglose por familia) — es la cadencia que usa el material para la estructura 30/33/5/17, y evita cruzar familia×período en la UI sin que lo pidiera el plan. La vista vieja (monto total editable por período: semanal/mensual/trimestral/semestral/anual) se reemplazó por completo por la tabla de familias; las filas legacy con `familia=NULL` quedan en la tabla sin usarse (documentado en `columnas.md`). "Usar estructura estándar" reparte la facturación del mes anterior (o del mes en curso si no hay mes anterior con ventas) en 30/33/5/17.

**El estado actual.** `presupuestos(restaurante_id, periodo, monto)` con `UNIQUE(restaurante_id, periodo)` — un número por período, sin desglose. Y por otro lado `categorias_gasto.categoria_financiera ∈ mercaderia | operacional | administrativo`.

**El problema.** La estructura objetivo del material tiene 4 familias y la clasificación existente tiene 3, y no coinciden: RRHH y alquiler están escondidos dentro de `operacional`/`administrativo`, y son justamente los dos que más pesan (33 % y 5 %).

**El cambio, que preserva los datos existentes.** Extender el enum de 3 a 5 valores:

```
mercaderia      → Materia prima      (objetivo 30 %)
rrhh            → Personal           (objetivo 33 %)   ← NUEVO
alquiler        → Alquiler           (objetivo  5 %)   ← NUEVO
operacional     ┐
administrativo  ┴→ Gastos generales  (objetivo 17 %)
```

Las categorías existentes siguen funcionando y ruedan hacia Gastos generales; las dos nuevas se completan a mano una vez. **Es una extensión, no una migración destructiva.**

**Presupuestos:** agregar `familia TEXT NULL` y mover el UNIQUE a `(restaurante_id, periodo, familia)`. Las filas existentes quedan con `familia = NULL`, que significa "presupuesto total" y se sigue mostrando como hoy. Nada se rompe.

**Default (R4):** al abrir la pantalla sin presupuesto por familia cargado, ofrecer un botón "Usar estructura estándar" que reparte la facturación prevista en 30/33/5/17 y deja el 15 % de EBITDA a la vista. Es un punto de partida editable, no una imposición.

**Reportes → Presupuesto** pasa de "gastaste X de Y" a una tabla de 4 filas: familia, objetivo %, real %, desvío en puntos, desvío en plata. Más el EBITDA calculado abajo. **Ese es el salto de resultado a desvío** que la auditoría marcó como el hueco central de la capa Controlar.

---

## Bloque 5 — Detección de fuga: inventario contra facturación

- [x] **B5** · Una sesión, la más pesada del plan · Sin migración · Depende de B2

**Decisiones de ejecución (dos desvíos del texto original, documentados en el docstring de `lib/reportes/fuga.ts`):**

1. **`consumo_real` no es `stock_inicial + compras − stock_final`.** K-OS no historiza `productos.stock_actual` (valor vivo, sin snapshot por fecha) y la sesión es "sin migración" — no correspondía sumar una tabla de conteos para resolverlo. Se usa `consumo_real ≈ compras del período`, el mismo criterio que ya usa el CMV existente (`compras/ventas`) para aproximar costo de mercadería vendida sin inventario perpetuo.
2. **Compras y merma matchean por nombre normalizado, no solo por `producto_id`.** Verificado contra producción: `factura_items.producto_id` está poblado en ~1% de las filas (el importador de facturas por IA solo carga `producto_nombre`) y `merma.producto_id` también queda vacío seguido. Sin fallback por nombre, el informe daría compras/merma en 0 para casi todo — el mismo problema que ya resuelve `usePedidos.recibirPedido` matcheando por nombre. Verificado con datos reales de El Rescoldo antes de dar el bloque por cerrado (ver `lib/reportes/fuga.ts`).

**Se extrajo `lib/reportes/consumoTeorico.ts`** (con test Vitest) — el matching ventas↔carta_items por nombre normalizado que vivía duplicado en `ventas/page.tsx` (food cost teórico) y `carta/page.tsx` (RentabilidadView, ingeniería de menú), más la resolución de gramaje por producto (receta directa o `plato_recetas` compuesto) que usa la fuga.

**Tab nuevo "Fuga" en Reportes** (no en Auditoría — el volumen de columnas pedía su propio tab). Tabla por producto con teórico/real/merma/desvío/tolerancia, más sección separada "No se puede calcular" (platos vendidos sin receta vinculada, o con receta pero sin ningún ingrediente linkeado a un producto de stock — incluye el caso subreceta-only).

> *"Una fuga de inventarios instalada puede quebrar el negocio en poco tiempo. Los faltantes, además, crean un pésimo ambiente de trabajo, ya que todos son sospechosos."* — Clase 11

**El cálculo,** por producto y período:

```
consumo_teorico = Σ (unidades vendidas del plato × gramaje del producto en su ficha)
consumo_real    = stock_inicial + compras_del_periodo − stock_final
merma_declarada = Σ merma registrada del producto en el período

diferencia      = consumo_real − consumo_teorico − merma_declarada
tolerancia      = consumo_teorico × (merma_esperada_pct / 100)

fuga si  diferencia > tolerancia
```

`merma_esperada_pct` (B2) es lo que hace que esto sea usable: sin tolerancia por producto, el 20 % normal de un pollo se reporta como fuga todos los meses y nadie mira más el informe.

**Hacerlo server-side.** La cadena de joins es `ventas_items → carta_items → recetas/plato_recetas → ingredientes → productos`. Es pesada y ya existe parcialmente en el cálculo de food cost teórico (`ventas/page.tsx`) y en `RentabilidadView`. **Extraer ese join a `lib/reportes/consumoTeorico.ts` y que los tres lo usen** — hoy está duplicado en dos lugares con criterios de matching por nombre normalizado que pueden divergir.

Nueva ruta `app/api/reportes/fuga/route.ts`. No calcular esto en el cliente.

**Dónde vive:** tab nuevo en Reportes, o dentro de Auditoría. Decidir en la sesión según cuánto ocupe.

**El riesgo real:** los productos sin receta vinculada o con unidades mal cargadas dan consumo teórico 0 y aparecen como fuga total. **Excluirlos explícitamente y listarlos aparte** como "no se puede calcular, falta vincular receta" — que además es una lista útil por sí sola. Si esto no se hace, el informe nace desacreditado.

---

## Bloque 6 — Desempeño y ventas por persona, con objetivo

- [x] **B6** · Media sesión · Migración chica · Sin dependencias

**Lo que ya existe** (corregido respecto de la primera versión de la auditoría): `comandas.mozo_id` se llena en `useMesas.ts:75`, y Reportes → Ventas ya muestra ranking de meseros con cantidad y ventas (`useReporteVentas.ts:133-147`). El dato está.

**Lo que falta:** el objetivo contra el cual leerlo, y que desempeño y ventas sean una sola vista en vez de dos que no se hablan.

**Objetivos — dónde viven.** En `puestos.objetivos JSONB`, con override en `equipo_miembros.objetivos JSONB`. Es el mismo patrón que ya usa el proyecto para `permisos_app` / `modulos_extra`, así que no introduce una convención nueva.

```jsonc
{ "pct_comandas_con_postre": 25, "pct_comandas_con_cafe": 25, "ticket_promedio": 12000 }
```

Los dos primeros salen del material (Clase 7: *"25 % + postres por camarero, 25 % + café por camarero"*). Se calculan cruzando `comanda_items → carta_items.categoria`.

**La vista:** `reportes/personal` suma columnas de venta junto a las de producción. Una persona, una fila, las dos caras.

**Cuidado con el tono.** El material advierte y el Coach ya tiene el criterio: señalar desvíos como dato a corregir, no como falla personal. Un ranking de meseros con semáforo rojo es una herramienta de castigo. Mostrar el objetivo y la distancia, sin ordenar por peor.

---

## Bloque 7 — Checklist de la carta pre-servicio

- [x] **B7** · Una sesión · Tabla nueva · Sin dependencias

> *"Una hora antes de abrir, el responsable de cocina irá partida por partida con este checklist probando todas las elaboraciones."* — elBulli 10.1

**Por qué es un módulo y no un ítem del mise.** El mise contesta *¿está hecho?*. Esto contesta *¿está bueno?*. Son dos preguntas distintas, con dos responsables distintos y en dos momentos distintos. Meterlo como sección del mise las confunde.

```sql
CREATE TABLE control_carta_registros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id UUID NOT NULL REFERENCES restaurantes(id),
  carta_item_id UUID REFERENCES carta_items(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  turno TEXT NOT NULL,
  estado TEXT NOT NULL,        -- ok | ajustar | no_sale
  nota TEXT NULL,
  usuario_id TEXT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (carta_item_id, fecha, turno)
);
```

`UNIQUE(carta_item_id, fecha, turno)` → upsert, mismo patrón que `checklist_registros`.

**La pantalla:** lista de platos de la carta agrupados por plaza, tres botones por fila. **Tres decisiones y ningún número** — el mismo criterio de diseño que ya funcionó en el Modo Control del mise.

**Los enganches, que es donde está el valor:**
- `no_sale` → **marca el 86 automáticamente** en `carta_items.disponible`. Esa es la conexión que hace que valga la pena: hoy el 86 se marca cuando un cliente ya pidió el plato.
- `ajustar` → crea una tarea de producción en la plaza correspondiente.
- CTA en OPS en la ventana previa a la apertura, no todo el día.

---

## Bloque 8 — Reservas: el modelo y la pantalla

- [x] **B8** · Una sesión · Tabla nueva · Sin dependencias

```sql
CREATE TABLE reservas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id UUID NOT NULL REFERENCES restaurantes(id),
  fecha DATE NOT NULL,
  hora TIME NOT NULL,
  pax INT NOT NULL,
  cliente_id UUID NULL REFERENCES clientes(id) ON DELETE SET NULL,
  nombre TEXT NOT NULL,             -- redundante con cliente a propósito: la mayoría no es cliente cargado
  telefono TEXT NULL,
  mesa_id UUID NULL REFERENCES mesas(id) ON DELETE SET NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente',   -- pendiente|confirmada|sentada|no_show|cancelada
  origen TEXT NOT NULL DEFAULT 'telefono',    -- telefono|whatsapp|web|walk_in
  nota TEXT NULL,
  creado_por TEXT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON reservas (restaurante_id, fecha);
```

**Se apoya en lo que ya existe:** `clientes` (con teléfono, notas, origen) y `mesas`. No duplicar el concepto de cliente.

**`no_show` es un estado, no un borrado.** El material lo trata como estadística de primera clase — es lo que permite después una política de cancelación.

**Pantalla `/reservas`:** día y semana. El día es la vista de trabajo (lista por hora, con pax y estado); la semana es para ver la carga.

**Permisos:** módulo nuevo en `ModuloId` y en `MODULOS_POR_ROL`. En perfil emprendimiento va oculto por default (un food truck no toma reservas), consistente con `MODULOS_EMPRENDIMIENTO`.

---

## Bloque 9 — Reservas dentro del día de trabajo

- [x] **B9** · Una sesión · Sin migración · Depende de B8 — cerrado 31/08

Una reserva que vive sola en su pantalla no sirve. Los cuatro enganches:

| Dónde | Qué |
|---|---|
| **OPS** | Cubiertos reservados del día, arriba de todo. Es el número que cambia cuánto se produce. |
| **Salón** | Al sentar una mesa, ofrecer las reservas de esa franja. `estado → sentada`, `mesa_id` se completa. |
| **Calendario** | Reflejo de solo lectura, igual que hoy hace con entregas de pedidos y menús activados. |
| **Dashboard** | "Hoy: N reservas, M cubiertos" en las status bars. |

**El `no_show` se marca desde Salón**, al cerrar el turno: las reservas confirmadas que nunca pasaron a `sentada` se ofrecen para marcar. Si no se hace en ese momento, no se hace nunca y la estadística no sirve.

---

## Bloque 10 — Reservas alimentan la previsión, y la sugerencia de compra

- [x] **B10** · Una o dos sesiones · Sin migración · Depende de B2, B3, B8, B9 — cerrado 31/08 (parte A y B)

**Parte A — el motor de producción pasa de estadística a previsión.**

Hoy `lib/produccion/sugerencia.ts` promedia lo vendido en las últimas 8 ocurrencias del mismo día de semana y resta el stock de mise. Son 2 de las 6 entradas que el material define. Con reservas, entra la tercera y la cuarta:

```
factor_demanda = (cubiertos_reservados + walk_in_esperado) / cubiertos_promedio_de_ese_dia
sugerido       = promedio_historico × factor_demanda − stock_actual
```

`walk_in_esperado` sale del histórico: cubiertos reales menos reservados, promediado por día de semana. **Si no hay reservas cargadas para la fecha, `factor_demanda = 1` y el motor se comporta exactamente como hoy** — no se rompe nada y la mejora es incremental.

Mostrar el factor en la narración de la sugerencia: *"Sábado con 62 cubiertos reservados contra un promedio de 45 — sugiero un 38 % más de lo habitual"*. Sin eso, el número cambia y nadie sabe por qué.

**Parte B — sugerencia de compra.** Motor nuevo `lib/compras/sugerencia.ts`:

```
Para cada producto:
  consumo_previsto = Σ (producción sugerida × gramaje del producto en cada ficha)
  objetivo         = consumo_previsto + stock_seguridad   (= mínimo × 1,25, de B2)
  a_pedir          = max(0, objetivo − stock_actual)
  techo            = stock_maximo − stock_actual          (de B2, si está cargado)
  a_pedir          = min(a_pedir, techo)

Agrupar por proveedor. Ordenar por próximo día de entrega (`proveedores.dias_entrega` — texto de días, no ISO 1-7, ver nota en bloque 3).
```

Ahí están las 6 entradas del material completas: reservas, previsión, promedios de venta, inventario, hojas de producción (el mise) y días de pedido.

**Salida:** botón "Sugerir pedido" en `/pedidos` que precarga el carrito. **Nunca crear el pedido solo** — mismo criterio que ya rige la sugerencia de producción, que sugiere y no cambia números.

---

## Riesgos del plan

| Riesgo | Mitigación |
|---|---|
| **Nueve de once ítems agregan campos que alguien tiene que llenar.** Es todo capa Definir, la que el usuario más resiste. | R3 y R4 son innegociables. Si un bloque necesita que un campo esté cargado para funcionar, el bloque está mal diseñado. |
| **B5 nace desacreditado si reporta fuga donde falta vincular receta.** | Separar explícitamente "hay fuga" de "no se puede calcular". La segunda lista es útil por sí sola. |
| **B10 cambia números que la gente ya venía leyendo.** La sugerencia de producción va a dar distinto de un día para el otro. | Narrar el factor de demanda siempre. Un número que cambia sin explicación se deja de mirar. |
| **B1 cambia una recomendación accionable.** Platos que hoy figuran como Perro pueden pasar a Caballo. | Verificar con alguien que conozca la carta del Rescoldo antes de dar el bloque por cerrado. |
| **Reservas puede no importarle a nadie.** Es el bloque más caro y entró por el material, no por demanda observada. | El track de validación corre en paralelo justamente para esto. Si Bros y Rescoldo no toman reservas, B8-B10 se reordenan o se pausan. Decidir antes de arrancar B8, no después. |
| **`npm run lint` está roto** (deuda #6) — el único gate es `npm run build`. | No asumir que lint pasa. Considerar arreglarlo antes de B5, que es la sesión con más código nuevo. |

---

## Orden sugerido

```
B1  ──────────────────────────────────►  independiente, hacerlo primero (es un fix)
B2  ──┬───────────────────────────────►  desbloquea B5 y B10
      │
B3  ──┤                                  desbloquea B10
B4  ──┼───────────────────────────────►  independiente
B6  ──┤                                  independiente
B7  ──┘                                  independiente
      │
B5  ◄─┘                                  necesita B2
      │
B8  ──┬───────────────────────────────►  ← revisar validación ANTES de arrancar
B9  ◄─┤                                  necesita B8
B10 ◄─┘                                  necesita B2, B3, B8, B9
```

**B1 a B7 se pueden hacer en cualquier orden** salvo B5, que espera a B2. Son siete sesiones sin dependencias cruzadas fuertes.

**B8 es el punto de decisión.** Para cuando se llegue ahí, el track de validación ya debería tener respuesta sobre si reservas le importa a alguien.

---

## Qué se ve en la app después de cada bloque

Criterio de aceptación de cada sesión: si al terminar no se puede señalar esto en pantalla, el bloque no está cerrado.

| Bloque | Dónde | Qué se ve |
|---|---|---|
| **B1** | Carta → Rentabilidad → Ingeniería | **Ninguna pantalla nueva.** Cambia en qué cuadrante cae cada plato y los conteos de Estrellas / Caballos / Puzzles / Perros. **Sacar captura antes del deploy** — sin eso no hay con qué comparar. |
| **B2** | Stock | Campo **Máximo** junto a Mínimo en el modal, desplegable **Estándar de recepción** (merma esperada + nota), y badge **`alto`** en la fila cuando el stock supera el máximo. La merma esperada ya viene precargada al abrir un producto. El badge no aparece hasta que se cargue algún máximo. |
| **B3** | Proveedores · Pedidos | Días y horario de entrega en la ficha del proveedor. Bloque de **incidencias de los últimos 90 días** ("3 faltantes, 1 fuera de horario, $18.400 en diferencias"). Arranca vacío: se llena solo al recibir un pedido con menos de lo pedido. |
| **B4** | Reportes → Presupuesto · Compras → Cat. de Gastos | El presupuesto pasa de **un número a una tabla de 4 filas** (materia prima, personal, alquiler, gastos generales) con objetivo, real, desvío en puntos y en plata, más **EBITDA calculado**. Botón "Usar estructura estándar". Y dos opciones nuevas al clasificar una categoría de gasto. |
| **B5** | Reportes | Tabla por producto: consumo teórico, real, merma declarada, diferencia y si está dentro de tolerancia. **Y una segunda lista, separada**, de productos que no se pueden calcular por falta de receta vinculada. Esperar que al principio la segunda sea más larga que la primera. |
| **B6** | Turnos → Puestos · Reportes → Personal | Objetivos por puesto (% postres, % café, ticket promedio). En Personal, columnas de **venta junto a las de producción**: una persona, una fila. Distancia al objetivo, sin ranking en rojo. |
| **B7** | OPS · Carta | Pantalla nueva **Control de carta**, con CTA en OPS solo en la ventana previa a la apertura. Platos por plaza, tres botones por fila. **`no sale` marca el 86 solo** en la Carta; **`ajustar` crea la tarea** de producción. |
| **B8** | Nav | Módulo **`/reservas`** con vista día y semana. Aislado: todavía no aparece en ningún otro lado. |
| **B9** | OPS · Salón · Calendario · Dashboard | Cubiertos reservados arriba de OPS. Al sentar una mesa, el Salón **ofrece las reservas de esa franja**. Reflejo en Calendario y contador en Dashboard. Al cerrar turno, ofrece marcar los **no-show**. |
| **B10** | OPS → Planificación · Pedidos | "Sugerir producción" **cambia sus números según las reservas** y lo narra ("sábado con 62 reservados contra un promedio de 45 — sugiero 38 % más"). Y botón nuevo **"Sugerir pedido"** en Pedidos, que precarga el carrito agrupado por proveedor. |

**Los tres grupos, por si importa el orden de lo mostrable:**

- **Se ve el mismo día, sin cargar nada antes:** B4, B7, B8, B9, B10.
- **Se ve recién cuando hay datos:** B2 (hasta que se cargue un máximo), B3 (hasta la primera recepción incompleta), B6 (hasta que se carguen objetivos).
- **No se ve, se corrige:** B1. Y B5, que se ve pero al principio muestra más problemas de datos que resultados.
