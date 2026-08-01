# PLAN-FLUJO-2026-07 — Corrección del flujo de trabajo con Claude Code

Origen: auditoría del flujo de trabajo (31 jul 2026, sesión Fable). 16 hallazgos sobre
configuración, memoria del proyecto y ritual de sesiones. Este plan los resuelve en
2 sesiones. **Ninguna de las dos toca código de la app** (`app/`, `lib/`, `components/`).

Estado: ✅ Sesión 1 completa (31 jul 2026) · ⬜ Sesión 2 pendiente

---

## Sesión 1 ✅ — Configuración e infraestructura (~1h, Sonnet)

Resuelve hallazgos: hook tsc lento, MCPs muertos, tokens expuestos, allowlist inflado,
skills genéricas, scripts de screenshot reinventados, archivos colgados.

Ejecutar EN ORDEN. Verificar cada paso antes de seguir.

### 1.1 Hook de TypeScript → Stop
En `.claude/settings.json`: mover el hook de `PostToolUse` (matcher `Write|Edit`) a un
hook de `Stop`, mismo comando (`npx tsc --noEmit ...`). Hoy corre un typecheck completo
del proyecto en CADA edit (decenas de segundos × cientos de edits por sesión); debe
correr una vez por turno.

### 1.2 Rotar tokens — PASO MANUAL DE FACUNDO
El agente NO puede hacer esto; solo guiar y esperar confirmación:
- Supabase → Account → Access Tokens: revocar el management token actual, generar uno nuevo.
- Vercel → Settings → Tokens: revocar y regenerar.
- GitHub → Settings → Developer settings → PAT: revocar `ghp_...` actual y regenerar.
Los tres actuales están en texto plano en `.mcp.json` y uno viejo de Supabase quedó
incrustado en entradas del allowlist de `settings.local.json`. Tras rotar: actualizar
`.env.local` y correr `.claude/setup-mcp.ps1` para refrescar las variables de entorno
de Windows.

### 1.3 Limpiar `.mcp.json`
- Borrar los servers `vercel` (token inválido, y el deploy real va por git push → webhook)
  y `github` (redundante: `gh` CLI ya está autenticado).
- Dejar solo `supabase`, con el token como referencia `${SUPABASE_MANAGEMENT_TOKEN}` —
  nunca literal en el archivo.

### 1.4 Reescribir el allowlist de permisos
En `.claude/settings.json` y `.claude/settings.local.json`: vaciar las ~270 entradas
one-off (rutas de scratchpads muertos, curls con token inline, PIDs puntuales) y dejar
~15 globs:
```
Bash(npm *)        Bash(npx *)        Bash(node *)
Bash(git *)        Bash(gh *)         Bash(curl *)
Bash(taskkill *)   Bash(grep *)       Bash(ls *)
PowerShell(git *)  PowerShell(npm *)
Bash(node "C:/Users/Equipo/AppData/Local/Temp/claude/**")
mcp__supabase__execute_sql   mcp__supabase__apply_migration   mcp__supabase__list_tables
Skill(deploy) Skill(deploy:*) Skill(impacto) Skill(impacto:*) Skill(supabase-check) Skill(supabase-check:*) Skill(run) Skill(run:*)
```
Conservar `additionalDirectories` y los hooks. La entrada de scratchpad elimina el motivo
del patrón "cp scratchpad → ./.scratch-*.mjs" que ensuciaba el repo.

### 1.5 Purgar skills genéricas
En `.claude/skills/`: borrar el pack de libros de negocio/diseño (~45 carpetas: 37signals-way,
blue-ocean-strategy, mom-test, hooked-ux, clean-code, ddia-systems, etc. — ninguna aparece
en el historial de sesiones del último mes).
**Conservar:** `add-rls, coach-screen, create-skill, debug-error, deploy, estimate, impacto,
impeccable, design-taste-frontend, new-app, new-module, pr-review, supabase-check,
update-manual, update-status`.

### 1.6 Script de screenshots reutilizable
Crear `scripts/shot.mjs`: driver Playwright parametrizado por CLI
(`--ruta /stock --viewport mobile|desktop --cuenta bros|demo --out docs/shots/x.png`),
consolidando lo que ~20 scripts one-off de sesiones pasadas reescribieron desde cero
(login + navegar + esperar + capturar). Crear skill `/shot` (10 líneas) que lo invoque.
Borrar los huérfanos: `.scratch-*.mjs`, `scratch_shot*.mjs`, `_capturar-*.mjs` y similares.

### 1.7 Cerrar lo colgado en git
Los PDFs/manuales y scripts de la sesión de docs del 28-29 jul siguen sin commitear
(`KitchenOS-Manual-OPS.pdf`, `docs/manual-ops.*`, `docs/fonts/`, `scripts/*-to-pdf.mjs`, etc.).
Commitearlos (son entregables reales) y dejar `git status` limpio.

### Verificación de cierre de Sesión 1
- Un edit de prueba NO dispara tsc; al terminar el turno sí corre una vez.
- `claude` arranca sin errores de MCP y `mcp__supabase__list_tables` responde.
- `git status` limpio. Marcar "Sesión 1 ✅" en este archivo. Commit + push.

---

## Sesión 2 — Memoria del proyecto y método (~1.5-2h, Sonnet, sesión nueva)

Resuelve hallazgos: 100KB de contexto fijo por sesión, docs-changelog, PENDIENTES/ESTADO-ACTUAL
inflados, update-status que pregunta lo que ya sabe, continuidad rota entre días.

### 2.1 Podar los docs de `.claude/docs/`
Reescribir `hooks.md` (31KB), `columnas.md` (27KB) y `ui.md` (30KB) como reglas atemporales
de 2-3 líneas cada una:
- Sin fechas, sin "Pasó con X en jul 2026", sin nombres de sesión/tanda/fase.
- Sin filas desactualizadas conservadas junto a su corrección (columnas.md tiene varias).
- Cada regla dice QUÉ hacer/evitar y por qué en una línea — la anécdota se borra.
- Meta: los tres archivos juntos bajan de 88KB a ~30KB. No perder ninguna regla vigente.

### 2.2 CLAUDE.md sin @includes pesados
- Quitar `@.claude/docs/hooks.md`, `@.claude/docs/columnas.md`, `@.claude/docs/ui.md`
  (si están como @) y cualquier carga incondicional equivalente.
- Reemplazar por referencias condicionales: "vas a escribir un hook o query → leé
  `.claude/docs/hooks.md`", "vas a tocar UI → `.claude/docs/ui.md`", "antes de queries
  a una tabla → `.claude/docs/columnas.md` o `/supabase-check`".
- Inline en CLAUDE.md quedan SOLO las reglas críticas universales: guard `RESTAURANTE_ID`,
  3 clientes Supabase, proxy.ts no middleware, iconos Material Symbols, claves sb_publishable/sb_secret.

### 2.3 Podar PENDIENTES.md y ESTADO-ACTUAL.md
- Crear `HISTORIAL.md`: ahí va todo lo "✅ Resuelto", los planes completos y el preámbulo
  de planes cerrados. Nadie lo carga nunca; es archivo muerto consultable.
- PENDIENTES.md queda en <10KB: solo ítems abiertos, priorizados.
- ESTADO-ACTUAL.md: misma poda agresiva (hoy 155KB) — resumen por módulo en 1-3 líneas,
  el detalle histórico va a HISTORIAL.md.

### 2.4 Reescribir la skill `update-status`
Nueva conducta:
1. NO pregunta "¿qué cerramos?": lo deduce del historial de la sesión + `git log` desde
   el último commit `docs:`. Pregunta solo ante ambigüedad real.
2. PENDIENTES: BORRA lo resuelto (lo mueve a HISTORIAL.md). Nunca acumula.
3. `.claude/docs/`: REESCRIBE la regla existente si cambió; no apila entradas numeradas
   nuevas ni fechas.
4. Último paso obligatorio: escribir `SESION.md` (~10 líneas) con: qué se cerró hoy,
   qué quedó a medias, qué probar primero mañana, próximo paso concreto.

### 2.5 Plasmar el método de trabajo en CLAUDE.md
Agregar la sección "## Método de trabajo" (texto abajo, adaptar formato al archivo).

### 2.6 Commit + push de todo. Marcar "Sesión 2 ✅" en este archivo.

### Verificación de cierre de Sesión 2
- Sesión nueva de prueba: el contexto inicial ya no arrastra hooks/columnas/ui completos.
- `/update-status` corre sin preguntar y genera `SESION.md`.

---

## Método de trabajo (para pegar en CLAUDE.md en 2.5)

### Apertura
- Sesión nueva siempre. Primer mensaje: "Leé SESION.md. Seguimos con X" — o directo el
  pedido si es tema nuevo. Sin pedir "análisis de cómo venimos": eso ya está en SESION.md.

### Corte de sesión
- Una sesión = un tema, máximo un día. Cambio de tema dentro del día = cerrar y abrir.
- Nunca reabrir la sesión de ayer para "seguir": se cierra con /update-status y la nueva
  arranca de SESION.md.
- Sesión de solo preguntas (sin código): se abre, se pregunta, se abandona sin ritual.

### Modelos
- Opus/Fable solo para diseñar/planificar una feature grande. Antes de ejecutar:
  /model sonnet, siempre. Más de 1h ejecutando UI en Opus/Fable = error.

### Durante
- Feedback visual en batch: probar 10 min, anotar captura o lista de 4-5 puntos,
  UN mensaje. No gotear "agregalo"/"arreglalo" de a uno.
- Deploy: el agente commitea y pushea SIN preguntar al verificar cada cambio funcional,
  y avisa el estado. La pregunta "¿hiciste deploy?" no debe existir.
- Iteración de UI mobile: contra el dev server por LAN desde el celular. Deploy a prod
  = fin de bloque de trabajo, no por iteración.

### Cierre
- /update-status como último acto de toda sesión de código, sin excepción. Deduce solo,
  poda en vez de acumular, deja SESION.md — es lo único que compra la continuidad de mañana.
