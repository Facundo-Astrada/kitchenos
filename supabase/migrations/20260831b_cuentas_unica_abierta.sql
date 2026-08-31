-- Día 2 del plan consolidado (invariantes a la base, 2/2): abrirCuenta hacía
-- SELECT (¿hay cuenta abierta para esta mesa?) y, si no había, INSERT — dos
-- round-trips separados. Dos aperturas concurrentes (doble tap, dos
-- dispositivos en la misma mesa) podían pasar el SELECT las dos antes de que
-- cualquiera inserte, y terminar con dos cuentas 'abierta' para la misma
-- mesa (ítems repartidos entre las dos, total roto).
--
-- Candado a nivel DB: única cuenta 'abierta' por mesa. El INSERT que pierde
-- la carrera falla con 23505 (unique_violation) en vez de crear el
-- duplicado; el hook lo captura y reusa la cuenta ganadora.
CREATE UNIQUE INDEX IF NOT EXISTS cuentas_mesa_abierta_unica
  ON public.cuentas (mesa_id)
  WHERE estado = 'abierta';
