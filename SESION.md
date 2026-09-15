# Sesión — 15/09/2026 (4)

## Qué se cerró
- **Notificaciones push web** (sesión 4 del lote de 6). Decisión de canal
  pedida antes de tocar código: push ahora, email después (Resend bloqueado
  por dominio sin verificar, no por código). `crearNotificacion()` sigue
  siendo el único punto de entrada — ahora dispara push best-effort además
  del insert in-app. Tabla `push_subscripciones` (RLS propia), `lib/push/enviar.ts`
  (`web-push` + VAPID, limpia suscripciones vencidas), `/api/push/subscribe`,
  `/api/push/unsubscribe`, `/api/notificaciones/push`, handlers `push`/
  `notificationclick` en `public/sw.js`, opt-in por dispositivo en `/perfil`.
- Verificado con Playwright (login real): rama "permiso denegado" de la UI,
  y las 3 rutas server-side directo contra la sesión real (insert, upsert
  sin duplicar, best-effort sin 500, delete). Fila de prueba borrada.
- 1 commit (`edaecbf`), pusheado. Typecheck, 539 tests, build limpios.
- Migración aplicada a prod. Dos gotchas nuevos documentados en `hooks.md`
  (#30 dev server único de Next 16, #31 `NEXT_PUBLIC_*` sin recarga en caliente)
  y uno en `testing.md` (Notification.permission en Chromium headless).

## Qué quedó a medias
- **Falta cargar las 3 env vars VAPID en Vercel** (Production + Preview) —
  están en `.env.local`, no se pudieron subir por CLI porque el `VERCEL_TOKEN`
  guardado está vencido. Sin esto el toggle de `/perfil` se auto-oculta en
  prod (no rompe nada, pero el push no sale). Valores ya en el chat de esta
  sesión si hace falta volver a pegarlos.

## Probar primero mañana
- Una vez cargadas las env vars en Vercel: activar el toggle en `/perfil`
  desde un celular real, asignar un turno desde otra cuenta y confirmar que
  llega la notificación push con la app cerrada.

## Próximo paso concreto
Quedan 2 sesiones del lote de 6: motor de rutinas (Calendario F2), y
Calendario F3/F4/F5 + Bitácora F2/F3. Wirear un trigger de push nuevo
(stock crítico, HACCP) y decidir el canal email siguen siendo decisiones de
producto aparte, no asumir que entran solas.
