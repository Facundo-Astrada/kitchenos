'use client'

// Contexto del visor de recetas (components/recetas/RecetaVisor.tsx). Vive
// aparte del visor para que cualquier pantalla pueda pedir "abrí esta receta"
// sin arrastrar la ficha entera a su bundle.

import { createContext, useContext } from 'react'

export interface AbrirRecetaOpciones {
  /** Ids en el orden de la lista desde la que se abrió (anterior/siguiente). */
  recorrido?: string[]
  /** Se llama cuando el visor se cierra o pasa a segundo plano — para refrescar lo que dependa de la receta. */
  alCerrar?: () => void
  /** Receta recién creada: si está vacía, abre directo la carga rápida de ingredientes. */
  cargar?: boolean
}

export interface RecetaVisorApi {
  /** Abre la ficha de una receta encima de la pantalla actual. Ver y editar es lo mismo: es la ficha del Recetario. */
  abrir: (id: string, opciones?: AbrirRecetaOpciones) => void
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
  /** Abrir la carga rápida si la receta todavía no tiene ingredientes. */
  cargarAlAbrir: boolean
  /** Cierra. Si la receta quedó convertida, pasa a segundo plano en vez de perderse. */
  onCerrar: () => void
  onMinimizar: () => void
  /** Cierra del todo, sin botón flotante (receta borrada o inexistente). */
  onDescartar: () => void
  onIrA: (id: string) => void
}
