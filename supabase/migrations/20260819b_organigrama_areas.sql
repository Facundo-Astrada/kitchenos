-- Organigrama — Fase 1 (ago 2026)
--
-- Dos piezas nuevas sobre lo que ya existe (puestos, equipo_miembros):
--
-- 1. Jerarquía y pertenencia del PUESTO (no de la persona) — así el
--    organigrama sobrevive a la rotación: se va el parrillero, entra otro,
--    la estructura no se toca.
--
-- 2. `areas`: catálogo propio de 12 funciones organizacionales (dirección,
--    cocina, salón, compras, calidad/seguridad alimentaria, administración,
--    comercial, RRHH, desarrollo de producto, sistemas, marketing,
--    infraestructura), por restaurante. El catálogo completo vive en código
--    (AREA_CATALOGO en constants.ts) — esta tabla guarda solo el estado por
--    cuenta: activa o no, quién responde, y el orden. Un negocio chico no
--    tiene departamentos formales, pero las funciones existen igual y las
--    cubre menos gente — por eso un área puede existir inactiva, nunca se
--    borra del catálogo.

-- ── puestos: jerarquía + pertenencia a un área ──────────────────────────────
alter table public.puestos
  add column if not exists reporta_a_puesto_id uuid references public.puestos(id) on delete set null,
  add column if not exists area_key text,
  add column if not exists orden int not null default 0;

create index if not exists idx_puestos_reporta_a on public.puestos (reporta_a_puesto_id);
create index if not exists idx_puestos_area on public.puestos (restaurante_id, area_key);

comment on column public.puestos.reporta_a_puesto_id is 'Puesto al que reporta este puesto (jerarquía del organigrama). NULL = raíz.';
comment on column public.puestos.area_key is 'Clave del área del catálogo (AREA_CATALOGO en lib/constants.ts) a la que pertenece este puesto.';
comment on column public.puestos.orden is 'Orden manual dentro del área, para el drag de reordenar.';

-- ── areas: estado por restaurante del catálogo de 12 áreas ──────────────────
create table if not exists public.areas (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  area_key text not null,
  activa boolean not null default false,
  responsable_miembro_id uuid references public.equipo_miembros(id) on delete set null,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  unique (restaurante_id, area_key)
);

create index if not exists idx_areas_restaurante on public.areas (restaurante_id);

comment on table public.areas is 'Estado por restaurante del catálogo fijo de 12 áreas (AREA_CATALOGO en constants.ts). Una fila ausente = área nunca configurada (se trata como inactiva).';
comment on column public.areas.area_key is 'Clave del catálogo fijo: direccion | cocina | salon | compras_almacen | calidad_seguridad | administracion | comercial_reservas | rrhh | id_producto | sistemas | marketing | infraestructura.';
comment on column public.areas.responsable_miembro_id is 'Responsable del área. NULL = sin dueño — el hueco que la Vista Cobertura muestra en rojo. (Columna reemplazada por "responsables" uuid[] en 20260819d — puede haber más de un responsable.)';

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.areas enable row level security;

drop policy if exists areas_select on public.areas;
drop policy if exists areas_insert on public.areas;
drop policy if exists areas_update on public.areas;
drop policy if exists areas_delete on public.areas;

create policy areas_select on public.areas
  for select using (restaurante_id = mi_restaurante_id());
create policy areas_insert on public.areas
  for insert with check (restaurante_id = mi_restaurante_id());
create policy areas_update on public.areas
  for update using (restaurante_id = mi_restaurante_id())
  with check (restaurante_id = mi_restaurante_id());
create policy areas_delete on public.areas
  for delete using (restaurante_id = mi_restaurante_id());

-- Sin esto el browser no ve la tabla nueva (ver .claude/docs/hooks.md #1).
notify pgrst, 'reload schema';
