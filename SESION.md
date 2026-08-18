# Sesión — 2026-08-18 (noche, PLAN-4-CAPAS bloque B3)

## Qué se cerró
- **PLAN-4-CAPAS bloque B3** — `proveedores.horario_entrega` (nuevo) y tabla `proveedor_incidencias` (faltante/calidad/fuera_de_horario/precio/devolucion) con RLS. La `faltante` se auto-crea sin fricción en `usePedidos.recibirPedido` cuando llega menos de lo pedido; el resto se carga a mano desde `/proveedores`, que ahora muestra por proveedor un resumen de 90 días en hechos, sin score. `reset_demo_restaurante()` actualizada y corrida en vivo. Verificado con Playwright contra el dev server real. `npm run build`/`npm test` (98/98) verdes. Commit `01b6b9d`, pusheado.
- **Desvío documentado, no ejecutado a ciegas**: el plan pedía `dias_entrega` como `INT[]` ISO 1-7, pero esa columna ya existía en prod como `text[]` de días con datos reales — no se migró (limpieza fuera de alcance, sin consumidor todavía). Queda anotado en `PLAN-4-CAPAS.md` bloques 3 y 10 para cuando se llegue ahí.

## Qué quedó a medias
- Nada de B3. Resto del plan (B4 a B10) sigue abierto.
- De la sesión de B2 (sin confirmar todavía): badge "Alto" en Stock con un producto real, y si los 12 % de merma precargada en El Rescoldo tienen sentido para alguien que conoce la carta.

## Probar primero mañana
- Recibir un pedido incompleto real (Bros o Rescoldo) y confirmar que la incidencia "faltante" aparece sola en `/proveedores` sin que nadie la cargue a mano.

## Próximo paso concreto
Seguir con `PLAN-4-CAPAS.md` — B4 (presupuesto por familias), B6 (desempeño por persona) o B7 (checklist de carta pre-servicio) son independientes entre sí, cualquiera sirve. B5 espera a que uno de estos esté listo para evaluar si conviene ir primero por ahí.
