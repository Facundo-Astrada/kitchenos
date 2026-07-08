-- Tanda C — Precio del menú/evento + OPS por preparación (panel unificado)
-- Precio a nivel de menú (un precio; las variantes comparten precio).
ALTER TABLE menus ADD COLUMN IF NOT EXISTS precio NUMERIC NULL;

-- OPS / mise por preparación de menú (mismo panel que plato/ficha):
-- plaza y seccion_mise ya existían; se agregan recipiente y peso por porción.
ALTER TABLE menu_preparaciones
  ADD COLUMN IF NOT EXISTS cantidad_ops NUMERIC NULL,
  ADD COLUMN IF NOT EXISTS unidad_ops TEXT NULL,
  ADD COLUMN IF NOT EXISTS recipiente_nombre TEXT NULL,
  ADD COLUMN IF NOT EXISTS peso_porcion NUMERIC NULL,
  ADD COLUMN IF NOT EXISTS peso_porcion_unidad TEXT NULL;

NOTIFY pgrst, 'reload schema';
