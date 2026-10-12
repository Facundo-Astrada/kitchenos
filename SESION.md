# Sesión — 12/10/2026 (Turnos: planilla rediseñada)

## Qué se cerró
- `/turnos` rehecho con el mismo repaso que Calendario (commit `653c3e3`, deployado): grilla marcada, pincel con arrastre y deshacer, banda Agenda del Calendario, panel del día con notas compartidas, cobertura, KPIs, "Para revisar", horarios habituales configurables, «Avisar al equipo» semanal, vista de celular.
- Lógica a `lib/turnos/` (16 tests) + `useTurnos`; `NotasDia` compartido con Calendario.

## Qué quedó a medias
- Sin probar: la vista de quien no administra con una cuenta real, y un aviso real llegando a otra persona.
- "Ya avisado" vive en el browser (otro dispositivo vuelve a ofrecer avisar a todos).
- De antes, sin tocar: ~780 ingredientes en $0 en recetas de Bros (ver PENDIENTES 🟠) y el ratchet de `checklist/ClientView.tsx`.

## Probar primero mañana
- Bros, `/turnos`: fijar Horarios habituales, pintar la semana real (mouse y celular), anotar algo en un día y verlo en Calendario, mandar un «Avisar al equipo».

## Próximo paso concreto
- Feedback visual en batch sobre Turnos (4-5 puntos en un mensaje); si no hay, volver a los mapeos genéricos de recetas de Bros (Sal→Sal fina, Manteca→pilones, Limón).
