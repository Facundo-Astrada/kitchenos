# KitchenOS — Estado Actual del Proyecto

**Fecha:** 18 de abril de 2026
**URL Producción:** https://kitchenos-three.vercel.app
**Credenciales test:** admin@elrescoldo.com / kitchenos2026
**Supabase:** https://clipcxcbtlibswfzsgzk.supabase.co
**Restaurante:** El Rescoldo (Córdoba, Argentina)

---

## 1. Módulos y Estado

| # | Módulo | Ruta | Estado | Detalle |
|---|--------|------|--------|---------|
| 1 | **Dashboard** | `/` | Funcional | Header con perfil real (auth), status bars reales (`3/12` mise/tareas), pase preview, stock crítico, grilla de módulos por rol, WelcomeDashboard para restaurantes nuevos, turno tracking en localStorage (iniciar/cerrar con duración y resumen), CTA de merma. |
| 2 | **Tareas** | `/tareas` | Funcional | CRUD, prioridades (crítica/alta/media/baja), categorías, asignación a plaza, checklist por tarea, filtros, tab Producción con matriz, FAB elevado para no tapar navbar. |
| 3 | **Recetario** | `/recetario` | Funcional | Lista con food cost, detalle `/recetario/[id]`, CRUD ingredientes, cálculo automático, búsqueda, filtros, tabs Recetas/Ideas (drafts), **importación IA desde foto/imagen/audio/texto/archivo/link** (single + multi), guardado vía API server-side (`/api/recetas/save`) que usa service role y evita RLS. PDF export. |
| 4 | **Stock** | `/stock` | Funcional | Productos con estado (ok/bajo/crítico), CRUD, categorías, alertas, búsqueda, exportar, **modo rápido** (pantalla grande para stock-take secuencial), precio con fuente reducida. |
| 5 | **Pedidos** | `/pedidos` | Funcional | CRUD, items con precios, estados (borrador/enviado/recibido/parcial), productos frecuentes como chips, búsqueda predictiva, WhatsApp y PDF, recepción parcial. |
| 6 | **Proveedores** | `/proveedores` | Funcional | CRUD, CUIT, teléfono, días entrega, rubro, historial facturas por proveedor, **auto-creación** desde facturas con IA. |
| 7 | **Facturas** | `/facturas` | Funcional | Carga con items, tipos A/B/C/X/remito/ticket, **OCR con IA** (Claude Sonnet 4.6) que detecta proveedor/items/total, detección de variaciones de precio, historial, condición de pago. |
| 8 | **Carta** | `/carta` | Funcional | Items vinculados a recetas, auto-fill desde receta, food cost preview con colores, 86 (no disponible), categorías, vincular/cambiar receta con tap-through, export PDF. |
| 9 | **Checklist / Mise en Place** | `/checklist` | Funcional | Mise en place por plaza, items con prioridad SP/P/R/CK, cantidades "10/25 pax" color-coded, registros diarios, rutinas con frecuencia diaria/semanal/quincenal/mensual, auto-selección de plaza según rol del usuario. |
| 10 | **Pase de Turno** | `/pase` | Funcional | Chat continuo entre turnos, grouping por emisor (sin avatar repetido), prioridades, crear tarea desde mensaje, realtime. |
| 11 | **HACCP** | `/haccp` | Funcional | 3 tabs: Temperaturas, Vencimientos (color coding por días), Limpieza. Export PDF para Bromatología. |
| 12 | **Reportes / CMV** | `/reportes` | Funcional | 5 tabs: Resumen KPIs, Food Cost por plato, Compras por proveedor, Precios/inflación, Producción. Selector de periodo, gráficos CSS (sin Chart.js). |
| 13 | **Calendario** | `/calendario` | Funcional | Vista mensual + semanal por horas, eventos con iconos/colores, entregas de pedidos auto-integradas, CRUD eventos, recurrencia. |
| 14 | **Turnos / Equipo** | `/turnos` | Funcional | 3 tabs: Equipo (lista + ficha + CRUD), Turnos (grilla semanal M/T/N/F/V, asignación inline al tap, columna Hs calculada), Puestos (CRUD, tareas, permisos). Select único Rol+Puesto+Plaza con optgroup. |
| 15 | **Producción** | `/produccion` | Funcional | Planilla de producción del día, asignación a miembros, badges P1/P2/P3, integrado con tareas (tab Producción). |
| 16 | **Merma** | `/merma` | Funcional | Bottom sheet desde dashboard y módulo propio, 8 motivos con iconos, turno, plaza, costo estimado. |
| 17 | **Configuración** | `/configuracion` | Funcional | Tabs: restaurante, plazas, rutinas, permisos por rol. Link a `/turnos` para gestión de equipo (sin tab de invitación). |
| 18 | **Auth** | `/login`, `/register` | Funcional | Login email+password, registro (crea restaurante + user_restaurantes + equipo_miembros + rol_permisos seed), reset password por email, proxy.ts protege rutas. |
| 19 | **Perfil** | `/perfil` | Funcional | Avatar, datos, cambiar contraseña, cerrar sesión. Linkado desde el header del dashboard. |
| 20 | **Kitchen Coach (IA)** | API `/api/coach` + FAB | Funcional | Chat UI (`components/coach/KitchenCoachFAB.tsx`) con quick prompts y contexto del restaurante (stock crítico, vencimientos, food cost). |
| 21 | **Modo Servicio** | En dashboard | Parcial | UI existe (`components/dashboard/ModoServicio.tsx`) pero **sin conectar a datos reales** — ver DECISIONES.md, se decidió diferir / descartar. |
| 22 | **Ventas** | `/ventas` | Funcional | Importación desde Excel/CSV (xlsx) y texto libre con IA (Haiku). Pantalla de revisión editable antes de guardar. Tab Resumen con KPIs y lista de ventas con detalle de items. Requiere migración SQL (`ventas` + `ventas_items`). |

**Resumen:** 21 módulos funcionales, 1 parcial (modo servicio), 0 críticos pendientes.

---

## 2. Tablas de Supabase (28 total)

Ver `ARQUITECTURA.md` §Supabase para el esquema completo con columnas y relaciones.

### Core (3)
`restaurantes`, `user_restaurantes`, `rol_permisos`

### Operación diaria (7)
`productos`, `proveedores`, `facturas`, `factura_items`, `precio_historial`, `pedidos`, `pedido_items`

### Recetario y Carta (3)
`recetas`, `ingredientes`, `carta_items`

### Tareas y Checklist (6)
`tareas`, `checklist_secciones`, `checklist_items`, `checklist_registros`, `checklist_rutina`, `checklist_rutina_registros`

### Comunicación (1)
`pase_mensajes`

### HACCP (5)
`haccp_equipos`, `haccp_temperaturas`, `haccp_vencimientos`, `haccp_limpieza`, `haccp_limpieza_registros`

### Calendario y Equipo (4)
`eventos`, `equipo_miembros`, `turnos`, `puestos`

### Producción (3)
`platos_compuestos`, `plato_componentes`, `produccion_diaria`

### Merma (1)
`merma`

**Total: 28 tablas** con RLS habilitado. Políticas actuales permisivas (`USING (true)`) — hay que restringir por `restaurante_id` antes de producción real multi-tenant (ver PENDIENTES.md §Crítico).

---

## 3. Bugs / Deuda Técnica Conocida

### Críticos reportados por Facundo (testing en restaurante real)
| # | Severidad | Descripción | Estado |
|---|-----------|-------------|--------|
| 1 | Media | **Facturas → Stock**: al cargar factura con IA, los productos no siempre se crean/actualizan en `productos`. | Pendiente diagnóstico |
| 2 | Media | **Login en producción**: hard navigation (F5/URL directa) a veces no resuelve el perfil y muestra `??` hasta el safety timer de 3s. | Mitigado con timer, fix real pendiente |
| 3 | Media | **Merma → Stock**: al registrar merma, el `stock_actual` no se descuenta automáticamente. | Pendiente |
| 4 | Baja | `USUARIO_MOCK` sigue hardcoded en `lib/hooks/usePase.ts` para nombre al enviar mensajes. | Pendiente |

### Deuda técnica
| # | Severidad | Descripción | Archivo |
|---|-----------|-------------|---------|
| 5 | Alta | RLS permisivo: todas las tablas tienen `USING (true)`. Multi-tenant no es seguro aún. | Todas las tablas |
| 6 | Media | `useCallback` deps vacías en varios hooks que usan `RESTAURANTE_ID` — posible stale closure si cambia restaurante. | `lib/hooks/*.ts` |
| 7 | Media | Tipos desactualizados: `Evento`, `Turno`, `Puesto` en `types/index.ts` tienen campos legacy que no matchean el schema DB actual. | `types/index.ts` |
| 8 | Baja | Modo Servicio no conectado (ver DECISIONES.md — probablemente se descarta). | `components/dashboard/ModoServicio.tsx` |
| 9 | Info | Scripts de migración con token de Supabase hardcodeado. | `scripts/*.mjs` |
| 10 | Info | No hay tests (unitarios ni e2e). | — |

---

## 4. Implementado en Últimas Sesiones

### Sesión anterior — 22 fixes críticos
- Build errors, deadlocks de auth, loops de realtime, memory leaks.
- Corrección de columnas (`stock_actual` vs `cantidad`, `status` vs `completada`).
- Visual consistency en todos los módulos (headers navy, CSS vars, Material Symbols).

### Sesión — 23 mejoras UX para test en restaurante real
1. DashboardHeader: KPIs reales (`3/12` mise/tareas) y link a `/perfil`.
2. WelcomeDashboard para restaurantes nuevos (5 pasos guiados + IA highlight).
3. `/` dashboard: separación `miseStats`/`tareasStats`, CTA merma, turno tracking con localStorage.
4. Checklist: auto-select plaza por rol, pluralización "mise en place", cantidades pax color-coded.
5. Pase: grouping por emisor (sin avatar repetido), botón "Crear tarea" por mensaje, toast.
6. Carta: detail view con tap-through a receta, sección vincular/cambiar.
7. Producción: badges P1/P2/P3, asignación por miembro, `puedeDelegar` según rol.
8. Stock: modo rápido (stock-take secuencial), precio con fuente reducida.
9. Turnos: select único Rol+Puesto+Plaza, inline pill expand en celdas, columna Hs.
10. Configuración: quitar tab Invitar, link a `/turnos`.
11. Recetario IA: Haiku para single text, Sonnet para imágenes/multi, modelo parametrizable.
12. Reemplazo de "ítem" por "mise en place".

### Sesión actual — 2 bugs críticos
1. **Guardado de recetas IA fallaba** con RLS violation (anon key bloqueado).
   - Creada API route `app/api/recetas/save/route.ts` con service role key.
   - `useRecetas.agregarReceta` ahora hace POST a la API; ingredientes batch en un solo request.
   - `handleGuardar` y `IAMultiResultScreen` actualizados para enviar receta + ingredientes juntos.
2. **FABs tapados por barra de navegación**.
   - Recetario `bottom: 90 → 110`.
   - Tareas `bottom: 72 → 100`.
3. Verificado end-to-end en preview server: creación manual de receta con ingrediente guarda sin error y redirige al detalle.

---

## 5. Arquitectura — resumen

```
Next.js 16.2.0 (App Router, Turbopack) + React 19.2.4
Supabase (auth + DB + realtime) + Vercel deploy
Tailwind CSS v4 + CSS vars + Material Symbols Outlined
jsPDF + jspdf-autotable | xlsx | Anthropic API (Haiku + Sonnet 4.6)
Auth: proxy.ts (NO middleware.ts — breaking change Next 16)
```

```
app/
  (app)/          ← 20 rutas protegidas (dashboard + módulos)
  (auth)/         ← login + register (públicas)
  api/            ← coach, facturas, listas-precios, recetas/import, recetas/save, migrate
lib/
  auth/           ← AuthProvider context + RouteGuard
  hooks/          ← 19 hooks (useRecetas, useStock, useTareas, …)
  supabase/       ← client (browser), server (SSR), admin (service role)
  constants.ts    ← Roles, módulos, nav
components/
  dashboard/      ← Header, MiPlaza, ModoServicio, ModulosGrid, PasePreview, StockCritico, WelcomeDashboard
  shell/          ← BottomNav, Header, MoreMenu, PageHeader, RouteGuard, ActionButton
  coach/          ← KitchenCoachFAB
  merma/          ← MermaBottomSheet
types/
  index.ts        ← Todos los tipos (Receta, Tarea, Producto, …)
proxy.ts          ← Auth middleware (Next 16)
```

**Hooks:** 19 | **Páginas app:** 20 | **API routes:** 6 | **Tablas:** 28 | **Componentes:** 19
