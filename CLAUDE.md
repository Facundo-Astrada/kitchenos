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

**Auth:** `useRestauranteId()` devuelve `''` mientras carga. Todos los hooks DEBEN saltear fetches cuando devuelve `''`. Ver patrón completo: @.claude/docs/hooks.md

**Supabase — 3 clientes distintos:**
- `lib/supabase/client.ts` → browser hooks (`'use client'`)
- `lib/supabase/server.ts` → Server Components / proxy.ts
- `lib/supabase/admin.ts` → **Solo API routes** — bypassea RLS, requiere `SUPABASE_SERVICE_ROLE_KEY`

**Claves Supabase (mayo 2026):** `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `sb_publishable_...` | `SUPABASE_SERVICE_ROLE_KEY` = `sb_secret_...` — si están cruzadas, Supabase bloquea con "Forbidden use of secret API key in browser".

**RLS:** 44 tablas con `mi_restaurante_id()`. Ver políticas completas: @.claude/docs/rls.md

**Columnas no intuitivas:** siempre verificar antes de escribir queries → @.claude/docs/columnas.md

**UI / CSS:** vars, navy header, FABs → @.claude/docs/ui.md

---

## Flujo de importación de datos

Ver detalle completo: @.claude/docs/importador.md

Endpoints clave: `/api/importador/facturas-universal` · `/api/stock/rebuild` · `/api/recetas/auto-link-ingredientes`

---

## MCP Supabase

Si devuelve `Unauthorized`, usar management API REST. Token en `.env.local` como `SUPABASE_MANAGEMENT_TOKEN`.

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

## Contexto completo del proyecto

- `ARQUITECTURA.md` — schema 28 tablas, hooks, API routes
- `ESTADO-ACTUAL.md` — módulos y estado
- `PENDIENTES.md` — backlog priorizado
- `DECISIONES.md` — razones detrás de cada decisión
