# Sesión — 2026-09-04 — Carta: el food cost dejó de fabricarse, tres fases

Devolución de uso real: "Carta tiene demasiados puntos de control, no se ve el gramaje que sí se ve en Recetario". La causa era peor que UI — `plato_recetas.cantidad_ops` servía demanda de mise Y gramaje de costeo a la vez, y con `porciones` en 1 por default en el 85% de las filas, el food cost contaba cada componente como "una porción entera del batch" (el caso que disparó la queja, en Bros, daba margen -403989.7%). 3 commits, pusheados y deployados (`Ready` en Vercel).

## Qué se cerró

- **Fase 1 — el número** (`528a9ec`): `plato_recetas.gramaje`/`gramaje_unidad` (columna nueva, migrada y backfillada), separada para siempre de `cantidad_ops` (que queda solo para la demanda de mise). `lib/recetas/peso.ts` nuevo, deriva costo/gramo aunque falte `peso_total_g`. Sin gramaje conocido, el plato queda "sin estandarizar" en vez de mostrar un FC inventado (decisión explícita de Facundo). `sumPlatoRecetaCantidad` ya no suma unidades incompatibles entre sí.
- **Fase 2 — la fila del componente en Carta** (`1286d94`): ícono de receta → `RecetaEditSheet` (editable, sin salir de Carta); editor de gramaje real reemplaza al de "porciones"; chip "Stock estándar: N pax · Plaza"; panel OPS de `DetailView.tsx` reemplazado por el `OpsPanel` compartido (-250 líneas a mano).
- **Fase 3 — menos pantallas** (`c84d984`, a pedido: "platos se va, continua fase 3"): Recetario pierde la pestaña "Platos" (-442 líneas). `EditarPlato.tsx` desaparece — nombre/precio/categoría/foto se editan in situ en `DetailView.tsx`, sin la tercera pantalla. Glosario cerrado con gramaje/stock estándar/peso por porción.
- Verificado en las tres fases con dev server + Playwright contra Supabase real (no solo tests). Docs tocados: `ESTADO-ACTUAL.md`, `PENDIENTES.md`, `columnas.md`, `glosario.md`, `HISTORIAL.md`, ratchet de `recetario/page.tsx` bajado.

## Qué quedó a medias

Nada a medio hacer en lo planeado — las tres fases están completas y deployadas. Deuda dejada a propósito: el editor de "porciones" (multiplicador de batch de `fuga.ts`/`consumoTeorico.ts`) se sacó de la fila de Carta al reemplazarlo por el de gramaje, sin buscarle un lugar nuevo. La función que lo escribe sigue viva sin ningún caller — ver `PENDIENTES.md` § Backlog chico.

## Probar primero mañana

Toda la verificación de UI fue contra el dev server local (apuntando a Supabase real) — no se abrió el build ya deployado en `kos-app-one.vercel.app`. Vale la pena entrar una vez a Carta en producción (abrir un plato con componentes, tocar el ícono de receta, el gramaje y OPS) antes de darlo por probado en la práctica — el build fue limpio así que no debería haber sorpresas, pero es el mismo hueco que dejó la sesión del 03/09.

## Próximo paso concreto

Dos opciones, sin orden forzado:
1. **Corrección de datos en Bros** (5 min, no es código): la receta "Crema de castañas" tiene un ingrediente ("Tallos de girgolas") cargado con precio de kg puesto en el campo de gramo — 1000x de más, y va a seguir mostrando un food cost absurdo hasta que alguien lo corrija a mano en Recetario.
2. Seguir la cola de `PENDIENTES.md` por prioridad — el 🟠 más viejo sigue siendo SMTP propio para invitaciones (Resend con dominio verificado, Facundo frenó ahí) o el punto (a)/(b) de alertas de producción rota.
