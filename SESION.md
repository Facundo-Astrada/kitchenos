# Sesión — 12/10/2026

## Qué se cerró
- Stock: pestaña **Producciones** separada de Insumos — `es_produccion` sale de la tabla y vive ahí con su stock editable; acciones masivas (Asignar sector, Asignar proveedor, Marcar producción) en un sheet paramétrico (`AsignacionesMasivas.tsx`).
- Tabla de Insumos: **Categoría, Proveedor, Sector, Unidad y Precio editables con un click** (`<select>`/input nativos, sin modal — `CeldasInlineTabla.tsx`), con "+ crear" inline para categoría/proveedor/sector (`NuevoRegistroModal.tsx`). Columna Proveedor nueva, Nivel pasó de barra a anillo compacto.
- Refactor: la fila de la tabla (todo el `<tr>`) pasó a `FilaProductoInsumo.tsx` — venía pisando el ratchet de líneas 3 veces en el día; con la fila afuera, el techo bajó por primera vez (3295, por debajo de donde arrancó la sesión).
- Dos bugs reales encontrados y arreglados: 408/1519 productos con `unidad` fuera de la lista canónica (`'u'`, `'l'`, `'paq'`) rompían el `<select>` — mostraba "kg" en vez del valor real, mismo fix en el modal grande; superposición Precio/Stock por el ancho del `<select>` de Unidad (confirmado con bounding boxes, no solo a ojo).

## Qué quedó a medias
- **Producción interna sin costeo automático**: marcar `es_produccion` no vincula receta. En el freezer de Bros, 3 de 63 candidatos matchean por nombre — anotado en `PENDIENTES.md`.
- **El deploy automático GitHub→Vercel falló en silencio dos veces en el día** (sin build, ni error ni "ready" — nada). Se mitigó disparando el deploy a mano por la API de Vercel cada vez; no se investigó la causa raíz del webhook. Si vuelve a pasar, vale la pena mirarlo en vez de seguir mitigando.
- Precio en la tabla perdió el formato "$" (ahora número pelado, igual que Stock/Mínimo) — comunicado a Facundo, no confirmó si lo quiere de vuelta con formato.

## Probar primero mañana
- El flujo real en Bros: filtrar Sector = freezer, correr "Marcar producción" sobre los ~42 candidatos reales (no solo los de prueba) y confirmar el badge en Stockear con datos de verdad.
- Si el deploy automático volvió a fallar solo, mirar la config de la GitHub App de Vercel en vez de seguir con el disparo manual.

## Próximo paso concreto
- Vincular a mano `receta_id` en los productos de producción reales de Bros cuando se decida hacerlo (hoy quedan a $0).
- Si se sigue sumando edición inline a Stock, el techo de líneas (3300) puede volver a quedar justo — mirar primero si entra sin pisarlo antes de bumpear de nuevo.
