# SKILL.md — KitchenOS

## Identidad del proyecto
KitchenOS es una app SaaS de gestión de cocina profesional para restaurantes argentinos. PWA mobile-first desplegada en Vercel. El dueño (Facundo) no es programador — él prueba en su celular y da feedback de bugs. Vos implementás todo end-to-end.

## Stack
- Next.js 16.2.0 (App Router, Turbopack) + React 19.2.4 + TypeScript 5
- Supabase (auth + PostgreSQL + realtime) — proyecto `clipcxcbtlibswfzsgzk`
- Tailwind CSS v4 con CSS variables
- Anthropic API: Claude Haiku 4.5 (texto simple) + Sonnet 4.6 (imágenes/OCR)
- jsPDF + jspdf-autotable (PDFs), xlsx (Excel import/export)
- Deploy: Vercel → https://kitchenos-three.vercel.app
- Auth: proxy.ts (NO middleware.ts — breaking change Next.js 16)

## Archivos de contexto obligatorios
Antes de hacer CUALQUIER cambio, leé estos 4 archivos en la raíz del proyecto:
1. `ESTADO-ACTUAL.md` — qué módulos existen, qué funciona, qué no, bugs pendientes
2. `ARQUITECTURA.md` — estructura de carpetas, hooks, API routes, tablas Supabase, auth flow, IA, convenciones
3. `PENDIENTES.md` — lista priorizada de todo lo que falta (bugs 🔴, seguridad 🟠, roadmap 🟡, futuro 🟢)
4. `DECISIONES.md` — 20 decisiones de producto con rationale (por qué se hizo así)

## Reglas CRÍTICAS — no romper

### Auth
- `proxy.ts` en la raíz reemplaza `middleware.ts` (Next.js 16 breaking change). NO crear middleware.ts.
- `AuthProvider` en `lib/auth/context.tsx` maneja sesión + perfil. Dos useEffect separados para evitar deadlock.
- `RouteGuard` en `components/shell/RouteGuard.tsx` muestra spinner mientras carga.
- Service role key SOLO en `lib/supabase/admin.ts`, SOLO importable desde API routes y scripts. NUNCA en el browser.
- Sign up crea: auth user → restaurante → user_restaurantes → equipo_miembros → rol_permisos seed (5 roles).

### Hooks — patrón obligatorio
```ts
import { createClient } from '@/lib/supabase/client'
import { useRestauranteId } from './useRestauranteId'

export function useXxx() {
  const RESTAURANTE_ID = useRestauranteId()
  const supabase = createClient()
  // SIEMPRE filtrar por RESTAURANTE_ID en todas las queries
  // SIEMPRE incluir RESTAURANTE_ID en las deps de useCallback
  // NUNCA hardcodear UUIDs
}
```

### Columnas de tablas — nombres que confunden
- `productos`: usa `stock_actual` (NO `cantidad`), `stock_minimo`, `precio_unitario`
- `tareas`: usa `status` (NO `completada`), `fecha_limite`, `completed_at`
- `recetas`: usa `status` ('published'|'draft'), `activa` (boolean soft-delete)
- Antes de escribir una query nueva, verificar columnas reales con Management API o leyendo el hook existente.

### UI/CSS
- CSS variables: `var(--navy)` #1c2d4a, `var(--accent)` #4361a0, `var(--bg)`, `var(--surface)`, `var(--border)`
- NO violetas/púrpuras. Solo azul navy y accent.
- NO emojis en UI. Usar Material Symbols Outlined.
- NO Chart.js. Gráficos con CSS divs (width porcentual + colores).
- Dark mode: true black (#0a0a0a bg, #141414 surface).
- Food cost colors: verde <30%, amarillo 30-35%, rojo >35%.
- Navbar flotante: ~72-76px de alto. FABs en `bottom: 100+`.
- Headers navy: `background: var(--navy), padding: 46px 16px 14px` (status bar iOS).

### Idioma
- Variables, tablas, hooks, funciones: español (`useRecetas`, `agregarReceta`, `plaza_asignada`)
- UI: español argentino ("Dale", "Listo", "¿Querés cerrar el turno?")
- Formatos: coma decimal (0,5 kg), fechas DD/MM/YYYY, precios en ARS, IVA argentino (21/10.5/27/0%), CUIT

### IA (Anthropic)
- Haiku (`claude-haiku-4-5-20251001`): texto simple, matcheo, categorización
- Sonnet (`claude-sonnet-4-6`): imágenes, OCR facturas, multi-import recetas, Kitchen Coach
- Todos los endpoints devuelven demo data cuando `ANTHROPIC_API_KEY` no está seteada
- Prompts piden JSON estricto con formato argentino

### Decisiones de producto que NO se cambian
- La app arranca VACÍA — sin mock data. Los datos de ejemplo son solo para testing.
- NO hay modo servicio/salón/POS — solo cocina.
- Proveedores se auto-crean desde facturas.
- Confirmación uno a uno (no bulk) para tareas/mise en place.
- Gráficos CSS, no Chart.js.
- Deploy directo a prod, sin staging.
- No agregar abstracciones hasta tener 3 usos concretos.

## Estructura de carpetas
```
app/(app)/          ← 20 rutas protegidas (dashboard + módulos)
app/(auth)/         ← login + register (públicas)
app/api/            ← coach, facturas, listas-precios, recetas/import, recetas/save
lib/auth/           ← AuthProvider context
lib/hooks/          ← 19 custom hooks (todos usan useRestauranteId)
lib/supabase/       ← client (browser), server (SSR), admin (service role)
components/         ← dashboard/, shell/, coach/, merma/, providers/
types/index.ts      ← Todos los tipos centralizados
proxy.ts            ← Auth middleware (Next 16)
```

## 28 tablas Supabase
Core: `restaurantes`, `user_restaurantes`, `rol_permisos`
Operación: `productos`, `proveedores`, `facturas`, `factura_items`, `precio_historial`, `pedidos`, `pedido_items`
Recetario: `recetas`, `ingredientes`, `carta_items`
Tareas: `tareas`, `checklist_secciones`, `checklist_items`, `checklist_registros`, `checklist_rutina`, `checklist_rutina_registros`
Comunicación: `pase_mensajes`
HACCP: `haccp_equipos`, `haccp_temperaturas`, `haccp_vencimientos`, `haccp_limpieza`, `haccp_limpieza_registros`
Calendario/Equipo: `eventos`, `equipo_miembros`, `turnos`, `puestos`
Producción: `platos_compuestos`, `plato_componentes`, `produccion_diaria`
Merma: `merma`

RLS: actualmente permisivo (USING true). Pendiente restringir por restaurante_id.

## 19 hooks
`useRestauranteId` (base), `usePermisos`, `useRecetas`, `useStock`, `useTareas`, `useFacturas`, `usePedidos`, `useProveedores`, `useCarta`, `useChecklist`, `usePase`, `useHaccp`, `useCalendario`, `useEquipo`, `useProduccion`, `useMerma`, `useReportes`, `useKitchenCoach`, `useDebounce`

## 6 API routes
- `/api/coach` — Kitchen Coach IA (Sonnet)
- `/api/facturas` — OCR facturas (Sonnet)
- `/api/listas-precios` — OCR listas de precios (Sonnet)
- `/api/recetas/import` — Importar recetas con IA (Haiku o Sonnet)
- `/api/recetas/save` — Guardar receta con service role (evita RLS)
- `/api/migrate` — Admin: correr migraciones

## Variables de entorno (.env.local)
```
NEXT_PUBLIC_SUPABASE_URL=https://clipcxcbtlibswfzsgzk.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>
SUPABASE_URL=https://clipcxcbtlibswfzsgzk.supabase.co
SUPABASE_MANAGEMENT_TOKEN=sbp_...
ANTHROPIC_API_KEY=sk-ant-...
```

## Bugs pendientes prioritarios
1. Facturas → Stock: productos no se crean/actualizan automáticamente al confirmar factura
2. Login producción: hard navigation muestra "??" hasta safety timer 3s
3. Merma → Stock: no descuenta stock_actual al registrar merma
4. RLS permisivo: todas las tablas con USING(true) — inseguro para multi-tenant
5. USUARIO_MOCK en usePase para nombre al enviar mensajes

## Roadmap activo
- Semana 1: ✅ Completada (RLS parcial, 69 fixes TypeScript, paginación, error handling)
- Semana 2: Planes $60/$99 + Stripe + feature gating
- Semana 3: Onboarding wizard + UX + Kitchen Coach mejoras
- Semana 4: Piloto real El Rescoldo
- Semana 5: Beta 5 restaurantes
- Semana 6: Lanzamiento público

## Cómo trabajar
1. Leer los 4 archivos .md de contexto ANTES de cualquier cambio
2. Verificar columnas reales de tablas antes de escribir queries
3. Probar con `npx next build` antes de deploy (0 errores TypeScript)
4. Deploy: `npx vercel --prod --yes`
5. Respuestas en español, concisas, con bullets: "1. Fix X. 2. Fix Y. 3. Deployado."
6. Cuando se cierre un bug, actualizar ESTADO-ACTUAL.md y PENDIENTES.md
7. NO crear abstracciones genéricas innecesarias
8. NO cambiar decisiones de producto sin consultar a Facundo
