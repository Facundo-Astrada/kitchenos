# Sesión — 18/09/2026

## Qué se cerró
- **Decisión 014**: excepción a la moratoria (012) para el resto de `PLAN-DESCRIPCION-PUESTO-2026-09.md`, escrita en `DECISIONES.md` de START UP KOS antes de tocar código. Fase 3 queda afuera hasta la consulta legal.
- **Fases 0, 1, 2 y 4 (punto 2) de Descripción de puesto**, shippeadas y en prod: export PDF con lo que ya sabía la base, tabla `puesto_descripciones` + wizard de 6 tandas con dictado por voz y "Pulir con IA", Carta de la casa, modo rápido desde el segundo puesto, borrador de tareas con IA para puestos sin plantilla. Detalle completo en `HISTORIAL.md`.
- Corrección de proceso: se dejó de usar El Rescoldo para verificar (sin backfill de Organigrama desde jun 2026) — de acá en más, Bros.

## Qué quedó a medias
- Nada de código sin cerrar. Lo que falta es explícitamente ajeno a esta sesión: Fase 3 (bloqueada por consulta legal) y Fase 5 (diferida).
- **No se probó el flujo completo en el navegador** — sin credenciales de login de Bros. Se validó con build/lint limpios, RLS confirmada, y la lógica de agrupamiento contra datos reales de Bros vía SQL.

## Probar primero mañana
- Entrar a Bros, abrir un puesto en Organigrama → Puestos, correr las 6 tandas completas (probar el micrófono y "Pulir con IA"), y revisar la carilla completa del PDF.
- Probar "Carta de la casa" (botón nuevo en el header, ícono de libro) y confirmar que sale como página en el PDF.
- Probar el borrador de IA en un puesto sin plantilla (tanda 4, sin tareas sembradas).

## Próximo paso concreto
- Si el pase real en Bros sale bien: nada urgente — la función queda esperando adopción real (condición de salida de la 014: 2 semanas sin ninguna descripción `vigente` y se revierte). Si algo falla, es el primer lugar a mirar.
- La consulta al abogado laboral (5 preguntas ya redactadas en `INVESTIGACION-PUESTOS-LEGAL-2026-09.md` § 2) sigue siendo el paso de negocio pendiente antes de la Fase 3.
