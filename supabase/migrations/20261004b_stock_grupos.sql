-- Board de Stock en Mesa de trabajo: grupos con nombre dentro de un estante (o
-- sueltos en el sector) — ej. Estante 1 → Vinagres, Aceites, Latas de tomate.
-- El orden de los grupos fija el recorrido de Stockear: estante por estante,
-- grupo por grupo, y dentro del grupo por productos.orden_sector.
-- "grupo" pelado ya significa otra cosa (Ingrediente.grupo, grupo_ubicacion del
-- mise) — por eso el prefijo stock_ en tabla y columna.
CREATE TABLE IF NOT EXISTS stock_grupos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id UUID NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  sector_id UUID NOT NULL REFERENCES stock_sectores(id) ON DELETE CASCADE,
  estante_id UUID NULL REFERENCES stock_estantes(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  orden INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE stock_grupos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stock_grupos_select" ON stock_grupos;
CREATE POLICY "stock_grupos_select" ON stock_grupos FOR SELECT TO authenticated
  USING (restaurante_id = mi_restaurante_id());

DROP POLICY IF EXISTS "stock_grupos_insert" ON stock_grupos;
CREATE POLICY "stock_grupos_insert" ON stock_grupos FOR INSERT TO authenticated
  WITH CHECK (restaurante_id = mi_restaurante_id());

DROP POLICY IF EXISTS "stock_grupos_update" ON stock_grupos;
CREATE POLICY "stock_grupos_update" ON stock_grupos FOR UPDATE TO authenticated
  USING (restaurante_id = mi_restaurante_id())
  WITH CHECK (restaurante_id = mi_restaurante_id());

DROP POLICY IF EXISTS "stock_grupos_delete" ON stock_grupos;
CREATE POLICY "stock_grupos_delete" ON stock_grupos FOR DELETE TO authenticated
  USING (restaurante_id = mi_restaurante_id());

CREATE INDEX IF NOT EXISTS idx_stock_grupos_restaurante ON stock_grupos(restaurante_id);
CREATE INDEX IF NOT EXISTS idx_stock_grupos_sector ON stock_grupos(sector_id);
CREATE INDEX IF NOT EXISTS idx_stock_grupos_estante ON stock_grupos(estante_id);

-- NULL = producto suelto en su estante/sector. Al borrar el grupo (o su estante,
-- que lo borra en cascada) el producto queda suelto, no se pierde.
ALTER TABLE productos ADD COLUMN IF NOT EXISTS stock_grupo_id UUID NULL REFERENCES stock_grupos(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_productos_stock_grupo ON productos(stock_grupo_id);

NOTIFY pgrst, 'reload schema';
