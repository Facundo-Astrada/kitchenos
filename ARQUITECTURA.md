# KitchenOS — Arquitectura Técnica

**Stack:** Next.js 16.2.0 (App Router, Turbopack) · React 19.2.4 · TypeScript 5 · Supabase · Tailwind v4 · Vercel
**Idioma UI:** Español argentino.
**Target:** Mobile-first en la app de gestión; tablet fija en Muro/KDS; desktop soportado (Mesa de Trabajo es BETA solo-desktop).
**URL Producción:** https://kos-app-one.vercel.app · **Supabase:** https://clipcxcbtlibswfzsgzk.supabase.co

Este documento es el mapa estructural (carpetas, inventario de hooks/rutas/tablas). El detalle vive en los docs condicionales — no se duplica acá:
- Columnas reales, trampas de nombres, convenciones de datos → `.claude/docs/columnas.md`
- Patrón de hooks, gotchas de Supabase, SWR, realtime → `.claude/docs/hooks.md`
- RLS: función central, patrón de políticas → `.claude/docs/rls.md`
- UI/CSS, componentes canónicos, tema → `.claude/docs/ui.md`
- Importación (facturas, carta, stock) → `.claude/docs/importador.md`
- Testing → `.claude/docs/testing.md`

---

## 1. Estructura de carpetas

```
kitchenos/
├── app/
│   ├── (app)/                 # Rutas protegidas — shell con BottomNav/SidebarNav + KitchenCoachFAB
│   │   ├── page.tsx           # Dashboard /
│   │   ├── carta/, recetario/[id]/, stock/, facturas/, pedidos/, proveedores/
│   │   ├── tareas/, checklist/, produccion/, operaciones/  # OPS: Mise+Producción+Planificación
│   │   ├── espacios/          # Mesa de Trabajo (BETA, solo desktop)
│   │   ├── haccp/, merma/, calendario/, turnos/, ventas/, clientes/
│   │   ├── reportes/, reportes/personal/
│   │   ├── configuracion/, configuracion/fiscal/
│   │   ├── coach/, perfil/, onboarding/
│   ├── (auth)/                 # login, register, registro-invitado — públicas
│   ├── (servicio)/             # Tablets fijas de cocina/salón, layout propio
│   │   ├── kds/                # Kitchen Display — sin Coach (regla inamovible)
│   │   ├── salon/, salon/config/
│   │   └── muro/               # Pantalla única de cocina, wake lock + rollover 05:00
│   ├── (publico)/
│   │   └── carta/[slug]/       # Carta pública QR sin login
│   └── api/                    # 34 route handlers — ver §4
├── lib/
│   ├── auth/context.tsx        # AuthProvider + useAuth
│   ├── hooks/                  # 51 hooks — ver §3
│   ├── supabase/                client.ts (browser) · server.ts (SSR) · admin.ts (service role) · paginate.ts (fetchAllRows, tope 1000/req)
│   ├── ops/                     mise.ts (upsertMiseChecklistItem), turnos.ts (hoyOperativo/fechaEnTz/turnoVigente), miseBus.ts, syncMise.ts
│   ├── coach/                   history.ts, restaurante.ts, stream.ts, highlights.ts, tours.ts, types.ts, tools/{registry,propose}.ts
│   ├── fiscal/                  wsaa.ts, wsfev1.ts, wsfe-directo.ts, qr.ts, index.ts (ARCA/AFIP)
│   ├── comanda/                 stateMachine.ts (+ test) — máquina de estados comanda/ítem
│   ├── offline/                 bumpQueue.ts (cola IndexedDB), useOnlineStatus.ts
│   ├── servicio/                useAlertasSonoras.ts
│   ├── salon/elementos.ts · stock/{precios,syncPrecios}.ts · checklist/secciones.ts · menus/activarMenu.ts
│   ├── recetas/iaImport.ts · produccion/sugerencia.ts · haccp/recurrencia.ts · permisos/server.ts · api/tenant.ts · print/escpos.ts
│   ├── exportPDF.ts, exportar.ts, demo.ts
│   └── constants.ts             # ROLES, PLAZAS, MODULOS, BOTTOM_NAV
├── components/
│   ├── ui/          # Canónicos: SegmentedTabs, FilterChips, EmptyState, HeaderAction, Avatar, Num, SwitchRow, Skeleton, PhotoPicker, ImageCropModal
│   ├── shell/        BottomNav, SidebarNav, DesktopShell, Header, MoreMenu, PageHeader, RouteGuard, DemoBanner
│   ├── ops/          OpsPanel (fuente única plaza→sección→recipiente→cantidad), ProduccionBoard, CrearTareaSheet, NotasPlaza, QuickAdd, RecetaDrawer, ProduccionSheet(Conectada), EventoBanner, ItemOps, SeccionOps, OpsToggle, NotaImportanteCard
│   ├── mise/         ProductoMiseCard, MiseGuiaSheet, MiseTourOverlay
│   ├── coach/        KitchenCoachFAB, CoachPanelContent, CoachActionCard
│   ├── salon/        PanZoomCanvas, Sillas, VistaCaja
│   ├── stock/        MultiSelectFiltro, CarritoCompras
│   ├── importador/   ImportadorUniversal, ImportadorArchivo, ImportadorFichasTecnicas
│   ├── facturas/     BulkUploadDrawer, ExcelPOSImportModal
│   ├── dashboard/    DashboardHeader, MiPlaza, ModoServicio (sin conectar), ModulosGrid, PasePreview, StockCriticoSection, WelcomeDashboard
│   ├── pedidos/, produccion/, recetas/, checklist/, onboarding/, desktop/, merma/, pase/, providers/
│   └── SWRFallback.tsx, PageTransition.tsx, ErrorReporter.tsx
├── types/index.ts               # Tipos centralizados (un solo archivo — ver DECISIONES.md)
├── e2e/salon-kds.spec.ts        # Playwright
├── scripts/                     # ~50 scripts: migraciones históricas (migrate-*.mjs), seeds, fixes puntuales de datos, exportadores PDF
├── proxy.ts                     # Auth (reemplaza middleware.ts — breaking change Next 16)
├── CLAUDE.md, AGENTS.md, ESTADO-ACTUAL.md, ARQUITECTURA.md, PENDIENTES.md, DECISIONES.md, HISTORIAL.md
└── .claude/{agents,docs,skills}/
```

---

## 2. Rutas de página

| Grupo | Layout | Contenido |
|---|---|---|
| `(app)` | Shell con nav + Coach FAB, requiere sesión | Dashboard, Carta, Recetario, Stock, Compras (`/facturas`), Pedidos, Proveedores, Tareas/Checklist/Producción (embebidos en OPS `/operaciones`), Mesa de Trabajo (`/espacios`), HACCP, Merma, Calendario, Turnos, Ventas, Clientes, Reportes (+ `/reportes/personal`), Configuración (+ `/configuracion/fiscal`), Coach, Perfil, Onboarding |
| `(auth)` | Público | `/login`, `/register`, `/registro-invitado` |
| `(servicio)` | Layout propio, fondo fijo, tablets dedicadas | `/kds`, `/salon` (+ `/salon/config`), `/muro` |
| `(publico)` | Sin sesión | `/carta/[slug]` — vidriera QR |

`proxy.ts` marca públicas `/login`, `/register`, `/registro-invitado`, `/carta/` (con slash — `/carta` a secas es la gestión interna) y todo `/api/*`; el resto exige `user` vía `supabase.auth.getUser()`.

---

## 3. Hooks (51)

Todos siguen el patrón documentado en `.claude/docs/hooks.md` (guard `if (!RESTAURANTE_ID) return`, `createClient()` envuelto en `useMemo`, SWR para listas "al montar", realtime filtrado por `restaurante_id`). Acá solo el inventario.

### Core / Auth / Config
| Hook | Qué hace | Tabla(s) |
|---|---|---|
| `useRestauranteId` | Lee `restaurante_id` del `AuthProvider`; `''` mientras carga — base de todos los demás. | — |
| `usePermisos` | Resuelve módulos visibles: admin→todo, puesto→`permisos_app`±overrides, fallback `rol_permisos`. | `rol_permisos`, `restaurantes`, `equipo_miembros`, `puestos` |
| `useUserRol` | Rol crudo del usuario actual. | `equipo_miembros` |
| `useRestauranteConfig` | Lee/escribe `restaurantes.configuracion` (JSONB), una sola key SWR compartida. | `restaurantes` |
| `usePlazasCustom` | Plazas custom por restaurante — JSONB en `configuracion`, sin tabla nueva. | `restaurantes`, `checklist_items`, `checklist_secciones`, `espacio_plazas` |
| `useImpresionConfig` | Config de impresión (ESC/POS) por establecimiento. | `restaurantes` |
| `useTurnosServicio` | Turnos de servicio configurables (almuerzo/cena/…) del restaurante. | `restaurantes` |
| `useOnboardingProgress` | Progreso del wizard de alta + conteos para `WelcomeDashboard`. | `user_restaurantes`, `restaurantes`, + conteos varios |
| `useDebounce` | Utilidad genérica, no es dominio. | — |
| `useIsDesktop` / `useDesktopShortcuts` | Detección de viewport + atajos de teclado en desktop. | — |

### Stock / Productos / Compras
| Hook | Qué hace | Tabla(s) |
|---|---|---|
| `useStock` | CRUD productos, cálculo de estado (ok/bajo — "crítico" sigue en DB en 0). | `productos` |
| `useStockSectores` / `useStockEstantes` | CRUD de sectores físicos y sub-niveles, alimentan el board de Stock. | `stock_sectores`, `stock_estantes` |
| `useCategoriasProducto` | CRUD categorías dinámicas de producto. | `categorias_producto` |
| `useProveedores` | CRUD proveedores; auto-creación desde facturas. | `proveedores`, `facturas` |
| `usePreciosProveedores` | Comparador de precios entre proveedores para un producto. | `productos`, `factura_items` |
| `useFacturas` | CRUD facturas + items, integra OCR IA, actualiza `precio_historial`. | `facturas`, `factura_items`, `productos`, `precio_historial`, `ingredientes`, `proveedores`, `recetas` |
| `useCategoriasGasto` | CRUD categorías de gasto (filtro de privacidad en Compras). | `categorias_gasto`, `facturas` |
| `usePedidos` | CRUD pedidos/items, recepción parcial (suma a `productos.stock_actual`). | `pedidos`, `pedido_items`, `facturas`, `factura_items`, `productos` |

### Recetario / Carta / Menús / Packaging
| Hook | Qué hace | Tabla(s) |
|---|---|---|
| `useRecetas` | CRUD recetas + ingredientes, `calcFoodCost()`. Altas vía `/api/recetas/save` (service role). | `recetas`, `carta_items`, `ingredientes` |
| `useRecetasLite` | Variante liviana — solo nombres/porciones, para autocompletar. | `recetas` |
| `useCarta` | CRUD carta, categorías, vínculo receta↔plato, `ComposicionEditor` (Plato/Menú/Evento). | `carta_categorias`, `carta_items`, `plato_recetas`, `plato_packaging`, `recetas`, `ingredientes`, `productos` |
| `useMenus` | CRUD menús (fijo/evento) + preparaciones; activación crea tareas. | `menus`, `menu_preparaciones`, `tareas` |
| `usePackagingGrupos` | Grupos de packaging reutilizables y su asignación a platos. | `packaging_grupos`, `packaging_grupo_items`, `plato_packaging`, `productos` |

### OPS — Tareas / Mise / Checklist
| Hook | Qué hace | Tabla(s) |
|---|---|---|
| `useTareas` | CRUD tareas, ventana de 60 días, realtime. | `tareas` |
| `useChecklist` | Secciones, items, registros, rutinas y auditorías del mise. | `checklist_secciones`, `checklist_items`, `checklist_registros`, `checklist_rutina`, `checklist_rutina_registros`, `checklist_auditorias` |
| `useNotasPlaza` | Notas por plaza (misma tabla que el Pase). | `pase_mensajes` |
| `useCierresTurno` | Entrega de plaza por jornada+turno (`cierres_turno`), corte para el plegado del pase. | `cierres_turno` |
| `useProduccionRegistros` | Registros puntuales de producción (Mesa de Trabajo). | `produccion_registros` |

### Comunicación / HACCP
| Hook | Qué hace | Tabla(s) |
|---|---|---|
| `usePase` | Mensajes del pase, realtime, filtros turno/plaza/prioridad. | `pase_mensajes` |
| `useHaccp` | Temperaturas (bulk), vencimientos, limpieza + sync a rutinas OPS. | `haccp_equipos`, `haccp_temperaturas`, `haccp_vencimientos`, `haccp_limpieza`, `haccp_limpieza_registros`, `checklist_rutina` |

### Calendario / Equipo / Producción / Merma
| Hook | Qué hace | Tabla(s) |
|---|---|---|
| `useCalendario` | Eventos, notas por día, refleja pedidos/menús activados. | `eventos`, `pedidos`, `produccion_diaria`, `tareas`, `menus`, `calendario_nota_items`, `proveedores` |
| `useEquipo` | CRUD miembros, upsert turnos, CRUD puestos. | `equipo_miembros`, `turnos`, `puestos` |
| `useFichaje` | Clock-in/out, costo laboral (`horas_total` es `GENERATED ALWAYS`, no mandarla). | `turnos_personal`, `equipo_miembros` |
| `useProduccion` | Planilla del día, asignación por miembro, componentes de platos. | `platos_compuestos`, `plato_componentes`, `produccion_diaria` |
| `useMerma` | Registro de merma, descuenta `stock_actual`. | `merma`, `productos` |

### Ventas / Reportes
| Hook | Qué hace | Tabla(s) |
|---|---|---|
| `useVentas` | Importación/CRUD de ventas manuales + items (Excel/CSV/IA). | `ventas`, `ventas_items` |
| `useVentasCerradas` | Ventas ya cobradas desde el Salón (comandas cerradas). | `cuentas`, `comandas` |
| `useReporteVentas` | Agregación de ventas del Salón para Reportes → Caja. | `cuentas`, `equipo_miembros`, `pagos`, `medios_pago`, `comandas` |
| `useReportes` | Agrega facturas/recetas/stock/producción/presupuesto para CMV y gráficos — solo lectura. | (múltiples, ver hook) |

### Salón / Servicio / Cobro
| Hook | Qué hace | Tabla(s) |
|---|---|---|
| `useEspacios` | Board Mesa de Trabajo: espacios físicos → plazas. | `espacios`, `espacio_plazas` |
| `useMesas` | Mapa de mesas (forma/tamaño/rotación), vínculo a cuenta abierta. | `mesas`, `cuentas` |
| `useSalonElementos` | Mobiliario decorativo del canvas del Salón. | `salon_elementos` |
| `useEstaciones` | Estaciones del KDS. | `estaciones` |
| `useComandas` | CRUD comandas/items/modificadores, bump, eventos de cocina. | `comandas`, `comanda_items`, `comanda_item_modificadores`, `eventos_cocina` |
| `useMediosPago` | CRUD medios de pago. | `medios_pago` |
| `useCuenta` | Cuenta abierta de una mesa: pagos, cierre. | `pagos`, `cuentas`, `mesas` |
| `useCajaTurno` | Apertura/cierre de caja, movimientos, arqueo ciego. | `cajas_turnos`, `caja_movimientos`, `pagos` |

### Clientes / Coach
| Hook | Qué hace | Tabla(s) |
|---|---|---|
| `useClientes` | CRUD clientes + cuentas corrientes (fiado). | `clientes`, `cuentas` |
| `useCuentaCorriente` | Movimientos de cuenta corriente de un cliente. | `cuenta_corriente_movimientos` |
| `useKitchenCoach` | Cliente del endpoint `/api/coach` — streaming, sin tabla propia. | — |

---

## 4. API Routes (34)

Corren en runtime Node (no edge) — usan service role y/o Anthropic API. Todas `POST` salvo donde se indique.

| Ruta | Qué hace |
|---|---|
| `/api/coach` | Chat del Kitchen Coach (Sonnet 4.6). Contexto server-side (stock crítico, vencimientos, food cost) + tool use agéntico (`crear_tarea`, `marcar_86`, `registrar_merma`, sugerir producción). |
| `/api/coach/confirm` | Confirma/ejecuta una acción propuesta por el Coach (`lib/coach/tools/propose.ts`). |
| `/api/recetas/save` | **Único endpoint con `createAdminClient()`** — bypassea RLS. Insert receta+ingredientes, solo-receta, sumar ingredientes, o "Completar con IA". |
| `/api/recetas/import` | Importación de receta con IA — modos cámara/galería/archivo/audio/texto/glink/multi. Haiku para texto/ajustes, Sonnet para imágenes/multi. |
| `/api/recetas/auto-link-ingredientes` | Vincula ingredientes de receta a productos de stock existentes por nombre. |
| `/api/carta/import` | Importación de ítems de carta con IA (Haiku). |
| `/api/carta/86` | Marca/desmarca un ítem de carta como no disponible. |
| `/api/facturas` | OCR de factura (Sonnet) — proveedor, items, IVA, total. Demo result sin API key. |
| `/api/listas-precios` | OCR de lista de precios de proveedor (Sonnet). |
| `/api/ventas/import` | Importación de ventas desde Excel/CSV/texto libre con IA (Haiku). |
| `/api/importador/facturas-universal` | Importador universal de facturas (múltiples formatos), motor central del flujo de importación. |
| `/api/importador/facturas-fudo` | Importador de facturas desde export de Fudo. |
| `/api/importador/stock-fudo` | Importador de stock desde export de Fudo. |
| `/api/importador/productos-desde-facturas` | Crea/matchea productos de stock a partir de items de facturas ya cargadas. |
| `/api/importador/fichas-tecnicas` | Importa fichas técnicas (recetas con costeo) en bloque (Sonnet). |
| `/api/importador/mapeo` | Sugiere mapeo de columnas para un archivo importado (Haiku). |
| `/api/importador/import` | Ejecuta la importación ya mapeada/confirmada. |
| `/api/importador/undo` | Deshace el último lote importado. |
| `/api/stock/rebuild` | Reconstruye stock desde el histórico de facturas/movimientos. |
| `/api/stock/sync-precio` | Sincroniza el precio de un producto puntual con su última factura. |
| `/api/stock/sync-precios-facturas` | Sincronización masiva de precios desde facturas. |
| `/api/stock/sugerir-minimos` | Sugiere `stock_minimo`/`stock_critico` en base a consumo histórico. |
| `/api/stock/import-planilla` | Importa una planilla de stock (Haiku para mapeo de columnas). |
| `/api/produccion/sugerencia` | Motor de reglas + narración IA para "Sugerir producción" (nunca cambia números). |
| `/api/produccion/sugerencia/explicar` | Explica en lenguaje natural una sugerencia de producción (Haiku). |
| `/api/reportes/fuga` | Detección de fuga de inventario por producto (PLAN-4-CAPAS B5) — teórico vs. real (compras del período) vs. merma declarada, con tolerancia. Motor en `lib/reportes/fuga.ts`, traversal compartido en `lib/reportes/consumoTeorico.ts`. |
| `/api/salon/prep-list-update` | Incrementa `checklist_items.demanda_viva` al enviar una comanda desde el Salón. |
| `/api/salon/merma-auto` | Registra merma automática desde eventos del Salón (ej. anulación de comanda). |
| `/api/ingest/escpos` | Ingesta de tickets/comandas vía protocolo ESC/POS (impresoras fiscales/comandas). |
| `/api/fiscal/emitir` | Emisión de comprobante fiscal (WSFEv1/ARCA). |
| `/api/fiscal/config` | Lee/escribe `config_fiscal` del restaurante. |
| `/api/fiscal/comprobantes` | Consulta comprobantes fiscales emitidos. |
| `/api/invitar` | Invita un usuario nuevo al restaurante (Supabase Auth invite). |
| `/api/cron/reset-demo` | GET, `CRON_SECRET` — resetea nocturnamente el restaurante demo clonando El Rescoldo real. |
| `/api/log-error` | Recibe errores del cliente (`ErrorReporter.tsx`) para diagnóstico. |

---

## 5. Supabase — 78 tablas

Todas con RLS habilitado, aislamiento multi-tenant real vía `mi_restaurante_id()` (ver `.claude/docs/rls.md` para la función y el patrón de políticas — **no son `USING(true)`**, esa era una nota de mayo 2026 ya superada). Columnas exactas y trampas de nombres → `.claude/docs/columnas.md`.

| Dominio | Tablas |
|---|---|
| Core / Auth (4) | `restaurantes`, `perfiles`, `user_restaurantes`, `rol_permisos` |
| Productos / Stock (5) | `productos`, `categorias_producto`, `stock_sectores`, `stock_estantes`, `precio_historial` |
| Proveedores / Compras (6) | `proveedores`, `facturas`, `factura_items`, `pedidos`, `pedido_items`, `categorias_gasto` |
| Recetario / Carta (7) | `recetas`, `ingredientes`, `carta_items`, `carta_categorias`, `plato_recetas`, `plato_plazas`, `plato_packaging` |
| Menús (2) | `menus`, `menu_preparaciones` |
| Packaging (2) | `packaging_grupos`, `packaging_grupo_items` |
| Tareas / OPS / Mise (8) | `tareas`, `checklist_secciones`, `checklist_items`, `checklist_registros`, `checklist_rutina`, `checklist_rutina_registros`, `checklist_auditorias`, `cierres_turno` |
| Comunicación (2) | `pase_mensajes`, `calendario_nota_items` |
| HACCP (5) | `haccp_equipos`, `haccp_temperaturas`, `haccp_vencimientos`, `haccp_limpieza`, `haccp_limpieza_registros` |
| Calendario / Equipo (6) | `eventos`, `evento_items`, `puestos`, `equipo_miembros`, `turnos`, `turnos_personal` |
| Producción (5) | `platos_compuestos`, `plato_componentes`, `produccion_diaria`, `produccion_registros`, `estaciones` |
| Merma (1) | `merma` |
| Ventas (2) | `ventas`, `ventas_items` |
| Salón / Servicio (9) | `espacios`, `espacio_plazas`, `mesas`, `salon_elementos`, `comandas`, `comanda_items`, `comanda_item_modificadores`, `eventos_cocina`, `cuentas` |
| Caja / Pagos (4) | `medios_pago`, `pagos`, `cajas_turnos`, `caja_movimientos` |
| Fiscal ARCA (5) | `config_fiscal`, `comprobantes`, `comprobante_items`, `fiscal_config`, `fiscal_tickets` |
| Clientes (2) | `clientes`, `cuenta_corriente_movimientos` |
| Presupuestos (1) | `presupuestos` |
| Coach (1) | `coach_acciones` |
| Demo / Sistema (1) | `demo_visitas` |

### Relaciones clave
Todo `restaurante_id` → `restaurantes.id`. `user_restaurantes.user_id` / `equipo_miembros.auth_user_id` → `auth.users.id`. `ingredientes.receta_id` y `carta_items.receta_id` → `recetas.id`. `plato_recetas.plato_id` (no `receta_id`) → `carta_items.id`. Varios links son polimórficos sin FK por decisión (`menu_preparaciones.ref_id`, `checklist_secciones` ↔ HACCP por nombre `ilike`) — documentados como tales en `columnas.md`, no son deuda.

### Demo pública
`reset_demo_restaurante()` clona El Rescoldo real → restaurante demo cada noche (cron con `CRON_SECRET`). Clona 59 de las 78 tablas — el resto son seeds únicos o no scopeadas por restaurante. **Toda tabla nueva con `restaurante_id` debe sumarse a esa función** o queda vacía en la demo.

---

## 6. Autenticación

1. **`proxy.ts`** (raíz, reemplaza `middleware.ts` — breaking change Next 16) crea un `createServerClient` de `@supabase/ssr`, llama `supabase.auth.getUser()`. Sin sesión y ruta no pública → `/login`. Con sesión en `/login`/`/register` → `/`.
2. **`AuthProvider`** (`lib/auth/context.tsx`) — dos `useEffect` separados para evitar deadlock: (1) setea `user` vía `onAuthStateChange`+`getSession()`, sin queries DB; (2) carga perfil cuando `user` cambia (`user_restaurantes` → `equipo_miembros`), con reintentos y backoff para la race de hard-navigation. Detalle completo, incluidos los gotchas de reintento/timeout, en `.claude/docs/hooks.md` → "AuthProvider — cómo funciona".
3. **`RouteGuard`** — spinner mientras `loading`, lock screen sin perfil, children si OK.

### Roles (DB → app)
`mapRol()` traduce roles legacy de DB a los roles de UI: `admin→admin`, `sous_chef→chef`, `cocinero→` (plaza asignada), `bachero→ayudante`, `compras→admin` (subset de módulos).

### Sign up
`signUp()`: crea `auth.users` → `restaurantes` → `user_restaurantes` (rol admin) → `equipo_miembros` → seed de `rol_permisos` (5 roles). Setea `perfil` directo en el context para evitar la race de `onAuthStateChange`.

---

## 7. IA (Anthropic)

| Caso | Modelo | Por qué |
|---|---|---|
| Kitchen Coach chat | `claude-sonnet-4-6` | Razonamiento con contexto estructurado + tool use agéntico. |
| OCR facturas / listas de precios | `claude-sonnet-4-6` | Imágenes + extracción estructurada compleja. |
| Importar receta — imagen/multi-import/fichas técnicas | `claude-sonnet-4-6` | Visión multimodal, documentos largos. |
| Importar receta — texto simple / ajustes | `claude-haiku-4-5-20251001` | Transformación texto-in/texto-out, barato y rápido. |
| Import de carta, ventas, planilla de stock, mapeo de columnas, explicar sugerencia de producción, productos desde facturas | `claude-haiku-4-5-20251001` | Extracción estructurada de complejidad media. |

Todos los endpoints devuelven demo data si `ANTHROPIC_API_KEY` no está seteada.

---

## 8. Variables de entorno

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://clipcxcbtlibswfzsgzk.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...   # browser — NUNCA sb_secret_...
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...             # server-only, lib/supabase/admin.ts
SUPABASE_MANAGEMENT_TOKEN=sbp_...                   # migraciones/DDL vía Management API

# IA
ANTHROPIC_API_KEY=sk-ant-...

# App
NEXT_PUBLIC_SITE_URL=https://kos-app-one.vercel.app  # links de invitación/reset (Supabase Auth redirect)
CRON_SECRET=...                                       # protege /api/cron/reset-demo
```
Las mismas vars están en Vercel → Project Settings → Environment Variables (Production + Preview). `NEXT_PUBLIC_*` se inyecta al bundle del browser — nunca un secret ahí.

---

## 9. Dependencias

**Runtime clave:** `next` 16.2.0, `react`/`react-dom` 19.2.4, `@supabase/ssr` + `@supabase/supabase-js`, `swr` (cache estándar de hooks-lista), `zod` (validación), `jspdf`+`jspdf-autotable`, `xlsx`, `framer-motion`/`motion`, `qrcode`, `react-easy-crop`, `node-forge` (fiscal ARCA), `unpdf`, `pg` (scripts), `clsx`+`tailwind-merge`.

**Dev:** `typescript` ^5, `tailwindcss` ^4, `eslint` ^9 (roto — ver PENDIENTES), `vitest` ^4 + `@vitest/coverage-v8`, `@playwright/test`, `mammoth`, `adm-zip`.

**No instalado (por decisión):** Chart.js/Recharts (gráficos = CSS divs), date-fns/dayjs (Date API nativa + helpers propios de `lib/ops/turnos.ts`), react-hook-form/formik (`useState` controlado).

---

## 10. Convenciones

Reglas completas en CLAUDE.md (críticas), `.claude/docs/hooks.md` (hooks/Supabase) y `.claude/docs/ui.md` (UI/CSS). Resumen:
- **Archivos:** `camelCase.ts` hooks, `PascalCase.tsx` componentes, `kebab-case` rutas. Sin barrel files, imports vía `@/`.
- **TypeScript:** `strict: true`, tipos centralizados en `types/index.ts`.
- **Iconos:** Material Symbols Outlined únicamente — no emoji, no SVG custom.
- **Gráficos:** CSS divs (`width: X%`) — no Chart.js.
- **PDFs:** `jsPDF` + `jspdf-autotable`. **Excel:** `xlsx`.

---

## 11. Testing

Vitest (`npm test`) para lógica pura (máquina de estados de comandas, turnos/pase de turno, bus del mise). Playwright (`npm run test:e2e`, requiere dev server + `npx playwright install chromium`) para `e2e/salon-kds.spec.ts`. CI corre typecheck+vitest+build en cada push/PR. Convenciones completas en `.claude/docs/testing.md`.

---

## 12. Deploy

`git push` a `main` → GitHub (`Facundo-Astrada/kitchenos`) → Vercel auto-deploy. `npm run build` (typecheck + compilación) es el gate real antes de pushear — `npm run lint` está roto (ver PENDIENTES) y no bloquea. URL de prod: https://kos-app-one.vercel.app.
