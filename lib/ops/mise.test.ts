import { describe, it, expect } from 'vitest'
import { tieneRecipienteMise, targetStockMise, deficitMise } from './mise'

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
