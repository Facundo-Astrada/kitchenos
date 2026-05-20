---
name: pr-review
description: Revisa los cambios de código contra las convenciones de KitchenOS / Antigravity antes de aprobar o deployar. Usar antes de cada deploy importante o cuando alguien sube código nuevo.
argument-hint: "rama o descripción de los cambios a revisar (opcional)"
---

Revisar los cambios recientes (`git diff HEAD~1` o rama indicada en `$ARGUMENTS`) contra el siguiente checklist:

## Checklist de hooks y datos

- [ ] ¿Todos los hooks tienen `RESTAURANTE_ID` en los deps del `useCallback`?
- [ ] ¿Todos los hooks tienen el guard `if (!RESTAURANTE_ID) return` antes de queries?
- [ ] ¿Las queries usan columnas reales (`stock_actual` no `cantidad`, `status` no `completada`)?
- [ ] ¿Los inserts que necesitan service role van por una API route (`/api/*/route.ts`) con `createAdminClient()`?
- [ ] ¿`createAdminClient()` solo se importa en API routes o scripts, nunca en componentes cliente?

## Checklist de UI

- [ ] ¿Los headers usan `background: 'var(--navy)', padding: '46px 16px 14px'`?
- [ ] ¿Los iconos son Material Symbols Outlined (`<span className="material-symbols-outlined">`)? No emoji.
- [ ] ¿Los FABs están en `bottom: 100+`?
- [ ] ¿Se usan CSS vars (`var(--bg)`, `var(--surface)`, etc.) en lugar de hex hardcodeado?
- [ ] ¿No hay `import Chart from 'chart.js'` ni librerías de gráficos?
- [ ] ¿El texto de UI está en español argentino?

## Checklist de TypeScript

- [ ] ¿`npm run build` pasa sin errores?
- [ ] ¿Los tipos nuevos están en `types/index.ts`?
- [ ] ¿No hay `any` innecesarios?

## Checklist de base de datos

- [ ] ¿Los upserts en `turnos` usan la constraint UNIQUE (miembro_id, fecha)?
- [ ] ¿Los soft-deletes en `recetas` usan `activa: false` en lugar de DELETE?
- [ ] ¿Las tablas nuevas tienen `restaurante_id` FK?

## Output esperado

Listar cada ítem que falla con:
- El archivo y número de línea
- Por qué es un problema
- El fix sugerido (mínimo, sin refactorizar lo que funciona)

Si todo pasa, confirmar: "✓ Listo para deploy".
