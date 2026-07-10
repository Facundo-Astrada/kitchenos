-- Sub-secciones dentro de una sección (Mesa de Trabajo + Mise, jul 2026).
-- v1: la UI solo permite 1 nivel de profundidad (una fila con parent_id no
-- puede a su vez ser padre) — regla de UI, no CHECK, para poder relajarla
-- después sin nueva migración. Mismo patrón que tareas.parent_id (subtareas).
ALTER TABLE checklist_secciones ADD COLUMN IF NOT EXISTS parent_id UUID NULL REFERENCES checklist_secciones(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_checklist_secciones_parent ON checklist_secciones(parent_id);

NOTIFY pgrst, 'reload schema';
