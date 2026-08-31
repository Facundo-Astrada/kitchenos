# Sesión — 2026-08-31 (noche, cont. 9) — Día 10 del plan: matar copias CoA + legislar glosario

## Qué se cerró

Día 10 completo de `.claude/docs/ingenieria/plan-consolidado.md` §2 —
**último día del plan de diez.** 1 commit de código (`f0053b4`), pusheado.

- **Tres copias CoA muertas** (branch by abstraction, sin cambiar
  comportamiento): `lib/permisos/roles.ts` (`mapRol` ×2 → 1), `lib/unidades.ts`
  (`canonUnit`/`unitConversionFactor` ×3 → 1, con re-export desde
  `useRecetas.ts` para no tocar consumidores) y `PLAZAS_OPS` de
  `lib/ops/mise.ts` (ahora deriva de `PLAZAS_FIJAS`/`PLAZA_LABELS`/
  `PLAZA_COLORS` en vez de espejo a mano).
- **Bonus no planeado**: al unificar `PLAZAS_OPS` apareció una **4ª copia**
  no documentada en `espacios/ItemEditPanel.tsx`, ya desincronizada (plaza
  `general` gris ahí vs. azul en todos lados — bug de color real). Se mató
  con el mismo fix.
- **Dos docs de legislación**: `.claude/docs/glosario.md` nuevo (7
  significados de "turno", 3 nombres de "mise", + 3 reglas para lo nuevo:
  `estado` no `status`, `jornada` no `turno_fecha`, "turno" reservado para
  `TurnoServicio`) y sección nueva en `hooks.md` ("Convención — dónde va una
  operación compartida", firma `(supabase, restauranteId, input)` + tabla de
  decisión).
- Typecheck, build y 254 tests (246 + 8 nuevos de `roles.test.ts`) en verde.
  Lint: mismos ~10.000 problemas pre-existentes, cero nuevos en los archivos
  tocados.
- Docs: `PENDIENTES.md` (podadas las dos entradas de día 10), `HISTORIAL.md`,
  `CLAUDE.md` (fila nueva en la tabla de docs condicionales apuntando a
  `glosario.md`).

## Qué quedó a medias

- Nada de hoy.
- `.claude/settings.json` sigue modificado sin commitear (arrastrado desde
  jul 2026, sigue en `PENDIENTES.md` 🟢).
- El git worktree viejo en `.claude/worktrees/sleepy-jepsen` (rama
  `claude/sleepy-jepsen`) sigue sin revisar con Facundo.
- Paso 5b de Carta (mover `DetailView` a su propio archivo — move puro, ½
  día) sigue como cola disponible para cualquier sesión que sobre tiempo.

## Probar primero mañana

- Nada específico — son extracciones puras (mismo output, distinto archivo
  fuente) verificadas con typecheck + build + suite completa. Si algo se
  quiere confirmar a ojo: el selector de plaza en Espacios → editar ítem
  (antes tenía "General" en gris, ahora en azul como en todos lados).

## Próximo paso concreto

**El plan de ingeniería de diez días está completo.** Registro de riesgos
cerrado: cero endpoints sin auth (día 1), cero writes que pierdan datos
(días 2-3), red de ratchets en CI (día 4), puerto de IA completo (día 5),
Carta a mitad de mudanza en estado estable (días 6-9, queda 5b como cola sin
apuro), `crearFactura` transaccional (día 8), copias CoA muertas y glosario
legislado (día 10, hoy).

Según `plan-consolidado.md` §2: **"Después del día 10: se vuelve a
producto."** El próximo tema no sale de una lista de ingeniería — es **B9
(Reservas dentro del día de trabajo: OPS/Salón/Calendario/Dashboard)**, el
bloque pendiente de `PLAN-4-CAPAS.md` (ver `PENDIENTES.md` 🟠, primera
entrada). Si Facundo prefiere no arrancar Reservas todavía, las colas
disponibles sin abrir tema nuevo son: paso 5b de Carta (½ día), censo de
tablas en `ARQUITECTURA.md` (30 min), o Carta paso 3 (Rentabilidad:
`lib/carta/reprecio.ts` + `saludCarta.ts`).
