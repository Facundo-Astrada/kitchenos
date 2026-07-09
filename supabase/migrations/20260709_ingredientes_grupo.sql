-- Etapas/secciones de ingredientes dentro de una receta (ej. "Etapa 1 — marinada").
-- NULL = sin etapa (compat total con recetas existentes, se agrupan bajo "General" en el cliente).
ALTER TABLE ingredientes ADD COLUMN IF NOT EXISTS grupo TEXT NULL;

NOTIFY pgrst, 'reload schema';
