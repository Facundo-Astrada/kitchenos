# Sesión — 2026-08-31 (noche) — Día 1 del plan consolidado: seguridad

## Qué se cerró

Los 2 ítems 🔴 Crítico de `PENDIENTES.md`, siguiendo el Día 1 de
`.claude/docs/ingenieria/plan-consolidado.md`. 1 commit (`f0dfb4e`), pusheado.

- **3 endpoints admin sin auth cerrados**: `carta/86`, `salon/merma-auto`,
  `salon/prep-list-update` — ahora exigen `requireRestauranteId()` + verifican
  pertenencia del recurso al tenant (patrón de `stock/sync-precio`). Confirmado que
  el KDS que llama a `carta/86` corre logueado (`/kds` no es ruta pública en
  `proxy.ts`), así que exigir sesión no rompió nada. `merma-auto` dejó de aceptar
  `restaurante_id` del body — `useCuenta.cobrarCuenta` se corrigió en el mismo
  commit para no mandarlo más.
- **`tareas_duplicados_backup_20260826` borrada** (decisión de Facundo: DROP directo,
  no RLS — el respaldo ya cumplió su función). Confirmado 76 filas antes de borrar;
  la alerta ERROR de Supabase ya no aparece.
- Build + typecheck + 203 tests OK antes de commitear.
- **Credenciales de git arregladas de raíz**: el push falló por token vencido en
  Credential Manager; se resolvió con `gh auth login` + `gh auth setup-git` (ya no
  hace falta pegar un PAT a mano en los próximos push).

## Qué quedó a medias

- Nada de Día 1 — quedó completo, sin cabos sueltos.
- `.claude/settings.json` sigue modificado sin commitear (decisión de Facundo
  arrastrada desde jul 2026, sigue en `PENDIENTES.md` 🟢).
- El PAT que Facundo pegó en el chat para el primer push (`ghp_CXSA...`) sigue sin
  revocar — recordarle rotarlo en GitHub → Settings → Developer settings → Tokens.

## Probar primero mañana

- En producción (post-deploy): cobrar una cuenta en Salón (que la merma automática
  siga descontando stock) y marcar/sacar un 86 desde el KDS — los dos flujos que
  tocan los endpoints recién cerrados.

## Próximo paso concreto

**Día 2 del plan consolidado** (`plan-consolidado.md` §2): invariantes a la base
(1/2) — rpc `reemplazar_menu_preparaciones` para que `actualizarMenu` deje de perder
datos ante un corte a mitad de camino, + candado `UNIQUE ... WHERE estado='abierta'`
en `cuentas` con captura del 23505. 2-3 h + 1-2 h, no depende de nada (podría
adelantarse el día 3 si conviene).
