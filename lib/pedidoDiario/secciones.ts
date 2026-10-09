// Agrupa los productos de un proveedor en el orden en que están guardados:
// sector → estante → grupo → posición. Es el mismo recorrido de Stockear
// (lib/stock/recorrido.ts); acá solo se le ponen encabezados.
import { ordenarRecorrido, type EstanteOrden, type GrupoOrden } from '@/lib/stock/recorrido'

export interface ProductoUbicable {
  id: string
  nombre: string
  sector_id?: string | null
  estante_id?: string | null
  stock_grupo_id?: string | null
  orden_sector?: number | null
}

export interface SectorRef { id: string; nombre: string; orden: number }
export interface EstanteRef extends EstanteOrden { nombre: string; sector_id: string }
export interface GrupoRef extends GrupoOrden { nombre: string; sector_id: string }

export interface Seccion<P> { clave: string; titulo: string; productos: P[] }

const SIN_UBICACION = 'Sin ubicación'

export function seccionesPorUbicacion<P extends ProductoUbicable>(
  productos: P[], sectores: SectorRef[], estantes: EstanteRef[], grupos: GrupoRef[],
): Seccion<P>[] {
  const sectorIds = new Set(sectores.map(s => s.id))
  const porSector = new Map<string, P[]>()
  const sueltos: P[] = []
  for (const p of productos) {
    if (p.sector_id && sectorIds.has(p.sector_id)) {
      const l = porSector.get(p.sector_id) ?? []
      l.push(p)
      porSector.set(p.sector_id, l)
    } else sueltos.push(p)
  }

  const estantePorId = new Map(estantes.map(e => [e.id, e]))
  const grupoPorId = new Map(grupos.map(g => [g.id, g]))
  const secciones: Seccion<P>[] = []

  for (const sector of [...sectores].sort((a, b) => a.orden - b.orden)) {
    const lista = porSector.get(sector.id)
    if (!lista?.length) continue
    const ordenados = ordenarRecorrido(
      lista,
      estantes.filter(e => e.sector_id === sector.id),
      grupos.filter(g => g.sector_id === sector.id),
    )
    let actual: Seccion<P> | null = null
    for (const p of ordenados) {
      const estante = p.estante_id ? estantePorId.get(p.estante_id) : undefined
      const g = p.stock_grupo_id ? grupoPorId.get(p.stock_grupo_id) : undefined
      const grupo = g && (g.estante_id ?? null) === (p.estante_id ?? null) ? g : undefined
      const clave = `${sector.id}|${estante?.id ?? ''}|${grupo?.id ?? ''}`
      if (!actual || actual.clave !== clave) {
        actual = { clave, titulo: [sector.nombre, estante?.nombre, grupo?.nombre].filter(Boolean).join(' · '), productos: [] }
        secciones.push(actual)
      }
      actual.productos.push(p)
    }
  }

  if (sueltos.length) {
    secciones.push({
      clave: 'sin-ubicacion',
      titulo: SIN_UBICACION,
      productos: [...sueltos].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    })
  }
  return secciones
}
