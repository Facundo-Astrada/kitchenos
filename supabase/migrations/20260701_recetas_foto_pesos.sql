-- Migration: recetas_foto_pesos (2026-07-01)
-- Adds foto_url, peso_total_g (bruto), peso_escurrido_g (neto tras cocción/escurrido) to recetas
-- Bucket storage.buckets('fotos') also created (public, para fotos de recetas y carta)

ALTER TABLE recetas
  ADD COLUMN IF NOT EXISTS foto_url TEXT NULL,
  ADD COLUMN IF NOT EXISTS peso_total_g NUMERIC NULL,
  ADD COLUMN IF NOT EXISTS peso_escurrido_g NUMERIC NULL;

-- Bucket público para fotos (recetas, carta, equipo)
INSERT INTO storage.buckets (id, name, public)
  VALUES ('fotos', 'fotos', true)
  ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
