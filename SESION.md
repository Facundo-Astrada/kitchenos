# Sesión — 2026-09-08

## Qué se cerró
- **Bug de datos real en Bros**: `/api/invitar` nunca creó ficha de equipo (índice único
  faltante, `onConflict` fallaba en silencio desde siempre). Arreglado en tres capas +
  backfill de Tamara y `zrw.viajes@gmail.com`. Gotcha #29 en `hooks.md`.
- Ficha del plantel de Organigrama pasa a modal centrado (`components/ui/Modal.tsx`, nuevo
  — el que `ui.md` pedía extraer hace rato).
- Configuración pierde los tabs Equipo/Permisos (duplicaban Organigrama) + 170 líneas de
  código muerto. Plantel gana chip "Inactivos" con reactivar.
- Permisos por rol se muda a Organigrama → Puestos, colapsado.
- Guía de inicio / Organización: entrada propia en sidebar+MoreMenu (admin) + tira de
  progreso en el Dashboard.
- Polivalencia responsive: card por plaza en mobile (la tabla no entraba).
- 2 commits (`c0af02d`, `551bc5c`) pusheados — Vercel deploya solo.

## Qué quedó a medias
- Dos cuentas de prueba propias de Facundo en Bros (admin + `+test`) quedaron sin ficha a
  propósito, para no meter tarjetas falsas en el plantel de un cliente real — asignarles
  ficha a mano si hace falta verlas en Organigrama.
- La sombra de scroll de la tabla de Polivalencia en desktop (CSS puro, sin JS) no se vio
  en acción todavía: en la cuenta de prueba las 6 plazas entraban sin necesitar scroll.
  Falta verla con plazas custom que sí desborden.
- Quedan 3 copias viejas del patrón de modal centrado sin migrar a `components/ui/Modal.tsx`
  (calendario, stock, checklist) — anotado en `PENDIENTES.md`.
- Errores de consola pre-existentes en Home (`usePase`/`useChecklist`: "Error al cargar...")
  vistos de casualidad verificando con Playwright contra `admin@elrescoldo.com` — no
  investigados, puede ser esperable para una cuenta sin plaza asignada.
- **`PENDIENTES.md` pasó los 38KB** (objetivo ~10KB) — mucho backlog acumulado de sesiones
  viejas sin re-verificar si sigue vigente. No se tocó hoy por no re-auditar a ciegas ítems
  ajenos a esta sesión.

## Probar primero mañana
- Que Tamara y `zrw.viajes@gmail.com` ya aparezcan en el plantel real de Bros.
- Invitar a alguien nuevo de punta a punta en producción para confirmar el fix.
- El chip Inactivos y el modal en un celular físico (se probó con Playwright/iPhone emulado).

## Próximo paso concreto
- Confirmar con Facundo que lo de Bros quedó bien. El barrido de las 4 fichas faltantes
  fue contra todas las cuentas (join `user_restaurantes`×`equipo_miembros` sin filtrar por
  restaurante) y solo encontró afectados en Bros — Origen y VOGLIO Farina ya quedaron
  cubiertos por ese chequeo, no hace falta repetirlo.
- Si no hay más feedback puntual: retomar el tope de 🟠 Alto en `PENDIENTES.md` — el
  scheduler de avisos de la ruta de implantación (mismo agujero que "nada avisa cuando
  producción se rompe").
- Dedicar una sesión aparte a podar `PENDIENTES.md` — está muy por encima del tamaño que
  debería tener.
