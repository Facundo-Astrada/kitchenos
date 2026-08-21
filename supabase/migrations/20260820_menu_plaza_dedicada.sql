-- MENU deja de usar 'general' como plaza de control (PLAN-MENUS-MISE-2026-08,
-- adenda 2026-08-20). 'general' es una plaza especial: se inyecta en TODAS
-- las demas plazas del mise (ver menuItemVisible / el filtro de ClientView),
-- asi que cada preparacion de un menu con plaza_control='general' aparecia
-- duplicada en Parrilla, Frios, Calientes, Pasteleria y Panaderia a la vez, y
-- la seccion "Estacion" quedaba visible como card vacia en toda plaza real.
-- 'menu' es una plaza dedicada y sin ese derrame: solo se ve al elegir MENU.

update checklist_secciones set plaza = 'menu'
where plaza = 'general'
  and id in (select distinct seccion_id from checklist_items where menu_id is not null and seccion_id is not null);

update checklist_items set plaza = 'menu'
where menu_id is not null and plaza = 'general';

update menus set plaza_control = 'menu'
where plaza_control = 'general';

-- Paso del menu (Apetizer/Proteina/Pasta/...) para que un item despachado
-- desde el mise a Produccion caiga en la columna real del plan en vez de
-- forzar 'general' (ver handleCrearTarea en checklist/ClientView.tsx) y
-- duplicar la columna que ya crea activarMenuParaFechas.
alter table checklist_items
  add column if not exists menu_paso text null;

update checklist_items ci set menu_paso = mp.paso
from menu_preparaciones mp
where ci.menu_id = mp.menu_id
  and ci.menu_id is not null
  and ci.menu_paso is null
  and ci.nombre = mp.nombre;

notify pgrst, 'reload schema';
