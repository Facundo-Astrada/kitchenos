-- Plaza de control para menus (PLAN-MENUS-MISE-2026-08.md, adenda)
-- Cuando esta esta cargada, sincronizarMiseDeMenu manda TODAS las
-- preparaciones a esta plaza al activar, sin importar la plaza individual
-- que tenga cada una en menu_preparaciones. Pensado para una plaza que no
-- existe fisicamente (custom, creada en Configuracion) donde una sola
-- persona controla el menu entero en vez de repartirlo por estacion.

alter table menus
  add column if not exists plaza_control text null;

notify pgrst, 'reload schema';
