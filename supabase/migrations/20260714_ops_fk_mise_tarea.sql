-- FASE 0.1 — Vincular Mise ↔ Tarea por FK (reemplaza el matching por título "Producción: ")
-- Ver PLAN-OPS-CONSOLIDACION-2026-07.md

ALTER TABLE tareas ADD COLUMN IF NOT EXISTS checklist_item_id UUID
  REFERENCES checklist_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tareas_checklist_item ON tareas(checklist_item_id);

-- Backfill: vincular tareas existentes creadas desde el mise (título con o sin prefijo
-- "Producción: ") a su checklist_item por nombre + restaurante.
UPDATE tareas t SET checklist_item_id = ci.id
FROM checklist_items ci
WHERE t.checklist_item_id IS NULL
  AND ci.restaurante_id = t.restaurante_id
  AND lower(regexp_replace(t.titulo, '^Producción:\s*', '')) = lower(ci.nombre);

NOTIFY pgrst, 'reload schema';
