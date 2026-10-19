-- Suplentes por (área, capa) — PLAN-ORGANIGRAMA-REUNION-2026-10.md § 5.2 (19/10/2026).
--
-- `responsables` pasa a leerse como "titulares": todos llevan lo mismo, sin
-- jerarquía (dos jefes de cocina que comparten cada turno). Los suplentes son
-- los que cubren si falta un titular; la app los sugiere desde Polivalencia
-- (nivel autónomo o referente en las plazas del área) y el admin confirma.
-- Un array en la misma fila, como `responsables`: RLS no cambia.

ALTER TABLE public.area_capas
  ADD COLUMN IF NOT EXISTS suplentes uuid[] NOT NULL DEFAULT '{}';

NOTIFY pgrst, 'reload schema';
