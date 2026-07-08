-- Tanda C1 — Fecha del evento para menús de tipo 'evento'
-- Aditiva y nullable: los menús 'fijo' la dejan en NULL.
ALTER TABLE menus ADD COLUMN IF NOT EXISTS fecha_evento DATE NULL;

-- Recargar el schema cache de PostgREST para que el browser vea la columna nueva.
NOTIFY pgrst, 'reload schema';
