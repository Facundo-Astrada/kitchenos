-- =============================================
-- Seed El Rescoldo — datos de prueba Fase 1
-- restaurante_id = 00000000-0000-0000-0000-000000000001
-- NO tocar Bros ni ningún otro restaurante.
-- =============================================

DO $$
DECLARE
  rid UUID := '00000000-0000-0000-0000-000000000001';
BEGIN

-- ── 1. Estaciones KDS ────────────────────────────────────────
INSERT INTO public.estaciones (restaurante_id, nombre, pantalla_asignada) VALUES
  (rid, 'Parrilla',  'tablet-parrilla'),
  (rid, 'Fríos',     'tablet-frios'),
  (rid, 'Postres',   'tablet-postres'),
  (rid, 'Pase',      'tablet-pase'),
  (rid, 'Barra',     'tablet-barra')
ON CONFLICT DO NOTHING;

-- ── 2. Medios de pago ────────────────────────────────────────
INSERT INTO public.medios_pago (restaurante_id, nombre, activo) VALUES
  (rid, 'Efectivo',      true),
  (rid, 'Tarjeta',       true),
  (rid, 'Transferencia', true),
  (rid, 'QR',            true),
  (rid, 'Mixto',         true)
ON CONFLICT DO NOTHING;

-- ── 3. Mesas con posiciones para el mapa visual ──────────────
-- Salón principal: 6 mesas en grid 2×3
INSERT INTO public.mesas (restaurante_id, numero, sector, capacidad, estado, pos_x, pos_y) VALUES
  (rid, '1',  'Salón',   4, 'libre', 10, 10),
  (rid, '2',  'Salón',   4, 'libre', 32, 10),
  (rid, '3',  'Salón',   4, 'libre', 10, 36),
  (rid, '4',  'Salón',   6, 'libre', 32, 36),
  (rid, '5',  'Salón',   2, 'libre', 10, 62),
  (rid, '6',  'Salón',   2, 'libre', 32, 62),
-- Terraza: 4 mesas
  (rid, '7',  'Terraza', 4, 'libre', 62, 10),
  (rid, '8',  'Terraza', 4, 'libre', 82, 10),
  (rid, '9',  'Terraza', 6, 'libre', 62, 36),
  (rid, '10', 'Terraza', 6, 'libre', 82, 36),
-- Barra: 2 taburetes
  (rid, 'B1', 'Barra',   1, 'libre', 62, 68),
  (rid, 'B2', 'Barra',   1, 'libre', 76, 68)
ON CONFLICT DO NOTHING;

-- ── 4. Config fiscal (RI — Responsable Inscripto, punto de venta 3) ─
INSERT INTO public.config_fiscal (restaurante_id, condicion, cuit, puntos_venta)
VALUES (rid, 'RI', '30-71234567-9', ARRAY[3])
ON CONFLICT (restaurante_id) DO NOTHING;

END $$;

NOTIFY pgrst, 'reload schema';
