# Sesión — 2026-09-08

## Qué se cerró
- Lluvia de ideas de Facundo sobre 10+ pantallas, ejecutada entera en 9 bloques (0 a 8),
  9 commits (`282d327`…`1a184f9`) pusheados uno por uno con build+tsc+lint+verificación
  visual real (Playwright, ambos temas) antes de cada push.
- **Bloque 0**: Dashboard sin banners de plata, calendario al panel desktop, scrollbars
  ocultas (6 pantallas), bug de datos real en Bros (`carta_categorias` duplicadas).
- **Bloque 1**: modo oscuro roto por el doble rol de `--navy` — split en `--navy`/`--navy-ink`.
- **Bloque 2**: Merma + 11 sheets más al `Modal` canónico.
- **Bloque 3**: HACCP Limpieza rediseñada (multi-día, registro por fecha, sub-tabs) — de
  paso corrigió un bug real de doble-registro por doble-tap (race condition, fix con SWR
  `optimisticData`).
- **Bloque 4**: Turnos de grilla de letras a planilla real (horas editables, bloques
  coloreados, copiar semana anterior).
- **Bloque 5**: Mesa de Trabajo con color real (`seccionTipoColor()` nuevo).
- **Bloque 6**: tarjetas "¿Cómo se lee esto?" en Reportes (4 tabs) y Presupuesto (3 bloques).
- **Bloque 7**: Calendario+Bitácora — Modal para el form de evento, shared-axis en cambio
  de mes/semana, swipe con chevrons visibles, leyenda colapsable, rail de color + shadow
  en Bitácora, botón archivar.
- **Bloque 8**: modo oscuro etapa B — 4 pares de tokens pastel (`--red/-amber/-green/-blue-bg/-fg`),
  354 reemplazos en 47 archivos vía script + 3 rondas de revisión manual (self-reference en
  globals.css, texto translúcido en dos chips, 8 botones sólidos + 3 paletas de avatar que
  no debían tokenizarse — todos revertidos a hex literal).
- `PENDIENTES.md` podado (Modal: quedan 2 copias, no 3; sacado el ítem de contraste navy en
  oscuro, ya resuelto por el Bloque 1). `.claude/docs/ui.md` § Variables de color reescrita
  con la regla completa de cuándo NO tokenizar (botón sólido+texto blanco, `color`, paletas
  categóricas).

## Qué quedó a medias
- **El swipe de Calendario (Bloque 7) usa `drag` de `motion/react` a mano**, no el patrón
  de scroll-snap nativo que `ui.md` § "Tabs con swipe" recomienda — ese patrón asume N tabs
  fijos, y un carrusel de fecha "infinita" necesitaría 3 paneles con recentrado tras cada
  snap. No se resolvió esa reconciliación, y **el gesto de arrastre real no se probó con
  Playwright** (solo el click de los chevrons y la animación resultante).
- Bloque 8: el script tocó 47 archivos por coincidencia de hex, no por revisión ítem a
  ítem — cubrí las 3 categorías de falso-positivo que encontré (self-reference, texto
  translúcido, contraste de botón/paleta), pero no hay garantía de que sea el 100%; si
  aparece un botón o chip que se ve "raro" en oscuro, es el primer sospechoso.
- Verificación de Reportes (CMV/Fuga/Rendimiento/Food Cost) con datos reales quedó
  parcial: El Rescoldo (demo) solo tiene ventas/facturas de mayo-junio, current date es
  septiembre — se confirmó que el estado vacío se comporta bien, pero no se vio el
  `ejemplo` con números reales poblado en esas 4 tarjetas.

## Probar primero mañana
- Calendario en el celular real: swipe de mes/semana (el gesto que no se probó) y que el
  chevron siga siendo la vía principal si el swipe se siente raro.
- Modo oscuro en general, un recorrido de 5 minutos por Facturas/Stock/HACCP/Dashboard/
  Pedidos — confirmar que ningún chip/botón quedó con contraste pobre tras el Bloque 8.

## Próximo paso concreto
- Sin bloque siguiente definido en el plan (los 9 estaban completos). Retomar con
  `PENDIENTES.md` 🟠 Alto — el candidato más viejo es SMTP propio para invitaciones
  (bloqueado en dominio propio de Resend) o feature gating (`puedeUsar()` sin cablear
  a ninguna pantalla todavía).
