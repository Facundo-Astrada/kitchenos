# KitchenOS — Panorama técnico y análisis de diseño (GRASP)

*Agosto 2026 · ~98.500 líneas de TypeScript en 345 archivos · 78 tablas · 84 migraciones*

---

## Resumen ejecutivo

KitchenOS es una **aplicación web full-stack monolítica** (Next.js 16 + Supabase) que corre entera en Vercel: el mismo proyecto sirve las pantallas, el backend y la conexión a la base de datos. El diseño tiene una **capa de dominio muy sana** — la lógica de negocio pura vive aislada en `lib/` y está testeada — pero una **capa de pantalla muy enferma**: cinco archivos concentran 18.000 líneas y hablan directo con la base de datos, sin nada en el medio. Hay además **tres endpoints con permisos de administrador que no verifican quién los llama** — el hallazgo más urgente del informe, y el único que es de seguridad y no de diseño.

---

# PARTE 1 — Panorama técnico general

## ¿Qué tipo de sistema es?

Es una **aplicación web full-stack**, no una app móvil ni un sistema de microservicios.

Traducido: es una sola página web que se comporta como una app. Se abre en el navegador del celular, la tablet de la cocina o una computadora de escritorio, y desde ahí hace todo. No hay que instalarla desde una tienda de aplicaciones.

"Full-stack" significa que **un solo proyecto contiene las dos mitades** del sistema:

- La mitad que se ve (las pantallas, los botones, las listas) — el *frontend*.
- La mitad que no se ve (la que guarda datos, valida permisos, habla con la inteligencia artificial y con AFIP) — el *backend*.

Están en la misma carpeta y se despliegan juntas. Eso es lo contrario de "microservicios", donde cada función sería un programa separado que hay que operar por su cuenta. Para un equipo chico, tenerlo junto es la decisión correcta.

Hay un detalle particular que conviene entender desde el principio, porque explica la mitad del análisis de la Parte 2: **KitchenOS tiene dos caminos para llegar a los datos**, no uno.

## Lenguajes y frameworks principales

| Pieza | Qué es | Para qué se usa acá |
|---|---|---|
| **TypeScript** | El lenguaje. Es JavaScript con "etiquetas" que dicen qué tipo de dato es cada cosa | Todo el proyecto, sin excepción |
| **React 19** | La librería que dibuja las pantallas | Cada botón, lista y formulario |
| **Next.js 16** | El framework alrededor de React: rutas, servidor, compilación | Estructura general y los endpoints del backend |
| **Tailwind v4** | Sistema de estilos visuales | Colores, espaciados, tipografía |
| **Supabase** | Base de datos + login + tiempo real, como servicio | Todo el almacenamiento |
| **SWR** | Memoria temporal de datos ya pedidos | Que la app no vuelva a pedir lo mismo cien veces |
| **Zod** | Validador de datos | Verifica que lo que manda la IA tenga la forma esperada |
| **Vitest / Playwright** | Herramientas de prueba automática | 14 archivos de tests |

Dos aclaraciones sobre decisiones deliberadas del proyecto:

- La autenticación vive en `proxy.ts`, **no** en `middleware.ts` — Next.js 16 rompió esa convención y el proyecto se adaptó.
- Los gráficos se dibujan con divisiones de HTML de ancho variable, no con una librería de gráficos. Menos peso, menos dependencias.

## Cómo está organizado el proyecto

```
kitchenos/
├── app/                    ← LAS PANTALLAS Y EL BACKEND
│   ├── (app)/              ← 28 pantallas internas: stock, carta, recetario,
│   │                          facturas, reportes, OPS, HACCP, turnos…
│   ├── (auth)/             ← login, registro, registro por invitación
│   ├── (publico)/          ← la carta que ve el comensal por QR (sin login)
│   ├── (servicio)/         ← pantallas de servicio en vivo: KDS, salón, muro
│   └── api/                ← 36 endpoints de backend
│
├── lib/                    ← EL CEREBRO SIN PANTALLA
│   ├── hooks/              ← 61 "conectores" entre pantalla y base de datos
│   ├── supabase/           ← las 3 puertas de entrada a la base
│   ├── permisos/           ← quién puede ver qué
│   ├── ops/, carta/,       ← reglas de negocio puras (calculables y testeables)
│   │   reportes/, stock/
│   ├── coach/              ← el asistente de IA y sus herramientas
│   └── fiscal/             ← facturación electrónica AFIP/ARCA
│
├── components/             ← Piezas visuales reutilizables (botones, fichas,
│                              paneles) agrupadas por módulo
├── types/index.ts          ← 139 definiciones de "qué forma tiene cada dato"
└── supabase/migrations/    ← 84 archivos SQL: la historia de la base de datos
```

Los paréntesis en `(app)`, `(auth)` son una convención de Next.js: **agrupan pantallas que comparten un marco visual sin aparecer en la dirección web**. `/stock` vive en `app/(app)/stock/`, pero el usuario nunca ve "app" en la URL.

La distinción importante es **`app/` vs `lib/`**:

- `app/` = lo que el usuario toca.
- `lib/` = lo que el usuario nunca ve pero decide qué pasa.

Cuanta más lógica viva en `lib/`, más fácil es probarla sin abrir el navegador. Eso es exactamente lo que el análisis GRASP va a medir.

## Cómo se comunican las partes

Como adelanté, hay **dos caminos**. Entender por qué existen los dos es entender el sistema.

**Camino A — directo (el más usado).** La pantalla le pide los datos a Supabase sin pasar por ningún backend propio. Es rápido y simple. Funciona porque la base de datos tiene reglas de seguridad internas (RLS) que filtran automáticamente: aunque la pantalla pida "todos los productos", la base devuelve solo los del restaurante de quien pregunta.

**Camino B — con backend (cuando hace falta más).** La pantalla le pide a un endpoint propio, y ese endpoint hace el trabajo. Se usa cuando:

- Hay un secreto que no puede vivir en el navegador (la clave de la IA, el certificado de AFIP).
- La operación toca muchas tablas a la vez y tiene que salir todo o nada (importar una factura).
- Hay que saltarse las reglas de seguridad de la base a propósito y con control (crear una invitación).

**Vuelta en tiempo real.** 23 de los 61 conectores se suscriben a cambios: si un cocinero tilda una preparación en la tablet, la pantalla del chef se actualiza sola en menos de un segundo, sin recargar.

## Base de datos y almacenamiento

**PostgreSQL gestionado por Supabase.** 78 tablas organizadas por dominio: productos y stock, recetario y carta, proveedores y facturas, tareas y mise, salón y comandas, caja, fiscal, clientes.

Casi todas las tablas tienen una columna `restaurante_id`, y una regla de seguridad en la propia base (`mi_restaurante_id()`) que hace que **cada restaurante solo pueda leer sus propias filas**. Esta es la pieza de seguridad más importante del sistema: no depende de que la pantalla se acuerde de filtrar, lo impone la base.

Hay dos almacenamientos secundarios:

- **IndexedDB** (base de datos dentro del navegador): una cola para cuando el KDS de cocina se queda sin internet. Los cambios se guardan localmente y se envían al reconectar.
- **localStorage**: preferencias chicas y el historial del asistente de IA.

## Autenticación, tareas en segundo plano y servicios externos

**Autenticación.** Supabase Auth con email y contraseña. Cada visita a una pantalla pasa por `proxy.ts`, que verifica la sesión. Vale la pena señalar una decisión fina que está bien hecha: usa `getClaims()` en vez de `getUser()`, lo que **verifica la firma criptográfica de la credencial localmente** en vez de preguntarle al servidor de Supabase en cada navegación. Misma seguridad, sin el viaje de ida y vuelta.

Los permisos se resuelven en **tres capas superpuestas**: el rol de la persona (dueño, chef, cocinero), el puesto que ocupa en el organigrama, y ajustes individuales (módulos extra o restringidos para esa persona en particular).

**Tareas en segundo plano.** Hay poco, y es a propósito:

- Un cron diario de Vercel (6:00 AM) que regenera el restaurante de demostración pública.
- Las suscripciones en tiempo real.
- La cola offline del KDS.

No hay sistema de colas de trabajos. Las operaciones largas (importar una factura con IA) corren dentro del propio endpoint mientras el usuario espera.

**Servicios externos conectados:**

| Servicio | Para qué |
|---|---|
| **API de Anthropic (Claude)** | Leer facturas en PDF, importar cartas y planillas, el asistente Kitchen Coach. Se llama desde **12 lugares distintos** — volveremos a esto. |
| **AFIP / ARCA** | Facturación electrónica real. Incluye firma criptográfica de certificados. |
| **Impresoras ESC/POS** | Comandas térmicas en cocina. |
| **WhatsApp (links)** | Enviar pedidos a proveedores. |

**No hay** pasarela de pagos ni servicio de emails propio (los emails de login los manda Supabase).

## Diagrama de flujo

```
┌────────────────────────────────────────────────────────────────────┐
│  QUIÉN USA LA APP                                                  │
│  Celular del cocinero · Tablet de cocina (KDS) · Escritorio        │
│  del dueño · Celular del comensal (carta pública por QR)           │
└───────────────────────────────┬────────────────────────────────────┘
                                │  HTTPS
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│  PORTERO — proxy.ts                                                │
│  ¿Hay sesión válida? Verifica la firma de la credencial            │
│  localmente. Sin sesión → /login. Excepto rutas públicas.          │
└───────────────────────────────┬────────────────────────────────────┘
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│  PANTALLAS — app/(app), (servicio), (publico)                      │
│  28 módulos. React + Tailwind. Segundo portero: RouteGuard         │
│  comprueba permisos por módulo antes de dibujar.                   │
└──────────┬─────────────────────────────────────┬───────────────────┘
           │                                     │
    CAMINO A: directo                     CAMINO B: con backend
           │                                     │
           ▼                                     ▼
┌──────────────────────────┐        ┌─────────────────────────────────┐
│ CONECTORES — lib/hooks   │        │ ENDPOINTS — app/api (36)        │
│ 61 hooks. Piden datos,   │        │ Trabajo pesado, secretos,       │
│ los cachean (SWR) y      │        │ operaciones de varias tablas.   │
│ escuchan cambios en      │        │ Usan la llave maestra           │
│ tiempo real (23).        │        │ (service_role) con cuidado.     │
└──────────┬───────────────┘        └────────┬─────────────┬──────────┘
           │                                 │             │
           │                                 │             ▼
           │                                 │   ┌──────────────────────┐
           │                                 │   │ SERVICIOS EXTERNOS   │
           │                                 │   │ Claude (12 llamadas) │
           │                                 │   │ AFIP/ARCA · ESC/POS  │
           │                                 │   └──────────────────────┘
           ▼                                 ▼
┌────────────────────────────────────────────────────────────────────┐
│  SUPABASE — PostgreSQL, 78 tablas                                  │
│                                                                    │
│  ⚑ RLS: cada fila lleva restaurante_id y la base filtra sola.      │
│    Es el candado que hace que un restaurante no vea otro.          │
│                                                                    │
│  ↺ Realtime: la base avisa a las pantallas suscritas.              │
└────────────────────────────────────────────────────────────────────┘

           OFFLINE (solo KDS): IndexedDB guarda los cambios
           sin internet y los envía solos al reconectar.
```

---

# PARTE 2 — Análisis con GRASP

## Antes de empezar: una aclaración necesaria

GRASP se enseña sobre programación orientada a objetos, con clases. **Este proyecto tiene 3 clases en 98.500 líneas.** Está escrito con funciones, módulos y hooks de React.

Eso no invalida el análisis. GRASP no es realmente sobre clases: es sobre **quién es responsable de qué**. Esa pregunta se le hace igual a un archivo, a un hook o a una función. Donde el manual dice "clase", acá se lee "módulo o hook", y todo lo demás se sostiene.

---

## 1. Experto en Información — ⚠️ Se cumple parcialmente

*El principio: la responsabilidad de calcular algo debe estar donde vive la información necesaria para calcularlo.*

### Dónde se cumple

El proyecto tiene una colección de módulos que hacen exactamente esto: cada uno concentra un cálculo y todo el que lo necesita lo importa de ahí.

- `lib/permisos/resolver.ts` — decide si alguien puede ver un módulo
- `lib/comanda/stateMachine.ts` — qué estados puede tener una comanda y cuáles transiciones son legales
- `lib/carta/ingenieriaMenu.ts` — clasifica platos en estrella / caballo / puzzle / perro
- `lib/ops/mise.ts` — cuánto falta preparar de cada cosa
- `lib/ops/dedupeTareas.ts` — evita que la misma preparación entre dos veces

`resolver.ts` es el caso ejemplar, y su propio comentario explica por qué existe:

```typescript
// Existía duplicada en `lib/hooks/usePermisos.ts` (cliente) y en
// `lib/permisos/server.ts` (réplica server-side para el Coach), sincronizadas
// a mano con un comentario que pedía acordarse. No alcanzó: en agosto 2026 las
// dos tenían los mismos dos bugs, y uno dejaba usuarios sin poder entrar a la app.
```

Dos copias de la misma regla, mantenidas a mano, terminaron con los mismos dos errores. Cuando se unificaron, se arreglaron los dos de una vez. Ese es el principio funcionando, aprendido a los golpes.

### Dónde se viola

**El mismo error sigue vivo en la conversión de unidades.** Hay tres implementaciones de "convertir gramos a kilos para poder costear":

| Archivo | Función | Por qué existe |
|---|---|---|
| `lib/hooks/useRecetas.ts` | `unitConversionFactor` | La original |
| `lib/reportes/consumoTeorico.ts` | `unitConversionFactor` | Copiada, porque la original está en un archivo `'use client'` y los reportes corren en el servidor |
| `lib/stock/precios.ts` | `normalizeForStock` | Tercera variante, para stock |

El propio código lo admite: *"canonUnit/unitConversionFactor están duplicadas de useRecetas.ts"*.

**Por qué importa, en concreto:** si mañana hay que agregar que una docena son 12 unidades, o corregir la densidad del aceite, hay que acordarse de tres lugares. Si se cambian dos y no el tercero, el costo de una receta y el reporte de fuga van a dar números distintos para el mismo plato — y nadie va a saber cuál creer. Es exactamente el bug que ya pasó con los permisos.

**Segundo caso:** el cálculo de costo aparece recalculado dentro de las pantallas. En [carta/page.tsx:536-547](app/(app)/carta/page.tsx#L536-L547) hay dos versiones distintas de "costo, porcentaje y margen" escritas ahí mismo, en vez de pedírselo a `calcFoodCost`.

---

## 2. Creador — ✅ Se cumple (con una excepción grave)

*El principio: quien crea un objeto debe ser quien tiene los datos para armarlo bien.*

### Dónde se cumple

Hay fábricas claras y bien ubicadas. `lib/supabase/` expone tres funciones creadoras, una por contexto:

| Función | Quién la puede usar |
|---|---|
| `createClient()` (client.ts) | Solo pantallas del navegador |
| `createClient()` (server.ts) | Solo código de servidor |
| `createAdminClient()` (admin.ts) | **Solo endpoints** — se saltea la seguridad de la base |

Que sean tres funciones separadas y no una con parámetros es correcto: hace **imposible por accidente** usar la llave maestra en el navegador. Un error ahí sería catastrófico.

También hay fábricas de entidades bien puestas: `parseTarea()` en `useTareas.ts` convierte una fila cruda de la base en una Tarea usable — y es el único lugar que sabe que el checklist a veces viene como texto y hay que interpretarlo.

### La excepción

`AuthProvider.signUp` en [lib/auth/context.tsx](lib/auth/context.tsx) crea **cinco entidades distintas en secuencia, desde el navegador**: usuario, restaurante, vínculo usuario-restaurante, ficha de equipo y cinco filas de permisos.

**Por qué importa:** si el paso 3 falla, quedan creados el usuario y el restaurante pero sin vínculo entre ellos — una cuenta rota que nadie puede usar y que hay que reparar a mano en la base. El navegador no puede hacer que los cinco pasos sean uno solo e indivisible; un endpoint de servidor sí. De hecho el proyecto ya tuvo que escribir `/api/invitar/vincular` justamente para **reparar** vínculos rotos: la curita existe, la causa no se tocó.

---

## 3. Alta Cohesión — 🔴 Violado en la capa de pantallas

*El principio: cada archivo debe hacer una cosa. Un archivo que hace muchas se vuelve frágil: tocarlo por un motivo rompe lo que no tiene nada que ver.*

### Los números

| Archivo | Líneas | Piezas de estado |
|---|---|---|
| `app/(app)/carta/page.tsx` | 3.906 | 59 |
| `app/(app)/recetario/page.tsx` | 3.804 | 80 |
| `app/(app)/facturas/page.tsx` | 3.636 | 75 |
| `app/(app)/stock/ClientView.tsx` | 3.405 | 86 |
| `app/(app)/checklist/ClientView.tsx` | 3.152 | 53 |

**Cinco archivos = 17.900 líneas = el 18% del proyecto.**

Para tener referencia: 86 piezas de estado en un archivo significa 86 cosas que pueden estar en cualquier combinación al mismo tiempo. Nadie puede tener eso entero en la cabeza. `carta/page.tsx` maneja el listado de platos, los filtros, el alta, la edición, el análisis de rentabilidad, la exportación a PDF, la vista pública, las categorías y la composición — todo en el mismo archivo.

**Por qué importa, en concreto:**

- **Cambiar algo chico es caro.** Mover un botón obliga a leer 3.900 líneas para estar seguro de no romper nada.
- **Los errores viajan.** Un error en el filtro puede dejar en blanco la pantalla entera, incluido el análisis de rentabilidad que no tiene nada que ver.
- **No se puede probar.** No hay un solo test sobre estos cinco archivos, y no es por desidia: para probarlos habría que montar la pantalla completa con sus 86 estados. Los 14 tests que existen están todos sobre `lib/`, que sí está bien separado.
- **No se puede repartir el trabajo.** Dos personas tocando `carta/page.tsx` chocan siempre.

### El contraste

`lib/` demuestra que el equipo sabe hacerlo bien. `lib/ops/dedupeTareas.ts`, `lib/comanda/stateMachine.ts`, `lib/reservas/helpers.ts` son archivos chicos, con una responsabilidad, y **todos tienen test**. La cohesión no es un problema de conocimiento: es un problema de que las pantallas nunca se refactorizaron.

---

## 4. Bajo Acoplamiento — 🔴 Violado entre pantallas y base de datos

*El principio: cuantas menos cosas dependan de una, más barato es cambiarla.*

### Los números

- **96 archivos** importan directamente el cliente de Supabase.
- **39 archivos de pantalla** (no conectores: pantallas) hacen consultas a la base con sus propias manos.

Entre las que consultan la base directo están `carta/page.tsx`, `stock/ClientView.tsx`, `facturas/page.tsx`, `haccp/page.tsx`, `salon/page.tsx` y componentes sueltos como `MermaBottomSheet.tsx` y `ItemOps.tsx`.

**Por qué importa, en concreto:** el nombre de una tabla o de una columna está escrito como texto suelto en decenas de archivos. Renombrar `checklist_items.demanda_viva` no es un cambio en un lugar: es una búsqueda global, con la esperanza de no haber escrito la misma consulta con un espacio distinto en algún lado. El proyecto ya lleva una skill entera (`/supabase-check`) y un documento (`columnas.md`) dedicados a recordar cómo se llaman las columnas de verdad. **Esa documentación es un síntoma, no una solución**: existe porque el código no protege del error.

Hay un caso registrado en la memoria del proyecto — *"Recetas DB conventions: la columna es `tiempo_min`, no `tiempo_minutos`"* — que es literalmente un error de nombre de columna que costó lo suficiente como para anotarlo.

### Dónde sí se cumple

- `components/ui/` (Avatar, Toast, EmptyState, SegmentedTabs…) no sabe nada de restaurantes ni de Supabase. Son piezas puras y reutilizables.
- Los módulos de `lib/carta/`, `lib/reportes/`, `lib/reservas/` reciben datos por parámetro y devuelven resultados. Por eso se pueden testear.

---

## 5. Controlador — ⚠️ Se cumple parcialmente

*El principio: debe haber un punto de entrada claro que reciba cada pedido, verifique que es legítimo y lo derive. Sin eso, cada pantalla decide por su cuenta.*

### Dónde se cumple

`lib/api/tenant.ts` es el controlador de identidad, y está bien escrito:

```typescript
export async function requireRestauranteId(): Promise<TenantOk | TenantErr> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, status: 401, error: 'No autorizado' }
  // …busca a qué restaurante pertenece
  if (!ur?.restaurante_id) return { ok: false, status: 403, error: 'Sin restaurante asignado' }
  return { ok: true, user, restauranteId: ur.restaurante_id, supabase }
}
```

En una línea contesta las dos preguntas que todo endpoint tiene que hacerse: *¿quién sos?* y *¿de qué restaurante?*. `RouteGuard.tsx` cumple el mismo papel del lado de la pantalla.

### Dónde se viola

**Solo 15 de los 36 endpoints lo usan.** Otros 8 resuelven la identidad copiando el código a mano, con variaciones. Y **3 endpoints que usan la llave maestra no verifican nada**:

| Endpoint | Qué hace | Qué verifica |
|---|---|---|
| `/api/carta/86` | Marca un plato como agotado o disponible | **Nada** |
| `/api/salon/merma-auto` | Descuenta stock de todos los ingredientes de una cuenta | **Nada** — y peor: recibe el `restaurante_id` desde el pedido |
| `/api/salon/prep-list-update` | Escribe demanda en vivo sobre los ítems del checklist | **Nada** |

El caso de `merma-auto` merece detalle, porque es el más grave:

```typescript
export async function POST(req: NextRequest) {
  const supabase = createAdminClient()        // ← llave maestra: ignora toda la seguridad de la base
  const { cuenta_id, restaurante_id } = await req.json()   // ← el restaurante lo dice QUIEN LLAMA
```

Aceptar el `restaurante_id` desde el cuerpo del pedido significa que quien llama **elige de qué restaurante quiere operar**. Y como estos endpoints están bajo `/api/`, que `proxy.ts` deja pasar sin sesión, son alcanzables desde internet sin haber iniciado sesión nunca.

**Por qué importa:** todo el esfuerzo de RLS en las 78 tablas — el candado real del sistema multi-restaurante — queda esquivado por estos tres agujeros. Es como poner cerraduras en todas las puertas y dejar una ventana sin traba.

---

## 6. Polimorfismo — ✅ Se cumple en lo importante

*El principio: cuando el comportamiento varía según el tipo, hay que resolverlo con piezas intercambiables, no con cadenas de "si es esto, hacé aquello".*

### El mejor ejemplo del proyecto

`lib/coach/tools/registry.ts` es un catálogo donde **cada herramienta del asistente de IA se describe a sí misma con la misma forma**:

```typescript
export interface ToolRegistryEntry<T> {
  moduloId: ModuloId                       // a qué módulo pertenece (para permisos)
  schema: z.ZodType<T>                     // cómo validar lo que manda la IA
  tituloHumano: string                     // cómo se llama para el usuario
  resumen: (input) => string               // cómo se resume antes de confirmar
  campos: (input) => CampoUI[]             // qué formulario dibujar
  execute: (supabase, rid, input) => …     // qué hacer al confirmar
}
```

Agregar una herramienta nueva es **agregar una entrada al catálogo**. Cero cambios en el motor del asistente, cero cambios en la validación de permisos, cero cambios en la pantalla que dibuja la confirmación. Todo lo demás ya sabe tratar cualquier entrada del catálogo por igual.

`lib/comanda/stateMachine.ts` aplica la misma idea a los estados de una comanda: en vez de `if` desparramados por las pantallas, una tabla declara qué transiciones son legales.

### Dónde no

El mapeo de roles se resuelve con `switch`, y está **escrito dos veces**:

- `mapRol()` en `lib/auth/context.tsx` (navegador)
- `mapRol()` en `lib/permisos/server.ts` (servidor)

El propio comentario del segundo archivo lo dice: *"El mapeo de roles de (1) sigue duplicado"*. Es el mismo problema que ya explotó con la resolución de permisos, todavía sin resolver. Agregar un rol nuevo requiere acordarse de los dos.

---

## 7. Fabricación Pura — ✅ Se cumple bien (falta una)

*El principio: a veces conviene inventar un módulo que no representa nada del mundo real, solo para que las cosas queden ordenadas. Un "Calculador de costos" no existe en una cocina, pero tener el archivo hace que la fórmula viva en un solo lugar.*

Toda la carpeta `lib/` es esto, y está bien hecho: `resolver.ts`, `dedupeTareas.ts`, `turnos.ts`, `precios.ts`, `consumoTeorico.ts`, `stateMachine.ts`, `ingenieriaMenu.ts`, `helpers.ts`. Ninguno corresponde a una tabla de la base ni a una pantalla. Existen porque concentran una regla. **Y por eso son los únicos archivos con tests.**

### La fabricación que falta

**No hay ningún módulo que envuelva la llamada a la IA.** Las 12 rutas que usan Claude repiten el mismo `fetch` crudo:

| Ruta | Modelo | Tokens |
|---|---|---|
| `carta/import` | haiku-4-5 | 8096 |
| `coach` | sonnet-4-6 | 1024 |
| `facturas` | sonnet-4-6 | 4096 |
| `importador/facturas-universal` | sonnet-4-6 | 800 |
| `importador/fichas-tecnicas` | sonnet-4-6 | 4000 |
| `importador/mapeo` | haiku-4-5 | 600 |
| …y 6 más | | |

Cada una escribe la URL, la versión de la API, la clave, el modelo y su propio manejo de errores.

**Por qué importa:** cambiar de modelo (que va a pasar) es editar 12 archivos. Agregar reintentos cuando la API falla es escribirlo 12 veces (y hoy no está en ninguna: si Anthropic devuelve un error transitorio, la importación de facturas falla y el usuario ve un error crudo). Medir cuánto se gasta en IA es imposible sin tocar los 12. Un solo `lib/ia/claude.ts` con una función `pedirAClaude({ modelo, prompt, maxTokens })` convierte esos 12 cambios en uno.

---

## 8. Indirección — ✅ Se cumple en lo táctico, ❌ falta la estructural

*El principio: cuando dos partes no deberían conocerse, poner un intermediario entre ellas.*

### Dónde se cumple, y bien

`lib/ops/miseBus.ts` y `lib/ops/chromeBus.ts` son intermediarios deliberados entre componentes que no deberían conocerse. El comentario de `chromeBus` explica el razonamiento completo:

```
Vive fuera de React y no en un contexto porque el que scrollea (el mise) y el
que se pliega (los tabs de OPS) son hermanos sin estado en común: un contexto
acá re-renderizaría los tres paneles de OPS en cada tick de scroll, que es
exactamente lo que no queremos mientras el dedo está arrastrando.
```

Eso es diseño consciente: se eligió el intermediario correcto para el problema, y se dejó escrito por qué. También cuentan como indirección bien puesta: `lib/api/tenant.ts`, los tres clientes de Supabase, y SWR como capa de caché entre pantalla y base.

### La indirección que falta

**No hay una capa de repositorio entre las pantallas y las tablas.** Este es el reverso del problema de acoplamiento del punto 4: las 39 pantallas que consultan la base directo lo hacen porque no existe nada en el medio a lo que preguntarle.

---

## 9. Variaciones Protegidas — ⚠️ Mixto

*El principio: identificar qué es probable que cambie y ponerle una interfaz estable adelante, para que el cambio no se propague.*

### Bien protegido

| Qué varía | Cómo se protege |
|---|---|
| Cada restaurante inventa sus propias plazas | `todasLasPlazas()`, `plazaLabel()`, `plazaIcon()` en `constants.ts` — la pantalla nunca pregunta si es fija o custom |
| Qué puede hacer cada persona | Cascada de 3 capas en `resolver.ts`, un solo punto |
| Qué herramientas tiene el asistente | El catálogo del punto 6 |
| Que un restaurante vea datos de otro | RLS en la base — protección estructural, no depende del código |

El caso de las plazas es un ejemplo de libro: el comentario dice *"Toda pantalla que liste plazas debe combinar las fijas con las custom usando estos helpers, para que una plaza creada por el usuario aparezca en todos lados sin duplicar la lista"*. Se identificó el eje de variación **antes** de que doliera.

### Sin protección

| Qué va a cambiar | Qué pasa hoy |
|---|---|
| Nombres de tablas y columnas | Escritos como texto en 96 archivos |
| El modelo de IA | Escrito a mano en 12 rutas |
| Ambiente de AFIP (prueba vs producción) | URLs de `homo` y producción conviven en `lib/fiscal/` sin una capa que elija |
| Que Supabase deje de ser la base | Imposible sin reescribir casi todo |

El último es aceptable — nadie planea cambiar de base de datos. Los tres primeros no.

---

## Resumen del veredicto

| Principio | Estado | En una línea |
|---|---|---|
| Experto en Información | ⚠️ Parcial | `lib/` bien; conversión de unidades duplicada 3 veces |
| Creador | ✅ Cumple | Fábricas claras; excepción: `signUp` crea 5 entidades sin transacción |
| Alta Cohesión | 🔴 Violado | 5 archivos de pantalla = 18% del proyecto |
| Bajo Acoplamiento | 🔴 Violado | 96 archivos atados directo a Supabase |
| Controlador | ⚠️ Parcial | 15 de 36 endpoints usan el controlador; 3 no verifican nada |
| Polimorfismo | ✅ Cumple | Catálogo de herramientas ejemplar; `mapRol` duplicado |
| Fabricación Pura | ✅ Cumple | `lib/` es ejemplar; falta el adaptador de IA |
| Indirección | ⚠️ Parcial | Buses bien pensados; falta capa de repositorio |
| Variaciones Protegidas | ⚠️ Mixto | Plazas y permisos protegidos; nombres de columnas y modelo de IA no |

---

# PARTE 3 — Prioridades

## 🔴 1. Cerrar los tres endpoints sin autenticación

**Impacto: crítico · Esfuerzo: 1-2 horas**

**El problema.** `/api/carta/86`, `/api/salon/merma-auto` y `/api/salon/prep-list-update` usan la llave maestra de la base (que ignora todas las reglas de seguridad) y **no verifican quién llama**. `merma-auto` además acepta el `restaurante_id` desde el pedido, así que quien llama elige sobre qué restaurante operar. Los tres son alcanzables desde internet sin sesión.

**Por qué importa.** Cualquiera que conozca la dirección puede marcar platos como agotados en cualquier restaurante, o descontar stock de cuentas ajenas. El sistema tiene RLS en las 78 tablas justamente para que esto sea imposible — y estos tres endpoints lo saltean. No es una hipótesis de diseño: es una puerta abierta hoy.

**La solución.** Es mecánica, y el proyecto ya tiene la herramienta escrita:

```typescript
export async function POST(req: NextRequest) {
  const tenant = await requireRestauranteId()
  if (!tenant.ok) return NextResponse.json({ error: tenant.error }, { status: tenant.status })
  const { restauranteId } = tenant        // ← del token, no del cuerpo del pedido

  const { cuenta_id } = await req.json()  // ← restaurante_id sale del body
  // …y verificar que cuenta_id pertenece a restauranteId antes de tocar nada
}
```

Después, un test de CI que recorra `app/api/**` y falle si un archivo importa `createAdminClient` sin importar `requireRestauranteId`. Así no vuelve a pasar.

---

## 🟠 2. Una capa de repositorio entre pantallas y base de datos

**Impacto: alto · Esfuerzo: alto, pero incremental**

**El problema.** 39 pantallas y 96 archivos en total hablan con Supabase directo. Los nombres de tablas y columnas están escritos como texto en todas partes.

**Por qué importa.** Renombrar una columna es una búsqueda global con riesgo de error silencioso. El proyecto ya paga este costo en documentación (`columnas.md`, la skill `/supabase-check`) y en errores registrados (el caso `tiempo_min` vs `tiempo_minutos`). Es dinero que se gasta todos los meses para compensar algo que el código debería impedir.

**La solución.** No hay que reescribir nada de una vez. La regla es hacia adelante:

1. **Nada nuevo consulta Supabase desde una pantalla.** Todo pasa por un hook de `lib/hooks/` o un módulo de `lib/<dominio>/`.
2. Cada vez que se toque una pantalla grande por otro motivo, mover **sus** consultas al hook. Migración por oportunidad, no por proyecto dedicado.
3. Un lint que marque `createClient()` en `app/**/*.tsx` fuera de `app/api/`.

El objetivo realista a seis meses no es cero: es que las cinco pantallas grandes no consulten la base directo.

---

## 🟠 3. Partir las cinco pantallas monolíticas

**Impacto: alto · Esfuerzo: alto**

**El problema.** 17.900 líneas en cinco archivos, con hasta 86 piezas de estado cada uno, y sin un solo test.

**Por qué importa.** Es el impuesto que se paga en cada sesión de trabajo: leer 3.900 líneas para mover un botón, no poder probar nada sin abrir el navegador, no poder repartir el trabajo. Además es donde vive el cálculo de costo duplicado, porque en un archivo así **es más fácil escribir la fórmula de nuevo que buscar dónde estaba**.

**La solución.** Partir por *responsabilidad*, no por tamaño. Para `carta/page.tsx`:

```
carta/
├── page.tsx              ← solo el armado: qué se muestra según el tab (~300 líneas)
├── ListaPlatos.tsx       ← el listado y sus filtros
├── EditorPlato.tsx       ← el alta y la edición
├── RentabilidadView.tsx  ← el análisis (ya usa lib/carta/ingenieriaMenu.ts)
└── exportar.ts           ← el PDF
```

Empezar por **una sola pantalla**, medir cuánto costó y cuánto mejoró, y recién ahí decidir sobre las otras cuatro. Una regla que ayuda: cuando se extrae un pedazo, si aparece un cálculo, va a `lib/` con su test — no al componente nuevo.

---

## 🟡 4. Un adaptador único para la IA

**Impacto: medio · Esfuerzo: 3-4 horas**

**El problema.** 12 rutas repiten el `fetch` crudo a la API de Anthropic, cada una con su modelo, su límite de tokens y su manejo de errores.

**Por qué importa.** Cambiar de modelo es editar 12 archivos. Agregar reintentos ante fallas de la API es escribirlo 12 veces (hoy no está en ninguna: si la API devuelve un error transitorio, la importación de facturas falla y el usuario ve un error crudo). Medir el gasto en IA es imposible.

**La solución.** Un `lib/ia/claude.ts`:

```typescript
export const MODELOS = {
  rapido: 'claude-haiku-4-5-20251001',   // clasificar, mapear columnas
  potente: 'claude-sonnet-4-6',          // leer facturas, el Coach
} as const

export async function pedirAClaude(opts: {
  modelo: keyof typeof MODELOS
  prompt: string
  maxTokens: number
  imagenes?: string[]
}): Promise<string>   // con reintentos, timeout y log de tokens adentro
```

Migrar las 12 rutas es mecánico. El día que salga un modelo nuevo, se cambian dos líneas.

---

## 🟡 5. Unificar `mapRol` y `unitConversionFactor`

**Impacto: medio · Esfuerzo: 2-3 horas**

**El problema.** Dos reglas de negocio con copias sincronizadas a mano: `mapRol` en 2 archivos, la conversión de unidades en 3.

**Por qué importa.** Esto ya explotó en este proyecto. La resolución de permisos estaba duplicada igual, las dos copias derivaron con los mismos dos errores, y uno dejó usuarios sin poder entrar a la app. Está documentado en el comentario de `resolver.ts`. Estas dos duplicaciones son la misma bomba, con la mecha más corta en la de unidades: si divergen, el costo de una receta y el reporte de fuga van a dar números distintos para el mismo plato, y no va a haber forma de saber cuál está bien.

**La solución.**

- `lib/permisos/roles.ts` con `mapRol` y `toPermisoRol`, importado por `auth/context.tsx` y `permisos/server.ts`. Sin `'use client'`, para que sirva a los dos lados — es exactamente lo que ya se hizo con `resolver.ts`.
- `lib/unidades.ts` con `canonUnit`, `unitConversionFactor` y `normalizeForStock` juntas. Sacarlas de `useRecetas.ts` (que es `'use client'` y por eso obligó a la copia) y de `consumoTeorico.ts`.
- Los tests que ya existen en `consumoTeorico.test.ts` se mudan tal cual y pasan a cubrir a los tres usuarios.

---

## Cierre

El diagnóstico de fondo es más simple de lo que sugiere la lista: **KitchenOS tiene dos capas con dos calidades muy distintas.**

`lib/` está bien diseñado. Los módulos son chicos, tienen una responsabilidad, están testeados, y los comentarios explican por qué se tomó cada decisión — incluido qué error se estaba arreglando. Cumple casi todos los principios de GRASP sin habérselo propuesto.

Las pantallas nunca recibieron ese tratamiento. Crecieron por acumulación, hablan directo con la base, y concentran el 18% del código en cinco archivos sin un solo test.

La buena noticia es que **la dirección correcta ya está demostrada dentro del mismo repositorio**. No hay que importar una arquitectura nueva ni convencer a nadie de un paradigma: hay que seguir moviendo cosas de `app/` hacia `lib/`, que es lo que el proyecto ya viene haciendo cada vez que un bug lo obliga. Las prioridades 2 a 5 son todas variantes de ese mismo movimiento.

La prioridad 1 es de otra naturaleza y no espera: es una puerta abierta, no una deuda de diseño.
