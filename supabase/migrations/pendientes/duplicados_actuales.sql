-- SOLO LECTURA. Paso 0 del candado: ver si hay duplicados que harían fallar el
-- CREATE UNIQUE INDEX. Misma clave que `claveTarea()` en dedupeTareas.ts.
WITH norm AS (
  SELECT
    id, titulo, turno_fecha, categoria, menu_id, checklist_item_id, created_at,
    restaurante_id,
    turno_fecha::text
      || '::' || COALESCE(modo, 'carta')
      || '::' || lower(btrim(COALESCE(
           CASE WHEN COALESCE(modo, 'carta') = 'carta' THEN plaza ELSE seccion END, '')))
      || '::' || COALESCE(menu_id::text, '')
      || '::' || btrim(regexp_replace(lower(translate(titulo,
           'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
           'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')), '\s+', ' ', 'g'))
      AS clave
  FROM public.tareas
  WHERE parent_id IS NULL
    AND turno_fecha IS NOT NULL
    AND categoria IN ('produccion', 'pase_turno')
)
SELECT restaurante_id, clave, count(*) AS gemelas,
       array_agg(id ORDER BY (checklist_item_id IS NOT NULL) DESC, created_at DESC) AS ids_mejor_primero,
       min(titulo) AS ejemplo
FROM norm
GROUP BY restaurante_id, clave
HAVING count(*) > 1
ORDER BY count(*) DESC, clave;
