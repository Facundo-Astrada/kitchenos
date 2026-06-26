# KitchenOS — Estado Actual del Proyecto

**Fecha:** 3 de junio de 2026
**URL Producción:** https://kos-app-one.vercel.app
**Credenciales test:** admin@elrescoldo.com / kitchenos2026
**Supabase:** https://clipcxcbtlibswfzsgzk.supabase.co
**Restaurante:** El Rescoldo (Córdoba, Argentina)

---

## 1. Módulos y Estado

| # | Módulo | Ruta | Estado | Detalle |
|---|--------|------|--------|---------|
| 1 | **Dashboard** | `/` | Funcional | Header con perfil real (auth), status bars reales, pase preview, stock crítico, **ModulosGrid usa `puedeVer()` dinámico** (muestra módulos del puesto asignado, no lista hardcodeada). Turno tracking en localStorage (único — banner del layout.tsx eliminado). |
| 2 | **Tareas** | `/tareas` | Funcional | CRUD, prioridades (crítica/alta/media/baja), categorías, asignación a plaza, checklist por tarea, filtros, tab Producción con matriz, FAB elevado para no tapar navbar. |
| 3 | **Recetario** | `/recetario` | Funcional | Lista con food cost, detalle `/recetario/[id]`, CRUD ingredientes, cálculo automático, búsqueda, filtros, tabs Recetas/Ideas (drafts), **importación IA** (single + multi). **Ideas: botón "Cargar/Actualizar con IA"** → bottom sheet texto → IA parsea → aplica ingredientes+pasos a la receta existente sin crear nueva (modo `enrichRecetaId` en `/api/recetas/save`). Crear recetas abierto a todos, **importar/exportar solo admin**. |
| 4 | **Stock** | `/stock` | Funcional | Productos con estado (ok/bajo/crítico), CRUD, categorías, alertas, búsqueda, exportar, **modo rápido** (pantalla grande para stock-take secuencial), precio con fuente reducida. Sheet de selector de sector scrolleable (maxHeight 80vh). |
| 5 | **Pedidos** | `/pedidos` | Funcional | CRUD, items con precios, estados (borrador/enviado/recibido/parcial), productos frecuentes como chips, búsqueda predictiva, WhatsApp y PDF, recepción parcial. |
| 6 | **Proveedores** | `/proveedores` | Funcional | CRUD, CUIT, teléfono, días entrega, rubro, historial facturas por proveedor, **auto-creación** desde facturas con IA. |
| 7 | **Facturas** | `/facturas` | Funcional | Carga con items, tipos A/B/C/X/remito/ticket, **OCR con IA** (Claude Sonnet 4.6) que detecta proveedor/items/total, detección de variaciones de precio, historial, condición de pago. |
| 8 | **Carta** | `/carta` | Funcional | Items vinculados a recetas, food cost preview coloreado, 86, categorías **dinámicas por restaurante** (`carta_categorias`), vincular/cambiar receta inline (search siempre visible, porciones editables con tap), export PDF. **Tags dietarios** toggleables. **Importar con IA**. **Crear receta borrador** desde búsqueda. **Vincular productos de stock** en la misma búsqueda. **Asignar a OPS**: plato_recetas.cantidad_ops+unidad_ops → checklist_item (suma de contribuciones). **Recipientes en OPS**: se configura recipiente (nombre, capacidad, peso_porcion) → mise muestra déficit + CTA "Producir X porc". Panel OPS idéntico en creación y en vista detalle. **Crear idea en recetario** desde buscador de componentes sin resultados. Precio y food cost visible **solo para admin**. **KitchenCoach integrado**. |
| 9 | **Checklist / Mise en Place** | `/checklist` | Funcional | Mise en place por plaza, items SP/P/REF/OK, cantidades color-coded, registros diarios, rutinas con frecuencia. Drag long-press entre secciones. **Plaza General**: items/secciones/rutinas con `plaza='general'` aparecen en TODAS las plazas al tope — para tareas que cualquiera puede cubrir (rutinas de limpieza, mise compartido, etc.). |
| 10 | **Pase de Turno** | `/pase` | Funcional | Chat continuo entre turnos, grouping por emisor (sin avatar repetido), prioridades, crear tarea desde mensaje, realtime. |
| 11 | **HACCP / Limpieza** | `/haccp` | Funcional | 3 tabs: Temperaturas, Vencimientos (color coding por días), **Limpieza** (sub-tabs Lista/Calendario; crear tarea con día + frecuencia; sync a OPS checklist plaza General). Export PDF para Bromatología. |
| 12 | **Reportes / CMV** | `/reportes` | Funcional | 8 tabs: Resumen, **CMV** (ventas vs compras), **Presupuesto vs Real** (semanal→anual), **Rendimiento por plaza**, Food Cost, Compras, Precios/inflación, Producción. Selector de periodo, gráficos CSS (sin Chart.js). |
| 13 | **Calendario** | `/calendario` | Funcional | Vista mensual + semanal por horas, eventos con iconos/colores, entregas de pedidos auto-integradas, CRUD eventos, recurrencia. |
| 14 | **Turnos / Equipo** | `/turnos` | Funcional | 3 tabs: Equipo (form 2 pasos datos→puesto, ficha con overrides de módulos), Turnos (grilla semanal), Puestos (toggles de módulos reales, nivel badge, plaza OPS, template picker con 8 puestos comunes). **Sistema de puestos**: cada puesto define `nivel` (admin/sous_chef/cocinero/bachero) + `plaza_default` + `modulos_visibles[]`. Overrides por persona (`modulos_extra`, `modulos_restringidos`). DB: `puestos.nivel+plaza_default`, `equipo_miembros.modulos_extra+restringidos`. |
| 15 | **Producción / Planificación** | `/produccion` | Funcional | Planilla de producción del día. **Calendario mensual** con dots indicadores (verde = activo, naranja = evento/tag). **Multi-select** para activar N días con nombre de menú opcional (`menu_tag`). Soporte multi-menú en mismo día con filtro chips. Asignación a miembros, badges P1/P2/P3. |
| 25 | **Mesa de Trabajo** | `/espacios` | BETA (desktop) | Board anidado: Espacios físicos → Plazas (7 fijas) → Secciones → Producciones (`checklist_items`). Drag cross-plaza. **Panel OPS** al clickear una producción: nombre editable, prioridad (SP/P/REF/OK), plaza con colores, sección, cantidad+unidad, recipiente (optional), porciones/peso recipiente lleno, tamaño por porción con cálculo automático "= N porciones". Autocomplete de recipiente desde historial del restaurante. Limpieza por scope espacio/plaza/sección. Solo desktop (`useIsDesktop()`); mobile muestra mensaje amigable. |
| 24 | **OPS — Workspace diario** | `/operaciones` | Funcional | **Única puerta de entrada** al trabajo diario. **3 tabs**: Producción · Mise · Planificación (deep-link `?tab=`). Producción: secciones con sublabels (SP·Super Prioridad, P·Prioridad, REF·Refuerzo), toggle Carta/Menú con subtítulo, QuickAdd con sugerencias de receta (≥3 chars). Checklist: auto-select plaza por rol, progreso por plaza en grid. **`/tareas`, `/checklist`, `/produccion` redirigen acá** (rutas viejas; la vista vive embebida). |
| ~~23~~ | ~~OPS — Ingeniería de Menú~~ | ~~`/ingenieria-menu`~~ | **Eliminado (2 jun 2026)** | Página y referencias en `constants.ts` removidas. Los tipos `CategoriaPlato`/`PlatoComponente` y la lógica `sync_ops` de `plato_componentes` se mantienen (los usa Producción). |
| 16 | **Merma** | `/merma` | Funcional | Bottom sheet desde dashboard y módulo propio, 8 motivos con iconos, turno, plaza, costo estimado. |
| 17 | **Configuración** | `/configuracion` | Funcional | Tabs: restaurante, plazas, rutinas, permisos por rol. Link a `/turnos` para gestión de equipo (sin tab de invitación). |
| 18 | **Auth** | `/login`, `/register` | Funcional | Login email+password, registro (crea restaurante + user_restaurantes + equipo_miembros + rol_permisos seed), reset password por email, proxy.ts protege rutas. |
| 19 | **Perfil** | `/perfil` | Funcional | Avatar, datos, cambiar contraseña, cerrar sesión. Linkado desde el header del dashboard. |
| 20 | **Kitchen Coach (IA)** | API `/api/coach` + FAB | Funcional | Chat UI con FAB draggable. Overlay SVG tutorial. Tour guiado OPS 11 pasos. Chips de respuesta. **Suggestions dinámicas por pantalla**: en Carta muestra sugerencias de análisis de carta, food cost, import. **Integración con Carta**: screen context con FC promedio, platos problema, sin receta; highlights `carta-importar`, `carta-rentabilidad`, `carta-lista`, etc. |
| 21 | **Modo Servicio** | En dashboard | Parcial | UI existe (`components/dashboard/ModoServicio.tsx`) pero **sin conectar a datos reales** — ver DECISIONES.md, se decidió diferir / descartar. |
| 22 | **Ventas** | `/ventas` | Funcional | Importación desde Excel/CSV (xlsx) y texto libre con IA (Haiku). Pantalla de revisión editable antes de guardar. Tab Resumen con KPIs y lista de ventas con detalle de items. Requiere migración SQL (`ventas` + `ventas_items`). |

**Resumen:** 25 módulos funcionales, 1 parcial (modo servicio), 0 críticos pendientes.

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

**Total: 31 tablas** con RLS habilitado. Aislamiento multi-tenant real via `mi_restaurante_id()`. Todas las políticas UPDATE tienen `WITH CHECK` explícito. Listo para multi-tenant.

---

## 3. Bugs / Deuda Técnica Conocida

### Críticos reportados por Facundo (testing en restaurante real)
| # | Severidad | Descripción | Estado |
|---|-----------|-------------|--------|
| 1 | Media | **Facturas → Stock**: al cargar factura con IA, los productos no siempre se crean/actualizan en `productos`. | ✅ Resuelto (7 jun 2026) — el matching en `crearFactura` estaba invertido (un ítem genérico pisaba un producto específico; uno específico no encontraba su canónico). Corregido a dirección segura + guard de longitud + guard `RESTAURANTE_ID`. Validar con datos reales. |
| 2 | Media | **Login en producción**: hard navigation (F5/URL directa) a veces no resuelve el perfil y muestra `??`. | ✅ Resuelto (10 jun 2026) — causa real: en hard-nav el token no está adjunto a la primera query → RLS vacío → `user_restaurantes` null → se rendía permanente. `loadPerfil` ahora **reintenta** (backoff 400/800/1200ms) manteniendo `loading=true` (spinner, no `??`) + **safety timeout 10s** si la query se cuelga. Sin pisar perfil de signUp. `context.tsx`. Validado en prod. |
| 3 | Media | **Merma → Stock**: al registrar merma, el `stock_actual` no se descuenta automáticamente. | ✅ Resuelto — `useMerma.agregarMerma` hace UPDATE de `stock_actual` tras el insert. |
| 4 | Baja | `USUARIO_MOCK` hardcoded en `lib/hooks/usePase.ts`. | ✅ Resuelto — ya no existe; usa `perfil.nombre`. |

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

### Sesión 2026-06-24/25 — Etapa 1 carga de datos: 15 valores adicionales (Facturas/Stock/Recetario/Carta/Ventas)

Definición + implementación de "valores adicionales" para las 5 funciones de carga de gestión. Documentadas en `docs/funciones-carga-datos.md` (cómo cargar · impacto · qué soluciona · valor adicional por función).

1. **Facturas** (`useFacturas`, `facturas/page.tsx`, `DashboardClientView`):
   - **Alerta de variación de precio**: banner al confirmar (OCR/masiva) con las alzas ≥15% vs compra anterior.
   - **Cuentas por pagar**: status `'pagada'` (nuevo en `FacturaStatus`), filtro "Por pagar" agrupado por proveedor (`fetchPorPagar` trae todas las a-crédito impagas, sin paginar), botón "Marcar pagada" en detalle, KPI en dashboard (admin). `esPorPagar` = condicion_pago ∈ (cuenta_corriente/30dias/60dias) ∧ status≠pagada.
   - **Reconciliación factura↔pedido**: columna `facturas.pedido_id` (migración), `vincularPedido`, componente `ReconciliacionPedido` (elegir pedido del mismo proveedor + comparación ítem por ítem: cantidad/precio, faltantes).
2. **Stock** (`useStock`, `stock/ClientView.tsx`, `/api/stock/sugerir-minimos`):
   - **Producciones internas**: `productos.es_produccion` + `productos.receta_id` (migración). Toggle + selector de receta en el form; el costo se toma de `food_cost.costo_porcion`. Badge "Producción" en la lista.
   - **Sugerir mínimos**: API route que analiza `factura_items` (frecuencia + cantidad por entrega) → sugiere stock_minimo/critico para productos sin umbral (≥2 entregas). Modal preview + aplicar.
   - **Stock inmóvil**: filtro "Inmóvil" + banner de capital dormido. Última compra desde `precio_historial` (fallback `created_at`); inmóvil = stock>0 ∧ sin compra hace ≥60 días.
3. **Recetario** (`recetario/[id]/page.tsx`, `recetario/page.tsx`):
   - **Escalado por porciones**: control "Producir N porciones" que setea `scaleFactor` (reusa el escalado por doble-tap existente).
   - **Salud del recetario**: panel en la lista (admin) — costeo incompleto / food cost crítico / sin precio, con acceso directo.
   - **Sugerir precio de venta**: en Food Cost del detalle, precio para un FC objetivo + aplicar.
4. **Carta** (`carta/page.tsx` → `RentabilidadView` reescrito a 4 tabs):
   - **Ingeniería de menú**: matriz popularidad (ventas) × rentabilidad (margen) → Estrella/Caballo/Puzzle/Perro con recomendación.
   - **Reprecio por inflación**: FC objetivo → precio sugerido por plato, aplicar en lote.
   - **Salud de la carta**: sin receta / margen negativo / en 86 / sin categoría.
5. **Ventas** (`ventas/page.tsx`):
   - **Ranking/mix de platos**: tab Platos con % de facturación (top verde, cola rojo) + unidades.
   - **Food cost teórico**: platos vendidos × costo de receta → FC% teórico + cobertura (card en Resumen).
   - **Cierre rápido + alerta de días sin cargar**.

**Migraciones aplicadas en prod** (token de management renovado en `.env.local`): `20260624_factura_pedido_link.sql`, `20260624_productos_produccion_interna.sql`. **Commits:** `eb6750d` (facturas+stock) · `909652a` (recetario) · `4300158` (carta) · `0968806` (ventas). Build verde, deployados a `main`.

### Sesión 2026-06-23 — Mesa de Trabajo: panel OPS editable + recipientes + autocomplete

1. **Panel editable slide-over** (`ItemEditPanel.tsx`): al hacer click en una producción de la Mesa de Trabajo se abre un panel desde la derecha (animación slideInRight). Campos: nombre editable inline, prioridad (SP/P/REF/OK con colores), plaza de producción (pills con colores por plaza), sección del mise (pills con iconos de la plaza seleccionada). Guarda vía `actualizarItem` con soporte cross-plaza (actualiza `plaza` + `seccion_id` en un solo UPDATE). Pre-fill desde el item existente.

2. **Campos OPS completos** — misma lógica que Carta: recipiente (texto libre, opcional), "Porciones/peso recipiente lleno" (label cambia si hay recipiente), "Tamaño por porción" con unidades (`g/kg/ml/l/u/porc`), cálculo automático reactivo "= N porciones por recipiente" (`toG(capG, u) / toG(porG, u)`). Guarda `recipiente_nombre`, `recipiente_capacidad` (siempre en porciones), `peso_porcion`, `peso_porcion_unidad` en `checklist_items`. `actualizarItem` extendido para aceptar estos campos.

3. **Texto predictivo de recipiente**: `<datalist id="recipientes-sugerencias">` nativo con valores únicos de `checklist_items.recipiente_nombre` del restaurante (computado en `ClientView` vía `useMemo`, ordenado alfabéticamente). Sin storage extra — crece automáticamente con el uso y es compartido entre todos los usuarios del restaurante.

4. **Dashboard desktop stock crítico**: limitado a `criticos.slice(0, 12)` (2 filas de 6) con badge que indica cuántos quedan fuera.

**Commits:** `97fc9bd` (panel base) · `58db886` (recipientes + porciones) · `9f559ab` (autocomplete), deployados a `main`.

### Sesión 2026-06-22 (tarde) — OPS recetario: recipientes + crear idea desde carta

1. **Panel OPS en vista detalle de platos** (`carta/page.tsx`): actualizado para ser idéntico al panel de creación. Agrega: campo Recipiente (texto libre), "Porciones/peso recipiente lleno" con selector de unidades como pills (g/kg/porc/u/ml/l), "Tamaño por porción" con su propio selector, autocálculo "= X porciones por recipiente" cuando ambos campos son en peso. Al abrir el panel carga el recipiente/peso existente desde `checklist_items` vía fetch async. Botón "Quitar" para remover config OPS. Guarda `recipiente_nombre`, `recipiente_capacidad`, `peso_porcion`, `peso_porcion_unidad` al upsert de `checklist_items`.

2. **Crear idea en recetario desde búsqueda de componentes** (`ComposicionEditor.tsx`): en el buscador del plato, cuando no hay resultados aparece botón dashed "Crear X como idea en recetario". Llama `/api/recetas/save` con `status: 'draft'` y el nombre escrito, y vincula la receta nueva al plato automáticamente. Usa `onMouseDown + e.preventDefault()` para que no interfiera con el `onBlur` del input.

### Sesión 2026-06-22 — Versión web desktop completa (Fase 1 + Fase 2) + estética módulos + tile Importar

1. **Fase 1 — DesktopShell** (`components/shell/DesktopShell.tsx`): sidebar 224px fijo, navy, secciones colapsables (Operaciones / Insumos / Gestión / Análisis / Herramientas), logo KitchenOS, nav items con iconos, botón "Importar datos", botón "Kitchen Coach". `useIsDesktop()` hook SSR-safe (empieza `false`, se actualiza post-mount vía `window.matchMedia('(min-width: 1024px)')`). En mobile sigue el BottomNav.

2. **Fase 2 — Layouts desktop por módulo:**
   - **Reportes** (`reportes/page.tsx`): KPI grid 4 columnas, FoodCost / Compras / CMV en layout side-by-side (izquierda: resumen/gráfico; derecha: tabla/KPIs). Padding 24px 32px.
   - **Carta** (`carta/page.tsx`): grid 2 columnas de platos en desktop; al seleccionar aparece panel detalle inline 380px (nombre, precio, FC badge, descripción, tags, recetas vinculadas, toggle estado). Click en desktop solo selecciona; en mobile navega.
   - **Stock** (`stock/ClientView.tsx`): columna "Categoría" en tabla solo desktop. Admin ve también columna "Valor".
   - **Facturas** (`facturas/page.tsx`): tabla 7 columnas en desktop con zebra + hover. Mobile mantiene cards.
   - **HACCP** (`haccp/page.tsx`): grid 2 columnas para equipos y para vencimientos.

3. **ModulosGrid estética** (`components/dashboard/ModulosGrid.tsx`): 17 paletas de color únicas por módulo (fondo pastel + ícono en color fuerte). Tiles 56×56, sin borde, `boxShadow` suave. Hover `scale(1.06)`. Label completo (antes solo la primera palabra).

4. **Tile "Importar" en home** (`components/dashboard/ModulosGrid.tsx`): botón "Importar" como primer tile del grid (ícono `upload_file`, fondo `#e0f2fe`). Abre `ImportadorUniversal` con state interno. Antes solo accesible desde sidebar o "Más".

**Commits:** `c32cff2` (Fase 1+2) · `e63b988` (tile Importar), deployados a `main`.

### Sesión 2026-06-12 (tarde) — Performance: cache SWR en 10 hooks + fix doble-tap

Reporte de Facundo: la app se sentía lenta al cambiar de pantalla, y algunos botones necesitaban doble tap (nav de Stock, y en Recetario al tocar una receta o el buscador).

1. **Cache SWR en 10 hooks** (de 4 a 14 con cache): `useProveedores`, `useMenus`, `useCategoriasProducto`, `useMerma`, `useHaccp`, `useVentas`, `usePackagingGrupos`, `usePedidos`, `useEquipo` (miembros+puestos), `useCarta` — migrados al patrón SWR de `useStock`/`useTareas` (`dedupingInterval: 300_000` + `keepPreviousData`). Re-entrar a una pantalla muestra la data cacheada al instante y revalida en background, en vez de spinner + refetch completo. **`useHaccp` pasó de 5 fetches separados a 1 fetcher combinado.** Realtime sigue funcionando vía `mutate()`. Los fetchers se movieron a nivel de módulo (reciben la SWR key con el `restaurante_id` embebido). Hooks con caches manuales previos (`_cache`/`_cartaCache` Map) reemplazados por SWR.
2. **Doble-tap del nav de Stock**: `/stock` era el único item del nav que era un **Server Component async** (`await getUser()` + queries server-side) → ruta `ƒ dynamic` → cada tap hacía un round-trip al server **antes** de transicionar, dando la sensación de "no responde". Convertido a página client estática (`○`, como `/recetario` y `/operaciones`); la data la carga `useStock` (SWR con cache). Se removió el `SWRFallback` SSR (forzaba la ruta dynamic).
3. **Doble-tap en Recetario** (receta + buscador): la lista usaba animación de entrada con `staggerChildren: 0.05` + `y: 12` por ítem → con 20+ recetas eran >1s de cards moviéndose y semi-transparentes; el primer tap caía sobre un target en movimiento y el buscador quedaba trabado mientras el main thread componía. Cambiado a fade rápido (`duration: 0.12`) sin translate ni stagger → tappable de inmediato.
4. **No migrados (a propósito)**: `useCalendario` (parametrizado por mes, el page controla qué mes pedir) y `useProduccion` (parametrizado por fecha + expone `setProduccion` usado directo en el page). SWR no encaja sin reestructurar esos pages y el beneficio es marginal.

**Verificación:** `npm run build` verde (48 rutas, `/stock` confirmada `○ static`). `npm run lint` falla por un problema preexistente del entorno (`eslint-plugin-import` no resuelve `tsconfig-paths`), no por estos cambios. **Commit:** `6c181b2`, deployado a `main`.

### Sesión 2026-06-12 — Equipo teclado + multi-plaza OPS/checklist + stock editable apertura

1. **Fix teclado en Equipo** (`turnos/page.tsx`): el teclado se cerraba al escribir el primer carácter. Causa: `MiembroFormDatos` y `PuestoFormBody` eran funciones definidas dentro de `TurnosPage` y usadas como JSX (`<MiembroFormDatos />`). React las trataba como nuevo tipo de componente en cada re-render → unmount/remount → foco perdido. Fix definitivo: extraídas como componentes **a nivel de módulo** (fuera de `TurnosPage`), reciben `form` y `setForm` como props. Referencia estable → React nunca remonta → teclado permanece abierto.

2. **Multi-plaza OPS en equipo** (`turnos/page.tsx`): al asignar un puesto ya no se resetean las plazas seleccionadas. Los botones de plaza usan `setMiembroForm(f => ...)` (actualización funcional, evita stale closure). `plaza_asignada` guarda comma-separated: `"pasteleria,frios"`.

3. **Selector multi-plaza en checklist** (`lib/auth/context.tsx` + `checklist/ClientView.tsx`): `PerfilAuth` expone `plaza_asignada: string | null`. `ClientView` deriva `userPlazas[]` del perfil; si el usuario tiene ≥2 plazas, el grid se filtra a sus plazas + general, y aparecen tabs inline en el header del checklist para cambiar entre ellas sin volver al grid.

4. **Stock editable inline en apertura** (`components/mise/ProductoMiseCard.tsx`): el box "stock" (que mostraba el cierre anterior, read-only) ahora es tappable. Al tocar → input azul inline prellenado con el valor actual. Enter/blur → `onUpsert(id, fecha, 'apertura', { cantidad_actual: v })`. El valor se muestra con prioridad: apertura corregida por el usuario > cierre anterior de ayer.

**Commits:** `6c3784b` (primer fix teclado) · `3a13e5a` (fix definitivo módulo-nivel) · `aa8ed67` (multi-plaza checklist) · `b2d46d6` (stock editable).

### Sesión 2026-06-10 (tarde) — Auth race condition + Kitchen Coach M1/M5

1. **Auth race (hard-nav) resuelta** (`lib/auth/context.tsx`): en F5/URL directa el access token no estaba adjunto a la primera query → RLS vacío → `user_restaurantes` null → se rendía permanente mostrando `??`. `loadPerfil` ahora **reintenta** con backoff (400/800/1200 ms) manteniendo `loading=true` (spinner, no `??`) + **safety timeout de 10 s** si la query se cuelga. `giveUp()` usa `setPerfil(prev => prev)` para no pisar el perfil que setea `signUp`. El "timer de 3s" que el doc decía tener no existía.
2. **Coach M1 — datos reales server-side** (`app/api/coach/route.ts`): `buildSnapshot()` consulta en vivo (server client → respeta RLS, aislamiento por tenant automático) stock crítico/bajo, vencimientos ≤3 días y facturas pendientes, y los inyecta al system prompt. Acotado (limits) y falla seguro (try/catch por sección).
3. **Coach M5 — tool use agéntico** (`route.ts`): loop server-side (hasta 4 vueltas) con 3 tools de Anthropic — `crear_tarea` (inserta en `tareas`, hoy, aparece en Producción), `marcar_86` (`carta_items.disponible=false` por nombre fuzzy), `registrar_merma` (inserta `merma` + descuenta `stock_actual` si matchea el producto). `restaurante_id` se resuelve de la sesión (no del body); writes respetan RLS. Cada tool devuelve un string de resultado/error al modelo.

**Pendiente del Coach:** memoria persistida (`coach_conversaciones`) + prompt caching. **Commits:** `109383d` (auth+M1) · `f5c5099` (M5), deployados.

### Sesión 2026-06-10 — Bugs de Producción/Menús + UX Carta + forms HACCP

1. **Producción no acumula ni duplica** (`tareas/ClientView.tsx` + `produccion/page.tsx`):
   - Carryover de **un solo día**: la vista muestra solo tareas de hoy + las de ayer sin completar (y requiere `turno_fecha`). Antes las tareas con `turno_fecha=NULL` o pasadas sin completar se mostraban **para siempre** → "producciones viejas" que nunca se iban.
   - `activarMenu` deduplica **por preparación** contra el día y el arrastre de ayer: si "tomates asados" quedó pendiente ayer, activar hoy NO crea un duplicado.
   - Limpieza de datos: borradas **203 tareas viejas** en Bros (completadas antiguas + sin-fecha previas a hoy). Activaciones futuras intactas.
2. **Editar un menú propaga a fechas ya activadas** (`useMenus.actualizarMenu`): las tareas (snapshot) de Planificación/Producción se sincronizan para hoy en adelante — agrega preparaciones nuevas, refresca prioridad/sección/plaza/receta/cantidad de las existentes, y saca las borradas **solo si no se empezaron** (no pisa trabajo hecho/en curso). El pasado no se toca.
3. **Carta — Menús como navegación primaria** (`carta/page.tsx`): toggle segmentado **Platos | Menús** (mismo peso visual, estilo tabs OPS). Importar/PDF/Excel bajaron a una fila de utilidades secundaria.
4. **HACCP — botón guardar tapado** (`haccp/page.tsx`): las 3 sub-vistas (Nueva tarea de limpieza, Agregar vencimiento, Registrar temperaturas) tenían la barra de guardar `position:fixed bottom:0 z-50` **detrás del BottomNav** (`z-100`). Pasadas a botón **inline** dentro del scroll de `main` → siempre visible sobre el nav.

**Commits:** `4dd9c6f` (carryover) · `407f374` (propagación menú) · `fd11ad9` (UX carta) · `d19c3f4` (forms HACCP).

### Sesión 2026-06-07 (tarde) — Reducir errores: OPS, Facturas→Stock, Invitación + sync de docs

1. **Desambiguación OPS (una sola puerta de entrada)**: `/operaciones` es ahora el único acceso al workspace diario, con deep-link `?tab=produccion|mise|planificacion`. Las rutas viejas `/tareas`, `/checklist`, `/produccion` **redirigen** a OPS con su tab (antes mostraban la vista huérfana sin barra de tabs). La implementación de Planificación pasó de default export a export nombrado `ProduccionView` (la que OPS embebe); el default de `/produccion` solo redirige. `RUTA_A_MODULO` mapea las 3 a `operaciones`.
2. **Fix Facturas → Stock** (`lib/hooks/useFacturas.ts` `crearFactura`): el match parcial estaba **invertido** (`producto.includes(factura)`) → un ítem genérico ("Tomate") pisaba stock/precio de un producto específico ("Extracto de Tomate") y un ítem específico no encontraba su canónico (creaba duplicados). Corregido a `factura.includes(producto)` + guard de longitud ≥4 + guard `RESTAURANTE_ID` al inicio. Heurística mejorada — validar con datos reales de Bros. El importador masivo `productos-desde-facturas` usa otro matching: auditar aparte.
3. **Invitación de usuarios**: `/registro-invitado` **ya existía** (el doc decía que no). Reforzado el manejo de sesión del link de email para cubrir todos los formatos: hash implícito, PKCE `?code=`, `token_hash`+type (verifyOtp) y sesión ya activa, con detección de errores explícitos. **Pendiente (config dashboard, no código)**: whitelistear `…/registro-invitado` en Supabase Auth → URL Configuration y activar la plantilla de email "Invite user".
4. **Docs reconciliados**: §3 de este archivo listaba como pendientes 2 bugs ya resueltos (Merma→Stock, USUARIO_MOCK). Corregido.

### Sesión 2026-06-07 — Carga masiva de recetas desde Google Drive

1. **53 recetas** cargadas desde Google Docs del Drive via MCP → script `scripts/load-recetas-drive-2026.mjs` (con deduplicación por nombre normalizado + fuzzy match de ingredientes contra stock).
2. **139 recetas adicionales** cargadas desde ZIP de carpetas (`recetas para cargar K-OS.zip`) → script `scripts/parse-zip-recetas.mjs`: lee `.docx` con `mammoth`, parsea tablas de ingredientes, infiere categoría, inserta con deduplicación. **Sin tokens de Claude en runtime** — corre 100% local.
3. Total sesión: **~192 recetas nuevas** en Bros (de ~165 a ~357). Ingredientes vinculados automáticamente al stock existente.
4. Detectados 3 duplicados exactos (Almendras x2 draft, Hummus x2 published, Mbeju draft+published) + Polenta blanca draft vs 2 FINAL published — dejados como están por decisión del cliente.

**Scripts reutilizables:** bajar más carpetas como ZIP → `node scripts/parse-zip-recetas.mjs` (solo agrega las que faltan).

### Sesión 2026-06-06 — Unificación de Menús (Carta → Planificación → Producción)

**Modelo nuevo "Menú" como capa por encima del plato** (jerarquía: ingrediente → receta → plato → **menú**).

1. **Migración** (`supabase/migrations/20260604_menus.sql`): tablas `menus` (`tipo` fijo/evento) + `menu_preparaciones` (polimórfico `tipo`/`ref_id` a receta/producto/plato, `prioridad`, `plaza`, `seccion_mise`, `usuario_asignado`, `cantidad`, `paso`). Hook `useMenus`. Columna `tareas.menu_id`.
2. **Editor unificado** `ComposicionEditor.tsx`: una sola pantalla para **Plato / Menú / Evento** (toggle). Reemplaza el "+ Plato" de carta para crear. Secciones editables, ítems inline expandibles, buscador unificado, prioridad SP/P/REF/Check, plaza creable + sección de mise, resumen vivo de costo/FC. Plato → `carta_items`+`plato_recetas`; Menú/Evento → `menus`. `MenusView` queda solo como lista.
3. **Flujo final**: Carta (crear menú fijo/evento) → **Planificación** (activar) → **Producción → Menú** (ejecutar, tildable). **Mise queda intacto** (flujo propio).
4. **Planificación**: una sola pantalla (sin sub-tabs Menú/Eventos; eliminado `EventosView`, −642 líneas). "Activar menú" (1 día o N días en modo Días) crea tareas `modo='menu'`, `seccion=paso`, `menu_id`. Dedupe por menu_id+fecha. Refetch inmediato (no espera realtime). `MenuActivoView` = resumen organizativo (progreso por sección, sin toggle) + botón "Ir a Producción".
5. **Producción → Menú**: secciones **dinámicas** (las del menú activo, no las 6 fijas).
6. **Recetario**: "Cargar con IA" en Ideas abre `NuevaFichaScreen` completa pre-poblada (no el bottom sheet de texto).
7. **Fixes**: bug guardado de menú (PostgREST schema cache — ver docs); error toast real (Supabase no son `Error`); `tareas.seccion` NOT NULL; sección de mise recién creada aparece como chip; multi-día usa el selector del catálogo (eliminado modal viejo con botón tapado).

**Commits:** `d7951bb` (editor unificado), `160e4af` (sección mise), `f552ff5`/`9e950f3` (Fase 2/3), `64262db` (vista activo), `d1847a8` (simplificación), `a225aa0` (refetch), `7d3154b` (chip mise), `8518831` (multi-día).

### Sesión 2026-06-03 — Sistema de puestos + permisos granulares + UX mejoras carta/recetario

**Bloque A — Sistema de puestos con permisos reales:**
1. **DB migration**: `puestos.nivel` (admin/sous_chef/cocinero/bachero) + `puestos.plaza_default` + `equipo_miembros.modulos_extra[]` + `equipo_miembros.modulos_restringidos[]`.
2. **Tab Puestos rediseñado**: toggles de módulos reales (no texto libre), nivel badge coloreado, plaza OPS, template picker con 8 puestos comunes (Parrillero, Pastelero, Chef, Bachero, etc.).
3. **Tab Equipo**: form 2 pasos (datos → selección de puesto con preview de módulos incluidos), ficha con panel de overrides individuales por persona.
4. **usePermisos**: carga puesto del usuario logueado vía `equipo_miembros.auth_user_id` → `puestos.permisos_app` + `modulos_extra` − `modulos_restringidos`. Fallback a `rol_permisos` si no tiene puesto asignado.
5. **ModulosGrid**: usa `puedeVer()` sobre todos los módulos posibles (no lista hardcodeada del rol).
6. **constants.ts**: calendario y merma añadidos a todos los roles base.

**Bloque B — Permisos granulares por módulo:**
7. **Stock**: precio_unitario y monto total visible solo para admin (tanto en tabla como PDF).
8. **Carta**: precio de venta y FC%/margen visible solo para admin; componentes y platos visibles para todos.
9. **Recetario**: crear recetas abierto a todos; importar fichas técnicas y exportar Excel solo admin.
10. **HACCP/Limpieza**: registrar temperaturas/limpieza/vencimientos abierto a todos; crear/eliminar tareas, config equipos, descartar vencimientos solo admin.
11. **Merma**: accesible para todos; `costo_estimado` y stat "Total costo" solo admin.
12. **Dashboard**: eliminado banner de clock-in del `layout.tsx` (usaba tabla `turnos_personal` que no existe en DB — era el segundo botón de turno que confundía).

**Bloque C — UX mejoras carta y recetario:**
13. **Ideas → Completar con IA**: botón en cada borrador → bottom sheet con textarea → IA parsea ingredientes+pasos → "Aplicar a [nombre]" enriquece la receta existente (no crea nueva). Modo `enrichRecetaId` agregado a `/api/recetas/save`.
14. **Carta → Vincular productos de stock**: la búsqueda de recetas en detalle del plato ahora muestra también productos de stock. Al seleccionar uno, crea una receta borrador automática con ese producto como ingrediente y la vincula.
15. **OPS mise acumulativo**: `plato_recetas` ahora guarda `cantidad_ops` + `unidad_ops` por plato. `handleGuardarOPS` suma TODAS las contribuciones de la misma `receta_id+plaza` → `checklist_items.cantidad` = total correcto. Preview del total antes de guardar. Badge OPS visible en la lista de recetas del plato.

**Commits:** `980f0bb` (puestos), `510b864` (permisos granulares), `724e712` (UX mejoras), `353cd51` (OPS suma).

### Sesión 2026-06-03 — Kitchen Coach: cobertura total 19/19 pantallas

**Análisis y planificación:**
- Auditoría completa del sistema Coach existente: arquitectura de 4 piezas, 3 mecanismos de contexto, 2 sistemas de tour. Detectado: API nunca consulta DB (M1 pendiente), sin motor genérico de tour, cobertura parcial en 6 pantallas, 0 cobertura en 11.

**Motor de tour genérico (Fase 0):**
- `lib/coach/tours.ts`: registry data-driven `TOURS: Record<screen, TourStep[]>`. OPS migrado exacto. `requireTab` generalizado de union OPS-only a `string`.
- `KitchenCoachFAB`: eliminado `TOUR_STEPS` hardcodeado → `getActiveTour()` lee `kc_screen_context.screen` y carga el tour correcto. `startTour()` setea `activeTourSteps` dinámicamente. `TourOverlay` recibe `steps[]` completo.

**Skill `/coach-screen` creada** (`.claude/skills/coach-screen/SKILL.md`): 6 entregables por pantalla (screen_context con insights, data-coach-target, suggestions, tour, ejemplos highlight, funciones explicadas), apuntando a visión guía + datos + acciones.

**Cobertura implementada — 19/19 pantallas:**
- ✅ Carta (fix): tour 7 pasos + chip "Ver recorrido" (faltaba en el gold standard)
- ✅ Stock: context insights (críticos top-8, sin precio, valor total, categorías en riesgo), 7 targets, tour 8 pasos, listener kc-set-tab
- ✅ Recetario: context (fcAlto/sinIngredientes/sinPrecio/sinVincular), 7 targets, tour 8 pasos, listener kc-set-tab
- ✅ Facturas: context (pendientes, cuentaCorriente, montoFiltrado), 6 targets, tour 7 pasos
- ✅ Reportes: context (totalCompras, foodCostPromedio, fcAlto, topProveedores, inflacionCocina), 3 targets, tour 6 pasos
- ✅ Merma: context (costoPeriodo, topMotivo, topProducto), 3 targets, tour 4 pasos
- ✅ HACCP: context (equiposFueraRango, equiposSinRegistro, vencEnRiesgo), 5 targets, tour 5 pasos
- ✅ Dashboard: context (nCritico, tareasCriticas, miseProgress), 5 targets, tour 6 pasos
- ✅ Tareas: context (modo, listos/total, topCriticas), 2 targets, tour 4 pasos
- ✅ Pase: context (hoy, urgentes, plazasActivas), 4 targets, tour 5 pasos
- ✅ Pedidos: context (borradores, enviados, pendienteRecepcion), 2 targets, tour 3 pasos
- ✅ Ventas: context (totalVentas, cubiertos, topPlato), 2 targets, tour 3 pasos
- ✅ Proveedores: context (total, sinTeléfono), 1 target, tour 2 pasos
- ✅ Turnos: context (miembros, puestos, tab), tour 1 paso
- ✅ Calendario: context (eventosHoy, eventosProximos), tour 1 paso
- Todos con chips de suggestions + acción `tour`

**System prompt enriquecido**: 7 ejemplos de highlight específicos por pantalla (recetario ×2, stock ×2, facturas, reportes/inflación, HACCP vencimientos, merma costo).

**TODOs documentados en `app/api/coach/route.ts`**: M1 (datos server-side por pantalla) y M5 (tool use: crear tarea, marcar 86, registrar merma).

**Commits:** `9f63548` (motor + stock + recetario) → `4120277` (facturas/reportes/merma/haccp) → `ea82939` (dashboard/tareas/pase/pedidos/ventas/proveedores/turnos/calendario) → `d4aa85e` (fix Carta tour).

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
7. **Coach contextual**: `SUGGESTIONS_BY_SCREEN` + `kc_screen_context` en stock, recetario, facturas, reportes, merma, haccp. **Stock** elevado a nivel OPS/Carta vía skill `/coach-screen` (jun 2026): screen_context con insights (críticos top-8, sin precio, valor total, categorías en riesgo), 7 `data-coach-target`, tour 8 pasos, ejemplos highlight. **Recetario** ídem (jun 2026): screen_context con fcAlto/sinIngredientes/sinPrecio/sinVincular, 7 `data-coach-target`, tour 8 pasos con tabs, 2 ejemplos highlight. Motor de tour genérico en `lib/coach/tours.ts` — cualquier pantalla agrega sus pasos ahí.
8. **Equipo → invitar**: botón + modal + `POST /api/invitar` (service role). Falta página `/registro-invitado`.

**Bloque D — Features grandes (Opus):**
9. **Limpieza** (HACCP): migración `haccp_limpieza` (`dia_semana`, `dia_mes`, `sync_ops`, `checklist_item_id`). Form con día + toggle "Mostrar en OPS". Sub-tabs Lista/Calendario (calendario mensual deriva días por frecuencia). Sync a `checklist_item` plaza General sección "Limpieza"; al borrar la tarea borra el item.
10. **Reportes**: tabla `presupuestos` (RLS). 3 tabs nuevas — **CMV** (ventas vs compras, semáforo, ticket prom.), **Presupuesto vs Real** (semanal→anual, input inline que upsert, barra de avance), **Rendimiento por plaza** (cumplimiento tareas + merma).
11. **Facturas privacidad**: OCR (`/api/facturas`) detecta gastos no-mercadería (sueldos/honorarios/adelantos/retiros socios) → `items_excluidos` + `alerta_privacidad` + `proveedor_es_persona`. Lista `nombres_excluidos` en `restaurantes.configuracion` (botón 🛡️ en Facturas). Post-filtro de seguridad en OCR y en `facturas-universal` (importador masivo Fudo). Banner de alerta en confirm.

**Bloque E — Limpieza de datos (post-deploy):**
12. **Facturas personales borradas** (Bros): script `scripts/limpiar-facturas-personales.mjs` (dry-run + `--nombres` + `--apply`). Eliminadas **112 facturas ($63.9M) + 103 items** — 102 con prefijo `"Empleado -"` + 10 de Franco Ghione. Quedan 888 facturas de mercadería. `facturas-universal` ahora también filtra prefijo `"Empleado"`. Franco Ghione guardado en `nombres_excluidos`.

**Migraciones aplicadas en prod**: `haccp_limpieza_calendario_ops.sql`, `presupuestos.sql` (en `supabase/migrations/`). **Commits**: `ac87329` (features) + `8b08b58` (script limpieza) en `main`, deployados.

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
