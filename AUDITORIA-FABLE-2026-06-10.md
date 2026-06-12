# Auditoría KitchenOS — 10 de junio de 2026

_Auditor: Claude (Fable 5). Base: ESTADO-ACTUAL.md, AUDITORIA-FUNCIONES.md (2026-05-13), PENDIENTES.md, `.claude/docs/*`, verificados contra el código y la DB de producción (Management API). `npm run build` corrido: **compila sin errores** (48 rutas)._

---

## Resumen ejecutivo

- **Estado general: sólido para single-tenant supervisado, NO listo para multi-tenant abierto.** El RLS en DB está impecable (49 tablas, 4 políticas c/u, 0 `USING(true)` ilegítimos), pero **~8 API routes con service-role lo bypassean confiando en el `restaurante_id` que manda el browser** — el aislamiento real depende de que nadie edite un request.
- **Riesgo #1 (Alta):** `/api/recetas/save` acepta `restaurante_id` del body **sin exigir sesión** y su modo `enrichRecetaId` **borra ingredientes de cualquier receta** sin verificar tenant ([route.ts:13](app/api/recetas/save/route.ts#L13), [route.ts:44](app/api/recetas/save/route.ts#L44)).
- **Riesgo #2 (Alta):** `/api/migrate` no tiene auth, usa service role y devuelve una fila de `recetas` a cualquiera que haga POST. Es código muerto: **cero llamadas desde el cliente**. Borrarlo ([route.ts](app/api/migrate/route.ts)).
- **Riesgo #3 (Media-Alta):** `/api/coach` acepta el **system prompt completo desde el body** ([route.ts:231](app/api/coach/route.ts#L231)) → cualquier usuario autenticado tiene un proxy gratis a Sonnet 4.6 pagado por vos, y puede saltarse todas las instrucciones del Coach.
- **Quick win #1:** mover el system prompt del Coach al server + `cache_control` → **~75-85% menos costo de input por mensaje** y cierra el riesgo #3 en el mismo cambio.
- **Quick win #2:** helper compartido `getRestauranteIdFromSession()` y usarlo en los 8 endpoints que hoy confían en el body — patrón ya probado en `/api/coach` y `/api/facturas`.
- **Quick win #3:** agregar `/registro-invitado` a las rutas públicas de [proxy.ts:35-38](proxy.ts#L35-L38) — hoy el invitado sin sesión es redirigido a `/login` y el flujo de invitación probablemente muere ahí (además de la config de Supabase ya identificada en PENDIENTES).
- Los bugs operativos históricos (matching facturas→stock, carryover de producción, auth race, unidades) están **efectivamente resueltos en el código** — lo documentado coincide con lo implementado.

---

## 1. Flujo de trabajo de la app

El camino del usuario es coherente y sin callejones relevantes:

- **Onboarding** → wizard 5 pasos cuando productos+facturas+recetas = 0; banner "Reconstruir" en `/stock` cuando hay facturas pero stock incompleto. Bien resuelto.
- **Ciclo diario**: `/operaciones` es la única puerta (Producción · Mise · Planificación); las rutas viejas `/tareas`, `/checklist`, `/produccion` redirigen con `?tab=`. Verificado en [operaciones/page.tsx](app/(app)/operaciones/page.tsx). Sin vistas huérfanas.
- **Ciclo de datos**: Facturas (OCR) → Stock → Recetas → Carta → Menús → Planificación → Producción. La cadena cierra; el costo fluye de factura a food cost.
- **Callejón menor**: el flujo de **invitación** termina en un muro — `/registro-invitado` no está whitelisteado como ruta pública en `proxy.ts` (ver Seguridad §5.4) ni en Supabase Auth (config pendiente documentada). Hasta resolver ambos, invitar usuarios no funciona end-to-end.
- **Callejón menor 2**: `ModoServicio` quedó como componente sin montar (se decidió diferir) — no confunde al usuario porque ya no se renderiza, pero es código muerto (§9).

## 2. Estado por módulo/función

| Módulo | Estado | Conexiones OK? | Hallazgo clave |
|---|---|---|---|
| Dashboard `/` | **Bien** | Sí | SSR prefetch + `puedeVer()` dinámico. `WelcomeDashboard` sí se usa ([DashboardClientView.tsx:118](app/(app)/DashboardClientView.tsx#L118)). |
| OPS Producción (tab) | **Bien** | Sí | Carryover 1 día + dedupe verificados en ClientView. `tareas` tiene doble máquina de estados `status`+`estado` (§6). |
| OPS Mise (tab) | **Bien** | Sí | Sync bidireccional con Producción vía prefijo "Producción:" — frágil por depender de string matching, pero funciona. |
| OPS Planificación (tab) | **Bien** | Sí | `activarMenu` dedup + `actualizarMenu` propaga. Refetch inmediato post-insert (gotcha SWR documentado y aplicado). |
| Triple-mount OPS | **A medias** | — | Los 3 tabs montan simultáneamente ([operaciones/page.tsx:82-90](app/(app)/operaciones/page.tsx#L82-L90)) → ~10 hooks fetchean en paralelo al entrar aunque mires un solo tab (§7). |
| Recetario | **Bien** | Sí | `canonUnit()` + factor 0 para combos imposibles, verificado en useRecetas. Save vía API con service role (riesgo §5.1). |
| Stock | **Bien** | Sí | Guard `RESTAURANTE_ID`, rebuild encadenado a productos-desde-facturas + auto-link. `fetchMore` es un no-op falso ([useStock.ts:144](lib/hooks/useStock.ts#L144)). |
| Facturas (UI + OCR) | **Bien** | Sí | Matching `factura.includes(producto)` + guard ≥4 chars confirmado en useFacturas. Filtro de privacidad activo en OCR y universal. |
| Pedidos | **Bien** | Sí | Recibir actualiza stock; precios sugeridos desde `factura_items`. |
| Proveedores | **Bien** | Sí | Auto-creación desde facturas. Scanner usa `/api/listas-precios` (hoy Sonnet — ver §4). |
| Carta | **Bien** | Sí | OPS acumulativo (suma por receta+plaza) verificado. Precio/FC solo admin. |
| Menús (`menus`/`menu_preparaciones`) | **Bien** | Sí | Polimórfico sin FK dura (`tipo`+`ref_id`) — riesgo de refs colgantes si se borra la receta/producto apuntado (§6). |
| Pase | **A medias** | Parcial | Realtime sí implementado (useP ase en la lista de `.channel()`), pero el **filtro por usuario sigue con `USUARIOS_MOCK` hardcodeado** ([pase/page.tsx:55-60](app/(app)/pase/page.tsx#L55-L60)) — no refleja el equipo real. |
| HACCP | **Bien** | Sí | Forms con botón inline (fix jun 2026). Sync limpieza→OPS unidireccional (§6). |
| Reportes | **Bien** | Sí | 8 tabs, fetch lazy por tab. Varias queries sin `.limit()` (§7). |
| Reportes/personal | **A medias** | Dudoso | Consulta `turnos_personal`, tabla que **sí existe en DB** (RLS activo) pero que [columnas.md](.claude/docs/columnas.md) declara inexistente — docs y DB desincronizados; revisar si la página está poblada o huérfana. |
| Calendario | **Bien** | Sí | Pedidos + produccion_diaria integrados. |
| Turnos/Equipo/Puestos | **Bien** | Sí | Sistema 3 capas (nivel/puesto/overrides) consistente con usePermisos. |
| Invitación de usuarios | **A medias** | No (e2e) | API y página existen, pero proxy.ts bloquea `/registro-invitado` a no-autenticados (§5.4) + config Supabase pendiente. |
| Ventas | **Bien** | Sí | Import Haiku + xlsx local. Duplicados de fecha sin resolver (conocido). |
| Merma | **Bien** | Sí | Descuenta stock (hook y tool del Coach, consistentes). Sin transaccionalidad (§6). |
| Kitchen Coach | **A medias** | Sí | M1+M5 funcionan y respetan RLS, pero: system prompt del body (§5.3), sin caching (§4), y si el loop agota 4 vueltas en `tool_use` el cliente puede mostrar "Sin respuesta" ([useKitchenCoach.ts:206](lib/hooks/useKitchenCoach.ts#L206)). |
| Modo Servicio | **Mal (muerto)** | No | Componente sin ningún import ([ModoServicio.tsx](components/dashboard/ModoServicio.tsx)). Decidido descartar → borrar. |
| Configuración | **Bien** | Sí | Guard admin, fallback `rol_permisos`. |
| Auth/Perfil | **Bien** | Sí | Retry+backoff y safety timeout verificados en context.tsx. |
| Importadores (universal/Fudo/fichas) | **Bien** (función) / **Mal** (tenant) | Parcial | Funcionan, pero todos toman `restauranteId` del body/formData sin validar pertenencia (§5.2). |

## 3. Conexiones hooks ↔ tablas ↔ API

- **Guards y deps**: los 14 hooks con fetch tienen guard `if (!RESTAURANTE_ID)` (32 ocurrencias) o el patrón `ridRef` (useVentas, useProduccion, useMerma, useCalendario). El pendiente #5 de PENDIENTES ("useCallback deps vacías") está **de hecho resuelto** — los únicos `[]` restantes son los no-ops `fetchMore` y un callback sin deps externas en useKitchenCoach. Se puede cerrar ese ítem.
- **Realtime**: 12 hooks usan `.channel()` (pase, tareas, checklist, stock, facturas, etc.). La afirmación de AUDITORIA-FUNCIONES ("Pase sin realtime") quedó obsoleta — ese doc es de mayo y desactualizado en varios puntos (streaming del Coach ya no existe, USUARIO_MOCK del autor resuelto). Conviene regenerarlo o marcarlo como histórico.
- **API routes**: 20 (el doc viejo dice 12; ESTADO-ACTUAL dice 6 — ambos desactualizados). Todas las que el cliente llama existen; **`/api/migrate` no tiene ningún caller** (grep en todo el código: 0 referencias).
- **Hook muerto**: `useEventoItems` no tiene ningún consumidor desde que se eliminó `EventosView` (−642 líneas, jun 2026). La tabla `evento_items` queda también sin uso desde la app.
- **Inconsistencia de conteo de tablas**: ESTADO-ACTUAL dice 28/29; la DB real tiene **49 tablas** con RLS (incluye `perfiles`, `turnos_personal`, `evento_items`, `plato_plazas`, `packaging_*`, `presupuestos`, `menus`…). Actualizar docs.

## 4. Uso y costo de IA

**Modelos por endpoint (verificado en código):**

| Endpoint | Modelo | max_tokens | Comentario |
|---|---|---|---|
| `/api/coach` | Sonnet 4.6 | 1024 | Loop agéntico hasta 4 llamadas/mensaje. **Sin caching.** |
| `/api/facturas` (OCR) | Sonnet 4.6 | 4096 | Justificado (visión + privacidad). |
| `/api/listas-precios` | Sonnet 4.6 | 8192 | Extracción tabular simple → **candidato a Haiku** (≈5× más barato). |
| `/api/importador/mapeo` | Sonnet 4.6 | 600 | Mapeo de columnas → candidato a Haiku. |
| `/api/importador/facturas-universal` | Sonnet 4.6 | 800 | Solo en modo detect no-Fudo; bajo volumen, OK. |
| `/api/importador/fichas-tecnicas` | Sonnet 4.6 | 4000 | **Único endpoint con `cache_control`** — patrón a copiar. |
| `/api/recetas/import` | Haiku (texto/adjust) / Sonnet (imagen/multi) | 2048-4096 | Routing por dificultad bien hecho. |
| `/api/carta/import` | Haiku 4.5 | 8096 | OK. |
| `/api/ventas/import` | Haiku 4.5 | 2048 | OK. |
| `/api/importador/productos-desde-facturas` | Haiku 4.5 | 2048 | OK (solo apply). |

**El problema de costo está concentrado en el Coach:**

1. El cliente arma un system prompt de **~4.000-5.000 tokens** (10 ejemplos verbosos de highlight + 60 IDs + screen context) en [useKitchenCoach.ts:109-180](lib/hooks/useKitchenCoach.ts#L109-L180) y lo manda **entero en cada mensaje**.
2. El server le suma el snapshot M1 + instrucciones M5 y **no usa `cache_control`** ([coach/route.ts:265-271](app/api/coach/route.ts#L265-L271)). Tools tampoco cacheadas.
3. En cada turno se re-paga todo el historial + system completo a precio full de Sonnet. Una conversación de 10 mensajes ≈ 60-80k tokens de input no cacheados (~$0,20-0,25); con caching serían ~$0,04-0,06.

**Recomendación concreta (1 sesión de trabajo):**
- Mover el bloque estático del prompt (instrucciones + ejemplos + IDs) al server como constante con `cache_control: {type: 'ephemeral'}` en el último bloque del system array; el cliente manda solo `screen_context` (dinámico, chico). Esto **además elimina el override de prompt del body** (§5.3) — un cambio, dos problemas.
- Marcar `tools` con cache_control (son ~700 tokens estáticos).
- Bajar `/api/listas-precios` y `/api/importador/mapeo` a Haiku 4.5.
- Pendiente ya identificado y correcto: memoria persistida `coach_conversaciones` (hoy el historial vive solo en el state del hook — se pierde al recargar).

## 5. Seguridad e integridad — hallazgos con severidad

**El RLS en DB está bien** (verificado vía Management API): 49/49 tablas con RLS habilitado, 4 políticas cada una, el único `WITH CHECK (true)` es el INSERT de `restaurantes` (intencional, onboarding). El problema es la capa de API routes con `createAdminClient()`, que bypassea ese RLS:

| # | Severidad | Hallazgo | Evidencia |
|---|---|---|---|
| 5.1 | **Alta** | `/api/recetas/save` **no exige sesión** si el body trae `restaurante_id` ([route.ts:13](app/api/recetas/save/route.ts#L13) usa el body primero; el getUser solo corre como fallback y su fallo se traga). Modos `addIngredientsOnly` y `enrichRecetaId` insertan/**borran** `ingredientes` de cualquier `receta_id` sin validar tenant ([:33](app/api/recetas/save/route.ts#L33), [:44](app/api/recetas/save/route.ts#L44)). Un POST anónimo puede vaciar los ingredientes de cualquier receta de cualquier restaurante. | route.ts:13-60 |
| 5.2 | **Alta** | **Patrón repetido: `restaurante_id` del body + admin client, sin validar pertenencia.** Afecta: `importador/import` ([:51](app/api/importador/import/route.ts#L51)), `importador/facturas-universal` ([:463](app/api/importador/facturas-universal/route.ts#L463)), `importador/facturas-fudo`, `importador/stock-fudo`, `importador/productos-desde-facturas` ([:157](app/api/importador/productos-desde-facturas/route.ts#L157)), `stock/rebuild` ([:13](app/api/stock/rebuild/route.ts#L13) — **borra todos los productos** del restaurante indicado), `recetas/auto-link-ingredientes`. Autenticado cualquiera, escribe/borra en el tenant que quiera. | rutas citadas |
| 5.3 | **Media-Alta** | `/api/coach` acepta `systemPrompt` del body ([route.ts:231](app/api/coach/route.ts#L231)): proxy LLM gratuito + bypass total de las instrucciones del Coach para cualquier usuario autenticado. | route.ts:224-231 |
| 5.4 | **Media** | [proxy.ts:35-38](proxy.ts#L35-L38) no incluye `/registro-invitado` como ruta pública → el invitado sin sesión es redirigido a `/login` antes de poder canjear el token. Rompe el flujo de invitación aunque se configure Supabase. | proxy.ts:41-45 |
| 5.5 | **Media** | `/api/stock/sync-precio` ([route.ts:16-19](app/api/stock/sync-precio/route.ts#L16-L19)) actualiza `ingredientes.costo_unitario` por `producto_id` con admin client sin verificar que el producto sea del tenant del caller — permite corromper costos ajenos (requiere adivinar UUID). Ídem `/api/importador/undo` ([route.ts:10](app/api/importador/undo/route.ts#L10)): soft-delete por `ids[]` arbitrarios. | rutas citadas |
| 5.6 | **Media** | `/api/migrate`: endpoint sin auth con service role, devuelve fila de `recetas`. Código muerto (0 callers). | [route.ts](app/api/migrate/route.ts) |
| 5.7 | **Baja** | `proxy.ts` marca **todo `/api/*` como público** — correcto solo mientras cada route se auto-proteja; 5.1 y 5.6 demuestran que no se cumple. Considerar default-deny con allowlist. | proxy.ts:38 |
| 5.8 | **Baja** | Scripts `scripts/*.mjs`: el token ya NO está hardcodeado (leen `process.env`) — el pendiente #16 de PENDIENTES está **resuelto de facto**; verificar los 2 scripts nuevos sin commitear y cerrar el ítem. | scripts/ |
| 5.9 | **Baja** | `/api/invitar` bien hecho (admin check + restaurante de sesión) — usar como referencia del patrón correcto junto a `/api/coach` y `/api/facturas`. | invitar/route.ts:13-27 |

**Fix recomendado para 5.1/5.2/5.5:** un helper `requireRestauranteId(serverSupabase)` que resuelva de `user_restaurantes` y falle con 401/403; reemplazar toda lectura de `restaurante_id` del body. ~1 sesión, riesgo bajo (el cliente ya manda el mismo valor).

## 6. Integridad de datos

- **`tareas` con doble máquina de estados**: `status` (pendiente/en_proceso/completada) y `estado` (OpsEstado: pendiente/en_curso/listo/duda) conviven en la misma fila. El Coach setea ambas al crear ([coach/route.ts:135-136](app/api/coach/route.ts#L135-L136)), pero cualquier código que actualice una sin la otra produce tareas "listas" que siguen "pendientes". Consolidar en una sola fuente o derivar una de otra. **Riesgo: Media.**
- **`menu_preparaciones` polimórfico sin FK** (`tipo`+`ref_id`): borrar una receta/producto/plato referenciado deja refs colgantes; no hay limpieza al borrar. **Media.**
- **`checklist_items.cantidad` = suma de `plato_recetas.cantidad_ops`**: el recálculo corre al guardar el panel OPS; si se desvincula o borra un plato, la suma no se recalcula sola → cantidad de mise inflada hasta el próximo guardado. **Media-Baja.**
- **Sync HACCP limpieza → OPS unidireccional**: borrar el `checklist_item` desde Mise deja `haccp_limpieza.checklist_item_id` colgante. **Baja.**
- **Merma descuenta stock sin transacción** (read-modify-write en [coach/route.ts:193-196](app/api/coach/route.ts#L193-L196) y useMerma): dos mermas simultáneas pueden pisarse. Volumen real lo hace improbable; un RPC `decrement_stock` lo resuelve. **Baja.**
- **Consistencia stock/recetas/facturas**: la cadena `canonUnit()` + factor 0 + dirección de matching está bien implementada y los datos de Bros fueron saneados (verificado contra el código; los casos documentados coinciden). Lo que queda es dato, no código: 182 productos con `unidad='unidad'` y precio por kg siguen protegidos por factor 0 (food cost subvaluado en 53 recetas hasta corregirlos a mano).
- **4 modelos de OPS conviven** (tareas, checklist, platos_compuestos/produccion_diaria, menus): la unificación de junio dejó a `menus` como capa canónica y los puentes están razonablemente cuidados (dedupe, propagación). El legacy `platos_compuestos`/`plato_componentes` sigue vivo solo para Producción/planificación vieja — candidato a migración final cuando Menús se asiente.

## 7. Rendimiento

- **Triple-mount OPS** ([operaciones/page.tsx:82-90](app/(app)/operaciones/page.tsx#L82-L90)): TareasPage + ChecklistPage + ProduccionView montados a la vez → al entrar disparan en paralelo useTareas, useChecklist (5 tablas), useProduccion, useMenus, useRecetas, useEquipo… más sus canales realtime. En mobile con red mala es el peor momento de la app. Mitigación barata: lazy-mount del tab no visitado (montar al primer click y recién ahí preservar estado).
- **useReportes**: ~25 queries repartidas por tab con **una sola `.limit()`** en todo el hook; `ingredientes` (3 fetches), `recetas`, `carta_items`, `productos` se traen completos. Con Bros (~357 recetas, ~600 productos, miles de ingredientes) ya es pesado; con 10 tenants más grandes va a doler. Acotar columnas con `select` específico (ya lo hace en parte) y agregar límites/agregación en SQL (RPC o vista).
- **Paginación**: el fix de `pageRef` en useFacturas está bien; pero `useStock` y `useRecetas` exponen `fetchMore: useCallback(() => {}, [])` — **API de paginación falsa** que fetchea todo de una. Honestar la interfaz o implementar la paginación.
- **N+1**: no se detectaron N+1 graves en hooks (los joins van con `.in(...)` batch, el bug del JOIN PostgREST está corregido en auto-link). El food cost en Carta se calcula en memoria sobre datasets ya cargados — correcto.
- **Coach**: hasta 4 llamadas serializadas a la API de Anthropic por mensaje (loop agéntico) sin streaming → latencia percibida alta en acciones encadenadas. Aceptable hoy; streaming del último turno sería la mejora.

## 8. Robustez

- **Loading/vacío**: el patrón obligatorio (`if (loading)` / estado vacío) está aplicado de forma consistente en las páginas revisadas.
- **Manejo de errores Supabase**: el gotcha "los errores no son `Error`" está manejado en los hooks nuevos; quedan `catch` viejos que solo hacen `console.error`. 80 `console.*` en `lib/hooks` — **toda la observabilidad es console.log**: en producción (Vercel) los errores del browser se pierden por completo. No hay Sentry ni endpoint de log. Para una app que un restaurante usa en servicio, un capturador mínimo de errores client-side es la mejora de soporte más rentable.
- **Resiliencia del Coach**: buildSnapshot con try/catch por sección y tools que devuelven strings de error — bien diseñado. Borde: si el loop agota 4 vueltas en `tool_use`, `content[0]` puede no ser texto y el cliente muestra "Sin respuesta" sin registrar qué pasó.
- **Sin tests** (conocido): los 3 flujos críticos propuestos en PENDIENTES (login, receta IA, OCR factura) siguen siendo la prioridad correcta; sumaría un 4º: activar menú → producción (la lógica de dedupe/carryover es la más fácil de romper en refactors).
- **Sin rate limiting** en ningún endpoint de IA — combinado con 5.3, el costo es abusable. Un límite simple por user/minuto en `/api/coach` alcanza.

## 9. Deuda técnica y código muerto

| Ítem | Tipo | Acción |
|---|---|---|
| `/api/migrate` | Endpoint muerto + inseguro | **Borrar** (0 callers). |
| `components/dashboard/ModoServicio.tsx` | Componente sin imports | Borrar (decisión ya tomada en DECISIONES.md). |
| `lib/hooks/useEventoItems.ts` + tabla `evento_items` | Hook sin consumidores desde la eliminación de EventosView | Borrar hook; evaluar drop de la tabla. |
| `fetchMore` no-op en useStock:144 / useRecetas:243 | API falsa | Implementar o quitar del contrato. |
| `USUARIOS_MOCK` en [pase/page.tsx:55](app/(app)/pase/page.tsx#L55) | Mock residual | Cargar de `equipo_miembros` (el del autor ya se resolvió; este es el del filtro). |
| `tipos Evento/Turno/Puesto` en types/index.ts | Tipos legacy (pendiente #4) | Sigue pendiente; riesgo en refactors. |
| `/api/importador/facturas-fudo` + `stock-fudo` | Legacy semi-deprecado | Aún usados por ImportadorUniversal como ruta Fudo; no borrar todavía, marcar para consolidar en el universal. |
| Docs desincronizados | ESTADO-ACTUAL (28 tablas vs 49 reales, 6 API routes vs 20), AUDITORIA-FUNCIONES (mayo, varios puntos obsoletos), columnas.md (`turnos_personal` "NO EXISTE" pero existe con RLS) | Sesión de `/update-status` enfocada en reconciliar. |
| Working tree sucio | `package.json` movió `mammoth` a devDeps + sumó `adm-zip`; 2 scripts de carga sin commitear | Commitear o descartar. |

## 10. Oportunidades de mejora (priorizadas)

| Propuesta | Impacto | Esfuerzo | Por qué |
|---|---|---|---|
| Helper `requireRestauranteId()` de sesión en los 8 endpoints admin (5.1, 5.2, 5.5) + borrar `/api/migrate` | **Alto** | Bajo (1 sesión) | Cierra el agujero multi-tenant real antes de invitar usuarios externos; el RLS de DB ya está bien, esto completa el perímetro. |
| System prompt del Coach server-side + `cache_control` + quitar `bodySystemPrompt` | **Alto** | Bajo | ~75-85% menos costo de input por mensaje, menos latencia, y elimina el proxy LLM abierto (5.3). Patrón ya existe en fichas-tecnicas. |
| `/registro-invitado` público en proxy.ts + config Supabase | **Alto** | Trivial | Desbloquea la única feature 🟠 Alta pendiente (invitaciones e2e). |
| Lazy-mount de tabs OPS | Medio | Bajo | Corta a ~1/3 el costo de entrada a la pantalla más usada de la app. |
| Captura de errores client-side (Sentry free tier o endpoint propio) | Medio | Bajo | Hoy un error en el restaurante es invisible; el costo de soporte lo paga Facundo en visitas. |
| Bajar listas-precios y mapeo a Haiku | Medio | Trivial | Tareas de extracción simple; ~5× menos costo en esos endpoints. |
| Memoria del Coach (`coach_conversaciones`) | Medio | Medio | Ya planificado; con caching previo, el costo marginal del historial baja mucho. |
| Unificar `status`/`estado` en tareas | Medio | Medio | Elimina la clase de bug más probable del módulo más usado. |
| Rate limit en endpoints de IA | Medio | Bajo | Protege el presupuesto de API ante abuso o loop accidental del cliente. |
| Acotar queries de useReportes (límites/RPC) | Bajo hoy, Alto a escala | Medio | Preparación multi-tenant; hoy solo Bros lo sufre levemente. |
| Tests Playwright de 4 flujos críticos | Medio | Medio | Ya priorizado en PENDIENTES; sumar "activar menú→producción". |
| Reconciliar docs (tablas reales, API routes, turnos_personal) | Bajo | Bajo | Los docs son la memoria del proyecto; hoy mienten en los conteos y en una tabla. |

---

_No se modificó código. Build verificado en verde el 10/06/2026._
