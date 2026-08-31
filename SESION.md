# Sesión — 2026-08-31 (noche, cont. 3) — Día 4 del plan consolidado: ratchets de ingeniería

## Qué se cerró

Día 4 completo de `.claude/docs/ingenieria/plan-consolidado.md` §2. 1 commit
(`d46fe88`), pusheado.

- **`lib/ingenieria/ratchets.test.ts` nuevo** (corre con `npm test`, ya en
  CI): techos de líneas de las 5 pantallas grandes (solo bajan) + 4 reglas
  de `hooks.md`/`arquitectura-marco.md` que antes vivían solo en prosa,
  pasadas a chequeo automático.
- **Gotcha #20** (`createClient()` sin `useMemo`): arreglados los 3 hooks
  que lo violaban — `useFacturas`, `usePase`, `useReportes`.
- **Gotcha #18** (canal realtime sin `filter` por tenant): se sabía de
  `useCarta.ts`; auditar el resto encontró **7 hooks más** con el mismo
  problema — `useCalendario` (eventos), `useEquipo` (equipo_miembros),
  `useEspacios` (espacios+espacio_plazas), `useFacturas` (facturas),
  `usePedidos` (pedidos), `useProveedores` (proveedores). Todos arreglados,
  1 línea cada uno.
- **Ley "dominio nunca en `use client`"**: 0 violaciones reales — los 7
  archivos que sí lo tienen fuera de `lib/hooks/` son infraestructura de
  browser legítima (Context, animación, IndexedDB, Audio API, descarga de
  archivo), documentados en un allowlist.
- **`createAdminClient` sin `requireRestauranteId`**: 8 endpoints (no 2
  como estimaba el plan) no usan el helper pero verifican sesión a mano de
  forma equivalente — revisados uno por uno, allowlist. La excepción real:
  **`stock/import-planilla`** tenía un UPDATE de "apply" que solo filtraba
  por `id` de producto (dato del cliente) sin `restaurante_id` — con el
  admin client, un id forjado podía pisar el stock de otro restaurante.
  Corregido.
- Build, typecheck y 219 tests OK.

## Qué quedó a medias

- Nada de hoy.
- `.claude/settings.json` sigue modificado sin commitear (arrastrado desde
  jul 2026, sigue en `PENDIENTES.md` 🟢).
- Hallazgo al margen, sin tocar: hay un git worktree viejo en
  `.claude/worktrees/sleepy-jepsen` (rama `claude/sleepy-jepsen`) que
  `npm run lint` recorre y duplica warnings — no se tocó por las dudas de
  que sea trabajo en curso de otra sesión; revisar con Facundo si se puede
  borrar (`git worktree remove`).

## Probar primero mañana

- Nada específico de UI — los cambios de hoy son de referencia estable de
  hooks y filtros de realtime, invisibles en uso normal. Si se quiere
  verificar el fix de seguridad: en `/stock`, importar una planilla y
  confirmar que el "apply" sigue actualizando bien los productos propios
  (comportamiento idéntico al de antes, solo se cerró el agujero cross-tenant).

## Próximo paso concreto

**Día 5 del plan consolidado** (`plan-consolidado.md` §2): Puerto de IA.
`lib/ia/claude.ts` (`pedirAClaude`) usando `clasificarErrorIA` (ya existe en
`lib/ia/errores.ts`, usado por 7 de 12 rutas) + reintentos sobre el campo
`reintentable` (existe, nadie lo consume hoy) + log de tokens. Migrar las 12
rutas que llaman a la IA directo (mecánico), empezando por las 5 que no
usan `errores.ts` todavía. 3-4 h.
