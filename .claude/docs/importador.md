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
