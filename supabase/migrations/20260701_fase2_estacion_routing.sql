-- =============================================
-- Fase 2 — Walking skeleton: ruteo de ítems a estación KDS
-- carta_items.estacion_default_id: estación por defecto donde
-- aparece el ítem en el KDS al enviarse una comanda. NULL = sin asignar.
-- =============================================

ALTER TABLE public.carta_items
  ADD COLUMN IF NOT EXISTS estacion_default_id UUID NULL
    REFERENCES public.estaciones(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_carta_items_estacion
  ON public.carta_items(estacion_default_id);

NOTIFY pgrst, 'reload schema';
