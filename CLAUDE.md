# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

---

# KitchenOS — Instrucciones del proyecto

## Comandos

```bash
npm run dev          # dev server (Turbopack)
npm run build        # typecheck + compilación (siempre correr antes de deploy)
npm run lint         # ESLint
npx vercel --prod --yes   # deploy a producción
```

No hay tests. URL producción: https://kitchenos-three.vercel.app  
Credenciales test: `admin@elrescoldo.com / kitchenos2026`

---

## Stack

Next.js 16.2.0 (App Router) · React 19.2.4 · TypeScript · Tailwind v4 · Supabase · Vercel  
Auth: Supabase Auth vía `proxy.ts` — **NO `middleware.ts`** (breaking change Next.js 16)  
IA: Anthropic Claude Sonnet 4.6 + Haiku 4.5 · PDF: jsPDF + jspdf-autotable · Excel: xlsx  
Iconos: Material Symbols Outlined (`<span className="material-symbols-outlined">add</span>`) — no emoji, no SVG custom  
Gráficos: CSS divs con `width: X%` — **no Chart.js**

Ver `ARQUITECTURA.md` para el esquema completo de 28 tablas, lista de hooks, API routes e IA.

---

## Arquitectura — decisiones no obvias

### Auth (`lib/auth/context.tsx`)
`AuthProvider` tiene dos `useEffect` separados para evitar deadlock del cliente Supabase:
1. Solo setea `user` vía `onAuthStateChange` + `getSession()` fallback — sin queries DB.
2. Carga el perfil desde DB cuando `user` cambia: `user_restaurantes` (rol, restaurante_id) → `equipo_miembros` (nombre, plaza).

`useRestauranteId()` devuelve `''` mientras `loading=true` o sin perfil. Todos los hooks deben saltear fetches cuando devuelve `''`.

### Supabase clients — 3 instancias, usos distintos
| Archivo | Clave | Dónde usar |
|---|---|---|
| `lib/supabase/client.ts` | anon | Hooks del browser (`'use client'`) |
| `lib/supabase/server.ts` | anon + cookies | Server Components, `proxy.ts` |
| `lib/supabase/admin.ts` | service role | **Solo API routes y scripts** — bypassea RLS |

`createAdminClient()` requiere `SUPABASE_SERVICE_ROLE_KEY` (no `NEXT_PUBLIC_`).

### RLS — estado actual
Todas las tablas tienen `USING (true)` (permisivo). Excepciones donde se usa service role:
- `/api/recetas/save` — insertar recetas desde el browser, porque la anon key no tiene INSERT policy.

### `/api/recetas/save` — ruta crítica
Único endpoint con `createAdminClient()`. Tres modos:
- `{ receta, ingredientes }` → inserta receta + ingredientes en batch
- `{ receta }` → solo receta
- `{ addIngredientsOnly: true, ingredientes }` → suma ingredientes a receta existente

Llama desde `useRecetas.agregarReceta` (no directamente desde el browser).

---

## Patrón de hooks

```ts
export function useXxx() {
  const RESTAURANTE_ID = useRestauranteId()   // '' mientras carga
  const supabase = createClient()             // browser client
  const [items, setItems] = useState<T[]>([])
  const [loading, setLoading] = useState(true)

  const fetchXxx = useCallback(async () => {
    if (!RESTAURANTE_ID) return              // guard obligatorio
    // .eq('restaurante_id', RESTAURANTE_ID)
  }, [RESTAURANTE_ID])                       // RESTAURANTE_ID en deps — evita stale closure

  useEffect(() => { fetchXxx() }, [fetchXxx])
  // ...CRUD functions
}
```

Todos los hooks tienen `RESTAURANTE_ID` en los deps de `useCallback`. Omitirlo es un bug de stale closure.

---

## Columnas no intuitivas — verificar antes de escribir queries

| Tabla | Columna correcta | NO usar |
|---|---|---|
| `productos` | `stock_actual`, `stock_minimo`, `stock_critico` | `cantidad` |
| `productos` | `precio_unitario` | `precio` |
| `tareas` | `status` (`'pendiente'|'en_proceso'|'completada'`) | `completada` (bool) |
| `tareas` | `fecha_limite` | `fecha_vencimiento` |
| `recetas` | `activa` (bool, soft-delete), `status` (`'published'|'draft'`) | `deleted`, `activo` |
| `recetas` | `tiempo_min` (int) | `tiempo_minutos` |
| `ingredientes` | `producto_id` (FK), `costo_unitario`, `unidad_costo` | (sin FK = no link) |
| `turnos` | UNIQUE (`miembro_id`, `fecha`) — hacer upsert | insert directo |
| `facturas` | `condicion_pago` (`'contado'|'cuenta_corriente'`), `status` (`'pagada'|'pendiente'|'confirmada'|'observada'`) | — |
| `factura_items` | `producto_nombre` (text, no FK), `precio_unitario` por unidad | (sin link directo a productos) |

Para verificar columnas reales:
```bash
curl -X POST https://api.supabase.com/v1/projects/clipcxcbtlibswfzsgzk/database/query \
     -H "Authorization: Bearer $SUPABASE_MANAGEMENT_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"query":"SELECT column_name,data_type FROM information_schema.columns WHERE table_name='\''productos'\'' ORDER BY ordinal_position"}'
```

---

## UI / CSS

```
var(--navy)      #1c2d4a  — header primario
var(--accent)    #4361a0  — botones, énfasis
var(--bg)                 — background (light/dark)
var(--surface)            — cards, sheets
var(--border)             — separadores
var(--text-1/2/3)         — niveles de contraste
```

**Navy header estándar:** `background: 'var(--navy)', padding: '46px 16px 14px'` (46px para status bar iOS)

**FABs:** `BottomNav` ocupa ~76px desde abajo. FABs deben estar en `bottom: 100+` para no quedar tapados.

**Food cost colors:** `< 30%` verde, `30–35%` amarillo, `> 35%` rojo.

**Idioma UI:** español argentino (mis en place, recetario, mise, turno, etc.)

---

## Skills disponibles (comandos `/`)

Usar estas skills en lugar de escribir instrucciones desde cero:

| Skill | Cuándo usarla |
|---|---|
| `/new-module nombre` | Crear un módulo nuevo (page + hook) siguiendo el patrón KitchenOS |
| `/supabase-check tabla` | Verificar columnas reales antes de escribir queries |
| `/debug-error descripción` | Flujo sistemático para resolver errores (400, 42501, datos que no cargan) |
| `/deploy` | Build + validación + deploy a Vercel en un solo paso |
| `/pr-review` | Revisar cambios contra las convenciones del proyecto antes de deployar |
| `/estimate feature` | Estimar esfuerzo de una feature (para presupuestar con cliente) |
| `/new-app nombre` | Scaffoldear un proyecto nuevo desde cero (Antigravity) |
| `/create-skill nombre` | Crear una skill nueva para automatizar un proceso repetitivo |

## Agentes disponibles

Agentes especializados que corren en su propio contexto (no consumen el contexto principal):

| Agente | Cuándo usarlo |
|---|---|
| `db-designer` | Diseñar tablas Supabase desde un brief de producto |
| `ui-auditor` | Auditar UI contra convenciones visuales antes de mostrar al cliente |
| `spec-to-code` | Convertir un brief de cliente en plan + código completo |
| `migrator` | Generar scripts SQL seguros para cambios en la DB |

Para invocar un agente: `Usá el agente spec-to-code para esto: [descripción]`

---

## Flujo de importación de datos (mayo 2026)

### Endpoints
| Path | Función |
|---|---|
| `/api/importador/facturas-universal` | **Punto de entrada universal**. Detecta Fudo (Gastos+Detalle) → ruta rápida sin IA. Caso contrario → IA Sonnet mapea columnas. Modos `detect`/`apply`. Inspecciona TODAS las hojas del XLSX y elige la mejor por score. |
| `/api/importador/facturas-fudo` | Legacy Fudo específico (columnas exactas). El universal lo deprecia. |
| `/api/importador/productos-desde-facturas` | Auto-crea productos en stock desde `factura_items`. Agrupa por nombre normalizado, usa precio más reciente, infiere categoría (rules + Haiku paralelo en apply, solo rules en preview). Crea proveedores faltantes. |
| `/api/stock/rebuild` | Borra productos del restaurante → llama `productos-desde-facturas` apply → llama `auto-link-ingredientes`. Falla seguro si no hay facturas. |
| `/api/recetas/auto-link-ingredientes` | Fuzzy match: ingredientes sin `producto_id` ↔ productos. Niveles `exacto`/`parcial`/`fuzzy`. Bug del JOIN PostgREST arreglado: ahora hace 2 queries (recetas → ingredientes con `.in('receta_id', ids)`). |
| `/api/stock/sync-precio` | Cuando se cambia precio en stock, propaga a `ingredientes.costo_unitario` de los vinculados. |

### Componentes UI
- `components/facturas/ExcelPOSImportModal.tsx` — XLSX/CSV de cualquier POS (Fudo, Maxirest, Bistrosoft, etc). Muestra hojas analizadas + mapeo IA.
- `components/facturas/BulkUploadDrawer.tsx` — Drag&drop multi-archivo (PDF/imagen) con OCR en serie.
- `app/(app)/onboarding/page.tsx` — Wizard 5 pasos para usuarios nuevos. Triggered desde `app/(app)/page.tsx` cuando productos+facturas+recetas todos en 0.

### Estrategia "rebuild stock"
1. Sin facturas → onboarding wizard
2. Con facturas pero stock incompleto → banner CTA "Reconstruir" en `/stock`
3. Click → preview rápido (sin IA) → confirm → borra productos + recrea desde facturas + auto-link ingredientes

### Para cargar datos por scripts (no via UI)
- Patrón: `scripts/load-recetas-2026.mjs` usa `createClient` de `@supabase/supabase-js` con `SUPABASE_SERVICE_ROLE_KEY`.
- Pattern útil para bulk operations fuera de la app.

## MCP Supabase intermitente
A veces el MCP de Supabase devuelve `Unauthorized`. Fallback: REST API con service role key (ver `scripts/*.mjs`).
Token de management en `.env.local`: `SUPABASE_MANAGEMENT_TOKEN` (úsalo para query directa con `curl` a `api.supabase.com/v1/projects/.../database/query`).

---

## Contexto del proyecto

Ver `ESTADO-ACTUAL.md` — lista completa de módulos, bugs conocidos y deuda técnica.  
Ver `PENDIENTES.md` — backlog priorizado.  
Ver `DECISIONES.md` — razones detrás de decisiones de arquitectura.
