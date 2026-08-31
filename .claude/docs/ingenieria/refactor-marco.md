# Refactorización y estrangulamiento — marco de decisión

*Fuente de ingeniería de software · Núcleo 3 de 3 · Agosto 2026*

Este documento destila la disciplina de refactorizar código vivo para los proyectos
Antigravity (Next.js App Router + Supabase, un desarrollador con Claude Code, clientes
en producción). Como los dos marcos anteriores, no es un resumen de manual: cada
técnica entró porque hay un archivo concreto donde aplica, y lo que no aplica está
descartado con su porqué.

Regla de lectura: cada técnica contesta **qué problema resuelve, qué cuesta, y cómo se
reconoce que hacía falta**. Si venís con la pregunta concreta ("tengo un archivo de
3.000 líneas, ¿por dónde empiezo?"), andá directo a §1.4. Si venís a decidir qué red
de tests poner antes de mover algo, §3.5.

Las tres restricciones duras que gobiernan todo el marco, antes que cualquier técnica:

1. **Todo paso es reversible y verificable.** Un paso que no se puede abandonar a la
   mitad dejando el código igual o mejor no es un paso: es una apuesta.
2. **Todo paso entra en una sesión de un día** (regla de método de `CLAUDE.md`). Un
   plan cuyo primer paso son tres días no se ejecuta nunca.
3. **Nunca reescribir.** El comportamiento de este código está ganado a los golpes
   (optimismo local, eco de realtime, dedupe en vuelo, cola offline — la lista de
   `arquitectura-kos.md` §2.4). Una reescritura los pierde todos a la vez.

La medición de KitchenOS contra este marco vive en `refactor-kos.md`, al lado; el
cruce de las tres sesiones en `plan-consolidado.md`.

---

## 1. El catálogo de Fowler, filtrado a componentes React de miles de líneas

### 1.1 La distinción previa que ordena todo: mover vs. extraer

Fowler cataloga ~70 refactorizaciones asumiendo que el problema es *encontrar* la
estructura escondida en el código. En un archivo React gigante hay una pregunta
anterior: **¿la estructura ya existe y solo está mal ubicada, o hay que crearla?**
Las dos situaciones se parecen desde afuera (un archivo de 3.500 líneas) y cuestan
10× distinto:

| Forma del archivo | Qué es | Operación | Riesgo |
|---|---|---|---|
| **Componentes ya separados a nivel de módulo** en el mismo archivo, cada uno con su interfaz de props tipada | La descomposición ya está hecha; solo falta repartirla en archivos | **Mover** (Move Function §1.2.1) — cortar y pegar con imports; el compilador verifica todo | Bajo: un move que compila y buildea es casi seguro correcto |
| **Un solo componente gigante** con decenas de `useState` compartidos entre subárboles de JSX | La descomposición no existe; el estado ata todo con todo | **Extraer** (Extract Component §1.2.4) — decidir qué estado va con qué subárbol, crear la interfaz | Alto: cada `useState` mal asignado es un bug de sincronización o un remount que pierde foco/teclado |

Diagnóstico en 30 segundos: `grep -n "^function " archivo.tsx`. Muchas funciones
componente a nivel de módulo → forma 1. Una sola función de miles de líneas → forma 2.
El segundo diagnóstico es contar `useState` **por componente**, no por archivo — el
total del archivo es un número de prensa; lo que mide el riesgo es el máximo en un
solo componente.

### 1.2 Las refactorizaciones que sirven acá

**1.2.1 Move Function — mover un componente ya separado a su archivo.**

- *Qué resuelve:* el costo de lectura y de merge. Un archivo de 3.900 líneas obliga a
  cargar todo para tocar cualquier cosa, y dos cambios cualesquiera chocan.
- *Qué cuesta:* casi nada por componente movido (cortar, pegar, ajustar imports,
  compilar). Los tipos de las props ya son la interfaz; no hay que diseñar nada.
- *Cómo se reconoce que hacía falta:* el archivo ya tiene `function Componente({...}:
  {...tipos...})` a nivel de módulo. Cada una de esas firmas es una costura lista.
- *La red:* el compilador. Un move no cambia comportamiento por construcción — si
  `tsc --noEmit` y el build pasan, y un smoke e2e recorre la pantalla, el paso está
  verificado. Escribir tests de componente *antes* de un move es pagar la red más
  cara para el paso más barato.

**1.2.2 Extract Function — el cálculo sale del componente hacia `lib/` con test.**

- *Qué resuelve:* lógica no testeable (vive en un `useMemo`/handler y solo se puede
  ejecutar montando la pantalla) y duplicable (el próximo que la necesita la
  reescribe porque no puede importarla).
- *Qué cuesta:* identificar los inputs reales (suelen ser menos de los que el closure
  sugiere), escribir la función pura, escribir el test. Una a tres horas por cálculo.
- *Cómo se reconoce:* un `useMemo` de >10 líneas con lógica de negocio (umbrales,
  clasificación, orden), o un handler que calcula antes de escribir.
- El precedente interno es
  [lib/carta/ingenieriaMenu.ts:1-9](lib/carta/ingenieriaMenu.ts#L1-L9): extraído "para
  poder testearlo sin montar el componente", y el test escrito en la extracción
  **encontró que el algoritmo estaba mal** (promedio simple donde el método pide
  ponderado). Ver §3.2 por lo que eso enseña sobre caracterización.
- Regla de destino: la función va a `lib/<dominio>/` del contexto dueño
  (`dominio-kos.md` §1), sin `'use client'`, con la firma
  `(supabase, restauranteId, input)` si toca datos (`arquitectura-marco.md` §2.2).

**1.2.3 Replace Inline Code with Function Call — la duplicación contra un helper que ya existe.**

- *Qué resuelve:* connascence de algoritmo (CoA) entre un bloque inline y un helper de
  `lib/` que hace lo mismo. Es la más rendidora del catálogo en este repo, porque las
  sesiones 1 y 2 mostraron que **los helpers suelen ya existir**: el código inline es
  el que quedó viejo.
- *Qué cuesta:* verificar la equivalencia semántica (el helper puede ser mejor — más
  nuevo, con fixes que el inline no tiene) y migrar el caller. Medio día con
  verificación manual.
- *Cómo se reconoce:* antes de extraer nada, `grep` en `lib/<dominio>/` por el
  concepto. Si el helper existe, la refactorización no es Extract: es Replace — y el
  diff es *negativo*.
- *La trampa:* "equivalente" casi nunca es idéntico. El helper nuevo suele arreglar
  algo que el inline no (y a veces al revés). La diferencia hay que **enunciarla por
  escrito antes de migrar** y decidir conscientemente cuál comportamiento gana —
  nunca descubrirla en producción.

**1.2.4 Extract Component — la cirugía sobre el monolito de un solo componente.**

- *Qué resuelve:* la forma 2 de §1.1 — el componente único donde 80 estados atan
  tabs/vistas que no comparten nada.
- *Qué cuesta:* mucho más que todo lo anterior. Por cada subárbol hay que clasificar
  su estado en tres pilas: (a) local del subárbol → se muda adentro, (b) compartido
  real → queda arriba y baja por props, (c) compartido accidental (dos vistas usan
  el mismo `useState` por comodidad) → se duplica o se decide un dueño. El error en
  (b)/(c) produce bugs de sincronización que ningún compilador ve.
- *Cómo se reconoce que conviene:* el componente tiene ejes internos visibles — tabs,
  un `view`/modo con returns distintos, secciones que nunca se renderizan juntas. El
  eje es la línea de corte; sin eje visible, no cortar (ver §6).
- *La red:* acá sí hay que caracterizar antes (ver §3), porque el compilador no
  protege la re-asignación de estado. Y el anti-patrón documentado del proyecto
  aplica de lleno: el componente extraído va a **nivel de módulo con props**, jamás
  definido adentro del padre (`hooks.md` § Anti-patrón — remount y pérdida de foco).

**1.2.5 Introduce Parameter Object — cuando las props viajan en manada.**

- *Qué resuelve:* firmas de 12-15 props que se repiten en cada caller y crecen de a
  una. En React el "objeto" natural ya existe: el tipo del dominio
  (`CartaItemEnriquecido`) o un payload con nombre (`CompPayload`).
- *Qué cuesta:* minutos, pero solo paga si el grupo de props es un concepto real. Diez
  callbacks `onX` no son un concepto: son la señal de otra cosa (el hijo quiere el
  hook, o una parte de él — la variante `soloEscritura` de `hooks.md` es la solución
  de este stack, no un objeto de callbacks).
- *Cómo se reconoce:* el mismo trío de props cruza dos o más niveles sin que el nivel
  intermedio los use (prop drilling), o cada feature nueva agrega una prop más a la
  misma firma.

**1.2.6 Split Phase — separar leer-de-transformar-de-escribir.**

- *Qué resuelve:* funciones que mezclan fases y por eso no se pueden testear ni
  reusar por partes. La fase pura del medio (transformar) es la que se extrae con
  test; las fases con IO quedan finas.
- *Qué cuesta:* definir la estructura de datos intermedia entre fases.
- *Cómo se reconoce:* un handler que hace fetch → cálculo → insert en un solo cuerpo;
  o un fetcher que además de traer, enriquece (ese enriquecimiento es una fase pura
  atrapada). Los flujos de importación del proyecto ya tienen la forma correcta
  (parse → preview editable → apply): al partir un monolito, respetar esas fases como
  bordes de corte.

**1.2.7 Encapsulate Variable y Rename — ya cubiertos, con una regla nueva.**

La degradación CoM → constante con nombre y el resto de la tabla de
`arquitectura-marco.md` §3.5 no se repiten acá. Lo que este marco agrega es la regla
del **renombre colgado**: renombrar en producción no se paga como tarea propia
(`dominio-marco.md` §2.4), pero **una extracción es la única ventana en la que
renombrar es gratis** — el archivo nuevo, la función nueva y sus parámetros nacen sin
historia, así que nacen con el nombre del glosario. Todo paso de extracción debe
consultar el glosario (`dominio-kos.md` §3) al bautizar. Es la única forma en que las
rupturas de "turno"/"mise" se van a cerrar sin una migración que nadie va a hacer.

### 1.3 Lo que se descarta del catálogo, y por qué

| Descartado | Por qué no acá |
|---|---|
| **Replace Conditional with Polymorphism** para el ruteo de vistas | La cadena `if (view === 'x') return <XView/>` de una pantalla es plana, mutuamente excluyente y se lee entera de un vistazo. Reemplazarla por un registry de vistas agrega indirección sin variación real que proteger. Donde el patrón sí paga (variación abierta: tools del Coach, proveedores fiscales) **ya está aplicado**. |
| **Move Field** (mover/renombrar columnas) | En producción es una migración con datos vivos, no una refactorización. La sesión 2 ya legisló: glosario prescriptivo hacia adelante, descriptivo hacia atrás. |
| **Extract Class / Inline Class / Hide Delegate / Middle Man** | Presuponen objetos. Este código es funciones y módulos; su equivalente ya está cubierto por Move/Extract Function. |
| **Replace Temp with Query** | `useMemo` ya es esa refactorización institucionalizada por React. |
| **Refactorización especulativa** ("dejarlo preparado para...") | Variación que no llegó no se protege (`arquitectura-marco.md` §1.4). Se refactoriza con un cliente concreto: una feature, un bug, una venta. |

### 1.4 Tabla de decisión — "tengo este archivo de 3.000 líneas, ¿por dónde empiezo?"

| Lo que ves | Primer paso | Técnica | Red mínima |
|---|---|---|---|
| Componentes ya a nivel de módulo con props tipadas | Mover el más grande sin estado a su archivo | Move Function | Compilador + build + smoke e2e |
| Código muerto (vista inalcanzable, const sin uso) | Borrarlo ANTES de mover nada — no se refactoriza lo que no corre | delete + `grep`/`tsc` que confirme cero referencias | Compilador + smoke |
| Un `useMemo`/handler con cálculo de negocio | Extraerlo a `lib/<dominio>/` con test en el mismo commit | Extract Function + caracterización | El test nuevo |
| Un bloque inline que huele a algo que `lib/` ya hace | `grep lib/<dominio>` primero; si existe, migrar al helper | Replace Inline Code | Test de equivalencia + verificación manual documentada |
| Un solo componente gigante con tabs/vistas internas | NO mover nada todavía: mapear qué estado usa cada eje | Extract Component (cirugía) | Caracterizar el eje antes de cortar (§3) |
| Escritura multi-tabla inline en un handler | Ver la tabla de `arquitectura-marco.md` §2.4 y `dominio-marco.md` §3.2 — es un problema de agregado, no de tamaño | (firma repositorio / rpc) | Test del helper con mock |
| JSX parecido repetido en dos vistas | Tolerarlo. La duplicación de vista es barata y las vistas divergen | — (regla de tres, ver §6) | — |

---

## 2. Migrar código vivo — las tres estrategias

Las tres responden a la misma restricción: **el producto no se congela**. Difieren en
qué artefacto migran y dónde vive la conmutación entre lo viejo y lo nuevo.

### 2.1 Strangler fig — para pantallas

**Qué es** (Fowler, 2004): lo nuevo crece alrededor de lo viejo, intercepta una parte
del tráfico por vez, y lo viejo muere cuando nadie lo llama — nunca hay un día de
switch total.

**La traducción a una pantalla React de este stack:** la unidad de estrangulamiento es
**la vista interna**, no la pantalla. Una pantalla con ruteo por estado
(`if (view === 'x') return <XView/>`) ya tiene la forma estranguladora: cada rama es
independiente del resto, así que cada rama puede mudarse a su archivo (forma 1) o
reconstruirse al lado (forma 2) mientras las demás no se enteran. La conmutación ya
existe y ya está en producción: es el propio `view`.

- *Qué cuesta:* convivir con el híbrido (parte movida, parte no) durante semanas. Ese
  costo es el precio de la reversibilidad y se paga con gusto.
- *Cómo se reconoce que es la estrategia correcta:* podés nombrar las vistas de la
  pantalla sin mirar el código. Si no podés, el eje de corte no está claro y falta
  el paso de mapeo.
- *Regla de orden:* primero las ramas sin estado compartido (presentacionales), después
  las que solo comparten datos del hook, al final las que comparten estado mutable.
  El riesgo crece en ese orden; la confianza y el archivo achicado también.

### 2.2 Branch by abstraction — para la capa de acceso a datos

**Qué es** (Hammant 2007; Fowler 2014): cuando muchos callers dependen de una
implementación que hay que cambiar, se introduce primero la abstracción, se apunta un
caller por vez hacia ella, y recién cuando el último migró se borra lo viejo. Todo en
`main`, sin branch largo de git.

**La traducción:** la abstracción de este stack ya está elegida — la función con firma
`(supabase, restauranteId, input)` en `lib/<dominio>/` (`arquitectura-marco.md` §2.2).
Branch by abstraction es exactamente cómo se ejecutan las unificaciones de copias
(`mapRol` ×2, unidades ×3, y toda duplicación cliente/servidor): (1) crear el módulo
sin `'use client'` con el algoritmo canónico y su test; (2) migrar los callers de a
uno, cada uno un commit verde; (3) borrar las copias. Entre (1) y (3) el sistema tiene
ambas versiones y **eso está bien** — es el estado intermedio que compra
reversibilidad.

- *Qué cuesta:* disciplina de terminar. El estado intermedio es estable, así que nada
  obliga a completar la migración — y una abstracción con la mitad de los callers es
  otra copia más. El antídoto: dejar el ítem de "borrar lo viejo" anotado en el
  backlog en el mismo commit que crea la abstracción.
- *Cómo se reconoce:* más de ~3 callers del código a cambiar, o callers en los dos
  lados de la frontera `'use client'`.

### 2.3 Parallel change y parallel run — para endpoints y cálculos de plata

**Parallel change / expand-contract** (Sato, 2014): para cambiar un contrato con
callers vivos — el shape de un body, la firma de un endpoint — primero se **expande**
(el receptor acepta forma vieja y nueva), luego migran los emisores, luego se
**contrae** (se borra la vieja). Es la única forma de cambiar un endpoint que
navegadores con el bundle viejo siguen llamando durante horas después del deploy — la
versión de este stack del problema, ya resuelta una vez con el trigger que ignora lo
que mande el cliente (`hooks.md` #22).

**Parallel run** (shadow mode): las dos implementaciones corren con los mismos inputs,
la vieja manda, la nueva solo loguea, y se conmuta cuando la divergencia es cero por
un período. Caro (doble ejecución + comparador + ventana de observación).

- *Cuándo parallel run acá:* solo para cálculos donde un error es plata silenciosa y
  no hay test que dé confianza equivalente — mover el matching de facturas al
  servidor, un recálculo de costos. Y la versión barata primero: si el cálculo es
  puro, un test que corra ambas implementaciones sobre fixtures reales exportados de
  producción **es** un parallel run sin infraestructura.
- *Cuándo no:* para todo lo demás. Un parallel run de UI no existe; ahí la red es el
  smoke y la reversibilidad del commit.

### 2.4 Tabla de decisión — qué estrategia para qué artefacto

| Artefacto a migrar | Estrategia | Conmutador | Se borra lo viejo cuando |
|---|---|---|---|
| Pantalla monolítica (forma 1 o 2) | Strangler por vista interna | El `view`/tab que ya existe | La rama quedó vacía en el archivo original |
| Capa de acceso a datos / lógica duplicada cliente-servidor | Branch by abstraction | El import de cada caller | El último caller migró (grep = 0) |
| Contrato de endpoint con clientes desplegados | Parallel change (expand-contract) | El receptor acepta ambas formas | Los bundles viejos expiraron (~días) |
| Cálculo de plata que cambia de lugar | Parallel run barato (ambas impl. sobre fixtures reales) | Un test comparador | Divergencia cero sobre el corpus |
| Hook que funciona | **No se migra.** | — | — |

---

## 3. Tests de caracterización — la red

### 3.1 Qué son

Un test de caracterización (Feathers, 2004) documenta **lo que el código hace hoy**,
no lo que debería hacer: se ejecuta el código actual, se observa la salida, y esa
salida se convierte en la aserción. Su variante para salidas grandes es el **golden
master** (approval testing): en vez de asertar campo por campo, se guarda la salida
completa como snapshot aprobado y el test falla ante cualquier diferencia.

Su propósito no es encontrar bugs: es **detectar cambios de comportamiento no
intencionales** durante una refactorización. Por eso se escriben rápido, sin juzgar
si el comportamiento observado es correcto.

### 3.2 El dilema, y la postura de este marco

La literatura tiene dos respuestas encontradas a "¿tests antes de extraer, o la
extracción es lo que hace testeable?":

- **Feathers**: nunca toques código sin red; si no se puede testear, hacé solo las
  "movidas seguras" mínimas (apoyarse en el compilador, sprout method) hasta abrir
  una costura, y ahí testeá. Escrito para C++/Java legacy sin tipos confiables ni
  costuras.
- **La crítica práctica** (corriente que va de Fowler a Dodds): caracterizar un
  monolito de UI desde afuera exige montar todo con sus estados — tests carísimos,
  frágiles, que congelan detalles de render que van a cambiar mañana a propósito.

**La postura, en tres reglas — porque la respuesta depende del tipo de paso:**

1. **Para movimientos (Move Function, forma 1): el compilador ES la caracterización.**
   TypeScript estricto verifica cada prop, cada import y cada tipo del componente
   movido — exactamente lo que un test de caracterización de la interfaz verificaría,
   gratis y sin congelar nada. La red se completa con un smoke e2e de la pantalla
   (¿renderiza? ¿el flujo principal anda?), que se escribe **una vez** y cubre todos
   los moves de esa pantalla. Escribir tests de componente antes de mover es la
   recomendación de Feathers aplicada a un contexto que no la necesita.

2. **Para extracciones de lógica (Extract Function, Replace Inline): la
   caracterización se escribe en el mismo commit que la extracción, sobre la costura
   nueva.** La extracción es lo que hace testeable — y el test se escribe ahí mismo,
   con las salidas actuales como aserciones, no después ("después" no llega). El
   precedente interno es exacto:
   [ingenieriaMenu.ts](lib/carta/ingenieriaMenu.ts#L1-L9) se extrajo, se testeó en el
   acto, y el test reveló que el comportamiento actual estaba mal. Ahí aparece la
   decisión que la caracterización pura esquiva: **congelar el bug o arreglarlo.** La
   regla: se decide explícitamente, se anota en el header del módulo (como hizo
   ingenieriaMenu), y si se arregla, el cambio de comportamiento se declara en el
   commit — nunca se descubre en producción.

3. **Para cirugía de estado (Extract Component, forma 2): caracterizar ANTES, pero al
   nivel del eje, no del pixel.** Antes de cortar un monolito de 80 estados, la red
   mínima es un test (o checklist manual escrita) por cada eje de corte: qué se ve y
   qué anda en cada tab/vista, cuáles acciones cruzan de un eje a otro (esas son las
   que se rompen). Acá sí vale el orden de Feathers, porque el compilador no ve la
   re-asignación de estado.

### 3.3 Golden master: cuándo sí

Paga cuando la salida es grande, estable y comparable como dato: la tabla de filas que
alimenta un PDF, la lista ordenada de un reprecio, el resultado de una clasificación
sobre un corpus real. La mecánica barata en este stack: exportar fixtures reales (un
JSON con los items de una cuenta de producción, anonimizado si hace falta), correr la
función extraída, `expect(resultado).toMatchSnapshot()` de Vitest. No paga para JSX
(los snapshots de render se aprueban sin mirarse — ruido, no red) ni para salidas con
timestamps/ids no deterministas sin normalizar primero.

### 3.4 La mecánica en este stack

- **Vitest solo corre `lib/**/*.test.ts`** ([vitest.config.ts:7](vitest.config.ts#L7)).
  Consecuencia de diseño, no limitación: la lógica extraída va a `lib/` y su test al
  lado — no hay que tocar la config ni inventar tests bajo `app/`.
- **Para lógica con IO**, el mock reusable ya existe
  (`lib/test-utils/mockSupabase.ts`, patrón completo en `testing.md`): una función con
  firma `(supabase, restauranteId, input)` se testea pasándole el mock — otra razón
  por la que esa firma es la abstracción correcta de §2.2.
- **El smoke e2e** se escribe con el molde de
  [e2e/salon-kds.spec.ts](e2e/salon-kds.spec.ts#L28-L34) (login + navegar + asertar lo
  visible). Corre manual contra el dev server; no está en CI y no hace falta que esté
  para servir de red de refactor — se corre antes y después de cada sesión de moves.

### 3.5 Tabla — qué red para qué paso

| Paso | Red que se escribe | Red que NO se escribe |
|---|---|---|
| Borrar código muerto | `grep` de referencias = 0, compilador | Nada más |
| Move Function (forma 1) | Smoke e2e de la pantalla (una vez por pantalla) + compilador + build | Tests de componente del código movido |
| Extract Function | Test unitario con las salidas actuales, mismo commit | Test del componente que la usaba |
| Replace Inline → helper existente | Enunciado escrito de las diferencias + test del helper (si no tiene) + verificación manual documentada | Parallel run (salvo plata) |
| Extract Component (forma 2) | Checklist/test por eje ANTES de cortar | Snapshots de JSX |
| Mover cálculo de plata de lugar | Fixtures reales + test comparador (parallel run barato) | Confianza |

---

## 4. Estrategia de tests por capa — pirámide vs. trofeo

**La pirámide** (Cohn, 2009): muchos unit, menos integración, pocos e2e — porque en
2009 el unit era barato y el e2e carísimo e inestable. **El trofeo** (Dodds, 2018):
una base de análisis estático, pocos unit, **mayoría de integración** ("tests que usan
el código como lo usa el usuario"), pocos e2e — porque en un frontend moderno el unit
de detalles internos se rompe con cada refactor sin atrapar bugs reales, y la
integración da más confianza por test.

**El veredicto para este proyecto: la distribución actual ya es un trofeo, y está
bien — lo que falta no es cambiar de forma sino completar dos pisos.**

| Piso del trofeo | Qué es acá | Estado |
|---|---|---|
| **Estático** | TypeScript estricto + ESLint + `design-lint.mjs` + los ratchets de ingeniería (propuestos en `refactor-kos.md` §6) | La base más fuerte del stack — y la más barata de ampliar: un chequeo estático nuevo cuesta minutos y corre en cada build |
| **Unit** | Los 12 tests de `lib/` puro (dominios: turnos, mise, dedupe, state machine, ingeniería de menú...) | Correcto y bien apuntado: está donde está el core (`dominio-kos.md` §2). Crece solo con cada Extract Function — no perseguir cobertura |
| **Integración** | Los tests de hooks con `mockSupabase` (`useTareas`, `usePermisos`) — el código ejercitado como lo usa una pantalla, con el IO mockeado en el borde | **El piso incompleto que más paga.** El siguiente hook se testea cuando se toca, con el patrón ya escrito — no en batch |
| **E2E** | 1 spec (salón→KDS→bump) | Completar con 1-2 smokes de las pantallas en refactor. No más: cada spec es mantenimiento perpetuo |

Los **anti-objetivos**, tan importantes como los objetivos:

- **No escribir tests de render de componentes de gestión.** Un test que monta
  `PlatoCard` y aserta que muestra el precio congela estilos que cambian a propósito
  y no atrapa ninguno de los bugs reales del historial del proyecto (que son de
  estado, timing, tenant y unidades — todos de capa hook/lib).
- **No perseguir el número de cobertura.** La config ya lo dice bien
  ([vitest.config.ts:11-13](vitest.config.ts#L11-L13)): el 0% de los hooks sin test es
  "señal honesta". La cobertura útil se mide en otra moneda: ¿los bugs que ya
  pasaron tienen test que los hubiera atrapado? (los de `lib/ops/` sí — por eso esos
  tests existen).
- **No meter Playwright a CI todavía.** Necesita server + seed estable; es una sesión
  propia con valor marginal bajo mientras los specs sean 2-3 y se corran a mano en
  las sesiones que refactorizan.

---

## 5. Deuda técnica — cuadrantes, medición, cuándo se paga

### 5.1 Los cuadrantes de Fowler (2009), con los ejemplos del repo

|  | **Deliberada** | **Inadvertida** |
|---|---|---|
| **Prudente** | "Lo enviamos así y lo sabemos": fiscal fire-and-forget, `ref_id` sin FK, ventana de 60 días, tabs que no se desmontan. Documentada en comentarios largos — las tablas §6/§7 de las sesiones 1 y 2 son el inventario | "Ahora sabemos cómo se hacía": el dedupe que debió ser constraint desde el día 1, el patrón SWR que los hooks viejos no conocían. Es la deuda **inevitable** de aprender — se paga al tocar, sin culpa |
| **Imprudente** | "No hay tiempo para diseño" sabiéndolo: casi no hay en este repo — la excepción es acumular pantalla sin extraer cuando el precedente ya existía | "¿Qué es un layering?": los 3 endpoints sin auth, las violaciones al gotcha #20 del propio proyecto, el inline que duplica un helper existente. Es la única deuda que además es **evitable con chequeos**: cada ítem de esta celda debería convertirse en un ratchet de CI |

La celda que importa operativamente es la última: **deuda imprudente-inadvertida =
candidata a chequeo automático**, porque por definición nadie la vio al escribirla y
nadie la va a ver la próxima vez. Las otras tres celdas se gestionan con backlog y
comentarios; esta se gestiona con estructura (el meta-hallazgo de
`arquitectura-kos.md` §5: cada gotcha verificable migra de prosa a chequeo).

### 5.2 Cómo se mide (el interés, no el principal)

El principal (horas de arreglar) ya está estimado ítem por ítem en `PENDIENTES.md`. Lo
que decide si se paga es el **interés** — cuánto cuesta por mes NO arreglarlo — y ese
se mide con tres indicadores que el proyecto ya produce solo:

1. **Prosa compensatoria.** Cada doc de gotchas, memoria de Claude o comentario
   "acordate de" que existe para convivir con una estructura es interés puro
   (`arquitectura-marco.md` §3.4). Se cuenta con grep (`"mantener en espejo"`,
   `"duplicada de"`, `"no confundir"`).
2. **Fricción de sesión.** Cuántos archivos hay que leer para el cambio típico de una
   pantalla. Es el impuesto del monolito y se observa en cada sesión de trabajo real
   — la métrica de mejora de `refactor-kos.md` §6 lo formaliza.
3. **Bugs con historia.** Cuando un bug de producción se rastrea a una estructura (dos
   copias divergieron, un estado compartido accidental), esa estructura pasó de deuda
   a siniestro. El repo conmemora estos en comentarios — son el argumento definitivo
   de pago.

### 5.3 Cuándo se paga y cuándo se convive

| Regla | Fundamento |
|---|---|
| **Seguridad se paga ya**, sin análisis de interés | No es deuda: es una puerta abierta (informe GRASP, prioridad 1) |
| **Pérdida de datos se paga ya**, en cualquier contexto (core o soporte) | El modo de falla no se amortiza (`actualizarMenu`, sesión 2) |
| **La deuda del core se paga justo antes de construir encima** | Pagar deuda donde va a haber obra la semana próxima rinde el doble: el pago Y la obra salen más baratos. Pagarla "para que quede limpio" sin obra prevista rinde la mitad |
| **La deuda de soporte con bajo churn no se paga** | Interés ≈ 0. Un CRUD feo que nadie toca es deuda sin costo — sofisticarlo es esfuerzo core gastado en soporte (`dominio-kos.md` §2) |
| **La imprudente-inadvertida se paga con un ratchet, no solo con el fix** | Arreglar las 3 violaciones del gotcha #20 sin el chequeo deja la puerta abierta al cuarto |

---

## 6. Cuándo NO refactorizar

1. **Sin cliente.** No hay feature, bug, ni venta que necesite ese código mejor →
   el refactor es especulativo. La excepción única: seguridad y pérdida de datos.
2. **Soporte estable.** Contexto de soporte (tabla de `dominio-kos.md` §2) + churn
   bajo (git log lo dice) → convivir. El monolito de una pantalla que se toca dos
   veces al año cuesta dos malas sesiones al año; su cirugía cuesta más.
3. **Sin eje visible.** Si no podés nombrar las partes del monolito sin leerlo, el
   paso siguiente es mapear, no cortar.
4. **Regla de tres, con la excepción de la frontera.** La duplicación se tolera hasta
   la tercera copia (Fowler) — **salvo** CoA que cruza la frontera `'use client'`,
   que se paga a la segunda porque las copias no *pueden* sincronizarse por import
   (`arquitectura-marco.md` §3.6).
5. **Comportamiento ganado a los golpes.** Si el plan de refactor no puede explicar
   cómo preserva cada ítem de `arquitectura-kos.md` §2.4 (optimismo, eco, dedupe,
   offline), el plan está incompleto — por más limpio que quede el árbol de archivos.
6. **En medio de otra cosa.** El refactor oportunista ("ya que estoy…") dentro de una
   sesión de feature rompe la regla una-sesión-un-tema y deja los dos trabajos a
   medias. Lo que se hace en medio de otra cosa es *anotar* el candidato.

---

## Fuentes

- **Martin Fowler** — *Refactoring: Improving the Design of Existing Code*, 2ª ed.,
  2018 (1ª ed. 1999). El catálogo de §1; la regla de tres; los pasos chicos siempre
  compilables.
- **Michael Feathers** — *Working Effectively with Legacy Code*, 2004. Tests de
  caracterización, el dilema del legacy ("para testear hay que cambiar, para cambiar
  hay que testear"), sprout/wrap, "lean on the compiler" — la base de §3, adaptada en
  §3.2 a un stack con tipos estrictos y costuras existentes.
- **Martin Fowler** — bliki *StranglerFigApplication*, 2004 (renombrado 2019). §2.1.
- **Paul Hammant** — *Branch by Abstraction*, 2007; **Martin Fowler** — bliki
  *BranchByAbstraction*, 2014. §2.2.
- **Danilo Sato** — *Parallel Change (expand-contract)*, martinfowler.com, 2014. §2.3.
- **Llewellyn Falco** — *Approval Tests* (approvaltests.com, desde ~2008); **Emily
  Bache** — *The Gilded Rose kata* y material sobre golden master. §3.1/§3.3.
- **Mike Cohn** — *Succeeding with Agile*, 2009. La pirámide de tests.
- **Kent C. Dodds** — *Write tests. Not too many. Mostly integration.* (2018) y *The
  Testing Trophy and Testing Classifications* (2021). El trofeo de §4; "cuanto más se
  parecen tus tests al uso real, más confianza dan".
- **Ward Cunningham** — *The WyCash Portfolio Management System* (OOPSLA experience
  report), 1992. La metáfora original de la deuda.
- **Martin Fowler** — bliki *TechnicalDebtQuadrant*, 2009. §5.1.
- Los dos marcos previos de esta fuente: `arquitectura-marco.md` (connascence como
  escala; la firma del repositorio) y `dominio-marco.md` (core/soporte; agregados;
  glosario) — este marco los usa como premisas, no los repite.
