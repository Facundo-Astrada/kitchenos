-- ✅ CORRIDO en prod el 11/09/2026 (Bros). Se deja el script tal cual quedó
-- aplicado, como referencia — no hace falta volver a correrlo.
--
-- Historial: la primera versión usaba `turno_fecha::text` y Postgres la
-- rechazó — `date_out` es STABLE (depende del `DateStyle` de la sesión), no
-- IMMUTABLE, y una columna generada exige IMMUTABLE. Se reemplazó por
-- `kos_fecha_iso()`, que arma el ISO a mano con extract()+lpad() (ambos
-- IMMUTABLE). Antes de correr esto en otro entorno, verificar con
-- `SELECT provolatile FROM pg_proc WHERE proname='date_out'` — si algún día
-- Postgres lo vuelve IMMUTABLE, esta vuelta ya no hace falta.

-- 1. La normalización, replicando normalizarTitulo() de dedupeTareas.ts.
--    IMMUTABLE es obligatorio: una columna generada no acepta STABLE (por eso
--    no se usa unaccent(), que es STABLE).
CREATE OR REPLACE FUNCTION public.kos_normalizar_titulo(t TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT btrim(regexp_replace(lower(translate(t,
    'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
    'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')), '\s+', ' ', 'g'))
$$;

-- 1b. Fecha ISO IMMUTABLE — ver nota de arriba.
CREATE OR REPLACE FUNCTION public.kos_fecha_iso(d DATE)
RETURNS TEXT LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT lpad(EXTRACT(YEAR FROM d)::text, 4, '0') || '-'
    || lpad(EXTRACT(MONTH FROM d)::text, 2, '0') || '-'
    || lpad(EXTRACT(DAY FROM d)::text, 2, '0')
$$;

-- 2. La clave, como columna generada. NULL para todo lo que no es producción
--    del día: así las anotaciones libres del Pase y del Calendario quedan
--    libres de repetirse (dos anotaciones con el mismo texto son dos
--    anotaciones), y en Postgres los NULL no chocan entre sí en un índice único.
ALTER TABLE public.tareas
  ADD COLUMN IF NOT EXISTS clave_produccion TEXT
  GENERATED ALWAYS AS (
    CASE
      WHEN parent_id IS NULL
       AND turno_fecha IS NOT NULL
       AND categoria IN ('produccion', 'pase_turno')
      THEN public.kos_fecha_iso(turno_fecha)
        || '::' || COALESCE(modo, 'carta')
        || '::' || lower(btrim(COALESCE(
             CASE WHEN COALESCE(modo, 'carta') = 'carta' THEN plaza ELSE seccion END, '')))
        || '::' || COALESCE(menu_id::text, '')
        || '::' || public.kos_normalizar_titulo(titulo)
      ELSE NULL
    END
  ) STORED;

-- 3. El candado. CONCURRENTLY no sirve dentro de una transacción ni justo
--    después del ALTER de arriba; si se prefiere minimizar el lock, correr el
--    paso 2 y el 3 en sesiones separadas y este con CONCURRENTLY.
CREATE UNIQUE INDEX IF NOT EXISTS tareas_una_preparacion_una_fila
  ON public.tareas (restaurante_id, clave_produccion)
  WHERE clave_produccion IS NOT NULL;

NOTIFY pgrst, 'reload schema';
