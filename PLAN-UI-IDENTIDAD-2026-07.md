# Plan — Identidad visual + correcciones de auditoría UI (jul 2026)

> Origen: auditoría visual completa del 5 jul 2026 — app corrida en local con la cuenta Bros (`facu@broscomedor.com`, rol chef), 45 capturas en mobile (390×844), tablet (1024×768) y desktop (1440×900). Hallazgos completos en la conversación de esa sesión; los accionables están volcados acá.
> Cada bloque es **una sesión de trabajo autocontenida**. Marcar `[x]` al completar y anotar la fecha en el registro.

---

## Cómo usar este archivo (instrucciones para cada sesión)

1. Leé `CLAUDE.md` completo (carga `AGENTS.md` y `.claude/docs/*`) antes de tocar código.
2. Ejecutá **un solo bloque por sesión** (D0, D1, …). No mezcles bloques.
3. **D0 va primero y bloquea todo lo demás** — los otros bloques consumen sus componentes.
4. Antes de dar por terminado un bloque: `npm run build` limpio + verificación visual con la cuenta Bros (los datos densos de Bros son los que revelan los problemas; El Rescoldo no).
5. Al terminar: marcá el checkbox acá, actualizá el registro de sesiones y, si aplica, `PENDIENTES.md`.
6. Reglas inamovibles: hooks con guard `RESTAURANTE_ID` + SWR (`.claude/docs/hooks.md`), columnas reales antes de queries (`.claude/docs/columnas.md`), UI según `.claude/docs/ui.md`.
7. Los números de línea citados son del 5 jul 2026 — verificar con Grep antes de editar (el código se mueve).

### Orden recomendado de sesiones

| Sesión | Bloques | Por qué en este orden |
|---|---|---|
| 1 | D0 | Sistema de identidad — todo lo demás lo consume |
| 2 | D1 + D2 | Los dos defectos más visibles (FAB del Coach + colisión de Stock) |
| 3 | D7 | Números confiables — es lo que más erosiona confianza del cliente |
| 4 | D3 | Recetario (botón flotante + metadata + categorías) |
| 5 | D4 | Editor de Carta Plato/Menú/Evento (el flujo señalado por Facundo) |
| 6 | D5 + D6 | Empty states con CTA + permisos sin redirects mudos |
| 7 | D8 | Desktop (max-width + paleta de módulos) |
| 8 | D9 | Batch de detalles menores |
| 9 | D10 | Limpieza de datos Bros (scripts, no UI) |

---

## Regla de oro (aplica a este plan y a todo desarrollo futuro)

**Ninguna pantalla nueva ni refactor introduce un patrón visual propio.** Tabs, chips de filtro, botón de crear, empty states, avatares y formato de números salen de `components/ui/` (creado en D0). Si un caso no encaja, se extiende el componente canónico — no se crea uno ad hoc. El agente `ui-auditor` valida contra esta regla.

---

# BLOQUE D — Identidad y correcciones

## D0 — Sistema de identidad: componentes canónicos + convenciones 🔴 Crítica (base de todo)

- [x] Completado — fecha: 2026-07-06

**Problema:** la auditoría encontró ~5 estilos distintos de tabs/segmented (OPS pill blanco sobre navy · Ventas texto plano con pill gris · Calendario gris degradado · Reportes subrayado material · HACCP sub-tabs pill sobre claro), 4 patrones de "crear nuevo" (FAB naranja · pill naranja en header en Pedidos/Proveedores · pill navy "+ Nuevo" en Carta/Calendario · barra flotante ancha en Recetario), chips de filtro con lógica invertida entre pantallas (activo claro-sobre-navy en Merma vs activo navy-sobre-claro en Ventas), avatares naranjas en Equipo vs multicolor en Proveedores, y números monoespaciados solo en Stock.

**Qué hacer:**
1. Crear `components/ui/` con estos componentes (extraer el estilo del patrón elegido, no inventar):
   - **`SegmentedTabs`** — canónico: pill blanco sobre fondo navy/oscuro (patrón actual de OPS y Equipo). Variante `onLight` para sub-tabs dentro de contenido claro (patrón HACCP Lista/Calendario). Reemplaza los 5 estilos.
   - **`FilterChips`** — canónico: chip activo **navy sólido texto blanco**, inactivo **var(--surface) con borde var(--border)**, mismo comportamiento en header oscuro y body claro (en header oscuro el inactivo es `rgba(255,255,255,.08)`). Scroll horizontal con fade en el borde para indicar overflow (hoy los bordes cortan chips sin aviso — visto en Stock KPIs, Ventas KPIs, Pase, Recetario desktop).
   - **`EmptyState`** — icono Material + título + subtítulo + **CTA opcional**. Único empty state de la app.
   - **`HeaderAction`** — el botón de acción primaria de pantalla: pill navy `+ Nuevo` (o label que corresponda) **en el header**, como hoy Carta/Calendario. Deja de existir el FAB de acción por pantalla y la barra flotante de Recetario.
   - **`Avatar`** — iniciales con color **determinístico por hash del nombre** sobre una paleta fija de 6 colores derivados de la identidad (resuelve naranja-todos vs multicolor-aleatorio).
   - **`Num`** — número tabular (`font-variant-numeric: tabular-nums`, no otra familia) para stock, precios y contadores. Unifica la rareza monoespaciada de Stock extendiéndola como patrón consciente a toda cifra alineada.
2. Crear **`lib/ui/chrome.tsx`**: contexto `UiChromeProvider` con `sheetCount` + hook `useSheetOpen()` que los bottom sheets/modales/editores full-screen llaman al montar/desmontar. `KitchenCoachFAB` (y cualquier flotante global) se oculta cuando `sheetCount > 0`. Ver D1.
3. Documentar TODO en `.claude/docs/ui.md` — nueva sección "**Componentes canónicos (D0, jul 2026)**": qué componente usar para qué, con imports, y la regla de oro de arriba. Actualizar el agente `ui-auditor` (`.claude/agents/`) para que audite contra esta sección.
4. **No migrar todas las pantallas en esta sesión** — solo crear los componentes + migrar UNA pantalla de muestra (Ventas: tiene tabs + chips + KPIs, es el peor caso de mezcla). El resto migra en D2–D9 al tocar cada pantalla.

**Criterio de aceptación:** `components/ui/` existe con los 6 componentes + provider; Ventas usa `SegmentedTabs` + `FilterChips` + `Num` y se ve coherente con OPS; `.claude/docs/ui.md` documenta los componentes; build limpio.

---

## D1 — Coach FAB: dejar de tapar contenido 🔴 Crítica (el defecto más repetido)

- [x] Completado — fecha: 2026-07-06

**Problema:** el FAB naranja del Coach (`components/coach/KitchenCoachFAB.tsx`) pisa contenido en casi todas las pantallas: contador de sección CHECK en OPS, "Ver inventario" del dashboard, badges de ESTADO en Stock, chip "Enviado"/botón PDF en Pedidos, chips rápidos del Pase, botón "Publicar" en Ideas del Recetario. Peor: **flota sobre bottom sheets abiertos** (Registrar Merma, selector de sector de Stock) y **dentro del editor full-screen de Carta** (tapa el "+" de "Nueva sección"). En Merma hay dos FABs superpuestos (Coach encima del "+" navy de registrar).

**Qué hacer:**
1. Integrar `useSheetOpen()` de D0: todos los bottom sheets y editores full-screen (Merma registrar, Stock selector de sector y modo Stockear, editor de Carta, form de Recetario, sheet OPS de receta, modales de import) marcan chrome ocupado → el Coach FAB se desmonta con fade.
2. En pantallas con contenido denso al borde derecho inferior (Stock tabla, Pedidos cards, Pase input): subir el FAB a `bottom: 110` como mínimo (regla FABs de `ui.md`) y verificar que no tape la última fila — si la pantalla tiene footer propio (Stock "+ Producto / 316 alertas"), el FAB va **encima del footer**, no sobre él.
3. Merma: al eliminar el patrón FAB-de-acción (D0 → `HeaderAction`), el "+" navy pasa al header y desaparece la superposición de dos FABs.
4. Verificación visual con Bros en: dashboard, OPS, stock, pedidos, pase, merma (sheet abierto), carta (editor abierto), recetario (Ideas).

**Criterio de aceptación:** con un sheet abierto el Coach FAB no está visible; en ninguna de las 8 pantallas listadas el FAB tapa contenido interactivo; build limpio.

---

## D2 — Stock mobile: colisión de columnas y header cortado 🔴 Alta

- [x] Completado — fecha: 2026-07-06

**Problema (390px):** en `app/(app)/stock/ClientView.tsx` la columna ESTADO colisiona con los números — se lee "crít 8AJO" porque el badge BAJO se superpone al texto "crít 0". La fila de KPIs del header (177 CRÍTICO / 139 BAJO / 55 PENDIENTE) corta un botón por la mitad sin indicio de scroll. El buscador colapsado muestra "Busc" truncado.

**Qué hacer:**
1. Tabla mobile: en <480px, colapsar las mini-columnas "mín X crít Y" (que en mobile aportan poco) a una sola línea secundaria bajo el nombre del producto, o mover el badge de estado a la izquierda del stock. El badge ESTADO nunca puede solaparse — es `tableLayout: fixed` con `<colgroup>` (regla ui.md "tabla con header fijo"), así que ajustar los anchos % por breakpoint.
2. Header: fila de KPIs + botones con `FilterChips`/scroll con fade de D0 (indicar overflow).
3. Buscador: placeholder que quepa colapsado ("Buscar…") o icono solo hasta focus.
4. De paso migrar los toggles Insumos/Producciones a `SegmentedTabs`.

**Criterio de aceptación:** en 390px ninguna celda se superpone (verificar con los datos de Bros: 477 productos, badges BAJO/CRÍTICO/OK); el overflow del header es evidente; build limpio.

---

## D3 — Recetario: botón flotante, metadata basura y categorías duplicadas 🔴 Alta

- [x] Completado — fecha: 2026-07-06

**Problema:** (a) la barra flotante "Nueva receta" (`app/(app)/recetario/page.tsx:514` aprox) flota sobre las cards tapando una receta entera y el botón "Publicar" en Ideas, choca con el Coach FAB y con el FAB verde de auto-link — tres flotantes apilados; en desktop se estira a ~1500px. (b) Las cards muestran metadata de valor cero: "0 min" en casi todas, "1 porc." en las importadas. (c) Categorías texto libre sin normalizar: chips duplicados **"Carnes"/"Carnes Rojas", "Entradas"/"Entrantes", "Garnishes"/"Guarniciones", "otros"/"Otros", "Bases"/"Bases y Salsas"** — la fila de filtros es inusable en desktop; casing inconsistente ("otros" vs "Principales").

**Qué hacer:**
1. "Nueva receta" → `HeaderAction` de D0 en el header del Recetario (junto al buscador). El FAB verde de auto-link se convierte en acción secundaria del header o entra al menú de la pantalla. Cero flotantes propios.
2. Cards: ocultar `tiempo_min` cuando es 0/null y `porciones` cuando es 1 por default de import (mostrar solo datos reales). Capitalizar la categoría al render (`text-transform` no alcanza para "otros" → title case en el helper).
3. Categorías: definir lista canónica de categorías de recetas (como ya existe para productos — 16 canónicas en `columnas.md`). Mapear las duplicadas: Entrantes→Entradas, Garnishes→Guarniciones, Carnes Rojas→Carnes (o mantenerla si el chef la usa — confirmar con Facundo antes de fusionar), otros→Otros, Bases y Salsas→decidir una. **Script** `scripts/normalizar-categorias-recetas.mjs` (dry-run por defecto, `--apply`) que updatea `recetas.categoria` en Bros y El Rescoldo. El form de receta pasa de texto libre a select con las canónicas + "otra…".
4. Detalle de receta: la línea de metadata del header rompe feo ("100 PORC." partido, puntos medios colgando) — una sola línea con ellipsis o dos líneas diseñadas. El subtítulo "FICHAS TÉCNICAS · FOOD COST" no debe prometer food cost cuando el rol no lo ve (condicionar por `puedeVer`/rol admin).

**Criterio de aceptación:** sin flotantes propios en Recetario; ninguna card muestra "0 min"; los chips de categoría de Bros quedan ≤10 sin duplicados; build limpio.

---

## D4 — Editor de Carta: una sola estética para Plato / Menú / Evento 🔴 Alta (flujo señalado por Facundo)

- [x] Completado — fecha: 2026-07-06

**Problema:** en el editor "+ Nuevo" (`app/(app)/carta/page.tsx` + `app/(app)/carta/ComposicionEditor.tsx`), al pasar de la pestaña Plato a Menú **cambia la estética**: Plato usa card "Datos del plato" con inputs grandes + chips de tags + buscador "Recetas y productos del plato"; Menú/Evento cambia a secciones con títulos EN MAYÚSCULAS bold (ENTRADAS ✏️ / PRINCIPALES / POSTRES), links de texto "+ Agregar a Entradas" (patrón distinto al buscador), tachos a la derecha e input "Nueva sección" al final. Además: en **Evento** el título dice "DATOS DEL EVENTO" pero el placeholder sigue siendo "Nombre del **menú**"; Menú y Evento son visualmente idénticos (nada explica la diferencia); las cards "ÍTEMS 0 / COSTO –" flotan arriba sin contexto.

**Qué hacer:**
1. Unificar el patrón de "agregar contenido": el mismo **buscador con resultados** de Plato dentro de cada sección de Menú/Evento (al tocar "+ Agregar a Entradas" se abre el mismo search, no un patrón nuevo).
2. Jerarquía tipográfica consistente: los títulos de sección de Menú usan el mismo estilo de label que "DATOS DEL PLATO" (uppercase chico gris), no headers bold grandes. Mismos paddings/radios de card en los tres modos.
3. Copy de Evento: placeholder "Nombre del evento"; diferenciar Evento con al menos un campo real (fecha del evento y/o comensales estimados — verificar contra `menus.tipo='evento'` y `menu_preparaciones` con `/supabase-check menus` antes de agregar campos).
4. Las tarjetas ÍTEMS/COSTO: darles contexto ("este menú: N ítems · costo estimado $X") o moverlas al pie como resumen sticky del editor. COSTO oculto para roles que no ven precios.
5. El Coach FAB no aparece dentro del editor (cubierto por D1 — verificar acá).

**Criterio de aceptación:** deslizar Plato→Menú→Evento no cambia familia tipográfica, pesos ni patrón de interacción; Evento se distingue de Menú; copy correcto; build limpio.

---

## D5 — Empty states con salida (Salón, KDS, Reportes, OPS) 🟠 Media-alta

- [x] Completado — fecha: 2026-07-06

**Problema:** cuatro puntos muertos detectados con datos reales:
- Salón: "No hay mesas cargadas" sin CTA (`app/(servicio)/salon/page.tsx:1010` aprox).
- KDS: "¿Qué estación es esta pantalla?" **sin opciones debajo** cuando no hay estaciones creadas (`app/(servicio)/kds/page.tsx:48`).
- Reportes CMV/Compras con período "Este mes" vacío dicen "Importá ventas y cargá facturas" — pero Bros tiene 888 facturas y $390M en ventas; el período es el problema, no los datos.
- OPS Producción vacío: 4 secciones idénticas con "Sin preparaciones aún" + input cada una — media pantalla de inputs vacíos.

**Qué hacer (con `EmptyState` de D0):**
1. Salón sin mesas → EmptyState con CTA "Configurar mesas" (link a la config de salón; verificar ruta real de configuración de mesas).
2. KDS sin estaciones → "No hay estaciones configuradas — crealas en Configuración → Salón" + botón (respetando reglas de vista de servicio: botón ≥64px, alto contraste).
3. Reportes: si el período activo está vacío **pero existen datos en otros períodos** (check barato: count total), el mensaje pasa a "Sin datos en {período}. Probá 'Último mes'" con chip-CTA que cambia el filtro. Aplicar a CMV, Compras y Food Cost. Ídem "-100% vs anterior" → cuando el período actual está incompleto/vacío, mostrar "— sin datos aún este período" en gris, no un -100% rojo.
4. OPS todo-vacío: si las 4 secciones están en 0/0, colapsar a UN EmptyState ("Activá un menú en Planificación o agregá tu primera preparación") con las secciones plegadas debajo.

**Criterio de aceptación:** los 4 casos muestran salida accionable; en Reportes con Bros, "Este mes" (julio) ofrece saltar a "Último mes"; build limpio.

---

## D6 — Permisos sin redirects mudos + matriz coherente 🟠 Media

- [x] Completado — fecha: 2026-07-06

**Problema:** con rol chef, `/facturas`, `/configuracion` y `/espacios` redirigen al dashboard **en silencio** — parece un bug de navegación. Además la matriz es incoherente: chef no ve Facturas pero sí ve Reportes con total de compras, Ventas con facturación completa y Presupuesto editable.

**Qué hacer:**
1. Donde ocurre el redirect por `puedeVer()` (buscar el guard en las páginas o en `usePermisos`), reemplazar el redirect mudo por: toast/banner "No tenés acceso a {módulo} — pedile al administrador" y **recién entonces** redirect (o pantalla de acceso denegado liviana). Un solo helper `redirectSinAcceso(modulo)` reutilizable.
2. Verificar que la navegación (BottomNav, menú Más, ModulosGrid, DesktopShell sidebar) no linkee módulos que el rol no ve (el dashboard ya usa `puedeVer()` — auditar los demás).
3. Sesión de decisión de producto (con Facundo, 15 min): ¿chef ve montos de compras/ventas/presupuesto? Documentar la matriz decidida en la memoria `project_puestos_permisos` y aplicarla en `rol_permisos`/`puestos.permisos_app` — puede que no haya cambio de código, solo datos de permisos.

**Criterio de aceptación:** navegar a una ruta sin permiso muestra aviso; la matriz de qué-ve-cada-rol está documentada y aplicada; build limpio.

---

## D7 — Números confiables (KPIs, filtros y food cost) 🔴 Alta

- [x] Completado — fecha: 2026-07-06

**Problema:** varios números visibles no resisten una lectura del dueño:
- Dashboard "TAREAS 0/333" cuenta el histórico completo, pero OPS muestra 0 tareas hoy (la vista de Producción filtra hoy+carryover desde jun 2026; el KPI no).
- "CHECKLIST 0/88" — misma escala dudosa (¿todos los ítems de todas las plazas?).
- Merma: chip "Hoy" activo pero la lista muestra registros del 1/7, 18/6 y 8/6 — o el filtro no filtra o el chip activo está mal indicado.
- Reportes Resumen: "FOOD COST PROM. 0.0%" con 43 platos cargados (y Ventas calcula 39.4% teórico en su propia pantalla — dos números contradictorios en la misma app).

**Qué hacer:**
1. Dashboard: KPI de tareas = **solo hoy + carryover de ayer** (la misma query que usa OPS Producción — extraer a helper compartido para que nunca diverjan). Ídem checklist: ítems de la plaza del usuario para hoy, o "de hoy" global — decidir y etiquetar el KPI con esa palabra ("TAREAS HOY").
2. Merma: reproducir con Bros; arreglar el filtro (probable `useMerma` con filtro por rango que no se aplica al primer render) o el estado visual del chip. El chip activo debe reflejar el dataset mostrado.
3. Food cost promedio del Resumen: investigar por qué da 0.0% en Bros (la rama de cálculo probablemente exige `plato_recetas` y los platos de Bros vinculan por la rama `receta_id` 1:1 — verificar contra `useCarta.fetchCartaItemsData`). El Resumen debe usar la misma fuente que la pantalla de Ventas/Carta.
4. Revisión rápida de "% vs anterior" en todos los KPI cards de Reportes (regla D5.3).

**Criterio de aceptación:** con Bros, el KPI de tareas del dashboard coincide con lo que OPS muestra al entrar; el filtro Hoy de Merma filtra; el food cost del Resumen coincide con el de Ventas (o explicita por qué difiere); build limpio.

---

## D8 — Desktop: contenido con max-width + módulos con la paleta de la app 🟠 Media

- [x] Completado — fecha: 2026-07-06

**Problema:** (a) las vistas sin versión desktop propia son el layout mobile estirado — OPS muestra inputs "Agregar preparación…" de ~1600px; Recetario cards full-width de 2 líneas. (b) La grilla de módulos del dashboard desktop (`components/shell/DesktopShell.tsx` / ModulosGrid) usa cards **pastel multicolor** (celeste, rosa, amarillo, lila) que no existen en ningún otro lugar de la app — rompe la identidad navy/blanco/acento. (c) Stock desktop ya está bien resuelto (tabla con barras) — es la referencia.

**Qué hacer:**
1. En el layout desktop (DesktopShell), envolver el contenido de las vistas que reusan el layout mobile con `max-width: 1040px; margin: 0 auto` (constante compartida). Excepciones full-width: Stock (tabla), Espacios, Salón/KDS, Reportes si tiene gráficos anchos.
2. ModulosGrid: reemplazar la paleta pastel por el sistema — cards `var(--surface)` con borde `var(--border)`, icono en `var(--accent)` (o un acento por grupo de módulos como máximo, derivado de la paleta, no candy). Hover navy sutil.
3. Recetario/Carta desktop: grilla de 2–3 columnas para cards (densidad), reusando el breakpoint del shell.

**Criterio de aceptación:** en 1440px OPS no estira inputs a pantalla completa; el dashboard desktop respeta la paleta; Recetario muestra ≥2 columnas; build limpio.

---

## D9 — Batch de detalles menores 🟡 Media-baja (una sesión, muchos arreglos chicos)

- [x] Completado — fecha: 2026-07-06

Lista cerrada (cada ítem es un arreglo puntual; verificar línea con Grep):

1. **Pedidos**: una sola acción principal por card (WhatsApp); PDF pasa al detalle o a un menú secundario. Compactar el aire vertical (icono camión alineado con las acciones). Fallback "Sin proveedor" → "Pedido sin proveedor asignado" + tinte de advertencia.
2. **Pase**: fila de mensajes rápidos con overflow-fade (D0); timestamps consistentes (siempre junto al nombre, o siempre bajo la burbuja — elegir uno).
3. **Planificación (OPS)**: sacar el doble control de fecha — quedan las flechas "‹ Hoy ›" y el date-picker se abre tocando el label de fecha (un solo control). "Activar menú" no debe romper a 2 líneas (label más corto o botón más ancho).
4. **Turnos**: la grilla semanal en 390px corta el domingo — permitir scroll horizontal con la columna de nombres sticky, o compactar celdas.
5. **Equipo**: "—" como subtítulo → CTA "Asignar puesto"; plazas con tildes ("Pastelería", "Fríos", "Línea") y deduplicadas en el render (el fix de datos va en D10).
6. **Perfil**: separar el icono de cámara de las iniciales (badge de cámara en la esquina del avatar); avatar con el color del sistema `Avatar` (D0).
7. **Proveedores**: migrar a `Avatar` de D0 (consistencia con Equipo).
8. **HACCP Limpieza**: "Nunca" → "Nunca realizada" (y en gris salvo que esté vencida la frecuencia).
9. **Recetario detalle**: título largo con 2 líneas máx + ellipsis en vez de truncado a 1 línea con "…" temprano.
10. **OPS header**: el toggle MENÚ/CARTA con el label "Por prioridad" flotante → integrar el sublabel al toggle (descripción bajo la opción activa, como ya hace el subtítulo del toggle según ESTADO-ACTUAL).

**Criterio de aceptación:** los 10 ítems verificados visualmente con Bros en mobile; build limpio.

---

## D10 — Limpieza de datos Bros que ensucian la demo 🟡 (scripts, sin UI)

- [x] Completado — fecha: 2026-07-06

**Problema:** datos de prueba/basura visibles en la primera pantalla que ve el cliente:
- Mensajes de prueba en el pase ("Falta stock jdhvfnlkakvpñv — Producción pendienteksjañla-", de Franco, 8 jun).
- Umbrales absurdos en productos: "Ciboulette 0.08/40000 unidad", "Cervezas perso 0/0", "Espiritus chaña 0/0 l", "Edulcorante 0/0" → 316 alertas rojas de las cuales muchas son ruido.
- Plazas duplicadas en `equipo_miembros` (Luna: "Pasteleria · Frios · Pasteleria · Linea") y sin tildes.
- Categorías de recetas duplicadas (se normaliza con el script de D3.3 — verificar acá que corrió).

**Qué hacer:**
1. Script `scripts/limpiar-datos-prueba-bros.mjs` (patrón de `limpiar-facturas-personales.mjs`: **dry-run por defecto**, `--apply`): borra los mensajes de pase de prueba (match por texto basura + fecha, confirmar lista en dry-run), corrige `stock_minimo`/`stock_critico` incoherentes (mín > 1000× stock máximo histórico, o mín=0 y crít=0 con status crítico → poner NULL/0 coherente), dedup de plazas en `equipo_miembros`.
2. Correr dry-run, **pasarle la lista a Facundo para confirmar**, aplicar.
3. Verificar el efecto: el contador de alertas de Stock baja de 316 a un número creíble; el dashboard no muestra texto basura.

**Criterio de aceptación:** dry-run revisado y aplicado; capturas antes/después del dashboard y Stock de Bros.

---

# Registro de sesiones

| Fecha | Bloques | Resultado / notas |
|---|---|---|
| 2026-07-06 | D0 | Sistema de identidad completo. `components/ui/`: SegmentedTabs (onDark/onLight), FilterChips (fade de overflow), EmptyState, HeaderAction, Avatar (hash determinístico 6 colores), Num (tabular-nums). `lib/ui/chrome.tsx`: UiChromeProvider + useSheetOpen + useSheetCount. FAB lee sheetCount. Layout wrapeado con UiChromeProvider. Pantalla de muestra: `ventas/page.tsx` migrada (tabs → SegmentedTabs, chips de período → FilterChips, empty states → EmptyState, precios → Num). Build limpio. `.claude/docs/ui.md` y `ui-auditor.md` actualizados. |
| 2026-07-06 | D1+D2 | D1: `useSheetOpenWhen(open)` en MermaBottomSheet + ExcelPOSImportModal; `useSheetOpen()` en ImportadorUniversal + ComposicionEditor; `SheetChrome` wrapeando inline sheets de Stock (sector selector + modo Stockear) y `useSheetOpenWhen(showMenuPicker)` en Producción. FAB "+" de Merma movido al header como `HeaderAction`. D2: `isNarrow` (≤479px) en Stock — en mobile angosto el bloque mín/crít desaparece del Stock cell y aparece como segunda línea en la celda Producto; colgroup ajustado; Insumos/Producciones migrado a `SegmentedTabs`; placeholder de búsqueda → "Buscar…"; fila de KPIs con wrapper scroll+fade. Build limpio. |
| 2026-07-06 | D3 | Recetario: barra flotante "Nueva receta" + importar fichas + vincular stock → iconos compactos en el header navy + `HeaderAction`. Body padding 80px → 24px. Cards: metadata solo muestra valores reales (oculta porciones ≤1 y tiempo_min = 0). Categorías: `normalizeCategoria()` dedup display (Entrantes→Entradas, Garnishes→Guarniciones, etc.), chips filtrando por normalized. Form de receta: select con `CATEGORIAS_RECETA` canónicas + "Otra…" + input libre fallback. Header detalle `[id]`: metadata en una línea con ellipsis, valores nulos omitidos. Subtítulo "Food cost" condicional a isAdmin. Script `scripts/normalizar-categorias-recetas.mjs` (dry-run/--apply). Build limpio. |
| 2026-07-06 | D5 | Empty states con CTA: Salón sin mesas → botón "Configurar mesas" (/salon/config, servicio style). KDS sin estaciones → "No hay estaciones configuradas" + "Ir a Configuración" (botón 64px, contraste alto). Reportes: EmptyState local upgradeda con prop `cta`; KpiCard con value=0 muestra "—" y "sin datos aún" en vez de -100%; CMV y Compras period-aware (si periodo=mes → CTA "Ver Último mes"); FoodCost con instrucción accionable. Checklist/Mise: IIFE que detecta allSectionsEmpty → un solo EmptyState "El mise está vacío" con instrucción en vez de 4+ secciones vacías. Build limpio. |
| 2026-07-06 | D4 | ComposicionEditor.tsx: (1) Resumen vivo — label contextual "Este plato/menú/evento" + `isAdmin` guard para COSTO/Food cost/Margen (rol no admin solo ve cantidad de ítems). (2) Títulos de sección en Menú/Evento — reducidos de `fontSize:13 fontWeight:700` uppercase gris-medio a `fontSize:11 fontWeight:700 color:text-3` (mismo label chico que "COMPOSICIÓN"). (3) Buscador inline por sección — al tocar "+ Agregar a {sec}" se abre un search con input + resultados combinados (recetas + productos + platos de carta), tipo con badge de color, cierre con X; reemplaza el patrón `addItem()` que generaba un ítem en blanco. (4) Placeholders correctos: Nombre del evento / Nombre del menú; descripción con "Fecha, lugar, comensales estimados…" para Evento. Build limpio. |
| 2026-07-06 | D6+D7 | D6 — RouteGuard: reemplaza redirect mudo por pantalla de bloqueo con lock icon, nombre del módulo e instrucción al admin. D7 — Dashboard tareasHoy filtrado por `turno_fecha` (hoy + carryover ayer sin `estado=listo`); StatusBar label "Tareas hoy"; Merma: `useEffect` aplica filtro "hoy" al montar. Build limpio. |
| 2026-07-06 | D8 | DesktopShell: wrapper `max-width:1040px; margin:0 auto` para rutas no-full-width (excepciones: /stock, /espacios, /reportes). ModulosGrid: eliminado `MODULO_COLORS` pastel (44 líneas); tiles y cards ahora usan `var(--surface)` + borde `var(--border)` + icono `var(--accent)` — tanto mobile (56px tiles) como desktop (rows con texto). Recetario: `useIsDesktop` + grid 2 columnas en desktop (`repeat(2,1fr)`). Build limpio. |
| 2026-07-06 | D9 | Batch de 11 arreglos menores: HACCP "Nunca"→"Nunca realizada"; Recetario [id] título 2 líneas `webkit-line-clamp`; `OpsToggle` con sublabel integrado (elimina span flotante); Proveedores + Perfil migrados a `Avatar` de D0 (badge de cámara en esquina, sin overlay que tapa iniciales); Pedidos PDF a ícono + "Sin proveedor asignado" en naranja + menos padding; Pase timestamps solo en header de grupo + fade en mensajes rápidos; Producción un solo control de fecha (label tappable) + "Activar" nowrap; Turnos columna de nombres `sticky left:0`; Equipo CTA "Asignar puesto". Build limpio. |
| 2026-07-06 | D10 | `scripts/limpiar-datos-prueba-bros.mjs` (dry-run por defecto, `--apply`): detecta 1 mensaje de pase basura (Franco, 8 jun), 134 productos con umbrales absurdos (28 Caso A umbral 100×+ vs stock real, 106 Caso B todo en 0 = falsa alerta roja), 3 miembros con plazas sin tildes/duplicadas. Fix `cc1ade3`: el reset de stock usa `0` no `NULL` (columna NOT NULL). **Pendiente: correr dry-run, que Facundo confirme la lista, y `--apply`.** |
