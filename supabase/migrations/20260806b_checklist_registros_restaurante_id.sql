-- checklist_registros.restaurante_id — ago 2026
--
-- Motivo: sin esta columna no se puede suscribir la tabla a realtime, porque
-- todo canal del proyecto exige `filter: restaurante_id=eq.X` (ver
-- .claude/docs/hooks.md #18) y acá el tenant solo se podía deducir saltando a
-- checklist_items. Sin filtro, la tabla de más escrituras de la app (un tilde
-- por ítem, 40+ por plaza por turno) despertaría a todos los dispositivos de
-- todas las cuentas.
--
-- La llena un trigger, no el cliente. Dos razones:
--   1. Ningún writer tiene que cambiar — ni useChecklist, ni syncMise, ni las
--      API routes, ni el celular que quedó con el bundle viejo abierto durante
--      el servicio.
--   2. El valor es autoritativo: se deriva de checklist_items en el servidor y
--      se ignora lo que mande el cliente, así que no se puede escribir una fila
--      con el tenant de otro.
--
-- Las policies NO se tocan: siguen filtrando por el subquery a checklist_items,
-- que ya funciona. Cambiarlas a `restaurante_id = mi_restaurante_id()` sería
-- más barato de evaluar (importa en realtime, que chequea RLS por evento y por
-- suscriptor), pero con 425 filas no hace falta y el blast radius es el mise
-- entero de todas las cuentas. Queda como optimización disponible.

alter table public.checklist_registros
  add column if not exists restaurante_id uuid references public.restaurantes(id) on delete cascade;

-- Backfill. Verificado antes de correr: 0 filas huérfanas, así que ninguna
-- queda en NULL.
update public.checklist_registros r
set restaurante_id = i.restaurante_id
from public.checklist_items i
where i.id = r.checklist_item_id
  and r.restaurante_id is distinct from i.restaurante_id;

create or replace function public.checklist_registros_set_restaurante()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Siempre derivado, nunca lo que mandó el cliente.
  select restaurante_id into new.restaurante_id
  from checklist_items where id = new.checklist_item_id;
  return new;
end $$;

-- INSERT y UPDATE: el upsert con onConflict entra por la rama de UPDATE.
drop trigger if exists trg_checklist_registros_restaurante on public.checklist_registros;
create trigger trg_checklist_registros_restaurante
  before insert or update on public.checklist_registros
  for each row execute function public.checklist_registros_set_restaurante();

create index if not exists idx_checklist_registros_restaurante
  on public.checklist_registros (restaurante_id);

-- Sin esto el browser no ve la columna nueva (ver .claude/docs/hooks.md #1).
notify pgrst, 'reload schema';
