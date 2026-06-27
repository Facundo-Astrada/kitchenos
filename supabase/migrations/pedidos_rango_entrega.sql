-- Rango de entrega esperada para pedidos (desde-hasta)
-- Reemplaza el uso de fecha_entrega_esperada única por un rango.
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS entrega_desde date,
  ADD COLUMN IF NOT EXISTS entrega_hasta date;

NOTIFY pgrst, 'reload schema';
