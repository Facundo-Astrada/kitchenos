<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# Agentes disponibles — KitchenOS

Los agentes viven en `.claude/agents/` y corren en su propio contexto (no consumen el contexto principal).

| Agente | Descripción rápida | Cuándo usarlo |
|---|---|---|
| `db-designer` | Diseña schema Supabase (tablas, columnas, RLS) desde un brief | Feature nueva que necesita tablas |
| `ui-auditor` | Audita UI contra convenciones visuales (navy header, CSS vars, iconos, FABs) | Antes de mostrar pantallas al cliente |
| `spec-to-code` | Convierte brief de cliente en plan de código + implementación | Cuando el cliente pide algo nuevo |
| `migrator` | Genera scripts SQL seguros para cambios en el schema | Cambios en tablas existentes |
| `bug-fixer` | Diagnostica y corrige bugs (RLS, hooks, auth, columnas, sync) | Hay algo que no funciona |
| `rls-enforcer` | Aplica RLS multi-tenant real a todas las tablas (reemplaza USING true) | Antes de lanzar a multi-tenant real |

Para invocar desde el chat: `Usá el agente [nombre] para esto: [descripción]`
