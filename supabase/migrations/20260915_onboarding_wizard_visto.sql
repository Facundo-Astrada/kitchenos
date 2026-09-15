-- ─────────────────────────────────────────────────────────────
-- Gate de /onboarding por persona, no por restaurante vacío.
--
-- Mismo patrón que `onboarding_visto_at` (carta de bienvenida): columna
-- dedicada en equipo_miembros, no localStorage ni tours_vistos (esa
-- columna es solo para claves de lib/coach/tours.ts — ver columnas.md).
-- La guía de inicio (/onboarding) es un flujo propio, así que se gana su
-- propia columna en vez de mezclarse con el registro de tours del Coach.
--
-- Reemplaza a la migración vieja 20260622_onboarding_completed_at.sql
-- (nunca aplicada, apuntaba a user_restaurantes — de solo lectura desde
-- el browser, hubiera exigido una API route para escribirla).
--
-- Backfill: sin esto, el próximo login de TODO el personal ya activo de
-- Bros (única cuenta con uso vivo) los mandaría al wizard de setup — un
-- restaurante que ya opera hace meses no necesita ver "cargá tu carta".
-- El gate nuevo solo debe aplicar a gente que se sume de acá en más.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.equipo_miembros
  ADD COLUMN IF NOT EXISTS onboarding_wizard_visto_at timestamptz;

UPDATE public.equipo_miembros
  SET onboarding_wizard_visto_at = now()
  WHERE onboarding_wizard_visto_at IS NULL;

NOTIFY pgrst, 'reload schema';
