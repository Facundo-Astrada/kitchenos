# Sesión — 08/10/2026 (auditoría de costos, unidades y vínculo a Stock)

## Qué se cerró
- Costo de ingrediente vinculado = precio + unidad del producto, por trigger (migración `20261008_ingredientes_costo_desde_producto.sql`). Bros: 137 líneas ×1000 → 0, recetas distorsionadas 99 → 3.
- Vínculo a Stock se guarda en las 6 vías de carga; auto-vínculo solo exacto; `RecetaEditSheet` ya no convierte "500 g" en "500 kg".
- Facturas/listas convierten a la unidad del producto; `peso_por_unidad_g` con campo en Stock; sin conversión automática en pantalla; comas y miles.
- Bros: 216 vínculos erróneos desvinculados, 79 revinculados exacto (respaldos `_bkp_ingredientes_*_20261008`).

## Qué quedó a medias
- Subreceta como ingrediente sigue con costo guardado fuera de la ficha (PENDIENTES → Costos).
- Test `ratchets`: `checklist/ClientView.tsx` sobre su techo (de antes, no tocado).

## Probar primero mañana
- En Bros: ficha de receta → agregar 500 g de un producto por kg (ver "500 g × $X/kg" y punto verde); cargar "Peso de 1 unidad" en Ajo; cargar una factura en otra unidad.

## Próximo paso concreto
- Repasar con Franco los 446 sin vincular en "Vincular stock" y cargar precios a Sal/Agua/Leche/aceites. Después, retomar F2 del asistente (`asistente_rutinas`).
