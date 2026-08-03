# KitchenOS — Estado Actual del Proyecto

**URL Producción:** https://kos-app-one.vercel.app
**Credenciales test:** admin@elrescoldo.com / kitchenos2026
**Supabase:** https://clipcxcbtlibswfzsgzk.supabase.co
**Restaurante:** El Rescoldo (Córdoba, Argentina)

Este archivo es una foto del presente (qué existe, qué falta). El detalle histórico sesión-por-sesión vive en `HISTORIAL.md`.

---

## 1. Módulos y Estado

| # | Módulo | Ruta | Estado | Resumen |
|---|--------|------|--------|---------|
| 1 | **Dashboard** | `/` | Funcional | Header con perfil real, status bars, pase preview, stock crítico, `ModulosGrid` dinámico según módulos del puesto asignado. |
| 2 | **Tareas** | `/tareas` | Funcional (redirige a OPS salvo emprendimiento) | CRUD, prioridades, categorías, plaza, checklist por tarea. En perfil "emprendimiento" es pantalla propia agrupada por área libre (Kanban). |
| 3 | **Recetario** | `/recetario` | Funcional | Lista con food cost, detalle, CRUD ingredientes (con etapas/grupo), importación IA (single+multi), foto, peso total/escurrido, costeo en tiempo real, unidades smart, auto-link a stock, "Convertir a plato" + panel OPS integrado. Crear abierto a todos; importar/exportar solo admin. |
| 4 | **Stock** | `/stock` | Funcional | Productos con estado ok/bajo/crítico, CRUD, categorías, sectores/estantes físicos, producción interna vinculada a receta, "fuera de uso", modo rápido de conteo, import de planilla, carrito de compras, comparador de precios entre proveedores, sync de precio con facturas. |
| 5 | **Pedidos** | `/pedidos` | Funcional | CRUD, ítems con precios, estados, productos frecuentes, WhatsApp/PDF, recepción parcial, rango de entrega + banner de ingresos. |
| 6 | **Proveedores** | `/proveedores` | Funcional | CRUD, CUIT, teléfono, rubro, historial de facturas, auto-creación desde facturas con IA. |
| 7 | **Facturas** | `/facturas` | Funcional | Carga con ítems, OCR con IA, detección de variación de precio, cuentas por pagar (con vencimientos), reconciliación factura↔pedido, filtro de privacidad (gastos no-mercadería). |
| 8 | **Carta** | `/carta` | Funcional | Ítems vinculados a recetas, food cost, 86, categorías dinámicas, tags dietarios, panel OPS unificado (plaza→sección→recipiente→cantidad), importación IA, foto, carta pública QR sin login (`/carta/[slug]`). Precio/FC visible solo admin. Editor unificado Plato/Menú/Evento (`ComposicionEditor`): costeo y switch de modo consistentes, vista rápida de receta, vincular/nombre fusionado. |
| 9 | **Checklist / Mise en Place** | `/checklist` | Funcional (vive embebido en OPS) | Mise por plaza, prioridades SP/P/REF/OK, rutinas con frecuencia, drag entre secciones, sub-secciones (1 nivel), plaza General, modo Control simplificado, auditoría con scoring/foto obligatoria/condicionales. |
| 10 | **Pase de Turno** | `/pase` | Funcional | Chat continuo entre turnos, prioridades, crear tarea desde mensaje, realtime, `@menciones` compartidas con la columna Importante de OPS. |
| 11 | **HACCP / Limpieza** | `/haccp` | Funcional | Temperaturas, Vencimientos (color por días), Limpieza (con calendario + sync a OPS). Export PDF para Bromatología. |
| 12 | **Reportes / CMV** | `/reportes` | Funcional | 10 tabs: Resumen, CMV, Presupuesto vs Real, Rendimiento por plaza, Food Cost, Compras, Precios/inflación, Producción, Caja, Auditoría. Export Excel contextual por tab. |
| 13 | **Calendario** | `/calendario` | Funcional | Vista mensual + semanal, eventos con recurrencia, entregas de pedidos auto-integradas. |
| 14 | **Turnos / Equipo** | `/turnos` | Funcional | Tabs Equipo/Turnos/Puestos. Sistema de puestos con nivel+plaza_default+módulos, overrides individuales por persona, fichaje real (clock-in/out → costo laboral). |
| 15 | **Producción / Planificación** | `/produccion` | Funcional (vive embebido en OPS) | Planilla del día, calendario mensual con multi-select, multi-menú por día, "Sugerir producción" con IA (motor de reglas + narración, nunca cambia números). |
| 16 | **Merma** | `/merma` | Funcional | Bottom sheet + módulo propio, 8 motivos, turno, plaza, costo estimado (descuenta `stock_actual`). |
| 17 | **Configuración** | `/configuracion` | Funcional | Tabs restaurante/plazas/rutinas/permisos por rol. Carta pública (toggle+slug+QR), impresión y vencimientos HACCP configurables por establecimiento. |
| 18 | **Auth** | `/login`, `/register` | Funcional | Login/registro con onboarding, reset password, proxy.ts protege rutas. Botón "Ver demo" (clon lectura-escritura con reset nocturno). |
| 19 | **Perfil** | `/perfil` | Funcional | Avatar, datos, cambiar contraseña, cerrar sesión. |
| 20 | **Kitchen Coach (IA)** | API `/api/coach` + FAB | Funcional | Chat con FAB draggable, tours guiados por pantalla (19/19 con cobertura), datos reales server-side (M1), tool use agéntico (crear tarea, marcar 86, registrar merma, sugerir producción). |
| 21 | **Modo Servicio / Salón** | `/salon` | Funcional | Mapa de mesas con forma/tamaño/rotación reales (editor canvas con zoom/pan), comandas con modificadores, cobro, arqueo de caja, Kitchen Coach propio. Sin conexión: bloqueado + banner. |
| 22 | **Ventas** | `/ventas` | Funcional | Importación desde Excel/CSV y texto libre con IA, revisión editable, KPIs, ranking de platos, food cost teórico. |
| 24 | **OPS — Workspace diario** | `/operaciones` | Funcional | Puerta de entrada única a Producción/Mise/Planificación. Board por plazas (Carta) o pasos (Menú/Evento), modo "Todo" con bandas apilables, columna Importante, drag&drop de columnas persistido. |
| 25 | **Mesa de Trabajo** | `/espacios` | BETA (solo desktop) | Tab Producción (board anidado espacio→plaza→sección→sub-sección→producción) + tab Stock (Kanban productos×sectores con drag&drop, multi-select, columnas colapsables) + tab Carta (board de platos con OPS por plaza). Plazas custom por restaurante (JSONB, sin tabla nueva). |
| 26 | **KDS (Kitchen Display)** | `/kds` | Funcional | Selector de estación, tarjetas por comanda con cronómetro por umbral, bump por ítem/comanda, labels en español, sin Coach (regla inamovible), offline con cola IndexedDB. |
| 27 | **Modo Emprendimiento** | perfil por restaurante | Funcional (piloto: VOGLIO Farina) | `restaurantes.configuracion.perfil='emprendimiento'` oculta módulos de servicio de restaurante incluso siendo admin; `/tareas` propia; Mesa de Trabajo/Stock sin auto-seed de plazas de restaurante. |
| ~~23~~ | ~~OPS — Ingeniería de Menú~~ | ~~`/ingenieria-menu`~~ | **Eliminado** | Reemplazado por el modelo Menú unificado (Carta→Planificación→Producción). |

**Resumen:** 27 módulos funcionales (incluye salón, KDS, modo emprendimiento piloteado), 0 parciales, 0 críticos pendientes.

---

## 2. Tablas de Supabase (43 total)

Ver `ARQUITECTURA.md` §Supabase para el esquema completo con columnas y relaciones.

### Core (3)
`restaurantes`, `user_restaurantes`, `rol_permisos`

### Operación diaria (7)
`productos`, `proveedores`, `facturas`, `factura_items`, `precio_historial`, `pedidos`, `pedido_items`

### Recetario y Carta (5)
`recetas`, `ingredientes`, `carta_items` (+ `tags TEXT[]`), `carta_categorias`, `plato_recetas` (+ `plaza`)

### Tareas y Checklist (6)
`tareas`, `checklist_secciones`, `checklist_items`, `checklist_registros`, `checklist_rutina`, `checklist_rutina_registros`

### Comunicación (1)
`pase_mensajes`

### HACCP (5)
`haccp_equipos`, `haccp_temperaturas`, `haccp_vencimientos`, `haccp_limpieza`, `haccp_limpieza_registros`

### Calendario y Equipo (4)
`eventos`, `equipo_miembros`, `turnos`, `puestos`

### Producción (4)
`platos_compuestos`, `plato_componentes` (+ `plaza`, `cantidad_diaria`, `unidad`), `plato_plazas` (ingredientes[] por plaza), `produccion_diaria`

### Merma (1)
`merma`

### Servicio / Salón / Cobro / Fiscal (12)
`estaciones`, `comandas`, `comanda_items`, `comanda_item_modificadores`, `eventos_cocina`, `mesas` (pos_x/pos_y + forma/ancho/alto/rotacion), `cuentas`, `medios_pago`, `pagos`, `config_fiscal`, `comprobantes`, `comprobante_items`

**Total: 43 tablas** con RLS habilitado. Aislamiento multi-tenant real vía `mi_restaurante_id()`. Todas las políticas UPDATE tienen `WITH CHECK` explícito.

Nota: hay tablas adicionales sumadas después de este conteo (`menus`, `menu_preparaciones`, `stock_sectores`, `stock_estantes`, `cajas_turnos`, `caja_movimientos`, `salon_elementos`, `checklist_auditorias`, `presupuestos`, `demo_visitas`, etc.) — ver `.claude/docs/columnas.md` para el detalle columna por columna de cada una.

---

## 3. Bugs / Deuda Técnica Conocida

### Deuda técnica abierta
| # | Severidad | Descripción | Archivo |
|---|-----------|-------------|---------|
| 1 | Media | `useCallback` deps vacías en algunos hooks que usan `RESTAURANTE_ID` — riesgo de stale closure si cambia restaurante. | `lib/hooks/*.ts` |
| 2 | Media | Tipos desactualizados: campos legacy en `types/index.ts` que no matchean el schema DB actual en algunos casos puntuales. | `types/index.ts` |
| 3 | Baja | Modo Servicio (`ModoServicio.tsx`) no conectado — probablemente se descarta, ver `DECISIONES.md`. | `components/dashboard/ModoServicio.tsx` |
| 4 | Info | Scripts de migración con token de Supabase hardcodeado en algunos `.mjs`. | `scripts/*.mjs` |
| 5 | Info | Vitest: 13 tests de máquina de estados. Playwright: `e2e/salon-kds.spec.ts` (requiere `npx playwright install chromium` + dev server). Testing Library para hooks pendiente. | — |

### Resueltos (histórico)
RLS multi-tenant real (44 políticas UPDATE con `WITH CHECK`), login con hard-navigation, matching Facturas→Stock, descuento de stock por merma, `USUARIO_MOCK` hardcoded — todos con causa raíz y fix documentados en `HISTORIAL.md` y en `.claude/docs/hooks.md`.

---

## 4. Arquitectura — resumen

```
Next.js 16.2.0 (App Router, Turbopack) + React 19.2.4
Supabase (auth + DB + realtime) + Vercel deploy
Tailwind CSS v4 + CSS vars + Material Symbols Outlined
jsPDF + jspdf-autotable | xlsx | Anthropic API (Haiku + Sonnet 4.6)
Auth: proxy.ts (NO middleware.ts — breaking change Next 16)
```

```
app/
  (app)/          ← rutas protegidas (dashboard + módulos)
  (auth)/         ← login + register (públicas)
  (servicio)/     ← salon/page + kds/page (fondo oscuro fijo en KDS, tema app en Salón)
  (publico)/      ← carta/[slug] (vidriera QR sin login)
  api/            ← coach, facturas, listas-precios, recetas/import, recetas/save, ingest/escpos, ...
lib/
  auth/           ← AuthProvider context + RouteGuard
  hooks/          ← hooks por módulo (useRecetas, useStock, useTareas, useComandas, useMesas, ...)
  supabase/       ← client (browser), server (SSR), admin (service role)
  fiscal/         ← interfaz ProveedorFiscal + stub
  comanda/        ← stateMachine.ts + tests (máquina de estados comanda/ítem)
  offline/        ← bumpQueue.ts (IndexedDB cola bumps), useOnlineStatus.ts
  ops/            ← mise.ts (helper compartido de asignación OPS/mise)
  constants.ts    ← Roles, módulos, nav
components/
  ui/             ← componentes canónicos D0 (SegmentedTabs, FilterChips, EmptyState, HeaderAction, Avatar, Num)
  dashboard/      ← Header, MiPlaza, ModoServicio, ModulosGrid, PasePreview, StockCritico, WelcomeDashboard
  shell/          ← BottomNav, SidebarNav, Header, MoreMenu, PageHeader, RouteGuard
  ops/            ← OpsPanel (fuente única del panel plaza→sección→recipiente→cantidad), ProduccionBoard, CrearTareaSheet
  coach/          ← KitchenCoachFAB
  merma/          ← MermaBottomSheet
types/
  index.ts        ← Todos los tipos (Receta, Tarea, Producto, …)
proxy.ts          ← Auth middleware (Next 16)
```
