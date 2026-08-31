import { describe, it, expect } from 'vitest'
import { tieneRecipienteMise, targetStockMise, deficitMise, porcionesDesdeCapacidad } from './mise'

// "pomelo a vivo" del mise de Bros: recipiente de 8 porciones, sin demanda.
const CON_RECIPIENTE = { cantidad: 8, recipiente_nombre: '0.5', recipiente_capacidad: 8, demanda_viva: 0 }
const SIN_RECIPIENTE = { cantidad: 8, recipiente_nombre: null, recipiente_capacidad: null, demanda_viva: 0 }

describe('tieneRecipienteMise', () => {
  it('exige nombre Y capacidad — con uno solo no alcanza', () => {
    expect(tieneRecipienteMise(CON_RECIPIENTE)).toBe(true)
    expect(tieneRecipienteMise(SIN_RECIPIENTE)).toBe(false)
    expect(tieneRecipienteMise({ ...CON_RECIPIENTE, recipiente_capacidad: null })).toBe(false)
    expect(tieneRecipienteMise({ ...CON_RECIPIENTE, recipiente_nombre: null })).toBe(false)
  })

  it('capacidad 0 sigue siendo recipiente (0 != null)', () => {
    expect(tieneRecipienteMise({ ...CON_RECIPIENTE, recipiente_capacidad: 0 })).toBe(true)
  })
})

describe('targetStockMise — cuánto tiene que haber', () => {
  it('con recipiente: lo que entra en el recipiente', () => {
    expect(targetStockMise(CON_RECIPIENTE)).toBe(8)
  })

  it('suma la demanda ya pedida desde el salón — si no, servirla dejaría el recipiente corto', () => {
    expect(targetStockMise({ ...CON_RECIPIENTE, demanda_viva: 3 })).toBe(11)
  })

  it('sin recipiente: la cantidad del mise', () => {
    expect(targetStockMise(SIN_RECIPIENTE)).toBe(8)
  })

  it('demanda_viva ausente no rompe', () => {
    expect(targetStockMise({ cantidad: 8, recipiente_nombre: 'gastro', recipiente_capacidad: 8 })).toBe(8)
  })
})

describe('deficitMise — cuánto falta producir', () => {
  it('el caso de la captura: 0 contado sobre 8 → faltan 8', () => {
    expect(deficitMise(CON_RECIPIENTE, 0)).toBe(8)
  })

  it('stock completo → 0, que es lo que dispara el auto-tilde', () => {
    expect(deficitMise(CON_RECIPIENTE, 8)).toBe(0)
  })

  it('nunca negativo: sobrar no es déficit', () => {
    expect(deficitMise(CON_RECIPIENTE, 12)).toBe(0)
  })

  it('sin contar (null) → null: por eso un ítem sin stock cargado no muestra botón de producir', () => {
    expect(deficitMise(CON_RECIPIENTE, null)).toBeNull()
  })

  it('sin recipiente → null: no hay contra qué comparar', () => {
    expect(deficitMise(SIN_RECIPIENTE, 0)).toBeNull()
  })

  it('con demanda del salón el déficit la incluye', () => {
    expect(deficitMise({ ...CON_RECIPIENTE, demanda_viva: 3 }, 2)).toBe(9)
  })
})

describe('porcionesDesdeCapacidad — recipiente → porciones', () => {
  it('kg de recipiente / g de porción: convierte a la misma unidad antes de dividir', () => {
    expect(porcionesDesdeCapacidad(2, 'kg', 110, 'g')).toBe(18) // 2000/110 = 18.18 → 18
  })

  it('g y g: división directa', () => {
    expect(porcionesDesdeCapacidad(1000, 'g', 250, 'g')).toBe(4)
  })

  it('redondea al entero más cercano', () => {
    expect(porcionesDesdeCapacidad(1000, 'g', 300, 'g')).toBe(3) // 3.33 → 3
  })

  it('peso por porción en 0 → null (no hay por qué dividir)', () => {
    expect(porcionesDesdeCapacidad(1000, 'g', 0, 'g')).toBeNull()
  })

  it('unidad no convertible a peso (porc, u, pax, ml, l) → null', () => {
    expect(porcionesDesdeCapacidad(10, 'porc', 110, 'g')).toBeNull()
    expect(porcionesDesdeCapacidad(2, 'kg', 5, 'u')).toBeNull()
    expect(porcionesDesdeCapacidad(2, 'l', 200, 'ml')).toBeNull()
  })
})
