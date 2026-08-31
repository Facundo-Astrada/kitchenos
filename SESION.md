# Sesión — 2026-08-31 — Investigación de ingeniería, núcleo 1/3: arquitectura de aplicación

## Qué se cerró

Sesión de investigación (sin código de producción). Se abrió la cuarta fuente de
conocimiento del proyecto — disciplina de ingeniería de software — con dos docs nuevos:

- `.claude/docs/ingenieria/arquitectura-marco.md` — el marco agnóstico: Hexagonal/Clean/Onion
  (qué comprar: puertos + regla de dependencia; qué no: las capas), patrones PoEAA
  traducidos al stack (el hook = Table Data Gateway + adaptador React; la firma de
  repositorio `(supabase, restauranteId, input)`), connascence completa con tablas de
  decisión, SOLID solo donde suma sobre GRASP (ISP→hooks lite, DIP→frontera `'use client'`).
- `.claude/docs/ingenieria/arquitectura-kos.md` — KitchenOS medido contra el marco:
  veredictos con evidencia por línea, correcciones al informe GRASP, reclasificación
  connascence, deuda deliberada vs accidental, 7 acciones priorizadas.
- Fila nueva en la tabla "Docs condicionales" de `CLAUDE.md`; acciones volcadas a
  `PENDIENTES.md` (1×🔴 nueva arriba de todo, 3×🟠, 2×🟡, 1×🟢).

Hallazgos que corrigen al informe GRASP: el adaptador de IA está a MEDIO construir
(`lib/ia/errores.ts` existe, 7/12 rutas lo usan); `ProveedorFiscal` (`lib/fiscal/index.ts`)
es un puerto hexagonal ya terminado; el censo de hooks es 59 (39 SWR + 20 no, y solo 4
de los 20 son deuda). Hallazgos nuevos: 3 hooks violan el gotcha #20 del propio
`hooks.md` (`useFacturas:48`, `usePase:18`, `useReportes:136`); `crearFactura` = 235
líneas multi-tabla en el browser sin transacción; el agujero de `merma-auto` tiene
cómplice cliente (`useCuenta:115` manda `restaurante_id`) — el fix es de a dos.

## Qué quedó a medias

- Nada de esta sesión. Los docs quedaron completos. Sin commitear todavía.

## Probar primero mañana

- Nada que probar (no hubo código). Si se commitea, `npm run build` de rutina.

## Próximo paso concreto

1. **Commitear los docs de esta sesión** (`.claude/docs/ingenieria/`, CLAUDE.md, PENDIENTES.md, SESION.md).
2. **El 🔴 nuevo de PENDIENTES**: cerrar los 3 endpoints sin auth + sacar `restaurante_id`
   del body en `useCuenta` — 2-3 h, detalle en `arquitectura-kos.md` §7.1.
3. Núcleos 2 y 3 de la investigación de ingeniería quedan pendientes (sesiones propias,
   ver `PROMPT-INVESTIGACION-INGENIERIA.md`).
