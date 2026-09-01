# Sesión — 2026-08-31 (noche, cont. 11) — hardening de seguridad menor + cierre del falso duplicado de El Rescoldo

## Qué se cerró

Los dos ítems de baja prioridad que quedaron afuera de la sesión anterior, ambos resueltos:

- **`unaccent` fuera de `public`**: movida al schema `extensions` (verificado sin caller propio, `search_path` ya la cubre).
- **Policy SELECT del bucket `fotos`** restringida a `authenticated` — cierra el listado anónimo del bucket entero; las URLs públicas de lectura siguen sirviendo igual (verificado con curl, 200).
- **HaveIBeenPwned**: bloqueado por plan — la management API devuelve 402 ("available on Pro Plans and up"), no es un fix de código ni de dashboard en el plan actual.
- **"Menú duplicado" de El Rescoldo**: no era un bug. Las dos filas pertenecen a dos restaurantes distintos (`...0001` fuente/marketing, `...0002` demo pública que `reset_demo_restaurante()` re-clona con IDs nuevos en cada reset) — RLS filtra por `restaurante_id`, ninguna sesión ve ambas filas a la vez. Cerrado sin tocar datos.

Commits: `a557795` (PENDIENTES) + doc updates de cierre (`HISTORIAL.md`, `.claude/docs/columnas.md`).

## Qué quedó a medias

- Nada — ambos ítems se cerraron completos.

## Probar primero mañana

- Nada de riesgo — cambios de config de Supabase (extensión + policy) verificados en vivo, sin tocar código de la app.

## Próximo paso concreto

Sin cola pendiente de esta sesión. El backlog vuelve a `PENDIENTES.md` (🟠 Alto: SMTP propio para invitaciones si molesta con 3+ invites seguidos, Fiscal ARCA end-to-end; 🟢 Bajo: priorizar según feedback real de El Rescoldo) salvo que Facundo traiga un tema nuevo.
