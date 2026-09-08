-- ============================================================
-- Migración: categorías de Carta duplicadas + índice único que faltaba
-- Contexto: lib/hooks/useCarta.ts siembra las categorías por defecto cuando
--   la tabla viene vacía (primer ingreso a Carta), sin candado contra dos
--   montajes simultáneos. Encontrado en producción (Bros comedor): Entradas,
--   Principales, Postres, Bebidas, Guarniciones, Cafetería y Brunch — cada
--   una duplicada. Misma clase de bug que /api/invitar (PLAN-ARREGLOS-
--   2026-09-08 #1): sin índice único, ON CONFLICT no tiene nada que inferir.
-- carta_items.categoria guarda el NOMBRE (texto), no un FK al id — verificado
--   contra el schema real (sin foreign key hacia carta_categorias). Borrar
--   duplicados por id no rompe ninguna referencia.
-- IDEMPOTENTE: si ya no hay duplicados, el DELETE no borra nada y el CREATE
--   UNIQUE INDEX usa IF NOT EXISTS.
-- ============================================================

-- 1) Verificación previa (correr antes para confirmar el conteo)
-- SELECT restaurante_id, nombre, count(*)
-- FROM carta_categorias GROUP BY 1, 2 HAVING count(*) > 1;

-- 2) Borrado: conserva la fila más vieja (created_at, luego id) por
--    (restaurante_id, nombre) — la más vieja es la que probablemente ya
--    tiene platos asignados desde antes.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY restaurante_id, nombre
           ORDER BY created_at NULLS FIRST, id
         ) AS rn
  FROM carta_categorias
)
DELETE FROM carta_categorias
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 3) El índice único que le faltaba — a partir de acá, ON CONFLICT
--    (restaurante_id, nombre) con ignoreDuplicates en el cliente ya
--    tiene algo que inferir, y un segundo montaje concurrente no puede
--    volver a duplicar.
CREATE UNIQUE INDEX IF NOT EXISTS carta_categorias_rest_nombre_uniq
  ON public.carta_categorias (restaurante_id, nombre);

-- 4) Verificación posterior (debe devolver 0 filas)
-- SELECT restaurante_id, nombre, count(*)
-- FROM carta_categorias GROUP BY 1, 2 HAVING count(*) > 1;
