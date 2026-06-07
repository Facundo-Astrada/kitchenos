import { redirect } from 'next/navigation'

// Ruta vieja: la vista de Mise ahora vive dentro de OPS (/operaciones, tab Mise).
// Redirigimos para tener una sola puerta de entrada al workspace diario.
export default function ChecklistPage() {
  redirect('/operaciones?tab=mise')
}
