# Sesión — 2026-08-25 (PLAN-ACCESO-Y-USO, bloques B0.3 a B7)

## Qué se cerró
Lista de 9 observaciones de Facundo → auditadas contra código y base real → plan de 8 bloques (`PLAN-ACCESO-Y-USO-2026-08.md`), todos deployados. **Tres de los nueve puntos no eran lo reportado.**

- **B0.3 — "no se reconocen las fotos" era la app mintiendo, no la IA leyendo mal.** La cuenta de Anthropic quedó sin crédito y `/api/recetas/import` devolvía una receta inventada ("Lomo al Malbec") tras un `setTimeout(1500)` puesto para simular el procesamiento. Peor: `/api/facturas` y `/api/listas-precios` devolvían una factura/lista completas y falsas ante un 429/403. Ningún endpoint fabrica datos ya; `lib/ia/errores.ts` clasifica el fallo y dice el motivo real.
- **B1 — dos bugs apilados dejaban a todo no-admin fuera del dashboard.** (a) La invitación nunca escribía `equipo_miembros.auth_user_id`, así que `usePermisos` no encontraba el puesto (caso real: Valentino, Bros). (b) El seed de `rol_permisos` escribía `'inicio'` donde la ruta `/` pide `'home'`, y ninguna fila tenía `'operaciones'` → "Sin acceso a home". Migradas 38 filas en 9 restaurantes. De paso: la cascada de permisos estaba **duplicada** entre el hook cliente y la réplica del Coach, con los mismos dos bugs — extraída a `lib/permisos/resolver.ts`.
- **B2 — mise: tildado y seguía en "Te dejaron en producción".** Confirmado con filas reales (Bros, 23/08). El sync tilde→tarea exigía `turno_fecha === hoy` y perdía justo el `pase_turno` heredado. 5 tareas colgadas cerradas.
- **B3 — `ver_costos` configurable por puesto.** Al gatear aparecieron tres fugas: la ficha de receta mostraba todo el costeo **sin ningún gate**, el tab Ingeniería (ya en backlog), y las tools de **solo lectura** del Coach no pasaban por ningún gate — cualquiera podía preguntarle el gasto del mes o quién debe plata.
- **B4** — carta de bienvenida por puesto + tours automáticos por pantalla, con el "ya lo vi" en DB. **B5** — escalado visible (½/×2/×3) y foto en el alta; las dos ya existían, el problema era encontrarlas. **B6** — etapas en bloques al cargar una receta. **B7** — sidebar plegable (Ctrl+B) y pantalla completa en Producción.

Build + `tsc` limpios en cada bloque, 173/173 tests (38 nuevos). 5 migraciones aplicadas. Lint comparado por archivo tocado: cero errores nuevos.

## Qué quedó a medias
- **Nada del plan** — los 8 bloques cerraron. Lo único abierto es **B0.1/B0.2, que Facundo se reservó**: cargar crédito en Anthropic (toda la IA sigue caída) y verificar que la key de Vercel sea la misma de `.env.local`.
- **Los commits de B1 y B2 tienen `@` como línea de asunto** (usé sintaxis de heredoc de PowerShell en Bash). El cuerpo está intacto; limpiarlo requiere reescribir historia ya pusheada y redeployada — pendiente de que Facundo lo pida.
- De paso se reparó `npm run lint` (era un `node_modules/tsconfig-paths` incompleto). **Fix de máquina, no de repo**: un clon nuevo puede volver a pegarle.

## Probar primero mañana
Cinco de los siete bloques son UI y **ninguno se probó corriendo la app**. En orden de riesgo:
1. **Que Valentino entre** (`valentinocortesb@gmail.com`, Bros) — el caso que originó todo.
2. **El toggle "Ve costos y food cost"** en Turnos → Puestos, y el override por persona.
3. **La carta de bienvenida** — hace falta un usuario nuevo, solo aparece con `onboarding_visto_at` en null.
4. **Pantalla completa de Producción en la tablet real** — usa `zoom`; si el navegador es viejo, es lo primero a mirar.
5. **Alta de receta con 3 etapas**, de una sola pasada.

## Próximo paso concreto
`PLAN-ACCESO-Y-USO-2026-08.md` queda cerrado. El 🔴 crítico del backlog es **cargar el crédito de Anthropic** — hasta entonces la IA no se puede probar. Después, el 🟠 más próximo sigue siendo `PLAN-4-CAPAS.md` B9/B10 (Reservas), que dependen de correr el track de validación con Bros/Rescoldo. Alternativa de bajo costo y alto retorno: la lista de **ocho funciones ya construidas que nadie encuentra** (`PLAN-ACCESO-Y-USO` § B5.3) — Modo Control del mise y "Sugerir producción" son las de mejor relación valor/esfuerzo.
