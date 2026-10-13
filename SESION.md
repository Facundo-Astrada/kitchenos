# Sesión — 13/10/2026

## Qué se cerró
- Recetario: **nota del chef por ingrediente** (`ingredientes.nota`). Se carga desde la ficha, el alta, la carga rápida y el editor rápido de OPS; la ve quien cocina (ficha, drawer de OPS, PDF, Coach) y el import por IA la separa sola.
- **Visor global de recetas**: la ficha se abre encima de la pantalla en la que estés (fondo translúcido en desktop, pantalla completa en el celular) y es la misma en Recetario, Carta, OPS ("Ver ficha completa") y los links del Coach. La lista de abajo no se desmonta.
- **Receta en segundo plano**: la conversión se conserva por receta y queda un botón flotante ("Salsa Putanesca · 777 g de Alcaparras") que acompaña por toda la app; cerrar una receta convertida la manda ahí sola. Sobrevive a un F5.
- Lista pensada para 600+ recetas (tandas, búsqueda sin acentos, header/KPIs/columnas con los patrones de Calendario y Turnos), ficha en dos columnas.
- Arreglos de paso: "Receta ajustada a…" mostraba la cantidad base y no la convertida; costos de la tarjeta sin gate `verCostos`; "Para revisar" contaba repetidas; Duplicar perdía etapas; refetch sin fin con un id inexistente.

## Qué quedó a medias
- Probado en navegador (demo, desktop y celular emulado). **Falta un celular real**: teclado al tocar el ícono de nota y el "atrás" de Android cerrando el visor.
- OPS conserva su drawer de vistazo; `RecetaQuickEditModal` y `RecetaEditSheet` siguen siendo editores aparte — ver `PENDIENTES.md` → "Recetario — lo que queda".
- Editar ingredientes desde la ficha sigue abierto a cualquiera con el módulo (Facundo: "de momento dejalo así").

## Probar primero mañana
- En la tablet de cocina: desde OPS abrir una receta → "Ver ficha completa" → doble tap en un peso, convertir, cerrar → tiene que quedar el botón flotante; moverse a Stock y volver a abrirla.
- En el celular: "atrás" con la receta abierta la cierra sin sacarte de la pantalla.

## Próximo paso concreto
- Decidir si la ficha absorbe los dos editores que quedan (crear receta desde OPS, edición rápida desde Carta) para que haya una sola forma de editar.
