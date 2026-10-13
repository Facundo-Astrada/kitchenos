// Tecla de un atajo, para las leyendas de teclado de desktop ("← → navegar").
// Calendario y Turnos tienen su copia local; las pantallas nuevas usan esta.
export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd style={{
      display: 'inline-block', minWidth: 18, padding: '0 5px', borderRadius: 5, border: '1px solid var(--border)',
      background: 'var(--surface)', fontSize: 10.5, fontFamily: 'inherit', fontWeight: 700, color: 'var(--text-2)', textAlign: 'center',
    }}>{children}</kbd>
  )
}
