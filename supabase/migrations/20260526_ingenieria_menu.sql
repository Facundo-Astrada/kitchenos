-- Ingeniería de menú: plaza + cantidad diaria por componente
ALTER TABLE plato_componentes
  ADD COLUMN IF NOT EXISTS plaza text,
  ADD COLUMN IF NOT EXISTS cantidad_diaria numeric,
  ADD COLUMN IF NOT EXISTS unidad text DEFAULT 'u';
