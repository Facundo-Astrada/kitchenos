# Sesión — 2026-09-03 — "Copiar pase" (WhatsApp → app) en Mise y Producción

Franco (Bros) tipea a mano en WhatsApp, todas las noches, el mismo mensaje que la app ya tiene en datos reales (pendientes del pase de turno, lo hecho, notas de plaza). Se construyó un botón que arma y comparte ese mensaje, con la decisión explícita de Facundo (B2): capturar las notas sueltas en el origen (`pase_mensajes`, bullets) en vez de imitar el WhatsApp con un textarea libre que la app nunca lee. 2 commits, pusheados y deployados (`Ready` en Vercel).

## Qué se cerró

- **`lib/ops/textoPase.ts`** (16 tests): función pura que arma el texto del pase — pendientes con código SP/P/REF/CHK, lo hecho, notas bajo "Ojo", firma con autor/hora. Nada inventado: todo sale de `tareas`/`pase_mensajes` reales.
- **Botón "Copiar pase"** (`CopiarPaseBoton.tsx` + `PaseSheet.tsx`): al lado de "Entregar plaza" en el cierre del Mise (visible antes y después de entregar), con Compartir (Web Share, directo a WhatsApp) y Copiar.
- **B2 — notas en bullets**: el campo libre de `EntregaPlazaSheet` ("¿algo que el turno siguiente deba saber?") reusa `NotasPlaza` en vez de un párrafo — un bullet a la vez, precargado con lo ya escrito en el turno. `cierres_turno.notas_servicio` quedó sin lector; se dejó de escribir.
- **También desde Producción**: al entrar en foco a una plaza (tocar el nombre de la columna) aparece el mismo botón, sin cerrar ni completar nada. `lib/ops/turnos.ts` ganó `resolverTurnoDePlaza()` (4 tests) para no duplicar el cálculo de jornada/turno vigente que el Mise ya hacía a mano.
- Docs actualizados: `ESTADO-ACTUAL.md` (fila Checklist/Mise + conteo de tests), `DECISIONES.md` §24, `hooks.md` (gotcha #19 suma la mención a `resolverTurnoDePlaza`).

## Qué quedó a medias

Nada a medio hacer — los dos entry points (Mise y Producción) están completos y deployados.

## Probar primero mañana

El entry point de Producción (foco de plaza) no se pudo probar en navegador hoy — la máquina se quedó sin RAM (Chromium headless crasheaba por memoria, confirmado con `GPU process exited unexpectedly`, no un bug de código) y no fue posible reintentar. Cubierto por tests + typecheck + build limpios, pero vale la pena que Facundo lo abra una vez en producción (Producción → tocar una plaza → ícono junto a "Ver todo el turno") antes de asumirlo probado en la práctica.

## Próximo paso concreto

Explícitamente para el final (pedido de Facundo, no se tocó hoy): **Producción "más fácil de ver"**. Falta definir qué es lo que molesta en concreto — el celular del cocinero, el jefe barriendo la cocina entera, o la tablet colgada son tres remedios distintos y dos (modo foco, El Muro) ya existen. Preguntar antes de tocar el board — ver `PENDIENTES.md` § Mise/pase de turno.
