-- Reconciliación factura ↔ pedido
-- Vincula una factura recibida con el pedido que la originó, para comparar
-- lo pedido vs lo facturado (diferencias de precio/cantidad).

ALTER TABLE facturas
  ADD COLUMN IF NOT EXISTS pedido_id UUID NULL REFERENCES pedidos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_facturas_pedido ON facturas(pedido_id);

-- Recargar el schema cache de PostgREST para que el browser vea la columna nueva
NOTIFY pgrst, 'reload schema';
