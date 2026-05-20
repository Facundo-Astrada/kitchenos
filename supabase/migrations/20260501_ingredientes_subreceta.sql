-- Subrecetas: soporte de ingredientes que son otras recetas
ALTER TABLE ingredientes
  ADD COLUMN IF NOT EXISTS subreceta_id uuid REFERENCES recetas(id),
  ADD COLUMN IF NOT EXISTS tipo text DEFAULT 'producto';
