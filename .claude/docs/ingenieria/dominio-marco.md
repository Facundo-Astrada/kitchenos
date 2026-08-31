# Diseño guiado por el dominio (DDD) — marco de decisión

*Fuente de ingeniería de software · Núcleo 2 de 3 · Agosto 2026*

Este documento destila DDD para los proyectos Antigravity (Next.js App Router +
Supabase, un desarrollador con Claude Code, clientes en producción). No es un resumen de
Evans: cada concepto entró porque hay un lugar del código donde aplica o donde ya está
aplicado sin nombre, y lo que no aplica está en la sección 4 con su porqué.

Regla de lectura, igual que en `arquitectura-marco.md`: cada concepto contesta **qué
problema resuelve, qué cuesta aplicarlo, y cómo se reconoce que hacía falta**. Si venís
con una pregunta concreta ("¿esto es una entidad o un objeto de valor?", "¿esto
justifica un contexto nuevo?", "¿este write es una transacción o son dos?"), andá
directo a las tablas: §1.5, §2.4, §3.1, §3.2.

Advertencia previa, porque es el modo en que DDD falla en un proyecto chico: **DDD tiene
un vocabulario seductor y es baratísimo renombrar lo que ya existe sin cambiar nada.**
La vara de este marco es una sola: un concepto entra si al nombrarlo **cambia una
decisión** — qué se transacciona, dónde vive un archivo, qué nombre lleva la próxima
tabla. Si nombrar algo no cambia nada, el nombre es disfraz y no entra.

La medición de KitchenOS contra este marco vive en `dominio-kos.md`, al lado.

---

## 1. DDD estratégico — el mapa antes que los objetos

### 1.1 La idea de la que sale todo lo demás

Evans (2003) parte de una observación empírica: **un modelo único y unificado para todo
un sistema grande siempre fracasa**, porque cada parte del negocio necesita del mismo
concepto una versión distinta. "Producto" para el que compra es un bulto con proveedor y
precio; para el que cocina es una línea de receta con merma y unidad de uso. Forzar una
sola definición produce el peor de los dos modelos.

La respuesta de DDD no es "modelá mejor": es **aceptar que va a haber varios modelos y
dibujar explícitamente dónde termina cada uno**. Todo lo demás — contextos, mapa,
lenguaje — es maquinaria para sostener esa decisión.

### 1.2 Bounded context

**Qué es:** la frontera dentro de la cual un modelo vale y cada término tiene un solo
significado. No es un módulo ni un microservicio: es una **frontera lingüística**. El
test de frontera no es el tamaño ni el diagrama — es el diccionario: **donde una palabra
cambia de significado, cambió el contexto.**

- *Qué problema resuelve:* que cada concepto pueda tener la forma que su uso necesita,
  sin negociar con los demás usos. El "producto" del stock y el "ingrediente" de la
  receta pueden evolucionar por separado porque son dos modelos con un puente
  (`ingredientes.producto_id`), no uno solo estirado.
- *Qué cuesta:* traducción en los bordes. Cada dato que cruza la frontera necesita un
  mapeo (una función, una tabla de equivalencias, un matching) y ese mapeo hay que
  mantenerlo. Un contexto de más = bordes de más.
- *Cómo se reconoce que hacía falta:* tres síntomas. (1) Una tabla acumula columnas
  nullables que solo un caso usa — dos modelos conviviendo en una fila. (2) Un término
  necesita comentarios "no confundir con..." para poder usarse. (3) Dos pantallas pelean
  por la forma del mismo dato y cada cambio de una rompe a la otra.

**La traducción a este stack:** en un monolito de una persona con una sola base, un
bounded context NO es un deploy ni un schema aparte. Es la unidad que ya existe:
**un grupo de tablas + una carpeta `lib/<dominio>/` + un puñado de módulos de pantalla
+ un vocabulario**. Lo que el concepto agrega no es estructura nueva — es la decisión
consciente de **qué cruza el borde y quién traduce**, en vez de dejar que cada feature
lo improvise.

### 1.3 Los patrones de relación entre contextos

El mapa de contextos (Evans 2003, formalizado en el *DDD Reference* 2015) cataloga las
formas de convivir de dos contextos vecinos. En un monolito los patrones no se ven en la
red — se ven en **quién escribe la traducción y dónde vive**:

| Patrón | Qué es | Forma en este stack | Cuándo conviene |
|---|---|---|---|
| **Shared kernel** | Un pedazo de modelo que dos contextos comparten y editan de común acuerdo | `types/index.ts`, `lib/constants.ts`, la identidad (`restaurante_id`, `equipo_miembros.id`) | Solo para lo chico y estable (ids, enums transversales). Es el patrón más caro de cambiar: cada cambio negocia con todos los usuarios. Mantenerlo mínimo. |
| **Customer/Supplier** | El upstream produce lo que el downstream necesita, y lo sabe | Catálogo→OPS: la Carta decide qué entra al mise y la traducción la ejecuta el proveedor (`upsertMiseChecklistItem`, `sincronizarMiseDeMenu`) | Cuando el downstream tiene voz — acá siempre, porque el "equipo" upstream y downstream son la misma persona. Es el default sano entre contextos internos. |
| **Conformist** | El downstream adopta el modelo del upstream tal cual, sin traducir | El Coach lee las filas de todos los contextos como vienen (con RLS filtrando) | Cuando traducir no compra nada y el upstream es estable. Barato; el costo aparece si el upstream cambia seguido. |
| **Anticorruption layer (ACL)** | Una capa de traducción que protege tu modelo de un modelo ajeno que no controlás | `lib/fiscal/` (SOAP de ARCA → `ProveedorFiscal`), el import de facturas por IA (foto → `FacturaItem`), el import de ventas (Excel del POS → `ventas_items`) | **Siempre** en el borde con el exterior (AFIP, POS ajenos, archivos del cliente, salida de un LLM). Nunca entre dos contextos propios — ahí es burocracia. |
| **Published language** | Un formato común y documentado en el que los contextos se hablan | El nombre de plato normalizado (`normalizarNombrePlato`) entre Ventas y Carta; los schemas Zod del registry del Coach | Cuando varios pares se comunican y no querés N×N traducciones. El costo es mantener el formato retrocompatible. |
| **Open host service** | Un protocolo público que muchos consumidores usan igual | No existe y no hace falta con un solo consumidor interno | Recién si algún día hay API pública para terceros. |
| **Separate ways** | No integrar: los dos contextos viven sin hablarse | `reservas` en su primera fase — tabla aislada a propósito, sin enganches | Como **táctica de entrega**: shippear el contexto solo y decidir las integraciones después, con uso real. Legítimo y barato; el riesgo es olvidarse de que era temporal. |

La decisión práctica por borde: **exterior → ACL, siempre. Interior → customer/supplier
con una función de traducción con nombre, o conformist si no hay nada que traducir.**
Todo lo demás es para organizaciones con varios equipos.

### 1.4 Subdominios: core, soporte, genérico — y la destilación

No todos los contextos valen lo mismo. La clasificación (Evans 2003; los criterios
operativos son de Khononov 2021):

| Clase | Test | Qué implica |
|---|---|---|
| **Core** | Es difícil **y** es el motivo por el que te eligen a vos y no a la alternativa. Cambia seguido porque ahí competís. | Acá va el esfuerzo de diseño: funciones puras con test, invariantes explícitas, el mejor código del repo. Nunca se terceriza. |
| **Soporte** | Necesario pero no diferencia. Sin él el core no funciona, pero nadie te compra por él. | **Lo más simple que funcione**: CRUD sin culpa, sin capas, sin patrones. Sobre-diseñar soporte es el error más común de DDD. |
| **Genérico** | Difícil pero ya resuelto por la industria igual para todos. | Se compra o se adapta (Supabase Auth, ARCA, Stripe). El único código propio es el adaptador. |

**La destilación del core** (Evans, cap. 15) es el ejercicio de decir en un párrafo qué
es lo irreemplazable — porque esa respuesta decide dónde poner cada hora de trabajo. La
pregunta que la fuerza: *"si mañana tuvieras que reescribir el producto con la mitad de
las pantallas, ¿cuáles quedan?"*.

- *Qué problema resuelve:* el esfuerzo repartido en partes iguales — testear todo igual,
  diseñar todo igual — que en un equipo de una persona significa que el core queda
  igual de cuidado que el CRUD de categorías.
- *Qué cuesta:* nada. Es un párrafo y una clasificación.
- *Cómo se reconoce que hacía falta:* el detector es el backlog — si las features que
  diferencian y las que son commodity compiten sin etiqueta, la clasificación no existe.

### 1.5 Tabla de decisión — ¿esto justifica un contexto nuevo?

| Pregunta | Si la respuesta es sí… |
|---|---|
| ¿El término central ya significa otra cosa en el modelo existente? | Señal fuerte de contexto propio: no fuerces la palabra, dale su modelo. |
| ¿Tiene otro actor (mozo vs cocinero), otra cadencia (por servicio vs por temporada), otra necesidad de consistencia (offline vs en vivo)? | Contexto propio, probablemente con superficie propia (otro layout, otro runtime). |
| ¿Se podría vender o apagar por separado? | Contexto propio — y el borde tiene que ser una relación del catálogo §1.3, no imports directos. |
| ¿Es solo "otro grupo de pantallas" con el mismo vocabulario y las mismas tablas? | NO es un contexto nuevo. Es un módulo más del contexto que ya existe. |
| ¿El dato nuevo vive naturalmente en una tabla de un contexto existente? | Extendé ese contexto. Un contexto nuevo por feature es fragmentación, no diseño. |

Y el costo a recordar antes de decir que sí: cada contexto nuevo agrega bordes, y cada
borde es una traducción que alguien mantiene. En un proyecto de una persona el número
sano de contextos se cuenta con dos manos.

---

## 2. Lenguaje ubicuo

### 2.1 Qué es de verdad

No es un glosario decorativo: es la decisión de que **la conversación, los docs, el
código y la base hablen el mismo idioma, el del dominio** — y de que cuando el modelo y
el experto usan palabras distintas, gane el experto o se negocie una sola. En DDD el
modelo *es* el lenguaje: si el código dice `checklist` y la cocina dice "mise", hay dos
modelos, no uno con alias.

- *Qué problema resuelve:* la traducción mental permanente. Cada vez que alguien (vos,
  Claude, un colaborador futuro) tiene que recordar que "checklist quiere decir mise" o
  que "turno acá es el bloque horario y allá es la fase", paga un peaje. El peaje por
  uso es chico; multiplicado por cada feature y cada sesión, es de los costos más
  grandes del proyecto.
- *Qué cuesta:* disciplina en el bautismo. Elegir el término **una vez**, contra el
  glosario, cuando nace la tabla/columna/tipo — porque renombrar después, con datos en
  producción, casi nunca se paga.
- *Cómo se reconoce que hacía falta:* el detector más fiable es el **comentario
  desambiguador**. Cada "NO confundir con…" en el código es la confesión de que una
  palabra tiene dos dueños. Es el equivalente exacto del hallazgo de
  `arquitectura-marco.md` §3.4 (la prosa como síntoma de connascence sin degradar):
  un comentario que desambigua es lenguaje ubicuo roto escrito en prosa.

### 2.2 Cómo se construye en un proyecto ya andando

En un proyecto nuevo el lenguaje se destila en conversación (Evans lo describe como
prueba y error hablado; Brandolini lo sistematiza con event storming). En uno andando,
el orden es otro:

1. **Extraer el glosario real del código** — los tipos, las tablas, las constantes ya
   votaron. Ese es el lenguaje de facto, con sus rupturas.
2. **Contrastarlo contra el dominio real** — el material de gestión, lo que dice el
   cocinero. Donde el código inventó un término que la cocina no usa, anotarlo.
3. **Decidir el canónico por término** — una fila por palabra: qué significa, dónde
   vive, cuáles sinónimos quedan prohibidos para lo nuevo.
4. **Ponerlo donde se lee** — un doc condicional que se abre al nombrar cosas nuevas.
   Un glosario que no se consulta en el momento del bautismo no existe.

Lo que NO se hace: renombrar en masa lo existente. El glosario de un proyecto en
producción es **prescriptivo hacia adelante y descriptivo hacia atrás** — documenta las
rupturas viejas para que nadie las herede, y legisla solo sobre los nombres nuevos.

### 2.3 Las tres formas de romperse

| Ruptura | Qué es | Costo |
|---|---|---|
| **Una palabra, N cosas** (homonimia) | El mismo término nombra conceptos distintos según la tabla/pantalla | La más cara: produce bugs de "agarré el turno equivocado", exige comentarios de desambiguación en cada uso, y hace que grep no sirva |
| **N palabras, una cosa** (sinonimia) | El mismo concepto tiene nombre distinto en la tabla, el hook y la UI | Confunde el onboarding (humano y de IA) y esconde duplicación: dos features "distintas" pueden ser la misma cosa con otro nombre |
| **El nombre miente** | La columna/función dice una cosa y guarda otra | La peor por unidad: cada lector nuevo se equivoca hasta que alguien le avisa. Suele nacer de reusar un campo "por ahora" |

### 2.4 Tabla de decisión — síntoma → remedio

| Síntoma | Remedio barato (el que se paga) | Remedio caro (casi nunca se paga) |
|---|---|---|
| Comentario "no confundir con…" repetido | Fila en el glosario + regla de bautismo para lo nuevo ("jornada, no fecha"; "estado, no status") | Renombrar columnas en producción |
| Dos nombres para lo mismo (tabla vs UI vs docs) | Elegir el canónico y usarlo en todo lo NUEVO; alias tipado si ayuda (`type Jornada = string`) | Migración de renombre total |
| El nombre miente | Comentario en el tipo + fila de glosario **ya** — y renombrar solo si la tabla es chica y joven | Convivir callado con la mentira |
| Un término de la app que la cocina no usa | Verificar si hay un término real del oficio y adoptarlo para lo nuevo | Inventar jerga propia "más precisa" que nadie más habla |

---

## 3. DDD táctico — comprado pieza por pieza

El aparato táctico completo (entidades ricas, repos por agregado, eventos con bus) se
diseñó para equipos grandes con ORM. Acá se compra **por pieza**, y varias piezas ya
existen en el stack sin nombre. Lo descartado, en §4.

### 3.1 Entidad vs objeto de valor

**Entidad:** algo que importa *cuál* es, más allá de sus valores — tiene identidad e
historia. Dos con los mismos datos siguen siendo dos. **Objeto de valor (VO):** algo que
solo es sus valores — dos iguales son intercambiables, y no se modifica: se reemplaza.

| Pregunta sobre el dato | Sí → |
|---|---|
| ¿Dos con exactamente los mismos valores son "el mismo"? | VO |
| ¿Necesita historia propia (quién lo cambió, cuándo)? | Entidad |
| ¿Se referencia desde otro lado por id? | Entidad |
| ¿Es una combinación con reglas propias (una clave compuesta, una cantidad+unidad, un rango de vigencia)? | VO — y las reglas van en funciones puras al lado |

**La forma del VO en este stack** no es una clase: es **un encoding + su par de
funciones puras `encode`/`parse` con test**, o un objeto derivado que se recalcula en
vez de guardarse. Ejemplos ya existentes en KitchenOS: `claveCierre(jornada, turno,
plaza)` — la identidad de una entrega como string canónico; `encodeTurnoFase('cena',
'apertura')` — turno+fase en una columna; `encodeRecipienteNombre(n, 3)` → `"Tupper
×3"`; `FoodCostCalc` — costo derivado que se calcula al leer y no se persiste (con lo
cual la invariante "costo coherente con ingredientes" no puede romperse: no hay copia
que desincronizar).

- *Qué problema resuelve el distinguirlos:* saber qué merece tabla/id y qué merece
  función pura. Un VO metido en tabla propia genera joins y sincronización para algo
  que era un cálculo; una entidad tratada como valor pierde su historia.
- *Qué cuesta:* nada — es una pregunta de 10 segundos al diseñar.
- *Cómo se reconoce que hacía falta:* aparece una tabla cuyo contenido se podría
  recalcular siempre desde otra (VO disfrazado de entidad), o un campo que se pisa
  perdiendo información que después se necesita (entidad tratada como VO).

### 3.2 Agregado y raíz de agregado — la pieza que más rinde en este stack

**Qué es:** un grupo de filas que cambian juntas porque **una invariante las ata**, con
una raíz que es la única puerta de entrada. La definición operativa, que es la única que
importa: **el agregado es la frontera de la transacción.** Todo lo que la invariante
necesita ver junto, se escribe junto; todo lo demás queda afuera y se sincroniza
después.

Las tres reglas prácticas (Vernon 2013, cap. 10):

1. **Agregado chico.** El más chico que sostenga la invariante. "Factura + sus items"
   es un agregado; "factura + items + productos + historial de precios" no — es un
   agregado más tres efectos sobre *otros* agregados.
2. **Entre agregados, referencia por id** — nunca "cargar el otro y tocarlo" dentro de
   la misma operación.
3. **Entre agregados, consistencia eventual.** Que los precios de los productos se
   actualicen "después" de confirmar la factura no es un bug: es el diseño correcto. Lo
   que necesita ser atómico es el documento; la propagación puede reintentar, correr
   aparte, o reconstruirse.

**La traducción a este stack**, que refina la regla de `arquitectura-marco.md` §2.4
("≥2 tablas todo-o-nada → rpc/endpoint"): el agregado es el criterio que dice **cuáles**
tablas van en el todo-o-nada. Regla completa:

| La escritura toca… | Camino |
|---|---|
| Varias filas del **mismo agregado** (padre + items) | Una transacción: función de Postgres (`rpc`) o endpoint. El browser no puede darte esto. |
| El agregado + efectos sobre **otros** agregados (precios, stock, contadores) | Transacción para el agregado; los efectos como paso aparte **idempotente** (que se pueda re-correr sin duplicar) o como proyección re-derivable. No los metas en la misma transacción: acoplás contextos y bloqueás el flujo principal. |
| Otro **contexto** (fiscal, notificaciones) | Nunca en la transacción. Fire-and-forget con estado propio ('pendiente') o hecho inmutable que el otro contexto consume. |

**Dónde vive la invariante** — la regla de localidad de los agregados:

| La invariante la pueden violar… | Entonces vive en… |
|---|---|
| Dos dispositivos / dos usuarios a la vez | **La base**: unique index (parcial si hace falta), constraint, trigger o rpc. La cache local de un cliente no puede ver lo que el otro cliente está haciendo. |
| Solo la secuencia de pasos de un mismo cliente | El hook / la función de dominio alcanza |
| Solo un flujo de UI concreto | La UI alcanza — pero anotá la invariante en el tipo, porque "la UI no deja" dura hasta la próxima pantalla que escribe la misma tabla |

- *Qué problema resuelve:* las escrituras multi-tabla del browser que la sesión 1
  encontró (§3.1 de `arquitectura-kos.md`) dejan de ser una lista de casos y pasan a
  tener un criterio: ¿esto era UN agregado sin transacción, o un agregado más efectos
  que estaban bien separados y solo faltaba la atomicidad del núcleo?
- *Qué cuesta:* identificar la invariante en una frase ("el menú y sus preparaciones
  cambian juntos") y elegir el camino de la tabla. Minutos por escritura.
- *Cómo se reconoce que hacía falta:* datos a medias tras un corte de red; un candado
  que existe solo en la cache local y "dos dispositivos en el mismo segundo" lo
  esquivan; una tabla con un endpoint "curita" que repara mitades rotas.

### 3.3 Servicio de dominio

Lógica del dominio que no pertenece a una entidad concreta: opera sobre varias, o sobre
ninguna. En este stack ya existe con forma clara: **funciones puras en
`lib/<dominio>/`, sin `'use client'`, con test** — `turnoVigente()`,
`fusionarDuplicados()`, `clasificarIngenieriaMenu()`. Es la pieza táctica que el
proyecto más compró, y la compró bien: no hay nada que agregar salvo el nombre, y el
nombre acá sí cambia una decisión — cuando dudes dónde va una regla que cruza
entidades, la respuesta es "función pura en el `lib/` del contexto dueño", no "en el
hook que la necesitó primero".

### 3.4 Evento de dominio — la versión de este stack

**Qué es:** un hecho del negocio, en pasado, que otros quieren saber ("se bumpeó el
ítem", "la plaza entregó el turno", "cambió el precio"). El aparato clásico (objetos
evento + bus + handlers) se descarta en §4. Lo que se compra es la forma que el stack ya
tiene:

> **Evento de dominio = fila inmutable en una tabla de hechos + `postgres_changes` como
> bus.** La tabla se inserta y no se actualiza; los interesados se enteran por realtime
> o por el próximo fetch; y si un dato derivado se desincroniza, se **reconstruye**
> desde los hechos.

KitchenOS ya tiene cuatro tablas así sin llamarlas eventos: `eventos_cocina`
(fired/bumped/recalled), `cierres_turno` ("esta plaza entregó" como hecho, con snapshot
que no se recalcula), `precio_historial`, `merma`. Y ya tiene la pieza que completa el
patrón: la proyección re-derivable (`/api/stock/rebuild` reconstruye `stock_actual`
desde el histórico).

- *Qué problema resuelve:* estado derivado con muchos escritores. Cuando N flujos pisan
  la misma celda (`stock_actual`), la celda miente tarde o temprano; si los N flujos
  insertan hechos y la celda es proyección, la verdad siempre es recuperable.
- *Qué cuesta:* una tabla append-only y disciplina de no hacerle UPDATE. El realtime ya
  está pagado (23 hooks ya lo usan).
- *Cómo se reconoce que hacía falta:* existe un botón/endpoint "recalcular" o
  "rebuild"; o dos pantallas discuten sobre un número y no hay forma de auditar quién
  tiene razón.
- *Qué NO es:* un bus en memoria del cliente. `miseBus.ts` lo dice en su propio header
  — es un parche de latencia de UI dentro de una pestaña, no el mecanismo de eventos
  del dominio. No generalizarlo.

### 3.5 Factory

**Qué es:** la creación de un agregado que nace con varias piezas y una invariante desde
el primer segundo, concentrada en un solo lugar. En este stack: **una función con la
firma del repositorio (`supabase, restauranteId, input`) o una rpc que deja el agregado
completo o no deja nada.**

- *Cuándo:* creación multi-fila donde "a medio crear" es un estado roto. El `signUp` de
  KitchenOS (usuario → restaurante → vínculo → ficha → permisos) es una factory de
  manual escrita como secuencia — con el endpoint-curita que delata lo que pasa cuando
  la factory no es atómica.
- *Cuándo no:* un insert de una fila no necesita factory. `crearComanda` + `agregarItems`
  por separado está bien **mientras** una comanda sin items sea un estado legal (y en
  el mostrador lo es: se abre y se le agrega después).

### 3.6 Repositorio: el de DDD no es el de Fowler

La sesión 1 trabajó el Repository de Fowler (PoEAA): un objeto que esconde el acceso a
datos de una tabla. El repositorio de DDD es otra cosa y la diferencia importa:

| | Repository (Fowler, PoEAA) | Repository (DDD, Evans) |
|---|---|---|
| Unidad | Una tabla | **Un agregado entero** |
| Devuelve | Filas/registros | La raíz con todos sus hijos, lista para validar invariantes |
| Su promesa | Esconder el storage | **Hacer imposible cargar/guardar medio agregado** — no podés tocar un item sin pasar por la raíz |
| Cantidad | Uno por tabla que lo amerite | Exactamente uno por agregado; los hijos NO tienen repo |

Veredicto para este stack: **la mitad buena ya está, la mitad restante no conviene.**
La mitad buena: el select embebido de PostgREST ya carga agregados enteros de un tiro
(`comandas.select('*, items:comanda_items(*, modificadores(...)))'`) — el fetcher de un
hook bien escrito ES la consulta del repositorio DDD. La mitad que no conviene:
*prohibir* el acceso directo a las tablas hijas es imposible con PostgREST+RLS (toda
tabla es direccionable por diseño) y no deseable (el KDS actualiza `comanda_items`
directo, y ese es su trabajo). La protección del agregado en este stack no la da un
repo: la da **la base** (§3.2 — constraints, triggers, rpc). Conclusión: mantener
fetchers con forma de agregado, no construir repos por agregado.

---

## 4. Cuándo DDD es exceso — la tabla honesta

Es la sección más importante del marco. Vernon (2016) y Khononov (2021) coinciden en el
orden: **lo estratégico primero, lo táctico solo donde el dominio lo pide** — y la
crítica estándar al DDD-como-se-practica es que los equipos compran el aparato táctico
(que es lo fotogénico) y se saltean el estratégico (que es lo que vale). Evans mismo
abre el libro diciendo que DDD paga en dominios complejos; en los simples es overhead.

| Pieza | Veredicto acá | Por qué |
|---|---|---|
| **Lenguaje ubicuo** (glosario + regla de bautismo) | ✅ Siempre | Costo ~0, y el costo de no tenerlo se paga en cada sesión — humana o de IA. |
| **Mapa de contextos** como herramienta de decisión | ✅ Siempre | Un doc. Decide dónde va código nuevo, qué se puede apagar/vender, por dónde se parte. No es un plan de ejecución. |
| **Core/soporte/genérico** | ✅ Siempre | Un párrafo que decide dónde van las horas. |
| **Agregado = frontera de transacción** | ✅ Siempre | Es la regla que faltaba para saber qué merece rpc. No exige ni una clase. |
| **Hechos inmutables + proyección** donde hay estado multi-escritor o discusión auditable | ✅ Donde aplica | El stack lo regala (append + realtime + rebuild). |
| **Servicios de dominio** como funciones puras testeadas | ✅ Ya comprado | Es `lib/<dominio>/`. |
| **ACL formal** | ⚠️ Solo en bordes con el exterior | Entre contextos propios, una función de traducción con nombre alcanza. |
| **Factories dedicadas** | ⚠️ Solo agregados con creación compleja | El resto es un insert. |
| **Context map con roles formales upstream/downstream negociados** | ⚠️ A escala de 2+ equipos | Acá la versión light de §1.3 alcanza: saber el patrón por borde. |
| **Entidades como clases ricas** (comportamiento adentro del objeto) | ❌ Nunca acá | El modelo de este stack es fila plana tipada + funciones puras. Ya se descartó Active Record por lo mismo (`arquitectura-marco.md` §5); las clases ricas son el mismo descarte con otro nombre. |
| **Repositorio por agregado** | ❌ Nunca acá | §3.6 — PostgREST+RLS hacen imposible la mitad prohibitiva y el fetcher ya da la mitad útil. |
| **Eventos con bus in-process + handlers** | ❌ Nunca acá | Postgres + realtime ya son el bus, con persistencia y replay gratis. Un bus en memoria del cliente muere con la pestaña. |
| **CQRS / Event Sourcing completos** | ❌ Ya descartado | `arquitectura-marco.md` §5. La versión barata (tablas de hechos + proyecciones puntuales) es §3.4. |
| **Microservicios por contexto** | ❌ Ya descartado | El mapa de contextos sirve para saber por dónde se partiría **si** hiciera falta — no para partir. |

**La corrección que este marco le hace a la sesión 1:** `arquitectura-marco.md` §5
descartó "DDD táctico completo" en bloque, con la nota de que "el único concepto DDD que
este stack usa de facto es el aggregate implícito". Esta pasada confirma el descarte del
*aparato* (clases, repos, bus) pero revierte la mitad de la frase: el agregado no debe
quedar implícito — **explicitarlo es barato y es lo que decide dónde vive cada
invariante** (§3.2). Lo implícito era el problema, no la solución.

**La vara anti-disfraz, para cerrar:** antes de aplicar cualquier término de este marco
a un pedazo de código, contestá *"¿qué decisión cambia al nombrarlo?"*. "Los
`eventos_cocina` son eventos de dominio" no cambia nada — ya son inmutables y
append-only; no lo escribas. "Menú+preparaciones es un agregado" sí cambia algo — te
dice que su escritura necesita una transacción que hoy no tiene. Esa es la diferencia
entre usar DDD y disfrazarse de DDD.

---

## Fuentes

- **Eric Evans** — *Domain-Driven Design: Tackling Complexity in the Heart of
  Software*, 2003. El origen: bounded context, lenguaje ubicuo, agregados, destilación
  del core. El propio Evans advierte (cap. 1) que el enfoque paga en dominios complejos.
- **Eric Evans** — *Domain-Driven Design Reference*, 2015. La formalización compacta de
  los patrones de mapa de contextos (shared kernel, customer/supplier, conformist, ACL,
  published language, open host, separate ways).
- **Vaughn Vernon** — *Implementing Domain-Driven Design*, 2013. Las tres reglas de
  agregados (chico, referencia por id, eventual entre agregados) que este marco adopta
  textuales en §3.2.
- **Vaughn Vernon** — *Domain-Driven Design Distilled*, 2016. El orden "estratégico
  primero, táctico después" en el que se apoya §4.
- **Vlad Khononov** — *Learning Domain-Driven Design*, 2021. Los criterios operativos
  core/soporte/genérico de §1.4 y la crítica a aplicar patrones tácticos en subdominios
  de soporte. Es la fuente más alineada con "lo más simple que funcione" para soporte.
- **Martin Fowler** — bliki *BoundedContext* (2014) y *DDD_Aggregate* (2013). Las
  definiciones cortas; y *PoEAA* (2002) para el contraste Repository-Fowler vs
  Repository-DDD de §3.6.
- **Alberto Brandolini** — *Introducing EventStorming* (2013–2021, libro inacabado). La
  técnica de extraer lenguaje y fronteras de la conversación; citado en §2.2 como el
  método para proyectos nuevos, que acá se invierte (extraer del código primero).
- **Sam Newman** — *Building Microservices*, 2ª ed., 2021. Los bounded contexts como
  líneas de corte si un monolito se parte — la lectura que usa `dominio-kos.md` §6, con
  la advertencia de Newman de no partir antes de que las fronteras se estabilicen.

Discusión abierta que conviene conocer: la utilidad de los patrones tácticos fuera de
OOP clásica es discutida — la posición de este marco (VOs como encodings + funciones,
sin clases) sigue la línea funcional que defienden, entre otros, Scott Wlaschin
(*Domain Modeling Made Functional*, 2018) para dominios sin ORM. La posición contraria
(entidades ricas siempre) asume un stack que este proyecto no tiene.
