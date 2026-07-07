-- Migration: carta_publica (2026-07-06)
-- Q1 del roadmap de competencia: carta QR pública sin login.
-- slug: identificador público en la URL /carta/{slug}, generado del nombre y editable en Configuración.
-- carta_publica_activa: toggle admin, apagado por default (opt-in explícito antes de exponer datos).

ALTER TABLE restaurantes
  ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE NULL,
  ADD COLUMN IF NOT EXISTS carta_publica_activa BOOLEAN NOT NULL DEFAULT false;

-- Seed: El Rescoldo (cuenta demo de marketing) queda con la carta pública activa
-- para que /carta/el-rescoldo funcione de entrada.
UPDATE restaurantes
  SET slug = 'el-rescoldo', carta_publica_activa = true
  WHERE id = '00000000-0000-0000-0000-000000000001' AND slug IS NULL;

NOTIFY pgrst, 'reload schema';
