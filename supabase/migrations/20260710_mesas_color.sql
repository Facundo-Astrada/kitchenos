ALTER TABLE mesas ADD COLUMN IF NOT EXISTS color TEXT NULL;
-- color: hex (ej. '#8b5cf6') elegido por el usuario en el editor de salón. NULL = color default por estado.

NOTIFY pgrst, 'reload schema';
