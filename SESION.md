# Sesión — 01/10/2026 (planificación: cerebro de la casa)

## Qué se cerró
- Investigación + página del asistente como "cerebro de la casa": https://claude.ai/artifact/GzWCqv3tPVmup2iL9r8caa
- `PLAN-ASISTENTE-2026-10.md`: §7 decisiones cerradas (HUD con tokens actuales, Centro para dueño/chef/compras, rutinas por admin/chef, acciones grandes solo borrador, Ficha editable por dueño/chef, lo aprendido se guarda preguntando) y §8 con fases C1-C4. Orden: F0 → F1 → F2 → C1 → C2 → C3 → F3 → F4-F5 → C4.
- VAPID cargado en Vercel y push activado en el celular de Facundo.

## Qué quedó a medias
- Sin commitear: prototipo `/centro` (8 archivos del Coach), `negocio.md`, `PENDIENTES.md`, este plan.
- Nombre del asistente: cambia y pasa a ser figura de marketing ("el cerebro de la cocina"); se decide con el nombre de la marca (sesión de Marketing, agente `kos-marketing`).
- Bros: Franco tiene que dejar vigente la descripción del puesto de Compras (destinatario de F2).

## Probar primero mañana
- Mandar un push de prueba (`crearNotificacion()` a Facundo) y ver que llegue al celular.

## Próximo paso concreto
- `/model sonnet` → F0: push de prueba, commitear `/centro`, unificar "crítico", corrida seca de `/api/cron/avisos`. Después F1 (popup + `/avisos`).
