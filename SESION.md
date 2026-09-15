# Sesión — 15/09/2026 (2)

## Qué se cerró
- **Modal centrado**: las 2 últimas copias a mano (`stock/ClientView.tsx`,
  `checklist/ClientView.tsx`) migradas a `components/ui/Modal.tsx`. Techos
  del ratchet bajados.
- **Onboarding — gate por persona, no por restaurante vacío**: nueva
  columna `equipo_miembros.onboarding_wizard_visto_at` (backfileada para
  todo el personal existente). Un cocinero invitado a un restaurante que
  ya opera ahora sí ve el wizard.
- **Bug real encontrado y arreglado**: `app/(app)/page.tsx` tenía el
  `redirect()` del gate adentro de un `try/catch` que se lo comía —
  ni el gate viejo (restaurante vacío) disparó nunca. El gate ahora vive
  fuera del `try`.
- Commits `d9dd83b`, `51debc2`, pusheados. Deploy a prod vía `git push`
  (typecheck+536 tests+build limpios antes de cada uno).

## Qué quedó a medias
Nada — las dos primeras sesiones del lote de 6 planificado cerraron
completas. Quedan 4 sesiones del lote: Coach (memoria persistida +
`agregar_componentes_menu`), notificaciones push, motor de rutinas
(Calendario F2), y Calendario F3/F4/F5 + Bitácora F2/F3.

## Probar primero mañana
- Confirmar en prod que un usuario nuevo invitado ve `/onboarding` en su
  primer login (el gate se verificó en dev, no contra Vercel).

## Próximo paso concreto
Sesión 3 del lote: **Coach — memoria persistida (`coach_conversaciones`)
+ `agregar_componentes_menu`** (tool nueva siguiendo el patrón exacto de
`crear_evento`, con el gotcha del CHECK constraint de
`coach_acciones.tool_name`). Detalle completo en el plan de la
conversación (Sesión 2 del lote de 6).
