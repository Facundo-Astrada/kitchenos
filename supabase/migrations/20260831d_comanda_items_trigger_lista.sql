-- Día 3 del plan consolidado (invariantes a la base, 2/2): "todos los ítems
-- bumpeados ⇒ comanda lista" vivía solo en el cliente (`bumpItemsYRevisarComanda`
-- en useComandas.ts), que arma su propia copia local de `items`, chequea
-- `todosListos()` sobre esa copia, y si da true hace el UPDATE de `comandas`.
--
-- Con dos tablets de KDS bumpeando ítems distintos de la misma comanda casi
-- a la vez, cada una calcula `todosListos` sobre su propio cache SWR (stale):
-- ninguna ve los ítems que bumpeó la otra, así que ninguna concluye "están
-- todos" y la comanda queda colgada en 'en_prep' aunque en la DB ya estén
-- todos los ítems 'bumpeado'.
--
-- Este trigger mueve la decisión a la DB, donde se puede leer el estado real
-- (no una copia local) dentro de la misma transacción que hace el UPDATE del
-- ítem. Dispara solo cuando un ítem pasa A 'bumpeado' — el mismo evento que
-- hoy invoca `bumpItemsYRevisarComanda` en el cliente (avanzar un ítem a
-- 'listo' vía `avanzarItem` nunca lo hace: el KDS pide un tap explícito más
-- para bumpear, incluso para el último ítem — ver ItemRow.onTap en
-- app/(servicio)/kds/page.tsx). No se cambia esa semántica acá.
--
-- El `SELECT ... FOR UPDATE` sobre la fila de `comandas` serializa a las dos
-- tablets: la segunda transacción espera a que la primera termine (commit)
-- su UPDATE antes de re-evaluar `NOT EXISTS` con el estado ya actualizado,
-- en vez de que ambas lean "todavía falta uno" con datos viejos y ninguna
-- dispare la transición — el mismo patrón de "lock primero, verificar
-- después" que evita el problema, en vez del check-then-act que lo causaba
-- en el cliente.
--
-- SECURITY INVOKER (default explícito, igual que `reemplazar_menu_preparaciones`
-- en 20260831_reemplazar_menu_preparaciones.sql): corre con los permisos/RLS
-- del usuario que dispara el UPDATE de `comanda_items`, que ya tiene permiso
-- de UPDATE sobre `comandas` de su propio restaurante (policy
-- "comandas_update") — no hace falta bypass.
CREATE OR REPLACE FUNCTION public.actualizar_estado_comanda_por_bump()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  PERFORM 1 FROM public.comandas WHERE id = NEW.comanda_id FOR UPDATE;

  UPDATE public.comandas
  SET estado = 'lista'
  WHERE id = NEW.comanda_id
    AND estado = 'en_prep'
    AND NOT EXISTS (
      SELECT 1 FROM public.comanda_items
      WHERE comanda_id = NEW.comanda_id
        AND estado NOT IN ('listo', 'bumpeado')
    );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.actualizar_estado_comanda_por_bump() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_comanda_items_bump_actualiza_comanda ON public.comanda_items;
CREATE TRIGGER trg_comanda_items_bump_actualiza_comanda
  AFTER UPDATE OF estado ON public.comanda_items
  FOR EACH ROW
  WHEN (NEW.estado = 'bumpeado' AND OLD.estado IS DISTINCT FROM 'bumpeado')
  EXECUTE FUNCTION public.actualizar_estado_comanda_por_bump();

NOTIFY pgrst, 'reload schema';
