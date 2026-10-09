-- Pedido diario (PLAN-PEDIDO-DIARIO-2026-10.md)
-- productos.pedido_diario: el producto entra en la pantalla del pedido de todos los días.
-- proveedores.hora_corte_pedido: "HH:MM", hasta qué hora el proveedor recibe el pedido.
ALTER TABLE productos
  ADD COLUMN IF NOT EXISTS pedido_diario boolean NOT NULL DEFAULT false;

ALTER TABLE proveedores
  ADD COLUMN IF NOT EXISTS hora_corte_pedido text;

NOTIFY pgrst, 'reload schema';
