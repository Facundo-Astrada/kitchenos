# Flujo de importación de datos — KitchenOS

## Gotcha — dirección del match factura ↔ producto (jun 2026)

Al cargar una factura, `useFacturas.crearFactura` matchea cada ítem contra `productos` para sumar stock / actualizar precio o crear el producto. El match parcial debe ser **`itemFactura.includes(nombreProducto)`** (el ítem de factura es el más descriptivo y contiene al nombre canónico: "Aceite De Oliva Extra Virgen 5l" → "Aceite De Oliva"), **nunca al revés**. Si se invierte (`producto.includes(item)`), un ítem genérico como "Tomate" pisa el stock/precio de "Extracto De Tomate" y un ítem específico no encuentra su canónico (crea duplicados). Guard de longitud ≥4 en el nombre del producto para no matchear nombres base muy cortos. **El importador masivo `productos-desde-facturas` usa su propio matching — auditar igual.**

## Endpoints

| Path | Función |
|---|---|
| `/api/carta/import` | **Import de carta con IA**. Modo `preview`: parsea archivo y devuelve items estructurados. Modo `apply`: inserta en `carta_items` + crea `plato_recetas` para componentes vinculados a recetas. Excel/CSV: parser directo. PDF/imagen/texto: Claude Haiku extrae nombre, componentes (lista de sub-preparaciones), porciones, precio y tags dietarios. Componentes llegan como `{nombre, tipo: null, ref_id: null}` — el cliente hace el auto-match contra recetas/productos/platos_compuestos. |
| `/api/importador/facturas-universal` | **Punto de entrada universal**. Detecta Fudo (Gastos+Detalle) → ruta rápida sin IA. Caso contrario → IA Sonnet mapea columnas. Modos `detect`/`apply`. Inspecciona TODAS las hojas del XLSX y elige la mejor por score. **Filtro de privacidad (junio 2026)**: en `insertBatch` lee `restaurantes.configuracion.nombres_excluidos` y descarta facturas cuyo `proveedor_nombre` matchee un nombre interno **o tenga prefijo `"Empleado"`** (sueldos/adelantos de Fudo) + sus items. Devuelve `excluidas_privacidad`. Para limpiar facturas personales ya cargadas: `scripts/limpiar-facturas-personales.mjs` (dry-run; `--nombres "X,Y"`; `--apply`). |
| `/api/facturas` | **OCR de factura individual** (imagen/pdf/texto, Sonnet). **Privacidad (junio 2026)**: el prompt detecta gastos no-mercadería (sueldos, honorarios, adelantos, retiros de socios, propinas) → los mueve a `items_excluidos`; marca `proveedor_es_persona`; devuelve `alerta_privacidad`. Lee `nombres_excluidos` del restaurante y los inyecta al prompt + post-filtra con `filtrarPersonas()` (red de seguridad si la IA falla). |
| `/api/importador/facturas-fudo` | Legacy Fudo específico (columnas exactas). El universal lo deprecia. |
| `/api/importador/productos-desde-facturas` | Auto-crea productos en stock desde `factura_items`. Agrupa por nombre normalizado, usa precio más reciente, infiere categoría (rules + Haiku paralelo en apply, solo rules en preview). Crea proveedores faltantes. |
| `/api/stock/rebuild` | Borra productos del restaurante → llama `productos-desde-facturas` apply → llama `auto-link-ingredientes`. Falla seguro si no hay facturas. |
| `/api/recetas/auto-link-ingredientes` | Fuzzy match: ingredientes sin `producto_id` ↔ productos. Niveles `exacto`/`parcial`/`fuzzy`. Bug del JOIN PostgREST arreglado: ahora hace 2 queries (recetas → ingredientes con `.in('receta_id', ids)`). |
| `/api/stock/sync-precio` | Cuando se cambia precio en stock, propaga a `ingredientes.costo_unitario` de los vinculados. |
| `/api/stock/import-planilla` | **Import de planilla de stock** (Excel/CSV multi-hoja, jun 2026). Modo `preview`: recibe `sheets[]` (filas crudas por hoja) y hace **una llamada a Haiku por hoja, en paralelo (batch de 5)** — clave: con todas las hojas en una sola llamada el JSON se truncaba a ~8192 tokens. Cada hoja extrae nombre/unidad/stock_actual/mínimo/crítico ignorando headers de color y filas de proveedor. Luego fuzzy match contra `productos` → `exacto`/`parcial`/`nuevo`. Modo `apply`: UPDATE de productos existentes (**solo** stock_actual/minimo/critico, nunca pisa precio ni nombre) + INSERT de los nuevos. `restaurante_id` de la sesión. Extracción robusta de JSON: `content.match(/\{[\s\S]*\}/)`. |

## Componentes UI

- `ImportCartaModal` (inline en `app/(app)/carta/page.tsx`) — 2 pasos: upload file → preview editable con componentes vinculables. Cada componente tiene: nombre editable, badge de tipo (receta/producto/producción), dropdown de búsqueda unificado, toggle de tags dietarios. Al confirmar: POST `/api/carta/import` modo `apply`.
- `RecetaIAModal` (inline en `app/(app)/carta/ComposicionEditor.tsx`, helpers en `lib/recetas/iaImport.ts`) — captura rápida de UNA receta (foto/texto) sin salir del editor de composición, reusando `/api/recetas/import` (mismo endpoint que Recetario, acción `import` simple, no `import_multi`). Ingredientes quedan editables (cantidad/unidad) y se auto-matchean contra `productos` client-side (mismo criterio que `auto-link-ingredientes` pero acotado a la receta nueva, sin tocar otras); si no hay match, un botón crea el producto de stock ahí mismo. Guarda con `status: 'draft'`.
- `components/facturas/ExcelPOSImportModal.tsx` — XLSX/CSV de cualquier POS (Fudo, Maxirest, Bistrosoft, etc). Muestra hojas analizadas + mapeo IA.
- `components/facturas/BulkUploadDrawer.tsx` — Drag&drop multi-archivo (PDF/imagen) con OCR en serie.
- `app/(app)/onboarding/page.tsx` — Wizard 5 pasos. Se dispara desde `app/(app)/page.tsx` cuando productos+facturas+recetas todos en 0.

## Estrategia "rebuild stock"

1. Sin facturas → onboarding wizard
2. Con facturas pero stock incompleto → banner CTA "Reconstruir" en `/stock`
3. Click → preview rápido (sin IA) → confirm → borra productos + recrea desde facturas + auto-link ingredientes

## Para cargar datos por scripts

Patrón: `scripts/load-recetas-2026.mjs` usa `createClient` de `@supabase/supabase-js` con `SUPABASE_SERVICE_ROLE_KEY`.


## Un fallo de IA nunca devuelve datos inventados

Cuando la API de Anthropic falla, la route devuelve un **error**, no un resultado plausible. Hasta ago 2026 varias hacían lo contrario: `/api/recetas/import` respondía con una receta de ejemplo ("Lomo al Malbec") tras un `setTimeout(1500)` puesto para simular el procesamiento, y `/api/facturas` y `/api/listas-precios` devolvían una factura o una lista completas e inventadas ante un 429/403, con un discreto `_demo` en la UI. Se reportó como "no se reconocen las fotos cargadas" — el sistema no fallaba al leer, mentía sobre el resultado.

`lib/ia/errores.ts` clasifica la respuesta (`clasificarErrorIA`) y devuelve un mensaje accionable en castellano: sin crédito / sin configurar / saturado / archivo inválido. El de crédito aclara que no es problema de la foto, porque ése es el reintento que el usuario hace solo. Las routes que degradan a un resultado vacío a propósito (enriquecimiento de `facturas-universal`, `fichas-tecnicas`, `mapeo`) igual loguean la causa clasificada: sin eso, una caída de la IA se ve igual que un archivo sin datos.

## Gotcha — un PDF no es texto, y "hacé tu mejor esfuerzo" es una licencia para inventar (sep 2026)

`/api/recetas/import` tenía el mismo síntoma que el gotcha de arriba pero con otra causa: un PDF subido por "Nueva receta con IA" caía en la rama de texto plano (`await file.text()`), que sobre un binario devuelve la sintaxis interna del PDF decodificada como UTF-8, no la receta. El prompt encima decía "si no podés determinar un campo, usá un valor razonable" — con esa entrada, el modelo reconstruía una receta entera y plausible a partir del título, distinta en cada intento (sin `temperature` fija). Reproducido y confirmado contra la API real antes de tocar código.

Dos reglas que salen de ese arreglo, para cualquier ruta de IA nueva que reciba archivos:

- **PDF → bloque `document`** (`{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }`, GA, sin beta header) — nunca como texto. `.doc`/`.docx` → extraer con `mammoth` del lado del servidor (como ya hacía `fichas-tecnicas`), tampoco como texto crudo.
- **`output_config.format` (structured outputs) en vez de pedir JSON en prosa.** `pedirAClaude` acepta `formatoJson` (ver `lib/ia/claude.ts`) y arma `output_config: { format: { type: 'json_schema', schema } }` — la API valida el JSON antes de responder, un `enum` ahí es inviolable (así se había colado un "3 cucharadas" en una unidad que solo podía ser kg/g/l/ml/u) y desaparece el parseo con regex de ```json. En el esquema, un campo opcional va como `anyOf: [tipo, { type: 'null' }]`, nunca `type: ['string','null']` + `enum` juntos — la API lo rechaza. La regla de "no inventar" tiene que ser explícita y con una salida real: un campo `legible: boolean` (+ `motivo`) para que el modelo pueda decir "no pude leer esto" en vez de tener que elegir entre inventar o romper el parseo devolviendo prosa.

## Facturas de Fudo: dedupe, pagos, precios (oct 2026)

- **Re-importar no duplica.** `facturas.external_id`/`external_source` (índice único por restaurante) guarda el "Id" de gasto de Fudo. `insertBatch` en `/api/importador/facturas-universal` hace upsert: lo que ya está se actualiza (estado de pago, vencimiento, CUIT, percepciones, sector, pagos); las anteriores a `external_id` se reconocen por proveedor+fecha+total+nro y se les asigna el ID. Si falla la comprobación, aborta antes de insertar. Antes cada import sumaba una capa: en Bros hubo 1.653 facturas duplicadas (~$254M), borradas el 9/10/2026; respaldo en `bak_facturas_dedupe_20261009` y `bak_factura_items_dedupe_20261009`.
- **Parser en `lib/importador/fudo.ts`** (con test sobre un libro sintético con los encabezados reales). Encabezados que no son los obvios: CUIT = "Número Fiscal", sector = "Subcategoría", hoja Pagos con "Medio de pago"/"Caja" (ojo "De Caja", que `findCol` ya no confunde porque busca exacto primero). Hoja Impuestos: neto, IVA, IIBB, Ganancias, Otros → `percepcion_*`/`otras_percepciones`. Pagos → tabla `factura_pagos`.
- **Precios.** El import aplica los precios de los ítems que matchean (`syncPrecios`) y devuelve `cambios_precio` y `sin_vincular` (`ResumenImport`). Pestaña **Precios** de Compras (`PreciosView`): cambios de los últimos 60 días con "deshacer" (`/api/facturas/revertir-precio`) y mercadería sin producto, que se vincula una vez (`/api/facturas/vincular-items`) y queda en `producto_alias`: el próximo import la reconoce sola.
- **Ticket lateral** (`FacturaTicket`): en Compras, si el contenedor mide ≥900px, la factura se abre al costado (estilo Fudo); si no, el detalle de pantalla completa. Los filtros de la lista (fecha, medio, comprobante, proveedor, estado, categoría) se resuelven en la base (`useFacturas(filtros)`), con totales del filtro completo.
- **No se hizo:** limpiar los nombres de proveedor de Fudo ("Hinfa Girgolas - Cta Cte 7 días"); cambiarlos parte historia y el matching de facturas ya cargadas.
- **Vínculo factura→producto en el import:** alias (`producto_alias`) → `sugerenciaSegura` (`lib/facturas/sugerirProducto.ts`: plurales, ñ, orden de palabras, ruido de factura; fuzzy solo en palabras ≥7 letras). Ya NO usa el match parcial de `matchProducto` (vinculaba "Jugo de pomelo" a Pomelo y elegía "Cebolla" para "Cebolla morada chica"). Lo dudoso queda sin vincular, con sugerencia a un toque en Precios.
- **Precios del import:** `calcularDesfasadosDeItemsNuevos` usa solo el `producto_id` del ítem (antes hacía su propio match por nombre). Saltos >50% (`UMBRAL_REVISION_PCT`) no se aplican: quedan `precio_historial.estado='pendiente'` con `origen` (la línea de factura) hasta que se aplican/descartan en Precios (`/api/facturas/resolver-precio`; "No es este producto" desvincula y borra el alias). Una factura vieja recién cargada no pisa el precio de una compra posterior.
- `facturas.categoria_origen` = categoría de Fudo; Precios separa sin vincular en mercadería / bebidas / limpieza / otros gastos. **Categoría de gasto**: si el proveedor no tiene una, el import usa `restaurantes.configuracion.categorias_origen` (clave = categoría de Fudo normalizada con `normAlias` → `categorias_gasto.id`), editable en Compras → Cat. de Gastos → "Categorías de Fudo". Sin esto Presupuesto/CMV no contaban la mayoría de lo importado.
- Matcher: las medidas ("45 x 60", "30x40mm") son una palabra (`45x60`) — distinguen bolsas/film por tamaño.
