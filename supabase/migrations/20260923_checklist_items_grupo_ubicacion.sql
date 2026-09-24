-- Grupos físicos dentro de una sección del mise (Mesa de trabajo → Producción).
-- Ítems con el mismo número en la misma sección están juntos en el mismo
-- lugar físico (misma bandeja/estante) y van contiguos por `orden`, así el
-- mise los recorre en ese orden. NULL = suelto. El número es local a la
-- sección (no es un id global) y fija el color del grupo en el board.
ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS grupo_ubicacion SMALLINT NULL;

NOTIFY pgrst, 'reload schema';
