# Sesión — 19/09/2026 (2)

## Qué se cerró
- **Invitar al equipo** (commit `03c5817`, en prod): fallaba para el chef porque `/api/invitar` pedía `admin` crudo y la pantalla mostraba el botón a todos. Ahora invitan admin y chef (regla compartida en `lib/permisos/roles.ts`); un chef no puede invitar como admin.
- `facu@broscomedor.com` pasó de `chef` a **admin** en Bros (decisión de Facundo).
- Sesión anterior del mismo día: Ficha del puesto + Mi puesto + formación por plaza (`b69403e`) — ver `HISTORIAL.md`.

## Qué quedó a medias
- **Paula (Bros) sigue sin entrar.** Su ficha "Paula Frezza" tiene email `pauf2378` (inválido). Falta el mail real; no confirmamos si es la misma "Paula Chavez" que Facundo quería invitar.
- El camino "puesto con plaza" de la Ficha del puesto sigue sin verse en navegador.

## Probar primero mañana
- Con `facu@broscomedor.com` (ya admin): corregir el email en la ficha de Paula → Invitar con ese mismo mail → que no aparezca una segunda Paula.
- Con la misma cuenta: Organigrama → Puestos → **Parrillero** (único con plaza) — revisar la ficha y asignar un "Le enseña".

## Próximo paso concreto
- Decisión 014: **0 descripciones vigentes en Bros** (vence ~02/10) — que Franco complete al menos Parrillero.
