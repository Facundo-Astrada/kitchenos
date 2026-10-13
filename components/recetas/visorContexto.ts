'use client'

// Contexto del visor de recetas (components/recetas/RecetaVisor.tsx). Vive
// aparte del visor para que cualquier pantalla pueda pedir "abrí esta receta"
// sin arrastrar la ficha entera a su bundle.

import { createContext, useContext } from 'react'

export interface RecetaVisorApi {
  /**
   * Abre la ficha de una receta encima de la pantalla actual. `recorrido` =
   * ids en el orden de la lista desde la que se abrió (para anterior/siguiente).
   */
  abrir: (id: string, recorrido?: string[]) => void
  /** La ficha avisa su nombre y la conversión vigente: es lo que muestra el botón flotante. */
  informar: (info: { id: string; nombre: string; detalle: string | null }) => void
  /** Una ficha abierta como página que se cierra con una conversión hecha queda a mano. */
  dejarEnSegundoPlano: (id: string) => void
}

export const RecetaVisorContext = createContext<RecetaVisorApi | null>(null)

/** `null` fuera de `app/(app)` (KDS, Muro, vistas públicas): ahí no hay visor. */
export function useRecetaVisor(): RecetaVisorApi | null {
  return useContext(RecetaVisorContext)
}

/** Lo que el visor le pasa a la ficha cuando la muestra él (y no la ruta /recetario/[id]). */
export interface FichaEnVisor {
  recorrido: string[]
  /** Cierra. Si la receta quedó convertida, pasa a segundo plano en vez de perderse. */
  onCerrar: () => void
  onMinimizar: () => void
  /** Cierra del todo, sin botón flotante (receta borrada o inexistente). */
  onDescartar: () => void
  onIrA: (id: string) => void
}
