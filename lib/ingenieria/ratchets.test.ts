// Día 4 del plan consolidado (.claude/docs/ingenieria/plan-consolidado.md §2):
// fusiona arquitectura-kos.md §7.4 ("los gotchas verificables pasan a CI") con
// los techos de refactor-kos.md §4. Cuatro reglas del proyecto que vivían solo
// en prosa (hooks.md, arquitectura-marco.md) y que ya tuvieron bug real —
// acá pasan de "acordate" a "el CI no te deja". Subir un techo o sumar un
// nombre a un allowlist es una decisión que se toma acá, a mano, y se explica
// en el commit — ese es el punto de un ratchet.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join, relative } from 'path'

const ROOT = process.cwd()

// ─────────────────────────────────────────────────────────────────────────
// 1. Techos de líneas de las 5 pantallas grandes (refactor-kos.md §4) — solo
//    bajan. Subir un número acá requiere justificarlo en el commit.
// ─────────────────────────────────────────────────────────────────────────

const TECHOS_LINEAS: Record<string, number> = {
  'app/(app)/carta/page.tsx': 3710, // día 6 plan-consolidado: -300 líneas muertas (view='nuevo', isCreate, CAT_ICONS)
  'app/(app)/recetario/page.tsx': 3810,
  'app/(app)/facturas/page.tsx': 3640,
  'app/(app)/stock/ClientView.tsx': 3410,
  'app/(app)/checklist/ClientView.tsx': 3160,
}

describe('Ratchets — techos de líneas (refactor-kos.md §4)', () => {
  for (const [rel, techo] of Object.entries(TECHOS_LINEAS)) {
    it(`${rel} no supera ${techo} líneas`, () => {
      const lineas = readFileSync(join(ROOT, rel), 'utf-8').split('\n').length
      expect(lineas).toBeLessThanOrEqual(techo)
    })
  }
})

// ─────────────────────────────────────────────────────────────────────────
// 2. Gotcha #20 (hooks.md): createClient() en el cuerpo de un hook SIEMPRE
//    envuelto en useMemo — no es singleton, una referencia nueva por render
//    re-dispara cualquier useEffect/useCallback que dependa de ella.
//
//    El chequeo isola cada `export function use...()` de nivel de módulo y
//    mira solo su primer nivel de anidamiento (depth===1): un
//    `const supabase = createClient()` ahí es el hook mismo violando la
//    regla. La misma línea DENTRO de una función helper de módulo (un
//    fetcher de SWR, p. ej.) o anidada dos niveles más adentro (un
//    useCallback/mutate puntual) es código sano — crea un cliente nuevo para
//    un uso de una sola vez, no lo guarda como valor de closure del hook.
// ─────────────────────────────────────────────────────────────────────────

const TOPLEVEL_FN_RE = /^(export\s+)?(async\s+)?function\s+([A-Za-z0-9_]+)\s*\(/
const BARE_CREATE_CLIENT_RE = /^const\s+\w+\s*=\s*createClient\(\)\s*;?\s*$/

function violacionesGotcha20(dir: string): string[] {
  const violaciones: string[] = []
  const files = readdirSync(dir).filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'))
  for (const file of files) {
    const lines = readFileSync(join(dir, file), 'utf-8').split('\n')
    let depth = 0
    let isHook = false
    let currentName = ''
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const top = TOPLEVEL_FN_RE.exec(line)
      if (top) {
        depth = 0
        currentName = top[3]
        isHook = /^use[A-Z0-9]/.test(currentName)
      }
      if (depth === 1 && isHook && BARE_CREATE_CLIENT_RE.test(line.trim())) {
        violaciones.push(`${file}:${i + 1} (${currentName}) — falta useMemo`)
      }
      const opens = (line.match(/\{/g) || []).length
      const closes = (line.match(/\}/g) || []).length
      depth += opens - closes
    }
  }
  return violaciones
}

describe('Ratchets — gotcha #20: createClient() sin useMemo dentro de un hook', () => {
  it('lib/hooks/** no tiene ningún hook con createClient() bare en su cuerpo directo', () => {
    const violaciones = violacionesGotcha20(join(ROOT, 'lib/hooks'))
    expect(violaciones, violaciones.join('\n')).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────
// 3. Gotcha #18 (hooks.md): canal de realtime sin filter por restaurante_id
//    dispara un refetch en cada evento de CUALQUIER cuenta, no solo la
//    propia. Exceptuadas las tablas que no tienen restaurante_id propio
//    (child de otra tabla — comanda_items de comandas, plato_recetas/
//    plato_packaging de carta_items — o sin tenant, como ingredientes):
//    el filter de Postgres realtime solo puede comparar una columna que
//    exista en la tabla misma, así que ahí no hay filter posible y quedan
//    sin filtrar a propósito (documentado en el caller, ver useComandas.ts
//    y useCarta.ts).
// ─────────────────────────────────────────────────────────────────────────

const TABLAS_SIN_RESTAURANTE_ID_PROPIO = new Set([
  'plato_recetas',
  'plato_packaging',
  'comanda_items',
  'ingredientes',
])

function violacionesGotcha18(dir: string): string[] {
  const violaciones: string[] = []
  const files = readdirSync(dir).filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'))
  for (const file of files) {
    const src = readFileSync(join(dir, file), 'utf-8')
    let idx = 0
    while (true) {
      const start = src.indexOf(".on('postgres_changes',", idx)
      if (start === -1) break
      const braceStart = src.indexOf('{', start)
      const braceEnd = src.indexOf('}', braceStart)
      const obj = src.slice(braceStart, braceEnd + 1)
      const tableMatch = /table:\s*'([^']+)'/.exec(obj)
      const table = tableMatch?.[1] ?? '???'
      const hasFilter = /\bfilter\b/.test(obj)
      if (!hasFilter && !TABLAS_SIN_RESTAURANTE_ID_PROPIO.has(table)) {
        const line = src.slice(0, start).split('\n').length
        violaciones.push(`${file}:${line} tabla=${table} — falta filter por restaurante_id`)
      }
      idx = braceEnd + 1
    }
  }
  return violaciones
}

describe('Ratchets — gotcha #18: canal realtime sin filter por tenant', () => {
  it('lib/hooks/** filtra por restaurante_id toda suscripción a una tabla que tiene esa columna', () => {
    const violaciones = violacionesGotcha18(join(ROOT, 'lib/hooks'))
    expect(violaciones, violaciones.join('\n')).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────
// 4. Ley §1.3.B (arquitectura-marco.md): la lógica de dominio nunca vive en
//    un archivo 'use client' — es la frontera real de este stack, más que
//    cualquier capa dibujada en un diagrama. Un archivo así no lo puede
//    importar código de servidor, y la función que quede adentro termina
//    copiada del lado server (pasó de verdad con `unitConversionFactor`,
//    triplicado). `lib/hooks/**` queda afuera del chequeo a propósito: ahí
//    'use client' es la norma, no la excepción.
//
//    Allowlist: infraestructura de browser que estructuralmente no puede
//    vivir en el server (Context de React, animación atada al DOM, IndexedDB,
//    Audio API, descarga de archivo) o hooks que quedaron fuera de
//    lib/hooks/ por ubicación histórica — ninguno es lógica de dominio
//    reutilizable del lado servidor.
// ─────────────────────────────────────────────────────────────────────────

const USE_CLIENT_PERMITIDO_FUERA_DE_HOOKS = new Set([
  'lib/auth/context.tsx',             // Context Provider — createContext/useContext son de browser
  'lib/ui/motion.ts',                 // helpers de animación atados al DOM
  'lib/ui/chrome.tsx',                // componentes de chrome de UI
  'lib/offline/useOnlineStatus.ts',   // hook (navigator.onLine) — no es dominio
  'lib/offline/bumpQueue.ts',         // IndexedDB solo existe en el browser
  'lib/servicio/useAlertasSonoras.ts',// hook (Audio API) — no es dominio
  'lib/dashboard/momento.ts',         // hook (useState/useEffect) — no es dominio
  'lib/exportar.ts',                  // dispara una descarga en el browser (xlsx)
])

function listarTsFuera(dir: string, dirExcluido: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (full === dirExcluido) continue
      out.push(...listarTsFuera(full, dirExcluido))
    } else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith('.test.ts')) {
      out.push(full)
    }
  }
  return out
}

describe('Ratchets — ley §1.3.B: "use client" fuera de lib/hooks', () => {
  it('ningún archivo de dominio en lib/ (fuera de lib/hooks) declara "use client" sin estar en el allowlist', () => {
    const libDir = join(ROOT, 'lib')
    const archivos = listarTsFuera(libDir, join(libDir, 'hooks'))
    const violaciones: string[] = []
    for (const abs of archivos) {
      const rel = relative(ROOT, abs).replace(/\\/g, '/')
      if (USE_CLIENT_PERMITIDO_FUERA_DE_HOOKS.has(rel)) continue
      const primeraLinea = readFileSync(abs, 'utf-8').split('\n')[0].trim()
      if (primeraLinea === "'use client'" || primeraLinea === '"use client"') {
        violaciones.push(rel)
      }
    }
    expect(violaciones, violaciones.join('\n')).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────
// 5. createAdminClient sin requireRestauranteId en app/api/** — el admin
//    client bypasea RLS; usarlo sin haber verificado antes quién llama (y de
//    qué restaurante es) fue exactamente el bug de Día 1 (3 endpoints sin
//    auth). Allowlist explícita para los que resuelven el tenant a mano de
//    forma equivalente (verificado uno por uno, Día 4) en vez de con el
//    helper compartido, y para el cron (auth por secreto, no por sesión).
// ─────────────────────────────────────────────────────────────────────────

const ADMIN_CLIENT_SIN_HELPER_PERMITIDO = new Set([
  'cron/reset-demo/route.ts',        // auth por CRON_SECRET (Vercel), no hay sesión de usuario
  'invitar/route.ts',                // valida sesión + rol==='admin' a mano antes de usar el admin client
  'invitar/vincular/route.ts',       // valida sesión a mano, deriva restaurante_id de user_restaurantes propio
  'importador/fichas-tecnicas/route.ts', // valida sesión a mano antes de tocar el admin client
  'fiscal/config/route.ts',          // valida sesión a mano (getRestauranteId() local)
  'fiscal/comprobantes/route.ts',    // idem
  'fiscal/emitir/route.ts',          // idem
  'stock/import-planilla/route.ts',  // valida sesión a mano; el write ahora tamb. filtra por restaurante_id (Día 4)
])

function listarRoutes(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...listarRoutes(full))
    } else if (entry.name === 'route.ts') {
      out.push(full)
    }
  }
  return out
}

describe('Ratchets — createAdminClient sin requireRestauranteId en app/api/**', () => {
  it('todo route.ts que usa el admin client verifica el tenant primero (helper o allowlist explícita)', () => {
    const apiDir = join(ROOT, 'app/api')
    const violaciones: string[] = []
    for (const abs of listarRoutes(apiDir)) {
      const src = readFileSync(abs, 'utf-8')
      if (!src.includes('createAdminClient')) continue
      if (src.includes('requireRestauranteId')) continue
      const rel = relative(apiDir, abs).replace(/\\/g, '/')
      if (ADMIN_CLIENT_SIN_HELPER_PERMITIDO.has(rel)) continue
      violaciones.push(rel)
    }
    expect(violaciones, violaciones.join('\n')).toEqual([])
  })
})
