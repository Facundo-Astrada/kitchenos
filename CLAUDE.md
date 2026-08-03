# CLAUDE.md — KitchenOS

@AGENTS.md

---

## Comandos

```bash
npm run dev          # dev server (Turbopack)
npm run build        # typecheck + compilación — correr siempre antes de deploy
npm run lint         # ESLint
git push             # deploy → GitHub (Facundo-Astrada/kitchenos, branch main) → Vercel auto
```

Si Vercel pide credenciales: `git push https://Facundo-Astrada:<PAT>@github.com/Facundo-Astrada/kitchenos.git main`

Tests: `npm test` (Vitest) · `npm run test:e2e` (Playwright, requiere dev server + `npx playwright install chromium`) · CI en GitHub Actions. Producción: https://kos-app-one.vercel.app | Credenciales test: `admin@elrescoldo.com / kitchenos2026`

---

## Stack

Next.js 16.2.0 (App Router) · React 19.2.4 · TypeScript · Tailwind v4 · Supabase · Vercel  
Auth: `proxy.ts` — **NO `middleware.ts`** (breaking en Next.js 16)  
IA: Claude Sonnet 4.6 + Haiku 4.5 · PDF: jsPDF · Excel: xlsx  
Iconos: `<span className="material-symbols-outlined">nombre</span>` — no emoji, no SVG custom  
Gráficos: CSS divs `width: X%` — **no Chart.js**

---

## Reglas críticas (leer siempre)

**Auth:** `useRestauranteId()` devuelve `''` mientras carga. Todos los hooks DEBEN saltear fetches cuando devuelve `''`.

**Supabase — 3 clientes distintos:**
- `lib/supabase/client.ts` → browser hooks (`'use client'`)
- `lib/supabase/server.ts` → Server Components / proxy.ts
- `lib/supabase/admin.ts` → **Solo API routes** — bypassea RLS, requiere `SUPABASE_SERVICE_ROLE_KEY`

**Claves Supabase:** `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `sb_publishable_...` | `SUPABASE_SERVICE_ROLE_KEY` = `sb_secret_...` — si están cruzadas, Supabase bloquea con "Forbidden use of secret API key in browser".

**RLS:** 44 tablas con `mi_restaurante_id()`.

---

## Docs condicionales — leer solo cuando el trabajo lo toca

No se cargan solos: abrirlos cuando la tarea entra en su tema.

| Vas a... | Leé |
|---|---|
| Escribir o tocar un hook, una query, patrón SWR/realtime, auth | `.claude/docs/hooks.md` |
| Tocar UI/CSS: layout, componentes canónicos, tema, boards | `.claude/docs/ui.md` |
| Escribir una query o migración contra una tabla existente | `.claude/docs/columnas.md` o `/supabase-check` |
| Aplicar o revisar políticas RLS | `.claude/docs/rls.md` |
| Tocar el flujo de importación (facturas, carta, stock) | `.claude/docs/importador.md` |

Endpoints clave de importación: `/api/importador/facturas-universal` · `/api/stock/rebuild` · `/api/recetas/auto-link-ingredientes`

---

## MCP Supabase

El server (`@supabase/mcp-server-supabase`) lee el token de la env var `SUPABASE_ACCESS_TOKEN` (no `SUPABASE_MANAGEMENT_TOKEN`) — verificar ese nombre en `mcpServers.supabase.env` si da `Unauthorized` con un token válido. Si sigue fallando, usar management API REST. Token en `.env.local` como `SUPABASE_MANAGEMENT_TOKEN`.

```bash
curl -X POST https://api.supabase.com/v1/projects/clipcxcbtlibswfzsgzk/database/query \
  -H "Authorization: Bearer $SUPABASE_MANAGEMENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"SELECT ..."}'
```

---

## Skills disponibles

| Skill | Cuándo usarla |
|---|---|
| `/new-module nombre` | Crear módulo nuevo (page + hook) |
| `/impacto símbolo` | Análisis de impacto antes de tocar código compartido (hook, helper, componente) — grafo local con graphify, sin tokens |
| `/coach-screen pantalla` | Integrar Kitchen Coach completo en una pantalla (contexto + targets + tour + suggestions + acciones) |
| `/supabase-check tabla` | Verificar columnas reales antes de queries |
| `/debug-error descripción` | Resolver errores (400, 42501, datos vacíos) |
| `/deploy` | Build + validación + deploy a Vercel |
| `/pr-review` | Revisar cambios antes de deployar |
| `/estimate feature` | Estimar esfuerzo de una feature |
| `/add-rls tabla` | Aplicar RLS multi-tenant correcto a una tabla |
| `/new-app nombre` | Scaffoldear proyecto nuevo (Antigravity) |
| `/create-skill nombre` | Crear skill nueva |
| `/update-status` | Cerrar sesión: actualizar PENDIENTES, ESTADO-ACTUAL y docs |

## Agentes disponibles

| Agente | Cuándo usarlo |
|---|---|
| `db-designer` | Diseñar tablas Supabase desde un brief |
| `ui-auditor` | Auditar UI contra convenciones visuales |
| `spec-to-code` | Convertir brief en plan + código |
| `migrator` | Scripts SQL seguros para cambios en DB |
| `bug-fixer` | Diagnosticar y corregir bugs (RLS, hooks, auth) |
| `rls-enforcer` | Aplicar RLS multi-tenant real a todas las tablas |

Invocar: `Usá el agente bug-fixer para esto: [descripción del bug]`

---

## Método de trabajo

**Apertura:** sesión nueva siempre. Primer mensaje: "Leé SESION.md. Seguimos con X" — o directo el pedido si es tema nuevo. Sin pedir "análisis de cómo venimos": eso ya está en `SESION.md`.

**Corte de sesión:** una sesión = un tema, máximo un día. Cambio de tema dentro del día = cerrar y abrir. Nunca reabrir la sesión de ayer para "seguir": se cierra con `/update-status` y la nueva arranca de `SESION.md`. Sesión de solo preguntas (sin código): se abre, se pregunta, se abandona sin ritual.

**Modelos:** Opus/Fable solo para diseñar/planificar una feature grande. Antes de ejecutar: `/model sonnet`, siempre. Más de 1h ejecutando UI en Opus/Fable es error.

**Durante:** feedback visual en batch — probar 10 min, anotar captura o lista de 4-5 puntos, un mensaje (no gotear "agregalo"/"arreglalo" de a uno). Deploy: commitear y pushear sin preguntar al verificar cada cambio funcional, avisando el estado — la pregunta "¿hiciste deploy?" no debe existir. Iteración de UI mobile: contra el dev server por LAN desde el celular; deploy a prod es fin de bloque de trabajo, no por iteración.

**Cierre:** `/update-status` como último acto de toda sesión de código, sin excepción. Deduce solo, poda en vez de acumular, deja `SESION.md` — es lo único que compra la continuidad de mañana.

---

## Contexto completo del proyecto

- `ARQUITECTURA.md` — schema 28 tablas, hooks, API routes
- `ESTADO-ACTUAL.md` — resumen de estado actual por módulo (1-3 líneas c/u)
- `PENDIENTES.md` — backlog priorizado, solo ítems abiertos
- `DECISIONES.md` — razones detrás de cada decisión
- `HISTORIAL.md` — archivo muerto: planes cerrados, changelog detallado, todo lo "✅ Resuelto". No se carga nunca, solo consulta manual.
- `SESION.md` — qué se cerró, qué quedó a medias, próximo paso concreto. Se lee al abrir una sesión nueva.
