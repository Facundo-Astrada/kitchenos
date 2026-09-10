# Plan — Cuadro de estandarización de recetas

Sesión de diseño 2026-09-10 (Opus) → ejecutar con Sonnet.
Origen: pizarrón "Plato y componentes / Receta estandarizada N1-N2-N3".

---

## La idea en una línea

Un plato vale lo que vale su componente más flojo. El cuadro muestra en qué
escalón está cada componente de la carta, qué le falta exactamente para subir,
y **por cuál conviene empezar** (el que destraba más platos).

---

## Las definiciones (derivadas, nunca tipeadas a mano)

El nivel es función pura de datos que ya existen. Nadie lo marca: **sube solo
mientras se carga**. No se crea columna `nivel` ni tabla nueva.

| | Nombre | Se cumple cuando | Qué desbloquea |
|---|---|---|---|
| **N0** | Sin cargar | El plato no tiene ni componentes (`plato_recetas`) ni `receta_id` | nada |
| **N1** | **Nombrada** | Existe la línea (nombre + plaza), sin cuerpo de receta útil | el mise sabe que hay que hacerla |
| **N2** | **Escrita** | Ingredientes con cantidad + `procedimiento` + **gramaje conocido en este plato** | costo **estimado**; el plato ya costea |
| **N3** | **Pesada** | N2 + `peso_total_g` o `peso_escurrido_g` real + **todos** los ingredientes con `producto_id` y `costo_unitario > 0` | costo/g **verificado**; food cost confiable |

### Dos ejes, no uno

- **Eje receta** (propiedad de `recetas`): ¿tiene cuerpo, peso neto, costos de factura?
- **Eje vínculo** (propiedad de `plato_recetas`): ¿se sabe cuánto de esa receta entra en *este* plato?

`nivelComponente = min(nivelReceta, gramajeConocido ? 3 : 1)`

**El gramaje es el peaje de N1→N2.** Una mayonesa puede ser N3 en sí misma y el
plato igual no costear porque nadie cargó cuánto entra. Sin separar los ejes, la
misma receta usada en 5 platos mostraría 5 niveles distintos y no se entiende.

### Por qué N2→N3 es la línea que importa

`pesoTotalRecetaG` (`lib/recetas/peso.ts:80`) cae en la **suma de ingredientes
crudos** cuando no hay `peso_total_g`. Eso oculta el hueco: un fondo de 4 kg de
ingredientes rinde 2,5 L. Costear por gramo con 4000 g en vez de 2500 g
subestima el costo un 37% — y la receta *parece* costeada.

La UI debe decirlo con esas palabras: **"costo/g estimado"** vs **"costo/g pesado"**.

---

## Estado real de los datos (medido 2026-09-10)

| | Bros | El Rescoldo |
|---|---|---|
| Platos en carta | 47 | 32 |
| …con componentes | 27 (120 líneas) | 18 (24 líneas) |
| …con receta directa | 2 | 9 |
| **…sin nada (N0)** | **18** | **5** |
| Componentes con gramaje | 89/120 | **0/24** |
| Recetas activas | 529 | 85 |
| **…con peso neto** | **3** | **0** |
| Ingredientes con costo | 1639/2639 | 200/605 |

**Consecuencia de diseño: hoy N3 es cero en toda la base.** Un panel que abra
con "0% estandarizado" se cierra y no se abre más. Por eso:

1. El alcance es **lo que llega a un plato**, no las 529 recetas del recetario.
2. La cola se ordena **por palanca** (cuántos platos destraba), no alfabético.
3. El titular es un conteo real ("89 de 120 componentes ya costean"), nunca un
   % ponderado inventado.

---

## Decisiones tomadas

| Decisión | Elegido |
|---|---|
| Umbral N3 | Costo de **producto linkeado** (`producto_id` + `costo_unitario > 0`) — el precio viene de facturas, no de memoria |
| Alcance v1 | Panel en Carta + badge de nivel en el detalle del plato. Recetario y ruta de implantación → v2 |
| Componentes comprados | **Declarar el límite en pantalla, no arreglar el schema.** `plato_recetas` no tiene `producto_id` (se sacó ago 2026, ver `columnas.md:28`) |

---

## Pasos

### 1 · `lib/recetas/estandarizacion.ts` — el cálculo puro

Sin `'use client'`, misma convención que `lib/recetas/peso.ts`. Firma:

```ts
export type Nivel = 0 | 1 | 2 | 3

export interface DiagnosticoNivel {
  nivel: Nivel
  faltantes: string[]   // nombrados y accionables: "peso neto", "gramaje en este plato",
                        // "costo de 3 ingredientes", "procedimiento"
  costoPorGramo: number | null
  costoVerificado: boolean   // false = derivado de la suma de crudos
}

// Eje receta: el techo que la receta permite por sí sola.
export function nivelDeReceta(r: RecetaConIngredientes | undefined): DiagnosticoNivel

// Eje componente: min(nivelReceta, gramajeConocido ? 3 : 1)
export function nivelDeComponente(pr: PlatoRecetaEnriquecido): DiagnosticoNivel

// Plato: el mínimo de sus componentes. Sin componentes ni receta_id → N0.
// Con receta_id directa y sin plato_recetas → el plato ES esa receta (1 componente).
export function nivelDePlato(item: CartaItemEnriquecido): DiagnosticoNivel & {
  componentes: { pr: PlatoRecetaEnriquecido | null; nombre: string; diag: DiagnosticoNivel }[]
}

// Agregado de toda la carta.
export function analizarCarta(items: CartaItemEnriquecido[]): {
  totalPlatos: number
  totalComponentes: number
  porNivel: Record<Nivel, number>          // conteo de componentes
  platosPorNivel: Record<Nivel, number>
  platosQueCostean: number                  // FC calculable = todos sus componentes ≥ N2
  cola: {                                   // ordenada por palanca desc
    receta_id: string
    nombre: string
    nivel: Nivel
    platosQueDestraba: number
    platos: string[]
    faltantes: string[]
  }[]
}
```

Reglas finas:
- **N1 vs N2**: "cuerpo de receta útil" = `ingredientes.length > 0` **y**
  `procedimiento.trim() !== ''`. `status === 'draft'` tapa en N1 (ya es el
  criterio de `faltaEstandarizar` en `recetario/page.tsx:2278`).
- **Gramaje conocido**: usar el gramaje efectivo, que ya contempla el fallback
  `checklist_items.peso_porcion` → ver paso 2.
- **N3 costos**: `ingredientes.every(i => i.producto_id && (i.costo_unitario ?? 0) > 0)`.
  Con 0 ingredientes no aplica (ya tapó en N1).
- **Subrecetas** (`ingredientes.subreceta_id`): en v1 se tratan como un
  ingrediente más. No recursar. Anotarlo con comentario — hay 7 en toda la base.

Tests en `lib/recetas/estandarizacion.test.ts` (Vitest, junto al archivo, misma
convención que `lib/carta/ingenieriaMenu.test.ts`). Casos mínimos: los tres del
pizarrón (Ciboulette N1 / Puré N2 / Mayonesa N3), plato sin nada → N0, plato con
receta directa, receta N3 pero sin gramaje → componente N1, y el mínimo mandando
sobre el promedio.

### 2 · Exponer el gramaje efectivo — cambio de una línea en `useCarta.ts`

`costo_calculado != null` no sirve para "hay gramaje": conflaciona gramaje con
costo/g disponible. En `lib/hooks/useCarta.ts:225`, donde ya se computa
`gramajeEnG` (con el fallback de `misePesoMap`), agregarlo al objeto:

```ts
platoRecetasMap[pr.plato_id].push({ ...pr, receta: r, costo_calculado, gramaje_efectivo_g: gramajeEnG })
```

y el campo `gramaje_efectivo_g: number | null` a `PlatoRecetaEnriquecido`
(interfaz en `useCarta.ts:71`), con comentario de por qué existe aparte de
`gramaje`. Cero queries nuevas.

### 3 · La vista `Estandarización` en Carta

Vista propia, **no** un tab de Rentabilidad: Rentabilidad está cerrada tras
`verCostos` (`carta/page.tsx:99`) y esto es trabajo de cocina, no de plata — un
sous chef tiene que poder ver qué le falta pesar sin ver precios.

- `type View` en `carta/page.tsx:66` → agregar `'estandarizacion'`.
- Gate: `canEdit` (`isAdmin || puedeEditar('carta')`), **nunca `verCostos`**.
  Los números de plata que aparezcan (costo/g) se ocultan con `verCostos`
  aparte; el nivel y los faltantes se ven siempre.
- Archivo nuevo `app/(app)/carta/EstandarizacionView.tsx`, mismo patrón que
  `RentabilidadView` (header navy + back + título).

Contenido, en orden:

1. **Barra apilada** de los 4 niveles sobre el total de componentes, con
   conteos al pie. CSS divs con `width: X%` — **no Chart.js** (CLAUDE.md).
2. **Titular real**: "89 de 120 componentes ya costean · 0 con peso verificado".
3. **"Empezá por acá"** — la cola por palanca, top 8. Cada fila: nombre,
   badge de nivel, "→ destraba 6 platos", y los faltantes nombrados.
4. **Por plato** — lista con el nivel del plato y una mini-barra de segmentos,
   uno por componente, coloreado por nivel: se ve de un vistazo cuál lo arrastra.
   Click → `onOpenPlato(id)`, que ya abre `DetailView` donde el gramaje se
   edita inline (`DetailView.tsx:582`).
5. **Nota de límite** al pie: no incluye productos comprados que van directo al
   plato (pan, limón) — hoy no se pueden cargar como componente.

**Presupuesto de ámbar (DESIGN.md:44): ≤ 3 elementos ámbar simultáneos.** 40
badges naranjas violan la regla. Los N1/N0 se agregan en contadores y en la
barra; el ámbar se reserva para el titular y la cabecera de la cola. Los
niveles se distinguen por peso/etiqueta, no por 4 colores de alarma.

Registro Preparación (DESIGN.md §2): es pantalla de trabajo de escritorio/tablet,
no de servicio.

### 4 · Badge de nivel en el detalle del plato

En `DetailView.tsx`, junto al nombre del plato: el nivel resultante + "N de M
componentes en N3". Y por componente, en la fila que ya muestra el gramaje, el
badge de su nivel con `title` de faltantes. Reusa `nivelDePlato` — sin lógica
duplicada.

### 5 · Verificación

- `npx vitest run` (406 tests hoy + los nuevos)
- `npm run build` (typecheck)
- **En pantalla**: abrir Carta → Estandarización con Bros (120 componentes
  reales, 89 con gramaje) y con El Rescoldo (24 componentes, 0 con gramaje —
  el caso peor, que es el que hay que ver que no deprima).
- Commit + push (deploy automático).

---

## v2 — hecho (2026-09-10, misma sesión, después de shippear v1)

- ✅ **Escala N1/N2/N3 en las cards del Recetario** — reemplazó el binario
  "SIN PESO NETO". `RecetaCard` ahora usa `nivelDeReceta(r, recetasPorId)` +
  `NivelBadge` (reexportado desde `carta/EstandarizacionView.tsx`, cross-import
  de route segment — hay precedente en el repo, ver `facturas/page.tsx`).
  Verificado en pantalla contra El Rescoldo: badges N1/N2 reales por card.
- ✅ **Arreglado el número falso de la estación 2.3**: `cartaSinEstandarizar`
  reusaba el conteo de "sin receta" (mentía). Ahora `useRutaImplantacion.ts`
  exporta `fetchCartaItemsData` desde `useCarta.ts` y corre `analizarCarta`
  sobre el árbol completo — la única consulta no-liviana del fetcher (el resto
  son counts), corre en paralelo, degrada a 0 si falla (mismo patrón que el
  resto). Costo aceptado porque esta pantalla abre ~1 vez por día
  (`dedupingInterval: 300_000`).
- ✅ **Recursión en subrecetas** — un ingrediente `tipo:'subreceta'` no tiene
  `producto_id` propio; sin resolverlo, siempre contaba como "sin costo" aunque
  la subreceta detrás estuviera perfecta. `nivelDeReceta` ahora acepta
  `recetasPorId?: Map<string,Receta>` opcional y recursa (con guarda de ciclo).
  Pasado en los 3 call sites que ya tienen el recetario completo en memoria
  (Carta vía `useRecetas()`, DetailView, Recetario). `useRutaImplantacion` NO
  lo recibe — 7 filas en toda la base, no vale una fetch más en ese hook.

Tests: 427/427 (17→21 en `estandarizacion.test.ts`, +4 de subrecetas incluido
un ciclo que no debe colgar). Build + typecheck limpios. Lint: mismo baseline
pre-existente (22 problemas en `recetario/page.tsx`+`useRutaImplantacion.ts`,
idéntico antes/después).

## Fuera de alcance (quedó para v3)

- `producto_id` en `plato_recetas` para componentes comprados (pan, limón,
  vino) — deliberadamente NO se hizo esta sesión: toca schema (migración),
  costeo, el buscador de `ComposicionEditor` y probablemente el mise (¿un
  producto comprado genera tarea?). Tamaño distinto a los tres ítems de
  arriba — amerita su propia sesión ("una sesión = un tema", CLAUDE.md).
