-- Tanda D — Receta como plato: OPS por ingrediente/subreceta
-- recetas.es_plato: modo "trabajar como plato" (flag explícito, elegido al cargar).
--   La ficha muestra un botón OPS por ingrediente cuando es true.
--   (No confundir con "en_carta", derivado del link carta_items.receta_id.)
ALTER TABLE recetas ADD COLUMN IF NOT EXISTS es_plato BOOLEAN DEFAULT false;

-- Ingredientes ganan el mismo set OPS que menu_preparaciones (ruteo por componente).
ALTER TABLE ingredientes
  ADD COLUMN IF NOT EXISTS plaza TEXT NULL,
  ADD COLUMN IF NOT EXISTS seccion_mise TEXT NULL,
  ADD COLUMN IF NOT EXISTS cantidad_ops NUMERIC NULL,
  ADD COLUMN IF NOT EXISTS unidad_ops TEXT NULL,
  ADD COLUMN IF NOT EXISTS recipiente_nombre TEXT NULL,
  ADD COLUMN IF NOT EXISTS peso_porcion NUMERIC NULL,
  ADD COLUMN IF NOT EXISTS peso_porcion_unidad TEXT NULL;

NOTIFY pgrst, 'reload schema';
