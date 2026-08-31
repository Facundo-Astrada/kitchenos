# KitchenOS medido contra el marco de refactorización

*Auditoría aplicada · Agosto 2026 · el marco vive en `refactor-marco.md` · el cruce
de las tres sesiones en `plan-consolidado.md`*

Método: se leyó completo `app/(app)/carta/page.tsx` (3.906 líneas), `useCarta.ts`,
`lib/carta/ingenieriaMenu.ts`, `lib/ops/mise.ts` (exports), los 2 tests de hooks, la
config de Vitest/Playwright y el spec e2e; y la estructura (funciones a nivel de
módulo + conteos) de las otras cuatro pantallas grandes. Se contó con grep/wc antes
de afirmar.

Números del relevamiento sobre `carta/page.tsx`: **58 llamadas `useState`** (el
informe GRASP dijo 59; el grep incluye la línea de import), **9 componentes/funciones
a nivel de módulo**, **14 queries `.from()` directas** (11 concentradas en un solo
componente), **~300 líneas de código muerto** (verificado por grep de callers).

Escala de veredictos: ✅ cumple · ⚠️ parcial · 🔴 violado.

---

## 0. Correcciones a las sesiones anteriores — la prueba de fuego

**1. La premisa central del informe GRASP sobre las pantallas es falsa para 3 de las
5.** GRASP §3 dijo: *"para probarlos habría que montar la pantalla completa con sus
86 estados"* y propuso para Carta un plan de partición
(`ListaPlatos/EditorPlato/RentabilidadView/exportar.ts`) que asume que la
descomposición hay que crearla. Leído el archivo completo: **la descomposición ya
existe.** Carta, Recetario y Facturas son la "forma 1" del marco §1.1 — componentes
ya separados a nivel de módulo, con interfaces de props tipadas, conviviendo en un
archivo. Los 58 estados de Carta se reparten: 24 en `DetailView`, 9 en
`PackagingGruposDrawer`, 8 en `ImportCartaModal`, 7 en `CartaPage`, 6 en `FormView`,
4 en `RentabilidadView`. **Nunca hay 58 estados juntos; el máximo real es 24.** El
plan correcto no es partir: es mover — 10× más barato y con el compilador de red.
Stock y Checklist sí son la "forma 2" (un componente gigante:
[StockPage](app/(app)/stock/ClientView.tsx#L205) concentra los 86 estados;
[ChecklistPage](app/(app)/checklist/ClientView.tsx#L367) corre hasta la línea 2776) —
para ellas GRASP tenía razón en el diagnóstico, y son otra cirugía (§4).

**2. GRASP prioridad 2 ("capa de repositorio") queda cancelada como ítem propio.** La
sesión 1 ya la redefinió (la firma `(supabase, restauranteId, input)` + regla "nada
nuevo consulta desde pantalla"); esta sesión confirma que para Carta el 80% de las
queries directas desaparecen con UNA migración concreta (paso 5 del plan) — no hace
falta una "capa".

**3. `dominio-kos.md` §6 se confirma con una precisión.** Dijo que Carta "se parte
por vistas internas sin tocar bordes". Cierto, con un asterisco: adentro de Carta hay
UN cruce de borde real hacia OPS — la escritura al mise. Ese borde ya tiene su
costura oficial (`lib/ops/mise.ts`) y dos de los tres escritores la usan; el tercero
([DetailView, §1.3](app/(app)/carta/page.tsx#L1435)) es anterior a la costura y la
duplica inline. El corte respeta el mapa **después** de migrar ese escritor.

**4. Hallazgo nuevo que la sesión 1 no vio: `useCarta` viola el gotcha #18 del propio
proyecto.** El canal realtime
([useCarta.ts:579-588](lib/hooks/useCarta.ts#L579-L588)) se suscribe a 4 tablas
(`carta_items`, `plato_recetas`, `plato_packaging`, `carta_categorias`) **sin
`filter: restaurante_id=eq.X`** — la regla de `hooks.md` #18 que la sesión 1 verificó
en `useTareas`. Cada evento de cualquier cuenta dispara un `mutate()` del fetcher más
pesado de la pantalla. Misma clase de deuda que las 3 violaciones del gotcha #20:
imprudente-inadvertida → va al mismo ratchet (§6).

**5. El número "37 archivos de UI con queries directas" tiene una distribución que
cambia la acción.** En Carta, 11 de las 14 queries directas viven en un solo
componente (`DetailView`) y son en su mayoría UNA lógica duplicada (§1.3). El
problema no está repartido: está concentrado, y por eso es pagable en un paso.

---

## 1. Radiografía de `carta/page.tsx`

### 1.1 El mapa de bloques

| Líneas | Bloque | Estados | Queries directas | Nota |
|---|---|---|---|---|
| [25-53](app/(app)/carta/page.tsx#L25-L53) | Helpers: `fmtMoney`, `CATEGORIAS`, `CAT_ICONS`, `fcBadge`, `marginBadge` | — | — | `CAT_ICONS` no tiene ningún caller: **muerto** |
| [55-157](app/(app)/carta/page.tsx#L55-L157) | `exportCartaPDF` + `exportRentabilidadPDF` | — | — | Funciones de módulo puras (jsPDF); movibles tal cual |
| [161-460](app/(app)/carta/page.tsx#L161-L460) | `PlatoCard` + `PlatoCardBack` + `PlatoCardSkeleton` | 0 | 0 | Presentacionales puros, props tipadas |
| [463-990](app/(app)/carta/page.tsx#L463-L990) | `FormPlato`/`FORM_EMPTY` + `FormView` | 6 | 0 | La rama `isCreate` entera es **muerta** (§1.2); vive solo el modo edición |
| [993-1319](app/(app)/carta/page.tsx#L993-L1319) | `PackagingGruposDrawer` | 9 | 0 | Autónomo: todo entra por props |
| [1331-2395](app/(app)/carta/page.tsx#L1331-L2395) | `DetailView` | 24 | **11** | El único bloque con riesgo real (§1.3) |
| [2400-2671](app/(app)/carta/page.tsx#L2400-L2671) | `RentabilidadView` (tabs lista/ingeniería/reprecio/salud) | 4 | 0 | Su algoritmo central ya se extrajo (`ingenieriaMenu.ts`); quedan dos cálculos inline (§1.4) |
| [2692-3204](app/(app)/carta/page.tsx#L2692-L3204) | `ImportCartaModal` | 8 | 1 | Autónomo; llama `/api/carta/import` |
| [3209-3906](app/(app)/carta/page.tsx#L3209-L3906) | `CartaPage` (shell: 7 hooks, ruteo por `view`, handlers) | 7 | 2 | El estrangulador ya montado: 6 ramas `if (view/composing) return` |

Y el precedente está en la misma carpeta: `MenusView.tsx` y `ComposicionEditor.tsx`
**ya fueron extraídos de esta pantalla a sus archivos** — el patrón de este plan no es
nuevo, es el que la pantalla ya practica.

### 1.2 Código muerto: ~300 líneas (verificado)

Nada en el repo setea `view = 'nuevo'` (grep sobre `app/(app)/carta/`): el botón
"Nuevo" y el empty-state llaman `setComposing({})` →
[ComposicionEditor](app/(app)/carta/page.tsx#L3699), que reemplazó ese flujo. Muertos:

- La rama `view === 'nuevo'` ([3676-3688](app/(app)/carta/page.tsx#L3676-L3688)) y
  `handleCrear` ([3472-3486](app/(app)/carta/page.tsx#L3472-L3486)).
- Toda la rama `isCreate` de `FormView`: `recetasAgregadas`, `fcMultiPreview`,
  `addReceta`/`removeReceta`/`updatePorciones` y el JSX multi-receta
  ([508-554](app/(app)/carta/page.tsx#L508-L554),
  [714-819](app/(app)/carta/page.tsx#L714-L819)).
- `CAT_ICONS` ([32-40](app/(app)/carta/page.tsx#L32-L40)).

La "duplicación del cálculo de costo" que GRASP citó en las líneas 536-547 está
adentro de esta rama muerta — la mitad de ese hallazgo se resuelve con `delete`.

### 1.3 La deuda concentrada: el panel OPS de `DetailView` duplica una costura que ya existe

[handleGuardarOPS](app/(app)/carta/page.tsx#L1435-L1544) (110 líneas) reimplementa
inline, con su propio cliente ([supabaseDV](app/(app)/carta/page.tsx#L1404)), el flujo
completo de escribir un ítem del mise: update de `plato_recetas` → suma de
contribuciones → buscar/crear `checklist_secciones` por `ilike` → upsert de
`checklist_items`. Todo eso ya existe como helpers compartidos en `lib/ops/mise.ts`:
[resolverSeccionMise](lib/ops/mise.ts#L132),
[upsertMiseChecklistItem](lib/ops/mise.ts#L156),
[sumPlatoRecetaCantidad](lib/ops/mise.ts#L206) y
[shrinkOrPruneMise](lib/ops/mise.ts#L223) — usados por `ComposicionEditor` (vía
[handleComposicionSave](app/(app)/carta/page.tsx#L3355-L3371)) y por el board de Mesa
de Trabajo (`app/(app)/espacios/components/CartaBoard.tsx`). El panel de `DetailView`
es **anterior** a los helpers y quedó sin migrar. Agravantes concretos:

- Tiene su **tercera copia** de `PLAZAS_OPS`/`SECCIONES_OPS`
  ([1387-1401](app/(app)/carta/page.tsx#L1387-L1401)) — además del canónico en
  [mise.ts:8-48](lib/ops/mise.ts#L8) y del espejo en `constants.ts` que la sesión 2
  ya marcó.
- **No llama `shrinkOrPruneMise`**: mover una receta de plaza desde este panel deja el
  `checklist_item` de la plaza vieja con la cantidad vieja — el helper que lo
  arregla existe y este caller no lo usa. Lo mismo el botón "Quitar"
  ([2056-2059](app/(app)/carta/page.tsx#L2056-L2059)): anula `plato_recetas` sin
  achicar el mise. **No es solo duplicación: es un bug latente de datos que la
  migración arregla gratis.**
- La conversión capacidad→porciones está escrita dos veces dentro del mismo
  componente ([1443-1448](app/(app)/carta/page.tsx#L1443-L1448) y
  [1976-1981](app/(app)/carta/page.tsx#L1976-L1981)).
- [handleCrearTarea](app/(app)/carta/page.tsx#L1421-L1433) inserta en `tareas`
  directo, con `status` legacy y sin pasar por `useTareas.agregarTarea` — es decir,
  esquiva al **único escritor** que deriva `estado`→`status` y aplica el candado de
  dedupe (`arquitectura-kos.md` §2.4). Riesgo bajo (es una anotación libre), pero es
  exactamente el patrón que la regla prohíbe.

### 1.4 Lo que la extracción precedente enseñó (y lo que dejó a medias)

[ingenieriaMenu.ts](lib/carta/ingenieriaMenu.ts#L1-L9) es el modelo del método: se
extrajo para testear sin montar el componente, el test encontró que el algoritmo
estaba mal, se decidió arreglar (no congelar) y el header documenta la decisión. Lo
que quedó a medias, medible hoy en `RentabilidadView`: los otros dos cálculos de la
misma vista siguen inline y sin test — el **reprecio**
([2440-2453](app/(app)/carta/page.tsx#L2440-L2453): umbral `FC_SOSPECHOSO`, redondeo,
parsing de coma decimal, orden) y la **salud de la carta**
([2466-2472](app/(app)/carta/page.tsx#L2466-L2472)). El reprecio además **escribe
precios en batch** ([2454-2463](app/(app)/carta/page.tsx#L2454-L2463)) — cálculo de
plata sin test, el caso exacto del marco §3.5 última fila.

---

## 2. El plan ejecutable para `carta/page.tsx`

Reglas transversales a todos los pasos:

- **Un paso = un commit como máximo por sub-ítem, siempre verde** (`npm test` +
  `npm run build` + smoke). Abandonar a mitad de un paso = revertir un commit.
- **Antes de tocar un símbolo compartido, `/impacto`** con este protocolo de tres
  preguntas: (1) `affected <símbolo-que-muevo>` — quién lo importa (para un
  componente interno de `page.tsx` la respuesta esperada es "solo esta página": si
  aparece otro caller, frenar y mirar); (2) `affected <helper-que-voy-a-adoptar>` —
  quiénes son los OTROS callers cuyo comportamiento tiene que quedar idéntico (para
  el paso 5: `upsertMiseChecklistItem` → ComposicionEditor y CartaBoard); (3) si hay
  ediciones sin commitear en la sesión, refrescar el grafo
  (`graphify extract . --code-only`) antes de confiar en la lista.
- **Ningún paso toca `useCarta.ts`** salvo donde se indica — el hook es la parte que
  funciona (SWR + realtime + CRUD estable) y las pantallas se mueven alrededor.
- Los nombres nuevos se bautizan contra el glosario (`dominio-kos.md` §3).

### Paso 0 — La red (½ día) 🟢 riesgo

**Qué se toca:** nada del código de producción. Se crea `e2e/carta-smoke.spec.ts` con
el molde de [salon-kds.spec.ts](e2e/salon-kds.spec.ts#L28-L34): login → `/carta` → la
lista renderiza con ≥1 plato → abrir un plato (detail) → toggle 86 → verificar
overlay "86" → toggle de vuelta → volver a la lista → entrar a Rentabilidad →
verificar que las 4 tabs renderizan. Contra el dev server, cuenta demo El Rescoldo.
**Red:** ninguna necesaria. **Verificación:** el spec pasa dos veces seguidas.
**Reversible:** trivial. **¿Un día?:** medio.

Registrar la línea base en el commit: 3.906 líneas, 58 useState, 14 `.from()`.

### Paso 1 — Borrar lo muerto (½ día, mismo día que el paso 0) 🟢

**Qué se toca:** borrar la rama `view==='nuevo'`, `handleCrear`, la rama `isCreate`
completa de `FormView` (el prop `initialData` pasa a ser obligatorio y `FormView`
queda como editor puro), `CAT_ICONS`. **Red:** `tsc` + grep de referencias = 0 +
smoke (el flujo "Nuevo" pasa por ComposicionEditor y el smoke lo ve).
**Verificación:** build verde; crear un plato desde el botón Nuevo en dev.
**Reversible:** un commit. **¿Un día?:** entra junto con el paso 0.
**Resultado:** ~-300 líneas sin mover nada. No se refactoriza lo que no corre.

### Paso 2 — Move: presentacionales y exportadores (½–1 día) 🟢

**Qué se toca:** tres commits mecánicos —
(a) `PlatoCard`+`PlatoCardBack`+`PlatoCardSkeleton`+`fcBadge`+`marginBadge`+`fmtMoney`
→ `app/(app)/carta/cards.tsx`;
(b) `exportCartaPDF`+`exportRentabilidadPDF` → `app/(app)/carta/exportar.ts`;
(c) `PackagingGruposDrawer` → `app/(app)/carta/PackagingGruposDrawer.tsx`.
`fmtMoney`/`fcBadge` se exportan desde `cards.tsx` para los demás consumidores del
archivo. **Red:** compilador + build + smoke (marco §3.5: para un move, el compilador
ES la caracterización). **Verificación:** `npm run build` + smoke + toggle 86 visual.
**Reversible:** por commit. **¿Un día?:** sí, sobra.
**Resultado acumulado:** page.tsx ≈ 2.400 líneas.

### Paso 3 — RentabilidadView: mover + terminar lo que ingenieriaMenu empezó (1 día) 🟡

**Qué se toca:**
(a) Extract Function con caracterización en el mismo commit (marco §3.2):
`lib/carta/reprecio.ts` (`calcularReprecio(items, targetFC)` +
`FC_SOSPECHOSO` exportado) y `lib/carta/saludCarta.ts`, con tests que fijan el
comportamiento actual: exclusión de FC>200, `Math.round(costo/(t/100))`, parsing de
`'32,5'`, orden descendente por FC, los cuatro grupos de salud y el total. Fixtures
con el shape real de `CartaItemEnriquecido`.
(b) Move: `RentabilidadView` → `app/(app)/carta/RentabilidadView.tsx`, importando lo
extraído.
**Red:** los tests nuevos + smoke (tab Rentabilidad ya está en el spec).
**Verificación:** `npm test` + comparar a mano el reprecio de la cuenta demo antes y
después (misma lista, mismos sugeridos). **Reversible:** (a) y (b) commits separados;
(a) vale por sí solo aunque (b) no salga. **¿Un día?:** sí.
**Si el test de caracterización encuentra un comportamiento raro** (p. ej. el parsing
de coma): documentarlo y congelarlo — se cambia después con decisión explícita, no
adentro del move (la lección de ingenieriaMenu, aplicada al revés: ahí se arregló
porque el método estaba definido en la literatura; el redondeo del reprecio es una
elección del producto).

### Paso 4 — Move: ImportCartaModal y FormView (½–1 día) 🟢

**Qué se toca:** `ImportCartaModal` → `ImportCartaModal.tsx` (con sus tipos
`ItemImportado`/`ComponenteImportado` y `autoMatch`); `FormView` (ya solo-edición
tras el paso 1) → `EditarPlato.tsx` — el renombre barato colgado del move: el archivo
se llama por lo que hace hoy, no por lo que fue. **Red:** compilador + smoke + probar
en dev un import de carta con archivo real y una edición de plato. **Reversible:**
por commit. **¿Un día?:** sí, sobra.
**Resultado acumulado:** page.tsx ≈ 1.900 líneas y solo dos componentes siguen
adentro: `DetailView` y el shell.

### Paso 5 — DetailView: la única cirugía real, en dos mitades 🟠

**5a. Replace Inline → helpers de `lib/ops/mise.ts` (1 día).**
**Qué se toca:** `handleGuardarOPS` se reescribe para: (1) actualizar `plato_recetas`
vía `useCarta.actualizarPlatoRecetaOpsCompleta`
([useCarta.ts:507](lib/hooks/useCarta.ts#L507) — existe para esto, lo usa CartaBoard);
(2) llamar `sumPlatoRecetaCantidad` + `upsertMiseChecklistItem`; (3) **agregar**
`shrinkOrPruneMise` sobre la plaza de origen cuando cambia, y en el botón "Quitar" —
copiando el flujo de CartaBoard, que es la referencia viva. Se borran las copias
locales de `PLAZAS_OPS`/`SECCIONES_OPS` (import desde `@/lib/ops/mise`). La
conversión capacidad→porciones duplicada ×2 se extrae a
`porcionesDesdeCapacidad(cap, capUnidad, peso, pesoUnidad)` en `lib/ops/mise.ts`
**con test**. `handleCrearTarea` deja de insertar directo: usa
`useTareas({ soloEscritura: true }).agregarTarea` (una línea de hook extra en
`DetailView`; el candado y la derivación `estado`→`status` vuelven a valer).
**Red — antes de tocar:** (i) `/impacto upsertMiseChecklistItem` y
`/impacto shrinkOrPruneMise` para listar los callers que deben quedar idénticos;
(ii) enunciar por escrito (en el mensaje del commit) las DOS diferencias
intencionales de comportamiento: aparece el shrink que faltaba, y la resolución de
sección pasa a ser plaza-safe vía `resolverSeccionMise`; (iii) test con
`mockSupabase` que fije los parámetros exactos con los que `DetailView` llama al
helper en los tres casos (con recipiente, sin recipiente, unidad `porc`).
**Verificación:** matriz manual en dev — asignar OPS desde DetailView y verificar la
fila de `checklist_items` en la base (no solo la UI, gotcha #9); repetir la misma
asignación desde ComposicionEditor y comparar filas; mover de plaza y verificar que
la plaza vieja se achica; Quitar y verificar el prune. **Reversible:** un commit; el
inline viejo queda en el historial. **¿Un día?:** sí — es el día más denso del plan,
pero es UN handler + un botón + un insert.
**Este es el único paso que cambia comportamiento a propósito** (dos fixes). Si no
hay un día entero disponible, no empezarlo.

**5b. Move: `DetailView` → `DetailView.tsx` (½ día, sesión aparte).**
Después de 5a es un move puro (sus queries directas quedaron en 1: el prefill del
panel OPS, [1883-1895](app/(app)/carta/page.tsx#L1883-L1895), que puede quedarse —
es una lectura de conveniencia). **Red:** compilador + smoke. **¿Un día?:** medio.

### Paso 6 — Punto de parada (no es un paso: es la decisión de no seguir)

Tras 5b, `page.tsx` queda en ~700 líneas: el shell con 7 hooks, el ruteo por `view`,
`handleComposicionSave` y `menuToInicial`. **Acá se para.** Lo que quedaría por
"mejorar" no paga:

- `handleComposicionSave` ([3332-3431](app/(app)/carta/page.tsx#L3332-L3431)) orquesta
  hook + helpers de mise — es el borde Catálogo→OPS bien mediado; moverlo a `lib/`
  exigiría pasarle las funciones del hook y no habilita ningún caller nuevo.
- El ruteo por `view` NO se reemplaza por nada (marco §1.3, primera fila).
- `menuToInicial` es mapeo puro; si alguna vez se testea, se extrae en ese momento.

Cada paso deja el código estrictamente mejor que el anterior, así que **el plan se
puede abandonar después de cualquier paso** sin deuda nueva. El orden es de riesgo
ascendente a propósito: los pasos 0-4 construyen la red y achican el archivo para que
el diff del 5a sea revisable.

**Presupuesto total: 4½–6 días de sesión, ninguna >1 día, ninguna bloqueante de las
demás salvo 0→resto y 5a→5b.**

---

## 3. Replicabilidad a las otras cuatro pantallas

| Pantalla | Forma (§1.1 del marco) | Contexto (sesión 2) | ¿Aplica el plan de Carta? | Veredicto |
|---|---|---|---|---|
| [recetario/page.tsx](app/(app)/recetario/page.tsx#L217) (3.804 líneas, 80 estados) | Forma 1: main de ~470 líneas + 15 componentes a nivel de módulo ([PlatosView:688](app/(app)/recetario/page.tsx#L688), [IAResultScreen:1297](app/(app)/recetario/page.tsx#L1297), [NuevaFichaScreen:2021](app/(app)/recetario/page.tsx#L2021)…) | Catálogo (soporte del core) | **Sí, pasos 0-2-4 casi textuales** (smoke + moves). No tiene un equivalente del paso 5: sus escrituras ya van por `/api/recetas/save` y hooks | Hacer **por oportunidad**: la próxima sesión que toque Recetario arranca moviendo lo que va a tocar |
| [facturas/page.tsx](app/(app)/facturas/page.tsx#L2609) (3.636 líneas, 75 estados) | Forma 1: main de ~1.000 líneas + 10 componentes ([ConfirmView:334](app/(app)/facturas/page.tsx#L334), [DetailView:1015](app/(app)/facturas/page.tsx#L1015), [ListasPreciosView:1426](app/(app)/facturas/page.tsx#L1426)…) | Abastecimiento (soporte) | **Sí para los moves** — pero el riesgo real de Facturas no está en la pantalla: está en `useFacturas.crearFactura` (🟠 de la sesión 1, va aparte). No mezclar los dos trabajos | Moves por oportunidad; `crearFactura` por su propio ítem |
| [stock/ClientView.tsx](app/(app)/stock/ClientView.tsx#L205) (3.405 líneas, **86 estados en UN componente**) | **Forma 2**: `StockPage` es todo el archivo | Abastecimiento (soporte) | **No.** Necesita Extract Component con mapeo de estado por eje (los tabs insumos/producciones son el eje visible) | **No refactorizar ahora** (§5). Soporte + churn medio + máxima cirugía = el peor cociente del lote |
| [checklist/ClientView.tsx](app/(app)/checklist/ClientView.tsx#L367) (3.152 líneas, 53 estados) | **Forma 2**: `ChecklistPage` corre de la 367 a la 2776, con dos `return` (grilla de plazas / vista de plaza) | **OPS — CORE** | **No con este plan** — pero es la única forma-2 con un cliente esperando: el container-transform diferido de `PENDIENTES.md` está bloqueado exactamente por esos dos `return`. El corte natural: `PlazaGrid` y `PlazaDetail` como componentes de módulo | Sesión de análisis propia (mapa de estado por eje ANTES de cortar, marco §1.2.4) — **después** de que Carta pruebe el método y **solo** cuando se retome el container-transform o una feature del mise lo pida |

Lo replicable en una frase: **el paso 0 (smoke), el paso 1 (matar muerto primero) y
la mecánica de moves aplican a Recetario y Facturas tal cual; Stock y Checklist
necesitan el mapeo de estado que Carta no necesitó.** Lo específico de Carta: el paso
5a (su cruce de borde con OPS) — Recetario y Facturas no tienen un equivalente
directo.

---

## 4. Cómo se mide que mejoró

Líneas y `useState` son proxies pobres porque se pueden bajar empeorando (partir por
la mitad sin criterio). Las métricas reales, todas instalables en minutos:

**1. El ratchet de ingeniería — un archivo de test que solo aprieta.**
`lib/ingenieria/ratchets.test.ts` (corre con `npm test` → ya está en CI). Fusiona el
🟠-4 de la sesión 1 con las métricas de esta:

```ts
// Techos que solo bajan. Subir uno requiere tocar este archivo a mano
// y justificarlo en el commit — ése es el punto.
const TECHOS_LINEAS: Record<string, number> = {
  'app/(app)/carta/page.tsx': 3910,        // baja con cada paso del plan
  'app/(app)/recetario/page.tsx': 3810,
  'app/(app)/facturas/page.tsx': 3640,
  'app/(app)/stock/ClientView.tsx': 3410,
  'app/(app)/checklist/ClientView.tsx': 3160,
}
// + patrones prohibidos (grep sobre el fuente):
// - createClient() sin useMemo en lib/hooks/**        (gotcha #20 — 3 violaciones hoy)
// - .channel( sin filter: en lib/hooks/**             (gotcha #18 — useCarta hoy)
// - createAdminClient sin requireRestauranteId en app/api/**  (allowlist: cron, invitar)
// - "use client" en lib/<dominio>/ fuera de lib/hooks  (la ley §1.3.B de arquitectura)
```

**2. El radio de impacto, con la herramienta que ya está.** Antes y después de cada
paso: `graphify affected "<símbolo>" --depth 2 | wc -l` para los símbolos compartidos
tocados. La mejora esperable del paso 5a es medible: los símbolos del flujo OPS pasan
de "N callers + 1 copia inline invisible al grafo" a "N+1 callers del mismo helper" —
la copia deja de existir como nodo aparte.

**3. La métrica de verdad, en diferido: la próxima feature de Carta.** "Más fácil de
cambiar" = la sesión que agregue algo a Carta toca 1-2 archivos chicos en vez de leer
3.906 líneas. Se observa en el diff de esa sesión (`git show --stat`): si una feature
de Rentabilidad toca `RentabilidadView.tsx` + `lib/carta/`, el refactor pagó; si
vuelve a tocar `page.tsx`, el corte estuvo mal puesto. Anotarlo en el cierre de esa
sesión futura — es un dato, no una sensación.

**4. La connascence como contador (sesión 1 §3).** El inventario de CoA con grep:
`"duplicada de"`, `"mantener en espejo"`, `"espejo de"`, `"igual que en"`. Hoy: las 3
copias de conversión de unidades, las 2 de `mapRol`, las 3 de `PLAZAS_OPS`, y la
inline de mise. El plan de Carta baja dos (PLAZAS ×3→×2 en 5a, mise inline→0 en 5a);
el ítem CoA del plan consolidado baja el resto. Objetivo medible: grep = solo las
deliberadas documentadas.

---

## 5. Cuándo NO refactorizar — la lista concreta

| No tocar | Por qué |
|---|---|
| `stock/ClientView.tsx` | Soporte + forma 2 (cirugía cara) + sin cliente. Se toca dos veces al mes; el interés no paga el principal. Si una feature de Stock grande llega, primero el mapeo de estado por tabs |
| `facturas/page.tsx` como pantalla | El riesgo de Facturas es `crearFactura` (hook), no el archivo. Partir la pantalla sin mover la escritura es cosmética |
| `operaciones/page.tsx` | Está SOBRE un borde de contextos (`dominio-kos.md` §6): sus tabs son contextos distintos con el gotcha #21 (no se desmontan) como comportamiento ganado. Se corta recién cuando B9/B10 (Reservas) obligue a tocarlo, respetando el mapa |
| `useCarta.ts` y los hooks que funcionan | La regla de la sesión 1 §2.2: la separación se paga por demanda. Lo único que se le hace a `useCarta` es agregar el `filter` del gotcha #18 (una línea por tabla, dentro del ítem ratchets) |
| Renombres en DB (`checklist_*`→mise, `turno_fecha`→jornada) | `dominio-marco.md` §2.4: no se paga. Los renombres van colgados de extracciones (§6 abajo) |
| `ComposicionEditor.tsx` (2.000+ líneas, ya en su archivo) | Ya está extraído y tiene un dueño claro. Grande ≠ enfermo: no tiene duplicación ni queries fuera de su borde. Se parte el día que dos features choquen adentro |
| Tests de render para los componentes movidos | Marco §4: congelan estilos, no atrapan los bugs de este historial |

---

## 6. Renombres colgados de extracciones

La única ventana barata para el glosario (`dominio-kos.md` §3) es el bautismo de lo
nuevo. Colgados de este plan:

| Extracción | Renombre que viaja gratis |
|---|---|
| Paso 4: `FormView` → archivo | `EditarPlato.tsx` — el nombre dice lo que quedó (solo edición), no lo que fue |
| Paso 5a: adopción de helpers mise | Muere la 3ª copia de `PLAZAS_OPS`; los parámetros nuevos usan el vocabulario de `mise.ts` (ya correcto) |
| Futuro corte de `checklist/ClientView.tsx` | **La ventana grande**: los componentes nuevos nacen `Mise*` (`MisePlazaGrid`, `MisePlazaDetail`) — primer paso real para cerrar la sinonimia mise/checklist/Plazas sin tocar una tabla |
| Cualquier Extract Function con fechas | El parámetro se llama `jornada`, no `fecha`/`turno_fecha` (regla 🟡 del glosario) |

---

## 7. Veredicto por dimensión

| Dimensión | Veredicto | En una línea |
|---|---|---|
| Extraibilidad de Carta/Recetario/Facturas | ✅ | Forma 1: las costuras existen, con precedente en la misma carpeta (MenusView, ComposicionEditor, ingenieriaMenu) |
| Extraibilidad de Stock/Checklist | 🔴 | Forma 2: un componente, estado enredado — otra cirugía, otro análisis |
| Red de seguridad hoy | 🔴 | 0 tests sobre las 5 pantallas y 1 solo spec e2e — pero la infraestructura (Vitest+mock+Playwright) está lista, falta escribir 1 smoke por pantalla en refactor |
| Higiene del código vivo de Carta | ⚠️ | ~300 líneas muertas + 1 duplicación grande contra helper existente + realtime sin filter; el resto sano |
| Respeto de bordes de contexto | ⚠️ | 2 de 3 escritores del borde Carta→OPS usan la costura; el plan migra el tercero |
| Precedente del método | ✅ | El propio repo ya hizo tres veces exactamente lo que el plan pide |
| Medibilidad | ✅ | Ratchets (minutos de instalar, corre en CI) + graphify ya operativo |

---

## Cierre

El patrón de las sesiones 1 y 2 se repite por tercera vez: **el proyecto está más
avanzado de lo que sabe.** El "monolito intesteable" de Carta resultó ser nueve
componentes ya separados esperando mudanza, con ~300 líneas muertas, un precedente de
extracción exitosa en la misma carpeta y los helpers del único paso riesgoso ya
escritos y en producción en otros dos callers. El plan no diseña nada nuevo: ordena
mudanzas que el archivo ya insinúa, con el compilador y un smoke de red, y reserva la
palabra "cirugía" para las dos pantallas (Stock, Checklist) que de verdad la
necesitan — una de las cuales no conviene operar todavía.
