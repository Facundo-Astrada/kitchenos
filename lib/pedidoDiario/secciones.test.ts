import { describe, it, expect } from 'vitest'
import { seccionesPorUbicacion } from './secciones'

const sectores = [{ id: 's1', nombre: 'Cámara', orden: 0 }, { id: 's2', nombre: 'Seco', orden: 1 }]
const estantes = [{ id: 'e1', nombre: 'Estante 1', orden: 0, sector_id: 's1' }, { id: 'e2', nombre: 'Estante 2', orden: 1, sector_id: 's1' }]
const grupos = [{ id: 'g1', nombre: 'Hojas', orden: 0, estante_id: 'e1', sector_id: 's1' }, { id: 'g2', nombre: 'Hongos', orden: 1, estante_id: 'e1', sector_id: 's1' }]

describe('seccionesPorUbicacion', () => {
  it('ordena por sector → estante → grupo y pone títulos', () => {
    const productos = [
      { id: 'a', nombre: 'Cebolla', sector_id: 's2' },
      { id: 'b', nombre: 'Champiñón', sector_id: 's1', estante_id: 'e1', stock_grupo_id: 'g2' },
      { id: 'c', nombre: 'Rúcula', sector_id: 's1', estante_id: 'e1', stock_grupo_id: 'g1' },
      { id: 'd', nombre: 'Zanahoria', sector_id: 's1', estante_id: 'e2' },
      { id: 'e', nombre: 'Perdido' },
    ]
    const s = seccionesPorUbicacion(productos, sectores, estantes, grupos)
    expect(s.map(x => x.titulo)).toEqual([
      'Cámara · Estante 1 · Hojas', 'Cámara · Estante 1 · Hongos', 'Cámara · Estante 2', 'Seco', 'Sin ubicación',
    ])
    expect(s[0].productos.map(p => p.nombre)).toEqual(['Rúcula'])
  })
  it('un grupo de otro estante cuenta como suelto', () => {
    const p = [{ id: 'x', nombre: 'X', sector_id: 's1', estante_id: 'e2', stock_grupo_id: 'g1' }]
    expect(seccionesPorUbicacion(p, sectores, estantes, grupos)[0].titulo).toBe('Cámara · Estante 2')
  })
})
