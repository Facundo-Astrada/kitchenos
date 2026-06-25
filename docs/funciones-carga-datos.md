# Funciones de carga de datos — KitchenOS

> Documento vivo. Define con precisión cada función de carga de datos: cómo se hace, cómo impacta en la app y qué soluciona en la realidad. Va a ir creciendo con mejoras del proceso.

---

# ETAPA 1 — Carga de gestión / admin

> **Ejecuta:** dueño, encargado, chef, emprendedor. Quien entiende la empresa y la gestiona.
> Esta etapa se hace una vez al inicio (con datos históricos) y luego se mantiene semana a semana.
> El orden importa: cada función se apoya en la anterior.

---

## 1 · FACTURAS

**Son los primeros datos que se cargan.** Todo lo demás depende de ellas: el stock, los precios, el historial de compras, el food cost real y los reportes de gestión. Sin facturas, KitchenOS funciona; con facturas, se vuelve inteligente.

---

### Cómo cargarlas

Hay tres métodos. Se pueden combinar libremente.

**Método 1 — Excel/CSV del software de gestión** *(recomendado para carga masiva e histórico)*

Si usás Fudo, Maxirest, Bistrosoft u otro POS con módulo de compras, exportá el cierre del mes como Excel y subilo desde `/facturas` → **Importar masivo**, o desde el tile **Importar** del dashboard.

- El sistema detecta solo el formato Fudo (hojas "Gastos" + "Detalle"). Para otros sistemas, la IA mapea las columnas automáticamente.
- 💡 En Fudo: **Gastos → filtrar por mes → Exportar Excel**. El archivo trae dos hojas (resumen + detalle); el sistema necesita las dos.
- 💡 Si el archivo tiene varias hojas, el sistema analiza cuál tiene más información y la elige sola. Podés corregir la elección.
- 💡 **Cargá mes a mes, en orden cronológico.** El sistema guarda todo el historial pero usa siempre el precio más reciente para calcular costos. Si cargás diciembre antes que junio, va a tomar los precios de diciembre como vigentes.

**Método 2 — OCR con foto o PDF** *(para facturas individuales del día a día)*

Sacale una foto a la factura o subí el PDF desde `/facturas` → **FAB +**. La IA lee el documento y extrae proveedor, número, fecha, tipo (A/B/C/X/remito/ticket), items con cantidad y precio unitario, total y condición de pago.

- 💡 Funciona mejor con luz pareja y la factura plana. Si está torcida o arrugada, puede fallar en algunos renglones. **Siempre hay una pantalla de revisión antes de confirmar.**
- 💡 Los remitos de verdulería o mercado también funcionan aunque no tengan número formal — se guardan como tipo "remito".
- 💡 Para proveedores informales que no dan factura (pescadería del puerto, productor local), cargá una **factura manual** con el precio que pagaste: igual actualiza el precio del producto en stock.

**Método 3 — Carga manual**

**FAB +** en `/facturas` → completás los campos a mano. Útil para compras muy chicas o sin documento digital.

---

### Filtro de privacidad *(clave si usás Fudo)*

Fudo registra sueldos, adelantos y pagos a socios como "gastos", mezclados con la mercadería. KitchenOS los detecta y los excluye de la importación automáticamente.

En `/facturas` → **botón escudo 🛡️** → agregás los nombres de personas o proveedores que no querés cargar (el socio, "Empleado", etc.). Se guarda en la configuración del restaurante y aplica a todas las importaciones futuras.

---

### Cómo impacta en la app

| Módulo | Qué pasa automáticamente |
|---|---|
| **Stock** | Cada producto de la factura se crea o actualiza: si ya existe, le refresca precio y registra el ingreso; si no, lo crea con precio, unidad y categoría inferida. |
| **Precios / Inflación** | Cada factura guarda el precio por unidad. Reportes → "Precios" muestra la evolución mes a mes por producto. |
| **Proveedores** | Si el proveedor no existía, se crea solo con nombre y tipo. |
| **Reportes → CMV** | Las compras del período entran al Costo de Mercadería Vendida (compras vs ventas). |
| **Reportes → Presupuesto vs Real** | El gasto real de compras se compara contra el presupuesto cargado. |
| **Reportes → Compras** | Ranking de proveedores, evolución del gasto, productos más comprados. |
| **Pedidos** | Al pedirle a un proveedor, sugiere los productos que más le compraste. |
| **Food cost de recetas** | Si cambia el precio de un insumo en la última factura, el food cost de toda receta que lo use se recalcula solo. |

---

### Qué soluciona en la realidad

**Para el dueño / administrador**
- Saber cuánto gastó en insumos en el mes, por proveedor y categoría, sin armar una sola planilla.
- Ver qué productos subieron y cuánto — en un contexto inflacionario, esto define cuándo y cuánto ajustar la carta.
- Detectar facturas impagas o en cuenta corriente pendientes de saldar.
- Tener el CMV del mes sin que el chef reporte nada.

**Para el encargado / chef de compras**
- No recargar cada producto al stock a mano después de cada entrega — la factura lo hace sola.
- Comparar el precio del proveedor de esta semana contra el del mes pasado.
- Detectar faltantes de una entrega cruzando la factura con el stock.

**Para el emprendedor sin equipo contable**
- Una foto clara de todos los gastos de mercadería sin depender de un contador.
- Historial de compras ordenado para presentar ante un crédito o balance.

---

### Valor adicional

**1 · Alerta de variación de precio.** Al confirmar una factura (OCR o masiva), si un producto subió más de un umbral respecto a la compra anterior, el sistema avisa: *"Tomate perita subió 34% vs la última compra"*. El usuario acepta o corrige el precio antes de guardar. Aprovecha el historial de precios que ya se registra.

**2 · Estado de cuentas por pagar.** Vista consolidada de "cuánto le debo a cada proveedor": un tab **Por pagar** en `/facturas` y un KPI en el dashboard, alimentados por las facturas en cuenta corriente pendientes.

**3 · Reconciliación factura ↔ pedido.** Vincular la factura que llega con el pedido que se hizo por KitchenOS ("esta factura cierra el pedido #X") para detectar diferencias de precio o cantidad entre lo pedido y lo facturado.

---

## 2 · STOCK / INVENTARIO

**Es el segundo dato que se carga, y en buena parte se arma solo a partir de las facturas.** Es la base del food cost, las alertas de reposición y los pedidos. Mientras Facturas responde "qué compré y a cuánto", Stock responde "qué tengo hoy y cuándo se me acaba".

---

### Cómo cargarlo

Cuatro caminos, de menos a más trabajo manual.

**Camino 1 — Automático desde facturas** *(el preferido)*

Si ya cargaste facturas, el stock **ya existe**: cada producto facturado se creó con su precio, unidad y categoría. Si quedó incompleto o desordenado, usá **Rebuild** (`/stock` → "Rebuild") → borra los productos y los reconstruye desde todas las facturas, con el precio más reciente de cada uno.

- 💡 Rebuild es seguro: si no hay facturas, no borra nada. Ideal después de cargar un histórico grande.

**Camino 2 — Importar tu propio Excel de inventario**

`/stock` → **Importar** → subís el Excel/CSV. La IA mapea las columnas (nombre, precio, unidad, categoría, stock actual, mínimo) y te deja revisar antes de confirmar. Si el producto existe lo actualiza; si no, lo crea.

- 💡 No necesitás un formato específico — la IA reconoce las columnas aunque se llamen distinto.
- 💡 Para cantidades "por unidad", cargá la medida unitaria del producto para que el food cost calcule bien.

**Camino 3 — Modo rápido (stock-take secuencial)**

`/stock` → **Stockear** → elegís el sector → pantalla grande, producto por producto, cargás la cantidad real contada. Pensado para recorrer la heladera/depósito con el celular.

**Camino 4 — Manual, uno por uno**

**FAB +** → nombre, categoría, unidad, stock actual, mínimo, crítico, precio. Para altas sueltas o productos que no vienen de factura.

---

### Cómo impacta en la app

| Módulo | Qué pasa |
|---|---|
| **Dashboard** | Los productos en crítico/bajo aparecen en "Stock crítico" y en la campana de alertas. |
| **Recetario** | El precio del producto alimenta el costo de cada ingrediente vinculado → food cost real. |
| **Carta** | El food cost de cada plato sale de los productos de sus recetas. |
| **Pedidos** | Lo bajo/crítico es lo que sugerís pedir; los precios estimados salen de acá. |
| **Merma** | Al registrar merma se descuenta del stock automáticamente. |
| **OPS / Mise** | Las cantidades "por unidad" del mise se calculan con la medida unitaria del producto. |
| **Reportes** | Valorización de inventario y comparación de precios. |

---

### Qué soluciona en la realidad

**Para el dueño / administrador**
- Saber cuánta plata tiene parada en mercadería ahora (valorización total).
- Que nadie cargue el inventario a mano: las facturas lo construyen.
- Food cost confiable porque los precios están actualizados.

**Para el encargado / chef**
- Ver de un vistazo qué está por agotarse antes de que falte en pleno servicio.
- Hacer el inventario físico con el celu en vez de planilla y lápiz.
- Detectar diferencias entre el sistema y la heladera (mermas no registradas, desperdicio).

**Para el emprendedor**
- Arrancar sin cargar nada: sube facturas y ya tiene stock.
- Saber qué reponer sin depender de la memoria.

---

### Valor adicional

**1 · Producciones internas como ítem de stock.** Caldos, masas, fondos, salsas base — cosas que se producen, no se compran, y nunca aparecen en factura. Al crear el producto se marca como **"producción interna"** y se le vincula una receta: el costo se toma automáticamente de la receta (suma de sus ingredientes). Si cambia el precio de un insumo, el costo se recalcula. Badge "Producción" en la lista de stock.

**2 · Mínimo/crítico sugerido.** En vez de cargar los umbrales a mano producto por producto, el sistema los sugiere a partir de la **frecuencia y cantidad de compra** (cuánto y cada cuánto aparece en facturas). Botón "Sugerir mínimos" → preview → aplica a los productos sin umbral.

**3 · Alerta de stock inmóvil (capital dormido).** Detecta productos **sin compras hace mucho** que todavía tienen stock → "Tenés $X parados en productos que no rotan". Filtro "Inmóvil" + banner con el total, para no sobre-comprar y detectar mercadería por vencer.

---
