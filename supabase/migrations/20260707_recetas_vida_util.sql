-- Migration: recetas_vida_util (2026-07-07)
-- Q4 etiquetas de producción: días de caducidad configurables por receta.
-- NULL = usar default de 3 días al imprimir la etiqueta (fallback en el cliente).

ALTER TABLE recetas
  ADD COLUMN IF NOT EXISTS vida_util_dias INT NULL;

NOTIFY pgrst, 'reload schema';
