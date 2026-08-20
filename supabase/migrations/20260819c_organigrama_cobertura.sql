-- Organigrama — Fase 2: Vista Cobertura (ago 2026)
--
-- Responsable por (área, capa) — capas del ciclo Definir/Preparar/Ejecutar/
-- Controlar (framework propio, ver PLAN-4-CAPAS.md / AUDITORIA-4-CAPAS.md).
-- Una fila ausente significa "sin responsable asignado para esa capa" — la
-- Vista Cobertura lo pinta en rojo, EXCEPTO la capa "ejecutar": el servicio
-- se sostiene entre todo el turno, no lo lleva una sola persona, así que
-- ausente ahí se lee "todo el equipo", no un hueco. Definir/Preparar/
-- Controlar sí necesitan que alguien concreto responda.

create table if not exists public.area_capas (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  area_key text not null,
  capa text not null check (capa in ('definir', 'preparar', 'ejecutar', 'controlar')),
  responsable_miembro_id uuid references public.equipo_miembros(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (restaurante_id, area_key, capa)
);

create index if not exists idx_area_capas_restaurante on public.area_capas (restaurante_id);

comment on table public.area_capas is 'Responsable por área y capa del ciclo Definir/Preparar/Ejecutar/Controlar. Fila ausente = sin responsable — rojo en Vista Cobertura, salvo "ejecutar" (default: todo el equipo).';
comment on column public.area_capas.capa is 'definir | preparar | ejecutar | controlar — ver PLAN-4-CAPAS.md';

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.area_capas enable row level security;

drop policy if exists area_capas_select on public.area_capas;
drop policy if exists area_capas_insert on public.area_capas;
drop policy if exists area_capas_update on public.area_capas;
drop policy if exists area_capas_delete on public.area_capas;

create policy area_capas_select on public.area_capas
  for select using (restaurante_id = mi_restaurante_id());
create policy area_capas_insert on public.area_capas
  for insert with check (restaurante_id = mi_restaurante_id());
create policy area_capas_update on public.area_capas
  for update using (restaurante_id = mi_restaurante_id())
  with check (restaurante_id = mi_restaurante_id());
create policy area_capas_delete on public.area_capas
  for delete using (restaurante_id = mi_restaurante_id());

notify pgrst, 'reload schema';
