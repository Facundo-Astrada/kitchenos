# Sesión — 2026-08-18 (PLAN-4-CAPAS bloque B4)

## Qué se cerró
- **Presupuesto por familias de gasto** (Reportes → Presupuesto): pasó de un monto total editable por período a una tabla mensual de 4 familias (Materia prima 30%, Personal 33%, Alquiler 5%, Gastos generales 17%) con real %, desvío en puntos y en plata, más EBITDA calculado (objetivo 15%). Botón "Usar estructura estándar" reparte la facturación del mes anterior en esa estructura.
- `categorias_gasto.categoria_financiera` pasó de 3 a 5 valores (suma `rrhh` y `alquiler`, antes escondidas en operacional/administrativo) — ya aparecen como opciones nuevas en Compras → Cat. de Gastos.
- Migración `presupuestos`: columna `familia` + UNIQUE`(restaurante_id,periodo,familia)`. Filas legacy (`familia=NULL`) quedan en la tabla sin usarse — documentado en `columnas.md`. `reset_demo_restaurante()` actualizada para clonar la columna nueva.
- Commit `0fa3045`, pusheado, deploy verde en Vercel. `npm run build` limpio, 98/98 tests Vitest.

## Qué quedó a medias
- Nada de este bloque — cerrado de punta a punta (migración + código + build + docs).
- Gap preexistente detectado pero **fuera de alcance de B4**: `categorias_gasto` no está en `reset_demo_restaurante()` (no se creó en este plan, viene de julio). Si se toca esa función de nuevo, sumarla.

## Probar primero mañana
- Entrar a Reportes → Presupuesto en Bros o Rescoldo, tocar "Usar estructura estándar" y confirmar que reparte bien contra la facturación real.
- Compras → Cat. de Gastos: crear/editar una categoría y confirmar que "Personal (RR.HH.)" y "Alquiler" aparecen en el selector.

## Próximo paso concreto
Seguir con `PLAN-4-CAPAS.md` (B6 o B7, independientes entre sí) o B5 (detección de fuga, depende de B2 que ya está cerrado).
