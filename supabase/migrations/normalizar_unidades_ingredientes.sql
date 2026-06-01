-- ============================================================
-- Migración: normalizar unidades de ingredientes a forma canónica
-- Contexto: los datos traen 'gr' (113+ filas) donde debería decir 'g',
--   'lt'/'lts' por 'l', 'cc' por 'ml', 'unidad' por 'u'. El código de
--   costeo (unitConversionFactor) ya tolera estas variantes, pero
--   normalizar la DB evita confusión futura y limpia los selects.
-- NO toca costos ni cantidades, sólo el string de unidad.
-- IDEMPOTENTE.
-- ============================================================

UPDATE ingredientes SET unidad = 'g'
  WHERE lower(trim(unidad)) IN ('gr','grs','gramo','gramos');
UPDATE ingredientes SET unidad = 'kg'
  WHERE lower(trim(unidad)) IN ('kgs','kilo','kilos','k');
UPDATE ingredientes SET unidad = 'ml'
  WHERE lower(trim(unidad)) IN ('cc','mililitro','mililitros');
UPDATE ingredientes SET unidad = 'l'
  WHERE lower(trim(unidad)) IN ('lt','lts','litro','litros','L');
UPDATE ingredientes SET unidad = 'u'
  WHERE lower(trim(unidad)) IN ('un','unidad','unidades');

UPDATE ingredientes SET unidad_costo = 'g'
  WHERE lower(trim(unidad_costo)) IN ('gr','grs','gramo','gramos');
UPDATE ingredientes SET unidad_costo = 'kg'
  WHERE lower(trim(unidad_costo)) IN ('kgs','kilo','kilos','k');
UPDATE ingredientes SET unidad_costo = 'ml'
  WHERE lower(trim(unidad_costo)) IN ('cc','mililitro','mililitros');
UPDATE ingredientes SET unidad_costo = 'l'
  WHERE lower(trim(unidad_costo)) IN ('lt','lts','litro','litros','L');
UPDATE ingredientes SET unidad_costo = 'u'
  WHERE lower(trim(unidad_costo)) IN ('un','unidad','unidades');

-- Verificación: combos restantes
-- SELECT unidad, unidad_costo, count(*) FROM ingredientes
-- GROUP BY unidad, unidad_costo ORDER BY count(*) DESC;
