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
| 3 | **Recetario** | `/recetario` | Funcional | Lista con food cost, detalle `/recetario/[id]`, CRUD ingredientes, cálculo automático, búsqueda, filtros, tabs Recetas/Ideas (drafts), **importación IA** (single + multi). **Ideas: botón "Cargar/Actualizar con IA"** → bottom sheet texto → IA parsea → aplica ingredientes+pasos a la receta existente sin crear nueva (modo `enrichRecetaId` en `/api/recetas/save`). Crear recetas abierto a todos, **importar/exportar solo admin**. **Foto de receta** (PhotoPicker → bucket `fotos`). **Peso total y escurrido** (editables + display en Food Cost). **Costeo en tiempo real** en form ingrediente. **Unidades smart** (kg↔g auto). **Auto-link ingredientes** al stock tras guardar (fire-and-forget). |
| 4 | **Stock** | `/stock` | Funcional | Productos con estado (ok/bajo/crítico), CRUD, categorías, alertas, búsqueda, exportar, **modo rápido** (pantalla grande para stock-take secuencial), precio con fuente reducida. Sheet de selector de sector scrolleable (maxHeight 80vh). |
| 5 | **Pedidos** | `/pedidos` | Funcional | CRUD, items con precios, estados (borrador/enviado/recibido/parcial), productos frecuentes como chips, búsqueda predictiva, WhatsApp y PDF, recepción parcial. |
| 6 | **Proveedores** | `/proveedores` | Funcional | CRUD, CUIT, teléfono, días entrega, rubro, historial facturas por proveedor, **auto-creación** desde facturas con IA. |
| 7 | **Facturas** | `/facturas` | Funcional | Carga con items, tipos A/B/C/X/remito/ticket, **OCR con IA** (Claude Sonnet 4.6) que detecta proveedor/items/total, detección de variaciones de precio, historial, condición de pago. |
| 8 | **Carta** | `/carta` | Funcional | Items vinculados a recetas, food cost preview coloreado, 86, categorías **dinámicas por restaurante** (`carta_categorias`), vincular/cambiar receta inline (search siempre visible, porciones editables con tap), export PDF. **Tags dietarios** toggleables. **Importar con IA**. **Crear receta borrador** desde búsqueda. **Vincular productos de stock** en la misma búsqueda. **Asignar a OPS**: plato_recetas.cantidad_ops+unidad_ops → checklist_item (suma de contribuciones). **Recipientes en OPS**: se configura recipiente (nombre, capacidad, peso_porcion) → mise muestra déficit + CTA "Producir X porc". Panel OPS idéntico en creación y en vista detalle. **Crear idea en recetario** desde buscador de componentes sin resultados. Precio y food cost visible **solo para admin**. **KitchenCoach integrado**. **Foto de plato** (PhotoPicker en form + thumbnail en lista). **Carta pública QR** (jul 2026): `/carta/[slug]` vidriera sin login (route group `app/(publico)/`), 86 en vivo (ISR 60s), sin costos expuestos; activación + QR descargable en Configuración → Restaurante. |
| 9 | **Checklist / Mise en Place** | `/checklist` | Funcional | Mise en place por plaza, items SP/P/REF/OK, cantidades color-coded, registros diarios, rutinas con frecuencia. Drag long-press entre secciones. **Plaza General**: items/secciones/rutinas con `plaza='general'` aparecen en TODAS las plazas al tope. **Modo Control**: botón `fact_check` en header → vista simplificada (tick + nombre, sin cantidades) para onboarding de nuevos restaurantes. Persiste en localStorage. **Auditoría (jul 2026, M4)**: una rutina con `puntaje` configurado se vuelve ítem de auditoría — botones OK/Falla, foto obligatoria opcional (`PhotoPicker`), condicional (mostrar solo si otro ítem respondió ok/fallo), score en vivo por plaza+día (`checklist_auditorias`), Falla crea tarea automática. |
| 10 | **Pase de Turno** | `/pase` | Funcional | Chat continuo entre turnos, grouping por emisor (sin avatar repetido), prioridades, crear tarea desde mensaje, realtime. |
| 11 | **HACCP / Limpieza** | `/haccp` | Funcional | 3 tabs: Temperaturas, Vencimientos (color coding por días), **Limpieza** (sub-tabs Lista/Calendario; crear tarea con día + frecuencia; sync a OPS checklist plaza General). Export PDF para Bromatología. |
| 12 | **Reportes / CMV** | `/reportes` | Funcional | 10 tabs: Resumen, **CMV** (ventas vs compras), **Presupuesto vs Real** (semanal→anual), **Rendimiento por plaza**, Food Cost, Compras, Precios/inflación, Producción, **Caja** (historial de cierres), **Auditoría** (jul 2026, M4 — evolución del score de checklists por plaza+fecha, export Excel + PDF). Selector de periodo, gráficos CSS (sin Chart.js). **Export Excel** (jul 2026): botón "Exportar" contextual a CMV/Compras/Food Cost/Presupuesto/Rendimiento/Caja/Auditoría, mismos números que la pantalla + hoja de metadatos, reusa `lib/exportar.ts` (el mismo helper de Stock). |
| 13 | **Calendario** | `/calendario` | Funcional | Vista mensual + semanal por horas, eventos con iconos/colores, entregas de pedidos auto-integradas, CRUD eventos, recurrencia. |
| 14 | **Turnos / Equipo** | `/turnos` | Funcional | 3 tabs: Equipo (form 2 pasos datos→puesto, ficha con overrides de módulos), Turnos (grilla semanal), Puestos (toggles de módulos reales, nivel badge, plaza OPS, template picker con 8 puestos comunes). **Sistema de puestos**: cada puesto define `nivel` (admin/sous_chef/cocinero/bachero) + `plaza_default` + `modulos_visibles[]`. Overrides por persona (`modulos_extra`, `modulos_restringidos`). DB: `puestos.nivel+plaza_default`, `equipo_miembros.modulos_extra+restringidos`. |
| 15 | **Producción / Planificación** | `/produccion` | Funcional | Planilla de producción del día. **Calendario mensual** con dots indicadores (verde = activo, naranja = evento/tag). **Multi-select** para activar N días con nombre de menú opcional (`menu_tag`). Soporte multi-menú en mismo día con filtro chips. Asignación a miembros, badges P1/P2/P3. **Sugerir producción** (jul 2026, E1): botón que calcula qué producir según ventas históricas del mismo día de semana menos stock actual de mise (`lib/produccion/sugerencia.ts`), preview editable → crea tareas reales; "Explicar con IA" narra cada número (Claude Haiku, nunca los cambia); mismo motor disponible como tool del Coach (`sugerir_produccion`). |
| 25 | **Mesa de Trabajo** | `/espacios` | BETA (desktop) | Board anidado: Espacios físicos → Plazas (7 fijas) → Secciones (editables, tipadas: producción/almacén/heladera/freezer/estación) → **sub-secciones (1 nivel, jul 2026)** → Producciones (`checklist_items`). Drag cross-plaza. **Panel OPS** al clickear una producción: nombre editable, prioridad (SP/P/REF/OK), plaza con colores, sección, cantidad+unidad, recipiente (optional), porciones/peso recipiente lleno, tamaño por porción con cálculo automático "= N porciones". Autocomplete de recipiente desde historial del restaurante. Limpieza por scope espacio/plaza/sección. Solo desktop (`useIsDesktop()`); mobile muestra mensaje amigable. |
| 24 | **OPS — Workspace diario** | `/operaciones` | Funcional | **Única puerta de entrada** al trabajo diario. **3 tabs**: Producción · Mise · Planificación (deep-link `?tab=`). Producción: secciones con sublabels (SP·Super Prioridad, P·Prioridad, REF·Refuerzo), toggle Carta/Menú con subtítulo, QuickAdd con sugerencias de receta (≥3 chars). Checklist: auto-select plaza por rol, progreso por plaza en grid. **`/tareas`, `/checklist`, `/produccion` redirigen acá** (rutas viejas; la vista vive embebida). |
| ~~23~~ | ~~OPS — Ingeniería de Menú~~ | ~~`/ingenieria-menu`~~ | **Eliminado (2 jun 2026)** | Página y referencias en `constants.ts` removidas. Los tipos `CategoriaPlato`/`PlatoComponente` y la lógica `sync_ops` de `plato_componentes` se mantienen (los usa Producción). |
| 16 | **Merma** | `/merma` | Funcional | Bottom sheet desde dashboard y módulo propio, 8 motivos con iconos, turno, plaza, costo estimado. |
| 17 | **Configuración** | `/configuracion` | Funcional | Tabs: restaurante, plazas, rutinas, permisos por rol. Link a `/turnos` para gestión de equipo (sin tab de invitación). Tab Restaurante: card **Carta pública** (toggle `carta_publica_activa`, slug editable, QR descargable). |
| 18 | **Auth** | `/login`, `/register` | Funcional | Login email+password, registro (crea restaurante + user_restaurantes + equipo_miembros + rol_permisos seed), reset password por email, proxy.ts protege rutas. **Ver demo** (jul 2026): botón en login entra sin fricción a un clon de El Rescoldo (`00000000-0000-0000-0000-000000000002`), lectura-escritura real, reseteado cada noche por cron (`reset_demo_restaurante()`). Banner persistente en sesión demo → `/register`. |
| 19 | **Perfil** | `/perfil` | Funcional | Avatar, datos, cambiar contraseña, cerrar sesión. Linkado desde el header del dashboard. |
| 20 | **Kitchen Coach (IA)** | API `/api/coach` + FAB | Funcional | Chat UI con FAB draggable. Overlay SVG tutorial. Tour guiado OPS 11 pasos. Chips de respuesta. **Suggestions dinámicas por pantalla**: en Carta muestra sugerencias de análisis de carta, food cost, import. **Integración con Carta**: screen context con FC promedio, platos problema, sin receta; highlights `carta-importar`, `carta-rentabilidad`, `carta-lista`, etc. |
| 21 | **Modo Servicio / Salón** | `/salon` | Funcional | Mapa de mesas con **forma/tamaño/rotación reales** (editor tipo canvas en `/salon/config`, jul 2026), abrir cuenta, vista de comanda: buscador de carta, agregar ítems con modificadores (con/sin/extra) + notas, draft editable, panel "Pedido en curso" con estado en tiempo real, enviar. Topbar con total en curso + acceso a KDS/configuración + **Kitchen Coach propio** (jul 2026). En desktop convive con el sidebar de gestión (antes tapaba toda la pantalla). Sin conexión: botón bloqueado + banner. `ModoServicio.tsx` en dashboard (botón de acceso) también existe pero no conectado. |
| 26 | **KDS (Kitchen Display)** | `/kds` | Funcional | Selector de estación (persistido en localStorage por dispositivo). Grilla de tarjetas por comanda: mesa, mozo, cronómetro ticket-time (verde/amarillo/rojo por umbral 5/10 min), lista de ítems con estado, bump por ítem y bump de comanda completa. Solo muestra ítems de la estación activa. Labels en español (EN ESPERA, Consolidado, Recuperar, Despachado, MARCHAR, DESPACHAR COMANDA — jul 2026). Sin Kitchen Coach (regla inamovible, cero distracciones en despacho). Sin conexión: bumps se encolan en IndexedDB y se reenvían al reconectar. |
| 22 | **Ventas** | `/ventas` | Funcional | Importación desde Excel/CSV (xlsx) y texto libre con IA (Haiku). Pantalla de revisión editable antes de guardar. Tab Resumen con KPIs y lista de ventas con detalle de items. Requiere migración SQL (`ventas` + `ventas_items`). |

**Resumen:** 26 módulos funcionales (salón y KDS ahora completos), 0 parciales, 0 críticos pendientes.

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

### Servicio / Salón / Cobro / Fiscal — Fase 1 (12, jun 2026)
`estaciones`, `comandas`, `comanda_items`, `comanda_item_modificadores`, `eventos_cocina`, `mesas` (pos_x/pos_y + forma/ancho/alto/rotacion, jul 2026), `cuentas`, `medios_pago`, `pagos`, `config_fiscal`, `comprobantes`, `comprobante_items`

**Total: 43 tablas** con RLS habilitado. Aislamiento multi-tenant real via `mi_restaurante_id()`. Todas las políticas UPDATE tienen `WITH CHECK` explícito. Listo para multi-tenant.

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
| 10 | Info | **Vitest**: 13 tests de máquina de estados ✅. **Playwright**: `e2e/salon-kds.spec.ts` + `npm run test:e2e` ✅ (requiere `npx playwright install chromium` + dev server). Testing Library para hooks pendiente. | — |

---

## 4. Implementado en Últimas Sesiones

### Sesión 2026-07-10 (cont.) — E1 Producción sugerida con IA: motor de reglas + capa IA/Coach (`PLAN-ROADMAP-COMPETENCIA-2026-07.md`)

Primer bloque de la fase E (apuestas estratégicas) — "el único sistema que te dice qué producir". Motor de reglas `lib/produccion/sugerencia.ts`: para un día objetivo (default mañana), promedia las ventas históricas del mismo día de semana (últimas 8 semanas, mínimo 2 muestras) por receta — matching `ventas_items.nombre_plato` ↔ `recetas.nombre` por nombre normalizado exacto (mismo criterio que ya usan `ventas/page.tsx` y `carta/page.tsx`, sin fuzzy) — y le resta el **stock actual real** de mise (`checklist_registros.cantidad_actual` más reciente, no el target `checklist_items.cantidad`). Endpoint `GET /api/produccion/sugerencia` con `requireRestauranteId()` (server client + RLS, mismo patrón que `/api/stock/sugerir-minimos`). UI: botón "Sugerir producción" en OPS → Planificación abre `SugerenciaProduccionSheet` (preview editable, checkbox + cantidad por ítem) → "Crear N tareas" inserta en `tareas` clonando el shape de `activarMenu` (hereda el carryover de 1 día gratis). **Decisión de diseño de la capa IA:** Claude Haiku solo **narra** la sugerencia (una línea por ítem, botón "Explicar con IA") — nunca cambia los números — para que el botón de OPS y la tool nueva del Coach (`sugerir_produccion`, ahora 5 tools en `/api/coach`) siempre muestren la misma fuente; el Coach llama la misma función `calcularSugerenciaProduccion` directo, no por HTTP. Gotcha de calidad encontrado en verificación: el primer prompt de explicación a veces mezclaba el nombre de un ítem con el número de otro al procesar varios juntos — fix con una instrucción explícita en el prompt, sin tocar la lógica numérica. Verificado con datos reales de Bros (163 días de ventas ene–jul 2026): para el viernes 2026-07-10 con 12 semanas de historia, sugirió Hummus 6 (vendía 6,3 promedio, stock 0), Pollo frito 4, Bife 3, y correctamente **no** sugirió Berenjenas agripicantes (vendía 5 promedio pero había 50 en stock real). El botón creó 3 tareas reales con `receta_id`/`cantidad`/`turno_fecha` correctos; el tool del Coach devolvió los mismos números narrados y derivó al usuario al botón de OPS para confirmar (de solo lectura). Datos de prueba borrados. `npm run build` limpio.

### Sesión 2026-07-10 — Sesión 3 (Salón + KDS) de `PLAN-MEJORAS-OPS-SALON-MESA-2026-07.md` — plan completo

Tercera y última sesión del plan Salón/Mesa/OPS. **C1 — shell desktop:** el `<aside>` del sidebar de gestión, hasta ahora inline en `DesktopShell.tsx`, se extrajo a `components/shell/SidebarNav.tsx` (prop `dark` para adaptarlo a fondo `#161616`/borde `#2a2a2a` en vez de `var(--navy)`). `(servicio)/layout.tsx` detecta `useIsDesktop()`: en ≥1024px arma un flex-row `SidebarNav + contenido` (el salón/KDS conviven con la navegación de gestión en vez de taparla); en mobile/tablet sigue `position: fixed; inset: 0` full-screen, sin cambios de comportamiento.

**C3 — editor de mesas tipo canvas:** migración `20260710_mesas_forma_canvas.sql` (`mesas.forma TEXT DEFAULT 'cuadrada'`, `ancho`/`alto NUMERIC DEFAULT 8` en % del canvas — mismo sistema que los `pos_x`/`pos_y` ya existentes —, `rotacion INT DEFAULT 0`). La tab "Mesas" de `salon/config/page.tsx` se reescribió por completo: de un formulario con inputs de número/sector/capacidad a un editor visual — canvas punteado con las mesas arrastrables (Pointer Events, threshold 8px para distinguir tap de drag, `setPointerCapture`, mismo patrón "FAB draggable" documentado en `ui.md`) y un panel de propiedades al seleccionar una mesa (forma con 3 chips + preview, tamaño chico/mediano/grande, rotación 0°/45°/90°). El guardado de posición es batch al soltar (`useMesas.guardarLayout`, nuevo — `Promise.all` de updates), no en cada frame de arrastre. `MesaBoton` (mapa real de `salon/page.tsx`) y `MesaCanvasItem` (editor) leen `forma`/`ancho`/`alto`/`rotacion` reales — antes el mapa real ya tenía `pos_x`/`pos_y` funcionando pero todas las mesas eran cuadrados fijos de 72px sin importar lo cargado en DB.

**C4 — barra superior + Kitchen Coach:** el header de la vista "mapa" de Salón ahora muestra el total en curso (`calcularResumen(comandas).subtotal`, la misma función que ya usaba el cobro) y un botón para ir directo a KDS, además del botón de configuración que ya existía. `<KitchenCoachFAB/>` se monta ahí (solo en esa vista, nunca en KDS — regla inamovible de `ui.md`) con su propio contexto (`kc_screen_context`, screen `'salon'`: mesas ocupadas/libres, cuentas con estado `cuenta_pedida`, total en curso) y un tour nuevo de 2 pasos + cierre (`TOURS.salon` en `lib/coach/tours.ts`, targets `salon-topbar`/`salon-mapa`). Como el contexto de `useSheetCount()` tiene default `sheetCount: 0` sin necesidad de un `UiChromeProvider` ancestro, el FAB funciona sin envolver nada extra.

**C5 — KDS en español:** labels traducidos a español argentino manteniendo la mecánica de swipe/bump intacta: `EN HOLD`→"EN ESPERA", `All-day`→"Consolidado", `Recall`→"Recuperar" (botón y panel), `Bumpeado`→"Despachado" (label de estado y "Sin comandas... recientes"), `BUMP COMANDA`→"DESPACHAR COMANDA", `FIRE — Marchar`→"MARCHAR", "Platos bumpeados"→"Platos despachados" (panel de métricas). Se dejó "86" sin traducir (jerga de cocina ya asentada en toda la app, documentado como excepción explícita en `ui.md`).

**C2 (estética) — ya estaba mayormente resuelta:** las convenciones de servicio (fondo oscuro, Material Symbols, radios/spacing consistentes) ya venían de sesiones previas. El pase de `ui-auditor` sobre las pantallas tocadas encontró un hallazgo **crítico** real: la tab "Mesas" reescrita heredó `var(--navy)` en 4 lugares (header, tab activo, botones de Medios/Estaciones) de la versión anterior del archivo — `--navy` (a diferencia de `--accent`, que es fijo en `#4361a0` en ambos temas) **sí se invierte en dark mode** (`#1c2d4a`→`#c8d6e5`, celeste pálido), rompiendo el contraste sobre el fondo `#111` fijo del resto de servicio. Corregido a hex fijo `#1c2d4a`. También ajustó área táctil (`MesaCanvasItem` y los chips de Tamaño/Rotación del panel de propiedades, de 44px a 64px, para cumplir la regla "botones masivos" de servicio) y sumó `aria-label` a los 3 botones nuevos del topbar.

**Deuda documentada, fuera del commit deliberadamente:** el botón "Caja" que hoy se ve en el topbar de `/salon` en producción viene de una **sesión paralela sin commitear** (feature de arqueo de caja / `VistaCaja.tsx`) que ya estaba en el working tree antes de empezar esta sesión — no se incluyó en este commit para no mezclar features de sesiones distintas ni depender de un `type Vista` (`'caja'`) que todavía no existe en `main`. Cuando esa sesión se commitee, sumar el botón "Caja" al topbar nuevo es un `onClick={() => setVista('caja')}` de una línea, ya está escrito en el working tree.

**Deploy — el más entrelazado de los tres:** `app/(servicio)/salon/page.tsx` traía ~1000 líneas de diff sin relación (el refactor de ESC/POS a `lib/print/escpos.ts` + extracción de `VistaCaja.tsx`, de la sesión paralela mencionada arriba) mezcladas con los 4 cambios propios de esta sesión (import de `KitchenCoachFAB`, `MesaBoton`, el `useEffect` de `kc_screen_context`, y el topbar). Se reconstruyeron a mano 4 patches quirúrgicos contra el HEAD real (no contra el working tree, que ya tenía la mezcla) — extrayendo el contenido exacto de `git show HEAD:archivo`, calculando offsets de línea con cuidado, y verificando cada uno con `git apply --check --cached` antes de aplicarlo de verdad. El resto de archivos (`SidebarNav.tsx` nuevo, `salon/config/page.tsx` reescrito completo, `kds/page.tsx`, `useMesas.ts`, `tours.ts`, `KitchenCoachFAB.tsx`, la migración) no tenían mezcla y se staged directo. `npm run build` limpio, verificado aislado (`git stash -u` del resto del working tree → build → `stash pop` sin conflictos). Commit `7c75f4b`, push a `main`.

**Plan `PLAN-MEJORAS-OPS-SALON-MESA-2026-07.md` completo** — Sesión 1 (OPS + Recetario), Sesión 2 (Mesa de Trabajo) y Sesión 3 (Salón + KDS) cerradas.

### Sesión 2026-07-10 (cont.) — Sub-secciones anidadas en Mesa de Trabajo + Mise (1 nivel)

Pedido de Facundo tras ver una sección "Heladera" de Mesa de Trabajo con 26 producciones en lista plana, sin poder agruparlas (ej. "Guarniciones" vs "Salsas/Aderezos"). Confirmado por AskUserQuestion: sub-secciones reales anidadas (no un tag de texto), visibles tanto en Mesa de Trabajo como en Mise. `checklist_secciones` suma `parent_id UUID NULL REFERENCES checklist_secciones(id) ON DELETE CASCADE` — mismo patrón que `tareas.parent_id` (subtareas). **v1: 1 solo nivel de profundidad**, aplicado a nivel de UI (`depth` prop, sin afordance de "+ subsección" en filas ya-hijas) y no como CHECK en DB, para poder relajarlo después sin migración nueva. `lib/checklist/secciones.ts` (nuevo) centraliza `seccionTieneContenido()` — guard de borrado recursivo (bloquea si la sección o cualquier hijo tiene ítems/productos). `SectionEditor.tsx` reescrito para árbol de 1 nivel; `OpsPanel.tsx` suma "Subsección de {raíz} (opcional)" con auto-materialización de la raíz si todavía era virtual (una de las 4 de `SECCIONES_OPS`); Mise anida los hijos dentro de la card de su raíz; Mesa de Trabajo (`PlazaRow.tsx`/`SeccionRow.tsx`) recursa un nivel con indentación. Aislamiento de commit: `checklist/ClientView.tsx` tenía ~250 líneas mezcladas con una feature de auditoría (M4) de otra sesión sin commitear — extraídos a mano los hunks propios, descartando 2 props (`restauranteNombre`/`onCrearVencimiento`) que pertenecen a esa otra feature y no existen en el `ProductoMiseCard` real de `main`. `npm run build` limpio, aislado con `git stash`. Commit `088071b`, push a `main`.

### Sesión 2026-07-09 (cont. 3) — Sesión 2 (Mesa de Trabajo: secciones editables + tipadas) de `PLAN-MEJORAS-OPS-SALON-MESA-2026-07.md`

Segunda de 3 sesiones del plan Salón/Mesa/OPS. **Hallazgo inicial que redujo el scope:** el plan pedía construir un editor de secciones (rename/reorder/borrar) desde cero, pero **ya existía completo** en Mise (`SectionEditor`, embebido en `checklist/ClientView.tsx`, con guard de borrado si la sección tiene ítems) — solo faltaba en Mesa de Trabajo. Se extrajo a `components/checklist/SectionEditor.tsx` (fuente única) y se sumó como botón "Agregar sección" por plaza en `espacios/ClientView.tsx` (antes usaba `window.prompt`). También se endureció el borrado directo de sección en el board (`SeccionRow.tsx`): antes no tenía guard alguno, ahora se bloquea si tiene producciones o productos asignados.

**B2 — OpsPanel dinámico:** `components/ops/OpsPanel.tsx` dejó de ofrecer solo las 4 secciones fijas de mise (`SECCIONES_OPS`) — ahora carga las `checklist_secciones` reales de la plaza elegida (fetch on-demand al elegir plaza) + las 4 default como fallback si la plaza no tiene ninguna con ese nombre, más un flujo inline "+ Nueva sección" que crea la fila en DB al toque. `upsertMiseChecklistItem` (`lib/ops/mise.ts`) ahora acepta un UUID real de `checklist_secciones` como `seccionMiseId` (antes solo aceptaba los 4 ids legacy, que buscaba/creaba por label). **Bug real encontrado en la verificación (no en el happy path, en el prefill al reeditar):** 3 de los 4 consumidores del panel (`IngredienteOpsSheet`, `ItemRowInline` dentro de `ComposicionEditor.tsx`, y `RecetaOpsSheet`) reconstruían el valor inicial de "sección" con `SECCIONES_OPS.find(s => s.id === ... )`, que devuelve `undefined` para cualquier sección custom — al reabrir el panel de una asignación ya guardada con sección personalizada, el campo aparecía vacío en vez de mostrar la selección real. Corregido pasando el id/UUID guardado directo (sin el remapeo innecesario) y, en `RecetaOpsSheet`, prefiriendo la columna `checklist_items.seccion_id` (existía en DB, no se usaba) sobre el matching por label legacy. De paso se evitó que un badge de `ComposicionEditor` mostrara un UUID crudo como texto cuando no reconocía la sección. **RLS de `checklist_secciones` ya estaba bien** (4 policies con `restaurante_id = mi_restaurante_id()`) — el plan asumía `USING(true)` desactualizado del `RLS-PLAN.md`; no hizo falta correr `/add-rls`.

**B3 — Secciones tipadas:** migración `20260709_checklist_secciones_tipo.sql` — `checklist_secciones.tipo TEXT NOT NULL DEFAULT 'produccion'` (`'produccion'|'almacen'|'heladera'|'freezer'|'estacion'`) + `producto_ids UUID[] NOT NULL DEFAULT '{}'`. El editor de secciones extendido suma un selector de tipo (chips con ícono) y, solo si tipo=Almacén, un picker de productos del stock (búsqueda + checkboxes, fetch on-demand). Secciones Almacén con productos asignados suman un botón "Stockear sección" (`StockearSeccionOverlay.tsx`, overlay full-screen zIndex 1000 — versión simplificada del modo Stockear de `/stock`: lista con inputs numéricos por producto en vez del wizard uno-a-uno, decisión consciente para no replicar toda esa complejidad) que actualiza `productos.stock_actual` en batch vía `useStock().actualizarStock`. Secciones Heladera/Freezer suman `HaccpSeccionLink.tsx` — un badge compacto con la última temperatura registrada (match `haccp_equipos.nombre ilike` nombre de la sección → `haccp_temperaturas` más reciente) y la próxima limpieza programada (`haccp_limpieza`, por día de semana/mes), con deep-link a `/haccp`; no duplica ningún form de HACCP.

**Decisión de diseño — `tipo`/`producto_ids` opcionales en el tipo TS pese a ser `NOT NULL` en DB:** al principio se declararon requeridos, y el build falló porque `checklist/ClientView.tsx` tiene su propio `SectionEditor` legacy embebido (con lógica de alta rápida ligeramente distinta, nunca migrada a usar el componente compartido — quedó fuera de esta sesión) que construye objetos `ChecklistSeccionConfig` sin esos campos. En vez de forzar una migración de ese archivo (fuera de scope, grande, con riesgo de tocar código de otra sesión en curso — ver nota de deploy abajo), se optó por marcar los campos opcionales en el tipo (`tipo?`, `producto_ids?`) — la columna real en DB sigue con su default, el tipo TS es simplemente un poco más laxo de lo estrictamente necesario. Deuda documentada: si se quiere igual de estricto, hay que migrar `checklist/ClientView.tsx` al `SectionEditor` compartido en una sesión futura.

**Cierre de sesión:** `ui-auditor` sobre los 5 archivos nuevos/tocados encontró y se corrigieron 6 problemas: ícono `×` literal en vez de Material Symbol (+ sin `aria-label`) en `OpsPanel.tsx`; chips de "tipo" en `SectionEditor.tsx` a `fontSize: 10` — el auditor señaló correctamente que este componente **no es desktop-only** (se usa también en Mise, que es mobile-first), así que 10px era un problema real de usabilidad táctil, no solo estético — subido a 12-14px; hex `#4361a0` hardcodeado en vez de `var(--accent)`; el guard de borrado de sección en `SeccionRow.tsx` solo miraba `items.length` y no `producto_ids` (una sección Almacén con productos pero sin producciones de mise podía borrarse sin avisar) — corregido; ícono de borrar sin color rojo (inconsistente con el mismo ícono en `SectionEditor`/`OpsPanel`) — unificado; empty state de `StockearSeccionOverlay` con un `<p>` suelto en vez del componente canónico `<EmptyState>` — reemplazado.

**Deploy:** mismo patrón de aislamiento que Sesión 1 — el repo seguía con ~57 archivos de otras sesiones sin commitear (incluye una feature grande de checklist de auditoría, M4, que resultó tener su propio diff de 535 líneas en `checklist/ClientView.tsx`, demasiado entrelazado con mis cambios para separar línea por línea con confianza). Se armó el commit con `git apply --cached` de patches parciales para los archivos con mezcla real (`types/index.ts`, `columnas.md`, `useChecklist.ts`), dejando `checklist/ClientView.tsx` completamente afuera del commit (decisión que forzó la de arriba sobre campos opcionales). Un primer intento de verificar el build en aislamiento con `git stash push --keep-index` + `pop` generó un conflicto de merge real (el pop después de keep-index reaplica todo el stash incluso lo ya indexado) — se resolvió a mano el único conflicto (una línea de imports) y se rehizo el staging desde cero con el flujo más seguro: commitear primero, después `git stash` (sin `--keep-index`) del resto, buildear, `pop` limpio. `npm run build` limpio contra el commit real. `vercel --prod` sigue con `VERCEL_TOKEN` inválido en este shell — deploy vía `git push` (commit `58e8e35` → main → Vercel auto-deploy).

**Sesión 3 (Salón + KDS) completada el 10 jul 2026** — ver entrada arriba.

### Sesión 2026-07-09 (cont. 2) — Sesión 1 (OPS + Recetario) de `PLAN-MEJORAS-OPS-SALON-MESA-2026-07.md`

Primera de 3 sesiones del plan de mejoras Salón/Mesa/OPS; esta cubrió las tareas de Producción y Recetario. **A1 (modo Evento):** `OpsModo` suma `'evento'` — Producción lo renderiza igual que `'menu'` (agrupado por sección, `SECCIONES_MENU`), `OpsToggle` suma la tercera pill, y `activarMenu` en `produccion/page.tsx` ahora deriva el modo del `menu.tipo` en vez de hardcodear `'menu'`. Sin migración (`tareas.modo` es TEXT libre). **A2 (carryover invertido):** antes, si la tarea de ayer seguía pendiente, `activarMenu` directamente NO creaba la de hoy (dedup por título); ahora crea siempre la de hoy y borra la de ayer de la DB — el `ON DELETE CASCADE` de `tareas_parent_id_fkey` se lleva las subtareas solo. Sumada una red de seguridad en `tareas/ClientView.tsx` (no solo en `activarMenu`): si por cualquier otro camino queda un duplicado de ayer con mismo título+modo que uno de hoy, se oculta de la lista y se dispara `eliminarTarea` (función del hook, nunca insert/delete directo contra Supabase). **A3 (mise con estándar):** los 3 stock boxes de `ProductoMiseCard` (apertura simple, apertura con recipiente, cierre) ahora muestran `actual / estándar` en vez de solo el número cargado — sin conversiones, el usuario sigue cargando en la unidad tal cual. **A4 (reorganización de Planificación):** el header pasó de 3 botones (Días/Activar/+Plato) a un único CTA blanco "Cargar menú"; el picker de menú ahora tiene un paso "¿Un día o varios?" con un mini-calendario inline para elegir varios días (reemplaza el calendario colapsable que vivía suelto en el header); "Plato suelto" (antes "+ Plato") bajó a link ghost en el empty state y en `MenuActivoView`. **B1 (etapas de ingredientes):** migración `20260709_ingredientes_grupo.sql` agrega `ingredientes.grupo TEXT NULL` (NULL = "General"). La ficha del recetario agrupa los ingredientes por `grupo` con un header de etapa editable inline (`IngGrupoHeader`, componente nuevo a nivel de módulo — no inline, para evitar el anti-patrón de remount de `hooks.md`) y un selector de etapa (existentes de la receta + "Nueva etapa…") al agregar/editar un ingrediente; el editor de creación (`recetario/page.tsx`, flujo fila-por-fila) suma el mismo concepto vía una "etapa actual" que se asigna a los ingredientes que se van tipeando. El food cost sigue calculándose sobre la lista plana de ingredientes, sin cambios.

**Cierre de sesión:** `ui-auditor` sobre los 4 archivos tocados encontró (y se corrigieron) 3 problemas reales: opacity .55 sobre colores de estado en los nuevos textos "/ target" de mise (riesgo de contraste, sobre todo en ámbar) → reemplazado por `color: var(--text-3)` sin opacity; badge Evento/Fijo del picker con hex claro fijo (no reacciona a dark mode) → tinte alfa; emoji 🧂 + hex hardcodeado en el empty state "Sin ingredientes" de la ficha → ícono Material Symbol + `var(--text-3)`. El auditor también señaló que buena parte de `produccion/page.tsx` (badges, tabs, empty states) sigue sin migrar a los componentes canónicos D0 (`HeaderAction`/`FilterChips`/`SegmentedTabs`/`EmptyState`/`Num`) — deuda pre-existente, no introducida por esta sesión, queda como backlog explícito en vez de expandir el scope acá.

**Deploy:** `npm run build` corrido dos veces — una vez contra el working tree completo (con el resto de sesiones en curso sin commitear) y otra vez aislando SOLO el commit de esta sesión con `git stash -u` (el repo tenía ~55 archivos de trabajo ajeno sin commitear: salón, fiscal, docs). El commit de Sesión 1 se armó quirúrgicamente con `git apply --cached` de patches parciales para 3 archivos que ya tenían cambios ajenos mezclados (`types/index.ts`, `.claude/docs/columnas.md`, `components/mise/ProductoMiseCard.tsx`) — se extrajeron solo los hunks de esta sesión y se dejó el resto sin commitear/intacto en el working tree. `vercel --prod` falló por `VERCEL_TOKEN` inválido en el shell; deploy real vía `git push` (commit `f309a41` → main → Vercel auto-deploy).

**Plan completo el 10 jul 2026** — Sesión 2 (Mesa de Trabajo) y Sesión 3 (Salón + KDS) cerradas, ver entradas arriba.

### Sesión 2026-07-09 (cont.) — M4 Checklists nivel auditoría: scoring + foto obligatoria + condicionales + workflow (`PLAN-ROADMAP-COMPETENCIA-2026-07.md`)

Último bloque de la fase M del roadmap — eleva el checklist de K-OS de operativo a auditable (idea robada de Iristrace). **Decisión de scope:** el plan pedía extender `checklist_rutina` *y* `checklist_items`; se implementó solo sobre `checklist_rutina` (controles periódicos tipo "Control de heladeras" — el análogo real a un checklist de auditoría) y no sobre `checklist_items` (mise diario de stock/OPS, otra semántica, sin caso de uso concreto). Migración `20260709_checklist_auditoria.sql`: `checklist_rutina` +`puntaje`/`requiere_foto`/`condicion JSONB` (`{dependeDeId, mostrarSiEstado}`); `checklist_rutina_registros` +`estado ('ok'|'fallo')`/`foto_url`; tabla nueva `checklist_auditorias` (snapshot de una pasada por plaza+fecha, RLS estándar). Un ítem con `puntaje` se vuelve ítem de auditoría en el tab Rutina del checklist: botones OK/Falla en vez del check simple, bloqueados hasta subir foto (reusa `PhotoPicker`) si `requiere_foto`, oculto hasta que se cumpla su `condicion`. Barra de score en vivo; al quedar evaluados todos los ítems aplicables del día se guarda el snapshot solo (sin botón "cerrar pasada", mismo espíritu auto-save del resto del mise). Marcar Falla crea una tarea automática (dedup por título+fecha). `AddRutinaSheet` ahora también edita (antes solo alta); las rutinas sincronizadas desde HACCP→Limpieza bloquean nombre/frecuencia en el sheet. Reportes suma tab "Auditoría": gráfico de evolución del score, lista de pasadas, export Excel (patrón Q3) y export PDF dedicado (clon de `exportHaccpPDF`). **Gotcha real de la sesión:** `fetchAuditorias` se escribió como función async plana (como el resto del CRUD del hook) pero Reportes la usa en el array de deps de su propio `useCallback` (`loadTab`) — sin memoizar generaba un loop infinito de renders (la tab quedaba en "Cargando…" para siempre). Fix: `useCallback` igual que el resto de los `fetchX` del hook. Documentado en `.claude/docs/hooks.md` (#10). Verificado con Playwright contra El Rescoldo: foto obligatoria bloquea OK/Falla hasta subir imagen, condicional se oculta/muestra según el estado del ítem del que depende, Falla crea la tarea, Reportes → Auditoría muestra el score y ambos exports descargan bien. Datos de prueba borrados (queda un archivo huérfano de 1×1px en `fotos/checklists/` sin poder borrarse por API — bucket sin política DELETE + gotcha ya conocido del service role con Storage REST, inofensivo). `npm run build` limpio.

### Sesión 2026-07-09 — M3 Fichaje real: clock-in/out → costo laboral (`PLAN-ROADMAP-COMPETENCIA-2026-07.md`)

El plan proponía una tabla `fichajes` nueva; la investigación encontró que `turnos_personal` **ya existía** (con RLS estándar, 34 filas previas, y ya consumida por `reportes/personal`) — se reusó en vez de duplicar el concepto, sumando solo `editado_por`/`editado_at` (auditoría) y `equipo_miembros.costo_hora`. Hook nuevo `lib/hooks/useFichaje.ts` (marcar entrada/salida, quién está adentro ahora, historial por persona, edición manual admin). El botón "Iniciar/Cerrar turno" del dashboard (antes 100% localStorage decorativo) ahora escribe en DB de verdad, con el localStorage como cache visual. Turnos → tab nueva "Fichajes": todos los roles ven sus propios fichajes sin costos; solo admin ve quién está adentro en vivo + historial/edición de todo el equipo. `costo_hora` en el form de Equipo, gateado por `isAdmin` ("— solo vos lo ves"). Reportes → CMV: nuevo KPI "Costo laboral" (horas fichadas × costo_hora del período, admin-only) — `null` explícito (no $0) si nadie tiene costo_hora cargado, con mensaje invitando a completarlo. **Gotcha real de la sesión:** `turnos_personal.horas_total` es columna `GENERATED ALWAYS` — mandarla en el UPDATE de cierre de turno rompía con 400, silenciado por el propio patrón "no bloquea" (`try/catch` vacío) que dejaba la UI mostrando el turno cerrado sin que `salida` se guardara en DB; detectado cruzando contra la base, no contra la UI. Documentado en `.claude/docs/hooks.md` (#9) y `.claude/docs/columnas.md`. Verificado con Playwright + SQL directo contra El Rescoldo: ciclo completo iniciar→cerrar turno persiste correctamente, y con una fila de prueba de 5h en junio (único período con ventas cargadas) Reportes mostró "Costo laboral $25.000" exacto (5h × $5.000). Datos de prueba borrados al final. `npm run build` limpio.

### Sesión 2026-07-08 — M5 Cuentas por pagar (`PLAN-ROADMAP-COMPETENCIA-2026-07.md`) + limpieza de inconsistencias entre planes

Antes de M5: relevamiento de los 6 planes activos del repo (agente de investigación) y corrección de lo que estaba desincronizado — `PLAN-MEJORAS-RECETARIO-CARTA-OPS-2026-07.md` tenía el header "PLANIFICADO" pese a las 4 tandas ya hechas; `PLAN-UI-IDENTIDAD-2026-07.md` tenía D6/D7 sin tildar aunque el propio `ESTADO-ACTUAL.md` ya documentaba ambos como hechos (verificado en código: `RouteGuard.tsx` y el label "Tareas hoy" del dashboard existen); `PLAN-WEB-ESCRITORIO.md` marcaba todas las fases sin hacer pese a que Fase 0 (`DesktopShell`+`useIsDesktop`) y partes de Fase 1/2 ya estaban implementadas desde el 22 jun — corregido a parcial, explicitando qué falta de verdad (drag&drop, grilla editable, atajos); `RLS-PLAN.md` tenía la verificación final sin tildar pese a las 44 tablas con RLS real — al cerrarlo se corrió `get_advisors` de Supabase por primera vez en la sesión y no vino 100% limpio: 2 warnings son las excepciones ya documentadas (`restaurantes_insert`, `demo_visitas_insert`), pero aparecieron hallazgos nuevos fuera de alcance (`reset_demo_restaurante()` ejecutable por `anon` vía RPC, extensión `unaccent` en schema público, bucket `fotos` con listado público, protección de contraseñas filtradas desactivada) anotados como ítem 19 de `PENDIENTES.md` para una sesión de hardening futura. Tanda D de Recetario/OPS (completada la noche del 7 jul, después del cierre de la sesión anterior) sumada al historial.

M5 en sí: la base "Por pagar" en Facturas ya existía de una sesión previa (filtro + agrupado por proveedor + card de dashboard con el total) — este bloque la llevó a lo que pedía el plan. Helper nuevo `lib/utils.ts › calcularVencimientoFactura()`: `30dias`/`60dias` calculan vencimiento real desde `fecha_factura`; decisión de la sesión — `cuenta_corriente` no tiene plazo fijo, se le da urgencia `sin_fecha` en vez de inventarle una fecha (no se agregó columna nueva, el cálculo es on-the-fly). El mismo helper lo consumen Facturas y el Dashboard para que nunca diverjan. Facturas → "Por pagar": pills de "N vencidas" / "Vencen esta semana", badge de urgencia + botón "Marcar pagada" en un tap en cada card (reusa `actualizarStatus`, sin mutación nueva), orden por urgencia dentro de cada proveedor. Dashboard: `CuentasPorPagarCard` prioriza el mensaje urgente sobre el total genérico cuando corresponde. **Gotcha de la sesión (del script de verificación, no del producto):** un selector de Playwright demasiado amplio marcó por error una factura real de Bros/Rescoldo como pagada en vez de la de prueba — detectado al instante cruzando contra la DB, revertido, y la segunda pasada con un selector scopeado confirmó el comportamiento correcto del botón real. También se reinició (con permiso explícito) un dev server heredado que llevaba horas colgado sin responder. Verificado con una factura de prueba (30 días, vencimiento a 3 días): dashboard y agenda mostraron los montos correctos, marcar pagada actualizó la lista. Dato de prueba borrado. `npm run build` limpio.

### Sesión 2026-07-07 (cont. 3) — Mejoras Recetario · Carta · OPS (`PLAN-MEJORAS-RECETARIO-CARTA-OPS-2026-07.md`)

Cierre completo de las observaciones del cliente sobre Recetario y Carta, en 4 deploys (`3c1a34d`/`81c961e`/`1247a2b`/`37bffea`). **Tanda A (keystone):** el panel de asignación OPS/mise estaba triplicado con UIs divergentes — se extrajo `components/ops/OpsPanel.tsx` como fuente única (plaza → sección → recipiente → cantidad+unidad → tamaño por porción con porciones auto); `RecetaOpsSheet` quedó como chrome de bottom sheet y `PlatoRecetasEditor` borró su panel duplicado (~125 líneas). **Tanda B (`recetario/[id]/page.tsx`):** el precio de venta salió de la ficha (banner de sync receta↔plato movido adentro de Food Cost) — la receta es ficha técnica, el precio vive en Food Cost o en Editar; "Convertir a plato" ahora solo para admin; desactivar una receta que es plato también elimina el `carta_item` vinculado (`eliminarItem`) para no dejarlo huérfano. **Tanda C (Carta):** `menus.fecha_evento` (input date solo en modo evento + chip en la card); **variantes de menú a un precio** (esquema "columna en preparaciones": `menu_preparaciones.variante` NULL=común + `menus.variantes` lista; el comensal elige una) con UI para definir variantes y asignar cada ítem (Común/variante); OPS por ítem en menú/evento adopta el `OpsPanel` compartido — reemplaza los campos libres de plaza/sección y cierra el pedido "que el despliegue de OPS se vea igual en todas las pantallas" (nuevas cols OPS en `menu_preparaciones`); crear receta inexistente desde el buscador de secciones de menú/evento (además del ya existente en plato), con ítems `draft` en rojo + badge "a realizar" (set `allDraftIds` = drafts de `useRecetas` + creados en la sesión); `menus.precio` + input de precio de menú/evento (el food cost del resumen ahora también aplica a menú). **UI (ui-auditor):** wrapper OPS del modo plato a `var(--surface)` (era `#f8faff`, rompía consistencia y dark mode); badges `TIPO_CFG`/`TAG_CFG` (ComposicionEditor) y los de `MenusView` migrados de hex claro fijo a tinte alfa (legibles en tema oscuro); `useSheetOpen()` agregado a `RecetaOpsSheet` (oculta el Coach FAB sobre el sheet); componentes canónicos D0 adoptados (`SegmentedTabs` para el tipo Plato/Menú/Evento; `HeaderAction`+`FilterChips`+`EmptyState` en MenusView). 4 migraciones aplicadas y guardadas en `supabase/migrations/`. `npm run build` limpio en cada tanda. **Pendiente futuro (no bloqueante):** consumo de variantes en `activarMenu` — hoy las variantes se definen y guardan bien, pero al activar un menú se generan las tareas de todas las preparaciones; que la cocina produzca según lo que elige el comensal es tema del flujo producción/salón.

### Sesión 2026-07-07 (cont. 2) — M1 Arqueo y cierre de caja por turno (`PLAN-ROADMAP-COMPETENCIA-2026-07.md`)

Primer bloque de la fase M (mid-term) del roadmap — el eslabón que falta para que K-OS reemplace un POS. Migración `cajas_turnos` (RLS estándar, índice único parcial que impide dos cajas abiertas a la vez por restaurante) + `caja_movimientos` (retiros/ingresos, RLS vía padre igual que `pagos`↔`cuentas`). Hook `lib/hooks/useCajaTurno.ts` con `calcularEsperado` (pagos del turno + ingresos − retiros por medio de pago) y `cerrarCaja` (snapshotea esperado/declarado/diferencia como cierre histórico, no recalculable después). Mismo gotcha que Q5 con tablas hija sin `restaurante_id` propio (`pagos`): filtrado vía embed `!inner` en vez de 2 queries, confirmado con `curl` contra datos reales de Bros antes de dar por buena la lógica. El fondo inicial se atribuye siempre al medio "Efectivo" por heurística de nombre (no hay campo "tipo" en `medios_pago`). UI nueva `components/salon/VistaCaja.tsx` (botón "Caja" en el header del mapa de salón): abrir con fondo inicial → dashboard con retiros/ingresos (medio en pills, no `<select>`, mismo patrón que el cobro) → cerrar con un input por medio + toggle "Arqueo ciego" (oculta el esperado hasta declarar todos los medios) + diferencia en vivo → resumen con impresión (reusa `lib/print/escpos.ts` de Q4, nuevo `tipo='cierre_caja'`) y descarga .bin. Reportes suma tab "Caja": historial de cierres (quién abrió/cerró vía `equipo_miembros`, diferencia por medio) exportable a Excel (mismo patrón de Q3). Verificado con Playwright + un pago de prueba insertado por SQL (el flujo completo mesa→comanda→cobro de la UI resultó demasiado inestable para automatizar de punta a punta en esta sesión): fondo $10.000 + ingreso $500 + pago $30.600 → "Esperado $41.100" exacto → declarado igual → "Diferencia: $0" confirmado en DB → Reportes → Caja mostró el cierre correctamente → export a Excel generado. Datos de prueba limpiados al final (El Rescoldo quedó como estaba). `npm run build` limpio.

### Sesión 2026-07-07 (cont.) — Q5 Comparador de precios entre proveedores (`PLAN-ROADMAP-COMPETENCIA-2026-07.md`)

Quinta feature del roadmap de competencia. Hook nuevo `lib/hooks/usePreciosProveedores.ts` (`fetchComparador`), separado de `useReportes` para poder reusarlo también en Stock. Decisión clave: en vez de agrupar por el texto crudo de `factura_items.producto_nombre` (que varía por proveedor), cada renglón de factura se matchea contra el catálogo de `productos` con la misma dirección que ya usa el importador (`itemFactura.includes(nombreProducto)`, prefiriendo el nombre más largo/específico cuando varios matchean) — esto unifica compras del mismo insumo redactadas distinto entre proveedores y, de paso, filtra gratis los gastos no-mercadería (sueldos, AFIP, alquiler) que abundan en las facturas de Bros y que sin este filtro ensuciaban el top de sobreprecio con ítems no creíbles. Agrupación final por `productoId + unidad canónica de la factura` (nunca por la unidad declarada en Stock) para no comparar nunca $/kg contra $/unidad. Por grupo con ≥2 proveedores en 90 días: último precio por proveedor, mejor precio, y "ahorro potencial" = suma de `(pagado − mejor) × cantidad` sobre las compras no óptimas del período. Gotcha de performance encontrado con datos reales de Bros (982 facturas / ~3000 renglones en 90 días, mucho más de lo esperado): `.in('factura_id', ids)` con cientos de UUIDs generaba una query-string demasiado larga → 400 de PostgREST; se reemplazó por un embed `factura_items.select('*, facturas!inner(...)').eq('facturas.restaurante_id', X)` (confirmado con `curl` que `!inner` sí filtra la tabla principal, a diferencia del embed sin `!inner` de `feedback_postgrest_join`) con paginación manual vía `.range()` porque PostgREST tapea 1000 filas/request pase lo que pase con `.limit()`. UI: tab Precios de Reportes suma una card "Ahorro potencial (últimos 90 días)" (top 10, el número de marketing) y un "Comparador de precios por proveedor"; badge en Stock → Editar producto ("Pagaste X% más que el mejor precio reciente…") bajo el campo Precio unitario, solo si la unidad de stock coincide con la de las facturas agrupadas. Verificado con Playwright contra Bros: Reportes muestra ahorro potencial $1.547.775 con ítems creíbles (Manteca, Chocolate blanco, Queso crema, Bife de chorizo…); Stock → "Chocolate blanco" muestra el badge "Pagaste 305% más… (Waggon, $5.094 el 2/6/2026)"; productos con unidad de stock distinta a la facturada (ej. Manteca en 'g' vs facturada en 'kg') correctamente no muestran badge. `npm run build` limpio.

### Sesión 2026-07-07 — Q4 Etiquetas de producción imprimibles ESC/POS (`PLAN-ROADMAP-COMPETENCIA-2026-07.md`)

Cuarta feature del roadmap de competencia. Migración chica `recetas.vida_util_dias INT NULL` (default 3 días al imprimir si no está seteado). Cliente ESC/POS que antes vivía solo en `salon/page.tsx` (`printViaUSB`/`printViaBluetooth`/`fetchEscPosBytes` + tipos mínimos de WebUSB/Web Bluetooth) extraído a `lib/print/escpos.ts` compartido, con dos helpers nuevos (`downloadEscPosBytes`, `supportsWebUSB`/`supportsWebBluetooth`); el salón migrado a consumirlo (cero duplicación). De paso resuelto el placeholder que quedaba pendiente en `PENDIENTES.md` 3b: el ticket de salón mostraba `nombreLocal: 'KitchenOS'` fijo → ahora lee `restaurantes.nombre` real vía `RESTAURANTE_ID` (mismo patrón que ya usa Reportes). Endpoint `POST /api/ingest/escpos` suma `mode: 'etiqueta'` (`buildTicketEtiqueta`): etiqueta chica con restaurante, nombre de producción, fecha de elaboración, fecha de caducidad y responsable. Botón "Imprimir etiqueta" en dos puntos: (a) `ProductoMiseCard` — aparece al tildar un ítem del mise como listo, con input de "días hasta caducidad" editable (default `recetas.vida_util_dias` o 3) y botón "Crear vencimiento en HACCP" que llama a `useHaccp().crearVencimiento` con la fecha calculada, cerrando el loop producción→HACCP; (b) HACCP → Vencimientos → "Agregar vencimiento" — misma sección de etiqueta dentro del form, habilitada con producto+fecha sin necesidad de guardar primero. En ambos casos: Imprimir (USB), Bluetooth y "Descargar .bin" (fallback siempre visible). Verificado con Playwright headless contra El Rescoldo: en Mise (Pastelería) tildar un ítem muestra el panel con la fecha calculada; "Crear vencimiento en HACCP" confirmado por SQL directo (`fecha_apertura`/`fecha_vencimiento` correctos, luego borrado por ser dato de prueba); en HACCP el form habilita Imprimir/Descargar solo con producto+fecha cargados y el `.bin` se descarga con el nombre esperado. `mode=etiqueta` verificado también por `curl` directo. Gotcha: el warning de React "Maximum update depth exceeded" que aparece en `/checklist` es **preexistente** (se reproduce igual con los cambios de esta sesión revertidos vía `git stash`) — no lo generó Q4, queda anotado para una futura auditoría de hooks. `npm run build` limpio (`/checklist`, `/haccp`, `/salon` siguen `○ static`, sin regresión a dinámico).

### Sesión 2026-07-06 (cont. 3) — Q3 Export Excel en Reportes (`PLAN-ROADMAP-COMPETENCIA-2026-07.md`)

Tercera feature del roadmap. Botón "Exportar" (`HeaderAction` de D0) en el header de Reportes, contextual a 5 tabs: CMV, Compras, Food Cost, Presupuesto vs Real y Rendimiento por plaza (oculto en Resumen/Precios/Producción). No hizo falta crear `lib/export/xlsx.ts` — el helper **ya existía** (`lib/exportar.ts`: `exportarExcel` + `fechaArchivo`, usado hoy por `stock/ClientView`) y se reusó tal cual. Cada export es un workbook con hoja `Info` (restaurante · período · fecha) + 1-2 hojas de datos leídas del mismo state que renderiza la pantalla (sin recalcular aparte, para garantizar que coincidan número a número). Nota de alcance: Compras exporta `Por proveedor` + `Facturas` pero **no** "por categoría" (esa vista no existe en la pantalla → no se inventó un cálculo nuevo). Permisos: gate con `usePermisos().puedeVer('reportes')`, **no** con `esAdmin` — la cuenta de aceptación `facu@broscomedor.com` es rol `chef` y ya ve esos números en pantalla; gatear por admin la hubiera dejado sin botón. Verificado con Playwright contra Bros: los 3 tabs sin datos exportables no muestran botón; CMV y Compras descargan `.xlsx` que coincide con la pantalla (Ventas $55.672.501, Compras $411.943, CMV 0.7%). `npm run build` limpio.

### Sesión 2026-07-06 (cont. 2) — Q2 Demo pública sin registro (`PLAN-ROADMAP-COMPETENCIA-2026-07.md`)

Segunda feature del roadmap de competencia. Decisión tomada con Facundo antes de codear: la demo vive en un **restaurante clon separado** ("El Rescoldo Demo", id `00000000-0000-0000-0000-000000000002`) — no sobre la cuenta real de marketing — y es **lectura-escritura real** (no solo-lectura), con reset nocturno; esto evita tocar RLS en las 44 tablas y da mejor experiencia de venta (el visitante puede crear tareas, marcar 86, etc. de verdad). `scripts/crear-cuenta-demo.mjs` (idempotente) creó el restaurante + usuario de auth (`demo@kitchenos.app`) + `user_restaurantes`/`equipo_miembros`/`rol_permisos` admin. La pieza grande — clonar profundamente los datos de El Rescoldo real hacia el clon — se delegó al agente `migrator`, que construyó `reset_demo_restaurante()` (`supabase/migrations/20260706_demo_reset_function.sql`): descubrió el grafo real de FKs vía `pg_constraint` (no de memoria) y cubre 59 tablas (41 tenant-root + 18 hijas), con tablas temporales de mapeo old_id→new_id para remapear FKs de forma consistente, atómico. Verificado 1:1 contra el origen (productos 235/235, recetas 83/83, ingredientes 587/587, ventas_items 405/405, etc.), incluyendo el caso borde de `merma.producto_id` nullable (bug de `JOIN` vs `LEFT JOIN` encontrado y corregido en la propia verificación del agente). Cron `GET /api/cron/reset-demo` protegido por `CRON_SECRET` + `vercel.json` (6am UTC) — **`CRON_SECRET` ya cargado y verificado en producción** (6 jul: 401 sin secret, 200 + reset con el correcto). Login: botón "Ver demo sin registrarme" (loguea directo + log fire-and-forget en `demo_visitas`, tabla nueva solo de conteo). `DemoBanner` (mobile y desktop) persistente mientras `restauranteId === DEMO_RESTAURANTE_ID`; su click hace `signOut('/register')` — necesario porque `proxy.ts` rebota `/register` a `/` si hay sesión activa, así que `signOut()` ahora acepta un `redirectTo` opcional (antes hardcodeaba `/login`). Verificado con Playwright: datos ricos tras "Ver demo" (235 productos, checklist, pase, cuentas por pagar en el dashboard), banner visible en Stock/Recetario/Dashboard, click banner → `/register`, cron 401 sin secret / 200 + reset confirmado con secret. `npm run build` limpio.

### Sesión 2026-07-06 (cont.) — Q1 Carta QR pública (`PLAN-ROADMAP-COMPETENCIA-2026-07.md`)

Primera feature del roadmap de competencia, construida sobre el sistema de identidad D0. Migración `restaurantes.slug TEXT UNIQUE` + `carta_publica_activa BOOLEAN` (seed: El Rescoldo activo con slug `el-rescoldo`). Route group nuevo `app/(publico)/` (sin BottomNav/Coach/auth, `position:fixed` propio para escapar el `#shell` mobile de la app de gestión) con `carta/[slug]/page.tsx`: Server Component con `createAdminClient` (documentado en el código el porqué — no hay RLS pública y el SELECT es explícito, nunca incluye `margen_pct`/costo) + `revalidate=60` para que el 86 se refleje rápido. `CartaPublicaView` (client) usa `FilterChips`/`EmptyState`/`Num` de D0: filtro por categoría, ítems 86'd atenuados con "No disponible hoy", footer de identidad. `proxy.ts` suma `/carta/` (con slash) a rutas públicas sin tocar `/carta` a secas (la gestión interna, que sigue protegida). Configuración → Restaurante: card "Carta pública" con toggle, slug editable (`slugify` propio sin librerías, normaliza acentos vía `codePointAt`) y QR descargable (`qrcode`, generado client-side, apunta a `https://kos-app-one.vercel.app/carta/{slug}`). Verificado con Playwright contra dev server (32 platos de El Rescoldo, filtro por categoría, 86 vía SQL directo reflejado al instante, 404 en slug inexistente/inactivo, `/carta` interno sigue exigiendo sesión) y captura de la card en Configuración. `npm run build` limpio.

### Sesión 2026-07-06 — Plan UI-Identidad completo (D0–D10): sistema de diseño canónico + correcciones de auditoría

Ejecución completa de `PLAN-UI-IDENTIDAD-2026-07.md` (origen: auditoría visual del 5 jul con la cuenta Bros). 6 commits: `10dc47e` (D0–D4) · `4d05378` (D5) · `6c7fd6c` (D6–D7) · `5909f4d` (D8) · `8e4d3ed` (D9+D10) · `cc1ade3` (fix D10).

1. **D0 — Sistema de identidad (`components/ui/` + `lib/ui/chrome.tsx`)**: componentes canónicos que reemplazan los ~5 estilos de tabs, 4 patrones de "crear", chips invertidos y avatares inconsistentes que había. `SegmentedTabs` (variantes onDark/onLight), `FilterChips` (fade de overflow), `EmptyState` (con CTA), `HeaderAction` (pill navy en header — reemplaza FABs de acción y la barra flotante de Recetario), `Avatar` (hash determinístico, paleta fija de 6), `Num` (tabular-nums). `UiChromeProvider` + `useSheetOpen()` para que flotantes globales se oculten con sheets abiertos. **Regla de oro** documentada en `.claude/docs/ui.md` (sección "Componentes canónicos D0") + `ui-auditor` actualizado: ninguna pantalla nueva introduce patrón visual propio. Pantalla de muestra migrada: Ventas.
2. **D1 — Coach FAB deja de tapar contenido**: sheets/editores llaman `useSheetOpen`/`useSheetOpenWhen` (Merma, Stock sector+Stockear, ComposicionEditor, ImportadorUniversal, Producción menu picker) → el FAB se oculta. FAB "+" de Merma movido al header como `HeaderAction`.
3. **D2 — Stock mobile**: en ≤479px el bloque mín/crít baja como segunda línea de la celda Producto (elimina la colisión badge/número); Insumos/Producciones → `SegmentedTabs`; KPIs con scroll+fade; placeholder "Buscar…".
4. **D3 — Recetario**: barra flotante "Nueva receta" → iconos + `HeaderAction` en header; cards ocultan metadata en 0 (tiempo/porciones); `normalizeCategoria()` dedup + `CATEGORIAS_RECETA` canónicas en el form; subtítulo "Food cost" solo para admin. Script `scripts/normalizar-categorias-recetas.mjs`.
5. **D4 — Editor de Carta unificado**: mismo buscador inline por sección en Plato/Menú/Evento (elimina el patrón de ítem en blanco); títulos de sección con el label chico canónico; placeholders correctos (Nombre del evento/menú); resumen ÍTEMS/COSTO con label contextual y COSTO oculto para no-admin.
6. **D5 — Empty states con salida**: Salón sin mesas → "Configurar mesas"; KDS sin estaciones → "Ir a Configuración"; Reportes period-aware (CTA "Ver Último mes", KPI en 0 muestra "—" no "-100%"); Mise todo-vacío → un solo EmptyState.
7. **D6 — Permisos**: `RouteGuard` con pantalla de bloqueo (lock icon + módulo + instrucción al admin) en vez de redirect mudo.
8. **D7 — Números confiables**: dashboard "Tareas hoy" filtra `turno_fecha` (hoy + carryover ayer sin `estado=listo`); Merma aplica filtro "hoy" al montar.
9. **D8 — Desktop**: `DesktopShell` wrapea contenido a `max-width:1040px` (excepto /stock, /espacios, /reportes); `ModulosGrid` elimina la paleta pastel → `var(--surface)`/`--border`/`--accent`; Recetario 2 columnas en desktop.
10. **D9 — 11 detalles**: HACCP "Nunca realizada"; título de receta 2 líneas; `OpsToggle` sublabel integrado; Proveedores+Perfil → `Avatar`; Pedidos PDF a ícono + "Sin proveedor asignado" naranja; Pase timestamps sin duplicar; Producción un solo control de fecha; Turnos columna sticky; Equipo CTA "Asignar puesto".
11. **D10 — Limpieza de datos Bros** (`scripts/limpiar-datos-prueba-bros.mjs`): **Aplicado** (6 jul, Facundo confirmó dry-run en sesión). Resultados: 1 mensaje de pase basura eliminado, 28 productos Caso A reseteados a `stock_minimo=0, stock_critico=0` (tenían umbrales absurdo vs stock_actual < 5), 3 miembros con plazas normalizadas (tildes + dedup). Nota: `stock_minimo`/`stock_critico` son NOT NULL — usar `0`, nunca `null`. Caso B (todo en 0/0/0) ya estaba correcto, no requirió cambio.

**Sin migraciones de DB.** Aprendizajes de UI capturados en `.claude/docs/ui.md`.

### Sesión 2026-07-03 (cont.) — Recetario como creador de platos: convertir a plato + OPS + link vivo a carta

1. **Helper compartido `lib/ops/mise.ts`**: `upsertMiseChecklistItem({ supabase, restauranteId, recetaId, nombre, plaza, seccionMiseId, cantidad, unidad, recipienteNombre, pesoPorcion, pesoPorcionUnidad })` — busca/crea `checklist_secciones` y hace upsert de `checklist_items` keyed por `(restaurante_id, receta_id, plaza)`. Extraído de `handleComposicionSave` (Carta), que ahora lo consume (DRY). Las constantes `PLAZAS_OPS`/`SECCIONES_OPS` se mudaron acá; `ComposicionEditor` las importa y re-exporta para no romper imports existentes.

2. **Convertir receta a plato** (`recetario/[id]/page.tsx`): botón que crea un `carta_items` con `receta_id` = la receta (link 1:1). Copia precio, foto (`foto_url`) y mapea la categoría a una de carta (match por nombre, fallback `Principales`). Idempotente: si ya existe el plato vinculado, el botón pasa a **"Ver en carta"**. El costo/FC del plato se leen en vivo de la receta (ya lo hacía `useCarta` por la rama fallback de `receta_id`).

3. **Botón OPS + `RecetaOpsSheet.tsx`** (nuevo, bottom sheet): asigna la receta al mise (plaza → sección → recipiente/tupper → cantidad+unidad → peso por porción con cálculo de porciones por recipiente). Prefill desde el `checklist_items` existente; botón "Quitar". Guarda vía `upsertMiseChecklistItem`. No requiere que la receta sea plato. Aparece directo en la Mesa de Trabajo/OPS (que ya lee `checklist_items` por `receta_id`+plaza).

4. **Sync de precio receta ↔ plato**: banner en la ficha si `receta.precio_venta !== plato.precio_venta`, con acciones "Actualizar plato →" / "Actualizar receta →".

5. **Flag `es_plato` derivado + color sutil** (`useRecetas.ts` + `recetario/page.tsx`): `fetchRecetasData` consulta `carta_items` (receta_id no null) y marca `es_plato` (no es columna → si se borra el plato en Carta, el flag desaparece solo). `RecetaCard` muestra borde accent tenue + fondo levísimo + chip `PLATO`. Canal realtime de recetas ahora escucha también `carta_items`.

**Sin migraciones** (reusa `carta_items.receta_id` y las columnas ya existentes de `checklist_items`). **Commit:** `24cc07e` en `main`, deployado a Vercel.

### Sesión 2026-07-01 (tarde) — Fotos, pesos, unidades smart, auto-link, costeo real, checklist modo control

1. **PhotoPicker** (`components/ui/PhotoPicker.tsx`): componente reutilizable que sube imágenes al bucket `fotos` de Supabase Storage (público). Acepta cámara/galería, máx 5 MB, upsert, cache-busting con `?t=timestamp`. Botones "Cambiar" / "Quitar" inline.

2. **Fotos en Recetario** (`recetario/[id]/page.tsx`): foto a ancho completo (220px de alto) en el detalle si hay URL; PhotoPicker en el modal de edición.

3. **Peso total y escurrido** (`recetario/[id]/page.tsx` + `types/index.ts`): nuevos campos `peso_total_g` y `peso_escurrido_g` en la tabla `recetas` (migración `20260701_recetas_foto_pesos.sql`). Se muestran en la sección Food Cost y son editables en el modal. El peso total también se calcula automáticamente desde ingredientes cuando hay datos.

4. **Costeo en tiempo real**: en el form de agregar/editar ingrediente (tipo Producto), un chip muestra el subtotal calculado en vivo (`cantidad × costo × unitConversionFactor`) mientras el usuario escribe. Si hay merma también muestra el peso neto.

5. **Unidades smart** (`smartQty` en `recetario/[id]/page.tsx`): la lista de ingredientes muestra automáticamente la unidad más legible: 0.005 kg → 5 g, 1500 g → 1.5 kg. Sin alterar los datos guardados.

6. **Auto-link ingredientes al stock** (`lib/hooks/useRecetas.ts`): después de guardar una receta nueva (con IA o manual), `agregarReceta` dispara fire-and-forget a `POST /api/recetas/auto-link-ingredientes` → aplica matches exactos y parciales automáticamente → mutate SWR.

7. **Fotos en Carta** (`carta/page.tsx`): PhotoPicker en el form de crear/editar plato (primer campo). La URL se guarda en `carta_items.foto_url`. En la lista, los platos con foto muestran un thumbnail 52×52px a la izquierda del nombre.

8. **Checklist Modo Control** (`checklist/ClientView.tsx`): botón `fact_check` en el header de cualquier plaza activa el modo simplificado. En modo control, los ítems se renderizan como lista de checkboxes (tick + nombre + cantidad target) en vez del `ProductoMiseCard` completo. Un tap alterna `completado` y los datos se guardan igual. Banner "Modo Control" en el header. Persiste en `localStorage('checklist_modo_control')`.

**Migración aplicada:** `20260701_recetas_foto_pesos.sql` — `ALTER TABLE recetas ADD COLUMN foto_url TEXT, peso_total_g NUMERIC, peso_escurrido_g NUMERIC` + bucket `fotos` público (vía SQL directo porque la nueva key `sb_secret_...` no funciona con la Storage REST API directa). `NOTIFY pgrst, 'reload schema'`.

**Commit:** `a5284aa` en `main`, deployado a Vercel.

### Sesión 2026-07-03 — Auditoría A4–A6: tipos legacy · ESC/POS UI · migración importador Fudo

1. **A4 — Tipos sincronizados** (`types/index.ts` + `lib/hooks/useEquipo.ts`): `Evento.color/recurrente` ya no nullable (DB NOT NULL); `Turno.notas` quita el `?` opcional; `Puesto.tareas_funciones/permisos_app` → `string[]` (eran `string[] | null`). Mapper `fetchPuestosData` agrega `tareas_funciones ?? []`. PENDIENTES.md ítem 4 cerrado.

2. **A5 — Cliente ESC/POS en salón** (`app/(servicio)/salon/page.tsx`): tipos locales para Web USB/BT (no están en el DOM lib por defecto). Helpers `fetchEscPosBytes`, `printViaUSB` (WebUSB, reutiliza device persistido en `kos_printer_usb` localStorage, detecta interfaz clase 7 printer con endpoint BULK OUT), `printViaBluetooth` (BLE genérico, servicio `000018f0…`). En `TicketCobro`: estado `printing/printError`, sección "Imprimir ticket" con botones ≥64px para USB y BT (solo si el browser los soporta) + "Descargar .bin" siempre disponible. Fix TS 5.7: `bytes.buffer as ArrayBuffer` para `new Blob`. PENDIENTES.md ítem 3b cerrado.

3. **A6 — `importarFudo()` migrada a endpoint universal** (`components/importador/ImportadorUniversal.tsx`): reemplaza `fetch('/api/importador/facturas-fudo', ...)` por `fetch('/api/importador/facturas-universal', ...)` con `mode: apply`. El endpoint universal detecta Fudo nativamente (hojas Gastos+Detalle). Endpoint legacy `facturas-fudo` marcado `@deprecated` en el comentario de cabecera; sigue disponible para calls externos legacy.

**Learnings:** (1) `new Blob([uint8array])` falla en TS 5.7+ con `Uint8Array<ArrayBufferLike>` — usar `bytes.buffer as ArrayBuffer`. (2) `navigator.usb` y `navigator.bluetooth` no están en el DOM lib de TS — declarar interfaces mínimas locales y castear `navigator as Navigator & { usb?: UsbApi }`.

### Sesión 2026-07-01 — Fase 7: Config salón · 86 bidireccional · Merma auto · Métricas KDS · Modo mozo · Prep-list viva · ESC/POS real

1. **Config salón** (`app/(servicio)/salon/config/page.tsx`): 3 tabs CRUD — Mesas (numero/sector/capacidad), Medios de pago (nombre/activo), Estaciones KDS (nombre/pantalla_asignada). `MesaForm` a nivel de módulo para evitar pérdida de foco. Accesible desde ícono `settings` en el mapa de mesas.

2. **86 bidireccional** (`app/api/carta/86/route.ts`): `POST { carta_item_id, disponible }` → UPDATE `carta_items`. Usa `createAdminClient()` (bypasea RLS). KDS: botón "86" por ítem (con confirm dialog) → invalida el ítem globalmente para el salón.

3. **Merma automática** (`app/api/salon/merma-auto/route.ts`): cadena `comandas → comanda_items → plato_recetas → ingredientes → productos.stock_actual` + insert `merma` para trazabilidad. Llamado fire-and-forget en `useCuenta.cobrarYCerrar` (paso 4 del flujo de cobro, nunca bloquea).

4. **Métricas KDS** (`MetricasPanel` en `kds/page.tsx`): avg ticket-time (segundos), bumps del día, comandas pendientes, comandas en preparación. Panel deslizable desde header con `bar_chart`.

5. **Modo mozo mejorado** (`salon/page.tsx`): category tabs filtrados (scroll horizontal, derivados de `cartaItems`), link a `/salon/config` desde el mapa. Fire-and-forget a `prep-list-update` al enviar comanda.

6. **Prep-list viva** (`app/api/salon/prep-list-update/route.ts`): incrementa `checklist_items.demanda_viva` según carta_item → receta → checklist_item. Falla silenciosamente si la columna no existe. Migración aplicada via SQL Editor: `ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS demanda_viva INTEGER DEFAULT 0;` + `NOTIFY pgrst, 'reload schema';`.

7. **ESC/POS real** (`app/api/ingest/escpos/route.ts`): modo `generate` reemplaza el stub. Genera bytes binarios ESC/POS para `TicketCocina` (** COCINA **, mesa, items bold, hora) y `TicketCliente` (header, itemizado, totales, pagos, vuelto, bloque CAE/QR si hay fiscal). Ancho 42 chars, CP437, GS V cut. Devuelve base64. Cliente WebUSB/Bluetooth pendiente.

**Learnings:** `createAdminClient()` (no `createClient`) es el export correcto de `lib/supabase/admin.ts`. Ver hooks.md gotcha #3.

### Sesión 2026-06-30 (cont.) — Fase 2 Walking Skeleton: comanda → KDS → bump

**Plan ejecutado:** `docs/gestion salon KOS/PLAN-FASE-2.md` — 9 commits atómicos, walking skeleton completo end-to-end.

1. **Mini-migración** (`20260701_fase2_estacion_routing.sql`): columna `carta_items.estacion_default_id UUID NULL` → `estaciones`. Seed ruteo en El Rescoldo: 31 carta_items ruteados por categoría (Parrilla/Fríos/Postres/Pase/Barra).

2. **Hook `useComandas`** (`lib/hooks/useComandas.ts`): SWR + Supabase Realtime (`comandas` + `comanda_items`), filtro por estación para KDS. CRUD: `crearComanda`, `agregarItems`, `enviarComanda` (fired_at + eventos_cocina), `avanzarItem`, `bumpearItem`, `bumpearComanda`, `cambiarEstadoComanda`. Queries con joins embebidos (`mesa:mesas(numero,sector)`, `mozo:equipo_miembros(nombre,apellido)`, `carta_item:carta_items(nombre)`).

3. **Vista Salón** (`app/(servicio)/salon/page.tsx`): mapa de mesas usando `pos_x/pos_y`. Tap en mesa → `abrirCuenta` → vista de comanda con buscador de carta, `AgregarItemSheet` (stepper cantidad + modificadores con/sin/extra como chips + nota), draft editable, `PedidoEnCursoPanel` (refleja en tiempo real el estado de los ítems de la comanda activa). Botón Enviar bloqueado sin conexión.

4. **Vista KDS** (`app/(servicio)/kds/page.tsx`): selector de estación persistido en localStorage (`kds_estacion_id`). Grilla de tarjetas: header con color por umbral (verde <5 min / amarillo 5-10 min / rojo >10 min), cronómetro en tiempo real (`setInterval` 1s), lista de ítems tappables (avanzar estado / bump), "BUMP COMANDA". Solo ítems de la estación seleccionada; oculta ítems ya bumpeados.

5. **Hooks auxiliares**: `useMesas` (SWR+Realtime + `abrirCuenta`/`liberarMesa`), `useEstaciones` (read-only).

6. **Offline Opción A** (`lib/offline/bumpQueue.ts` + `lib/offline/useOnlineStatus.ts` + `public/sw.js`):
   - SW extendido: intercepta GETs a `/rest/v1/` (network-first + cache fallback) → la data de comandas/mesas/estaciones queda disponible sin red.
   - Cola IndexedDB: bumps offline → `marcarBumpeadosLocal` (optimista) + `encolarBump` → se reenvían al reconectar (evento `online` en `useComandas`). Idempotente (para en el primer fallo).
   - Banner "Sin conexión" en el layout de servicio compartido entre Salón y KDS.
   - Salón no permite crear comandas sin red (botón bloqueado + aviso).

7. **Playwright e2e** (`playwright.config.ts` + `e2e/salon-kds.spec.ts` + `npm run test:e2e`): test del camino feliz en dos contextos de browser (mozo en salón, cocinero en KDS). Requiere `npx playwright install chromium` + dev server. Instrucciones de demo manual embebidas como comentario.

**Commits:** `92b28c8` (migración estacion_id) · `4979902` (seed ruteo) · `83bf279` (useComandas) · `beec84a` (lockfile) · `e02f42e` (salón) · `971c2d3` (KDS) · `f0f40d9` (reflejo salón) · `5e47f59` (offline) · `19524fe` (playwright).

### Sesión 2026-06-30 — Fase 1 Fundación: Salón + KDS + Cobro + Fiscal

**Plan ejecutado:** `docs/gestion salon KOS/PLAN-FASE-1.md` — 8 commits atómicos, todos los pasos de la Fase 1 salvo Playwright e2e (implementación postergada) y adopción Supabase CLI (estructura de migraciones ya en `supabase/migrations/`).

1. **Esquema de datos — 4 bloques, 4 commits:**
   - Bloque Servicio (`estaciones`, `comandas`, `comanda_items`, `comanda_item_modificadores`, `eventos_cocina`). `comandas.mesa_id/cuenta_id` como UUID simple → FKs agregadas en Bloque 2.
   - Bloque Salón (`mesas` con `pos_x`/`pos_y` para mapa visual desde Fase 1, `cuentas`) + FKs retroactivas en `comandas`.
   - Bloque Cobro (`medios_pago`, `pagos`).
   - Bloque Fiscal (`config_fiscal`, `comprobantes`, `comprobante_items`). `cert_ref` solo como referencia al secret store; jamás el `.crt/.key` en tabla.
   - RLS multi-tenant incluida en cada migración (48 políticas en 12 tablas). Tablas hijo aíslan por subquery al padre.

2. **Tipos TypeScript** (`types/index.ts`): 12 interfaces nuevas + tipos de estado narrowing (`EstadoComanda`, `EstadoMesa`, etc.). Módulos `salon/kds/cobro/fiscal` agregados a `TODOS_LOS_MODULOS`.

3. **Adapter fiscal** (`lib/fiscal/index.ts`): interfaz `ProveedorFiscal` con `emitir()` y `ultimoAutorizado()`. `ProveedorFiscalStub` devuelve `estado='pendiente'` sin llamar a ARCA — cobro desacoplado de fiscal listo.

4. **Stub ESC/POS** (`app/api/ingest/escpos/route.ts`): contrato + validación zod del texto crudo de comanda POS legacy. Parseo real va en Fase 2.

5. **Tooling** (`lib/comanda/stateMachine.ts` + tests): máquina de estados pura para `Comanda` (abierta→enviada→en_prep→lista→cerrada, cancel desde cualquier estado) y `ComandaItem` (pendiente→en_prep, bump, recall). 13 tests con Vitest — todos pasan. CI GitHub Actions (`.github/workflows/ci.yml`): typecheck + vitest + build en cada push/PR.

6. **Regla UI cocina** (`.claude/docs/ui.md`): botones ≥64px, swipe amplio, alto contraste negro, CERO dropdowns en despacho, fuente ≥18px, tablet-first, sin BottomNav ni Coach FAB en KDS. Route group `app/(servicio)/` con layout full-screen `#111`. Esqueletos `salon/page.tsx` y `kds/page.tsx` (placeholder "Fase 2").

7. **Seed El Rescoldo** (`supabase/migrations/20260630_seed_rescoldo_servicio.sql`): 5 estaciones KDS (Parrilla/Fríos/Postres/Pase/Barra), 12 mesas con pos_x/y (Salón 6, Terraza 4, Barra 2), 5 medios de pago, `config_fiscal` RI con CUIT de ejemplo y PV 3. Bros intacto.

**Commits:** `f9408de` (servicio) · `f129522` (salón) · `9d0a613` (cobro) · `003159e` (fiscal) · `932fc5b` (tipos) · `84b7b13` (fiscal adapter) · `30a92a7` (tooling) · `6ac7dde` (UI) · `a5867ce` (seed).

### Sesión 2026-06-28 — Stock: import planilla + carrito + rediseño tabla · Pedidos: rango entrega + banner ingresos · Ventas: import multi-día

1. **Ventas — import multi-día** (`ventas/page.tsx`): el parser de Excel ahora guarda la fecha por ítem (col "Creación" de Fudo), agrupa **por fecha → por nombre de plato** y devuelve `ParsedVenta[]` (uno por día). 1 día → `ConfirmScreen` editable; varios días → `MultiDayConfirmScreen` (lista de días + total, guarda todos en secuencia). Antes mergeaba todo en un único registro con la última fecha.

2. **Stock — import de planilla** (`/api/stock/import-planilla` + UI en `ClientView`): botón "Planilla" sube Excel/CSV multi-hoja. **Una llamada a Haiku por hoja en paralelo** (batch de 5) — clave: con todas las hojas en una sola llamada el JSON se truncaba a los ~8192 tokens. Extrae nombre/unidad/stock_actual/mínimo/crítico ignorando headers de color y filas de proveedor. Fuzzy match contra `productos` → `exacto`/`parcial`/`nuevo`. Preview con checkboxes + filtro; apply hace UPDATE (solo campos de stock, nunca pisa precio/nombre) + INSERT nuevos.

3. **Stock — carrito de compras** (`components/stock/CarritoCompras.tsx`): botón "agregar al carrito" por fila (cantidad sugerida = `stock_minimo − stock_actual`), carrito flotante con contador + total estimado, bottom sheet con ítems **agrupados por proveedor** (stepper de cantidad, subtotales), "Crear pedido" → `crearPedido` por cada proveedor (estado borrador). Sin proveedor → grupo aparte.

4. **Stock — rediseño de tabla** (auditoría `ui-auditor`): anchos de columna en % (suman 100%, elimina el hueco muerto de la columna Producto flex). Nueva columna **"Nivel"** (mini-barra CSS stock vs mínimo, color por estado). Celda **Stock horizontal alineada**: número (sub-columna 62px right) \| separador \| mín/crít (sub-columna 84px left) → alinean entre filas sin importar el largo del número. Acciones (carrito+merma) horizontales. Columna `#` eliminada. **Tabla unificada con `thead` sticky** (una sola `<table>` en vez de header+body separados) → arregla el desfase header/body que causaba el scrollbar con anchos en %. Emoji 🔍 → `search_off`, hex sueltos → vars, badges con contraste para light mode.

5. **Stock — filtros** (`components/stock/MultiSelectFiltro.tsx`): filtro de categorías y de proveedor, ambos **multi-selección** (popover con checkboxes + conteos), reemplazan el `<select>` único. Proveedor incluye "Sin proveedor". Mín/crítico **editable inline** en la celda Stock (tap → 2 inputs + check).

6. **Pedidos — rango de entrega + banner de ingresos** (`pedidos/page.tsx`, `components/pedidos/IngresosBanner.tsx`): migración `pedidos.entrega_desde`+`entrega_hasta`. `usePedidos.enviarPedido(id,desde,hasta)`. Al enviar: selector desde-hasta con atajos (Hoy / 1-2 / 3-5 días / próx. semana). Lista y detalle muestran "llega 28 jun – 30 jun" (fallback a la fecha única previa). **`IngresosBanner`**: los días que la ventana de entrega de un pedido (enviado/parcial) cae hoy o está atrasada → banner en Inicio (admin, mobile+desktop) y Pedidos con proveedores + monto estimado a ingresar.

7. **Stockear (quick mode)**: el botón "Atrás" (ya existía) ahora muestra "Corregir: \<producto anterior\>" con color de acento (para corregir un peso mal cargado). Fix: el overlay estaba en `zIndex 100` igual que el BottomNav → el nav tapaba la barra de botones; subido a `1000`.

**Migración aplicada en prod:** `supabase/migrations/pedidos_rango_entrega.sql` (entrega_desde/entrega_hasta). Build verde, todo deployado a `main`.

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
  (servicio)/     ← layout full-screen + salon/page + kds/page (esqueletos Fase 1)
  api/            ← coach, facturas, listas-precios, recetas/import, recetas/save, ingest/escpos
lib/
  auth/           ← AuthProvider context + RouteGuard
  hooks/          ← 22 hooks (useRecetas, useStock, useTareas, …, useComandas, useMesas, useEstaciones)
  supabase/       ← client (browser), server (SSR), admin (service role)
  fiscal/         ← interfaz ProveedorFiscal + stub (Fase 1)
  comanda/        ← stateMachine.ts + tests (máquina de estados comanda/ítem)
  offline/        ← bumpQueue.ts (IndexedDB cola bumps), useOnlineStatus.ts
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

**Hooks:** 22 | **Páginas app:** 22 (+ 2 servicio funcionales) | **API routes:** 8 | **Tablas:** 43 (+1 col: carta_items.estacion_default_id) | **Componentes:** 19
