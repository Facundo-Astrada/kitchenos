import EspaciosClientView from './ClientView'

// Página estática client-side (mismo patrón que /stock, /recetario): la data se
// carga vía useEspacios + useChecklist (SWR con cache cross-navegación) → ruta
// `○ static`, navega al instante. La vista es solo desktop (guard en ClientView).
export default function EspaciosPage() {
  return <EspaciosClientView />
}
