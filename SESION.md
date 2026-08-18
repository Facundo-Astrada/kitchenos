# Sesión — 2026-08-18 (PLAN-4-CAPAS bloque B5)

## Qué se cerró
- **Detección de fuga de inventario** (Reportes → tab Fuga, nuevo): por producto, compara consumo teórico (ventas × ficha técnica) contra compras del período y merma declarada, con tolerancia de `merma_esperada_pct`. Platos sin receta vinculada quedan aparte en "No se puede calcular".
- Dos desvíos del texto original del plan, verificados contra datos reales antes de cerrar (documentados en `lib/reportes/fuga.ts` y en `PLAN-4-CAPAS.md` bloque 5): `consumo_real` usa compras del período (no hay historial de stock, mismo criterio que el CMV existente); compras y merma matchean por nombre normalizado con fallback, porque `factura_items.producto_id`/`merma.producto_id` casi nunca están poblados en producción (~1%).
- Se extrajo `lib/reportes/consumoTeorico.ts` (con test) — sacó la duplicación de matching ventas↔carta_items que vivía en `ventas/page.tsx` y `carta/page.tsx` (RentabilidadView).
- Cierra el pendiente histórico "Loop teórico-vs-real de stock — no cerrado" (movido a `HISTORIAL.md`). Nuevo pendiente 🟢 anotado: arreglar `facturas-universal` para que resuelva `producto_id` al insertar.
- Commit `9f29c0b`, pusheado, deploy en Vercel. `npm run build` limpio, 111/111 tests Vitest, verificado en vivo contra El Rescoldo real (cálculo + endpoint autenticado + UI en dev server).

## Qué quedó a medias
- Nada de este bloque — cerrado de punta a punta (código + verificación con datos reales + docs).
- Aparte, encontrado y NO tocado (fuera de alcance): el dev server local que estaba corriendo en :3000 (PID 6228, de una sesión anterior) desapareció durante esta sesión mientras yo mataba un proceso propio en :3001 — no debería tener relación causal, pero no la descarté del todo. Si hacía falta para otra cosa, levantarlo de nuevo con `npm run dev`.

## Probar primero mañana
- Reportes → Fuga con "Este mes"/"Último mes" en Bros (más volumen de facturas que Rescoldo) para ver la tabla poblada con casos reales, no solo el smoke test.
- Confirmar que el fallback por nombre no genera falsos positivos cuando dos productos distintos comparten nombre parecido pero no igual (no debería, matchea exacto normalizado, pero vale mirarlo con datos reales de Bros).

## Próximo paso concreto
Seguir con `PLAN-4-CAPAS.md` — quedan B6 (desempeño por persona) y B7 (checklist pre-servicio), independientes entre sí. B8 (Reservas) es el punto de decisión: revisar el track de validación con Bros/Rescoldo antes de arrancarlo.
