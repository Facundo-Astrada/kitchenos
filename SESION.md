# Sesión — 2026-09-01 (cont.) — estrategia Stripe+planes + dashboard de control del ecosistema

Arrancó como "vamos con Stripe + planes"; el relevamiento (research propio + estado real de las cuentas) cambió el plan antes de escribir código: Stripe no opera en Argentina, y K-OS resultó convivir con Fudo, no competir. 9 commits (`53910e6`…`fc21722`), pusheados. Detalle completo en `HISTORIAL.md`.

## Qué se cerró

- **12 decisiones de negocio** escritas en `~/Desktop/START UP KOS/00-decisiones/DECISIONES.md`. Quedan 2 abiertas: el nombre y la validación del precio (dependen de que Facundo hable con Franco de Bros).
- **`ia_uso`** — costo de IA imputado a las 12 rutas del proyecto, incluido el Coach.
- **`restaurantes.plan` + `lib/planes.ts` + `usePlan()`** — sin default, sin cablear a ninguna pantalla todavía (a propósito).
- **`/admin`** — dashboard de control del ecosistema: por restaurante (plan, usuarios, actividad, costo de IA), top de funciones, filtro por restaurante, changelog de commits. Ya probado por Facundo en producción, con dos vueltas de feedback aplicadas.

## Qué quedó a medias

- Nada de lo tocado hoy quedó a medio camino. El bloque de "Feature gating" (cablear `puedeUsar` en `RouteGuard`) y "Cobro automático" (Mercado Pago) son el siguiente paso, sin empezar.

## Probar primero mañana

- Confirmar que `ia_uso` ya tiene alguna fila real (`select * from ia_uso order by created_at desc limit 5`) — hasta el cierre de hoy seguía vacía.
- Si algo en `/admin` se ve raro (fechas, montos), es la primera pantalla nueva del proyecto fuera del shell de `(app)` — mirar `.claude/docs/ui.md` § "Vistas públicas" antes de tocar el layout.

## Próximo paso concreto

Decisión de Facundo, no de código: hablar con Franco de Bros (precio real + permiso de caso de éxito). De esa charla depende validar la grilla de 3 planes y decidir el nombre. Mientras tanto, "Feature gating" puede esperar sin costo — hoy no cambia nada visible porque `plan` es NULL en las 5 cuentas.
