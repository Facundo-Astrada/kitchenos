import { describe, it, expect } from 'vitest'
import { sugerenciaSegura, sugerirProductos, puntaje } from './sugerirProducto'

// Nombres reales del stock y de las facturas de Fudo de Bros (oct 2026).
const STOCK = [
  'Ajo', 'Ajo en polvo', 'Ajo negro', 'Almendras', 'Ciboulette', 'Fecula de mandioca', 'Fecula de papa',
  'Frutillas', 'Harina 000 Campodonico', 'Harina 0000 Campodonico', 'Harina en paquete 0000', 'Harina arroz',
  'Mandarina', 'Mizuna hidroponicas', 'Cebolla morada', 'Garbanzo lata', 'Pechuga', 'Romero', 'Mango', 'Champiñon', 'Pak choi hidroponica', 'Pata muslo', 'Pepino', 'Pomelo', 'Cebolla', 'Leche',
  'Vinagre de vino', 'Vino tinto', 'Nueces peladas', 'Nuez moscada',
].map(nombre => ({ nombre }))

const seguro = (item: string) => sugerenciaSegura(item, STOCK)?.nombre ?? null

describe('sugerenciaSegura — variantes que deben vincularse solas', () => {
  it.each([
    ['Pata muslo', 'Pata muslo'],
    ['Champignon', 'Champiñon'],
    ['Cibulette', 'Ciboulette'],
    ['Mandarinas', 'Mandarina'],
    ['PEPINOS EL KG.', 'Pepino'],
    ['AJOS GRANDE', 'Ajo'],
    ['FRUTILLA MEDIANA', 'Frutillas'],
    ['Harina Campodónico 0000', 'Harina 0000 Campodonico'],
    ['Fecula mandioca', 'Fecula de mandioca'],
    ['Pak Choi hidroponico', 'Pak choi hidroponica'],
    ['Mizuna hidroponica', 'Mizuna hidroponicas'],
    ['Almendra', 'Almendras'],
    ['CEBOLLA MORADA CHICA EL KG.', 'Cebolla morada'],
    ['Garbanzos en lata', 'Garbanzo lata'],
  ])('%s → %s', (item, esperado) => {
    expect(seguro(item)).toBe(esperado)
  })
})

describe('sugerenciaSegura — no adivina', () => {
  it.each([
    'JUGO DE POMELO EXPRIMIDO CITRIC TETRA X',
    'Leche en polvo',
    'Harina',
    'Correntoso Single Vineyard Pinot Noir 750ml',
    'Plan de pagos Afip',
    'Lechugas',
    'Remeras',
    'Mangas',
    'Garbanzo 8MM',
    'Pisa papa',
    'Leche entera en polvo',
  ])('%s → sin vínculo automático', item => {
    expect(seguro(item)).toBeNull()
  })

  it('pero sí lo sugiere como opción para confirmar', () => {
    expect(sugerirProductos('JUGO DE POMELO EXPRIMIDO', STOCK)[0]?.producto.nombre).toBe('Pomelo')
    expect(puntaje('Bondiola', 'Bondiola de cerdo')).toBeGreaterThanOrEqual(0.6)
  })
})
