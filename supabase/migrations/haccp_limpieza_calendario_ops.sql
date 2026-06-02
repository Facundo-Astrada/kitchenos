-- Limpieza: soporte para vista calendario + sync a OPS checklist
-- dia_semana: 0=Dom..6=Sáb (para frecuencia 'semanal')
-- dia_mes: 1..31 (para frecuencia 'mensual')
-- sync_ops: si true, la tarea genera un checklist_item en plaza 'general' sección 'Limpieza'
-- checklist_item_id: referencia al item OPS creado (para mantener sincronía al borrar)

ALTER TABLE haccp_limpieza ADD COLUMN IF NOT EXISTS dia_semana INT;
ALTER TABLE haccp_limpieza ADD COLUMN IF NOT EXISTS dia_mes INT;
ALTER TABLE haccp_limpieza ADD COLUMN IF NOT EXISTS sync_ops BOOLEAN DEFAULT true;
ALTER TABLE haccp_limpieza ADD COLUMN IF NOT EXISTS checklist_item_id UUID;
