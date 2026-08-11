---
name: prod-status
description: Chequea la salud de KitchenOS en producción — advisories de seguridad/RLS de Supabase, si el último commit de main parece deployado, y deuda técnica abierta. Usar para un pulso rápido del estado, no para debuggear un error puntual (para eso, /debug-error o el agente bug-fixer).
---

Correr, en este orden, y resumir en un solo mensaje (no volcar el output crudo de cada herramienta):

## 1. Advisories de Supabase

Llamar `mcp__supabase__get_advisors` (tipo `security` y `performance`, si el server los separa). Listar solo lo nuevo o no reconocido — los ítems ya documentados en `PENDIENTES.md` → "Hardening de seguridad" no hace falta repetirlos, solo marcar si siguen abiertos o si alguno ya se resolvió y hay que sacarlo de `PENDIENTES.md`.

## 2. Último commit vs. producción

`git log -3 --oneline` en `main`. KitchenOS deployea automático en cada push (no hay gate manual), así que el último commit local en `main` que ya esté pusheado *es* lo que corre en https://kos-app-one.vercel.app — no hay forma de confirmarlo por API sin credenciales de Vercel, así que reportar el commit y aclarar que es el estado esperado, no confirmado, salvo que el usuario diga que acaba de ver algo distinto en producción.

## 3. Deuda técnica abierta

Releer `ESTADO-ACTUAL.md` → sección "Bugs / Deuda Técnica Conocida" y `PENDIENTES.md` → 🔴 Crítico. Señalar si hay algo crítico sin resolver — eso pesa más que cualquier advisory nuevo.

## Output esperado

Un resumen corto (no una tabla larga): estado general en una frase, y debajo solo lo que requiere atención (advisories nuevas, crítico abierto en PENDIENTES). Si todo está en orden: "✓ Sin novedades — Nº advisories conocidas, último commit `<hash>` en main, 0 críticos abiertos."
