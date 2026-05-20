---
name: estimate
description: Estima el esfuerzo de implementar una feature nueva en KitchenOS o un proyecto Antigravity. Útil para presupuestar con clientes o planificar sprints.
argument-hint: "descripción de la feature a estimar"
---

Analizar el esfuerzo necesario para implementar: `$ARGUMENTS`

## Proceso de análisis

1. **Leer CLAUDE.md y ARQUITECTURA.md** para entender el estado actual del proyecto
2. **Identificar qué cambia** en cada capa:

### Capa de base de datos
- ¿Se necesitan tablas nuevas? ¿Cuántas columnas, relaciones, índices?
- ¿Se modifican tablas existentes? ¿Hay riesgo de romper datos existentes?
- ¿Se necesitan políticas RLS nuevas?
- ¿Se necesita migration script?

### Capa de hooks
- ¿Hook nuevo o extensión de uno existente?
- ¿Necesita realtime subscription?
- ¿Escribe a DB directo (anon) o necesita API route con service role?

### Capa de API routes
- ¿Se necesita una API route nueva?
- ¿Integra con IA (Claude)? → +tiempo por prompts y testing
- ¿Integra con servicio externo (Stripe, WhatsApp, etc.)?

### Capa de UI
- ¿Página nueva completa o sección en página existente?
- ¿Componentes reutilizables o todo inline?
- ¿Export PDF o Excel?
- ¿Gráficos?

### Capa de integración
- ¿Toca navegación (BottomNav, MoreMenu)?
- ¿Afecta permisos por rol (`rol_permisos`)?
- ¿Necesita cambios en `types/index.ts`?

## Formato de output

```
FEATURE: [nombre]

DB: [tablas nuevas/modificadas] — [complejidad: baja/media/alta]
Hooks: [hooks nuevos/modificados]
API: [routes nuevas/modificadas]
UI: [páginas/componentes]
Integración: [navegación, permisos, tipos]

ARCHIVOS A TOCAR: [lista]
RIESGOS: [qué puede salir mal]
ESTIMACIÓN: [X-Y horas de desarrollo]
```

No dar números de días — solo horas, con rango mínimo-máximo.
