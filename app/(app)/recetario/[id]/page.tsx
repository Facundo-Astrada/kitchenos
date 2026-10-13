'use client'

import { use } from 'react'
import { RecetaFicha } from './RecetaFicha'

// Link directo a una receta (Coach, URL compartida, F5). Dentro de la app la
// ficha se abre con el visor global, encima de la pantalla en la que se esté
// (components/recetas/RecetaVisor.tsx) — es el mismo componente.
export default function RecetaDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <RecetaFicha key={id} id={id} />
}
