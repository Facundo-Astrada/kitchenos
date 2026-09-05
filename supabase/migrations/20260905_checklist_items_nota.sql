-- checklist_items.nota: anotación libre pegada al ítem del mise ("la trucha
-- está lista pero falta porcionarla, no llegamos"). Vive hasta que alguien la
-- borra — no expira con el turno, a diferencia de checklist_registros. La
-- lee el que entra al turno siguiente, en apertura, cierre y Modo Control por
-- igual.
--
-- checklist_items YA tiene una columna `observacion` (text, sin caller en el
-- repo, 173 filas y ninguna cargada) — no se reusa: era de otro flujo
-- (posiblemente el import legacy) y mezclarla con la nota de comunicación
-- diaria confundiría dos cosas distintas. Ver .claude/docs/columnas.md.
ALTER TABLE checklist_items
  ADD COLUMN IF NOT EXISTS nota text,
  ADD COLUMN IF NOT EXISTS nota_por text,
  ADD COLUMN IF NOT EXISTS nota_at timestamptz;

COMMENT ON COLUMN checklist_items.nota IS 'Anotación libre del cocinero sobre este ítem del mise, pegada hasta que alguien la borra. No confundir con observacion (columna legacy sin uso).';
COMMENT ON COLUMN checklist_items.nota_por IS 'Nombre visible de quien escribió la nota (no un id — lo que importa acá es que se lea, no resolver el miembro).';
COMMENT ON COLUMN checklist_items.nota_at IS 'Cuándo se escribió/actualizó la nota — para mostrar "hace 2 h" y que se note cuando está vieja.';

-- Sin esto, PostgREST sigue sirviendo el schema cacheado y el browser no ve
-- las columnas nuevas hasta que el pooler recicle solo (minutos después).
NOTIFY pgrst, 'reload schema';
