-- Notificaciones push web — sep 2026 (sesión 4 del lote de ingeniería)
--
-- Extiende el in-app (ver 20260827b_notificaciones.sql) para llegar a quien
-- no tiene la app abierta. Una fila = una suscripción de un navegador/dispositivo
-- concreto (un usuario logueado en el celu Y la compu tiene 2 filas).
--
-- usuario_id referencia auth.users, mismo patrón que notificaciones.

create table if not exists public.push_subscripciones (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists idx_push_subscripciones_usuario
  on public.push_subscripciones (restaurante_id, usuario_id);

alter table public.push_subscripciones enable row level security;

drop policy if exists push_subscripciones_select on public.push_subscripciones;
drop policy if exists push_subscripciones_insert on public.push_subscripciones;
drop policy if exists push_subscripciones_update on public.push_subscripciones;
drop policy if exists push_subscripciones_delete on public.push_subscripciones;

-- Acá sí usuario_id = auth.uid() en el insert: a diferencia de notificaciones
-- (donde el creador casi nunca es el destinatario), quien se suscribe es
-- siempre quien va a recibir el push.
create policy push_subscripciones_select on public.push_subscripciones
  for select using (restaurante_id = mi_restaurante_id() and usuario_id = auth.uid());

create policy push_subscripciones_insert on public.push_subscripciones
  for insert with check (restaurante_id = mi_restaurante_id() and usuario_id = auth.uid());

-- UPDATE hace falta además de INSERT: el upsert onConflict(endpoint) desde
-- /api/push/subscribe corre como INSERT ... ON CONFLICT DO UPDATE cuando el
-- mismo endpoint ya existe (resuscribirse en el mismo dispositivo).
create policy push_subscripciones_update on public.push_subscripciones
  for update using (restaurante_id = mi_restaurante_id() and usuario_id = auth.uid())
  with check (restaurante_id = mi_restaurante_id() and usuario_id = auth.uid());

create policy push_subscripciones_delete on public.push_subscripciones
  for delete using (restaurante_id = mi_restaurante_id() and usuario_id = auth.uid());

notify pgrst, 'reload schema';
