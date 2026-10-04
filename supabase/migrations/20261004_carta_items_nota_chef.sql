-- Nota de seguimiento del chef por plato (mapa de la carta, PLAN-DESARROLLO-PLATOS-2026-10 Fase 3).
-- Texto libre para quien planifica y sigue la carta ("sale poco en semana",
-- "probar con papas confitadas"). No es la descripción (la ve el cliente en la
-- carta pública) ni carta_items.procedimiento (el armado). La carta pública
-- selecciona columnas explícitas, así que esto nunca sale al cliente.
ALTER TABLE public.carta_items ADD COLUMN IF NOT EXISTS nota_chef TEXT NULL;

NOTIFY pgrst, 'reload schema';
