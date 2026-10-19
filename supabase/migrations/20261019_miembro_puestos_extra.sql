-- Una persona puede cubrir varios puestos (19/10/2026) — PLAN-ORGANIGRAMA-REUNION-2026-10.md § 4.1.
--
-- `puesto_id` sigue siendo el puesto PRINCIPAL (carta del Plantel, plaza_default,
-- costo, bienvenida). `puestos_extra` son los que además cubre: suman permisos,
-- avisos y aparecen como ocupante "también". Va en paralelo a `modulos_extra`;
-- no es tabla nueva.
--
-- Sin FK posible (es un array), así que un puesto borrado dejaría ids colgando:
-- el trigger de abajo los limpia. Corre con los permisos de quien borra el puesto:
-- la policy `equipo_miembros_update` (restaurante_id = mi_restaurante_id()) deja
-- pasar el UPDATE porque filtramos por el restaurante del puesto, que es el mismo.
-- Por eso NO es security definer.

ALTER TABLE public.equipo_miembros
  ADD COLUMN IF NOT EXISTS puestos_extra uuid[] NOT NULL DEFAULT '{}';

CREATE OR REPLACE FUNCTION public.limpiar_puestos_extra()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.equipo_miembros
     SET puestos_extra = array_remove(puestos_extra, OLD.id)
   WHERE restaurante_id = OLD.restaurante_id
     AND OLD.id = ANY (puestos_extra);
  RETURN OLD;
END;
$$;

-- Las funciones nuevas nacen ejecutables por PUBLIC; esta solo la usa el trigger.
REVOKE EXECUTE ON FUNCTION public.limpiar_puestos_extra() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS puestos_limpiar_extra ON public.puestos;
CREATE TRIGGER puestos_limpiar_extra
  BEFORE DELETE ON public.puestos
  FOR EACH ROW EXECUTE FUNCTION public.limpiar_puestos_extra();

NOTIFY pgrst, 'reload schema';
