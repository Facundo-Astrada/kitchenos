-- Tanda C — Variantes de menú a un precio (el comensal elige una)
-- menu_preparaciones.variante: NULL = ítem común a todas las variantes;
--   un texto = ítem exclusivo de esa variante (ej. el principal).
-- menus.variantes: lista de nombres de variante definidos en el menú
--   (permite variantes sin ítems asignados todavía). El precio vive en el menú.
ALTER TABLE menu_preparaciones ADD COLUMN IF NOT EXISTS variante TEXT NULL;
ALTER TABLE menus ADD COLUMN IF NOT EXISTS variantes TEXT[] NULL;

NOTIFY pgrst, 'reload schema';
