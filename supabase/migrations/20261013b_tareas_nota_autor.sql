-- Nota de la tarea de Producción — una por tarea, igual que la del mise
-- (checklist_items.nota / nota_por / nota_at).
--
-- `tareas.nota` ya existía (la llena la activación de un menú con la nota de su
-- preparación) pero ninguna pantalla la leía. Faltaban quién y cuándo, y el id
-- del autor: chef y admin editan cualquier nota; el resto, solo la que escribió.
-- Idempotente.

ALTER TABLE tareas ADD COLUMN IF NOT EXISTS nota TEXT;
ALTER TABLE tareas ADD COLUMN IF NOT EXISTS nota_por TEXT;
ALTER TABLE tareas ADD COLUMN IF NOT EXISTS nota_por_id TEXT;
ALTER TABLE tareas ADD COLUMN IF NOT EXISTS nota_at TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';
