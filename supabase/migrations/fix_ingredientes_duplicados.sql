-- ============================================================
-- Migración: eliminar ingredientes duplicados
-- Contexto: 5 recetas tienen ingredientes repetidos (mismo nombre
--   dentro de la misma receta) que inflan el costo. Ej: "Agua" ×3,
--   "Aceite de oliva" ×2. Todos los duplicados comparten costo/producto,
--   así que conservamos la fila más antigua (id mínimo) y borramos el resto.
-- Filas a eliminar esperadas: 6
-- IDEMPOTENTE: si ya no hay duplicados, no borra nada.
-- ============================================================

-- 1) Verificación previa (correr antes para confirmar el conteo)
-- SELECT receta_id, lower(nombre) n, count(*) c
-- FROM ingredientes
-- GROUP BY receta_id, lower(nombre)
-- HAVING count(*) > 1;

-- 2) Borrado: conserva el ctid menor por (receta_id, nombre normalizado)
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY receta_id, lower(trim(nombre))
           ORDER BY created_at NULLS FIRST, id
         ) AS rn
  FROM ingredientes
)
DELETE FROM ingredientes
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 3) Verificación posterior (debe devolver 0 filas)
-- SELECT receta_id, lower(nombre), count(*)
-- FROM ingredientes GROUP BY receta_id, lower(nombre) HAVING count(*) > 1;
