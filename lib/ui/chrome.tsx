'use client'

// UiChromeProvider — maneja la visibilidad de elementos flotantes globales.
// Cuando sheetCount > 0, el KitchenCoachFAB (y cualquier flotante global) se oculta.
//
// Uso en sheets/modales/editores full-screen:
//   function MySheet() {
//     useSheetOpen()   // ← llama esto al montar; se limpia solo al desmontar
//     return <div>...</div>
//   }

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

interface UiChromeContextValue {
  sheetCount: number
  _increment: () => void
  _decrement: () => void
}

const UiChromeContext = createContext<UiChromeContextValue>({
  sheetCount: 0,
  _increment: () => {},
  _decrement: () => {},
})

export function UiChromeProvider({ children }: { children: ReactNode }) {
  const [sheetCount, setSheetCount] = useState(0)
  const _increment = useCallback(() => setSheetCount(c => c + 1), [])
  const _decrement = useCallback(() => setSheetCount(c => Math.max(0, c - 1)), [])

  return (
    <UiChromeContext.Provider value={{ sheetCount, _increment, _decrement }}>
      {children}
    </UiChromeContext.Provider>
  )
}

/** Declarar desde un sheet/modal: incrementa el contador al montar, lo decrementa al desmontar. */
export function useSheetOpen() {
  const { _increment, _decrement } = useContext(UiChromeContext)
  useEffect(() => {
    _increment()
    return _decrement
  }, [_increment, _decrement])
}

/**
 * Versión condicional para componentes con prop `open: boolean`.
 * Incrementa cuando open=true, decrementa cuando open=false.
 */
export function useSheetOpenWhen(open: boolean) {
  const { _increment, _decrement } = useContext(UiChromeContext)
  useEffect(() => {
    if (!open) return
    _increment()
    return _decrement
  }, [open, _increment, _decrement])
}

/**
 * Componente wrapper para renders condicionales inline.
 * Usar como: {condicion && <SheetChrome><div>...</div></SheetChrome>}
 */
export function SheetChrome({ children }: { children: ReactNode }) {
  useSheetOpen()
  return <>{children}</>
}

/** Leer el contador de sheets abiertos — el FAB lo usa para ocultarse. */
export function useSheetCount(): number {
  return useContext(UiChromeContext).sheetCount
}
