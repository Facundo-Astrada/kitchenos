# Sesión — 13/10/2026

## Qué se cerró
- Recetario: **nota del chef por ingrediente** (`ingredientes.nota`). Se carga desde la ficha, el alta, la carga rápida y el editor rápido de OPS; la ve quien cocina (ficha, drawer de OPS, PDF, Coach) y el import por IA la separa sola.
- **Visor global de recetas**: la ficha se abre encima de la pantalla en la que estés (fondo translúcido en desktop, pantalla completa en el celular) y la pantalla de abajo no se desmonta.
- **Una sola ficha en Recetario y Carta**: detalle de plato y editor de plato/menú/evento ya no tienen vista ni editor de receta propios. La ficha sumó **Carga rápida** (filas de corrido o IA por foto/texto) y el aviso de **borrador** con Publicar.
- **Receta en segundo plano**: la conversión se conserva por receta y queda un botón flotante que acompaña por toda la app; cerrar una receta convertida la manda ahí sola.
- Lista pensada para 600+ recetas, header/KPIs/columnas con los patrones de Calendario y Turnos, ficha en dos columnas. Detalle y bugs arreglados de paso: `HISTORIAL.md` (13/10).
- Decisión registrada: una sola ficha en toda la app, **salvo el vistazo corto de OPS**, que se queda (`DECISIONES.md` §28).

## Qué quedó a medias
- Nada a medias. Facundo lo probó en el celular y lo dio por bueno ("lo veo bien").
- `RecetaQuickEditModal` (aviso del Mise, "Crear receta" del drawer de OPS) es el único editor de receta que sigue aparte — pendiente opcional.
- Editar ingredientes desde la ficha sigue abierto a cualquiera con el módulo (Facundo: "de momento dejalo así").

## Probar primero mañana
- Nada bloqueante. Si aparece algo raro, lo más probable es en Carta → evento o en "Crear receta acá mismo" dentro de un menú: comparten código con lo probado, pero del lado de Claude no se recorrieron con datos reales de Bros.

## Próximo paso concreto
- Lo que queda de Recetario está en `PENDIENTES.md` → "Recetario — lo que queda"; lo primero con riesgo real es el tope de 1000 filas (Bros va por 635 recetas).
