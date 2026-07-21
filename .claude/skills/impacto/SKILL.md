---
name: impacto
description: Análisis de impacto antes de tocar código. Dado un símbolo (hook, componente, función, archivo), lista TODO lo que se rompe/hay que revisar si lo cambiás, usando el grafo de dependencias de graphify (AST local, sin tokens). Usar SIEMPRE antes de modificar algo compartido (un hook, un helper, una columna reflejada en tipos).
argument-hint: "símbolo a analizar (ej: useRestauranteId, ComposicionEditor, upsertMiseChecklistItem)"
allowed-tools: Bash
---

Objetivo: antes de editar `$ARGUMENTS`, saber el radio de impacto exacto (qué archivos lo importan, lo llaman o lo referencian) para no dejar ediciones incompletas.

Fuente de verdad: el grafo de código de graphify (`graphify-out/graph.json`), que se mantiene fresco solo vía el git hook post-commit. Las consultas son locales e instantáneas (no gastan tokens).

## Paso 0 — Resolver el binario de graphify

`graphify` puede no estar en el PATH de esta sesión. Resolverlo así (usar `$GR` en los pasos siguientes):

```bash
GR=$(command -v graphify || echo "/c/Users/Equipo/.local/bin/graphify.exe")
"$GR" --version
```

## Paso 1 — Asegurar que el grafo existe

Si `graphify-out/graph.json` no existe (repo recién clonado, o nunca se corrió), construirlo una vez — solo AST local, cero tokens (~20-60s):

```bash
cd /c/Users/Equipo/Documents/kitchenos
[ -f graphify-out/graph.json ] || "$GR" extract . --code-only
```

Si ya existe, NO reconstruir: consultar directo (es lo que lo hace rápido). El hook post-commit ya lo actualizó en el último commit.

## Paso 2 — Análisis de impacto (reverse traversal)

```bash
"$GR" affected "$ARGUMENTS" --depth 2
```

- Devuelve los nodos que dependen de `$ARGUMENTS` con `archivo:línea` y el tipo de relación (`imports`, `calls`, `references`, `uses`…).
- Si sale vacío: el nombre puede no matchear un nodo. Verificar el nombre exacto con `"$GR" god-nodes --top 20` o probar sin paréntesis / con el nombre del archivo.

## Paso 3 — Vecindario directo (contexto extra, opcional)

Para entender qué usa el propio símbolo (no solo quién lo usa):

```bash
"$GR" explain "$ARGUMENTS"
```

Y si te interesa cómo se conecta con otro símbolo concreto: `"$GR" path "$ARGUMENTS" "OtroSimbolo"`.

## Paso 4 — Presentar el resultado accionable

Mostrarlo agrupado y útil para editar, NO como dump crudo:

1. **Archivos impactados**, agrupados por archivo, separando quién lo **importa** de quién lo **llama/usa** (con `archivo:línea` clicable en formato `[ruta:línea](ruta#Llínea)`).
2. **Checklist de pre-edición**: en 1-3 bullets, qué hay que revisar/actualizar en cada lugar si cambiás la firma o el comportamiento de `$ARGUMENTS`.
3. **Nota de frescura**: aclarar que el grafo refleja el último commit + la última construcción manual. Si el usuario acaba de editar en esta sesión archivos que tocan a `$ARGUMENTS` sin commitear, ofrecer refrescar con `"$GR" extract . --code-only` (~20s) antes de confiar en la lista.

## Trampas conocidas

- **`update` infla el grafo** (no respeta `--code-only`, sube a ~16k nodos y tarda ~70s). Para refrescar manualmente usar siempre `extract . --code-only`, no `update`.
- **Archivos `.sql` no entran al grafo** (falta `tree_sitter_sql`). El impacto sobre migraciones no se ve acá; para columnas de DB usar `/supabase-check`.
- El grafo puede tener nodos duplicados con el mismo nombre (ej. dos `createClient()` de módulos distintos) — mirar el `archivo:línea` para desambiguar.
