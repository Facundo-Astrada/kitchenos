-- Notificaciones in-app — ago 2026
--
-- Alcance deliberadamente chico: solo in-app (campanita + feed), nada de
-- push/email/WhatsApp (decisión ya tomada, ver PENDIENTES.md).
--
-- usuario_id referencia auth.users, NO equipo_miembros — mismo patrón que
-- turnos_personal (ver .claude/docs/columnas.md): es lo único que RLS puede
-- comparar contra auth.uid() para que cada quien solo vea las suyas.

create table if not exists public.notificaciones (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  tipo text not null,
  titulo text not null,
  cuerpo text,
  -- Ruta relativa a la que navega el click (ej. '/turnos') — sin FK, es
  -- polimórfico igual que el resto de los links del proyecto.
  link text,
  leida boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_notificaciones_usuario
  on public.notificaciones (usuario_id, leida, created_at desc);
create index if not exists idx_notificaciones_restaurante
  on public.notificaciones (restaurante_id);

alter table public.notificaciones enable row level security;

drop policy if exists notificaciones_select on public.notificaciones;
drop policy if exists notificaciones_insert on public.notificaciones;
drop policy if exists notificaciones_update on public.notificaciones;
drop policy if exists notificaciones_delete on public.notificaciones;

create policy notificaciones_select on public.notificaciones
  for select using (restaurante_id = mi_restaurante_id() and usuario_id = auth.uid());

-- INSERT no puede exigir usuario_id = auth.uid(): quien crea la notificación
-- (ej. "te asignaron el turno") casi nunca es el destinatario. Se acota solo
-- al tenant — cualquier persona autenticada del restaurante puede notificar
-- a otra persona del mismo restaurante, nunca de otro.
create policy notificaciones_insert on public.notificaciones
  for insert with check (restaurante_id = mi_restaurante_id());

create policy notificaciones_update on public.notificaciones
  for update using (restaurante_id = mi_restaurante_id() and usuario_id = auth.uid())
  with check (restaurante_id = mi_restaurante_id() and usuario_id = auth.uid());

create policy notificaciones_delete on public.notificaciones
  for delete using (restaurante_id = mi_restaurante_id() and usuario_id = auth.uid());

alter publication supabase_realtime add table public.notificaciones;

notify pgrst, 'reload schema';
