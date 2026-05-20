# KitchenOS — Pendientes

Lista priorizada de todo lo que falta. Mantenela sincronizada con `ESTADO-ACTUAL.md` y con el feedback real de Facundo probando en El Rescoldo.

---

## 🔴 Crítico — Bugs reportados de testing real

Estos surgieron cuando Facundo empezó a usar la app en la cocina del restaurante. Hay que resolverlos antes de seguir agregando features.

### 1. Guardado de recetas con IA (RESUELTO en sesión actual)
**Síntoma:** Al importar una receta con IA, la pantalla de confirmación aparecía pero al pulsar "Guardar receta" daba error y no se guardaba ninguna.
**Causa raíz:** RLS de `recetas` bloqueaba el insert con anon key (error 42501).
**Fix aplicado:** Creada `app/api/recetas/save/route.ts` con service role. `useRecetas.agregarReceta` ahora hace POST a esta API con la receta + ingredientes en batch. Verificado end-to-end en preview server.
**Status:** ✅ Cerrado y deployado.

### 2. FABs tapados por navbar (RESUELTO)
**Síntoma:** Los botones "Nueva receta" y "Agregar tarea" quedaban intercalados con la barra inferior.
**Fix:** Recetario `bottom: 90 → 110`, Tareas `bottom: 72 → 100`.
**Status:** ✅ Cerrado.

### 3. Facturas → Stock no sincroniza
**Síntoma:** Al cargar una factura con IA, los productos detectados no siempre se crean/actualizan en `productos`. El stock queda sin los nuevos productos o sin precio actualizado.
**Posible causa:** El hook `useFacturas` guarda en `factura_items` pero no hace upsert en `productos`, o el matching por `producto_nombre` falla.
**Próximo paso:** Reproducir cargando una factura real, tracear qué hace `handleSaveFactura` en `app/(app)/facturas/page.tsx`, verificar si hay un paso que haga `INSERT … ON CONFLICT` en `productos`.
**Status:** ⏳ Pendiente diagnóstico.

### 4. Login en producción (hard navigation)
**Síntoma:** F5 o acceso directo por URL a veces no resuelve el perfil — muestra `??` en las iniciales del avatar hasta que dispara el safety timer de 3s.
**Mitigación actual:** Safety timer en `AuthProvider`. No es un fix real.
**Causa probable:** Race entre `onAuthStateChange` y `getSession()` inicial, o cookies SSR que llegan tarde.
**Próximo paso:** Loggear cada estado del `loading`/`user`/`perfil` en prod e identificar en qué punto queda colgado. Considerar hacer la query de perfil en `proxy.ts` o en un Server Component para hidratar el context con datos ya resueltos.
**Status:** ⏳ Pendiente investigación.

### 5. Merma → Stock no descuenta
**Síntoma:** Al registrar una merma, el `stock_actual` del producto no se descuenta automáticamente.
**Próximo paso:** En `useMerma.agregarMerma`, después del insert en `merma`, hacer un `UPDATE productos SET stock_actual = stock_actual - cantidad WHERE id = producto_id`. Alternativa: trigger en la DB, pero con RLS actual es más simple hacerlo desde el hook.
**Status:** ⏳ Pendiente.

---

## 🟠 Alto — Seguridad y UX restante del feedback

### 6. RLS real por `restaurante_id`
**Por qué ahora:** La app está en producción con políticas permisivas (`USING (true)`). Si un segundo restaurante se registra, vería datos del primero.
**Trabajo:**
- Crear una función SQL `get_restaurantes_del_usuario(uid uuid)` que devuelva el set de restaurantes del usuario.
- Cambiar las políticas de cada tabla a `USING (restaurante_id IN (SELECT ... WHERE user_id = auth.uid()))`.
- Reemplazar inserts que usen service role key desde el cliente si la API route puede validarlos (ej: `/api/recetas/save` puede quedar pero validando que el `restaurante_id` pertenezca al usuario autenticado vía cookie).

### 7. USUARIO_MOCK en `usePase`
**Síntoma:** Al enviar un mensaje en el pase, el `usuario_nombre` queda como `"MOCK"` en vez del nombre real del user logueado.
**Fix:** Leer del `AuthProvider` el `perfil.nombre + perfil.apellido` y pasarlo en el insert.

### 8. Invitación de usuarios por email
**Flujo esperado:** Admin ingresa email + rol → Supabase envía magic link → el empleado llega a la app, setea contraseña, queda vinculado al `restaurante_id` del admin con el rol asignado.
**Trabajo:**
- Endpoint `POST /api/invitar` con service role que haga `supabase.auth.admin.inviteUserByEmail()` y pre-cree la fila de `user_restaurantes` + `equipo_miembros`.
- UI en `/turnos` tab Equipo: botón "Invitar" → modal con email + rol.

### 9. Permisos por rol en UI (esconder acciones)
Actualmente hay un hook `usePermisos` que lee `rol_permisos`, pero no todos los módulos lo consumen. Revisar:
- `/stock`, `/recetario`, `/carta`: esconder botones de crear/editar/eliminar si el rol no tiene `puede_editar_*`.
- Módulos fuera de `modulos_visibles` ya no deberían aparecer en `BottomNav` / `MoreMenu`.

### 10. Tipos desactualizados
`Evento`, `Turno` y `Puesto` en `types/index.ts` tienen campos legacy. Sincronizar con el schema real (los hooks tienen tipos ad-hoc). Esto puede causar type errors en refactors.

### 11. `useCallback` deps
Varios hooks tienen `useCallback(…, [])` cuando capturan `RESTAURANTE_ID`. Si el usuario cambia de restaurante (vía switcher en configuración — no existe aún pero va a existir), queda stale. Agregar `RESTAURANTE_ID` a las deps o usar `useRef`.

---

## 🟡 Medio — Roadmap Semana 2: Planes y Stripe

### 12. Estructura de planes $60 / $99
Definir en `DECISIONES.md` §Planes el scope exacto de cada plan. Implementación:
- Tabla `restaurantes.plan text` con valores `'trial' | 'basic' | 'pro'`.
- Tabla `suscripciones` con `{restaurante_id, stripe_customer_id, stripe_subscription_id, status, plan, current_period_end}`.
- Hook `usePlan()` que expone `plan`, `esTrial`, `vencimientoTrial`, `featuresHabilitadas[]`.

### 13. Integración Stripe
- Endpoint `POST /api/stripe/checkout` que crea una Checkout Session con el price correcto según plan.
- Endpoint `POST /api/stripe/webhook` que escucha `customer.subscription.created/updated/deleted` y actualiza `suscripciones`.
- UI en `/configuracion` tab Plan: ver plan actual, vencimiento, botón "Actualizar plan" que redirige a Stripe Checkout.
- Modo "trial expirado" que bloquea acciones de escritura con un paywall.

### 14. Feature gating
Features pro (ej: Kitchen Coach, multi-usuario, exportar reportes PDF, HACCP) solo en plan Pro. Flag `puedeUsar('coach')` derivado de `usePlan`.

---

## 🟢 Bajo — Semana 3+: Onboarding, IA y polish

### 15. Onboarding wizard
Primera vez que un usuario entra a un restaurante recién creado (`WelcomeDashboard` ya existe) pero falta el flujo guiado:
- Paso 1: datos del restaurante (nombre, ciudad, tipo de cocina).
- Paso 2: plazas activas (parrilla/fríos/calientes…).
- Paso 3: agregar primeros productos al stock (opcional — "lo puedo hacer después").
- Paso 4: crear puestos y agregar miembros del equipo.
- Paso 5: config de permisos por rol.
Persistir progreso en `restaurantes.configuracion.onboarding_step`.

### 16. Kitchen Coach — mejoras
Base ya implementada (`KitchenCoachFAB` + `/api/coach`). Falta:
- Memoria de conversación persistida (tabla `coach_conversaciones`).
- Acciones agénticas: que pueda sugerir "agregá esta tarea" y con un tap se cree de verdad.
- Uso de herramientas Anthropic (tool use) para consultar stock / food cost on-demand en vez de pasar todo en el system prompt.
- Caching de prompts (Anthropic prompt caching) para reducir costo — ver `claude-api` skill.

### 17. Subida de fotos
- Bucket Supabase Storage: `recetas`, `platos`, `miembros`, `facturas`.
- Componente `<PhotoPicker>` que toma foto con cámara móvil o galería, la sube al bucket, devuelve URL pública.
- Integrar en: detalle de receta, carta items, equipo_miembros.foto_url, facturas (imagen_url ya existe).

### 18. Exportar legajo PDF
Desde `/turnos` tab Puestos → ficha del puesto → botón "Exportar legajo". PDF con datos del puesto, lista de tareas/funciones, miembros asignados. Para RRHH.

### 19. Notificaciones
Botón de campana en el header no hace nada. Opciones:
- Notificaciones in-app con Supabase realtime sobre tabla `notificaciones`.
- Push notifications web (requiere PWA + service worker + VAPID keys).
- Email/WhatsApp para alertas críticas (stock crítico, vencimientos próximos).

### 20. PWA offline
- `manifest.json` ya existe — verificar iconos.
- Service worker que cachee assets estáticos y últimos 30 días de datos del restaurante.
- Estrategia `stale-while-revalidate` para la mayoría de queries.
- UI banner "estás offline, mostrando datos cacheados".

### 21. Modo Servicio (decisión pendiente)
Ver `DECISIONES.md` §Modo Servicio. Probablemente se descarta — si no, conectar a datos reales de producción del día.

### 22. Limpiar tokens hardcodeados en scripts
Los scripts de `scripts/*.mjs` tienen el `SUPABASE_MANAGEMENT_TOKEN` en texto plano. Mover a `.env.local` y leer con `process.env.SUPABASE_MANAGEMENT_TOKEN`.

### 23. Tests
No hay tests actualmente. Mínimo aceptable antes de más features:
- Vitest + Testing Library para los hooks (mock del cliente Supabase).
- Playwright para 3 flujos críticos: login, crear receta con IA, cargar factura con OCR.

---

## 📋 Tracking

- Prioridades 🔴 se resuelven en la próxima sesión de trabajo con Facundo.
- Prioridades 🟠 van en batch después — son trabajo de 1-2 sesiones cada una.
- Prioridades 🟡 requieren decisiones de producto (pricing, planes) — no empezar código hasta tener el spec definido.
- Prioridades 🟢 son roadmap open-ended — priorizar según feedback real.

Cuando se cierre un bug o se implemente un feature, mover la entrada a "Implementado en últimas sesiones" en `ESTADO-ACTUAL.md` §4 y tacharla acá.
