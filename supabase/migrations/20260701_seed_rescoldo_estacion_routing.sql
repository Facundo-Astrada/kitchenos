-- =============================================
-- Fase 2 — Ruteo de carta_items a estación (El Rescoldo)
-- restaurante_id = 00000000-0000-0000-0000-000000000001
-- NO tocar Bros ni ningún otro restaurante.
-- Idempotente: solo UPDATEs por nombre, repetible sin duplicar nada.
-- =============================================

DO $$
DECLARE
  rid UUID := '00000000-0000-0000-0000-000000000001';
  est_parrilla UUID;
  est_frios UUID;
  est_postres UUID;
  est_pase UUID;
  est_barra UUID;
BEGIN
  SELECT id INTO est_parrilla FROM public.estaciones WHERE restaurante_id = rid AND nombre = 'Parrilla';
  SELECT id INTO est_frios    FROM public.estaciones WHERE restaurante_id = rid AND nombre = 'Fríos';
  SELECT id INTO est_postres  FROM public.estaciones WHERE restaurante_id = rid AND nombre = 'Postres';
  SELECT id INTO est_pase     FROM public.estaciones WHERE restaurante_id = rid AND nombre = 'Pase';
  SELECT id INTO est_barra    FROM public.estaciones WHERE restaurante_id = rid AND nombre = 'Barra';

  -- Bebidas → Barra
  UPDATE public.carta_items SET estacion_default_id = est_barra
  WHERE restaurante_id = rid AND categoria = 'Bebidas';

  -- Postres → Postres
  UPDATE public.carta_items SET estacion_default_id = est_postres
  WHERE restaurante_id = rid AND categoria = 'Postres';

  -- Entradas — calientes a la parrilla
  UPDATE public.carta_items SET estacion_default_id = est_parrilla
  WHERE restaurante_id = rid AND nombre IN ('Provoleta a la Parrilla', 'Choripan Artesanal', 'Mollejas al Limon', 'Pimientos Asados Agridulces');

  -- Entradas — frías
  UPDATE public.carta_items SET estacion_default_id = est_frios
  WHERE restaurante_id = rid AND nombre IN ('Tabla de Fiambres y Quesos', 'Ensalada Caesar');

  -- Entradas — cocina caliente (pase)
  UPDATE public.carta_items SET estacion_default_id = est_pase
  WHERE restaurante_id = rid AND nombre IN ('Empanadas de Carne (x6)', 'Humita en Chala');

  -- Guarniciones — pase (calientes) / fríos (ensalada)
  UPDATE public.carta_items SET estacion_default_id = est_pase
  WHERE restaurante_id = rid AND nombre IN ('Pure de Papas', 'Papas Rusticas al Romero', 'Verduras Asadas al Rescoldo');

  UPDATE public.carta_items SET estacion_default_id = est_frios
  WHERE restaurante_id = rid AND nombre = 'Ensalada Mixta';

  -- Principales — parrilla (carnes y pescado a la parrilla)
  UPDATE public.carta_items SET estacion_default_id = est_parrilla
  WHERE restaurante_id = rid AND nombre IN (
    'Asado de Tira al Rescoldo', 'Bife de Chorizo a la Parrilla', 'Entraña a la Llama',
    'Marucha Braseada', 'Ojo de Bife', 'Parrillada para Dos', 'Pesca del Dia a la Parrilla',
    'Pollo de Campo al Rescoldo', 'Vacío al Asador'
  );

  -- Principales — pastas → pase
  UPDATE public.carta_items SET estacion_default_id = est_pase
  WHERE restaurante_id = rid AND nombre IN ('Pasta al Ragu de Ternera', 'Sorrentinos de Ricotta y Espinaca');

END $$;

NOTIFY pgrst, 'reload schema';
