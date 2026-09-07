-- Normaliza valores legacy de merma.motivo que no coinciden con el catálogo
-- actual MOTIVOS_MERMA (types/index.ts). Encontrados verificando la UI de
-- Merma (S6, sep 2026, Bloque 6): 10 registros en producción (El Rescoldo,
-- Bros, Origen) con motivos viejos caían al fallback genérico de
-- motivoInfo() — ícono "?" gris y la etiqueta cruda de la base en vez de un
-- nombre legible, en vez del ícono/color con sentido que tiene cada motivo
-- real del catálogo.
--
-- Mapeo (mismo sentido semántico, no hay motivo nuevo que agregar):
--   mal_estado         (4 filas) -> deterioro         ("Deterioro")
--   quema              (2 filas) -> error_coccion     ("Error cocción")
--   sobrante           (2 filas) -> sobro_servicio    ("Sobró")
--   error_preparacion  (2 filas) -> error_coccion     ("Error cocción" — el
--                                    catálogo no distingue preparación de
--                                    cocción, es el bucket más cercano)
--
-- Solo cambia la clasificación visible (ícono/label) — no toca cantidad,
-- costo, fecha ni producto de ningún registro.

UPDATE merma SET motivo = 'deterioro' WHERE motivo = 'mal_estado';
UPDATE merma SET motivo = 'error_coccion' WHERE motivo IN ('quema', 'error_preparacion');
UPDATE merma SET motivo = 'sobro_servicio' WHERE motivo = 'sobrante';

-- ================================================================
-- ROLLBACK (ejecutar solo si hace falta revertir — no se puede distinguir
-- qué filas de 'error_coccion' venían de 'quema' vs 'error_preparacion' vs
-- ya eran 'error_coccion' de origen, así que el rollback exacto no es
-- posible para ese caso; se deja documentado, no ejecutable de una):
-- UPDATE merma SET motivo = 'mal_estado' WHERE motivo = 'deterioro' AND ...;  (requiere ids guardados aparte)
-- ================================================================
