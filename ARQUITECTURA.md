# KitchenOS — Arquitectura Técnica

**Stack:** Next.js 16.2.0 · React 19.2.4 · TypeScript 5 · Supabase · Tailwind v4 · Vercel
**Idioma UI:** Español argentino.
**Target:** Mobile-first (Facundo prueba en celular). Desktop funciona pero no es prioridad.

---

## 1. Estructura de carpetas

```
kitchenos/
├── app/
│   ├── (app)/                    # Rutas protegidas (requieren auth)
│   │   ├── layout.tsx            # Shell: AuthProvider, BottomNav, MoreMenu, KitchenCoachFAB
│   │   ├── page.tsx              # Dashboard /
│   │   ├── calendario/page.tsx
│   │   ├── carta/page.tsx
│   │   ├── checklist/page.tsx    # Mise en place
│   │   ├── configuracion/page.tsx
│   │   ├── facturas/page.tsx
│   │   ├── haccp/page.tsx
│   │   ├── merma/page.tsx
│   │   ├── pase/page.tsx
│   │   ├── pedidos/page.tsx
│   │   ├── perfil/page.tsx
│   │   ├── produccion/page.tsx
│   │   ├── proveedores/page.tsx
│   │   ├── recetario/
│   │   │   ├── page.tsx          # Lista
│   │   │   └── [id]/page.tsx     # Detalle
│   │   ├── reportes/page.tsx
│   │   ├── stock/page.tsx
│   │   ├── tareas/page.tsx
│   │   └── turnos/page.tsx
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── register/page.tsx
│   └── api/
│       ├── coach/route.ts        # Kitchen Coach IA
│       ├── facturas/route.ts     # OCR facturas con IA
│       ├── listas-precios/route.ts  # OCR listas de precios
│       ├── migrate/route.ts      # Admin: correr migraciones
│       └── recetas/
│           ├── import/route.ts   # Importar recetas con IA
│           └── save/route.ts     # Guardar receta (service role, evita RLS)
├── lib/
│   ├── auth/
│   │   └── context.tsx           # AuthProvider + useAuth hook
│   ├── hooks/                    # 19 custom hooks
│   │   ├── useCalendario.ts
│   │   ├── useCarta.ts
│   │   ├── useChecklist.ts
│   │   ├── useDebounce.ts
│   │   ├── useEquipo.ts
│   │   ├── useFacturas.ts
│   │   ├── useHaccp.ts
│   │   ├── useKitchenCoach.ts
│   │   ├── useMerma.ts
│   │   ├── usePase.ts
│   │   ├── usePedidos.ts
│   │   ├── usePermisos.ts
│   │   ├── useProduccion.ts
│   │   ├── useProveedores.ts
│   │   ├── useRecetas.ts
│   │   ├── useReportes.ts
│   │   ├── useRestauranteId.ts
│   │   ├── useStock.ts
│   │   └── useTareas.ts
│   ├── supabase/
│   │   ├── client.ts             # Browser client (anon key) - @supabase/ssr
│   │   ├── server.ts             # SSR client para server components
│   │   └── admin.ts              # Service role client (server-only, bypassea RLS)
│   ├── constants.ts              # ROLES, PLAZAS, MODULOS, BOTTOM_NAV
│   └── utils.ts                  # cn() helper (clsx + tailwind-merge)
├── components/
│   ├── coach/
│   │   └── KitchenCoachFAB.tsx   # Chat flotante del asistente IA
│   ├── dashboard/
│   │   ├── DashboardHeader.tsx   # Avatar + KPIs (3/12) + botones tema/notifs
│   │   ├── MiPlaza.tsx           # Widget mise en place de la plaza del user
│   │   ├── ModoServicio.tsx      # UI sin datos reales (parcial)
│   │   ├── ModulosGrid.tsx       # Grilla de accesos filtrada por rol
│   │   ├── PasePreview.tsx       # Últimos mensajes del pase
│   │   ├── StockCriticoSection.tsx
│   │   └── WelcomeDashboard.tsx  # 5 pasos guiados para restaurantes nuevos
│   ├── merma/
│   │   └── MermaBottomSheet.tsx
│   ├── providers/
│   │   └── ThemeProvider.tsx     # dark/light mode
│   └── shell/
│       ├── ActionButton.tsx
│       ├── BottomNav.tsx         # Navbar flotante (INICIO/TAREAS/RECETARIO/STOCK/MÁS)
│       ├── Header.tsx
│       ├── MoreMenu.tsx          # Menú "MÁS" con módulos secundarios
│       ├── PageHeader.tsx
│       └── RouteGuard.tsx        # Spinner mientras loading=true, lock screen si no hay perfil
├── types/
│   └── index.ts                  # Todos los tipos/interfaces (Rol, Producto, Receta, Tarea…)
├── scripts/                      # Migraciones y seeds (*.mjs via pg o Management API)
│   ├── migrate.mjs
│   ├── migrate-carta.mjs
│   ├── migrate-checklist.mjs
│   ├── migrate-checklist-v2.mjs
│   ├── migrate-facturas.mjs
│   ├── migrate-final.mjs
│   ├── migrate-haccp.mjs
│   ├── migrate-pase.mjs
│   ├── migrate-pedidos.mjs
│   ├── migrate-s4s5.mjs
│   ├── create-test-user.mjs
│   ├── seed.mjs
│   ├── seed-data.mjs
│   ├── diagnose.mjs
│   ├── gen-reporte.cjs
│   └── verify-e2e.mjs
├── proxy.ts                      # Auth middleware (Next 16 renombrado de middleware.ts)
├── package.json
├── tsconfig.json
├── next.config.ts
├── tailwind.config.ts
├── .env.local                    # Secrets (NO commitear)
├── .env.local.example
├── CLAUDE.md                     # Instrucciones para Claude Code (este proyecto)
├── AGENTS.md                     # Recordatorio: Next 16 tiene breaking changes
├── README.md
├── ESTADO-ACTUAL.md
├── ARQUITECTURA.md               # Este archivo
├── PENDIENTES.md
└── DECISIONES.md
```

---

## 2. Hooks (19)

Todos los hooks del cliente siguen el mismo patrón:

```ts
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRestauranteId } from './useRestauranteId'

export function useXxx() {
  const RESTAURANTE_ID = useRestauranteId()
  const supabase = createClient()
  const [items, setItems] = useState<T[]>([])
  const [loading, setLoading] = useState(true)

  const fetchXxx = useCallback(async () => { /* select + setItems */ }, [])
  useEffect(() => { fetchXxx() }, [fetchXxx])

  // CRUD
  async function agregar() { /* insert + refetch */ }
  async function actualizar() { /* update + refetch */ }
  async function eliminar() { /* delete o soft-delete + refetch */ }

  return { items, loading, agregar, actualizar, eliminar, refetch: fetchXxx }
}
```

| Hook | Qué hace | Tabla(s) |
|---|---|---|
| `useRestauranteId` | Lee `restaurante_id` del `AuthProvider` con fallback al UUID mock. Base de todos los demás hooks. | — |
| `usePermisos` | Lee `rol_permisos` del restaurante actual y expone flags (`puedeEscribirStock`, `puedeEditarRecetas`, `puedeEliminar`, `modulosVisibles`). | `rol_permisos` |
| `useDebounce` | Utilidad — no es dominio. | — |
| `useRecetas` | CRUD de recetas + ingredientes. `calcFoodCost()` exportado. Paginación (`PAGE_SIZE=20`). **`agregarReceta` y `agregarIngrediente` van vía `/api/recetas/save` (service role) para evitar RLS**. Realtime sub a recetas + ingredientes. | `recetas`, `ingredientes` |
| `useStock` | CRUD productos, cálculo de estado (ok/bajo/crítico). Usa columnas `stock_actual`, `stock_minimo`, `stock_critico`, `precio_unitario`. | `productos` |
| `useTareas` | CRUD tareas con prioridad/plaza/checklist. `status` (NO `completada`), `fecha_limite`. Realtime. | `tareas` |
| `useChecklist` | Secciones, items, registros y rutinas de mise en place por plaza. | `checklist_secciones`, `checklist_items`, `checklist_registros`, `checklist_rutina`, `checklist_rutina_registros` |
| `useProveedores` | CRUD proveedores. Auto-creación desde facturas (si no existe, crea). | `proveedores` |
| `useFacturas` | CRUD facturas y items. Integra con OCR IA (`/api/facturas`). Actualiza `precio_historial`. | `facturas`, `factura_items`, `precio_historial` |
| `usePedidos` | CRUD pedidos, items, estados, recepción parcial, WhatsApp/PDF. | `pedidos`, `pedido_items` |
| `useCarta` | CRUD carta, vínculo a receta, food cost preview, 86. | `carta_items` |
| `usePase` | Mensajes del pase, realtime, filtros por turno/plaza/prioridad. Envío aún usa `USUARIO_MOCK` para `usuario_nombre` (ver PENDIENTES). | `pase_mensajes` |
| `useHaccp` | 3 sub-módulos: temperaturas (con bulk), vencimientos, limpieza. Bulk insert + export PDF. | `haccp_equipos`, `haccp_temperaturas`, `haccp_vencimientos`, `haccp_limpieza`, `haccp_limpieza_registros` |
| `useReportes` | Agrega datos de facturas, recetas, stock, producción para CMV y gráficos. No escribe; solo queries read-only. | (varias) |
| `useCalendario` | CRUD eventos, auto-genera eventos desde pedidos (fecha_entrega_esperada), vista mensual + semanal. | `eventos` |
| `useEquipo` | CRUD miembros, upsert turnos (unique por miembro+fecha), CRUD puestos. | `equipo_miembros`, `turnos`, `puestos` |
| `useProduccion` | Planilla del día, asignación por miembro, platos compuestos y componentes. | `platos_compuestos`, `plato_componentes`, `produccion_diaria` |
| `useMerma` | Registro de merma con motivo/plaza/turno/costo. Integra con `/merma` módulo y MermaBottomSheet. | `merma` |
| `useKitchenCoach` | Cliente del endpoint `/api/coach`. Envía messages + contexto (stock crítico, vencimientos, food cost). | — |

---

## 3. API Routes

Todas son `POST` salvo donde se indique. Corren en el runtime de Node.js (no edge) porque algunas usan el service role key y llaman al Anthropic API.

| Ruta | Método | Qué hace |
|---|---|---|
| `/api/coach` | POST | Proxy a Claude Sonnet 4.6. Recibe `messages[]` + `context` (stockCritico, vencimientos, foodCost, usuario, rol, restaurante). Usa el `ANTHROPIC_API_KEY`. Arma system prompt con el contexto y devuelve `content`. |
| `/api/facturas` | POST | OCR de factura con Claude Sonnet 4.6. Recibe imagen (base64) o texto. Extrae `{proveedor_nombre, proveedor_cuit, fecha, tipo_factura, items[], subtotal, iva_total, total}`. Tiene demo result cuando no hay API key. |
| `/api/listas-precios` | POST | OCR de lista de precios de proveedor. Claude Sonnet 4.6. Devuelve `items[]` con nombre, precio, unidad, cantidad_envase. |
| `/api/recetas/import` | POST | Importación de receta con IA. Acepta `mode: 'camera' | 'gallery' | 'file' | 'audio' | 'text' | 'glink' | 'multi'`. **Haiku (`claude-haiku-4-5-20251001`)** para texto simple, **Sonnet (`claude-sonnet-4-6`)** para imágenes y multi-import. También soporta `adjust` (ajustes sobre resultado previo, Haiku). Devuelve `{recetas}[]` para multi o resultado único. |
| `/api/recetas/save` | POST | **Crítico** — Usa `createAdminClient()` (service role) para insertar receta + ingredientes bypasseando RLS. Tres modos: (a) receta + ingredientes batch, (b) `addIngredientsOnly=true` para sumar ingredientes a receta existente, (c) solo receta. Llamado desde `useRecetas.agregarReceta`. |
| `/api/migrate` | POST | Admin utility — corre migraciones SQL via service role. No para uso frontend. |

---

## 4. Supabase — 28 tablas

URL: `https://clipcxcbtlibswfzsgzk.supabase.co`. Management API: `https://api.supabase.com/v1/projects/clipcxcbtlibswfzsgzk/database/query` (para inspeccionar columnas antes de escribir queries — ver §Convenciones).

### Core
```sql
restaurantes        (id uuid PK, nombre, ciudad, configuracion jsonb, created_at)
user_restaurantes   (id uuid PK, user_id uuid FK auth.users, restaurante_id FK, rol, created_at)
rol_permisos        (id, restaurante_id FK, rol, modulos_visibles text[],
                     puede_editar_stock/recetas/carta/equipo/eliminar bool,
                     created_at, updated_at)
```

### Productos / Inventario
```sql
productos           (id, nombre, categoria, unidad,
                     stock_actual numeric, stock_minimo numeric, stock_critico numeric,  ← OJO: NO "cantidad"
                     precio_unitario numeric, proveedor_id FK,
                     restaurante_id FK, activo, created_at, updated_at)
```

### Proveedores / Compras
```sql
proveedores         (id, nombre, telefono, rubro, dias_entrega text[], activo, restaurante_id, created_at, updated_at)
facturas            (id, restaurante_id, proveedor_nombre, proveedor_cuit,
                     numero_factura, tipo_factura, fecha_factura date, fecha_carga,
                     condicion_pago, subtotal, iva_total, total numeric,
                     imagen_url, status, notas, usuario_id, created_at)
factura_items       (id, factura_id FK, producto_nombre, producto_id FK,
                     cantidad, unidad, precio_unitario, alicuota_iva,
                     subtotal, precio_anterior, created_at)
precio_historial    (id, producto_id FK, precio_anterior, precio_nuevo,
                     variacion_porcentaje, factura_id FK, fecha, restaurante_id)
pedidos             (id, proveedor_id FK, proveedor_nombre, fecha_pedido date,
                     fecha_entrega_esperada date, status, notas,
                     total_estimado, usuario_id, restaurante_id, created_at)
pedido_items        (id, pedido_id FK, producto_nombre, producto_id FK,
                     cantidad, unidad, precio_estimado,
                     cantidad_recibida, recibido bool)
```

### Recetario y Carta
```sql
recetas             (id, nombre, categoria, porciones, tiempo_min,
                     precio_venta numeric, procedimiento text,
                     status text DEFAULT 'published',   -- 'published' | 'draft'
                     activa bool DEFAULT true,
                     restaurante_id FK, created_at, updated_at)
ingredientes        (id, receta_id FK, nombre, cantidad numeric, unidad,
                     costo_unitario numeric, unidad_costo, created_at)
carta_items         (id, nombre, descripcion, precio_venta numeric, categoria,
                     receta_id FK, disponible bool, foto_url, orden,
                     restaurante_id FK, created_at)
```

### Tareas y Checklist
```sql
tareas              (id, titulo, descripcion,
                     status text,                     -- 'pendiente' | 'en_proceso' | 'completada' — NO "completada"
                     prioridad, categoria, plaza, asignado_a, creado_por,
                     fecha_limite timestamptz,        -- NO "fecha_vencimiento"
                     tiempo_estimado_min, receta_id FK,
                     checklist jsonb, completed_at,
                     restaurante_id FK, created_at)
checklist_secciones        (id, nombre, icono, plaza, orden, restaurante_id, created_at)
checklist_items            (id, plaza, seccion, seccion_id FK, nombre,
                            cantidad, unidad, prioridad (sp/p/ref/chk),
                            ubicacion, receta_id FK, orden,
                            restaurante_id, created_at)
checklist_registros        (id, checklist_item_id FK, fecha date, turno,
                            completado bool, cantidad_actual, usuario_id, hora_completado)
checklist_rutina           (id, nombre, frecuencia (diaria/semanal/quincenal/mensual),
                            plaza, ultima_vez, orden, restaurante_id, created_at)
checklist_rutina_registros (id, rutina_id FK, fecha, completado, usuario_id)
```

### Comunicación
```sql
pase_mensajes       (id, texto, tipo, prioridad, plaza,
                     turno_fecha date, turno_tipo (almuerzo/cena/noche),
                     usuario_id, usuario_nombre, leido_por jsonb,
                     restaurante_id, created_at)
```

### HACCP
```sql
haccp_equipos              (id, nombre, tipo, ubicacion, plaza,
                            temp_min, temp_max, activo, restaurante_id, created_at)
haccp_temperaturas         (id, equipo_id FK, temperatura, dentro_rango bool,
                            observacion, accion_correctiva, usuario_id, restaurante_id, created_at)
haccp_vencimientos         (id, producto_nombre, producto_id FK, lote,
                            fecha_apertura, fecha_vencimiento date,
                            ubicacion, status, usuario_id, restaurante_id, created_at)
haccp_limpieza             (id, tarea_limpieza, area, frecuencia,
                            usuario_id, ultimo_registro, restaurante_id, created_at)
haccp_limpieza_registros   (id, limpieza_id FK, fecha, completado, usuario_id, observacion, created_at)
```

### Calendario y Equipo
```sql
eventos             (id, titulo, descripcion, tipo (proveedor/reserva/stock/reunion/otro),
                     fecha_inicio, fecha_fin, hora_inicio, hora_fin, color,
                     recurrente bool, frecuencia, proveedor_id FK,
                     usuario_id, restaurante_id, created_at)
equipo_miembros     (id, auth_user_id FK auth.users, nombre, apellido, rol,
                     puesto_id FK, plaza_asignada, telefono, email,
                     fecha_ingreso date, activo, foto_url,
                     restaurante_id, created_at)
turnos              (id, miembro_id FK, fecha date, turno_tipo,   -- UNIQUE (miembro_id, fecha)
                     hora_entrada, hora_salida, notas, restaurante_id, created_at)
puestos             (id, nombre, descripcion, tareas_funciones,
                     permisos_app text[], restaurante_id, created_at)
```

### Producción
```sql
platos_compuestos   (id, nombre, categoria, descripcion, foto_url,
                     carta_item_id FK, orden, activo,
                     restaurante_id, created_at, updated_at)
plato_componentes   (id, plato_compuesto_id FK, nombre, receta_id FK,
                     notas_produccion, orden, created_at)
produccion_diaria   (id, fecha date, plato_compuesto_id FK, componente_id FK,
                     status (pendiente/en_proceso/listo), cantidad,
                     usuario_asignado, notas, restaurante_id, created_at, updated_at)
```

### Merma
```sql
merma               (id, producto_nombre, producto_id FK, cantidad, unidad,
                     motivo (vencimiento/error_coccion/mala_recepcion/...),
                     motivo_detalle, plaza, usuario_id, usuario_nombre,
                     fecha date, turno (apertura/servicio/cierre),
                     costo_estimado, restaurante_id, created_at)
```

### Relaciones clave
- Todo `restaurante_id` → `restaurantes.id`.
- `user_restaurantes.user_id` → `auth.users.id` (Supabase Auth).
- `equipo_miembros.auth_user_id` → `auth.users.id` (opcional, para login).
- `ingredientes.receta_id` → `recetas.id`.
- `carta_items.receta_id` → `recetas.id`.
- `factura_items.factura_id` → `facturas.id`; `factura_items.producto_id` → `productos.id`.
- `pedido_items.pedido_id` → `pedidos.id`; `pedido_items.producto_id` → `productos.id`.
- `checklist_items.seccion_id` → `checklist_secciones.id`; opcionalmente `.receta_id` → `recetas.id`.
- `turnos.miembro_id` → `equipo_miembros.id`; UNIQUE (miembro_id, fecha).
- `equipo_miembros.puesto_id` → `puestos.id`.
- `plato_componentes.plato_compuesto_id` → `platos_compuestos.id`; `.receta_id` → `recetas.id`.

### RLS
Todas las tablas tienen RLS habilitado. **Las políticas actuales son permisivas (`USING (true)`)** para desarrollo. Antes de producción multi-tenant real hay que cambiarlas a:
```sql
USING (restaurante_id IN (
  SELECT restaurante_id FROM user_restaurantes WHERE user_id = auth.uid()
))
```
Mientras tanto, operaciones sensibles (como crear recetas desde el cliente con anon key) van por API routes que usan service role (ver `/api/recetas/save`).

---

## 5. Autenticación

### Flujo
1. **`proxy.ts`** (raíz del proyecto, reemplaza `middleware.ts` por breaking change en Next.js 16) intercepta cada request. Crea un `createServerClient` de `@supabase/ssr`, lee cookies, llama a `supabase.auth.getUser()`. Si no hay sesión y la ruta no es pública (`/login`, `/register`, `/api/*`), redirige a `/login`. Si hay sesión y estás en `/login` o `/register`, redirige a `/`.
2. **`AuthProvider`** (`lib/auth/context.tsx`) se monta en `(app)/layout.tsx` y wrappea toda la app protegida. Dos `useEffect`:
   - El primero escucha `supabase.auth.onAuthStateChange` y también hace `getSession()` inicial como fallback. Solo setea `user`, no hace queries DB (para evitar deadlocks del cliente Supabase).
   - El segundo dispara cuando `user` cambia y carga el perfil: `SELECT rol, restaurante_id FROM user_restaurantes WHERE user_id = u.id`, luego `SELECT nombre, apellido, plaza_asignada FROM equipo_miembros WHERE auth_user_id = u.id`. Mapea a `PerfilAuth` con `initials`, `color` (derivado hash del UUID), `rol` (via `mapRol()`).
3. **`RouteGuard`** (`components/shell/RouteGuard.tsx`) muestra spinner si `loading=true`, lock screen si no hay perfil, y children si todo OK.

### Roles (DB → app)
El mapeo DB→app en `mapRol()` existe porque los roles legacy en DB no matchean uno-a-uno con los roles de UI:
| DB rol | App `Rol` type |
|---|---|
| `admin` | `admin` |
| `sous_chef` | `chef` |
| `cocinero` | `parrilla` / `frios` / `calientes` / `pase` / `pasteleria` / `panaderia` / `linea` (según `plaza_asignada`) |
| `bachero` | `ayudante` |
| `compras` | `admin` (mapeo especial — usuario de compras tiene acceso admin-like pero a subset de módulos) |

### Sign up
`signUp(email, password, restauranteName, nombre?, apellido?)` hace 5 pasos en secuencia:
1. `supabase.auth.signUp` → crea auth user.
2. Genera `restauranteId` con `crypto.randomUUID()` y hace `INSERT INTO restaurantes`.
3. `INSERT INTO user_restaurantes (user_id, restaurante_id, rol='admin')`.
4. `INSERT INTO equipo_miembros (nombre, apellido, rol='admin', auth_user_id, restaurante_id, activo=true)`.
5. Seed de 5 filas en `rol_permisos` (admin, sous_chef, cocinero, bachero, compras) con el set de módulos visibles y flags de permiso correspondientes.

Luego setea `perfil` directamente en el context para evitar que `loadPerfil` quede atrapado en la race condition de "onAuthStateChange disparó antes de que existan las filas".

### Sign out
`supabase.auth.signOut()` + `window.location.href = '/login'` para forzar full reload y limpiar la cookie server-side.

---

## 6. IA (Anthropic)

### Modelos usados
| Caso | Modelo | Por qué |
|---|---|---|
| Kitchen Coach chat | `claude-sonnet-4-6` | Necesita razonar con contexto estructurado del restaurante. |
| OCR facturas | `claude-sonnet-4-6` | Imágenes + extracción estructurada compleja (items + IVA + total). |
| OCR listas de precios | `claude-sonnet-4-6` | Ídem — imágenes y muchos productos. |
| Importar receta — texto simple | `claude-haiku-4-5-20251001` | Haiku alcanza y es barato/rápido. |
| Importar receta — imagen/foto/PDF | `claude-sonnet-4-6` | Visión multimodal, mejores resultados. |
| Importar receta — ajustes sobre resultado | `claude-haiku-4-5-20251001` | Es transformación text-in / text-out. |
| Multi-import (archivo con varias recetas) | `claude-sonnet-4-6` | Necesita parsing robusto de documento largo. |

### Prompts clave
- **Coach** (`/api/coach/route.ts`): system prompt con contexto inyectado — usuario, rol, restaurante, stock crítico, vencimientos próximos, food cost por receta. "Respondé de forma concisa y práctica."
- **Recetas import** (`/api/recetas/import/route.ts`): devuelve JSON estricto con `nombre_sugerido, categoria_sugerida, porciones, tiempo_minutos, ingredientes[], procedimiento[]`. Reglas: comas decimales (formato argentino), unidades `kg|g|l|ml|u`. Multi-import usa `{recetas: [...]}`. Hay `getDemoResult()` de fallback cuando no hay créditos.
- **Facturas** (`/api/facturas/route.ts`): extrae `{proveedor_nombre, proveedor_cuit, fecha_factura, tipo_factura, numero_factura, condicion_pago, items[], subtotal, iva_total, total, notas}`. Montos en ARS sin símbolo. Normaliza nombres ("LOMO VETADO X KG" → "Lomo vetado"). Alícuotas `21 | 10.5 | 27 | 0`.
- **Listas de precios** (`/api/listas-precios/route.ts`): extrae `{items: [{producto_nombre, precio_unitario, unidad, cantidad_envase, observaciones}], moneda, fecha_detectada, notas}`.

Todos los endpoints devuelven demo data cuando `ANTHROPIC_API_KEY` no está seteada, para poder testear la UI sin consumir créditos.

---

## 7. Variables de entorno

`.env.local` (no se commitea):
```bash
# Supabase — proyecto clipcxcbtlibswfzsgzk
NEXT_PUBLIC_SUPABASE_URL=https://clipcxcbtlibswfzsgzk.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>        # usado por browser client
SUPABASE_SERVICE_ROLE_KEY=<service role key>     # server-only, bypassea RLS
SUPABASE_URL=https://clipcxcbtlibswfzsgzk.supabase.co
SUPABASE_MANAGEMENT_TOKEN=sbp_...                # para migraciones via Management API

# IA
ANTHROPIC_API_KEY=sk-ant-...                     # Claude Sonnet 4.6 + Haiku 4.5
OPENAI_API_KEY=sk-...                            # reservado, no se usa actualmente
```

**Reglas:**
- `NEXT_PUBLIC_*` se inyecta al bundle del browser — nunca poner secrets acá.
- `SUPABASE_SERVICE_ROLE_KEY` solo se usa en `lib/supabase/admin.ts` que solo debe importarse desde API routes / server components / scripts.
- En Vercel, las mismas vars están configuradas en Project Settings → Environment Variables (Production + Preview).

---

## 8. Dependencias (package.json)

**Runtime:**
- `next` 16.2.0 (App Router con Turbopack)
- `react` 19.2.4 / `react-dom` 19.2.4
- `@supabase/ssr` ^0.9.0 (cookies + server client)
- `@supabase/supabase-js` ^2.99.2
- `jspdf` ^4.2.1 + `jspdf-autotable` ^5.0.7 (PDFs — fichas técnicas, reportes, HACCP)
- `xlsx` ^0.18.5 (import/export Excel)
- `clsx` ^2.1.1 + `tailwind-merge` ^3.5.0 (helper `cn()`)
- `pg` ^8.20.0 (scripts de migración directo a Postgres)

**Dev:**
- `typescript` ^5, `@types/node`, `@types/react`, `@types/react-dom`
- `tailwindcss` ^4 + `@tailwindcss/postcss` ^4
- `eslint` ^9 + `eslint-config-next` 16.2.0

**No instalado (por decisión):**
- Chart.js / Recharts → gráficos con CSS divs
- date-fns / dayjs → Date API nativa
- zod → validación ad-hoc en los hooks
- formik / react-hook-form → `useState` controlado

---

## 9. Convenciones de código

### Generales
- **Idioma:** Español argentino en UI, comentarios en español o inglés según contexto.
- **Nombres de archivo:** `camelCase.ts` para hooks (`useRecetas.ts`), `PascalCase.tsx` para componentes (`DashboardHeader.tsx`), `kebab-case` para rutas de Next (`/carta`, `/pase`).
- **Barrel files:** no se usan, imports absolutos vía `@/`.
- **Paths:** `@/` alias mapea a la raíz del proyecto (configurado en `tsconfig.json`).

### Hooks pattern
- Siempre usar `const supabase = createClient()` del browser client (`@/lib/supabase/client`).
- Siempre usar `const RESTAURANTE_ID = useRestauranteId()` — nunca hardcodear el mock ID.
- `useCallback` con deps completas cuando captura valores del hook. Las deps vacías `[]` son un bug latente.
- Realtime subs en `useEffect`, cleanup con `removeChannel`.

### Queries Supabase
- **Antes de escribir una query nueva, verificar columnas reales de la tabla**. Los nombres no siempre son intuitivos por deuda de migraciones:
  - `productos` usa `stock_actual` (no `cantidad`), `stock_minimo`, `stock_critico`, `precio_unitario`.
  - `tareas` usa `status` (no `completada`), `fecha_limite` (no `fecha_vencimiento`), `completed_at`.
  - `recetas` usa `status` (`'published' | 'draft'`) y `activa` bool para soft-delete.
- Para verificar: Management API
  ```bash
  curl -X POST https://api.supabase.com/v1/projects/clipcxcbtlibswfzsgzk/database/query \
       -H "Authorization: Bearer $SUPABASE_MANAGEMENT_TOKEN" \
       -H "Content-Type: application/json" \
       -d '{"query":"SELECT column_name FROM information_schema.columns WHERE table_name = '\''productos'\''"}'
  ```

### UI / CSS
- **CSS variables** (no hex hardcoded en componentes):
  - `var(--navy)` #1c2d4a — header primario
  - `var(--accent)` #4361a0 — botones, énfasis
  - `var(--bg)` — background general (light/dark)
  - `var(--surface)` — cards y sheets
  - `var(--border)` — separadores
  - `var(--text-1/2/3)` — niveles de contraste de texto
- **Navy header pattern:** `background: 'var(--navy)', padding: '46px 16px 14px'` (46px para status bar iOS).
- **Food cost colors:** verde <30%, amarillo 30-35%, rojo >35%.
- **Dark mode:** true black (#0a0a0a bg, #141414 surface, #222222 border).
- **Floating navbar:** `BottomNav` con `border-radius: 20px` y `margin: '0 10px 10px'`. Ocupa ~62-66px + 10px margen = ~72-76px. Los FABs deben ir en `bottom: 100+` para no taparse.
- **Iconos:** Material Symbols Outlined (`<span className="material-symbols-outlined">add</span>`). NO emoji, NO SVG custom.

### Gráficos
- **No hay Chart.js**. Todos los charts son divs con `width: ${x}%` y CSS. Razón: peso del bundle y simplicidad; la app es mobile-first y los gráficos son dashboards sencillos.

### PDFs
- `jsPDF` + `jspdf-autotable`. Patrón: crear `new jsPDF()`, setear fuentes, `autoTable(doc, {head, body, ...})`, `doc.save('filename.pdf')`.

### TypeScript
- `strict: true`. `any` solo en callbacks de terceros cuando es inevitable.
- Tipos en `types/index.ts` — un solo archivo centralizado (ver DECISIONES.md para la razón).
- Interfaces para shape de datos DB, types unión para enums (`TipoFactura`, `EstadoStock`, `Rol`).

### Deploy
- `npx vercel --prod --yes` desde la raíz del proyecto. Vercel detecta Next.js automáticamente.
- Antes de deploy: `npx next build` para verificar typecheck + compilación limpia.
- URL de prod: https://kitchenos-three.vercel.app
