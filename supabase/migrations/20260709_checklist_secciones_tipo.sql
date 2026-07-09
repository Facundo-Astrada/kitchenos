-- Espacios: secciones tipadas (producción / almacén / heladera / freezer / estación).
-- 'produccion' es el default para no romper las secciones existentes (mise diario).
ALTER TABLE checklist_secciones ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'produccion';
ALTER TABLE checklist_secciones ADD COLUMN IF NOT EXISTS producto_ids UUID[] NOT NULL DEFAULT '{}';

NOTIFY pgrst, 'reload schema';
