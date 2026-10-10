# Sesión — 10/10/2026 (Calendario: rediseño, privado, Coach que agenda, avisos)

## Qué se cerró
- Calendario rediseñado: vistas Mes/Semana/Agenda, capas que se llenan solas (menús, entregas, reservas, pagos, feriados), repetición real (semanal en varios días, mensual "el 2º domingo"), deshacer, .ics. Pantalla partida en `components/calendario/` + `lib/calendario/`.
- Eventos privados ("solo para mí", RLS verificada con dos usuarios) + autor en el detalle.
- Coach: `agendar_eventos` — una lista de notas queda como un evento por línea (probado con las notas reales de planificación).
- "Avisar al equipo" (todos / puestos / personas → campana + push, una vez por evento).

## Qué quedó a medias
- Nunca se vio llegar un aviso real: en la demo nadie más tiene usuario.
- Recordatorio del día anterior (segunda etapa acordada). Ratchet de `checklist/ClientView.tsx` sobre su techo (de antes).

## Probar primero mañana
- Bros: evento con "Avisar al equipo" → Personas → una persona de confianza; que le llegue a la campana (y al celular si tiene push).
- Bros: pegarle al Coach notas de planificación con "cargá esto en el calendario y avisale a cocina".

## Próximo paso concreto
- Recetas de Bros con costo incompleto: 705 ingredientes a productos desactivados, 657 a productos $0 → revincular al producto activo con precio (dry-run + respaldo). Sigue siendo lo más importante del backlog.
