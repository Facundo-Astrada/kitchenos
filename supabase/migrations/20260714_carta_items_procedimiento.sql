-- Procedimiento (elaboración/armado) por plato de la carta.
-- Se edita desde la ficha técnica derivada del recetario (pestaña Platos).
ALTER TABLE carta_items ADD COLUMN IF NOT EXISTS procedimiento TEXT NULL;

NOTIFY pgrst, 'reload schema';
