import { redirect } from 'next/navigation'

// Ruta vieja: la vista de Producción ahora vive dentro de OPS (/operaciones, tab Producción).
// Redirigimos para tener una sola puerta de entrada al workspace diario.
export default function TareasPage() {
  redirect('/operaciones?tab=produccion')
}
