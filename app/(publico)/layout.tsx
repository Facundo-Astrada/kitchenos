// Route group para vistas públicas (sin sesión): carta QR, y futuras /planes, /herramientas.
// Sin BottomNav ni Coach FAB — son la vidriera del producto, no la app de gestión.
// Ver .claude/docs/ui.md § "Vistas públicas" (contrato: misma identidad K-OS, sin nav/coach).
// position:fixed escapa al #shell mobile (max-width 420px + overflow:hidden de globals.css,
// pensado para la app de gestión) y da scroll propio a pantalla completa, en cualquier tamaño.
export default function PublicoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, overflowY: 'auto', background: 'var(--bg)' }}>
      {children}
    </div>
  )
}
