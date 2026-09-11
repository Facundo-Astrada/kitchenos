import { describe, it, expect } from 'vitest'
import {
  revisarClave, interpretarRealtime, interpretarBase, resumirSalud, type Chequeo,
} from './chequeos'

const PUB = 'sb_publishable_abc123def456'
const SEC = 'sb_secret_abc123def456'

describe('revisarClave', () => {
  it('acepta una clave pública bien formada', () => {
    const c = revisarClave('NEXT_PUBLIC_SUPABASE_ANON_KEY', PUB, 'publica')
    expect(c.estado).toBe('ok')
  })

  it('acepta una clave secreta bien formada', () => {
    expect(revisarClave('SUPABASE_SERVICE_ROLE_KEY', SEC, 'secreta').estado).toBe('ok')
  })

  it('marca roto cuando falta la variable', () => {
    const c = revisarClave('NEXT_PUBLIC_SUPABASE_ANON_KEY', undefined, 'publica')
    expect(c.estado).toBe('roto')
    expect(c.detalle).toContain('Falta')
  })

  it('marca roto cuando las claves están cruzadas (secreta en la pública)', () => {
    const c = revisarClave('NEXT_PUBLIC_SUPABASE_ANON_KEY', SEC, 'publica')
    expect(c.estado).toBe('roto')
    expect(c.detalle).toContain('cruzadas')
  })

  it('marca roto cuando la pública está puesta como service role', () => {
    expect(revisarClave('SUPABASE_SERVICE_ROLE_KEY', PUB, 'secreta').estado).toBe('roto')
  })

  // El bug del 01/09: la clave con `\n` tumbaba el realtime. Hoy el .trim() de
  // env.ts la salva, así que es aviso y no alerta — pero tiene que verse.
  it('marca sospechosa (no rota) una clave con salto de línea: el trim la salva pero la variable sigue sucia', () => {
    const c = revisarClave('NEXT_PUBLIC_SUPABASE_ANON_KEY', `${PUB}\n`, 'publica')
    expect(c.estado).toBe('sospechoso')
    expect(c.detalle).toContain('Vercel')
  })

  it('detecta espacios alrededor, no solo saltos de línea', () => {
    expect(revisarClave('X', `  ${PUB}  `, 'publica').estado).toBe('sospechoso')
  })

  it('la suciedad se chequea sobre el valor crudo: una clave cruzada Y sucia se reporta como cruzada', () => {
    const c = revisarClave('NEXT_PUBLIC_SUPABASE_ANON_KEY', `${SEC}\n`, 'publica')
    expect(c.estado).toBe('roto')
  })

  it('marca sospechosa una clave con prefijo desconocido (JWT viejo)', () => {
    const c = revisarClave('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'eyJhbGciOiJIUzI1NiJ9.abc', 'publica')
    expect(c.estado).toBe('sospechoso')
  })
})

describe('interpretarRealtime', () => {
  // Verificado contra el proyecto real: 500 = la auth pasó (falla después por
  // no haber upgrade a WebSocket), 401 = la clave fue rechazada.
  it('lee 500 como salud: el endpoint aceptó la clave y falló por no ser un upgrade', () => {
    expect(interpretarRealtime(500).estado).toBe('ok')
  })

  it('lee 401 como roto — es exactamente el handshake que falló el 01/09', () => {
    const c = interpretarRealtime(401)
    expect(c.estado).toBe('roto')
    expect(c.detalle).toContain('mise')
  })

  it('lee 403 como roto también', () => {
    expect(interpretarRealtime(403).estado).toBe('roto')
  })
})

describe('interpretarBase', () => {
  it('sin error, ok', () => {
    expect(interpretarBase(null).estado).toBe('ok')
  })

  it('con error, roto y con el mensaje real adentro', () => {
    const c = interpretarBase('connection refused')
    expect(c.estado).toBe('roto')
    expect(c.detalle).toContain('connection refused')
  })
})

describe('resumirSalud', () => {
  const ok = (id: string): Chequeo => ({ id, titulo: id, estado: 'ok', detalle: '' })
  const roto = (id: string): Chequeo => ({ id, titulo: id, estado: 'roto', detalle: '' })
  const sosp = (id: string): Chequeo => ({ id, titulo: id, estado: 'sospechoso', detalle: '' })

  it('todo ok devuelve 200', () => {
    const s = resumirSalud([ok('a'), ok('b')])
    expect(s.ok).toBe(true)
    expect(s.httpStatus).toBe(200)
    expect(s.resumen).toBe('Todo en pie')
  })

  // El 503 ES el canal de alerta: una corrida de cron que falla se ve en Vercel.
  it('un solo chequeo roto devuelve 503', () => {
    const s = resumirSalud([ok('a'), roto('realtime')])
    expect(s.ok).toBe(false)
    expect(s.httpStatus).toBe(503)
    expect(s.resumen).toContain('realtime')
  })

  it('un sospechoso no baja el estado: reporta sin alertar', () => {
    const s = resumirSalud([ok('a'), sosp('clave-publica')])
    expect(s.ok).toBe(true)
    expect(s.httpStatus).toBe(200)
    expect(s.sospechosos).toHaveLength(1)
    expect(s.resumen).toContain('1 aviso')
  })

  it('separa rotos de sospechosos y conserva la lista completa', () => {
    const s = resumirSalud([ok('a'), sosp('b'), roto('c'), roto('d')])
    expect(s.rotos.map(c => c.id)).toEqual(['c', 'd'])
    expect(s.sospechosos.map(c => c.id)).toEqual(['b'])
    expect(s.chequeos).toHaveLength(4)
    expect(s.resumen).toContain('2 señales rotas')
  })

  it('sin chequeos no inventa problemas', () => {
    expect(resumirSalud([]).ok).toBe(true)
  })
})
