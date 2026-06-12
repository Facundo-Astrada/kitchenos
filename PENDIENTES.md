# KitchenOS — Pendientes

Lista priorizada de todo lo que falta. Mantenela sincronizada con `ESTADO-ACTUAL.md` y con el feedback real de Facundo probando en El Rescoldo.

---

## 🟠 Alto — Seguridad y UX

### 2. Invitación de usuarios por email
**Flujo esperado:** Admin ingresa email + rol → Supabase envía magic link → el empleado llega a la app, setea contraseña, queda vinculado al `restaurante_id` del admin con el rol asignado.
**Hecho:**
- ✅ Endpoint `POST /api/invitar` con service role (`inviteUserByEmail` + pre-crea `user_restaurantes` + `equipo_miembros` con `activo: false`).
- ✅ UI en `/turnos` tab Equipo: botón "Invitar por email" → modal con nombre + email + rol.
- ✅ Página `/registro-invitado` (ya existía; 7 jun 2026 reforzada para manejar hash / PKCE `?code=` / `token_hash` / sesión activa).
- ✅ `proxy.ts` marca `/registro-invitado` como ruta pública (11 jun 2026) — el invitado sin sesión ya no rebota a `/login`.
**Falta (solo config de dashboard, no código):** whitelistear `https://kos-app-one.vercel.app/registro-invitado` en Supabase Auth → URL Configuration → Redirect URLs, y activar/ajustar la plantilla de email "Invite user". Setear `NEXT_PUBLIC_SITE_URL` en Vercel.
**Status:** 🟢 Código completo — falta verificar config Supabase end-to-end.


### 4. Tipos desactualizados
`Evento`, `Turno` y `Puesto` en `types/index.ts` tienen campos legacy. Sincronizar con el schema real. Puede causar type errors en refactors.
**Status:** ⏳ Pendiente.

### 5. `useCallback` deps faltantes
Varios hooks tienen `useCallback(…, [])` cuando capturan `RESTAURANTE_ID`. Agregar `RESTAURANTE_ID` a las deps para evitar stale closure si el usuario cambia de restaurante.
**Status:** ✅ Resuelto de facto (verificado en auditoría 10 jun 2026 — los hooks principales ya tienen RESTAURANTE_ID en deps).

---

## 🟡 Medio — Roadmap: Planes y Stripe

### 6. Estructura de planes $60 / $99
- Tabla `restaurantes.plan text` con valores `'trial' | 'basic' | 'pro'`.
- Tabla `suscripciones` con `{restaurante_id, stripe_customer_id, stripe_subscription_id, status, plan, current_period_end}`.
- Hook `usePlan()` que expone `plan`, `esTrial`, `vencimientoTrial`, `featuresHabilitadas[]`.
**Status:** ⏳ Pendiente — definir spec en `DECISIONES.md` antes de empezar código.

### 7. Integración Stripe
- Endpoint `POST /api/stripe/checkout` → Checkout Session con el price del plan.
- Endpoint `POST /api/stripe/webhook` → escucha `customer.subscription.*` y actualiza `suscripciones`.
- UI en `/configuracion` tab Plan: ver plan actual, vencimiento, botón "Actualizar plan".
- Modo "trial expirado" que bloquea acciones de escritura con un paywall.
**Status:** ⏳ Pendiente — depende de ítem 6.

### 8. Feature gating
Features pro (Kitchen Coach, multi-usuario, exportar reportes PDF, HACCP) solo en plan Pro. Flag `puedeUsar('coach')` derivado de `usePlan`.
**Status:** ⏳ Pendiente — depende de ítem 7.

---

## 🟢 Bajo — Roadmap abierto

### 9. Kitchen Coach — capa agéntica (M1 + M5)
Tour guiado, cobertura 19/19 pantallas, motor genérico `lib/coach/tours.ts` completados (3 jun 2026). Estado:
- ✅ **M1 — Datos server-side** (10 jun 2026): `api/coach/route.ts` consulta datos reales vía `buildSnapshot()` (server client → respeta RLS) y los inyecta al system prompt: stock crítico/bajo (`productos`), vencimientos ≤3 días (`haccp_vencimientos`), facturas pendientes (`facturas`). Acotado y falla seguro. Falta opcional: FC de recetas server-side (hoy llega por `kc_screen_context` del cliente).
- ✅ **M5 — Tool use agéntico** (10 jun 2026): el Coach ejecuta acciones desde el chat vía tool use + loop agéntico server-side (hasta 4 vueltas) en `route.ts`. 3 tools (`crear_tarea`, `marcar_86`, `registrar_merma`) corren con el server client → RLS por tenant; `restaurante_id` se resuelve de la sesión, no del body. Falla seguro (cada tool devuelve string al modelo).
- **Memoria persistida** (tabla `coach_conversaciones`). ⏳ Pendiente.
- **Prompt caching** para reducir costo ~3× (sistema prompt es 90% estático). ⏳ Pendiente.
**Status:** 🟡 M1 + M5 hechos · falta memoria persistida + prompt caching.

### 10. Subida de fotos
- Bucket Supabase Storage: `recetas`, `platos`, `miembros`, `facturas`.
- Componente `<PhotoPicker>` que toma foto con cámara o galería, sube al bucket, devuelve URL pública.
- Integrar en: detalle de receta, carta items, equipo_miembros.foto_url, facturas.
**Status:** ⏳ Pendiente.

### 11. Exportar legajo PDF
Desde `/turnos` tab Puestos → ficha del puesto → "Exportar legajo". PDF con datos del puesto, funciones, miembros asignados.
**Status:** ⏳ Pendiente.

### 12. Notificaciones
- Notificaciones in-app vía Supabase realtime (tabla `notificaciones`).
- Push notifications web (PWA + service worker + VAPID keys).
- Email/WhatsApp para alertas críticas (stock crítico, vencimientos).
**Status:** ⏳ Pendiente.

### 13. PWA offline
- Service worker que cachee assets estáticos y últimos 30 días de datos.
- Estrategia `stale-while-revalidate` para la mayoría de queries.
- Banner "estás offline, mostrando datos cacheados".
**Status:** ⏳ Pendiente.

### 14. Onboarding wizard mejorado
`WelcomeDashboard` ya existe. Falta flujo guiado completo:
- Datos del restaurante → plazas → stock inicial → equipo → permisos.
- Persistir progreso en `restaurantes.configuracion.onboarding_step`.
**Status:** ⏳ Pendiente.

### 15. Versión web desktop
Rediseñar las vistas principales para pantalla grande. La DB, hooks y API routes ya existen — solo es UI.
- Sidebar fijo de navegación (reemplaza BottomNav en desktop)
- Dashboard: widgets en grilla 2-3 columnas
- Tablas con más columnas visibles (Facturas, Stock, Recetario, Turnos)
- Layouts responsive con breakpoints `md:` y `lg:` de Tailwind
- Usar plugin `frontend-design` para evitar look genérico de IA
- Mismo proyecto Next.js, mismas rutas, deploy único en Vercel
**Status:** ⏳ Pendiente — arrancar cuando se resuelvan los ítems 🟠 Alto.

### 16. Tests
- Vitest + Testing Library para hooks (mock del cliente Supabase).
- Playwright para 3 flujos críticos: login, crear receta con IA, cargar factura con OCR.
**Status:** ⏳ Pendiente.

### 16. Limpiar tokens hardcodeados en scripts
Los scripts de `scripts/*.mjs` tienen el `SUPABASE_MANAGEMENT_TOKEN` en texto plano. Mover a `.env.local`.
**Status:** ✅ Resuelto (verificado en auditoría 10 jun 2026 — los scripts ya leen `process.env.SUPABASE_MANAGEMENT_TOKEN`).

---

## ✅ Resuelto (historial)

| # | Descripción | Cuándo |
|---|---|---|
| Performance: cache SWR en 10 hooks + fix doble-tap (stock nav + recetario) | 14 hooks ahora cachean cross-navegación (eran 4): `useProveedores`, `useMenus`, `useCategoriasProducto`, `useMerma`, `useHaccp` (5 fetches→1 combinado), `useVentas`, `usePackagingGrupos`, `usePedidos`, `useEquipo` (miembros+puestos), `useCarta` — se sumaron a stock/recetas/tareas/checklist. Re-entrar a una pantalla muestra data cacheada al instante + revalida en background (antes: spinner + refetch completo). **Doble-tap:** `/stock` pasó de Server Component async (`ƒ dynamic`, round-trip al server antes de navegar) a client estático (`○`) → navega al instante como las demás. Recetario: quitado `y`-translate + `staggerChildren` de la lista (las cards se movían >1s bajo el dedo) → tappable de inmediato. `useCalendario`/`useProduccion` quedan sin SWR (parametrizados por fecha/mes). | 12 junio 2026 |
| Equipo: teclado se cerraba al tipear + multi-plaza OPS | `turnos/page.tsx`: `MiembroFormDatos` y `PuestoFormBody` eran funciones internas de `TurnosPage` usadas como JSX → React las remontaba en cada re-render → foco perdido → teclado cerrado. Fix: extraídas a nivel de módulo (fuera del componente). Multi-plaza: selector de puesto ya no resetea plazas seleccionadas; plaza_asignada guarda comma-separated (`"pasteleria,frios"`). | 12 junio 2026 |
| Checklist: selector de plazas para usuarios con varias plazas asignadas | `plaza_asignada` expuesto en `PerfilAuth`. `ClientView.tsx` filtra el grid al subset de plazas del usuario (+ general) cuando tiene ≥2 asignadas. Tabs inline en el header del checklist para cambiar entre sus plazas. | 12 junio 2026 |
| Mise/apertura: stock editable inline | `ProductoMiseCard.tsx`: el box "stock" en apertura ahora es tappable → input inline azul. Al guardar llama `onUpsert` con `cantidad_actual` en el registro de apertura de hoy. Muestra la corrección (prioridad: apertura corregida > cierre anterior). | 12 junio 2026 |
| Cierre hallazgos auditoría de seguridad | 10 endpoints ahora resuelven tenant de la sesión (no del body): `importador/import`, `facturas-universal`, `facturas-fudo`, `stock-fudo`, `productos-desde-facturas`, `stock/rebuild`, `auto-link-ingredientes`, `recetas/save` (+validación de pertenencia), `sync-precio`, `undo`. `/api/migrate` eliminado (sin auth, service role). `recetas/save`: 401 sin sesión; modos `enrich`/`addIngredients` verifican pertenencia al tenant. `proxy.ts`: `/registro-invitado` es ruta pública. | 11 junio 2026 |
| Coach: prompt server-side + caching + rate limit | Prompt estático (~4k tokens) movido al server con `cache_control: ephemeral` → ~75-85% menos costo de input tokens a partir del 2° request. Rate limit 15 req/60s por usuario. Body del cliente simplificado: solo `{messages, screenContext, ctx}`. `COACH_HIGHLIGHT_IDS` movido a `lib/coach/highlights.ts`. | 11 junio 2026 |
| HACCP: botón guardar tapado por el BottomNav | Las 3 sub-vistas (limpieza/vencimientos/temperaturas) tenían la barra de guardar `position:fixed bottom:0 z-50` detrás del nav (`z-100`). Pasadas a botón inline dentro del scroll. | 10 junio 2026 |
| Carta: Menús como navegación primaria | Toggle segmentado Platos \| Menús (mismo peso visual). Importar/PDF/Excel bajan a fila secundaria discreta. | 10 junio 2026 |
| Editar un menú propaga a fechas ya activadas | `actualizarMenu` sincroniza las tareas de Planificación/Producción (hoy en adelante): agrega nuevas preparaciones, refresca existentes, saca borradas solo si no se empezaron. | 10 junio 2026 |
| Producción: no acumula tareas viejas ni duplica carryover | Carryover de 1 día (hoy + ayer sin completar, requiere `turno_fecha`). `activarMenu` deduplica por preparación contra el día y el arrastre de ayer. Limpieza de 203 tareas viejas en Bros. | 10 junio 2026 |
| Desambiguación OPS — única puerta de entrada | `/operaciones` con deep-link `?tab=`; `/tareas`, `/checklist`, `/produccion` redirigen a OPS (antes eran vistas huérfanas sin tab bar). `ProduccionView` como export nombrado. | 7 junio 2026 |
| Fix Facturas → Stock (matching invertido) | `crearFactura` matcheaba `producto.includes(factura)` → pisaba el producto equivocado / creaba duplicados. Corregido a `factura.includes(producto)` + guard longitud ≥4 + guard `RESTAURANTE_ID`. | 7 junio 2026 |
| Invitación: página `/registro-invitado` | Ya existía; reforzada para hash/PKCE/token_hash/sesión activa. Falta solo config dashboard Supabase. | 7 junio 2026 |
| Unificación de Menús (Carta→Planificación→Producción) | Entidad `menus`+`menu_preparaciones`. Editor unificado Plato/Menú/Evento en Carta. Activar menú en Planificación (1 o N días) → tareas en Producción/Menú (secciones dinámicas, tildable). Mise intacto. Una sola Planificación (sin sub-tabs, EventosView eliminado). Recetario "Cargar con IA" abre form completo. Varios fixes (schema cache, NOT NULL, chip mise, multi-día). | 6 junio 2026 |
| Ítem 3: Permisos granulares por rol en UI | Stock/Carta/Merma ocultan montos al no-admin; Recetario permite crear pero no importar/exportar; HACCP permite registrar pero no editar tareas. ModulosGrid usa puedeVer() dinámico desde puestos. | 3 junio 2026 |
| Sistema puestos con permisos reales | DB: `puestos.nivel+plaza_default`, `equipo_miembros.modulos_extra+restringidos`. 8 templates. Tab Puestos con toggles de módulos reales. Form 2 pasos equipo. Overrides por persona. usePermisos carga puesto del usuario logueado. | 3 junio 2026 |
| OPS mise: suma por receta+plaza (no reemplaza) | `plato_recetas.cantidad_ops+unidad_ops`. handleGuardarOPS suma todas las contribuciones de la misma receta+plaza → checklist_item.cantidad = total acumulado. Badge OPS en receta lista. Preview del total antes de guardar. | 3 junio 2026 |
| Sesión completa: 12 cambios UX + 3 features | Ver detalle abajo. | 2 junio 2026 |
| Merma estética azul | Header navy, pills translúcidas, stat "Total costo" en accent. | 2 junio 2026 |
| Carta botones header | Separado en 2 filas: título + "Nuevo"; chips Importar/PDF/Excel en row scrollable horizontal. | 2 junio 2026 |
| Coach chip "Registrar merma" | Chip fijo sobre el input del Coach en todas las pantallas → abre MermaBottomSheet. | 2 junio 2026 |
| Facturas paginación "cargar más" rota | Bug stale closure: `page` era state en deps de fetchFacturas. Fix: `pageRef = useRef(0)`. | 2 junio 2026 |
| Ingeniería de Menú eliminada | Carpeta `/ingenieria-menu` borrada + limpiado `constants.ts` (ModuloId, MODULO_CONFIG, MODULOS_POR_ROL, RUTA_A_MODULO). | 2 junio 2026 |
| Horas mensuales en Turnos | Botón "Ver horas del mes" → fetchTurnosMes → tabla por miembro (días + horas, rojo si >176h). | 2 junio 2026 |
| Calendario ↔ OPS | `useCalendario` lee `produccion_diaria` → días con OPS activo como dots verdes "OPS: [menú]". | 2 junio 2026 |
| Kitchen Coach — cobertura total 19/19 pantallas | Motor de tour genérico (`lib/coach/tours.ts`), skill `/coach-screen`, tours en todas las pantallas, screen_context con insights reales (no solo conteos), 40+ `data-coach-target`, ejemplos de highlight en el prompt. | 3 junio 2026 |
| Coach contextual — base inicial | `SUGGESTIONS_BY_SCREEN` + `kc_screen_context` en stock, recetario, facturas, reportes, merma, haccp. | 2 junio 2026 |
| Equipo: invitar por email | Botón "Invitar" → modal → `POST /api/invitar` (service role: inviteUserByEmail + pre-crea user_restaurantes + equipo_miembros). | 2 junio 2026 |
| Limpieza: crear tarea + calendario + OPS | Migración haccp_limpieza (dia_semana/dia_mes/sync_ops/checklist_item_id). Form con día + toggle OPS. Sub-tabs Lista/Calendario. Sync a checklist plaza General sección Limpieza. | 2 junio 2026 |
| Reportes: CMV + Presupuesto + Rendimiento | Tabla `presupuestos` (RLS). Tab CMV (ventas vs compras). Tab Presupuesto vs Real (semanal→anual, input inline). Tab Rendimiento por plaza (tareas + merma). | 2 junio 2026 |
| Facturas: privacidad (excluir personas) | OCR detecta gastos no-mercadería + persona física → `items_excluidos`/`alerta_privacidad`. Lista `nombres_excluidos` en configuracion. Post-filtro en OCR + importador universal. Banner en confirm. | 2 junio 2026 |
| Limpieza facturas personales (Bros) | Script `limpiar-facturas-personales.mjs`. Borradas 112 facturas ($63.9M) de empleados + Franco Ghione. Importador universal filtra prefijo "Empleado". Quedan 888 facturas de mercadería. | 2 junio 2026 |
| UX fixes: OPS sección + drag sin text selection + stock sector scroll | Carta OPS agrega selector de sección (Heladera/Secos/Congelados/Estación). `user-select: none` global en body. Sheet "Stockear" scrolleable con maxHeight 80vh. | 2 junio 2026 |
| Saneamiento de datos completo (costos + stock + categorías) | `unitConversionFactor` con `canonUnit()` (normaliza gr/lt/cc/unidad), factor 0 para combos u↔peso. Donut blindado FC>100%. Categorías: recategorizador con prioridad (Aceites/Vinagres antes que Verduras/Bebidas) — 69→16 canónicas. 22 productos `unidad='unidad'` corregidos vía `factura_items`. Stock inflado ×1000 arreglado: **$72.2M → $8.0M**. Costos absurdos: Pimientos $896.483→$6.489, Mostaza Fermentada $1.9M→$6.681. | 1 junio 2026 |
| KitchenCoach — Tour guiado OPS | FAB draggable (Pointer Events + localStorage), overlay SVG con agujero, tour 11 pasos con tab-switching automático, card final, chips de respuesta rápida, sin markdown en respuestas IA. | 31 mayo 2026 |
| OPS — Sync bidireccional Producción ↔ Mise | Tildar en Producción marca en Mise y viceversa via prefijo "Producción:" en título de tarea. `syncMiseCompletado` + `handleMiseUpsert`. | 30 mayo 2026 |
| OPS — MISE card rediseño | Apertura: box Stock (cierre anterior, color semáforo verde/amarillo/rojo) + box A producir (target fijo). Cierre: mantiene input editable. Tab Rutinas + días_semana en checklist_rutina. | 30 mayo 2026 |
| OPS — Eventos + CIERRE con carryover | Tabla `evento_items` con RLS. Sub-tabs Menú/Eventos en Planificación. Tab Cierre con sección "Pendientes del turno" (items de apertura sin completar en amarillo). | 29 mayo 2026 |
| OPS: rediseño UX workspace diario | 3 tabs, sublabels prioridades, toggle con subtítulo, QuickAdd recetas, checklist auto-plaza + progreso en grid, calendario mensual, multi-select días, menu_tag, Ingeniería standalone. | 27 mayo 2026 |
| USUARIO_MOCK en usePase | `usuario_nombre` ya usa `perfil.nombre + perfil.apellido` del AuthProvider. | Mayo 2026 |
| RLS multi-tenant real | 44 políticas UPDATE corregidas, 0 USING(true) ilegítimos. KitchenOS listo para multi-tenant. | Mayo 2026 |
| Merma → Stock descuenta | `useMerma.agregarMerma` ahora hace UPDATE en `stock_actual` después del insert. | Mayo 2026 |
| Login hard navigation | Perfil resuelve correctamente sin mostrar `??`. Race condition en AuthProvider corregida. | Mayo 2026 |
| Facturas → Stock sincroniza | `handleSaveFactura` hace upsert correcto en `productos`. | Mayo 2026 |
| Guardado de recetas con IA | API route `/api/recetas/save` con service role. RLS violation 42501 eliminada. | Abril 2026 |
| FABs tapados por navbar | Recetario `bottom: 110`, Tareas `bottom: 100`. | Abril 2026 |

---

## 📋 Tracking

- 🔴 Crítico → resolver en la próxima sesión.
- 🟠 Alto → batch de 1-2 sesiones cada uno.
- 🟡 Medio → no empezar código hasta tener el spec definido en `DECISIONES.md`.
- 🟢 Bajo → priorizar según feedback real de El Rescoldo.
