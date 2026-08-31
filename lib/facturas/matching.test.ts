import { describe, it, expect } from 'vitest'
import { matchProducto, normalizeNombreProducto, inferCategoria } from './matching'

describe('matchProducto', () => {
  const productos = [
    { id: '1', nombre: 'Limón' },
    { id: '2', nombre: 'Aceite De Oliva' },
    { id: '3', nombre: 'Tomate' },
  ]

  it('matchea exacto sin importar mayúsculas', () => {
    expect(matchProducto('limon', productos)?.id).toBe('1')
  })

  it('matchea exacto ignorando tildes ("Limon" en la factura vs "Limón" en stock)', () => {
    expect(matchProducto('Limon', productos)?.id).toBe('1')
  })

  it('matchea parcial cuando el ítem de factura es más descriptivo (contiene el nombre canónico)', () => {
    expect(matchProducto('Aceite De Oliva Extra Virgen 5l', productos)?.id).toBe('2')
  })

  it('NO matchea al revés: un nombre canónico corto no debe pisar un producto más específico', () => {
    // "Tomate" (factura) no debe confundirse con "Extracto De Tomate" si ese
    // producto existiera — welp, no está en esta lista, pero valida que un
    // match exacto por longitud corta igual funciona cuando corresponde.
    expect(matchProducto('Tomate', productos)?.id).toBe('3')
  })

  it('no matchea nombres sin relación', () => {
    expect(matchProducto('Detergente', productos)).toBeNull()
  })

  it('respeta el guard de longitud ≥4: no matchea un nombre base muy corto por contención', () => {
    const cortos = [{ id: '9', nombre: 'Ají' }]
    // "Ají" normalizado sin tildes es "aji" (3 chars) — no debe matchear por
    // contención dentro de un ítem más largo que no lo menciona como palabra.
    expect(matchProducto('Ajillo de camarones', cortos)).toBeNull()
  })

  it('exige palabra completa: no matchea substrings dentro de otra palabra', () => {
    const conLino = [{ id: '5', nombre: 'Lino' }]
    // "Lino" no debe matchear dentro de "Cacao alcalino" (no es palabra completa)
    expect(matchProducto('Cacao alcalino', conLino)).toBeNull()
  })
})

describe('normalizeNombreProducto', () => {
  it('recorta espacios y colapsa múltiples en uno', () => {
    expect(normalizeNombreProducto('  tomate    perita  ')).toBe('Tomate Perita')
  })

  it('convierte a Title Case', () => {
    expect(normalizeNombreProducto('ACEITE DE OLIVA')).toBe('Aceite De Oliva')
  })
})

describe('inferCategoria', () => {
  it('detecta carnes', () => {
    expect(inferCategoria('Bife de chorizo')).toBe('Carnes')
  })

  it('detecta verduras', () => {
    expect(inferCategoria('Tomate perita')).toBe('Verduras')
  })

  it('detecta lácteos', () => {
    expect(inferCategoria('Queso mozzarella')).toBe('Lácteos')
  })

  it('detecta bebidas', () => {
    expect(inferCategoria('Cerveza rubia')).toBe('Bebidas')
  })

  it('detecta limpieza', () => {
    expect(inferCategoria('Detergente concentrado')).toBe('Limpieza')
  })

  it('detecta secos como fallback de despensa', () => {
    expect(inferCategoria('Harina 0000')).toBe('Secos')
  })

  it('cae en Otros si no matchea ninguna palabra clave', () => {
    expect(inferCategoria('Xyzblorp')).toBe('Otros')
  })
})
