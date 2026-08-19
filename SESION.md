# Sesión — 2026-08-19 (Rutina de turno)

## Qué se cerró
- **Rutina de turno** — 4º tab de OPS (`/operaciones?tab=turno`): el papel de apertura/cierre que Bros tenía colgado, ahora tildable y editable. Tablas propias `rutina_turno_items` / `rutina_turno_registros`, hook `useRutinaTurno`, componentes en `components/rutina/`. Cargados los 28 pasos reales de Bros (13 apertura + 15 cierre).
- Decisión de fondo: **NO se metió en el tab "Rutina" del Mise**. `checklist_rutina` es limpieza por plaza con frecuencia y auditoría; esto es la secuencia horaria de la cocina entera. El propio papel lleva "checklist de plaza" como ítem adentro — envuelve al mise, no lo duplica.
- Hora **por turno** dentro del mismo ítem (`horas JSONB`): "bacha en cero" es una fila con `{almuerzo:'11:00', cena:'19:00'}`. Las zonas del cierre piden **responsable** del equipo (los ítems que en el papel terminaban en dos puntos), con `responsable_id` separado de `usuario_id`.
- Bug evitado: la primera versión resolvía jornada y turno por separado y abría en el turno equivocado entre 05:00 y 09:00. Se reusó `turnoVigente()` en vez del helper duplicado que se había empezado a escribir; `lib/ops/turnos.ts` quedó sin cambios funcionales.
- Cerrados de paso dos pendientes 🟢: `shot.mjs --base` (implementado, + cuenta `broscocina`) y el aviso en el JSDoc de `turnoActivo()` que manda a `turnoVigente` — el riesgo que ese ítem anticipaba se materializó en esta misma sesión.
- Commit `5c6e2f3`, pusheado, deploy en Vercel. Build limpio, 111/111 Vitest.

## Qué quedó a medias
- Nada del bloque — cerrado de punta a punta (código + RLS verificado con usuarios reales de dos restaurantes + prueba end-to-end en browser + docs).
- Encontrado y NO tocado (fuera de alcance): **`usePermisos` traga el error real** — loguea "Error al cargar permisos" genérico porque el `catch` asume `instanceof Error` y los errores de Supabase no lo son (`hooks.md` #2). Hay un error de verdad ocurriendo ahí y hoy es indiagnosticable. Anotado en 🟢.
- `npm run lint` sigue roto (instalación incompleta de `tsconfig-paths`, no dependencia ausente — reinstalar). No bloquea: el typecheck completo corre en `npm run build`.

## Probar primero mañana
- **El corte apertura/cierre, con el equipo de Bros.** Lo puse en "servicio y produs chicas", con "corta producción" ya del lado del cierre. Es la única decisión de la transcripción que no sale literal del papel — el original corre de un tirón y no marca dónde termina una fase.
- Los slots de responsable en el cierre real, con la tablet de cocina: que el selector de personas se alcance con el pulgar y que el nombre asignado se lea de un vistazo.
- El aviso ámbar de atraso ("«X» era 11:00") en servicio real: si aparece demasiado seguido pierde sentido, y el margen de gracia (10 min) es el número a mover.

## Próximo paso concreto
Seguir con `PLAN-4-CAPAS.md` — quedan **B6** (desempeño por persona) y **B7** (checklist de carta pre-servicio), independientes entre sí. B6 tiene ahora un insumo nuevo: `rutina_turno_registros.responsable_id` deja registrado quién se hizo cargo de cada zona del cierre, cruzable con el desempeño. B8 (Reservas) sigue siendo el punto de decisión: revisar el track de validación con Bros/Rescoldo antes de arrancarlo.
