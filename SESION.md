# Sesión — 17-18/09/2026

> Sesión de diseño, **sin código**. Todo lo de abajo son documentos.

## Qué se cerró
- **Plan completo de Descripción de puesto** (`PLAN-DESCRIPCION-PUESTO-2026-09.md`, 12 §).
  El hallazgo que lo ordena: los 3 ejemplos de Standard 69 son **tres objetos distintos**
  (la casa / el puesto / la partida), y K-OS ya tiene ~60% del documento cargado sin usarlo
  (referente de la plaza vía `competencias`, checklist por plaza, objetivos, uniforme).
  Cuestionario de 6 tandas, schema, recorrido de usuario y fases.
- **Dos investigaciones de Gemini Deep Research, pedidas, auditadas e incorporadas**
  (`INVESTIGACION-PUESTOS-METODOLOGIA-2026-09.md` y `-LEGAL-`). La 1ª refutó bien la
  hipótesis de las preguntas en negativo → se rehizo la tanda 5 con incidente crítico
  episódico + lista cerrada, y se dio vuelta el orden (el día antes que la misión).
- **Corrección de schema por hallazgo legal.** El acuse de lectura es **firma electrónica**
  (ley 25.506 arts. 5-6): si el trabajador la desconoce, la carga de la prueba cae en el
  empleador. El diseño original (`version int` contra una fila mutable) no sobrevivía una
  pericia — la versión firmada desaparecía al editar. Rehecho como versión inmutable con
  snapshot + hash y acuses append-only (§ 5.1.b).
- Los PDF de ejemplo de Standard 69 quedaron **gitignoreados**: son manuales internos de otra
  empresa, misma regla que el material de research de terceros.

## Qué quedó a medias
- Nada a medias de esta sesión: el plan está cerrado y esperando **una decisión de negocio**,
  no más trabajo de diseño.
- **Dos commits de mise (`44d3758`, `7fac7af`, 15-16/09) nunca se cerraron con `/update-status`.**
  No están reflejados en ningún `SESION.md`. Si hace falta el rationale, está en el diff.

## Probar primero mañana
- Nada que probar — no se tocó código.

## Próximo paso concreto
**Fase 0 del plan**, que es lo único no trabado por la moratoria: extender el export PDF de
Organigrama (`lib/exportPDF.ts:331`) con los 7 datos que ya están en la base. Cero schema,
2-3 h. El prompt de arranque para esa sesión está al final de la conversación del 18/09.

En paralelo, dos cosas que no son de código:
1. **Decidir la moratoria** — excepción nombrada tipo 013 en el `DECISIONES.md` de START UP
   KOS, o el plan no avanza más allá de la fase 0 (§ 9 del plan).
2. **Consulta a abogado laboral** antes de la fase 3. Las 5 preguntas ya están redactadas en
   `INVESTIGACION-PUESTOS-LEGAL-2026-09.md` § 2.

Sigue abierto de antes: el costeo de componentes sin costo por gramo en `ComposicionEditor`
(`PENDIENTES.md` 🟠) y las VAPID en Vercel (🟢).
