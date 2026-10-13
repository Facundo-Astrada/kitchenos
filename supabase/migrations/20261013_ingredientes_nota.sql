-- Nota del chef por ingrediente de una receta (Recetario, oct 2026).
-- La cantidad dice cuánto; la nota dice cómo o cuál: "2 unidades, maduras y
-- dulces", "tostado", "sin semillas". Texto libre, lo lee quien cocina en la
-- ficha y en el drawer de receta de OPS. No afecta el costeo ni el stock.
-- Mismo nombre que plato_recetas.nota y menu_preparaciones.nota (la nota de
-- UN componente dentro de su contenedor).
ALTER TABLE public.ingredientes ADD COLUMN IF NOT EXISTS nota TEXT NULL;

NOTIFY pgrst, 'reload schema';
