-- equipo_miembros.uniforme: registro de qué prendas de uniforme tiene
-- prestadas cada persona del equipo, para poder reclamarlas si se va.
-- JSONB de claves libres (varían por restaurante) -> cantidad, ej.
-- {"chaqueta": 2, "pantalon": 2, "delantal": 1}. Sin CHECK de forma a
-- propósito: el set de prendas no es fijo entre cuentas.
--
-- Default NULL, no '{}' -- mismo patrón que ver_costos (ver columnas.md):
-- NULL = nunca se cargó el uniforme de esta persona, '{}' = se revisó y
-- no tiene nada prestado. Tratarlos distinto en la UI.
--
-- equipo_miembros.observaciones: texto libre para notas de un encargado
-- sobre la persona (ausentismo, llamados de atención, lo que sea). Sin
-- default, sin constraint -- es una libreta, no un campo estructurado.
ALTER TABLE equipo_miembros
  ADD COLUMN IF NOT EXISTS uniforme jsonb,
  ADD COLUMN IF NOT EXISTS observaciones text;

COMMENT ON COLUMN equipo_miembros.uniforme IS 'Prendas de uniforme prestadas: {"prenda": cantidad, ...}, claves libres por restaurante. NULL = nunca se cargó (distinto de {} = revisado, sin nada prestado).';
COMMENT ON COLUMN equipo_miembros.observaciones IS 'Notas libres de un encargado sobre la persona (ausentismo, llamados de atención, etc). Sin estructura ni default.';

-- Sin esto, PostgREST sigue sirviendo el schema cacheado y el browser no ve
-- las columnas nuevas hasta que el pooler recicle solo (minutos después).
NOTIFY pgrst, 'reload schema';

-- ================================================================
-- ROLLBACK (ejecutar solo si necesitás revertir):
-- ALTER TABLE equipo_miembros DROP COLUMN IF EXISTS uniforme;
-- ALTER TABLE equipo_miembros DROP COLUMN IF EXISTS observaciones;
-- NOTIFY pgrst, 'reload schema';
-- ================================================================
