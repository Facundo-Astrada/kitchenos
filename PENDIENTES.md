# KitchenOS — Pendientes

Lista priorizada de lo que falta. Mantenela sincronizada con `ESTADO-ACTUAL.md`. Lo resuelto y el detalle de sesiones pasadas viven en `HISTORIAL.md` (no acumular acá).

---

## 🟠 Alto

### Invitación de usuarios — falta config de Supabase
Código completo (endpoint `/api/invitar`, UI en Equipo, página `/registro-invitado`, `proxy.ts` la marca pública). Falta solo configuración de dashboard: whitelistear `https://kos-app-one.vercel.app/registro-invitado` en Supabase Auth → Redirect URLs, ajustar la plantilla "Invite user", setear `NEXT_PUBLIC_SITE_URL` en Vercel.

### Fiscal ARCA — homologación end-to-end
Código completo (`lib/fiscal/wsaa.ts`, `lib/fiscal/wsfev1.ts`, `app/api/fiscal/emitir/route.ts`). Falta: certificado real de ARCA del contribuyente, probar contra el servidor de testing de AFIP, URLs de prod en `config_fiscal`, cachear token/sign WSAA en Supabase.

### OPS Consolidación — diferido
Reset de `demanda_viva` al aperturar la plaza (hoy solo se lee, el salón la incrementa, nadie la resetea). "Copiar a otro día" e "Ingredientes consolidados" (se sacaron con la planilla legacy) — reimplementar sobre `tareas` si el usuario los pide.

---

## 🟡 Medio — Roadmap: Planes y Stripe

### Estructura de planes $60 / $99
`restaurantes.plan` (`'trial'|'basic'|'pro'`), tabla `suscripciones` (`restaurante_id, stripe_customer_id, stripe_subscription_id, status, plan, current_period_end`), hook `usePlan()`. Definir spec en `DECISIONES.md` antes de empezar código.

### Integración Stripe
`POST /api/stripe/checkout` (Checkout Session), `POST /api/stripe/webhook` (`customer.subscription.*` → `suscripciones`), UI en Configuración → Plan, paywall en trial expirado. Depende del ítem anterior.

### Feature gating
Coach, multi-usuario, export PDF, HACCP solo en plan Pro — `puedeUsar('coach')` derivado de `usePlan`. Depende de Stripe.

---

## 🟢 Bajo — Roadmap abierto

### Kitchen Coach — memoria persistida
Prompt caching y tool use agéntico ya resueltos. Falta tabla `coach_conversaciones` para historial cross-device (hoy es localStorage).

### Fotos — falta completar
`PhotoPicker` (bucket `fotos`) integrado en recetario y carta. Falta `equipo_miembros.foto_url` y facturas, si se decide.

### Exportar legajo PDF
Desde `/turnos` → tab Puestos → ficha del puesto → "Exportar legajo": PDF con datos, funciones, miembros asignados.

### Notificaciones
In-app vía Supabase realtime (tabla `notificaciones`), push web (PWA + service worker + VAPID), email/WhatsApp para alertas críticas (stock crítico, vencimientos).

### PWA offline — completar fuera de Salón/KDS
La vista de servicio (Salón/KDS) ya tiene offline completo (SW cachea GETs, bumps en cola IndexedDB, banner sin-conexión). El resto de la app (stock, facturas, etc.) queda pendiente.

### Onboarding wizard guiado
`WelcomeDashboard` existe. Falta el flujo completo: datos del restaurante → plazas → stock inicial → equipo → permisos, persistiendo progreso en `restaurantes.configuracion.onboarding_step`.

### Tests — Testing Library para hooks
Vitest + CI (typecheck+vitest+build por push/PR) + Playwright e2e (`e2e/salon-kds.spec.ts`) ya están. Falta Testing Library con mock del cliente Supabase para tests de hooks.

### Backlog chico — sin síntoma de usuario reportado, priorizar solo si molesta en uso real
- Warning "Maximum update depth exceeded" en `/checklist` (preexistente, no rompe funcionalidad visible — candidatos: `useChecklist`, `useProduccionRegistros`, o `ClientView.tsx`, no investigado a fondo).
- HACCP: 3 modales largos (limpieza/vencimientos/temperaturas) sin agrupar — mismo problema que tenía el modal de Stock (muchos campos heterogéneos sin secciones), candidato a la misma cura de fondo pero con otro tratamiento (no son checkboxes, no aplica `SwitchRow`).
- OPS Producción: el orden de columnas (drag-and-drop) persiste en `localStorage` por dispositivo, no en DB — cada navegador recuerda su propio orden. Mover a una tabla nueva (ej. `ops_orden_columnas`) si se necesita compartido entre dispositivos del mismo restaurante.
- Mise en tablet táctil ancha (iPad landscape, 1024px exactos): se queda en columna única porque la grilla de desktop está condicionada a `pointer: fine`. El motivo es que el reordenar es un long-press que compara `clientY` contra el centro vertical de cada ítem — con dos tarjetas lado a lado elige al azar. Para ganar la grilla ahí habría que hacer el drag 2D (comparar también `clientX` dentro de la fila). Solo si alguien usa el mise desde tablet.
- Migrar a columnas reales cuando vuelva el acceso DDL: plazas custom (hoy JSONB en `restaurantes.configuracion.plazas_custom`, `usePlazasCustom.ts`) y cantidad de recipientes (hoy sufijo `" ×N"` en `checklist_items.recipiente_nombre`, `lib/ops/mise.ts`). Ambos funcionan bien y degradan de forma legible — migrar es directo cuando haya acceso a migraciones.
- `tareas`/`MenuActivoView` no muestran `recipiente_nombre`/`peso_porcion` al ejecutar un menú activado en Producción (se cargan en el `OpsPanel` de Carta pero se pierden — `tareas` no tiene esas columnas). Decisión ago 2026: no vale la pena todavía (dato opcional, mayoría de menús se activan sin cargarlo) — retomar solo si el uso real en El Rescoldo lo pide.

### Calendario — F2 a F5 del plan de expansión
F1 (grilla estilo Google Calendar, notas por día como ítems enviables a Producción, Planificar menú por rango) ya deployado. Falta, en orden, según `CALENDARIO-PLAN.md`: F2 motor de rutinas recurrentes (generalizar `haccp_limpieza` a una tabla `rutinas` compartida — decisión de Facundo: generalizar, no duplicar por dominio), F3 más reflejos de solo lectura (menús de Carta, turnos, HACCP, cuenta corriente), F4 Coach con contexto completo del calendario + tools de agenda, F5 extras (ICS, feriados, semana tipo).

### Demo El Rescoldo — menú duplicado
Dos filas en `menus` con nombre "Noche de Asado - Día del Padre" y el mismo `created_at` (`e5c01d00-...d1` y `4622a73b-...`) — parecen un duplicado de seed, no algo que haya creado el usuario. Confunde el picker de "Cargar menú"/"Planificar menú" (aparece dos veces la misma opción). Revisar si conviene borrar una y sus tareas asociadas de junio.

### Carta — editor de composición (seguimiento auditoría ago 2026)
- Unificar del todo la semántica de "Cantidad" entre modo Plato (porciones, con gramaje opcional que ya afecta costo) y modo Menú/Evento (siempre gramos para receta/producto, unidades para plato vinculado) — hoy es coherente pero son dos modelos distintos sin explicarse entre sí; evaluar si conviene converger a uno solo.

### Kitchen Coach — asistir activamente en el editor de Carta
Hoy el Coach solo responde preguntas de navegación; el pedido es que ayude a cargar el menú que está abierto en `ComposicionEditor`. Ya existe una tool `crear_evento` en `app/api/coach/route.ts` (línea ~409) que crea un evento con pasos de menú por dictado — el pipeline de tool-use del backend ya funciona. Falta decidir: (A) operar en vivo sobre el estado de React del editor sin guardar (requiere un puente chat↔form nuevo, no hay nada parecido hoy) vs (B) extender el patrón de `crear_evento` con una tool `agregar_componentes_menu(menu_id, componentes[])` que escribe directo a DB y el editor se refresca — más simple, reusa lo que ya anda, pero exige guardar el menú (aunque sea vacío) antes de pedirle al Coach que lo complete. Recomendado: B. Sesión aparte.

### Hardening de seguridad (`get_advisors`)
- `reset_demo_restaurante()` es `SECURITY DEFINER` sin `REVOKE EXECUTE` — ejecutable por `anon`/`authenticated` vía RPC directo. Impacto acotado (solo resetea el restaurante demo) pero cualquiera con la publishable key podría spamearlo. Fix: `REVOKE EXECUTE ON FUNCTION reset_demo_restaurante() FROM anon, authenticated;` (solo el cron con service role debería poder llamarlo).
- Extensión `unaccent` instalada en el schema `public` — debería vivir en un schema propio (`extensions`); buena práctica, sin riesgo real hoy.
- Bucket público `fotos` tiene política SELECT amplia que permite listar todos los archivos (no solo acceder por URL conocida) — evaluar si conviene restringir el listado.
- Protección de contraseñas filtradas (HaveIBeenPwned) no está activada en Supabase Auth — activar desde el dashboard, sin código.

---

## Tracking

- 🔴 Crítico → resolver en la próxima sesión.
- 🟠 Alto → batch de 1-2 sesiones cada uno.
- 🟡 Medio → no empezar código hasta tener el spec definido en `DECISIONES.md`.
- 🟢 Bajo → priorizar según feedback real de El Rescoldo.
