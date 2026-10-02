# Sesión — 02/10/2026 (asistente: F0 + F1)

## Qué se cerró
- F0: push de prueba llegó al iPhone; `/centro` commiteado; "crítico" → "bajo mínimo" en todo el Coach (`lib/stock/alerta.ts` + RPC `productos_bajo_minimo_count`; la vieja se borró). `AVISOS_ACTIVOS=1` está prendido a propósito.
- F1: pastilla de avisos nuevos (`AvisosPopup`) + bandeja `/avisos` agrupada por tipo; campana mobile fuera, acceso desde Perfil y sidebar.
- Decisión 8 del plan: lo urgente = falta de producto clave (derivado de la carta del día) → puesto Compras, "⚠", sin silencio en servicio ni repetición.

## Qué quedó a medias
- Franco tiene que dejar vigente la descripción del puesto de Compras en Bros (destinatario de F2).
- "¿Por qué me llegó?" de F1: espera a `asistente_rutinas` (F2).
- Test `ratchets` falla: `checklist/ClientView.tsx` 3166 líneas vs techo 3145 (de otra sesión, no tocado).

## Probar primero mañana
- Abrir la app en Bros y ver la pastilla con el aviso de prueba; revisar `/avisos` en celular y desktop (F1 no se vio en pantalla, solo typecheck/lint/tests).

## Próximo paso concreto
- F2: pasar `asistente_rutinas` por `db-designer`, motor determinístico, conteo cerrado → informe a Compras (Haiku). Definir si el urgente dispara con stock en cero o bajo mínimo. Sumar tipos nuevos a `ETIQUETAS` en `lib/notificaciones/agrupar.ts`.
