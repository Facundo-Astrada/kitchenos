# Sesión — 19/10/2026 (Organigrama, Fases 0 y 1)

## Qué se cerró
- Fase 0: tour del Coach (5 pestañas, Puestos, Polivalencia, Carta de la casa), texto "Equipo → Puestos", templates Compras (+2 tareas) y Mantenimiento; Bros: Pasteleria → área cocina.
- Fase 1: `equipo_miembros.puestos_extra` + trigger de limpieza (verificado bajo RLS), permisos y `ver_costos` unidos, `lib/organigrama/ocupantes.ts`, y todos los lugares de la tabla § 4.3 (ficha, carta, árbol, PDF, avisos, Coach, Perfil).
- Ratchet de ClientView alineado a 3227 (estaba roto en HEAD).
- 793 tests y build en verde; pusheado (72a01a5, 44d6bca).

## Qué quedó a medias
- Nada de Bros tocado salvo Pasteleria: León sigue en "Dueño / Dirección" (se cambia en la reunión).
- Decisión 017 sin escribir; 014 en condición de reversión. Agustín y Tefa sin cargar.

## Probar primero mañana
- En Bros, ficha de León → "Puestos que también cubre" (Compras, Mantenimiento): ¿entra a Pedidos/Proveedores/Facturas sin override? ¿Se ven los dos chips en su carta? (Cambiarle el principal le saca módulos de Dirección: hacerlo con Facundo.)

## Próximo paso concreto
- Fase 2: pestaña "Quién responde" + titular explícito en `ResponsablesPicker` + mapa en `kc_screen_context` (§ 5 del plan).
