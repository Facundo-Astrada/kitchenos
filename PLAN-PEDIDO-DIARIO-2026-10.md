# PLAN — Pedido diario (oct 2026)

Pantalla de celular para el pedido de todos los días (verduras, carnes, etc.): recorrer una lista, marcar cada producto como **✓ hay suficiente** o **Pedir**, y al final armar el mensaje para el proveedor.

## Principio
Cada producto de la lista termina en ✓ o en Pedir. Hasta que no estén todos revisados no se puede cerrar. Eso es lo que "Sugerir pedido" no da.

## Qué se reusa (no se construye de nuevo)
- Mínimo / máximo: `productos.stock_minimo` / `stock_maximo`.
- Precio actualizado: `productos.precio_unitario` (se sincroniza con facturas).
- Orden físico: `lib/stock/recorrido.ts` (sector → estante → grupo → `orden_sector`).
- Pedido real: `usePedidos.crearPedido` → `pedidos` + `pedido_items` (después aparece en Pedidos y Recepción).
- Permiso: módulo `pedidos` (ya está en las habilitaciones del Organigrama).
- WhatsApp: patrón de `buildWhatsAppText` en `app/(app)/pedidos/page.tsx`.

## Modelo (2 columnas, sin tablas ni RLS nuevas)
- `productos.pedido_diario BOOLEAN NOT NULL DEFAULT false` — entra en el pedido diario.
- `proveedores.hora_corte_pedido TEXT NULL` — "HH:MM", horario de corte.
- Conteo opcional por restaurante: flag en `restaurantes.configuracion` (JSONB), sin migración.

## Reglas
- Lista por proveedor (chips arriba; un solo chip si hay un solo proveedor).
- Con conteo: se carga "hay X". `X >= mínimo` → ✓ automático. `X < mínimo` → Pedir con `máximo − X` (tope: nunca superar el máximo). Al enviar, lo contado actualiza `stock_actual`.
- Sin conteo: Pedir propone la última cantidad pedida de ese producto, o el mínimo si nunca se pidió. Ajuste con +/−.
- Barra de avance "N/M revisados"; cerrar se habilita al completar.
- Precio con antigüedad ("$2.400/kg · hace 9 días") y total estimado en vivo.
- Cierre: modal centrado con fondo translúcido, el pedido con cantidades, campo de nota, botones **Copiar** y **WhatsApp** (abre el chat del proveedor si tiene teléfono). El pedido se guarda una sola vez aunque se toquen los dos.
- El precio NO va en el mensaje al proveedor; el total se ve solo en pantalla.
- Borrador local (localStorage) por si interrumpen al cocinero.
- Precios y total visibles con el permiso `pedidos`.

## Fases
1. Migración + `lib/pedidoDiario/` (cálculo puro, con tests) .
2. Interruptor "Entra en el pedido diario" en la ficha de Stock + hora de corte en la ficha de proveedor.
3. Pantalla `/pedido-diario` + modal de cierre + acceso desde Compras → Pedidos.
4. Coach screen context y hoja instructiva.

## Fuera de esta versión
- Un producto comprado a dos proveedores según el día.
- Aviso push "falta mandar el pedido" antes del corte.
