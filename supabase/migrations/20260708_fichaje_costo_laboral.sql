-- Migration: fichaje_costo_laboral (2026-07-08)
-- M3: fichaje real (clock-in/out) → costo laboral en Reportes.
-- `turnos_personal` ya existía (con RLS correcta) de una sesión anterior, consumida hoy
-- solo por app/(app)/reportes/personal/page.tsx (lectura). Esta migración la completa
-- para poder escribir desde el dashboard y auditar ediciones manuales de admin.

ALTER TABLE public.turnos_personal
  ADD COLUMN IF NOT EXISTS editado_por TEXT NULL,   -- equipo_miembros.id de quien corrigió el fichaje a mano (mismo patrón que tareas.creado_por)
  ADD COLUMN IF NOT EXISTS editado_at TIMESTAMPTZ NULL;

-- Costo por hora del miembro — solo lo ve/edita admin (gateado en la UI, no en RLS:
-- la fila entera de equipo_miembros ya es visible al equipo, no se aisla por columna).
ALTER TABLE public.equipo_miembros
  ADD COLUMN IF NOT EXISTS costo_hora NUMERIC NULL;

NOTIFY pgrst, 'reload schema';
