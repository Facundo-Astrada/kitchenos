# Sesión — 2026-08-21

## Qué se cerró
- Auditoría completa contra 5 quejas puntuales de Facundo (integrar miembros, permisos, velocidad entre pantallas, invitación por email, capacitación) — 3 agentes Explore en paralelo + chequeo directo de la config viva de Supabase Auth.
- Fix: `MODULOS_ASIGNABLES` cubría 16/27 módulos gateados de verdad — sincronizado, ahora se puede asignar `checklist/turnos/proveedores/configuracion/espacios/salon/kds/clientes/muro/bitacora` a un puesto (antes no había ningún camino de UI, ni manual).
- Fix: invitación por email nunca asignaba puesto — selector opcional agregado al modal, propagado a `/api/invitar`.
- Perf: `usePermisos` migrado de `useState`+`useEffect` a SWR con key compartida — era el cuello de botella real de "tarda entre pantallas" (RouteGuard se remonta en cada navegación + 14 pantallas repetían el fetch). Validado con Playwright local: 2da navegación 4-8x más rápida (Operaciones 6.2s→0.4s).
- Causa raíz real de "la invitación no siempre funciona": no es config de redirect (esa ya estaba bien) — es que nunca se configuró SMTP propio, el mailer compartido de Supabase limita a 2 emails/hora.

## Qué quedó a medias
- SMTP propio (Resend): Facundo ya creó la cuenta, frenado a propósito hasta tener un dominio verificado — no vale la pena comprar uno solo para esto por ahora. Decisión explícita, no bloqueo técnico.
- Encontrado al arreglar `MODULOS_ASIGNABLES`: `RUTA_A_MODULO` colapsa `/tareas`, `/checklist` y `/produccion` al permiso `'operaciones'` — restringir esos tres módulos individuales solo esconde el link del sidebar, la ruta directa sigue abierta. Documentado en `hooks.md` y `PENDIENTES.md`, no arreglado (no es explotable por terceros).

## Probar primero mañana
- En producción (no solo local): mandar una invitación real con puesto elegido y confirmar que el invitado entra con los permisos finos correctos desde el primer login, sin que el admin tenga que tocar la ficha después.
- Turnos → Puestos → editar: confirmar que los módulos nuevos (Salón, KDS, Clientes, Muro, Bitácora, Config, Espacios, Proveedores, Turnos, Plazas) aparecen bien en el checklist y togglean como corresponde.

## Próximo paso concreto
`xlsx` bundleado a nivel de módulo en 6 pantallas pesadas (Reportes/Carta/Stock/Facturas/Proveedores/Recetario) sin dynamic import — mismo tratamiento que ya tiene `jspdf`, quick win chico. Alternativa si Facundo prioriza fricción de alta de equipo por sobre peso de bundle: clonar permisos entre puestos (hoy 100% manual, puesto por puesto).

`PENDIENTES.md` pasó los ~10KB de referencia (25KB) — señal de que amerita una poda de fondo en algún momento, no algo de esta sesión (mucho es backlog viejo sin verificar contra código actual).
