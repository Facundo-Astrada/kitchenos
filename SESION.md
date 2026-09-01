# Sesión — 2026-09-01 — relevamiento de estado + barrido de seguridad

Sesión de investigación (funcionalidad / seguridad / estado comercial / permisos / control del ecosistema). Destapó cuatro cosas rotas y se cerraron todas el mismo día. 3 commits: `44bd500`, `d6a0dd2`, `c084ea2`.

## Qué se cerró

- **🔴 Escalada de tenant vía `user_restaurantes`.** Cualquier usuario podía reescribir su propia fila y quedarse con la cuenta entera de otro restaurante (verificado en prod con ROLLBACK: Bros → Origen, 27 recetas / 18 facturas / 58 productos / 8 miembros). El alta se mudó a `POST /api/registro`, se dropearon las policies de escritura + grants, y quedó el ratchet #6.
- **🔴 Realtime muerto en producción** por un `\n` al final de `NEXT_PUBLIC_SUPABASE_ANON_KEY` en Vercel — pase, mise entre dispositivos, KDS, Muro y campanita, caídos sin ningún error de servidor. `lib/supabase/env.ts` hace `.trim()`. Verificado post-deploy: el WS conecta.
- **🟠 `reset_demo_restaurante()` ejecutable por anónimos.** El `REVOKE` del 27/08 no cerró nada: en Postgres el `EXECUTE` viene de `PUBLIC`, y se había revocado solo a `anon`/`authenticated`.
- **🟠 Bucket `fotos` aislado por tenant** (`PhotoPicker` prefija el `restaurante_id`) — y de paso aparecieron las policies de UPDATE/DELETE que faltaban, por las que el botón de borrar foto nunca borró nada.
- **Base limpia**: 17 restaurantes → 5, todos reales, con respaldo.

## Qué quedó a medias

- Nada de lo abierto hoy. Los 4 hallazgos están cerrados, deployados y verificados en vivo.

## Probar primero mañana

- **Nada de riesgo pendiente**, pero si algo se comporta raro mirá primero el alta de restaurante (`/register` → `/api/registro`): es el flujo que más cambió. Probado end-to-end contra prod con un usuario real (después borrado).
- El realtime volvió, así que funciones que llevaban tiempo sin andar de verdad (sync del mise entre dos dispositivos, bumps del KDS entre tablets, el Muro) van a comportarse distinto a lo que el equipo se acostumbró. Vale mirarlas en servicio.

## Próximo paso concreto

Decisión de Facundo, con la recomendación puesta:

1. **Stripe + planes** — es lo único que separa producto terminado de negocio. Hay 1 cliente real (Bros) y 0 pagando. Spec en `DECISIONES.md` antes de código, como dice el propio backlog.
2. **Dashboard de control del ecosistema** — después de Stripe (necesita algo que medir). El argumento fuerte lo dio esta sesión: el realtime estuvo caído quién sabe cuánto y **nada lo detectó**. Ítem nuevo en `PENDIENTES.md` 🟠.
3. Los días 6-10 de `.claude/docs/ingenieria/plan-consolidado.md` (refactor de Carta, copias) — valor interno, cero para vender. Con un solo cliente, yo los pausaría hasta tener 3-4 cuentas pagando.

**Tarea manual para Facundo (no es código):** sacarle el `\n` a `NEXT_PUBLIC_SUPABASE_ANON_KEY` en el dashboard de Vercel. El `.trim()` la vuelve inofensiva pero la variable sigue sucia.
