-- Foto diaria del progreso de la ruta de implantación, para que el
-- reconocimiento semanal (lib/implantacion/avisos.ts, DECISIONES.md § 25)
-- tenga contra qué comparar: "cuántas funciones quedaron funcionando solas
-- ESTA SEMANA" es una diferencia, y sin foto anterior no hay diferencia.
--
-- La escribe el CLIENTE (useRutaImplantacion), no el cron, a propósito: el
-- cálculo del progreso necesita el árbol completo de la carta para el nivel
-- de estandarización (lib/recetas/estandarizacion.ts) y vive en un módulo
-- 'use client'. Recomputarlo server-side sería una segunda fuente de verdad
-- que se desincroniza — exactamente el proxy mentiroso que se sacó el 11/09.
-- El cron solo LEE esta tabla y resta. Además `ingredientes` no tiene
-- restaurante_id (su RLS filtra por las recetas de la cuenta): contarla con
-- el admin client, que bypassea RLS, sumaría todos los tenants.
--
-- Consecuencia aceptada: la foto se actualiza cuando alguien abre /implantacion
-- o el dashboard. Un restaurante donde nadie entra no genera fotos — y tampoco
-- tiene nada que reconocerle.
CREATE TABLE IF NOT EXISTS public.implantacion_progreso (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id  UUID NOT NULL REFERENCES public.restaurantes(id) ON DELETE CASCADE,
  fecha           DATE NOT NULL,
  insertadas      SMALLINT NOT NULL,
  total           SMALLINT NOT NULL,
  pct             SMALLINT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Una foto por día por restaurante. El cliente hace upsert sobre esta clave,
  -- así abrir la pantalla diez veces en el día no deja diez filas.
  CONSTRAINT implantacion_progreso_dia_unico UNIQUE (restaurante_id, fecha)
);

CREATE INDEX IF NOT EXISTS idx_implantacion_progreso_restaurante
  ON public.implantacion_progreso(restaurante_id, fecha DESC);

ALTER TABLE public.implantacion_progreso ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "implantacion_progreso_select" ON public.implantacion_progreso;
CREATE POLICY "implantacion_progreso_select" ON public.implantacion_progreso
  FOR SELECT TO authenticated
  USING (restaurante_id = mi_restaurante_id());

DROP POLICY IF EXISTS "implantacion_progreso_insert" ON public.implantacion_progreso;
CREATE POLICY "implantacion_progreso_insert" ON public.implantacion_progreso
  FOR INSERT TO authenticated
  WITH CHECK (restaurante_id = mi_restaurante_id());

DROP POLICY IF EXISTS "implantacion_progreso_update" ON public.implantacion_progreso;
CREATE POLICY "implantacion_progreso_update" ON public.implantacion_progreso
  FOR UPDATE TO authenticated
  USING (restaurante_id = mi_restaurante_id())
  WITH CHECK (restaurante_id = mi_restaurante_id());

-- Sin policy de DELETE: una foto del pasado no se borra, se acumula. Son ~365
-- filas por restaurante por año, nada que podar por ahora.

NOTIFY pgrst, 'reload schema';
