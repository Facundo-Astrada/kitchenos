-- "Crítico" → "bajo mínimo" — oct 2026
--
-- productos_criticos_count contaba stock_actual <= stock_critico, con
-- stock_critico en 0 en casi todas las filas: contaba los productos en cero,
-- que en su mayoría son productos nunca contados (100 en El Rescoldo, donde el
-- problema real era 1). Se reemplaza por "bajo mínimo": solo alerta lo que
-- tiene mínimo cargado. Misma regla que lib/stock/alerta.ts.
--
-- Sin SECURITY DEFINER: corre como el usuario que llama, RLS de productos aplica.

create or replace function public.productos_bajo_minimo_count(p_restaurante_id uuid)
returns integer
language sql
stable
set search_path = public
as $$
  select count(*)::integer
  from productos
  where restaurante_id = p_restaurante_id
    and activo = true
    and not coalesce(fuera_de_uso, false)
    and coalesce(stock_minimo, 0) > 0
    and stock_actual <= stock_minimo
$$;

revoke execute on function public.productos_bajo_minimo_count(uuid) from public, anon;
grant execute on function public.productos_bajo_minimo_count(uuid) to authenticated;

-- La vieja la usaba solo el panel del Coach. Se borra después del deploy
-- (20261001b) para no dejar el contador en blanco durante el build.

notify pgrst, 'reload schema';
