-- Migration: demo_visitas (2026-07-06)
-- Q2 del roadmap de competencia: medir cuánta gente usa "Ver demo" desde /login.
-- Sin restaurante_id ni PII — es solo un contador de clicks, no analytics de comportamiento.

CREATE TABLE IF NOT EXISTS demo_visitas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE demo_visitas ENABLE ROW LEVEL SECURITY;

-- El click en "Ver demo" pasa por signIn() primero (login normal, sin token propio),
-- así que en el instante del insert puede o no haber sesión todavía → se permite anon.
CREATE POLICY "demo_visitas_insert" ON demo_visitas FOR INSERT TO anon, authenticated
  WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
