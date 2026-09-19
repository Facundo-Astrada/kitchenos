-- Quién le enseña a esta persona esta plaza (opción A de formación, 19/09/2026).
-- Null = se deduce: el/los referente(s) de la plaza (nivel 4). Se asigna explícito
-- solo cuando el chef quiere un padrino distinto al referente.
alter table public.competencias
  add column if not exists ensena_miembro_id uuid references public.equipo_miembros(id) on delete set null;
create index if not exists competencias_ensena_miembro_idx on public.competencias (ensena_miembro_id);
comment on column public.competencias.ensena_miembro_id is 'Quién le enseña esta plaza a esta persona. Null = el referente de la plaza (nivel 4), deducido.';
notify pgrst, 'reload schema';
