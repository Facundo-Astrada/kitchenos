---
name: create-skill
description: Crea una nueva skill de Claude Code. Usar cuando querés automatizar un proceso repetitivo que Claude debería saber hacer solo con un comando.
argument-hint: "nombre-de-la-skill descripción de qué debe hacer"
---

Crear una nueva skill de Claude Code a partir de: `$ARGUMENTS`

El formato del argumento es: `nombre-skill "descripción de qué hace"`

## Qué es una skill

Una skill es un archivo de instrucciones que Claude sigue cuando vos escribís `/nombre-skill`. 
Piensalo como "enseñarle a Claude un procedimiento específico de tu proyecto".

## Estructura del archivo a crear

Crear el archivo en: `.claude/skills/NOMBRE/SKILL.md`

```markdown
---
name: NOMBRE
description: UNA LÍNEA que describe cuándo usar esta skill. 
             Claude la lee para decidir si usarla automáticamente.
argument-hint: "qué parámetro acepta (opcional)"
allowed-tools: Read, Write, Edit, Bash, Grep, Glob  ← solo los necesarios
disable-model-invocation: false  ← poner true si es un script puro sin IA
---

[Instrucciones detalladas de lo que Claude debe hacer]
[Incluir: pasos numerados, ejemplos, casos de error, output esperado]
```

## Campos importantes del frontmatter

| Campo | Cuándo usarlo |
|---|---|
| `argument-hint` | Si la skill acepta un parámetro (ej: nombre del módulo) |
| `allowed-tools` | Lista las herramientas que puede usar — omitir permite todas |
| `disable-model-invocation: true` | Para scripts puros que no necesitan razonamiento |
| `user-invocable: false` | Si Claude debe usarla internamente pero no el usuario |

## Reglas para escribir buenas skills

1. **Máximo 400 palabras** — las skills largas consumen tokens innecesariamente
2. **Pasos concretos** — "Leer el archivo X, buscar el patrón Y, reemplazar con Z"
3. **Sin ambigüedad** — si hay una decisión que tomar, que sea una pregunta explícita al usuario
4. **Output esperado claro** — decirle a Claude exactamente qué debe mostrar al terminar
5. **Referencia a convenciones del proyecto** — no repetir lo que está en CLAUDE.md, solo referenciar

## Después de crear la skill

1. Mostrar el contenido del archivo creado
2. Explicar con una línea cómo usarla: `/nombre-skill argumento`
3. Confirmar que el archivo está en la ruta correcta: `.claude/skills/nombre/SKILL.md`
