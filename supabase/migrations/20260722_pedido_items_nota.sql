-- Nota de formato por ítem de pedido (ej. "1 bidón de 20L", "en bolsas de 250g")
-- Cargada desde el carrito de compras de Stock, viaja con el pedido al proveedor.
ALTER TABLE pedido_items ADD COLUMN IF NOT EXISTS nota TEXT NULL;

NOTIFY pgrst, 'reload schema';
