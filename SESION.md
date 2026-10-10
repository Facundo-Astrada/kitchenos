# Sesión — 10/10/2026 (costos de recetas de Bros)

## Qué se cerró
- Diagnóstico: 988 ingredientes con costo $0 (567 a desactivados, 340 sin producto, 81 a activos en $0; ~80 son agua). Origen: productos "Sin categoría" a $0 creados al guardar recetas y desactivados en tandas desde Stock.
- Aplicado: 115 ingredientes revinculados (87 salieron de $0) con respaldo `bak_ingredientes_revincular_20261010`; 19 productos con precio reactivados, respaldo `bak_productos_reactivar_20261010`.
- `scripts/revincular-recetas-bros.mjs`: dry-run reutilizable (alias + sugerenciaSegura + frenos propios).

## Qué quedó a medias
- ~780 ingredientes en $0 reales, 276 de 372 recetas: genéricos sin producto activo con precio (Sal, Manteca, Pimienta, Leche, Oliva, Limón, Aceite) y nombres basura ("1/2", "c/n").
- 8 desactivados con precio sin reactivar por duplicar uno activo (MSA, Anchoas en sal, Berro, Harina 0000, Mani tostado, Leche en polvo caja, Bondiola navidad, Harina algarroba tostada).
- Prevención al desactivar productos con recetas: decidido NO por ahora.

## Probar primero mañana
- Bros: food cost de la carta (debería subir) y que Manteca/Pollo aparezcan en Stock sin romper alertas.

## Próximo paso concreto
- Decidir mapeos genéricos (Sal→Sal fina, Manteca→pilones, Jugo de limón→Limón), cargar precio de pimienta/leche/aceite de oliva, y borrar el alias malo "aceite de girasol"→Semillas de girasol.
