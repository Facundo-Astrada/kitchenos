-- Vigencia de menús + vínculo menú↔mise (PLAN-MENUS-MISE-2026-08.md, Fase 0)
-- Permite que un menú/evento entre al Mise (checklist_items) con SP/P/REF/OK
-- y apertura/cierre, visible solo mientras esté vigente.

alter table menus
  add column if not exists vigencia_desde date,
  add column if not exists vigencia_hasta date;

-- Backfill: los eventos existentes ya tienen su fecha
update menus set vigencia_desde = fecha_evento, vigencia_hasta = fecha_evento
where fecha_evento is not null and vigencia_desde is null;

alter table checklist_items
  add column if not exists menu_id uuid references menus(id) on delete cascade;

create index if not exists idx_checklist_items_menu
  on checklist_items(menu_id) where menu_id is not null;

notify pgrst, 'reload schema';
