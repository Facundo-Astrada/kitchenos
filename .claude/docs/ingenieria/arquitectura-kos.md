# KitchenOS medido contra el marco de arquitectura

*Auditoría aplicada · Agosto 2026 · el marco vive en `arquitectura-marco.md`*

Método: se leyó completo el código citado (clientes de Supabase, tenant, proxy, hooks
representativos de cada patrón, la capa de permisos, el registry del Coach, endpoints de
los tres tipos) y se contó con grep/wc antes de afirmar. Números del relevamiento:
**36 endpoints** (`route.ts` bajo `app/api/`), **59 hooks** (61 archivos en `lib/hooks/`
menos 2 tests), **95 archivos** importan `lib/supabase/client`, **37 archivos de UI**
(pantallas + componentes, fuera de `app/api/`) hacen queries `.from()` directas,
**13 archivos** llaman a `api.anthropic.com` con fetch crudo (12 rutas + 1 script),
**15 apariciones** de modelos de IA hardcodeados en `app/api/`.

Escala de veredictos: ✅ cumple · ⚠️ parcial · 🔴 violado.

---

## 0. Correcciones al informe GRASP

El informe GRASP (`INFORME-GRASP-2026-08.md`) es el punto de partida de esta auditoría,
y la mayoría de sus hallazgos se verificaron vigentes. Estos cuatro puntos necesitan
corrección o precisión — importan porque dos de ellos cambian el esfuerzo estimado de
las acciones:

**1. El adaptador de IA no "falta": está construido a la mitad.** Existe
[lib/ia/errores.ts](lib/ia/errores.ts) — 113 líneas que traducen los fallos de la API de
Anthropic a mensajes accionables, con la historia escrita en su header
([errores.ts:4-14](lib/ia/errores.ts#L4-L14): la cuenta sin crédito que salía como "no
se reconoció la foto"). Lo usan 7 de las 12 rutas de IA. Lo que falta es la otra mitad
del puerto: la función que hace el `fetch` (URL, versión de API, modelo, reintentos,
medición de tokens), que sigue copiada en los 12 lugares — por ejemplo
[facturas/route.ts:133-146](app/api/facturas/route.ts#L133-L146), con el modelo
hardcodeado en la línea [141](app/api/facturas/route.ts#L141). La acción 🟠-2 baja de
"crear el adaptador" a "completarlo", y el patrón de manejo de errores ya está decidido.

**2. Existe un puerto hexagonal de manual, sin nombrar: `ProveedorFiscal`.**
[lib/fiscal/index.ts:23-26](lib/fiscal/index.ts#L23-L26) define la interfaz
(`emitir`/`ultimoAutorizado`) con dos adaptadores: `WsfeDirecto` (AFIP real) y
[ProveedorFiscalStub](lib/fiscal/index.ts#L29-L36), que degrada a `'pendiente'` en vez
de explotar cuando no hay config fiscal. Además, el ambiente homologación/producción
—que GRASP listó como "sin capa que elija"— **sí tiene capa**: es un parámetro tipado
`ambiente: 'homologacion' | 'produccion'` que atraviesa
[wsaa.ts:69](lib/fiscal/wsaa.ts#L69) y [wsfev1.ts:86](lib/fiscal/wsfev1.ts#L86). El
punto pendiente de fiscal es la homologación end-to-end (ya en `PENDIENTES.md`), no el
diseño.

**3. El censo de hooks era impreciso, y cambia la conclusión.** Son 59 hooks, no 61
(dos de los archivos son tests). 39 usan SWR y 20 no — y de esos 20, **la mayoría no es
deuda** (desglose completo en §2.2): 6 no tocan datos, 3 derivan de la key SWR
compartida de `useRestauranteConfig`, 4 son de escritura/consulta por demanda sin lista
propia, y de los 7 con estado manual, 3 son parametrizados o paginados donde el propio
`hooks.md` §Cache-SWR punto 3 dice que SWR encaja mal. La deuda real en los hooks es
otra y GRASP no la vio: tres violan el gotcha #20 del propio proyecto (§2.3).

**4. Números menores.** 95 archivos importan el client (GRASP dijo 96 — diferencia
trivial); las pantallas+componentes con queries directas son 37 (GRASP dijo 39
pantallas; el orden de magnitud y la conclusión no cambian).

---

## 1. Puertos y adaptadores — ⚠️ parcial

*Del marco §1.3.A: cada servicio externo con variación merece una interfaz propia.*

| Servicio externo | Puerto hoy | Veredicto |
|---|---|---|
| **AFIP/ARCA** | `ProveedorFiscal` en [lib/fiscal/index.ts:23](lib/fiscal/index.ts#L23) — interfaz + adaptador real + stub que degrada legible | ✅ El mejor ejemplo del repo. Modelo a imitar. |
| **IA (Anthropic)** | Medio puerto: [lib/ia/errores.ts](lib/ia/errores.ts) centraliza la traducción de errores (7/12 rutas); el fetch + modelo + reintentos sigue copiado ×12 | ⚠️ 15 hardcodes de modelo en `app/api/`; cambiar de modelo = 12 archivos; reintentos = 0 en todos |
| **Impresoras ESC/POS** | [lib/print/escpos.ts](lib/print/escpos.ts) — 112 líneas, único punto de contacto con WebUSB/Bluetooth | ✅ Suficiente: un archivo, un protocolo, cero copias |
| **PDF (jsPDF)** | [lib/exportPDF.ts](lib/exportPDF.ts) — 557 líneas, import dinámico, único punto | ✅ Suficiente. No necesita interfaz: librería local determinística (marco §1.4) |
| **WhatsApp** | Links armados donde se usan | ✅ Trivial — un formato de URL, no un servicio |

**Veredicto en una línea:** el proyecto ya demostró dos veces (fiscal, print) que sabe
escribir el puerto; la IA es el único servicio con variación real (los modelos *van* a
cambiar) que quedó sin terminar, y es también el más llamado.

---

## 2. El repositorio y los hooks — ⚠️ parcial

### 2.1 La firma del repositorio ya existe y ya se usa

La pregunta del marco §2.2 — ¿el hook ES el repositorio o USA uno? — tiene respuesta
empírica en este repo: **las operaciones que se comparten ya migraron solas a funciones
con la firma `(supabase, restauranteId, input)`**, y las que no se comparten siguen
dentro del hook. Casos verificados:

- `upsertMiseChecklistItem` (`lib/ops/mise.ts`) — la escritura del mise, compartida
  entre Carta y Recetario.
- `activarMenuParaFechas` (`lib/menus/activarMenu.ts`) — compartida entre Producción y
  Calendario.
- Cada `execute` del registry del Coach
  ([registry.ts:25](lib/coach/tools/registry.ts#L25)) — la misma firma, llamada desde el
  servidor.

Esto confirma la tesis del marco: no hace falta inventar una capa — hace falta
**declarar la convención que la evolución del código ya eligió**, para que la próxima
extracción no la reinvente distinta.

### 2.2 SWR vs manual: el censo real de los 20 sin SWR

| Grupo | Hooks | ¿Deuda? |
|---|---|---|
| Sin datos (utilidades React / cliente de endpoint) | `useDebounce`, `useIsDesktop`, `useDesktopShortcuts`, `useRestauranteId`, `useTourAutomatico`, `useKitchenCoach` | No — SWR no aplica |
| Derivan de la key SWR compartida de `useRestauranteConfig` | `useImpresionConfig` (0 queries propias), `usePlazasCustom`, `useTurnosServicio` | No — ya están cacheados vía la key compartida |
| Consulta/escritura por demanda, sin lista al montar (0 `useState` de datos) | `useCuenta` (solo escritura), `usePreciosProveedores`, `useReporteVentas`, `useVentasCerradas` | No — no hay nada que cachear al montar |
| Estado manual, parametrizado o paginado | `useReportes` (por período), `useFacturas` (paginado), `usePase` (paginado + realtime) | No como *patrón* — `hooks.md` §Cache-SWR punto 3 lo prevé — pero los tres cargan la deuda de §2.3 |
| Estado manual, lista al montar — candidatos reales a migrar | `useUserRol`, `useOnboardingProgress`, `useProduccionRegistros`, `useCalendario` | Sí, menor: re-consultan en cada navegación. Migrar al tocarlos, no en batch |

**Respuesta a la pregunta de la sesión:** el doble patrón **no** es deuda en bloque. Es
un borde de diseño legítimo (SWR para listas keyed por tenant; imperativo para lo
parametrizado y lo por-demanda) con solo 4 hooks del lado equivocado del borde.

### 2.3 La deuda que el informe GRASP no vio: el proyecto viola su propia regla

`hooks.md` gotcha #20 dice, con la historia del bug al lado: `createClient()` en el
cuerpo de un hook va **siempre** envuelto en `useMemo`, porque no es singleton y una
referencia nueva por render re-dispara cualquier `useEffect` que dependa de una función
del hook — loop de fetches intermitente. Tres hooks lo violan hoy:

| Hook | Línea | Agravante |
|---|---|---|
| `useFacturas` | [useFacturas.ts:48](lib/hooks/useFacturas.ts#L48) | `fetchFacturas` (useCallback con `supabase` en deps, [línea 82](lib/hooks/useFacturas.ts#L82)) se recrea en cada render de la pantalla más pesada del proyecto |
| `usePase` | [usePase.ts:18](lib/hooks/usePase.ts#L18) | Mismo patrón, con realtime encima |
| `useReportes` | [useReportes.ts:136](lib/hooks/useReportes.ts#L136) | Mismo patrón en el hook de agregaciones (679 líneas) |

**Por qué importa más allá de los tres archivos:** es connascence de algoritmo entre el
doc y el código — la regla vive en prosa (`hooks.md`) y nada la verifica. El mismo
mecanismo que ya falló con los permisos duplicados. Un chequeo automático (lint o test
que grepee el patrón) degrada "acordate del gotcha #20" a "el CI no te deja".

### 2.4 Lo que los hooks hacen bien (para no romperlo al refactorizar)

[useTareas.ts](lib/hooks/useTareas.ts) es el hook más complejo y es un catálogo de
diseño deliberado que cualquier refactor debe preservar: el candado anti-duplicados como
`Map` **de módulo** ([línea 49](lib/hooks/useTareas.ts#L49), connascence de identidad
correcta y documentada — el comentario explica por qué no puede ser un ref por
componente), el descarte del eco realtime de la escritura propia
([líneas 114-121](lib/hooks/useTareas.ts#L114-L121)), la derivación de `status` legacy
en el único punto de escritura de `estado`
([líneas 221-237](lib/hooks/useTareas.ts#L221-L237)), y la ventana de 60 días con su
justificación en números ([líneas 24-30](lib/hooks/useTareas.ts#L24-L30)). Nada de esto
sobrevive a un "repositorio" genérico que esconda Supabase — es el argumento empírico
del marco §2.2.

---

## 3. Service Layer y Unit of Work — 🔴 violado en las escrituras multi-tabla del browser

*Del marco §2.4: ≥2 tablas + todo-o-nada → función de Postgres o endpoint. Nunca una
secuencia de awaits en el navegador.*

### 3.1 Los tres transaction scripts que corren en el navegador

**`signUp` — 5 entidades en secuencia** (ya señalado por GRASP, sigue igual): usuario →
restaurante → vínculo → ficha de equipo → permisos. Si el paso 3 falla, queda una cuenta
rota que se repara a mano — el endpoint `/api/invitar/vincular` existe *como curita* de
ese fallo.

**`useFacturas.crearFactura` — el caso más grande y no estaba en el informe.** Son ~235
líneas ([useFacturas.ts:101-336](lib/hooks/useFacturas.ts#L101-L336)) que desde el
navegador: leen todos los productos, insertan la factura
([líneas 145-163](lib/hooks/useFacturas.ts#L145-L163)), auto-crean el proveedor si no
existe ([líneas 166-182](lib/hooks/useFacturas.ts#L166-L182)), y por cada ítem matchean
o crean productos, actualizan precios e historial. Multi-tabla, sin transacción, con
lógica de negocio (matching de nombres, inferencia de categoría —
[líneas 22-38](lib/hooks/useFacturas.ts#L22-L38)) que ningún otro caller puede reusar
porque vive en un `'use client'`. Una factura que falla a mitad deja el proveedor creado
y los precios a medio actualizar.

**`useCuenta.cobrarCuenta` — 6 pasos con dos saltos al servidor**
([useCuenta.ts:68-152](lib/hooks/useCuenta.ts#L68-L152)): pagos → cerrar cuenta →
liberar mesa → merma-auto (fire-and-forget con `.catch(() => {})`,
[líneas 111-117](lib/hooks/useCuenta.ts#L111-L117)) → emisión fiscal → flag facturado.
El diseño de "lo fiscal no bloquea el cobro" es deliberado y correcto (el comentario de
la [línea 119](lib/hooks/useCuenta.ts#L119) lo dice); lo que no es deliberado es que los
pasos 1-3 puedan quedar por la mitad si se corta la conexión entre ellos: pagos
registrados con cuenta abierta, o cuenta cerrada con mesa ocupada.

### 3.2 La ironía: el único Service Layer del proyecto lo tiene la IA

El pipeline del Coach es un Service Layer completo de manual: el modelo propone →
[propose.ts:29-32](lib/coach/tools/propose.ts#L29-L32) gatea permisos con
`puedeEjecutarTool` → el usuario confirma → `confirm` re-valida **estricto** con el
schema Zod antes de escribir (el comentario de
[propose.ts:36-38](lib/coach/tools/propose.ts#L36-L38) documenta la decisión laxo-al-
proponer / estricto-al-ejecutar). Hasta las tools de *lectura* que devuelven plata pasan
por el permiso `verCostos` ([registry.ts:318-336](lib/coach/tools/registry.ts#L318-L336)),
filtrado server-side **antes** de armar la respuesta para que el modelo nunca reciba un
número que no puede decir ([server.ts:53-57](lib/permisos/server.ts#L53-L57)).

**El actor menos confiable del sistema (un LLM) tiene la puerta de escritura mejor
custodiada que el usuario humano**, cuyas escrituras multi-tabla corren sin validación
central desde el browser. No es una crítica al Coach — es la demostración interna de que
el patrón correcto ya está construido y funcionando; falta aplicárselo a los tres flujos
de §3.1.

---

## 4. Controlador y frontera de confianza — 🔴 violado (verificado vigente hoy)

*Del marco §2.3: operación con admin client → `requireRestauranteId()` primero, en ese
orden.*

Los números, re-contados sobre el código actual: **15 de 36** endpoints usan
[requireRestauranteId](lib/api/tenant.ts#L7-L18); **15** resuelven identidad a mano con
`auth.getUser()` (con variaciones — p. ej.
[facturas/route.ts:66-82](app/api/facturas/route.ts#L66-L82) resuelve el tenant solo
como best-effort para leer config); **23** usan `createAdminClient`. Y los tres
endpoints sin verificación alguna que GRASP marcó como prioridad 1 **siguen abiertos**:

- [carta/86/route.ts:7-16](app/api/carta/86/route.ts#L7-L16) — admin client, cero auth,
  actualiza cualquier `carta_item_id` que le manden.
- [salon/merma-auto/route.ts:11-14](app/api/salon/merma-auto/route.ts#L11-L14) — admin
  client, cero auth, y el `restaurante_id` **viene del body**.
- [salon/prep-list-update/route.ts:14-17](app/api/salon/prep-list-update/route.ts#L14-L17)
  — admin client, cero auth.

Los tres son alcanzables sin sesión porque [proxy.ts:40-45](proxy.ts#L40-L45) marca todo
`/api/*` como público (correcto en general: cada endpoint debe auto-verificarse — estos
tres no lo hacen).

**Lo que esta auditoría agrega sobre GRASP: el agujero tiene un cómplice del lado
cliente, y el fix es de a dos.**
[useCuenta.ts:111-117](lib/hooks/useCuenta.ts#L111-L117) le manda `restaurante_id` en el
body a merma-auto — connascence de posición *a través de la frontera de confianza*: el
endpoint confía en un dato que el cliente elige, y mientras algún caller lo mande, el
endpoint "necesita" aceptarlo. Cerrar el endpoint sin tocar `useCuenta` rompe el flujo
de cobro; por eso la acción 🔴-1 incluye los dos lados, cosa que el informe GRASP no
decía.

Contraejemplo bien hecho, para copiar textual:
[stock/sync-precio/route.ts:8-24](app/api/stock/sync-precio/route.ts#L8-L24) — tenant
del token, verificación de que el producto pertenece al tenant, y recién ahí el admin
client.

Mención aparte: [coach/route.ts:23-49](app/api/coach/route.ts#L23-L49) muestra la
arquitectura de seguridad *real* del sistema funcionando — `buildSnapshot` consulta
`productos`, `haccp_vencimientos` y `facturas` **sin ningún `.eq('restaurante_id')`**,
porque usa el server client con la sesión del usuario y RLS filtra solo. Es la prueba
viva de que la barrera es la base, no el código — y de por qué un endpoint con admin
client y sin verificación anula toda esa barrera de un saque.

---

## 5. Reclasificación connascence de los hallazgos

*La escala y el método, en `arquitectura-marco.md` §3. F = fuerza, G = grado,
L = localidad.*

| Hallazgo | Tipo | F / G / L | Degradación concreta |
|---|---|---|---|
| `unitConversionFactor` ×3 ([useRecetas.ts:32](lib/hooks/useRecetas.ts#L32) `'use client'` + copia server en `consumoTeorico.ts` + variante en `precios.ts`) | CoA | Fuerte / 3 copias, todos los números de plata / máxima (frontera client-server) | CoA → CoN: `lib/unidades.ts` sin `'use client'`. El fix es de localidad, no de disciplina (marco §3.6) |
| `mapRol` ×2 ([permisos/server.ts:21-38](lib/permisos/server.ts#L21-L38) + `auth/context.tsx`) — el propio header lo admite ([server.ts:14](lib/permisos/server.ts#L14)) | CoA | Fuerte / 2 / frontera client-server | Igual que arriba: `lib/permisos/roles.ts`. El precedente `resolver.ts` ya probó el método ([resolver.ts:1-12](lib/permisos/resolver.ts#L1-L12)) |
| Nombres de tablas/columnas en 95 archivos (`columnas.md` + skill `/supabase-check` como compensación) | CoN | Débil / **95 archivos** / todo el repo | El tipo más débil vuelto problema por grado puro. No se elimina: se baja el grado — menos archivos que conocen cada tabla (§2.1), y la doc existente deja de ser carga cuando el grado baja |
| `restaurante_id` en el body de merma-auto ↔ [useCuenta.ts:115](lib/hooks/useCuenta.ts#L115) | CoP + CoM | Fuerte / 2 / **a través de la frontera de confianza** | La única connascence intolerable del repo: un lado elige el valor que al otro le dicta la seguridad. Degradar moviendo el dato al token (acción 🔴-1) |
| `''` de `useRestauranteId` = "cargando" — todo hook debe saberlo y guardarse | CoM | Media / 59 hooks / repo | Aceptada y bien gestionada: la key SWR nula (`RESTAURANTE_ID ? key : null`) la convierte en patrón mecánico. Documentada como regla inamovible #1. No tocar |
| `permisos_app = []` significa "no configurado", no "no ve nada" | CoM | Media / era 2 copias / era frontera | **Ya degradada** en [resolver.ts:40-51](lib/permisos/resolver.ts#L40-L51): el `null` con nombre y comentario reemplazó la convención tácita. Modelo de cómo se cierra un CoM |
| `signUp` / `crearFactura` / `cobrarCuenta`: orden de escrituras en el browser | CoE | La más fuerte / 5-6 pasos / cliente-servidor | CoE → un solo evento: transacción de Postgres (rpc) o endpoint. Acciones 🟠-3 y 🟡-6 |
| Ventana de eco realtime (5s en `useTareas`, otras en otros hooks) + debounce 400ms | CoTm | Fuerte / por hook / local | Ya es local y con nombre ([ECO_REALTIME_MS](lib/hooks/useTareas.ts#L22)). Correcta. Solo cuidar que ninguna copia aparezca sin importar la constante |
| `estado` → `status`/`completed_at` derivados | CoV | Fuerte / 1 escritor | **Ya degradada**: un único punto de escritura lo resuelve adentro ([useTareas.ts:221-237](lib/hooks/useTareas.ts#L221-L237)), con el porqué comentado. Correcta |
| `despachosEnVuelo` Map de módulo ([useTareas.ts:49](lib/hooks/useTareas.ts#L49)) | CoI | La más fuerte / 3 componentes / módulo | Deliberada, comentada y correcta — el ejemplo de que connascence fuerte *elegida y documentada* no es deuda |
| Gotcha #20 en prosa vs. 3 hooks que lo violan (§2.3) | CoA doc↔código | Fuerte / 59 hooks potenciales / repo | Prosa → chequeo automático (lint/test). Acción 🟠-4 |

**El meta-hallazgo:** `hooks.md` con sus 26 gotchas es, leído con esta lente, **un
catálogo de connascence dinámica escrito en prosa** — cada gotcha documenta un vínculo
(de ejecución, de timing, de valor) que TypeScript no puede ver. El doc es valiosísimo
como registro; el objetivo de largo plazo es que cada gotcha migre de "regla que hay que
recordar" a "estructura que lo impide" (como ya pasó con #19 → `turnoVigente()` y con la
cascada de permisos → `resolver.ts`). La vara para features nuevas: si el PR necesita
agregar un gotcha, preguntarse primero si puede agregar una estructura.

---

## 6. Deuda deliberada vs accidental

Este repo documenta sus concesiones en comentarios largos; tratarlas como bugs sería un
error del auditor. Clasificación de lo que esta auditoría tocó:

| Ítem | Clase | Evidencia |
|---|---|---|
| Links polimórficos sin FK (`menu_preparaciones.ref_id`, HACCP por `ilike`) | **Deliberada** | Documentados como tales en `ARQUITECTURA.md` §5 |
| Tabs de OPS que no se desmontan (`display:none`) | **Deliberada** | `hooks.md` #21 la explica y da el patrón de sync |
| `puedeEditar` con puesto asignado siempre `false` salvo admin | **Deliberada (congelada)** | Comentario en [server.ts:113-115](lib/permisos/server.ts#L113-L115): "se replica tal cual, no se corrige acá" |
| Fiscal no bloquea el cobro (`fire-and-forget`) | **Deliberada** | Comentario en [useCuenta.ts:119](lib/hooks/useCuenta.ts#L119) |
| Ventana de 60 días de tareas | **Deliberada** | [useTareas.ts:24-30](lib/hooks/useTareas.ts#L24-L30) con los números que la justifican |
| 3 endpoints sin auth | **Accidental** | Ningún comentario los defiende; contradicen el patrón que 15 endpoints ya siguen |
| `crearFactura` de 235 líneas en el browser | **Accidental** (por acreción) | Sin comentario de decisión; creció con cada feature de import |
| 3 hooks violando gotcha #20 | **Accidental** | Contradicen la regla escrita del propio proyecto |
| `useUserRol` y 3 más sin SWR (lista al montar) | **Accidental menor** | Anteriores al patrón SWR; migrar al tocarlos |
| Duplicación `mapRol` | **Accidental reconocida** | El propio código la marca como pendiente ([server.ts:14](lib/permisos/server.ts#L14)) |

---

## 7. Acciones priorizadas

Formato listo para `PENDIENTES.md`. Las estimaciones asumen una sesión enfocada.

### 🔴 1. Cerrar los 3 endpoints sin auth — y su cómplice del lado cliente
**Problema:** [carta/86](app/api/carta/86/route.ts#L7), [salon/merma-auto](app/api/salon/merma-auto/route.ts#L11) y [salon/prep-list-update](app/api/salon/prep-list-update/route.ts#L14) usan `createAdminClient()` sin verificar quién llama; merma-auto además acepta `restaurante_id` del body, que [useCuenta.ts:115](lib/hooks/useCuenta.ts#L115) le manda. Alcanzables sin sesión (todo `/api/*` es público en `proxy.ts`).
**Por qué importa:** anulan el RLS de las 78 tablas — cualquiera puede marcar platos agotados o descontar stock de cualquier restaurante. Vigente hoy, verificado sobre el código.
**Solución:** `requireRestauranteId()` al inicio de los tres (copiar el patrón de [sync-precio](app/api/stock/sync-precio/route.ts#L8-L24)), verificar pertenencia del recurso al tenant, **y en el mismo commit** sacar `restaurante_id` del body en `useCuenta.cobrarCuenta` — el endpoint y su caller cambian juntos o se rompe el cobro. Ojo con el caller del KDS de carta/86: verificar desde dónde se llama antes de exigir sesión (si el KDS corre logueado, no cambia nada).
**Esfuerzo:** 2-3 horas con verificación en prod.

### 🟠 2. Completar el puerto de IA (`lib/ia/claude.ts`)
**Problema:** la mitad del adaptador ya existe ([lib/ia/errores.ts](lib/ia/errores.ts)); el fetch + modelo + reintentos sigue copiado en 12 rutas (15 hardcodes de modelo).
**Por qué importa:** cambiar de modelo = 12 archivos; reintentos ante error transitorio = 0 hoy (un 529 de Anthropic tira la importación de la factura); medir gasto = imposible.
**Solución:** una función `pedirAClaude({ modelo: 'rapido'|'potente', system, content, maxTokens })` que adentro use `clasificarErrorIA` (ya escrito), reintente lo `reintentable: true` (el campo ya existe en [errores.ts:23](lib/ia/errores.ts#L23) y nadie lo consume), y loguee tokens. Migrar las 12 rutas es mecánico; empezar por las 5 que aún no usan `errores.ts` — doble ganancia.
**Esfuerzo:** 3-4 horas (baja respecto del informe GRASP: el manejo de errores ya está decidido y escrito).

### 🟠 3. `crearFactura` al servidor, como transacción
**Problema:** ~235 líneas multi-tabla en el browser ([useFacturas.ts:101-336](lib/hooks/useFacturas.ts#L101-L336)): factura + proveedor auto-creado + productos matcheados/creados + precios + historial, sin transacción.
**Por qué importa:** un corte a mitad de camino deja proveedor creado y precios a medias — el mismo tipo de rotura que `signUp` (que ya necesitó su endpoint-curita). Además la lógica de matching es inaccesible para `facturas-universal`, que ya la reimplementó una vez (ver `PENDIENTES.md` §factura_items.producto_id).
**Solución:** mover la lógica a un endpoint (o función de Postgres para el núcleo insert factura+items) con la firma del marco §2.2, y dejar `useFacturas.crearFactura` como un `fetch` + `mutate()`. La extracción habilita compartir el matching con el importador universal.
**Esfuerzo:** 1 día. Primer paso más chico que ya deja valor: extraer solo el matching de productos a `lib/facturas/matching.ts` con test (2-3 h), sin mover el flujo.

### 🟠 4. Los gotchas verificables pasan a CI
**Problema:** 3 hooks violan el gotcha #20 hoy ([useFacturas.ts:48](lib/hooks/useFacturas.ts#L48), [usePase.ts:18](lib/hooks/usePase.ts#L18), [useReportes.ts:136](lib/hooks/useReportes.ts#L136)); nada impide el cuarto. Y ningún chequeo impide un endpoint nuevo con `createAdminClient` sin `requireRestauranteId`.
**Por qué importa:** son las dos reglas del proyecto con historial de bug real, y ambas viven solo en prosa — el mecanismo exacto que ya falló con los permisos duplicados.
**Solución:** arreglar los 3 hooks (15 min, es una línea por hook) + un test de Vitest que grepee: (a) `const supabase = createClient()` sin `useMemo` dentro de `lib/hooks/`, (b) archivos de `app/api/**` que importen `createAdminClient` sin importar `requireRestauranteId` (allowlist explícita para `cron/reset-demo` e `invitar`, que verifican distinto).
**Esfuerzo:** 2-3 horas.

### 🟡 5. Unificar `mapRol` y las unidades (sin cambios respecto del informe GRASP)
**Problema:** CoA en la frontera client-server: `mapRol` ×2, conversión de unidades ×3.
**Por qué importa:** el precedente está documentado en [resolver.ts:1-12](lib/permisos/resolver.ts#L1-L12) — dos copias sincronizadas a mano terminaron con los mismos dos bugs.
**Solución:** `lib/permisos/roles.ts` y `lib/unidades.ts`, ambos sin `'use client'`; los tests de `consumoTeorico.test.ts` se mudan y cubren a todos los consumidores.
**Esfuerzo:** 2-3 horas.

### 🟡 6. Declarar la convención del repositorio en `hooks.md`
**Problema:** la firma `(supabase, restauranteId, input)` ya es la convención de facto (§2.1) pero no está escrita; la próxima extracción puede inventarse otra forma.
**Por qué importa:** es la respuesta del proyecto a "¿dónde va una operación compartida?" — barata de documentar ahora, cara de unificar después.
**Solución:** una sección corta en `hooks.md` ("Operación compartida entre pantallas o cliente/servidor → función con esta firma en `lib/<dominio>/`") citando `mise.ts` como modelo, + la tabla de decisión del marco §2.3.
**Esfuerzo:** 30 minutos.

### 🟢 7. Migrar los 4 hooks lista-al-montar a SWR — al tocarlos
**Problema:** `useUserRol`, `useOnboardingProgress`, `useProduccionRegistros`, `useCalendario` re-consultan en cada navegación.
**Por qué importa:** costo chico y acotado (por eso 🟢): requests repetidos, no bugs.
**Solución:** patrón estándar de `hooks.md` §Cache-SWR, uno por vez, cuando una sesión ya los toque por otro motivo. No hacer batch dedicado.
**Esfuerzo:** ~30 min por hook, por oportunidad.

---

## Cierre

El diagnóstico del informe GRASP ("dos capas, dos calidades") se sostiene, pero esta
pasada lo afina: **la dirección correcta no solo está demostrada — está más avanzada de
lo que el propio proyecto sabe.** Hay un puerto hexagonal terminado (`ProveedorFiscal`),
medio puerto de IA (`errores.ts`), un Service Layer completo (el pipeline del Coach), y
una firma de repositorio ya convencionalizada por evolución (`mise.ts`,
`activarMenu.ts`, el registry). Casi nada de lo que falta requiere diseño nuevo:
requiere **nombrar y completar** lo que la evolución del código ya eligió, y cerrar la
única puerta (los 3 endpoints) donde el diseño implícito todavía no llegó.
