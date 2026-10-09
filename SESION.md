# Sesión — 09/10/2026 (Compras/Fudo en Bros: import, vínculos, categorías)

## Qué se cerró
- Import de Fudo de 2.710 facturas sin duplicar (554 nuevas, 1.811 actualizadas); saltos de precio >50% van a "A revisar".
- Matcher único (`lib/facturas/sugerirProducto.ts`) para import, carga manual y OCR, que aprende de lo vinculado; 366 alias en Bros.
- Bros: mercadería 89% / bebidas 92% / limpieza 86% vinculadas; 148 vinos + 34 bebidas + 61 productos nuevos; facturas sin categoría ~680 → 21; almacén/carnes/verdulería ahora cuentan en CMV.

## Qué quedó a medias
- 11 precios en "A revisar"; carnes creadas por "u" que quizás son kg; mínimos en 0 de los productos nuevos; carta de Bebidas sin vincular a sus productos.
- Ratchet `checklist/ClientView.tsx` sobre su techo (de antes).

## Probar primero mañana
- Compras → Precios en Bros: que "A revisar" muestre la línea de origen y que "No es este producto" desvincule.

## Próximo paso concreto
- Recetas de Bros con costo incompleto: 705 ingredientes a productos desactivados, 657 a productos $0, 260 recetas afectadas → revincular al producto activo con precio (dry-run + respaldo).
