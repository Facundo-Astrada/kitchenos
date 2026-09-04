-- plato_recetas.gramaje: peso de ESTE componente en UNA porción del plato —
-- dedicado al food cost. Separado de cantidad_ops/unidad_ops, que es la
-- demanda que este plato aporta al batch/stock estándar de la plaza (mise).
-- Antes compartían la misma columna: DetailView/CartaBoardCard la leían como
-- batch de mise ("20 pax · Fríos"), pero recetario/page.tsx y
-- ComposicionEditor.tsx la costeaban como si fuera el gramaje del plato — con
-- porciones=1 de default en el 85% de las filas, el food cost terminaba
-- contando "una porción entera de cada receta componente" (ver sesión
-- 2026-09-04, devolución "no hay gramaje en Carta").
ALTER TABLE plato_recetas
  ADD COLUMN IF NOT EXISTS gramaje numeric,
  ADD COLUMN IF NOT EXISTS gramaje_unidad text DEFAULT 'g';

COMMENT ON COLUMN plato_recetas.gramaje IS 'Peso (en gramaje_unidad) de este componente en UNA porción del plato — food cost. No confundir con cantidad_ops (demanda de este plato al batch/stock estándar de la plaza).';
COMMENT ON COLUMN plato_recetas.cantidad_ops IS 'Contribución de este plato al stock estándar (par level) de la plaza — mise, no costeo. Ver plato_recetas.gramaje para el costeo por gramo.';

-- Backfill, en orden de confiabilidad:
-- 1) Si ya existe un checklist_item con recipiente configurado para esta
--    receta+plaza, su peso_porcion YA es "cuánto pesa una porción de esta
--    prep" (ver CartaBoardCard.tsx) — el dato más confiable disponible hoy.
--    A futuro esto se sigue leyendo en vivo desde checklist_items (tiene
--    prioridad sobre esta columna porque es compartido y puede cambiar sin
--    tocar cada plato_recetas) — este backfill es solo para dejar un valor
--    de partida si esa relación se pierde.
UPDATE plato_recetas pr
SET gramaje = ci.peso_porcion,
    gramaje_unidad = coalesce(ci.peso_porcion_unidad, 'g')
FROM checklist_items ci
WHERE ci.receta_id = pr.receta_id
  AND ci.plaza = pr.plaza
  AND ci.peso_porcion IS NOT NULL
  AND pr.gramaje IS NULL;

-- 2) Sin recipiente, cuando cantidad_ops ya se cargó en unidad de peso/volumen
--    (g/kg/ml/l) — la convención que CartaBoardCard.tsx ya documentaba ("sin
--    recipiente, cantidad_ops es el gramaje directo"). kg/l se normalizan a
--    gramos (densidad ≈ 1 para l→g, misma aproximación que lib/unidades.ts).
UPDATE plato_recetas
SET gramaje = CASE lower(unidad_ops) WHEN 'kg' THEN cantidad_ops * 1000 WHEN 'l' THEN cantidad_ops * 1000 ELSE cantidad_ops END,
    gramaje_unidad = 'g'
WHERE gramaje IS NULL
  AND unidad_ops IS NOT NULL
  AND lower(unidad_ops) IN ('g', 'kg', 'ml', 'l');
