-- Nota libre por tarea de producción (mismo patrón que checklist_items.nota,
-- sep 2026) — para que la anotación cargada en menu_preparaciones/plato_recetas
-- ("freír en la freidora chica") llegue hasta la tarea real y no se pierda al
-- activar el menú/evento. `descripcion` ya está ocupado con el nombre del
-- menú (ver activarMenuParaFechas) — no se puede reusar sin pisarlo.
ALTER TABLE public.tareas ADD COLUMN IF NOT EXISTS nota TEXT NULL;

NOTIFY pgrst, 'reload schema';
