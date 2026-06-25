-- ─────────────────────────────────────────────────────────────
-- OPCIONAL — Persistencia server-side del onboarding.
--
-- Por ahora el onboarding se marca como completado en localStorage
-- (`onboarding_done_<userId>`). Esta migración deja preparado el camino
-- para migrar a persistencia real por usuario/restaurante.
--
-- Idempotente: se puede correr varias veces sin romper nada.
--
-- Para activar el camino server-side (ver lib/hooks/useOnboardingProgress.ts):
--   1. Correr esta migración.
--   2. En markOnboardingDone(): además del localStorage, hacer UPDATE de la columna.
--   3. En la lectura inicial (page.tsx / dashboard redirect): leer la columna.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.user_restaurantes
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;

-- Recargar el schema cache de PostgREST para que el browser client vea la columna nueva.
NOTIFY pgrst, 'reload schema';
