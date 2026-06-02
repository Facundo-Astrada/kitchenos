# KitchenOS — Estado Actual del Proyecto

**Fecha:** 31 de mayo de 2026
**URL Producción:** https://kos-app-one.vercel.app
**Credenciales test:** admin@elrescoldo.com / kitchenos2026
**Supabase:** https://clipcxcbtlibswfzsgzk.supabase.co
**Restaurante:** El Rescoldo (Córdoba, Argentina)

---

## 1. Módulos y Estado

| # | Módulo | Ruta | Estado | Detalle |
|---|--------|------|--------|---------|
| 1 | **Dashboard** | `/` | Funcional | Header con perfil real (auth), status bars reales (`3/12` mise/tareas), pase preview, stock crítico, grilla de módulos por rol, WelcomeDashboard para restaurantes nuevos, turno tracking en localStorage (iniciar/cerrar con duración y resumen), CTA de merma. |
| 2 | **Tareas** | `/tareas` | Funcional | CRUD, prioridades (crítica/alta/media/baja), categorías, asignación a plaza, checklist por tarea, filtros, tab Producción con matriz, FAB elevado para no tapar navbar. |
| 3 | **Recetario** | `/recetario` | Funcional | Lista con food cost, detalle `/recetario/[id]`, CRUD ingredientes, cálculo automático, búsqueda, filtros, tabs Recetas/Ideas (drafts), **importación IA desde foto/imagen/audio/texto/archivo/link** (single + multi), guardado vía API server-side (`/api/recetas/save`) que usa service role y evita RLS. PDF export. |
| 4 | **Stock** | `/stock` | Funcional | Productos con estado (ok/bajo/crítico), CRUD, categorías, alertas, búsqueda, exportar, **modo rápido** (pantalla grande para stock-take secuencial), precio con fuente reducida. Sheet de selector de sector scrolleable (maxHeight 80vh). |
| 5 | **Pedidos** | `/pedidos` | Funcional | CRUD, items con precios, estados (borrador/enviado/recibido/parcial), productos frecuentes como chips, búsqueda predictiva, WhatsApp y PDF, recepción parcial. |
| 6 | **Proveedores** | `/proveedores` | Funcional | CRUD, CUIT, teléfono, días entrega, rubro, historial facturas por proveedor, **auto-creación** desde facturas con IA. |
| 7 | **Facturas** | `/facturas` | Funcional | Carga con items, tipos A/B/C/X/remito/ticket, **OCR con IA** (Claude Sonnet 4.6) que detecta proveedor/items/total, detección de variaciones de precio, historial, condición de pago. |
| 8 | **Carta** | `/carta` | Funcional | Items vinculados a recetas, food cost preview coloreado, 86, categorías **dinámicas por restaurante** (`carta_categorias`), vincular/cambiar receta inline (search siempre visible, porciones editables con tap), export PDF. **Tags dietarios** (S/TACC, Vegano, Vegetariano, Keto, Picante, Sin lactosa) toggleables directo en el detalle. **Importar desde foto/PDF/Excel/texto** con IA: extrae nombre, componentes, porciones, precio y tags — cada componente se puede vincular a recetas, productos o producciones existentes. **Crear receta borrador** desde búsqueda sin resultados. **Asignar a OPS** (plaza + stock ideal) por receta vinculada → upserta `checklist_item`. **KitchenCoach integrado**: context con FC promedio, problemas de margen y platos sin receta; suggestions dinámicas según pantalla. |
| 9 | **Checklist / Mise en Place** | `/checklist` | Funcional | Mise en place por plaza, items SP/P/REF/OK, cantidades color-coded, registros diarios, rutinas con frecuencia. Drag long-press entre secciones. **Plaza General**: items/secciones/rutinas con `plaza='general'` aparecen en TODAS las plazas al tope — para tareas que cualquiera puede cubrir (rutinas de limpieza, mise compartido, etc.). |
| 10 | **Pase de Turno** | `/pase` | Funcional | Chat continuo entre turnos, grouping por emisor (sin avatar repetido), prioridades, crear tarea desde mensaje, realtime. |
| 11 | **HACCP / Limpieza** | `/haccp` | Funcional | 3 tabs: Temperaturas, Vencimientos (color coding por días), **Limpieza** (sub-tabs Lista/Calendario; crear tarea con día + frecuencia; sync a OPS checklist plaza General). Export PDF para Bromatología. |
| 12 | **Reportes / CMV** | `/reportes` | Funcional | 8 tabs: Resumen, **CMV** (ventas vs compras), **Presupuesto vs Real** (semanal→anual), **Rendimiento por plaza**, Food Cost, Compras, Precios/inflación, Producción. Selector de periodo, gráficos CSS (sin Chart.js). |
| 13 | **Calendario** | `/calendario` | Funcional | Vista mensual + semanal por horas, eventos con iconos/colores, entregas de pedidos auto-integradas, CRUD eventos, recurrencia. |
| 14 | **Turnos / Equipo** | `/turnos` | Funcional | 3 tabs: Equipo (lista + ficha + CRUD), Turnos (grilla semanal M/T/N/F/V, asignación inline al tap, columna Hs calculada), Puestos (CRUD, tareas, permisos). Select único Rol+Puesto+Plaza con optgroup. |
| 15 | **Producción / Planificación** | `/produccion` | Funcional | Planilla de producción del día. **Calendario mensual** con dots indicadores (verde = activo, naranja = evento/tag). **Multi-select** para activar N días con nombre de menú opcional (`menu_tag`). Soporte multi-menú en mismo día con filtro chips. Asignación a miembros, badges P1/P2/P3. |
| 24 | **OPS — Workspace diario** | `/operaciones` | Funcional | **3 tabs**: Producción · Mise · Planificación. Producción: secciones con sublabels (SP·Super Prioridad, P·Prioridad, REF·Refuerzo), toggle Carta/Menú con subtítulo, QuickAdd con sugerencias de receta (≥3 chars). Checklist: auto-select plaza por rol, progreso por plaza en grid. |
| ~~23~~ | ~~OPS — Ingeniería de Menú~~ | ~~`/ingenieria-menu`~~ | **Eliminado (2 jun 2026)** | Página y referencias en `constants.ts` removidas. Los tipos `CategoriaPlato`/`PlatoComponente` y la lógica `sync_ops` de `plato_componentes` se mantienen (los usa Producción). |
| 16 | **Merma** | `/merma` | Funcional | Bottom sheet desde dashboard y módulo propio, 8 motivos con iconos, turno, plaza, costo estimado. |
| 17 | **Configuración** | `/configuracion` | Funcional | Tabs: restaurante, plazas, rutinas, permisos por rol. Link a `/turnos` para gestión de equipo (sin tab de invitación). |
| 18 | **Auth** | `/login`, `/register` | Funcional | Login email+password, registro (crea restaurante + user_restaurantes + equipo_miembros + rol_permisos seed), reset password por email, proxy.ts protege rutas. |
| 19 | **Perfil** | `/perfil` | Funcional | Avatar, datos, cambiar contraseña, cerrar sesión. Linkado desde el header del dashboard. |
| 20 | **Kitchen Coach (IA)** | API `/api/coach` + FAB | Funcional | Chat UI con FAB draggable. Overlay SVG tutorial. Tour guiado OPS 11 pasos. Chips de respuesta. **Suggestions dinámicas por pantalla**: en Carta muestra sugerencias de análisis de carta, food cost, import. **Integración con Carta**: screen context con FC promedio, platos problema, sin receta; highlights `carta-importar`, `carta-rentabilidad`, `carta-lista`, etc. |
| 21 | **Modo Servicio** | En dashboard | Parcial | UI existe (`components/dashboard/ModoServicio.tsx`) pero **sin conectar a datos reales** — ver DECISIONES.md, se decidió diferir / descartar. |
| 22 | **Ventas** | `/ventas` | Funcional | Importación desde Excel/CSV (xlsx) y texto libre con IA (Haiku). Pantalla de revisión editable antes de guardar. Tab Resumen con KPIs y lista de ventas con detalle de items. Requiere migración SQL (`ventas` + `ventas_items`). |

**Resumen:** 24 módulos funcionales, 1 parcial (modo servicio), 0 críticos pendientes.

---

## 2. Tablas de Supabase (28 total)

Ver `ARQUITECTURA.md` §Supabase para el esquema completo con columnas y relaciones.

### Core (3)
`restaurantes`, `user_restaurantes`, `rol_permisos`

### Operación diaria (7)
`productos`, `proveedores`, `facturas`, `factura_items`, `precio_historial`, `pedidos`, `pedido_items`

### Recetario y Carta (5)
`recetas`, `ingredientes`, `carta_items` (+ `tags TEXT[]`), `carta_categorias`, `plato_recetas` (+ `plaza`)

### Tareas y Checklist (6)
`tareas`, `checklist_secciones`, `checklist_items`, `checklist_registros`, `checklist_rutina`, `checklist_rutina_registros`

### Comunicación (1)
`pase_mensajes`

### HACCP (5)
`haccp_equipos`, `haccp_temperaturas`, `haccp_vencimientos`, `haccp_limpieza`, `haccp_limpieza_registros`

### Calendario y Equipo (4)
`eventos`, `equipo_miembros`, `turnos`, `puestos`

### Producción (4)
`platos_compuestos`, `plato_componentes` (+ `plaza`, `cantidad_diaria`, `unidad`), `plato_plazas` (ingredientes[] por plaza), `produccion_diaria`

### Merma (1)
`merma`

**Total: 29 tablas** con RLS habilitado. Aislamiento multi-tenant real via `mi_restaurante_id()`. Todas las políticas UPDATE tienen `WITH CHECK` explícito. Listo para multi-tenant.

---

## 3. Bugs / Deuda Técnica Conocida

### Críticos reportados por Facundo (testing en restaurante real)
| # | Severidad | Descripción | Estado |
|---|-----------|-------------|--------|
| 1 | Media | **Facturas → Stock**: al cargar factura con IA, los productos no siempre se crean/actualizan en `productos`. | Pendiente diagnóstico |
| 2 | Media | **Login en producción**: hard navigation (F5/URL directa) a veces no resuelve el perfil y muestra `??` hasta el safety timer de 3s. | Mitigado con timer, fix real pendiente |
| 3 | Media | **Merma → Stock**: al registrar merma, el `stock_actual` no se descuenta automáticamente. | Pendiente |
| 4 | Baja | `USUARIO_MOCK` sigue hardcoded en `lib/hooks/usePase.ts` para nombre al enviar mensajes. | Pendiente |

### Deuda técnica
| # | Severidad | Descripción | Archivo |
|---|-----------|-------------|---------|
| 5 | ✅ Resuelto | RLS multi-tenant real: 44 políticas UPDATE con `WITH CHECK`, 0 `USING(true)` ilegítimos. | Todas las tablas |
| 6 | Media | `useCallback` deps vacías en varios hooks que usan `RESTAURANTE_ID` — posible stale closure si cambia restaurante. | `lib/hooks/*.ts` |
| 7 | Media | Tipos desactualizados: `Evento`, `Turno`, `Puesto` en `types/index.ts` tienen campos legacy que no matchean el schema DB actual. | `types/index.ts` |
| 8 | Baja | Modo Servicio no conectado (ver DECISIONES.md — probablemente se descarta). | `components/dashboard/ModoServicio.tsx` |
| 9 | Info | Scripts de migración con token de Supabase hardcodeado. | `scripts/*.mjs` |
| 10 | Info | No hay tests (unitarios ni e2e). | — |

---

## 4. Implementado en Últimas Sesiones

### Sesión 2026-06-02 (tarde) — UX batch + Limpieza/Reportes/Privacidad facturas
**Bloque A — Quick wins:**
1. **Merma estética azul**: header navy, pills translúcidas, stat "Total costo" en `var(--accent)`.
2. **Carta header**: título + "Nuevo" arriba; chips Importar/PDF/Excel en row scrollable horizontal.
3. **Coach chip "Registrar merma"**: fijo sobre el input del Coach en toda la app → `MermaBottomSheet`.
4. **Facturas paginación rota**: bug stale closure (`page` state en deps de `fetchFacturas`). Fix `pageRef = useRef(0)`.

**Bloque B — Eliminar Ingeniería de Menú**: carpeta `/ingenieria-menu` borrada + `constants.ts` limpio (ModuloId, MODULO_CONFIG, MODULOS_POR_ROL, RUTA_A_MODULO). Tipos `CategoriaPlato`/`PlatoComponente` se mantienen (los usa `produccion`).

**Bloque C — Verificaciones + medias:**
5. **Horas mensuales** (Turnos): `fetchTurnosMes` + botón "Ver horas del mes" → tabla por miembro (días + horas, rojo >176h).
6. **Calendario ↔ OPS**: `useCalendario` lee `produccion_diaria` → dots verdes "OPS: [menú]" en el calendario general.
7. **Coach contextual**: `SUGGESTIONS_BY_SCREEN` + `kc_screen_context` en stock, recetario, facturas, reportes, merma, haccp.
8. **Equipo → invitar**: botón + modal + `POST /api/invitar` (service role). Falta página `/registro-invitado`.

**Bloque D — Features grandes (Opus):**
9. **Limpieza** (HACCP): migración `haccp_limpieza` (`dia_semana`, `dia_mes`, `sync_ops`, `checklist_item_id`). Form con día + toggle "Mostrar en OPS". Sub-tabs Lista/Calendario (calendario mensual deriva días por frecuencia). Sync a `checklist_item` plaza General sección "Limpieza"; al borrar la tarea borra el item.
10. **Reportes**: tabla `presupuestos` (RLS). 3 tabs nuevas — **CMV** (ventas vs compras, semáforo, ticket prom.), **Presupuesto vs Real** (semanal→anual, input inline que upsert, barra de avance), **Rendimiento por plaza** (cumplimiento tareas + merma).
11. **Facturas privacidad**: OCR (`/api/facturas`) detecta gastos no-mercadería (sueldos/honorarios/adelantos/retiros socios) → `items_excluidos` + `alerta_privacidad` + `proveedor_es_persona`. Lista `nombres_excluidos` en `restaurantes.configuracion` (botón 🛡️ en Facturas). Post-filtro de seguridad en OCR y en `facturas-universal` (importador masivo Fudo). Banner de alerta en confirm.

**Migraciones aplicadas en prod**: `haccp_limpieza_calendario_ops.sql`, `presupuestos.sql` (en `supabase/migrations/`).

### Sesión 2026-06-02 — UX fixes: OPS sección, drag text, stock sector scroll
1. **Carta OPS — sección en Apertura/Cierre**: el panel OPS ahora pide plaza + sección (Heladera / Secos/Tuppers / Congelados / Estación). Al guardar, busca o crea la `checklist_secciones` correcta y upserta el `checklist_item` en esa sección específica.
2. **Drag en Mise — sin selección de texto**: `user-select: none` global en `body` (`globals.css`) + re-habilitado en `input/textarea/[contenteditable]`. Previene que el browser seleccione texto durante long-press y drag en toda la app.
3. **Stock sector selector scrolleable**: el sheet "¿Qué sector vas a stockear?" tenía desborde cuando hay muchas categorías (13+). Ahora tiene `maxHeight: 80vh`, título y cancelar fijos, lista scrolleable en el medio.

### Sesión 2026-06-01 — Saneamiento de datos: costos, stock, categorías + prevención
1. **Causa raíz de costos absurdos**: `unitConversionFactor` en `lib/hooks/useRecetas.ts` solo manejaba `g↔kg` y `ml↔l`. Datos reales traen `gr`, `lt`, `cc`, `unidad` y combos masa↔volumen — todos caían en factor 1 e inflaban el costo ×1000 (Pimientos en escabeche $896.483 → **$6.489**, Chimichurri $0 → **$1.653** al vincularse).
2. **`canonUnit()`**: normaliza variantes antes de comparar (`gr`→`g`, `lt/lts`→`l`, `cc`→`ml`, `unidad/unidades`→`u`). Densidad≈1 para g↔ml y kg↔l (aceite, vinagre, etc.). Factor **0** para combos imposibles (`u` ↔ peso/volumen) — excluye la línea sin inflar.
3. **Donut de Carta blindado**: stops del `conic-gradient` clampeados a 0–100 para FC>100%, texto ya no desborda el círculo, muestra "Pérdida" en rojo cuando el costo supera el precio.
4. **Categorías de Stock Bros**: de 69 categorías caóticas (nombres de proveedor, typos, duplicados por acento) → **16 canónicas**. Script `scripts/recategorizar-productos.mjs` con reglas + Haiku + guard descartables/limpieza. 421 productos actualizados.
5. **Vinculación ingredientes Bros**: de ~340 → **559/616** ingredientes activos vinculados a producto. Script `scripts/autolink-ingredientes.mjs` (exacto + parcial + fuzzy) + UPDATE exacto por nombre normalizado en DB.
6. **Migraciones aplicadas en producción**: 6 ingredientes duplicados borrados (`fix_ingredientes_duplicados.sql`), unidades normalizadas en DB (`normalizar_unidades_ingredientes.sql`), resync `costo_unitario + unidad_costo` desde producto vinculado.
7. **Deuda de 22 productos `unidad='unidad'` resuelta** cruzando con `factura_items` (fuente de verdad de unidad/precio reales de Fudo): Grupo A (10 → kg confirmado por factura), Grupo B+D (7 → precio 0, se compran por atado/unidad o precio raro), Grupo C (re-links: Manteca→Manteca pilones, Pan→Pan rallado, "Agua" ×18 desvinculada). Errores de cantidad corregidos: Mostaza Fermentada "450 kg"→"450 g" ($1.9M→$6.681), Fondo Umami $187k→$19.693.
8. **Stock inflado ×1000 corregido**: ~11 productos con precio por kg/l pero `unidad='g'/'ml'` (Black Label, Café de mistol/Momo, tés Amaiti, Descafeinado). Fix: g→kg, ml→l, `stock_actual/1000`. **Stock total $72.251.932 → $8.025.585**.
9. **Recategorizador mejorado** (`scripts/recategorizar-productos.mjs`): orden de prioridad (Aceites/Vinagres antes que Verduras/Bebidas — "Aceite de ajo" iba a Verduras), keywords ampliadas para no-alimentos. 65 productos recorregidos (aceites de Bebidas→Aceites, químicos→Limpieza). Commit `b1e84f7`.
10. **Deploy a producción**: commits `9444b8a` + `b1e84f7` en `main`, Vercel deployado.

### Sesión 2026-05-31 (tarde) — Carta: import IA + tags + OPS + General + Coach
1. **Import de carta con IA** (`/api/carta/import`): parsea PDF, imagen, Excel, texto plano. Claude Haiku extrae nombre del plato, componentes (sub-recetas), porciones (individual/para compartir), precio y tags dietarios (S/TACC, Vegano, Vegetariano, Keto, Picante, Sin lactosa). Preview editable antes de confirmar: cada componente se puede vincular a recetas/productos/producciones existentes con auto-match fuzzy + dropdown de búsqueda. Al confirmar, crea `carta_items` + `plato_recetas` automáticamente para los componentes con receta vinculada.
2. **Categorías dinámicas**: tabla `carta_categorias` con RLS. Se seedea con 7 defaults al primer uso de cada restaurante. UI de carta y formularios usan la lista dinámica.
3. **Tags dietarios en detail view**: columna `tags TEXT[]` en `carta_items`. Chips toggleables directo en el detalle del plato, sin ir a editar. Se persisten en DB en el momento.
4. **Vinculación de recetas rediseñada**: search box siempre visible (antes oculto tras botón "Vincular"). Selección instantánea con un tap. Porciones editables inline: tap en el número → input → Enter/blur guarda.
5. **Crear receta borrador desde búsqueda**: cuando no hay resultados, botón "Crear receta [nombre]" → inserta en `recetas` con `status: 'draft'` y la vincula al plato. También "Agregar como tarea pendiente" para delegar la creación.
6. **Asignar componente a OPS**: botón "→ OPS" por cada receta vinculada en detail. Panel inline: selector de plaza + stock ideal + unidad. Guarda `plaza` en `plato_recetas` + upserta `checklist_item` en la sección correcta. Soporta upsert (actualiza si ya existe).
7. **OPS sync toggle en ingeniería de menú**: columna `sync_ops BOOLEAN DEFAULT false` en `plato_componentes`. Toggle visual por componente. Solo los componentes con `sync_ops=true` sincronizan al checklist. Badge "OPS" verde visible en modo colapsado.
8. **Plaza General**: `'general'` agregado al tipo `Plaza` y a todos los selectores (checklist, ingeniería, carta). Items/secciones/rutinas de `plaza='general'` aparecen al tope del checklist de CUALQUIER otra plaza. Tarjeta propia en el grid de selección.
9. **KitchenCoach integrado en Carta**: screen context con FC promedio, platos con FC>35%, platos sin receta, márgenes negativos. Suggestions dinámicas: al abrir el coach desde Carta muestra opciones de análisis de carta. 6 elementos con `data-coach-target` (header, importar, nuevo, filtros, lista, rentabilidad). Prompt con ejemplos de highlight para respuestas de análisis.

### Sesión 2026-05-31 — KitchenCoach: Tour guiado OPS + overlay tutorial
- Build errors, deadlocks de auth, loops de realtime, memory leaks.
- Corrección de columnas (`stock_actual` vs `cantidad`, `status` vs `completada`).
- Visual consistency en todos los módulos (headers navy, CSS vars, Material Symbols).

### Sesión — 23 mejoras UX para test en restaurante real
1. DashboardHeader: KPIs reales (`3/12` mise/tareas) y link a `/perfil`.
2. WelcomeDashboard para restaurantes nuevos (5 pasos guiados + IA highlight).
3. `/` dashboard: separación `miseStats`/`tareasStats`, CTA merma, turno tracking con localStorage.
4. Checklist: auto-select plaza por rol, pluralización "mise en place", cantidades pax color-coded.
5. Pase: grouping por emisor (sin avatar repetido), botón "Crear tarea" por mensaje, toast.
6. Carta: detail view con tap-through a receta, sección vincular/cambiar.
7. Producción: badges P1/P2/P3, asignación por miembro, `puedeDelegar` según rol.
8. Stock: modo rápido (stock-take secuencial), precio con fuente reducida.
9. Turnos: select único Rol+Puesto+Plaza, inline pill expand en celdas, columna Hs.
10. Configuración: quitar tab Invitar, link a `/turnos`.
11. Recetario IA: Haiku para single text, Sonnet para imágenes/multi, modelo parametrizable.
12. Reemplazo de "ítem" por "mise en place".

### Sesión actual — 2 bugs críticos
1. **Guardado de recetas IA fallaba** con RLS violation (anon key bloqueado).
   - Creada API route `app/api/recetas/save/route.ts` con service role key.
   - `useRecetas.agregarReceta` ahora hace POST a la API; ingredientes batch en un solo request.
   - `handleGuardar` y `IAMultiResultScreen` actualizados para enviar receta + ingredientes juntos.
2. **FABs tapados por barra de navegación**.
   - Recetario `bottom: 90 → 110`.
   - Tareas `bottom: 72 → 100`.
3. Verificado end-to-end en preview server: creación manual de receta con ingrediente guarda sin error y redirige al detalle.

### Sesión 2026-05-31 — KitchenCoach: Tour guiado OPS + overlay tutorial
1. **FAB draggable**: Pointer Events (touch + mouse), threshold 8px, posición guardada en localStorage. Panel sigue al FAB via CSS custom properties.
2. **Overlay tutorial SVG**: reemplaza glow simple. Fondo 72% opaco, agujero exacto sobre el elemento (SVG mask), borde naranja con glow. Toca el fondo para cerrar.
3. **Respuesta JSON extendida**: `{text, highlight, overlay_text, options}`. overlay_text aparece en tooltip naranja sobre el elemento; options son chips de respuesta rápida bajo el último mensaje.
4. **Sin markdown**: system prompt instruye texto plano. Se eliminaron asteriscos de las respuestas.
5. **Tour guiado OPS (11 pasos + card final)**: activado con chip "Ver recorrido de OPS". Cierra el chat y muestra tour standalone con overlay oscuro. Barra de progreso + contador N de 11. Tab-switching automático via evento `kc-set-tab`. Auto-skip si el elemento no está visible (ej: mise sin plaza seleccionada). Card final celebratoria invita al usuario a usar el Coach para dudas.
6. **data-coach-target** en todos los elementos de OPS: 3 tabs principales, sección SP, sub-tabs Planificación, boxes Stock/Producir en mise, botón Agregar, tab Rutina.

### Sesión 2026-05-30 — OPS: Sync bidireccional + MISE rediseño + Eventos/Rutinas
1. **MISE card rediseño**: apertura muestra box Stock (cierre anterior, semáforo verde/amarillo/rojo) + box A Producir (target fijo). Cierre mantiene input editable de cantidad_actual.
2. **Sync bidireccional Producción ↔ Mise**: tildar ítem en Mise crea/marca tarea en Producción (prefijo "Producción:"). Tildar tarea en Producción marca el ítem de Mise.
3. **Rutinas con días_semana**: columna `int[] DEFAULT NULL` en `checklist_rutina`. RutinasDia filtra por ISO day en Planificación.
4. **Tabla evento_items**: nueva tabla con RLS completo (4 políticas). Sub-tabs Menú/Eventos en Planificación. CRUD completo con acordeón por evento, ciclo de estado, FAB + modal.
5. **Tab CIERRE con carryover**: items de apertura sin completar aparecen en sección amarilla "Pendientes del turno" al abrir el turno de cierre.

### Sesión 2026-05-27 (tarde) — OPS: Rediseño UX completo del workspace diario
1. **OPS — 3 tabs**: Producción / Mise / Planificación. Ingeniería removida del tab bar.
2. **Ingeniería de Menú**: página standalone `/ingenieria-menu`, accesible desde "Más" (admin/chef). Registrada en `lib/constants.ts` con módulo `ingenieria-menu`.
3. **Producción (ex-Tareas)**: secciones con sublabels SP·Super Prioridad, P·Prioridad, REF·Refuerzo. Toggle Carta/Menú con subtítulo explicativo debajo.
4. **QuickAdd**: sugerencias de recetas en tiempo real (≥3 chars, hasta 3 chips, filtrado en memoria via `useRecetas`). `recetaId` propagado al crear tarea.
5. **Checklist**: auto-select plaza por rol al montar (via `useEffect` post-auth). Grid de plazas muestra progreso X/Y completados con barra y color verde si 100%.
6. **Planificación**: calendario mensual reemplaza strip semanal. Dots verde (menú activo) / naranja (evento con tag). Botón "Días" activa multi-select. CTA "Activar N días" → modal con nombre de menú opcional → `initProduccion(fecha, menuTag)` por cada día. Soporte multi-tag en mismo día con filtro chips. `produccion_diaria` → columna `menu_tag TEXT`.

### Sesión 2026-05-27 — OPS: Ingeniería de Menú + Checklist drag
1. **OPS/Tareas**: prioridades renombradas SP/P/REF/Baja. Modo menú agrupa por sección de carta ordenado por prioridad.
2. **OPS/Planificación**: selector semanal L-D con días activos (verde), botón "+" por categoría para agregar platos, sin botón "Iniciar día".
3. **OPS/Checklist AddItemSheet**: prioridad OK (chk) como 4ª opción, sin generar tarea.
4. **OPS/Ingeniería de Menú**: tab nuevo (4º). Wizard 3 pasos (plato → componentes → revisar). Cada componente: receta vinculada con autocomplete, plaza de servicio, cantidad diaria, unidad, notas. Sync a `platos_compuestos`, `plato_componentes`, `checklist_items`, `plato_plazas`.
5. **Ingeniería de Menú — ingredientes por plaza**: para componentes con receta vinculada, asignación de plaza de producción por ingrediente individual. Sync a `plato_plazas.ingredientes[]` y `checklist_items` por ingrediente/plaza de producción. Botón "Crear receta" para componentes sin receta.
6. **Checklist drag-to-move**: long-press 400ms activa drag de items entre secciones. Ghost flotante con nombre + sección destino. Auto-scroll continuo con RAF cuando el dedo alcanza el borde. Vibración háptica al activar.
7. **Ciclo de prioridad checklist**: SP→P→REF→OK (antes solo SP→P→REF).

### Sesión 2026-05-23 — RLS hardening + GitHub MCP
1. **RLS audit completo** via agente `rls-enforcer`: 0 políticas con `USING(true)` ilegítimas encontradas (ya estaban bien). Se detectaron 34 políticas UPDATE sin `WITH CHECK` — vector de modificación cross-tenant.
2. **44 políticas UPDATE corregidas** con `WITH CHECK (restaurante_id = mi_restaurante_id())` explícito en todas las tablas. Aplicado via Management API sin errores.
3. **GitHub MCP** agregado a `.mcp.json` (`@modelcontextprotocol/server-github`). Disponible desde la próxima sesión.

---

## 5. Arquitectura — resumen

```
Next.js 16.2.0 (App Router, Turbopack) + React 19.2.4
Supabase (auth + DB + realtime) + Vercel deploy
Tailwind CSS v4 + CSS vars + Material Symbols Outlined
jsPDF + jspdf-autotable | xlsx | Anthropic API (Haiku + Sonnet 4.6)
Auth: proxy.ts (NO middleware.ts — breaking change Next 16)
```

```
app/
  (app)/          ← 20 rutas protegidas (dashboard + módulos)
  (auth)/         ← login + register (públicas)
  api/            ← coach, facturas, listas-precios, recetas/import, recetas/save, migrate
lib/
  auth/           ← AuthProvider context + RouteGuard
  hooks/          ← 19 hooks (useRecetas, useStock, useTareas, …)
  supabase/       ← client (browser), server (SSR), admin (service role)
  constants.ts    ← Roles, módulos, nav
components/
  dashboard/      ← Header, MiPlaza, ModoServicio, ModulosGrid, PasePreview, StockCritico, WelcomeDashboard
  shell/          ← BottomNav, Header, MoreMenu, PageHeader, RouteGuard, ActionButton
  coach/          ← KitchenCoachFAB
  merma/          ← MermaBottomSheet
types/
  index.ts        ← Todos los tipos (Receta, Tarea, Producto, …)
proxy.ts          ← Auth middleware (Next 16)
```

**Hooks:** 19 | **Páginas app:** 20 | **API routes:** 6 | **Tablas:** 28 | **Componentes:** 19
