import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import mammoth from 'mammoth'
import { createClient } from '@/lib/supabase/server'
import { statusErrorIA } from '@/lib/ia/errores'
import { pedirAClaude } from '@/lib/ia/claude'

// Una llamada de visión sobre una foto de receta puede tardar bastante. Las
// rutas hermanas ya declaran su techo (carta/import 60, fichas-tecnicas 120);
// esta corría con el default de la plataforma.
export const maxDuration = 120

// Vision y PDF van por Sonnet 5: es más nuevo y más barato que el 4.6 que se
// usaba acá ($2/$10 por millón contra $3/$15). El texto plano no necesita esa
// capacidad y sigue en Haiku.
const MODELO_VISION = 'claude-sonnet-5'
const MODELO_TEXTO = 'claude-haiku-4-5'

const CATEGORIAS_FALLBACK = [
  'Entradas', 'Principales', 'Postres', 'Guarniciones',
  'Bebidas', 'Bases y Salsas', 'Pastelería', 'Panadería', 'Otros',
]

const UNIDADES = ['kg', 'g', 'l', 'ml', 'u']

/**
 * Un solo prompt para todas las fuentes (foto, PDF, Excel, Sheets, texto, voz).
 *
 * Antes había tres, y los tres decían alguna variante de "si no podés
 * determinar un campo, usá un valor razonable" / "hacé tu mejor esfuerzo". Con
 * un input ilegible eso no es tolerancia a fallos: es una instrucción de
 * inventar. Un PDF que llegaba como bytes crudos producía una receta completa,
 * plausible y falsa — distinta en cada intento.
 *
 * La regla de oro está copiada de `importador/fichas-tecnicas`, que es el
 * extractor de recetas que sí venía funcionando.
 */
function construirSystemPrompt(categorias: string[]): string {
  return `Sos un extractor de recetas de cocina profesional. Tu trabajo es TRANSCRIBIR lo que dice la fuente, no redactar una receta.

REGLA DE ORO — no inventar:
- Transcribí SOLO lo que está efectivamente en la fuente.
- Si un campo no está, omitilo o dejalo en null. NUNCA lo completes con un valor plausible.
- No agregues ingredientes que no figuran, aunque la receta "los pediría" (sal, aceite, agua, condimentos).
- No agregues pasos que no figuran, aunque el procedimiento quede incompleto.
- Copiá las cantidades tal como están. No las conviertas ni las escales.

SI NO PODÉS LEER LA FUENTE:
Devolvé "legible": false, explicá por qué en "motivo", y dejá "recetas" vacío.
Esto aplica cuando el contenido llega ilegible, corrupto, comprimido, en binario,
o cuando simplemente no es una receta. NO intentes reconstruir la receta a partir
del título, del nombre del archivo, ni de fragmentos sueltos. Una receta inventada
es mucho peor que un aviso de que no se pudo leer.

EXTRACCIÓN:
- Extraé TODAS las recetas que encuentres, no solo la primera.
- Revisá todas las hojas/páginas/secciones.
- Ignorá filas vacías, encabezados repetidos y plantillas sin datos.
- "Rinde" / "Yield" / "Rendimiento" van en los campos rinde + rinde_unidad (ej: 900 g),
  y NO en porciones. Si la fuente solo dice el rinde, dejá porciones en null.
- Cantidades con coma decimal, formato argentino: "0,5" y no "0.5".
- Las unidades solo pueden ser: ${UNIDADES.join(', ')}. Si la fuente dice
  "3 cucharadas" o "1 taza", convertí a la unidad de peso o volumen más cercana
  únicamente si la equivalencia es estándar; si no, usá "u" y dejá la medida
  original en el nombre del ingrediente.
- Categoría: elegí de esta lista, que son las categorías reales de este restaurante:
  ${categorias.join(', ')}.`
}

const ADJUST_SYSTEM = `Sos un asistente de cocina profesional. El usuario ya importó una receta y quiere ajustarla.
Recibís la receta actual y el pedido del usuario. Devolvé la receta completa con el ajuste aplicado.
No inventes datos que el usuario no pidió: cambiá solo lo que pide y dejá el resto igual.`

// ── Esquema de salida ───────────────────────────────────────────────────────
// Con `output_config.format` la API valida esto ANTES de responder. El modelo
// no puede devolver prosa, ni envolver el JSON en backticks, ni emitir una
// unidad fuera del enum — que es exactamente como se coló el "3 cucharadas"
// que reportó Franco. Reemplaza al viejo parseClaudeJson() que pelaba ```json
// con regex y tiraba 422 cuando el modelo contestaba en castellano.

/**
 * Campo opcional. Va como `anyOf` y no como `type: ['string','null']`: el
 * validador de la API rechaza un `enum` declarado junto a un type de unión
 * ("Enum value 'Entradas' does not match declared type '['string','null']'").
 */
function opcional(esquema: Record<string, unknown>): Record<string, unknown> {
  return { anyOf: [esquema, { type: 'null' }] }
}

function esquemaReceta(categorias: string[]): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      nombre_sugerido: { type: 'string' },
      categoria_sugerida: opcional({ type: 'string', enum: categorias }),
      porciones: opcional({ type: 'number' }),
      rinde: opcional({ type: 'number', description: 'Rendimiento numérico, ej 900 en "Yield: 900g"' }),
      rinde_unidad: opcional({ type: 'string', enum: UNIDADES }),
      tiempo_minutos: opcional({ type: 'number' }),
      ingredientes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            nombre: { type: 'string' },
            cantidad: { type: 'string', description: 'Coma decimal: "0,5"' },
            unidad: { type: 'string', enum: UNIDADES },
          },
          required: ['nombre', 'cantidad', 'unidad'],
          additionalProperties: false,
        },
      },
      procedimiento: { type: 'array', items: { type: 'string' } },
    },
    required: [
      'nombre_sugerido', 'categoria_sugerida', 'porciones', 'rinde',
      'rinde_unidad', 'tiempo_minutos', 'ingredientes', 'procedimiento',
    ],
    additionalProperties: false,
  }
}

function esquemaExtraccion(categorias: string[]): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      legible: {
        type: 'boolean',
        description: 'false si la fuente no se pudo leer o no contiene recetas',
      },
      motivo: opcional({
        type: 'string',
        description: 'Si legible es false, por qué. En castellano, para un cocinero.',
      }),
      recetas: { type: 'array', items: esquemaReceta(categorias) },
    },
    required: ['legible', 'motivo', 'recetas'],
    additionalProperties: false,
  }
}

interface RecetaExtraida {
  nombre_sugerido: string
  categoria_sugerida: string | null
  porciones: number | null
  rinde: number | null
  rinde_unidad: string | null
  tiempo_minutos: number | null
  ingredientes: { nombre: string; cantidad: string; unidad: string }[]
  procedimiento: string[]
}

interface Extraccion {
  legible: boolean
  motivo: string | null
  recetas: RecetaExtraida[]
}

type BloqueContenido =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'document'; source: { type: 'base64'; media_type: 'application/pdf'; data: string } }

// ── Helpers de normalización ────────────────────────────────────────────────

function hojasATexto(buf: Buffer): string[] {
  const wb = XLSX.read(buf, { type: 'buffer' })
  const sheetTexts: string[] = []
  for (const name of wb.SheetNames) {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name], { blankrows: false })
    const lines = csv.split('\n').filter((l: string) => l.trim())
    if (lines.length > 0) sheetTexts.push(`\n══ HOJA: "${name}" (${lines.length} filas) ══\n${lines.join('\n')}`)
  }
  return sheetTexts
}

const MAX_CHARS = 14000

function recortar(texto: string): string {
  return texto.length > MAX_CHARS
    ? texto.substring(0, MAX_CHARS) + '\n\n[... contenido truncado por longitud ...]'
    : texto
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY no configurada' }, { status: 500 })
  }

  // Solo para imputar el consumo de IA en ia_uso — no bloquea el import si falta.
  const { data: ur } = await supabase.from('user_restaurantes').select('restaurante_id').eq('user_id', user.id).maybeSingle()
  const restauranteId = (ur?.restaurante_id as string | undefined) ?? null

  try {
    const body = await req.json()
    const {
      action, mode, text, image_base64, media_type, file_base64, file_name,
      google_url, currentRecipe, userMessage, categorias: catCliente,
    } = body as {
      action?: 'import' | 'adjust' | 'import_multi'
      mode?: 'image' | 'text' | 'google_url' | 'document'
      text?: string
      image_base64?: string
      media_type?: string
      /** PDF o .docx en base64 — antes esto llegaba como texto crudo y era el bug. */
      file_base64?: string
      file_name?: string
      google_url?: string
      currentRecipe?: unknown
      userMessage?: string
      /** Categorías reales del restaurante. Sin esto la IA inventa las suyas. */
      categorias?: string[]
    }

    const categorias = (catCliente?.length ? catCliente : CATEGORIAS_FALLBACK)
      .map(c => String(c).trim())
      .filter(Boolean)

    // ── ADJUST: el usuario pide correcciones sobre una receta ya extraída ──
    if (action === 'adjust' && currentRecipe && userMessage) {
      const resultado = await pedirAClaude({
        tag: 'recetas/import:adjust',
        model: MODELO_TEXTO,
        maxTokens: 4000,
        system: ADJUST_SYSTEM,
        formatoJson: esquemaReceta(categorias),
        messages: [{
          role: 'user',
          content: [{
            type: 'text',
            text: `Receta actual:\n${JSON.stringify(currentRecipe, null, 2)}\n\nPedido del usuario: ${userMessage}`,
          }],
        }],
        restauranteId,
      })

      if (!resultado.ok) {
        return NextResponse.json(
          { error: resultado.error.mensaje },
          { status: statusErrorIA(resultado.error) },
        )
      }
      return NextResponse.json(JSON.parse(resultado.texto))
    }

    // ── Armado del contenido según la fuente ──
    const content: BloqueContenido[] = []

    if (mode === 'image' && image_base64) {
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: media_type || 'image/jpeg', data: image_base64 },
      })
      content.push({ type: 'text', text: 'Transcribí las recetas que veas en esta imagen.' })

    } else if (mode === 'document' && file_base64) {
      // ── Acá estaba el bug reportado por Franco (sep 2026) ──
      // El cliente hacía `await file.text()` sobre un PDF y mandaba el
      // resultado como texto: bytes binarios decodificados como UTF-8, o sea
      // la sintaxis interna del PDF y sus streams comprimidos. Con eso más un
      // prompt que pedía "usá un valor razonable", el modelo devolvía una
      // receta entera inventada a partir del título. Dos importaciones del
      // mismo PDF daban dos recetas distintas, ninguna la real.
      // Los bloques `document` son GA y no necesitan beta header.
      const esPdf = (media_type || '').includes('pdf') || /\.pdf$/i.test(file_name || '')

      if (esPdf) {
        content.push({
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: file_base64 },
        })
        content.push({ type: 'text', text: 'Transcribí las recetas que haya en este PDF.' })
      } else {
        // .doc/.docx caían en el mismo `else` roto que el PDF. mammoth ya se
        // usa para esto en importador/fichas-tecnicas.
        const buf = Buffer.from(file_base64, 'base64')
        let texto = ''
        try {
          texto = (await mammoth.extractRawText({ buffer: buf })).value
        } catch {
          return NextResponse.json(
            { error: 'No se pudo leer el documento. Probá exportarlo a PDF y subirlo de nuevo.' },
            { status: 400 },
          )
        }
        if (!texto.trim()) {
          return NextResponse.json({ error: 'El documento está vacío.' }, { status: 400 })
        }
        content.push({ type: 'text', text: `Transcribí las recetas de este documento:\n\n${recortar(texto)}` })
      }

    } else if (mode === 'text' && text && text.startsWith('__XLSX_BASE64__:')) {
      const buf = Buffer.from(text.replace('__XLSX_BASE64__:', ''), 'base64')
      let sheetTexts: string[]
      try {
        sheetTexts = hojasATexto(buf)
      } catch {
        return NextResponse.json(
          { error: 'No se pudo leer el archivo. Verificá que sea un Excel válido.' },
          { status: 400 },
        )
      }
      if (sheetTexts.length === 0) {
        return NextResponse.json({ error: 'El archivo no contiene datos.' }, { status: 400 })
      }
      content.push({ type: 'text', text: `Transcribí las recetas de esta planilla:\n\n${recortar(sheetTexts.join('\n\n'))}` })

    } else if (mode === 'text' && text) {
      content.push({ type: 'text', text: `Transcribí las recetas de este texto:\n\n${text}` })

    } else if (mode === 'google_url' && google_url) {
      const url = google_url.trim()
      const sheetsMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)
      const docsMatch = url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/)

      if (sheetsMatch) {
        const gRes = await fetch(`https://docs.google.com/spreadsheets/d/${sheetsMatch[1]}/export?format=xlsx`, { redirect: 'follow' })
        if (!gRes.ok) {
          return NextResponse.json(
            { error: `No se pudo descargar (${gRes.status}). Verificá que esté compartido como "Cualquier persona con el enlace".` },
            { status: 400 },
          )
        }
        const buf = Buffer.from(await gRes.arrayBuffer())
        if (buf.byteLength < 100) {
          return NextResponse.json({ error: 'El archivo descargado está vacío o es inválido.' }, { status: 400 })
        }
        const sheetTexts = hojasATexto(buf)
        if (sheetTexts.length === 0) {
          return NextResponse.json({ error: 'Todas las hojas del documento están vacías.' }, { status: 400 })
        }
        content.push({ type: 'text', text: `Transcribí las recetas de esta planilla de Google:\n\n${recortar(sheetTexts.join('\n\n'))}` })

      } else if (docsMatch) {
        const gRes = await fetch(`https://docs.google.com/document/d/${docsMatch[1]}/export?format=txt`, { redirect: 'follow' })
        if (!gRes.ok) {
          return NextResponse.json(
            { error: `No se pudo descargar (${gRes.status}). Verificá los permisos de compartido.` },
            { status: 400 },
          )
        }
        const googleText = await gRes.text()
        if (!googleText.trim()) {
          return NextResponse.json({ error: 'El documento está vacío.' }, { status: 400 })
        }
        content.push({ type: 'text', text: `Transcribí las recetas de este documento de Google:\n\n${recortar(googleText)}` })

      } else {
        return NextResponse.json(
          { error: 'URL no reconocida. Usá un link de Google Sheets o Google Docs.' },
          { status: 400 },
        )
      }

    } else {
      return NextResponse.json({ error: 'Datos insuficientes. Enviá texto, imagen o archivo.' }, { status: 400 })
    }

    // Foto y PDF necesitan capacidad de visión; el resto es texto plano.
    const usaVision = mode === 'image' || (mode === 'document' && content.some(b => b.type === 'document'))
    const modelo = usaVision ? MODELO_VISION : MODELO_TEXTO

    console.log('[recetas/import]', { mode, action, modelo, bloques: content.map(b => b.type) })

    const resultado = await pedirAClaude({
      tag: 'recetas/import',
      model: modelo,
      maxTokens: 8000,
      system: construirSystemPrompt(categorias),
      formatoJson: esquemaExtraccion(categorias),
      messages: [{ role: 'user', content }],
      restauranteId,
    })

    if (!resultado.ok) {
      return NextResponse.json(
        { error: resultado.error.mensaje },
        { status: statusErrorIA(resultado.error) },
      )
    }

    const extraccion = JSON.parse(resultado.texto) as Extraccion

    // El modelo avisó que no pudo leer la fuente. Antes este caso no existía:
    // no tenía forma de decirlo, así que devolvía una receta inventada con
    // status 200 y el cocinero no tenía cómo distinguirla de una buena.
    if (!extraccion.legible || extraccion.recetas.length === 0) {
      return NextResponse.json(
        {
          error: extraccion.motivo || 'No se pudieron leer recetas en el archivo.',
          ilegible: true,
        },
        { status: 422 },
      )
    }

    // `import` devuelve una receta plana (lo que espera ComposicionEditor);
    // `import_multi` devuelve el array. Misma extracción por debajo.
    if (action === 'import_multi') {
      return NextResponse.json({ recetas: extraccion.recetas })
    }
    return NextResponse.json(extraccion.recetas[0])

  } catch (e) {
    console.error('[recetas/import] Error inesperado:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Error inesperado' },
      { status: 500 },
    )
  }
}
