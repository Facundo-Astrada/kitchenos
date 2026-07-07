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

- [ ] Completado — fecha: ____

**Referencia:** Yurest (etiquetado con lote y caducidad, solo enterprise). K-OS ya tiene: `haccp_vencimientos`, mise con recipientes, y el cliente ESC/POS WebUSB/BT implementado en salón (bloque A5 del plan anterior).

**Qué hacer:**
1. Endpoint `POST /api/ingest/escpos` — agregar `mode=etiqueta`: genera bytes de etiqueta (nombre de la producción, fecha de elaboración, fecha de caducidad, responsable, restaurante) — layout chico para impresora térmica.
2. Botón "Imprimir etiqueta" en: (a) `ProductoMiseCard` / panel OPS al marcar una producción como lista; (b) HACCP → Vencimientos al registrar un producto. Reusar `printViaUSB`/`printViaBluetooth` de `salon/page.tsx` → extraer a `lib/print/escpos.ts` compartido (hoy vive en la página del salón).
3. La caducidad se calcula con días configurables por receta (campo nuevo `recetas.vida_util_dias INT NULL` — migración chica) con default 3 días editable al imprimir.
4. Al imprimir desde mise, ofrecer crear el registro en `haccp_vencimientos` (cierra el loop producción→HACCP).

**Criterio de aceptación:** desde el mise, "Imprimir etiqueta" genera el ticket (o descarga .bin sin impresora) y opcionalmente crea el vencimiento en HACCP; build limpio.

---

## Q5 — Comparador de precios entre proveedores 🟠 (Yurest compras — argumento de venta duro)

- [ ] Completado — fecha: ____

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

- [ ] a) Modelo + apertura/cierre — fecha: ____
- [ ] b) UI de salón + arqueo ciego — fecha: ____

**Referencia:** Fudo (arqueos, arqueo ciego, movimientos de caja), Ganapán, CajaOS. Las tablas `cuentas`, `pagos`, `medios_pago` ya existen (Fase 1 salón).

**Qué hacer (a):** tabla `cajas_turnos` (id, restaurante_id, abierta_por, fecha_apertura, monto_inicial, fecha_cierre, cerrada_por, montos_declarados JSONB por medio de pago, diferencia calculada, notas) con RLS. Agente `migrator` para el script. Lógica: al cerrar, sumar `pagos` del rango del turno por medio de pago vs declarado → diferencia.
**Qué hacer (b):** en salón (vista servicio, reglas ui.md de servicio): abrir caja (monto inicial), cerrar caja (contar por medio de pago), modo **arqueo ciego** opcional (config: no mostrar el esperado hasta declarar). Retiros/ingresos de caja intermedios. Reporte del cierre exportable (reusa Q3) + impresión ticket de cierre (reusa ESC/POS).

**Criterio de aceptación:** ciclo completo abrir→cobrar cuentas→retiro→cerrar con diferencia calculada; el cierre queda consultable en Reportes; build limpio.

---

## M3 — Fichaje real (clock-in/out → costo laboral) 🔴 convierte Reportes en P&L

- [ ] a) Clock-in/out — fecha: ____
- [ ] b) Horas → costo laboral en Reportes — fecha: ____

**Referencia:** Yurest fichajes, bcnsoft fichada. Hoy el "Iniciar turno" del dashboard es localStorage decorativo.

**Qué hacer (a):** tabla `fichajes` (id, restaurante_id, miembro_id, tipo entrada/salida, timestamp, origen). El banner "Iniciar turno" del dashboard pasa a escribir acá (mantener el localStorage como cache de estado). Vista en Turnos: quién está adentro ahora, historial por persona/semana. Edición manual solo admin (con auditoría de quién editó).
**Qué hacer (b):** `equipo_miembros.costo_hora NUMERIC NULL` (solo admin lo ve/edita). Reportes → nuevo tab o sección en Resumen: horas trabajadas del período × costo → **costo laboral**, al lado del CMV (los dos costos grandes juntos — ningún competidor local lo muestra así).

**Criterio de aceptación:** fichar entrada/salida desde el celular queda en DB; Reportes muestra costo laboral del período junto al CMV; permisos correctos (cocinero ve sus horas, no los costos); build limpio.

---

## M4 — Checklists nivel auditoría (scoring + condicionales + workflows) 🟠 robado de Iristrace

- [ ] a) Scoring + foto obligatoria + condicionales — fecha: ____
- [ ] b) Workflows (falló → tarea) + reporte de auditoría — fecha: ____

**Referencia:** Iristrace (scoring ponderado, lógica condicional, plantillas versionadas, workflow "completado con problemas → genera checklist/notifica"). Eleva el checklist K-OS de operativo a auditable — clave para franquicias y bromatología (y para E5).

**Qué hacer (a):** extender `checklist_rutina`/`checklist_items` (via migrator): `puntaje NUMERIC NULL`, `requiere_foto BOOLEAN`, `condicion JSONB NULL` (mostrar ítem si otro ítem respondió X). En el render del Mise/Control: capturar foto (bucket `fotos`, path `checklists/`), calcular score de la pasada.
**Qué hacer (b):** al completar una pasada con ítems fallidos → crear `tareas` automáticas (reusar el patrón de tools del Coach M5: `crear_tarea`); registro de auditoría con score histórico (gráfico CSS de evolución) + export PDF (patrón HACCP export).

**Criterio de aceptación:** una rutina con scoring y foto obligatoria se completa desde el mise; un ítem fallido genera tarea sola; el histórico de scores se ve y exporta; build limpio.

---

## M5 — Cuentas por pagar (proveedores) 🟠 el dato ya se captura

- [ ] Completado — fecha: ____

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

- [ ] a) Motor de sugerencia (sin IA: reglas) — fecha: ____
- [ ] b) Capa IA + integración Coach/OPS — fecha: ____

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
| 2026-07-06 | Q1 Carta QR pública | Migración `restaurantes.slug` UNIQUE + `carta_publica_activa` (seed El Rescoldo). Route group `app/(publico)/` sin BottomNav/Coach; `/carta/[slug]` Server Component con `createAdminClient` + SELECT explícito (nunca `margen_pct`/costo), `revalidate=60`. `CartaPublicaView` client con FilterChips/EmptyState/Num, atenuado de 86, footer identidad. `proxy.ts` suma `/carta/` (con slash) a rutas públicas — `/carta` a secas sigue protegido. Configuración → Restaurante: card "Carta pública" con toggle, slug editable (slugify propio, sin librerías extra) y QR descargable (`qrcode`, client-side). Verificado con Playwright contra dev server: 32 platos de El Rescoldo, filtro por categoría, 86 en vivo (probado por SQL directo, refleja en <1s en dev), 404 en slug inexistente y en restaurante sin `carta_publica_activa`, `/carta` interno sigue exigiendo sesión. `npm run build` limpio. |
| 2026-07-06 (cont.) | Q2 Demo pública sin registro | Decisión con Facundo: demo vive en un **clon separado** ("El Rescoldo Demo", `restaurante_id=00000000-0000-0000-0000-000000000002`) en vez de escribir sobre la cuenta real de marketing, y es **lectura-escritura real** (no solo lectura) con reset nocturno — mejor pitch, sin tocar RLS de las 44 tablas. `scripts/crear-cuenta-demo.mjs` creó el restaurante + usuario auth (`demo@kitchenos.app`) + `user_restaurantes`/`equipo_miembros`/`rol_permisos` (admin). Función `reset_demo_restaurante()` (delegada a agente `migrator`, `supabase/migrations/20260706_demo_reset_function.sql`): clon profundo de 59 tablas (41 tenant-root + 18 hijas, descubiertas vía `pg_constraint` real, no memoria) desde El Rescoldo real, remapeo de FKs con tablas temp old_id→new_id, atómico. Verificado 1:1 (productos 235/235, recetas 83/83, ingredientes 587/587, etc). Cron `POST /api/cron/reset-demo` (`CRON_SECRET`, `vercel.json` a las 6am UTC) — **falta acción manual: agregar `CRON_SECRET` a las env vars de Vercel** (valor en `.env.local`). Login: botón "Ver demo sin registrarme" (loguea con la cuenta demo + log fire-and-forget en `demo_visitas`). `DemoBanner` persistente (mobile y desktop) cuando `restauranteId === DEMO_RESTAURANTE_ID`; el click hace `signOut('/register')` primero (si no, `proxy.ts` rebota `/register` a `/` por tener sesión activa) — `signOut()` ahora acepta `redirectTo` opcional. Verificado con Playwright: demo carga con datos ricos (235 productos, checklist, pase, cuentas por pagar), banner visible en Stock/Recetario/Dashboard, click banner → signOut → `/register`, cron endpoint 401 sin secret / 200 con secret y reset confirmado por conteo de filas. `npm run build` limpio. |
| 2026-07-06 (cont.) | Q3 Export Excel en Reportes | Botón "Exportar" (`HeaderAction`) en el header de Reportes, contextual a 5 tabs (CMV, Compras, Food Cost, Presupuesto, Rendimiento) — oculto en Resumen/Precios/Producción. El helper de export **ya existía** (`lib/exportar.ts`, `exportarExcel`+`fechaArchivo`, usado hoy por `stock/ClientView`) — no hizo falta crear `lib/export/xlsx.ts` ni migrar stock, solo reusarlo. Cada export es un workbook con hoja `Info` (restaurante, período, fecha) + 1-2 hojas de datos leídas directo del mismo state que renderiza la pantalla (sin recalcular): CMV (1 fila de KPIs), Compras (`Por proveedor` + `Facturas` — **sin** desglose "por categoría": esa vista no existe hoy en la pantalla, así que no se inventó un cálculo nuevo para no violar "mismos números que la pantalla"), Food Cost, Presupuesto vs Real, Rendimiento por plaza. Permisos: gate con `usePermisos().puedeVer('reportes')`, NO con `esAdmin` — el único guard de números que existe hoy en esta pantalla es `esAdmin` pero solo protege el link a "Personal" (costo laboral por persona); los tabs exportables ya son visibles sin restricción para cualquier rol con acceso al módulo (`chef`/`sous_chef` incluido). Importante: la cuenta de aceptación `facu@broscomedor.com` tiene rol `chef`, no `admin` (`scripts/crear-usuarios-bros.mjs`) — gatear con `esAdmin` la hubiera dejado sin botón y roto el criterio de aceptación. Verificado con Playwright contra Bros: tab Resumen/Precios/Producción sin botón, CMV y Compras con botón → descarga `.xlsx` → contenido de las hojas coincide número a número con lo que muestra la pantalla (Ventas $55.672.501, Compras $411.943, CMV 0.7%, proveedor único "Bustos y Beltran S.A." 100%). `npm run build` limpio. |
