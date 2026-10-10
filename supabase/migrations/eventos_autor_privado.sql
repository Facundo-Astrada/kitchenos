-- Calendario: quién creó cada evento + eventos "solo para mí" (oct 2026).
--
-- creado_por: lo pone la base (DEFAULT auth.uid()), no el cliente — así el
--   Coach (cliente server con la sesión del usuario) y la pantalla quedan
--   firmados igual sin pasar el id a mano. Los eventos viejos quedan en NULL
--   (autor desconocido) y públicos.
-- privado: solo lo ve, edita y borra quien lo creó. Lo filtra la RLS, así que
--   vale para TODO lector con la sesión del usuario (pantalla, realtime, Coach).
--   Las superficies de equipo (line-up, banner de OPS, sugerencia de
--   producción) además filtran privado = false en la query: un evento privado
--   del chef no tiene que salir en la hoja que se imprime para la cocina.
--
-- Idempotente: se puede correr dos veces.

ALTER TABLE eventos ADD COLUMN IF NOT EXISTS creado_por uuid DEFAULT auth.uid();
ALTER TABLE eventos ADD COLUMN IF NOT EXISTS privado boolean NOT NULL DEFAULT false;

DROP POLICY IF EXISTS eventos_select ON eventos;
DROP POLICY IF EXISTS eventos_insert ON eventos;
DROP POLICY IF EXISTS eventos_update ON eventos;
DROP POLICY IF EXISTS eventos_delete ON eventos;

CREATE POLICY eventos_select ON eventos FOR SELECT TO authenticated
  USING (restaurante_id = mi_restaurante_id() AND (privado = false OR creado_por = auth.uid()));

-- Un privado tiene que quedar a nombre de quien lo crea (no se puede crear
-- uno "privado de otro").
CREATE POLICY eventos_insert ON eventos FOR INSERT TO authenticated
  WITH CHECK (restaurante_id = mi_restaurante_id() AND (privado = false OR creado_por = auth.uid()));

CREATE POLICY eventos_update ON eventos FOR UPDATE TO authenticated
  USING (restaurante_id = mi_restaurante_id() AND (privado = false OR creado_por = auth.uid()))
  WITH CHECK (restaurante_id = mi_restaurante_id() AND (privado = false OR creado_por = auth.uid()));

CREATE POLICY eventos_delete ON eventos FOR DELETE TO authenticated
  USING (restaurante_id = mi_restaurante_id() AND (privado = false OR creado_por = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_eventos_restaurante_fecha ON eventos(restaurante_id, fecha_inicio);

NOTIFY pgrst, 'reload schema';
