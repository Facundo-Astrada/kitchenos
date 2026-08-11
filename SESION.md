# Sesión — 2026-08-11

Tema: research externo de KitchenOS (Cowork) + estructura de "Departamento de Ingeniería" + limpieza de lo que salió de ahí. 2 commits (`e30d76f`, `b515e08`), en producción.

## Qué se cerró
- **Departamento de Ingeniería**: `CLAUDE.md` unifica las tablas viejas de skills/agentes en una sola sección de 10 categorías. Cerró los 2 huecos reales que no tenían dueño: Pruebas (`.claude/docs/testing.md`) y Monitoreo (skill `/prod-status`).
- **Investigación de KitchenOS en Cowork** (3 entregables: qué hace la app y qué sabe de cocina, patrón "startup corrida por Claude", skills útiles en GitHub) — verificados punto por punto, no tomados al pie de la letra. De esa verificación:
  - 6 skills oficiales instaladas: `supabase`, `supabase-postgres-best-practices`, `vercel-composition-patterns`, `vercel-react-best-practices`, `vercel-optimize`, `web-design-guidelines`.
  - 2 bugs reales confirmados y arreglados: fecha de HACCP calculada en UTC (mostraba el día siguiente de noche, PDF a Bromatología incluido) y Reprecio sugiriendo precios absurdos cuando una receta tiene datos rotos (porciones mal cargadas → FC de cientos de miles de %). Ambos con guard nuevo (`fechaEnTz` en HACCP, techo de 200% en Reprecio).
- **Higiene de docs**: `ESTADO-ACTUAL.md` (Compras no Facturas, Limpieza y Mantenimiento no HACCP, 11 tabs de Reportes no 10, sumado el módulo Clientes que faltaba, Ingeniería de menú marcada "movida a Carta→Rentabilidad" no "eliminada"), `DECISIONES.md` §4 corregida (el salón existe y es funcional, la decisión de "no hay modo servicio" se revirtió hace rato y nunca quedó registrado), `hooks.md` #19 refinada (`fechaEnTz` vs `hoyOperativo` son dos conceptos de "hoy" distintos, no intercambiables).
- Borrados 5 archivos sueltos en la raíz arrastrados desde julio — debris de paquetes npm, confirmado que no los usaba nada.
- Se evaluó armar una rama "Finanzas" de estructura organizativa — se descubrió que ya existe (bot de Telegram + dashboard de `ORGANIZACION FACU/whatsapp-inbox`, en producción, con saldos reales). Se dejó plan escrito en `docs/PLAN-FACTURACION-ESTUDIO.md` de esa carpeta para una sesión aparte, ahí, no en KitchenOS.

## Qué quedó a medias
- Los 2 fixes de código (HACCP, Reprecio) solo se verificaron con `tsc --noEmit`, no a ojo en el navegador.
- `ARQUITECTURA.md` sigue desactualizado (dice 28 tablas y 19 hooks; son 44+ y 49) — documentado en `PENDIENTES.md` 🟠, no tocado: es un parche que no alcanza, necesita regenerarse entero.
- Del research de Cowork, 3 cosas quedaron en manos de Facundo, no de código: rotar la contraseña de Franco (viajó en texto plano a un prompt), sentarse con él por los datos rotos del recetario de Bros (261 recetas sin costeo, 333 sin precio, 3 con porciones imposibles), y cargar los 3 costos de infra de KitchenOS (Anthropic/Vercel/Supabase) en la Sheet de Finanzas.

## Probar primero mañana
Entrar a `/haccp` de noche (después de las ~21h) y confirmar que la fecha en pantalla y en el PDF exportado es la de hoy, no la de mañana. En Carta → Rentabilidad → Reprecio, confirmar que aparece el aviso rojo si hay platos con FC > 200%.

## Próximo paso concreto
El 🔴 de siempre no se tocó esta sesión: colgar `/muro` en la tablet de la cocina. Si se prefiere seguir con lo de hoy: `ARQUITECTURA.md` para regenerar, o abrir sesión nueva en `whatsapp-inbox/` para la facturación de estudio (plan ya escrito ahí).
