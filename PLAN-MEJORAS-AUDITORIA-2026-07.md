# Plan de mejoras — Auditoría app vs. instructivo (jul 2026)

> Origen: auditoría completa del 1 jul 2026 (código real vs. `docs/instructivo-carga-datos.md`).
> Cada bloque está pensado como **una sesión de trabajo autocontenida** (Sonnet). Marcar `[x]` al completar y anotar la fecha.

---

## Cómo usar este archivo (instrucciones para cada sesión)

1. Leé `CLAUDE.md` completo (carga `AGENTS.md` y `.claude/docs/*`) antes de tocar código.
2. Ejecutá **un solo bloque por sesión** (A1, A2, …). No mezcles bloques.
3. Antes de dar por terminado un bloque de app: `npm run build` debe pasar sin errores.
4. Al terminar: marcá el checkbox del bloque acá, y si aplicaba, actualizá `PENDIENTES.md`.
5. **Respetá el orden**: los bloques C (instructivo) van DESPUÉS de A1, A2 y A6, porque el texto del instructivo depende de cómo quede la app.
6. Reglas de código inamovibles: hooks con guard `RESTAURANTE_ID`, patrón SWR (`.claude/docs/hooks.md`), UI según `.claude/docs/ui.md`, verificar columnas reales antes de queries (`.claude/docs/columnas.md` o `/supabase-check`).

### Orden recomendado de sesiones

| Sesión | Bloques | Por qué en este orden |
|---|---|---|
| 1 | A1 + A2 | Quick wins de app que cambian lo que el instructivo debe decir |
| 2 | A3 | Feature nueva (corrección masiva de unidades) — destraba el food cost real |
| 3 | A4 + A6 | Limpieza de deuda: tipos legacy + deprecar endpoint Fudo del tile |
| 4 | A5 | ESC/POS cliente (la más grande, aislada del resto) |
| 5 | C1–C12 completo | Reescritura del instructivo EN UNA SOLA PASADA + regenerar PDF |
| — | B1 + B2 | **Manuales del usuario (Facundo)** — no son sesiones de código, se pueden hacer en paralelo |

---

# BLOQUE A — Mejoras y arreglos en la app

## A1 — Tile "Importar" del inicio: habilitar facturas (y salida digna para recetas) 🔴 Alta

- [x] Completado — fecha: 2026-07-02

**Problema:** el tile Importar del dashboard y del menú More abre `components/importador/ImportadorUniversal.tsx`, que detecta correctamente que un archivo es de facturas… y después muestra *"La importación de Facturas estará disponible próximamente"*. Es un callejón sin salida: el backend que sí importa facturas de cualquier POS ya existe (`/api/importador/facturas-universal`) pero solo es accesible desde Facturas → Importar masivo (`components/facturas/ExcelPOSImportModal.tsx`).

**Evidencia:**
- `components/importador/ImportadorUniversal.tsx:71-77` — `TIPO_DISPONIBLE: { facturas: false, recetas: false }`
- `components/importador/ImportadorUniversal.tsx:944-948` — mensaje "próximamente"
- `components/importador/ImportadorUniversal.tsx:449-467` — ruta especial Fudo que SÍ funciona (`/api/importador/facturas-fudo`)

**Qué hacer (opción recomendada — reusar, no duplicar):**
1. Cuando `tipoElegido === 'facturas'` y el usuario confirma, en lugar del cartel "próximamente", **derivar el archivo al flujo universal**: renderizar `ExcelPOSImportModal` pasándole el archivo ya cargado (`rawFileRef.current`), o si el modal no acepta archivo inicial, agregarle una prop opcional `initialFile?: File` que dispare el análisis al montar (el modal ya llama a `/api/importador/facturas-universal` modo `detect`).
2. Para `tipoElegido === 'recetas'`: reemplazar "próximamente" por un CTA "Importar desde el Recetario" que navegue a `/recetario` con el import abierto (o al menos linkee y explique el camino). No implementar un import de recetas nuevo.
3. Actualizar `TIPO_DISPONIBLE` para que `facturas: true` (recetas puede quedar `false` si se resuelve con el CTA).
4. No romper la ruta Fudo existente (detección de hojas Gastos+Detalle) — ver A7 para su migración.

**Criterio de aceptación:** subir un Excel de facturas no-Fudo desde el tile del inicio termina en el preview del importador universal con mapeo IA, y se puede aplicar. Subir un Excel de recetas no muestra "próximamente" sin alternativa.

---

## A2 — WhatsApp de pedidos usa la fecha de entrega deprecada 🟠 Media (bug, arreglo chico)

- [x] Completado — fecha: 2026-07-02

**Problema:** `buildWhatsAppText` en `app/(app)/pedidos/page.tsx:101` usa `pedido.fecha_entrega_esperada`, deprecada desde jun 2026 en favor del rango `entrega_desde` + `entrega_hasta` (se setean al enviar el pedido — ver `.claude/docs/columnas.md`, tabla `pedidos`). Los pedidos nuevos mandan el mensaje de WhatsApp **sin fecha de entrega**.

**Qué hacer:**
1. En `buildWhatsAppText`: si existe `entrega_desde`/`entrega_hasta`, mostrar "Entrega: {desde} al {hasta}" (o solo una fecha si son iguales o falta una). Fallback a `fecha_entrega_esperada` si el rango es null (pedidos viejos).
2. Revisar `exportPedidoPDF` (`pedidos/page.tsx:38-94`) por el mismo problema y aplicar la misma lógica.

**Criterio de aceptación:** un pedido enviado con rango de entrega muestra el rango en el texto de WhatsApp y en el PDF.

---

## A3 — Corrección masiva de unidades sospechosas en Stock 🔴 Alta (feature nueva)

- [x] Completado — fecha: 2026-07-02

**Problema:** productos cargados con `unidad = 'u'/'unidad'` pero precio que en realidad es por kg/l (vienen así de facturas). El costeo los protege con factor 0 (la línea se excluye del costo → food cost subvaluado silenciosamente). En Bros hubo 182 casos que subvaluaban 53 recetas (`.claude/docs/columnas.md`, sección "Unidades de ingredientes"). Hoy la única corrección es producto por producto en Stock.

**Qué hacer:**
1. En `app/(app)/stock/ClientView.tsx`, agregar un filtro/vista "Unidades a revisar" (mismo patrón que el filtro `inmovil`, líneas 471-501): productos con `unidad` canónica `'u'` y `precio_unitario` mayor a un umbral (p. ej. > $2000 — hacerlo constante nombrada) **o** productos cuya unidad no canoniza (`canonUnit` de `lib/hooks/useRecetas.ts` como referencia de canonización).
2. Vista de corrección en lote: lista con nombre, precio, unidad actual y un selector rápido de unidad nueva (u/g/kg/ml/l) por fila + botón "Aplicar cambios" que updatea en batch.
3. Al cambiar la unidad de un producto, disparar `/api/stock/sync-precio` (ya existe) o el recálculo equivalente para que los ingredientes vinculados actualicen su costo.
4. Banner/badge en Stock cuando hay productos en esta condición (mismo estilo que el CTA de Rebuild).

**Criterio de aceptación:** con un producto `unidad='u'` + precio alto, aparece en la vista, se corrige a `kg` en lote, y el food cost de una receta que lo usa deja de excluir la línea (verificar en detalle de receta).

---

## A4 — Sincronizar tipos legacy en `types/index.ts` 🟡 Media (deuda)

- [x] Completado — fecha: 2026-07-02

**Problema:** `Evento`, `Turno` y `Puesto` en `types/index.ts` tienen campos legacy que no matchean el schema real (PENDIENTES.md ítem 4). Riesgo de type errors en refactors.

**Qué hacer:**
1. Verificar columnas reales de `eventos`(si existe), `turnos`, `puestos` con `/supabase-check` o la management API (query en `.claude/docs/rls.md`).
2. Actualizar los tipos para reflejar el schema real. Buscar todos los usos (`Grep` por el nombre del tipo) y ajustar los que dependan de campos eliminados.
3. `npm run build` limpio.

**Criterio de aceptación:** tipos alineados al schema, build sin errores, PENDIENTES.md ítem 4 marcado resuelto.

---

## A5 — Cliente de impresión ESC/POS en el salón 🟠 Media-alta (feature, la más grande)

- [x] Completado — fecha: 2026-07-03

**Contexto:** `POST /api/ingest/escpos?mode=generate` ya devuelve los bytes del ticket en base64 (PENDIENTES.md ítem 3b). Falta el cliente en `app/(servicio)/salon/page.tsx`.

**Qué hacer (según spec de PENDIENTES.md 3b):**
1. Botón "Imprimir ticket" tras el cobro → `fetch /api/ingest/escpos` → decodificar base64 → enviar bytes vía **WebUSB** (impresoras USB) o **Web Bluetooth** (térmicas BT). Detectar soporte del browser y ofrecer el método disponible.
2. Fallback siempre visible: "Descargar .bin" para impresoras conectadas por software.
3. Respetar las reglas UI de servicio (`.claude/docs/ui.md`, sección "Vista de servicio"): botones ≥64px, alto contraste, cero dropdowns, fondo oscuro.
4. Persistir el dispositivo elegido (localStorage) para no re-parear en cada ticket.

**Criterio de aceptación:** desde el flujo de cobro se puede imprimir o descargar el ticket; sin impresora, el fallback descarga el `.bin`. Actualizar PENDIENTES.md 3b.

---

## A6 — Deprecar `/api/importador/facturas-fudo` del tile 🟡 Baja (limpieza, hacer después de A1)

- [x] Completado — fecha: 2026-07-03

**Problema:** el tile Importar usa el endpoint legacy `facturas-fudo` (`ImportadorUniversal.tsx:457`) cuando `facturas-universal` ya detecta Fudo solo y lo procesa por ruta rápida sin IA (`.claude/docs/importador.md`).

**Qué hacer:**
1. Migrar `importarFudo()` de `ImportadorUniversal.tsx` a `/api/importador/facturas-universal` (modos `detect`/`apply`).
2. Verificar con un Excel Fudo real que el resultado es equivalente (facturas + items + `excluidas_privacidad`).
3. Si nada más referencia `facturas-fudo` (grep global), marcar el endpoint como deprecado (comentario) o eliminarlo. `stock-fudo` queda como está.

**Criterio de aceptación:** el tile importa Fudo por el endpoint universal; no quedan referencias activas a `facturas-fudo` en componentes.

---

## A7 — (Opcional / backlog) Dictado real con Web Speech API 🟢 Baja

- [ ] Completado — fecha: ____

Solo si se decide sostener la promesa "dictar" del instructivo en vez de corregir el texto (ver C3). Agregar botón de micrófono con `webkitSpeechRecognition` (es-AR) en: Ventas → Importar → "Pegar datos (IA)" y Recetario → "Completar con IA". Degradar con gracia si el browser no soporta. **Si no se hace, C3 corrige el instructivo — nunca dejar ambos sin hacer.**

---

# BLOQUE B — Tareas manuales (Facundo, no son código)

## B1 — Config de Supabase para invitación por email 🔴 Alta

- [x] Completado — fecha: 2026-07-02

El código está completo (PENDIENTES.md ítem 2). Falta solo dashboard de Supabase:
1. Auth → URL Configuration → Redirect URLs: agregar `https://kos-app-one.vercel.app/registro-invitado`.
2. Activar/ajustar plantilla de email "Invite user".
3. Vercel: setear `NEXT_PUBLIC_SITE_URL=https://kos-app-one.vercel.app`.
4. Probar end-to-end: invitar desde /turnos tab Equipo → recibir email → setear contraseña → entrar con el rol correcto.
(Ver memoria `reference_supabase_auth_urls` y PENDIENTES.md ítem 2.)

## B2 — Fiscal ARCA: certificado y homologación 🟠 Media

- [ ] Completado — fecha: ____

PENDIENTES.md ítem 3: conseguir certificado real (`.crt/.key`), probar `emitir()` contra el servidor de testing de AFIP, configurar URLs de prod en `config_fiscal`, y luego (sesión de código) cachear token/sign WSAA en Supabase.

---

# BLOQUE C — Instructivo (`docs/instructivo-carga-datos.md`)

> ⚠️ **Hacer todo el bloque C en UNA sola sesión, DESPUÉS de A1, A2 y A6** (el texto depende de cómo queden el tile Importar y el WhatsApp de pedidos). Al final: regenerar `.html` y `.pdf` con `scripts/build-instructivo-pdf.mjs` / `scripts/md-to-pdf-instructivo.mjs`.

## C1 — Corregir la Forma 1 de Facturas (tile Importar) 🔴

- [x] Hecho — 2026-07-04

Línea ~61 ("andá a Facturas → Importar masivo (o al tile Importar del inicio)").
- **Si A1 quedó hecho:** el texto actual pasa a ser correcto — verificarlo contra la app y dejarlo.
- **Si A1 NO se hizo:** reescribir: *"andá a Facturas → Importar masivo. (El tile Importar del inicio sirve para archivos de Fudo, stock y proveedores.)"*

## C2 — Matizar "Rebuild es seguro" 🔴

- [x] Hecho — 2026-07-04

Sección 2 · Stock, Camino 1 (línea ~143-145). Mantener que aborta sin facturas, pero agregar: *"Ojo: Rebuild reconstruye todo desde las facturas. Los productos que cargaste a mano, los conteos del Stockear y las correcciones de unidad que no vengan de factura se pierden. Usalo al armar la base, no como mantenimiento de rutina."* (Coherente con el propio tour interno: `lib/coach/tours.ts:489`.)

## C3 — Quitar o aclarar "dictar" 🔴

- [x] Hecho — 2026-07-04

Ventas Camino 2 (título "Pegar texto o dictar", línea ~333) y Recetario Camino 3 ("dictás o pegás", línea ~220). Si A7 no se implementó: cambiar a "Pegar texto" y, si se quiere conservar la idea, aclarar "(podés dictarlo con el micrófono del teclado de tu celular)".

## C4 — Nuevo "Paso 0 — Antes de cargar" 🔴

- [x] Hecho — 2026-07-04

Insertar antes de "ETAPA 1", una sección corta que cubra:
1. **El asistente de primeros pasos (onboarding):** al entrar con la cuenta vacía, la app abre un wizard de 5 pasos que guía la carga inicial (existe en `app/(app)/onboarding/page.tsx`; se dispara con productos+facturas+recetas en 0).
2. **Crear el equipo:** desde **Turnos → Equipo**, invitar a cada persona por email (botón "Invitar por email": nombre + email + rol). El invitado recibe un link, setea su contraseña y entra ya vinculado al restaurante.
3. **Qué ve cada uno:** los módulos visibles dependen del **puesto** (configurable en Configuración); el admin ve todo. Una línea alcanza — no explicar las 3 capas de permisos.

## C5 — Nueva sección "Reportes — lo que te devuelve la carga" 🔴

- [x] Hecho — 2026-07-04

Agregar al cierre de la Etapa 1 (después de Ventas, antes de Etapa 2). Contenido: qué muestra Reportes con la base cargada — **CMV del mes** (compras vs ventas), **inflación de cocina** (evolución de precios por producto, desde las facturas), **Presupuesto vs Real** (se define el objetivo por período en la misma pantalla), **valorización del stock**. Enmarcarlo como el "pago" del esfuerzo de carga: acá se ve si el negocio da plata. Referenciar qué dato alimenta cada reporte (facturas → compras e inflación; ventas → CMV y ticket; stock → valorización).

## C6 — Nuevo apartado "Problemas frecuentes" 🔴

- [x] Hecho — 2026-07-04

Media página, al final (antes del Resumen). Cuatro entradas:
1. **"El food cost me da bajísimo / una receta no suma un ingrediente"** → casi siempre es un producto cargado "por unidad" con precio que en realidad es por kg o litro. La app excluye esa línea del costo para no inflarlo. Corregilo en Stock editando la unidad del producto. (Si A3 quedó hecho: mencionar la vista "Unidades a revisar".)
2. **"Cargué los meses desordenados"** → reimportá el mes que faltaba y después corré **Stock → Rebuild** para que los precios vigentes queden bien.
3. **"Importé un archivo equivocado"** → las importaciones se pueden **deshacer** desde el resultado del import (existe: `components/importador/ImportadorArchivo.tsx:475` → `/api/importador/undo`). Verificar en la UI el nombre exacto del botón antes de escribir el texto.
4. **"Quedaron ingredientes sin vincular al stock"** → panel **Salud del recetario** (agrupa costeo incompleto) + el vínculo automático que la app corre tras importar; los que no matchean se corrigen entrando a la receta.

## C7 — Pedidos: prerequisito del teléfono del proveedor 🟠

- [x] Hecho — 2026-07-04

En la sección 9 · Pedidos, agregar tip: *"Para mandar el pedido por WhatsApp, cargale el teléfono al proveedor en el módulo Proveedores. Los proveedores que se crean solos desde las facturas nacen sin teléfono."* (Verificado: se crean con `telefono: ''`.)

## C8 — Glosario mínimo 🟠

- [x] Hecho — 2026-07-04

Recuadro al inicio (después de "Cómo leer esta guía") con 6 términos: **food cost** (% del precio de venta que se va en ingredientes), **CMV** (costo de mercadería vendida), **86** (plato que no sale / no disponible), **mise en place** (preparación previa al servicio), **plaza** (estación de cocina: parrilla, fríos…), **cuenta corriente** (compra a crédito con el proveedor).

## C9 — Capturas en el md/html + shots faltantes 🟠

- [x] Hecho — 2026-07-04

El PDF ya incrusta capturas de `docs/shots/` (vía `scripts/build-instructivo-pdf.mjs`); el `.md` no tiene ninguna. Opciones (elegir una y ejecutarla):
- **(a)** Incrustar las mismas 8 capturas en el `.md` con sintaxis `![](shots/x.png)` en la sección correspondiente, y
- **(b)** Capturar las 2 que faltan — **Ventas** y **OPS/Planificación** — con `scripts/capturar-pantallas.mjs` (requiere dev server + credenciales test de CLAUDE.md), sumarlas al md y al array del build del PDF.

## C10 — Nota de Salón/KDS en Etapa 2 🟡

- [x] Hecho — 2026-07-04

Sub-sección breve (o punto 10) en Etapa 2: existe la **vista de servicio** — mapa de mesas y comandas en Salón, pantalla de cocina KDS, cobro multi-medio y ticket. Aclarar estado (en prueba en El Rescoldo / beta) y que el **86 es bidireccional**: lo que se marca en la carta no se puede pedir en el salón y viceversa. No detallar el flujo completo — un párrafo y "se documenta aparte".

## C11 — Tabla resumen imprimible 🟡

- [x] Hecho — 2026-07-04

Al final, tabla: **dato → dónde se carga → quién → frecuencia** (facturas / stock-conteo / recetas / carta-precios / ventas / merma / pedidos / 86). Pensada para imprimir y pegar en la cocina.

## C12 — Regenerar HTML y PDF 🔴 (cierre del bloque)

- [x] Hecho — 2026-07-04

Tras C1–C11: regenerar `docs/instructivo-carga-datos.html` y `.pdf` con los scripts de `scripts/`. Verificar que el PDF renderice las capturas y que no queden referencias al contenido viejo. Revisar también `docs/funciones-carga-datos.md` (documento fuente): aplicarle C1 y C3 como mínimo para que no vuelva a propagar los errores.

---

# Registro de sesiones

| Fecha | Bloques | Resultado / notas |
|---|---|---|
| 2026-07-02 | A1 | `ExcelPOSImportModal` recibe `initialFile?: File` + auto-trigger. `ImportadorUniversal`: `facturas: true`, botón "Continuar" deriva a modal, recetas muestra CTA → /recetario. Build limpio. |
| 2026-07-02 | A2 | `pedidos/page.tsx`: `buildWhatsAppText` y `exportPedidoPDF` usan `entrega_desde`/`entrega_hasta` con fallback a `fecha_entrega_esperada`. Reutiliza el helper `fmtRangoEntrega` ya existente. Build limpio. |
| 2026-07-02 | A3 | `stock/ClientView.tsx`: filtro `'unidad'`, chip en header, banner CTA, panel de corrección en lote (lista con selectores + "Aplicar"), `aplicarCambiosUnidad` actualiza `productos.unidad` + `ingredientes.unidad_costo`. Umbral $2000. Build limpio. |
| 2026-07-02 | A4 | `types/index.ts`: `Evento.color/recurrente` → NOT NULL, `Turno.notas` quita `?`, `Puesto.tareas_funciones/permisos_app` → `string[]`. `useEquipo.ts`: mismo fix de `Puesto` + mapper agrega `tareas_funciones ?? []`. Ningún consumer importa estos tipos de `@/types`, impacto real solo en `useEquipo.ts`. Build limpio. |
| 2026-07-03 | A5 | `salon/page.tsx`: tipos ESC/POS locales + `fetchEscPosBytes` + `printViaUSB` (WebUSB, reusar device vía localStorage) + `printViaBluetooth` (BT genérico, `000018f0...`/`00002af1...`). En `TicketCobro`: estado `printing/printError`, botones ≥64px USB/BT (solo si soportado) + "Descargar .bin" siempre. Fix TS: `bytes.buffer as ArrayBuffer` para `Blob`. Build limpio. |
| 2026-07-03 | A6 | `ImportadorUniversal.tsx`: `importarFudo()` migrada de `/api/importador/facturas-fudo` a `/api/importador/facturas-universal` (agrega `mode: apply`). El endpoint universal detecta Fudo nativamente (hojas Gastos+Detalle). Endpoint legacy marcado `@deprecated`. Sin otras referencias activas en componentes. Build limpio. |
| 2026-07-04 | C1–C12 | Reescritura completa de `docs/instructivo-carga-datos.md`. C1: verificado correcto (A1 hecho). C2: advertencia Rebuild (qué se pierde). C3: "dictar" → "pegar + micrófono del teclado". C4: Paso 0 — wizard onboarding + crear equipo. C5: nueva sección Reportes (CMV, inflación, presupuesto, valorización). C6: Problemas frecuentes con botón "Deshacer" verificado en UI. C7: tip teléfono proveedor en Pedidos. C8: glosario 6 términos. C9: 9 capturas incrustadas con `![](shots/x.png)`. C10: sección Salón/KDS. C11: tabla resumen imprimible. C12: `md-to-pdf-instructivo.mjs` corrió OK (HTML + PDF regenerados). Build limpio. |
