# Arquitectura de aplicación — marco de decisión

*Fuente de ingeniería de software · Núcleo 1 de 3 · Agosto 2026*

Este documento destila la disciplina de arquitectura de aplicación para los proyectos
Antigravity (Next.js App Router + Supabase + Vercel, un desarrollador con Claude Code,
clientes en producción). No es un resumen de manual: cada concepto entró porque hay un
lugar del código donde aplica o donde ya está aplicado sin nombre. Lo que no aplica al
stack está en la sección 5, con su porqué — descartar con razones vale tanto como adoptar.

Regla de lectura: cada concepto contesta tres preguntas — **qué problema resuelve, qué
cuesta aplicarlo, y cómo se reconoce que hacía falta**. Si venís con una pregunta
concreta ("¿esto va en el hook o en lib/?", "¿cliente o endpoint?"), andá directo a las
tablas de decisión: §2.3, §2.4 y §3.5.

La medición de KitchenOS contra este marco vive en `arquitectura-kos.md`, al lado.

---

## 1. Hexagonal, Clean y Onion — qué comprar y qué no

### 1.1 El problema que resuelven (las tres el mismo)

Las tres arquitecturas atacan un solo enemigo: **que la lógica de negocio quede atrapada
adentro de la infraestructura**. Si la regla "una docena son 12 unidades" vive dentro de
un componente React, no se puede testear sin montar React, no se puede usar desde el
servidor, y cambiar de framework la mata. Las tres proponen lo mismo con distinto
vocabulario: el dominio en el centro, la infraestructura afuera, y **las dependencias
apuntando siempre hacia adentro**.

### 1.2 En qué se diferencian de verdad (no en el diagrama)

| | Hexagonal (Cockburn, 2005) | Clean (Martin, 2012) | Onion (Palermo, 2008) |
|---|---|---|---|
| Idea central | **Puertos**: interfaces que el dominio define; **adaptadores** que las implementan | Anillos concéntricos + la Regla de Dependencia + "use cases" como capa propia | Como Clean pero con el modelo de dominio como núcleo explícito |
| Lo distintivo | Simetría: la UI y la base de datos son *ambas* adaptadores, ninguna es especial | Los casos de uso son objetos de primera clase, separados de entidades y de UI | Distingue servicios de dominio de servicios de aplicación |
| Lo que exige | Definir interfaces para cada cosa externa | 4 capas + DTOs cruzando cada borde | 3-4 capas + interfaces de repositorio |
| Costo real | Bajo si se aplica solo donde hay variación | Alto: cada feature toca 4 archivos mínimo | Alto, similar a Clean |

La diferencia práctica es una sola: **Hexagonal es un patrón local que se aplica puerto
por puerto; Clean y Onion son estructuras globales que se aplican al proyecto entero.**
Por eso Hexagonal sobrevive en este stack y las otras dos no.

### 1.3 El veredicto para Next.js App Router + Supabase

En este stack, dos de las tres cosas que Clean/Onion prometen **ya las provee otra pieza**:

1. **La capa de aplicación ya existe: es el framework.** App Router ya separa rutas,
   layouts, server/client, y endpoints. Escribir una capa de "use cases" arriba de eso es
   duplicar lo que `app/api/*/route.ts` ya es: un caso de uso por archivo.
2. **La seguridad ya vive en la base.** RLS con `mi_restaurante_id()` impone el
   aislamiento multi-tenant *debajo* de todo el código. Una capa de dominio que re-valide
   tenancy repite un chequeo que la base hace mejor (no se puede olvidar) — y peor: da la
   ilusión de que el código es la barrera, cuando no lo es.

Lo que **sí** se compra de este cuerpo de ideas son dos piezas baratas:

**A. El puerto, para cada servicio externo.** Una interfaz propia adelante de cada cosa
que está afuera del proyecto (IA, AFIP, impresoras, generación de PDF). El ejemplo ya
existente y con nombre de manual: `lib/fiscal/index.ts` define `ProveedorFiscal`
(interfaz `emitir`/`ultimoAutorizado`) con dos adaptadores — `WsfeDirecto` (AFIP real) y
`ProveedorFiscalStub` (sin config fiscal, degrada legible). Eso ES un puerto hexagonal,
escrito sin saberlo.

- *Qué problema resuelve:* que cambiar el proveedor (o su versión, o su modelo, o su
  ambiente) sea editar un archivo y no doce.
- *Qué cuesta:* un archivo de interfaz + disciplina de no saltearla. Casi nada.
- *Cómo se reconoce que hacía falta:* el mismo `fetch` con la misma URL y los mismos
  headers aparece copiado en N archivos; o existe documentación que lista "en qué
  archivos está el modelo hardcodeado".

**B. La Regla de Dependencia, reducida a dos leyes locales.** No hacen falta cuatro
anillos; en este stack la regla completa se colapsa en:

1. **`lib/` nunca importa de `app/`.** (`app/` importa de `lib/` todo lo que quiera.)
2. **La lógica pura nunca vive en un archivo `'use client'`.** La directiva `'use
   client'` es la frontera real de este stack — más real que cualquier anillo del
   diagrama: un archivo marcado así no puede ser importado por código de servidor, y
   toda función pura que quede adentro va a terminar **copiada** del lado del servidor
   el día que el servidor la necesite.

- *Qué problema resuelve:* la duplicación forzada. Es el mecanismo exacto que produjo
  la triplicación de `unitConversionFactor` en KitchenOS: la función vivía en
  `useRecetas.ts` (que es `'use client'`), los reportes server-side no podían
  importarla, y nació la copia.
- *Qué cuesta:* mover funciones puras a módulos sin directiva. Minutos por función.
- *Cómo se reconoce que hacía falta:* aparece un comentario "duplicada de X porque X es
  use client". Ese comentario es el detector.

### 1.4 Tabla de decisión — ¿necesito "arquitectura" acá?

| Pregunta | Respuesta |
|---|---|
| ¿Adopto Clean/Onion completo? | No. El framework ya es la capa de aplicación y RLS ya es la seguridad. Ver §5. |
| ¿Este servicio externo necesita un puerto? | Sí si: lo llamás desde ≥2 lugares, o tiene ambiente dual (test/prod), o va a cambiar (modelos de IA). No si es una librería local determinística (jsPDF, xlsx) llamada desde un solo lugar. |
| ¿Dónde vive el puerto? | `lib/<servicio>/index.ts` define la interfaz y la función de acceso; los adaptadores al lado. Modelo: `lib/fiscal/`. |
| ¿Esta función es "dominio"? | Si se puede testear con un `it()` sin mock de red ni de React, es dominio → va en `lib/<dominio>/`, sin `'use client'`, con test. |
| ¿Puedo importar esto desde el server? | Solo si el archivo no tiene `'use client'` ni importa nada que lo tenga. Si la respuesta es no y lo necesitás, extraé la parte pura primero — no copies. |

---

## 2. Patrones PoEAA — el vocabulario para lo que ya hacés

Fowler (2002) catalogó los patrones de acceso a datos y organización de lógica. El valor
acá no es adoptarlos: es **ponerle nombre a lo que el stack ya hace**, para poder razonar
sobre cuándo el patrón implícito alcanza y cuándo no.

### 2.1 Mapa general

| Patrón (Fowler) | Qué es en una línea | Forma en este stack | Veredicto |
|---|---|---|---|
| **Transaction Script** | Un procedimiento por operación de negocio, de punta a punta | Cada `app/api/*/route.ts` | ✅ Ya es el patrón dominante y **está bien**: para operaciones de complejidad baja-media es el patrón más simple que funciona. Se degrada recién cuando dos scripts comparten lógica copiada. |
| **Table Data Gateway** | Un objeto por tabla que concentra sus queries | El fetcher + las funciones CRUD de cada hook de `lib/hooks/` | ✅ Ya existe sin nombre. El hook es un gateway envuelto en React (ver §2.2). |
| **Repository** | Colección en memoria simulada, devuelve objetos de dominio, aísla el storage | **La versión de manual no aplica** — rompe RLS, SWR y realtime a la vez. La versión que sí: §2.2. | ⚠️ Redefinir, no adoptar. |
| **Active Record** | La fila sabe guardarse a sí misma (`producto.save()`) | No existe y no conviene: exige clases por tabla, y el proyecto trabaja con filas planas tipadas | ❌ Descartado. |
| **Data Mapper** | Capa que traduce fila ↔ objeto de dominio | Micro-mappers puntuales: `parseTarea()` en `useTareas.ts` traduce la fila cruda (checklist a veces viene como texto) a `Tarea` usable | ✅ Solo donde la fila cruda no es directamente usable. No generalizar: el 90% de las tablas se usan como vienen, y un mapper por tabla sería burocracia. |
| **Service Layer** | Fachada que define las operaciones de la aplicación, con validación y permisos adelante | Existe **una sola vez**: el pipeline del Coach (`registry` → `propose` → `confirm`), donde toda escritura pasa por schema Zod + gate de permisos + confirmación | ⚠️ Es el patrón correcto para escrituras multi-tabla disparadas desde el cliente. Hoy solo la IA lo tiene. |
| **Unit of Work** | Registrar cambios y confirmarlos todos juntos o ninguno | **No se implementa en TypeScript: se delega a Postgres.** Una función SQL (`rpc`) es una transacción real; una secuencia de `await supabase.from(...)` no lo es ni lo va a ser | ✅ La versión de este stack es "si son ≥2 tablas y tiene que salir todo o nada → función de Postgres o endpoint con lógica compensatoria". |
| **Identity Map** | Una sola copia en memoria de cada dato, compartida | La cache de SWR con key por `restaurante_id` — dos pantallas con la misma key ven el mismo dato y se sincronizan solas | ✅ Ya existe. Corolario documentado en `hooks.md` #21: dos pantallas que se sincronizan **tienen** que compartir la key, o no comparten el mapa. |

### 2.2 El repositorio que no rompe RLS, SWR ni realtime

Esta es la pregunta central del stack, y merece el desarrollo completo.

**Por qué el repositorio de manual no aplica.** El Repository clásico promete tres
cosas: (a) esconder el storage, (b) centralizar el filtrado/seguridad, (c) devolver
objetos de dominio. En este stack las tres promesas chocan con piezas que ya funcionan:

- (a) Esconder Supabase implicaría también esconder **realtime** — pero 23 hooks se
  suscriben a `postgres_changes` con filtro por tenant, y esa suscripción necesita
  hablar el idioma de Supabase (canal, tabla, filtro, eco de la escritura propia). Un
  repositorio opaco tendría que re-exponer todo eso, es decir, dejar de ser opaco.
- (b) Centralizar la seguridad en el repositorio **degradaría** la seguridad: hoy la
  impone RLS en la base, que no depende de que ningún código se acuerde de filtrar. Un
  repositorio que se presente como "la barrera" invita a confiar en el lugar equivocado.
- (c) Devolver objetos de dominio implicaría mapear cada fila — y el costo de mantener
  139 tipos + 78 mappers no compra nada, porque las filas planas tipadas ya son usables.

**Lo que sí hay que separar: las tres responsabilidades del hook.** Un hook de datos de
este stack hace tres cosas distintas:

1. **Acceso** — el fetcher y las funciones de escritura (qué se le pide a la base).
2. **Cache y suscripción** — SWR + canal realtime (cuándo se refresca).
3. **Contrato React** — `useCallback`/`useMemo`/estado (cómo lo consume un componente).

La respuesta a "¿el hook ES el repositorio o USA un repositorio?" es: **el hook es el
adaptador React de un repositorio que conviene que exista como funciones sueltas**. No
hace falta una clase ni una interfaz: el repositorio de este stack es un **conjunto de
funciones a nivel de módulo con esta firma**:

```ts
function operacion(
  supabase: SupabaseClient,     // el caller decide qué cliente (browser/server/admin)
  restauranteId: string,        // el tenant viaja explícito, nunca implícito
  input: {...}                  // datos de la operación
): Promise<Resultado>
```

Esta firma no es una propuesta: **ya es la convención de facto del proyecto** —
`upsertMiseChecklistItem` (`lib/ops/mise.ts`), `activarMenuParaFechas`
(`lib/menus/activarMenu.ts`), `sincronizarMiseDeMenu` (`lib/ops/menuMise.ts`) y cada
`execute` del registry del Coach la usan. Su propiedad clave: al recibir el cliente por
parámetro, **la misma función corre desde un hook del browser (RLS por sesión), desde un
endpoint (server client) o desde una tool del Coach** — sin copias, sin `'use client'`,
testeable pasando un mock.

- *Qué problema resuelve:* la escritura que hoy solo puede hacerse desde el hook (y
  entonces se copia cuando la necesita un endpoint), y el fetcher que hoy solo puede
  llamarse desde SWR.
- *Qué cuesta:* extraer la función y dejar el hook como wrapper fino. Por hook tocado,
  una hora o menos.
- *Cómo se reconoce que hacía falta:* un endpoint reimplementa una query que un hook ya
  tiene; o una función CRUD de un hook supera ~50 líneas de lógica de negocio (señal de
  que dejó de ser acceso y pasó a ser dominio disfrazado).

**Cuándo NO separar.** Un hook CRUD chico (fetcher de 10 líneas + insert/update/delete
de 10 líneas cada uno) no gana nada con la extracción: la separación se paga cuando la
lógica se comparte o se testea, no antes. La regla es por demanda, no por dogma.

**Anatomía del hook estándar, con las tres responsabilidades marcadas.** El patrón SWR
de `hooks.md` ya deja la responsabilidad 1 físicamente separada — el fetcher vive a
nivel de módulo, fuera del cuerpo del hook. Eso significa que la migración de §2.2 no
es una reescritura: es completar una separación que el patrón ya empezó.

```ts
// ── [1] ACCESO — ya está fuera del hook; candidato a lib/ si otro lado lo necesita
async function fetchXData(key: string): Promise<T[]> {
  const rid = key.slice('xx-'.length)
  const supabase = createClient()          // en lib/ pasaría a llegar por parámetro
  ...
}

export function useX() {
  const RESTAURANTE_ID = useRestauranteId()
  // ── [3] CONTRATO REACT — cliente memoizado, callbacks estables
  const supabase = useMemo(() => createClient(), [])
  // ── [2] CACHE — la key ES el guard de tenant: null = no fetch
  const swrKey = RESTAURANTE_ID ? `xx-${RESTAURANTE_ID}` : null
  const { data, mutate } = useSWR(swrKey, fetchXData, OPTS)
  // ── [2] SUSCRIPCIÓN — realtime filtrado por tenant, con eco y debounce
  useEffect(() => { /* canal postgres_changes → mutate() */ }, [...])
  // ── [1] ACCESO de escritura — si crece o se comparte, se muda con la firma de §2.2
  const crear = useCallback(async (datos) => { ... }, [...])
  return { items: data ?? [], crear, ... }
}
```

Lo que nunca se muda a `lib/`: [2] y [3]. La cache, el canal realtime y la memoización
son el **adaptador React** — son exactamente lo que un endpoint o un test no necesitan,
y lo que justifica que el hook exista como capa propia.

### 2.3 Tabla de decisión — ¿dónde va este código?

| El código que estás por escribir… | Va en | Por qué |
|---|---|---|
| Cálculo puro (costos, conversiones, clasificación, máquina de estados) | `lib/<dominio>/` sin `'use client'`, **con test** | Es el único lugar desde donde lo pueden importar cliente Y servidor |
| Query de lectura para una pantalla | Fetcher a nivel de módulo dentro del hook (patrón SWR de `hooks.md`) | El fetcher ya está fuera del cuerpo del hook; si mañana lo necesita el server, se muda a `lib/` sin reescribirse |
| Escritura simple (1 tabla, sin invariantes) | Función CRUD del hook | El costo de indirection no se justifica |
| Escritura que comparten ≥2 pantallas o cliente+servidor | Función con firma `(supabase, restauranteId, input)` en `lib/<dominio>/` | Es la convención ya establecida (`upsertMiseChecklistItem`) |
| Escritura de ≥2 tablas que tiene que salir todo-o-nada | **Función de Postgres** (`supabase.rpc(...)`) o endpoint | El browser no puede abrir transacciones; una secuencia de awaits deja mitades rotas al primer fallo |
| Operación con secreto (API key, certificado) | Endpoint, siempre | `NEXT_PUBLIC_*` va al bundle; lo demás solo existe en el server |
| Operación que necesita saltear RLS | Endpoint con `requireRestauranteId()` primero y `createAdminClient()` después — en ese orden | El admin client sin identidad verificada es la llave maestra tirada en la puerta |
| Llamada a servicio externo (IA, AFIP, impresora) | A través de su puerto en `lib/<servicio>/` | §1.3.A |

### 2.4 Tabla de decisión — ¿la escritura va optimista, endpoint o Postgres?

| Situación | Camino | Referencia |
|---|---|---|
| Tap del usuario esperando feedback inmediato, 1 tabla | Optimista en el cliente: estado local primero, escritura después, refetch como rollback | `hooks.md` § Escrituras del camino crítico |
| 2+ tablas, consistencia importa, sin secreto | Función de Postgres vía `rpc()` — transacción real, corre con RLS | El único todo-o-nada disponible |
| 2+ tablas + secreto o servicio externo | Endpoint (`route.ts`) con `requireRestauranteId()` | Transaction Script legítimo |
| Escritura propuesta por una IA o cualquier actor no confiable | Service Layer: proponer → validar con schema → gate de permisos → confirmar → ejecutar | El pipeline del Coach es el modelo |

---

## 3. Connascence — el upgrade directo de "acoplamiento"

### 3.1 Qué agrega sobre GRASP

GRASP dice "bajo acoplamiento" y ahí se queda: todo acoplamiento es igual de malo, sin
escala. Connascence (Page-Jones, 1996; recuperado por Weirich, 2009) da lo que falta:
**un nombre para cada tipo de acoplamiento y una escala para compararlos**. Dos
elementos son *connascentes* si cambiar uno obliga a cambiar el otro para que el sistema
siga andando. La pregunta deja de ser "¿hay acoplamiento?" (siempre hay) y pasa a ser
"¿de qué tipo, entre cuántos, y a qué distancia?".

### 3.2 Los tipos, de más débil a más fuerte

**Estáticos** — se ven leyendo el código:

| Tipo | Los elementos deben coincidir en… | Ejemplo del stack |
|---|---|---|
| **Nombre** (CoN) | El nombre de algo | Todo archivo que escribe `'tareas'` o `'restaurante_id'` como string. Inevitable y sano — es el acoplamiento mínimo posible. |
| **Tipo** (CoT) | El tipo de un dato | Los 139 tipos de `types/index.ts` — TypeScript lo verifica gratis, por eso es débil. |
| **Significado** (CoM) | Una convención sobre qué significa un valor | `useRestauranteId()` devuelve `''` con el significado "todavía cargando" — cada hook tiene que *saber* eso y guardarse. `permisos_app = []` significando "no configurado" y no "no ve nada". |
| **Posición** (CoP) | El orden/estructura de valores sin nombre | El shape del body entre quien llama un endpoint y quien lo parsea (`{ cuenta_id, restaurante_id }`) cuando no comparten un tipo. |
| **Algoritmo** (CoA) | Dos piezas deben implementar el mismo algoritmo | `unitConversionFactor` copiada: las copias tienen que dar el mismo resultado o los números divergen en silencio. El más fuerte de los estáticos. |

**Dinámicos** — solo se ven ejecutando; siempre más fuertes que cualquier estático:

| Tipo | Los elementos deben coincidir en… | Ejemplo del stack |
|---|---|---|
| **Ejecución** (CoE) | El orden en que pasan las cosas | `signUp` crea 5 entidades en secuencia: cada paso asume los anteriores. `hoyOperativo()` + `turnoActivo()` que combinados dan pares que no existieron (`hooks.md` #19). |
| **Timing** (CoTm) | Cuánto tarda algo | La ventana de 5s para ignorar el eco realtime de la escritura propia; el debounce de 400ms. Cambiar una constante rompe un comportamiento a metros de distancia. |
| **Valor** (CoV) | Valores que deben cambiar juntos | `tareas.estado` y su derivado legacy `status`/`completed_at`: si dos escritores los calculan distinto, los reportes mienten. |
| **Identidad** (CoI) | Referenciar exactamente la misma instancia | `despachosEnVuelo` es un `Map` **de módulo** a propósito: si cada componente tuviera el suyo, el candado anti-duplicados no existe. El más fuerte de todos. |

### 3.3 Los tres ejes

La fuerza sola no decide nada. Se cruzan tres ejes:

- **Fuerza** — qué tan difícil es detectar y refactorizar la coincidencia (la tabla de
  arriba, de arriba hacia abajo).
- **Grado** — cuántos elementos participan. CoA entre 2 archivos es manejable; CoN de un
  nombre de columna entre 95 archivos es un problema aunque el tipo sea el más débil.
- **Localidad** — qué tan lejos están. Connascence fuerte **dentro de una función** es
  gratis; la misma entre un hook del browser y un endpoint del server es una bomba.

### 3.4 Las dos reglas de gestión

1. **Regla de la localidad:** a mayor distancia entre los elementos, más débil tiene que
   ser la connascence que los une. Fuerte y cerca: ok. Fuerte y lejos: refactorizar.
2. **Regla de la degradación:** no se "elimina" el acoplamiento — se **convierte en uno
   más débil**. CoA (dos copias del algoritmo) se degrada a CoN (dos imports del mismo
   módulo) extrayendo la función. CoM (el valor mágico `''`) se degrada a CoN
   exportando una constante o un type guard con nombre. CoP (body posicional) se degrada
   a CoT compartiendo el tipo del payload. CoE (orden de pasos en el cliente) se degrada
   metiendo los pasos en una transacción que los vuelve un solo evento.

- *Qué problema resuelve:* da el **siguiente paso concreto** para cada hallazgo de
  acoplamiento, en vez del genérico "desacoplar".
- *Qué cuesta:* aprender nueve nombres. Nada más.
- *Cómo se reconoce que hacía falta:* el detector más fiable en un repo real es este —
  **si una regla tiene que vivir en prosa (un doc de gotchas, un comentario "acordate
  de…", una memoria de Claude), hay connascence más fuerte de lo que su localidad
  permite.** La prosa es el síntoma de que el código no puede expresar el vínculo. Un
  doc de gotchas es un catálogo de connascence dinámica sin degradar.

### 3.5 Tabla de decisión — síntoma → tipo → remedio

| Síntoma | Connascence | Degradación |
|---|---|---|
| "Acordate de cambiar también X" en un comentario | CoA o CoV a distancia | Extraer a un módulo único que ambos importen (CoA → CoN) |
| Documento que lista los nombres reales de columnas | CoN de grado alto (decenas de archivos) | Generar tipos desde el schema, o concentrar cada tabla en su gateway (menos archivos que conocen el nombre) |
| Valor mágico con significado (`''`, `[]`, `-1`, `'general'`) | CoM | Constante con nombre, type guard, o un tipo que haga imposible el estado ilegal |
| Dos lados parsean el mismo body a mano | CoP | Tipo compartido del payload en `types/` o schema Zod compartido (CoP → CoT) |
| "Primero A, después B, si no queda roto" | CoE | Transacción de Postgres, o una función única que encapsule el orden |
| Constante de tiempo que otro código asume | CoTm | Exportar la constante con nombre desde el único dueño; que el que asume la importe |
| Un cambio de enum exige tocar N mapas paralelos | CoV de grado N | Un solo registro fuente (patrón registry) del que los demás derivan |
| Funciona solo si comparten LA instancia | CoI | Documentarla como decisión (a veces es correcta — un candado global ES de módulo) y testear que siga siendo única |

### 3.6 Ejemplo trabajado — cómo se aplica la escala

Para que el método sea repetible, el caso de la conversión de unidades pasado por los
tres ejes (el informe GRASP lo trató como "Experto en Información violado"; esto es lo
que la reclasificación agrega):

1. **Tipo:** CoA — tres implementaciones (`unitConversionFactor` ×2 +
   `normalizeForStock`) deben producir el mismo resultado. El más fuerte de los
   estáticos.
2. **Grado:** 3 copias, pero los *consumidores* son más: costeo de recetas, reportes de
   consumo teórico, detección de fuga, precios de stock. El grado real se mide por
   cuántos números de negocio divergen si una copia cambia — acá, todos los de plata.
3. **Localidad:** máxima distancia posible en este stack — una copia está del lado
   `'use client'` y otra del lado server. No pueden importarse entre sí *por
   construcción*, así que la sincronización manual no es descuido: es la única opción
   mientras la función viva donde vive.

Conclusión que GRASP no daba: el remedio **no es** "acordarse de sincronizar" (imposible
estructuralmente) ni "unificar en el hook" (agrava la localidad). Es degradar CoA → CoN
moviendo la función a un módulo sin `'use client'` (`lib/unidades.ts`) — es decir, el
fix es *de localidad*, no de disciplina. La misma cadena de razonamiento aplica a
cualquier "hay que acordarse de": primero preguntar si las piezas *pueden* compartir
código, y si no pueden, arreglar eso antes que nada.

---

## 4. SOLID — solo lo que agrega sobre GRASP

GRASP ya cubre la mayor parte de SOLID para este proyecto. Para no duplicar el informe:

- **S (Single Responsibility)** ≡ Alta Cohesión de GRASP. Nada que agregar.
- **O (Open/Closed)** ≡ Variaciones Protegidas + Polimorfismo. El registry del Coach ya
  es el ejemplo canónico: agregar una tool no toca el motor. Nada que agregar.
- **L (Liskov)** — casi sin superficie en un código de funciones con tipado estructural.
  El único contrato de sustitución real del proyecto es `ProveedorFiscal` (el stub debe
  ser usable donde va el real — y lo es: degrada a `'pendiente'`, no explota). Suficiente.

Los dos que sí agregan algo:

**I (Interface Segregation) — traducido a hooks.** Un hook que devuelve lista + 8
funciones CRUD obliga a cada pantalla consumidora a *pagar* todo el hook: la que solo
quiere crear una tarea descarga la tabla entera. El principio traducido: **el consumidor
no debe pagar por lo que no usa**, y en React "pagar" significa fetches, subscripciones
y re-renders, no imports. El proyecto ya inventó las dos curas sin nombrarlas:
variantes lite (`useRecetasLite` cuando solo se necesitan nombres) y el flag
`{ soloEscritura: true }` (`useTareas`) que apaga la descarga y deja solo las
operaciones. ISP acá es la regla que dice **cuándo** crear esas variantes: cuando una
pantalla monta un hook y usa <30% de lo que el hook baja.

**D (Dependency Inversion) — traducido a la frontera `'use client'`.** La versión de
manual ("depender de abstracciones") se vuelve concreta en este stack como la ley §1.3.B:
la lógica no depende del contexto de ejecución. Una función que recibe `supabase` por
parámetro (la firma de §2.2) tiene la dependencia invertida de verdad: no sabe si la
llama un hook, un endpoint o un test. Una función que crea su propio cliente adentro, o
que vive en un archivo `'use client'`, tiene la dependencia cableada — y el costo
aparece como duplicación forzada, no como una abstracción fea.

---

## 5. Lo que este marco descarta, y por qué

| Descartado | Por qué no aplica acá |
|---|---|
| **Clean/Onion como estructura global** | Duplica lo que App Router (capa de aplicación) y RLS (seguridad) ya proveen. El costo — 3-4 archivos por feature — lo paga un solo desarrollador en velocidad, y el beneficio (poder cambiar de framework/base) es un escenario que el proyecto ya decidió no comprar: irse de Supabase es reescribir, con o sin anillos. |
| **Repository clásico con objetos de dominio** | Rompe las tres piezas que funcionan: RLS (re-centraliza una seguridad que la base ya impone mejor), SWR (la cache es del hook, keyed por tenant) y realtime (23 suscripciones que hablan el idioma de Supabase). Ver §2.2 por la alternativa. |
| **Active Record** | Exige clases por tabla en un proyecto de 3 clases en 98.500 líneas. Contra el grano del stack (filas planas + funciones). |
| **DDD táctico completo** (aggregates, entities, value objects, domain events) | El vocabulario ubicuo y los límites de contexto ya están (los dominios de `lib/`); el aparato de objetos no compra nada sin ORM ni equipos múltiples. El único concepto DDD que este stack usa de facto es el aggregate implícito al decidir qué escritura merece transacción (§2.4). |
| **CQRS / Event Sourcing** | Separar modelos de lectura/escritura e historizar eventos se paga con infraestructura (proyecciones, versionado de eventos) que un equipo de una persona no puede operar. La versión barata ya existe: vistas de lectura = queries de Reportes por su cuenta; auditoría = columnas `*_por`/`*_at` donde importa. |
| **Microservicios / colas de trabajo** | Ya descartado con razones en el informe GRASP: el monolito full-stack es la decisión correcta para el tamaño del equipo. Las operaciones largas corren en el request; el día que una supere el timeout de Vercel, la primera respuesta es una función de Postgres o un cron, no una cola. |
| **ORM (Prisma/Drizzle)** | Resolvería la connascence de nombre (tipos generados del schema) pero al costo de interponerse con RLS-por-sesión, realtime y el cliente `@supabase/ssr` que maneja los tokens. El problema de nombres se ataca más barato: menos archivos que conocen cada tabla (§2.2) y, si algún día duele de verdad, `supabase gen types` sin cambiar de cliente. |
| **Métricas DORA / frameworks de proceso** | Descartado ya en el informe GRASP: miden equipos con deploys concurrentes. Acá el gate real es `npm run build` + un desarrollador. |

---

## Fuentes

- **Alistair Cockburn** — *Hexagonal Architecture (Ports & Adapters)*, 2005. El original
  del patrón de puertos; simétrico y local, no una estructura de capas.
- **Robert C. Martin** — *The Clean Architecture*, 2012 (blog); *Clean Architecture*,
  2017 (libro). La Regla de Dependencia. Discutido: la crítica estándar (entre otros,
  Dan North) es que la estructura completa es ceremonia para la mayoría de las apps; este
  marco adhiere a esa crítica para este stack y conserva solo la regla de dependencia.
- **Jeffrey Palermo** — *The Onion Architecture*, 2008 (serie de blog).
- **Martin Fowler** — *Patterns of Enterprise Application Architecture*, 2002.
  Transaction Script, Service Layer, Repository, Table Data Gateway, Active Record, Data
  Mapper, Unit of Work, Identity Map.
- **Meilir Page-Jones** — *What Every Programmer Should Know About Object-Oriented
  Design*, 1996. Origen de connascence, tipos y la regla de localidad.
- **Jim Weirich** — *The Building Blocks of Modularity* (MountainWest RubyConf, 2009) y
  charlas posteriores. La recuperación moderna de connascence y la regla de degradación
  ("convertir connascence fuerte en débil"). El sitio connascence.io deriva de este
  material.
- **Craig Larman** — *Applying UML and Patterns*, 3ª ed., 2004. GRASP — la base que este
  marco extiende, analizada para KitchenOS en `INFORME-GRASP-2026-08.md`.
- **Michael Nygard** — *Release It!*, 2ª ed., 2018. Contexto para stubs que degradan
  legible (`ProveedorFiscalStub`) y timeouts como contrato.
