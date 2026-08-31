# Prompt para Fable 5 — Investigación de ingeniería de software sobre KitchenOS

**Cómo se usa:** una sesión nueva de Claude Code en `kitchenos/`, modelo Fable 5. Se copia el prompt base + **un solo bloque** del apéndice (el núcleo que toque esa sesión). Tres núcleos = tres sesiones, en el orden 1 → 2 → 3.

Cada sesión deja dos archivos en `.claude/docs/ingenieria/` y se cierra con `/update-status`.

---

## PROMPT BASE (copiar entero)

````
Sos el investigador de ingeniería de software de KitchenOS. Esta sesión produce una
fuente de conocimiento nueva para el proyecto — no código.

## Contexto

KitchenOS es una app web full-stack (Next.js 16 App Router + React 19 + TypeScript +
Supabase) para gestión gastronómica: ~98.500 líneas, 345 archivos, 28 módulos de
pantalla, 36 endpoints, 78 tablas, 84 migraciones. La desarrolla una sola persona
(Facundo) con Claude Code. Está en producción con clientes reales.

El proyecto tiene tres fuentes de conocimiento maduras — gastronomía
(SINTESIS-ORGANIZACION-GASTRONOMICA.md), diseño visual y UX (INVESTIGACION-DISENO-2026-08.md
+ DESIGN.md) y cobertura funcional (AUDITORIA-4-CAPAS.md) — y CERO sobre disciplina de
ingeniería de software. El primer asomo fue un análisis GRASP hecho en agosto 2026
(INFORME-GRASP-2026-08.md), que encontró un patrón claro: la capa de dominio (`lib/`)
está bien diseñada y testeada, y la capa de pantalla (`app/`) es un monolito acoplado
directo a la base de datos.

Esta investigación abre la cuarta fuente. Se hace en tres sesiones, una por núcleo.

## Antes de escribir una sola línea, leé

1. `INFORME-GRASP-2026-08.md` — el análisis previo, con sus hallazgos y sus 5 prioridades.
   Es el punto de partida, NO el evangelio: si algo ahí está mal o desactualizado,
   corregilo y decilo.
2. `CLAUDE.md` y `AGENTS.md` — convenciones y método de trabajo del proyecto.
3. `ARQUITECTURA.md` — schema, hooks, rutas.
4. `.claude/docs/hooks.md` — el patrón de acceso a datos vigente.
5. El código real del núcleo que te toca (ver el bloque de abajo). Leé archivos
   completos, no fragmentos: las conclusiones tienen que salir del código, no del
   informe previo.

## Tu núcleo en esta sesión

<<ACÁ VA EL BLOQUE DEL APÉNDICE — pegar uno solo>>

## Entregable 1 — El marco

Archivo: `.claude/docs/ingenieria/<slug>-marco.md`

Es la destilación de la disciplina, agnóstica del proyecto. Sirve para consultarla
cada vez que haya que diseñar algo nuevo, en KitchenOS o en cualquier proyecto de
Antigravity.

Requisitos:

- **400-600 líneas.** Es un doc de consulta, no un libro. Si no entra, es que estás
  copiando en vez de destilando.
- **Cada concepto tiene que responder tres preguntas:** qué problema resuelve, qué
  cuesta aplicarlo, y cómo se reconoce que hacía falta. Un concepto que solo tiene
  definición no entra.
- **Tablas de decisión, no ensayos.** El lector va a venir con una pregunta concreta
  ("¿esto va en un repositorio o en un servicio?") y necesita salir con una respuesta.
- **Marcá explícitamente lo que descartás y por qué.** Un marco que dice "todo es
  importante" no ayuda a decidir. Ejemplo del informe GRASP: descartó métricas DORA
  porque están pensadas para equipos de varias personas con deploys diarios.
- **Fuentes al pie**, con autor y año. Si una idea es discutida, decí quién la discute.

## Entregable 2 — La auditoría aplicada

Archivo: `.claude/docs/ingenieria/<slug>-kos.md`

Es KitchenOS medido contra el marco del entregable 1. El modelo es
`AUDITORIA-4-CAPAS.md` (cobertura funcional contra el material gastronómico) y
`INFORME-GRASP-2026-08.md` (diseño contra GRASP): veredicto + evidencia + qué hacer.

Requisitos:

- **Toda afirmación va anclada a un archivo real, con ruta y línea**, en formato
  markdown clickeable: `[carta/page.tsx:536](app/(app)/carta/page.tsx#L536)`.
  Si no leíste el archivo, no lo citás. Si citás una línea, esa línea existe.
- **Números, no adjetivos.** "3.906 líneas y 59 useState" dice algo; "muy grande" no.
  Contá con grep/wc antes de afirmar.
- **Veredicto por dimensión**, con la escala: cumple / parcial / violado, y una línea
  que explique el porqué en términos prácticos (qué se rompe, qué cuesta, qué error
  futuro habilita) — no en jerga.
- **Distinguí deuda deliberada de deuda accidental.** Este proyecto documenta muchas
  decisiones en comentarios largos dentro del código: leelos. Varias cosas que parecen
  errores son concesiones conscientes con su razón escrita al lado, y tratarlas como
  bugs sería un error tuyo, no del proyecto.
- **Cerrá con acciones priorizadas**, cada una con: problema, por qué importa en
  términos prácticos, solución concreta, y esfuerzo estimado en horas o días.
  Formato listo para pegar en `PENDIENTES.md` con su prioridad 🔴🟠🟡🟢.

## Reglas de calidad — el modo en que esto falla

El riesgo real de esta sesión es producir un resumen de manual. Un documento que
explica qué es la arquitectura hexagonal en abstracto ya existe en internet mil veces
y no vale nada acá. **El valor está enteramente en la traducción a KitchenOS.**

Concretamente:

- Ningún concepto entra al marco si no podés señalar un lugar del código donde
  aplicarlo, o un lugar donde ya está aplicado sin nombre.
- Si un patrón canónico NO aplica a este proyecto, decilo y explicá por qué. Eso vale
  tanto como los que sí aplican. Ejemplo: un repositorio ingenuo que devuelva objetos
  de dominio tiraría a la basura el RLS de Supabase y la cache de SWR — un marco que
  no vea eso es un marco que no leyó el proyecto.
- No propongas reescribir el proyecto. Facundo es una persona con clientes en
  producción. Toda recomendación tiene que ser aplicable de forma incremental, y
  tenés que decir cuál es el primer paso más chico que ya deja valor.
- No escribas código de producción en esta sesión. Fragmentos ilustrativos de 5-15
  líneas dentro de los documentos, sí. Editar archivos del proyecto, no.
- Español rioplatense, igual que el resto de la documentación del proyecto. Tuteo.
- Nada de emoji decorativo. Los únicos permitidos son los de prioridad (🔴🟠🟡🟢) y
  los de veredicto (✅⚠️🔴), igual que en INFORME-GRASP-2026-08.md.

## Cómo cerrar la sesión

1. Los dos archivos escritos en `.claude/docs/ingenieria/`.
2. Una fila nueva en la tabla "Docs condicionales" de `CLAUDE.md`, para que el doc se
   abra cuando el trabajo lo toque.
3. Las acciones priorizadas volcadas a `PENDIENTES.md`.
4. `/update-status`.
5. En el mensaje final: qué encontraste que NO esperabas encontrar. Esa es la parte
   que no está en ningún libro y es la que justifica haber hecho la investigación.
````

---

# APÉNDICE — Los tres bloques de núcleo

Pegar **uno solo** en el lugar marcado del prompt base.

---

## Bloque 1 · Arquitectura de aplicación

`<slug>` = `arquitectura`

````
NÚCLEO 1 — ARQUITECTURA DE APLICACIÓN

Cubrí, en este orden de prioridad:

1. **Ports & Adapters (hexagonal), Clean y Onion.** Qué problema resuelven las tres,
   en qué se diferencian de verdad (no en el diagrama), y cuál —si alguna— tiene
   sentido en una app Next.js App Router donde el framework ya impone una estructura
   y la base de datos ya impone la seguridad.

2. **Patrones de arquitectura de aplicación empresarial (Fowler, PoEAA):** Repository,
   Data Mapper, Active Record, Service Layer, Unit of Work, Transaction Script.
   Cuál de estos describe lo que KitchenOS ya hace hoy sin nombrarlo, y cuál falta.

3. **Connascence** (Page-Jones / Jim Weirich): los tipos, la distinción estático vs
   dinámico, y los tres ejes (fuerza, grado, localidad). Este es el upgrade directo
   de GRASP: en vez de "hay acoplamiento", da un nombre y una escala. Usalo para
   reclasificar los hallazgos del informe GRASP.

4. **SOLID**, pero solo lo que agregue sobre GRASP. Si un principio SOLID es
   redundante con uno de GRASP para este proyecto, decilo y no lo desarrolles.

Las preguntas específicas que esta sesión tiene que contestar:

- ¿Qué forma toma un "repositorio" en un proyecto donde la seguridad multi-tenant vive
  en la base de datos (RLS), el cliente ya cachea con SWR, y 23 hooks escuchan cambios
  en tiempo real? Un repositorio de manual rompe las tres cosas. ¿Cuál es la versión
  que no las rompe?
- ¿El hook ES el repositorio, o el hook USA un repositorio? Hoy `lib/hooks/` mezcla
  tres responsabilidades (traer datos, cachear, exponer operaciones de escritura).
  ¿Se separan o no vale la pena?
- Los 61 hooks siguen dos patrones distintos: 39 con SWR y 22 con useState+useEffect
  manual. ¿Es deuda o hay casos donde el segundo es correcto?
- Hay tres clientes de Supabase (`client.ts`, `server.ts`, `admin.ts`) y una función
  `requireRestauranteId` que solo usan 15 de 36 endpoints. ¿Cómo se ve un "puerto"
  bien definido acá?
- ¿Dónde debería vivir el adaptador de IA que hoy falta (12 rutas repiten el fetch
  crudo a Anthropic), y qué otros adaptadores implícitos hay sin declarar (AFIP,
  ESC/POS, exportación PDF/Excel)?

Código que tenés que leer completo antes de opinar:

- `lib/supabase/client.ts`, `server.ts`, `admin.ts`, `paginate.ts`
- `lib/api/tenant.ts`
- `lib/hooks/useTareas.ts` (el hook más complejo), `useProveedores.ts` (el patrón
  base), `usePermisos.ts`, y dos de los 22 que no usan SWR
- `lib/permisos/resolver.ts` y `lib/permisos/server.ts` (el caso de lógica compartida
  entre cliente y servidor, con su historia escrita en los comentarios)
- `lib/coach/tools/registry.ts` (el mejor ejemplo de diseño del repo)
- Tres endpoints de `app/api/`: uno que usa `requireRestauranteId`, uno que resuelve
  el tenant a mano, y uno que llama a Anthropic
- `proxy.ts`
````

---

## Bloque 2 · Diseño guiado por el dominio (DDD)

`<slug>` = `dominio`

````
NÚCLEO 2 — DISEÑO GUIADO POR EL DOMINIO (DDD)

Cubrí, en este orden de prioridad:

1. **DDD estratégico:** bounded contexts, mapa de contextos y sus patrones de relación
   (shared kernel, customer/supplier, anticorruption layer, published language),
   subdominios (core / soporte / genérico), y destilación del core.

2. **Lenguaje ubicuo.** Qué es, cómo se construye, y cómo se detecta que se rompió.

3. **DDD táctico:** entidad, objeto de valor, agregado y raíz de agregado, servicio de
   dominio, evento de dominio, factory, repositorio (el de DDD, que NO es el mismo
   concepto que el de Fowler — explicá la diferencia).

4. **Cuándo DDD es exceso.** Es la parte más honesta y la más útil: DDD táctico
   completo en un proyecto de una persona puede ser un disfraz caro. Decí qué parte
   vale siempre y qué parte solo vale a cierta escala.

Las preguntas específicas que esta sesión tiene que contestar:

- KitchenOS tiene 28 módulos de pantalla y 78 tablas en un solo saco. **¿Cuántos
  bounded contexts hay realmente ahí?** Candidatos visibles: Cocina/Producción,
  Salón/Servicio, Compras/Stock, Recetario/Carta, Personal/Turnos, Fiscal, Coach.
  ¿Dónde están las costuras REALES — las que ya se ven en el código, no las que
  quedarían lindas en un diagrama?
- **¿Cuál es el core domain?** Lo que hace único a KitchenOS frente a un ERP
  gastronómico genérico. La respuesta manda dónde poner el esfuerzo de diseño y qué
  se puede resolver con lo más simple que funcione.
- **KitchenOS ya tiene lenguaje ubicuo sin saberlo.** "Plaza", "mise", "pase", "86",
  "fuga", "cierre de turno", "comanda", "bumpear" significan lo mismo en la cocina y
  en el código. Extraé el glosario real recorriendo el código y los docs, marcá dónde
  el lenguaje se rompe (un término que significa dos cosas distintas, o dos términos
  para la misma cosa), y decí qué cuesta cada ruptura.
- **¿Qué agregados existen y quién garantiza su consistencia hoy?** Candidatos:
  Receta+Ingredientes, Comanda+Items, Factura+Items, Menú+Preparaciones,
  Cuenta+Comandas+Pagos. ¿Hay alguna invariante que hoy no la garantiza nadie y se
  sostiene solo porque la UI no deja hacerlo mal?
- Hay links polimórficos sin FK declarados como decisión deliberada
  (`menu_preparaciones.ref_id`, `checklist_secciones` ↔ HACCP matcheando por nombre
  con `ilike`). Leé por qué se decidió así antes de juzgarlo. ¿Es un bounded context
  mal cortado, o es la costura correcta entre dos contextos?
- Si algún día K-OS se parte (multi-app, o un módulo que se vende aparte), **¿por dónde
  se corta?** Esta respuesta hoy no existe escrita en ningún lado.

Código y docs que tenés que leer antes de opinar:

- `types/index.ts` completo (139 tipos — es el mapa del dominio tal como está hoy)
- `lib/constants.ts` (plazas, roles, módulos — el vocabulario canónico)
- `ARQUITECTURA.md` sección 5 (las 78 tablas agrupadas por dominio)
- `lib/ops/` completo (mise, turnos, dedupeTareas, menuMise, syncMise) — es el
  dominio más maduro del proyecto
- `lib/comanda/stateMachine.ts` y `lib/carta/ingenieriaMenu.ts`
- `SINTESIS-ORGANIZACION-GASTRONOMICA.md` si está disponible en
  `~/Desktop/START UP KOS/06-contexto-gastronomia/` — es el lenguaje del dominio
  REAL, contra el que hay que contrastar el del código
- `AUDITORIA-4-CAPAS.md` (el marco Definir/Preparar/Ejecutar/Controlar, que es un
  candidato a mapa de contextos ya pensado por el proyecto)
````

---

## Bloque 3 · Refactorización y estrangulamiento

`<slug>` = `refactor`

````
NÚCLEO 3 — REFACTORIZACIÓN Y ESTRANGULAMIENTO

Este núcleo va tercero a propósito: los dos anteriores definen HACIA DÓNDE mover el
código, y este define CÓMO moverlo sin romper un producto que está en producción.

Cubrí, en este orden de prioridad:

1. **Catálogo de refactorización (Fowler),** filtrado a lo que aplica a componentes
   React de miles de líneas: extract function/component, move field, split phase,
   replace conditional with polymorphism, introduce parameter object, encapsulate
   variable. No copies el catálogo entero — traé los que sirven acá y ejemplificalos
   con código real del proyecto.

2. **Estrangulamiento (strangler fig), branch by abstraction, parallel run.** Las tres
   estrategias para migrar código vivo. Cuál aplica a una pantalla monolítica de
   React, cuál a una capa de acceso a datos, y cuál a un endpoint.

3. **Tests de caracterización** (characterization tests / golden master). Es la pieza
   clave: las cinco pantallas grandes NO tienen tests, y refactorizar sin red es
   apostar. ¿Se escriben tests antes de extraer, o la extracción misma es lo que hace
   testeable? Hay respuestas encontradas en la literatura — tomá partido y fundamentá.

4. **Estrategia de tests por capa:** pirámide clásica vs trofeo de Kent C. Dodds.
   Qué conviene en este proyecto, que ya tiene Vitest + Testing Library + Playwright
   configurados y 14 archivos de test, todos sobre `lib/`.

5. **Deuda técnica:** los cuadrantes de Fowler (deliberada/inadvertida ×
   prudente/imprudente), cómo se mide, y cómo se decide cuándo se paga y cuándo se
   convive con ella.

Las preguntas específicas que esta sesión tiene que contestar:

- **El plan concreto para `app/(app)/carta/page.tsx`** — 3.906 líneas, 59 piezas de
  estado, cero tests, en producción. Paso a paso, con el orden exacto de operaciones,
  qué se extrae primero y por qué, dónde se pone la red de seguridad, y en qué punto
  se puede parar sin dejar el código peor que antes. Este es el entregable estrella
  del núcleo: tiene que ser tan concreto que se pueda ejecutar leyéndolo.
- ¿Cuánto de ese plan es replicable a las otras cuatro pantallas grandes
  (`recetario/page.tsx`, `facturas/page.tsx`, `stock/ClientView.tsx`,
  `checklist/ClientView.tsx`) y cuánto es específico de Carta?
- **¿Cómo se mide que mejoró?** Líneas y cantidad de useState son proxies pobres.
  ¿Qué métrica captura de verdad "esto ahora es más fácil de cambiar"? Proponé algo
  medible con herramientas que ya estén en el proyecto o que se instalen en minutos.
- El proyecto tiene una skill `/impacto` con un grafo de dependencias local (graphify).
  ¿Cómo se usa para planificar una extracción — qué pregunta hay que hacerle antes
  de mover cada pieza?
- **¿Cuándo NO refactorizar?** Facundo trabaja en sesiones de un día, un tema por
  sesión (está en CLAUDE.md). Una refactorización que no entra en ese formato
  necesita otra estrategia, o no se hace. Decí cuál.
- Hay dos duplicaciones conocidas (`mapRol` en 2 archivos, `unitConversionFactor` en
  3) con la particularidad de que existen por una restricción real: los archivos
  originales son `'use client'` y el código servidor no puede importarlos. ¿Cuál es
  el refactor correcto para esa restricción específica?

Código que tenés que leer antes de opinar:

- `app/(app)/carta/page.tsx` COMPLETO. No hay atajo: el plan tiene que salir de haber
  leído las 3.906 líneas. Mapeá qué hace cada bloque antes de proponer cómo partirlo.
- `app/(app)/stock/ClientView.tsx` al menos en su estructura (para saber cuánto se
  parece a Carta)
- `.claude/docs/testing.md` y los 14 archivos `*.test.ts` existentes
- `lib/hooks/useTareas.test.ts` y `lib/hooks/usePermisos.test.ts` (los únicos tests de
  hooks — muestran el patrón de mock de Supabase que ya funciona)
- `vitest.config.ts`, `playwright.config.ts`, `e2e/`
- `.claude/skills/impacto/` y `graphify-out/`
- `lib/carta/ingenieriaMenu.ts` — es una extracción YA HECHA desde `carta/page.tsx`,
  con el comentario que explica por qué. Es el precedente del que hay que aprender:
  qué salió bien de esa extracción y qué quedó a medias.
````

---

## Orden y encadenado

| Sesión | Núcleo | Deja | Necesita antes |
|---|---|---|---|
| 1 | Arquitectura | `arquitectura-marco.md` + `arquitectura-kos.md` | El informe GRASP |
| 2 | Dominio (DDD) | `dominio-marco.md` + `dominio-kos.md` | Sesión 1 (usa sus conclusiones sobre capas) |
| 3 | Refactor | `refactor-marco.md` + `refactor-kos.md` | Sesiones 1 y 2 (define hacia dónde mover) |

En las sesiones 2 y 3, agregar al final del bloque de contexto del prompt base:

> Leé también los documentos que dejaron las sesiones anteriores en
> `.claude/docs/ingenieria/`. Esta sesión los continúa, no los repite: si una
> conclusión anterior está mal a la luz de lo que encontrás ahora, corregila
> explícitamente y decí por qué.

---

## Fuera de alcance (decidido, no olvidado)

- **Seguridad de aplicaciones** (OWASP, STRIDE, patrones multi-tenant). Se saca de la
  investigación por decisión de agosto 2026. Los tres endpoints sin autenticación que
  encontró el informe GRASP se arreglan directo, sin investigación previa.
- **Métricas DORA.** Pensadas para equipos con varios deploys diarios y varias
  personas. Acá hay una.
- **Modelado dimensional para Reportes.** El módulo todavía no duele.
- **Catálogo GoF completo.** El proyecto ya usa los cuatro que importan (Strategy en
  el registry del Coach, Observer en los buses de OPS, Factory en los clientes de
  Supabase; Adapter es el que falta). Leer los otros veinte es coleccionismo.
