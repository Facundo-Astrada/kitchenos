-- Memoria persistida del Kitchen Coach — antes vivía solo en localStorage
-- (kc_active_<rid> / kc_convos_<rid>, lib/coach/history.ts), por dispositivo:
-- abrir el Coach en el celular no veía nada de lo hablado en el escritorio.
-- Una fila = una conversación. `activa=true` es la que el usuario está
-- escribiendo ahora mismo (a lo sumo una por usuario+restaurante, ver el
-- índice único parcial abajo); el resto es historial archivado, igual que
-- antes distinguía kc_active de kc_convos.
CREATE TABLE IF NOT EXISTS public.coach_conversaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id UUID NOT NULL REFERENCES public.restaurantes(id) ON DELETE CASCADE,
  usuario_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL DEFAULT 'Conversación',
  mensajes JSONB NOT NULL DEFAULT '[]'::jsonb,
  activa BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A lo sumo una conversación activa por usuario en cada restaurante — mismo
-- criterio que "una sola caja abierta" en cajas_turnos (índice único parcial
-- en vez de una constraint que dependa de un valor fijo).
CREATE UNIQUE INDEX IF NOT EXISTS uq_coach_conversaciones_activa
  ON public.coach_conversaciones (restaurante_id, usuario_id) WHERE activa;

CREATE INDEX IF NOT EXISTS idx_coach_conversaciones_historial
  ON public.coach_conversaciones (restaurante_id, usuario_id, updated_at DESC) WHERE NOT activa;

ALTER TABLE public.coach_conversaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS coach_conversaciones_select ON public.coach_conversaciones;
DROP POLICY IF EXISTS coach_conversaciones_insert ON public.coach_conversaciones;
DROP POLICY IF EXISTS coach_conversaciones_update ON public.coach_conversaciones;
DROP POLICY IF EXISTS coach_conversaciones_delete ON public.coach_conversaciones;

-- A diferencia de notificaciones (donde quien crea la fila casi nunca es el
-- destinatario), acá el dueño SIEMPRE es quien escribe — INSERT también
-- exige usuario_id = auth.uid(), no solo el tenant.
CREATE POLICY coach_conversaciones_select ON public.coach_conversaciones FOR SELECT TO authenticated
  USING (restaurante_id = mi_restaurante_id() AND usuario_id = auth.uid());

CREATE POLICY coach_conversaciones_insert ON public.coach_conversaciones FOR INSERT TO authenticated
  WITH CHECK (restaurante_id = mi_restaurante_id() AND usuario_id = auth.uid());

CREATE POLICY coach_conversaciones_update ON public.coach_conversaciones FOR UPDATE TO authenticated
  USING (restaurante_id = mi_restaurante_id() AND usuario_id = auth.uid())
  WITH CHECK (restaurante_id = mi_restaurante_id() AND usuario_id = auth.uid());

CREATE POLICY coach_conversaciones_delete ON public.coach_conversaciones FOR DELETE TO authenticated
  USING (restaurante_id = mi_restaurante_id() AND usuario_id = auth.uid());

NOTIFY pgrst, 'reload schema';
