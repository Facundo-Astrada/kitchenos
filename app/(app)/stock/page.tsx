import StockClientView from './ClientView'

// Página estática client-side (igual que /recetario, /operaciones): la data se
// carga vía useStock (SWR con cache cross-navegación). Antes era un Server
// Component async (await getUser + queries) → ruta `ƒ dynamic` → cada navegación
// hacía un round-trip al server antes de transicionar, lo que daba la sensación
// de "tengo que apretar dos veces" en el nav. Sin el fetch server-side la ruta
// es `○ static` y navega al instante como las demás.
export default function StockPage() {
  return <StockClientView />
}
