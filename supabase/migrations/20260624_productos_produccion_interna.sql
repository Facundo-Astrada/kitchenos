-- Producciones internas como ítem de stock
-- Productos que se producen (caldos, masas, fondos) y no vienen de factura.
-- Su costo se toma de la receta vinculada.

ALTER TABLE productos ADD COLUMN IF NOT EXISTS es_produccion BOOLEAN DEFAULT false;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS receta_id UUID NULL REFERENCES recetas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_productos_receta ON productos(receta_id);

NOTIFY pgrst, 'reload schema';
