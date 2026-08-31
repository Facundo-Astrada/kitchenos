# Sesión — 2026-08-31 (noche, cont.) — Día 2 del plan consolidado: invariantes a la base (1/2)

## Qué se cerró

Los 2 invariantes de Día 2 de `.claude/docs/ingenieria/plan-consolidado.md` §2.
2 commits (`d38a246`, `537ac9b`), pusheados.

- **`actualizarMenu` ya no pierde datos ante un corte de red.** Nueva RPC
  `reemplazar_menu_preparaciones` (transacción única en Postgres) reemplaza
  el update+delete+insert de 3 round-trips separados que tenía `useMenus.ts`.
- **Candado "una cuenta abierta por mesa".** `UNIQUE INDEX
  cuentas_mesa_abierta_unica` + `useMesas.abrirCuenta` atrapa el 23505 y
  reusa la cuenta ganadora en vez de duplicar.
- Migraciones aplicadas directo a prod vía MCP de Supabase, RPC verificada
  en una transacción con rollback antes de tocar el cliente. `get_advisors`
  encontró y se corrigió un `search_path` mutable en la función nueva.
- 3 tests nuevos de `useMesas.abrirCuenta` (incluye el camino del candado);
  `mockSupabase.ts` ganó soporte de secuencias de respuesta para poder
  simularlo. Build + typecheck + 206 tests OK.

## Qué quedó a medias

- Nada de Día 2 — quedó completo.
- `.claude/settings.json` sigue modificado sin commitear (arrastrado desde
  jul 2026, sigue en `PENDIENTES.md` 🟢).

## Probar primero mañana

- En producción: editar y guardar un menú/evento existente (que las
  preparaciones queden bien tras el guardado) y abrir dos pestañas
  intentando abrir cuenta en la misma mesa a la vez (una gana, la otra
  reusa la misma cuenta — no debería duplicar).

## Próximo paso concreto

**Día 3 del plan consolidado** (`plan-consolidado.md` §2): invariante de la
comanda — trigger AFTER UPDATE sobre `comanda_items` para que "todos los
ítems bumpeados ⇒ comanda lista" se decida en la DB, no en la cache del
cliente (dos tablets KDS a la vez pueden dejarla sin pasar a `lista`), con
test multi-cliente + verificación de compatibilidad con la cola offline.
2-3 h + 1-2 h. Si sobra: query de huérfanos de refs polimórficas (🟢).
