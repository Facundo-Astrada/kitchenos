-- Pase de turno explícito — ago 2026
--
-- Hasta acá el turno vigente se deducía del reloj (lib/ops/turnos.ts:turnoActivo)
-- y el cierre "se cerraba solo": no había fila que dijera que hubo pase, se
-- infería de la ausencia de registros de cierre. El reloj adivina; la cocina
-- sabe. Esta tabla registra el hecho — tal plaza entregó tal turno de tal
-- jornada, con autor y hora — y es lo que activa el turno siguiente al momento.
--
-- El reloj no desaparece: queda como red de contención para la plaza que nunca
-- entrega (sin fila acá, la resolución cae de vuelta en el horario y el banner
-- "recibís sin cierre" hace su trabajo).
--
-- Granularidad: por PLAZA. Cada plaza entrega por su cuenta — que parrilla no
-- cierre no puede dejar a calientes esperando.

create table if not exists public.cierres_turno (
  id                uuid primary key default gen_random_uuid(),
  restaurante_id    uuid not null references public.restaurantes(id) on delete cascade,
  -- Jornada operativa (hoyOperativo), no fecha calendario: la cena que termina
  -- 01:30 entrega la jornada del día anterior.
  jornada           date not null,
  -- TurnoServicio.id ('almuerzo' | 'cena' | slug custom). TEXT y no FK: los
  -- turnos viven en restaurantes.configuracion.turnos_servicio (JSONB).
  turno_id          text not null,
  plaza             text not null,
  -- equipo_miembros.id como texto — misma convención que checklist_registros
  -- .usuario_id y checklist_auditorias.usuario_id.
  cerrado_por       text,
  cerrado_at        timestamptz not null default now(),
  -- Foto del momento de la entrega, para el reporte de auditoría: no se
  -- recalcula después (si alguien destilda un ítem mañana, la entrega sigue
  -- diciendo cómo estaba la plaza cuando se entregó).
  items_total       int,
  items_completados int,
  created_at        timestamptz not null default now()
);

-- Una entrega por plaza+turno+jornada. El upsert del hook usa este índice.
create unique index if not exists uq_cierres_turno
  on public.cierres_turno (restaurante_id, jornada, turno_id, plaza);

-- La pantalla pide siempre una ventana corta de jornadas (ayer y hoy).
create index if not exists idx_cierres_turno_jornada
  on public.cierres_turno (restaurante_id, jornada desc);

alter table public.cierres_turno enable row level security;

drop policy if exists "cierres_turno_select" on public.cierres_turno;
create policy "cierres_turno_select" on public.cierres_turno for select to authenticated
  using (restaurante_id = mi_restaurante_id());

drop policy if exists "cierres_turno_insert" on public.cierres_turno;
create policy "cierres_turno_insert" on public.cierres_turno for insert to authenticated
  with check (restaurante_id = mi_restaurante_id());

drop policy if exists "cierres_turno_update" on public.cierres_turno;
create policy "cierres_turno_update" on public.cierres_turno for update to authenticated
  using (restaurante_id = mi_restaurante_id())
  with check (restaurante_id = mi_restaurante_id());

-- Deshacer una entrega es borrar la fila (el turno vuelve a resolverse por reloj).
drop policy if exists "cierres_turno_delete" on public.cierres_turno;
create policy "cierres_turno_delete" on public.cierres_turno for delete to authenticated
  using (restaurante_id = mi_restaurante_id());

-- Realtime: la tablet de cocina tiene que ver el pase sin recargar.
do $$
begin
  alter publication supabase_realtime add table public.cierres_turno;
exception
  when duplicate_object then null;
end $$;

-- Sin esto el browser no ve la tabla (ver .claude/docs/hooks.md #1).
notify pgrst, 'reload schema';
