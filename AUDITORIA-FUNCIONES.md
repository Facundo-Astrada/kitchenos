# KitchenOS — Auditoría de funciones
_Generado: 2026-05-13_

## Resumen
- 21 páginas auditadas (17 en el brief + 4 extra: calendario, ventas, merma, configuracion)
- 24 hooks custom
- 30 componentes (12 clave documentados)
- 12 API routes
- 38 tablas Supabase detectadas

---

## Páginas

### / (home — Dashboard)
- **Propósito:** Pantalla de inicio. Server Component que hace prefetch de datos y pasa a `DashboardClientView` via SWRFallback.
- **Tablas:** `user_restaurantes`, `productos`, `tareas`, `checklist_secciones`, `checklist_items`, `checklist_rutina`
- **Acciones:** Ver estado de stock crítico, ver tareas pendientes, acceder al Kitchen Coach, activar Modo Servicio, navegar a módulos.
- **Componentes usados:** `SWRFallback`, `DashboardClientView`, `DashboardHeader`, `MiPlaza`, `ModulosGrid`, `PasePreview`, `StockCriticoSection`, `KitchenCoachFAB`, `ModoServicio`, `BottomNav`, `MoreMenu`
- **Notas:** Usa SSR para el primer render (hydration-first). `DashboardClientView` vive en `DashboardClientView.tsx` en la misma carpeta. Incluye un toggle de "Modo Servicio" cuyo estado no está claro si persiste en DB.

---

### /operaciones
- **Propósito:** Vista unificada que agrupa Checklist (mise en place), Tareas y Planificación de Producción en tres tabs. Módulo fusionado en el commit `41e5816`.
- **Tablas:** Las de cada tab embebido (ver /checklist, /tareas, /produccion).
- **Acciones:** Cambiar entre tab Tareas / Checklist / Planificación. Todos los paneles se montan al mismo tiempo y se ocultan via CSS para preservar estado.
- **Componentes usados:** `ChecklistPage` (embedded), `TareasPage` (embedded), `ProduccionPage` (embedded)
- **Notas:** Página 100% client-side. No hace fetch propio; delega todo a los sub-módulos. Los tres paneles están montados simultáneamente, por lo que el costo de render es triple.

---

### /checklist
- **Propósito:** Mise en place por plaza. Gestión de secciones, ítems y rutinas de apertura/cierre. Soporta modo `embedded` para ser usado dentro de /operaciones.
- **Tablas:** `checklist_secciones`, `checklist_items`, `checklist_rutina`, `checklist_registros`, `checklist_rutina_registros`, `tareas`
- **Acciones:** Marcar ítems como completados, crear/editar/eliminar secciones e ítems, registrar rutinas periódicas, ver progreso por plaza.
- **Componentes usados:** `SWRFallback` (en page.tsx servidor), `ChecklistClientView` (en `ClientView.tsx`)
- **Notas:** page.tsx es Server Component con prefetch. La ClientView es el componente real. El hook `useChecklist` maneja toda la lógica.

---

### /tareas
- **Propósito:** Lista de tareas del restaurante con estados (pendiente, en_proceso, completada). Soporta modo `embedded` para /operaciones.
- **Tablas:** `tareas`
- **Acciones:** Crear tareas, cambiar estado, editar, eliminar, filtrar por estado/plaza/prioridad.
- **Componentes usados:** `SWRFallback`, `TareasClientView`
- **Notas:** page.tsx es Server Component. La columna es `status` (no `completada`). Las tareas tienen checklist propio (array JSON `checklist[]`).

---

### /stock
- **Propósito:** Inventario de productos (insumos). Gestión de stock con niveles crítico/bajo/ok.
- **Tablas:** `productos`
- **Acciones:** Agregar/editar/eliminar productos, ajustar stock actual, filtrar por categoría, importar desde Excel/CSV via ImportadorUniversal.
- **Componentes usados:** `SWRFallback`, `StockClientView`, `ImportadorArchivo`, `MermaBottomSheet`
- **Notas:** page.tsx hace SSR. Columnas correctas: `stock_actual`, `stock_minimo`, `stock_critico`, `precio_unitario`. El estado `estado` (critico/bajo/ok) se calcula en el server/hook, no está en DB.

---

### /pase
- **Propósito:** Chat interno de cocina. Mensajes entre plazas con prioridades (normal, importante, urgente) y @menciones de usuarios y #plazas.
- **Tablas:** `pase_mensajes`, `recetas` (para convertir mensaje a tarea)
- **Acciones:** Enviar mensajes, filtrar por plaza/usuario/prioridad, marcar como leídos, convertir mensaje urgente en tarea, mensajes rápidos predefinidos.
- **Componentes usados:** `PageTransition`, `usePase`, `useTareas`
- **Notas:** `USUARIOS_MOCK` hardcodeado (línea 55-60) — los usuarios no se cargan de DB. El `leido_por` es un array JSON en la tabla. No hay Supabase Realtime/subscription, el fetch es manual.

---

### /pedidos
- **Propósito:** Gestión de órdenes de compra a proveedores. Ciclo completo borrador→enviado→parcial→recibido.
- **Tablas:** `pedidos`, `pedido_items`, `facturas`, `factura_items`, `productos`
- **Acciones:** Crear pedido, agregar ítems, cambiar estado, recibir pedido (actualiza stock automáticamente), exportar a PDF, compartir por WhatsApp, ver precios históricos de facturas.
- **Componentes usados:** `PageTransition`, `usePedidos`, `useProveedores`, `PageHeader`, `ActionButton`
- **Notas:** Cuando el pedido se marca como "recibido", actualiza `stock_actual` en `productos`. Usa precios históricos de `factura_items` para sugerir precios al crear el pedido (vista `View = 'list' | 'nuevo' | 'detail' | 'recibir'`).

---

### /perfil
- **Propósito:** Perfil del usuario autenticado. Cambio de contraseña y foto de avatar.
- **Tablas:** `equipo_miembros` (update `avatar_url`)
- **Acciones:** Ver datos del perfil (nombre, email, rol), cambiar contraseña, subir foto de avatar, cerrar sesión.
- **Componentes usados:** Ninguno reutilizable — todo inline.
- **Notas:** Avatar se sube a Supabase Storage bucket `avatares`. Requiere que ese bucket exista. La foto se guarda como `{user.id}/avatar.jpg`. No edita nombre ni apellido desde esta pantalla.

---

### /produccion
- **Propósito:** Planilla diaria de producción. Gestión de "platos compuestos" (preparaciones con componentes) y seguimiento de estado por fecha. Soporta modo `embedded`.
- **Tablas:** `platos_compuestos`, `plato_componentes`, `produccion_diaria`, `ingredientes`, `equipo_miembros`, `tareas`
- **Acciones:** Ver planilla del día, cambiar status de componente (pendiente→en_proceso→listo), crear/editar/eliminar platos compuestos, duplicar menú a otra fecha, ver ingredientes consolidados, registrar merma al completar, delegar tarea a miembro del equipo.
- **Componentes usados:** `useProduccion`, `useEquipo`, `useMerma`, `useTareas`, `MermaBottomSheet`
- **Notas:** Solo admin/chef pueden delegar tareas (`puedeDelegar`). La función `duplicarMenu` copia toda la producción de una fecha a otra. Integra `MermaBottomSheet` para registrar merma directamente desde la planilla.

---

### /proveedores
- **Propósito:** ABM de proveedores. También permite ver facturas asociadas y escanear/importar listas de precios.
- **Tablas:** `proveedores`, `facturas`
- **Acciones:** Crear/editar/eliminar proveedor, ver facturas por proveedor (expand), escanear lista de precios con IA (foto/archivo), importar proveedores desde Excel via ImportadorArchivo.
- **Componentes usados:** `useProveedores`, `ImportadorArchivo`, `PageHeader`, `ActionButton`
- **Notas:** El scanner de listas de precios llama a `/api/listas-precios`. Tiene UndoBanner para deshacer importaciones. La lógica de scan de facturas dentro de Proveedores usa la API `/api/facturas` (misma que el módulo Facturas).

---

### /recetario
- **Propósito:** Biblioteca de recetas con costo y food cost. Importación por IA (foto, texto, audio, link Google). ABM completo.
- **Tablas:** `recetas` (via `/api/recetas/save`), `ingredientes` (via `/api/recetas/save`), `productos` (lectura para costo)
- **Acciones:** Crear/editar/eliminar recetas, importar con IA, ver food cost calculado, filtrar/buscar, exportar a Excel, publicar/despublicar recetas, subir foto a receta.
- **Componentes usados:** `useRecetas`, `useStock`, `useCategoriasProducto`, `ImageCropModal`
- **Notas:** La importación IA llama a `/api/recetas/import`. El save pasa por `/api/recetas/save` (usa `createAdminClient()`). Hay modo de importación por link de Google (`glink`) que pasa la URL a Claude para extraer la receta. La receta tiene campos `activa` (soft delete) y `status` (`published|draft`).

---

### /recetario/[id]
- **Propósito:** Detalle y edición inline de una receta individual. Cálculo de food cost y peso por porción.
- **Tablas:** `recetas`, `ingredientes`, `produccion_registros`, `productos` (vía `useStock`)
- **Acciones:** Editar campos de la receta, agregar/editar/eliminar ingredientes, calcular food cost y peso por porción con merma, exportar a PDF, ver historial de producción, copiar nombre de la receta.
- **Componentes usados:** `useRecetas`, `useStock`, `useProduccionRegistros`
- **Notas:** El peso por porción se calcula localmente en base a cantidades+unidades de ingredientes, aplicando `merma_pct`. `useProduccionRegistros` provee el rendimiento promedio histórico (`multiplicador_real`). El PDF se exporta via `lib/exportPDF.ts` (lazy-loaded).

---

### /reportes
- **Propósito:** Dashboard de análisis con 5 tabs: Resumen general, Food Cost por receta, Compras por proveedor, Evolución de precios, Producción planificada.
- **Tablas:** `facturas`, `productos`, `carta_items`, `recetas`, `ingredientes`, `precio_historial`, `tareas`
- **Acciones:** Cambiar período (semana/mes/mes_anterior), cambiar tab, visualizar métricas. Solo admins pueden ver reportes (guard `esAdmin`).
- **Componentes usados:** `useReportes`, `PageTransition`
- **Notas:** Fetch lazy por tab — cada tab solo carga datos cuando se selecciona. Los gráficos son barras CSS (`width: X%`), sin Chart.js. La tab "Producción" cruza `tareas` con `recetas` para estimar horas.

---

### /carta
- **Propósito:** Gestión del menú del restaurante. Ítems de carta con precio de venta, food cost, disponibilidad y packaging.
- **Tablas:** `carta_items`, `recetas`, `ingredientes`, `plato_recetas`, `plato_packaging`, `productos`
- **Acciones:** Crear/editar/eliminar ítems, vincular receta(s) a cada plato, asignar packaging, cambiar disponibilidad, exportar a PDF o Excel, calcular food cost y rentabilidad.
- **Componentes usados:** `useCarta`, `useRecetas`, `useStock`, `usePackagingGrupos`
- **Notas:** Vista `'rentabilidad'` extra que muestra food cost y margen por ítem. Un plato puede tener múltiples recetas (via `plato_recetas`). El packaging se gestiona via `usePackagingGrupos` con grupos reutilizables. Exporta PDF con jsPDF.

---

### /facturas
- **Propósito:** Módulo central de compras. Registro de facturas con IA OCR (foto, PDF, texto, manual), CRUD completo y actualización automática de precios/stock.
- **Tablas:** `facturas`, `factura_items`, `proveedores`, `productos`, `precio_historial`, `recetas`, `ingredientes`
- **Acciones:** Importar factura con IA (foto/PDF/texto), registrar manualmente, editar/eliminar, cambiar status (pendiente→confirmada→observada), actualizar precios en stock al confirmar, exportar a Excel, filtrar por proveedor/fecha/status.
- **Componentes usados:** `useFacturas`, `useStock`, `useProveedores`, `ProveedoresPage` (embedded), `ImageCropModal`
- **Notas:** Al confirmar una factura, actualiza `precio_unitario` en `productos` Y guarda historial en `precio_historial`. Si el producto no existe, lo crea. Si la factura tiene recetas asociadas, actualiza `costo_unitario` en `ingredientes`. Vista `'import' → 'confirm' → 'detail'`. Tiene soporte para carga por texto libre ("barra texto").

---

### /haccp
- **Propósito:** Registro HACCP — temperaturas de equipos, control de vencimientos, fichas de limpieza. Exporta PDF oficial.
- **Tablas:** `haccp_equipos`, `haccp_temperaturas`, `haccp_vencimientos`, `haccp_limpieza`, `haccp_limpieza_registros`, `merma`
- **Acciones:** Registrar temperatura de equipos (cámara, freezer, etc.), añadir/actualizar vencimientos de productos, crear fichas de limpieza, registrar cumplimiento de limpieza, exportar reporte PDF.
- **Componentes usados:** `useHaccp`, `useMerma`
- **Notas:** Tiene tabs: Temperaturas, Vencimientos, Limpieza, Merma. El registro de merma usa `useMerma` directamente desde HACCP. Colores de vencimiento: rojo (<0 días), naranja (≤1 día), amarillo (≤3 días), verde (>3 días). La frecuencia de limpieza puede ser: cada_turno, diaria, semanal, mensual.

---

### /turnos
- **Propósito:** Planilla de turnos semanal. ABM de miembros de equipo y asignación de turnos (mañana/tarde/noche/doble/libre).
- **Tablas:** `equipo_miembros`, `turnos`, `puestos`
- **Acciones:** Crear/editar/eliminar miembros, asignar turno por día (upsert), navegar entre semanas, ver turno actual, crear puestos personalizados.
- **Componentes usados:** `useEquipo`, `PageTransition`
- **Notas:** La tabla `turnos` tiene UNIQUE (`miembro_id`, `fecha`) — siempre upsert. Los tipos de turno se leen de `TURNO_CONFIG` exportado desde `useEquipo`. La misma pantalla hace de "Equipo" (el módulo `equipo` en constants apunta a `/turnos`).

---

### /merma
- **Propósito:** Registro y análisis de mermas del restaurante. Filtros por período y motivo.
- **Tablas:** `merma`, `productos`
- **Acciones:** Registrar nueva merma via `MermaBottomSheet`, ver historial agrupado por fecha, filtrar por período (hoy/semana/mes/todo) y por motivo, ver costo estimado de merma.
- **Componentes usados:** `useMerma`, `MermaBottomSheet`, `PageTransition`
- **Notas:** Los motivos de merma vienen de `MOTIVOS_MERMA` en `types/index.ts`. Al registrar merma con `producto_id`, descuenta automáticamente `stock_actual` en `productos`.

---

### /calendario
- **Propósito:** Calendario visual (mes + semana + día) de eventos del restaurante. Integra entregas de proveedores como eventos automáticos.
- **Tablas:** `eventos`, `pedidos`, `proveedores`
- **Acciones:** Crear/editar/eliminar eventos, navegar entre vistas (mes/semana/día), ver pedidos pendientes como eventos de entrega.
- **Componentes usados:** `useCalendario`
- **Notas:** Los pedidos con `fecha_entrega_esperada` aparecen automáticamente en el calendario como eventos de tipo `entrega_proveedor`. Los tipos de evento incluyen: entrega_proveedor, reserva_especial, evento_equipo, mantenimiento, capacitacion, visita_bromatologia, otro.

---

### /ventas
- **Propósito:** Registro de ventas diarias. Importación desde texto libre, Excel, Sheets o entrada manual. Análisis por período.
- **Tablas:** `ventas`, `ventas_items`
- **Acciones:** Registrar venta (manual, texto IA, Excel/Sheets), ver historial filtrado por período, ver total, cubiertos, detalle por plato.
- **Componentes usados:** `useVentas`
- **Notas:** La importación por texto usa `/api/ventas/import` (Claude Haiku extrae datos del texto libre). La importación por Excel/Sheets procesa el archivo localmente (xlsx). Tiene lógica para duplicados de fecha no resuelta.

---

### /configuracion
- **Propósito:** Panel de administración. Gestión de miembros del equipo (roles/plazas), configuración de permisos por rol y datos del restaurante. Solo para admin.
- **Tablas:** `equipo_miembros`, `rol_permisos`
- **Acciones:** Cambiar rol/plaza de miembros, configurar qué módulos puede ver/editar cada rol, ver datos del restaurante.
- **Componentes usados:** `usePermisos`, `useAuth`
- **Notas:** Redirige a `/` si el usuario no es admin. Tiene 3 tabs: Equipo, Permisos, Restaurante. La tab Restaurante aparece en el código pero no está detallada en el brief oficial.

---

## Hooks custom

| Hook | Tablas | Propósito |
|------|--------|-----------|
| `useRestauranteId` | — | Retorna `restaurante_id` del contexto auth. Retorna `''` mientras carga. |
| `useStock` | `productos` | CRUD de productos/inventario. Calcula estado crítico/bajo/ok. |
| `useTareas` | `tareas` | CRUD de tareas con status, prioridad, checklist embebido, categoría y plaza. |
| `useChecklist` | `checklist_secciones`, `checklist_items`, `checklist_rutina`, `checklist_registros`, `checklist_rutina_registros` | Mise en place: secciones, ítems, rutinas periódicas y sus registros de cumplimiento. |
| `useRecetas` | `recetas`, `ingredientes` | CRUD de recetas. El alta va via `/api/recetas/save`. Calcula food cost. |
| `useCarta` | `carta_items`, `plato_recetas`, `plato_packaging`, `recetas`, `ingredientes`, `productos` | Gestión del menú. Relaciona ítems de carta con recetas y packaging. |
| `useFacturas` | `facturas`, `factura_items`, `proveedores`, `productos`, `precio_historial`, `recetas`, `ingredientes` | CRUD de facturas. Al confirmar, actualiza precios en stock y recetas. |
| `usePedidos` | `pedidos`, `pedido_items`, `facturas`, `factura_items`, `productos` | CRUD de pedidos. Al recibir, actualiza stock_actual. |
| `useProveedores` | `proveedores`, `facturas` | CRUD de proveedores y fetch de facturas por proveedor. |
| `useHaccp` | `haccp_equipos`, `haccp_temperaturas`, `haccp_vencimientos`, `haccp_limpieza`, `haccp_limpieza_registros` | Registro HACCP completo: temperaturas, vencimientos, limpieza. |
| `usePase` | `pase_mensajes` | Chat de cocina. Envío, fetch paginado/reciente, marcar leídos. |
| `useEquipo` | `equipo_miembros`, `turnos`, `puestos` | ABM de miembros del equipo y planilla de turnos semanal. |
| `useProduccion` | `platos_compuestos`, `plato_componentes`, `produccion_diaria`, `ingredientes` | Planilla de producción diaria: platos, componentes, estados, duplicar menú. |
| `useProduccionRegistros` | `produccion_registros` | Historial de producción real con multiplicadores. Calcula rendimiento promedio por receta. |
| `useProduccionSugerida` | `ventas` | Sugiere cantidad a producir basado en promedio de cubiertos de días similares (últimos 21 días). Solo admin/chef. |
| `useReportes` | `facturas`, `productos`, `carta_items`, `recetas`, `ingredientes`, `precio_historial`, `tareas` | Fetch lazy de métricas por período: resumen, food cost, compras, precios, producción. |
| `useCalendario` | `eventos`, `pedidos`, `proveedores` | CRUD de eventos del calendario. Muestra pedidos como eventos de entrega. |
| `useVentas` | `ventas`, `ventas_items` | CRUD de ventas diarias con detalle por plato. |
| `useMerma` | `merma`, `productos` | Registro de mermas. Al registrar con producto_id, descuenta stock_actual. |
| `usePackagingGrupos` | `packaging_grupos`, `packaging_grupo_items`, `plato_packaging`, `productos` | Grupos de packaging reutilizables. Permite asignar packaging a ítems de carta. |
| `useCategoriasProducto` | `categorias_producto` | CRUD de categorías personalizadas de productos. |
| `usePermisos` | `rol_permisos` | Permisos por rol: qué módulos puede ver/editar/eliminar cada rol. |
| `useKitchenCoach` | — | Chat con IA (Claude). Llama a `/api/coach`. Maneja streaming de respuesta, mensajes, estado open/close. |
| `useDebounce` | — | Utility: debounce genérico con delay configurable. |

---

## Componentes clave

| Componente | Propósito | Usado en |
|-----------|-----------|---------|
| `DashboardHeader` | Header del dashboard con avatar, toggle Modo Servicio, botón Coach y progreso de mise. | `DashboardClientView` |
| `MiPlaza` | Card circular con progreso del checklist de la plaza actual del usuario. | `DashboardClientView` |
| `ModulosGrid` | Grid de accesos rápidos a módulos (filtrado por rol y permisos). | `DashboardClientView` |
| `PasePreview` | Preview de últimos mensajes del pase con respuesta rápida. | `DashboardClientView` |
| `StockCriticoSection` | Lista de productos en estado crítico o bajo con link a stock. | `DashboardClientView` |
| `ModoServicio` | Componente para activar/desactivar modo servicio. | `DashboardClientView` |
| `BottomNav` | Barra de navegación inferior con 4 ítems fijos (home, operaciones, recetario, stock) + botón "más". | `app/(app)/layout.tsx` |
| `MoreMenu` | Drawer con accesos a todos los módulos secundarios del rol. Incluye botón ImportadorUniversal. | `app/(app)/layout.tsx` |
| `KitchenCoachFAB` | FAB flotante con chat de IA. Recibe contexto de stock crítico y tareas. | `DashboardClientView` |
| `ImportadorUniversal` | Importador de Excel/CSV que detecta el tipo (stock/proveedores/facturas/recetas) y mapea columnas con IA. | `MoreMenu`, `ProveedoresPage` |
| `ImportadorArchivo` | Importador de archivo genérico con UndoBanner para revertir la importación. | `ProveedoresPage`, `StockClientView` |
| `MermaBottomSheet` | Bottom sheet para registrar merma. Busca producto en DB, calcula costo estimado. | `ProduccionPage`, `MermaPage` |
| `ImageCropModal` | Modal para recortar imagen antes de subir (para fotos de facturas/recetas). | `FacturasPage`, `RecetarioPage` |
| `PageTransition` | Wrapper de animación de entrada de página. | Múltiples páginas |
| `RouteGuard` | Protege rutas — redirige a /login si no hay sesión. | `app/(app)/layout.tsx` |
| `SWRFallback` | Provee datos prefetcheados del server al cliente via contexto SWR-like. | Server pages con prefetch |

---

## API Routes

| Route | Método | Propósito |
|-------|--------|-----------|
| `/api/coach` | POST | Chat con Kitchen Coach. Llama a Anthropic API con contexto del restaurante (stock crítico, vencimientos, food cost). Modelo: Claude Sonnet 4.6. |
| `/api/facturas` | POST | OCR de facturas con IA. Recibe imagen (base64) o PDF y extrae todos los datos estructurados. Modelo: Claude Haiku 4.5. |
| `/api/listas-precios` | POST | Extrae productos y precios de una lista de precios (imagen/PDF). Modelo: Claude Haiku 4.5. |
| `/api/recetas/import` | POST | Importación de recetas con IA: soporta modo `image`, `text` y `google_url`. También tiene modo `adjust` para ajustar una receta ya importada. |
| `/api/recetas/save` | POST | Único endpoint que usa `createAdminClient()`. Inserta receta + ingredientes. Tres modos: completo, solo receta, solo ingredientes. |
| `/api/ventas/import` | POST | Extrae datos de ventas de texto libre (resumen de POS, WhatsApp, etc.). Modelo: Claude Haiku 4.5. |
| `/api/importador/mapeo` | POST | Mapea columnas de un Excel a los campos de KitchenOS usando IA. Devuelve el mapeo sugerido con confianza. |
| `/api/importador/import` | POST | Ejecuta la importación de datos ya mapeados hacia `productos` o `proveedores`. Usa `createAdminClient()`. |
| `/api/importador/undo` | POST | Revierte una importación: soft-delete de los productos o proveedores importados por ID. |
| `/api/importador/stock-fudo` | POST | Importador específico para exportaciones de Fudo POS (stock). Parsea hojas "Ingredientes" y "Productos". |
| `/api/importador/facturas-fudo` | POST | Importador específico para exportaciones de Fudo POS (facturas/compras). Convierte Excel de Fudo al formato interno. |
| `/api/migrate` | POST | Utilidad de migración puntual: verifica/agrega la columna `status` en `recetas`. Endpoint de mantenimiento. |

---

## Tablas Supabase detectadas

| Tabla | Columnas clave detectadas | Usado en |
|-------|--------------------------|---------|
| `user_restaurantes` | `user_id`, `restaurante_id`, `rol` | Auth, página home, múltiples hooks |
| `equipo_miembros` | `user_id`, `nombre`, `apellido`, `rol`, `plaza`, `avatar_url`, `color`, `restaurante_id` | `useEquipo`, `perfil`, `configuracion`, `produccion` |
| `productos` | `nombre`, `categoria`, `unidad`, `stock_actual`, `stock_minimo`, `stock_critico`, `precio_unitario`, `proveedor_nombre`, `activo`, `restaurante_id` | `useStock`, `useFacturas`, `usePedidos`, `useMerma`, `carta` |
| `tareas` | `titulo`, `descripcion`, `status` (`pendiente\|en_proceso\|completada`), `prioridad`, `categoria`, `plaza`, `fecha_limite`, `checklist` (JSON), `receta_id`, `tiempo_estimado_min`, `restaurante_id` | `useTareas`, `useProduccion`, `usePase`, `useReportes` |
| `checklist_secciones` | `nombre`, `orden`, `plaza`, `restaurante_id` | `useChecklist` |
| `checklist_items` | `seccion_id`, `nombre`, `orden`, `receta_id`, `restaurante_id` | `useChecklist` |
| `checklist_rutina` | `nombre`, `frecuencia`, `ultima_vez`, `orden`, `restaurante_id` | `useChecklist` |
| `checklist_registros` | `item_id`, `fecha`, `completado`, `usuario_id`, `restaurante_id` | `useChecklist` |
| `checklist_rutina_registros` | `rutina_id`, `fecha`, `completado`, `restaurante_id` | `useChecklist` |
| `recetas` | `nombre`, `categoria`, `porciones`, `tiempo_min`, `precio_venta`, `procedimiento`, `activa` (bool soft-delete), `status` (`published\|draft`), `restaurante_id` | `useRecetas`, `useCarta`, `useReportes`, `useFacturas` |
| `ingredientes` | `receta_id`, `nombre`, `cantidad`, `unidad`, `costo_unitario`, `unidad_costo`, `merma_pct` | `useRecetas`, `useCarta`, `useFacturas`, `useProduccion`, `useReportes` |
| `carta_items` | `nombre`, `descripcion`, `categoria`, `precio_venta`, `receta_id`, `disponible`, `restaurante_id` | `useCarta`, `useReportes` |
| `plato_recetas` | `carta_item_id`, `receta_id`, `porciones` | `useCarta` |
| `plato_packaging` | `carta_item_id`, `producto_id`, `cantidad`, `restaurante_id` | `useCarta`, `usePackagingGrupos` |
| `packaging_grupos` | `nombre`, `restaurante_id` | `usePackagingGrupos` |
| `packaging_grupo_items` | `grupo_id`, `producto_id`, `cantidad` | `usePackagingGrupos` |
| `pase_mensajes` | `texto`, `tipo`, `prioridad` (`normal\|importante\|urgente`), `plaza`, `autor_id`, `autor_nombre`, `leido_por` (array JSON), `restaurante_id` | `usePase` |
| `pedidos` | `proveedor_nombre`, `fecha_pedido`, `fecha_entrega_esperada`, `status` (`borrador\|enviado\|parcial\|recibido`), `total_estimado`, `notas`, `restaurante_id` | `usePedidos`, `useCalendario` |
| `pedido_items` | `pedido_id`, `producto_nombre`, `cantidad`, `unidad`, `precio_estimado` | `usePedidos` |
| `facturas` | `proveedor_nombre`, `proveedor_cuit`, `fecha_factura`, `tipo_factura` (A/B/C/X/remito/ticket), `numero_factura`, `condicion_pago`, `subtotal`, `iva_total`, `total`, `status` (`pendiente\|confirmada\|observada`), `restaurante_id` | `useFacturas`, `useProveedores`, `useReportes` |
| `factura_items` | `factura_id`, `producto_nombre`, `producto_id`, `cantidad`, `unidad`, `precio_unitario`, `alicuota_iva`, `subtotal` | `useFacturas`, `usePedidos` |
| `precio_historial` | `producto_id`, `producto_nombre`, `precio_anterior`, `precio_nuevo`, `proveedor_nombre`, `factura_id`, `fecha`, `restaurante_id` | `useFacturas`, `useReportes` |
| `proveedores` | `nombre`, `rubro`, `telefono`, `dias_entrega` (array), `activo`, `restaurante_id` | `useProveedores`, `useCalendario` |
| `haccp_equipos` | `nombre`, `tipo` (camara/freezer/heladera/horno/baño_maria), `temp_min`, `temp_max`, `restaurante_id` | `useHaccp` |
| `haccp_temperaturas` | `equipo_id`, `temperatura`, `fecha`, `hora`, `usuario_id`, `restaurante_id` | `useHaccp` |
| `haccp_vencimientos` | `nombre`, `fecha_vencimiento`, `lote`, `status` (vigente/vencido/descartado), `restaurante_id` | `useHaccp` |
| `haccp_limpieza` | `nombre`, `zona`, `frecuencia`, `ultima_vez`, `restaurante_id` | `useHaccp` |
| `haccp_limpieza_registros` | `limpieza_id`, `fecha`, `completado`, `usuario_id`, `restaurante_id` | `useHaccp` |
| `merma` | `producto_nombre`, `producto_id`, `cantidad`, `unidad`, `motivo`, `motivo_detalle`, `costo_estimado`, `turno`, `fecha`, `restaurante_id` | `useMerma` |
| `turnos` | `miembro_id`, `fecha`, `tipo` (mañana/tarde/noche/doble/libre), `restaurante_id` — UNIQUE(miembro_id, fecha) | `useEquipo` |
| `puestos` | `nombre`, `restaurante_id` | `useEquipo` |
| `platos_compuestos` | `nombre`, `categoria`, `restaurante_id` | `useProduccion` |
| `plato_componentes` | `plato_compuesto_id`, `nombre`, `cantidad`, `unidad`, `receta_id`, `tiempo_min`, `restaurante_id` | `useProduccion` |
| `produccion_diaria` | `componente_id`, `fecha`, `status` (`pendiente\|en_proceso\|listo`), `responsable_id`, `restaurante_id` | `useProduccion` |
| `produccion_registros` | `receta_id`, `tarea_id`, `fecha`, `cantidad_planificada`, `cantidad_real`, `multiplicador_real`, `usuario_id`, `usuario_nombre`, `notas`, `restaurante_id` | `useProduccionRegistros` |
| `ventas` | `fecha`, `origen` (excel/sheets/manual/pos), `total_ventas`, `cantidad_cubiertos`, `notas`, `restaurante_id` | `useVentas`, `useProduccionSugerida`, `useReportes` |
| `ventas_items` | `venta_id`, `nombre_plato`, `cantidad`, `precio_unitario` | `useVentas` |
| `eventos` | `titulo`, `descripcion`, `tipo`, `fecha_inicio`, `fecha_fin`, `hora_inicio`, `hora_fin`, `recurrente`, `frecuencia`, `color`, `proveedor_id`, `restaurante_id` | `useCalendario` |
| `rol_permisos` | `rol`, `modulos_visibles` (array), `puede_editar_stock`, `puede_editar_equipo`, `puede_editar_recetas`, `puede_editar_carta`, `puede_eliminar`, `restaurante_id` | `usePermisos` |
| `categorias_producto` | `nombre`, `restaurante_id` | `useCategoriasProducto` |

---

## Features no documentadas en CLAUDE.md

1. **Módulo Ventas** (`/ventas`): Registro de ventas diarias con importación por IA (texto libre) y Excel. Tiene tabla `ventas` y `ventas_items`. No mencionado en CLAUDE.md.

2. **Módulo Merma** (`/merma`): Pantalla dedicada para registro y análisis de mermas. El hook `useMerma` y el `MermaBottomSheet` existen pero CLAUDE.md no los menciona.

3. **Módulo Calendario** (`/calendario`): Calendario visual completo (mes/semana/día). Integra pedidos como eventos automáticos. No documentado.

4. **Módulo Configuración** (`/configuracion`): Panel admin con gestión de permisos por rol. Sistema `rol_permisos` complejo no documentado en CLAUDE.md.

5. **Sistema de Permisos** (`usePermisos`, `rol_permisos`): Tabla de permisos granulares por rol con control de visibilidad de módulos y edición de recursos. Solo mencionado vagamente en CLAUDE.md.

6. **Kitchen Coach streaming**: La API `/api/coach` usa streaming (`stream: true`) de la API de Anthropic. El hook `useKitchenCoach` acumula el stream con `AbortController`. Esto no está documentado.

7. **ImportadorUniversal + mapeo IA**: El sistema de importación masiva de Excel tiene 5 endpoints API propios (`/api/importador/mapeo`, `import`, `undo`, `stock-fudo`, `facturas-fudo`). El mapeo de columnas usa IA para detectar tipos de datos. No mencionado en CLAUDE.md.

8. **SWRFallback**: Patrón propio (no es SWR real) para pasar datos del Server Component al Client Component via contexto. Documentado como patrón pero el componente `SWRFallback.tsx` y el hook interno no están explicados.

9. **Packaging de carta**: Sistema de grupos de packaging reutilizables (`packaging_grupos`, `packaging_grupo_items`) para asignar materiales de empaque a ítems de carta. No documentado.

10. **ProduccionRegistros**: Tabla `produccion_registros` que registra el multiplicador real de cada producción y calcula el rendimiento promedio histórico para el checklist. No documentado.

11. **Modo Servicio**: Toggle en el dashboard que activa algún modo especial. El estado parece no persistir en DB — no hay tabla ni columna correspondiente detectada.

12. **Importación de recetas por link de Google** (`glink`): Modo de importación que recibe una URL de Google (Docs/Drive) y la pasa a Claude para extraer la receta. No documentado.

13. **Módulo Ventas con sugerencia de producción** (`useProduccionSugerida`): Cruza datos de ventas históricas con producción planificada para sugerir cantidades. Solo activo para admin/chef.

---

## Gaps / Incompleto

1. **`USUARIOS_MOCK` en /pase (líneas 55-60)**: Lista hardcodeada de usuarios para filtrar mensajes. Debería cargarse de `equipo_miembros`. Esto limita el filtro por usuario al no reflejar el equipo real.

2. **Modo Servicio sin persistencia**: El toggle "Modo Servicio" en `DashboardHeader` no guarda estado en DB. Si el usuario recarga la app, el modo se resetea. No hay tabla ni columna para este estado.

3. **`/api/migrate`**: Endpoint de migración one-shot que debería haberse removido tras su uso. Expone capacidad de leer la tabla `recetas` sin autenticación fuerte (solo usa service role).

4. **`WelcomeDashboard.tsx`**: Componente existente (`components/dashboard/WelcomeDashboard.tsx`) sin uso claro detectado en ninguna página auditada.

5. **`components/ops/` (EventoBanner, ItemOps, OpsToggle, ProduccionSheet, QuickAdd, RecetaDrawer, SeccionOps)**: Suite de componentes para el módulo Operaciones que existen en el filesystem pero no se importan directamente desde `/operaciones/page.tsx`. Probablemente son usados dentro de los ClientView de los sub-módulos embebidos, o son código anterior que quedó del rediseño.

6. **`components/mise/ProductoMiseCard.tsx`**: Componente de mise que existe pero no está siendo importado en las páginas auditadas. Posiblemente remanente de una versión anterior del checklist.

7. **`/app/(app)/DashboardClientView.tsx`**: Archivo con la lógica principal del dashboard, ubicado en la carpeta `(app)/` directamente (no en `components/`). Rompe levemente la convención de separar páginas de componentes.

8. **Supabase Realtime no implementado**: El módulo `/pase` es un chat pero no usa subscriptions de Supabase Realtime — los mensajes solo se actualizan al hacer fetch manual (hay un `useEffect` con intervalo o al enviar). Esto significa que los mensajes nuevos de otros usuarios no aparecen en tiempo real.

9. **`app/(app)/calendario/loading.tsx` y `merma/loading.tsx`**: Archivos de loading skeleton que existen para Calendario y Merma pero no para todos los módulos — inconsistente.

10. **`scripts/`**: Hay varios scripts de migración (`migrate.mjs`, `migrate-checklist.mjs`, `migrate-checklist-v2.mjs`, `migrate-facturas.mjs`, `migrate-pase.mjs`, `migrate-s4s5.mjs`, `seed.mjs`) que parecen ser herramientas de setup one-time. No está claro cuáles se ejecutaron ya y cuáles son necesarios para un setup nuevo.
