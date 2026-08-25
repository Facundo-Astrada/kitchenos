# PLAN-ACCESO-Y-USO — agosto 2026

Origen: lista de 9 observaciones de Facundo (24 ago 2026), auditadas contra código
y base de producción antes de planificar. Tres de los nueve puntos resultaron ser
otra cosa que lo reportado — está anotado en cada bloque.

**Orden de ejecución: B0 → B1 → B2 → B3 → B4 → B5 → B6 → B7.**
B0/B1/B2 son bugs que hoy rompen el uso real. El resto es producto.

## Estado (24 ago 2026)

| Bloque | Estado | Commit |
|---|---|---|
| B0.1 saldo Anthropic | ⏳ Facundo, al final | — |
| B0.2 verificar key de Vercel | ⏳ con B0.1 | — |
| B0.3 error de IA legible + no inventar datos | ✅ deployado | `53f1c1a` |
| B1 acceso al dashboard | ✅ deployado | `938587b` |
| B2 mise: tildado ≠ "para producir" | ✅ deployado | `e3624b0` |
| B3 food cost por puesto | ✅ deployado | `2bb0423` |
| B4 primer ingreso | ⬜ pendiente | — |
| B5 descubribilidad | ⬜ pendiente | — |
| B6 etapas en el alta de receta | ⬜ pendiente | — |
| B7 sidebar + fullscreen OPS | ⬜ pendiente | — |

Migraciones aplicadas: `fix_rol_permisos_inicio_home_y_operaciones`,
`backfill_equipo_miembros_auth_user_id`, `backfill_tareas_colgadas_con_mise_tildado`,
`add_ver_costos_permiso`.

---

## B0 — Desbloqueo inmediato (IA caída)

**Observación #4** ("URGENTE: no funciona la carga de fotos mediante IA").

**Diagnóstico: no es un bug de código.** Llamada real a la API con la key de
`.env.local`:

```
{"type":"error","error":{"type":"invalid_request_error",
  "message":"Your credit balance is too low to access the Anthropic API."}}
```

Los model IDs (`claude-sonnet-4-6`, `claude-haiku-4-5-20251001`) están vigentes —
verificado contra `GET /v1/models`. Lo que falla es el saldo de la cuenta, y por
eso cae **todo** lo que usa IA, no solo fotos:

| Endpoint | Qué rompe |
|---|---|
| `/api/recetas/import` | Importar receta por foto / texto / voz |
| `/api/carta/import` | Importar carta |
| `/api/facturas` | Escanear factura |
| `/api/importador/facturas-universal` | Importador de facturas |
| `/api/importador/fichas-tecnicas` | Fichas técnicas PDF |
| `/api/listas-precios` | Listas de precios |
| `/api/coach` | Kitchen Coach entero |

### B0.1 — Saldo (Facundo, al final del plan)
Cargar crédito en la cuenta de Anthropic. **Decisión de Facundo (24 ago): lo
hace él, al último.**

Consecuencia para el resto del plan: **la IA queda caída durante toda la
ejecución.** Ningún bloque puede probarse contra un endpoint de IA real, y B0.3
pasa a ser lo único que hace legible la caída mientras dura.

### B0.2 — Verificar la key de producción
Confirmar que `ANTHROPIC_API_KEY` en Vercel es la misma de `.env.local`. Si es
de otra organización, el diagnóstico de arriba aplica solo a local y hay que
repetir la prueba contra la key de prod. Se chequea junto con B0.1.

### B0.3 — Que el error real llegue al usuario (código)
Hoy el usuario ve "no se reconoció la foto" cuando el server sabe que es
facturación. Un cocinero reintenta cinco veces con otra foto.

- Helper compartido `lib/ia/errores.ts`: mapea la respuesta de la API de
  Anthropic a un mensaje accionable. Casos mínimos: `credit balance` →
  *"El servicio de IA está sin crédito. Avisale al administrador."*;
  `401/403` → *"La clave de IA no está configurada."*; `429` →
  *"El servicio de IA está saturado, probá en un minuto."*; `overloaded_error`
  → mismo mensaje que 429; resto → mensaje genérico + `request_id`.
- Aplicarlo en los 7 endpoints de la tabla. Varios ya devuelven `errorDetail`
  crudo de Anthropic (`recetas/import` lo hace) — reemplazar por el helper,
  no acumular dos caminos.
- En la UI, mostrar ese mensaje. Auditar que ningún `catch` lo pise con un
  string fijo.

**Criterio de listo:** con la key sin saldo, subir una foto de receta muestra
"El servicio de IA está sin crédito", no "no se reconoció la foto".

---

## B1 — Acceso al dashboard (el bug más grave de la lista)

**Observación #1** ("algunos usuarios no pueden acceder al dashboard cuando
recién se los incorpora").

**Diagnóstico: dos bugs apilados, los dos confirmados contra la base.**

### Bug A — la invitación nunca vincula el usuario al miembro

`app/(auth)/registro-invitado/page.tsx` (`handleSubmit`) actualiza `activo` y
`nombre` de `equipo_miembros`, pero **nunca escribe `auth_user_id`**. Caso real:

```
Valentino / valentinocortesb@gmail.com / Bros comedor
  auth.users            ✅ f3d465d9-…  (last_sign_in 23 ago)
  user_restaurantes     ✅ rol='cocinero'
  equipo_miembros       ✅ puesto_id='a0e00b72-…', activo=true
  equipo_miembros.auth_user_id  ❌ NULL
```

`usePermisos.fetchPermisosData` busca el miembro por `auth_user_id`
(`lib/hooks/usePermisos.ts:71`). No lo encuentra → `modulosEfectivos = null` →
**ignora el `permisos_app` del puesto** y cae al fallback por rol.
`lib/auth/context.tsx` tiene el mismo problema: el nombre del usuario degrada al
prefijo del email y `miembro_id` queda `null`.

### Bug B — el fallback por rol está roto de origen

El seed de `rol_permisos` (paso 5 de `signUp`, `lib/auth/context.tsx`) escribe
`'inicio'` para cocinero/bachero/compras, pero `RUTA_A_MODULO['/'] = 'home'`
(`lib/constants.ts:185`). Confirmado en la base de Bros:

```
cocinero → ['inicio','tareas','recetario','stock','checklist','pase','produccion']
                ↑ nunca matchea 'home'          ↑ y falta 'operaciones'
```

`puedeVer('home')` → `false` → `RouteGuard` → **"Sin acceso a home"**.
OPS también bloqueado. Y `SidebarNav` muestra "Inicio" siempre
(`id === 'home' || isAdmin || puedeVer(id)`, línea 34), así que el usuario ve el
botón, lo toca y le sale un candado.

Aplica a los dos restaurantes con datos reales (Bros y El Rescoldo) y a todo
restaurante creado con el seed actual.

### B1.1 — La invitación vincula el usuario
En `registro-invitado`, al confirmar la contraseña, escribir `auth_user_id` en
`equipo_miembros`. El `.eq('activo', false)` actual hace que el update no corra
si el admin ya activó la ficha a mano — sacarlo y matchear por
`email + restaurante_id`, o mejor: mover la vinculación a un endpoint server con
`admin.ts`, que no depende de RLS ni del estado de `activo`.

### B1.2 — Backfill de los que ya entraron rotos
```sql
UPDATE equipo_miembros em
SET auth_user_id = u.id
FROM auth.users u
WHERE lower(u.email) = lower(em.email) AND em.auth_user_id IS NULL;
```
Hoy afecta exactamente **1 fila** (Valentino). Las demás filas con
`auth_user_id` nulo tienen `email` nulo: son seeds de demo, no usuarios reales —
la query no las toca. Dejar el script en `scripts/`, idempotente.

### B1.3 — Normalizar `'inicio'` → `'home'`
- Migración de datos sobre `rol_permisos.modulos_visibles`: reemplazar
  `'inicio'` por `'home'` y agregar `'operaciones'` donde ya estaba
  `'tareas'`/`'checklist'`/`'produccion'` (esas tres rutas mapean a
  `'operaciones'` desde la consolidación de OPS — sin el módulo padre, el
  cocinero no entra a ninguna).
- Arreglar el seed de `signUp` en `lib/auth/context.tsx`: derivar todas las
  listas de `ModuloId` reales, nunca strings sueltos. Idealmente que
  `TODOS_LOS_MODULOS` y las listas por rol salgan de `lib/constants.ts`
  (`MODULOS_POR_ROL` ya existe y usa `'home'`), para que no puedan divergir de nuevo.

### B1.4 — Defensa en profundidad: nunca dejar a nadie sin app
Aunque A y B queden arreglados, una config mala de un admin puede volver a
dejar a alguien encerrado. Dos redes:
- `usePermisos.puedeVer`: tratar `'inicio'` como alias legacy de `'home'`
  (normalizar al leer, no reescribir la fila).
- `RouteGuard`: `'/'` nunca se bloquea. Si el usuario no puede ver ningún
  módulo, en vez del candado mostrar una pantalla que diga qué pasó y quién lo
  resuelve. Un candado en la home es indistinguible de una app rota.

### B1.5 — Regresión
Test que cubra el caso Valentino end-to-end: invitar → aceptar → `auth_user_id`
escrito → `modulosEfectivos` sale del puesto → `puedeVer('home')` y
`puedeVer('operaciones')` son `true`.

**Criterio de listo:** un usuario recién invitado con puesto asignado entra al
dashboard y a OPS sin que un admin toque nada.

---

## B2 — Mise: ítems tildados que aparecen "para producir"

**Observación #9.** **Confirmado con filas reales de Bros** — y la sospecha de
Facundo ("tal vez se mezcló con lo del turno anterior") es exactamente la causa.

| tarea | categoría | estado | registro del mise |
|---|---|---|---|
| aceite de ajo (23 ago, parrilla) | `pase_turno` | **pendiente** | `completado=true`, `almuerzo:apertura` |
| Cilantro osmosis (20 ago, fríos) | `pase_turno` | en_curso | `completado=true`, `almuerzo:apertura` |

Esas tareas las creó el **cierre del turno anterior** en Modo Control
(`handleCrearTareaControl` → `categoria:'pase_turno'`, `turno_fecha` = jornada
del turno siguiente). Al abrir, el mise las muestra en el aviso ámbar
**"Te dejaron en producción — N para hacer"**. Dos fallas independientes:

### B2.1 — El aviso no mira si el ítem ya está tildado (presentación)
`app/(app)/checklist/ClientView.tsx:693`:
```ts
const recibidosEnProduccion = useMemo(
  () => plazaItems.filter(i => tareasPaseRecibidasSet.has(i.id)), …)
```
Filtra solo por la tarea abierta. El contador de arriba (`enProduccion`, línea
674) **sí** excluye `regMap[i.id]?.completado` — la inconsistencia está a 20
líneas. Agregar el mismo filtro acá y en `pendientesSinResolver` (línea 689).

Esto solo mata el síntoma. Un ítem tildado no puede figurar como "para hacer",
pase lo que pase con el sync.

### B2.2 — El sync tilde→tarea es demasiado angosto (dato)
`handleMiseUpsert` (línea 1013) matchea
`t.turno_fecha === today && t.checklist_item_id === itemId`, y solo corre cuando
`d.completado !== undefined`. Un `pase_turno` heredado puede tener otro
`turno_fecha` que el día en que se lo tilda, y hay caminos de tildado que no
pasan por acá.

- Matchear **toda tarea abierta** de ese `checklist_item_id`
  (`estado !== 'listo'`), sin condicionar por `turno_fecha`.
- Mover el sync a `lib/ops/syncMise.ts`, que ya es el dueño del vínculo
  `tareas.checklist_item_id`, para que valga en todos los caminos de escritura
  en vez de solo en el wrapper de la pantalla.
- Verificar el auto-tilde por cantidad (el ítem que se tilda solo al llegar al
  objetivo): confirmar que manda `completado` y dispara el sync.

### B2.3 — Backfill de las tareas colgadas
Cerrar los `pase_turno` cuyo ítem ya está `completado` en el registro del mise
de esa fecha. Script en `scripts/`, con `--dry-run` primero: la corrida real
tiene que listar qué va a cerrar antes de escribir.

### B2.4 — Regresión
Test: ítem con `pase_turno` abierto heredado del turno anterior + tilde en
apertura → la tarea queda `listo` y el ítem desaparece del aviso ámbar.

---

## B3 — Food cost configurable por puesto

**Observación #6** ("el food cost lo ven solo admin").
**Ya es admin-only** en Recetario y Carta (`isAdmin &&`). El trabajo real es
otro: cerrar fugas, y hacerlo configurable — **decisión de Facundo**, contra la
alternativa de un gate fijo admin+chef.

Hoy `isAdmin` es literalmente `rol === 'admin'`, así que el sous chef está ciego
al costo.

### B3.1 — Migración
Siguiendo la arquitectura de 3 capas ya existente (nivel → puesto → override):
- `puestos.ver_costos BOOLEAN NOT NULL DEFAULT false`
- `equipo_miembros.ver_costos BOOLEAN NULL` (null = hereda del puesto; mismo
  patrón que `modulos_extra`/`modulos_restringidos`)
- `rol_permisos.puede_ver_costos BOOLEAN NOT NULL DEFAULT false` — el fallback
  para usuarios sin puesto. Sembrar `true` en `admin` y `sous_chef`.

Booleano y no un `'ver_costos'` dentro de `permisos_app`: ese array es de
`ModuloId`, meterle una capability lo vuelve dos cosas a la vez.

### B3.2 — `usePermisos.puedeVerCostos`
Misma cascada que `puedeVer`: admin siempre `true`; si hay puesto,
`equipo_miembros.ver_costos ?? puestos.ver_costos`; sin puesto,
`rol_permisos.puede_ver_costos`.

### B3.3 — Reemplazar los gates de costo
Cambiar `isAdmin` por `puedeVerCostos` **solo donde el gate es de plata**, no
donde es de edición. Superficies a auditar:
- `app/(app)/recetario/page.tsx` (líneas 419, 423, 430, 528, 855-856)
- `app/(app)/recetario/[id]/page.tsx:708` (card de food cost, precio sugerido)
- `app/(app)/carta/page.tsx` — incluido `exportRentabilidadPDF` (línea 126)
- **Tab Ingeniería de Carta** — hoy sin gate (ya estaba anotado en
  `PENDIENTES.md` 🟢)
- `app/(app)/reportes/page.tsx`, `app/(app)/stock/ClientView.tsx`
  (stock valorizado), `components/recetas/CargaRapidaIngredientes.tsx`

### B3.4 — Cerrar la fuga del Coach
`app/api/coach/route.ts` **no tiene ningún gate de rol**. Un cocinero le
pregunta cuánto cuesta un plato y se lo dice. Resolver en el server (no
escondiendo el chip en el cliente): el endpoint resuelve `puedeVerCostos` del
usuario de la sesión y, si es `false`, quita los campos de costo de los
resultados de las tools y se lo dice al prompt.

### B3.5 — UI del toggle
Checkbox "Ve costos y food cost" en el editor de puesto (Equipo/Organigrama), y
el override por persona en la ficha del miembro, junto a
`modulos_extra`/`modulos_restringidos`.

⚠️ Un `ModuloId`/permiso nuevo **no llega solo a los puestos ya creados en DB**
(ver `feedback_modulo_nuevo_backfill`). **Decisión de Facundo (24 ago):**

- **Puestos con `nivel='admin'` → backfill `ver_costos = true`.** No tienen que
  configurar nada para seguir viendo lo que ya veían.
- **Puestos de chef/sous_chef → quedan en `false`**, pero el toggle tiene que
  aparecer destacado en la configuración para que el admin lo otorgue a
  conciencia. No es un checkbox más perdido en el editor de puesto: es una
  decisión que el admin tiene que ver que está tomando.
- El resto de los puestos, `false` y sin destacar.

---

## B4 — Primer ingreso: quién soy y qué puedo hacer

**Observación #2.** Los tours **ya existen**: `lib/coach/tours.ts` (~630 líneas,
~20 pantallas). Pero solo arrancan desde un chip del Coach — no hay nada
automático, y nada que diga en qué puesto está el usuario.

Formato elegido por Facundo: **bienvenida corta + tours por pantalla**, contra
un tour guiado único de 20+ pasos.

> Depende de B1. Sin `auth_user_id` la app no sabe el puesto del usuario, así
> que la carta de bienvenida no tendría qué decir.

### B4.1 — Carta de bienvenida (primer login)
Pantalla de ~60 segundos, no un recorrido:
- Nombre, **puesto asignado por el admin**, plaza default.
- La lista de módulos que **sí** ve (de `modulosEfectivos`), una línea por cada
  uno explicando para qué sirve. Nada de lo que no ve — mostrar funciones
  bloqueadas solo enseña a pedir permisos.
- CTA único: "Empezar por [su pantalla principal]" (OPS para cocina, home para
  admin).

Persistir el "ya la vio" en DB, no en `localStorage`: el cocinero abre la app en
el celular y en la tablet de la cocina, y no puede verla dos veces. Campo nuevo
en `equipo_miembros` (`onboarding_visto_at TIMESTAMPTZ NULL`).

### B4.2 — Tours automáticos, la primera vez de cada pantalla
Los recorridos de `tours.ts` arrancan solos la primera vez que el usuario entra
a esa pantalla. Un set de pantallas ya vistas, persistido igual que B4.1
(`equipo_miembros.tours_vistos TEXT[]`). Siempre salteables, y el chip del Coach
sigue funcionando para repetirlos.

Regla: **el tour de una pantalla solo se dispara si el usuario tiene permiso
sobre ese módulo.** No enseñar lo que no puede tocar.

### B4.3 — Volver a verlos
Botón "Ver de nuevo el recorrido" en Perfil, que limpia `tours_vistos`.

---

## B5 — Hacer visibles funciones que ya existen

**Observación #3.** Las dos que nombró Facundo **ya están construidas**:
- Escalado de cantidades: `escalarAPorciones()`,
  `app/(app)/recetario/[id]/page.tsx:444`
- Foto de receta: `FotoUploader`, mismo archivo línea 1539 — pero **solo en la
  hoja de edición**, no en el alta.

No hay que construir features. Hay que construir señales.

### B5.1 — Escalado de porciones, visible
El control existe pero no se anuncia. Hacerlo un elemento de primera línea en la
ficha de receta ("Escalar a N porciones"), con el resultado obvio: los
ingredientes se recalculan a la vista.

### B5.2 — Foto en el alta, no solo en la edición
Hoy hay que crear la receta, entrar al detalle y abrir la hoja de edición para
poder subir la foto. Sumar el `FotoUploader` al alta.

### B5.3 — Barrido de lo mismo
Mientras se toca esto, listar qué otras funciones caras de construir están
enterradas y decidir cuáles suben. Candidato ya identificado: **El Muro**
(`/muro`) — ver B7.2. Sale una lista, no se implementa toda en este bloque.

---

## B6 — Recetario: varias etapas al cargar una receta

**Observación #5.** El modelo **ya soporta N etapas**: `ingredientes.grupo` es
por-ingrediente, sin límite, y el detalle de receta ya las agrupa y renombra
(`gruposIngs`, `app/(app)/recetario/[id]/page.tsx:647`).

El problema es el alta (`app/(app)/recetario/page.tsx:2597-2650`):
- **Un solo select "Etapa"** arriba de la lista, que se aplica a lo que agregues
  después. Se lee como "elegí LA etapa de esta receta".
- La lista de ingredientes se dibuja **plana**: no ves qué ingrediente quedó en
  qué etapa.
- Si te equivocaste, `IngRow` no deja corregir el grupo — hay que guardar y
  entrar al detalle.

### B6.1 — Alta en bloques por etapa
Reestructurar la sección Ingredientes del alta para que sea una lista de etapas,
cada una con su nombre editable, sus ingredientes y su "+ agregar ingrediente",
más un "+ Agregar etapa" al final. "General" es la etapa por defecto y se
comporta como hoy cuando la receta no tiene etapas — una receta simple no debe
volverse más difícil de cargar.

Reusar la forma visual del detalle (`GrupoHeader`), no inventar otra.

**Criterio de listo:** cargar una receta de 3 etapas con ingredientes distintos
en cada una, de una sola pasada, sin guardar y volver a entrar.

---

## B7 — Desktop y pantalla completa

### B7.1 — Ocultar la barra lateral izquierda
**Observación #7.** El dock derecho (Coach) ya colapsa con `kc_dock_collapsed`
(`components/shell/DesktopShell.tsx:20-33`). El `SidebarNav` izquierdo está fijo
en 224px, sin toggle.

Mismo patrón, `kc_sidebar_collapsed`. **Colapsar a iconos (~72px), no a cero:**
a cero se pierde la navegación entera y hay que descubrir un botón flotante para
recuperarla. Sumar el atajo al `CommandPalette` y a `ShortcutsHelp`.

### B7.2 — Pantalla completa en Producción
**Observación #8.** Ya existen **dos** vistas ampliadas:
- Modo foco de `ProduccionBoard` (`components/ops/ProduccionBoard.tsx:268`) —
  una columna/plaza a pantalla completa
- **El Muro** (`app/(servicio)/muro/page.tsx`) — cocina entera, sin chrome,
  tipografía para leer a dos metros, tocás para cambiar estado. Es literalmente
  la pantalla de tablet colgada.

Facundo eligió **fullscreen in-place en OPS**, contra reusar `/muro`.

**Captura recibida (24 ago).** Es el board de OPS → Producción, tab CARTA, con
las columnas por plaza (PARRILLA, FRÍOS, CALIENTES, PASTELERÍA). El pedido
textual: *"que el usuario vea únicamente todo eso en la pantalla, no la barra
lateral y superior. En una tablet dentro de una cocina ayuda a ver más plazas y
aumentar el tamaño."*

Eso acota el alcance y **descarta un rediseño**: el board se queda exactamente
como está — checkboxes, badges de prioridad (SP/P/REF), "Agregar preparación",
nota de plaza, flechas de colapso, "+N refuerzos y checks". Todo se mantiene
interactivo: el cocinero sigue sus tareas ahí mientras cocina, no es una vista
de solo lectura.

- Botón de expandir en OPS → Producción que oculta **sidebar izquierda y barra
  superior**, y llama `requestFullscreen()`. El board mantiene su estado y su
  contexto de OPS (turno, tab, filtros) — esa es la razón de no navegar a `/muro`.
- **Escalar el contenido, no solo estirarlo.** El espacio ganado tiene que
  volverse tipografía y áreas de toque más grandes (se opera con las manos
  sucias, a distancia), y más columnas visibles a la vez. Si el board solo se
  ensancha con el mismo tamaño de letra, el pedido no está resuelto.
- `Escape` y un botón de salida siempre visible.
- Persistir el estado: una tablet colgada en la cocina no puede pedir que
  alguien vuelva a entrar al modo cada vez que se recarga la página.
- **No duplicar el layout del Muro.** Antes de escribir código, revisar qué de
  `muro/page.tsx` (columnas por plaza, colapso de listos, escala tipográfica) se
  puede extraer a un componente compartido. Tres implementaciones paralelas del
  mismo tablero es exactamente lo que hay que evitar.
- Que el Muro sea alcanzable desde acá (link "ver en la tablet de cocina"),
  que hoy no lo es desde ninguna parte de OPS.

---

## Cosas que quedaron fuera, a propósito

- **Rediseñar el sistema de permisos.** B1 arregla los bugs; la convivencia de
  `rol_permisos` (por rol) con `puestos.permisos_app` (por puesto) sigue siendo
  deuda. No se toca en este plan.
- **B5.3 solo produce una lista**, no implementa lo que encuentre.
- **El backfill de `ver_costos` para puestos existentes** (B3.5) queda como
  decisión abierta, no como tarea.
