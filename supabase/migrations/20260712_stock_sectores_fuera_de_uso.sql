-- F3: sectores físicos de stock (almacén, cámara, heladera, freezer, producción, cava)
CREATE TABLE IF NOT EXISTS stock_sectores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id UUID NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  icono TEXT NOT NULL DEFAULT 'shelves', -- Material Symbol
  orden INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE stock_sectores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stock_sectores_select" ON stock_sectores FOR SELECT TO authenticated
  USING (restaurante_id = mi_restaurante_id());

CREATE POLICY "stock_sectores_insert" ON stock_sectores FOR INSERT TO authenticated
  WITH CHECK (restaurante_id = mi_restaurante_id());

CREATE POLICY "stock_sectores_update" ON stock_sectores FOR UPDATE TO authenticated
  USING (restaurante_id = mi_restaurante_id())
  WITH CHECK (restaurante_id = mi_restaurante_id());

CREATE POLICY "stock_sectores_delete" ON stock_sectores FOR DELETE TO authenticated
  USING (restaurante_id = mi_restaurante_id());

CREATE INDEX IF NOT EXISTS idx_stock_sectores_restaurante ON stock_sectores(restaurante_id);

ALTER TABLE productos ADD COLUMN IF NOT EXISTS sector_id UUID NULL REFERENCES stock_sectores(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_productos_sector ON productos(sector_id);

-- F4: productos fuera de uso (siguen valiendo capital pero no generan ruido operativo)
ALTER TABLE productos ADD COLUMN IF NOT EXISTS fuera_de_uso BOOLEAN NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
