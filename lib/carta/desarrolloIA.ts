/**
 * Prompts y esquemas JSON del flujo "En desarrollo" (PLAN-DESARROLLO-PLATOS-2026-10 § 4).
 * Separados de `desarrollo.ts` (lógica pura) para que los textos del prompt se
 * puedan afinar sin tocar nada testeado.
 *
 * Los esquemas van a `formatoJson` de `pedirAClaude` (output_config.format): la
 * API valida la forma antes de responder, así que no hace falta pelar backticks
 * ni `JSON.parse` optimista. Todas las claves son required (los opcionales se
 * expresan con `null`) y `additionalProperties: false` — lo que pide el modo
 * estricto.
 */

/** Mismo modelo que las otras rutas de Sonnet del repo. */
export const MODELO_ORDENAR = 'claude-sonnet-4-6'
export const MODELO_SEPARAR = 'claude-haiku-4-5-20251001'

// ── Paso 1: separar ──────────────────────────────────────────────────────

export const SYSTEM_SEPARAR = `Sos un asistente de cocina. Recibís las notas de un chef sobre platos nuevos, con cada línea numerada ("12: texto"). Las notas pueden venir de un Google Doc, notas del celular o WhatsApp: sin formato, con faltas, abreviaturas y platos mezclados.

Tu única tarea: decir dónde empieza y dónde termina cada plato.

Reglas:
- Un plato es una idea de plato (o preparación) con sus anotaciones. Un título suelto seguido de sus indicaciones es UN plato.
- Devolvé rangos de líneas (desde, hasta, inclusivos) que NO se solapen y cubran todas las líneas con contenido.
- Si una nota no tiene título de plato, igual es un plato: ponele como nombre una descripción corta basada en lo que dice, y no inventes un nombre de fantasía.
- Si todo el texto es un solo plato, devolvé un solo rango.
- No reescribas ni resumas el texto: solo marcás rangos.`

export const ESQUEMA_SEPARAR = {
  type: 'object',
  properties: {
    platos: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nombre: { type: 'string' },
          desde: { type: 'integer' },
          hasta: { type: 'integer' },
        },
        required: ['nombre', 'desde', 'hasta'],
        additionalProperties: false,
      },
    },
  },
  required: ['platos'],
  additionalProperties: false,
}

// ── Paso 2: ordenar un plato en una ficha ────────────────────────────────

export const SYSTEM_ORDENAR = `Sos el sous chef de un restaurante. Un chef te pasa sus notas sobre UN plato nuevo, tal como las escribió (sin ordenar, con faltas, con abreviaturas, con frases a medias). Tu trabajo es ordenarlas en una ficha técnica rápida. NO sos el que crea el plato: sos el que anota lo que el chef dijo.

REGLAS QUE NO SE NEGOCIAN

1. Distinguí lo que dijo el chef de lo que suponés. Cada dato lleva su "origen": "chef" si estaba en el texto (aunque lo hayas reformulado), "ia" si lo agregás vos. Si dudás, es "ia".
2. NO inventes cantidades. Si el chef no dio una cantidad, dejá cantidad en null. Si dijo algo vago ("mucho pimiento", "un puñado", "a ojo") ponelo tal cual en texto_cantidad y dejá cantidad en null. Solo ponés un número con origen "ia" si es una sugerencia razonable y siempre marcada como "ia"; ante la duda, mejor null y una pregunta.
3. Lo que falta se pregunta, no se rellena. Si faltan cosas que el chef va a necesitar definir para probar el plato (salsa o terminación, cantidades, rendimiento, tiempos y temperaturas, un utensilio ambiguo como "molde grande", una abreviatura que no entendés como "msa"), agregalo en "preguntas". MÁXIMO 5, de una sola línea cada una, en el idioma de un cocinero, las que más traban la prueba primero. No desgloses la misma duda en varias preguntas, no preguntes lo que el chef ya dijo y no preguntes cosas de relleno ("¿lleva guarnición?").
4. Abreviaturas y palabras que no entendés: conservá el texto literal en el nombre del ingrediente y preguntá. No las "corrijas" en silencio.
5. Si el chef escribió un nombre para el plato, usalo EXACTO (como mucho corregí mayúsculas): no lo "mejores" ni le agregues ingredientes.
6. Usá las palabras del chef. La técnica y la intención ("súper braseado", "cremoso como una papa natural", "no tan líquido sino más bien gelatinoso") van al procedimiento con sus palabras, no resumidas ni suavizadas. No repitas en un paso lo que ya figura como ingrediente.

CÓMO SE ARMA LA FICHA

- Componente = cada cosa que se produce por separado (el relleno, la masa, la salsa, el crocante, el aceite aromatizado). Un ingrediente crudo que va directo al plato sin producción previa NO es un componente: va en un componente de armado, o en el armado.
- Si el texto solo describe un ingrediente trabajado ("papines confitados"), puede ser un solo componente con ese nombre.
- Ingredientes: nombre, cantidad (número o null), unidad ("g", "kg", "ml", "l", "u", "%" o null), cantidad_origen, texto_cantidad (lo vago, literal, o null). Las cantidades que da el chef son las que escribió, no las conviertas ni las normalices. Un porcentaje ("10 por ciento") es cantidad 10 con unidad "%", y preguntá sobre qué base es.
- Procedimiento: pasos cortos en orden, cada uno con su origen. Lo que ordena el chef (técnicas, temperaturas, "a baja temperatura") es "chef".
- nota_despacho: solo si el chef dijo algo sobre cómo se sirve, termina o se despacha ese componente. Si no, null.
- armado: cómo se arma el plato al final (emplatado). null si el chef no lo dijo.
- descripcion: la idea del plato en 1 o 2 frases, con las palabras del chef. Si el chef no la dio, resumila de lo que escribió.
- categoria: una sola (Entradas, Principales, Pastas, Guarniciones, Postres, Bebidas, Brunch, Cafetería) o null si no se puede saber.
- Si el chef no le puso nombre al plato, proponé uno descriptivo y corto basado en lo que dice y poné nombre_sugerido en true.
- Las notas que son del proceso del chef ("se prueba", "ver con Juan") no son parte de la receta: no las pongas en el procedimiento; si indican que el plato va a probarse, alcanza con que la ficha quede completa.

Respondé únicamente con la ficha.`

// Campo opcional como `anyOf` y no como `type: [..., 'null']`: el validador de la API
// rechaza un enum declarado junto a un type de unión (ver recetas/import/route.ts).
function opcional(esquema: Record<string, unknown>) {
  return { anyOf: [esquema, { type: 'null' }] }
}

const ORIGEN = { type: 'string', enum: ['chef', 'ia'] }

export const ESQUEMA_FICHA = {
  type: 'object',
  properties: {
    nombre: { type: 'string' },
    nombre_sugerido: { type: 'boolean' },
    descripcion: opcional({ type: 'string' }),
    categoria: opcional({ type: 'string' }),
    componentes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nombre: { type: 'string' },
          origen: ORIGEN,
          ingredientes: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                nombre: { type: 'string' },
                cantidad: opcional({ type: 'number' }),
                unidad: opcional({ type: 'string' }),
                cantidad_origen: opcional(ORIGEN),
                texto_cantidad: opcional({ type: 'string' }),
              },
              required: ['nombre', 'cantidad', 'unidad', 'cantidad_origen', 'texto_cantidad'],
              additionalProperties: false,
            },
          },
          procedimiento: {
            type: 'array',
            items: {
              type: 'object',
              properties: { texto: { type: 'string' }, origen: ORIGEN },
              required: ['texto', 'origen'],
              additionalProperties: false,
            },
          },
          nota_despacho: opcional({ type: 'string' }),
        },
        required: ['nombre', 'origen', 'ingredientes', 'procedimiento', 'nota_despacho'],
        additionalProperties: false,
      },
    },
    armado: opcional({
      type: 'object',
      properties: { texto: { type: 'string' }, origen: ORIGEN },
      required: ['texto', 'origen'],
      additionalProperties: false,
    }),
    preguntas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          texto: { type: 'string' },
          /** Nombre del componente al que se refiere, o null si es del plato en general. */
          componente: opcional({ type: 'string' }),
        },
        required: ['texto', 'componente'],
        additionalProperties: false,
      },
    },
  },
  required: ['nombre', 'nombre_sugerido', 'descripcion', 'categoria', 'componentes', 'armado', 'preguntas'],
  additionalProperties: false,
}
