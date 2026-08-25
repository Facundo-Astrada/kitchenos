-- Entrega de plaza como relevo, no solo checklist — ago 2026
--
-- cierres_turno hoy guarda inventario y metadata (items_total/completados,
-- quién, cuándo) pero nada sobre CÓMO salió el servicio. PLAN-JUEGO-CERCADO
-- F1 lo marca como el mejor momento del día para capturar esa lectura
-- (memoria fresca, atención de los dos turnos a la vez) — y la evidencia de
-- relevo clínico (protocolo SBAR, INVESTIGACION-DISENO-2026-08.md §8) confirma
-- que estructurarlo en vez de dejarlo informal sube la efectividad del
-- traspaso de forma medible.
--
-- Dos campos, ambos opcionales — no bloquean la entrega (DESIGN.md §10 /
-- elBulli: "querer controlarlo todo es la mejor manera de no controlar
-- nada"). Situación (items_total/completados) y Contexto (mermas, 86s) ya
-- existen o se derivan de otras tablas — lo único que hace falta pedirle a
-- una persona es la Lectura y la Recomendación:

alter table public.cierres_turno
  add column if not exists percepcion text
    check (percepcion is null or percepcion in ('bien', 'regular', 'complicado')),
  add column if not exists notas_servicio text;

comment on column public.cierres_turno.percepcion is
  'Lectura del que entrega — bien/regular/complicado. Misma escala de 3 niveles que food cost/stock (ver ui.md), no una nueva.';
comment on column public.cierres_turno.notas_servicio is
  'Qué debe saber el que entra el turno siguiente — texto libre, opcional.';

notify pgrst, 'reload schema';
