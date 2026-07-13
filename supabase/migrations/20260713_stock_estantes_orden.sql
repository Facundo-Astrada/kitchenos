-- Board de Stock en Mesa de trabajo: estantes/niveles dentro de un sector físico
-- (ej. Cámara → Estante 1/2/3) + orden manual de productos dentro del sector.
-- Ese orden alimenta el recorrido de Stockear (celular) cuando se stockea un
-- sector con layout definido.
CREATE TABLE IF NOT EXISTS stock_estantes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id UUID NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  sector_id UUID NOT NULL REFERENCES stock_sectores(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  orden INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE stock_estantes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stock_estantes_select" ON stock_estantes FOR SELECT TO authenticated
  USING (restaurante_id = mi_restaurante_id());

CREATE POLICY "stock_estantes_insert" ON stock_estantes FOR INSERT TO authenticated
  WITH CHECK (restaurante_id = mi_restaurante_id());

CREATE POLICY "stock_estantes_update" ON stock_estantes FOR UPDATE TO authenticated
  USING (restaurante_id = mi_restaurante_id())
  WITH CHECK (restaurante_id = mi_restaurante_id());

CREATE POLICY "stock_estantes_delete" ON stock_estantes FOR DELETE TO authenticated
  USING (restaurante_id = mi_restaurante_id());

CREATE INDEX IF NOT EXISTS idx_stock_estantes_restaurante ON stock_estantes(restaurante_id);
CREATE INDEX IF NOT EXISTS idx_stock_estantes_sector ON stock_estantes(sector_id);

-- estante_id NULL = producto suelto en el sector, sin estante asignado (válido —
-- no todo sector necesita sub-niveles). orden_sector = posición manual dentro de
-- su estante (o del sector si no tiene estante), para el drag-to-reorder del board.
ALTER TABLE productos ADD COLUMN IF NOT EXISTS estante_id UUID NULL REFERENCES stock_estantes(id) ON DELETE SET NULL;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS orden_sector INT NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_productos_estante ON productos(estante_id);

NOTIFY pgrst, 'reload schema';
