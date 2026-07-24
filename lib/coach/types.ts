// Tipos compartidos entre el server (route.ts, confirm/route.ts, registry.ts) y el
// cliente (useKitchenCoach.ts, CoachActionCard.tsx) para el flujo propose -> confirm.

export interface CampoUI {
  key: string
  label: string
  // 'readonly': dato estructurado no editable (ej. los pasos de un menú) — se muestra
  // formateado en la tarjeta y viaja igual en el payload de confirmación, pero el usuario
  // no lo toca ahí; si está mal, cancela y se lo redicta al chat.
  tipo: 'texto' | 'numero' | 'select' | 'textarea' | 'readonly'
  opciones?: string[]     // solo si tipo === 'select'
  requerido?: boolean
  valor?: unknown         // valor propuesto por el modelo, para prellenar el form
}

export interface PendingAction {
  draft_id: string
  tool_name: string
  titulo: string
  resumen: string
  campos: CampoUI[]
  warnings: string[]
}
