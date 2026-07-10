# Plan — Roadmap de features desde el research de competencia (jul 2026)

> Origen: `docs/research-competencia-2026-07.md` (5 jul 2026) — inspección de 9 plataformas (Fudo, CajaOS, bcnsoft, Artics, Frambuesa, Ganapán, Iristrace, Cuiner, Yurest), tabla comparativa, gaps y backlog priorizado. Este archivo convierte ese backlog en sesiones ejecutables.
> **Prerequisito duro: D0 de `PLAN-UI-IDENTIDAD-2026-07.md`** — ninguna feature de este plan se implementa sin los componentes canónicos. La identidad y la lógica de funcionamiento son las mismas para todo lo nuevo (ver "Contrato de feature nueva" abajo).

---

## Cómo usar este archivo

1. Leé `CLAUDE.md` completo antes de tocar código. Leé la ficha correspondiente en `docs/research-competencia-2026-07.md` para el contexto competitivo del bloque.
2. **Un bloque por sesión.** Los bloques grandes están partidos en sub-sesiones (a/b/c) — también una por vez.
3. Antes de dar por terminado: `npm run build` limpio + criterio de aceptación verificado con datos reales (Bros o El Rescoldo según el bloque).
4. Nueva tabla en DB → agente `db-designer` o skill `/add-rls` (RLS multi-tenant desde el día 1, patrón `mi_restaurante_id()`). Nueva pantalla → skill `/new-module`. Coach en pantalla nueva → skill `/coach-screen`.
5. Al terminar: checkbox acá + registro de sesiones + `PENDIENTES.md` + `ESTADO-ACTUAL.md` si suma módulo.

## Contrato de feature nueva (identidad + lógica de funcionamiento)

Toda feature de este plan cumple, sin excepción:

| Aspecto | Regla |
|---|---|
| **UI** | Componentes de `components/ui/` (D0): `SegmentedTabs`, `FilterChips`, `EmptyState` (siempre con CTA), `HeaderAction`, `Avatar`, `Num`. Paleta CSS vars (`--navy`, `--accent`, `--surface`…). Iconos Material Symbols. Español argentino. Sin estéticas propias. |
| **Vistas públicas** (carta QR, calculadoras, demo) | Misma paleta e identidad que la app, layout propio sin BottomNav/Coach. Header navy + logo. Son la vidriera: el ui-auditor las revisa antes de publicar. |
| **Datos** | Hooks con SWR + guard `RESTAURANTE_ID` (`.claude/docs/hooks.md`). Verificar columnas con `/supabase-check`. RLS en toda tabla nueva. `NOTIFY pgrst, 'reload schema'` al final de cada migración. |
| **Permisos** | Todo módulo nuevo se registra como `ModuloId` y entra a la matriz de puestos (`puedeVer()`); nunca hardcodear visibilidad por rol. |
| **Coach** | Toda pantalla nueva escribe `kc_screen_context` (patrón hooks.md) — mínimo screen + KPIs. Tour/suggestions solo si la pantalla es de uso diario. |
| **Empty states** | Nunca un punto muerto: siempre CTA hacia el primer paso (lección de la auditoría D5). |
| **Loading/errores** | Loading + vacío obligatorios (ui.md); errores de Supabase extraídos con el patrón `{message}` (no `instanceof Error`). |

---

### Orden recomendado de sesiones

| Sesión | Bloque | Gate |
|---|---|---|
| 1 | Q1 Carta QR pública | D0 hecho |
| 2 | Q3 Export Excel en Reportes | — |
| 3 | Q2 Demo pública sin registro | — |
| 4 | Q4 Etiquetas imprimibles | — |
| 5 | Q5 Comparador de precios entre proveedores | — |
| 6–7 | M1 Arqueo/cierre de caja (a: modelo+apertura/cierre · b: UI salón) | — |
| 8 | M5 Cuentas por pagar (proveedores) | — |
| 9–10 | M3 Fichaje real (a: clock-in/out · b: horas→costo laboral en Reportes) | — |
| 11–12 | M4 Checklists nivel auditoría (a: scoring+condicionales · b: workflows) | — |
| 13+ | E1 Producción sugerida (la apuesta) · luego M6/M7/M8/E2/E4 según tracción | Q1+M1 en producción |

**En paralelo (no sesiones de código):** Q6 precios públicos (decisión de pricing con Facundo) · M2 ARCA sigue su curso en `PLAN-MEJORAS-AUDITORIA-2026-07.md` B2.

---

# FASE Q — Quick wins (S/M, alto impacto visible)

## Q1 — Carta QR pública 🔴 la feature-gancho que tiene el 100% de la competencia

- [x] Completado — fecha: 2026-07-06

**Referencia:** todos (Frambuesa "menú QR sin login", CajaOS, Ganapán, Fudo). K-OS ya tiene la carta interna con fotos, categorías dinámicas y tags dietarios — falta solo la vista pública.

**Qué hacer:**
1. Migración: `restaurantes.slug TEXT UNIQUE NULL` (generado del nombre, editable en Configuración). `/add-rls` no aplica (lectura pública) — ver punto 3.
2. Ruta `app/(publico)/carta/[slug]/page.tsx` — route group nuevo **sin** BottomNav/Coach/auth. Server Component con `createAdminClient` (server-only) que lee únicamente campos públicos: nombre del restaurante, categorías, y de `carta_items` solo `nombre, descripcion, precio_venta, foto_url, tags, categoria, disponible` (los no disponibles se muestran atenuados "no disponible hoy" — el 86 en vivo es diferencial vs carta PDF de la competencia). **Nunca** exponer costo/food cost.
3. Sin RLS pública nueva: el admin client solo en el RSC, con select explícito de columnas — documentar en el código el porqué.
4. UI: mobile-first, identidad K-OS (header navy con nombre del local, cards con foto, chips de tags dietarios, filtro por categoría con `FilterChips`). Revalidación ISR corta (60s) para que el 86 se refleje.
5. En Configuración (admin): sección "Carta pública" — toggle activar, slug editable, QR generado para descargar/imprimir (lib QR liviana o API de imagen; el QR apunta a `https://kos-app-one.vercel.app/carta/{slug}`).

**Criterio de aceptación:** con El Rescoldo, `/carta/el-rescoldo` carga sin sesión, muestra platos con foto y precio, y marcar un 86 en la app lo atenúa en ≤1 min; ningún campo de costos en el HTML; build limpio.

---

## Q2 — Demo pública sin registro 🟠 (idea robada de Ganapán)

- [x] Completado — fecha: 2026-07-06

**Referencia:** Ganapán "Ver demo sin registrarme" — único del grupo; convierte curiosos en leads con fricción cero. El Rescoldo ya está seedeado en todos los módulos.

**Qué hacer:**
1. Usuario `demo@elrescoldo.com` con rol de solo-lectura: nueva fila en `rol_permisos` (`rol='demo'`) con módulos visibles amplios. El enforcement de escritura va en DB, no en UI: las políticas INSERT/UPDATE/DELETE ya exigen `restaurante_id = mi_restaurante_id()` — agregar a las políticas de escritura la condición `NOT is_demo_user()` (función SQL que chequea el uid del demo) **o** más simple: un segundo restaurante "El Rescoldo Demo" clonado periódicamente y un cron que lo resetea cada noche (evaluar costo/beneficio; empezar por lo simple: usuario demo sobre el Rescoldo real de marketing + reset nocturno de sus escrituras).
2. Botón "Ver demo" en el login (`app/(auth)/login`) que autentica al demo con un click.
3. Banner persistente en sesión demo: "Estás viendo la demo — Crear mi restaurante →".
4. Medir: evento simple (tabla `demo_visitas` o analytics existente) para saber si la usan.

**Criterio de aceptación:** desde /login, un click entra a la demo con datos ricos; nada de lo que el visitante toque persiste al día siguiente; el banner lleva al registro; build limpio.

---

## Q3 — Export Excel/CSV en Reportes 🟠 (paridad con Fudo/Cuiner)

- [x] Completado — fecha: 2026-07-06

**Referencia:** Fudo exporta todos sus reportes; Cuiner Controller también. K-OS solo exporta stock. `xlsx` ya está en el stack.

**Qué hacer:**
1. Botón "Exportar" (`HeaderAction` secundaria) en Reportes, contextual al tab activo: CMV, Compras (por proveedor y por categoría), Food Cost (por receta con costo y %), Presupuesto vs Real, Rendimiento. Cada export = una hoja con los datos del período seleccionado + fila de metadatos (restaurante, período, fecha de export).
2. Reusar el patrón del export de stock existente (buscar cómo genera el xlsx `stock/ClientView` y extraer helper `lib/export/xlsx.ts` si no existe).
3. Respeta permisos: si el rol no ve montos, no exporta (el botón no aparece).

**Criterio de aceptación:** con Bros, exportar CMV de "Último mes" baja un .xlsx abrible con los mismos números de la pantalla; build limpio.

---

## Q4 — Etiquetas de producción imprimibles (ESC/POS) 🟠 nadie local lo tiene

- [x] Completado — fecha: 2026-07-07

**Referencia:** Yurest (etiquetado con lote y caducidad, solo enterprise). K-OS ya tiene: `haccp_vencimientos`, mise con recipientes, y el cliente ESC/POS WebUSB/BT implementado en salón (bloque A5 del plan anterior).

**Qué hacer:**
1. Endpoint `POST /api/ingest/escpos` — agregar `mode=etiqueta`: genera bytes de etiqueta (nombre de la producción, fecha de elaboración, fecha de caducidad, responsable, restaurante) — layout chico para impresora térmica.
2. Botón "Imprimir etiqueta" en: (a) `ProductoMiseCard` / panel OPS al marcar una producción como lista; (b) HACCP → Vencimientos al registrar un producto. Reusar `printViaUSB`/`printViaBluetooth` de `salon/page.tsx` → extraer a `lib/print/escpos.ts` compartido (hoy vive en la página del salón).
3. La caducidad se calcula con días configurables por receta (campo nuevo `recetas.vida_util_dias INT NULL` — migración chica) con default 3 días editable al imprimir.
4. Al imprimir desde mise, ofrecer crear el registro en `haccp_vencimientos` (cierra el loop producción→HACCP).

**Criterio de aceptación:** desde el mise, "Imprimir etiqueta" genera el ticket (o descarga .bin sin impresora) y opcionalmente crea el vencimiento en HACCP; build limpio.

---

## Q5 — Comparador de precios entre proveedores 🟠 (Yurest compras — argumento de venta duro)

- [x] Completado — fecha: 2026-07-07

**Referencia:** Yurest ("ahorro hasta 12%", alertas por desviación). Los datos ya existen: `precio_historial` + `factura_items` por proveedor.

**Qué hacer:**
1. Nueva vista en Stock (tab o sección "Precios") o en Reportes → Precios (ya existe el tab Precios/inflación — extenderlo): por producto, últimos precios pagados **por proveedor** (query sobre `factura_items` join `facturas.proveedor_nombre`, últimos 90 días), destacando mejor precio y delta % contra lo último pagado.
2. Badge en el detalle de producto: "Pagaste X% más que el mejor precio reciente (Proveedor Y, $Z el {fecha})".
3. Alerta agregada en Reportes: top 10 productos con mayor sobreprecio del período (potencial de ahorro en $ — el número de marketing).
4. Cuidado con unidades: comparar solo precios de la misma unidad canónica (`canonUnit`); excluir factor-0.

**Criterio de aceptación:** con Bros, un producto comprado a ≥2 proveedores muestra la comparación y el badge; el top 10 de sobreprecio da números creíbles; build limpio.

---

## Q6 — Precios públicos + página comparativa (decisión + landing) 🟡 no es sesión de código pura

- [ ] Completado — fecha: ____

**Referencia:** 6 de 9 competidores publican precios; Frambuesa tiene `/comparison` pública. Ventana detectada: $35k–$65k/mes; ancla de valor: Fudo cobra $55k/mes solo por su agente IA.

**Qué hacer:**
1. **Decisión con Facundo** (no código): estructura de planes (propuesta del research: plan "Cocina" BOH puro / plan "Completo" con salón+fiscal, Coach IA como diferenciador del plan alto) y números.
2. Página pública `/planes` (route group público de Q1): tabla de planes con la identidad K-OS + CTA a registro/demo (Q2).
3. Página `/comparacion` estilo Frambuesa: K-OS vs "sistemas POS" vs "planillas" — sin nombrar competidores, usando la tabla del research como insumo.

**Criterio de aceptación:** precios acordados y publicados; ambas páginas linkeadas desde el login/registro.

---

## Q7 — Calculadoras públicas como lead magnets 🟡

- [ ] Completado — fecha: ____

**Referencia:** bcnsoft (8 calculadoras + 7 planillas como motor de captación), Fudo (hub de recursos IA). La matemática ya existe en el producto.

**Qué hacer:**
1. Bajo el route group público: `/herramientas/food-cost` (ingredientes + precio de venta → % y sugerencia, reusando la lógica de costeo simplificada), `/herramientas/punto-de-equilibrio`, `/herramientas/delivery-propio-vs-apps` (comisión % vs costo repartidor). Client-side puro, sin DB.
2. Cada calculadora termina en CTA: "K-OS calcula esto solo con tus facturas — probá la demo" (link a Q2).
3. SEO básico: metadata es-AR, títulos con keywords ("calculadora food cost restaurante argentina").

**Criterio de aceptación:** las 3 calculadoras funcionan sin login, se ven con identidad K-OS y linkean a la demo; build limpio.

---

# FASE M — Mid-term (desarrollo real, claramente rentable)

## M1 — Arqueo y cierre de caja por turno 🔴 el eslabón que falta para reemplazar un POS

- [x] a) Modelo + apertura/cierre — fecha: 2026-07-07
- [x] b) UI de salón + arqueo ciego — fecha: 2026-07-07

**Referencia:** Fudo (arqueos, arqueo ciego, movimientos de caja), Ganapán, CajaOS. Las tablas `cuentas`, `pagos`, `medios_pago` ya existen (Fase 1 salón).

**Qué hacer (a):** tabla `cajas_turnos` (id, restaurante_id, abierta_por, fecha_apertura, monto_inicial, fecha_cierre, cerrada_por, montos_declarados JSONB por medio de pago, diferencia calculada, notas) con RLS. Agente `migrator` para el script. Lógica: al cerrar, sumar `pagos` del rango del turno por medio de pago vs declarado → diferencia.
**Qué hacer (b):** en salón (vista servicio, reglas ui.md de servicio): abrir caja (monto inicial), cerrar caja (contar por medio de pago), modo **arqueo ciego** opcional (config: no mostrar el esperado hasta declarar). Retiros/ingresos de caja intermedios. Reporte del cierre exportable (reusa Q3) + impresión ticket de cierre (reusa ESC/POS).

**Criterio de aceptación:** ciclo completo abrir→cobrar cuentas→retiro→cerrar con diferencia calculada; el cierre queda consultable en Reportes; build limpio.

---

## M3 — Fichaje real (clock-in/out → costo laboral) 🔴 convierte Reportes en P&L

- [x] a) Clock-in/out — fecha: 2026-07-09
- [x] b) Horas → costo laboral en Reportes — fecha: 2026-07-09

**Referencia:** Yurest fichajes, bcnsoft fichada. Hoy el "Iniciar turno" del dashboard es localStorage decorativo.

**Qué hacer (a):** tabla `fichajes` (id, restaurante_id, miembro_id, tipo entrada/salida, timestamp, origen). El banner "Iniciar turno" del dashboard pasa a escribir acá (mantener el localStorage como cache de estado). Vista en Turnos: quién está adentro ahora, historial por persona/semana. Edición manual solo admin (con auditoría de quién editó).
**Qué hacer (b):** `equipo_miembros.costo_hora NUMERIC NULL` (solo admin lo ve/edita). Reportes → nuevo tab o sección en Resumen: horas trabajadas del período × costo → **costo laboral**, al lado del CMV (los dos costos grandes juntos — ningún competidor local lo muestra así).

**Criterio de aceptación:** fichar entrada/salida desde el celular queda en DB; Reportes muestra costo laboral del período junto al CMV; permisos correctos (cocinero ve sus horas, no los costos); build limpio.

---

## M4 — Checklists nivel auditoría (scoring + condicionales + workflows) 🟠 robado de Iristrace

- [x] a) Scoring + foto obligatoria + condicionales — fecha: 2026-07-09
- [x] b) Workflows (falló → tarea) + reporte de auditoría — fecha: 2026-07-09

**Referencia:** Iristrace (scoring ponderado, lógica condicional, plantillas versionadas, workflow "completado con problemas → genera checklist/notifica"). Eleva el checklist K-OS de operativo a auditable — clave para franquicias y bromatología (y para E5).

**Qué hacer (a):** extender `checklist_rutina`/`checklist_items` (via migrator): `puntaje NUMERIC NULL`, `requiere_foto BOOLEAN`, `condicion JSONB NULL` (mostrar ítem si otro ítem respondió X). En el render del Mise/Control: capturar foto (bucket `fotos`, path `checklists/`), calcular score de la pasada.
**Qué hacer (b):** al completar una pasada con ítems fallidos → crear `tareas` automáticas (reusar el patrón de tools del Coach M5: `crear_tarea`); registro de auditoría con score histórico (gráfico CSS de evolución) + export PDF (patrón HACCP export).

**Criterio de aceptación:** una rutina con scoring y foto obligatoria se completa desde el mise; un ítem fallido genera tarea sola; el histórico de scores se ve y exporta; build limpio.

---

## M5 — Cuentas por pagar (proveedores) 🟠 el dato ya se captura

- [x] Completado — fecha: 2026-07-08

**Referencia:** bcnsoft (control de deudas con alertas de vencimiento), Fudo (ctas ctes). `facturas.condicion_pago` + `status` ya existen; el concepto "por pagar" ya está definido (`esPorPagar` en facturas/page).

**Qué hacer:** vista "Por pagar" elevada a primera clase: agenda de vencimientos (30/60 días desde fecha de factura según condición), total adeudado por proveedor, alertas en dashboard (card "Vencen esta semana: $X"), marcar pagada en un tap. Todo sobre `facturas` — sin tablas nuevas salvo que haga falta `fecha_vencimiento_pago` calculada/almacenada (evaluar en sesión).

**Criterio de aceptación:** con Bros, la agenda muestra qué se le debe a quién y cuándo vence; el dashboard avisa vencimientos de la semana; build limpio.

---

## M6 / M7 / M8 — CRM liviano · Pedido QR en mesa · Reservas 🟡 (definir al llegar)

- [ ] M6 CRM + cupones — fecha: ____
- [ ] M7 Pedido QR en mesa — fecha: ____
- [ ] M8 Reservas — fecha: ____

Quedan definidos a nivel research (fichas: Frambuesa/bcnsoft para CRM, Artics para QR-ordering, Cuiner Reservas como modelo de producto). **No planificar en detalle hasta que Q1 + M1 estén en producción** — M7 depende de la carta pública (Q1) y del flujo comanda→KDS existente; M8 puede venderse como módulo standalone (Cuiner lo cobra €21–29/mes aparte). Al activarlos: sesión de plan propia con `spec-to-code`.

---

# FASE E — Apuestas estratégicas (diferenciar, no igualar)

## E1 — Producción sugerida con IA 🔴 la bandera ("el único sistema que te dice qué producir")

- [x] a) Motor de sugerencia (sin IA: reglas) — fecha: 2026-07-10
- [x] b) Capa IA + integración Coach/OPS — fecha: 2026-07-10

**Referencia:** Yurest lo hace con reglas para enterprise (ventas reales × escandallos × previsión). K-OS tiene todas las piezas: `ventas_items` (qué se vendió por día), recetas con porciones, mise con `checklist_items.cantidad` + `demanda_viva`, carryover.

**Qué hacer (a):** `lib/produccion/sugerencia.ts`: para cada receta/plato con ventas, promedio de venta por día-de-semana (últimas N semanas de `ventas_items`) − stock de mise actual (`checklist_items`) → porciones sugeridas a producir. Endpoint `/api/produccion/sugerencia` (server client, RLS). UI: en OPS Planificación, botón "Sugerir producción de mañana" → preview editable → crea las tareas (reusa `activarMenu`/QuickAdd).
**Qué hacer (b):** capa Claude (patrón `/api/coach` M1: snapshot acotado + try/catch): ajusta la sugerencia por contexto (evento del calendario, feriado, clima si se quiere) y la explica en una línea por ítem ("los viernes vendés 40 bondiolas; tenés 12"). Tool nueva del Coach: `sugerir_produccion` → el chef se lo pide por chat.

**Criterio de aceptación:** con las ventas de Bros cargadas, la sugerencia de un viernes da cantidades coherentes con el histórico y se convierte en tareas de OPS en dos taps; el Coach responde "¿qué produzco mañana?" con la misma fuente; build limpio.

---

## E4 — Conector de ventas Fudo (posicionamiento "sumá K-OS a tu POS") 🟠

- [ ] Completado — fecha: ____

**Referencia:** Yurest ("se integra con los principales TPVs"). Cambia la venta de guerra frontal a complemento. Fudo tiene API pública (plan Pro) y el importador de ventas K-OS ya existe.

**Qué hacer:** `POST /api/integraciones/fudo/sync` — con API key del cliente (guardada cifrada en `restaurantes.configuracion`), trae ventas del día desde la API de Fudo y las inserta con el mismo pipeline del import de ventas (dedup por fecha). Config en Configuración → Integraciones. Cron diario (Vercel cron) opcional por restaurante. Investigar límites/formato de la API de Fudo en la sesión (documentación pública primero; si el plan del cliente no incluye API, degradar al flujo Excel actual con mensaje claro).

**Criterio de aceptación:** con una API key válida, "Sincronizar ahora" trae las ventas del día sin Excel; sin key, la pantalla explica el camino manual; build limpio.

---

## E2 / E3 / E5 — Coach por WhatsApp · Multisucursal/cocina central · HACCP certificable 🟢 horizonte

- [ ] E2 — fecha: ____ · [ ] E3 — fecha: ____ · [ ] E5 — fecha: ____

Documentados en el research (E2: ancla de precio $55k/mes del agente de Fudo; E3: requiere repensar `mi_restaurante_id()` → concepto "grupo", no arrancar sin un cliente multi-local real; E5: se apoya en M4 + Q4 + gestor documental). **Gate:** no arrancar ninguno sin decisión explícita de Facundo — cada uno merece su propio plan con `spec-to-code` + `db-designer`.

---

# Registro de sesiones

| Fecha | Bloque | Resultado / notas |
|---|---|---|
| 2026-07-10 | E1 Producción sugerida con IA — motor de reglas + capa IA/Coach (a+b) | Primer bloque de la fase E (apuesta estratégica). **Motor (a)**, `lib/produccion/sugerencia.ts`: para el día objetivo (default mañana), busca ventas de las últimas N semanas (default 8) que caigan en el mismo día de semana, matchea `ventas_items.nombre_plato` contra `recetas.nombre` por **nombre normalizado exacto** (mismo criterio que ya usan `ventas/page.tsx` `fcTeorico` y `carta/page.tsx` `RentabilidadView` — no fuzzy, precedente ya aceptado en el código), promedia lo vendido por receta (mínimo 2 fechas de muestra para no confiar en un solo dato), le resta el **stock actual real** de mise (`checklist_registros.cantidad_actual` más reciente de hoy/ayer — no el target `checklist_items.cantidad`, que es otra cosa) y sugiere `max(0, promedio − stock)`. Endpoint `GET /api/produccion/sugerencia` con `requireRestauranteId()` (server client, RLS — mismo patrón que `/api/stock/sugerir-minimos`, no admin client). **UI (a+b)**: botón "Sugerir producción" en el header de OPS → Planificación abre `SugerenciaProduccionSheet` (portal, mismo patrón que el selector de menú) con preview editable (checkbox + cantidad por ítem) y botón "Crear N tareas" que inserta en `tareas` clonando el shape de `activarMenu` (sin `menu_id`, `modo:'carta'`, hereda el carryover de 1 día gratis por compartir `turno_fecha`+dedupe existente). **Capa IA (b)**: decisión de diseño — la IA **nunca cambia los números** del motor de reglas, solo los narra; esto garantiza que OPS y el Coach muestren siempre la misma fuente. Botón "Explicar con IA" en el sheet llama `POST /api/produccion/sugerencia/explicar` (Claude Haiku, un llamado simple sin loop de tools, con contexto de `eventos` del día si hay) y agrega una línea de explicación por ítem sin tocar las cantidades. Tool nueva del Coach `sugerir_produccion` (`app/api/coach/route.ts`, ahora 5 tools) llama **la misma función** `calcularSugerenciaProduccion` directo (no por HTTP) y devuelve un resumen en texto para que el modelo lo narre — "¿qué produzco mañana?" responde con los mismos números que el botón de OPS. **Gotcha de calidad encontrado en verificación:** el primer prompt de `/explicar` a veces mezclaba el nombre de un ítem con el número de otro (ej. "Vendés 3,3 pollo frito..." en la explicación de "Bife") al procesar varios ítems en un solo llamado — no afectaba los números (correctos), solo el texto narrado. Fix: instrucción explícita en el prompt de no mencionar ni mezclar otros ítems de la lista. Verificado con datos reales de Bros (163 días de ventas, ene–jul 2026): para el viernes 2026-07-10 con 12 semanas de historia, el motor sugirió Hummus 6 (vendía 6.3 promedio, stock 0), Pollo frito 4, Bife 3, y correctamente **no sugirió nada** de Berenjenas agripicantes (vendía 5 promedio pero había 50 en stock real) — 171 renglones de venta del día no matchearon ninguna receta activa (mayormente vinos/bebidas, reportado como `itemsVendidosSinMatch` para transparencia). El botón de OPS creó 3 tareas reales en `tareas` con `receta_id`/`cantidad`/`turno_fecha` correctos; el tool del Coach, invocado con la misma fecha, devolvió los mismos números narrados y correctamente derivó al usuario al botón de OPS para confirmar (el tool es de solo lectura, no crea tareas). Datos de prueba (3 tareas) borrados al final. `npm run build` limpio (`/operaciones`, `/produccion` siguen `○ static`; nuevos `/api/produccion/sugerencia` y `/api/produccion/sugerencia/explicar` son `ƒ dynamic`, esperado). |
| 2026-07-09 (cont.) | M4 Checklists nivel auditoría (scoring + condicionales + workflows) (a+b) | **Decisión de scope de la sesión:** el plan pedía extender `checklist_rutina` *y* `checklist_items` con scoring/foto/condicional. Se implementó solo sobre `checklist_rutina` (controles periódicos tipo "Control de heladeras", que ya son el análogo más cercano a un checklist de auditoría Iristrace) y no sobre `checklist_items` (mise diario de stock/OPS — otra semántica, sin caso de uso concreto para scoring). Migración `20260709_checklist_auditoria.sql`: `checklist_rutina` +`puntaje NUMERIC`, `+requiere_foto BOOLEAN DEFAULT false`, `+condicion JSONB` (`{dependeDeId, mostrarSiEstado: 'ok'\|'fallo'}`); `checklist_rutina_registros` +`estado ('ok'\|'fallo')` +`foto_url`; tabla nueva `checklist_auditorias` (snapshot de una pasada por plaza+fecha, `UNIQUE(restaurante_id,plaza,fecha)`, RLS estándar). Un ítem con `puntaje` configurado pasa a ser un ítem de auditoría en el tab Rutina: en vez del check simple muestra botones OK/Falla, bloqueados hasta subir foto (`PhotoPicker`, componente ya existente, bucket `fotos/checklists/{rutina_id}-{fecha}`) si `requiere_foto`, y oculto por completo hasta que se cumpla su `condicion` (ej. "Reportar a mantenimiento" solo aparece si "Control de extintores" se marcó Falla). Barra de score en vivo en el tab ("Auditoría de hoy — N/M evaluados · score%"); al quedar evaluados todos los ítems de auditoría aplicables del día se hace upsert automático del snapshot en `checklist_auditorias` — sin botón "cerrar pasada" explícito, mismo espíritu que el resto del mise (auto-save on toggle). Marcar Falla crea una tarea automática (`Auditoría: <nombre>`, prioridad alta, dedup por título+fecha) reusando `agregarTarea` directo (no hizo falta pasar por el tool-use del Coach). `AddRutinaSheet` pasó a soportar también edición (antes solo alta) — toggle "Ítem de auditoría" revela puntaje/requiere foto/condicional; las rutinas sincronizadas desde HACCP→Limpieza (traen `dias_semana`/`dia_mes`) bloquean los campos nombre/frecuencia en el sheet para no desincronizarlas de su fuente. Reportes suma tab "Auditoría": gráfico de barras (evolución del score por fecha, reusa la técnica CSS `width/height %` ya usada en el resto de Reportes), lista de pasadas, export a Excel (patrón `TABS_EXPORTABLES` de Q3) y export a PDF dedicado (clon del patrón `exportHaccpPDF` de `haccp/page.tsx`, con jsPDF+autoTable). **Gotcha real encontrado en verificación (no en el plan):** `fetchAuditorias` del hook se escribió como función async plana (como el resto del CRUD del hook) pero `reportes/page.tsx` la usa dentro del array de dependencias de su propio `useCallback` (`loadTab`) — sin memoizar, cada render genera una referencia nueva → loop infinito de renders/efectos (visible como spam de "Maximum update depth exceeded" en consola, y la tab quedaba en "Cargando…" para siempre). Fix: envolver `fetchAuditorias` en `useCallback([RESTAURANTE_ID, supabase])`, igual que `fetchRegistros`/`fetchRutinaRegistros`/`fetchAll` ya hacían. Documentado en `.claude/docs/hooks.md`. Verificado con Playwright contra El Rescoldo (`admin@elrescoldo.com`): creado un ítem de auditoría de prueba con `requiere_foto=true` → OK/Falla deshabilitados sin foto → tras subir foto se habilitan → marcarlo OK sube el score a 100% (1/1 evaluados) → creado un segundo ítem condicionado a que el primero esté en Falla → confirmado que NO aparece mientras el primero está OK → se deshizo el OK, se volvió a marcar Falla → el ítem condicional aparece → se creó la tarea "Auditoría: TEST AUDITORIA — Extintores" en `/tareas` → Reportes → Auditoría mostró el score histórico (100%, 1 evaluado) con el gráfico y ambos botones de export descargaron (`reportes_auditoria_2026-07-09.xlsx` y `auditoria_2026-07-09.pdf`) sin errores. Datos de prueba (2 rutinas, sus registros, la tarea y el snapshot de auditoría) borrados de la DB al final; queda un archivo huérfano de 1×1px en `fotos/checklists/` que no se pudo borrar (bucket sin política DELETE + el service role `sb_secret_...` no funciona con la Storage REST API, gotcha ya documentado en `rls.md`) — inofensivo, sin referencias en DB. `npm run build` limpio (`/checklist`, `/reportes` siguen `○ static`). |
| 2026-07-09 | M3 Fichaje real (clock-in/out → costo laboral) (a+b) | **Decisión clave de la sesión:** el plan proponía una tabla `fichajes` nueva, pero la investigación previa encontró que `turnos_personal` **ya existía** (`id, restaurante_id, usuario_id→auth.users, fecha, entrada, salida, horas_total`, con RLS estándar y 34 filas de datos previos) y ya tenía un consumidor (`reportes/personal/page.tsx`, reporte de eficiencia por horas/producciones, sin costo). Se reusó esa tabla en vez de duplicar el concepto — solo se sumaron `editado_por TEXT NULL` + `editado_at TIMESTAMPTZ NULL` (auditoría de edición manual) y `equipo_miembros.costo_hora NUMERIC NULL` (migración `20260708_fichaje_costo_laboral.sql`). Hook nuevo `lib/hooks/useFichaje.ts`: `fichajeAbierto` (SWR, keyed por usuario+hoy), `marcarEntrada`/`marcarSalida`, `fetchQuienEstaAdentro` (admin, todo el restaurante), `fetchHistorial` (por persona/rango), `guardarFichajeManual` (alta/edición admin con `editado_por`/`editado_at`). Dashboard: el botón "Iniciar/Cerrar turno" (antes 100% localStorage decorativo) ahora escribe en `turnos_personal` de verdad, con el localStorage como cache de estado tal como pedía el plan (si falla la escritura de red no bloquea el flujo visual). Turnos: tab nueva "Fichajes" — todos los roles ven "Mis fichajes (14 días)" sin costos; solo admin ve además "Quién está adentro ahora" (lista en vivo) e "Historial semanal por persona" (selector + edición manual en bottom sheet, con inputs de fecha/hora locales convertidos a ISO UTC en el guardado). `costo_hora` en el form de Equipo: campo nuevo gateado por `isAdmin` con label "— solo vos lo ves", igual que el resto de la sesión de permisos por puesto. Reportes → CMV: `fetchCMV` suma en paralelo `equipo_miembros.costo_hora` (filtrado `not null`) + `turnos_personal` del período (actual y anterior), multiplica horas×tarifa por `usuario_id`→`auth_user_id` y devuelve `costoLaboral: number \| null` — **`null` explícito (no 0) si nadie del equipo tiene `costo_hora` cargado**, para no mostrar un costo laboral falso de $0; el KPI "Costo laboral" solo se renderiza si `esAdmin && costoLaboral !== null`, y si es `null` se muestra un mensaje inline invitando a cargar el costo por hora. **Gotcha real encontrado en verificación (no en el plan, en el schema):** `turnos_personal.horas_total` es columna **`GENERATED ALWAYS AS (EXTRACT(epoch FROM (salida-entrada))/3600)`** — el primer intento de `marcarSalida`/`guardarFichajeManual` mandaba `horas_total` calculado en el cliente en el payload del UPDATE/INSERT, y Postgres lo rechazaba con 400 (`"column horas_total can only be updated to DEFAULT"`), silenciado por el try/catch "no bloquea" de `confirmarCierre` — el turno se cerraba visualmente pero `salida` nunca se guardaba en DB. Fix: no mandar `horas_total` en ningún payload, dejar que la DB lo calcule sola; se eliminó el helper `horasEntre()` del cliente, ya innecesario. Verificado con Playwright contra El Rescoldo (`admin@elrescoldo.com`): iniciar turno desde el dashboard crea la fila en `turnos_personal`; tab Fichajes muestra "Quién está adentro ahora" con Facundo Aguirre en vivo; costo_hora=5000 guardado y visible solo en el form admin; cerrar turno desde el modal "Resumen del turno" persiste `salida` y la DB calculó `horas_total` sola; con una fila de prueba de 5h en un período con ventas reales (junio, vía SQL directo — julio no tenía ventas cargadas todavía, gotcha de datos de demo no de código), Reportes → CMV → Último mes mostró "COSTO LABORAL $25.000" (5h × $5.000, exacto). Dato aparte: una fila de fichaje abierta sin cerrar cruza la medianoche del sistema (07-08→07-09 durante la sesión) y queda "huérfana" para `fetchFichajeAbierto` (filtra por fecha=hoy) — no es un bug de la feature, es el comportamiento esperado de fichar por día, pero quedó como aprendizaje para no confundir con datos reales en la próxima verificación. Todos los fichajes/costo_hora de prueba borrados al final. `npm run build` limpio (`/turnos`, `/reportes`, `/` siguen `○ static`). |
| 2026-07-08 | M5 Cuentas por pagar (proveedores) | La base ya existía de una sesión previa (filtro "Por pagar" en Facturas con `esPorPagar`/`fetchPorPagar`, agrupado por proveedor, y una `CuentasPorPagarCard` en el dashboard con el total adeudado) — este bloque la elevó a lo que pedía el plan: agenda de vencimientos real, alertas por urgencia, y marcar pagada en un tap. Helper nuevo compartido `lib/utils.ts › calcularVencimientoFactura()`: `30dias`/`60dias` calculan vencimiento = `fecha_factura + N días`; **decisión de la sesión** — `cuenta_corriente` no tiene plazo fijo (se salda al arreglo con el proveedor, no hay una fecha real que inventar) → se le da urgencia `sin_fecha` y badge "Cuenta corriente" en vez de forzarle una fecha ficticia; no se agregó columna `fecha_vencimiento_pago` (el plan dejaba la puerta abierta a evaluarlo) porque el cálculo on-the-fly alcanza y evita otra fuente de verdad para mantener sincronizada. Mismo helper consumido por **ambos** puntos (Facturas y Dashboard) para que nunca diverjan (mismo espíritu que D7). Facturas → tab "Por pagar": el callout "Total adeudado" suma pills "N vencidas · $X" / "Vencen esta semana: $X"; cada `FacturaCard` en este contexto muestra un badge de urgencia (vencida/esta semana/próximamente/cuenta corriente) y un botón check verde "Marcar pagada" (llama al `actualizarStatus` que ya existía, sin mutación nueva); dentro de cada grupo por proveedor, las facturas se ordenan por urgencia (vencidas primero). Dashboard: `CuentasPorPagarCard` rediseñada — si hay vencidas o vencen esta semana, el título y el monto cambian a ese recorte urgente ("1 factura vencida", fondo rojo) en vez del total genérico, mismo patrón visual que `IngresosBanner` de pedidos. **Gotcha de la sesión (no del código, de mi propio script de verificación):** un selector de Playwright demasiado amplio (`hasText` sobre un ancestro genérico) clickeó el botón "Marcar pagada" de la PRIMERA factura de la lista en vez de la factura de prueba — marcó por error una factura real de Bros/Rescoldo (`Carnes del Sur SRL`, $344.850) como pagada. Detectado al cruzar contra la DB inmediatamente después (el monto no cerraba), revertido al toque (`status` vuelto a `confirmada`), y la segunda verificación con un selector scopeado al contenedor exacto de la fila confirmó el comportamiento correcto. Ningún dato de Facundo quedó afectado. También se mató y reinició el dev server de la sesión (PID heredado de horas antes, colgado y sin responder) con permiso explícito del usuario antes de tocarlo. Verificado con Playwright + una factura de prueba insertada por SQL (30 días, vencimiento a 3 días = "esta semana"): dashboard mostró "1 factura vencida — $171.820" (dato real de Rescoldo), tab Por pagar mostró ambas pills correctamente y ordenó la vencida primero dentro de su grupo de proveedor, marcar pagada quitó la factura de la lista y actualizó el total. Dato de prueba borrado al final. `npm run build` limpio (`/facturas` sigue `○ static`). |
| 2026-07-07 (cont. 2) | M1 Arqueo y cierre de caja por turno (a+b) | Migración `cajas_turnos` + `caja_movimientos` (RLS estándar la primera, vía padre la segunda — mismo patrón que `pagos`↔`cuentas`) con índice único parcial `WHERE estado='abierta'` para impedir dos cajas abiertas a la vez por restaurante. Hook `lib/hooks/useCajaTurno.ts`: `cajaAbierta` (SWR), `abrirCaja`, `registrarMovimiento`/`fetchMovimientos` (retiros/ingresos), `calcularEsperado` (pagos del turno + ingresos − retiros, por medio de pago), `cerrarCaja` (snapshotea esperado/declarado/diferencia — no se recalcula después, es un cierre histórico), `fetchHistorial`. **Mismo gotcha de Q5 con `pagos` (tabla hija sin `restaurante_id`)**: se filtra con embed `pagos.select('*, cuentas!inner(restaurante_id)').eq('cuentas.restaurante_id', X)`, confirmado de nuevo con `curl` directo contra datos reales de Bros (2 pagos existentes) antes de dar por buena la lógica. El fondo inicial (`monto_inicial`) se atribuye siempre al medio "Efectivo" vía heurística de nombre (`inferMedioEfectivo`, `/efectivo|cash/i` sobre `medios_pago.nombre`) porque la tabla no tiene un campo "tipo" — no hay fondo de caja en una tarjeta. UI nueva `components/salon/VistaCaja.tsx` (sin tocar el archivo gigante `salon/page.tsx` más que agregar el botón "Caja" en el header del mapa y una vista más al switch `Vista`): sin caja abierta → form de fondo inicial; con caja abierta → dashboard con fondo/hora, botones Retiro/Ingreso (form con medio en pills, no `<select>`, mismo patrón que la selección de medio en el cobro) y lista de movimientos del turno; Cerrar caja → un input por medio con movimiento, toggle "Arqueo ciego" (oculta el esperado hasta que estén todos los campos declarados) y diferencia en vivo por medio; resumen post-cierre con Imprimir (USB/Bluetooth, reusando `lib/print/escpos.ts` de Q4) + Descargar .bin. ESC/POS: `mode=generate, tipo='cierre_caja'` nuevo en `/api/ingest/escpos` (ticket con fondo, esperado/declarado/diferencia por medio, diferencia total, notas). Reportes: tab nueva "Caja" (`point_of_sale`) con historial de cierres (fecha, quién abrió/cerró vía `equipo_miembros`, diferencia por medio) + exportable a Excel (sumado a `TABS_EXPORTABLES` de Q3, hojas "Cierres" + "Detalle por medio"). Verificado con Playwright + inserts SQL directos contra El Rescoldo (`admin@elrescoldo.com`): abrir caja con fondo $10.000 → registrar ingreso $500 (aparece en el dashboard) → insertar un pago de prueba ($28.050 + $2.550 propina en Efectivo, simulando un cobro real ya que el flujo completo mesa→comanda→cobro de la UI de salón resultó demasiado inestable para automatizar en esta sesión de verificación, aunque sí se navegó manualmente hasta la pantalla de cobro con los montos correctos) → Cerrar caja mostró "Esperado $41.100" (10.000+500+30.600, exactamente lo esperado) → declarar el mismo monto → "Diferencia: $0" → confirmado en DB (`diferencia_total: 0.00`) → Reportes → Caja mostró el cierre con "Abrió Facundo Aguirre · Cerró Facundo Aguirre" y "EFECTIVO $41.100" → export a Excel generó `reportes_caja_2026-07-07.xlsx`. Datos de prueba (pago, movimiento, caja, cuentas/comandas de la mesa usada) borrados al final, mesas repuestas a `libre`. Gotcha de la sesión: hidratación SSR/cliente pre-existente en `salon/page.tsx` (relacionada a `useOnlineStatus`, no tocada esta sesión) hace que la página se re-renderice una vez al cargar — no rompe nada, pero automatizar clicks inmediatamente después del load requiere esperar a que asiente. `npm run build` limpio (`/salon` y `/reportes` siguen `○ static`). |
| 2026-07-06 | Q1 Carta QR pública | Migración `restaurantes.slug` UNIQUE + `carta_publica_activa` (seed El Rescoldo). Route group `app/(publico)/` sin BottomNav/Coach; `/carta/[slug]` Server Component con `createAdminClient` + SELECT explícito (nunca `margen_pct`/costo), `revalidate=60`. `CartaPublicaView` client con FilterChips/EmptyState/Num, atenuado de 86, footer identidad. `proxy.ts` suma `/carta/` (con slash) a rutas públicas — `/carta` a secas sigue protegido. Configuración → Restaurante: card "Carta pública" con toggle, slug editable (slugify propio, sin librerías extra) y QR descargable (`qrcode`, client-side). Verificado con Playwright contra dev server: 32 platos de El Rescoldo, filtro por categoría, 86 en vivo (probado por SQL directo, refleja en <1s en dev), 404 en slug inexistente y en restaurante sin `carta_publica_activa`, `/carta` interno sigue exigiendo sesión. `npm run build` limpio. |
| 2026-07-06 (cont.) | Q2 Demo pública sin registro | Decisión con Facundo: demo vive en un **clon separado** ("El Rescoldo Demo", `restaurante_id=00000000-0000-0000-0000-000000000002`) en vez de escribir sobre la cuenta real de marketing, y es **lectura-escritura real** (no solo lectura) con reset nocturno — mejor pitch, sin tocar RLS de las 44 tablas. `scripts/crear-cuenta-demo.mjs` creó el restaurante + usuario auth (`demo@kitchenos.app`) + `user_restaurantes`/`equipo_miembros`/`rol_permisos` (admin). Función `reset_demo_restaurante()` (delegada a agente `migrator`, `supabase/migrations/20260706_demo_reset_function.sql`): clon profundo de 59 tablas (41 tenant-root + 18 hijas, descubiertas vía `pg_constraint` real, no memoria) desde El Rescoldo real, remapeo de FKs con tablas temp old_id→new_id, atómico. Verificado 1:1 (productos 235/235, recetas 83/83, ingredientes 587/587, etc). Cron `POST /api/cron/reset-demo` (`CRON_SECRET`, `vercel.json` a las 6am UTC) — **falta acción manual: agregar `CRON_SECRET` a las env vars de Vercel** (valor en `.env.local`). Login: botón "Ver demo sin registrarme" (loguea con la cuenta demo + log fire-and-forget en `demo_visitas`). `DemoBanner` persistente (mobile y desktop) cuando `restauranteId === DEMO_RESTAURANTE_ID`; el click hace `signOut('/register')` primero (si no, `proxy.ts` rebota `/register` a `/` por tener sesión activa) — `signOut()` ahora acepta `redirectTo` opcional. Verificado con Playwright: demo carga con datos ricos (235 productos, checklist, pase, cuentas por pagar), banner visible en Stock/Recetario/Dashboard, click banner → signOut → `/register`, cron endpoint 401 sin secret / 200 con secret y reset confirmado por conteo de filas. `npm run build` limpio. |
| 2026-07-06 (cont.) | Q3 Export Excel en Reportes | Botón "Exportar" (`HeaderAction`) en el header de Reportes, contextual a 5 tabs (CMV, Compras, Food Cost, Presupuesto, Rendimiento) — oculto en Resumen/Precios/Producción. El helper de export **ya existía** (`lib/exportar.ts`, `exportarExcel`+`fechaArchivo`, usado hoy por `stock/ClientView`) — no hizo falta crear `lib/export/xlsx.ts` ni migrar stock, solo reusarlo. Cada export es un workbook con hoja `Info` (restaurante, período, fecha) + 1-2 hojas de datos leídas directo del mismo state que renderiza la pantalla (sin recalcular): CMV (1 fila de KPIs), Compras (`Por proveedor` + `Facturas` — **sin** desglose "por categoría": esa vista no existe hoy en la pantalla, así que no se inventó un cálculo nuevo para no violar "mismos números que la pantalla"), Food Cost, Presupuesto vs Real, Rendimiento por plaza. Permisos: gate con `usePermisos().puedeVer('reportes')`, NO con `esAdmin` — el único guard de números que existe hoy en esta pantalla es `esAdmin` pero solo protege el link a "Personal" (costo laboral por persona); los tabs exportables ya son visibles sin restricción para cualquier rol con acceso al módulo (`chef`/`sous_chef` incluido). Importante: la cuenta de aceptación `facu@broscomedor.com` tiene rol `chef`, no `admin` (`scripts/crear-usuarios-bros.mjs`) — gatear con `esAdmin` la hubiera dejado sin botón y roto el criterio de aceptación. Verificado con Playwright contra Bros: tab Resumen/Precios/Producción sin botón, CMV y Compras con botón → descarga `.xlsx` → contenido de las hojas coincide número a número con lo que muestra la pantalla (Ventas $55.672.501, Compras $411.943, CMV 0.7%, proveedor único "Bustos y Beltran S.A." 100%). `npm run build` limpio. |
| 2026-07-07 (cont.) | Q5 Comparador de precios entre proveedores | Hook nuevo `lib/hooks/usePreciosProveedores.ts` (`fetchComparador`), independiente de `useReportes` para poder reusarlo también en Stock sin importar el hook completo de Reportes. **Decisión clave de la sesión:** en vez de agrupar por texto crudo de `factura_items.producto_nombre` (como haría un primer intento ingenuo), se matchea cada renglón de factura contra el catálogo de `productos` con la MISMA dirección que ya usa el importador (`itemFactura.includes(nombreProducto)`, `.claude/docs/importador.md`), prefiriendo el nombre de producto más largo/específico cuando varios matchean. Esto (a) unifica compras de un mismo insumo aunque cada proveedor lo redacte distinto en su factura, y (b) filtra gratis los gastos no-mercadería (sueldos, AFIP, alquiler, rentas) que abundan en las facturas de Bros — sin esto el "top 10 sobreprecio" salía con ítems como "Sueldos" o "Rentas", no creíble para el pitch de ahorro. Agrupación final: `productoId + unidad canónica de la factura` (no la unidad declarada en Stock) — así nunca se compara $/kg contra $/unidad, cierra el punto 4 del plan. Por cada grupo con ≥2 proveedores en los últimos 90 días: último precio por proveedor, mejor precio, y "ahorro potencial" = suma de `(precio_pagado - mejor_precio) × cantidad` sobre todas las compras no-óptimas del período. **Gotcha de performance/correctness encontrado en vivo con datos reales de Bros** (982 facturas / ~3000 renglones en 90 días — mucho más de lo esperado): un primer intento con `.in('factura_id', ids)` sobre cientos de UUIDs generó una query-string demasiado larga → 400 de PostgREST; el fix con chunks de 50 IDs funcionaba pero disparaba ~20 requests secuenciales/paralelos por carga. Se reemplazó por un embed `factura_items.select('*, facturas!inner(...)').eq('facturas.restaurante_id', X)` — confirmado con `curl` directo que `!inner` sí filtra la tabla principal (a diferencia del embed sin `!inner` de `feedback_postgrest_join`, que solo filtra el embed) — con paginación manual vía `.range()` porque PostgREST tapea 1000 filas/request pase lo que pase con `.limit()`. Bajó de ~20 requests a ~4. UI: tab Precios de Reportes ahora tiene, además de la evolución histórica existente, una card roja "Ahorro potencial (últimos 90 días)" (top 10, número de marketing) y una lista "Comparador de precios por proveedor" (mejor proveedor+precio vs. último pagado, con delta% cuando corresponde). Badge en Stock → Editar producto: "Pagaste X% más que el mejor precio reciente (Proveedor, $Z el fecha)" bajo el campo Precio unitario, solo cuando la unidad del producto coincide con la unidad de las facturas agrupadas y el precio actual supera al mejor por >1%. Verificado con Playwright contra Bros (`facu@broscomedor.com`): Reportes → Precios muestra ahorro potencial $1.547.775 con ítems creíbles (Manteca, Agua, Romanito estacionado, Chocolate blanco, Queso crema, Dulce de leche, Bife de chorizo…) y el comparador por proveedor; Stock → "Chocolate blanco" muestra el badge "Pagaste 305% más… (Waggon, $5.094 el 2/6/2026)" — verificado también que productos con unidad de stock distinta a la de la factura (ej. Manteca en 'g' vs facturada en 'kg') correctamente NO muestran badge (unit-safety). `npm run build` limpio (`/reportes` y `/stock` siguen `○ static`). |
| 2026-07-07 | Q4 Etiquetas de producción imprimibles (ESC/POS) | Migración `recetas.vida_util_dias INT NULL` (default 3 días al imprimir si no está seteado). Cliente ESC/POS (`printViaUSB`/`printViaBluetooth`/`fetchEscPosBytes`, antes solo en `salon/page.tsx`) extraído a `lib/print/escpos.ts` compartido + helpers nuevos `downloadEscPosBytes`/`supportsWebUSB`/`supportsWebBluetooth`; el salón migrado a consumirlo (sin duplicar lógica). De paso resuelto el placeholder pendiente en PENDIENTES 3b: `nombreLocal: 'KitchenOS'` del ticket de salón → nombre real (`restaurantes.nombre` vía `RESTAURANTE_ID`), mismo patrón ya usado en Reportes. Endpoint `POST /api/ingest/escpos` suma `mode: 'etiqueta'` (`buildTicketEtiqueta`): layout chico con restaurante, nombre de producción, fecha de elaboración, fecha de caducidad y responsable. Botón "Imprimir etiqueta" en dos puntos: (a) `ProductoMiseCard` — aparece al marcar un ítem como listo (checkbox tildado), con input de "días hasta caducidad" editable (default `recetas.vida_util_dias` o 3), botones Imprimir/Bluetooth/Descargar .bin (fallback siempre visible) y botón "Crear vencimiento en HACCP" que llama a `useHaccp().crearVencimiento` con la fecha calculada — cierra el loop producción→HACCP; (b) HACCP → Vencimientos → "Agregar vencimiento" — sección "Etiqueta de producción" dentro del mismo form, habilitada solo con producto+fecha completos, sin necesidad de guardar primero. `types/index.ts` `Receta.vida_util_dias` agregado. Verificado con Playwright headless contra El Rescoldo (`admin@elrescoldo.com`): en Mise (Pastelería), tildar "Flan Casero con Dulce de Leche" muestra el panel de etiqueta con "Caduca en 3 días (10/07/2026)"; "Crear vencimiento en HACCP" pasa a estado verde "Vencimiento creado en HACCP" y el registro se confirmó por SQL directo (`fecha_apertura=2026-07-07`, `fecha_vencimiento=2026-07-10`, luego borrado por ser dato de prueba); en HACCP → Agregar vencimiento, cargar producto+fecha habilita Imprimir/Bluetooth/Descargar, y "Descargar .bin" dispara la descarga (`etiqueta-salsa-de-tomate.bin`). `mode=etiqueta` verificado también por `curl` directo (bytes ESC/POS decodificados correctamente: centro+negrita+nombre restaurante, divisor, nombre producción doble-alto, fechas, responsable, corte). Gotcha de la sesión: el warning de React "Maximum update depth exceeded" en `/checklist` es **preexistente** (reproduce igual con `git stash` de los cambios de Q4 en `ClientView.tsx`) — no lo generó esta sesión, queda para una futura auditoría de hooks. `npm run build` limpio (`/checklist`, `/haccp`, `/salon` siguen `○ static`). |
