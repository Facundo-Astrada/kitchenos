---
name: deploy
description: Build + deploy a Vercel con validación previa. Usar en lugar de correr npx vercel manualmente. Garantiza que no se deployea código roto.
allowed-tools: Bash
---

Ejecutar el proceso de deploy a producción con validación completa.

## Paso 1 — Verificar que no hay cambios sin commitear importantes

```bash
git status
```

Si hay archivos modificados importantes (no `.env.local`, no archivos de cache), preguntar al usuario si quiere commitearlos antes de deployar.

## Paso 2 — Build local para detectar errores ANTES de deployar

```bash
cd c:/Users/Equipo/Documents/kitchenos && npm run build
```

Si el build falla:
- Leer los errores de TypeScript
- Intentar resolverlos automáticamente si son errores menores
- Si son errores complejos, reportarlos al usuario y NO continuar con el deploy

## Paso 3 — Verificar checklist pre-deploy

Correr `/pr-review` mentalmente sobre los últimos cambios:
- ¿Hay errores de TypeScript? → No deployar
- ¿Hay variables de entorno nuevas que no están en Vercel? → Advertir
- ¿Hay cambios en el schema de DB que requieren migración? → Recordar correr migración primero

## Paso 4 — Deploy

Solo si el build pasó sin errores:

```bash
cd c:/Users/Equipo/Documents/kitchenos && npx vercel --prod --yes
```

## Paso 5 — Confirmar

Mostrar la URL de producción y los últimos cambios deployados (últimos commits).
Indicar qué funcionalidades se pueden probar primero.
