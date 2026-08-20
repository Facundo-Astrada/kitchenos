-- Organigrama — multi-responsable (ago 2026)
--
-- Un área o una capa puede tener MÁS DE UNA persona respondiendo por ella —
-- varios chefs (caso real: Bros tiene 3), socios compartiendo Dirección. La
-- idea de que cada área tenga un responsable sigue en pie, pero se
-- interpreta como "alguien concreto responde, nunca queda en el aire", no
-- como "solo una persona puede". Reemplaza responsable_miembro_id (1) por
-- responsables (N) en areas y area_capas.

alter table public.areas add column if not exists responsables uuid[] not null default '{}';
update public.areas
  set responsables = array[responsable_miembro_id]
  where responsable_miembro_id is not null and responsables = '{}';
alter table public.areas drop column if exists responsable_miembro_id;

alter table public.area_capas add column if not exists responsables uuid[] not null default '{}';
update public.area_capas
  set responsables = array[responsable_miembro_id]
  where responsable_miembro_id is not null and responsables = '{}';
alter table public.area_capas drop column if exists responsable_miembro_id;

comment on column public.areas.responsables is 'Miembros responsables del área — puede haber más de uno (socios, co-chefs). Vacío = sin responsable.';
comment on column public.area_capas.responsables is 'Miembros responsables de esta capa — puede haber más de uno. Vacío = sin responsable (excepto "ejecutar", que se lee "todo el equipo").';

notify pgrst, 'reload schema';
