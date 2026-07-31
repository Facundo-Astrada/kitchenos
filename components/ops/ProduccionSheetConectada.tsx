'use client'

import { ProduccionSheet } from './ProduccionSheet'
import { useProduccionRegistros } from '@/lib/hooks/useProduccionRegistros'
import { useAuth } from '@/lib/auth/context'

// Wrapper que conecta la ProduccionSheet con useProduccionRegistros.
//
// Existe para que ese hook NO se monte dentro de cada ItemOps: el hook dispara
// un select a `produccion_registros` de todo el restaurante en su useEffect, así
// que con 40-70 ítems en pantalla salían 40-70 requests idénticos (y 40-70
// setState) en cada carga de OPS. Acá se monta una sola vez, y solo cuando el
// usuario realmente abre la sheet al completar una preparación.
export function ProduccionSheetConectada({
  tareaId, recetaId, recetaNombre, cantidadPlanificada, onClose,
}: {
  tareaId: string
  recetaId: string
  recetaNombre: string
  cantidadPlanificada: number | null
  onClose: () => void
}) {
  const { registrar } = useProduccionRegistros()
  const { user, perfil } = useAuth()

  async function handleConfirm(multiplicadorReal: number) {
    await registrar({
      receta_id: recetaId,
      tarea_id: tareaId,
      fecha: new Date().toISOString().split('T')[0],
      cantidad_planificada: cantidadPlanificada,
      multiplicador_real: multiplicadorReal,
      usuario_id: user?.id ?? null,
      usuario_nombre: perfil ? `${perfil.nombre} ${perfil.apellido}`.trim() : null,
    })
    onClose()
  }

  return (
    <ProduccionSheet
      recetaNombre={recetaNombre}
      cantidadPlanificada={cantidadPlanificada}
      recetaId={recetaId}
      onConfirm={handleConfirm}
      // Omitir → no registra nada (el registro es informativo, el estado ya cambió)
      onDismiss={onClose}
    />
  )
}
