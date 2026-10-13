# Sesión — 13/10/2026

## Qué se cerró
- Recetario: **nota del chef por ingrediente** (`ingredientes.nota`). Se carga desde la ficha, el alta, la carga rápida y el editor rápido de OPS; la ve quien cocina (ficha, drawer de OPS, PDF, Coach) y el import por IA la separa sola.
- **Visor global de recetas**: la ficha se abre encima de la pantalla en la que estés (fondo translúcido en desktop, pantalla completa en el celular). La pantalla de abajo no se desmonta.
- **Una sola ficha en Recetario y Carta**: detalle de plato y editor de plato/menú/evento ya no tienen vista ni editor de receta propios — ver y editar es abrir la ficha. La ficha sumó **Carga rápida** (todas las filas de corrido o IA por foto/texto) y el aviso de **borrador** con Publicar.
- **Receta en segundo plano**: la conversión se conserva por receta y queda un botón flotante ("Salsa Putanesca · 777 g de Alcaparras") que acompaña por toda la app; cerrar una receta convertida la manda ahí sola. Sobrevive a un F5.
- Lista pensada para 600+ recetas (tandas, búsqueda sin acentos, header/KPIs/columnas con los patrones de Calendario y Turnos), ficha en dos columnas.
- Arreglos de paso: "Receta ajustada a…" mostraba la cantidad base; costos de la tarjeta sin gate `verCostos`; "Para revisar" contaba repetidas; Duplicar perdía etapas; refetch sin fin con un id inexistente.

## Qué quedó a medias
- **OPS conserva el vistazo corto por decisión** (`DECISIONES.md` §28): el drawer se queda, con "Ver ficha completa" como segundo paso. Lo único aparte que sigue vivo es `RecetaQuickEditModal` (aviso del Mise).
- Probado en navegador (demo, desktop y celular emulado). **Falta un celular/tablet real**: teclado al tocar el ícono de nota y el "atrás" de Android cerrando el visor.
- En Carta se probó detalle de plato y editor de menú (buscador e ítem); el editor de **evento** y "crear receta acá mismo" comparten el código pero no se recorrieron a mano.
- Editar ingredientes desde la ficha sigue abierto a cualquiera con el módulo (Facundo: "de momento dejalo así").

## Probar primero mañana
- Carta → un menú real de Bros → tocar el ícono de una receta: tiene que abrir la ficha, y "Carga rápida" adentro tiene que guardar y verse reflejado al cerrar.
- Carta → en un menú, "Crear receta acá mismo": tiene que abrir la ficha ya en la carga rápida.
- En la tablet de cocina: OPS → receta → "Ver ficha completa" → convertir → cerrar → botón flotante.

## Próximo paso concreto
- Probar el visor y la nota en la tablet de cocina y un celular real; con eso confirmado, decidir si el editor rápido del Mise pasa a la ficha.
