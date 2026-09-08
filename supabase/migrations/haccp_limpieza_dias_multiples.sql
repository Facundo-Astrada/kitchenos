-- ============================================================
-- Migración: Limpieza — múltiples días por semana + registro por fecha
-- Contexto: PLAN-PANTALLAS-2026-09-08.md, Bloque 3. haccp_limpieza.dia_semana
--   es un entero: una tarea semanal solo puede tocar UN día ("campana los
--   lunes" sí, "campana los lunes y jueves" no — hoy son dos filas
--   separadas). Para diagramar una semana de verdad hace falta un arreglo.
-- dia_semana se deja intacto (lo lee OPS y el sync a checklist_rutina,
--   ver syncLimpiezaToOps en lib/hooks/useHaccp.ts) — dias_semana es
--   aditivo, no lo reemplaza.
-- El índice único en haccp_limpieza_registros habilita un upsert limpio
--   por (limpieza_id, fecha): la vista Semana tilda/destilda un día
--   puntual sin arriesgarse a duplicar filas para la misma tarea+fecha.
--   Verificado contra prod: 0 duplicados hoy, el índice entra sin limpieza.
-- IDEMPOTENTE: ADD COLUMN IF NOT EXISTS + CREATE UNIQUE INDEX IF NOT EXISTS.
-- ============================================================

ALTER TABLE public.haccp_limpieza
  ADD COLUMN IF NOT EXISTS dias_semana SMALLINT[];

UPDATE public.haccp_limpieza
  SET dias_semana = ARRAY[dia_semana]::SMALLINT[]
  WHERE dia_semana IS NOT NULL AND dias_semana IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS haccp_limpieza_registros_limp_fecha_uniq
  ON public.haccp_limpieza_registros (limpieza_id, fecha);
