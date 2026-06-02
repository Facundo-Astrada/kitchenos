# KitchenOS — Pendientes

Lista priorizada de todo lo que falta. Mantenela sincronizada con `ESTADO-ACTUAL.md` y con el feedback real de Facundo probando en El Rescoldo.

---

## 🟠 Alto — Seguridad y UX

### 2. Invitación de usuarios por email
**Flujo esperado:** Admin ingresa email + rol → Supabase envía magic link → el empleado llega a la app, setea contraseña, queda vinculado al `restaurante_id` del admin con el rol asignado.
**Hecho (2 junio 2026):**
- ✅ Endpoint `POST /api/invitar` con service role (`inviteUserByEmail` + pre-crea `user_restaurantes` + `equipo_miembros` con `activo: false`).
- ✅ UI en `/turnos` tab Equipo: botón "Invitar por email" → modal con nombre + email + rol.
**Falta:** página `/registro-invitado` (landing del magic link donde el invitado setea contraseña). Hoy el redirectTo apunta ahí pero la página no existe aún. Configurar template de email en Supabase.
**Status:** 🟡 Parcial.

### 3. Permisos por rol en UI (esconder acciones)
Hay un hook `usePermisos` que lee `rol_permisos`, pero no todos los módulos lo consumen.
- `/stock`, `/recetario`, `/carta`: esconder botones de crear/editar/eliminar si el rol no tiene `puede_editar_*`.
- Módulos fuera de `modulos_visibles` ya no deberían aparecer en `BottomNav` / `MoreMenu`.
**Status:** ⏳ Pendiente.

### 4. Tipos desactualizados
`Evento`, `Turno` y `Puesto` en `types/index.ts` tienen campos legacy. Sincronizar con el schema real. Puede causar type errors en refactors.
**Status:** ⏳ Pendiente.

### 5. `useCallback` deps faltantes
Varios hooks tienen `useCallback(…, [])` cuando capturan `RESTAURANTE_ID`. Agregar `RESTAURANTE_ID` a las deps para evitar stale closure si el usuario cambia de restaurante.
**Status:** ⏳ Pendiente.

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

### 9. Kitchen Coach — mejoras avanzadas
FAB draggable, overlay tutorial, tour guiado OPS y opciones seleccionables ya implementados. Falta:
- Memoria de conversación persistida (tabla `coach_conversaciones`).
- Acciones agénticas: sugerir "agregá esta tarea" y que con un tap se cree de verdad.
- Tool use de Anthropic para consultar stock / food cost on-demand.
- Prompt caching para reducir costo.
**Status:** ⏳ Pendiente (base completa, falta capa agéntica).

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
**Status:** ⏳ Pendiente.

---

## ✅ Resuelto (historial)

| # | Descripción | Cuándo |
|---|---|---|
| Sesión completa: 12 cambios UX + 3 features | Ver detalle abajo. | 2 junio 2026 |
| Merma estética azul | Header navy, pills translúcidas, stat "Total costo" en accent. | 2 junio 2026 |
| Carta botones header | Separado en 2 filas: título + "Nuevo"; chips Importar/PDF/Excel en row scrollable horizontal. | 2 junio 2026 |
| Coach chip "Registrar merma" | Chip fijo sobre el input del Coach en todas las pantallas → abre MermaBottomSheet. | 2 junio 2026 |
| Facturas paginación "cargar más" rota | Bug stale closure: `page` era state en deps de fetchFacturas. Fix: `pageRef = useRef(0)`. | 2 junio 2026 |
| Ingeniería de Menú eliminada | Carpeta `/ingenieria-menu` borrada + limpiado `constants.ts` (ModuloId, MODULO_CONFIG, MODULOS_POR_ROL, RUTA_A_MODULO). | 2 junio 2026 |
| Horas mensuales en Turnos | Botón "Ver horas del mes" → fetchTurnosMes → tabla por miembro (días + horas, rojo si >176h). | 2 junio 2026 |
| Calendario ↔ OPS | `useCalendario` lee `produccion_diaria` → días con OPS activo como dots verdes "OPS: [menú]". | 2 junio 2026 |
| Coach contextual en todas las pantallas | `SUGGESTIONS_BY_SCREEN` + `kc_screen_context` en stock, recetario, facturas, reportes, merma, haccp. | 2 junio 2026 |
| Equipo: invitar por email | Botón "Invitar" → modal → `POST /api/invitar` (service role: inviteUserByEmail + pre-crea user_restaurantes + equipo_miembros). | 2 junio 2026 |
| Limpieza: crear tarea + calendario + OPS | Migración haccp_limpieza (dia_semana/dia_mes/sync_ops/checklist_item_id). Form con día + toggle OPS. Sub-tabs Lista/Calendario. Sync a checklist plaza General sección Limpieza. | 2 junio 2026 |
| Reportes: CMV + Presupuesto + Rendimiento | Tabla `presupuestos` (RLS). Tab CMV (ventas vs compras). Tab Presupuesto vs Real (semanal→anual, input inline). Tab Rendimiento por plaza (tareas + merma). | 2 junio 2026 |
| Facturas: privacidad (excluir personas) | OCR detecta gastos no-mercadería + persona física → `items_excluidos`/`alerta_privacidad`. Lista `nombres_excluidos` en configuracion. Post-filtro en OCR + importador universal. Banner en confirm. | 2 junio 2026 |
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
